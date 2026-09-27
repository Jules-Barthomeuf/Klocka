import { joliNom } from "@/components/alx/alx-commun";

// Ce que la fiche d'un commerce et le panneau d'une société d'ALX partagent :
// la phrase qui dit ce qu'est le commerce, et la façade dans Street View.

const annee = (iso) => (iso ? String(iso).slice(0, 4) : null);

/** Ce que fait le commerce, en quelques phrases, avec ce qu'on a lu. */
export function ceQueFait(c) {
  const o = c.occupant || {};
  const nom = joliNom(c.enseigne) || "Ce commerce";
  const phrases = [];
  phrases.push(`${nom} est ${c.activite ? `un commerce de ${c.activite.toLowerCase()}` : "un commerce de pied d'immeuble"}, au ${c.adresse}${c.ville ? ` à ${c.ville}` : ""}.`);
  if (o.nom) phrases.push(`Il est exploité par ${joliNom(o.nom)}${o.siren ? ` (SIREN ${o.siren})` : ""}${o.depuis ? `, installé ici depuis ${annee(o.depuis)}` : ""} : ${o.chaine ? "une enseigne nationale" : "un commerce indépendant"}.`);
  if (c.proprietaire_occupant) phrases.push("L'exploitant est aussi le propriétaire des murs.");
  const contacts = [c.site ? c.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null, c.telephone].filter(Boolean);
  if (contacts.length) phrases.push(`${contacts.join(" · ")}.`);
  if (c.source) phrases.push(`Vu sur ${c.source}.`);
  return phrases;
}

/** Le cap de la photo vers le commerce, en degrés, pour regarder la bonne façade. */
function capVers(photo, c) {
  if (!photo?.lat || !photo?.lon || c.lat == null || c.lon == null) return 0;
  const dLon = ((c.lon - photo.lon) * Math.PI) / 180;
  const l1 = (photo.lat * Math.PI) / 180, l2 = (c.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

/**
 * L'adresse de Street View pour un commerce, face à sa vitrine.
 *
 * Donner seulement la position laissait Google choisir un panorama autour du
 * point, parfois de l'autre côté de la rue, et le tourner vers le nord : il
 * fallait marcher dans la rue pour trouver le commerce. Le panorama et le cap
 * calculés par le serveur (la vue, ou la photo de la devanture) l'ouvrent
 * directement devant. Sans eux, la position en dernier recours.
 */
export function urlStreetView(c, cle, fov = 80) {
  const vue = c.vue?.pano ? c.vue : c.photo?.pano ? c.photo : null;
  if (vue) return `https://www.google.com/maps/embed/v1/streetview?key=${cle}&pano=${vue.pano}&heading=${vue.cap ?? capVers(vue, c)}&pitch=0&fov=${fov}`;
  if (c.lat != null && c.lon != null) return `https://www.google.com/maps/embed/v1/streetview?key=${cle}&location=${c.lat},${c.lon}&heading=${capVers(null, c)}&pitch=0&fov=${fov}`;
  return `https://www.google.com/maps/embed/v1/place?key=${cle}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`;
}

