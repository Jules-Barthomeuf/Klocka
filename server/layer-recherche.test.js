// Le Layer, phase 3 : la recherche hybride (plein texte + sens, fusion RRF), avec un faux fournisseur d'embeddings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-recherche-'));
process.env.MISTRAL_API_KEY = 'cle-de-test';
const { Records } = await import('./db.js');
const R = await import('./layer-recherche.js');
const S = await import('./layer-schema.js');

// Un faux Mistral : un vecteur par thème (les murs, les rappels, le reste), normé ; aucun appel réseau.
const THEMES = [/mur|local|commerce|boutique/i, /rappel|jeudi|promet/i];
const vecteurDe = (t) => { const v = new Array(R.DIMS).fill(0); const k = THEMES.findIndex((re) => re.test(t)); v[k < 0 ? 2 : k] = 1; return v; };
const appels = [];
const fauxFetch = async (url, o) => { const corps = JSON.parse(o.body); appels.push(corps.input.length); return { ok: true, json: async () => ({ model: 'mistral-embed', data: corps.input.map((t, index) => ({ index, embedding: vecteurDe(t) })), usage: { prompt_tokens: corps.input.length * 5 } }) }; };

const src = Records.create('CerveauSource', { type: 'compte_rendu', titre: 'Comité', date: '2026-10-07T09:00:00Z', contenu: '…', cout: {} });
const src2 = Records.create('CerveauSource', { type: 'appel', titre: 'Appel', date: '2026-10-14T09:00:00Z', contenu: '…', cout: {} });
const agence = Records.create('AgenceProspect', { nom: 'Agence Durand', ville: 'Antibes' });
const fait = (o) => { const f = Records.create('CerveauFait', { source_id: src.id, statut: 'valide', citation: '', ...o }); R.indexer(f, { file: false }); return f; };
const murs = fait({ type: 'information', resume: "L'agence Durand a deux boutiques à vendre à Antibes" });
const rappel = fait({ type: 'engagement', resume: 'Durand promet de revenir vers nous jeudi', source_id: src2.id });
const libourne = fait({ type: 'decision', resume: 'On refuse Libourne : loyer trop haut pour un emplacement numéro 2' });
const ancien = fait({ type: 'information', resume: "L'agence Durand n'avait aucun local", statut: 'remplace' });
Records.create('CerveauLien', { fait_id: murs.id, type_entite: 'agence', entite_id: agence.id });
Records.create('CerveauLien', { fait_id: ancien.id, type_entite: 'agence', entite_id: agence.id });

test('pures : requête plein texte, cosinus, fusion par rang réciproque', () => {
  assert.equal(R.requeteFts("Pourquoi a-t-on refusé Libourne ?"), '"pourquoi"* OR "refuse"* OR "libourne"*');
  assert.equal(R.requeteFts('a b'), null);
  assert.equal(R.cosinus([1, 0], [1, 0]), 1);
  assert.equal(R.cosinus([1, 0], [0, 1]), 0);
  const f = R.fusionRRF([['a', 'b', 'c'], ['b', 'c']]);
  assert.deepEqual(f.map((x) => x.id), ['b', 'c', 'a'], 'présent dans les deux classements, b passe devant');
  assert.ok(Math.abs(f[0].score - (1 / 62 + 1 / 61)) < 1e-12);
});

test('le plein texte trouve sans les accents, et les filtres passent avant', async () => {
  const r = await R.rechercher({ texte: 'Libourne refusé' }, { fetchFn: fauxFetch });
  assert.equal(r.faits[0].id, libourne.id);
  const v = await R.rechercher({ texte: 'Durand', ville: 'antibes' }, { fetchFn: fauxFetch });
  assert.deepEqual(v.faits.map((f) => f.id), [murs.id], 'filtre ville : seul le fait rattaché à une agence d\'Antibes');
  const p = await R.rechercher({ texte: 'Durand', depuis: '2026-10-10' }, { fetchFn: fauxFetch });
  assert.deepEqual(p.faits.map((f) => f.id), [rappel.id], 'filtre période sur la date de la source');
});

test('le sens trouve ce que les mots ne trouvent pas ; les remplacés ne reviennent qu\'en historique', async () => {
  const jetons = await R.embedderFaits([murs.id, rappel.id, libourne.id, ancien.id], { fetchFn: fauxFetch });
  assert.equal(jetons, 20);
  assert.equal(Records.get('CerveauSource', src.id).cout.embed_jetons > 0, true, 'le coût d\'embedding est sur la source');
  // « local commercial » n'a aucun mot commun avec « deux boutiques à vendre » : seul le sens le relie.
  const r = await R.rechercher({ texte: 'un local commercial' }, { fetchFn: fauxFetch, par: 'nora.l@klocka.immo' });
  assert.equal(r.faits[0].id, murs.id);
  assert.deepEqual(r.pistes, { fts: true, sens: true });
  assert.ok(!r.faits.some((f) => f.id === ancien.id), 'le fait remplacé est exclu');
  const h = await R.rechercher({ texte: 'Durand local', historique: true }, { fetchFn: fauxFetch });
  assert.ok(h.faits.some((f) => f.id === ancien.id), 'en historique, il revient');
  // Le journal : la question, les filtres, les faits rendus, la durée.
  const j = S.requetesDepuis('2000-01-01').find((x) => x.id === r.requete_id);
  assert.equal(j.texte, 'un local commercial');
  assert.equal(j.faits[0], murs.id);
  assert.equal(typeof j.duree_ms, 'number');
});

test('sans clé Mistral, la recherche tient sur le plein texte seul', async () => {
  const cle = process.env.MISTRAL_API_KEY; process.env.MISTRAL_API_KEY = '';
  const r = await R.rechercher({ texte: 'Libourne' });
  process.env.MISTRAL_API_KEY = cle;
  assert.deepEqual(r.pistes, { fts: true, sens: false });
  assert.equal(r.faits[0].id, libourne.id);
});

test('rattraper : le plein texte des faits absents de l\'index, et leurs embeddings en file', () => {
  const nouveau = Records.create('CerveauFait', { source_id: src.id, statut: 'valide', type: 'savoir', resume: 'À Antibes, un numéro 2 se loue sous 300 euros', citation: '' });
  const x = R.rattraper();
  assert.equal(x.fts, 1);
  assert.ok(x.embeddings_en_file >= 1);
  assert.ok(nouveau.id);
});
