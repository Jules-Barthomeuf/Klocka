// Les appels du mode appel sur la fiche de l'agent, sans IA (26 nov. 2026, Jules : « tu peux te servir des appels pour
// voir quand on a eu un premier contact, ce qu'il s'est passé »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-appels-fiche-'));
const { Records } = await import('../db.js');
const I = await import('./import.js');

const lignesDe = (cle) => Records.filter('EntreeDossier', { fiche_cle: cle }).sort((a, b) => String(a.le).localeCompare(String(b.le)));

test("le premier contact est le premier appel où l'agent a répondu ; un sans-réponse ne livre pas de résumé", () => {
  const l = I.lignesDesAppels([
    { id: 'b', par: 'maxime.p@klocka.immo', le: '2026-10-14T09:00:00Z', issue: 'a_des_murs', resume: 'Deux murs de pharmacie à Nice.' },
    { id: 'a', par: 'maxime.p@klocka.immo', le: '2026-10-10T09:00:00Z', issue: 'repondeur', resume: 'Message laissé.' },
    { id: 'c', par: 'nora.l@klocka.immo', le: '2026-11-02T09:00:00Z', issue: 'veut_mail', resume: 'Veut la plaquette.' },
    { id: 'z', par: 'x@klocka.immo', le: '2026-09-01T09:00:00Z', issue: 'a_des_murs', essai: true },
    { id: 'y', par: 'jules.b@klocka.immo', le: '2026-09-02T09:00:00Z', issue: 'autre', resume: "L'agent n'apparaît pas dans la conversation : la transcription ne rapporte qu'une démonstration de l'outil entre collègues." },
  ]);
  assert.deepEqual(l.map((x) => x.appel_id), ['a', 'b', 'c']);
  assert.equal(l[0].texte, 'Appel de Maxime · Répondeur, message laissé');
  assert.equal(l[1].texte, 'Premier contact (appel de Maxime) · A un bien intéressant : Deux murs de pharmacie à Nice.');
  assert.equal(l[2].texte, "Appel de Nora · Veut d'abord un mail : Veut la plaquette.");
});

test("les lignes vont sur la fiche de l'agent, datées du jour de l'appel ; relancer n'en double aucune", () => {
  const agent = Records.create('AgentImmo', { nom: 'Claire Martin', agence: 'Riviera Commerces', ville: 'Nice' });
  Records.create('AppelAgent', { agent_id: agent.id, par: 'maxime.p@klocka.immo', le: '2026-10-14T09:00:00Z', issue: 'pas_de_murs', resume: 'Rien en ce moment, à rappeler en janvier.' });
  assert.equal(I.historiqueDesAppels(), 1);
  assert.equal(I.historiqueDesAppels(), 0);
  const cle = `agent:${agent.id}`;
  assert.ok(Records.findBy('FicheDossier', 'cle', cle));
  const [l] = lignesDe(cle);
  assert.equal(l.genre, 'evenement');
  assert.equal(l.le, '2026-10-14T09:00:00Z');
  assert.equal(l.importe, true);
  assert.match(l.texte, /^Premier contact/);

  // Un appel plus ancien retrouvé après : le premier contact passe sur lui, l'autre ligne redevient un appel.
  Records.create('AppelAgent', { agent_id: agent.id, par: 'nora.l@klocka.immo', le: '2026-09-20T09:00:00Z', issue: 'veut_mail', resume: 'Veut un mail de présentation.' });
  assert.equal(I.historiqueDesAppels({ agentId: agent.id }), 1);
  const [premier, second] = lignesDe(cle);
  assert.match(premier.texte, /^Premier contact \(appel de Nora\)/);
  assert.match(second.texte, /^Appel de Maxime/);
});
