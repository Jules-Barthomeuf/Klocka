// L'extension Klocka : le brouillon de réponse au fil lu à l'écran (server/fiche-dossier/repondre.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
// Une base à part : ces tests créent des messages envoyés, jamais dans la base de travail.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-extension-'));
const { brouillonDeReponse, consigneReponse } = await import('./repondre.js');

const user = { email: 'essai.extension@test.local', full_name: 'Essai Extension', role: 'admin' };
const FIL = '[10:51, 28/11/2026] Paul: Tu peux regarder la pharmacie de Lorient avant jeudi ?\n[10:52, 28/11/2026] Vous: Oui';

test("extension : la réponse WhatsApp suit ce qu'on veut dire, sans rien envoyer ni inventer", async () => {
  let prompt = '';
  const r = await brouillonDeReponse({ canal: 'whatsapp', titre: 'Paul', fil: FIL, demande: 'je regarde demain matin' }, user, { lire: async () => { prompt = 'lu'; return { texte: 'Je regarde ça demain matin — je te dis.' }; } });
  assert.equal(r.ok, true);
  assert.equal(prompt, 'lu');
  assert.equal(r.texte.includes('—'), false);
});

test('extension : un fil vide ou un canal inconnu sont refusés', async () => {
  assert.equal((await brouillonDeReponse({ canal: 'whatsapp', fil: '  ' }, user, { lire: async () => ({ texte: 'x' }) })).ok, false);
  assert.equal((await brouillonDeReponse({ canal: 'sms', fil: FIL }, user, { lire: async () => ({ texte: 'x' }) })).ok, false);
});

test('extension : la consigne du mail ne demande ni objet ni signature, et porte ce qu\'on sait des fiches', () => {
  const c = consigneReponse({ canal: 'mail', titre: 'Murs Lorient', fil: 'Bonjour…', demande: '', fiches: [{ nom: 'Pharmacie Lorient', genre: 'bien', contexte: { etape: 'Analyse', resume: 'Bail de 9 ans', actions_ouvertes: [] } }] });
  assert.match(c, /Pas de signature/);
  assert.match(c, /Pharmacie Lorient \(bien\), étape Analyse : Bail de 9 ans/);
});

test("extension : le registre est celui de l'auteur dans ses messages, pas celui de l'autre (28 nov. 2026, Jules)", async () => {
  const { registreDe, consigneRegistre } = await import('./repondre.js');
  const fil = "[10:50, 28/11/2026] Marc: Bonjour, pouvez-vous m'envoyer le bail ?\n[10:52, 28/11/2026] Vous: Salut Marc, je t'envoie ça ce soir, tu l'auras avant demain";
  assert.equal(registreDe(fil), 'tutoie');
  assert.match(consigneRegistre(fil), /tutoie-la aussi/);
  assert.equal(registreDe("[10:52, 28/11/2026] Vous: Bonjour, je vous envoie votre dossier"), 'vouvoie');
  assert.equal(registreDe('[10:50, 28/11/2026] Marc: Salut, tu as le bail ?'), null);
});

test("extension : dans Gmail, ses propres mails disent aussi le registre", async () => {
  const { registreDe } = await import('./repondre.js');
  assert.equal(registreDe("De : Loïc <l@a.fr>, 28 nov.\nBonjour Jules, vous confirmez ?\n\n---\n\nDe : Vous, 28 nov.\nSalut Loïc, je te confirme demain."), 'tutoie');
});

test("extension : un message envoyé après un brouillon est appris (brouillon et version envoyée), une seule fois", async () => {
  const { enregistrerEnvoi } = await import('./repondre.js');
  const { styleDe } = await import('./modele.js');
  const qui = { email: `apprend.${Date.now()}@test.local`, role: 'admin' };
  const r = enregistrerEnvoi({ canal: 'whatsapp', pour: 'Paul', texte: 'Salut Paul, je regarde ce soir', initial: 'Bonjour Paul, je regarde cela ce soir.' }, qui);
  assert.equal(r.ok, true);
  assert.equal(r.retouche, true);
  assert.equal(enregistrerEnvoi({ canal: 'whatsapp', pour: 'Paul', texte: 'Salut Paul, je regarde ce soir' }, qui).deja, true);
  const s = styleDe(qui.email);
  assert.equal(s.envoyes[0].texte, 'Salut Paul, je regarde ce soir');
  assert.equal(s.retouches[0].initial, 'Bonjour Paul, je regarde cela ce soir.');
  assert.equal(enregistrerEnvoi({ canal: 'sms', texte: 'x' }, qui).ok, false);
});

test("extension : la consigne reprend ses retouches, avant et après", async () => {
  const { lignesDeStyle } = await import('./repondre.js');
  const l = lignesDeStyle({ envoyes: [{ texte: 'Salut' }], retouches: [{ initial: 'Bonjour Monsieur', texte: 'Salut Marc' }] }).join('\n');
  assert.match(l, /Brouillon : Bonjour Monsieur\n {2}Envoyé : Salut Marc/);
});
