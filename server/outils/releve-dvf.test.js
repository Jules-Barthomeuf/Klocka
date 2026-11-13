import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { svgReleveDvf } from './releve-dvf.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CLAIR = JSON.parse(fs.readFileSync(path.join(ICI, '..', '..', 'src', 'design', 'jetons.json'), 'utf8')).couleurs_clair;
const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');

// Les ventes du dossier KFC Lyon, 12 nov. 2026 (lancement du Prix).
const COMPARAISON = {
  n: 9, cercle: '300 m', annees: 3, prix_m2: { bas: 3153, median: 5065, haut: 7120 }, bien_m2: 9167, ecart: 81,
  ventes: [
    { date: '2024-01-29', adresse: '32 RUE NEUVE', surface: 93, prix: 550589.06, prix_m2: 5920, distance_m: 63 },
    { date: '2025-09-26', adresse: '22 RUE DE LA REPUBLIQUE', surface: 92, prix: 655000, prix_m2: 7120, distance_m: 165 },
    { date: '2023-12-11', adresse: '35 RUE DE LA REPUBLIQUE', surface: 247, prix: 2300000, prix_m2: 9312, distance_m: 259 },
  ],
};

test('relevé DVF : une ligne par vente comparée, la médiane et le bien', () => {
  const s = sp(svgReleveDvf({ adresse: '12 Rue de la République 69002 Lyon', comparaison: COMPARAISON, surface: 120, statut: 'alerte', le: '2026-11-12T08:00:00Z' }));
  assert.match(s, /^<\?xml/);
  assert.match(s, /<svg [^>]*width="1200"/);
  assert.match(s, /Ventes de locaux commerciaux retenues/);
  assert.match(s, /lu le 12 novembre 2026/);
  assert.match(s, /12 Rue de la République 69002 Lyon · à 300 m · 3 dernières années · surfaces de 60 à 240 m²/);
  for (const a of ['32 RUE NEUVE', '22 RUE DE LA REPUBLIQUE', '35 RUE DE LA REPUBLIQUE']) assert.ok(s.includes(`>${a}<`), a);
  assert.match(s, />29\/01\/2024</);
  // Les montants suivent la règle de l'écran : en k€, puis en M€ dès 1 000 k€.
  assert.match(s, />551 k€</);
  assert.match(s, />2,3 M€</);
  assert.match(s, />5 920 €</);
  assert.match(s, />63 m</);
  assert.match(s, /Médiane des 9 ventes : 5 065 €\/m²/);
  assert.match(s, /Le bien : 9 167 €\/m², \+81 % face à la médiane/);
  // Trois ventes montrées sur neuf retenues : l'image le dit.
  assert.match(s, /Les 3 ventes les plus proches sur les 9 retenues\./);
});

test('relevé DVF : les couleurs viennent du thème clair des jetons, l\'écart prend la teinte du point', () => {
  const alerte = svgReleveDvf({ comparaison: COMPARAISON, statut: 'alerte' });
  assert.ok(alerte.includes(`fill="${CLAIR['surface-pleine']}"`));
  assert.ok(alerte.includes(`fill:${CLAIR.alerte}">Le bien`));
  const ok = svgReleveDvf({ comparaison: COMPARAISON, statut: 'ok' });
  assert.ok(ok.includes(`fill:${CLAIR.encre}">Le bien`));
});

test('relevé DVF : le texte lu est échappé, la même rue se dit en clair, une adresse trop longue se coupe', () => {
  const s = svgReleveDvf({
    adresse: 'Rue <script> & Cie',
    comparaison: { ...COMPARAISON, cercle: 'même rue', n: 1, ventes: [{ ...COMPARAISON.ventes[0], adresse: `${'TRES LONGUE AVENUE '.repeat(5)}& <b>` }] },
  });
  assert.ok(!s.includes('<script>'));
  assert.ok(s.includes('Rue &lt;script&gt; &amp; Cie · dans la même rue'));
  assert.ok(!s.includes('<b>'));
  assert.match(s, /TRES LONGUE AVENUE[^<]*…</);
  assert.ok(!/plus proches sur les/.test(s));
});
