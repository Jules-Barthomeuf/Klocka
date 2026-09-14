// Le chat d'ALX : reconnaître une rue ou un commerce dans une phrase. Pur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { trouverRue, trouverCommerce, interpreterSansModele } from './commande.js';

const RUES = [{ nom: 'Rue Meynadier' }, { nom: "Rue d'Antibes" }, { nom: 'Boulevard Carnot' }, { nom: 'Cours Félix Faure' }];
const CIBLES = [{ id: 'a', enseigne: 'Maison Peirano' }, { id: 'b', enseigne: 'Pharmacie du Palais' }];

test('une rue se retrouve malgré la casse, les accents et un type de voie différent', () => {
  assert.equal(trouverRue(RUES, 'rue meynadier').nom, 'Rue Meynadier');
  assert.equal(trouverRue(RUES, 'bd carnot').nom, 'Boulevard Carnot');
  assert.equal(trouverRue(RUES, 'rue d antibes').nom, "Rue d'Antibes");
  assert.equal(trouverRue(RUES, 'felix faure').nom, 'Cours Félix Faure');
  assert.equal(trouverRue(RUES, 'rue Hoche'), null);
});

test('un commerce connu se retrouve par un bout de son enseigne', () => {
  assert.equal(trouverCommerce(CIBLES, 'peirano').id, 'a');
  assert.equal(trouverCommerce(CIBLES, 'Maison Peirano').id, 'a');
  assert.equal(trouverCommerce(CIBLES, 'boulangerie'), null);
});

test('sans modèle, « prospecte la rue X » lance, « ouvre la rue X » montre, une enseigne se cherche', () => {
  assert.deepEqual(interpreterSansModele('prospecte la rue Meynadier', { rues: RUES }), { action: 'prospecter_rue', rue: 'rue Meynadier', reponse: '' });
  assert.equal(interpreterSansModele('ouvre le boulevard Carnot', { rues: RUES }).action, 'ouvrir_rue');
  const c = interpreterSansModele('regarde si Maison Peirano vaut le coup', { cibles: [] });
  assert.equal(c.action, 'prospecter_commerce');
  assert.equal(c.enseigne, 'Maison Peirano');
  assert.equal(interpreterSansModele('ouvre Maison Peirano', { cibles: CIBLES }).action, 'ouvrir_commerce');
  assert.equal(interpreterSansModele('', {}).action, 'inconnu');
  const a = interpreterSansModele("prospecte Maison Peirano au 12 rue d'Antibes", { cibles: [] });
  assert.equal(a.action, 'prospecter_commerce');
  assert.equal(a.adresse, "12 rue d'Antibes");
  assert.equal(a.enseigne, 'Maison Peirano');
});
