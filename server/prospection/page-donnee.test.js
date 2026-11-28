// La page donnée par l'équipe (28 nov. 2026) : lue sans recherche web, ce que la page écrit contrôle ce que le modèle rend.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-page-donnee-'));
const { Records } = await import('../db.js');
const P = await import('./page-donnee.js');

// Le masquage de Cloudflare : une clé, puis chaque caractère combiné à elle.
const masquer = (email, cle = 0x5a) => cle.toString(16).padStart(2, '0') + [...email].map((c) => (c.charCodeAt(0) ^ cle).toString(16).padStart(2, '0')).join('');

const PAGE_CONSEILLER = `<!doctype html><html><head><title>Loic Borges</title>
<script type="application/ld+json">{"@type":"RealEstateAgent","name":"Loic Borges","aggregateRating":{"ratingValue":"5.0","reviewCount":"21"}}</script></head>
<body><h1>Loic Borges</h1><p>Consultant immobilier efficity · Immobilier ancien</p>
<a href="tel:+33627573799">06 27 57 37 99</a> <a href="tel:0176703980">01 76 70 39 80</a>
<a href="/cdn-cgi/l/email-protection#${masquer('loic.borges@efficity.com')}">[email&#160;protected]</a>
<div class="bien"><a href="/achat-immobilier/maison_117-m2_soorts-hossegor_40150_30267616/">Maison 117 m² Soorts-Hossegor 1 039 000 €</a></div>
<div class="bien"><a href="/achat-immobilier/parking_10-m2_bayonne_64100_1/">Parking 10 m² Bayonne 26 400 €</a></div>
${'<p>Texte de la page pour atteindre une longueur lisible.</p>'.repeat(8)}
</body></html>`;

test('les mails masqués par Cloudflare se lisent, en lien comme en texte', () => {
  assert.equal(P.decoderCfemail(masquer('paul@agence.fr')), 'paul@agence.fr');
  assert.equal(P.decoderCfemail('zz'), null);
  const html = `<a href="/cdn-cgi/l/email-protection#${masquer('a.b@x.fr')}">x</a> <span class="__cf_email__" data-cfemail="${masquer('c.d@y.fr')}">[email protected]</span>`;
  const d = P.demasquer(html);
  assert.match(d, /href="mailto:a\.b@x\.fr"/);
  assert.match(d, /c\.d@y\.fr/);
});

test('ce que la page écrit : numéros des liens, mails, note des données structurées', () => {
  const e = P.ceQueLaPageEcrit(PAGE_CONSEILLER);
  assert.deepEqual(e.tels, ['06 27 57 37 99', '01 76 70 39 80']);
  assert.deepEqual(e.mails, ['loic.borges@efficity.com']);
  assert.equal(e.note, 5);
  assert.equal(e.nb_avis, 21);
  assert.equal(P.numero('+33 6 27 57 37 99'), '06 27 57 37 99');
  assert.equal(P.numero('12 34'), null);
});

test('le profil ne garde que ce que la page écrit : un numéro inventé tombe, le seul portable le remplace', () => {
  const e = P.ceQueLaPageEcrit(PAGE_CONSEILLER);
  e.texte = P.texteDe(e.html);
  const p = P.profilDeLaPage({ nom: 'Loic Borges', telephone: '06 11 22 33 44', email: 'invente@efficity.com', biens: [{ type: 'Maison', surface: 117, ville: 'Soorts-Hossegor', prix: 1039000, lien: '/achat-immobilier/maison_117-m2_soorts-hossegor_40150_30267616/' }, { type: '' }] }, e, { nom: 'Loïc B', url: 'https://www.efficity.com/lborges/' });
  assert.equal(p.telephone, '06 27 57 37 99');
  assert.equal(p.email, 'loic.borges@efficity.com');
  assert.equal(p.note, 5);
  assert.equal(p.biens.length, 1);
  assert.equal(p.biens[0].lien, 'https://www.efficity.com/achat-immobilier/maison_117-m2_soorts-hossegor_40150_30267616/');
  // Le standard de l'agence n'est jamais pris pour le numéro de la personne.
  const q = P.profilDeLaPage({ telephone: '06 27 57 37 99' }, e, { nom: 'X Y', url: 'https://a.fr/', standard: '06 27 57 37 99' });
  assert.equal(q.telephone, null);
});

test('la page équipe : noms complets seulement, numéro et mail gardés s\'ils sont écrits', () => {
  const ecrit = { tels: ['06 10 20 30 40'], mails: ['marie.durand@agence.fr'], texte: 'Marie Durand 06 10 20 30 40 marie.durand@agence.fr Paul Martin Négociateur' };
  const gens = P.equipeDeLaPage({ personnes: [
    { nom: 'Marie Durand', poste: 'Directrice', telephone: '06 10 20 30 40', email: 'marie.durand@agence.fr', page: '/equipe/marie-durand' },
    { nom: 'Paul Martin', poste: 'Négociateur', telephone: '06 99 99 99 99', email: 'paul@agence.fr' },
    { nom: 'Sophie R.', poste: 'Assistante' },
    { nom: 'Julie', poste: 'Accueil' },
  ] }, ecrit, { url: 'https://agence.fr/equipe' });
  assert.deepEqual(gens.map((x) => x.nom), ['Marie Durand', 'Paul Martin']);
  assert.equal(gens[0].page, 'https://agence.fr/equipe/marie-durand');
  assert.equal(gens[1].telephone, null);
  assert.equal(gens[1].email, null);
});

test('ranger : sa page fait foi sur une personne connue, une page équipe ne remplit que ce qui manque', () => {
  const agents = [{ nom: 'Loic Borges', telephone: '05 59 00 00 00', source: 'Apollo' }];
  const a = P.rangerDansLesAgents(agents, { nom: 'Loïc Borges', telephone: '06 27 57 37 99', note: 5, biens: [{ type: 'Maison' }], page: 'https://p' }, { source: 'page du conseiller' });
  assert.equal(a.length, 1);
  assert.equal(a[0].telephone, '06 27 57 37 99');
  assert.equal(a[0].biens_page.length, 1);
  assert.equal(agents[0].telephone, '05 59 00 00 00');
  const b = P.rangerDansLesAgents(a, { nom: 'Loic Borges', telephone: '06 00 00 00 00', fonction: 'Gérant' }, { source: 'page équipe du site' });
  assert.equal(b[0].telephone, '06 27 57 37 99');
  assert.equal(b[0].fonction, 'Gérant');
  const c = P.rangerDansLesAgents(b, { nom: 'Anne Leroy', telephone: '06 11 11 11 11' }, { source: 'page équipe du site' });
  assert.equal(c.length, 2);
  assert.equal(c[1].source, 'page équipe du site');
});

test('lirePageDonnee lit la page, range la personne sur l\'agence, et la carte d\'appel la montre', async () => {
  const a = Records.create('AgenceProspect', { nom: 'efficity Bayonne', telephone: '01 76 70 39 80', apollo_equipe: { gens: [{ nom: 'Loic B.', nom_complet: 'Loic Borges', poste: 'Consultant' }] } });
  const lire = async (url) => ({ ok: true, status: 200, url, headers: { get: () => 'text/html; charset=utf-8' }, text: async () => PAGE_CONSEILLER });
  let consigne = '';
  const lireModele = async (prompt) => { consigne = prompt; return { nom: 'Loic Borges', poste: 'Consultant immobilier', telephone: '06 27 57 37 99', specialite: 'Immobilier ancien', biens: [{ type: 'Maison', surface: 117, ville: 'Soorts-Hossegor', prix: 1039000 }] }; };
  const r = await P.lirePageDonnee(a.id, { url: 'www.efficity.com/lborges/', nom: 'Loic Borges', lire, lireModele });
  assert.equal(r.ok, true);
  assert.equal(r.personne.telephone, '06 27 57 37 99');
  assert.equal(r.personne.email, 'loic.borges@efficity.com');
  assert.match(consigne, /achat-immobilier\/maison_117/);
  const lue = Records.get('AgenceProspect', a.id);
  assert.equal(lue.agents[0].page, 'https://www.efficity.com/lborges/');
  const { contactsDe } = await import('./mode-appel.js');
  const loic = contactsDe(lue).find((x) => /Borges/.test(x.nom));
  assert.equal(loic.telephone, '06 27 57 37 99');
  assert.equal(loic.note, 5);
  assert.equal(loic.biens_page.length, 1);
  assert.equal(loic.page, 'https://www.efficity.com/lborges/');
  // Une page qui ne s'ouvre pas, un lien qui n'en est pas un : un message clair, rien d'écrit.
  const refus = await P.lirePageDonnee(a.id, { url: 'https://x.fr/p', nom: 'Loic Borges', lire: async () => ({ ok: false, status: 403, headers: { get: () => 'text/html' } }), lireModele });
  assert.equal(refus.ok, false);
  assert.match(refus.error, /403/);
  assert.equal((await P.lirePageDonnee(a.id, { url: 'pas un lien' })).ok, false);
});
