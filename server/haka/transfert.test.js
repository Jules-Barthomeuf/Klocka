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
  assert.equal(X.comprendre(lu(''), { pieces: [{}], fiches: [{}], vises: [] }).intention, 'fiche', 'une fiche sans dossier connu');
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
  const log = notif(m);
  assert.match(log.texte, /Je n'ai reconnu aucun dossier ouvert : j'ai créé « Murs Tabac de la Gare - Vienne » à votre nom, avec 2 pièces dans sa Data Room/);
});

test('des pièces pour un dossier évident : rangées sans redemander, et Nora reçoit le compte rendu', async () => {
  const m = transfert({ objet: 'TR: Bail', texte: "---------- Forwarded message ---------\nDe : Marc Agent <marc@agence.fr>\nObjet : Bail\n\nVoici le bail.", pieces_jointes: [piece('bail-macon.pdf'), piece('taxe-fonciere.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const d = Records.findBy('Deal', 'deal_id', 'deal-macon');
  assert.deepEqual(d.documents_espace.map((x) => x.nom).sort(), ['bail-macon.pdf', 'taxe-fonciere.pdf']);
  assert.equal(Records.list('HakaProposition').filter((p) => p.charge?.mail_id === m.id).length, 0, 'pas de question : le transfert est la décision');
  const log = notif(m);
  assert.equal(log.pour, 'nora@klocka.immo');
  assert.match(log.texte, /^C'est fait : 2 pièces dans la Data Room de « Boulangerie Aux Délices - Mâcon »/);
  assert.equal(log.lien, '/Dossiers?deal_id=deal-macon');
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
  assert.deepEqual(Records.list('Notification').filter((x) => x.cle === `haka:${p.id}`).map((x) => x.pour), ['nora@klocka.immo']);
  assert.equal((await F.valider(p.id, nora, { choix: 'deal-nimes' })).ok, true);
  await T.tourner();
  assert.deepEqual(Records.findBy('Deal', 'deal_id', 'deal-nimes').documents_espace.map((x) => x.nom), ['plans.pdf']);
  assert.ok(notif(m));
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
  const log = notif(m);
  assert.equal(log.pour, leo.email);
  assert.equal(log.lien, `/MandataireBiens?bien=proprietaire:${p.id}`);
  assert.match(log.texte, /^C'est fait : « 12 rue Mercière, Lyon » est dans vos biens, avec 2 pièces\./);
});

test('la même adresse transférée à nouveau complète le bien, sans doublon', async () => {
  M._brancherLecteur(async () => lecture);
  const m = transfert({ de_email: leo.email, objet: 'TR: Taxe foncière Mercière', pieces_jointes: [piece('taxe-merciere.pdf')] });
  X.surTransfert(m, { lancer: false, uploadDir: dir });
  await T.tourner();
  const vivants = parEmail(leo.email).filter((p) => !p.retire_le);
  assert.equal(vivants.length, 1);
  assert.ok(vivants[0].biens.pieces.some((x) => x.nom === 'taxe-merciere.pdf'));
  assert.match(notif(m).texte, /déjà dans vos biens/);
});

test('admin et mandataire à la fois : la question, puis le côté choisi', async () => {
  M._brancherLecteur(async () => ({ ...lecture, adresse: '3 place Bellecour' }));
  const cotes = async (objet, nom) => {
    const m = transfert({ de_email: ines.email, objet, texte: 'rentre ce dossier dans ma plateforme', pieces_jointes: [piece(nom)] });
    X.surTransfert(m, { lancer: false, uploadDir: dir });
    await T.tourner();
    return { m, p: Records.list('HakaProposition').find((x) => x.type === 'transfert_cote' && x.charge?.mail_id === m.id) };
  };
  const a = await cotes('TR: Bellecour', 'fiche-bellecour.pdf');
  assert.equal(a.p.pour, ines.email);
  assert.deepEqual(a.p.choix.map((c) => c.cle), ['mandataire', 'admin']);
  assert.equal(Records.list('Notification').find((x) => x.cle === `haka:${a.p.id}`).genre, 'question_cote');
  assert.equal(parEmail(ines.email).length, 0, 'rien avant la réponse');
  assert.equal((await F.valider(a.p.id, ines, { choix: 'mandataire' })).ok, true);
  await T.tourner();
  assert.equal(parEmail(ines.email)[0].adresse, '3 place Bellecour');
  assert.ok(notif(a.m));

  const b = await cotes('TR: Nouveau local Vaise', 'bail-vaise.pdf');
  const avant = parEmail(ines.email).length;
  assert.equal((await F.valider(b.p.id, ines, { choix: 'admin' })).ok, true);
  await T.tourner();
  assert.equal(parEmail(ines.email).length, avant, 'pas de bien côté mandataire');
  assert.ok(Records.list('Deal').find((d) => d.source_mail?.mail_recu_id === b.m.id), 'le dossier côté équipe');
});

test('le côté : la question seulement pour qui a les deux, et seulement quand il y a de quoi importer', () => {
  const lu = { transfert: true };
  assert.equal(X.coteDuTransfert({ role: 'admin' }, { intention: 'fiche' }, lu), 'admin');
  assert.equal(X.coteDuTransfert({ role: 'mandataire' }, { intention: 'demande' }, { transfert: false }), 'mandataire');
  const double = { role: 'admin', aussi_mandataire: true };
  assert.equal(X.coteDuTransfert(double, { intention: 'fiche' }, lu), null);
  assert.equal(X.coteDuTransfert(double, { intention: 'documents', dossier: 'deal-macon' }, lu), null);
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
  assert.match(X.compteRendu(r).texte, /^Rien dans la plateforme, comme demandé : la fiche est en Mémoire \(3 rue de la République, Arles\) et dans les Propriétés de Twenty CRM\.$/);
});

test('un dossier né du transfert : sa fiche en Mémoire et sa Propriété dans Twenty, tout de suite', async () => {
  const d = Records.create('Deal', { deal_id: 'deal-transfert', nom: 'Tabac · Sète', lots: [{ lot: { adresse: { valeur: { rue: '1 quai Aspirant Herber', ville: 'Sète' } }, prix_fai: { valeur: 300000 } } }], contact_agent_email: 'agent@sete.fr' });
  const r = await X.versMemoireEtTwenty(d, { email: 'nora@klocka.immo' }, { pousser: async () => ({ id: 'tw-2' }) });
  assert.deepEqual(r, { memoire: true, twenty: true, twenty_id: 'tw-2' });
  const b = Records.findBy('BienMemoire', 'deal_id', 'deal-transfert');
  assert.equal(b.statut, 'dossier');
  assert.equal(b.agent_email, 'agent@sete.fr');
});
