// Le pont vers Google Chat : le texte annoncé, le fil par dossier, et rien
// qui ne casse quand le webhook manque ou répond mal. Aucun appel réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-pont-'));
const G = await import('./pont-google-chat.js');

test('texte : le bien, le mandataire, ce qui arrive, le lien', () => {
  const t = G.texteAlerte({ bien: 'Boulangerie Aux Délices', mandataire: 'Léa Test', quoi: 'Message', texte: 'Le Kbis   arrive\nlundi.', lien: 'https://app/Conversations?dossier=1' });
  assert.equal(t, '*Boulangerie Aux Délices* · Léa Test\nMessage : « Le Kbis arrive lundi. »\n<https://app/Conversations?dossier=1|Ouvrir la conversation>');
  assert.equal(G.texteAlerte({ bien: 'X', mandataire: 'Y', quoi: 'Pièce déposée : Bail commercial' }), '*X* · Y\nPièce déposée : Bail commercial');
});

test('adresse : un fil par dossier, la clé du webhook gardée', () => {
  const u = new URL(G.adresseFil('https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t', 'd42'));
  assert.equal(u.searchParams.get('key'), 'k');
  assert.equal(u.searchParams.get('token'), 't');
  assert.equal(u.searchParams.get('threadKey'), 'dossier-d42');
  assert.equal(u.searchParams.get('messageReplyOption'), 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
});

test('sans webhook rien ne part ; une panne ne lève pas', async () => {
  let appels = 0;
  const faux = async () => { appels += 1; return { ok: true }; };
  assert.equal((await G.prevenirEquipe({ id: 'd1', bien: 'B' }, { quoi: 'Message' }, { fetchImpl: faux, url: '' })).ok, false);
  assert.equal(appels, 0);
  const r = await G.prevenirEquipe({ id: 'd1', bien: 'B' }, { quoi: 'Message' }, { fetchImpl: faux, url: 'https://exemple.test/hook?key=k' });
  assert.equal(r.ok, true);
  assert.equal(appels, 1);
  const panne = await G.prevenirEquipe({ id: 'd1', bien: 'B' }, { quoi: 'Message' }, { fetchImpl: async () => { throw new Error('réseau'); }, url: 'https://exemple.test/hook' });
  assert.equal(panne.ok, false);
  const refus = await G.prevenirEquipe({ id: 'd1', bien: 'B' }, { quoi: 'Message' }, { fetchImpl: async () => ({ ok: false, status: 403 }), url: 'https://exemple.test/hook' });
  assert.equal(refus.ok, false);
});
