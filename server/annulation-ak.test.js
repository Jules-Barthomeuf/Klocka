// L'annulation des actions d'AK (12 oct. 2026) : l'auteur est l'adresse seule, le canal à part.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-annul-'));
const J = await import('./assistant-journal.js');
const { Records } = await import('./db.js');
const { bilanDe } = await import('./ak/bilan.js');

test('une action d’AK dans l’application est annulable par son auteur', () => {
  J.journaliser({ outil: 'pousser_dossier_monday', args: { deal_id: 'd1' }, resultat: { ok: true, cree: true, id: '123' }, user: { email: 'jules.b@klocka.immo' }, via: "AK dans l'application" });
  const a = J.derniereAnnulable('jules.b@klocka.immo');
  assert.ok(a, 'retrouvée par l’adresse seule');
  assert.equal(a.resultat.id, '123');
});

test('les actions d’avant, notées « adresse (AK …) », restent à leur auteur', () => {
  Records.create('AssistantAction', { outil: 'creer_dossier', par: "coralie.g@klocka.immo (AK dans l'application)", le: new Date().toISOString(), annulable: true, annulee: false, resultat: { cree: true } });
  assert.ok(J.derniereAnnulable('coralie.g@klocka.immo'));
});

test('annuler un élément Monday sans identifiant le dit au lieu d’appeler Monday', async () => {
  const a = Records.create('AssistantAction', { outil: 'creer_agent_monday', par: 'x@k.fr', annulable: true, annulee: false, resultat: { cree: true } });
  const r = await J.annuler(a);
  assert.equal(r.ok, false);
  assert.match(r.message, /à la main/);
});

test('le bilan d’AK compte les actions notées par canal', () => {
  const b = bilanDe({ actions: [{ outil: 'creer_dossier', par: 'jules.b@klocka.immo', via: "AK dans l'application", le: new Date().toISOString(), resultat: { ok: true } }] });
  assert.equal(b.actions, 1);
});
