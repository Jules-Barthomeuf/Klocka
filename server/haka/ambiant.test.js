// Haka ambiant (22 oct. 2026) : chaque mail retenu donne une question oui / non à la seule personne concernée, rien
// ne part sans le oui, le non exige un motif qui apprend, les envois d'un même dossier se regroupent, une question
// traitée à la main se retire.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-ambiant-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@test.local';
process.env.HAKA_FILE = '1';
process.env.HAKA_AMBIANT = '1';
process.env.HAKA_SIMULER = '1';
const { Records } = await import('../db.js');
const T = await import('./taches.js');
const F = await import('./file.js');
const A = await import('./ambiant.js');

const jules = Records.create('User', { email: 'jules@test.local', role: 'admin', full_name: 'Jules B' });
const nora = Records.create('User', { email: 'nora@test.local', role: 'admin', full_name: 'Nora L' });
Records.create('User', { email: 'paul@test.local', role: 'admin', full_name: 'Paul' });
Records.create('MailAccount', { email: 'nora@test.local', owner_email: 'nora@test.local', peut_envoyer: true });
const deal = Records.create('Deal', { deal_id: 'deal-macon', nom: 'Boulanger Mâcon', statut: 'documents_demandes', responsable_email: 'nora@test.local', contact_agent_email: 'marc@agence.fr', documents_espace: [] });

let n = 0;
const mail = (champs = {}) => Records.create('MailRecu', { compte: 'nora@test.local', gmail_message_id: `m${n += 1}`, de: 'Marc Agent <marc@agence.fr>', de_email: 'marc@agence.fr', objet: 'Votre dossier', texte: 'Bonjour', date: new Date().toISOString(), pieces_jointes: [], ...champs });
const lecture = (champs = {}) => ({ nature: 'reponse_agent', resume: 'Marc répond.', phrase: 'Je vous rappelle jeudi.', confiance: 'haute', pieces: [], date: null, heure: null, suite: 'rappel', quoi: null, reponse: null, ...champs });
async function questionDe(m, l) {
  A.surMail(m, { lancer: false, lecture: l });
  await T.tourner();
  return Records.list('HakaProposition').find((p) => p.charge?.mail_id === m.id) || null;
}

test('pure : la lecture rendue propre, et le geste que le oui fera', () => {
  const sans = A.normaliser({ nature: 'documents', confiance: 'haute', resume: 'Le bail.', phrase: 'Ci-joint le bail.', suite: 'rien' }, { objet: 'Bail' }, { deal: null, pieces: [{ nom: 'bail.pdf' }] });
  assert.equal(sans.nature, 'reponse_agent', 'des documents sans dossier ne se rangent nulle part');
  const docs = A.normaliser({ nature: 'documents', confiance: 'haute', pieces: [{ nom: 'BAIL.pdf', type: 'bail' }, { nom: 'tf.pdf', type: 'inconnu' }] }, {}, { deal, pieces: [{ nom: 'bail.pdf' }, { nom: 'tf.pdf' }] });
  assert.deepEqual(docs.pieces, [{ nom: 'bail.pdf', type: 'bail' }, { nom: 'tf.pdf', type: 'autre' }]);
  assert.equal(A.normaliser({ nature: 'n_importe' }).nature, 'rien');
  const g = A.gesteDe({ ...docs, confiance: 'basse' }, { de: 'Marc <marc@agence.fr>', id: 'x' }, { deal });
  assert.equal(g.geste, 'ranger');
  assert.match(g.titre, /^Je ne suis pas sûr de ma lecture : 2 pièces reçues pour Boulanger Mâcon : je les range \?$/);
  const rdv = A.gesteDe(lecture({ nature: 'rendez_vous', date: '2026-10-27', heure: '14:30' }), { de: 'Marc <marc@agence.fr>' }, { aujourdhui: '2026-10-22' });
  assert.equal(rdv.geste, 'rappel');
  assert.match(rdv.titre, /Rendez-vous avec Marc le mardi 27 octobre : je le note \?/);
  assert.equal(rdv.heure, '14:30');
  const passe = A.gesteDe(lecture({ nature: 'reponse_agent', date: '2026-10-01' }), { de: 'Marc' }, { deal, aujourdhui: '2026-10-22' });
  assert.equal(passe.jour, '2026-10-27', 'une date passée : trois jours ouvrés plus tard');
  assert.equal(A.gesteDe(lecture({ nature: 'rien' }), {}, {}), null);
  assert.equal(A.heureDeParis('2026-10-22', 9).toISOString(), '2026-10-22T07:00:00.000Z', 'heure d’été');
  assert.equal(A.heureDeParis('2026-11-05', 9).toISOString(), '2026-11-05T08:00:00.000Z', 'heure d’hiver');
});

test('pure : ce qui est pour Haka ambiant', () => {
  const fiche = () => true;
  assert.equal(A.estPourAmbiant({ id: 1, date: '2026-10-22' }, { porteUneFiche: () => false }), true);
  assert.equal(A.estPourAmbiant({ id: 1, commande: true }), false, 'une demande à Haka a sa compétence');
  assert.equal(A.estPourAmbiant({ id: 1, interne: true }), false);
  assert.equal(A.estPourAmbiant({ id: 1 }, { porteUneFiche: fiche }), false, 'une fiche sans dossier a sa compétence');
  assert.equal(A.estPourAmbiant({ id: 1, deal_id: 'd' }, { porteUneFiche: fiche }), true, 'rattachée à un dossier, ce sont des documents');
  assert.equal(A.estPourAmbiant({ id: 1, haka_ambiant: { tache_id: 't' } }), false, 'jamais deux fois');
  assert.equal(A.estPourAmbiant({ id: 1, date: '2026-10-01' }, { depuis: '2026-10-20' }), false, 'pas de rattrapage');
});

test('une réponse : une question chez la responsable seule ; oui pose le rappel une fois', async () => {
  const m = mail({ deal_id: 'deal-macon' });
  const p = await questionDe(m, lecture({ date: '2026-12-03', quoi: 'Rappeler Marc pour le bail' }));
  assert.equal(p.type, 'mail_ambiant');
  assert.equal(p.pour, 'nora@test.local');
  assert.deepEqual(p.actions, ['oui_non']);
  assert.match(p.resume, /« Je vous rappelle jeudi\. »/);
  const notes = Records.list('Notification').filter((x) => x.cle === `haka:${p.id}`);
  assert.deepEqual(notes.map((x) => x.pour), ['nora@test.local'], 'personne d’autre ne la voit');
  assert.equal(Records.list('Rappel').length, 0, 'rien avant le oui');
  const r = await F.valider(p.id, nora, { choix: null });
  assert.equal(r.ok, true, r.error);
  const rappels = Records.list('Rappel').filter((x) => x.haka_proposition === p.id);
  assert.equal(rappels.length, 1);
  assert.equal(rappels[0].quoi, 'Rappeler Marc pour le bail');
  assert.equal(rappels[0].cree_par, 'nora@test.local');
  assert.equal((await F.valider(p.id, nora)).statut, 409, 'un second oui ne refait rien');
  assert.equal(Records.list('HakaApprentissage').filter((x) => x.decision === 'oui').length, 1);
});

test('non exige un motif, qui apprend à Haka et revient en exemple', async () => {
  const m = mail({ deal_id: 'deal-macon', objet: 'Newsletter de l’agence' });
  const p = await questionDe(m, lecture());
  assert.equal((await F.rejeter(p.id, nora, '')).statut, 400);
  assert.equal((await F.rejeter(p.id, nora, 'C’est la newsletter de son agence')).ok, true);
  assert.equal(Records.get('MailRecu', m.id).haka_ambiant.refuse.motif, 'C’est la newsletter de son agence');
  assert.ok(A.exemplesAppris().some((x) => /NON \(« C’est la newsletter de son agence »\)/.test(x)));
  assert.match(A.verdictAmbiant(Records.get('MailRecu', m.id)).raison, /Vous avez répondu Non/);
});

test('des pièces du même dossier dans l’heure : une seule question ; elles attendent le oui pour se ranger', async () => {
  const m1 = mail({ deal_id: 'deal-macon', pieces_jointes: [{ nom: 'bail.pdf', piece_id: 'p1' }] });
  const m2 = mail({ deal_id: 'deal-macon', pieces_jointes: [{ nom: 'taxe.pdf', piece_id: 'p2' }, { nom: 'plan.pdf', piece_id: 'p3' }] });
  const p = await questionDe(m1, lecture({ nature: 'documents', pieces: [{ nom: 'bail.pdf', type: 'bail' }] }));
  assert.equal(Records.get('MailRecu', m1.id).haka_attente_rangement, true);
  await questionDe(m2, lecture({ nature: 'documents', pieces: [{ nom: 'taxe.pdf', type: 'taxe_fonciere' }, { nom: 'plan.pdf', type: 'plan' }] }));
  const ouvertes = Records.list('HakaProposition').filter((x) => x.type === 'mail_ambiant' && x.etat === 'proposee' && x.charge?.geste === 'ranger');
  assert.equal(ouvertes.length, 1);
  const q = Records.get('HakaProposition', p.id);
  assert.equal(q.titre, '3 pièces reçues pour Boulanger Mâcon : je les range ?');
  assert.deepEqual(q.charge.mails, [m1.id, m2.id]);
  assert.equal(Records.get('MailRecu', m2.id).haka_ambiant.regroupe, true);
  const { ingererEnAttente } = await import('../deal/pieces-mails.js');
  const r = await ingererEnAttente(process.env.KLOCKA_DATA_DIR);
  assert.equal(r.documents, 0, 'rien ne se range sans le oui');
  // Rangées à la main entre-temps : la question se retire seule.
  Records.update('Deal', deal.id, { documents_espace: [{ nom: 'bail.pdf' }, { nom: 'taxe.pdf' }, { nom: 'plan.pdf' }] });
  assert.equal(A.nettoyer(), 1);
  assert.equal(Records.get('HakaProposition', p.id).etat, 'retiree');
  Records.update('Deal', deal.id, { documents_espace: [] });
});

test('un client connu : la réponse préparée part au oui, de la boîte de la personne, une fois', async () => {
  const c = Records.create('DemandeClient', { client_nom: 'Simon Sourigon', client_email: 'simon@exemple.com' });
  const m = mail({ de: 'Simon <simon@exemple.com>', de_email: 'simon@exemple.com', objet: 'Un bien à Lyon ?' });
  const p = await questionDe(m, lecture({ nature: 'demande_client', suite: 'mail', reponse: { objet: 'Re: Un bien à Lyon ?', corps: 'Bonjour Simon, je regarde et je reviens vers vous. Nora' } }));
  assert.equal(p.charge.geste, 'mail');
  assert.equal(p.pour, 'nora@test.local', 'sans dossier : la personne de la boîte');
  assert.ok(p.sources.some((s) => s.lien === `/AdminClients?client=${c.id}`), 'la fiche client en source');
  assert.match(p.titre, /^Simon Sourigon vous écrit : j'envoie cette réponse \?$/);
  assert.equal((await F.valider(p.id, nora)).ok, true);
  const logs = Records.list('EmailLog').filter((e) => e.template_id === `haka:${p.id}`);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].statut, 'simule');
});

test('rien à faire : noté sur le mail, sans question ni notification', async () => {
  const avant = Records.list('Notification').length;
  const m = mail({ objet: 'Accusé de réception' });
  assert.equal(await questionDe(m, lecture({ nature: 'rien' })), null);
  assert.equal(Records.list('Notification').length, avant);
  assert.equal(Records.get('MailRecu', m.id).haka_ambiant.raison, 'Rien à faire');
  assert.equal(A.verdictAmbiant(Records.get('MailRecu', m.id)).verdict, 'ecartee');
});

test('une réponse partie à la main retire la question', async () => {
  const m = mail({ deal_id: 'deal-macon', date: new Date(Date.now() - 60000).toISOString() });
  const p = await questionDe(m, lecture());
  Records.create('EmailLog', { to: 'marc@agence.fr', direction: 'sortant', statut: 'envoye', template_id: null, sent_at: new Date().toISOString() });
  assert.ok(A.nettoyer() >= 1);
  assert.equal(Records.get('HakaProposition', p.id).etat, 'retiree');
  assert.equal(T.tache(p.tache_id).etat, 'annulee');
});

test('Jules peut décider de toute question, un autre analyste non', async () => {
  const m = mail({ deal_id: 'deal-macon' });
  const p = await questionDe(m, lecture());
  assert.equal(F.peutDecider(jules, p), true);
  assert.equal(F.peutDecider(Records.list('User').find((u) => u.email === 'paul@test.local'), p), false);
});
