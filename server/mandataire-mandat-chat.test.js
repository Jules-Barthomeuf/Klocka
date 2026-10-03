// Le chat du Mandat : la lecture des réponses, ce qui manque, le cycle
// brouillon → envoi, le cloisonnement. Sans réseau ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mandat-chat-'));
process.env.MYNOTARY_AGENT = '0';
const { Records } = await import('./db.js');
const { nombreDit, nettoyerReponses, manquantsMandat, nomMandant, commencerMandat, noterMandat, envoyerMandat, apercuMandat } = await import('./mandataire-mandat-chat.js');

const A = { email: 'a@kpartners.fr', role: 'mandataire' };
const B = { email: 'b@kpartners.fr', role: 'mandataire' };

test('nombreDit lit les nombres comme on les dit', () => {
  assert.equal(nombreDit('450 000 €'), 450000);
  assert.equal(nombreDit('450 000'), 450000);
  assert.equal(nombreDit('5 %'), 5);
  assert.equal(nombreDit('5,5 %'), 5.5);
  assert.equal(nombreDit('12 mois'), 12);
  assert.equal(nombreDit('1.250.000'), 1250000);
  assert.equal(nombreDit('rien'), null);
});

test('nettoyerReponses : types, unités, et ce qui ne se lit pas', () => {
  const { propres, illisibles } = nettoyerReponses({
    type_mandat: 'semi exclusif', prix: '450 000 €', honoraires: '5 %', honoraires_charge: "à la charge de l'acquéreur",
    duree_mois: '12 mois', bien_occupe: 'occupé', vendeur_siren: '932 230 394', bien_surface: 'beaucoup', cle_inconnue: 'x',
  });
  assert.equal(propres.type_mandat, 'semi_exclusif');
  assert.equal(propres.prix, 450000);
  assert.equal(propres.honoraires, 5);
  assert.equal(propres.honoraires_unite, '%');
  assert.equal(propres.honoraires_charge, 'acquereur');
  assert.equal(propres.duree_mois, 12);
  assert.equal(propres.bien_occupe, true);
  assert.equal(propres.vendeur_siren, '932230394');
  assert.deepEqual(illisibles, ['bien_surface'], 'une surface sans chiffre se redemande');
  assert.equal('cle_inconnue' in propres, false, 'une clé inconnue est ignorée');
  assert.equal(nettoyerReponses({ honoraires: '15 000 €' }).propres.honoraires_unite, '€');
});

test('manquantsMandat et nomMandant', () => {
  assert.equal(manquantsMandat({}).length, 9);
  const complet = { type_mandat: 'exclusif', vendeur_societe: 'SCI du Pont', vendeur_adresse: '1 rue X', bien_adresse: '12 rue Carnot, Mâcon', bien_designation: 'Local commercial', prix: 450000, honoraires: 5, honoraires_charge: 'vendeur', duree_mois: 12 };
  assert.deepEqual(manquantsMandat(complet), []);
  assert.equal(nomMandant({ vendeur_forme: 'SCI', vendeur_societe: 'du Pont' }), 'SCI du Pont');
  assert.equal(nomMandant({ vendeur_civilite: 'M.', vendeur_prenom: 'Jean', vendeur_nom: 'Martin' }), 'M. Jean Martin');
  assert.equal(nomMandant({}), null);
  assert.equal(nomMandant({ vendeur_forme: 'SCI', vendeur_societe: 'SCI du Pont' }), 'SCI du Pont', 'la forme ne se répète pas');
});

test('le cycle : commencer, noter, envoyer (agent éteint → file Klocka)', async () => {
  const conv = 'conv-mandat-1';
  const c = commencerMandat({ bien: 'Boulangerie Martin' }, A, conv);
  assert.equal(c.ok, true);
  assert.equal(commencerMandat({ bien: 'x' }, A, conv).deja, true, 'un seul mandat par conversation');
  const n1 = noterMandat({ type_mandat: 'exclusif', prix: '450 000 €' }, A, conv);
  assert.equal(n1.ok, true);
  assert.ok(n1.manquants.length > 0);
  const avant = await envoyerMandat(A, conv);
  assert.equal(avant.ok, false, 'incomplet : on ne l’envoie pas');
  assert.ok(avant.manquants.length > 0);
  noterMandat({ vendeur_civilite: 'M.', vendeur_prenom: 'Jean', vendeur_nom: 'Martin', vendeur_adresse: '3 rue Y, Mâcon', bien_adresse: '12 rue Carnot, Mâcon', bien_designation: 'Local commercial en rez-de-chaussée', honoraires: '5 %', honoraires_charge: 'vendeur', duree_mois: 12 }, A, conv);
  const r = await envoyerMandat(A, conv);
  assert.equal(r.ok, true);
  assert.equal(r.statut, 'demande_envoyee');
  assert.equal(r.en_file, true, 'agent éteint : l’équipe saisit');
  const m = Records.get('MandatMandataire', c.mandat_id);
  assert.equal(m.vendeur, 'M. Jean Martin');
  assert.equal(m.prix, 450000);
  assert.equal(m.type, 'exclusif');
  assert.equal(noterMandat({ prix: 1 }, A, conv).ok, false, 'parti : il ne se renote plus par le chat');
  assert.equal((await envoyerMandat(A, conv)).deja, true, 'pas de double envoi');
});

test('cloisonnement : B ne voit ni ne touche le mandat de A', async () => {
  const conv = 'conv-mandat-2';
  const c = commencerMandat({ bien: 'Presse du Centre' }, A, conv);
  assert.equal(apercuMandat(c.mandat_id, B).ok, false);
  assert.equal(apercuMandat(c.mandat_id, A).ok, true);
  assert.equal(noterMandat({ prix: '100 000' }, B, conv).ok, false, 'la conversation de A ne sert pas B');
  assert.equal(apercuMandat(c.mandat_id, { email: 'admin@klocka.immo', role: 'admin' }).ok, true, 'l’admin voit tout');
});

test('annuler / rétablir : aller-retour exact, et jamais sur le mandat d’un autre', async () => {
  const { naviguerMandat } = await import('./mandataire-mandat-chat.js');
  const conv = 'conv-mandat-3';
  const c = commencerMandat({ bien: 'Tabac du Port' }, A, conv);
  noterMandat({ prix: '200 000' }, A, conv);
  noterMandat({ prix: '210 000' }, A, conv);
  assert.equal(naviguerMandat(c.mandat_id, 'annuler', B).ok, false, 'B ne défait pas le mandat de A');
  assert.equal(Records.get('MandatMandataire', c.mandat_id).questionnaire.prix, 210000, 'intact après la tentative de B');
  const r1 = naviguerMandat(c.mandat_id, 'annuler', A);
  assert.equal(r1.ok, true);
  assert.equal(r1.questionnaire.prix, 200000);
  const r2 = naviguerMandat(c.mandat_id, 'retablir', A);
  assert.equal(r2.questionnaire.prix, 210000, 'rétablir revient exactement');
  assert.equal(naviguerMandat(c.mandat_id, 'retablir', A).ok, false, 'plus rien à rétablir');
});
