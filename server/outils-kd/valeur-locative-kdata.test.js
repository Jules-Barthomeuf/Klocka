import test from 'node:test';
import assert from 'node:assert/strict';
import { longueurLigne, agregerTroncons } from './voirie-bdtopo.js';
import { apprendreArbres, apprendreVoisins, coefficient, decomposerRue, fourchette, NOMS_CARACTERISTIQUES, POIDS_VOISINS } from './valeur-locative-kdata.js';

test('la longueur d\'un tronçon : un millième de degré de latitude fait environ 111 m', () => {
  assert.ok(Math.abs(longueurLigne([[7, 43.5], [7, 43.501]]) - 111.3) < 1);
  assert.equal(longueurLigne([[7, 43.5]]), 0);
});

test('la voirie agrégée par nom : longueur, importance la plus forte, part piétonne pondérée par la longueur', () => {
  const t = (nom, importance, acces, lat2) => ({ properties: { nom_voie_ban_gauche: nom, importance: String(importance), acces_vehicule_leger: acces, nature: 'Route à 1 chaussée', sens_de_circulation: 'Double sens', largeur_de_chaussee: 4 }, geometry: { type: 'LineString', coordinates: [[7, 43.5], [7, lat2]] } });
  const voies = agregerTroncons([t('Rue d\'Antibes', 4, 'Libre', 43.501), t('Rue d\'Antibes', 3, 'Physiquement impossible', 43.501), { properties: {}, geometry: null }]);
  assert.equal(voies.length, 1);
  assert.equal(voies[0].imp_min, 3);
  assert.equal(voies[0].part_pieton, 0.5);
  assert.ok(Math.abs(voies[0].longueur - 223) <= 1);
});

test('le rapprochement des noms de rue garde le type et retire les mots vides', () => {
  assert.deepEqual(decomposerRue('Av. de la Croisette'.replace('.', '')), { type: 'AVENUE', mots: ['CROISETTE'] });
  assert.deepEqual(fourchette(240), { basse: 200, haute: 288 });
});

test('les modèles apprennent une rue plus chère quand les vitrines par 100 m montent, et restent bornés', () => {
  const p = NOMS_CARACTERISTIQUES.length;
  const j = NOMS_CARACTERISTIQUES.indexOf('vitrines_100m');
  const ex = Array.from({ length: 120 }, (_, i) => { const v = new Array(p).fill(0); v[j] = i / 10; return { valeurs: v, cible: Math.log(0.7 + (i / 120) * 0.8) }; });
  const haut = new Array(p).fill(0); haut[j] = 11.5;
  const bas = new Array(p).fill(0); bas[j] = 0.5;
  for (const m of [apprendreVoisins(ex), apprendreArbres(ex, { arbres: 60 })]) {
    const kh = coefficient(m, haut); const kb = coefficient(m, bas);
    assert.ok(kh > kb, `${m.type} : ${kh} > ${kb}`);
    assert.ok(kh <= 2.2 && kb >= 0.5);
  }
  assert.ok(Object.keys(POIDS_VOISINS).every((n) => NOMS_CARACTERISTIQUES.includes(n)));
});
