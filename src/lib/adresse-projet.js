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
    .find((v) => v && !VIDES.has(norm(v)) && !/\d+\s*(bis|ter)?\s*,?\s*(rue|avenue|av|bd|boulevard|place|chemin|quai|all[ée]e|impasse|cours|route)\b/i.test(v));
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

/**
 * Le résultat d'un géocodage est-il bien dans la ville du projet ? La ville
 * ou le code postal écrits dans l'adresse font foi : la fin du titre, prise
 * pour la ville quand le secteur est vide, est souvent l'enseigne (« Murs -
 * Bisou Volé » refusait « 1 rue du Nord, 59800 Lille »). Sans ville connue, oui.
 */
export function memeVille(p, villeTrouvee, codePostal = null) {
  const ecrite = ` ${norm(p?.adresse_complete)} `;
  if (codePostal && ecrite.includes(` ${String(codePostal).trim()} `)) return true;
  if (villeTrouvee && norm(villeTrouvee) && ecrite.includes(` ${norm(villeTrouvee)} `)) return true;
  const ville = villeDuProjet(p);
  if (!ville || !villeTrouvee) return true;
  const a = norm(ville);
  const b = norm(villeTrouvee);
  return b === a || b.startsWith(`${a} `) || a.startsWith(`${b} `);
}

const distanceKm = (x, y) => Math.hypot((x.lat - y.lat) * 111, (x.lon - y.lon) * 111 * Math.cos((x.lat * Math.PI) / 180));

/**
 * Pure : un résultat de la BAN est-il le local du projet ? Un numéro ou une
 * rue, assez sûr, dans la bonne ville (memeVille), ou à moins de 15 km de la
 * commune du dossier (ses coordonnées enregistrées) quand la ville du projet
 * n'est qu'une supposition.
 */
export function resultatPlausible(p, feature, pres = null) {
  const pr = feature?.properties || {};
  if ((pr.score ?? 0) < 0.5 || !["housenumber", "street"].includes(pr.type)) return false;
  if (memeVille(p, pr.city, pr.postcode)) return true;
  const [lon, lat] = feature?.geometry?.coordinates || [];
  return !!pres && Number.isFinite(lat) && distanceKm(pres, { lat, lon }) <= 15;
}

/** Les recherches à essayer : l'adresse avec la ville du projet, puis l'adresse seule si on lui en a ajouté une. */
export function adressesAEssayer(p) {
  const brute = String(p?.adresse_complete || "").trim();
  return [...new Set([adresseAChercher(p), brute].filter(Boolean))];
}
