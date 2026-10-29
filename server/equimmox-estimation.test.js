import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-eqx-estimation-'));
const X = await import('./equimmox-estimation.js');
const ici = path.dirname(fileURLToPath(import.meta.url));
// Le rapport réel du 26 oct. 2026 (1 avenue Mirabeau, Nice, commerce 120 m², 2-1-1-2), le nom de l'agent retiré.
const RAPPORT = fs.readFileSync(path.join(ici, 'fixtures/equimmox-rapport-nice.txt'), 'utf8');

test('le rapport Equimmox se lit : valeur, méthodes avec coefficients, capitalisation, environnement', () => {
  const r = X.lireRapport(RAPPORT);
  assert.equal(r.valeur, 343024);
  assert.equal(r.valeur_m2, 2859);
  assert.equal(r.surface, 120);
  assert.deepEqual(r.methodes.map((m) => [m.cle, m.valeur, m.coefficient]), [
    ['offres_actuelles', 443040, 2], ['offres_anciennes', 268200, 1], ['transactions', 288480, 1], ['capitalisation', 307692, 2],
  ]);
  assert.deepEqual([r.methodes[0].bas_m2, r.methodes[0].moyenne_m2, r.methodes[0].haut_m2], [3211, 3692, 4569]);
  assert.equal(r.methodes[3].taux, 7.8);
  assert.deepEqual(r.capitalisation, { loyer: 24000, taux: 7.8, brute: 307692, investissement: 0, nette: 307692 });
  assert.ok(r.environnement.some((l) => /Tram ligne 1/.test(l)));
  // La valeur finale est bien la moyenne pondérée des méthodes.
  const pond = r.methodes.reduce((t, m) => t + m.valeur * m.coefficient, 0) / r.methodes.reduce((t, m) => t + m.coefficient, 0);
  assert.ok(Math.abs(pond - r.valeur) < 2);
  assert.equal(X.lireRapport('Chargement…'), null);
});

test('la fourchette : la même pondération, sur le bas puis le haut de chaque méthode', () => {
  const f = X.fourchetteDe(X.lireRapport(RAPPORT));
  assert.ok(f.bas < 343024 && f.haut > 343024, JSON.stringify(f));
  assert.equal(f.bas % 5000, 0);
});

test('une carte de comparable se lit, au format de l’écran', () => {
  const c = X.lireCarte('435 000 €\n3 295 €/m²\n132 m²\nRue Marceau 06000 Nice  (06)\n~200 m du bien estimé\n13 mars 2026\nVoir l\'offre');
  assert.deepEqual(c, { prix: 435000, prix_m2: 3295, surface: 132, adresse: 'Rue Marceau 06000 Nice', distance_m: 200, date: '2026-03-13' });
  assert.equal(X.lireCarte('~1,2 km du bien estimé\n3 000 €/m²').distance_m, 1200);
  assert.equal(X.lireCarte('490 000 €\n3 289 €/m²\n149 m²\n2 RUE VERNIER, Nice\n(06)\n~100 m du bien estimé\n6 nov. 2023').adresse, '2 RUE VERNIER, Nice');
  assert.equal(X.dateFr('5 févr. 2025'), '2025-02-05');
});

test('le choix des comparables : sans les extrêmes, les plus proches, cinq au plus, avec leur raison', () => {
  const cartes = [
    { prix_m2: 3300, distance_m: 900, date: '2026-01-01' },
    { prix_m2: 9000, distance_m: 100, date: '2026-01-01' }, // trop loin de la médiane
    { prix_m2: 3100, distance_m: 200, date: '2024-01-01' },
    { prix_m2: 3500, distance_m: 300, date: '2026-05-01' },
    { prix_m2: null, distance_m: 50 },
    { prix_m2: 3200, distance_m: 400 }, { prix_m2: 3000, distance_m: 500 }, { prix_m2: 3400, distance_m: 600 },
  ];
  const r = X.choisirComparables(cartes, { methode: 'transactions' });
  assert.equal(r.length, 5);
  assert.ok(!r.some((c) => c.prix_m2 === 9000));
  assert.deepEqual(r.map((c) => c.distance_m), [200, 300, 400, 500, 600]);
  assert.ok(r[0].raison.includes('200 m'));
  // Offres actuelles : à 250 m près, la plus récente passe devant.
  const a = X.choisirComparables(cartes, { methode: 'offres_actuelles' });
  assert.equal(a[0].distance_m, 300);
});

test('ce qu’il faut à Equimmox, et l’état du bien depuis les réponses de l’avis', () => {
  assert.deepEqual(X.manqueEquimmox({ classe: 'Commerce', adresse: 'x', surface: 80, etat: 'Bon état', occupe: true, loyer: 24000 }), []);
  assert.deepEqual(X.manqueEquimmox({ classe: null, adresse: '', surface: 0, etat: null, occupe: true }).length, 5);
  assert.equal(X.etatEquimmox({ etat_local: 'usage' }), 'Bon état');
  assert.equal(X.etatEquimmox({ etat_local: 'brut' }), 'Travaux à prévoir');
  assert.equal(X.etatEquimmox({ etat: 'Local entièrement rénové en 2024' }), 'Neuf');
  assert.equal(X.etatEquimmox({}), null);
});
