// Les notes de l'équipe sur un bien (15 nov. 2026) : ce qu'on raconte à l'assistant, rangé sur le dossier ou le projet.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-notes-equipe-'));
const { Records } = await import('../db.js');
const { noterSurLeBien, notesDuBien, notesPourAssistant, cibleDeLaNote } = await import('./notes-equipe.js');

const user = { email: 'maxime.p@klocka.immo', role: 'admin' };

test('une note sur un projet issu d\'un dossier se range sur le dossier, et le projet la voit', () => {
  const deal = Records.create('Deal', { deal_id: 'd-notes-1', titre: 'KFC Lyon', lots: [] });
  const projet = Records.create('Project', { titre: 'KFC', deal_id: 'd-notes-1' });
  const r = noterSurLeBien({ projet_id: projet.id }, "  L'agent dit que le vendeur a refusé 900 k.  ", user);
  assert.equal(r.ok, true);
  assert.equal(r.sur, 'dossier');
  assert.equal(r.note.texte, "L'agent dit que le vendeur a refusé 900 k.");
  assert.equal(Records.findBy('Deal', 'deal_id', 'd-notes-1').notes_equipe.length, 1);
  assert.equal(Records.get('Project', projet.id).notes_equipe, undefined);
  const lu = notesPourAssistant({ deal: Records.get('Deal', deal.id), projet });
  assert.deepEqual(lu.map((n) => [n.par, n.texte]), [['maxime.p', "L'agent dit que le vendeur a refusé 900 k."]]);
});

test('un projet sans dossier garde la note pour lui ; une note vide ou un bien inconnu sont refusés', () => {
  const projet = Records.create('Project', { titre: 'Roadside' });
  assert.equal(noterSurLeBien({ projet_id: projet.id }, 'En vente chez Century il y a deux ans à 1,2 M.', user).sur, 'projet');
  assert.equal(noterSurLeBien({ projet_id: projet.id }, '   ', user).ok, false);
  assert.equal(noterSurLeBien({ deal_id: 'inconnu' }, 'x', user).ok, false);
  assert.equal(cibleDeLaNote({}), null);
});

test('les notes du dossier et du projet réunies, la plus récente d\'abord, sans doublon', () => {
  const a = { id: 'a', texte: 'ancienne', le: '2026-11-01T10:00:00Z' };
  const b = { id: 'b', texte: 'récente', le: '2026-11-14T10:00:00Z' };
  assert.deepEqual(notesDuBien({ deal: { notes_equipe: [a, b] }, projet: { notes_equipe: [a] } }).map((n) => n.texte), ['récente', 'ancienne']);
});
