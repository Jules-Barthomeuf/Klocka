// Le classement ALX, éprouvé contre ses règles réelles.
//
// Trois piles, un motif, une trace : si une règle bouge dans signaux.json, ce
// test le dit avant qu'une cible parte dans la mauvaise pile.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classer, signauxDe, drapeauxDe, knockOutsDe, observableEnProspection, PILES } from './classement.js';

// Une horloge fixe : le 1er septembre 2026. Les tests ne vieillissent pas.
const MAINTENANT = new Date('2026-09-01T00:00:00Z').getTime();
const opts = { maintenant: MAINTENANT };
const ilYa = (mois) => new Date(MAINTENANT - mois * 30.44 * 24 * 3600 * 1000).toISOString();
const dans = (mois) => new Date(MAINTENANT + mois * 30.44 * 24 * 3600 * 1000).toISOString();

const CIBLE_NUE = { adresse: '12 rue de la Paix, Antibes', enseigne: 'Optic 2000', occupe: true };

test('sans rien, on surveille et on le dit', () => {
  const r = classer(CIBLE_NUE, opts);
  assert.equal(r.pile, 'surveiller');
  assert.match(r.motif, /Propriétaire à établir/);
  assert.ok(PILES.includes(r.pile));
});

test('un marchand de biens dans sa fenêtre est à appeler', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SAS Rivage' }, societe: { ape: '68.10Z' }, mutation: { date: ilYa(30) } }, opts);
  assert.equal(r.pile, 'appeler');
  assert.equal(r.signaux.forts[0].cle, 'marchand_fenetre');
  assert.match(r.signaux.forts[0].source, /inférence/, "c'est une déduction, la trace doit le dire");
});

test('le même marchand hors fenêtre n’est plus un signal', () => {
  assert.equal(signauxDe({ societe: { ape: '6810Z' }, mutation: { date: ilYa(10) } }, opts).forts.length, 0, 'encore en travaux');
  assert.equal(signauxDe({ societe: { ape: '6810Z' }, mutation: { date: ilYa(60) } }, opts).forts.length, 0, 'en difficulté, autre sujet');
});

test('un changement de gérant récent fait écrire, une procédure collective fait appeler', () => {
  // L'étude des vendeurs a mesuré l'événement récent à un lift de 1,4 : un
  // changement de gérance seul pèse 1, c'est un courrier. Une procédure
  // collective du propriétaire pèse 3 : un appel.
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SCI Tarte' }, evenements: [{ date: ilYa(2), type: 'changement de gérance', source: 'BODACC' }] }, opts);
  assert.equal(r.pile, 'ecrire');
  assert.equal(r.signaux.forts[0].poids, 1);
  const collective = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SCI Tarte' }, evenements: [{ date: ilYa(2), type: 'procédure collective', source: 'BODACC' }] }, opts);
  assert.equal(collective.pile, 'appeler');
  assert.equal(collective.signaux.forts[0].poids, 3);
  // Un décès de dirigeant, lu en clair dans l'avis : 2,5, un courrier qui ne traîne pas.
  const deces = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SCI Tarte' }, evenements: [{ date: ilYa(4), type: 'décès d’un dirigeant', source: 'BODACC' }] }, opts);
  assert.equal(deces.signaux.forts[0].poids, 2.5);
  assert.equal(deces.pile, 'ecrire');
  const vieux = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SCI Tarte' }, evenements: [{ date: ilYa(9), type: 'changement de gérance' }] }, opts);
  assert.notEqual(vieux.pile, 'appeler');
});

test('une échéance de bail dans les deux ans est un signal fort, passée elle ne l’est plus', () => {
  assert.equal(classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, bail_echeance: dans(14) }, opts).pile, 'appeler');
  assert.equal(classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, bail_echeance: dans(40) }, opts).pile, 'surveiller');
  assert.equal(classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, bail_echeance: ilYa(3) }, opts).pile, 'surveiller');
});

test('une SCI familiale ancienne est à écrire, pas à appeler', () => {
  const r = classer(
    { ...CIBLE_NUE, proprietaire: { nom: 'SCI Les Oliviers' }, societe: { creation: ilYa(12 * 28), gerants: [{ nom: 'Jean MARTIN', tranche_age: '70+' }, { nom: 'Claire MARTIN', tranche_age: '50-70' }] } },
    opts
  );
  assert.equal(r.pile, 'ecrire');
  assert.deepEqual(r.signaux.patients.map((s) => s.cle).sort(), ['detention_longue', 'famille', 'gerant_age']);
  assert.equal(r.signaux.forts.length, 0);
});

test('une famille se reconnaît telle que l’annuaire l’écrit', () => {
  // Ce que l'annuaire des entreprises a réellement rendu pour une SCI
  // d'Antibes : prénoms devant, tout en capitales, un nom d'usage entre
  // parenthèses. Trois PRETAZZINI, et la première version ne les voyait pas.
  const gerants = [
    { nom: 'MICHELLE NICOLE JOSEPHINE PRETAZZINI (BOSCA )', nom_famille: 'PRETAZZINI (BOSCA )', tranche_age: '70+', personne_morale: false },
    { nom: 'MARC JOSEPH CLAUDE PRETAZZINI', nom_famille: 'PRETAZZINI', tranche_age: '50-70', personne_morale: false },
    { nom: 'CLAUDE JEAN ALAIN PRETAZZINI', nom_famille: 'PRETAZZINI', tranche_age: '50-70', personne_morale: false },
  ];
  // Avec nom_famille tel quel, la mention d'usage fait deux familles : on la
  // retire aussi là. Le connecteur donne le nom brut de l'annuaire.
  const sansUsage = gerants.map((g) => ({ ...g, nom_famille: g.nom_famille.replace(/\([^)]*\)/g, '').trim() }));
  const s = signauxDe({ societe: { creation: ilYa(12 * 31), gerants: sansUsage } }, opts);
  assert.ok(s.patients.find((p) => p.cle === 'famille'), 'trois PRETAZZINI font une famille');
  assert.match(s.patients.find((p) => p.cle === 'famille').valeur, /3 gérants PRETAZZINI/);

  // Sans nom_famille (saisie libre en capitales), le dernier mot fait foi.
  const libre = gerants.map(({ nom_famille: _n, ...g }) => g);
  assert.ok(signauxDe({ societe: { gerants: libre } }, opts).patients.find((p) => p.cle === 'famille'));

  // Une personne morale gérante n'entre pas dans le compte.
  const pm = [{ nom: 'HOLDING PRETAZZINI', personne_morale: true }, { nom: 'MARC PRETAZZINI', nom_famille: 'PRETAZZINI' }];
  assert.equal(signauxDe({ societe: { gerants: pm } }, opts).patients.find((p) => p.cle === 'famille'), undefined);
});

test('vingt ans de détention chez un marchand ne compte pas comme patrimonial', () => {
  const s = signauxDe({ societe: { ape: '6810Z', creation: ilYa(300) } }, opts);
  assert.equal(s.patients.find((p) => p.cle === 'detention_longue'), undefined);
});

test('un loyer à 60 % du marché signale un bailleur passif', () => {
  const s = signauxDe({ loyer_m2_bail: 180, valorisation: { loyer_m2_marche: 300 } }, opts);
  assert.equal(s.patients[0]?.cle, 'loyer_bas');
  assert.equal(signauxDe({ loyer_m2_bail: 260, valorisation: { loyer_m2_marche: 300 } }, opts).patients.length, 0);
});

test('un usufruitier seul est écarté, même avec un signal fort', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x', droit: 'Usufruit' }, evenements: [{ date: ilYa(1), type: 'changement de gérance' }] }, opts);
  assert.equal(r.pile, 'ecartee');
  assert.match(r.motif, /Usufruit/);
});

test('un drapeau lent retient un signal fort en pile patiente', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SAS Rivage', droit: 'Indivision' }, societe: { ape: '6810Z' }, mutation: { date: ilYa(30) } }, opts);
  assert.equal(r.pile, 'ecrire');
  assert.match(r.motif, /dossier lent/);
  assert.ok(r.score.total >= 3, 'le score dit appeler, le drapeau retient');
});

test('le score additionne : deux indices moyens font un appel, un seul ne fait rien', () => {
  // Un locataire en procédure (3) suffit. Un siège ailleurs (0,7) seul ne
  // fait qu'écrire ; un gérant âgé seul (0,4) ne fait rien du tout.
  const loc = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, evenements_locataire: [{ date: ilYa(3), type: 'procédure collective', source: 'BODACC' }] }, opts);
  assert.equal(loc.pile, 'appeler');
  assert.equal(loc.signaux.forts[0].cle, 'locataire_en_difficulte');
  assert.match(loc.motif, /^Score 3 : le locataire est en procédure/);

  const siege = classer({ ...CIBLE_NUE, ville: 'Antibes', proprietaire: { nom: 'x' }, societe: { siege: { ville: 'Paris' } } }, opts);
  assert.equal(siege.pile, 'ecrire');
  assert.equal(siege.signaux.patients[0].cle, 'siege_ailleurs');

  const memeVille = classer({ ...CIBLE_NUE, ville: 'Antibes', proprietaire: { nom: 'x' }, societe: { siege: { ville: 'ANTIBES' } } }, opts);
  assert.equal(memeVille.signaux.patients.length, 0, 'même ville, écrite autrement : pas de signal');

  const age = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, societe: { gerants: [{ nom: 'Jean MARTIN', tranche_age: '70+' }] } }, opts);
  assert.equal(age.pile, 'surveiller');
  assert.match(age.motif, /Indices faibles, sous le seuil/);

  // Gérance récente (1) + siège ailleurs (0,7) + gérant âgé (0,4) + famille (0,4) = 2,5 : toujours un courrier ;
  // avec vingt-huit ans de détention (0,5), 3 : un appel. Cinq indices faibles font ce qu'un seul ne fait pas.
  const cumul = { ...CIBLE_NUE, ville: 'Antibes', proprietaire: { nom: 'x' }, societe: { siege: { ville: 'Paris' }, gerants: [{ nom: 'Jean MARTIN', tranche_age: '70+' }, { nom: 'Luc MARTIN' }] }, evenements: [{ date: ilYa(2), type: 'changement de gérance' }] };
  assert.equal(classer(cumul, opts).pile, 'ecrire');
  assert.equal(classer(cumul, opts).score.total, 2.5);
  const ancienne = classer({ ...cumul, societe: { ...cumul.societe, creation: ilYa(12 * 28) } }, opts);
  assert.equal(ancienne.pile, 'appeler');
  assert.equal(ancienne.score.total, 3);
  // Un lot voisin vendu est dans la trace, à poids nul : DVF l'a mesuré sans effet.
  const voisin = classer({ ...cumul, mutation_voisine: { date: ilYa(6), type_local: 'Appartement' } }, opts);
  assert.equal(voisin.score.total, 2.5);
  assert.ok(voisin.score.contributions.find((x) => x.cle === 'voisin_mute' && x.poids === 0));
});

test('chaque contribution se lit dans le score, avec son poids', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'SAS Rivage' }, societe: { ape: '68.10Z', siege: { ville: 'Lyon' } }, ville: 'Antibes', mutation: { date: ilYa(30) } }, opts);
  assert.deepEqual(r.score.contributions.map((c) => [c.cle, c.poids]), [['marchand_fenetre', 3], ['siege_ailleurs', 0.7]]);
  assert.equal(r.score.total, 3.7);
  assert.match(r.motif, /marchand de biens dans sa fenêtre de revente \(30 mois après la mutation\) \+3, siège de la société dans une autre commune \(siège à Lyon\) \+0,7/);
});

test('les faits passent avant le score', () => {
  // Un locataire en procédure (3) sur un local vide : le knock-out l'emporte.
  const r = classer({ ...CIBLE_NUE, occupe: false, evenements_locataire: [{ date: ilYa(1), type: 'procédure collective' }] }, opts);
  assert.equal(r.pile, 'ecartee');
  // Usufruit : bloquant, quel que soit le score.
  const u = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x', droit: 'Usufruit' }, societe: { ape: '6810Z' }, mutation: { date: ilYa(30) } }, opts);
  assert.equal(u.pile, 'ecartee');
});

test('deux signaux ne s’observent que sur un dossier, et le disent', () => {
  assert.equal(observableEnProspection('echeance_proche'), false);
  assert.equal(observableEnProspection('loyer_bas'), false);
  assert.equal(observableEnProspection('marchand_fenetre'), true);
  assert.equal(observableEnProspection('signal_inconnu'), true, 'un signal absent du fichier n’est pas déclaré inobservable');
});

test('un lot voisin vendu récemment est un signal patient, pas au-delà de deux ans', () => {
  const s = signauxDe({ mutation_voisine: { date: ilYa(10), type_local: 'Appartement' } }, opts);
  assert.equal(s.patients[0]?.cle, 'voisin_mute');
  assert.match(s.patients[0].valeur, /Appartement vendu le/);
  assert.equal(signauxDe({ mutation_voisine: { date: ilYa(30), type_local: 'Appartement' } }, opts).patients.length, 0);
});

test('fermé sur Maps est un drapeau d’information, ni signal ni knock-out', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, occupant: { nom: 'Chez Lulu', ferme: true } }, opts);
  assert.equal(r.pile, 'surveiller');
  assert.ok(r.drapeaux.find((d) => d.cle === 'fermeture_maps' && d.effet === 'information'));
});

test('une indivision successorale est un vivier, pas un obstacle', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x', droit: 'Indivision', indivision_successorale: true } }, opts);
  assert.equal(r.pile, 'ecrire');
  assert.equal(drapeauxDe(r && { proprietaire: { droit: 'Indivision', indivision_successorale: true } })[0].effet, 'patient');
});

test('les knock-outs sortent la cible avant tout', () => {
  assert.equal(classer({ ...CIBLE_NUE, activite_exclue: true, activite: 'bar de nuit', evenements: [{ date: ilYa(1), type: 'gérance' }] }, opts).pile, 'ecartee');
  assert.equal(classer({ ...CIBLE_NUE, occupe: false }, opts).pile, 'ecartee');
  assert.equal(knockOutsDe({ valorisation: { fourchette: [1200000, 1500000] } })[0].cle, 'hors_prix');
  assert.equal(knockOutsDe({ valorisation: { fourchette: [150000, 250000] } }).length, 0, 'une fourchette qui touche le périmètre reste dedans');
});

test('le droit de préférence est une information, jamais un blocage', () => {
  const d = drapeauxDe({ occupe: true });
  assert.equal(d.find((x) => x.cle === 'droit_preference')?.effet, 'information');
  assert.equal(classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' } }, opts).pile, 'surveiller');
});

test('chaque décision porte sa trace complète', () => {
  const r = classer({ ...CIBLE_NUE, proprietaire: { nom: 'x' }, societe: { ape: '6810Z' }, mutation: { date: ilYa(24) } }, opts);
  for (const cle of ['pile', 'motif', 'signaux', 'drapeaux', 'knock_outs']) assert.ok(cle in r, cle);
  assert.ok(r.signaux.forts[0].source && r.signaux.forts[0].valeur);
});
