// Le format pivot : un chiffre, son unité, son échelle, sa source, sa date.
//
// Les quatre services parlent quatre langues. Data-B rend
// { rue: { basse, haute } }, Equimmox rend { bas, moyenne, haut }, Le Figaro
// rend { commune: { prix: { median, bas, haut } } }. Tant qu'on les compare à
// l'œil, chacun garde sa forme ; dès qu'une source en remplace une autre, il
// faut qu'elles rendent la même chose, sinon l'écran ne sait plus quoi
// afficher et le repli ne sert à rien.
//
// La règle qui tient tout : un indicateur qu'une source ne donne pas
// N'EXISTE PAS. Pas de zéro, pas de moyenne des voisins, pas de report de la
// commune sur le quartier. Une case vide se voit et se comble ; un chiffre
// inventé se recopie dans une note d'investissement.

/** Les indicateurs que Klocka sait comparer, et leur unité. */
export const INDICATEURS = {
  loyer_commercial_m2_an: { titre: 'Loyer commercial', unite: '€ / m² / an' },
  prix_residentiel_m2: { titre: 'Prix du résidentiel', unite: '€ / m²' },
  loyer_residentiel_m2_mois: { titre: 'Loyer du résidentiel', unite: '€ / m² / mois' },
  prix_fonds_commerce: { titre: 'Prix des fonds de commerce', unite: '€' },
};

/** Un nombre, ou rien. Zéro compris : personne ne loue à zéro euro le m². */
export const nombreOuRien = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/**
 * Une valeur du format pivot. Rend `null` si les trois bornes sont vides :
 * un indicateur sans aucun chiffre n'est pas un indicateur.
 *
 * @param {object} p
 * @param {string} p.cle - la clé dans INDICATEURS
 * @param {object} p.source - { connecteur, service, libelle, lien, collecte_le, du_cache }
 */
export function valeur({ cle, bas, median, haut, echelle = null, precision = null, source }) {
  const b = nombreOuRien(bas);
  const m = nombreOuRien(median);
  const h = nombreOuRien(haut);
  if (b == null && m == null && h == null) return null;
  const def = INDICATEURS[cle];
  return {
    cle,
    titre: def?.titre || cle,
    unite: def?.unite || null,
    bas: b,
    median: m,
    haut: h,
    // À quelle maille le chiffre a été relevé : une moyenne de commune et une
    // fourchette de rue ne se lisent pas de la même façon.
    echelle,
    // Ce qui restreint la mesure : « rayon 500 m, 70–130 m² ».
    precision,
    // La provenance voyage avec la valeur, pas à côté d'elle.
    connecteur: source?.connecteur || null,
    service: source?.service || null,
    source: source?.libelle || source?.service || null,
    collecte_le: source?.collecte_le || null,
    du_cache: !!source?.du_cache,
    lien: source?.lien || null,
  };
}

/**
 * Range des valeurs dans un jeu d'indicateurs, sans écraser ce qui y est déjà.
 *
 * Le premier arrivé gagne : la chaîne interroge les sources dans l'ordre de
 * confiance de l'équipe, donc la première qui répond est la meilleure dont on
 * dispose. Une source de repli complète les cases vides, elle ne corrige pas
 * celles qui sont remplies.
 */
export function poser(indicateurs, valeurs) {
  for (const v of valeurs) {
    if (!v || indicateurs[v.cle]) continue;
    indicateurs[v.cle] = v;
  }
  return indicateurs;
}

/** Les indicateurs qu'aucune source n'a pu remplir, parmi ceux attendus. */
export const manquants = (indicateurs, attendus) =>
  attendus.filter((c) => !indicateurs[c]);
