// La lecture générique d'AK (partie 2, 13 oct. 2026) : une fiche entière, ou une recherche par type,
// en lecture seule, secrets retirés, 20 résultats par page. Sur une fausse base.

import test from 'node:test';
import assert from 'node:assert/strict';
import { lireEntite, chercherEntites, nettoyer, respecte, TYPES } from './lecture-generique.js';

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
  const r = lireEntite({ type: 'dossier', id: 'deal-42' }, { records });
  assert.equal(r.ok, true);
  assert.equal(r.fiche.nom, 'Dieppe');
  assert.equal(r.fiche.cle_api, undefined);
  assert.equal(lireEntite({ type: 'compte', id: 'x' }, { records }).ok, false);
  assert.match(lireEntite({ type: 'projet', id: 'p9' }, { records }).error, /Aucun projet/);
});

test('chercher : texte, filtre, tri, archivés écartés, champs choisis', () => {
  const r = chercherEntites({ type: 'projet', filtres: { statut: 'financement' } }, { records });
  assert.equal(r.total, 1);
  assert.equal(r.resultats[0].titre, 'Chocolaterie Libourne');
  const s = chercherEntites({ type: 'projet', filtres: { surface_m2: { min: 60 } }, champs: ['titre', 'surface_m2'] }, { records });
  assert.deepEqual(s.resultats, [{ id: 'p2', titre: 'Boulangerie Dieppe', surface_m2: 80 }]);
  const t = chercherEntites({ type: 'projet', texte: 'libourne' }, { records });
  assert.equal(t.resultats[0].id, 'p1');
  const d = chercherEntites({ type: 'dossier', filtres: { statut: 'abandonne' } }, { records });
  assert.equal(d.resultats[0].lots[0].verdict, 'non');
});

test('pages de 20 au plus, avec la suite', () => {
  const beaucoup = { list: () => Array.from({ length: 45 }, (_, i) => ({ id: `r${i}`, nom: `Agent ${i}`, updated_date: String(1000 + i) })), get: () => null, findBy: () => null };
  const r = chercherEntites({ type: 'agent', limite: 50 }, { records: beaucoup });
  assert.equal(r.resultats.length, 20);
  assert.equal(r.pages, 3);
  assert.match(r.suite, /page 2 sur 3/);
  assert.equal(chercherEntites({ type: 'agent', page: 3 }, { records: beaucoup }).resultats.length, 5);
});

test('nettoyer tient sous le plafond et respecte filtre les nombres', () => {
  const gros = { texte: 'x'.repeat(100000), liste: Array.from({ length: 500 }, (_, i) => ({ i, t: 'y'.repeat(200) })), image: 'data:image/png;base64,AAAA' };
  const n = nettoyer(gros);
  assert.ok(JSON.stringify(n).length <= 40000);
  assert.equal(n.image, '[image]');
  assert.ok(respecte(55, { min: 50, max: 60 }) && !respecte(70, { max: 60 }) && respecte('Libourne', 'libour'));
});

test('archives sur demande, et une case vide ne passe pas un filtre de nombre', () => {
  const r = chercherEntites({ type: 'projet', filtres: { statut: 'financement' } }, { records });
  assert.equal(r.archives_ecartees, 1);
  assert.equal(chercherEntites({ type: 'projet', filtres: { statut: 'financement' }, archives: true }, { records }).total, 2);
  assert.equal(respecte(null, { max: 4 }), false);
  assert.equal(respecte('', { max: 4 }), false);
});
