// La pièce d'un dossier mandataire qu'un fichier déposé désigne, d'après son
// nom. Sans certitude, rien n'est choisi : le mandataire choisit.

/** Pure : la pièce de la liste qu'un nom de fichier désigne, s'il en désigne une. */
export function devinerPiece(nom, lignes = []) {
  const n = String(nom || "").toLowerCase().replace(/[_\-.]+/g, " ");
  const regles = [
    ["quittances", /quittance|appel de loyer|avis d.?echeance|avis d.?échéance/],
    ["kbis", /k ?bis|extrait rcs|infogreffe/],
    ["copropriete", /copro|reglement|règlement|\bpv\b|assembl|\bag\b/],
    ["diagnostics", /\bdpe\b|diag|amiante|plomb|termite|erp\b|electricit|électricit/],
    ["taxe_fonciere", /taxe|fonci/],
    ["bail", /\bbail|avenant|renouvel/],
  ];
  const cles = new Set(lignes.map((l) => l.cle));
  const trouvee = regles.find(([cle, re]) => cles.has(cle) && re.test(n));
  if (trouvee) return trouvee[0];
  const libre = lignes.find((l) => l.cle.startsWith("autre_") && n.includes(String(l.mot || "").toLowerCase().split(" ")[0]));
  return libre?.cle || null;
}
