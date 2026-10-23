// Haka, compétence « transfert » (23 oct. 2026) : un collègue transfère un mail à sourcing@, Haka lit le transfert,
// trouve le dossier, range les pièces ou pré-analyse sans redemander, demande seulement quand il ne sait pas, et
// répond au collègue depuis sourcing@.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-transfert-'));
process.env.KLOCKA_DATA_DIR = dir;
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_FILE = '1';
process.env.HAKA_TRANSFERT = '1';
process.env.HAKA_SIMULER = '1';
const { Records } = await import('../db.js');
const T = await import('./taches.js');
const F = await import('./file.js');
const X = await import('./competences/transfert.js');

const nora = Records.create('User', { email: 'nora@klocka.immo', role: 'admin', full_name: 'Nora Lambert' });
const macon = Records.create('Deal', { deal_id: 'deal-macon', nom: 'Boulangerie Aux Délices - Mâcon', statut: 'documents_demandes', responsable_email: 'nora@klocka.immo', contact_agent_email: 'marc@agence.fr', documents_espace: [] });
Records.create('Deal', { deal_id: 'deal-nimes', nom: 'Cellule louée à une boulangerie · Nîmes', statut: 'analyse', contact_agent_email: 'paul@cabinet.fr', documents_espace: [] });
Records.create('Deal', { deal_id: 'deal-lyon', nom: 'Pharmacie du Centre - Lyon', statut: 'analyse', contact_agent_email: 'paul@cabinet.fr', documents_espace: [] });

const piece = (nom) => { const p = path.join(dir, nom); fs.writeFileSync(p, `%PDF ${nom}`); return { nom, mime: 'application/pdf', taille: 10, piece_id: `local:${p}` }; };
let n = 0;
const transfert = (champs = {}) => Records.create('MailRecu', { compte: 'sourcing@klocka.immo', gmail_message_id: `t${n += 1}`, de: 'Nora <nora@klocka.immo>', de_email: 'nora@klocka.immo', objet: 'TR: Documents', texte: '', date: new Date().toISOString(), interne: true, commande: true, pieces_jointes: [], ...champs });

test('lire un transfert : Gmail, Outlook, Apple Mail, ou un simple « TR: »', () => {
  const gmail = X.lireTransfert({ objet: 'Fwd: Bail Mâcon', texte: "Pour la data room de Mâcon stp\n\n---------- Forwarded message ---------\nDe : Marc Agent <marc@agence.fr>\nDate: mar. 21 oct. 2026 à 10:12\nSubject: Bail Mâcon\nTo: Nora <nora@klocka.immo>\n\nBonjour, voici le bail." });
  assert.equal(gmail.transfert, true);
  assert.equal(gmail.note, 'Pour la data room de Mâcon stp');
  assert.deepEqual(gmail.origine, { nom: 'Marc Agent', email: 'marc@agence.fr' });
  assert.equal(gmail.objet_origine, 'Bail Mâcon');
  const outlook = X.lireTransfert({ objet: 'TR: Fiche', texte: "À pré-analyser\n\n________________________________\nDe : Paul Cabinet <paul@cabinet.fr>\nEnvoyé : lundi 20 octobre 2026 09:00\nÀ : Nora\nObjet : Nouvelle fiche Nîmes\n" });
  assert.equal(outlook.origine.email, 'paul@cabinet.fr');
  assert.equal(outlook.objet_origine, 'Nouvelle fiche Nîmes');
  assert.equal(outlook.note, 'À pré-analyser');
  const apple = X.lireTransfert({ texte: 'Début du message réexpédié :\n\nDe: "Marc" <marc@agence.fr>\nObjet: Taxe foncière\n' });
  assert.equal(apple.origine.email, 'marc@agence.fr');
  const simple = X.lireTransfert({ objet: 'TR: plans', texte: 'ci-joint' });
  assert.equal(simple.transfert, true);
  assert.equal(simple.origine, null);
  assert.equal(simple.objet_origine, 'plans');
});

test('comprendre : la consigne du collègue, puis le dossier évident, sinon on demande', () => {
  const deals = Records.list('Deal');
  const lu = (note, origine = null, objet = '') => ({ note, origine: origine ? { email: origine } : null, objet_origine: objet });
  const v1 = X.dossiersVises(lu('', 'marc@agence.fr'), deals);
  assert.equal(v1[0].deal_id, 'deal-macon');
  assert.deepEqual(X.comprendre(lu('', 'marc@agence.fr'), { pieces: [{}], vises: v1 }), { intention: 'documents', dossier: 'deal-macon' });
  assert.equal(X.comprendre(lu('à pré-analyser'), { pieces: [{}], vises: v1 }).intention, 'fiche', 'la consigne prime');
  assert.equal(X.comprendre(lu('une question sur Mâcon'), { pieces: [] }).intention, 'demande', 'sans pièce : une demande');
  const v2 = X.dossiersVises(lu('', 'paul@cabinet.fr'), deals);
  const c2 = X.comprendre(lu('pour la data room', 'paul@cabinet.fr'), { pieces: [{}], vises: v2 });
  assert.equal(c2.dossier, undefined, 'deux dossiers du même agent : on demande');
  assert.deepEqual(c2.candidats.map((x) => x.deal_id).sort(), ['deal-lyon', 'deal-nimes']);
  const v3 = X.dossiersVises(lu('le bail de la pharmacie de Lyon', 'paul@cabinet.fr'), deals);
  assert.equal(X.comprendre(lu('le bail de la pharmacie de Lyon'), { pieces: [{}], vises: v3 }).dossier, 'deal-lyon', 'le nom dans la note départage');
  assert.equal(X.comprendre(lu(''), { pieces: [{}], fiches: [{}], vises: [] }).intention, 'fiche', 'une fiche sans dossier connu');
});

test('des pièces pour un dossier évident : rangées sans redemander, et Nora reçoit le compte rendu', async () => {
  const m = transfert({ objet: 'TR: Bail', texte: "---------- Forwarded message ---------\nDe : Marc Agent <marc@agence.fr>\nObjet : Bail\n\nVoici le bail.", pieces_jointes: [piece('bail-macon.pdf'), piece('taxe-fonciere.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const d = Records.findBy('Deal', 'deal_id', 'deal-macon');
  assert.deepEqual(d.documents_espace.map((x) => x.nom).sort(), ['bail-macon.pdf', 'taxe-fonciere.pdf']);
  assert.equal(Records.list('HakaProposition').filter((p) => p.charge?.mail_id === m.id).length, 0, 'pas de question : le transfert est la décision');
  const log = Records.list('EmailLog').find((e) => e.template_id === `haka-transfert:${m.id}`);
  assert.equal(log.to, 'nora@klocka.immo');
  assert.match(log.body, /^Bonjour Nora,\n\nC'est fait : 2 pièces dans la Data Room de « Boulangerie Aux Délices - Mâcon »/);
  assert.match(log.body, /\/Dossiers\?deal_id=deal-macon/);
  // Le même transfert relu ne refait rien.
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  assert.equal(Records.findBy('Deal', 'deal_id', 'deal-macon').documents_espace.length, 2);
  Records.update('Deal', macon.id, { documents_espace: [] });
});

test('plusieurs dossiers possibles : une question à Nora seule, puis les pièces vont où elle dit', async () => {
  const m = transfert({ objet: 'TR: Plans', texte: "pour la data room\n\n---------- Forwarded message ---------\nDe : Paul <paul@cabinet.fr>\nObjet : Plans\n", pieces_jointes: [piece('plans.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const p = Records.list('HakaProposition').find((x) => x.type === 'transfert_dossier' && x.charge?.mail_id === m.id);
  assert.ok(p);
  assert.equal(p.pour, 'nora@klocka.immo');
  assert.deepEqual(p.choix.map((c) => c.cle).sort(), ['deal-lyon', 'deal-nimes', 'fiche']);
  assert.deepEqual(Records.list('Notification').filter((x) => x.cle === `haka:${p.id}`).map((x) => x.pour), ['nora@klocka.immo']);
  assert.equal((await F.valider(p.id, nora, { choix: 'deal-nimes' })).ok, true);
  await T.tourner();
  assert.deepEqual(Records.findBy('Deal', 'deal_id', 'deal-nimes').documents_espace.map((x) => x.nom), ['plans.pdf']);
  assert.ok(Records.list('EmailLog').some((e) => e.template_id === `haka-transfert:${m.id}`));
});

test('le compte rendu dit ce qui a été fait, et seulement ça', () => {
  assert.match(X.compteRendu({ fait: 'fiche', deal_id: 'd1', nom: 'Tabac · Lille', verdict: 'GO' }, { prenom: 'Maxime', objet: 'TR: fiche' }).corps, /^Bonjour Maxime,\n\nC'est fait : le dossier « Tabac · Lille » est créé à votre nom et pré-analysé \(verdict : GO\)\./);
  assert.match(X.compteRendu({ fait: 'documents', deal_id: 'd1', nom: 'X', deposes: [], deja: ['bail.pdf'] }).corps, /étaient déjà dans la Data Room/);
  assert.equal(X.compteRendu({ fait: 'rejoint', deal_id: 'd1', nom: 'X' }, { objet: 'TR: fiche' }).objet, 'Re: TR: fiche');
});
