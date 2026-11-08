// Le mandat de location (6 nov. 2026, Jules : « adapte celui qui est actuellement utilisé pour la vente en location ») :
// le chat demande les champs du bail, pas le prix ; le mandat signé ne parle pas du droit de préférence. Sans réseau
// ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mandat-location-'));
process.env.NODE_TEST_CONTEXT = '1';
process.env.MYNOTARY_AGENT = '0';
const { Records } = await import('./db.js');
const C = await import('./mandataire-mandat-chat.js');
const { messageMandatSigne } = await import('./mandat-signe.js');

const moi = { email: 'lea@kpartners.fr', role: 'mandataire' };
const debut = (liste) => liste.map((m) => m.split(' ').slice(0, 3).join(' '));

test('en location, ce qui manque : le loyer et les conditions du bail, jamais le prix', () => {
  const reste = C.manquantsMandat({ transaction: 'location' });
  const tout = reste.join(' | ');
  for (const mot of ['loyer annuel', 'dépôt de garantie', 'destination autorisée', 'date de disponibilité', 'charges sont refacturées', 'taxe foncière', 'charge des honoraires (preneur ou bailleur)', 'durée du mandat']) {
    assert.ok(tout.includes(mot), `il manque « ${mot} »`);
  }
  assert.doesNotMatch(tout, /prix|TVA|loué|locataire en place/);
  // La vente ne bouge pas.
  assert.equal(C.manquantsMandat({}).length, 11);
  assert.match(C.manquantsMandat({}).join(' | '), /le prix de vente/);
});

test('en location, les réponses se lisent : loyer à l’année, refacturations, preneur et bailleur', () => {
  const { propres, illisibles } = C.nettoyerReponses({
    loyer: '2 500 € par mois', charges_refacturees: 'oui, au locataire', taxe_fonciere_refacturee: 'non refacturée',
    depot_garantie: '3 mois de loyer', bail_duree: '3-6-9', destination: 'Tous commerces sauf restauration', disponibilite: '1er janvier 2027',
    honoraires: '15 %', honoraires_charge: 'acquéreur',
  }, { location: true });
  assert.deepEqual(illisibles, []);
  assert.equal(propres.loyer, 30000);
  assert.equal(propres.charges_refacturees, true);
  assert.equal(propres.taxe_fonciere_refacturee, false);
  assert.equal(propres.honoraires_charge, 'preneur', 'l’acquéreur dit en location, c’est le preneur');
  assert.equal(C.nettoyerReponses({ honoraires_charge: 'le bailleur' }, { location: true }).propres.honoraires_charge, 'bailleur');
  // En vente, preneur et bailleur ne se lisent pas : rien ne change pour un bien à vendre.
  assert.deepEqual(C.nettoyerReponses({ honoraires_charge: 'locataire' }).illisibles, ['honoraires_charge']);
  assert.equal(C.nettoyerReponses({ honoraires_charge: 'acquéreur' }).propres.honoraires_charge, 'acquereur');
});

test('la consigne du chat en location demande les champs du bail, sans prix ni FAI', () => {
  const c = C.consigneMandat(true);
  assert.match(c, /MANDAT DE LOCATION/);
  for (const mot of ['loyer annuel demandé hors taxes et hors charges', 'dépôt de garantie', '3-6-9', 'destination autorisée', 'date de disponibilité', '15 % HT du loyer annuel HT HC, à la charge du preneur']) {
    assert.ok(c.includes(mot), `la consigne dit « ${mot} »`);
  }
  assert.doesNotMatch(c, /FAI|prix de vente, TVA/);
  assert.match(C.consigneMandat(false), /MANDAT DE VENTE/);
});

test('un bien à louer : le mandat se prépare en location, honoraires du preneur à 15 %', () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: moi.email, nom: 'Jean Paul', statut: 'rdv_pris', biens: { transaction: 'location' }, historique: [] });
  const e = Records.create('EstimationMandataire', {
    mandataire_email: moi.email, bien: 'Local · 12 rue Carnot, Antibes', adresse: '12 rue Carnot, 06600 Antibes', statut: 'envoye', proprietaire_id: p.id,
    questionnaire: { surface_utile: 80, occupe: true, locataire: 'Ancien', activite_locataire: 'Brasserie' }, avis: { chiffres: { valeur: 400000, honoraires_pct: 5 } },
  });
  const r = C.preparerMandat({ estimation_id: e.id }, moi);
  assert.equal(r.ok, true);
  const m = Records.get('MandatMandataire', r.mandat_id);
  const q = m.questionnaire;
  assert.equal(q.transaction, 'location');
  assert.equal(q.bien_designation, "Local commercial d'environ 80 m²");
  assert.equal(q.honoraires, 15);
  assert.equal(q.honoraires_charge, 'preneur');
  assert.equal(q.prix, undefined, 'pas de prix de vente');
  assert.equal(q.bien_locataire, undefined, 'pas de locataire en place');
  assert.equal(C.mandatDeLocation(m), true);
  assert.deepEqual(debut(C.manquantsMandat(q)).slice(0, 2), ['le type de', "l'adresse du mandant"]);
  assert.ok(!C.manquantsMandat(q).some((x) => /honoraires/.test(x)), 'les honoraires par défaut sont posés');
  // L'aperçu dit la location, même d'un questionnaire qui ne la portait pas encore.
  Records.update('MandatMandataire', m.id, { questionnaire: { ...q, transaction: undefined } });
  assert.equal(C.apercuMandat(m.id, moi).questionnaire.transaction, 'location');
});

test('un mandat de location commencé dans le chat, complété puis envoyé : un loyer, pas de prix', async () => {
  const r = C.commencerMandat({ bien: 'Local rue Carnot', transaction: 'location' }, moi, 'conv-loc');
  const n = C.noterMandat({
    type_mandat: 'exclusif', vendeur_nom: 'Martin', vendeur_adresse: '1 rue A, Antibes', bien_adresse: '12 rue Carnot, Antibes', bien_designation: 'Local commercial',
    loyer: 30000, charges_refacturees: 'oui', taxe_fonciere_refacturee: 'non', depot_garantie: '3 mois', destination: 'Commerce de détail', disponibilite: 'immédiate', duree_mois: 12,
  }, moi, 'conv-loc');
  assert.equal(n.mandat_id, r.mandat_id);
  assert.deepEqual(n.manquants, []);
  const envoi = await C.envoyerMandat(moi, 'conv-loc');
  assert.equal(envoi.ok, true);
  const m = Records.get('MandatMandataire', r.mandat_id);
  assert.equal(m.transaction, 'location');
  assert.equal(m.loyer, 30000);
  assert.equal(m.prix, null);
  assert.equal(m.honoraires_charge, 'preneur');
});

test('mandat de location signé : ni droit de préférence, ni investisseurs, ni teaser ; les pièces, les photos, la fiche, les candidats', () => {
  const avecPieces = messageMandatSigne({ location: true, occupe: true, manquantes: ['Diagnostics'], deja: [{ cle: 'plans', mot: 'Plans et surfaces' }], priorite: null });
  assert.doesNotMatch(avecPieces, /préférence|investisseur|teaser|Klocka/i);
  assert.match(avecPieces, /Pour le louer, il faut réunir le DPE, le règlement de copropriété \(il doit permettre la destination prévue\) et la dernière taxe foncière\./);
  assert.match(avecPieces, /On a déjà les plans/);
  assert.match(avecPieces, /six à huit photos.*la fiche de présentation, puis la recherche de candidats\.$/);
  const complet = messageMandatSigne({ location: true, occupe: true, manquantes: [], photos: 8 });
  assert.doesNotMatch(complet, /préférence|investisseur|teaser/i);
  assert.match(complet, /On prépare la fiche de présentation \? Ensuite, on lance la recherche de candidats\.$/);
  // La vente garde son droit de préférence.
  assert.match(messageMandatSigne({ occupe: true, manquantes: ['Le bail'] }), /droit de préférence/);
});
