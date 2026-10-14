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

test('remettre à zéro : le suivi compte à partir de ce moment, rien ne s\'efface, « Tout afficher » revient en arrière', () => {
  const avant = new Date(MAINTENANT.getTime() - 3 * 3600000).toISOString();
  const apres = new Date(MAINTENANT.getTime() - 3600000).toISOString();
  Records.create('AppelAgent', { par: 'nora.l@klocka.immo', le: avant, issue: 'pas_de_reponse', etat: 'valide', agence_id: 'za', source: 'prospection' });
  Records.create('AppelAgent', { par: 'nora.l@klocka.immo', le: apres, issue: 'pas_de_murs', etat: 'valide', agence_id: 'zb', source: 'prospection' });
  const tout = S.suiviAppels({ jours: 7, maintenantD: MAINTENANT }).equipe.appels;
  S.remettreAZero('jules.b@klocka.immo', new Date(MAINTENANT.getTime() - 2 * 3600000));
  const r = S.suiviAppels({ jours: 7, maintenantD: MAINTENANT });
  assert.ok(r.equipe.appels >= 1 && r.equipe.appels < tout, "les appels d'avant la remise à zéro ne comptent plus, celui d'après oui");
  assert.equal(r.remise_a_zero.par, 'jules.b@klocka.immo');
  assert.equal(Records.list('AppelAgent').filter((x) => ['za', 'zb'].includes(x.agence_id)).length, 2, 'rien n\'est effacé');
  S.toutAfficher();
  assert.equal(S.suiviAppels({ jours: 7, maintenantD: MAINTENANT }).equipe.appels, tout);
});

test("les relances par mail ne comptent pas comme des appels : à part, et seules sous leur filtre", async () => {
  const S = await import('./suivi-appels.js');
  const le = new Date().toISOString();
  Records.create('AppelAgent', { agent_id: 'mail-1', par: 'nora.l@klocka.immo', le, valide_le: le, etat: 'valide', issue: 'relance_mail', canal: 'mail', source: 'relances_mail' });
  const tout = S.suiviAppels({ jours: 7 });
  assert.ok(tout.relances_mail >= 1);
  assert.ok(!tout.journal.some((x) => x.issue_cle === "relance_mail"), "pas dans le journal des appels");
  assert.ok(tout.sources.some((x) => x.cle === 'relances_mail' && x.libelle === 'Relances par mail'));
  const seules = S.suiviAppels({ jours: 7, source: 'relances_mail' });
  assert.ok(seules.equipe.appels >= 1 && seules.journal.every((x) => x.issue_cle === "relance_mail"));
});

test("le journal montre aussi les rappels entrants qui n'ont pas abouti à un appel, sans doublon des rappels validés", () => {
  const le = new Date().toISOString();
  const valide = Records.create('AppelAgent', { le, par: 'jules.b@klocka.immo', issue: 'rien_de_nouveau', etat: 'valide', source: 'rappel', rappel_entrant: true, agent: 'Agent A' });
  Records.create('RappelEntrant', { par: 'jules.b@klocka.immo', debut: le, etat: 'valide', appel_id: valide.id });
  const abandonne = Records.create('RappelEntrant', { par: 'jules.b@klocka.immo', debut: le, etat: 'abandonne', notes: 'Il rappelle pour le local de la rue Gambetta', duree_s: 95 });
  Records.create('RappelEntrant', { par: 'jules.b@klocka.immo', debut: le, etat: 'a_identifier', transcription: 'Bonjour, je vous rappelle', duree_s: 40 });

  const r = S.suiviAppels({ jours: 7 });
  const rappels = r.journal.filter((x) => x.source === 'rappel');
  assert.equal(rappels.length, 3, 'le rappel validé (par son appel), l\'abandonné et celui à identifier');
  assert.equal(rappels.filter((x) => x.rappel).length, 2, 'le rappel validé ne revient pas une seconde fois');
  const ab = r.journal.find((x) => x.id === `rappel:${abandonne.id}`);
  assert.equal(ab.issue, 'Rappel abandonné');
  assert.equal(ab.agence, 'Agent non identifié');
  assert.equal(ab.notes, 'Il rappelle pour le local de la rue Gambetta');
  assert.equal(ab.duree_s, 95);
  assert.equal(r.journal.find((x) => x.issue === 'Agent à identifier').transcription, 'Bonjour, je vous rappelle');
  // Filtré sur un autre mode, les rappels ne s'y glissent pas ; filtré sur le Rappel, ils y sont tous.
  assert.equal(S.suiviAppels({ jours: 7, source: 'prospection' }).journal.filter((x) => x.rappel).length, 0);
  assert.equal(S.suiviAppels({ jours: 7, source: 'rappel' }).journal.length, 3);
});

test("« Aujourd'hui » compte depuis minuit à Paris, pas sur vingt-quatre heures glissantes", () => {
  // 14 oct. 2026 à 9 h 30 à Paris (heure d'été, UTC+2) : minuit était à 22 h UTC la veille.
  assert.equal(S.minuitParis(new Date('2026-10-14T07:30:00Z')), '2026-10-13T22:00:00.000Z');
  // En hiver (UTC+1).
  assert.equal(S.minuitParis(new Date('2026-12-01T10:00:00Z')), '2026-11-30T23:00:00.000Z');
  const maintenantD = new Date('2026-10-14T07:30:00Z');
  Records.create('AppelAgent', { le: '2026-10-13T21:30:00Z', par: 'nora.l@klocka.immo', issue: 'pas_de_reponse', etat: 'valide', agence_id: 'a', jour_test: true });
  Records.create('AppelAgent', { le: '2026-10-14T06:00:00Z', par: 'nora.l@klocka.immo', issue: 'a_des_murs', etat: 'valide', agence_id: 'a', jour_test: true });
  const r = S.suiviAppels({ jours: 1, maintenantD });
  const nora = r.analystes.find((a) => a.email === 'nora.l@klocka.immo');
  assert.equal(nora.appels, 1, "l'appel de 23 h 30 la veille (heure de Paris) n'est pas d'aujourd'hui");
});

test('le post-appel moyen : la moyenne du raccrochage à la validation, sur les appels mesurés seulement', () => {
  const c = S.chiffres([
    { le: '2026-10-14T08:00:00Z', issue: 'a_des_murs', etat: 'valide', temps: { pret_ms: 4000, valide_ms: 30000 } },
    { le: '2026-10-14T09:00:00Z', issue: 'pas_de_murs', etat: 'valide', temps: { valide_ms: 90000, prepare_ms: 95000 } },
    { le: '2026-10-14T10:00:00Z', issue: 'repondeur', etat: 'valide' },
  ]);
  assert.equal(c.apres_appel.valide.moyenne_ms, 60000);
  assert.equal(c.apres_appel.valide.n, 2);
  assert.equal(c.apres_appel.prepare.moyenne_ms, 95000);
  assert.equal(S.chiffres([]).apres_appel.valide.moyenne_ms, null);
});

test('le post-appel moyen : la moyenne du raccrochage à la validation, sur les appels mesurés seulement', () => {
  const c = S.chiffres([
    { le: '2026-10-14T08:00:00Z', issue: 'a_des_murs', etat: 'valide', temps: { pret_ms: 4000, valide_ms: 30000 } },
    { le: '2026-10-14T09:00:00Z', issue: 'pas_de_murs', etat: 'valide', temps: { valide_ms: 90000, prepare_ms: 95000 } },
    { le: '2026-10-14T10:00:00Z', issue: 'repondeur', etat: 'valide' },
  ]);
  assert.equal(c.apres_appel.valide.moyenne_ms, 60000);
  assert.equal(c.apres_appel.valide.n, 2);
  assert.equal(c.apres_appel.prepare.moyenne_ms, 95000);
  assert.equal(S.chiffres([]).apres_appel.valide.moyenne_ms, null);
});

test('les graphiques : la carte jour × heure à Paris et la répartition des durées', () => {
  assert.equal(S.jourSemaineParis('2026-10-12T08:00:00Z'), 0, 'lundi');
  assert.equal(S.jourSemaineParis('2026-10-18T21:30:00Z'), 6, 'dimanche 23 h 30 à Paris');
  assert.equal(S.jourSemaineParis('2026-10-18T22:30:00Z'), 0, 'déjà lundi à Paris');
  const maintenantD = new Date('2026-10-14T12:00:00Z');
  Records.create('AppelAgent', { le: '2026-10-14T07:10:00Z', par: 'maxime.p@klocka.immo', issue: 'a_des_murs', etat: 'valide', agence_id: 'a', duree_s: 45 });
  Records.create('AppelAgent', { le: '2026-10-14T07:40:00Z', par: 'maxime.p@klocka.immo', issue: 'repondeur', etat: 'valide', agence_id: 'a', duree_s: 400 });
  const r = S.suiviAppels({ jours: 1, maintenantD });
  assert.equal(r.semaine.length, 7);
  assert.ok(r.semaine[2].heures[9] >= 2, 'mercredi, 9 h à Paris');
  assert.ok(r.durees.find((d) => d.mot === '30 s à 1 min').appels >= 1);
  assert.ok(r.durees.find((d) => d.mot === '5 à 10 min').appels >= 1);
  assert.ok(r.par_jour.at(-1).duree_moyenne_s > 0);
});
