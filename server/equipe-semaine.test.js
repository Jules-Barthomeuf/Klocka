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

test('le point de chacun, le brouillon court, la relecture de Jules, l\'envoi le matin du retour', async () => {
  const JULES = { email: 'jules.b@klocka.immo' };
  const CORALIE = 'coralie.g@klocka.immo';
  Records.create('AppelAgent', { agent_id: 'a1', par: NORA, etat: 'valide', issue: 'a_des_murs', resume: 'Durand a deux murs à Antibes', le: '2026-10-20T09:00:00Z' });
  Records.create('Deal', { deal_id: 'd-1', nom: 'Murs Antibes', statut: 'analyse', suivi: [{ le: '2026-10-21T09:00:00Z', par: CORALIE, detail: 'Bail reçu' }] });
  Records.create('CerveauSource', { id: 'src-reu', type: 'compte_rendu', titre: 'Réunion : hebdo', date: '2026-10-20T08:00:00Z', contenu: '…' });
  Records.create('CerveauFait', { source_id: 'src-reu', type: 'decision', resume: 'On arrête Libourne', statut: 'valide' });
  // Ceux qui sont là écrivent leur point pour Maxime (absent du 19 au 23).
  assert.equal(S.contribuer({ email: NORA }, { pour: NORA, du: '2026-10-19', texte: 'x' }).ok, false);
  assert.equal(S.contribuer({ email: 'x@y.fr' }, { pour: MAXIME, du: '2026-10-19', texte: 'x' }).ok, false);
  S.contribuer({ email: NORA }, { pour: MAXIME, du: '2026-10-19', au: '2026-10-23', texte: 'J\'ai rappelé Durand.' });
  S.contribuer({ email: NORA }, { pour: MAXIME, du: '2026-10-19', au: '2026-10-23', texte: 'J\'ai rappelé Durand, deux murs à Antibes.' });
  assert.equal(S.contributionsPour(MAXIME, '2026-10-19').length, 1);
  const c = S.collecte({ du: '2026-10-19', au: '2026-10-23', pour: MAXIME });
  const nora = c.par_personne.find((p) => p.nom === 'Nora');
  assert.equal(nora.son_point, 'J\'ai rappelé Durand, deux murs à Antibes.');
  assert.equal(nora.appels_agents, 1);
  assert.deepEqual(c.par_personne.find((p) => p.nom === 'Coralie').dossiers, ['Murs Antibes']);
  assert.equal(c.reunions[0].faits[0].resume, 'On arrête Libourne');
  assert.ok(!c.par_personne.some((p) => p.nom === 'Maxime'));
  // Le brouillon, court, à partir de tout cela.
  const prompts = [];
  const invoke = async (prompt) => { prompts.push(prompt); return { objet: 'Ta semaine du 19 au 23 octobre', texte: 'Bon retour.\nCe que chacun a fait\n- Nora : Durand.' }; };
  const b = await S.ecrireBrouillon(MAXIME, { du: '2026-10-19', au: '2026-10-23' }, { invoke });
  assert.equal(b.retour.etat, 'brouillon');
  assert.match(prompts[0], /deux murs à Antibes/);
  assert.match(prompts[0], /On arrête Libourne/);
  assert.match(prompts[0], /250 mots/);
  // Jules corrige, valide avant le retour : rien ne part encore.
  S.corriger(b.retour.id, { texte: 'Bon retour Maxime.\nCe que chacun a fait\n- Nora a rappelé Durand.' });
  const envois = [];
  const envoyer = async (m) => { envois.push(m); return { success: true }; };
  const v = await S.valider(b.retour.id, JULES, { aujourdhui: '2026-10-23', envoyer });
  assert.equal(v.part_le, '2026-10-26');
  assert.equal(envois.length, 0);
  // Pendant ce temps, Maxime ne voit rien ; Jules voit qui a écrit et qui manque.
  const vueJules = await S.maSemaine(JULES, { aujourdhui: '2026-10-23', estJules: true });
  assert.deepEqual(vueJules.a_relire[0].manquent, ['Coralie', 'Jules']);
  assert.equal(vueJules.a_relire[0].retour.etat, 'valide');
  assert.equal((await S.maSemaine({ email: MAXIME }, { aujourdhui: '2026-10-23' })).retour, null);
  // Le lundi du retour, le tour l'envoie, une fois.
  const t = await S.tourDuMatin({ aujourdhui: '2026-10-26', invoke, envoyer });
  assert.deepEqual(t.fait, ['envoyé à Maxime']);
  assert.equal(envois[0].to, MAXIME);
  assert.equal(envois[0].from, 'jules.b@klocka.immo');
  assert.match(envois[0].body, /Nora a rappelé Durand/);
  assert.equal((await S.tourDuMatin({ aujourdhui: '2026-10-26', invoke, envoyer })).fait.length, 0);
  const vueMaxime = await S.maSemaine({ email: MAXIME }, { aujourdhui: '2026-10-26' });
  assert.match(vueMaxime.retour.texte, /Nora a rappelé Durand/);
  assert.equal((await S.ecrireBrouillon(MAXIME, { du: '2026-10-19', au: '2026-10-23' }, { invoke })).ok, false);
});

test('le tour du matin : le dernier jour d\'absence, les points demandés ; au retour sans validation, le brouillon et Jules prévenu', async () => {
  const invoke = async () => ({ objet: 'Ta semaine', texte: 'Bon retour.' });
  for (const j of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) S.poserAbsence({ email: NORA, jour: j, motif: 'conges' });
  S.contribuer({ email: MAXIME }, { pour: NORA, du: '2026-11-02', texte: 'Fait.' });
  const vendredi = await S.tourDuMatin({ aujourdhui: '2026-11-06', invoke });
  assert.deepEqual(vendredi.fait, ['points pour Nora']);
  const cles = Records.list('Notification').map((n) => n.cle);
  assert.ok(cles.includes(`semaine:point:${NORA}:2026-11-02:coralie.g@klocka.immo`));
  assert.ok(!cles.includes(`semaine:point:${NORA}:2026-11-02:${MAXIME}`)); // il a déjà écrit
  const lundi = await S.tourDuMatin({ aujourdhui: '2026-11-09', invoke });
  assert.deepEqual(lundi.fait, ['à relire pour Nora']);
  assert.equal(S.retourDe(NORA, '2026-11-02').etat, 'brouillon');
  assert.ok(Records.list('Notification').some((n) => n.cle === `semaine:relire:${NORA}:2026-11-02` && n.pour === 'jules.b@klocka.immo'));
  // Validé le lundi même : il part aussitôt.
  const envois = [];
  const v = await S.valider(S.retourDe(NORA, '2026-11-02').id, { email: 'jules.b@klocka.immo' }, { aujourdhui: '2026-11-09', envoyer: async (m) => { envois.push(m); return { success: true }; } });
  assert.equal(v.retour.etat, 'envoye');
  assert.equal(envois.length, 1);
});

test('une absence d\'un seul jour ne demande ni points ni résumé', async () => {
  S.poserAbsence({ email: 'coralie.g@klocka.immo', jour: '2026-11-12', motif: 'autre' });
  assert.deepEqual((await S.tourDuMatin({ aujourdhui: '2026-11-12', invoke: async () => ({}) })).fait, []);
  assert.deepEqual((await S.tourDuMatin({ aujourdhui: '2026-11-13', invoke: async () => ({}) })).fait, []);
  assert.equal(S.joursOuvres('2026-11-06', '2026-11-09'), 2);
});
