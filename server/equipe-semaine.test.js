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

test('la passation, puis le résumé pour ceux qui restent, puis le résumé du retour', async () => {
  Records.create('Deal', { deal_id: 'd-max', nom: 'Murs Antibes', statut: 'analyse', cree_par: MAXIME, suivi: [{ le: '2026-10-14T09:00:00Z', par: MAXIME, type: 'etape', detail: 'Analyse lancée' }, { le: '2026-10-21T09:00:00Z', par: NORA, type: 'statut', detail: 'Bail reçu' }] });
  Records.create('Deal', { deal_id: 'd-nora', nom: 'Boulangerie Nice', statut: 'analyse', cree_par: NORA, suivi: [{ le: '2026-10-22T09:00:00Z', par: NORA, type: 'decision', detail: 'Oui' }] });
  Records.create('CerveauSource', { id: 'src-reu', type: 'compte_rendu', titre: 'Réunion : hebdo', date: '2026-10-20T08:00:00Z', contenu: '…' });
  Records.create('CerveauFait', { source_id: 'src-reu', type: 'decision', resume: 'On arrête Libourne', statut: 'valide' });
  assert.equal(S.enregistrerPassation({ email: MAXIME }, { du: '2026-10-19', au: '2026-10-23' }).ok, false);
  const p = S.enregistrerPassation({ email: MAXIME }, { du: '2026-10-19', au: '2026-10-23', texte: 'J\'attends le bail d\'Antibes.', dossiers: [{ deal_id: 'd-max', nom: 'Murs Antibes', note: 'Relancer le notaire mardi' }, { deal_id: 'x', note: '' }] });
  assert.equal(p.passation.dossiers.length, 1);
  const prompts = [];
  const invoke = async (prompt) => { prompts.push(prompt); return { chapeau: 'Le bail est arrivé.', sections: [{ titre: 'Qui est là cette semaine', points: [{ texte: 'Tout le monde' }] }, { titre: 'Tes dossiers', points: [{ texte: 'Murs Antibes : bail reçu par Nora', deal_id: 'd-max' }] }] }; };
  const pass = await S.resumePassation(MAXIME, { du: '2026-10-19', au: '2026-10-23' }, { invoke, ctx: ctx() });
  assert.deepEqual(pass.pour.sort(), ['coralie.g@klocka.immo', 'jules.b@klocka.immo', NORA].sort());
  assert.match(prompts[0], /Relancer le notaire mardi/);
  const r = await S.resumeRetour(MAXIME, { du: '2026-10-19', au: '2026-10-23' }, { invoke, ctx: ctx(), aujourdhui: '2026-10-26' });
  assert.equal(r.sections[0].titre, 'Tes dossiers');
  assert.equal(r.sections[0].points[0].deal_id, 'd-max');
  assert.match(prompts[1], /Bail reçu/);
  assert.match(prompts[1], /On arrête Libourne/);
  assert.match(prompts[1], /J'attends le bail d'Antibes/);
  assert.match(prompts[1], /Boulangerie Nice/);
  // Écrit une fois : le deuxième appel rend le même.
  assert.equal((await S.resumeRetour(MAXIME, { du: '2026-10-19', au: '2026-10-23' }, { invoke, ctx: ctx() })).id, r.id);
  assert.equal(prompts.length, 2);
  // Une passation réécrite efface le résumé de ceux qui restent.
  S.enregistrerPassation({ email: MAXIME }, { du: '2026-10-19', au: '2026-10-23', texte: 'Finalement, Nora reprend Antibes.' });
  assert.equal(S.resumeDe('passation', MAXIME, '2026-10-19'), null);
});

test('le tour du matin : le lundi du retour, la veille du départ, le premier jour d\'absence', async () => {
  const invoke = async () => ({ chapeau: 'x', sections: [] });
  Records.list('AgendaAnalyste').forEach((a) => Records.delete('AgendaAnalyste', a.id));
  const veille = await S.tourDuMatin({ aujourdhui: '2026-10-16', invoke });
  assert.deepEqual(veille.fait, []); // la passation est déjà écrite
  const lundi = await S.tourDuMatin({ aujourdhui: '2026-10-19', invoke });
  assert.deepEqual(lundi.fait, ['passation Maxime']);
  const retour = await S.tourDuMatin({ aujourdhui: '2026-10-26', invoke });
  assert.deepEqual(retour.fait, ['retour Maxime']);
  const notes = Records.list('Notification').map((n) => n.cle);
  assert.ok(notes.includes(`semaine:retour:${MAXIME}:2026-10-19`));
  assert.ok(notes.includes(`semaine:passation:${MAXIME}:2026-10-19:${NORA}`));
  // Coralie part le mardi 3 nov. : prévenue le lundi 2.
  S.poserAbsence({ email: 'coralie.g@klocka.immo', jour: '2026-11-03', motif: 'conges' });
  assert.deepEqual((await S.tourDuMatin({ aujourdhui: '2026-11-02', invoke })).fait, ['départ Coralie']);
});
