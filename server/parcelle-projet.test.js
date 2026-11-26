// La parcelle du bien (25 nov. 2026) : lue une fois par adresse, gardée, la parcelle qui porte le point en tête.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-parcelle-projet-'));
const { Records } = await import('./db.js');
const P = await import('./parcelle-projet.js');

const carre = (x, y, c = 0.001) => ({ type: 'Polygon', coordinates: [[[x, y], [x + c, y], [x + c, y + c], [x, y + c], [x, y]]] });

test('la parcelle qui porte le point est le bien ; le résultat se garde par adresse', async () => {
  const projet = Records.create('Project', { titre: 'Foch', adresse_complete: '12 rue Foch, 56100 Lorient' });
  let appels = 0;
  const lire = {
    resoudre: async () => ({ lat: 47.7485, lon: -3.3705, label: '12 Rue Foch 56100 Lorient', numero: '12', code_postal: '56100', ville: 'Lorient' }),
    autour: async () => { appels++; return [
      { idu: '56121000AB0001', section: 'AB', numero: '0001', contenance: 120, code_insee: '56121', geometry: carre(-3.372, 47.748) },
      { idu: '56121000AB0002', section: 'AB', numero: '0002', contenance: 240, code_insee: '56121', geometry: carre(-3.371, 47.748) },
    ]; },
  };
  const r = await P.parcelleDuProjet(projet, { lire });
  assert.equal(r.ok, true);
  assert.equal(r.plan.parcelle.idu, '56121000AB0002');
  assert.equal(r.plan.parcelle.contenance, 240);
  assert.equal(r.plan.parcelles.length, 2);
  await P.parcelleDuProjet(projet, { lire });
  assert.equal(appels, 1, 'gardée : le cadastre n’est pas rappelé');
  assert.equal(P.parcelleGardee(projet).parcelle.idu, '56121000AB0002');
  assert.equal(P.parcelleGardee({ ...projet, adresse_complete: '3 rue Autre, Lorient' }), null, 'une autre adresse : rien de gardé');
  assert.equal((await P.parcelleDuProjet({ id: 'x' }, { lire })).ok, false);
});

test('un point dans la rue prend la parcelle la plus proche, dite proche ; trop loin, aucune', () => {
  const parcelles = [{ idu: 'A', section: 'AB', numero: '1', geometry: carre(-3.3700, 47.7480, 0.0003) }];
  const pres = P.planDeLaParcelle({ point: { lat: 47.7481, lon: -3.36950 }, parcelles });
  assert.deepEqual([pres.parcelle.idu, pres.parcelle.proche], ['A', true]);
  assert.equal(P.planDeLaParcelle({ point: { lat: 47.7500, lon: -3.3700 }, parcelles }).parcelle, null);
});

test('ni numéro ni ville dans l’adresse : pas de parcelle plutôt qu’une fausse', () => {
  assert.equal(P.adresseSure('Lorient', { ville: 'Lorient', code_postal: '56100' }).ok, false);
  assert.equal(P.adresseSure('53 Rue de la République', { numero: '53', ville: 'Marseille', code_postal: '13002' }).ok, false);
  assert.equal(P.adresseSure('14 rue Saint Rome, Toulouse', { numero: '14', ville: 'Toulouse', code_postal: '31000' }).ok, true);
  assert.equal(P.adresseSure('10 Place Abel Surchamp, 33500 - Libourne', { numero: '10', ville: 'Libourne', code_postal: '33500' }).ok, true);
});

test('le lien Géorisques : le rapport de l’adresse, sinon l’accueil', async () => {
  const resoudre = async () => ({ lat: 45.765105, lon: 4.835688, code_insee: '69382', ville: 'Lyon', numero: '12', label: '12 Rue de la République 69002 Lyon' });
  const url = await P.lienGeorisques('12 rue de la République, 69002 Lyon', { resoudre });
  assert.match(url, /^https:\/\/www\.georisques\.gouv\.fr\/mes-risques\/connaitre-les-risques-pres-de-chez-moi\/rapport2\?/);
  assert.match(url, /codeInsee=69382/);
  assert.match(url, /lat=45\.765105/);
  assert.equal(await P.lienGeorisques('', { resoudre }), P.ACCUEIL_GEORISQUES);
  assert.equal(await P.lienGeorisques('nulle part ici', { resoudre: async () => null }), P.ACCUEIL_GEORISQUES);
});
