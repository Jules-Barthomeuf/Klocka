// Les libellés de la nomenclature d'activités française.
//
// Le registre des entreprises ne publie qu'un code : « 85.59A », jamais
// « Formation continue d'adultes ». Sans cette table, un écran ne peut montrer
// que la raison sociale, qui ne dit rien du métier — « ISATIS » au lieu de
// « centre de formation ».
//
// La table est celle de l'INSEE, niveau 5, les 732 sous-classes de la NAF
// rév. 2 en vigueur depuis 2008. Elle est figée dans naf.json : c'est une
// nomenclature officielle, elle ne bouge pas, et la télécharger à chaud
// ajouterait une dépendance réseau à un écran qui n'en a pas besoin.
//
// Source : https://www.insee.fr/fr/information/2120875
//          naf2008_liste_n5.xls, « Niveau 5 - Liste des sous-classes ».
//
// Une réserve à connaître : les établissements fermés avant 2008 portent des
// codes de la nomenclature PRÉCÉDENTE (« 55.5A », « 85.3K »), plus courts d'un
// caractère. Ils ne sont pas dans cette table et ne le seront pas. La fonction
// rend alors null, et l'appelant retombe sur le nom de la société plutôt que
// d'afficher un libellé faux.

import fs from 'fs';

const TABLE = JSON.parse(fs.readFileSync(new URL('./naf.json', import.meta.url), 'utf8'));

/** Le nombre de sous-classes connues, pour qu'un test puisse le vérifier. */
export const NAF_SOUS_CLASSES = Object.keys(TABLE).length;

/**
 * Le libellé d'un code NAF, ou null s'il est inconnu. Pure : testée sans
 * réseau.
 *
 * Le point est facultatif à l'entrée : le registre écrit « 47.11B », d'autres
 * sources « 4711B », et les deux désignent la même sous-classe.
 */
export function libelleActivite(code) {
  const brut = String(code || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (brut.length !== 5) return null;
  return TABLE[`${brut.slice(0, 2)}.${brut.slice(2)}`] || null;
}
