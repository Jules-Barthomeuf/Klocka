// La semaine de l'équipe (16 oct. 2026) : présences, passation, résumés.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-semaine-'));
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('./db.js');
const S = await import('./equipe-semaine.js');

const MAXIME = 'maxime.p@klocka.immo';
const NORA = 'nora.l@klocka.immo';
// Maxime à l'école la semaine du 19 au 23 oct. 2026 (lundi à vendredi).
for (const j of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) S.poserAbsence({ email: MAXIME, jour: j, motif: 'ecole' }, 'jules.b@klocka.immo');
const ctx = () => ({ declarees: S.absencesDeclarees(), agenda: new Map() });

test('les jours : ouvrés, lundi, jour suivant', () => {
  assert.equal(S.estOuvre('2026-10-17'), false);
  assert.equal(S.estOuvre('2026-10-19'), true);
  assert.equal(S.lundiDe('2026-10-22'), '2026-10-19');
  assert.equal(S.plusJours('2026-10-31', 1), '2026-11-01');
});

test('une semaine d\'école : la période, la veille du départ, le lundi du retour', () => {
  assert.deepEqual(S.periodeAutour(MAXIME, '2026-10-21', ctx()), { du: '2026-10-19', au: '2026-10-23', motif: 'ecole' });
  assert.deepEqual(S.departApres(MAXIME, '2026-10-16', ctx()), { du: '2026-10-19', au: '2026-10-23', motif: 'ecole' });
  assert.equal(S.departApres(MAXIME, '2026-10-15', ctx()), null);
  assert.deepEqual(S.retourLe(MAXIME, '2026-10-26', ctx()), { du: '2026-10-19', au: '2026-10-23', motif: 'ecole' });
  assert.equal(S.retourLe(MAXIME, '2026-10-27', ctx()), null);
  assert.equal(S.retourLe(NORA, '2026-10-26', ctx()), null);
  assert.deepEqual(S.quiEstLa('2026-10-21', ctx()).la, ['Nora', 'Coralie', 'Jules']);
});

test('Jules retire un jour ; une personne hors équipe ou un motif inconnu sont refusés', () => {
  S.poserAbsence({ email: NORA, jour: '2026-10-28', motif: 'conges' });
  assert.equal(S.statutDuJour(NORA, '2026-10-28', ctx()).motif, 'conges');
  S.poserAbsence({ email: NORA, jour: '2026-10-28', motif: null });
  assert.equal(S.statutDuJour(NORA, '2026-10-28', ctx()).present, true);
  assert.equal(S.poserAbsence({ email: 'x@y.fr', jour: '2026-10-28' }).ok, false);
  assert.equal(S.poserAbsence({ email: NORA, jour: '2026-10-28', motif: 'plage' }).ok, false);
});

test('l\'agenda Google : journées entières d\'absence, fin exclue, motif deviné', () => {
  const j = S.joursDAgenda([{ summary: 'École', start: { date: '2026-11-02' }, end: { date: '2026-11-04' } }, { summary: 'Réunion', start: { dateTime: '2026-11-05T10:00:00+01:00' }, end: { dateTime: '2026-11-05T11:00:00+01:00' } }]);
  assert.deepEqual([...j.keys()], ['2026-11-02', '2026-11-03']);
  assert.equal(j.get('2026-11-02').motif, 'ecole');
  const agenda = new Map([[NORA, j]]);
  assert.equal(S.statutDuJour(NORA, '2026-11-03', { declarees: [], agenda }).source, 'agenda');
});

test('l\'agenda refusé par Google (API non activée) se dit, sans casser', async () => {
  Records.create('AgendaAnalyste', { owner_email: 'jules.b@klocka.immo' });
  const r = await S.lireAgendas('2026-11-02', '2026-11-06', { lire: async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Google Calendar API has not been used in project 1 before or it is disabled.' } }) }) });
  assert.equal(r.etat, 'api_desactivee');
});

test('Maxime clique sur le lundi du retour de Nora : son briefing, la réunion pré-remplie, lu par Nora ce jour-là', async () => {
  const CORALIE = 'coralie.g@klocka.immo';
  // Nora en congés du 2 au 6 novembre, de retour le lundi 9.
  for (const j of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) S.poserAbsence({ email: NORA, jour: j, motif: 'conges' });
  Records.create('CerveauSource', { id: 'src-reu', type: 'compte_rendu', titre: 'Réunion : hebdo', date: '2026-11-03T08:00:00Z', contenu: '…' });
  Records.create('CerveauFait', { source_id: 'src-reu', type: 'decision', resume: 'On arrête Libourne', statut: 'valide' });
  Records.create('CerveauFait', { source_id: 'src-reu', type: 'engagement', resume: 'Coralie rappelle Durand', echeance: '2026-11-10', statut: 'valide' });
  const prep = await S.preparerBriefing({ email: MAXIME }, '2026-11-09', { ctx: ctx() });
  assert.equal(prep.genre, 'retour');
  assert.deepEqual(prep.pour, [NORA]);
  assert.match(prep.questions.find((q) => q.cle === 'reunion').reponse, /Décidé : On arrête Libourne/);
  assert.match(prep.questions.find((q) => q.cle === 'reunion').reponse, /Engagement : Coralie rappelle Durand \(pour le 2026-11-10\)/);
  assert.equal((await S.enregistrerBriefing({ email: MAXIME }, { jour: '2026-11-09', pour: [], reponses: [{ cle: 'avance', reponse: 'x' }] })).ok, false);
  const r = await S.enregistrerBriefing({ email: MAXIME }, { jour: '2026-11-09', genre: 'retour', pour: [NORA], du: '2026-11-02', au: '2026-11-06', reponses: [{ cle: 'avance', reponse: 'Bail reçu sur Murs Antibes.' }, { cle: 'premier', reponse: 'Rappeler Durand.' }] }, { aujourdhui: '2026-11-05' });
  assert.equal(r.lu_le, '2026-11-09');
  // Pas encore lu : ni notification, ni dans son Agenda avant lundi.
  assert.ok(!Records.list('Notification').some((n) => n.cle === `agenda:briefing:${r.briefing.id}:${NORA}`));
  assert.equal(S.briefingsPour(NORA, '2026-11-06').length, 0);
  // Rouvert : le briefing déjà écrit revient.
  const re = await S.preparerBriefing({ email: MAXIME }, '2026-11-09', { ctx: ctx() });
  assert.equal(re.deja, true);
  assert.equal(re.questions.find((q) => q.cle === 'avance').reponse, 'Bail reçu sur Murs Antibes.');
  // Vendredi 6 (dernier jour) : Coralie et Jules sont invités, pas Maxime (déjà fait).
  const invoke = async (prompt) => { invoke.prompts.push(prompt); return { objet: 'Ta semaine du 2 au 6 novembre', texte: 'Bon retour.\nCe que chacun a fait\n- Maxime : bail reçu.' }; };
  invoke.prompts = [];
  await S.tourDuMatin({ aujourdhui: '2026-11-06', invoke });
  const cles = Records.list('Notification').map((n) => n.cle);
  assert.ok(cles.includes(`agenda:a-briefer:${NORA}:2026-11-02:${CORALIE}`));
  assert.ok(!cles.includes(`agenda:a-briefer:${NORA}:2026-11-02:${MAXIME}`));
  // Jules relit avant le retour : brouillon (avec le briefing de Maxime), validation, rien ne paraît encore.
  const b = await S.ecrireBrouillon(NORA, { du: '2026-11-02', au: '2026-11-06' }, { invoke });
  assert.match(invoke.prompts[0], /Bail reçu sur Murs Antibes/);
  assert.match(invoke.prompts[0], /On arrête Libourne/);
  const v = await S.valider(b.retour.id, { email: 'jules.b@klocka.immo' }, { aujourdhui: '2026-11-06' });
  assert.equal(v.parait_le, '2026-11-09');
  assert.equal((await S.monAgenda({ email: NORA }, { aujourdhui: '2026-11-06' })).retour, null);
  // Lundi 9 : le résumé paraît, le briefing de Maxime est annoncé ; rien par mail.
  const lundi = await S.tourDuMatin({ aujourdhui: '2026-11-09', invoke });
  assert.ok(lundi.fait.includes('briefing de Maxime'));
  assert.ok(lundi.fait.includes('publié pour Nora'));
  const vue = await S.monAgenda({ email: NORA }, { aujourdhui: '2026-11-09' });
  assert.equal(vue.retour.etat, 'publie');
  assert.equal(vue.briefings[0].de_nom, 'Maxime');
  assert.ok(Records.list('Notification').some((n) => n.cle === `agenda:briefing:${r.briefing.id}:${NORA}` && n.pour === NORA));
  assert.ok(!Records.list('EmailLog').length);
  // Un second tour le même jour ne refait rien.
  assert.deepEqual((await S.tourDuMatin({ aujourdhui: '2026-11-09', invoke })).fait, []);
});

test('Maxime part la semaine du 26 : le vendredi, il est invité à faire le brief à Nora ; ses dossiers pré-remplis', async () => {
  for (const j of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']) S.poserAbsence({ email: MAXIME, jour: j, motif: 'ecole' });
  Records.create('Deal', { deal_id: 'd-max2', nom: 'Murs Cannes', statut: 'analyse', cree_par: MAXIME, suivi: [{ le: '2026-11-10T09:00:00Z', par: MAXIME, detail: 'Analyse' }] });
  const vendredi = await S.tourDuMatin({ aujourdhui: '2026-11-13', invoke: async () => ({}) });
  assert.ok(vendredi.fait.includes('départ Maxime'));
  const n = Records.list('Notification').find((x) => x.cle === `agenda:depart:${MAXIME}:2026-11-16`);
  assert.match(n.titre, /fais le brief à Nora, Coralie/);
  const prep = await S.preparerBriefing({ email: MAXIME }, '2026-11-13', { ctx: ctx() });
  assert.equal(prep.genre, 'depart');
  assert.equal(prep.jour, '2026-11-16');
  assert.deepEqual(prep.pour.sort(), ['coralie.g@klocka.immo', 'jules.b@klocka.immo', NORA].sort());
  assert.match(prep.questions.find((q) => q.cle === 'dossiers').reponse, /- Murs Cannes : /);
  // Écrit le vendredi pour le lundi : Nora le lit lundi.
  const r = await S.enregistrerBriefing({ email: MAXIME }, { jour: prep.jour, genre: 'depart', pour: [NORA], reponses: [{ cle: 'dossiers', reponse: '- Murs Cannes : en analyse' }] }, { aujourdhui: '2026-11-13' });
  assert.equal(S.briefingsPour(NORA, '2026-11-13').filter((b) => b.id === r.briefing.id).length, 0);
  assert.equal(S.briefingsPour(NORA, '2026-11-16').filter((b) => b.id === r.briefing.id).length, 1);
  // Une fois écrit, plus d'invitation.
  assert.ok(!(await S.tourDuMatin({ aujourdhui: '2026-11-13', invoke: async () => ({}) })).fait.includes('départ Maxime'));
});

test('une absence d\'un seul jour ne demande ni points ni résumé', async () => {
  S.poserAbsence({ email: 'coralie.g@klocka.immo', jour: '2026-11-12', motif: 'autre' });
  assert.deepEqual((await S.tourDuMatin({ aujourdhui: '2026-11-12', invoke: async () => ({}) })).fait, []);
  assert.deepEqual((await S.tourDuMatin({ aujourdhui: '2026-11-13', invoke: async () => ({}) })).fait, []);
  assert.equal(S.joursOuvres('2026-11-06', '2026-11-09'), 2);
});
