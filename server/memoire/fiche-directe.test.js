// Une fiche envoyée au numéro WhatsApp de Klocka par l'équipe (22 nov. 2026) : en Mémoire, comptée à son nom.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiche-directe-'));
const { Records } = await import('../db.js');
const { ficheEnMemoire } = await import('./fiche-directe.js');
const { listerFiches } = await import('../deal/fiches-stats.js');

test('un PDF de deux fiches envoyé sur WhatsApp : deux biens en Mémoire, un envoi de deux fiches au nom de Nora, une seule lecture', async () => {
  let lectures = 0;
  const lot = (rue) => ({ lot: { adresse: { valeur: { rue, code_postal: '34000', ville: 'Montpellier' } }, prix_fai: { valeur: 500000 } } });
  const extraire = async () => { lectures += 1; return { lots: [lot('3 rue Foch'), lot('8 rue de la Loge')], agent: { nom: 'Paul Agent', email: 'paul@cabinet.fr' }, biens_annonces: 2, source: 'pdf' }; };
  const r = await ficheEnMemoire({ buffer: Buffer.from('%PDF deux fiches'), nom: 'Teaser.pdf', mime: 'application/pdf', par: 'nora.l@klocka.immo', envoiId: 'wa:123', extraire });
  assert.equal(r.n, 2);
  const deja = await ficheEnMemoire({ buffer: Buffer.from('%PDF deux fiches'), nom: 'Teaser.pdf', par: 'nora.l@klocka.immo', envoiId: 'wa:124', extraire });
  assert.equal(deja.deja, true);
  assert.equal(lectures, 1);
  const f = listerFiches({ biensMemoire: Records.list('BienMemoire') }, { depuis: null });
  assert.equal(f.length, 1);
  assert.deepEqual([f[0].id, f[0].biens, f[0].transferee_par, f[0].agent_email, f[0].canal, f[0].a_verifier], ['wa:123', 2, 'nora.l@klocka.immo', 'paul@cabinet.fr', 'wa', undefined]);
});
