// Le Suivi des appels (9 oct. 2026) : d'où vient chaque appel, les chiffres
// d'une personne ou de l'équipe, et le tableau complet sur une base vide.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-suivi-appels-'));
const S = await import('./suivi-appels.js');
const { Records } = await import('../db.js');

const MAINTENANT = new Date('2026-10-09T15:00:00Z');

test("d'où vient un appel : la source gardée, sinon l'essai, le rappel, la session, la forme", () => {
  const sessions = new Map([['s1', { relances: true }], ['s2', { essai: true }]]);
  assert.equal(S.sourceDe({ source: 'relances', essai: true }), 'relances', 'la source gardée fait foi');
  assert.equal(S.sourceDe({ essai: true }), 'essai');
  assert.equal(S.sourceDe({ rappel_entrant: true }), 'rappel');
  assert.equal(S.sourceDe({ session_id: 's1', agence_id: 'a' }, sessions), 'relances');
  assert.equal(S.sourceDe({ session_id: 's2' }, sessions), 'essai');
  assert.equal(S.sourceDe({ agence_id: 'a' }, sessions), 'prospection');
  assert.equal(S.sourceDe({}, sessions), 'carnet');
});

test("les chiffres : joints, enregistrés, durées, validation depuis la fenêtre, corrections d'AK, oubliés", () => {
  const appels = [
    { le: '2026-10-09T08:00:00Z', issue: 'pas_de_reponse', etat: 'valide', enregistre: false, duree_s: 20 },
    { le: '2026-10-09T09:00:00Z', issue: 'a_des_murs', etat: 'valide', enregistre: true, notes: 'x', duree_s: 100,
      validation_ui: { depuis_fenetre: true, etapes: 4, vues: 4, retirees: ['mail'] },
      mesure_ak: { propose_par_ak: true, corrige: false }, recu: { mail: { etat: 'ok' }, monday: { etat: 'ok' } } },
    { le: '2026-10-08T09:00:00Z', issue: 'pas_de_murs', etat: 'valide', enregistre: true, duree_s: 60,
      validation_ui: { depuis_fenetre: false, etapes: 4, vues: 2 }, mesure_ak: { propose_par_ak: true, corrige: true, issue: true }, annulations: 1 },
    { le: '2026-10-09T13:00:00Z', issue: 'pas_interesse', etat: 'a_valider' },
    { le: '2026-10-09T14:30:00Z', issue: 'repondeur', etat: 'a_valider' },
  ];
  const c = S.chiffres(appels, { maintenantD: MAINTENANT, sessions: [{ debut: '2026-10-09T08:00:00Z', fin: '2026-10-09T09:30:00Z' }] });
  assert.equal(c.appels, 5);
  assert.equal(c.aboutis, 3);
  assert.equal(c.joints_pct, 60);
  assert.equal(c.valides, 3);
  assert.equal(c.oublies, 1, "seul l'appel de plus d'une heure compte comme oublié");
  assert.equal(c.enregistres_pct, 67, "sur les appels mesurés seulement");
  assert.equal(c.duree_moyenne_s, 60);
  assert.equal(c.duree_totale_s, 180);
  assert.equal(c.temps_mode_appel_s, 5400);
  assert.equal(c.jours_actifs, 2);
  assert.equal(c.fenetre_pct, 50);
  assert.equal(c.etapes_vues_pct, 75);
  assert.equal(c.retirees, 1);
  assert.equal(c.sans_correction_pct, 50);
  assert.equal(c.issue_changee, 1);
  assert.equal(c.annulations, 1);
  assert.equal(c.mails_partis, 1);
  assert.equal(c.monday_ok, 1);
  assert.equal(c.biens, 1);
  assert.deepEqual(c.issues, { pas_de_reponse: 1, a_des_murs: 1, pas_de_murs: 1, pas_interesse: 1, repondeur: 1 });
});

test("sans appel, rien n'est divisé par zéro : les parts restent vides", () => {
  const c = S.chiffres([], { maintenantD: MAINTENANT });
  assert.equal(c.appels, 0);
  assert.equal(c.joints_pct, null);
  assert.equal(c.duree_moyenne_s, null);
  assert.equal(c.par_jour_actif, null);
});

test("le tableau complet : l'équipe entière même à zéro, l'essai à part, le journal du plus récent au plus ancien", () => {
  Records.create('AppelAgent', { le: '2026-10-09T08:00:00Z', par: 'jules.b@klocka.immo', issue: 'pas_de_murs', etat: 'valide', agence_id: 'a1', resume: 'Rien pour le moment.' });
  Records.create('AppelAgent', { le: '2026-10-09T10:00:00Z', par: 'jules.b@klocka.immo', issue: 'a_des_murs', etat: 'valide', source: 'relances', citations: { date: 'Rappelez-moi jeudi' } });
  Records.create('AppelAgent', { le: '2026-10-09T11:00:00Z', par: 'jules.b@klocka.immo', issue: 'repondeur', etat: 'valide', source: 'essai' });
  Records.create('AppelAgent', { le: '2026-08-01T11:00:00Z', par: 'jules.b@klocka.immo', issue: 'repondeur', etat: 'valide' });
  const s = S.suiviAppels({ jours: 30, maintenantD: MAINTENANT });
  assert.equal(s.equipe.appels, 2, "l'essai et l'appel hors période ne comptent pas");
  assert.ok(s.analystes.length >= 2, "les analystes sans appel sont listés");
  assert.equal(s.journal[0].source, 'relances');
  assert.equal(s.journal[0].citations[0].phrase, 'Rappelez-moi jeudi');
  assert.equal(s.journal[1].resume, 'Rien pour le moment.');
  assert.equal(s.par_jour.length, 30);
  assert.equal(S.suiviAppels({ jours: 30, source: 'essai', maintenantD: MAINTENANT }).equipe.appels, 1, "l'essai se voit quand on le demande");
});
