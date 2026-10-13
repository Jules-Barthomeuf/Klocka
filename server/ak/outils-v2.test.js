// La v2 des outils d'AK (partie 3a, 13 oct. 2026) : chaque ancien outil reste
// joignable, une seule fois, et un appel v2 redevient exactement l'ancien appel.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = '';
const { OUTILS } = await import('./agent.js');
const { GROUPES, outilsV2, versAncien, SERVEURS_V2 } = await import('./outils-v2.js');
const { nomsV2 } = await import('./app.js');
const { lireProcedure, PROCEDURES } = await import('./procedures.js');

const ciblesDe = (g) => (g.seul ? [typeof g.seul === 'string' ? g.seul : g.seul.outil] : Object.values(g.actions).map((a) => (typeof a === 'string' ? a : a.outil)));

test('chaque ancien outil est couvert par la v2', () => {
  const couverts = new Set(GROUPES.flatMap(ciblesDe));
  const manquants = OUTILS.map((o) => o.name).filter((n) => n !== 'lancer_design' && !couverts.has(n));
  assert.deepEqual(manquants, []);
  // data_b porte quatre actions (valeur locative, cessions, propriétaire, implantation) : c'est le seul outil partagé.
  const compte = {};
  for (const n of GROUPES.flatMap(ciblesDe)) compte[n] = (compte[n] || 0) + 1;
  assert.deepEqual(Object.entries(compte).filter(([n, c]) => c > 1 && n !== 'data_b'), []);
});

test('28 outils au plus, les noms uniques, les rares chargés à la demande, lire_procedure en dernier', () => {
  const defs = outilsV2(OUTILS, { listeProcedures: 'loi (…)' });
  assert.ok(defs.length <= 29, `${defs.length} outils`);
  assert.equal(new Set(defs.map((d) => d.name)).size, defs.length);
  assert.equal(defs.at(-1).name, 'lire_procedure');
  assert.ok(!defs.at(-1).defer_loading, 'le dernier porte le point de cache : jamais différé');
  assert.deepEqual(defs.filter((d) => d.defer_loading).map((d) => d.name).sort(), ['agenda', 'drive', 'emailing', 'etude_implantation', 'kdata', 'memoire', 'off_market']);
  assert.ok(SERVEURS_V2.some((s) => s.type === 'tool_search_tool_bm25_20251119'));
  const avant = JSON.stringify(OUTILS).length;
  const apres = JSON.stringify(defs.filter((d) => !d.defer_loading)).length;
  assert.ok(apres < avant * 0.65, `${apres} signes chargés contre ${avant}`);
});

test('un appel v2 redevient exactement l\'ancien appel', () => {
  assert.deepEqual(versAncien({ name: 'presentation', input: { action: 'modifier', presentation_id: 'p', changements: [] } }), { name: 'modifier_presentation', input: { presentation_id: 'p', changements: [] } });
  assert.deepEqual(versAncien({ name: 'marche', input: { action: 'valeur_locative', projet_id: 'x' } }), { name: 'data_b', input: { projet_id: 'x', quoi: 'valeur_locative' } });
  assert.deepEqual(versAncien({ name: 'etude_implantation', input: { projet_id: 'x' } }), { name: 'data_b', input: { projet_id: 'x', quoi: 'etude_implantation' } });
  assert.deepEqual(versAncien({ name: 'trouver_bien', input: { recherche: 'Libourne' } }), { name: 'trouver_bien', input: { recherche: 'Libourne' } });
  assert.deepEqual(versAncien({ name: 'creer_projet', input: { deal_id: 'd' } }), { name: 'creer_projet_depuis_dossier', input: { deal_id: 'd' } });
  assert.match(versAncien({ name: 'dossier', input: { action: 'voler' } }).erreur, /Action inconnue/);
  assert.equal(versAncien({ name: 'inconnu' }), null);
});

test('les cadres de page citent les noms v2', () => {
  const t = nomsV2('creer_presentation_bancaire avec son projet_id, puis modifier_presentation ; loyers_equimmox ; trouver_bien.', GROUPES);
  assert.equal(t, 'presentation (action creer) avec son projet_id, puis presentation (action modifier) ; marche (action loyers_equimmox) ; trouver_bien.');
});

test('les fiches métier se lisent, la grille du bail et les pièces de la data room viennent du code', async () => {
  for (const nom of Object.keys(PROCEDURES)) assert.equal((await lireProcedure({ nom })).ok, true, nom);
  assert.match((await lireProcedure({ nom: 'lecture-bail' })).fiche, /Dépôt de garantie : Warning si moins d'un mois/);
  assert.match((await lireProcedure({ nom: 'data-room' })).fiche, /Bail commercial en cours \(essentiel\)/);
  assert.equal((await lireProcedure({ nom: 'inconnue' })).ok, false);
});
