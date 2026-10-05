// L'adresse d'un projet, telle qu'on la cherche sur une carte. Pure, partagée
// par la page projet (carte, Street View, plongée) et le serveur (chiffres du
// secteur).
//
// Une adresse saisie sans sa ville (« 53 Rue de la République ») est lue par
// la Base Adresse Nationale dans la ville la plus probable de France —
// Toulouse pour la pharmacie de Marseille. On y ajoute la ville du projet
// quand elle n'y est pas, et un résultat trouvé dans une autre ville est
// refusé.

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const VIDES = new Set(["", "non disponible", "inconnu", "inconnue", "na", "n a", "nc", "a definir"]);

/**
 * La ville du projet : celle du secteur, sinon la fin du titre (« Pharmacie
 * Du Passage - Marseille » → Marseille). « Paris 1er Arrondissement » → Paris.
 */
export function villeDuProjet(p) {
  const brute = [p?.ville_secteur_champ1, String(p?.titre || "").split(/\s+[-–—]\s+/).slice(1).pop()]
    .map((v) => String(v || "").trim())
    .find((v) => v && !VIDES.has(norm(v)) && !/\d{2,}\s*(rue|av|bd|boulevard|place|chemin)/i.test(v));
  if (!brute) return null;
  return brute.replace(/\s+\d+\s*(er|e|eme|ème)?(\s+arrondissement)?$/i, "").replace(/\s*\(.*\)$/, "").trim() || null;
}

/** L'adresse à chercher : celle du projet, complétée de sa ville quand elle n'y figure ni en nom ni en code postal. */
export function adresseAChercher(p) {
  const a = String(p?.adresse_complete || "").trim();
  if (!a) return null;
  const ville = villeDuProjet(p);
  if (!ville || /\b\d{5}\b/.test(a) || norm(a).includes(norm(ville))) return a;
  return `${a}, ${ville}`;
}

/** Le résultat d'un géocodage est-il bien dans la ville du projet ? Sans ville connue, oui. */
export function memeVille(p, villeTrouvee) {
  const ville = villeDuProjet(p);
  if (!ville || !villeTrouvee) return true;
  const a = norm(ville);
  const b = norm(villeTrouvee);
  return b === a || b.startsWith(`${a} `) || a.startsWith(`${b} `);
}
