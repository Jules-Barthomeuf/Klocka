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
  assert.match(t, /^Votre transfert « 4 actifs Montpellier » :/);
  assert.match(t, /2 biens repérés, en Mémoire :\n1\. 1218 avenue du Père Soulas, Montpellier, 1,07 M€\n2\. 40 avenue du Pont Juvénal, Montpellier, loyer 45 k€/);
  assert.match(t, /Déjà en Mémoire \(un renvoi\) : 65 route de Lavérune/);
  assert.match(t, /Non lu : plan\.pdf : illisible\./);
  assert.match(t, /Je n'ouvre pas les liens : WeTransfer/);
  assert.match(t, /« c'était 2 »/);
  // Un lien seul : pas de « Aucune fiche à lire », le lien le dit.
  const seul = C.texteDuCompteRendu({ objet: 'TR: dossier', r: { fait: 'memoire', biens: [], erreurs: ['Aucune fiche à lire dans ce transfert.'] }, liens: [{ url: 'https://we.tl/t-y', service: 'WeTransfer' }] });
  assert.doesNotMatch(seul, /Aucune fiche à lire/);
  assert.match(seul, /je n'ai repéré aucun bien\./);
});

test('posé sur le mail, montré une fois à celui qui a transféré, puis corrigé depuis le chat', async () => {
  const m = Records.create('MailRecu', { compte: 'sourcing@klocka.immo', de_email: 'maxime.p@klocka.immo', interne: true, objet: 'TR: Murs Foch', date: new Date().toISOString(), texte: 'Murs https://we.tl/t-z' });
  C.poserCompteRendu(m, { pour: 'Maxime.P@klocka.immo', r: { fait: 'memoire', biens: [{ nom: '12 rue Foch, Montpellier', prix: 380000 }], deja_biens: [], erreurs: [] } });
  const a = C.comptesRendusPour('maxime.p@klocka.immo');
  assert.equal(a.length, 1);
  assert.match(a[0].texte, /1 bien repéré[\s\S]*WeTransfer/);
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
  assert.match(Records.get('MailRecu', fait.id).compte_rendu.texte, /« Murs Foch »[\s\S]*1\. 3 rue Foch, Montpellier, 250 k€/);
  assert.equal(Records.get('MailRecu', enCours.id).compte_rendu, undefined);
  assert.equal(Records.get('MailRecu', vieux.id).compte_rendu, undefined);
  assert.equal(C.rattraperComptesRendus(), 0, 'rejouer ne double rien');
});
