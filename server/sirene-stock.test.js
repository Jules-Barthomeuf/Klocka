import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-sirene-stock-'));
const S = await import('./socle/imports/sirene-stock.js');
const { lireEtablissementVacance } = await import('./outils/vacance-sources.js');
const { default: JSZip } = await import('jszip');

const ENTETES = 'siren,nic,siret,statutDiffusionEtablissement,dateCreationEtablissement,trancheEffectifsEtablissement,anneeEffectifsEtablissement,activitePrincipaleRegistreMetiersEtablissement,dateDernierTraitementEtablissement,etablissementSiege,nombrePeriodesEtablissement,complementAdresseEtablissement,numeroVoieEtablissement,indiceRepetitionEtablissement,dernierNumeroVoieEtablissement,indiceRepetitionDernierNumeroVoieEtablissement,typeVoieEtablissement,libelleVoieEtablissement,codePostalEtablissement,libelleCommuneEtablissement,libelleCommuneEtrangerEtablissement,distributionSpecialeEtablissement,codeCommuneEtablissement,codeCedexEtablissement,libelleCedexEtablissement,codePaysEtrangerEtablissement,libellePaysEtrangerEtablissement,identifiantAdresseEtablissement,coordonneeLambertAbscisseEtablissement,coordonneeLambertOrdonneeEtablissement,complementAdresse2Etablissement,numeroVoie2Etablissement,indiceRepetition2Etablissement,typeVoie2Etablissement,libelleVoie2Etablissement,codePostal2Etablissement,libelleCommune2Etablissement,libelleCommuneEtranger2Etablissement,distributionSpeciale2Etablissement,codeCommune2Etablissement,codeCedex2Etablissement,libelleCedex2Etablissement,codePaysEtranger2Etablissement,libellePaysEtranger2Etablissement,dateDebut,etatAdministratifEtablissement,enseigne1Etablissement,enseigne2Etablissement,enseigne3Etablissement,denominationUsuelleEtablissement,activitePrincipaleEtablissement,nomenclatureActivitePrincipaleEtablissement,caractereEmployeurEtablissement,activitePrincipaleNAF25Etablissement'.split(',');
const ligne = (o) => ENTETES.map((k) => { const v = o[k] ?? ''; return /[,"]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(',');
const base = { siren: '123456789', nic: '00011', siret: '12345678900011', statutDiffusionEtablissement: 'O', dateCreationEtablissement: '2015-03-01', etablissementSiege: 'true', numeroVoieEtablissement: '12', typeVoieEtablissement: 'RUE', libelleVoieEtablissement: "D'ANTIBES, BAT A", codePostalEtablissement: '06400', libelleCommuneEtablissement: 'CANNES', codeCommuneEtablissement: '06029', coordonneeLambertAbscisseEtablissement: '1025000', coordonneeLambertOrdonneeEtablissement: '6280000', dateDebut: '2015-03-01', etatAdministratifEtablissement: 'A', enseigne1Etablissement: 'BOULANGERIE', activitePrincipaleEtablissement: '10.71C' };
const CSV = [ENTETES.join(','),
  ligne(base),
  ligne({ ...base, siret: '12345678900022', nic: '00022', etatAdministratifEtablissement: 'F', dateDebut: '2023-06-30', etablissementSiege: 'false' }),
  ligne({ ...base, siret: '12345678900033', nic: '00033', etatAdministratifEtablissement: 'F', dateDebut: '2005-01-01' }),
  ligne({ ...base, siret: '99999999900011', siren: '999999999', codeCommuneEtablissement: '75056', codePostalEtablissement: '75001' }),
  ligne({ ...base, siret: '88888888800011', siren: '888888888', statutDiffusionEtablissement: 'P' }),
].join('\n') + '\n';

test('une ligne CSV avec guillemets et virgules', () => {
  assert.deepEqual(S.lireLigneCsv('a,"b, c","d ""e"""'), ['a', 'b, c', 'd "e"']);
});

test("le stock : lu en flux depuis le zip, filtré (département, diffusion, fermetures de moins de 8 ans), lisible par le registre", async () => {
  const zip = await new JSZip().file('StockEtablissement_utf8.csv', CSV).generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const UL = 'siren,statutDiffusionUniteLegale,prenom1UniteLegale,nomUniteLegale,denominationUniteLegale,categorieJuridiqueUniteLegale\n123456789,O,,,"BOULANGERIE DUPONT, SARL",5499\n999999999,O,,,AUTRE,5710\n';
  const zipUL = await new JSZip().file('StockUniteLegale_utf8.csv', UL).generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const serveur = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/zip' }); r.end(q.url.includes('ul') ? zipUL : zip); });
  await new Promise((ok) => serveur.listen(0, ok));
  const url = `http://127.0.0.1:${serveur.address().port}/stock.zip`;
  try {
    const r = await S.importerSireneStock({ departement: '06', url, urlUnites: url.replace('stock', 'ul') });
    assert.equal(r.lues, 5);
    assert.equal(r.lignes, 2);
    assert.equal(r.nommees, 1);
    assert.equal(S.communeChargee('06029'), true);
    const lus = S.etablissementsDeCommune('06029').map((x) => lireEtablissementVacance(S.versApi(x)));
    const actif = lus.find((x) => x.siret === '12345678900011');
    assert.equal(actif.etat, 'actif');
    assert.equal(actif.code_naf, '10.71C');
    assert.equal(actif.denomination, 'BOULANGERIE DUPONT, SARL');
    assert.match(actif.adresse, /12 RUE D'ANTIBES, BAT A 06400 CANNES/);
    assert.ok(actif.lat > 43 && actif.lat < 44 && actif.lon > 6.5 && actif.lon < 7.5);
    assert.equal(lus.find((x) => x.siret === '12345678900022').date_fermeture, '2023-06-30');
    assert.equal(S.etablissementsDeSirens(['123456789']).length, 2);
  } finally { serveur.close(); }
});
