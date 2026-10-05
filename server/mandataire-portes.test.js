// Les quatre pages de travail du mandataire : chaque parcours de statuts,
// les droits (le mandataire ne décide pas aux portes, ne voit pas les objets
// d'un autre), l'anonymat des offres, le registre des mandats.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-portes-'));
process.env.MONDAY_TOKEN = '';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('./db.js');
const P = await import('./mandataire-portes.js');

const ADMIN = { email: 'jules.b@klocka.immo', role: 'admin' };
const MOI = { email: 'marc@kpartners.fr', role: 'mandataire' };
const AUTRE = { email: 'lea@kpartners.fr', role: 'mandataire' };

test("estimation autonome : brouillon → prête → envoyée, sans validation Klocka", () => {
  const { estimation: e } = P.creerEstimation({ bien: 'Boulangerie Martin', adresse: '12 rue Carnot, Mâcon', infos_rdv: 'Bail 3-6-9 depuis 2019' }, MOI);
  assert.equal(e.statut, 'brouillon');
  assert.equal(P.marquerEstimationEnvoyee(e.id, MOI).ok, false, "pas d'envoi sans rapport");
  assert.equal(P.lireEstimation(e.id, AUTRE), null, "jamais l'estimation d'un autre");
  Records.update('EstimationMandataire', e.id, { rapport: { synthese: 'ok', prix_bas: 400000, prix_haut: 450000 }, statut: 'prete' });
  assert.equal(P.modifierEstimation(e.id, { rapport: { synthese: 'relue' } }, MOI).estimation.rapport.synthese, 'relue', 'le mandataire relit et corrige lui-même');
  assert.equal(P.marquerEstimationEnvoyee(e.id, MOI).estimation.statut, 'envoye');
  assert.equal(P.modifierEstimation(e.id, { adresse: 'ailleurs' }, MOI).ok, false, 'un rapport parti ne se modifie plus');
  assert.equal(P.modifierEstimation(e.id, { rapport: { synthese: 'après coup' } }, MOI).ok, false, 'son contenu non plus');
  // Le nom n'est pas le contenu : il se change toujours, et le chat ne le réécrit plus.
  const renomme = P.modifierEstimation(e.id, { bien: 'Boulangerie Martin, rue Carnot' }, MOI);
  assert.equal(renomme.ok, true, 'le nom se change même après l\'envoi');
  assert.equal(renomme.estimation.nom_choisi, true);
  assert.equal(P.modifierEstimation(e.id, { bien: '   ' }, MOI).ok, false, 'un nom vide est refusé');
  // Un vieux statut du temps de la validation se lit comme « prête ».
  const { estimation: v } = P.creerEstimation({ bien: 'Ancienne' }, MOI);
  Records.update('EstimationMandataire', v.id, { statut: 'valide', rapport: { synthese: 'x' } });
  assert.equal(P.marquerEstimationEnvoyee(v.id, MOI).estimation.statut, 'envoye');
});

test('la fourchette de prix : loyer ÷ taux, un taux haut fait le prix bas', () => {
  assert.deepEqual(P.fourchettePrix(30000, 6, 7), { prix_bas: 430000, prix_haut: 500000 });
  assert.equal(P.fourchettePrix(null, 6, 7), null);
});

test('mandat : demande → prêt → signé → enregistré, numéros sans trou', () => {
  assert.equal(P.demanderMandat({ vendeur: 'SCI Carnot', bien: 'Murs', prix: 450000, honoraires: 5, type: 'semi', duree_mois: 12 }, MOI).ok, false);
  const { mandat: m } = P.demanderMandat({ vendeur: 'SCI Carnot', bien: 'Murs boulangerie', prix: 450000, honoraires: 5, type: 'exclusif', duree_mois: 12 }, MOI);
  assert.equal(m.statut, 'demande_envoyee');
  assert.equal(P.deposerMandatSigne(m.id, { url: '/uploads/s.pdf' }, MOI).ok, false, 'pas signé avant d’être prêt');
  assert.equal(P.deposerMandatPret(m.id, { document: { url: '/uploads/m.pdf' } }, MOI).ok, false, 'Klocka seulement');
  assert.equal(P.deposerMandatPret(m.id, { document: { url: '/uploads/m.pdf' }, reference_mynotary: 'MN-1' }, ADMIN).mandat.statut, 'pret');
  assert.equal(P.enregistrerMandat(m.id, ADMIN).ok, false, 'pas au registre avant la signature');
  assert.equal(P.deposerMandatSigne(m.id, { url: '/uploads/s.pdf' }, MOI).mandat.statut, 'signe');
  const r = P.enregistrerMandat(m.id, ADMIN).mandat;
  assert.equal(r.statut, 'enregistre');
  const annee = new Date().getFullYear();
  assert.equal(r.numero_registre, `${annee}-0001`);
  const { mandat: m2 } = P.demanderMandat({ vendeur: 'M. Roux', bien: 'Tabac', prix: 200000, honoraires: 6, type: 'simple', duree_mois: 6 }, AUTRE);
  P.deposerMandatPret(m2.id, { document: { url: '/uploads/m2.pdf' } }, ADMIN);
  P.deposerMandatSigne(m2.id, { url: '/uploads/s2.pdf' }, AUTRE);
  assert.equal(P.enregistrerMandat(m2.id, ADMIN).mandat.numero_registre, `${annee}-0002`);
  const csv = P.registreCsv(P.registreMandats());
  assert.match(csv, new RegExp(`"${annee}-0001";.*"SCI Carnot"`));
  assert.equal(csv.split('\n').length, 3);
});

test('dossier : checklist, relance, envoi à Klocka, décision', async () => {
  const { dossier: d } = P.creerDossier({ bien: 'Boulangerie Martin', proprietaire: 'M. Martin', proprietaire_email: 'martin@x.fr' }, MOI);
  assert.equal(P.checklist(d).complet, false);
  const relance = P.relanceProprietaire(d);
  assert.equal(relance.destinataire, 'martin@x.fr');
  assert.match(relance.corps, /Bail commercial/);
  assert.equal((await P.soumettreDossier(d.id, MOI)).ok, false, 'sans aucune pièce');
  for (const cle of ['bail', 'quittances', 'diagnostics']) P.ajouterPiece(d.id, cle, { filename: `${cle}.pdf`, url: `/uploads/${cle}.pdf` }, MOI);
  assert.equal(P.lireDossier(d.id, MOI).statut, 'documents_en_cours');
  assert.equal(P.checklist(P.lireDossier(d.id, MOI)).envoyable, true, 'transférable sans être complet');
  const complet = P.ajouterPiece(d.id, 'taxe_fonciere', { filename: 'tf.pdf', url: '/uploads/tf.pdf' }, MOI).dossier;
  assert.equal(complet.statut, 'complet', 'la copropriété et le Kbis sont facultatifs');
  assert.equal(P.relanceProprietaire(complet), null);
  const s = await P.soumettreDossier(d.id, MOI);
  assert.equal(s.dossier.statut, 'en_etude');
  const deal = Records.findBy('Deal', 'deal_id', s.dossier.deal_id);
  assert.equal(deal.origine, 'mandataire');
  assert.equal(deal.mandataire_email, MOI.email);
  assert.equal(P.ajouterPiece(d.id, 'bail', { filename: 'b2.pdf', url: '/uploads/b2.pdf' }, MOI).dossier.statut, 'en_etude', 'à l’étude, une pièce s’ajoute encore');
  assert.equal(P.deciderDossier(d.id, { decision: 'no_go' }, ADMIN).ok, false, 'un no-go dit pourquoi');
  assert.equal(P.deciderDossier(d.id, { decision: 'go' }, MOI).ok, false, 'Klocka décide');
  const go = P.deciderDossier(d.id, { decision: 'go' }, ADMIN);
  assert.equal(go.dossier.statut, 'go');
  assert.equal(P.ajouterPiece(d.id, 'bail', { filename: 'b3.pdf', url: '/uploads/b3.pdf' }, MOI).ok, false, 'décidé, plus de pièce');
  assert.equal(go.marche.statut, 'preparation', 'la mise en marché naît du go');
});

test('compléments : retour à la checklist, puis de nouveau à l’étude', async () => {
  const { dossier: d } = P.creerDossier({ bien: 'Tabac du Pont' }, MOI);
  for (const p of P.PIECES.filter((x) => x.requise)) P.ajouterPiece(d.id, p.cle, { filename: 'x.pdf', url: `/uploads/${p.cle}-2.pdf` }, MOI);
  await P.soumettreDossier(d.id, MOI);
  assert.equal(P.deciderDossier(d.id, { decision: 'complements', commentaire: 'Il manque le PV d’AG 2025' }, ADMIN).dossier.statut, 'complements');
  assert.equal(P.ajouterPiece(d.id, 'copropriete', { filename: 'pv.pdf', url: '/uploads/pv.pdf' }, MOI).ok, true);
  const r = await P.soumettreDossier(d.id, MOI);
  assert.equal(r.dossier.statut, 'en_etude');
  assert.equal(Records.list('Deal').filter((x) => x.dossier_mandataire_id === d.id).length, 1, 'le même dossier Klocka, pas un second');
});

test('mise en marché : une étape à la fois, offres anonymes et validées avant d’être vues', () => {
  const m = Records.list('MiseEnMarche')[0];
  assert.equal(P.avancerMarche(m.id, 'offre', ADMIN).ok, false, 'pas de saut');
  assert.equal(P.avancerMarche(m.id, 'presente', MOI).ok, false, 'Klocka avance');
  assert.equal(P.avancerMarche(m.id, 'presente', ADMIN).marche.statut, 'presente');
  P.noterActivite(m.id, { type: 'dossier_ouvert', client_nom: 'Yann Jaffré' }, ADMIN);
  P.poserOffre(m.id, { montant: 420000, client_nom: 'Yann Jaffré' }, ADMIN);
  let vu = P.marcheVuParMandataire(P.lireMarche(m.id, MOI));
  assert.equal(vu.offres.length, 0, 'une offre non validée ne se voit pas');
  assert.doesNotMatch(JSON.stringify(vu), /Jaffr/);
  const offre = P.lireMarche(m.id, ADMIN).offres[0];
  assert.equal(P.validerOffre(m.id, offre.id, '', ADMIN).ok, false, 'l’argumentaire accompagne');
  const valide = P.validerOffre(m.id, offre.id, 'Acquéreur financé, sans condition suspensive', ADMIN).marche;
  assert.equal(valide.statut, 'offre');
  vu = P.marcheVuParMandataire(valide);
  assert.equal(vu.offres.length, 1);
  assert.doesNotMatch(JSON.stringify(vu), /Jaffr/);
  assert.equal(P.repondreOffre(m.id, offre.id, { reponse: 'acceptee' }, MOI).marche.offres[0].reponse, 'acceptee');
  assert.equal(P.noterSuiviActe(m.id, 'Relancer le notaire pour le DDT', MOI).ok, true);
  assert.equal(P.basculerSuiviActe(m.id, 0, MOI).marche.suivi_acte[0].fait, true);
  assert.equal(P.lireMarche(m.id, AUTRE), null);
});

test("la file de validation : ce qui attend Klocka, sans les estimations (elles sont aux mandataires)", () => {
  const { estimation: e } = P.creerEstimation({ bien: 'Pharmacie file' }, MOI);
  Records.update('EstimationMandataire', e.id, { rapport: { synthese: 'x' }, statut: 'en_validation', en_validation_le: new Date(Date.now() - 30 * 3600000).toISOString() });
  const file = P.fileDeValidation();
  assert.ok(!file.some((l) => l.genre === 'estimation'), "aucune estimation n'attend Klocka");
  assert.ok(file.some((l) => l.genre === 'dossier'), 'le dossier à l’étude y est');
});

test("une pièce jointe au chat se range dans le dossier du bien, ou sur l'estimation", async () => {
  const { executerOutilMandataire } = await import('./mandataire.js');
  const MOI2 = { email: 'piece@kpartners.fr', role: 'mandataire' };
  const piece = { nom: 'bail-martin.pdf', url: '/uploads/bail-martin.pdf' };
  assert.equal((await executerOutilMandataire({ name: 'ranger_piece', input: { bien: 'Boulangerie Martin', categorie: 'bail' } }, MOI2, { piece })).ok, false, 'pas de dossier, pas de création sans accord');
  const r = await executerOutilMandataire({ name: 'ranger_piece', input: { bien: 'Boulangerie Martin', categorie: 'bail', creer_si_absent: true } }, MOI2, { piece });
  assert.equal(r.ok, true);
  assert.match(r.pour, /il manque/);
  const r2 = await executerOutilMandataire({ name: 'ranger_piece', input: { bien: 'la boulangerie martin', categorie: 'quittances' } }, MOI2, { piece: { nom: 'q.pdf', url: '/uploads/q.pdf' } });
  assert.equal(r2.ok, true, 'le même dossier, retrouvé par ses mots');
  const d = P.listerDossiers(MOI2);
  assert.equal(d.length, 1);
  assert.deepEqual(Object.keys(d[0].documents).sort(), ['bail', 'quittances']);
  assert.equal((await executerOutilMandataire({ name: 'ranger_piece', input: { bien: 'X', categorie: 'bail' } }, MOI2, {})).ok, false, 'sans pièce jointe');
});

test("une offre ne se pose ni ne se transmet avant que le bien soit présenté", async () => {
  const { creerDossier, ajouterPiece, soumettreDossier, deciderDossier, poserOffre, avancerMarche } = await import('./mandataire-portes.js');
  const moi = { email: 'offres@test.fr', role: 'mandataire' };
  const admin = { email: 'a@klocka.immo', role: 'admin' };
  const d = creerDossier({ bien: 'Bien à offres' }, moi).dossier;
  for (const cat of ['bail', 'quittances', 'diagnostics', 'taxe_fonciere']) ajouterPiece(d.id, cat, { filename: `${cat}.txt`, url: `/uploads/x-${cat}.txt` }, moi);
  await soumettreDossier(d.id, moi, {});
  deciderDossier(d.id, { decision: 'go' }, admin);
  const m = Records.list('MiseEnMarche').find((x) => x.dossier_id === d.id);
  assert.equal(poserOffre(m.id, { montant: 100000, valider: true, argumentaire: 'x', client_nom: 'S' }, admin).ok, false, 'pas d\'offre en préparation');
  avancerMarche(m.id, 'presente', admin);
  assert.equal(poserOffre(m.id, { montant: 100000, valider: true, argumentaire: 'x' }, admin).ok, true, 'une fois présenté, oui');
});
