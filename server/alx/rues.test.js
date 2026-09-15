// Le classement d'une rue par son loyer : 1, 1 bis, 2, ou écartée. Pur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { emplacementParLoyer, libelleEmplacement, proposerRues, classerParRang } from './rues.js';

const SEUILS = { loyer_emplacement_1: 800, loyer_emplacement_1bis: 550, loyer_emplacement_2: 350 };

test('le milieu de la fourchette fait l’emplacement : 1, 1 bis, 2, ou écartée', () => {
  assert.equal(emplacementParLoyer({ basse: 899, haute: 1348 }, 40, SEUILS).classe, 1, "rue d'Antibes");
  assert.equal(emplacementParLoyer({ basse: 500, haute: 700 }, 30, SEUILS).classe, 1.5, 'rue Meynadier : 1 bis');
  assert.equal(emplacementParLoyer({ basse: 347, haute: 521 }, 14, SEUILS).classe, 2, 'avenue de Grasse');
  const basse = emplacementParLoyer({ basse: 150, haute: 250 }, 9, SEUILS);
  assert.equal(basse.classe, null);
  assert.match(basse.motif, /trop bas/);
});

test('sans loyer, la rue est classée 2 par défaut et le motif le dit', () => {
  const r = emplacementParLoyer(null, 12, SEUILS);
  assert.equal(r.classe, 2);
  assert.match(r.motif, /à vérifier/);
});

test('le 1 bis s’écrit 1.5 et se lit « 1 bis »', () => {
  assert.equal(libelleEmplacement(1.5), '1 bis');
  assert.equal(libelleEmplacement(1), '1');
  assert.equal(libelleEmplacement(null), null);
});

test('proposerRues garde le tracé, classe les rues vivantes et écarte les autres, sans réseau', async () => {
  const trace = [[[43.55, 7.02], [43.55, 7.03]]];
  const ruesDe = async () => ({
    rues: [
      { cle: 'antibes', nom: "Rue d'Antibes", vitrines: 40, enseignes: ['LCL'], trace, longueur_m: 800, centre: { lat: 43.55, lon: 7.025 } },
      { cle: 'meynadier', nom: 'Rue Meynadier', vitrines: 20, enseignes: [], trace, longueur_m: 400, centre: { lat: 43.55, lon: 7.025 } },
      { cle: 'basse', nom: 'Rue Basse', vitrines: 6, enseignes: [], trace, longueur_m: 100, centre: { lat: 43.55, lon: 7.025 } },
      { cle: 'vide', nom: 'Allée Vide', vitrines: 1, enseignes: [], trace, longueur_m: 50, centre: null },
    ],
    vitrines_total: 67,
    sans_rue: 0,
  });
  const loyers = { "Rue d'Antibes": { rue: { basse: 899, haute: 1348 } }, 'Rue Meynadier': { rue: { basse: 500, haute: 700 } }, 'Rue Basse': { rue: { basse: 100, haute: 200 } } };
  const journal = [];
  const r = await proposerRues(
    { nom: 'Cannes', code_insee: '06029', code_postal: '06400', centre: { lat: 43.55, lon: 7.01 } },
    { ruesDe, loyerDe: async (a) => loyers[a.split(',')[0]] || null, prixDe: async () => null, journal: (t) => journal.push(t) },
  );
  assert.deepEqual(r.classees.map((x) => [x.nom, x.classe]), [["Rue d'Antibes", 1], ['Rue Meynadier', 1.5]]);
  assert.deepEqual(r.ecartees.map((x) => x.nom), ['Rue Basse'], 'trop bas ; l’allée à une vitrine n’est même pas lue');
  assert.equal(r.classees[0].trace, trace, 'le tracé suit la rue, pour la carte et la balade');
  assert.equal(r.classees[0].commerces, 40);
  assert.equal(r.commerces_total, 67);
  assert.ok(journal.some((t) => /OpenStreetMap/.test(t)));
});

test('un relevé arrêté pendant la lecture rend null, jamais une liste vide', async () => {
  // Bordeaux, 15 septembre : un arrêt pendant la lecture Data-B rendait
  // « zéro rue », que le parcours écrivait par-dessus 285 rues classées.
  const trace = [[[44.84, -0.57], [44.84, -0.56]]];
  const ruesDe = async () => ({
    rues: ['a', 'b', 'c', 'd'].map((k) => ({ cle: k, nom: `Rue ${k}`, vitrines: 10, enseignes: [], trace, longueur_m: 300, centre: { lat: 44.84, lon: -0.565 } })),
    vitrines_total: 40,
    sans_rue: 0,
  });
  let lus = 0;
  let arret = false;
  const r = await proposerRues(
    { nom: 'Bordeaux', code_insee: '33063', code_postal: '33000', centre: { lat: 44.84, lon: -0.57 } },
    {
      ruesDe,
      // L'équipe clique sur Arrêter après la deuxième rue lue.
      loyerDe: async () => { lus += 1; if (lus >= 2) arret = true; return { rue: { basse: 600, haute: 900 } }; },
      prixDe: async () => null,
      arreter: () => arret,
    },
  );
  assert.equal(r, null, 'interrompu : rien à écrire');

  // Sans arrêt, le même relevé rend bien ses rues.
  const complet = await proposerRues(
    { nom: 'Bordeaux', code_insee: '33063', code_postal: '33000', centre: { lat: 44.84, lon: -0.57 } },
    { ruesDe, loyerDe: async () => ({ rue: { basse: 600, haute: 900 } }), prixDe: async () => null },
  );
  assert.equal(complet.classees.length, 4);
});

test('le rang mêle loyer, vitrines et prix au m² : un boulevard cher et garni passe devant une rue au loyer haut mais vide', () => {
  const rues = [
    { nom: 'Rue Chic', loyer: { basse: 900, haute: 1300 }, vitrines: 6, prix_m2: 5200 },
    { nom: 'Boulevard Garni', loyer: { basse: 600, haute: 900 }, vitrines: 60, prix_m2: 6000 },
    { nom: 'Rue Moyenne', loyer: { basse: 500, haute: 700 }, vitrines: 20, prix_m2: 4000 },
    { nom: 'Rue Calme', loyer: { basse: 300, haute: 450 }, vitrines: 5, prix_m2: 3000 },
  ];
  const c = classerParRang(rues, { part_emplacement_1: 0.25, part_emplacement_1bis: 0.6, loyer_plancher_1: 450, loyer_emplacement_2: 250 });
  const classe = Object.fromEntries(c.map((r) => [r.nom, r.classe]));
  assert.equal(classe['Boulevard Garni'], 1);
  assert.equal(classe['Rue Chic'], 1.5);
  assert.equal(classe['Rue Moyenne'], 1.5);
  assert.equal(classe['Rue Calme'], 2);
  assert.match(c.find((r) => r.nom === 'Boulevard Garni').motif, /1e sur 4 de la ville \(loyer 2e, vitrines 1e, prix au m² 1e\)/);
});
