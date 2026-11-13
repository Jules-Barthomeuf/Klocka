import test from 'node:test';
import assert from 'node:assert/strict';
import { montants, sansCode, teteEtSuite, suiteCourte, sourceCourte, chiffreDe, effectifLisible, teteProcedure } from '../../src/lib/marche-texte.js';

test('une procédure se lit en deux temps : son nom, puis quand', () => {
  assert.deepEqual(teteProcedure('Aucune procédure collective en 5 ans'), ['Aucune', '']);
  assert.deepEqual(teteProcedure('Liquidation judiciaire prononcée le 16/07/2025 (2 avis en 5 ans)'), ['Liquidation judiciaire', 'prononcée le 16/07/2025 (2 avis en 5 ans)']);
  assert.deepEqual(teteProcedure('Redressement judiciaire ouvert le 10/01/2025'), ['Redressement judiciaire', 'ouvert le 10/01/2025']);
  assert.deepEqual(teteProcedure('Sous plan de redressement arrêté le 01/03/2021'), ['Sous plan de redressement', 'arrêté le 01/03/2021']);
  assert.deepEqual(teteProcedure("Une procédure collective passée : dépôt de l'état des créances le 22/12/2021, à vérifier"), ["Une procédure collective passée : dépôt de l'état des créances", 'le 22/12/2021, à vérifier']);
  assert.deepEqual(teteProcedure(''), ['', '']);
});

test('la tranche d\'effectif se lit en mots', () => {
  assert.equal(effectifLisible('12'), '20 à 49 salariés');
  assert.equal(effectifLisible('00'), '0 salarié');
  assert.equal(effectifLisible('NN'), null);
  assert.equal(effectifLisible(null), null);
});

test('un compte se lit comme un chiffre, et la suite se réduit au jugement quand le visuel porte les nombres', () => {
  assert.deepEqual(teteEtSuite('6 exploitants en dix ans pour 4 cellules : local stable'), ['6 exploitants', 'en dix ans pour 4 cellules : local stable']);
  assert.deepEqual(teteEtSuite('519 127 habitants à Lyon'), ['519 127 habitants', 'à Lyon']);
  assert.equal(suiteCourte('face à une moyenne de 304 €/m²/an dans la rue (200m), de 211 à 260 : 74 % au-dessus du marché : risque de baisse au renouvellement'), '74 % au-dessus du marché : risque de baisse au renouvellement');
  assert.equal(suiteCourte('81 % au-dessus de la médiane des ventes (5 065 €/m², 9 ventes, 300 m) · surévalué, confiance moyenne'), '81 % au-dessus de la médiane des ventes · surévalué, confiance moyenne');
  assert.equal(suiteCourte('brut face à un taux de marché de 7,5 % (-1,74 pt)'), 'brut face à un taux de marché de 7,5 %');
  assert.equal(suiteCourte('(provisoire : peu de lectures)'), '(provisoire : peu de lectures)');
  assert.equal(suiteCourte('des commerces ouverts sont des enseignes nationales (Crédit Mutuel, Maxi Bazar, Nike)'), 'des commerces ouverts sont des enseignes nationales');
  assert.equal(suiteCourte('sur la rue (4 vides sur 43 locaux)'), 'sur la rue');
  assert.equal(suiteCourte(''), '');
});
import { texteDouteux, controlerPoint, controlerLancement, POINTS_ATTENDUS } from './controle.js';

test('les montants passent en k€ et M€ avec le vrai signe moins, les €/m² restent', () => {
  assert.equal(montants('95 000 €'), '95 k€');
  assert.equal(montants('1 250 000 €'), '1,25 M€');
  assert.equal(montants('-12 500 €'), '−13 k€');
  assert.equal(montants('450 €/m²/an'), '450 €/m²/an');
  assert.equal(montants('3 200 €/m² au-dessus'), '3 200 €/m² au-dessus');
  assert.equal(montants('1 500 €'), '1 500 €');
});

test('un message de service se dit sans code', () => {
  assert.equal(sansCode('Google Maps a répondu 403.'), "Google Maps indisponible pour l'instant.");
  assert.equal(sansCode('Pas de fiche Google à ce nom.'), 'Pas de fiche Google à ce nom.');
});

test('le chiffre se lit avant la phrase', () => {
  assert.deepEqual(teteEtSuite('528 €/m²/an face à une moyenne de 420 €/m²/an : 26 % au-dessus'), ['528 €/m²/an', 'face à une moyenne de 420 €/m²/an : 26 % au-dessus']);
  assert.deepEqual(teteEtSuite('7,5 / 10 (provisoire)'), ['7,5/10', '(provisoire)']);
  assert.deepEqual(teteEtSuite('9,3 % sur la rue (4 vides sur 43 locaux)'), ['9,3 %', 'sur la rue (4 vides sur 43 locaux)']);
  assert.deepEqual(teteEtSuite('PKF LYON REPUBLIQUE · SAS · créée en 2019'), ['PKF LYON REPUBLIQUE', 'SAS · créée en 2019']);
  assert.deepEqual(teteEtSuite('Aucune procédure collective en 5 ans'), ['Aucune procédure collective en 5 ans', '']);
  assert.deepEqual(teteEtSuite('4,3 sur 5, 1 200 avis (« KFC »)'), ['4,3 sur 5, 1 200 avis (« KFC »)', '']);
});

test('la source tient en quelques mots', () => {
  assert.equal(sourceCourte('médiane de 12 taux validés à Lyon (avis de l\'équipe)'), 'Taux Klocka');
  assert.equal(sourceCourte('Stock SIRENE géolocalisé (INSEE) et Annuaire des entreprises'), 'Stock SIRENE géolocalisé et Annuaire des entreprises');
  assert.equal(sourceCourte(null), '—');
});

test('le chiffre de la bande : écart du loyer, du prix, note de passage, procédure du locataire', () => {
  const l = (cle, points, statut = 'ok') => ({ cle, lancement: { statut: 'fini', resultat: { statut, points } } });
  assert.equal(chiffreDe(l('loyer', [{ cle: 'loyer_marche', resultat: '528 €/m²/an : 26 % au-dessus du marché' }])), '+26 %');
  assert.equal(chiffreDe(l('prix', [{ cle: 'verdict_prix', resultat: '3 000 €/m² 12 % en dessous de la médiane' }])), '−12 %');
  assert.equal(chiffreDe(l('emplacement', [{ cle: 'passage', statut: 'ok', resultat: '7,5 / 10 (provisoire)' }])), '7,5/10');
  assert.equal(chiffreDe(l('locataire', [{ cle: 'procedures', statut: 'alerte', resultat: 'Liquidation judiciaire prononcée le 16/07/2025' }], 'alerte')), 'Liquidation');
  assert.equal(chiffreDe(l('locataire', [{ cle: 'societe', statut: 'ok', resultat: 'X' }])), 'OK');
  assert.equal(chiffreDe(l('ville', [], 'vide')), '—');
  assert.equal(chiffreDe({ cle: 'ville', lancement: { statut: 'en_cours' } }), '…');
  assert.equal(chiffreDe({ cle: 'ville' }), '—');
});

test('le contrôle d\'un point voit les valeurs mal écrites et les sources oubliées', () => {
  assert.equal(texteDouteux('9,3 % sur la rue'), null);
  assert.match(texteDouteux('Vacance : [object Object]'), /object Object/);
  assert.match(texteDouteux('Loyer undefined €'), /undefined/);
  assert.match(texteDouteux('Deux  espaces'), /double espace/);
  assert.match(texteDouteux(''), /vide/);
  assert.equal(texteDouteux('6,97 % brut ; pas de taux validé à Mâcon : rien'), null);
  assert.match(texteDouteux('Virgule , collée'), /,/);
  assert.deepEqual(controlerPoint({ cle: 'x', libelle: 'X', statut: 'ok', resultat: 'bien', source: 'S' }), []);
  assert.deepEqual(controlerPoint({ cle: 'x', libelle: 'X', statut: 'ok', resultat: 'bien' }), ['x : lu sans source']);
  assert.deepEqual(controlerPoint({ cle: 'x', libelle: 'X', statut: 'vide', resultat: 'rien lu' }), []);
  assert.match(controlerPoint({ cle: 'x', libelle: 'X', statut: 'bof', resultat: 'a', source: 's' })[0], /statut inconnu/);
});

test('le contrôle d\'un lancement exige les points de l\'outil, la rue de l\'Emplacement et une note en deux phrases', () => {
  const p = (cle, statut = 'ok') => ({ cle, libelle: cle, statut, resultat: 'bien', source: 'S' });
  const bon = { outil: 'ville', statut: 'fini', resultat: { statut: 'ok', conclusion: 'Rien à signaler', points: POINTS_ATTENDUS.ville.map((k) => p(k)), note_ia: { avis: 'Une. Deux.' } } };
  assert.deepEqual(controlerLancement(bon), []);
  assert.deepEqual(controlerLancement({ ...bon, resultat: { ...bon.resultat, points: [p('population')] } }), ['point revenu manquant', 'point chomage manquant']);
  assert.deepEqual(controlerLancement({ outil: 'emplacement', statut: 'fini', resultat: { statut: 'ok', conclusion: 'Oui', points: POINTS_ATTENDUS.emplacement.map((k) => p(k)) } }), ['emplacement lu sans la rue']);
  assert.deepEqual(controlerLancement({ outil: 'emplacement', statut: 'fini', resultat: { statut: 'ok', conclusion: 'Oui', points: POINTS_ATTENDUS.emplacement.map((k) => p(k)), rue: { rue: { cellules: [] } } } }), []);
  assert.deepEqual(controlerPoint({ cle: 'loyer_marche', libelle: 'L', statut: 'ok', resultat: 'bien', source: 'S', lien: '/uploads/equimmox/loyer-1.png' }), []);
  assert.deepEqual(controlerLancement({ ...bon, resultat: { ...bon.resultat, note_ia: { avis: 'Une. Deux. Trois.' } } }), ["note de l'IA en 3 phrases"]);
  assert.deepEqual(controlerLancement({ outil: 'prix', statut: 'echec', erreur: 'DVF muet' }), ['échec : DVF muet']);
});
