// Le lecteur des boîtes : le point de reprise, la lecture d'une boîte en entier, et ce qu'il ne relit pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lecteur-'));
process.env.MEMOIRE_PAUSE_MS = '0';
process.env.MEMOIRE_PAGE = '2';
const { Records } = await import('../db.js');
const { aLire, unePage, pointDeReprise, traiterMessage, mettreEnPause, lireBoite, recommencer } = await import('./scraper.js');
const { porteUneFiche } = await import('../deal/fiches-auto.js');

test('aLire : déjà connu ou sans fiche, on ne lit pas', () => {
  const fiche = { objet: 'Murs commerciaux Nice', pieces_jointes: [{ nom: 'fiche-commerciale-nice.pdf', piece_id: 'p' }] };
  assert.equal(aLire(fiche, { porteUneFiche }).lire, true);
  assert.equal(aLire(fiche, { porteUneFiche, dejaEnMemoire: true }).raison, 'déjà en Mémoire');
  assert.equal(aLire({ objet: 'Facture', pieces_jointes: [{ nom: 'facture-octobre.pdf' }] }, { porteUneFiche }).lire, false);
});

const messages = {
  m1: { compte: 'sourcing@klocka.immo', gmail_message_id: 'm1', de: 'Théo <theo@quorner.com>', de_email: 'theo@quorner.com', objet: 'Murs commerciaux Nice', date: '2026-03-02T10:00:00.000Z', texte: '', pieces_jointes: [{ nom: 'fiche-commerciale-nice.pdf', piece_id: 'p1', mime: 'application/pdf' }] },
  m2: { compte: 'sourcing@klocka.immo', gmail_message_id: 'm2', de: 'Compta <compta@x.fr>', de_email: 'compta@x.fr', objet: 'Facture', date: '2026-03-03T10:00:00.000Z', texte: '', pieces_jointes: [{ nom: 'facture.pdf', piece_id: 'p2' }] },
  m3: { compte: 'sourcing@klocka.immo', gmail_message_id: 'm3', de: 'Théo <theo@quorner.com>', de_email: 'theo@quorner.com', objet: 'Murs commerciaux Nice (bis)', date: '2026-03-04T10:00:00.000Z', texte: '', pieces_jointes: [{ nom: 'fiche-commerciale-nice.pdf', piece_id: 'p1', mime: 'application/pdf' }] },
};
let pages = 0;
let extractions = 0;
const deps = {
  gmail: {
    listerMessagesGmail: async (_c, { pageToken }) => { pages += 1; return pageToken ? { ids: ['m3'], suivant: null } : { ids: ['m1', 'm2'], suivant: 'page2' }; },
    lireMessage: async (_c, id) => messages[id],
    telechargerPieceJointe: async () => Buffer.from('la fiche'),
  },
  fiches: await import('../deal/fiches-auto.js'),
  extraire: async () => { extractions += 1; return { lots: [{ lot: { adresse: { valeur: { rue: '12 avenue Jean Médecin', code_postal: '06000', ville: 'Nice' } }, prix_fai: { valeur: 450000 } } }], agent: { nom: null, email: null, agence: 'Quorner' }, cout_eur: 0.01 }; },
};

test('unePage : lit la page, garde la fiche, ignore la facture, avance le point de reprise', async () => {
  const p = await unePage('sourcing@klocka.immo', deps);
  assert.equal(p.pageToken, 'page2');
  assert.equal(p.fiches, 1);
  assert.equal(p.ignores, 1);
  assert.equal(extractions, 1);
  const biens = Records.list('BienMemoire');
  assert.equal(biens.length, 1);
  assert.equal(biens[0].agent_email, 'theo@quorner.com');
  assert.equal(biens[0].agent.agence, 'Quorner');
  assert.equal(biens[0].origine, 'scraper');
  assert.ok(biens[0].fiche?.url.startsWith('/uploads/memoire/'));
});

test('unePage : la seconde page, même pièce déjà lue, puis la boîte est finie', async () => {
  const p = await unePage('sourcing@klocka.immo', deps);
  assert.equal(p.pageToken, null);
  assert.ok(p.termine_le);
  assert.equal(extractions, 1, 'la même pièce ne repasse pas devant le modèle');
  assert.equal(pages, 2);
  assert.equal((await unePage('sourcing@klocka.immo', deps)).rien, true);
});

test('traiterMessage : un mail déjà lié à un dossier ne se relit pas ; la pause arrête une page', async () => {
  Records.create('MailRecu', { compte: 'sourcing@klocka.immo', gmail_message_id: 'm9', deal_id: 'd-1' });
  assert.equal((await traiterMessage('sourcing@klocka.immo', 'm9', deps)).raison, 'déjà un dossier');
  assert.equal((await traiterMessage('sourcing@klocka.immo', 'm1', deps)).raison, 'déjà en Mémoire');
  mettreEnPause(true);
  recommencer('sourcing@klocka.immo');
  const p = await unePage('sourcing@klocka.immo', deps);
  assert.equal(p.interrompu, true);
  assert.equal(pointDeReprise('sourcing@klocka.immo').pageToken, null, 'le point de reprise n\'a pas bougé');
  mettreEnPause(false);
});

test('lireBoite : autorisée, la boîte se lit d\'un bout à l\'autre ; sans autorisation, rien', async () => {
  recommencer('sourcing@klocka.immo');
  const sans = await lireBoite('sourcing@klocka.immo', { ...deps, oauth: { storedAccount: () => ({ peut_lire: true, memoire_autorisee_le: null }) } });
  assert.equal(sans.termine, false);
  const r = await lireBoite('sourcing@klocka.immo', { ...deps, oauth: { storedAccount: () => ({ peut_lire: true, memoire_autorisee_le: '2026-10-30T10:00:00.000Z' }) } });
  assert.equal(r.termine, true);
  assert.ok(pointDeReprise('sourcing@klocka.immo').termine_le);
});
