// Prospecter pour un client (24 oct. 2026) : les commerces qui répondent à la demande d'un client, et l'accroche.
import test from 'node:test';
import assert from 'node:assert/strict';
const C = await import('../src/lib/clients-commerces.js');

test('l’activité cherchée : « coiffure » trouve un coiffeur, une demande vague ne filtre pas', () => {
  assert.deepEqual(C.racinesDuType('Boulangerie, coiffure'), ['boul', 'coif']);
  assert.deepEqual(C.racinesDuType('Murs commerciaux, tout type de commerce'), []);
  assert.equal(C.pourClient({ activite: 'Coiffeur' }, { type_commerce: 'Coiffure' }), true);
  assert.equal(C.pourClient({ activite: 'Boulangerie-pâtisserie' }, { type_commerce: 'boulangerie' }), true);
  assert.equal(C.pourClient({ activite: 'Pharmacie' }, { type_commerce: 'Boulangerie, coiffure' }), false);
  assert.equal(C.pourClient({ activite: 'Pharmacie' }, { type_commerce: 'Murs commerciaux' }), true);
  assert.equal(C.pourClient({ activite: 'Restaurant' }, { type_commerce: 'Restauration rapide' }), true);
  assert.equal(C.pourClient({ activite: 'Pharmacie' }, null), true, 'sans client, tout');
});

test('le budget, à 20 % près ; un prix inconnu n’écarte pas', () => {
  const d = { type_commerce: 'Pharmacie', budget_min: 300000, budget_max: 600000 };
  assert.equal(C.pourClient({ activite: 'Pharmacie', prix: { basse: 500000, moyenne: 550000, haute: 600000 } }, d), true);
  assert.equal(C.pourClient({ activite: 'Pharmacie', prix: { basse: 800000, moyenne: 900000, haute: 1000000 } }, d), false);
  assert.equal(C.pourClient({ activite: 'Pharmacie', prix: { basse: 150000, moyenne: 180000, haute: 200000 } }, d), false);
  assert.equal(C.pourClient({ activite: 'Pharmacie' }, d), true);
});

test('les remarques du client : « Pas de pro de la santé », l’emplacement n°1', () => {
  const godin = { remarque: 'Pas de pro de la santé comme locataire', budget_min: 250000, budget_max: 350000 };
  assert.deepEqual(C.exclusionsDe(godin).map((f) => f.cle), ['sante']);
  assert.equal(C.pourClient({ activite: 'Pharmacie' }, godin), false);
  assert.equal(C.pourClient({ activite: 'Boulangerie' }, godin), true);
  assert.deepEqual(C.exclusionsDe({ remarque: 'Sans restauration ni bar' }).map((f) => f.cle), ['restauration', 'bar']);
  const benvenuti = { zones: ['Emplacement N1 ou retail park'], budget_max: 650000 };
  assert.equal(C.veutEmplacement1(benvenuti), true);
  assert.equal(C.pourClient({ activite: 'Opticien', centre: false }, benvenuti), false);
  assert.equal(C.pourClient({ activite: 'Opticien', centre: true }, benvenuti), true);
  assert.equal(C.veutEmplacement1({ zones: ['Toute la France'] }), false);
  const jj = { remarque: 'retail park / Enseigne national / entrepot' };
  assert.equal(C.veutEnseigneNationale(jj), true);
  assert.equal(C.pourClient({ activite: 'Vêtements', chaine: false }, jj), false);
  assert.equal(C.pourClient({ activite: 'Vêtements', chaine: true }, jj), true);
});

test('l’accroche du mandataire', () => {
  assert.match(C.accroche({}, { type_commerce: 'Pharmacie', budget_min: 300000, budget_max: 1700000 }), /pharmacie dans votre secteur, budget 300 k€ – 1,7 M€\. Seriez-vous/);
  assert.equal(C.budgetDe({ budget_min: 300000, budget_max: 1700000 }), '300 k€ – 1,7 M€');
  assert.equal(
    C.accroche({ prix: { moyenne: 450000 } }, { type_commerce: 'Boulangerie', budget_max: 600000 }),
    "J'ai un acquéreur qui cherche exactement des murs de boulangerie dans votre secteur, jusqu'à 600 k€. Votre local se situerait autour de 450 k€. Seriez-vous ouvert à en discuter ?",
  );
});
