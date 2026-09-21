// L'API Sirene : la projection Lambert 93 et la lecture d'un établissement.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-sirene-'));
delete process.env.INSEE_SIRENE_CLE;
const { lambert93VersWgs84, wgs84VersLambert93, lireEtablissement, clauseActivites, etablissementsDeLaCommune, sireneConfigure } = await import('./insee-sirene.js');

test("l'origine du Lambert 93 retombe sur 3° E, 46,5° N, et l'aller-retour tient au centimètre", () => {
  const o = lambert93VersWgs84(700000, 6600000);
  assert.ok(Math.abs(o.lon - 3) < 1e-7, `lon ${o.lon}`);
  assert.ok(Math.abs(o.lat - 46.5) < 1e-7, `lat ${o.lat}`);
  // Nice, place Masséna, et Lille : deux coins de la France.
  for (const [lat, lon] of [[43.6975, 7.2707], [50.6292, 3.0573]]) {
    const { x, y } = wgs84VersLambert93(lat, lon);
    const r = lambert93VersWgs84(x, y);
    assert.ok(Math.abs(r.lat - lat) < 1e-8 && Math.abs(r.lon - lon) < 1e-8, `${lat},${lon} -> ${r.lat},${r.lon}`);
  }
  // Nice est bien à l'est et au sud de l'origine.
  const nice = wgs84VersLambert93(43.6975, 7.2707);
  assert.ok(nice.x > 700000 && nice.y < 6600000);
  assert.equal(lambert93VersWgs84(null, 6600000), null);
  assert.equal(lambert93VersWgs84('abc', 1), null);
});

test('un établissement Sirene devient une ligne lisible, avec son adresse postale et sa fermeture', () => {
  const nice = wgs84VersLambert93(43.7037, 7.2633);
  const e = lireEtablissement({
    siret: '43405555400019',
    dateCreationEtablissement: '2000-12-29',
    uniteLegale: { denominationUniteLegale: 'V.N.RESTAURATION', activitePrincipaleUniteLegale: '56.10A' },
    adresseEtablissement: {
      numeroVoieEtablissement: '19', indiceRepetitionEtablissement: 'B', typeVoieEtablissement: 'RUE', libelleVoieEtablissement: 'ALSACE LORRAINE',
      codePostalEtablissement: '06000', libelleCommuneEtablissement: 'NICE', codeCommuneEtablissement: '06088',
      coordonneeLambertAbscisseEtablissement: String(nice.x), coordonneeLambertOrdonneeEtablissement: String(nice.y),
    },
    periodesEtablissement: [
      { dateFin: null, dateDebut: '2008-09-15', etatAdministratifEtablissement: 'F', activitePrincipaleEtablissement: '56.10A', enseigne1Etablissement: 'CHEZ VINCENT' },
      { dateFin: '2008-09-14', dateDebut: '2000-12-29', etatAdministratifEtablissement: 'A', activitePrincipaleEtablissement: '56.10A' },
    ],
  });
  assert.equal(e.etat, 'F');
  assert.equal(e.fermeture, '2008-09-15');
  assert.equal(e.ouverture, '2000-12-29');
  assert.equal(e.adresse, '19 B RUE ALSACE LORRAINE 06000 NICE');
  assert.equal(e.enseigne, 'CHEZ VINCENT');
  assert.equal(e.nom, 'V.N.RESTAURATION');
  assert.equal(e.activite_libelle, 'Restauration traditionnelle');
  assert.ok(Math.abs(e.lat - 43.7037) < 1e-5 && Math.abs(e.lon - 7.2633) < 1e-5);

  // Un actif d'une personne physique, sans coordonnées.
  const a = lireEtablissement({
    siret: '1', uniteLegale: { prenom1UniteLegale: 'MARIE', nomUniteLegale: 'DURAND' },
    adresseEtablissement: { numeroVoieEtablissement: '3', typeVoieEtablissement: 'BD', libelleVoieEtablissement: 'GAMBETTA', codePostalEtablissement: '06000', libelleCommuneEtablissement: 'NICE' },
    periodesEtablissement: [{ dateFin: null, etatAdministratifEtablissement: 'A', activitePrincipaleEtablissement: '96.02A' }],
  });
  assert.equal(a.etat, 'A');
  assert.equal(a.fermeture, null);
  assert.equal(a.nom, 'MARIE DURAND');
  assert.equal(a.lat, null);
  assert.equal(lireEtablissement({}), null);
});

test('la clause d\'activités cible des préfixes NAF, et sans identifiants la lecture dit quoi poser dans .env', async () => {
  assert.equal(clauseActivites(['47', '56', '960', '4778A']), '(activitePrincipaleEtablissement:47* OR activitePrincipaleEtablissement:56* OR activitePrincipaleEtablissement:96.0* OR activitePrincipaleEtablissement:47.78A*)', 'le point après la division, sinon le joker ne rend rien');
  assert.equal(sireneConfigure(), false);
  const r = await etablissementsDeLaCommune('06088', { prefixes: ['47'] });
  assert.equal(r.ok, false);
  assert.match(r.error, /INSEE_SIRENE_CLE/);
  assert.equal((await etablissementsDeLaCommune(null)).ok, false);
});
