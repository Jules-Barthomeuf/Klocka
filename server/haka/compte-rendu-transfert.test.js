// Le compte rendu d'un transfert dans le chat de l'assistant, et sa correction (23 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-compte-rendu-'));
const { Records } = await import('../db.js');
const C = await import('./compte-rendu-transfert.js');

test('les liens de partage sont repérés, un par adresse', () => {
  const l = C.liensNonLus('Voici le dossier : https://we.tl/t-AbC123. Et le plan https://drive.google.com/file/d/xyz/view, encore https://we.tl/t-AbC123');
  assert.deepEqual(l.map((x) => x.service), ['WeTransfer', 'Google Drive']);
  assert.equal(l[0].url, 'https://we.tl/t-AbC123');
});

test("l'historique cité est coupé : le mail d'origine reste, les réponses plus anciennes et les lignes « > » partent", () => {
  const texte = [
    'Pour info',
    '---------- Message transféré ---------',
    'De : Paul <paul@cabinet.fr>',
    'Date : 20 nov. 2026',
    'Objet : Murs Foch',
    '',
    'Murs à vendre 12 rue Foch, 380 000 €.',
    '',
    'Le 18 nov. 2026 à 10:02, Nora a écrit :',
    '> Vous avez des murs à Montpellier ?',
    '',
    'De : Paul <paul@cabinet.fr>',
    'Envoyé : 15 nov. 2026',
    'Murs à vendre 12 rue Foch, 380 000 €.',
  ].join('\n');
  const t = C.sansHistorique(texte);
  assert.match(t, /Murs à vendre 12 rue Foch/);
  assert.equal(t.match(/12 rue Foch/g).length, 1, 'une seule fois');
  assert.doesNotMatch(t, /Vous avez des murs/);
});

test('le texte du compte rendu : les biens, les renvois, le non lu, les liens, et comment corriger', () => {
  const t = C.texteDuCompteRendu({
    objet: 'TR: 4 actifs Montpellier',
    r: { fait: 'memoire', biens: [{ nom: '1218 avenue du Père Soulas, Montpellier', prix: 1070000 }, { nom: '40 avenue du Pont Juvénal, Montpellier', loyer: 44892 }], deja_biens: [{ nom: '65 route de Lavérune, Montpellier' }], erreurs: ['plan.pdf : illisible'] },
    liens: [{ url: 'https://we.tl/t-x', service: 'WeTransfer' }],
  });
  assert.match(t, /^J'ai lu votre transfert « 4 actifs Montpellier »\. J'y ai repéré 2 biens, rangés dans la Mémoire :\n\n- 1218 avenue du Père Soulas, Montpellier : 1,07 M€\n- 40 avenue du Pont Juvénal, Montpellier : loyer 45 k€ par an/);
  assert.match(t, /\n\nDéjà dans la Mémoire, c'est un renvoi : 65 route de Lavérune/);
  assert.match(t, /\n\nJe n'ai pas pu lire « plan\.pdf » : illisible\./);
  assert.match(t, /Je n'ouvre pas les liens de partage \(WeTransfer\)/);
  assert.match(t, /« c'était 5 »/);
  // Un lien seul : pas de « Aucune fiche à lire », le lien le dit.
  const seul = C.texteDuCompteRendu({ objet: 'TR: dossier', r: { fait: 'memoire', biens: [], erreurs: ['Aucune fiche à lire dans ce transfert.'] }, liens: [{ url: 'https://we.tl/t-y', service: 'WeTransfer' }] });
  assert.doesNotMatch(seul, /Aucune fiche à lire/);
  assert.match(seul, /Je n'y ai repéré aucun bien\./);
});

test('posé sur le mail, montré une fois à celui qui a transféré, puis corrigé depuis le chat', async () => {
  const m = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'maxime.p@klocka.immo', interne: true, objet: 'TR: Murs Foch', date: new Date().toISOString(), texte: 'Murs https://we.tl/t-z' });
  C.poserCompteRendu(m, { pour: 'Maxime.P@klocka.immo', r: { fait: 'memoire', biens: [{ nom: '12 rue Foch, Montpellier', prix: 380000 }], deja_biens: [], erreurs: [] } });
  const a = C.comptesRendusPour('maxime.p@klocka.immo');
  assert.equal(a.length, 1);
  assert.match(a[0].texte, /J'y ai repéré un bien[\s\S]*WeTransfer/);
  assert.equal(C.comptesRendusPour('nora.l@klocka.immo').length, 0, 'seulement pour lui');
  assert.equal(C.marquerVus('maxime.p@klocka.immo', [a[0].id]), 1);
  assert.equal(C.comptesRendusPour('maxime.p@klocka.immo').length, 0, 'vu une fois');
  const r = await C.corrigerTransfert({ nombre: 2, remarque: "c'était 2, il y a aussi le 14" }, { email: 'maxime.p@klocka.immo' });
  assert.equal(r.ok, true);
  assert.equal(r.retenu, '2 fiches');
  const apres = Records.get('MailRecu', m.id);
  assert.equal(apres.fiche_compte.biens, 2);
  assert.equal(apres.avis_fiche[0].texte, "c'était 2, il y a aussi le 14");
  assert.equal((await C.corrigerTransfert({ remarque: 'x', objet: 'Lyon' }, { email: 'maxime.p@klocka.immo' })).ok, false);
  assert.equal((await C.corrigerTransfert({ remarque: 'x' }, { email: 'nora.l@klocka.immo' })).ok, false);
});

test('le rattrapage : un transfert déjà traité sans compte rendu reçoit le sien, une fois ; un transfert sans résultat attend', () => {
  const b = Records.create('BienMemoire', { adresse: { rue: '3 rue Foch' }, ville: 'Montpellier', prix: 250000 });
  const fait = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, objet: 'TR: Murs Foch', date: new Date().toISOString(), memoire_ids: [b.id] });
  const enCours = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, objet: 'TR: autre', date: new Date().toISOString() });
  const vieux = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, objet: 'TR: vieux', date: '2026-01-01T00:00:00Z', memoire_ids: [b.id] });
  assert.equal(C.rattraperComptesRendus(), 1);
  assert.match(Records.get('MailRecu', fait.id).compte_rendu.texte, /« Murs Foch »[\s\S]*- 3 rue Foch, Montpellier : 250 k€/);
  assert.equal(Records.get('MailRecu', enCours.id).compte_rendu, undefined);
  assert.equal(Records.get('MailRecu', vieux.id).compte_rendu, undefined);
  assert.equal(C.rattraperComptesRendus(), 0, 'rejouer ne double rien');
});

test("le compte rendu devient une conversation de l'Historique, créée une fois, au nom du transfert", async () => {
  const user = Records.create('User', { email: 'coralie.g@klocka.immo', role: 'admin' });
  const m = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'coralie.g@klocka.immo', interne: true, objet: 'Fwd: Murs Lunel', date: new Date().toISOString() });
  C.poserCompteRendu(m, { pour: 'coralie.g@klocka.immo', r: { fait: 'memoire', biens: [{ nom: '2 place du Marché, Lunel', prix: 250000 }], deja_biens: [], erreurs: [] } });
  const [c] = await C.conversationsDesComptesRendus(user);
  assert.ok(c.conversation_id);
  const { lireConversation, listerConversations } = await import('../assistant-conversations.js');
  const conv = lireConversation(user, c.conversation_id);
  assert.equal(conv.titre, 'Transfert · Murs Lunel');
  // Le fil commence par le transfert, comme un message envoyé, puis la réponse de l'assistant.
  assert.equal(conv.messages[0].role, 'user');
  assert.match(conv.messages[0].contenu, /^Transfert à sourcing@ : « Murs Lunel »/);
  assert.equal(conv.messages[1].role, 'assistant');
  assert.match(conv.messages[1].contenu, /J'y ai repéré un bien/);
  const [bis] = await C.conversationsDesComptesRendus(user);
  assert.equal(bis.conversation_id, c.conversation_id, 'pas de seconde conversation');
  assert.equal(listerConversations(user).length, 1);
});

test("la pop-up : ouvrir rend la conversation ; la croix range le compte rendu dans « À faire », jusqu'à ce qu'on l'ouvre", async () => {
  const user = Records.create('User', { email: 'nora.l@klocka.immo', role: 'admin' });
  const m = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, objet: 'TR: Murs Sète', date: new Date().toISOString(), texte: 'voir https://we.tl/t-a' });
  C.poserCompteRendu(m, { pour: 'nora.l@klocka.immo', r: { fait: 'memoire', biens: [{ nom: 'Sète' }, { nom: 'Agde' }], deja_biens: [], erreurs: ['plan.pdf : illisible'] } });
  const c = (await C.conversationsDesComptesRendus(user)).find((x) => x.id === m.id);
  assert.equal(c.resume, '2 biens repérés · 1 pièce non lue · un lien non ouvert');
  assert.equal(c.objet, 'Murs Sète');
  assert.equal(C.gesteSurCompteRendu('nora.l@klocka.immo', m.id, 'plus_tard').ok, true);
  assert.ok(!C.comptesRendusPour('nora.l@klocka.immo').some((x) => x.id === m.id), 'plus de pop-up');
  const a = C.comptesRendusAFaire('nora.l@klocka.immo').find((x) => x.cr === m.id);
  assert.deepEqual([a.genre, a.cr, a.conversation_id], ['transfert', m.id, c.conversation_id]);
  const o = C.gesteSurCompteRendu('nora.l@klocka.immo', m.id, 'ouvrir');
  assert.equal(o.conversation_id, c.conversation_id);
  assert.ok(!C.comptesRendusAFaire('nora.l@klocka.immo').some((x) => x.cr === m.id), 'ouvert : sorti de « À faire »');
  assert.equal(C.gesteSurCompteRendu('maxime.p@klocka.immo', m.id, 'ouvrir').ok, false, 'seulement le sien');
});
