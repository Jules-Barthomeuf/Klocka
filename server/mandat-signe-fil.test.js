import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mandat-signe-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const P = await import('./mandataire-portes.js');
const F = await import('./fil-du-bien.js');
const C = await import('./assistant-conversations.js');
const u = { email: 'lea@kpartners.fr', role: 'mandataire' };
const attendre = () => new Promise((r) => setTimeout(r, 300));

test('« Mandat signé reçu » : la suite s’écrit dans le fil du bien', async () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: u.email, nom: 'SCI Test', commerce: 'Pharmacie' });
  const e = Records.create('EstimationMandataire', { mandataire_email: u.email, proprietaire_id: p.id, bien: 'Pharmacie' });
  const m = Records.create('MandatMandataire', { mandataire_email: u.email, bien: 'Pharmacie', statut: 'pret', estimation_id: e.id, questionnaire: { bien_occupe: true } });
  assert.equal(P.passerALaSuite(m.id, u).ok, true);
  await attendre();
  const fil = F.filDuBien(u, p.id);
  assert.equal(fil.messages.at(-2).contenu, 'Mandat signé reçu.');
  assert.match(fil.messages.at(-1).contenu, /^Mandat signé, bien joué ![\s\S]*Le locataire a un droit de préférence/);
});

test('un mandat sans fiche : la suite va dans sa propre conversation ; au dépôt à la main aussi', async () => {
  const m = Records.create('MandatMandataire', { mandataire_email: u.email, bien: 'Boulangerie', statut: 'pret', questionnaire: { bien_occupe: false } });
  assert.equal(P.deposerMandatSigne(m.id, { nom: 'signe.pdf', url: '/uploads/s.pdf' }, u).ok, true);
  await attendre();
  const cid = Records.get('MandatMandataire', m.id).conversation_id;
  assert.ok(cid, 'la conversation du mandat est née');
  const conv = C.lireConversation(u, cid, { espace: 'mandataire-mandat' });
  assert.match(conv.messages.at(-1).contenu, /^Mandat signé, bien joué !/);
  assert.doesNotMatch(conv.messages.at(-1).contenu, /locataire/, 'vendu libre');
});
