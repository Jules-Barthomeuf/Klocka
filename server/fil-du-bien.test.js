// Un fil par bien (1er nov. 2026, Jules) : la prospection, la Pré-visite, l'Avis de valeur et le Mandat d'un bien
// écrivent dans la même conversation, celle de sa fiche.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fil-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const C = await import('./assistant-conversations.js');
const F = await import('./fil-du-bien.js');
const A = await import('./mandataire-avis.js');

const MOI = { email: 'fil@kpartners.fr', role: 'mandataire' };
const p = Records.create('ProprietaireMandataire', { mandataire_email: MOI.email, commerce: 'Boulangerie Dupain', adresse: '19 rue de l’Exemple', ville: 'Cannes' });
const espace = F.espaceDuBien(p.id);

test("l'avis de valeur d'un bien s'écrit à la suite de ce qui s'est dit en prospectant, dans le même fil", async () => {
  const prospection = C.enregistrerConversation(MOI, { espace, messages: [
    { role: 'user', contenu: 'Je suis passé à la boulangerie, le propriétaire veut vendre dans deux ans.' },
    { role: 'assistant', contenu: 'Noté sur la fiche.' },
  ] });
  assert.equal(prospection.ok, true);
  const e = Records.create('EstimationMandataire', { mandataire_email: MOI.email, proprietaire_id: p.id, bien: 'Murs · Boulangerie Dupain', adresse: '19 rue de l’Exemple', statut: 'brouillon', questionnaire: { type_bien: 'murs_commerce' }, cree_le: new Date().toISOString() });
  const r = await A.conversationDeLEstimation(e.id, MOI);
  assert.equal(r.ok, true);
  assert.equal(r.conversation_id, prospection.id, 'pas de nouvelle conversation : le fil du bien');
  assert.equal(r.fil, p.id);
  const fil = C.lireConversation(MOI, prospection.id, { espace });
  assert.match(fil.messages[0].contenu, /deux ans/, 'le début de la prospection reste');
  assert.ok(fil.messages.length >= 4, "l'ouverture de l'avis s'ajoute à la suite");
  // Rouvert, il ne s'ajoute pas deux fois.
  const encore = await A.conversationDeLEstimation(e.id, MOI);
  assert.equal(encore.conversation_id, prospection.id);
  assert.equal(C.lireConversation(MOI, prospection.id, { espace }).messages.length, fil.messages.length);
  assert.equal(C.listerConversations(MOI, { espace }).length, 1, 'un seul fil');
});

test("le fil d'un bien garde bien plus que 80 messages", () => {
  const messages = Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', contenu: `message ${i}` }));
  const r = C.enregistrerConversation(MOI, { espace, messages });
  assert.equal(C.lireConversation(MOI, r.id, { espace }).messages.length, 300);
  const ailleurs = C.enregistrerConversation(MOI, { espace: 'mandataire', messages });
  assert.equal(C.lireConversation(MOI, ailleurs.id, { espace: 'mandataire' }).messages.length, 80, 'les autres chats gardent leur plafond');
});
