// Le menu en deux groupes (src/lib/menu.js) : origine, choix de la personne, entrées nouvelles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repartir } from '../src/lib/menu.js';

const P = [{ cle: 'A', label: 'A' }, { cle: 'B', label: 'B' }];
const X = [{ cle: 'C', label: 'C' }, { cle: 'D', label: 'D' }];
const cles = (l) => l.map((e) => e.cle);

test('menu : sans choix, chaque entrée reste dans son groupe d\'origine', () => {
  const r = repartir(P, X);
  assert.deepEqual(cles(r.principal), ['A', 'B']);
  assert.deepEqual(cles(r.autre), ['C', 'D']);
});

test('menu : les entrées vont où la personne les a posées, dans son ordre, masques retirés', () => {
  const r = repartir(P, X, { ordre: ['C', 'A', 'B', 'D'], menuAutre: ['B', 'D'], masques: ['D'] });
  assert.deepEqual(cles(r.principal), ['C', 'A']);
  assert.deepEqual(cles(r.autre), ['B']);
});

test('menu : tout peut aller dans un seul groupe, et une entrée nouvelle garde son origine', () => {
  const r = repartir([...P, { cle: 'N', label: 'N' }], X, { ordre: ['A', 'B', 'C', 'D'], menuAutre: [] });
  assert.deepEqual(cles(r.principal), ['A', 'B', 'C', 'D', 'N']);
  assert.deepEqual(cles(r.autre), []);
});

test("le menu de l'équipe (17 oct. 2026) : cinq pages, Relations, Administration, Feedback seul dans Autre (19 oct.)", async () => {
  const { menuAdmin } = await import('../src/lib/menu.js');
  const { principal, autre } = menuAdmin();
  assert.deepEqual(principal.filter((x) => !x.groupe).map((x) => x.label), ['Haka', 'Projets', 'Dossiers', 'À valider', 'Appels', 'Simulateur', 'Sunday CRM']);
  // Le CRM (27 oct. 2026) : une entrée externe, toujours là.
  assert.equal(principal.find((x) => x.cle === 'CRM')?.externe, true);
  assert.ok(menuAdmin(['CRM']).principal.some((x) => x.cle === 'CRM'));
  // À valider (Haka) se masque quand Haka n'est pas allumé : le Layout passe la clé dans les masques.
  assert.ok(!menuAdmin(['AValider']).principal.some((x) => x.cle === 'AValider'));
  assert.deepEqual(principal.filter((x) => x.groupe).map((x) => [x.groupe, x.entrees.map((e) => e.label)]), [['Relations', ['Clients', 'Agents']], ['Administration', ['Intelligence', 'Utilisateurs', 'Automatismes', 'Suivi']]]);
  const cles = autre.map((e) => e.cle);
  for (const hors of ['Semaine', 'Monitoring', 'Personnalisation', 'Dashboard', 'Agents']) assert.ok(!cles.includes(hors), hors);
  assert.deepEqual(cles, ['AdminSuggestions'], 'Offres, Emailing, Présentations… ne sont plus dans le menu');
  // Une page masquée disparaît ; un groupe vidé aussi.
  const m = menuAdmin(['Cerveau', 'AdminUtilisateurs', 'Automatismes', 'Monitoring', 'Offres']);
  assert.ok(!m.principal.some((x) => x.groupe === 'Administration'));
  assert.ok(!m.autre.some((e) => e.cle === 'Offres'));
  assert.deepEqual(menuAdmin(['AdminSuggestions']).autre, [], 'Feedback masqué : plus rien dans Autre');
});

test('un groupe est une entrée ; une page sait son groupe', async () => {
  const { menuAdmin, groupeDe } = await import('../src/lib/menu.js');
  const g = menuAdmin().principal.find((x) => x.groupe === 'Relations');
  assert.equal(g.cle, 'Relations');
  assert.equal(groupeDe('Agents').groupe, 'Relations');
  // Le Suivi et ses pages de détail sont dans Administration (18 oct. 2026).
  assert.equal(groupeDe('Monitoring').groupe, 'Administration');
  assert.equal(groupeDe('SuiviAppels').groupe, 'Administration');
  assert.equal(groupeDe('Cerveau').groupe, 'Administration');
  assert.equal(groupeDe('Dashboard'), null);
});

test('le menu des mandataires : la structure de l’équipe, Biens en une entrée, Feedback dans Autre', async () => {
  const { menuMandataire, groupeDe } = await import('../src/lib/menu.js');
  const { principal, autre } = menuMandataire();
  assert.deepEqual(principal.map((x) => x.label), ['Haka', 'Prospection', 'Biens', 'Clients', 'Projets', 'Simulateur']);
  // Biens, une seule entrée (24 oct. 2026) : les étapes sont dans la page, plus d'onglets en tête.
  assert.equal(principal.find((x) => x.label === 'Biens').cle, 'MandataireBiens');
  assert.deepEqual(autre.map((e) => e.cle), ['Feedback']);
  assert.equal(groupeDe('MandataireMandat', 'mandataire'), null);
  // L'Off-market est dans la Prospection (23 oct. 2026) : plus d'entrée à part, ni dans « Autre ».
  assert.ok(!principal.some((x) => x.cle === 'MandataireOffMarket' || (x.entrees || []).some((e) => e.cle === 'MandataireOffMarket')));
  assert.ok(!autre.some((e) => e.cle === 'MandataireOffMarket'));
  assert.equal(groupeDe('MandataireMandat'), null);
  // Une page masquée disparaît du groupe ; un groupe vidé disparaît.
  assert.ok(!menuMandataire(['MandataireProspection']).principal.some((x) => x.cle === 'MandataireProspection'));
});

test('le Simulateur reste dans les deux menus, même masqué dans d’anciennes préférences', async () => {
  const { menuAdmin, menuMandataire } = await import('../src/lib/menu.js');
  assert.ok(menuAdmin(['SimulateurRentabilite']).principal.some((x) => x.cle === 'SimulateurRentabilite'));
  assert.ok(menuMandataire(['SimulateurRentabilite']).principal.some((x) => x.cle === 'SimulateurRentabilite'));
});

