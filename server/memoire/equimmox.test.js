// Les annonces de commerce d'Equimmox dans la Mémoire (17 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-memoire-equimmox-'));
const { Records } = await import('../db.js');
const E = await import('./equimmox.js');

const ligne = (o = {}) => ({ ID: 'eq-1', address: '12 Quai de la Pêcherie 69001 Lyon', coordinates: '4.83117,45.76512', 'publication date': '45047.04166666667', deleted_date: '', 'property type': 'Sale', 'asset class': 'Commercial', city: 'Lyon', price: '244000', surface: '90', 'price per m²': '2711', rent: '16248', yield: '0.067', occupation: 'true', 'agency name': '. . Agence du Rhône', 'agent contact': '04 78 00 00 00', provider: 'placedescommerces', url: 'https://app.equimmox.com/resultat?id_page_sent=eq-1', ...o });

test("une annonce de commerce devient un bien de la Mémoire, point GPS, loyer et rendement en pourcentage", () => {
  const b = E.bienDepuisAnnonce(ligne());
  assert.deepEqual(b.adresse, { rue: '12 Quai de la Pêcherie', code_postal: '69001', ville: 'Lyon' });
  assert.deepEqual([b.lat, b.lon, b.precision], [45.76512, 4.83117, 'gps']);
  assert.deepEqual([b.prix, b.surface_m2, b.prix_m2, b.loyer_annuel, b.rendement_annonce, b.occupe], [244000, 90, 2711, 16248, 6.7, true]);
  assert.equal(b.publiee_le, '2023-05-01');
  assert.equal(b.agent.agence, 'Agence du Rhône');
  assert.equal(b.origine, 'equimmox');
  assert.equal(E.bienDepuisAnnonce(ligne({ 'asset class': 'Residential' })), null, 'pas un commerce');
  assert.equal(E.bienDepuisAnnonce(ligne({ price: '', rent: '' })), null, 'ni prix ni loyer');
  assert.equal(E.bienDepuisAnnonce(ligne({ coordinates: '', address: 'Rue Mercière 69002 Lyon' })).precision, 'rue');
});

test("l'import d'une ville : nouveaux, mis à jour (le prix d'avant gardé), retirés ; une seule fois par jour", async () => {
  const lire = (b) => JSON.parse(b.toString());
  let lignes = [ligne(), ligne({ ID: 'eq-2', 'asset class': 'Residential' })];
  const exporter = async (ville) => ({ ok: true, ville, buffer: Buffer.from(JSON.stringify(lignes)) });
  const r1 = await E.importerVille('Lyon', { exporter, lire, journal: () => {} });
  assert.deepEqual([r1.lignes, r1.commerces, r1.nouveaux], [2, 1, 1]);
  lignes = [ligne({ price: '230000', deleted_date: '46000' })];
  const r2 = await E.importerVille('Lyon', { exporter, lire, journal: () => {} });
  assert.deepEqual([r2.nouveaux, r2.mis_a_jour, r2.retires], [0, 1, 1]);
  const b = Records.list('BienMemoire').find((x) => x.equimmox_id === 'eq-1');
  assert.equal(b.prix, 230000);
  assert.deepEqual(b.prix_historique.map((x) => x.prix), [244000]);
  assert.ok(b.retiree_le);
  assert.equal(Records.list('BienMemoire').filter((x) => x.equimmox_id === 'eq-1').length, 1, 'jamais en double');
});
