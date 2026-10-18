import test from 'node:test';
import assert from 'node:assert/strict';
import { dansGeometrie, choisirParcelle, choisirIris, choisirCarreau, choisirTroncon, nomDeVoie, identifiantLocal, distanceLigne } from './local.js';
import { avecReglages, SOURCES, sourceActive, viaSource } from './registre-sources.js';

const carre = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const point = { lon: 7.0128, lat: 43.5513 };

test('un point se situe dans un polygone, et à distance du bord sinon', () => {
  assert.equal(dansGeometrie(point, carre(7.0128, 43.5513, 0.0001)), true);
  assert.equal(dansGeometrie(point, carre(7.02, 43.56, 0.0001)), false);
  const d = distanceLigne(point, { type: 'LineString', coordinates: [[7.0128, 43.5514], [7.0129, 43.5514]] });
  assert.ok(d > 5 && d < 15);
});

test('la parcelle : celle qui contient le point, sinon la plus proche à 25 m', () => {
  const grande = { properties: { idu: 'G', contenance: 228362 }, geometry: carre(7.0128, 43.5513, 0.01) };
  const petite = { properties: { idu: 'P', contenance: 120 }, geometry: carre(7.0128, 43.5513, 0.0001) };
  assert.equal(choisirParcelle([grande, petite], point).idu, 'P');
  const voisine = { properties: { idu: 'V', contenance: 90 }, geometry: carre(7.01295, 43.5513, 0.0001) };
  assert.equal(choisirParcelle([voisine], point).idu, 'V');
  const loin = { properties: { idu: 'L' }, geometry: carre(7.02, 43.56, 0.0001) };
  assert.equal(choisirParcelle([loin], point), null);
});

test("l'IRIS et le carreau qui contiennent le point", () => {
  assert.equal(choisirIris([{ properties: { code_iris: '060290110', nom_iris: 'Gare' }, geometry: carre(7.0128, 43.5513, 0.01) }], point).code_iris, '060290110');
  assert.equal(choisirCarreau([{ properties: { id_inspire: 'CRS3035RES200mN1E1', ind: 180.5, men: 121 }, geometry: carre(7.0128, 43.5513, 0.001) }], point).individus, 180.5);
});

test('les noms de voie abrégés de la BD TOPO se reconnaissent', () => {
  assert.equal(nomDeVoie("45 rue d'Antibes"), nomDeVoie("R D'ANTIBES"));
  assert.equal(nomDeVoie('20 avenue Jean Médecin'), nomDeVoie('AV JEAN MEDECIN'));
  assert.equal(nomDeVoie('10 rue de la République'), nomDeVoie('R DE LA REPUBLIQUE'));
  assert.notEqual(nomDeVoie('10 rue de la République'), nomDeVoie('R SAINT-ANTOINE'));
});

test('le tronçon de la même rue passe avant un tronçon plus proche', () => {
  const ligne = (lat, nom) => ({ properties: { cleabs: nom, nom_collaboratif_gauche: nom, fictif: false }, geometry: { type: 'LineString', coordinates: [[7.0120, lat], [7.0136, lat]] } });
  const t = choisirTroncon([ligne(43.55132, 'R SAINT-ANTOINE'), ligne(43.5516, 'R DE LA REPUBLIQUE')], point, '10 rue de la République');
  assert.equal(t.nom, 'R DE LA REPUBLIQUE');
  assert.equal(t.meme_rue, true);
});

test("l'identifiant de local vient de la BAN, sinon de la parcelle", () => {
  assert.equal(identifiantLocal({ ban_id: '06029_0170_00045' }), 'L-06029_0170_00045');
  assert.equal(identifiantLocal({}, { idu: '06029000BT0280' }), 'L-P06029000BT0280');
  assert.equal(identifiantLocal({}), null);
});

test("une source coupée rend « rien », jamais une erreur ; une panne aussi", async () => {
  const s = SOURCES.find((x) => x.cle === 'data_b');
  assert.equal(avecReglages(s, { data_b: { actif: false } }).actif, false);
  assert.equal(avecReglages(s, { data_b: { poids: 0.5 } }).poids, 0.5);
  const avant = process.env.SOURCES_COUPEES;
  process.env.SOURCES_COUPEES = 'data_b';
  try {
    assert.equal(sourceActive('data_b'), false);
    const coupee = await viaSource('data_b', async () => { throw new Error('ne doit pas être appelée'); }, []);
    assert.deepEqual(coupee, { ok: false, coupee: true, valeur: [], source: 'data_b' });
  } finally {
    if (avant === undefined) delete process.env.SOURCES_COUPEES; else process.env.SOURCES_COUPEES = avant;
  }
  const panne = await viaSource('equimmox', async () => { throw new Error('504'); }, null);
  assert.equal(panne.ok, false);
  assert.equal(panne.valeur, null);
  assert.match(panne.panne, /504/);
});

test('le socle n\'appelle jamais Data-B directement : tout passe par le registre des sources', async () => {
  const fs = await import('node:fs');
  const dossier = new URL('./', import.meta.url);
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.js') && !x.endsWith('.test.js'))) {
    const texte = fs.readFileSync(new URL(f, dossier), 'utf8');
    assert.doesNotMatch(texte, /from ['"]\.\.\/data-b[^'"]*['"]|import\(['"]\.\.\/data-b/, `${f} importe Data-B`);
  }
});
