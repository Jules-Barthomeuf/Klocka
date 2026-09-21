// Les cessions de fonds autour d'une adresse, d'après le BODACC.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-cessions-'));
const { enTransaction, marcheDe, situer, csvPour, lireGeocodage, quantile, distanceM } = await import('./cessions-fonds.js');

const cession = (id, extra = {}) => ({
  id, date: '2026-03-01', acquereur: 'LA BONNE MIE', vendeur: 'DUPONT', prix: 80000, activite: 'boulangerie',
  categorie: "Achat d'un fonds", adresse: '22 Rue Dabray', rue: 'dabray', code_postal: '06000', ville: 'Nice', ...extra,
});

test("une cession du BODACC prend la forme que la carte lit : l'acquéreur en tête", () => {
  const t = enTransaction(cession('A1', { lat: 43.7, lon: 7.25 }));
  assert.equal(t.enseigne, 'LA BONNE MIE');
  assert.equal(t.adresse, '22 Rue Dabray 06000 Nice');
  assert.equal(t.prix, 80000);
  assert.equal(t.detail, "Achat d'un fonds");
  assert.equal(t.lat, 43.7);
  assert.equal(enTransaction(cession('A2')).lat, null, 'sans point, pas de point inventé');
  assert.equal(enTransaction({}).prix, null);
});

test('le marché se lit aux déciles, pour que la holding vendue cent millions ne fasse pas la rue', () => {
  const prix = [20000, 40000, 60000, 80000, 100000, 120000, 140000, 160000, 180000, 100000000];
  const m = marcheDe(prix.map((p, i) => ({ prix: p, date: `202${i % 5}-01-01`, activite: i % 2 ? 'restauration' : 'coiffure' })));
  assert.equal(m.nombre, 10);
  assert.equal(m.avec_prix, 10);
  assert.equal(m.prix_median, 110000);
  assert.ok(m.prix_haut < 100000000, `le neuvième décile écarte l'exception : ${m.prix_haut}`);
  assert.equal(m.prix_max, 100000000);
  assert.equal(m.activites[0].n, 5);
  assert.ok(m.par_an > 0);
  // Sans prix, pas de fourchette, et on le dit.
  assert.equal(marcheDe([{ prix: null }]).prix_median, null);
  assert.equal(quantile([], 0.5), null);
});

test("chaque cession se situe : la rue au nom, le numéro en tête, la distance au point", () => {
  const bien = { rue: 'Rue Dabray', numero: '22', lat: 43.7, lon: 7.25 };
  const [meme, voisine, ailleurs, sansPoint] = situer([
    enTransaction(cession('A', { lat: 43.7001, lon: 7.25 })),
    enTransaction(cession('B', { adresse: '40 Rue Dabray', lat: 43.702, lon: 7.25 })),
    enTransaction(cession('C', { adresse: '5 Avenue Jean Médecin', rue: 'jean medecin', lat: 43.71, lon: 7.26 })),
    enTransaction(cession('D', { adresse: '30 Rue Dabray' })),
  ], bien);
  assert.equal(meme.sur_place, true);
  assert.equal(meme.dans_la_rue, true);
  assert.ok(meme.distance_m < 20);
  assert.equal(voisine.sur_place, false);
  assert.equal(voisine.dans_la_rue, true);
  assert.equal(ailleurs.dans_la_rue, false);
  // Une cession sans point reste une cession de la rue : le nom suffit.
  assert.equal(sansPoint.dans_la_rue, true);
  assert.equal(sansPoint.distance_m, null);
  assert.equal(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }), 0);
});

test('le lot envoyé à la Base Adresse et sa réponse se lisent en CSV, guillemets compris', () => {
  const csv = csvPour([cession('A1', { adresse: '22 Rue "Dabray", bis' }), cession('A2'), { id: 'X', adresse: null }]);
  const lignes = csv.trim().split('\n');
  assert.equal(lignes[0], 'id,adresse,cp,ville');
  assert.equal(lignes.length, 3, 'une cession sans adresse ne part pas');
  assert.equal(lignes[1], 'A1,"22 Rue ""Dabray"", bis",06000,Nice');

  const points = lireGeocodage([
    'id,adresse,cp,ville,longitude,latitude,result_score,result_label',
    'A1,22 Rue Dabray,06000,Nice,7.25,43.7,0.96,"22 Rue Dabray 06000 Nice"',
    'A2,x,06000,Nice,7.26,43.71,0.31,Rue Vague 06000 Nice',
    'A3,y,06000,Nice,,,,',
    'A4,y,06000,Nice,,,,,error',
  ].join('\n'));
  assert.deepEqual(points.get('A1'), { lat: 43.7, lon: 7.25, score: 0.96 });
  assert.equal(points.has('A2'), false, 'un score trop bas ne rend pas de point');
  assert.equal(points.has('A3'), false);
  assert.equal(points.has('A4'), false);
  assert.equal(lireGeocodage('').size, 0);
});
