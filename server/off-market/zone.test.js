// Off-market, mode Simple : le score « Zone » (11 oct. 2026). Les
// caractéristiques ont toujours les mêmes clés, les poids restent dans leurs
// bornes, une version apprise n'est activée que si elle gagne, 200 jugements
// cohérents donnent un modèle juste sur ses 20 meilleurs, et un jugement
// garde ce qu'il faut. Rien ne sort sur le réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-zone-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const F = await import('./zone/features.js');
const S = await import('./zone/score.js');
const L = await import('./zone/logistique.js');
const M = await import('./zone/modele.js');
const J = await import('./zone/jugements.js');
const R = await import('./zone/revue-rue.js');

const ville = Records.create('Ville', {
  nom: 'Antibes', centre: { lat: 43.5808, lon: 7.1239 },
  rues: [{ nom: 'Rue de la République', commerces: 80 }, { nom: 'Rue Thuret', commerces: 20 }],
  simple: { zones: [{ nom: 'Hyper-centre', genre: 'hyper-centre', rues: ['Rue de la République'], points: [{ rue: 'Rue de la République', lat: 43.5810, lon: 7.1240 }], marge_m: 180 }] },
});
const commerce = (n, extra = {}) => Records.create('CommerceSimple', { ville_id: ville.id, siret: `9000000000${String(n).padStart(4, '0')}`, nom: `C ${n}`, ape: '4771Z', rue: 'Rue de la République', cle_rue: 'republique', adresse: `${n} Rue de la République`, lat: 43.5810 + n * 0.00005, lon: 7.1240, chaine: false, ...extra });
const centre = Array.from({ length: 30 }, (_, i) => commerce(i + 1));
const loin = commerce(99, { rue: 'Impasse des Lilas', cle_rue: 'lilas', adresse: '3 Impasse des Lilas', lat: 43.60, lon: 7.09, ape: '6419Z' });

test('les caractéristiques : toujours les mêmes clés, null quand on ne sait pas', () => {
  const ctx = F.contexteVille(ville, [...centre, loin], { naf_exclus: S.CONFIG.naf_exclus, sections_cible: S.CONFIG.sections_cible });
  for (const p of [null, {}, { id: 'x' }, centre[0], loin]) assert.deepEqual(Object.keys(F.zoneFeatures(p, ctx)), F.CLES);
  assert.deepEqual(Object.keys(F.zoneFeatures(centre[0], null)), F.CLES);
  const f = F.zoneFeatures(centre[5], ctx);
  assert.equal(f.flux_pieton_classe, 'fort', 'dans l\'hyper-centre');
  assert.equal(f.flux_pieton_valeur, null, 'pas de mesure par point');
  assert.equal(f.naf_code, '47.71Z');
  assert.equal(f.naf_section, 'G');
  assert.equal(f.naf_hors_cible, false);
  assert.equal(f.type_voie, 'rue');
  assert.ok(f.densite_commerces_300m >= 25);
  assert.equal(f.part_commerces_fermes_300m, null);
  const g = F.zoneFeatures(loin, ctx);
  assert.equal(g.type_voie, 'impasse');
  assert.equal(g.naf_hors_cible, true, 'une banque');
  assert.equal(g.flux_pieton_classe, 'faible');
  assert.ok(g.distance_rue_commercante_principale_m > 1000);
  assert.equal(F.codeNaf('9602A'), '96.02A');
  assert.equal(F.sectionNaf('56.10A'), 'I');
  assert.equal(F.typeVoie('Bd Albert 1er'), 'boulevard');
});

test('le score à règles : de 0 à 100, trois raisons en français, un inconnu ne compte pas', () => {
  const ctx = F.contexteVille(ville, [...centre, loin], { naf_exclus: S.CONFIG.naf_exclus, sections_cible: S.CONFIG.sections_cible });
  const bon = S.scoreRegles(F.zoneFeatures(centre[5], ctx));
  const mauvais = S.scoreRegles(F.zoneFeatures(loin, ctx));
  assert.ok(bon.score > mauvais.score, `${bon.score} > ${mauvais.score}`);
  assert.ok(bon.score <= 100 && mauvais.score >= 0);
  assert.equal(mauvais.raisons.length, 3);
  assert.ok(mauvais.raisons.some((r) => r.texte === 'activité hors cible' && r.sens === 'moins'));
  assert.ok(mauvais.raisons.every((r) => typeof r.texte === 'string' && r.texte.length));
  assert.equal(S.scoreRegles(F.zoneFeatures(null, null)).score, null);
});

test('l\'ajustement des poids : +1 % ou -2 %, jamais au-delà de 0 et du double, le signe ne change pas', () => {
  const f = { flux_pieton_classe: 'fort', touristes_classe: 'faible', densite_commerces_300m: 100, type_voie: 'impasse', naf_hors_cible: true, enseigne_nationale: false, distance_rue_commercante_principale_m: 1400 };
  const un = S.ajusterPoids(S.POIDS_INITIAUX, f, 'interessant');
  assert.equal(un.poids.flux_pieton, 25.25, 'le flux fort a poussé vers « intéressant » : confirmé');
  assert.equal(un.poids.naf_hors_cible, -19.6, 'hors cible a poussé vers « pas intéressant » : contredit');
  assert.equal(un.poids.note_streetview_ia, 10, 'inconnu : ne bouge pas');
  assert.ok(un.journal.length >= 4);
  let p = { ...S.POIDS_INITIAUX };
  for (let i = 0; i < 400; i += 1) p = S.ajusterPoids(p, f, 'interessant').poids;
  assert.equal(p.flux_pieton, 50, 'borné au double');
  assert.ok(p.naf_hors_cible <= 0 && p.naf_hors_cible >= -40, 'borné à 0, signe gardé');
  let q = { ...S.POIDS_INITIAUX };
  for (let i = 0; i < 400; i += 1) q = S.ajusterPoids(q, f, 'pas_interessant').poids;
  assert.ok(q.flux_pieton >= 0 && q.flux_pieton < 25);
  assert.equal(q.naf_hors_cible, -40);
  for (const [k, w] of Object.entries({ ...p, ...q })) assert.ok(Math.abs(w) <= 2 * Math.abs(S.POIDS_INITIAUX[k]) + 1e-9, k);
  assert.deepEqual(S.ajusterPoids(S.POIDS_INITIAUX, f, 'a_revoir').journal, []);
});

test('la version active : refusée si l\'AUC ne gagne pas 0,02', () => {
  assert.equal(M.choisirActivation(0.80, 0.79), false);
  assert.equal(M.choisirActivation(0.81, 0.79), true);
  assert.equal(M.choisirActivation(0.70, null), true);
  assert.equal(M.choisirActivation(null, 0.6), false);
});

test('les jugements exploitables : le dernier fait foi ; « À revoir » et sans explication n\'entrent pas', () => {
  const snap = { flux_pieton_classe: 'fort' };
  const ex = M.exemplesExploitables([
    { point_id: 'a', verdict: 'pas_interessant', commentaire: 'mal placé', features_snapshot: snap, created_at: '2026-10-01' },
    { point_id: 'a', verdict: 'interessant', commentaire: 'en fait très bien', features_snapshot: snap, created_at: '2026-10-02' },
    { point_id: 'b', verdict: 'a_revoir', commentaire: 'à voir', features_snapshot: snap, created_at: '2026-10-02' },
    { point_id: 'c', verdict: 'interessant', commentaire: '', features_snapshot: snap, created_at: '2026-10-02' },
  ]);
  assert.deepEqual(ex.map((e) => [e.point_id, e.y]), [['a', 1]]);
});

test('200 jugements cohérents : la version apprise est juste sur ses 20 meilleurs, et tout est journalisé', () => {
  const r = L.hasard(42);
  const jugements = [];
  for (let i = 0; i < 200; i += 1) {
    const centreVille = r() < 0.65;
    const f = Object.fromEntries(F.CLES.map((k) => [k, null]));
    Object.assign(f, {
      flux_pieton_classe: centreVille ? (r() < 0.8 ? 'fort' : 'moyen') : (r() < 0.8 ? 'faible' : 'moyen'),
      densite_commerces_300m: Math.round(centreVille ? 60 + r() * 80 : r() * 40),
      distance_rue_commercante_principale_m: Math.round(centreVille ? r() * 300 : 400 + r() * 2000),
      type_voie: ['rue', 'avenue', 'impasse', 'place'][Math.floor(r() * 4)],
      naf_section: 'G', naf_hors_cible: r() < 0.1, enseigne_nationale: r() < 0.2,
    });
    // Cohérents : 3 % de jugements à contre-courant, pas davantage.
    const interessant = centreVille && !f.naf_hors_cible ? r() < 0.97 : r() < 0.03;
    jugements.push({ point_id: `p${i}`, verdict: interessant ? 'interessant' : 'pas_interessant', commentaire: interessant ? 'bonne rue' : 'mal placé', features_snapshot: f, created_at: new Date(Date.UTC(2026, 9, 1 + (i % 10))).toISOString() });
  }
  const res = M.trainZoneModel({ jugements, maintenantD: new Date('2026-10-11T03:00:00Z') });
  assert.equal(res.ok, true);
  assert.ok(res.metriques.precision_20 > 0.8, `précision sur les 20 meilleurs : ${res.metriques.precision_20}`);
  assert.ok(res.metriques.auc > 0.85, `AUC ${res.metriques.auc}`);
  const v = Records.list(M.MODELE).find((m) => m.version === res.version);
  assert.equal(v.type, 'logistique');
  assert.equal(v.nb_exemples, 200);
  const raisons = M.scorer(jugements[0].features_snapshot, v).raisons;
  assert.ok(raisons.length >= 1 && raisons.length <= 3 && raisons.every((x) => typeof x.texte === 'string'));
  assert.ok(Records.list(M.JOURNAL).some((j) => j.type === 'entrainement' && j.version === res.version));
  // Trop peu de jugements : rien n'est entraîné, et c'est dit.
  const peu = M.trainZoneModel({ jugements: jugements.slice(0, 20) });
  assert.equal(peu.ok, false);
  assert.match(peu.raison, /20 jugements exploitables sur les 150/);
  // Revenir en arrière rétablit la version active d'avant.
  if (res.active) { const back = M.revenir(); assert.equal(back.ok, true); assert.equal(M.modeleActif().version, 0); }
});

test('la file « À juger » : les incertains d\'abord, puis 10 % de faibles au hasard, puis le reste par score', () => {
  const pts = [
    { id: 'a', score: 90 }, { id: 'b', score: 52 }, { id: 'c', score: 41 }, { id: 'd', score: 10 },
    ...Array.from({ length: 19 }, (_, i) => ({ id: `f${i}`, score: 5 + i })), { id: 'e', score: 70 }, { id: 'n', score: null },
  ];
  const o = J.ordonnerAJuger(pts, { graine: 3 }).map((p) => p.id);
  assert.deepEqual(o.slice(0, 2), ['b', 'c']);
  const faibles = pts.filter((p) => p.score != null && p.score < 40).map((p) => p.id);
  assert.equal(faibles.length, 20);
  assert.ok(o.slice(2, 4).every((id) => faibles.includes(id)), '10 % de 20 : deux faibles');
  assert.deepEqual(o.slice(4, 6), ['a', 'e']);
  assert.ok(!o.includes('n'));
  assert.equal(o.length, pts.length - 1);
});

test('un jugement : le texte est obligatoire, les caractéristiques sont gardées, les poids bougent, la rue devient un exemple', async () => {
  for (const m of Records.list(M.MODELE)) Records.update(M.MODELE, m.id, { actif: m.version === 0 });
  const sans = await J.enregistrerJugement({ point_id: centre[3].id, user: 'jules.b@klocka.immo', verdict: 'interessant', commentaire: '' }, { lire: async () => [] });
  assert.equal(sans.ok, false);
  const avant = M.modeleActif().parametres.poids.flux_pieton;
  const r = await J.enregistrerJugement({ point_id: centre[3].id, user: 'jules.b@klocka.immo', verdict: 'interessant', commentaire: 'Très bonne rue commerçante, beaucoup de passage', score_affiche: 64, model_version: 0 }, { lire: async () => ['rue_commercante', 'forte_frequentation', 'inventee'] });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.jugement.features_snapshot), F.CLES);
  assert.deepEqual(r.jugement.raisons, ['rue_commercante', 'forte_frequentation']);
  assert.equal(r.jugement.score_affiche, 64);
  assert.ok(M.modeleActif().parametres.poids.flux_pieton > avant);
  assert.ok(Records.list(M.JOURNAL).some((j) => j.type === 'ajustement' && j.jugement_id === r.jugement.id));
  const ex = Records.list(J.EXEMPLE);
  assert.equal(ex.length, 1);
  assert.deepEqual(ex[0].raisons, ['rue_commercante']);
  // La consigne de la revue Street View reprend l'exemple.
  assert.match(R.consigneRevue(ex), /Jugées intéressantes :\n- Intéressant · Rue commerçante/);
  // À revoir : gardé, sans texte obligatoire, ne bouge rien, reste dans la file.
  const poids = M.modeleActif().parametres.poids;
  const revoir = await J.enregistrerJugement({ point_id: centre[4].id, user: 'jules.b@klocka.immo', verdict: 'a_revoir' }, { lire: async () => [] });
  assert.equal(revoir.ok, true);
  assert.deepEqual(M.modeleActif().parametres.poids, poids);
  const file = J.fileAJuger(ville.id, { graine: 1 }).map((p) => p.id);
  assert.ok(file.includes(centre[4].id) && !file.includes(centre[3].id));
  const z = J.zoneDesCommerces(ville.id).get(centre[3].id);
  assert.equal(z.jugement_zone.verdict, 'interessant');
  assert.ok(Number.isFinite(z.score_zone));
});
