// Les appels sur la fiche de l'agent (27 nov. 2026, Jules : « une fois, on met tout à jour avec les appels ; ensuite, à
// chaque appel, ça met la fiche à jour »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-appels-fiche2-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const F = await import('./appels-fiche.js');
const I = await import('./import.js');

const jules = { email: 'jules.b@klocka.immo', role: 'admin' };

test("un appel où l'on a parlé se lit ; un répondeur, un essai, un enregistrement vide non", () => {
  assert.equal(F.appelParle({ agent_id: 'a', issue: 'a_des_murs', resume: 'Deux murs de pharmacie à Nice, il envoie la fiche demain.' }), true);
  assert.equal(F.appelParle({ agent_id: 'a', issue: 'repondeur', resume: 'Message laissé pour le rappeler la semaine prochaine.' }), false);
  assert.equal(F.appelParle({ agent_id: 'a', issue: 'a_des_murs', essai: true, resume: 'Deux murs de pharmacie à Nice, il envoie la fiche.' }), false);
  assert.equal(F.appelParle({ agent_id: 'a', issue: 'autre', resume: "L'agent n'a rien dit pendant cet échange : la transcription ne contient que des consignes internes." }), false);
});

test('les appels en un texte : du plus ancien au plus récent, les plus anciens perdent leur transcription quand c\'est trop long', () => {
  const long = 'mot '.repeat(1500);
  const appels = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `x${i}`, le: `2026-11-0${i}T09:00:00Z`, par: 'maxime.p@klocka.immo', issue: 'a_des_murs', resume: `Résumé ${i}`, transcription_gardee: long }));
  const t = F.texteDesAppels(appels.reverse(), 12000);
  assert.ok(t.length <= 12000);
  assert.ok(t.indexOf('Résumé 1') < t.indexOf('Résumé 6'));
  assert.match(t, /Le 6 novembre 2026, appel de Maxime \(A un bien intéressant\)/);
});

test("le rattrapage : une lecture par agent, le plus récemment appelé d'abord, chaque appel lu une fois, les lignes de Jules gardées", async () => {
  const vieux = Records.create('AgentImmo', { nom: 'Étienne Merel', agence: 'Merel Immobilier' });
  const recent = Records.create('AgentImmo', { nom: 'Jean Bozec', agence: 'Bozec Commerces' });
  Records.create('AppelAgent', { agent_id: vieux.id, par: 'maxime.p@klocka.immo', le: '2026-10-02T09:00:00Z', issue: 'pas_de_murs', resume: 'Rien en ce moment, il rappelle en janvier pour un local à Brest.' });
  const a1 = Records.create('AppelAgent', { agent_id: recent.id, par: 'nora.l@klocka.immo', le: '2026-11-20T09:00:00Z', issue: 'veut_mail', resume: 'Veut un mail de présentation avant de nous envoyer ses murs.' });
  const a2 = Records.create('AppelAgent', { agent_id: recent.id, par: 'maxime.p@klocka.immo', le: '2026-11-25T09:00:00Z', issue: 'a_des_murs', resume: 'Il a reçu le mail, il envoie deux murs occupés à Quimper.' });
  Records.create('AppelAgent', { agent_id: recent.id, par: 'maxime.p@klocka.immo', le: '2026-11-26T09:00:00Z', issue: 'repondeur', resume: 'Message laissé.' });
  assert.deepEqual(F.agentsARattraper(), [recent.id, vieux.id]);

  const cle = `agent:${recent.id}`;
  (await import('./modele.js')).fiche(cle, { genre: 'agent', nom: 'Jean Bozec' });
  const deJules = Records.create('EntreeDossier', { fiche_cle: cle, genre: 'ressenti', texte: 'Très réactif, préfère WhatsApp.', le: '2026-11-21T10:00:00Z' });
  const lire = async () => ({ nature: 'note', titre: 'Jean Bozec', fiches: [{ lien: 'L1', elements: [{ genre: 'evenement', texte: 'doublon de la ligne d\'appel' }, { genre: 'profil', texte: 'Veut un mail avant d\'envoyer quoi que ce soit.' }], resume: 'Agent chez Bozec Commerces, envoie deux murs occupés à Quimper.' }], actions: [], questions: [], mentions: [] });
  const r = await F.rangerAppelsSurFiche(recent.id, jules, { lire });
  assert.equal(r.ok, true);
  const lu = Records.get('NoteDossier', r.note_id).texte;
  assert.match(lu, /Veut un mail de présentation/);
  assert.match(lu, /deux murs occupés à Quimper/);
  assert.doesNotMatch(lu, /Message laissé/, 'le répondeur ne se lit pas');
  const f = Records.findBy('FicheDossier', 'cle', cle);
  assert.equal(f.resume, 'Agent chez Bozec Commerces, envoie deux murs occupés à Quimper.');
  const entrees = Records.filter('EntreeDossier', { fiche_cle: cle });
  assert.equal(entrees.filter((e) => e.appel_id).length, 3, 'une ligne datée par appel, répondeur compris');
  assert.equal(entrees.filter((e) => e.genre === 'evenement' && !e.appel_id).length, 0, "la lecture ne refait pas la ligne d'appel");
  assert.equal(Records.get('EntreeDossier', deJules.id).texte, 'Très réactif, préfère WhatsApp.');
  assert.ok(I.dejaImporte(`appel:${a1.id}`) && I.dejaImporte(`appel:${a2.id}`));
  assert.deepEqual(F.agentsARattraper(), [vieux.id]);
  assert.equal((await F.rangerAppelsSurFiche(recent.id, jules, { lire })).rien, true, 'relancé, rien à relire');
});
