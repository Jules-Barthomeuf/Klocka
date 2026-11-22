// La note libre, les messages, les profils et l'import des fiches (22 nov. 2026, Jules : les notes de Maxime, puis
// « que la version en ligne soit au maximum faite »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-import-fiches-'));
const { Records } = await import('../db.js');
const M = await import('./modele.js');
const { normaliser, proposer, consigne } = await import('./ranger.js');
const I = await import('./import.js');

const maxime = { email: 'maxime.p@klocka.immo', role: 'admin' };
Records.create('Deal', { deal_id: 'd-teulere', nom: '15 rue Teulère Bordeaux', statut: 'analyse', lots: [], responsables: ['nora.l@klocka.immo'] });
Records.create('Deal', { deal_id: 'd-barry', nom: 'Comtesse du Barry', statut: 'projet_cree', lots: [] });
Records.create('Deal', { deal_id: 'd-vieux', nom: 'Vieux dossier', statut: 'abandonne', lots: [], suivi: [{ le: '2026-09-01T10:00:00Z', vers: 'abandonne', detail: 'Abandon : rendement trop bas' }] });
const robic = Records.create('AgentImmo', { nom: 'Sébastien Robic', agence: 'Immobilier pro', ville: 'Lorient' });
Records.create('AppelAgent', { agent_id: robic.id, par: 'jules.b@klocka.immo', le: '2026-11-19T14:00:00Z', resume: "Très ouvert à travailler avec Klocka, doit envoyer l'offre MACSF contresignée.", biens: ['MACSF Lorient'] });
const teulere = M.lienPropre({ cle: 'deal:d-teulere' });
const barry = M.lienPropre({ cle: 'deal:d-barry' });

test('la note libre : seules les fiches devinées dont un morceau parle restent liées', () => {
  const brut = { nature: 'note', titre: 'Teulère et un bloc sans dossier', fiches: [{ lien: 'L1', elements: [{ genre: 'maj', texte: 'Le Taster partirait entre 280 et 300 k€.' }] }], actions: [{ genre: 'tache', titre: 'Vérifier la LOI avant de la montrer à Paul', qui: 'moi' }], questions: [{ texte: 'Le droit d\'entrée de 30 k€ : c\'est quel bien ?' }], mentions: [] };
  const p = normaliser(brut, [teulere, barry], { libre: true });
  assert.deepEqual(p.liens_utiles, ['deal:d-teulere']);
  // Une action sans lien dit ne touche aucune fiche devinée (pas tous les biens).
  assert.deepEqual(p.actions[0].fiches, []);
  assert.equal(p.questions.length, 1);
});

test('les messages : celui de l\'auteur reste le sien, mot pour mot ; une action qui conditionne une étape garde « avant »', () => {
  const brut = { nature: 'note', titre: 'Point', fiches: [], questions: [], mentions: [], actions: [
    { genre: 'whatsapp', titre: 'Envoyer le point au groupe', qui: 'assistant', brouillon: { canal: 'whatsapp', texte: 'Bonjour à tous, voici un point sur Comtesse du Barry.', de_l_auteur: true } },
    { genre: 'appel', titre: 'Rappeler Matis pour les PV d\'AG', qui: 'moi', avant: 'la signature de la LOI de Tony Pitiot' },
  ], regles: [{ texte: 'Lors de la prospection, demander le contexte de la vente', portee: 'prospection' }] };
  const p = normaliser(brut, [barry]);
  assert.equal(p.actions[0].qui, 'moi');
  assert.equal(p.actions[0].brouillon.de_l_auteur, true);
  assert.equal(p.actions[0].brouillon.texte, 'Bonjour à tous, voici un point sur Comtesse du Barry.');
  assert.equal(p.actions[1].avant, 'la signature de la LOI de Tony Pitiot');
  assert.equal(p.regles[0].portee, 'prospection');
});

test('une source passée : ni action ni question, datée de son jour, et la consigne le dit', () => {
  const brut = { nature: 'demande', titre: 'Récap', fiches: [{ lien: 'L1', elements: [{ genre: 'maj', texte: 'Selon l\'agent, il faudrait qu\'il parte entre 280 et 300 k€.' }] }], actions: [{ genre: 'appel', titre: 'Relancer Sougiron', qui: 'moi' }], questions: [{ texte: 'Quel bien ?' }], mentions: [] };
  const p = normaliser(brut, [teulere], { source: { genre: 'google_chat', le: '2026-10-30T17:09:00Z' } });
  assert.equal(p.nature, 'note');
  assert.equal(p.actions.length, 0);
  assert.equal(p.questions.length, 0);
  const c = consigne('Relance Sougiron', [teulere], maxime, { source: { genre: 'google_chat', de: 'Nora LORINQUER', le: '2026-10-30T17:09:00Z', lieu: 'Google Chat' } });
  assert.match(c, /un message de Nora LORINQUER du 30 octobre 2026/);
  assert.match(c, /ne sont pas des actions/);
  assert.match(c, /ecart/);
});

test('l\'import range sans OK, marque « importé », la fiche attend son analyste ; OK fait tomber l\'étiquette ; relancer ne double rien', async () => {
  const lire = async () => ({ nature: 'note', titre: 'Teulère', fiches: [{ lien: 'L1', elements: [{ genre: 'evenement', texte: "L'agent a transmis les documents du Taster" }, { genre: 'negociation', texte: 'Le Taster partirait entre 280 et 300 k€ selon l\'agent.' }], resume: 'Le Taster, 15 rue Teulère à Bordeaux.' }], actions: [], questions: [], mentions: [] });
  const r = await I.importerTexte({ texte: 'Le Taster est négociable…', liens: [teulere], source: { genre: 'google_chat', de: 'Nora', le: '2026-10-30T17:09:00Z' }, cle: 'gchat:spaces/x/messages/1' }, maxime, { lire });
  assert.equal(r.ok, true);
  assert.equal(r.entrees, 2);
  const entrees = Records.filter('EntreeDossier', { fiche_cle: 'deal:d-teulere' });
  assert.ok(entrees.every((e) => e.importe && e.le.startsWith('2026-10-30')), 'datées du récap, marquées importées');
  const f = Records.findBy('FicheDossier', 'cle', 'deal:d-teulere');
  assert.equal(f.a_relire, true);
  assert.equal(f.a_relire_par, 'nora.l@klocka.immo');
  assert.equal(M.aRelire({ email: 'nora.l@klocka.immo' })[0].a_moi, true);
  assert.equal(M.ficheVue('deal:d-teulere').a_relire, true);
  const deja = await I.importerTexte({ texte: 'Le Taster est négociable…', liens: [teulere], source: { genre: 'google_chat', le: '2026-10-30T17:09:00Z' }, cle: 'gchat:spaces/x/messages/1' }, maxime, { lire });
  assert.equal(deja.deja, true);
  const v = M.validerFiche('deal:d-teulere', { email: 'nora.l@klocka.immo' });
  assert.equal(v.lignes, 2);
  assert.ok(Records.filter('EntreeDossier', { fiche_cle: 'deal:d-teulere' }).every((e) => !e.importe));
  assert.equal(M.aRelire({ email: 'nora.l@klocka.immo' }).length, 0);
});

test('un message envoyé entre dans l\'historique avec ce qu\'il dit ; la retouche apprend le style', () => {
  const a = Records.create('ActionDossier', { titre: 'Répondre à Adrien', genre: 'whatsapp', pour: 'Adrien Mina', qui: 'assistant', responsable: maxime.email, statut: 'ouverte', fiches: ['deal:d-barry'], brouillon: { canal: 'whatsapp', texte: 'Bonjour Adrien, les frais passent à 10 400 € à cause des débours.' }, brouillon_initial: 'Bonjour Adrien, les frais passent à 10 400 € à cause des débours.' });
  const r = M.changerAction(a.id, { statut: 'faite', brouillon: 'Salut Adrien, les frais passent à 10 400 € : ce sont les débours du notaire.' }, maxime);
  assert.equal(r.ok, true);
  const e = Records.filter('EntreeDossier', { fiche_cle: 'deal:d-barry', genre: 'message' })[0];
  assert.match(e.texte, /^Message WhatsApp envoyé à Adrien Mina : « Salut Adrien/);
  const s = M.styleDe(maxime.email);
  assert.equal(s.envoyes[0].texte.startsWith('Salut Adrien'), true);
  assert.equal(s.retouches.length, 1);
  assert.match(consigne('réponds à Adrien', [barry], maxime, { style: s }), /Ce qu'il a changé dans tes brouillons/);
  // Rouvert : le message n'est plus dans l'historique, ni dans le style.
  M.changerAction(a.id, { statut: 'ouverte' }, maxime);
  assert.equal(Records.filter('EntreeDossier', { fiche_cle: 'deal:d-barry', genre: 'message' }).length, 0);
  assert.equal(M.styleDe(maxime.email), null);
});

test('le profil d\'une personne : « comment lui parler » sur sa fiche', async () => {
  Records.create('FicheDossier', { cle: 'twenty:clients:adrien', genre: 'client', nom: 'Adrien Mina', liees: [] });
  const client = M.lienPropre({ cle: 'twenty:clients:adrien', genre: 'client', nom: 'Adrien Mina' });
  assert.ok(client, 'le lien du client');
  const lire = async () => ({ nature: 'note', titre: 'Adrien', fiches: [{ lien: 'L1', elements: [{ genre: 'profil', texte: 'Banquier à la SG, raisonne en gestion du risque ; pas sur place.' }], comment_parler: 'Lui parler risque et garanties, chiffres à l\'appui ; tout par visio.' }], actions: [], questions: [], mentions: [] });
  const n = await proposer({ texte: 'Adrien : banquier SG…', liens: [client] }, maxime, { lire });
  M.rangerNote(Records.get('NoteDossier', n.note_id), {}, maxime);
  const v = M.ficheVue(client.cle);
  assert.match(v.comment_parler, /risque et garanties/);
  assert.equal(v.profils.length, 1);
});

test('le squelette : dossiers actifs résumés de la plateforme, l\'abandon garde sa raison, l\'agent son dernier appel', () => {
  const c = I.squelette();
  assert.ok(c.biens >= 1);
  assert.equal(Records.findBy('FicheDossier', 'cle', 'deal:d-vieux').etat, 'rendement trop bas');
  const ag = Records.findBy('FicheDossier', 'cle', `agent:${robic.id}`);
  assert.match(ag.resume, /Dernier appel le 19 novembre 2026 par Jules/);
  // Relancé : rien ne change.
  const d = I.squelette();
  assert.equal(d.biens + d.agents + d.abandons, 0);
});

test('les messages de Google Chat : regroupés par auteur tant qu\'ils se suivent', () => {
  const m = (nom, auteur, le, texte) => ({ nom, auteur: { affiche: auteur }, le, texte });
  const g = I.grouperMessages([
    m('a', 'Nora LORINQUER', '2026-10-30T17:09:00Z', 'Je viens de te transférer le mail de Franck Grassi, trois opportunités à Bordeaux…'),
    m('b', 'Nora LORINQUER', '2026-10-30T17:12:00Z', 'Point prospection : appelé Toulouse et Metz cette semaine, des gens intéressés.'),
    m('c', 'Jules', '2026-10-30T17:15:00Z', 'ok'),
    m('d', 'Nora LORINQUER', '2026-10-30T19:00:00Z', 'Pas de news du côté de Stephan coiffure, relance prévue la semaine prochaine.'),
  ]);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].noms, ['a', 'b']);
  assert.equal(g[1].noms[0], 'd');
});

test('le résumé d\'un bien tiré de son identité', () => {
  assert.equal(I.resumeDuBien({ activite: 'boulangerie', locataire: 'Martin', ville: 'Lorient', prix_lisible: '320 k€', loyer_lisible: '24 k€ par an', rendement_lisible: '7,5 %' }, 'X'),
    'Murs de boulangerie, loués à Martin à Lorient. Prix 320 k€, loyer 24 k€ par an, rendement 7,5 %.');
});

const EXPORT_MD = `# Exportation de la discussion WhatsApp: Investissement Kilian
Date d’exportation: 22 novembre 2026 à 08:03

---

## 2 septembre 2026

[15:11] **Vous:** Hello Kilian,
L'agent immobilier d'Orléans m'a recontacté.

[22:11] **+33 6 95 48 92 67:** Hello Jules
Ah c'est une bonne nouvelle

---

## 1 octobre 2026

[09:00] __Paul de Zulueta a ajouté Vous__

[16:53] **Paul de Zulueta:** [Document] Offre d'achat local.pdf

[16:54] **Paul de Zulueta:** [Message vocal]
`;

test('l\'export WhatsApp en Markdown : jours en titre, « Vous » est qui l\'a exporté, le titre du groupe gardé', async () => {
  const { lireConversation } = await import('../../src/lib/whatsapp.js');
  const c = lireConversation(EXPORT_MD, { vous: 'Jules Barthomeuf' });
  assert.equal(c.titre, 'Investissement Kilian');
  assert.equal(c.messages.length, 4, 'les lignes système ne sont pas des messages');
  assert.equal(c.messages[0].de, 'Jules Barthomeuf');
  assert.equal(c.messages[0].le, '2026-09-02T15:11:00.000Z');
  assert.match(c.messages[0].texte, /Orléans/);
  assert.equal(c.messages[2].texte, "[document : Offre d'achat local.pdf]");
  assert.equal(c.messages[3].texte, '[message vocal]');
  assert.equal(lireConversation(EXPORT_MD).messages[0].de, 'Vous', 'sans exportateur, « Vous » reste');
});

test('l\'import d\'un groupe : une lecture vide est relue, et une source restée vide n\'est pas « déjà lue »', async () => {
  let n = 0;
  const lire = async () => { n += 1; return n === 1 ? { nature: 'note', fiches: [], actions: [], questions: [], mentions: [] } : { nature: 'note', titre: 'Barry', fiches: [{ lien: 'L1', elements: [{ genre: 'maj', texte: 'Le vendeur attend la visite.' }] }], actions: [], questions: [], mentions: [] }; };
  const r = await I.importerTexte({ texte: 'Groupe WhatsApp « Barry »', conversation: EXPORT_MD, liens: [barry], source: { genre: 'whatsapp', le: '2026-10-01T16:54:00Z' }, cle: 'wa:essai-vide' }, maxime, { lire });
  assert.equal(n, 2);
  assert.equal(r.entrees, 1);
  const toujoursVide = async () => ({ nature: 'note', fiches: [], actions: [], questions: [], mentions: [] });
  await I.importerTexte({ texte: 'Rien', source: { genre: 'texte', le: '2026-10-01T10:00:00Z' }, liens: [barry], cle: 'texte:vide' }, maxime, { lire: toujoursVide });
  assert.equal(I.dejaImporte('texte:vide'), false);
  assert.equal(I.dejaImporte('wa:essai-vide'), true);
});

test('une étape écrite en phrase garde l\'étape habituelle, le reste passe dans l\'état', () => {
  const p = normaliser({ nature: 'note', fiches: [{ lien: 'L1', elements: [{ genre: 'maj', texte: 'La banque instruit.' }], etape: "Compromis en attente de l'accord de la banque" }], actions: [], questions: [], mentions: [] }, [teulere]);
  assert.equal(p.fiches[0].etape, 'Compromis');
  assert.equal(p.fiches[0].etat, "en attente de l'accord de la banque");
});
