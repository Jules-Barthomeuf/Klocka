// Les dix lead magnets (9 oct. 2026) : chaque calcul, vérifié à la main.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lead-magnets-'));
const L = await import('../../src/lib/lead-magnets.js');
const parCle = Object.fromEntries(L.LEAD_MAGNETS.map((o) => [o.cle, o]));
const calc = (cle, v = {}) => parCle[cle].calcul({ ...L.valeursParDefaut(parCle[cle]), ...v });

test('dix outils, chacun avec ses champs, ses hypothèses et un calcul qui tourne sur ses valeurs par défaut', () => {
  assert.equal(L.LEAD_MAGNETS.length, 10);
  assert.equal(new Set(L.LEAD_MAGNETS.map((o) => o.cle)).size, 10);
  for (const o of L.LEAD_MAGNETS) {
    assert.ok(o.nom && o.titre && o.accroche && o.hypotheses, o.cle);
    const r = o.calcul(L.valeursParDefaut(o));
    assert.ok(r.fort?.valeur && r.phrase, o.cle);
    assert.equal(typeof r.resultat, 'number', o.cle);
  }
});

test('le vrai rendement : 18 000 € sur 250 000 € font 7,2 % brut, et le net retire frais, taxe, charges et vacance', () => {
  const r = calc('rendement-net');
  // Coût 268 750 € ; gardé 18 000 × (1 − 6/120) − 1 500 − 800 = 14 800 € ; net 5,507 %.
  assert.equal(r.resultat, 5.51);
  assert.match(r.lignes[0][1], /7,2 %/);
});

test('la capacité d\'emprunt : le loyer du bien compte, et des crédits trop lourds ferment la porte', () => {
  const r = calc('capacite');
  assert.ok(r.resultat > 300000 && r.resultat < 600000, String(r.resultat));
  assert.equal(calc('capacite', { credits: 5000 }).resultat, 0);
  assert.ok(calc('capacite', { apport: 100000 }).resultat > r.resultat);
});

test('le prix maximum : (18 000 − 1 500) / 6 % = 275 000 € frais compris', () => {
  const r = calc('prix-max');
  assert.equal(r.resultat, Math.round(275000 / 1.075));
});

test('le bail et l\'emplacement : des questionnaires notés, ce qui manque devient un point à vérifier', () => {
  const tousOui = Object.fromEntries(parCle.bail.champs.map((c) => [c.cle, true]));
  assert.equal(calc('bail', tousOui).titre, 'Bail solide');
  const r = calc('bail', { ...tousOui, taxe: false, effort: false });
  assert.equal(r.resultat, 8);
  assert.equal(r.conseils.length, 2);
  const meilleurs = Object.fromEntries(parCle.emplacement.champs.map((c) => [c.cle, 0]));
  assert.equal(calc('emplacement', meilleurs).fort.valeur, 'A');
  assert.equal(calc('emplacement', Object.fromEntries(parCle.emplacement.champs.map((c) => [c.cle, 2]))).fort.valeur, 'C');
});

test('le comparateur, la fiscalité, l\'indexation et la vacance', () => {
  assert.equal(calc('comparateur').resultat, 6000);
  const f = calc('fiscalite');
  // Nom propre : 18 000 > 15 000, donc réel : (18 000 − 3 000 − 6 000) × 47,2 % = 4 248 €. IS : 9 000 − 6 667 d'amortissement = 2 333 × 15 % = 350 €.
  assert.equal(f.resultat, 4248 - 350);
  assert.equal(calc('indexation', { indice: 0 }).resultat, 18000);
  assert.equal(calc('indexation').resultat, Math.round(18000 * 1.02 ** 9));
  assert.equal(calc('vacance').resultat, 7);
});

test('la transmission : barème en ligne directe et usufruit de l\'article 669', () => {
  assert.equal(L.partUsufruit(20), 0.9);
  assert.equal(L.partUsufruit(21), 0.8);
  assert.equal(L.partUsufruit(60), 0.5);
  assert.equal(L.partUsufruit(61), 0.4);
  assert.equal(L.partUsufruit(95), 0.1);
  // 50 000 € taxables : 8 072 × 5 % + 4 037 × 10 % + 3 823 × 15 % + 34 068 × 20 % = 8 194,35 €.
  assert.equal(Math.round(L.droitsDonation(50000) * 100) / 100, 8194.35);
  const r = calc('transmission');
  // 150 000 € par enfant : pleine propriété 50 000 taxables ; nue-propriété (50 %) 75 000, sous l'abattement.
  assert.equal(r.resultat, Math.round(8194.35 * 2));
});

test('les assets des dix lead magnets sont posés d\'office, avec le lien personnel', async () => {
  const { assets } = await import('./assets.js');
  const lm = assets().filter((a) => a.genre === 'lead_magnet' && a.slug && parCle[a.slug]);
  assert.equal(lm.length, 10);
  assert.ok(lm.every((a) => a.blocs.some((b) => String(b.lien).includes(`OutilInvestisseur?o=${a.slug}&k={{k}}`))));
});
