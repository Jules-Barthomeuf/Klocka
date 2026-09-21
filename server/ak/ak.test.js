// AK : la lecture des messages du chat, la consigne, les outils, le texte
// des tâches finies. Tout sans réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ak-'));
process.env.AK_NOM = 'Assistant Klocka';
const { lireMessage, estPourAk, estDeAk, sansMention, mention } = await import('./chat.js');
const { CONSIGNE, consigne, OUTILS, decrireOutilsKdata, texteDeFin } = await import('./agent.js');

const brut = (texte, extra = {}) => ({
  name: 'spaces/AAA/messages/m1', createTime: '2026-09-21T10:00:00Z', text: texte, argumentText: texte.replace('@Assistant Klocka', ''),
  sender: { name: 'users/1', displayName: 'Jules Barthomeuf', type: 'HUMAN' }, thread: { name: 'spaces/AAA/threads/t1' },
  annotations: [{ type: 'USER_MENTION', userMention: { user: { name: 'users/999', displayName: 'Assistant Klocka', type: 'HUMAN' } } }],
  ...extra,
});

test('un message du chat se lit : qui, quoi, où, les mentions', () => {
  const m = lireMessage(brut('@Assistant Klocka crée le projet pour devred de firminy'));
  assert.equal(m.espace, 'spaces/AAA');
  assert.equal(m.fil, 'spaces/AAA/threads/t1');
  assert.equal(m.auteur.affiche, 'Jules Barthomeuf');
  assert.deepEqual(m.mentions, [{ nom: 'users/999', affiche: 'Assistant Klocka' }]);
  assert.equal(sansMention(m), 'crée le projet pour devred de firminy');
  assert.equal(mention(m.auteur), '<users/1>');
  assert.equal(mention({ affiche: 'Nora' }), 'Nora');
});

test("AK reconnaît ce qui lui est adressé, et ne se répond pas à lui-même", () => {
  const pourLui = lireMessage(brut('@Assistant Klocka fais la préz'));
  assert.equal(estPourAk(pourLui, { utilisateur: null }), true, 'par le nom de la mention');
  assert.equal(estPourAk(pourLui, { utilisateur: 'users/999' }), true, 'par son identifiant appris');
  const autre = lireMessage(brut('@Nora tu as fini ?', { annotations: [{ type: 'USER_MENTION', userMention: { user: { name: 'users/5', displayName: 'Nora' } } }] }));
  assert.equal(estPourAk(autre, { utilisateur: 'users/999' }), false);
  assert.equal(estPourAk(autre, { utilisateur: null, direct: true }), true, 'un message privé lui parle toujours');
  const texteSeul = lireMessage(brut('@Assistant Klocka ok', { annotations: [] }));
  assert.equal(estPourAk(texteSeul, { utilisateur: null }), true, 'la mention en texte suffit');
  const deLui = lireMessage(brut("c'est bon c'est fait", { sender: { name: 'users/999', displayName: 'Assistant Klocka', type: 'HUMAN' }, annotations: [] }));
  assert.equal(estDeAk(deLui, { utilisateur: null }), true);
  assert.equal(estPourAk(deLui, { utilisateur: 'users/999', direct: true }), false, 'même en privé');
});

test("la consigne est le document de Jules, mot pour mot, puis le cadre de la plateforme", () => {
  assert.match(CONSIGNE, /^PERSONNALITÉ ET REGLES DE COMMUNICATION DE L'AGENT AK/);
  assert.match(CONSIGNE, /"préz bancaire" \(jamais "présentation bancaire"\)/);
  assert.match(CONSIGNE, /Non je suis en train de faire autre chose rappelle-moi plus tard/);
  const c = consigne();
  assert.ok(c.startsWith(CONSIGNE));
  assert.match(c, /tu ne l'envoies jamais/);
});

test("les outils d'AK : ceux de l'assistant sans l'envoi de mail, plus les siens", () => {
  const noms = OUTILS.map((o) => o.name);
  for (const n of ['chercher_dossier', 'chercher_projet', 'creer_projet_depuis_dossier', 'outils_kdata', 'lancer_kdata', 'generer_prez_bancaire', 'taches_en_cours', 'pousser_projet_monday']) assert.ok(noms.includes(n), n);
  assert.ok(!noms.includes('envoyer_mail'), 'décidé : AK n\'envoie pas de mail');
  assert.equal(new Set(noms).size, noms.length, 'aucun doublon');
  const kd = decrireOutilsKdata();
  assert.ok(kd.length >= 8);
  const zoning = kd.find((x) => x.outil === 'kzoning');
  assert.equal(zoning.nom, 'K-Zoning');
  assert.equal(zoning.questions[0].cle, 'rayon_m');
  assert.ok(zoning.questions[0].options.includes(500));
  const estimation = kd.find((x) => x.outil === 'kestimation');
  assert.ok(estimation.questions.every((q) => q.cle === 'activite'), 'le formulaire de valorisation reste sur la page');
});

test("le mot de la fin d'une tâche dit ce qui a marché, ce qui a raté, et où c'est", () => {
  const t = texteDeFin({ genre: 'kdata', libelle: 'K-Data sur 12 rue X : K-Zoning, K-Expertise', deal_id: 'D1', analyses: [
    { outil: 'kzoning', nom_outil: 'K-Zoning', etat: 'terminee', resume: 'zone de 500 m posée, à lire', ref: { id: 'z1' } },
    { outil: 'kexpertise', nom_outil: 'K-Expertise', etat: 'echec', erreur: 'adresse introuvable' },
  ] });
  assert.match(t, /^c'est bon, K-Data sur 12 rue X/);
  assert.match(t, /rangé dans le dossier/);
  assert.match(t, /K-Zoning : zone de 500 m posée, à lire .*\/kzoning\?zone=z1/);
  assert.match(t, /K-Expertise : raté \(adresse introuvable\)/);
  assert.match(texteDeFin({ genre: 'prez', libelle: 'préz bancaire de Devred', resultat: { slides: 'https://docs.google.com/x' } }), /sur le Drive : https:\/\/docs\.google\.com\/x/);
  assert.match(texteDeFin({ genre: 'prez', libelle: 'préz bancaire de Devred', resultat: { slides: null, pptx: 'http://k/p.pptx', erreur_drive: 'pas de Drive' } }), /prête ici : http:\/\/k\/p\.pptx \(le Drive a refusé : pas de Drive\)/);
});
