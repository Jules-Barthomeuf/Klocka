// La lecture générique d'AK (partie 2, 13 oct. 2026) : une fiche entière, ou une recherche par type,
// en lecture seule, secrets retirés, 20 résultats par page. Sur une fausse base.

import test from 'node:test';
import assert from 'node:assert/strict';
import { lireEntite, chercherEntites, nettoyer, respecte, droitsDe, TYPES } from './lecture-generique.js';

const admin = { email: 'jules.b@klocka.immo', role: 'admin' };

const base = {
  Project: [
    { id: 'p1', titre: 'Chocolaterie Libourne', statut: 'financement', adresse_complete: '10 Place Abel Surchamp, 33500 Libourne', surface_m2: 55, sim_loyer_initial_ht: 30693, updated_date: '2026-10-12' },
    { id: 'p2', titre: 'Boulangerie Dieppe', statut: 'analyse', adresse_complete: '3 rue de la Barre, 76200 Dieppe', surface_m2: 80, sim_loyer_initial_ht: 27500, updated_date: '2026-10-10' },
    { id: 'p3', titre: 'Pharmacie Nice', statut: 'financement', adresse_complete: 'Nice', surface_m2: 120, updated_date: '2026-10-11', archived: true },
  ],
  Deal: [{ id: 'd-ligne', deal_id: 'deal-42', nom: 'Dieppe', statut: 'abandonne', lots: [{ lot: { adresse: 'Dieppe', prix_fai: 400000 }, evaluation: { verdict: 'non' } }], cle_api: 'secret' }],
};
const records = {
  list: (e) => base[e] || [],
  get: (e, id) => (base[e] || []).find((r) => r.id === id) || null,
  findBy: (e, k, v) => (base[e] || []).find((r) => r[k] === v) || null,
};

test('les types déclarés à AK sont ceux du module', async () => {
  const src = (await import('fs')).readFileSync(new URL('./agent.js', import.meta.url), 'utf8');
  const liste = JSON.parse(src.match(/const TYPES_LECTURE = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(liste.sort(), Object.keys(TYPES).sort());
});

test('lire un dossier par son deal_id, secrets retirés', () => {
  const r = lireEntite({ type: 'dossier', id: 'deal-42' }, { records, user: admin });
  assert.equal(r.ok, true);
  assert.equal(r.fiche.nom, 'Dieppe');
  assert.equal(r.fiche.cle_api, undefined);
  assert.equal(lireEntite({ type: 'compte', id: 'x' }, { records, user: admin }).ok, false);
  assert.match(lireEntite({ type: 'projet', id: 'p9' }, { records, user: admin }).error, /Aucun projet/);
});

test('chercher : texte, filtre, tri, archivés écartés, champs choisis', () => {
  const r = chercherEntites({ type: 'projet', filtres: { statut: 'financement' } }, { records, user: admin });
  assert.equal(r.total, 1);
  assert.equal(r.resultats[0].titre, 'Chocolaterie Libourne');
  const s = chercherEntites({ type: 'projet', filtres: { surface_m2: { min: 60 } }, champs: ['titre', 'surface_m2'] }, { records, user: admin });
  assert.deepEqual(s.resultats, [{ id: 'p2', titre: 'Boulangerie Dieppe', surface_m2: 80 }]);
  const t = chercherEntites({ type: 'projet', texte: 'libourne' }, { records, user: admin });
  assert.equal(t.resultats[0].id, 'p1');
  const d = chercherEntites({ type: 'dossier', filtres: { statut: 'abandonne' } }, { records, user: admin });
  assert.equal(d.resultats[0].lots[0].verdict, 'non');
});

test('pages de 20 au plus, avec la suite', () => {
  const beaucoup = { list: () => Array.from({ length: 45 }, (_, i) => ({ id: `r${i}`, nom: `Agent ${i}`, updated_date: String(1000 + i) })), get: () => null, findBy: () => null };
  const r = chercherEntites({ type: 'agent', limite: 50 }, { records: beaucoup, user: admin });
  assert.equal(r.resultats.length, 20);
  assert.equal(r.pages, 3);
  assert.match(r.suite, /page 2 sur 3/);
  assert.equal(chercherEntites({ type: 'agent', page: 3 }, { records: beaucoup, user: admin }).resultats.length, 5);
});

test('nettoyer tient sous le plafond et respecte filtre les nombres', () => {
  const gros = { texte: 'x'.repeat(100000), liste: Array.from({ length: 500 }, (_, i) => ({ i, t: 'y'.repeat(200) })), image: 'data:image/png;base64,AAAA' };
  const n = nettoyer(gros);
  assert.ok(JSON.stringify(n).length <= 40000);
  assert.equal(n.image, '[image]');
  assert.ok(respecte(55, { min: 50, max: 60 }) && !respecte(70, { max: 60 }) && respecte('Libourne', 'libour'));
});

test('archives sur demande, et une case vide ne passe pas un filtre de nombre', () => {
  const r = chercherEntites({ type: 'projet', filtres: { statut: 'financement' } }, { records, user: admin });
  assert.equal(r.archives_ecartees, 1);
  assert.equal(chercherEntites({ type: 'projet', filtres: { statut: 'financement' }, archives: true }, { records, user: admin }).total, 2);
  assert.equal(respecte(null, { max: 4 }), false);
  assert.equal(respecte('', { max: 4 }), false);
});

// Les droits (13 oct. 2026) : dans le code, pas dans la consigne.
const baseM = {
  ...base,
  DossierMandataire: [
    { id: 'm1', bien: 'Tabac de Mâcon', mandataire_email: 'Lea.M@kpartners.fr', prix: 200000 },
    { id: 'm2', bien: 'Boulangerie de Nice', mandataire_email: 'paul.t@kpartners.fr', prix: 300000 },
  ],
  ProprietaireMandataire: [{ id: 'o1', nom: 'M. Martin', mandataire_email: 'paul.t@kpartners.fr' }],
};
// Une base qui refuse toute écriture : les deux outils ne font que lire.
const lecture = {
  list: (e) => (baseM[e] || []).map((r) => Object.freeze({ ...r })),
  get: (e, id) => (baseM[e] || []).find((r) => r.id === id) || null,
  findBy: (e, k, v) => (baseM[e] || []).find((r) => r[k] === v) || null,
  create: () => { throw new Error('écriture interdite'); },
  update: () => { throw new Error('écriture interdite'); },
  delete: () => { throw new Error('écriture interdite'); },
};
const lea = { email: 'lea.m@kpartners.fr', role: 'mandataire' };
const cumul = { email: 'nora.l@klocka.immo', role: 'admin', aussi_mandataire: true };

test('un mandataire ne voit que ses propres dossiers et propriétaires', () => {
  const r = chercherEntites({ type: 'dossier_mandataire' }, { records: lecture, user: lea, espace: 'mandataire' });
  assert.deepEqual(r.resultats.map((x) => x.id), ['m1']);
  assert.equal(r.total, 1);
  assert.equal(lireEntite({ type: 'dossier_mandataire', id: 'm1' }, { records: lecture, user: lea, espace: 'mandataire' }).ok, true);
  // La fiche d'un autre mandataire se dit introuvable, comme une fiche qui n'existe pas.
  assert.match(lireEntite({ type: 'dossier_mandataire', id: 'm2' }, { records: lecture, user: lea, espace: 'mandataire' }).error, /Aucun dossier_mandataire « m2 »/);
  assert.equal(chercherEntites({ type: 'proprietaire_mandataire' }, { records: lecture, user: lea, espace: 'mandataire' }).total, 0);
});

test('un mandataire n\'a jamais accès aux données de l\'équipe, même s\'il appelle l\'espace admin', () => {
  for (const type of ['projet', 'dossier', 'agent', 'agence', 'prospection', 'commerce', 'relance', 'presentation', 'loi', 'liste_agences']) {
    for (const espace of ['mandataire', 'admin']) {
      assert.equal(chercherEntites({ type }, { records: lecture, user: lea, espace }).ok, false, `${type} / ${espace}`);
      assert.equal(lireEntite({ type, id: 'p1' }, { records: lecture, user: lea, espace }).ok, false, `${type} / ${espace}`);
    }
  }
});

test('un admin qui est aussi mandataire : tout dans l\'espace de l\'équipe, les siens seuls dans l\'espace mandataire', () => {
  assert.equal(chercherEntites({ type: 'dossier_mandataire' }, { records: lecture, user: cumul, espace: 'admin' }).total, 2);
  assert.equal(chercherEntites({ type: 'dossier_mandataire' }, { records: lecture, user: cumul, espace: 'mandataire' }).total, 0);
  assert.equal(chercherEntites({ type: 'projet' }, { records: lecture, user: cumul, espace: 'mandataire' }).ok, false);
});

test('sans compte reconnu, rien ; et aucun chemin n\'écrit', () => {
  assert.equal(droitsDe(null), null);
  assert.equal(droitsDe({ email: 'x@y.fr', role: 'user' }), null);
  assert.equal(chercherEntites({ type: 'projet' }, { records: lecture }).ok, false);
  // Sur une base qui lève à la moindre écriture, avec des fiches gelées : tout passe.
  assert.equal(chercherEntites({ type: 'projet', texte: 'libourne', filtres: { statut: 'financement' }, tri: 'surface_m2', champs: ['titre'] }, { records: lecture, user: admin }).ok, true);
  assert.equal(lireEntite({ type: 'dossier', id: 'deal-42' }, { records: lecture, user: admin }).ok, true);
});
