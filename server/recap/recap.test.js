// Le récap du matin (9 oct. 2026) : la lecture des sessions, le masquage des
// secrets, la période couverte, et le récap de bout en bout sans modèle ni mail.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-recap-'));
const C = await import('./collecte.js');
const R = await import('./recap.js');
const { Records } = await import('../db.js');

const MAINTENANT = new Date('2026-10-10T03:30:00Z');

test('les secrets sont masqués avant de partir vers le modèle', () => {
  const t = C.masquer('clé sk-ant-api03-abcdefghijklmnop, RESEND_API_KEY=re_123456789abcdef\n"mot_de_passe": "ecran-essai-2026" et eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc');
  assert.ok(!t.includes('abcdefghijklmnop'));
  assert.ok(!t.includes('re_123456789abcdef'));
  assert.ok(!t.includes('ecran-essai-2026'));
  assert.ok(!t.includes('eyJzdWIi'));
});

test("une session : les demandes de Jules et la dernière réponse avant la suivante, sans outils ni rappels", async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-sessions-'));
  const lignes = [
    { type: 'ai-title', aiTitle: 'Mode appel' },
    { type: 'user', timestamp: '2026-10-08T10:00:00Z', message: { content: 'trop ancienne' } },
    { type: 'user', timestamp: '2026-10-09T09:00:00Z', message: { content: [{ type: 'text', text: 'Refais la fenêtre des actions' }] } },
    { type: 'assistant', timestamp: '2026-10-09T09:01:00Z', message: { content: [{ type: 'text', text: 'Je regarde.' }, { type: 'tool_use', name: 'Read' }] } },
    { type: 'user', timestamp: '2026-10-09T09:01:01Z', message: { content: [{ type: 'tool_result', content: 'fichier' }] } },
    { type: 'user', timestamp: '2026-10-09T09:01:02Z', isMeta: true, message: { content: 'rappel système' } },
    { type: 'user', timestamp: '2026-10-09T09:01:03Z', message: { content: '<system-reminder>x</system-reminder>' } },
    { type: 'assistant', timestamp: '2026-10-09T09:05:00Z', message: { content: [{ type: 'text', text: 'Fait. Rien n\'est commité.' }] } },
    { type: 'assistant', timestamp: '2026-10-09T09:06:00Z', isSidechain: true, message: { content: [{ type: 'text', text: 'sous-agent' }] } },
    { type: 'attachment', timestamp: '2026-10-09T09:07:00Z', attachment: { type: 'queued_command', prompt: 'Et le fond transparent' } },
  ];
  fs.writeFileSync(path.join(dossier, 'abcdef12-3456.jsonl'), lignes.map((l) => JSON.stringify(l)).join('\n'));
  const s = await C.sessionsDepuis('2026-10-09T00:00:00Z', [dossier]);
  assert.equal(s.length, 1);
  assert.equal(s[0].session, 'abcdef12');
  assert.equal(s[0].titre, 'Mode appel');
  assert.deepEqual(s[0].tours.map((t) => t.demande), ['Refais la fenêtre des actions', 'Et le fond transparent']);
  assert.equal(s[0].tours[0].reponse, 'Fait. Rien n\'est commité.');
});

test('la période : depuis le dernier récap, au moins 24 h, jamais plus de 4 jours', () => {
  assert.equal(R.debutDuRecap(null, MAINTENANT), '2026-10-09T03:30:00.000Z');
  assert.equal(R.debutDuRecap('2026-10-09T03:30:00Z', MAINTENANT), '2026-10-09T03:30:00.000Z');
  assert.equal(R.debutDuRecap('2026-10-07T03:30:00Z', MAINTENANT), '2026-10-07T03:30:00.000Z');
  assert.equal(R.debutDuRecap('2026-09-01T03:30:00Z', MAINTENANT), '2026-10-06T03:30:00.000Z');
  assert.equal(R.debutDuRecap('2026-10-10T02:00:00Z', MAINTENANT), '2026-10-09T03:30:00.000Z');
});

test('les sources restent sous leur plafond', () => {
  const long = Array.from({ length: 2000 }, (_, i) => ({ i, texte: 'x'.repeat(100) }));
  assert.ok(R.sousPlafond(long, 10_000).length <= 10_001);
});

test('le récap de bout en bout : gardé, envoyé une fois par jour, et la liste brute si le modèle échoue', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-vide-'));
  const sources = { racine: dossier, dossierSessions: dossier, dossierMemoire: dossier };
  const mails = [];
  const envoyerMail = async (m) => { mails.push(m); return { ok: true }; };
  const contenu = { phrase: 'Pousse sur main.', a_finir: [{ quoi: 'Commiter le mode appel', prochaine_etape: 'lint, tests, build', source: 'git' }], decisions: [], hier: [{ fait: 'Récap', source: 'abc1234' }], diagnostic: [], idees: [], prompt_du_jour: 'Commite.' };
  const r = await R.faireLeRecap({ maintenantD: MAINTENANT, invoquer: async () => contenu, envoyerMail, ...sources });
  assert.equal(r.ok, true);
  assert.equal(mails.length, 1);
  assert.match(mails[0].vars.objet, /1 chose à finir/);
  assert.match(mails[0].vars.a_finir, /Commiter le mode appel/);
  assert.equal(mails[0].vars.decisions, 'Rien.');

  const encore = await R.faireLeRecap({ maintenantD: new Date('2026-10-10T06:00:00Z'), invoquer: async () => contenu, envoyerMail, ...sources });
  assert.equal(encore.deja, true);
  assert.equal(mails.length, 1);

  const panne = await R.faireLeRecap({ maintenantD: new Date('2026-10-11T03:30:00Z'), invoquer: async () => { throw new Error('modèle indisponible'); }, envoyerMail, ...sources });
  assert.equal(panne.ok, false);
  assert.equal(mails.length, 2);
  assert.match(mails[1].vars.resume, /modèle indisponible/);
  assert.equal(Records.list('RecapDuJour').length, 2);
});

test("à l'ouverture du Mac : rien avant 5 h, une fois par jour, au plus trois essais", async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-vide-'));
  const sources = { racine: dossier, dossierSessions: dossier, dossierMemoire: dossier };
  const contenu = { phrase: 'x', a_finir: [], decisions: [], hier: [], diagnostic: [], idees: [], prompt_du_jour: '' };
  const tot = await R.faireLeRecap({ matin: true, maintenantD: new Date('2026-10-20T02:00:00Z'), invoquer: async () => contenu, envoyerMail: async () => ({ ok: true }), ...sources });
  assert.equal(tot.attente, true);
  let n = 0;
  const rate = async () => { n += 1; return { ok: false, error: 'réseau' }; };
  for (let i = 0; i < 4; i += 1) await R.faireLeRecap({ matin: true, maintenantD: new Date(`2026-10-20T0${5 + i}:00:00Z`), invoquer: async () => contenu, envoyerMail: rate, ...sources });
  assert.equal(n, 3);
  const ok = await R.faireLeRecap({ matin: true, maintenantD: new Date('2026-10-21T06:00:00Z'), invoquer: async () => contenu, envoyerMail: async () => ({ ok: true }), ...sources });
  assert.equal(ok.ok, true);
  const encore = await R.faireLeRecap({ matin: true, maintenantD: new Date('2026-10-21T07:00:00Z'), invoquer: async () => contenu, envoyerMail: async () => ({ ok: true }), ...sources });
  assert.equal(encore.deja, true);
});

test("une session trop longue garde sa fin, là où elle s'est arrêtée", () => {
  const tours = Array.from({ length: 50 }, (_, i) => ({ le: `t${i}`, demande: `demande ${i} ${'x'.repeat(200)}`, reponse: null }));
  const [s] = C.sessionsSousBudget([{ session: 'abc', titre: 'T', tours }], 2000);
  assert.ok(s.tours.length < 50 && s.tours.length > 0);
  assert.equal(s.tours.at(-1).le, 't49');
  assert.equal(s.omises, 50 - s.tours.length);
});
