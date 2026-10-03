// Le fil d'un dossier mandataire : messages, absence, relais, briefing.
// Sans réseau ni modèle : l'absence vient du compte (déclarée), le briefing
// retombe sur les faits quand aucun modèle ne répond.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fil-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
const { Records } = await import('./db.js');
const F = await import('./fil-dossier.js');

const MANDA = { email: 'a@kpartners.fr', role: 'mandataire' };
const MANDB = { email: 'b@kpartners.fr', role: 'mandataire' };
const ADMIN = { email: 'nora.l@klocka.immo', role: 'admin' };
for (const a of F.ANALYSTES) Records.create('User', { email: a.email, role: 'admin', full_name: a.nom });

const dossier = (bien = 'Boulangerie Martin') => Records.create('DossierMandataire', {
  mandataire_email: MANDA.email, bien, documents: {}, statut: 'documents_en_cours', cree_le: new Date().toISOString(), historique: [],
});

test("evenementDAbsence : « Absent du bureau » et congés d'une journée, pas les réunions", () => {
  const maintenant = new Date('2026-10-05T10:00:00Z');
  const ooo = { eventType: 'outOfOffice', start: { dateTime: '2026-10-05T00:00:00Z' }, end: { dateTime: '2026-10-09T18:00:00Z' } };
  assert.equal(F.evenementDAbsence(ooo, maintenant).jusqu_au, '2026-10-09T18:00:00.000Z');
  const conges = { summary: 'Congés', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } };
  assert.ok(F.evenementDAbsence(conges, maintenant));
  const reunion = { summary: 'Point équipe', start: { dateTime: '2026-10-05T09:30:00Z' }, end: { dateTime: '2026-10-05T11:00:00Z' } };
  assert.equal(F.evenementDAbsence(reunion, maintenant), null, 'une réunion n’est pas une absence');
  assert.equal(F.evenementDAbsence({ ...ooo, status: 'cancelled' }, maintenant), null);
  assert.equal(F.evenementDAbsence({ ...ooo, start: { dateTime: '2026-10-07T00:00:00Z' } }, maintenant), null, 'une absence à venir ne compte pas encore');
});

test('attribution : la fiche du mandataire, sinon le moins chargé', async () => {
  Records.create('FicheMandataire', { email: MANDA.email, analyste_email: 'coralie.g@klocka.immo' });
  const d = await F.attribuer(dossier().id);
  assert.equal(d.analyste_titulaire, 'coralie.g@klocka.immo');
  assert.equal(d.analyste_email, 'coralie.g@klocka.immo');
});

test("relais : l'analyste absent passe la main, le mandataire est prévenu, le repreneur briefé ; au retour, il reprend", async () => {
  const d0 = dossier('Presse du Centre');
  const d = await F.attribuer(d0.id);
  const titulaire = d.analyste_email;
  const u = Records.list('User').find((x) => x.email === titulaire);
  Records.update('User', u.id, { absent_jusqu_au: new Date(Date.now() + 3 * 86400000).toISOString() });
  const r = await F.verifierRelais(d.id);
  assert.equal(r.change, true);
  const apres = Records.get('DossierMandataire', d.id);
  assert.notEqual(apres.analyste_email, titulaire, 'un autre analyste le reprend');
  assert.equal(apres.analyste_titulaire, titulaire, 'le titulaire ne change pas');
  const vuMandataire = F.filDe(d.id);
  assert.ok(vuMandataire.some((m) => /votre analyste est maintenant/i.test(m.texte)), 'le mandataire le lit dans le fil');
  assert.equal(vuMandataire.some((m) => m.genre === 'briefing'), false, 'le briefing ne se montre pas au mandataire');
  assert.ok(F.filDe(d.id, { pourKlocka: true }).some((m) => m.genre === 'briefing'), 'Klocka voit le briefing');
  // Retour du titulaire.
  Records.update('User', u.id, { absent_jusqu_au: null });
  const retour = await F.verifierRelais(d.id);
  assert.equal(retour.change, true);
  assert.equal(Records.get('DossierMandataire', d.id).analyste_email, titulaire, 'il reprend son dossier');
});

test('messages : chacun écrit dans son fil, jamais dans celui d’un autre', async () => {
  const d = await F.attribuer(dossier('Tabac du Port').id);
  const ok = await F.ecrireMandataire(d.id, MANDA, { texte: 'Le bail arrive demain.' });
  assert.equal(ok.ok, true);
  assert.equal((await F.ecrireMandataire(d.id, MANDB, { texte: 'intrus' })).ok, false, 'B n’écrit pas chez A');
  assert.equal((await F.ecrireAnalyste(d.id, MANDA, { texte: 'je me fais passer pour Klocka' })).ok, false, 'un mandataire n’écrit pas comme analyste');
  assert.equal((await F.ecrireAnalyste(d.id, ADMIN, { texte: 'Merci, je le lis dès réception.' })).ok, true);
  assert.equal((await F.ecrireMandataire(d.id, MANDA, { texte: '   ' })).ok, false, 'un message vide est refusé');
  const fil = F.filDe(d.id);
  assert.equal(fil.filter((m) => m.cote === 'mandataire').length, 1);
  assert.equal(fil.filter((m) => m.cote === 'analyste').length, 1);
  assert.ok(Records.list('Notification').some((n) => n.pour === MANDA.email && /vous a écrit/.test(n.titre)), 'le mandataire est prévenu');
});

test("transfert à la main : vers un analyste de l'équipe seulement", async () => {
  const d = await F.attribuer(dossier('Cave Girard').id);
  assert.equal((await F.transferer(d.id, 'inconnu@ailleurs.fr', { par: ADMIN.email })).ok, false);
  const r = await F.transferer(d.id, 'maxime.p@klocka.immo', { par: ADMIN.email });
  assert.equal(r.ok, true);
  const apres = Records.get('DossierMandataire', d.id);
  assert.equal(apres.analyste_email, 'maxime.p@klocka.immo');
  assert.equal(apres.analyste_titulaire, 'maxime.p@klocka.immo', 'un transfert à la main change aussi le titulaire');
});

test('compléments : les pièces cochées deviennent obligatoires, le dossier se renvoie une fois complété', async () => {
  const P = await import('./mandataire-portes.js');
  const ADMIN2 = { email: 'jules.b@klocka.immo', role: 'admin' };
  assert.deepEqual(P.normaliserPiecesDemandees(['kbis', 'Plan du local', 'kbis', '']).map((x) => x.cle), ['kbis', 'autre_plan_du_local'], 'clés connues, pièce libre, sans doublon');
  const d = Records.create('DossierMandataire', {
    mandataire_email: MANDA.email, bien: 'Fleuriste du Marché', statut: 'en_etude', historique: [],
    documents: { bail: [{ url: '/u/b.pdf' }], quittances: [{ url: '/u/q.pdf' }], diagnostics: [{ url: '/u/d.pdf' }], taxe_fonciere: [{ url: '/u/t.pdf' }] },
  });
  assert.equal(P.checklist(d).complet, true, 'les 4 obligatoires sont là');
  const r = P.deciderDossier(d.id, { decision: 'complements', pieces: ['kbis', 'Plan du local'] }, ADMIN2);
  assert.equal(r.ok, true, r.error);
  const apres = Records.get('DossierMandataire', d.id);
  const c = P.checklist(apres);
  assert.equal(c.complet, false, 'les pièces demandées manquent');
  assert.deepEqual(c.manquantes.map((m) => m.cle).sort(), ['autre_plan_du_local', 'kbis']);
  assert.equal(c.lignes.find((l) => l.cle === 'kbis').requise, true, 'le Kbis, facultatif, devient obligatoire');
  assert.ok(apres.commentaire.includes('Plan du local'), 'le mandataire lit ce qui manque');
  assert.equal(P.ajouterPiece(d.id, 'autre_plan_du_local', { filename: 'plan.pdf', url: '/u/p.pdf' }, MANDA).ok, true, 'la pièce nouvelle se dépose');
  P.ajouterPiece(d.id, 'kbis', { filename: 'kbis.pdf', url: '/u/k.pdf' }, MANDA);
  assert.equal(P.checklist(Records.get('DossierMandataire', d.id)).complet, true, 'complet à nouveau : il peut renvoyer');
  assert.equal(P.deciderDossier(d.id, { decision: 'complements' }, ADMIN2).ok, false, 'rien coché ni dit : refusé');
});

test("note interne : l'équipe la lit, le mandataire ne la voit pas et n'en est pas prévenu", async () => {
  const d = await F.attribuer(dossier('Opticien Saint-Pierre').id);
  const avant = Records.list('Notification').filter((n) => n.pour === MANDA.email).length;
  const r = await F.ecrireAnalyste(d.id, ADMIN, { texte: 'Même bailleur que la Cave Girard, à vérifier.', interne: true });
  assert.equal(r.ok, true);
  assert.equal(F.filDe(d.id).some((m) => /Cave Girard/.test(m.texte)), false, 'invisible du mandataire');
  assert.ok(F.filDe(d.id, { pourKlocka: true }).some((m) => m.interne && /Cave Girard/.test(m.texte)), 'visible de Klocka');
  assert.equal(Records.list('Notification').filter((n) => n.pour === MANDA.email).length, avant, 'aucune notification au mandataire');
  assert.equal(F.nonLus(d.id, MANDA.email, false), 0, 'ne compte pas dans ses non-lus');
});

test('pièce glissée : le nom du fichier désigne la bonne ligne, sinon rien', async () => {
  const { devinerPiece } = await import('../src/lib/pieces-dossier.js');
  const P = await import('./mandataire-portes.js');
  const lignes = P.checklist({ documents: {}, pieces_demandees: [{ cle: 'autre_plan_du_local', mot: 'Plan du local' }] }).lignes;
  assert.equal(devinerPiece('BAIL_COM_2022.pdf', lignes), 'bail');
  assert.equal(devinerPiece('quittances T1-T3 2026.pdf', lignes), 'quittances');
  assert.equal(devinerPiece('DPE local.pdf', lignes), 'diagnostics');
  assert.equal(devinerPiece('avis taxe fonciere 2025.pdf', lignes), 'taxe_fonciere');
  assert.equal(devinerPiece('Kbis-Aux-Delices.pdf', lignes), 'kbis');
  assert.equal(devinerPiece('PV AG 2024.pdf', lignes), 'copropriete');
  assert.equal(devinerPiece('plan rdc.pdf', lignes), 'autre_plan_du_local');
  assert.equal(devinerPiece('scan0003.pdf', lignes), null, 'un nom muet ne range rien');
  assert.equal(devinerPiece('bail.pdf', lignes.filter((l) => l.cle !== 'bail')), null, 'jamais une ligne absente');
});

test('liste Klocka : les messages non lus du mandataire comptent, pas les événements', async () => {
  const d = await F.attribuer(dossier('Primeur des Halles').id);
  F.evenement(d.id, 'Pièce reçue : Bail commercial (bail.pdf).');
  await F.ecrireMandataire(d.id, MANDA, { texte: 'Le Kbis arrive lundi.' });
  assert.equal(F.nonLus(d.id, ADMIN.email, true), 1);
  F.marquerLu(d.id, ADMIN.email);
  assert.equal(F.nonLus(d.id, ADMIN.email, true), 0);
});

test('dossier à soi : privé jusqu’au transfert ; photos ; estimation liée au mandataire seul', async () => {
  const P = await import('./mandataire-portes.js');
  const d = P.creerDossier({ bien: 'Cordonnerie Saint-Jean', adresse: '3 rue Gambetta, Mâcon' }, MANDA).dossier;
  assert.equal(P.estTransfere(d), false, 'un dossier créé reste chez le mandataire');
  assert.equal(d.analyste_email ?? null, null, 'aucun analyste avant le transfert');
  assert.equal(P.estTransfere({ ...d, statut: 'en_etude' }), true);
  assert.equal(P.ajouterPhoto(d.id, { filename: 'bail.pdf', url: '/u/b.pdf', mimetype: 'application/pdf' }, MANDA).ok, false, 'une photo est une image');
  const ph = P.ajouterPhoto(d.id, { filename: 'facade.jpg', url: '/u/f.jpg', mimetype: 'image/jpeg' }, MANDA);
  assert.equal(ph.ok, true);
  assert.equal(ph.dossier.photos.length, 1);
  assert.equal(P.ajouterPhoto(d.id, { filename: 'x.jpg', url: '/u/x.jpg', mimetype: 'image/jpeg' }, MANDB).ok, false, 'un autre mandataire n’y touche pas');
  assert.equal(P.retirerPhoto(d.id, '/u/f.jpg', MANDA).dossier.photos.length, 0);
  const sienne = Records.create('EstimationMandataire', { mandataire_email: MANDA.email, bien: 'Cordonnerie Saint-Jean', statut: 'prete', cree_le: new Date().toISOString() });
  const autre = Records.create('EstimationMandataire', { mandataire_email: MANDB.email, bien: 'Autre', statut: 'prete', cree_le: new Date().toISOString() });
  assert.equal(P.estimationDu(Records.get('DossierMandataire', d.id))?.id, sienne.id, 'retrouvée par le nom du bien');
  assert.equal(P.lierEstimation(d.id, autre.id, MANDA).ok, false, 'pas l’estimation d’un autre');
  assert.equal(P.lierEstimation(d.id, null, MANDA).ok, true);
  assert.equal(P.estimationDu(Records.get('DossierMandataire', d.id)), null, 'délier, c’est n’en vouloir aucune');
  // Le premier message donne un analyste au dossier.
  await F.ecrireMandataire(d.id, MANDA, { texte: 'Une question sur ce bien.' });
  assert.ok(Records.get('DossierMandataire', d.id).analyste_email, 'un analyste répond');
});
