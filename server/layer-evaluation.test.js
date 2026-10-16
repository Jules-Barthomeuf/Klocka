// Le Layer, phase 8 : le banc, l'exécution (rappel, citation correcte), la comparaison et la non-régression.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-evaluation-'));
const { Records } = await import('./db.js');
const E = await import('./layer-evaluation.js');

const src = Records.create('CerveauSource', { type: 'compte_rendu', titre: 'Comité', contenu: '…' });
const autre = Records.create('CerveauSource', { type: 'appel', titre: 'Appel', contenu: '…' });
const f1 = Records.create('CerveauFait', { source_id: src.id, statut: 'valide', type: 'decision', resume: 'On refuse Libourne : loyer trop haut' });
const f2 = Records.create('CerveauFait', { source_id: src.id, statut: 'valide', type: 'information', resume: 'Simon Sourigon exclut les restaurants' });
const f3 = Records.create('CerveauFait', { source_id: autre.id, statut: 'valide', type: 'engagement', resume: 'Durand rappelle jeudi' });

test('les citations d\'une réponse : la majorité des mots porteurs du fait s\'y retrouvent', () => {
  const r = "D'après l'Intelligence, le 7 octobre, on a refusé Libourne parce que le loyer était trop haut.";
  assert.deepEqual(E.faitsCites(r, [f1, f2, f3]), [f1.id]);
  assert.deepEqual(E.faitsCites('rien dans l\'Intelligence', [f1, f2]), []);
});

test('le banc : ajouter, modifier, retirer (gardée en base) ; une proposition garde les faits connus seulement', async () => {
  const a = E.ajouter({ question: 'Pourquoi a-t-on refusé Libourne ?', reponse_attendue: 'Loyer trop haut', faits_attendus: [f1.id], auteur: 'Jules@x' });
  assert.equal(a.question.auteur, 'jules@x');
  E.ajouter({ question: 'Qui exclut les restaurants ?', faits_attendus: [f2.id] });
  E.ajouter({ question: 'Qui rappelle jeudi ?', faits_attendus: [f3.id] });
  assert.equal(E.modifier(a.question.id, { reponse_attendue: 'Le loyer, trop haut pour un n°2' }).question.reponse_attendue, 'Le loyer, trop haut pour un n°2');
  const p = await E.proposerBanc({ n: 2, llm: async () => ({ questions: [{ question: 'Libourne ?', reponse_attendue: 'refusé', faits: [`#${f1.id}`, 'inconnu'] }, { question: 'Sans fait', reponse_attendue: 'x', faits: ['inconnu'] }] }) });
  assert.equal(p.questions.length, 1);
  assert.deepEqual(p.questions[0].faits_attendus, [f1.id]);
  assert.equal(p.questions[0].auteur, 'brouillon');
  E.retirer(p.questions[0].id);
  assert.equal(E.banc().length, 3);
  assert.equal(E.banc({ tous: true }).length, 4, 'retirée, mais gardée');
});

test('une exécution : rappel et citation correcte ; la comparaison des deux dernières ; la régression', async () => {
  // Version 1 : tout est retrouvé et bien cité.
  const parfait = async (q) => ({ faits: /Libourne/.test(q) ? [f1, f2] : /restaurants/.test(q) ? [f2] : [f3] });
  const repondre = async (prompt) => ({ reponse: 'ok', cites: [...prompt.matchAll(/#([0-9a-f-]{36})/g)].slice(0, 1).map((m) => m[1]) });
  const r1 = await E.executer({ version: 'v1', rechercher: parfait, repondre });
  assert.equal(r1.run.rappel, 1);
  assert.equal(r1.run.citation_ok, 1);
  // Version 2 : la question sur Durand ne retrouve plus son fait.
  const moins = async (q) => (/jeudi/.test(q) ? { faits: [f2] } : parfait(q));
  const r2 = await E.executer({ version: 'v2', rechercher: moins, repondre });
  assert.ok(Math.abs(r2.run.rappel - 2 / 3) < 0.01);
  const c = E.comparer();
  assert.equal(c.dernier.version, 'v2');
  assert.equal(c.precedent.version, 'v1');
  const durand = c.questions.find((x) => /jeudi/.test(x.question));
  assert.deepEqual([durand.rappel, durand.rappel_avant], [0, 1]);
  assert.equal(c.regression, true, 'le rappel a baissé : pas de mise en production');
  assert.equal(durand.citation_ok, false, 'un fait d\'une autre source n\'est pas une citation correcte');
});
