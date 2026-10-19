// « À combien négocier pour être à 7 % ? » (19 oct. 2026, Jules) : le simulateur répond, pas un calcul à la main.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prixPourRendement, simulationDuProjet } from './simulation-projet.js';

const projet = { sim_prix_bien_fai: 619500, sim_prix_bien_negocie: 619500, sim_loyer_initial_ht: 36600, sim_surface: 80, sim_taux_interet: 3.9, sim_duree_credit: 20, sim_annee_revente: 20 };

test('le prix trouvé donne le rendement net du simulateur, et un millier de plus le fait passer sous la cible', () => {
  const r = prixPourRendement(projet, 7);
  assert.ok(r.prix_negocie < 619500 && r.prix_negocie > 450000, String(r.prix_negocie));
  assert.equal(r.prix_negocie % 1000, 0);
  assert.ok(r.apres.rendement_net >= 7, JSON.stringify(r.apres));
  assert.ok(simulationDuProjet({ ...projet, sim_prix_bien_negocie: r.prix_negocie + 2000 }).rendement_global_net < 7);
  // Le rendement de l'année 1 est plus bas que la moyenne indexée : c'est la confusion d'origine.
  assert.ok(r.apres.rendement_an1 < r.apres.rendement_net);
  // Le calcul à la main de Haka (415 000 €) est loin du compte.
  assert.ok(r.prix_negocie > 500000);
});

test('un loyer plus haut permet un prix plus haut ; sans prix au simulateur, rien', () => {
  assert.ok(prixPourRendement(projet, 7, { loyer: 48000 }).prix_negocie > prixPourRendement(projet, 7).prix_negocie);
  assert.equal(prixPourRendement({}, 7), null);
});
