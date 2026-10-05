// Le parcours d'un dossier, du mandataire à l'analyste et retour, sur une
// base vide : créé chez le mandataire (privé), pièces et photos, transfert à
// l'analyste choisi (disponible cette semaine), conversation dans les deux
// sens, compléments, renvoi, décision. Sans réseau ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-parcours-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records, Meta } = await import('./db.js');
const P = await import('./mandataire-portes.js');
const F = await import('./fil-dossier.js');

const LEA = { email: 'lea@kpartners.fr', role: 'mandataire', full_name: 'Léa Martin' };
const JULES = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules B' };
for (const a of F.ANALYSTES) Records.create('User', { email: a.email, role: 'admin', full_name: a.nom });
Records.create('User', { email: LEA.email, role: 'mandataire', full_name: LEA.full_name });
// Seul Jules a connecté son agenda ; on le dit lu et sans absence (pas de Google ici).
Records.create('AgendaAnalyste', { owner_email: JULES.email, email: JULES.email });
Meta.set(`agenda-semaine:${JULES.email}`, JSON.stringify({ lu: Date.now(), connecte: true, lisible: true, absence: null, prochaine: null }));

const pieces = ['bail', 'quittances', 'diagnostics', 'taxe_fonciere'];
let d;

test('le dossier naît chez le mandataire et y reste', () => {
  d = P.creerDossier({ bien: 'Boulangerie du Port', adresse: '2 quai Lamartine, Mâcon', prix: 290000 }, LEA).dossier;
  assert.equal(P.estTransfere(d), false);
  assert.equal(d.analyste_email ?? null, null);
  for (const cle of pieces) assert.equal(P.ajouterPiece(d.id, cle, { filename: `${cle}.pdf`, url: `/uploads/${cle}-parcours.pdf` }, LEA).ok, true);
  assert.equal(P.ajouterPhoto(d.id, { filename: 'facade.jpg', url: '/uploads/facade-parcours.jpg', mimetype: 'image/jpeg' }, LEA).ok, true);
  d = Records.get('DossierMandataire', d.id);
  assert.equal(d.statut, 'complet');
  assert.equal(F.filDe(d.id).some((m) => m.cote === 'mandataire'), false, 'aucun message : Klocka ne le voit pas');
});

test('les analystes de la semaine : celui qui a connecté son agenda, les autres grisés', async () => {
  const liste = await F.analystesDisponibles();
  assert.equal(liste.length, F.ANALYSTES.length);
  assert.deepEqual(liste.filter((a) => a.disponible).map((a) => a.email), [JULES.email]);
  assert.ok(liste.filter((a) => !a.disponible).every((a) => /agenda/i.test(a.raison)), 'la raison est dite');
  // Une absence déclarée le grise aussi.
  const u = Records.list('User').find((x) => x.email === JULES.email);
  Records.update('User', u.id, { absent_jusqu_au: new Date(Date.now() + 2 * 86400000).toISOString() });
  assert.equal((await F.analystesDisponibles()).find((a) => a.email === JULES.email).disponible, false);
  Records.update('User', u.id, { absent_jusqu_au: null });
});

test('le transfert va à l’analyste choisi, et seulement s’il est disponible', async () => {
  const refus = await P.soumettreDossier(d.id, LEA, { analyste: 'nora.l@klocka.immo' });
  assert.equal(refus.ok, false, 'Nora n’a pas connecté son agenda');
  assert.equal(Records.get('DossierMandataire', d.id).deal_id ?? null, null, 'rien n’est parti');
  const r = await P.soumettreDossier(d.id, LEA, { analyste: JULES.email });
  assert.equal(r.ok, true, r.error);
  d = Records.get('DossierMandataire', d.id);
  assert.equal(d.statut, 'en_etude');
  assert.equal(d.analyste_email, JULES.email);
  assert.ok(d.deal_id, 'un dossier d’analyse est né');
  const deal = Records.findBy('Deal', 'deal_id', d.deal_id);
  assert.equal(deal.dossier_mandataire_id, d.id, 'les deux côtés sont reliés');
  assert.equal(deal.origine, 'mandataire');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(Records.findBy('Deal', 'deal_id', d.deal_id).responsables, ['Jules'], 'le dossier d’analyse est « chez Jules »');
  assert.equal(P.estTransfere(d), true);
  assert.ok(Records.list('Notification').some((n) => n.pour === JULES.email && /à étudier/.test(n.titre)), 'Jules est prévenu');
});

test('la conversation passe dans les deux sens, avec les non-lus de chaque côté', async () => {
  assert.equal((await F.ecrireAnalyste(d.id, JULES, { texte: 'Bien reçu, je regarde le bail.' })).ok, true);
  assert.equal(F.nonLus(d.id, LEA.email, false), 1, 'Léa a un message à lire');
  assert.ok(Records.list('Notification').some((n) => n.pour === LEA.email && /conv=1/.test(n.lien || '')), 'sa notification ouvre la conversation');
  F.marquerLu(d.id, LEA.email);
  assert.equal(F.nonLus(d.id, LEA.email, false), 0);
  assert.equal((await F.ecrireMandataire(d.id, LEA, { texte: 'Merci, le propriétaire est pressé.' })).ok, true);
  assert.ok(F.filDe(d.id, { pourKlocka: true }).some((m) => m.cote === 'mandataire' && !(m.lu_par || []).includes(JULES.email)), 'Jules a le message de Léa à lire');
  assert.ok(F.nonLus(d.id, JULES.email, true) >= 1);
  assert.ok(Records.list('Notification').some((n) => n.pour === JULES.email && n.lien === `/Analyse?deal_id=${d.deal_id}`), 'sa notification ouvre l’analyse');
  await F.ecrireAnalyste(d.id, JULES, { texte: 'Même bailleur qu’un autre dossier.', interne: true });
  assert.equal(F.filDe(d.id).some((m) => /Même bailleur/.test(m.texte)), false, 'la note interne reste chez Klocka');
});

test('compléments, dépôt, renvoi : l’analyste reste le même', async () => {
  assert.equal(P.deciderDossier(d.id, { decision: 'complements', pieces: ['kbis'] }, JULES).ok, true);
  d = Records.get('DossierMandataire', d.id);
  assert.equal(d.statut, 'complements');
  assert.equal((await P.soumettreDossier(d.id, LEA)).ok, false, 'le Kbis manque');
  assert.equal(P.ajouterPiece(d.id, 'kbis', { filename: 'kbis.pdf', url: '/uploads/kbis-parcours.pdf' }, LEA).ok, true);
  const r = await P.soumettreDossier(d.id, LEA);
  assert.equal(r.ok, true, r.error);
  d = Records.get('DossierMandataire', d.id);
  assert.equal(d.statut, 'en_etude');
  assert.equal(d.analyste_email, JULES.email);
  assert.equal(Records.list('Deal').filter((x) => x.dossier_mandataire_id === d.id).length, 1, 'un seul dossier d’analyse');
});

test('la décision revient au mandataire', async () => {
  assert.equal(P.deciderDossier(d.id, { decision: 'no_go', commentaire: 'Loyer au-dessus du marché.' }, JULES).ok, true);
  await new Promise((r) => setTimeout(r, 100));
  d = Records.get('DossierMandataire', d.id);
  assert.equal(d.statut, 'no_go');
  assert.ok(F.filDe(d.id).some((m) => /No-go/i.test(m.texte)), 'le mandataire le lit dans la conversation');
  assert.equal(P.deciderDossier(d.id, { decision: 'go' }, LEA).ok, false, 'un mandataire ne décide pas');
});

test('une pièce suffit pour transférer ; les suivantes vont dans l’analyse', async () => {
  const b = P.creerDossier({ bien: 'Pharmacie des Halles' }, LEA).dossier;
  const vide = await P.soumettreDossier(b.id, LEA, { analyste: JULES.email });
  assert.equal(vide.ok, false, 'sans aucune pièce, rien ne part');
  assert.match(vide.error, /au moins une pièce/);
  assert.equal(P.ajouterPiece(b.id, 'bail', { filename: 'bail.pdf', url: '/uploads/bail-seul.pdf' }, LEA).ok, true);
  assert.equal(P.checklist(Records.get('DossierMandataire', b.id)).envoyable, true);
  const r = await P.soumettreDossier(b.id, LEA, { analyste: JULES.email });
  assert.equal(r.ok, true, r.error);
  const envoye = Records.get('DossierMandataire', b.id);
  assert.equal(envoye.statut, 'en_etude');
  assert.ok(envoye.deal_id);
  // Pendant l'étude, le mandataire ajoute les quittances : elles restent en étude, Jules est prévenu.
  const q = P.ajouterPiece(b.id, 'quittances', { filename: 'quittances.pdf', url: '/uploads/quittances-apres.pdf' }, LEA);
  assert.equal(q.ok, true, q.error);
  assert.equal(q.dossier.statut, 'en_etude');
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(Records.list('Notification').some((n) => n.pour === JULES.email && /Nouvelle pièce/.test(n.titre)));
  assert.equal(P.retirerPiece(b.id, 'bail', '/uploads/bail-seul.pdf', LEA).ok, false, 'transféré : on ajoute, on ne retire plus');
  await P.supprimerDossierMandataire(b.id, JULES);
});

test('supprimer : le mandataire, son dossier pas encore transféré ; Klocka, n’importe lequel, avec sa conversation', async () => {
  const brouillon = P.creerDossier({ bien: 'Épicerie fine (à supprimer)' }, LEA).dossier;
  await F.ecrireMandataire(brouillon.id, LEA, { texte: 'Une question avant de transférer.' });
  const autre = { email: 'autre@kpartners.fr', role: 'mandataire' };
  assert.equal((await P.supprimerDossierMandataire(brouillon.id, autre)).ok, false, 'pas le dossier d’un autre');
  assert.equal((await P.supprimerDossierMandataire(brouillon.id, LEA)).ok, true);
  assert.equal(Records.get('DossierMandataire', brouillon.id), null);
  assert.equal(Records.filter('MessageDossier', { dossier_id: brouillon.id }).length, 0, 'la conversation part avec lui');
  // Transféré : le mandataire ne le supprime plus, Klocka si, avec son dossier d'analyse.
  assert.equal((await P.supprimerDossierMandataire(d.id, LEA)).ok, false, 'transféré : c’est Klocka qui le retire');
  const dealId = d.deal_id;
  const r = await P.supprimerDossierMandataire(d.id, JULES);
  assert.equal(r.ok, true, r.error);
  assert.equal(Records.get('DossierMandataire', d.id), null);
  assert.equal(Records.findBy('Deal', 'deal_id', dealId) ?? null, null, 'le dossier d’analyse part aussi');
  assert.equal(Records.filter('MessageDossier', { dossier_id: d.id }).length, 0);
  assert.equal(Records.list('Notification').filter((n) => String(n.lien || '').includes(d.id) || String(n.lien || '').includes(dealId)).length, 0, 'plus de notification qui y mène');
});
