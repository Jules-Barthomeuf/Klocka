// Les règles contrôlées chaque nuit et la qualité d'AK (9 oct. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-controles-'));
const C = await import('./controles.js');
const { Records } = await import('../db.js');

const MAINTENANT = new Date('2026-10-09T05:00:00Z');

test("ce qu'une validation compte comme correction : l'issue changée, un champ, la date, le mail", () => {
  const sans = C.mesureDeValidation({ appel: { issue: 'pas_de_murs', issue_deduite: true } });
  assert.deepEqual(sans, { propose_par_ak: true, issue: false, champs: [], date: false, mail: false, corrige: false });
  const issue = C.mesureDeValidation({ appel: { issue: 'a_des_murs', issue_deduite: false }, remplace: { issue: 'pas_de_murs', issue_deduite: true } });
  assert.equal(issue.propose_par_ak, true);
  assert.equal(issue.issue, true);
  assert.equal(issue.corrige, true);
  assert.deepEqual(C.mesureDeValidation({ appel: { issue_deduite: true }, corrections: [{ cle: 'email' }] }).champs, ['email']);
  assert.equal(C.mesureDeValidation({ appel: { issue_deduite: true }, relanceProposee: '2026-10-20', relanceChoisie: '2026-10-22' }).date, true);
  assert.equal(C.mesureDeValidation({ appel: { issue_deduite: true }, mailPropose: { a: 'a@b.fr', objet: 'X', corps: 'Y' }, mailEnvoye: { a: 'a@b.fr', objet: 'X', corps: 'Y modifié' } }).mail, true);
  assert.equal(C.mesureDeValidation({ appel: { issue: 'pas_de_murs', issue_deduite: false } }).propose_par_ak, false, "issue tapée : AK n'a rien proposé");
});

test("la qualité d'AK : la part des appels validés sans correction, par semaine, seulement ceux qu'AK a proposés", () => {
  const ap = (le, corrige, propose = true) => ({ etat: 'valide', valide_le: le, mesure_ak: { propose_par_ak: propose, corrige, issue: corrige, champs: [], date: false, mail: false } });
  const q = C.qualiteAK({ semaines: 2, maintenantD: MAINTENANT, appels: [
    ap('2026-10-06T09:00:00Z', false), ap('2026-10-07T09:00:00Z', false), ap('2026-10-08T09:00:00Z', true), ap('2026-10-08T10:00:00Z', false, false),
    ap('2026-09-30T09:00:00Z', true), ap('2026-10-01T09:00:00Z', false),
  ] });
  assert.deepEqual(q.courante, { semaine: '2026-10-05', appels: 3, sans_correction: 2, taux: 67 });
  assert.deepEqual(q.precedente, { semaine: '2026-09-28', appels: 2, sans_correction: 1, taux: 50 });
  assert.equal(q.corrections.issue, 2);
});

test("le contrôle de la nuit : agent suivi sans date, doublon et désaccord Monday, fiche sans agent ; le mail le dit", async () => {
  const f = Records.create('AgentImmo', { nom: 'Marc Sansdate', agence: 'Riviera', telephones: ['0611111111'], statut: 'a_rappeler' });
  Records.create('AppelAgent', { agent_id: f.id, etat: 'valide', le: '2026-10-08T09:00:00Z', valide_le: '2026-10-08T09:00:00Z', issue: 'pas_de_murs' });
  const g = Records.create('AgentImmo', { nom: 'Sophie Monday', telephones: ['0622222222'], statut: 'pas_de_murs', prochaine: { le: '2026-11-08', quoi: 'point du mois' }, monday_ligne_id: '42' });
  Records.create('AppelAgent', { agent_id: g.id, etat: 'valide', le: '2026-10-08T09:00:00Z', valide_le: '2026-10-08T09:00:00Z', issue: 'pas_de_murs' });
  const lireMonday = async () => [
    { id: '42', nom: 'Sophie Monday', telephone: '06 22 22 22 22', relance: '2026-11-10' },
    { id: '43', nom: 'Sophie bis', telephone: '0622222222', relance: '' },
    { id: '44', nom: 'Autre', telephone: '0633333333', relance: '' },
  ];
  const r = await C.controler({ maintenantD: MAINTENANT, lireMonday });
  const de = (cle) => r.regles.find((x) => x.cle === cle);
  assert.equal(de('relance_pour_tous').n, 1);
  assert.match(de('relance_pour_tous').details[0], /Marc Sansdate/);
  assert.equal(de('monday_accord').n, 1);
  assert.match(de('monday_accord').details[0], /08\/11 ici, 10\/11 dans Monday/);
  assert.equal(de('doublons_monday').n, 1);
  assert.match(de('doublons_monday').details[0], /2 lignes \(Sophie Monday, Sophie bis\)/);
  assert.equal(de('un_seul_endroit').ok, true);
  assert.equal(r.conforme, false);
  assert.equal(r.regles.length, 9);
  const m = C.mailDuRapport(r, 'https://exemple/Suivi');
  assert.match(m.objet, /^Klocka · \d règles? non conformes?$/);
  assert.match(m.details, /✗ \*\*Tout agent suivi a une prochaine relance\*\* : 1 écart\n {4}Marc Sansdate/);
  assert.match(m.details, /✓ Une agence est à un seul endroit/);
  // Sans Monday : les deux règles Monday sont « non vérifiées », pas conformes en silence.
  const sans = await C.controler({ maintenantD: MAINTENANT });
  assert.ok(sans.regles.find((x) => x.cle === 'doublons_monday').non_verifie);
  // Le modèle du mail se rend avec ses variables.
  const { mailPlateforme } = await import('../emailing/index.js');
  const rendu = mailPlateforme('rapport_regles', m);
  assert.equal(rendu.objet, m.objet);
  assert.match(rendu.html, /Marc Sansdate/);
});
