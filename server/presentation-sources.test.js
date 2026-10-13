// Le mode Sources des présentations bancaires : la source de chaque champ,
// tirée de la fiche du projet et de ce que la construction a retenu. Pur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { sourcesDesChamps, sourceDuChemin, sourcesEnTexte, memesChiffres, memeTexte } from './presentation-sources.js';

const projet = {
  id: 'p1', adresse_complete: '10 Place Abel Surchamp, 33500 Libourne',
  sim_loyer_initial_ht: 30693, surface_m2: 55, sim_prix_bien_negocie: 335000,
  echeance_bail: '2030-05-17', nom_locataire: 'Chocolaterie Tarnaise', activite_locataire: 'Commerce de chocolat', statut_bail: 'en_cours',
};

test('un chiffre de la fiche dit son champ exact, et le lien de la fiche', () => {
  const d = { id: 'couverture', type: 'couverture', stats: [{ valeur: '335 000 €' }, { valeur: '30 693 €' }, { valeur: '3,6 ans' }], heros: {} };
  const s = sourcesDesChamps(projet, [d]).couverture;
  assert.equal(s['stats.1.valeur'].nature, 'projet');
  assert.match(s['stats.1.valeur'].detail, /Loyer initial HT, onglet Simulateur : 30 693 €/);
  assert.equal(s['stats.1.valeur'].liens[0].href, '/Projet?id=p1');
  assert.equal(s['stats.1.valeur'].ecart, null);
});

test('un champ vide de la fiche passe au suivant, et le dit', () => {
  const d = { id: 'local', type: 'local', stats: [{}, {}, { valeur: '05/2030' }], identite: [], economie: [] };
  const s = sourcesDesChamps(projet, [d]).local;
  assert.match(s['stats.2.valeur'].detail, /Échéance du bail de la fiche : 05\/2030/);
  assert.match(s['stats.2.valeur'].detail, /est vide : c'est le champ suivant qui est pris/);
});

test('un calcul montre sa formule avec les vraies valeurs', () => {
  const d = { id: 'local', type: 'local', stats: [{ valeur: '558 €' }], identite: [], economie: [] };
  const s = sourcesDesChamps(projet, [d]).local;
  assert.equal(s['stats.0.valeur'].nature, 'calcul');
  assert.equal(s['stats.0.valeur'].calcul, '30 693 € / 55 m² = 558 €/m²/an');
});

test('une valeur retouchée à la main est signalée, un texte reformulé non', () => {
  const d = { id: 'local', type: 'local', heros: { grand: '32 000 €' }, stats: [], identite: [{ valeur: 'Société Chocolaterie Tarnaise' }, { valeur: 'Commerce de chocolat' }], economie: [] };
  const s = sourcesDesChamps(projet, [d]).local;
  assert.match(s['heros.grand'].ecart, /affiche « 32 000 € », la fiche donne aujourd'hui 30 693 €/);
  assert.equal(s['identite.0.valeur'].ecart, null);
  assert.equal(s['identite.1.valeur'].ecart, null);
});

test('le statut du bail se compare en clair, pas en code', () => {
  const d = { id: 'bail', type: 'bail', heros: {}, points: [{ titre: 'Statut du bail', valeur: 'En cours' }] };
  const s = sourcesDesChamps(projet, [d]).bail;
  assert.match(s['points.0.valeur'].detail, /: En cours\./);
  assert.equal(s['points.0.valeur'].ecart, null);
});

test('la ville : source publique avec la page INSEE, estimation de l\'IA dite comme telle, case vide à compléter', () => {
  const publique = { id: 'ville', type: 'ville', heros: { grand: '24 000' }, chiffres: [{ valeur: '21 000 €' }, { valeur: '[—]' }],
    sources: { chiffres: 'population : API Géo (INSEE) ; revenu médian par UC : INSEE Filosofi' }, sources_liens: { commune_code: '33243', commune_nom: 'Libourne' } };
  const s = sourcesDesChamps(projet, [publique]).ville;
  assert.equal(s['heros.grand'].nature, 'donnee');
  assert.equal(s['heros.grand'].liens[0].href, 'https://www.insee.fr/fr/statistiques/2011101?geo=COM-33243');
  assert.equal(s['chiffres.1.valeur'].nature, 'a_remplir');
  const ia = { ...publique, sources: { chiffres: 'une estimation de l\'IA faite à la création de la présentation, non vérifiée' } };
  assert.equal(sourcesDesChamps(projet, [ia]).ville['heros.grand'].nature, 'ia');
});

test('un libellé prend la source de sa valeur', () => {
  const s = { 'chiffres.0.valeur': { nature: 'projet' } };
  assert.equal(sourceDuChemin(s, 'chiffres.0.label').nature, 'projet');
  assert.equal(sourceDuChemin(s, 'heros.accroche'), null);
});

test('AK lit les sources en texte, sans le texte du modèle', () => {
  const d = { id: 'conditions', type: 'conditions', blocs: [{ titre: 'Taux', valeur: 'Fixe' }, { titre: 'Durée du crédit', valeur: '20 ans' }] };
  const parDiapo = sourcesDesChamps({ ...projet, sim_duree_credit: 20 }, [d]);
  const t = sourcesEnTexte(parDiapo, [d]);
  assert.match(t, /\[conditions\] blocs\.1\.valeur = « 20 ans » : La fiche du projet\. Durée du crédit, onglet Simulateur : 20 ans/);
  assert.doesNotMatch(t, /blocs\.0\.valeur/);
});

test('comparaisons : chiffres et textes', () => {
  assert.ok(memesChiffres('18 000 €', '18000'));
  assert.ok(!memesChiffres('18 500 €', '18 000 €'));
  assert.ok(memeTexte('Société Chocolaterie', 'chocolaterie'));
  assert.ok(!memeTexte('Boulangerie', 'Chocolaterie'));
});

test('le prix des murs : Equimmox quand il a été lu, sinon à demander à AK', () => {
  const d = { id: 'marche', type: 'marche', heros: {}, marche: { murs: '2 816 €/m²' }, local: {} };
  const prixMurs = { moyenne: 2816, bas: 1710, haut: 6866, offres: 7, rayon: '5km', surface_min: 44, surface_max: 66, le: '2026-10-13T04:44:27Z' };
  const s = sourcesDesChamps(projet, [d], { prixMurs }).marche['marche.murs'];
  assert.equal(s.nature, 'donnee');
  assert.match(s.detail, /\(7 annonces\), dans un rayon de 5km, de 44 à 66 m²/);
  assert.match(s.calcul, /moyenne 2 816 €\/m²/);
  assert.equal(s.ecart, null);
  assert.equal(sourcesDesChamps(projet, [d]).marche['marche.murs'].nature, 'a_remplir');
});
