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
const notif = (m) => Records.list('Notification').find((x) => x.cle === `haka-transfert:${m.id}`);
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
  assert.equal(X.comprendre(lu(''), { pieces: [{}], fiches: [{}], vises: [] }).intention, 'memoire', 'une fiche transférée sans consigne : en Mémoire (17 nov. 2026)');
  // Des pièces sans dossier reconnu ni fiche (2 nov. 2026, Jules) : un nouveau dossier, sans demander.
  assert.deepEqual(X.comprendre(lu(''), { pieces: [{}], vises: [] }), { intention: 'nouveau' });
  assert.deepEqual(X.comprendre(lu('pour la data room'), { pieces: [{}], vises: [] }), { intention: 'nouveau' });
});

test('des pièces sans dossier reconnu : un nouveau dossier au nom de Nora, ses pièces dans la Data Room', async () => {
  const m = transfert({ objet: 'TR: Murs Tabac de la Gare - Vienne', texte: "---------- Forwarded message ---------\nDe : Julie <julie@notaire.fr>\nObjet : Murs Tabac de la Gare - Vienne\n\nCi-joint.", pieces_jointes: [piece('bail-vienne.pdf'), piece('quittances-vienne.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const d = Records.list('Deal').find((x) => x.source_mail?.mail_recu_id === m.id);
  assert.ok(d, 'le dossier est créé');
  assert.equal(d.nom, 'Murs Tabac de la Gare - Vienne');
  assert.equal(d.responsable_email, 'nora@klocka.immo');
  assert.equal(d.contact_agent_email, 'julie@notaire.fr');
  assert.deepEqual(d.documents_espace.map((x) => x.nom).sort(), ['bail-vienne.pdf', 'quittances-vienne.pdf']);
  assert.equal(Records.list('HakaProposition').filter((p) => p.charge?.mail_id === m.id).length, 0, 'pas de question');
  // Le compte rendu, dans le chat de Nora (23 nov. 2026 : la notification est retirée, il la remplace).
  assert.equal(notif(m), undefined);
  assert.match(Records.get('MailRecu', m.id).compte_rendu.texte, /J'ai créé le dossier « Murs Tabac de la Gare - Vienne » avec ses pièces\./);
});

test('des pièces pour un dossier évident : rangées sans redemander, et Nora reçoit le compte rendu', async () => {
  const m = transfert({ objet: 'TR: Bail', texte: "---------- Forwarded message ---------\nDe : Marc Agent <marc@agence.fr>\nObjet : Bail\n\nVoici le bail.", pieces_jointes: [piece('bail-macon.pdf'), piece('taxe-fonciere.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const d = Records.findBy('Deal', 'deal_id', 'deal-macon');
  assert.deepEqual(d.documents_espace.map((x) => x.nom).sort(), ['bail-macon.pdf', 'taxe-fonciere.pdf']);
  assert.equal(Records.list('HakaProposition').filter((p) => p.charge?.mail_id === m.id).length, 0, 'pas de question : le transfert est la décision');
  const log = Records.get('MailRecu', m.id).compte_rendu;
  assert.equal(log.pour, 'nora@klocka.immo');
  assert.match(log.texte, /Les pièces sont rangées dans la Data Room de « Boulangerie Aux Délices - Mâcon »/);
  assert.equal(Records.list('EmailLog').filter((e) => String(e.template_id || '').startsWith('haka-transfert:')).length, 0, 'aucun mail à l’analyste');
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
  // La question est dans la file de Nora seule ; plus de notification (23 nov. 2026 : la cloche n'a plus d'écran).
  assert.equal(p.pour, 'nora@klocka.immo');
  assert.equal(Records.list('Notification').filter((x) => x.cle === `haka:${p.id}`).length, 0);
  assert.equal((await F.valider(p.id, nora, { choix: 'deal-nimes' })).ok, true);
  await T.tourner();
  assert.deepEqual(Records.findBy('Deal', 'deal_id', 'deal-nimes').documents_espace.map((x) => x.nom), ['plans.pdf']);
  assert.ok(Records.get('MailRecu', m.id).compte_rendu);
});

// Un mandataire transfère (9 nov. 2026, Jules) : le bien entre dans ses Biens ; admin et mandataire à la fois : on demande.
const M = await import('../transfert-mandataire.js');
const lecture = { adresse: '12 rue Mercière', ville: 'Lyon', type_bien: 'murs_commerce', prix: 450000, loyer_annuel: 30000, proprietaire: 'SCI Mercière' };
const leo = Records.create('User', { email: 'leo@agence-kp.fr', role: 'mandataire', full_name: 'Léo Mandataire' });
const ines = Records.create('User', { email: 'ines@klocka.immo', role: 'admin', aussi_mandataire: true, full_name: 'Inès Double' });
const parEmail = (email) => Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === email && !p.fusionne_dans);

test('un mandataire transfère : le bien est dans ses Biens, en import, avec ses pièces, sans question', async () => {
  M._brancherLecteur(async () => lecture);
  const m = transfert({ de: 'Léo <leo@agence-kp.fr>', de_email: leo.email, objet: 'TR: Murs Mercière', texte: "rentre ce dossier dans ma plateforme\n\n---------- Forwarded message ---------\nDe : Paul <paul@cabinet.fr>\nObjet : Murs Mercière\n\nCi-joint.", pieces_jointes: [piece('fiche-merciere.pdf'), piece('bail-merciere.pdf')] });
  const dealsAvant = Records.list('Deal').length;
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const [p] = parEmail(leo.email);
  assert.ok(p, 'le bien est créé');
  assert.equal(p.adresse, '12 rue Mercière');
  assert.equal(p.ville, 'Lyon');
  assert.equal(p.nom, 'SCI Mercière');
  assert.equal(p.biens.repris.prix, 450000);
  assert.ok(p.biens.import && !p.biens.import.fini, "l'import reste à finir avec l'assistant");
  assert.deepEqual(p.biens.pieces.map((x) => x.nom).sort(), ['bail-merciere.pdf', 'fiche-merciere.pdf']);
  assert.equal(Records.get('MailRecu', m.id).proprietaire_id, p.id);
  assert.equal(Records.list('Deal').length, dealsAvant, 'aucun dossier côté équipe');
  assert.equal(Records.list('HakaProposition').filter((x) => x.charge?.mail_id === m.id).length, 0, 'pas de question');
  const log = Records.get('MailRecu', m.id).compte_rendu;
  assert.equal(log.pour, leo.email);
  assert.match(log.texte, /« 12 rue Mercière, Lyon » est dans vos biens, avec 2 pièces\./);
});

test('la même adresse transférée à nouveau complète le bien, sans doublon', async () => {
  M._brancherLecteur(async () => lecture);
  const m = transfert({ de_email: leo.email, objet: 'TR: Taxe foncière Mercière', pieces_jointes: [piece('taxe-merciere.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const vivants = parEmail(leo.email).filter((p) => !p.retire_le);
  assert.equal(vivants.length, 1);
  assert.ok(vivants[0].biens.pieces.some((x) => x.nom === 'taxe-merciere.pdf'));
  assert.match(Records.get('MailRecu', m.id).compte_rendu.texte, /déjà dans vos biens/);
});

test('admin et mandataire à la fois : côté admin sans question, côté mandataire quand le message le dit (18 nov. 2026)', async () => {
  M._brancherLecteur(async () => ({ ...lecture, adresse: '3 place Bellecour' }));
  const cotes = async (objet, nom, texte) => {
    const m = transfert({ de_email: ines.email, objet, texte, pieces_jointes: [piece(nom)] });
    X.surTransfert(m, { lancer: false, uploadDir: dir });
    await T.tourner();
    return { m, p: Records.list('HakaProposition').find((x) => x.type === 'transfert_cote' && x.charge?.mail_id === m.id) };
  };
  const a = await cotes('TR: Bellecour', 'fiche-bellecour.pdf', 'rentre ce dossier dans ma plateforme, côté mandataire');
  assert.equal(a.p, undefined, 'aucune question');
  assert.equal(parEmail(ines.email)[0].adresse, '3 place Bellecour');

  const avant = parEmail(ines.email).length;
  const b = await cotes('TR: Nouveau local Vaise', 'bail-vaise.pdf', 'rentre ce dossier dans ma plateforme');
  assert.equal(b.p, undefined, 'aucune question');
  assert.equal(parEmail(ines.email).length, avant, 'pas de bien côté mandataire');
  assert.ok(Records.list('Deal').find((d) => d.source_mail?.mail_recu_id === b.m.id), 'le dossier côté équipe');
});

test('le côté : la question seulement pour qui a les deux, et seulement quand il y a de quoi importer', () => {
  const lu = { transfert: true };
  assert.equal(X.coteDuTransfert({ role: 'admin' }, { intention: 'fiche' }, lu), 'admin');
  assert.equal(X.coteDuTransfert({ role: 'mandataire' }, { intention: 'demande' }, { transfert: false }), 'mandataire');
  const double = { role: 'admin', aussi_mandataire: true };
  assert.equal(X.coteDuTransfert(double, { intention: 'fiche' }, { ...lu, note: 'Préanalyse ce bien' }), 'admin');
  assert.equal(X.coteDuTransfert(double, { intention: 'documents', dossier: 'deal-macon' }, lu), 'admin');
  assert.equal(X.coteDuTransfert(double, { intention: 'fiche' }, { ...lu, note: 'à mettre côté mandataire stp' }), 'mandataire');
  assert.equal(X.coteDuTransfert(double, { intention: 'memoire' }, lu), 'admin');
  assert.equal(X.coteDuTransfert(double, { intention: 'demande' }, { transfert: false }), 'admin');
  assert.equal(X.expediteurDuTransfert('inconnu@ailleurs.fr'), null);
  assert.equal(X.expediteurDuTransfert('LEO@agence-kp.fr').id, leo.id);
});

test('un mail à plusieurs biens, ou sans rien : rien de créé, et on le dit', async () => {
  const avant = parEmail(leo.email).length;
  M._brancherLecteur(async () => ({ plusieurs_biens: true }));
  const r1 = await M.bienDepuisTransfert(transfert({ de_email: leo.email }), { user: leo, lu: {}, uploadDir: dir, fichiers: [] });
  assert.match(M.compteRenduBien(r1).texte, /un par un/);
  M._brancherLecteur(async () => ({}));
  const r2 = await M.bienDepuisTransfert(transfert({ de_email: leo.email }), { user: leo, lu: {}, uploadDir: dir, fichiers: [] });
  assert.equal(r2.fait, 'rien');
  assert.equal(parEmail(leo.email).length, avant);
});

test('le tri : un mandataire entre sur sourcing@ comme une commande, pas ailleurs', async () => {
  const { trierMail, referentielTri } = await import('../deal/tri-mails.js');
  const ref = referentielTri();
  const mail = { de_email: leo.email, compte: 'sourcing@klocka.immo', objet: 'Bonjour', extrait: '', pieces_jointes: [] };
  assert.equal(trierMail(mail, ref).commande, true);
  assert.equal(ref.internes.has(leo.email), false, "il ne définit pas le domaine de l'équipe");
  assert.ok(!trierMail({ ...mail, compte: 'nora@klocka.immo' }, ref).commande);
});

test('le compte rendu dit ce qui a été fait, et seulement ça', () => {
  assert.deepEqual(X.compteRendu({ fait: 'fiche', deal_id: 'd1', nom: 'Tabac · Lille', verdict: 'GO' }, { objet: 'TR: fiche' }), { titre: 'Votre transfert · Tabac · Lille', texte: "C'est fait : le dossier « Tabac · Lille » est créé à votre nom et pré-analysé (verdict : GO).", lien: '/Dossiers?deal_id=d1' });
  assert.match(X.compteRendu({ fait: 'documents', deal_id: 'd1', nom: 'X', deposes: [], deja: ['bail.pdf'] }).texte, /étaient déjà dans la Data Room/);
  assert.equal(X.compteRendu({ fait: 'rien' }, { objet: 'TR: Bail' }).titre, 'Votre transfert · Bail');
});

test("« ne rentre pas la fiche dans la plateforme » : aucun dossier, la fiche en Mémoire et dans Twenty", async () => {
  const lu = (note) => ({ note, origine: null, objet_origine: '' });
  for (const note of ['Ne rentre pas la fiche dans la plateforme', 'ne la rentre pas stp', 'pas de dossier, juste pour info', 'seulement en mémoire', 'ne pas créer de dossier']) {
    assert.deepEqual(X.comprendre(lu(note), { pieces: [{}], vises: [] }), { intention: 'memoire' }, note);
  }
  assert.equal(X.comprendre(lu('à pré-analyser'), { pieces: [{}], vises: [] }).intention, 'fiche');
  const avant = Records.list('Deal').length;
  const m = transfert({ objet: 'TR: Murs Pharmacie - Arles', texte: "Ne rentre pas la fiche dans la plateforme\n\n---------- Forwarded message ---------\nDe : Léa Agent <lea@agence-arles.fr>\nObjet : Murs Pharmacie - Arles\n", pieces_jointes: [piece('fiche-arles.pdf')] });
  const extraire = async () => ({ lots: [{ lot: { adresse: { valeur: { rue: '3 rue de la République', code_postal: '13200', ville: 'Arles' } }, prix_fai: { valeur: 640000 }, loyer_annuel_ht_hc: { valeur: 38000 } } }], agent: null });
  const poses = [];
  const pousser = async (b) => { poses.push(b); return { id: 'tw-1', cree: true }; };
  const r = await X.enMemoireSeulement(m, { membre: { email: 'nora@klocka.immo' }, lu: { note: '', origine: { email: 'lea@agence-arles.fr', nom: 'Léa Agent' }, objet_origine: 'Murs Pharmacie - Arles' }, extraire, pousser });
  assert.equal(r.fait, 'memoire');
  assert.equal(r.twenty, true);
  assert.equal(Records.list('Deal').length, avant, 'aucun dossier');
  const b = Records.findBy('BienMemoire', 'mail_recu_id', m.id);
  assert.equal(b.statut, 'memoire');
  assert.equal(b.origine, 'transfert');
  assert.equal(b.ville, 'Arles');
  assert.equal(b.prix, 640000);
  assert.equal(b.agent_email, 'lea@agence-arles.fr', "l'agent d'origine, pas le collègue");
  assert.ok(b.fiche?.url, 'la fiche est gardée');
  assert.equal(poses[0].id, b.id);
  // La même pièce transférée une seconde fois n'est pas relue.
  const r2 = await X.enMemoireSeulement(m, { membre: { email: 'nora@klocka.immo' }, lu: { note: '' }, extraire: async () => { throw new Error('ne doit pas relire'); }, pousser });
  assert.equal(r2.deja, true);
  assert.equal(Records.filter('BienMemoire', { mail_recu_id: m.id }).length, 1);
  assert.match(X.compteRendu(r).texte, /^Fiche mise en Mémoire \(3 rue de la République, Arles\) et dans les Propriétés de Twenty CRM, sans dossier\./);
});

test("un PDF qui porte quatre fiches : quatre biens en Mémoire, pas un (20 nov. 2026, Jules)", async () => {
  const m = transfert({ objet: 'TR: Sélection murs Bretagne', texte: "---------- Forwarded message ---------\nDe : Paul Agent <paul@agence-vannes.fr>\nObjet : Sélection murs Bretagne\n", pieces_jointes: [piece('selection-4-fiches.pdf')] });
  const lotA = (rue, ville, prix) => ({ lot: { adresse: { valeur: { rue, code_postal: '56000', ville } }, prix_fai: { valeur: prix } } });
  const extraire = async () => ({ lots: [lotA('1 rue A', 'Vannes', 300000), lotA('2 rue B', 'Lorient', 410000), lotA('3 rue C', 'Auray', 220000), lotA('4 rue D', 'Quimper', 515000)], agent: null });
  const r = await X.enMemoireSeulement(m, { membre: { email: 'maxime@klocka.immo' }, lu: { note: '', origine: { email: 'paul@agence-vannes.fr', nom: 'Paul Agent' } }, extraire, pousser: async () => ({ id: 'tw' }) });
  assert.equal(r.n, 4);
  assert.deepEqual(Records.filter('BienMemoire', { mail_recu_id: m.id }).map((b) => b.ville).sort(), ['Auray', 'Lorient', 'Quimper', 'Vannes']);
  assert.equal(Records.get('MailRecu', m.id).memoire_ids.length, 4, 'le mail sait ses quatre biens : le compte les voit');
});

test('un dossier né du transfert : sa fiche en Mémoire et sa Propriété dans Twenty, tout de suite', async () => {
  const d = Records.create('Deal', { deal_id: 'deal-transfert', nom: 'Tabac · Sète', lots: [{ lot: { adresse: { valeur: { rue: '1 quai Aspirant Herber', ville: 'Sète' } }, prix_fai: { valeur: 300000 } } }], contact_agent_email: 'agent@sete.fr' });
  const r = await X.versMemoireEtTwenty(d, { email: 'nora@klocka.immo' }, { pousser: async () => ({ id: 'tw-2' }) });
  assert.deepEqual(r, { memoire: true, twenty: true, twenty_id: 'tw-2' });
  const b = Records.findBy('BienMemoire', 'deal_id', 'deal-transfert');
  assert.equal(b.statut, 'dossier');
  assert.equal(b.agent_email, 'agent@sete.fr');
});

test("17 nov. 2026 : transférer sans rien dire met en Mémoire ; « préanalyse » pré-analyse ; « juste la fiche X » choisit", () => {
  const lu = (note, origine = null) => ({ note, origine: origine ? { email: origine } : null, objet_origine: '' });
  const fiches = [{ nom: 'Fiche Pharmacie Mâcon.pdf', piece_id: 'p1' }, { nom: 'Murs Boulangerie Lyon.pdf', piece_id: 'p2' }, { nom: 'Tabac Nîmes.pdf', piece_id: 'p3' }];
  const v1 = [{ deal_id: 'deal-macon', nom: 'Boulangerie Aux Délices - Mâcon', score: 3 }];
  // Sans consigne, même avec un dossier évident de l'agent : la fiche va en Mémoire.
  assert.deepEqual(X.comprendre(lu('', 'marc@agence.fr'), { pieces: fiches, fiches, vises: v1 }), { intention: 'memoire', defaut: true });
  assert.deepEqual(X.comprendre(lu('fyi'), { pieces: fiches, fiches, vises: [] }), { intention: 'memoire', defaut: true });
  assert.equal(X.comprendre(lu('rentre ce dossier dans la plateforme'), { pieces: fiches.slice(0, 1), fiches: fiches.slice(0, 1), vises: [] }).intention, 'fiche');
  assert.equal(X.coteDuTransfert({ role: 'admin', mandataire: true, espace: 'kpartners' }, { intention: 'memoire', defaut: true }, { transfert: true }), 'admin', 'la Mémoire part sans question de côté');
  // « Préanalyse » : toutes les fiches.
  assert.deepEqual(X.comprendre(lu('préanalyse ces fiches stp'), { pieces: fiches, fiches, vises: [] }), { intention: 'fiche' });
  assert.deepEqual(X.comprendre(lu('Pré-analyse'), { pieces: fiches.slice(0, 1), fiches: fiches.slice(0, 1), vises: [] }), { intention: 'fiche' });
  // « Juste la fiche X » : par le nom, ou par le rang.
  assert.deepEqual(X.comprendre(lu('préanalyse juste la fiche de Lyon'), { pieces: fiches, fiches, vises: [] }), { intention: 'fiche', seulement: ['p2'] });
  assert.deepEqual(X.comprendre(lu('Préanalyse seulement la pharmacie'), { pieces: fiches, fiches, vises: [] }), { intention: 'fiche', seulement: ['p1'] });
  assert.deepEqual(X.comprendre(lu('préanalyse juste la deuxième'), { pieces: fiches, fiches, vises: [] }), { intention: 'fiche', seulement: ['p2'] });
  // Des documents sans fiche pour un dossier évident : rangés comme avant.
  assert.deepEqual(X.comprendre(lu('', 'marc@agence.fr'), { pieces: [{ nom: 'bail.pdf' }], fiches: [], vises: v1 }), { intention: 'documents', dossier: 'deal-macon' });
  // « Ne la rentre pas » reste la Mémoire.
  assert.deepEqual(X.comprendre(lu('ne la rentre pas'), { pieces: fiches, fiches, vises: [] }), { intention: 'memoire' });
});

test("toutes les fiches d'un transfert sans consigne vont en Mémoire, pas seulement la première", async () => {
  const m = transfert({ objet: 'TR: 2 fiches', texte: '', pieces_jointes: [piece('Fiche Bar Sète.pdf'), piece('Fiche Opticien Agde.pdf')] });
  const villes = { 'Fiche Bar Sète.pdf': 'Sète', 'Fiche Opticien Agde.pdf': 'Agde' };
  const extraire = async ({ filename }) => ({ lots: [{ lot: { adresse: { valeur: { rue: '1 rue Haute', code_postal: '34200', ville: villes[filename] } }, prix_fai: { valeur: 200000 } } }], agent: null });
  const r = await X.enMemoireSeulement(m, { membre: { email: 'nora@klocka.immo' }, lu: { note: '' }, extraire, pousser: async () => ({ id: 'tw' }) });
  assert.equal(r.n, 2);
  assert.deepEqual(Records.filter('BienMemoire', { mail_recu_id: m.id }).map((b) => b.ville).sort(), ['Agde', 'Sète']);
  assert.match(X.compteRendu(r).texte, /^2 fiches mises en Mémoire et dans les Propriétés de Twenty CRM, sans dossier\./);
});

test("18 nov. 2026 : une pièce au nom qui ne dit pas « fiche » est lue aussi ; le bail du même bien ne fait pas de doublon ; les photos ne sont pas lues", async () => {
  const m = transfert({ objet: 'TR: Fiches Cannes', texte: '', pieces_jointes: [piece('Fiche Boulangerie Cannes.pdf'), piece('Local 17 Jean Médecin plan.pdf'), piece('Bail 17 Jean Médecin.pdf'), piece('photo vitrine.jpg')] });
  const lus = [];
  const adresse = { 'Fiche Boulangerie Cannes.pdf': ['48 rue d\'Antibes', '06400', 'Cannes'], 'Local 17 Jean Médecin plan.pdf': ['17 avenue Jean Médecin', '06000', 'Nice'], 'Bail 17 Jean Médecin.pdf': ['17 avenue Jean Médecin', '06000', 'Nice'] };
  const extraire = async ({ filename }) => {
    lus.push(filename);
    const [rue, code_postal, ville] = adresse[filename] || [];
    return { lots: [{ lot: { ...(rue ? { adresse: { valeur: { rue, code_postal, ville } } } : {}), loyer_annuel_ht_hc: { valeur: 30000 } } }], agent: null };
  };
  const r = await X.enMemoireSeulement(m, { membre: { email: 'nora@klocka.immo' }, lu: { note: '' }, extraire, pousser: async () => ({ id: 'tw' }) });
  assert.equal(r.n, 2, 'Cannes et le 17 avenue Jean Médecin');
  assert.deepEqual(Records.filter('BienMemoire', { mail_recu_id: m.id }).map((b) => b.ville).sort(), ['Cannes', 'Nice']);
  assert.ok(!lus.includes('photo vitrine.jpg'), 'les documents ont donné des biens : les images ne sont pas lues');
});

test("18 nov. 2026 : une capture seule, sans document, est lue comme fiche", async () => {
  const m = transfert({ objet: 'TR: annonce', texte: '', pieces_jointes: [piece('Capture d’écran 2026-11-16.png')] });
  const extraire = async () => ({ lots: [{ lot: { adresse: { valeur: { rue: '5 rue Masséna', code_postal: '06000', ville: 'Nice' } }, prix_fai: { valeur: 400000 } } }], agent: null });
  const r = await X.enMemoireSeulement(m, { membre: { email: 'nora@klocka.immo' }, lu: { note: '' }, extraire, pousser: async () => ({ id: 'tw' }) });
  assert.equal(r.n, 1);
});

test("la reprise du 16 nov. : les fiches transférées sans consigne vont en Mémoire, une fois, et la question en attente est retirée", async () => {
  const m = transfert({ objet: 'TR: Fiche Coiffeur Agen', texte: '', date: '2026-11-16T09:00:00Z', pieces_jointes: [piece('Fiche Coiffeur Agen.pdf')], haka_transfert: { intention: 'documents' } });
  const deja = transfert({ objet: 'TR: Fiche Tabac Pau', texte: '', date: '2026-11-16T10:00:00Z', pieces_jointes: [piece('Fiche Tabac Pau.pdf')], haka_transfert: { intention: 'fiche' }, deal_id: 'deal-pau' });
  const q = Records.create('HakaProposition', { etat: 'proposee', type: 'transfert_dossier', charge: { mail_id: m.id }, pour: 'nora@klocka.immo' });
  const lignes = [];
  const extraire = async () => ({ lots: [{ lot: { adresse: { valeur: { rue: '2 rue Neuve', code_postal: '47000', ville: 'Agen' } }, prix_fai: { valeur: 150000 } } }], agent: null });
  const b = await X.reprendreTransferts({ cle: 'test.reprise', journal: (l) => lignes.push(l), deps: { extraire, pousser: async () => ({ id: 'tw' }) } });
  assert.equal(Records.filter('BienMemoire', { mail_recu_id: m.id }).length, 1);
  assert.equal(Records.filter('BienMemoire', { mail_recu_id: deja.id }).length, 0, 'déjà pré-analysée : sa fiche est en Mémoire par le dossier');
  assert.equal(Records.get('HakaProposition', q.id).etat, 'retiree');
  assert.ok(b.fiches >= 1 && b.preanalyses >= 1);
  assert.ok(lignes.some((l) => /Coiffeur Agen.*1 en Mémoire/.test(l)));
  assert.equal((await X.reprendreTransferts({ cle: 'test.reprise', journal: () => {} })).deja, true, 'une seule fois');
});

test("un mail écrit directement à sourcing@ avec la fiche, sans transfert : Mémoire ; « Préanalyse » en objet : pré-analyse", () => {
  const f = [{ nom: 'Fiche Bar Sète.pdf', piece_id: 'p1' }, { nom: 'Fiche Tabac Agde.pdf', piece_id: 'p2' }];
  const c = (texte, objet) => X.comprendre(X.lireTransfert({ texte, objet }), { pieces: f, fiches: f, vises: [] });
  assert.deepEqual(c('', ''), { intention: 'memoire', defaut: true });
  assert.deepEqual(c('', 'Deux fiches'), { intention: 'memoire', defaut: true });
  assert.deepEqual(c('', 'Préanalyse'), { intention: 'fiche' });
  assert.deepEqual(c('', 'Préanalyse juste Agde'), { intention: 'fiche', seulement: ['p2'] });
  // Un transfert : l'objet est celui de l'agent (« à analyser » chez lui ne vaut pas consigne).
  assert.deepEqual(c('\n---------- Forwarded message ---------\nDe : Agent <a@agence.fr>\nObjet : Bien à analyser\n', 'TR: Bien à analyser'), { intention: 'memoire', defaut: true });
});

test("« ne préanalyse pas cette fiche » et ses variantes : Mémoire seulement, jamais de pré-analyse", () => {
  const f = [{ nom: 'Fiche Bar Sète.pdf', piece_id: 'p1' }];
  const c = (t) => X.comprendre(X.lireTransfert({ texte: t, objet: '' }), { pieces: f, fiches: f, vises: [] }).intention;
  for (const t of ['ne préanalyse pas cette fiche', 'ne la préanalyse pas', 'pas de préanalyse', 'sans préanalyse', 'ne pas préanalyser', 'ne pas la pré-analyser stp', 'surtout pas de pré-analyse', "n'analyse pas", 'aucune analyse']) assert.equal(c(t), 'memoire', t);
  for (const t of ['préanalyse cette fiche', 'peux-tu la préanalyser', 'Pré-analyse stp', 'analyse ce bien']) assert.equal(c(t), 'fiche', t);
});

test("la consigne lue par l'IA : son intention fait foi, les règles en secours, pas d'appel sans message", async () => {
  const f = [{ nom: 'Fiche Bar Sète.pdf', piece_id: 'p1' }, { nom: 'Fiche Tabac Agde.pdf', piece_id: 'p2' }];
  const lu = (texte, objet = '') => X.lireTransfert({ texte, objet });
  const ia = (r) => async () => r;
  assert.deepEqual(await X.comprendreAvecIA(lu('garde-la juste pour info'), { pieces: f, fiches: f }, { lire: ia({ intention: 'memoire' }) }), { intention: 'memoire', lu_par: 'ia', raison: null });
  assert.deepEqual(await X.comprendreAvecIA(lu('ouvre un dossier pour celle d Agde'), { pieces: f, fiches: f }, { lire: ia({ intention: 'preanalyse', fiches: [2] }) }), { intention: 'fiche', seulement: ['p2'], lu_par: 'ia', raison: null });
  assert.deepEqual(await X.comprendreAvecIA(lu('analyse tout'), { pieces: f, fiches: f }, { lire: ia({ intention: 'preanalyse', fiches: [] }) }), { intention: 'fiche', lu_par: 'ia', raison: null });
  assert.equal((await X.comprendreAvecIA(lu('quel rendement ?'), { pieces: f, fiches: f }, { lire: ia({ intention: 'question' }) })).intention, 'demande');
  // L'IA ne répond pas : les règles.
  assert.deepEqual(await X.comprendreAvecIA(lu('ne préanalyse pas'), { pieces: f, fiches: f }, { lire: async () => { throw new Error('panne'); } }), { intention: 'memoire', lu_par: 'regles' });
  // Sans message : pas d'appel du tout.
  let appels = 0;
  assert.deepEqual(await X.comprendreAvecIA(lu(''), { pieces: f, fiches: f }, { lire: async () => { appels += 1; return { intention: 'preanalyse' }; } }), { intention: 'memoire', defaut: true, lu_par: 'regles' });
  assert.equal(appels, 0);
  assert.match(X.promptConsigne('ne préanalyse pas', { pieces: f, fiches: f }), /1\. Fiche Bar Sète\.pdf \(fiche de bien\)/);
});

test("sur sourcing@, un mail de l'équipe ou de la boîte elle-même est une commande, même si une règle apprise l'écartait", async () => {
  const { trierMail } = await import('../deal/tri-mails.js');
  const ref = { internes: new Set(['nora@klocka.immo']), domaines: new Set(['klocka.immo']), commandes: new Set(['sourcing@klocka.immo']), mandataires: new Set(),
    apprises: { parEmail: new Map(), parDomaine: new Map([['klocka.immo', { decision: 'ecarter' }]]) }, ignores: new Set(), agents: new Set(), attendus: new Set(), ambiant: { agents: new Set(), clients: new Set() }, exemples: [] };
  const mail = (de) => ({ compte: 'sourcing@klocka.immo', de_email: de, objet: 'Fiche', pieces_jointes: [{ nom: 'fiche.pdf' }] });
  assert.equal(trierMail(mail('nora@klocka.immo'), ref).commande, true, 'la règle apprise ne jette plus un collègue');
  assert.equal(trierMail(mail('sourcing@klocka.immo'), ref).commande, true, 'la boîte qui s’écrit à elle-même');
  assert.equal(X.expediteurDuTransfert('sourcing@klocka.immo')?.role, 'admin');
  assert.equal(X.expediteurDuTransfert('inconnu@ailleurs.fr'), null);
});

test("22 nov. 2026 : un ZIP de fiches, et la fiche écrite dans le mail transféré, vont en Mémoire ; la lecture est notée sur le mail", async () => {
  const zipLocal = path.join(dir, 'fiches.zip');
  fs.writeFileSync(zipLocal, 'PK zip');
  const mz = transfert({ objet: 'TR: portefeuille', texte: '', pieces_jointes: [{ nom: 'fiches.zip', mime: 'application/zip', taille: 6, piece_id: `local:${zipLocal}` }] });
  // Le ZIP compte comme une fiche : sans consigne, la Mémoire.
  assert.equal(X.comprendre({ transfert: true, note: '' }, { pieces: mz.pieces_jointes, fiches: mz.pieces_jointes, vises: [] }).intention, 'memoire');
  const ouvrirZip = async () => [{ nom: 'Fiche Lunel.pdf', mime: 'application/pdf', buffer: Buffer.from('lunel') }, { nom: 'Fiche Mauguio.pdf', mime: 'application/pdf', buffer: Buffer.from('mauguio') }];
  const villes = { 'Fiche Lunel.pdf': 'Lunel', 'Fiche Mauguio.pdf': 'Mauguio' };
  const extraire = async ({ filename }) => ({ lots: [{ lot: { adresse: { valeur: { rue: '2 place du Marché', code_postal: '34400', ville: villes[filename] } }, prix_fai: { valeur: 250000 } } }], agent: null, biens_annonces: null });
  const r = await X.enMemoireSeulement(mz, { membre: { email: 'nora@klocka.immo' }, lu: { note: '' }, extraire, pousser: async () => ({ id: 'tw' }), ouvrirZip });
  assert.equal(r.n, 2);
  assert.deepEqual(Records.get('MailRecu', mz.id).fiches_lues.map((x) => [x.nom, x.biens]).sort(), [['Fiche Lunel.pdf', 1], ['Fiche Mauguio.pdf', 1]]);

  // La fiche dans le corps : pas de pièce, le texte de l'agent parle d'un bien et donne un montant.
  const texte = "---------- Message transféré ---------\nDe : Paul <paul@cabinet.fr>\nBonjour, je vous propose des murs commerciaux à vendre au 12 rue Foch à Montpellier, loués à une boulangerie, loyer 24 000 € HT par an, prix 380 000 € net vendeur.";
  const mc = transfert({ objet: 'TR: Murs Foch', texte });
  assert.ok(X.ficheDuCorps(mc, {}));
  assert.equal(X.comprendre({ transfert: true, note: '' }, { pieces: [], fiches: [], vises: [], corps: true }).intention, 'memoire');
  assert.equal(X.comprendre({ transfert: true, note: 'tu peux regarder ?' }, { pieces: [], fiches: [], vises: [], corps: true }).intention, 'demande');
  const lus = [];
  const rc = await X.enMemoireSeulement(mc, { membre: { email: 'nora@klocka.immo' }, lu: { note: '' }, pousser: async () => ({ id: 'tw' }),
    extraire: async ({ filename, buffer }) => { lus.push([filename, String(buffer)]); return { lots: [{ lot: { adresse: { valeur: { rue: '12 rue Foch', code_postal: '34000', ville: 'Montpellier' } }, prix_fai: { valeur: 380000 } } }], agent: null, biens_annonces: 1 }; } });
  assert.equal(rc.n, 1);
  assert.equal(lus[0][0], 'texte-du-mail.txt');
  assert.match(lus[0][1], /12 rue Foch/);
  assert.equal(Records.get('MailRecu', mc.id).fiches_lues[0].annonce, 1);
  // Un mail sans montant ni bien n'est pas une fiche.
  assert.equal(X.ficheDuCorps(transfert({ texte: 'Salut, tu peux rappeler Paul demain matin pour le dossier de Lyon ? Merci beaucoup, bonne soirée à toi.' }), {}), null);
});

test("23 nov. 2026 : « pas besoin de les rentrer, je m'en occuperai pour l'analyse » va en Mémoire, pas en pré-analyse", () => {
  const f = [{ nom: 'Fiche Bar.pdf', piece_id: 'p1' }];
  const lu = (note) => ({ transfert: true, note });
  for (const note of ["Bonjour, je te transfère ces dossiers. Pas besoin de les rentrer sur la plateforme, je m'en occuperai moi-même pour l'analyse.", 'Pas la peine de les analyser', "je m'en charge"]) {
    assert.equal(X.comprendre(lu(note), { pieces: f, fiches: f, vises: [] }).intention, 'memoire', note);
  }
  // « Préanalyse » reste une pré-analyse.
  assert.equal(X.comprendre(lu('préanalyse la stp'), { pieces: f, fiches: f, vises: [] }).intention, 'fiche');
  // Le compte rendu dit la Mémoire d'abord, quand la suite est un rangement.
  assert.match(X.ceQuiEstFait({ fait: 'documents', deposes: ['Bail.pdf'], deja: [], nom: 'Mâcon', memoire_dabord: { n: 1 } }), /La fiche est aussi en Mémoire\./);
});

test("23 nov. 2026 : un transfert qui ne porte qu'un lien WeTransfer va en Mémoire, et le compte rendu le dit", () => {
  assert.equal(X.comprendre({ transfert: true, note: '' }, { pieces: [], fiches: [], vises: [], liens: true }).intention, 'memoire');
  assert.equal(X.comprendre({ transfert: true, note: 'tu peux regarder ?' }, { pieces: [], fiches: [], vises: [], liens: true }).intention, 'demande');
});

// 24 nov. 2026 (Jules : « on a reçu un portefeuille, Nora a dit préanalyse et ça n'a pas mis trois préanalyses
// indépendantes ; ça devrait poser la question : séparément ou en un seul lot ? Ça compte comme trois fiches car trois
// commerces ») : le cas d'Oyonnax, trois locataires et une cellule vacante dans un PDF.
const OYONNAX = { adresse: { valeur: { rue: 'Rue Anatole France', code_postal: '01100', ville: 'Oyonnax' } }, loyer_annuel_ht_hc: { valeur: 116351 }, surface_m2: { valeur: 747 },
  commerces: [
    { locataire: 'Jules', surface_m2: 155, loyer_annuel: 40135, vacant: false },
    { locataire: 'Nocibé', surface_m2: 251, loyer_annuel: 46216, vacant: false },
    { locataire: 'Orange', surface_m2: 250, loyer_annuel: 30000, vacant: false },
    { locataire: null, surface_m2: 91, loyer_annuel: null, vacant: true },
  ] };
const transfertOyonnax = () => transfert({ objet: 'TR: Oyonnax - Kairos', texte: "Préanalyse\n\n---------- Forwarded message ---------\nDe : Benjamin Lucas <b.lucas@kairos-realestate.com>\nObjet : Oyonnax - Kairos\n", pieces_jointes: [piece(`Oyonnax-${n}.pdf`)] });
const { lignesFiches } = await import('../memoire/record-memoire.js');

test('24 nov. 2026 : un portefeuille à pré-analyser pose la question, et « séparément » fait un dossier par commerce loué', async () => {
  X.pourLesTests.extraire = async () => ({ lots: [{ lot: OYONNAX }], agent: null });
  const analyses = [];
  X.pourLesTests.analyser = async (entree, ctx) => {
    analyses.push(ctx.cible);
    const deal_id = `deal-oyo-${analyses.length}`;
    Records.create('Deal', { deal_id, lots: [{ lot: { adresse: OYONNAX.adresse, locataire_nom: { valeur: ctx.cible.locataire, absent: false } } }], portefeuille: { commerce: ctx.cible.locataire } });
    return { deal_id };
  };
  try {
    const m = transfertOyonnax();
    X.surTransfert(m, { lancer: false, uploadDir: dir });
    await T.tourner();
    // La question, avant toute pré-analyse ; la fiche est déjà en Mémoire et compte trois fiches.
    assert.equal(analyses.length, 0, 'rien de pré-analysé avant la réponse');
    const p = Records.list('HakaProposition').find((x) => x.type === 'transfert_lot' && x.charge?.mail_id === m.id);
    assert.ok(p, 'la question est posée');
    assert.deepEqual(p.choix.map((c) => c.cle), ['separement', 'lot']);
    const cr = Records.get('MailRecu', m.id).compte_rendu;
    assert.match(cr.texte, /un portefeuille de 3 commerces loués/);
    assert.match(cr.texte, /- Nocibé \(251 m², loyer 46 k€ par an\)/);
    assert.match(cr.texte, /Et une cellule vacante de 91 m²/);
    assert.match(cr.texte, /séparément, un dossier par commerce, ou en un seul lot \?/);
    assert.doesNotMatch(cr.texte, /C'est juste \?/);
    assert.equal(cr.question, true);
    assert.deepEqual(cr.boutons.map((b) => b.libelle), ['Séparément', 'En un seul lot']);
    const biens = Records.filter('BienMemoire', { mail_recu_id: m.id });
    assert.equal(biens.length, 1);
    assert.equal(lignesFiches(biens).length, 3, 'trois commerces, trois fiches');
    // Le fil existe (la pop-up l'a ouvert) ; Nora répond « séparément » dans le chat.
    const C = await import('../haka/compte-rendu-transfert.js');
    const fil = (await C.conversationsDesComptesRendus(nora)).find((x) => x.id === m.id);
    assert.ok(fil?.conversation_id);
    assert.deepEqual((await C.repondrePortefeuille({ separement: true }, { email: 'maxime@klocka.immo', role: 'admin' })).ok, false, "la question n'est pas à Maxime");
    const rep = await C.repondrePortefeuille({ separement: true }, nora);
    assert.equal(rep.ok, true);
    await T.tourner();
    assert.deepEqual(analyses.map((c) => c.locataire), ['Jules', 'Nocibé', 'Orange'], 'un dossier par commerce loué, pas pour la cellule vacante');
    const mail = Records.get('MailRecu', m.id);
    assert.deepEqual(mail.deal_ids, ['deal-oyo-1', 'deal-oyo-2', 'deal-oyo-3']);
    assert.equal(mail.portefeuille_en_attente, null);
    for (const id of mail.deal_ids) assert.equal(Records.findBy('Deal', 'deal_id', id).responsable_email, 'nora@klocka.immo');
    // La suite arrive dans le même fil, et la pop-up la redit.
    assert.equal(mail.compte_rendu.conversation_id, fil.conversation_id);
    assert.match(mail.compte_rendu.texte, /^C'est fait : 3 dossiers pré-analysés, un par commerce/);
    assert.match(mail.compte_rendu.texte, /La cellule vacante n'a pas de dossier\./);
    assert.equal(mail.compte_rendu.vu_le, null);
    await new Promise((r) => setTimeout(r, 50));
    const { Conversations } = await import('../db.js');
    assert.match(Conversations.get(fil.conversation_id).messages.at(-1).contenu, /3 dossiers pré-analysés/);
    // Les trois dossiers et la ligne du transfert comptent trois fiches, pas six ni une.
    assert.equal(lignesFiches(Records.filter('BienMemoire', { mail_recu_id: m.id })).length, 3);
  } finally {
    X.pourLesTests.extraire = null;
    X.pourLesTests.analyser = null;
  }
});

test('24 nov. 2026 : « en un seul lot » pré-analyse le portefeuille en un dossier ; une fiche à un locataire ne pose pas la question', async () => {
  X.pourLesTests.extraire = async () => ({ lots: [{ lot: OYONNAX }], agent: null });
  const cibles = [];
  X.pourLesTests.analyser = async (entree, ctx) => {
    cibles.push(ctx.cible || null);
    const deal_id = `deal-oyo-lot-${cibles.length}`;
    Records.create('Deal', { deal_id, lots: [{ lot: OYONNAX }] });
    return { deal_id };
  };
  try {
    const m = transfertOyonnax();
    X.surTransfert(m, { lancer: false, uploadDir: dir });
    await T.tourner();
    const C = await import('../haka/compte-rendu-transfert.js');
    await C.conversationsDesComptesRendus(nora);
    const avant = Records.list('Deal').length;
    assert.equal((await C.repondrePortefeuille({ separement: false }, nora)).ok, true);
    await T.tourner();
    const mail = Records.get('MailRecu', m.id);
    assert.ok(mail.deal_id, 'un dossier');
    assert.equal(Records.list('Deal').length, avant + 1);
    assert.deepEqual(cibles, [null], 'lu en entier, sans cellule pour cible');
    assert.match(mail.compte_rendu.texte, /en un seul lot/);
    // Une fiche à un seul locataire : pas de question, la pré-analyse part.
    X.pourLesTests.extraire = async () => ({ lots: [{ lot: { adresse: OYONNAX.adresse, loyer_annuel_ht_hc: { valeur: 40000 } } }], agent: null });
    const m2 = transfertOyonnax();
    X.surTransfert(m2, { lancer: false, uploadDir: dir });
    await T.tourner();
    assert.equal(Records.list('HakaProposition').filter((x) => x.type === 'transfert_lot' && x.charge?.mail_id === m2.id).length, 0);
    assert.ok(Records.get('MailRecu', m2.id).deal_id);
  } finally {
    X.pourLesTests.extraire = null;
    X.pourLesTests.analyser = null;
  }
});

test('24 nov. 2026 : les portefeuilles lus : deux commerces loués au moins, dans une pièce qu’on sait relire', () => {
  const c = OYONNAX.commerces;
  assert.deepEqual(X.portefeuillesDe([{ piece_id: 'local:a', commerces: c }, { piece_id: 'local:a', commerces: c }]).length, 1, 'une entrée par pièce');
  assert.equal(X.portefeuillesDe([{ piece_id: 'corps:1', commerces: c }]).length, 0, 'le texte du mail ne se relit pas');
  assert.equal(X.portefeuillesDe([{ piece_id: 'zip#a.pdf', commerces: c }]).length, 0);
  assert.equal(X.portefeuillesDe([{ piece_id: 'local:b', commerces: [c[0], c[3]] }]).length, 0, 'un locataire et une vacante : pas un portefeuille');
});
