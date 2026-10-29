// Plusieurs pièces jointes à un même message (27 oct. 2026, Jules : « on doit pouvoir attacher plusieurs
// documents dans le chat ») : le texte qui les présente au modèle, et la pièce qu'un outil vise.

/** Une pièce ou un lot, toujours en tableau. */
export function lotDePieces({ piece = null, pieces = null } = {}) {
  if (Array.isArray(pieces) && pieces.length) return pieces.filter(Boolean);
  return piece ? [piece] : [];
}

/**
 * Pure : le message suivi d'une ligne par pièce, son nom et ce qu'on y lit. Une pièce seule garde
 * `max` signes ; un lot se partage le double, sans descendre sous 1 500 signes par pièce.
 */
export function texteAvecPieces(texte, pieces = [], max = 5000) {
  if (!pieces.length) return texte;
  const par = pieces.length === 1 ? max : Math.max(1500, Math.floor((max * 2) / pieces.length));
  const lignes = pieces.map((p) => `(pièce jointe : ${p.nom}${p.texte ? `. Ce qu'on y lit : ${p.texte.slice(0, par)}` : ', illisible'})`);
  return `${texte || (pieces.length > 1 ? 'Voici des pièces.' : 'Voici une pièce.')}\n\n${lignes.join('\n')}`;
}

/**
 * Pure : la pièce visée par un outil. Le nom dit par le modèle d'abord (exact, puis sans la casse, puis
 * contenu) ; une pièce seule se prend sans nom. Plusieurs pièces sans nom reconnu : 'ambigu'.
 */
export function choisirPiece(pieces = [], nom = null) {
  if (!pieces.length) return null;
  const n = String(nom || '').trim().toLowerCase();
  if (n) {
    const trouvee = pieces.find((p) => p.nom === nom)
      || pieces.find((p) => String(p.nom || '').toLowerCase() === n)
      || pieces.find((p) => String(p.nom || '').toLowerCase().includes(n));
    if (trouvee) return trouvee;
  }
  return pieces.length === 1 ? pieces[0] : 'ambigu';
}
