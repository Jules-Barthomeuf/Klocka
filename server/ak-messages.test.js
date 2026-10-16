// Les messages d'AK : une conversation par personne, un message par dossier, les non-lus.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-messages-ak-'));
const M = await import('./ak-messages.js');
const { Conversations } = await import('./db.js');

test('AK écrit dans une seule conversation par personne, un dossier une fois', () => {
  const id = M.ecrireDAK('nora.l@klocka.immo', 'Premier', { cle: 'preanalyse:D1', maintenant: new Date('2026-10-16T08:00:00Z') });
  assert.equal(M.ecrireDAK('nora.l@klocka.immo', 'Doublon', { cle: 'preanalyse:D1' }), id);
  M.ecrireDAK('nora.l@klocka.immo', 'Second', { cle: 'preanalyse:D2', maintenant: new Date('2026-10-16T09:00:00Z') });
  const c = Conversations.get(id);
  assert.equal(c.agent_name, 'dashboard', 'le même chat que le Dashboard');
  assert.equal(c.messages.length, 2);
  assert.equal(M.etatDAK('nora.l@klocka.immo').non_lus, 2);
  M.marquerLus('nora.l@klocka.immo', new Date('2026-10-16T08:30:00Z'));
  const e = M.etatDAK('nora.l@klocka.immo');
  assert.equal(e.non_lus, 1);
  assert.equal(e.dernier.contenu, 'Second');
  const vide = M.etatDAK('maxime.p@klocka.immo');
  assert.notEqual(vide.id, id, 'chacun la sienne');
  assert.equal(vide.non_lus, 0, 'toujours là, vide au départ');
});

test('les réponses de la personne ne comptent pas comme non lues', () => {
  const r = M.etatDesMessages([{ role: 'assistant', contenu: 'a', ak_le: '2026-10-16T08:00:00Z' }, { role: 'user', contenu: 'b' }, { role: 'assistant', contenu: 'réponse du chat' }], null);
  assert.equal(r.non_lus, 1);
});

test('le message après une pré-analyse', () => {
  const t = M.messagePreanalyse({ nom: 'Pharmacie - Nice', de: 'Sophie Martin', avis: "c'est bon, le dossier est prêt" });
  assert.match(t, /^J'ai reçu une fiche commerciale de Sophie Martin et je l'ai pré-analysée : Pharmacie - Nice\./);
  assert.match(t, /c'est bon, le dossier est prêt$/);
  assert.match(M.messagePreanalyse({ nom: 'X' }), /aille plus loin/);
});
