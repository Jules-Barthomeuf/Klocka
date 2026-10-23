// Haka, compétence « fiche reçue », de bout en bout, sans Gmail ni modèle (le
// bouchon de test lit quand même l'adresse et le prix de la fiche) :
// la fiche arrive dans la boîte de Nora, le dossier naît à son nom, la demande
// de documents attend dans la file, Jules valide, le mail est simulé depuis la
// boîte de Nora et le dossier passe en « documents demandés ». Puis le même
// bien reçu d'un autre agent, la même adresse à un autre prix, et le plafond.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ici = path.dirname(fileURLToPath(import.meta.url));
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-fiche-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_SIMULER = '1';
process.env.HAKA_FILE = '1';
process.env.HAKA_PLAFOND_JOUR = '3';
const { Records } = await import('../db.js');
const T = await import('./taches.js');
const F = await import('./file.js');
const { surFicheRecue, surReleve } = await import('./declencheurs.js');

Records.create('User', { email: 'jules@test.local', role: 'admin', full_name: 'Jules B' });
const nora = Records.create('User', { email: 'nora@test.local', role: 'admin', full_name: 'Nora L' });
Records.create('User', { email: 'paul@test.local', role: 'admin', full_name: 'Paul' });
Records.create('MailAccount', { email: 'nora@test.local', owner_email: 'nora@test.local', name: 'Nora', provider: 'google', refresh_token: 'r', peut_envoyer: true, peut_lire: true });
const jules = { email: 'jules@test.local', role: 'admin' };
const fixture = path.join(ici, 'fixtures', 'fiche-test.pdf');
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-uploads-'));
const fixtureAutrePrix = path.join(ici, 'fixtures', 'fiche-test-autre-prix.pdf');

const mailRecu = (n, { compte = 'nora@test.local', fichier = fixture } = {}) => Records.create('MailRecu', {
  compte, gmail_message_id: `g-${n}`, de: `Agent ${n} <agent${n}@exemple.fr>`, de_email: `agent${n}@exemple.fr`,
  objet: `Murs commerciaux ${n}`, texte: 'Ci-joint la fiche.', date: new Date().toISOString(),
  pieces_jointes: [{ nom: `Fiche_${n}.pdf`, mime: 'application/pdf', piece_id: `local:${fichier}` }],
});
let premierDossier = null;

// Depuis le 19 oct. 2026, la fiche attend d'abord un clic : « Pré-analyser » ou « Pas une fiche ».
const propositionDeFiche = (mail) => Records.list('HakaProposition').find((p) => p.cle === `preanalyser:${mail.id}`);
async function accepter(mail, qui = jules) {
  await T.tourner();
  const p = propositionDeFiche(mail);
  assert.ok(p, 'la fiche attend dans la file');
  assert.equal(p.type, 'preanalyser_fiche');
  const r = await F.valider(p.id, qui, { choix: 'preanalyser' });
  assert.equal(r.ok, true, r.error);
  await T.tourner();
}

test('une fiche dans la boîte de Nora : dossier à son nom, demande de documents à valider, mail depuis sa boîte', async () => {
  const mail = mailRecu(1);
  const t = surFicheRecue(mail, { uploadDir: uploads, lancer: false });
  assert.equal(t.pour, 'nora@test.local');
  assert.equal(Records.get('MailRecu', mail.id).haka_tache_id, t.id);
  // Rien n'est créé avant le clic.
  await T.tourner();
  assert.equal(T.tache(t.id).etat, 'en_attente_validation');
  assert.equal(T.tache(t.id).etape, 'accepter_preanalyse');
  assert.equal(Records.get('MailRecu', mail.id).deal_id, undefined);
  assert.equal(propositionDeFiche(mail).pour, 'nora@test.local');
  assert.deepEqual(propositionDeFiche(mail).choix.map((c) => c.cle), ['preanalyser', 'ignorer']);
  await accepter(mail);
  const tache = T.tache(t.id);
  assert.equal(tache.etat, 'en_attente_validation', tache.erreur || '');
  assert.equal(tache.etape, 'envoyer_demande_documents');
  const deal = Records.findBy('Deal', 'deal_id', tache.dossier);
  premierDossier = deal.deal_id;
  assert.ok(deal, 'le dossier existe');
  assert.equal(deal.responsable_email, 'nora@test.local');
  assert.deepEqual(deal.responsables, ['Nora L']);
  assert.equal(deal.par_haka.competence, 'fiche_recue');
  assert.equal(deal.par_haka.version, '2');
  assert.equal(deal.apports[0].de, 'agent1@exemple.fr');
  assert.equal(deal.lots[0].par_haka, true);
  assert.equal(Records.get('MailRecu', mail.id).deal_id, deal.deal_id);
  // La proposition, pour Nora, depuis sa boîte, avec ses sources.
  const [p] = F.pourDossier(deal.deal_id);
  assert.ok(p, 'une proposition dans la file');
  assert.equal(p.type, 'demande_documents');
  assert.equal(p.pour, 'nora@test.local');
  assert.equal(p.charge.de, 'nora@test.local');
  // La fiche dit qui est l'agent (« Contact : agent@exemple.fr ») : c'est lui, pas l'expéditeur du mail.
  assert.equal(p.charge.a, 'agent@exemple.fr');
  assert.ok(p.charge.objet && p.charge.corps);
  assert.deepEqual(p.sources.map((s) => s.outil), ['gmail', 'fiche', 'preanalyse']);
  // Prévenue une fois, de la fiche et de la proposition.
  assert.ok(Records.list('Notification').some((n) => n.cle === `fiche:${deal.deal_id}` && n.pour === 'nora@test.local'));
  assert.ok(Records.list('Notification').some((n) => n.cle === `haka:${p.id}`));
  // Paul ne peut pas ; Jules valide : le mail est simulé, le dossier avance.
  assert.equal((await F.valider(p.id, { email: 'paul@test.local', role: 'admin' })).statut, 403);
  const r = await F.valider(p.id, jules);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.resultat.simule, true);
  assert.equal(r.resultat.de, 'nora@test.local');
  assert.equal(Records.findBy('Deal', 'deal_id', deal.deal_id).statut, 'documents_demandes');
  assert.ok(Records.list('EmailLog').some((e) => e.template_id === `haka:${p.id}` && e.statut === 'simule' && e.expediteur === 'nora@test.local'));
  assert.equal(T.tache(t.id).etat, 'faite');
});

test('le même bien reçu d\'un autre agent dans la boîte commune : rattaché, dit dans le Commun, rien n\'est envoyé', async () => {
  const mail = mailRecu(2, { compte: 'sourcing@klocka.immo' });
  const t = surFicheRecue(mail, { uploadDir: uploads, lancer: false });
  assert.equal(t.pour, null);
  await accepter(mail);
  const tache = T.tache(t.id);
  assert.equal(tache.etat, 'faite', tache.erreur || '');
  const existant = Records.findBy('Deal', 'deal_id', premierDossier);
  // La fiche est un document du dossier existant, l'agent est tracé, le mail rattaché.
  assert.ok(existant.documents_espace?.some((d) => d.nom === 'Fiche_2.pdf' || /Fiche/.test(d.nom)), 'la fiche est dans les documents');
  assert.equal(existant.apports.length, 2);
  assert.equal(existant.apports[1].de, 'agent2@exemple.fr');
  assert.equal(Records.get('MailRecu', mail.id).deal_id, premierDossier);
  const nouveau = Records.findBy('Deal', 'deal_id', tache.dossier);
  assert.equal(nouveau.archived, true);
  assert.equal(nouveau.doublon_de, premierDossier);
  const p = F.pourDossier(premierDossier).find((x) => x.type === 'meme_bien_recu');
  assert.ok(p, 'un élément « même bien reçu »');
  assert.equal(p.pour, null);
  assert.deepEqual(p.actions, ['vu']);
  assert.ok(F.lister(nora, 'commun').some((x) => x.id === p.id));
  assert.equal(F.pourDossier(premierDossier).filter((x) => x.type === 'demande_documents').length, 0, 'aucun mail proposé');
  // « Vu » : validé sans action.
  const r = await F.valider(p.id, nora);
  assert.equal(r.ok, true);
  assert.equal(r.proposition.etat, 'validee');
});

test('même adresse, autre prix : Haka demande (rattacher ou créer) ; « créer » continue jusqu\'au mail', async () => {
  const mail = mailRecu(3, { fichier: fixtureAutrePrix });
  const t = surFicheRecue(mail, { uploadDir: uploads, lancer: false });
  await accepter(mail);
  const tache = T.tache(t.id);
  assert.equal(tache.etat, 'en_attente_validation', tache.erreur || '');
  assert.equal(tache.etape, 'trancher_doublon');
  const p = F.pourDossier(tache.dossier).find((x) => x.type === 'rattacher_ou_creer');
  assert.ok(p);
  assert.deepEqual(p.choix.map((c) => c.cle), ['rattacher', 'creer']);
  assert.equal(p.charge.candidats[0].deal_id, premierDossier);
  assert.equal(p.charge.candidats[0].niveau, 'meme_adresse');
  // Sans choix, refus ; « créer » : la tâche repart et propose le mail.
  assert.equal((await F.valider(p.id, nora)).statut, 400);
  const r = await F.valider(p.id, nora, { choix: 'creer' });
  assert.equal(r.ok, true, r.error);
  assert.equal(T.tache(t.id).etat, 'en_attente_validation');
  assert.equal(T.tache(t.id).etape, 'envoyer_demande_documents');
  assert.ok(F.pourDossier(tache.dossier).some((x) => x.type === 'demande_documents'));
  assert.equal(Records.findBy('Deal', 'deal_id', tache.dossier).archived, false);
});

test('le plafond du jour : la fiche de trop attend demain, Jules est prévenu une fois', async () => {
  const mail = mailRecu(4);
  const t = surFicheRecue(mail, { uploadDir: uploads, lancer: false });
  await accepter(mail);
  const tache = T.tache(t.id);
  assert.equal(tache.etat, 'differee');
  assert.ok(tache.apres > new Date().toISOString());
  assert.equal(Records.get('MailRecu', mail.id).deal_id, undefined, 'rien n\'est créé');
  const jour = new Date().toISOString().slice(0, 10);
  assert.equal(Records.list('Notification').filter((n) => n.cle === `haka:plafond:${jour}`).length, 1);
});

test('surReleve : la même fiche relevée deux fois ne fait qu\'une tâche', async () => {
  // La mise en route de Haka est posée avant le mail : sous charge, « maintenant » pouvait tomber une milliseconde après.
  (await import('../db.js')).Meta.set('mail.preanalyse_auto.depuis', new Date(Date.now() - 60000).toISOString());
  const mail = mailRecu(5);
  const a = await surReleve({ uploadDir: uploads });
  assert.equal(a.en_file, 1);
  assert.equal(a.lignes[0].de, 'agent5@exemple.fr');
  const b = await surReleve({ uploadDir: uploads });
  assert.equal(b.en_file, 0);
  assert.ok(Records.get('MailRecu', mail.id).haka_tache_id);
  assert.equal(T.tachesDuJour('fiche_recue'), 5);
});

test('« Pas une fiche » : rien n\'est créé, le mail le garde, la tâche est finie', async () => {
  const mail = mailRecu(6);
  const t = surFicheRecue(mail, { uploadDir: uploads, lancer: false });
  await T.tourner();
  const p = propositionDeFiche(mail);
  // Un « Non » sans raison est refusé (20 oct. 2026) : la proposition reste à décider.
  const sans = await F.valider(p.id, nora, { choix: 'ignorer' });
  assert.equal(sans.ok, false);
  assert.match(sans.error, /Dites pourquoi/);
  assert.equal(F.proposition(p.id).etat, 'proposee');
  const r = await F.valider(p.id, nora, { choix: 'ignorer', categorie: 'pas_une_fiche', motif: "C'est la plaquette de l'agence" });
  assert.equal(r.ok, true, r.error);
  assert.equal(T.tache(t.id).etat, 'faite');
  assert.equal(Records.get('MailRecu', mail.id).deal_id, undefined);
  assert.equal(Records.get('MailRecu', mail.id).fiche_refusee.par, 'nora@test.local');
  assert.equal(F.proposition(p.id).motif_rejet, "C'est la plaquette de l'agence");
  // La réponse est gardée pour l'apprentissage, avec sa raison.
  const d = Records.list('FicheDecision').find((x) => x.mail_id === mail.id);
  assert.equal(d.choix, 'ignorer');
  assert.equal(d.categorie, 'pas_une_fiche');
  assert.ok(Records.list('FicheDecision').some((x) => x.choix === 'preanalyser'), 'les Oui aussi sont gardés');
});
