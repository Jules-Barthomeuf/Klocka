import test from 'node:test';
import assert from 'node:assert/strict';
import { cleDeRue, ventesComparables, motDuVerdict, calculerVerdict } from './verdict-prix.js';

const AUJ = new Date('2026-11-10');
const vente = (prix_m2, { surface = 100, distance_m = 150, date = '2025-06-01', adresse = '10 RUE MERCIERE' } = {}) => ({ prix_m2, surface, distance_m, date, adresse, prix: prix_m2 * surface });

test('la même rue se reconnaît malgré le numéro, les abréviations et la ville', () => {
  assert.equal(cleDeRue('20 Rue de la République 69002 Lyon'), 'RUE REPUBLIQUE');
  assert.equal(cleDeRue('22 R DE LA REPUBLIQUE'), 'RUE REPUBLIQUE');
  assert.equal(cleDeRue('5 bis Crs Vitton, 69006 Lyon'), 'COURS VITTON');
});

test('les ventes comparables : même rue d\'abord, surface de la moitié au double, trois ans puis cinq', () => {
  const rue = Array.from({ length: 5 }, () => vente(5000, { adresse: '3 RUE MERCIERE' }));
  const autour = Array.from({ length: 8 }, () => vente(4000, { adresse: '1 QUAI ST ANTOINE', distance_m: 250 }));
  const trop = [vente(9000, { surface: 400 }), vente(9000, { date: '2019-01-01' })];
  const a = ventesComparables([...rue, ...autour, ...trop], { surface: 100, rue: 'RUE MERCIERE', aujourdhui: AUJ });
  assert.equal(a.cercle, 'même rue');
  assert.equal(a.retenues.length, 5);
  const b = ventesComparables([...rue.slice(0, 2), ...autour], { surface: 100, rue: 'RUE MERCIERE', aujourdhui: AUJ });
  assert.equal(b.cercle, '300 m');
  assert.equal(b.retenues.length, 10);
  const vieilles = Array.from({ length: 6 }, () => vente(4000, { date: '2022-03-01' }));
  assert.equal(ventesComparables(vieilles, { surface: 100, aujourdhui: AUJ }).annees, 5);
  assert.equal(ventesComparables(vieilles.slice(0, 4), { surface: 100, aujourdhui: AUJ }).retenues.length, 0);
});

test('le mot du verdict : ± 10 % dans le marché, au-delà légèrement, au-delà de 20 % franchement', () => {
  assert.equal(motDuVerdict(8).mot, 'dans le marché');
  assert.equal(motDuVerdict(14).mot, 'légèrement surévalué');
  assert.equal(motDuVerdict(-25).mot, 'sous-évalué');
  assert.equal(motDuVerdict(null), null);
});

test('le verdict croise les ventes et la capitalisation, et baisse sa confiance quand elles divergent', () => {
  const ventes = Array.from({ length: 10 }, (_, i) => vente(4000 + i * 20));
  // 500 k€ pour 100 m² : 5 000 €/m², 23 % au-dessus des ventes ; 32 500 € ÷ 6,5 % = 500 k€ : juste.
  const r = calculerVerdict({ bien: { prix: 500000, surface: 100, loyer: 32500 }, ventes, taux: { base: 6.5, source: 'test', nombre: 6 }, aujourdhui: AUJ });
  assert.ok(r.comparaison.ecart > 20);
  assert.equal(r.capitalisation.ecart, 0);
  assert.equal(r.verdict.mot, 'légèrement surévalué');
  assert.equal(r.verdict.confiance, 'basse');
  // Les deux s'accordent : confiance haute avec assez de ventes et de taux validés.
  const d = calculerVerdict({ bien: { prix: 410000, surface: 100, loyer: 26650 }, ventes, taux: { base: 6.5, nombre: 6 }, aujourdhui: AUJ });
  assert.equal(d.verdict.mot, 'dans le marché');
  assert.equal(d.verdict.confiance, 'haute');
});

test('sans ventes ni taux, le verdict dit ce qui manque au lieu d\'inventer', () => {
  const r = calculerVerdict({ bien: { prix: 300000, surface: 80, loyer: 20000 }, ventes: [vente(4000)], taux: null, aujourdhui: AUJ });
  assert.equal(r.verdict, null);
  assert.equal(r.manque.length, 2);
  // Un loyer au-dessus du marché est signalé.
  const l = calculerVerdict({ bien: { prix: 300000, surface: 80, loyer: 24000 }, ventes: [], taux: { base: 6.5 }, loyerMarcheM2: { median: 220 }, aujourdhui: AUJ });
  assert.match(l.controle_loyer.alerte, /dépasse le marché/);
  assert.ok(l.capitalisation.ajustements.some((a) => /au-dessus du marché/.test(a.motif)));
});
