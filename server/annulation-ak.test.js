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

test('annuler un élément Sunday CRM sans identifiant le dit au lieu d’appeler Sunday CRM', async () => {
  const a = Records.create('AssistantAction', { outil: 'creer_agent_monday', par: 'x@k.fr', annulable: true, annulee: false, resultat: { cree: true } });
  const r = await J.annuler(a);
  assert.equal(r.ok, false);
  assert.match(r.message, /à la main/);
});

test('le bilan d’AK compte les actions notées par canal', () => {
  const b = bilanDe({ actions: [{ outil: 'creer_dossier', par: 'jules.b@klocka.immo', via: "AK dans l'application", le: new Date().toISOString(), resultat: { ok: true } }] });
  assert.equal(b.actions, 1);
});

test('la garde anti-doublon est par personne', async () => {
  const { cleGeste, dejaFait } = await import('./ak/agent.js');
  const jules = cleGeste('rediger_loi', { projet_id: 'p1' }, 'Jules.B@klocka.immo');
  const coralie = cleGeste('rediger_loi', { projet_id: 'p1' }, 'coralie.g@klocka.immo');
  assert.notEqual(jules, coralie);
  const gestes = { [jules]: Date.now() - 5 * 60000 };
  assert.equal(dejaFait(jules, gestes), 5, 'Jules qui refait sa LOI : bloqué');
  assert.equal(dejaFait(coralie, gestes), null, 'Coralie qui fait la sienne : passe');
});

test('l’agenda : celui de la personne qui parle, sinon un compte de l’équipe qui l’a autorisé, sinon rien', async () => {
  const { compteAgendaPour } = await import('./ak/outils.js');
  const comptes = [{ email: 'coralie.g@klocka.immo', peut_agenda: true }, { email: 'jules.b@klocka.immo', peut_agenda: false }];
  assert.equal(compteAgendaPour('Coralie.G@klocka.immo', { lire: () => comptes }), 'coralie.g@klocka.immo');
  assert.equal(compteAgendaPour('jules.b@klocka.immo', { lire: () => comptes }), 'coralie.g@klocka.immo', 'Jules sans agenda : celui de l’équipe');
  assert.equal(compteAgendaPour('jules.b@klocka.immo', { lire: () => [] }), null);
});

test('lancer_design n’est pas proposé sans AK_DESIGN', async () => {
  const { OUTILS } = await import('./ak/agent.js');
  if (!/^(1|true|oui|yes)$/i.test(process.env.AK_DESIGN || '')) assert.ok(!OUTILS.some((o) => o.name === 'lancer_design'));
});
