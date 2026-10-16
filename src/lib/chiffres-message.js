// Les chiffres d'une réponse, en carte (16 oct. 2026, Jules) : un tableau, ou
// au moins deux puces « - Libellé : valeur — explication », deviennent des
// lignes libellé à gauche, valeur à droite, l'explication dessous.
const SEPARATEUR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;
const valeurCourte = (v) => v && v.length <= 32 && /\d/.test(v);

export function ligneChiffre(l) {
  const propre = String(l).replace(/\*\*|__/g, "");
  const t = propre.match(/^\s*\|(.+)\|\s*$/);
  if (t) {
    const c = t[1].split("|").map((x) => x.trim());
    return c.length >= 2 && c.length <= 3 && valeurCourte(c[1]) ? { libelle: c[0], valeur: c[1], detail: c[2] || null, tableau: true } : null;
  }
  const b = propre.match(/^\s*[-*•]\s+([^:\n]{2,40}?)\s*:\s*(.+)$/);
  if (!b) return null;
  const [valeur, ...reste] = b[2].trim().split(/\s+[—–]\s+|\.\s+|;\s+/);
  const v = valeur.replace(/\.$/, "").trim();
  return valeurCourte(v) ? { libelle: b[1].trim(), valeur: v, detail: reste.join(". ").trim() || null } : null;
}

/** Pure : le texte en morceaux, `{ texte }` ou `{ chiffres: [...] }`. */
export function morceaux(contenu) {
  const lignes = String(contenu || "").replace(/\r\n?/g, "\n").split("\n");
  // L'en-tête d'un tableau (la ligne avant « |---| ») n'est pas un chiffre.
  const sansEntete = [];
  for (let i = 0; i < lignes.length; i++) {
    if (SEPARATEUR.test(lignes[i]) && /\|/.test(lignes[i])) { if (/^\s*\|/.test(sansEntete.at(-1) || "")) sansEntete.pop(); continue; }
    sansEntete.push(lignes[i]);
  }
  const out = [];
  let texte = [];
  let i = 0;
  while (i < sansEntete.length) {
    const run = [];
    let j = i;
    while (j < sansEntete.length && ligneChiffre(sansEntete[j])) { run.push(ligneChiffre(sansEntete[j])); j++; }
    if (run.length >= 2 || (run.length === 1 && run[0].tableau)) {
      if (texte.join("\n").trim()) out.push({ texte: texte.join("\n").trim() });
      texte = [];
      out.push({ chiffres: run });
      i = j;
    } else {
      texte.push(sansEntete[i]);
      i++;
    }
  }
  if (texte.join("\n").trim()) out.push({ texte: texte.join("\n").trim() });
  return out;
}
