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

test("le menu de l'équipe (17 oct. 2026) : cinq pages, Relations, Administration ; Autre : Offres, Dossier bancaire, Feedback (26 oct.)", async () => {
  const { menuAdmin } = await import('../src/lib/menu.js');
  const { principal, autre } = menuAdmin();
  assert.deepEqual(principal.filter((x) => !x.groupe).map((x) => x.label), ['Assistant', 'Projets', 'Dossiers', 'Appels', 'Simulateur', 'Twenty CRM']);
  // Le CRM (27 oct. 2026), toujours là ; dans Klocka depuis le 5 nov. 2026 (page /CRM), plus une entrée externe.
  assert.ok(principal.find((x) => x.cle === 'CRM') && !principal.find((x) => x.cle === 'CRM').externe);
  assert.ok(menuAdmin(['CRM']).principal.some((x) => x.cle === 'CRM'));
  // À valider quitte le menu (26 oct. 2026, Jules) ; la cloche et les dossiers y mènent encore.
  assert.ok(![...principal, ...autre].some((x) => x.cle === 'AValider'));
  const cles = autre.map((e) => e.cle);
  assert.deepEqual(principal.filter((x) => x.groupe).map((x) => [x.groupe, x.entrees.map((e) => e.label)]), [['Administration', ['Intelligence', 'Automatismes', 'Modèles', 'Suivi']]]);
  // 6 nov. 2026 : Accès CRM, Relations, Utilisateurs et Mandataires quittent le menu (les deux derniers sont des tableaux du
  // CRM) ; Intelligence et Automatismes cachés pour Jules seul.
  for (const hors of ['AdminMandataires', 'AdminUtilisateurs', 'AdminClients', 'AdminAccesCrm']) assert.ok(![...principal, ...autre].some((x) => x.cle === hors || x.entrees?.some((e) => e.cle === hors)), hors);
  assert.deepEqual(menuAdmin([], { email: 'Jules.B@klocka.immo' }).principal.find((x) => x.groupe === 'Administration').entrees.map((e) => e.label), ['Modèles', 'Suivi']);
    for (const hors of ['Semaine', 'Monitoring', 'Personnalisation', 'Dashboard', 'Agents']) assert.ok(!cles.includes(hors), hors);
  assert.deepEqual(cles, ['AdminSuggestions', 'AdminPresentations', 'Offres', 'AdminBanque', 'Tokimo'], 'Feedback en tête ; Offres, les Présentations bancaires et le Dossier bancaire reviennent (26 oct.) ; Tokimo (6 nov.) ; Emailing, Lead magnets… restent hors du menu');
  // Une page masquée disparaît ; un groupe vidé aussi.
  const m = menuAdmin(['Cerveau', 'Automatismes', 'AdminModeles', 'Monitoring', 'Offres']);
  assert.ok(!m.principal.some((x) => x.groupe === 'Administration'));
  // Autre ignore les masques (26 oct.) : d'anciens réglages de Paramètres cachaient Feedback, Offres et Présentations.
  assert.deepEqual(menuAdmin(['AdminSuggestions', 'Offres', 'AdminPresentations', 'AdminBanque']).autre.map((e) => e.cle), ['AdminSuggestions', 'AdminPresentations', 'Offres', 'AdminBanque', 'Tokimo']);
});

test('un groupe est une entrée ; une page sait son groupe', async () => {
  const { menuAdmin, groupeDe } = await import('../src/lib/menu.js');
  const g = menuAdmin().principal.find((x) => x.groupe === 'Administration');
  assert.equal(g.cle, 'Administration');
  assert.equal(groupeDe('Agents'), null, 'Relations quitte le menu (6 nov. 2026)');
  // Le Suivi et ses pages de détail sont dans Administration (18 oct. 2026).
  assert.equal(groupeDe('Monitoring').groupe, 'Administration');
  assert.equal(groupeDe('SuiviAppels').groupe, 'Administration');
  assert.equal(groupeDe('Cerveau').groupe, 'Administration');
  assert.equal(groupeDe('Dashboard'), null);
});

test('le menu des mandataires : la structure de l’équipe, Biens en une entrée, Feedback dans Autre', async () => {
  const { menuMandataire, groupeDe } = await import('../src/lib/menu.js');
  const { principal, autre } = menuMandataire();
  assert.deepEqual(principal.map((x) => x.label), ['Assistant', 'Tableau de bord', 'Prospection', 'Mes biens', 'Clients', 'Simulateur', 'Twenty CRM']);
  // Projets retiré (31 oct. 2026, PLAN.md 0.3) : ni au menu, ni dans « Autre ».
  assert.ok(!principal.some((x) => x.cle === 'MandataireProjets') && !autre.some((e) => e.cle === 'MandataireProjets'));
  // Biens, une seule entrée (24 oct. 2026) : les étapes sont dans la page, plus d'onglets en tête.
  assert.equal(principal.find((x) => x.label === 'Mes biens').cle, 'MandataireBiens');
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

