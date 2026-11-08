// La Mémoire dans Propriétés Klocka, et le tri des fichiers du Drive.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-memoire-klocka-'));
const { valeursKlocka, seulementVides, cleLieu, cleLigneKlocka, PERSONNES_MEMOIRE } = await import('./twenty.js');
const { estFicheDrive } = await import('./drive.js');
const F = await import('../deal/fiches-auto.js');

const bien = { adresse: { rue: '12 av. Jean Médecin', code_postal: '06000', ville: 'Nice' }, ville: 'Nice', loyer_annuel: 27000, prix: 450000, surface_m2: 85, recu_le: '2026-06-26T10:00:00Z', agent: { nom: 'Nicolas Serra', telephone: '0601020304' } };

test('une fiche reçue remplit sa ligne, avec les quatre personnes', () => {
  const v = valeursKlocka(bien);
  assert.equal(v.personnes, PERSONNES_MEMOIRE);
  assert.equal(v.groupe, 'MEMOIRE');
  assert.equal(v.date, '2026-06-26');
  assert.equal(v.loyer, 27000);
  assert.equal(v.prix, 450000);
  assert.equal(v.adresse.addressCity, 'Nice');
  assert.match(v.notes, /Nicolas Serra/);
  assert.equal('drive' in v, false, 'une case sans donnée ne part pas');
});

test('sans rue, la ville suffit ; sans rien, le nom vient du mail', () => {
  assert.equal(valeursKlocka({ ville: 'Mandelieu', prix: 172800 }).adresse.addressCity, 'Mandelieu');
  assert.equal(valeursKlocka({ prix: 1, objet_mail: 'Murs à vendre' }).name, 'Murs à vendre');
});

test('une ligne qui existe garde ce qui y est écrit', () => {
  const ligne = { personnes: 'Paul De Zulueta', prix: 250000, loyer: null, adresse: { addressStreet1: '12 av', addressCity: 'Nice' }, notes: '', drive: { primaryLinkUrl: '', secondaryLinks: [] } };
  const v = seulementVides({ ...valeursKlocka(bien), drive: { primaryLinkUrl: 'https://x', primaryLinkLabel: '', secondaryLinks: [] } }, ligne);
  assert.deepEqual(Object.keys(v).sort(), ['activiteLocataire', 'agentImmobilier', 'date', 'drive', 'loyer', 'm', 'notes'].filter((k) => k in v).sort());
  assert.equal(v.loyer, 27000);
  assert.equal('prix' in v, false);
  assert.equal('personnes' in v, false);
  assert.equal('groupe' in v, false);
});

test('la même adresse se reconnaît malgré une rue écrite en entier', () => {
  assert.equal(cleLieu({ rue: '23 Rue Archangé', ville: 'ORSAY' }), cleLigneKlocka({ adresse: { addressStreet1: '23 Rue Archangé, Orsay, France', addressCity: 'Orsay' } }));
  assert.equal(cleLieu({ ville: 'Nice' }), null);
});

test('du Drive, seuls les fichiers dont le nom dit une fiche sont lus', () => {
  assert.ok(estFicheDrive({ nom: 'Fiche murs Nice.pdf', taille: 1000 }, F));
  assert.ok(estFicheDrive({ nom: 'Teaser - Lyon 6.pdf', taille: 1000 }, F));
  assert.ok(estFicheDrive({ nom: 'VP2819-MURS OCCUPES 73m² - 39 rue Saint-Ambroise 75011 Paris.pdf', taille: 1000 }, F));
  assert.ok(estFicheDrive({ nom: 'Murs Pamiers France.pdf', taille: 1000 }, F));
  assert.equal(estFicheDrive({ nom: 'Présentation Klocka - 0410.pdf', taille: 1000 }, F), false);
  assert.equal(estFicheDrive({ nom: '~$esentation opportunite.docx', taille: 1000 }, F), false);
  assert.equal(estFicheDrive({ nom: 'FICHE SYNTHETIQUE AG du 29 06 23.pdf', taille: 1000 }, F), false);
  assert.equal(estFicheDrive({ nom: 'Bail commercial.pdf', taille: 1000 }, F), false);
  assert.equal(estFicheDrive({ nom: 'scan001.pdf', taille: 1000 }, F), false);
  assert.equal(estFicheDrive({ nom: 'Fiche.pdf', taille: 60 * 1024 * 1024 }, F), false);
});
