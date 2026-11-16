// La réponse de la recherche du locataire, sans ce que le modèle dit de lui-même (16 nov. 2026, Jules : enlever « Je
// pense que « forme financière » désigne… Voici ce que j'ai trouvé » et « Je n'ai pas pu lire le détail des bilans… »).
// On garde les faits : les paragraphes et les lignes où le modèle parle de sa recherche s'en vont.

const PARLE_DE_LUI = /^(?:\s*(?:[-*]\s*)?)(?:je |j['’]|voici |d['’]accord|bien sûr|pour les consulter|n['’]h[ée]sitez|si vous (?:voulez|souhaitez))/i;
const RECHERCHE_RATEE = /\b(?:je n['’]ai pas (?:pu|trouvé|réussi)|je ne (?:peux|parviens)|n['’]ai pas pu|pas pu (?:lire|ouvrir|accéder))\b/i;

/** Pure : le texte sans ses paragraphes ni ses lignes où le modèle parle de lui ou de sa recherche. */
export function nettoyerReponse(texte) {
  const blocs = String(texte || "").replace(/\r/g, "").split(/\n{2,}/);
  const gardes = blocs
    .map((b) => b.split("\n").filter((l) => !(PARLE_DE_LUI.test(l) || RECHERCHE_RATEE.test(l))).join("\n").trim())
    .filter(Boolean);
  // Un titre resté seul à la fin (« Conclusion » dont le texte est parti) s'en va aussi.
  while (gardes.length && /^#{1,6}\s/.test(gardes[gardes.length - 1]) && !gardes[gardes.length - 1].includes("\n")) gardes.pop();
  return gardes.join("\n\n");
}
