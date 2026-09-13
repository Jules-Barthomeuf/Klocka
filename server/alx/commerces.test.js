// Les commerces lus dans l'annuaire : la rue d'une adresse, le catalogue des
// activités, le classement des rues par loyer. Tout est pur, rien n'appelle
// le réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rueDe, joliNomDeRue, cleRue, piedDImmeuble, libelleApe, etablissementDe } from './commerces.js';
import { grouperParRue, emplacementParLoyer } from './rues.js';

test('la rue se lit dans une adresse telle que l’annuaire l’écrit', () => {
  assert.deepEqual(rueDe("22 RUE D'ANTIBES 06400 CANNES"), { numero: '22', rue: "Rue d'Antibes", code_postal: '06400', ville: 'Cannes' });
  assert.deepEqual(rueDe("HESPERIDES DE CANNES 123 RUE D'ANTIBES 06400 CANNES"), { numero: '123', rue: "Rue d'Antibes", code_postal: '06400', ville: 'Cannes' });
  assert.equal(rueDe('5 BIS BD CARNOT 06400 CANNES').rue, 'Boulevard Carnot', 'le type de voie est écrit en entier');
  assert.equal(rueDe('5 BIS BD CARNOT 06400 CANNES').numero, '5bis');
  assert.equal(rueDe('RUE MEYNADIER 06400 CANNES').numero, null);
  assert.equal(rueDe("4 RUE DE L'HOTEL DE VILLE 06400 CANNES").rue, "Rue de l'Hotel de Ville");
  assert.equal(rueDe('').rue, null);
});

test('deux écritures d’une même rue donnent la même clé', () => {
  assert.equal(cleRue("Rue d'Antibes"), cleRue("RUE D ANTIBES"));
  assert.equal(cleRue('BD CARNOT'), cleRue('Boulevard Carnot'));
  assert.equal(cleRue('Av. de la République'), cleRue('AVENUE DE LA REPUBLIQUE'));
  assert.notEqual(cleRue("Rue d'Antibes"), cleRue("Avenue d'Antibes"));
});

test('le nom d’une rue s’écrit proprement', () => {
  assert.equal(joliNomDeRue("RUE D'ANTIBES"), "Rue d'Antibes");
  assert.equal(joliNomDeRue('PLACE DU MARCHE AUX FLEURS'), 'Place du Marche aux Fleurs');
  assert.equal(joliNomDeRue('bd carnot'), 'Boulevard Carnot');
});

test('le catalogue distingue un pied d’immeuble d’un cabinet au troisième', () => {
  assert.equal(piedDImmeuble('47.71Z').oui, true);
  assert.equal(piedDImmeuble('56.10C').oui, true);
  assert.equal(piedDImmeuble('64.19Z').oui, true, 'une banque a une agence en pied d’immeuble');
  assert.equal(piedDImmeuble('68.20B').oui, false);
  assert.match(piedDImmeuble('68.20B').motif, /SCI/);
  assert.match(piedDImmeuble('69.10Z').motif, /profession libérale/);
  assert.match(piedDImmeuble('86.21Z').motif, /profession libérale/);
  assert.match(piedDImmeuble('46.34Z').motif, /grossiste/);
  assert.match(piedDImmeuble('47.91B').motif, /sans local/);
  assert.equal(piedDImmeuble(null).oui, false);
});

test('le libellé APE parle la langue des règles d’exclusion', () => {
  assert.match(libelleApe('56.10C'), /snack/, 'la restauration rapide doit être exclue par le mot-clé « snack »');
  assert.match(libelleApe('56.30Z'), /café/);
  assert.equal(libelleApe('99.99Z'), 'APE 9999Z');
});

test('un établissement de l’annuaire devient ce qu’ALX garde', () => {
  const e = etablissementDe(
    { siren: '123456789', nom_complet: 'GRANDVISION FRANCE', nombre_etablissements_ouverts: 400 },
    { siret: '12345678900021', adresse: "22 RUE D'ANTIBES 06400 CANNES", activite_principale: '47.78A', liste_enseignes: ['GRANDOPTICAL'], etat_administratif: 'A', latitude: '43.55', longitude: '7.01', date_debut_activite: '2015-03-01', libelle_commune: 'CANNES' }
  );
  assert.equal(e.enseigne, 'GRANDOPTICAL');
  assert.equal(e.rue, "Rue d'Antibes");
  assert.equal(e.numero, '22');
  assert.equal(e.ape, '4778A');
  assert.equal(e.chaine, true);
  assert.equal(e.actif, true);
  assert.equal(e.pied_d_immeuble.oui, true);
});

test('les rues se comptent, les cabinets et SCI sont ignorés avec leur motif', () => {
  const etab = (rue, ape, enseigne = null, chaine = false) => etablissementDe({ nom_complet: 'X', nombre_etablissements_ouverts: chaine ? 50 : 1 }, { siret: String(Math.random()), adresse: `1 ${rue} 06400 CANNES`, activite_principale: ape, liste_enseignes: enseigne ? [enseigne] : [], etat_administratif: 'A' });
  const { rues, ignores } = grouperParRue([
    etab("RUE D'ANTIBES", '47.71Z', 'JULES', true),
    etab("RUE D ANTIBES", '56.10A'),
    etab('RUE MEYNADIER', '47.22Z'),
    etab("RUE D'ANTIBES", '68.20B'),
    etab("RUE D'ANTIBES", '69.10Z'),
  ]);
  assert.equal(rues[0].nom, "Rue d'Antibes");
  assert.equal(rues[0].commerces, 2, 'les deux écritures de la rue se cumulent');
  assert.deepEqual(rues[0].chaines, ['JULES']);
  assert.equal(rues[1].commerces, 1);
  assert.equal(ignores['SCI, location immobilière'], 1);
  assert.equal(Object.values(ignores).reduce((a, b) => a + b, 0), 2);
});

test('le loyer de la rue fait l’emplacement, et l’absence de loyer ne bloque pas', () => {
  const seuils = { loyer_emplacement_1: 800, loyer_emplacement_2: 350 };
  assert.equal(emplacementParLoyer({ basse: 899, haute: 1348 }, 40, seuils).classe, 1, "rue d'Antibes");
  assert.equal(emplacementParLoyer({ basse: 446, haute: 669 }, 43, seuils).classe, 2, 'rue Félix Faure, un cran en dessous');
  assert.equal(emplacementParLoyer({ basse: 347, haute: 521 }, 78, seuils).classe, 2, 'avenue de Grasse');
  assert.equal(emplacementParLoyer({ basse: 120, haute: 200 }, 12, seuils).classe, null);
  assert.match(emplacementParLoyer({ basse: 120, haute: 200 }, 12, seuils).motif, /trop bas/);
  assert.equal(emplacementParLoyer(null, 12, seuils).classe, 2);
  assert.match(emplacementParLoyer(null, 12, seuils).motif, /à vérifier/);
  assert.match(emplacementParLoyer({ basse: 899, haute: 1348 }, 40, seuils).motif, /40 commerces · loyer 899–1348/);
});
