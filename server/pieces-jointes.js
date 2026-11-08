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

// Les pièces jointes des derniers messages (7 nov. 2026, Jules : « il a pas pu le mettre car le pdf était dans le message
// précédent ») : gardées deux heures par personne, pour qu'un « dépose-le quand même » au message suivant les retrouve.
const RECENTES = new Map();
const DUREE_RECENTES = 2 * 60 * 60 * 1000;

/** Retient les pièces d'un message, les plus récentes d'abord (dix au plus). */
export function retenirPieces(email, pieces = [], maintenant = Date.now()) {
  const qui = String(email || '').toLowerCase();
  if (!qui || !pieces.length) return;
  const avant = (RECENTES.get(qui) || []).filter((p) => maintenant - p.retenue_le < DUREE_RECENTES && !pieces.some((x) => x.url === p.url));
  RECENTES.set(qui, [...pieces.filter((p) => p?.url).map((p) => ({ ...p, retenue_le: maintenant })), ...avant].slice(0, 10));
}

/** Les pièces jointes des deux dernières heures, les plus récentes d'abord. */
export function piecesRecentes(email, maintenant = Date.now()) {
  return (RECENTES.get(String(email || '').toLowerCase()) || []).filter((p) => maintenant - p.retenue_le < DUREE_RECENTES);
}
