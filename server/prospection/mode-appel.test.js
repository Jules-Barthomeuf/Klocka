// Le mode appel : le tri d'une ville, le statut croisé avec Monday, la file,
// et le reçu qui ne dit vrai que s'il a relu Monday.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mode-appel-'));
const MA = await import('./mode-appel.js');
const { Records } = await import('../db.js');

const MAINTENANT = new Date('2026-10-06T09:00:00Z');

test('les agences de commerce remontent, le résidentiel descend', () => {
  assert.equal(MA.pertinence({ nom: 'AZUREA COMMERCES & ENTREPRISES' }).specialite, 'commerce');
  assert.equal(MA.pertinence({ nom: 'Liberté Commerces' }).specialite, 'commerce');
  assert.equal(MA.pertinence({ nom: 'Agence du Port', annonces_commerce: 5 }).specialite, 'commerce');
  assert.equal(MA.pertinence({ nom: 'Riviera Locations Saisonnières' }).specialite, 'residentiel');
  assert.equal(MA.pertinence({ nom: 'Agence Centrale' }).specialite, 'generaliste');
  assert.ok(MA.pertinence({ nom: 'Arthur Loyd Nice' }).score > MA.pertinence({ nom: 'Nice Prestige Villas' }).score);
});

test('le statut : jamais contactée, déjà en contact (qui, quand, quoi), probable, morte, relance due', () => {
  assert.equal(MA.statutDeLAgence({ nom: 'X' }, { maintenantD: MAINTENANT }).etat, 'jamais');
  const contact = MA.statutDeLAgence({ nom: 'X', monday_connu: { qui: 'thomas.r@klocka.immo', date: '2026-09-15', statut: 'Intéressé', confiance: 'sure' } }, { maintenantD: MAINTENANT });
  assert.equal(contact.etat, 'contact');
  assert.equal(contact.libelle, 'Déjà en contact');
  assert.equal(contact.detail, 'Thomas, il y a 3 semaines, intéressé');
  assert.equal(contact.interessee, true);
  const probable = MA.statutDeLAgence({ nom: 'X', monday_connu: { statut: 'Nouveau contact', confiance: 'probable' } }, { maintenantD: MAINTENANT });
  assert.equal(probable.libelle, 'Correspondance probable');
  assert.equal(MA.statutDeLAgence({ nom: 'X', monday_connu: { statut: 'Mort', confiance: 'sure' } }, { maintenantD: MAINTENANT }).etat, 'morte');
  // Un « Mort » qui n'est qu'une correspondance probable ne tue pas l'agence.
  assert.notEqual(MA.statutDeLAgence({ nom: 'X', monday_connu: { statut: 'Mort', confiance: 'probable' } }, { maintenantD: MAINTENANT }).etat, 'morte');
  assert.equal(MA.statutDeLAgence({ nom: 'X', fermee: true }, { maintenantD: MAINTENANT }).etat, 'morte');
  const due = MA.statutDeLAgence({ nom: 'X' }, { fiche: { prochaine: { le: '2026-10-02' }, dernier_contact_le: '2026-09-20' }, maintenantD: MAINTENANT });
  assert.equal(due.etat, 'relance');
  assert.equal(due.a_rappeler, true);
});

test("l'ordre : relance due en haut, le commerce avant le résidentiel, les mortes à la fin", () => {
  const lignes = [
    { nom: 'Riviera Locations', statut: { etat: 'jamais' }, pertinence: MA.pertinence({ nom: 'Riviera Locations' }) },
    { nom: 'Fermée', statut: { etat: 'morte' }, pertinence: MA.pertinence({ nom: 'Commerces Fermée' }) },
    { nom: 'Azurea Commerces', statut: { etat: 'jamais' }, pertinence: MA.pertinence({ nom: 'Azurea Commerces' }) },
    { nom: 'À rappeler', statut: { etat: 'relance' }, pertinence: MA.pertinence({ nom: 'À rappeler' }) },
  ];
  assert.deepEqual(MA.ordreDeLaVille(lignes).map((x) => x.nom), ['À rappeler', 'Azurea Commerces', 'Riviera Locations', 'Fermée']);
});

test('la barre de la ville compte ce qui compte', () => {
  const c = MA.chiffresDeLaVille([
    { statut: { etat: 'jamais' } },
    { statut: { etat: 'contact', appelee: true, interessee: true } },
    { statut: { etat: 'relance', a_rappeler: true } },
    { statut: { etat: 'morte' } },
  ]);
  assert.deepEqual(c, { agences: 4, appelees: 2, fait_pourcent: 67, interessees: 1, a_rappeler: 1, mortes: 1, independants: 0, annonceurs: 0 });
  // Les mandataires en nom propre et les noms d'annonces se comptent à part.
  assert.equal(MA.genreDe({ nom: 'Monsieur Nicolas Mouette', raison_sociale: 'MONSIEUR NICOLAS MOUETTE', sources: ['Data-B'] }), 'independant');
  assert.equal(MA.genreDe({ nom: 'Bnp', sources: ['Equimmox'] }), 'annonceur');
  assert.equal(MA.genreDe({ nom: 'Azurea Commerces', telephone: '04 93 35 08 68', sources: ['Google Maps'] }), 'agence');
  const d = MA.chiffresDeLaVille([{ genre: 'agence', statut: { etat: 'jamais' } }, { genre: 'independant', statut: { etat: 'jamais' } }, { genre: 'annonceur', statut: { etat: 'jamais' } }]);
  assert.deepEqual([d.agences, d.independants, d.annonceurs], [1, 1, 1]);
});

test('les recherches clients de la zone, en une ligne chacune', () => {
  const lignes = MA.recherchesDeLaZone([
    { active: true, visible: true, zones: ['Nice centre'], budget_min: 300000, budget_max: 800000 },
    { active: true, visible: true, zones: ['Lyon'], budget_min: 200000, budget_max: 400000 },
    { active: false, visible: true, zones: ['Nice'], budget_max: 500000 },
  ], 'Nice');
  assert.deepEqual(lignes, ['murs de commerce, 300 k€ à 800 k€, Nice centre']);
});

test("le reçu Monday ne passe au vert qu'après relecture de la bonne valeur", async () => {
  const fiche = Records.create('AgentImmo', { nom: 'Sophie Martin', agence: 'Riviera Commerce', statut: 'en_discussion', telephones: ['0493000000'], emails: [] });
  const cols = { statut: 'statut', agence: 'agence' };
  const ok = await MA.ecrireEtRelire(fiche.id, { pousser: async () => ({ ok: true, id: '42', lien: 'https://m/42' }), relire: async () => ({ nom: 'Sophie Martin', colonnes: { statut: 'En discussion', agence: 'Riviera Commerce' } }), colonnes: cols });
  assert.equal(ok.etat, 'ok');
  assert.equal(ok.texte, 'Riviera Commerce · Sophie Martin · En discussion');
  // Monday a gardé l'ancienne valeur : pas de faux « c'est fait ».
  const faux = await MA.ecrireEtRelire(fiche.id, { pousser: async () => ({ ok: true, id: '42' }), relire: async () => ({ nom: 'Sophie Martin', colonnes: { statut: 'À appeler' } }), colonnes: cols });
  assert.equal(faux.etat, 'attente');
  assert.match(faux.erreur, /au lieu de « En discussion »/);
  const panne = await MA.ecrireEtRelire(fiche.id, { pousser: async () => { throw new Error('Monday a répondu 500'); }, colonnes: cols });
  assert.equal(panne.etat, 'attente');
  assert.equal(panne.texte, 'Monday en attente, nouvel essai en cours');
});

test("« pas de réponse » : un geste, relance à J+2 à l'autre moment, reçu, et la session le compte", async () => {
  const L = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const ag = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Agence Test Commerces', telephone: '04 93 11 22 33', agents: [], gerants: [], sources: ['Google Maps'] });
  const user = { email: 'nora.l@klocka.immo', role: 'admin' };
  const s = MA.ouvrirSession(L.id, user).session;
  const f = MA.fileDAppel(L.id, user, { maintenantD: MAINTENANT });
  assert.equal(f.ok, true);
  assert.ok(f.file.some((x) => x.id === ag.id), "l'agence est dans la file");
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_reponse', session_id: s.id, user });
  assert.equal(r.ok, true);
  assert.equal(r.simple, true);
  assert.match(r.recu.relance.texte, /^Relance /);
  // Monday n'est pas branché dans les tests : la ligne le dit, elle ne ment pas.
  assert.equal(r.recu.monday.etat, 'attente');
  const recap = MA.recapSession(s.id);
  assert.equal(recap.appels, 1);
  assert.equal(recap.monday_a_jour, false);
  // « Mauvais numéro » : l'agence sort de la file, en gris.
  const ag2 = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Numéro Mort', telephone: '04 93 99 88 77', agents: [], gerants: [] });
  await MA.noterIssue({ agence_id: ag2.id, issue: 'mauvais_numero', session_id: s.id, user });
  assert.equal(Records.get('AgenceProspect', ag2.id).morte, true);
  assert.ok(!MA.fileDAppel(L.id, user).file.some((x) => x.id === ag2.id));
});

test('les zones écrites à la main se rapprochent de la ville par son département', () => {
  assert.equal(MA.zoneCouvre('Toute la France', { ville: 'Nice', departement: '06' }), 'partout');
  assert.equal(MA.zoneCouvre('Côte d\'Azur', { ville: 'Nice', departement: '06' }), 'region');
  assert.equal(MA.zoneCouvre('Sud', { ville: 'Nice', departement: '06' }), 'region');
  assert.equal(MA.zoneCouvre('Est de la france en priorité', { ville: 'Nice', departement: '06' }), null);
  assert.equal(MA.zoneCouvre('Est de la france en priorité', { ville: 'Metz', departement: '57' }), 'region');
  assert.equal(MA.zoneCouvre('Proche Bretagne', { ville: 'Rennes', departement: '35' }), 'region');
  assert.equal(MA.zoneCouvre('Nice centre', { ville: 'Nice', departement: '06' }), 'ville');
  assert.equal(MA.departementDe([{ code_postal: '06000' }, { code_postal: '06300' }, { code_postal: '83000' }]), '06');
  const l = MA.recherchesDeLaZone([
    { active: true, zones: [], zone_libre: 'Toute la France', budget_min: 200000, budget_max: 300000 },
    { active: true, zones: [], zone_libre: 'Toute la France', budget_min: 850000, budget_max: 1150000 },
    { active: true, zones: ['Côte d\'Azur'], budget_min: 300000, budget_max: 800000 },
  ], 'Nice', { departement: '06' });
  assert.deepEqual(l, ['murs de commerce, 300 k€ à 800 k€, Côte d\'Azur', '2 clients partout en France, de 200 k€ à 1,2 M€']);
});

test("un ancien rapprochement Monday sans confiance : le nom ne donne qu'une correspondance probable", () => {
  assert.equal(MA.statutDeLAgence({ monday_connu: { par: 'nom', statut: 'Mort' } }).probable, true);
  assert.notEqual(MA.statutDeLAgence({ monday_connu: { par: 'nom', statut: 'Mort' } }).etat, 'morte');
  assert.equal(MA.statutDeLAgence({ monday_connu: { par: 'téléphone', statut: 'Mort' } }).etat, 'morte');
});

test("la file : mes lignes, et les jamais contactées que personne n'a prises", async () => {
  const L = Records.create('ListeAgences', { ville: 'Cannes', etat: 'fini', journal: [] });
  const moi = { email: 'nora.l@klocka.immo', role: 'admin' };
  const mienne = Records.create('AgenceProspect', { liste_id: L.id, nom: 'À moi', telephone: '04 93 00 00 01', pour: ['nora.l@klocka.immo'], monday_connu: { statut: 'Intéressé', date: '2026-10-01', confiance: 'sure' }, agents: [], gerants: [] });
  const libre = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Libre', telephone: '04 93 00 00 02', agents: [], gerants: [] });
  const prise = Records.create('AgenceProspect', { liste_id: L.id, nom: 'À Coralie', telephone: '04 93 00 00 03', pour: ['coralie.g@klocka.immo'], agents: [], gerants: [] });
  const connue = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Déjà connue', telephone: '04 93 00 00 04', monday_connu: { statut: 'Pas intéressé', date: '2025-01-01', confiance: 'sure' }, agents: [], gerants: [] });
  const ids = MA.fileDAppel(L.id, moi, { maintenantD: MAINTENANT }).file.map((x) => x.id);
  assert.ok(ids.includes(mienne.id), 'ma ligne, même déjà en contact');
  assert.ok(ids.includes(libre.id), 'jamais contactée, à personne');
  assert.ok(!ids.includes(prise.id), 'la ligne d\'une collègue');
  assert.ok(!ids.includes(connue.id), 'déjà en contact, pas à moi');
});

test("Apollo : seules les agences immobilières passent, par leurs codes d'activité", async () => {
  const A = await import('./agences-apollo.js');
  assert.equal(A.estAgenceApollo({ name: 'B\'Nice Immo', naics_codes: ['531210'], sic_codes: ['6531'] }), true);
  assert.equal(A.estAgenceApollo({ name: 'Immobleu Promotion', naics_codes: ['53111', '236117'], sic_codes: ['6512', '1521', '6531'] }), false, 'un promoteur');
  assert.equal(A.estAgenceApollo({ name: 'John rent immo conciergerie', naics_codes: ['53131'], sic_codes: ['6513'] }), false);
  assert.equal(A.estAgenceApollo({ name: 'FAYAT BATIMENT', naics_codes: ['236220'] }), false);
  assert.equal(A.estAgenceApollo({ name: "L'Immobiliere de Roseland" }), true, 'sans code, le nom suffit');
  assert.deepEqual(A.versAgence({ id: 'x', name: 'ARP IMMO', website_url: 'http://azurrivieraproperties.com', sanitized_phone: '+33497081452', linkedin_url: 'http://linkedin.com/company/arp' }),
    { nom: 'ARP IMMO', site: 'http://azurrivieraproperties.com', telephone: '04 97 08 14 52', linkedin: 'http://linkedin.com/company/arp', apollo_id: 'x' });
  process.env.APOLLO_API_KEY = 'test';
  const pages = [];
  const lire = async (url, opts) => { pages.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ organizations: [{ id: `o${pages.length}`, name: `Agence ${pages.length} Immo`, naics_codes: ['531210'] }], pagination: { total_pages: 1 } }) }; };
  const r = await A.agencesDeLaVille('Nice', { lire, max_requetes: 3 });
  assert.equal(r.requetes, 3, 'le plafond de recherches tient');
  assert.equal(r.agences.length, 3);
  assert.deepEqual(pages[0].organization_locations, ['Nice, France']);
  delete process.env.APOLLO_API_KEY;
  assert.equal(MA.pertinence({ nom: 'Agence du Port', apollo_mots: ['immobilier commercial', 'fonds de commerce'] }).specialite, 'generaliste');
  assert.ok(MA.pertinence({ nom: 'Agence du Port', apollo_mots: ['immobilier commercial'] }).score >= 3);
  assert.equal(MA.pertinence({ nom: 'Agence du Port', apollo_mots: ['immobilier de luxe', 'investissements immobiliers'] }).specialite, 'residentiel');
});
