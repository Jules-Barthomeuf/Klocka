// Importer un bien qu'on a déjà : la fiche née vide, remplie par le récit (4 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-bien-repris-'));
const { Records } = await import('./db.js');
const R = await import('./bien-repris.js');
const D = await import('./documents-du-bien.js');

const user = { email: 'm@kpartners.fr', role: 'mandataire' };

test('« Importer » : une fiche vide dans Biens, que le chat sait en cours d’import', () => {
  const r = R.creerBienAImporter(user);
  assert.ok(r.ok);
  assert.equal(r.proprietaire.statut, 'rdv_pris', 'elle est dans Biens tout de suite');
  assert.ok(r.proprietaire.biens.import.le);
  assert.match(R.cadreImport(r.proprietaire), /Il manque encore : l'adresse, le type de bien/);
  assert.ok(R.finirImport(r.proprietaire.id, user).ok);
  assert.equal(R.cadreImport(Records.get('ProprietaireMandataire', r.proprietaire.id)), '', 'fini, le chat ne la reprend plus');
});

test('le récit : la fiche, les jalons datés, l’étape d’aujourd’hui, sans doublon', () => {
  const { proprietaire: p } = R.creerBienAImporter(user);
  const input = {
    adresse: '12 rue Mercière', ville: 'Lyon', type_bien: 'fonds_commerce', activite: 'Boulangerie', proprietaire: 'M. Ginet', prix: 140000, ca: 450000,
    etape_actuelle: 'mandat',
    jalons: [
      { quoi: 'visite', date: '2026-09' },
      { quoi: 'avis_envoye', date: '2026-09-20' },
      { quoi: 'avis_accepte', date: '2026-10-02', texte: 'accepté à 140 k€' },
      { quoi: 'mandat_signe', date: '' },
    ],
  };
  const r = R.executerReprise(input, user, { fiche: p });
  assert.ok(r.ok);
  assert.equal(r.jalons_ajoutes, 3, 'un jalon sans date ne s’écrit pas');
  assert.match(r.fait, /relance/, 'mandat pas encore signé : il propose une relance');
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.adresse, '12 rue Mercière');
  assert.equal(f.type_bien, 'fonds_commerce');
  assert.equal(f.commerce, '12 rue Mercière', '« Nouveau bien » prend le nom de son adresse');
  assert.equal(f.nom, 'M. Ginet');
  assert.equal(f.biens.validee, 'avis_accepte', 'au Mandat : l’Avis de valeur est franchi');
  assert.equal(f.biens.prix_accord, 140000);
  assert.equal(f.biens.repris.ca, 450000);
  assert.equal(f.biens.jalons[0].le, '2026-09-01T09:00:00.000Z', '« début septembre » : le 1er du mois');
  assert.equal(f.biens.jalons[2].detail, 'accepté à 140 k€');
  assert.ok(f.historique.some((h) => h.type === 'jalon' && h.texte === 'Avis de valeur envoyé au propriétaire'));
  assert.equal(R.executerReprise(input, user, { fiche: f }).jalons_ajoutes, 0, 'le même récit ne double rien');
  assert.equal(R.executerReprise(input, { email: 'autre@kpartners.fr' }, { fiche: p }).ok, false);
});

test('un avis ou un mandat importés : rangés à part, jamais copiés dans la Data room', () => {
  assert.equal(D.natureDuNom('Mandat de vente Ginet signé.pdf'), 'mandat');
  assert.equal(D.natureDuNom('Avis de valeur - 12 rue Mercière.pdf'), 'avis');
  assert.ok(D.horsDataroom('mandat'));
  assert.ok(!D.horsDataroom('bail'));
});

test("une reprise ne fait jamais reculer le bien ; un mandat importé le met au mandat signé", async () => {
  const R = await import('./bien-repris.js');
  assert.equal(R.auPlusLoin('mandat', 'previsite'), 'mandat');
  assert.equal(R.auPlusLoin('mandat', 'marche'), 'marche');
  assert.equal(R.auPlusLoin(null, R.franchiParDocument('mandat')), 'mandat');
  assert.equal(R.franchiParDocument('bail'), null);
  const { maj } = R.repriseDe({ biens: { validee: 'dataroom' } }, { etape_actuelle: 'mandat' });
  assert.equal(maj.biens.validee, 'dataroom', 'dire « au mandat » après le mandat importé ne recule pas');
});
