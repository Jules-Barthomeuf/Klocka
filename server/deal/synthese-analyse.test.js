// Le module d'analyse, onglet Synthèse (spec du 17 oct. 2026) : documents, croisements,
// signalements et bloquants, décisions, validation. Exemple : le dossier ADG Bordeaux de la spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-synthese-'));
const { Records } = await import('../db.js');
const S = await import('./synthese-analyse.js');

const champ = (valeur) => ({ valeur, absent: false });
const lotADG = { prix_fai: champ(230000), loyer_annuel_ht_hc: champ(18000), locataire_nom: champ('ADG SARL'), surface_m2: champ(52) };
const valeursADG = {
  bail: {
    loyer_signature: { annuel_ht: 18000, texte: '18 000 € / an' }, tva: { oui: true }, mode_reglement: { periodicite: 'mensuel' },
    parties: { texte: 'ADG SARL, conforme' }, destination: { texte: 'Coiffure, barbier, vente de produits capillaires' },
    charges_bailleur: { items: ['Art. 606', 'Ravalement'], seulement_606: false }, taxes: { taxe_fonciere_refacturee: false },
  },
  quittances: { loyer_hc_ht: { montant: 1500, periodicite: 'mensuel' }, tva: { oui: true }, provision: { montant: 95, mentionnee: true } },
  pv_ag: { travaux_votes: { texte: 'Toiture, 48 000 €, quote-part 3 200 €, appel 2026', article_606: true } },
  rcp: { activites_interdites: { texte: 'Restauration avec extraction', presentes: true } },
  diagnostics: { dtg: { texte: '' } },
};
const grille = (id, lignes = []) => ({ id, valeurs_brutes: valeursADG[id] || {}, lignes });
const grillesADG = {
  bail: grille('bail', [
    { id: 'charges_bailleur', libelle: 'Charges et travaux restant au bailleur', valeur: 'Art. 606 et ravalement', statut: 'warning', statut_calcule: 'warning', motif: 'Le bailleur garde des charges au-delà de l\'article 606.', lue_dans: 'Bail p. 7' },
    { id: 'taxes', libelle: 'Taxes refacturées', valeur: 'NON', statut: 'warning', statut_calcule: 'warning', motif: 'La taxe foncière n\'est pas refacturable.', lue_dans: 'Bail p. 8' },
    { id: 'tva', libelle: 'Loyer assujetti à TVA', valeur: 'OUI', statut: 'a_checker', statut_calcule: 'ok' },
  ]),
  quittances: grille('quittances', []),
  pv_ag: grille('pv_ag', [{ id: 'travaux_votes', libelle: 'Travaux votés', valeur: 'Toiture, 48 000 €', statut: 'warning', statut_calcule: 'warning', motif: 'Gros travaux votés (606).', lue_dans: 'PV AG 2025 p. 3' }]),
  rcp: grille('rcp', [{ id: 'activites_interdites', libelle: 'Activités non autorisées', valeur: 'Restauration avec extraction', statut: 'a_verifier', statut_calcule: 'a_verifier', motif: 'À confronter à celle du preneur.' }]),
  diagnostics: grille('diagnostics', []),
};

test('les croisements ADG : loyer cohérent (fiche, bail, quittances × 12), TVA, fréquence, activité non interdite', () => {
  const c = S.croisements({ v: valeursADG, lot: lotADG });
  const loyer = c.find((x) => x.cle === 'loyer');
  assert.equal(loyer.ecart, false);
  assert.match(loyer.sources[2].valeur, /18 000 € \(1 500 € × 12\)/);
  assert.equal(c.find((x) => x.cle === 'tva').ecart, false);
  assert.equal(c.find((x) => x.cle === 'frequence').ecart, false);
  assert.equal(c.find((x) => x.cle === 'activite').ecart, false, 'coiffure n\'est pas de la restauration');
  assert.equal(c.find((x) => x.cle === 'travaux').ecart, true);
  assert.equal(c.find((x) => x.cle === 'taxe_fonciere').ecart, true);
});

test('un loyer différent de plus de 2 % se signale ; une activité interdite par le règlement bloque', () => {
  const v = { ...valeursADG, quittances: { loyer_hc_ht: { montant: 1600, periodicite: 'mensuel' } }, bail: { ...valeursADG.bail, destination: { texte: 'Restauration traditionnelle avec extraction' } } };
  const c = S.croisements({ v, lot: lotADG });
  assert.equal(c.find((x) => x.cle === 'loyer').ecart, true);
  const act = c.find((x) => x.cle === 'activite');
  assert.equal(act.ecart, true);
  assert.equal(act.bloquant, true);
  assert.match(act.motif, /restauration/);
});

test('la synthèse ADG : verdict, signalements par onglet, documents, puis validation quand tout est traité', () => {
  const docs = [{ nom: 'Bail commercial ADG.pdf', categorie: 'Bail commercial' }, { nom: 'Quittances 2025.pdf', categorie: 'Quittances' }, { nom: 'DPE.pdf', categorie: 'Diagnostics' }];
  let s = S.synthese({ grilles: grillesADG, lot: lotADG, documents: docs });
  assert.equal(s.verdict.bloquants, 0);
  assert.equal(s.verdict.rendement, 7.8);
  assert.ok(s.verdict.signalements >= 5, `${s.verdict.signalements} signalements`);
  assert.equal(s.verdict.traites, 0);
  assert.equal(s.validable, false);
  assert.ok(s.documents.liste.find((d) => d.cle === 'bail').recu);
  assert.ok(!s.documents.liste.find((d) => d.cle === 'kbis').recu);
  assert.ok(s.par_onglet.bail >= 2);
  const decisions = Object.fromEntries(s.signalements.map((x) => [x.cle, { decision: 'accepter' }]));
  s = S.synthese({ grilles: grillesADG, lot: lotADG, documents: docs, decisions });
  assert.equal(s.verdict.traites, s.verdict.signalements);
  assert.equal(s.validable, true);
});

test('rendement brut sous 5 % : bloquant, impossible à traiter, la validation reste fermée', () => {
  const lot = { ...lotADG, prix_fai: champ(400000) };
  const s = S.synthese({ grilles: grillesADG, lot, decisions: { 'bien.rendement': { decision: 'accepter' } } });
  const b = s.signalements.find((x) => x.cle === 'bien.rendement');
  assert.equal(b.niveau, 'bloquant');
  assert.equal(b.decision, null);
  assert.equal(s.validable, false);
  // Le loyer retenu par l'analyste entre dans le calcul.
  const s2 = S.synthese({ grilles: grillesADG, lot, retenues: { loyer: { valeur: '24 000 €' } } });
  assert.ok(!s2.signalements.some((x) => x.cle === 'bien.rendement'), '24 000 / 400 000 = 6 %');
});

test('les gestes : retenir, décider (motif obligatoire pour écarter), demander un document, valider ; tout va à l\'historique', async () => {
  const d = Records.create('Deal', { deal_id: 'adg', nom: 'ADG Bordeaux', statut: 'documents_recus', lots: [{ lot: lotADG }] });
  const jules = { email: 'jules@klocka.immo' };
  assert.equal(S.retenir('adg', 'loyer', { valeur: '18 000 €', source: 'Bail' }, jules).ok, true);
  assert.equal(S.decider('adg', 'bail.taxes', { decision: 'ecarter' }, jules).statut, 400);
  assert.equal(S.decider('adg', 'bail.taxes', { decision: 'ecarter', motif: 'Le vendeur prend la taxe à sa charge' }, jules).ok, true);
  assert.equal(S.decider('adg', 'pv_ag.travaux_votes', { decision: 'negocier' }, jules).ok, true);
  assert.deepEqual(S.demanderDocument('adg', 'kbis', jules).demandes, ['kbis']);
  const s = await S.syntheseDu('adg');
  assert.ok(s.documents.liste.find((x) => x.cle === 'kbis').demande);
  const v = await S.valider('adg', jules);
  assert.equal(v.ok, true, v.error);
  assert.equal(Records.get('Deal', d.id).statut, 'depouille');
  assert.ok(Records.get('Deal', d.id).fiche_deal);
  const h = S.historique('adg');
  assert.equal(h[0].type, 'validation');
  assert.ok(h.some((x) => x.type === 'decision' && /Écarter \(Le vendeur prend la taxe/.test(x.texte)));
  assert.ok(h.some((x) => x.type === 'document'));
});

test('nombreDe et checklistDocuments', () => {
  assert.equal(S.nombreDe('18 000 € / an'), 18000);
  assert.equal(S.nombreDe('Toiture, 48 000 €'), 48000);
  assert.equal(S.nombreDe('aucun'), null);
  const l = S.checklistDocuments([], { copropriete: false });
  assert.ok(!l.some((x) => x.cle === 'rcp'), 'sans copropriété, pas de règlement attendu');
});

test('une valeur corrigée à la main l\'emporte sur la lecture dans les croisements', () => {
  const c = S.croisements({ v: valeursADG, lot: lotADG, corrections: { 'quittances.loyer_hc_ht': '1 600 € par mois' } });
  const loyer = c.find((x) => x.cle === 'loyer');
  assert.match(loyer.sources[2].valeur, /19 200 €/);
  assert.equal(loyer.ecart, true);
});
