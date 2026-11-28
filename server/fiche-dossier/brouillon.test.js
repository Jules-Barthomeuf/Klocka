// Le Brouillon (27 nov. 2026) : la page gardée par personne, et un message copié puis dit envoyé, qui entre dans
// l'historique de la fiche à l'accord et en ressort si on annule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-brouillon-'));
const { Records } = await import('../db.js');
const M = await import('./modele.js');
const B = await import('./brouillon.js');
const { proposer, DEJA_ENVOYE } = await import('./ranger.js');

const maxime = { email: 'maxime.p@klocka.immo', role: 'admin' };
const nora = { email: 'nora.l@klocka.immo', role: 'admin' };
const maintenant = new Date('2026-11-27T10:00:00');

test('Brouillon : chacun le sien, gardé tel quel, avec le dernier passage rangé', () => {
  assert.equal(B.lire(maxime).texte, '');
  B.ecrire(maxime, { texte: 'Bonjour Étienne,\nla fissure…' });
  B.ecrire(nora, { texte: 'Autre chose' });
  assert.equal(B.lire(maxime).texte, 'Bonjour Étienne,\nla fissure…');
  assert.equal(B.lire(nora).texte, 'Autre chose');
  B.ecrire(maxime, { texte: '', dernier_range: { texte: 'Bonjour Étienne', envoye: true } });
  assert.equal(B.lire(maxime).texte, '');
  assert.equal(B.lire(maxime).dernier_range.texte, 'Bonjour Étienne');
  B.ecrire(maxime, { texte: 'x', dernier_range: null });
  assert.equal(B.lire(maxime).dernier_range, null);
});

test('Brouillon : un message dit envoyé entre dans l\'historique au OK, et en sort à l\'annulation', async () => {
  Records.create('Deal', { deal_id: 'd-montauban', nom: 'Montauban', statut: 'analyse', lots: [] });
  const liens = [M.lienPropre({ cle: 'deal:d-montauban' })];
  const n = await proposer({ texte: 'Bonjour Étienne, on va regarder le pied d\'immeuble.', liens, envoye: true }, maxime, { maintenant, lire: async () => ({
    nature: 'note', titre: 'Montauban', questions: [], mentions: [],
    fiches: [{ lien: 'L1', elements: [{ genre: 'maj', texte: 'On regarde le pied d\'immeuble.' }] }],
    actions: [{ genre: 'whatsapp', titre: 'Écrire un message WhatsApp à Étienne', pour: 'Étienne', qui: 'moi', liens: ['L1'], brouillon: { canal: 'whatsapp', a: 'Étienne', texte: 'Bonjour Étienne, on va regarder le pied d\'immeuble.', de_l_auteur: true } }],
  }) });
  assert.ok(n.ok);
  assert.ok(Records.get('NoteDossier', n.note_id).envoye);
  assert.ok(Records.get('NoteDossier', n.note_id).texte.startsWith(DEJA_ENVOYE));
  const r = M.rangerNote(Records.get('NoteDossier', n.note_id), {}, maxime, { maintenant: () => maintenant });
  assert.equal(r.ok, true);
  const note = Records.get('NoteDossier', n.note_id);
  const action = Records.get('ActionDossier', note.creees.actions[0]);
  assert.equal(action.statut, 'faite');
  const messages = Records.filter('EntreeDossier', { fiche_cle: 'deal:d-montauban' }).filter((e) => e.genre === 'message');
  assert.equal(messages.length, 1);
  assert.match(messages[0].texte, /pied d'immeuble/);
  assert.equal(Records.filter('MessageEnvoye', { action_id: action.id }).length, 1);
  assert.equal(M.annulerNote(Records.get('NoteDossier', n.note_id), maxime).ok, true);
  assert.equal(Records.filter('EntreeDossier', { fiche_cle: 'deal:d-montauban' }).filter((e) => e.genre === 'message').length, 0);
  assert.equal(Records.filter('MessageEnvoye', { action_id: action.id }).length, 0);
});
