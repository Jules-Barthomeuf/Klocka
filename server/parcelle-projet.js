// La parcelle du bien, dans l'onglet Bien du projet (25 nov. 2026, Jules : « dans Bien il faudrait que tu charges une
// capture DVF de la parcelle, ou sinon on importe une image du plan ; de base tu mets le truc DVF »). Par défaut, la
// carte de la parcelle : l'adresse du projet passe par la Base Adresse Nationale, puis les parcelles du cadastre autour
// du point (Géoplateforme, comme K-Foncier) ; celle qui porte le point est le bien, ses voisines dessinent le plan. Un
// plan importé passe devant (BienProjet.jsx).
//
// Le résultat se garde par projet et par adresse (ParcelleProjet) : la page ne rappelle pas le cadastre à chaque
// ouverture, et le lien public, sans compte, lit ce qui a été gardé.

import { Records } from './db.js';

const ENTITE = 'ParcelleProjet';
const RAYON_M = 70;
const GARDE_JOURS = 90;

const cleAdresse = (t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Pure : le point est-il dans le contour (GeoJSON, longitude puis latitude) ? */
export function contient(geometry, lat, lon) {
  const polygones = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  return polygones.some((p) => {
    const a = p[0] || [];
    let dedans = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i];
      const [xj, yj] = a[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  });
}

/** Pure : la distance en mètres du point au sommet le plus proche du contour. */
function distanceAuContour(geometry, lat, lon) {
  const polygones = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  let min = Infinity;
  for (const p of polygones) for (const [x, y] of p[0] || []) min = Math.min(min, Math.hypot((x - lon) * kx, (y - lat) * 110540));
  return min;
}
const PROCHE_M = 30;

/**
 * Pure : ce que la page reçoit, la parcelle du bien d'abord. Le point de l'adresse tombe parfois dans la rue ou sur la
 * place (Lorient, place de la Libération) : la parcelle la plus proche, à moins de 30 m, est prise, dite « proche ».
 */
export function planDeLaParcelle({ point, parcelles = [] }) {
  let ici = parcelles.find((p) => contient(p.geometry, point.lat, point.lon)) || null;
  let proche = false;
  if (!ici && parcelles.length) {
    const [plus] = parcelles.map((p) => ({ p, d: distanceAuContour(p.geometry, point.lat, point.lon) })).sort((a, b) => a.d - b.d);
    if (plus && plus.d <= PROCHE_M) { ici = plus.p; proche = true; }
  }
  return {
    point,
    parcelle: ici ? { idu: ici.idu, section: ici.section, numero: ici.numero, contenance: ici.contenance ?? null, code_insee: ici.code_insee, ...(proche ? { proche: true } : {}) } : null,
    parcelles: parcelles.map((p) => ({ idu: p.idu, geometry: p.geometry })),
  };
}

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Pure : l'adresse trouvée est-elle celle du projet ? Sans numéro, le point est le centre d'une rue ou d'une ville
 * (« Lorient ») ; sans ville ni code postal dans l'adresse du projet, la BAN en choisit une (« 53 Rue de la République »
 * rendait Marseille ou une autre) : pas de parcelle plutôt qu'une parcelle fausse.
 */
export function adresseSure(texte, a) {
  if (!a?.numero) return { ok: false, error: 'L\'adresse n\'a pas de numéro : la parcelle ne peut pas être située.' };
  const t = sansAccents(texte);
  const villeDite = (a.code_postal && t.includes(a.code_postal)) || (a.ville && t.includes(sansAccents(a.ville)));
  if (!villeDite) return { ok: false, error: 'L\'adresse ne dit pas la ville : la parcelle ne peut pas être située.' };
  return { ok: true };
}

/** La parcelle gardée pour ce projet et son adresse actuelle, ou null. Sans appel. */
export function parcelleGardee(projet) {
  const adresse = cleAdresse(projet?.adresse_complete);
  if (!projet?.id || !adresse) return null;
  const g = Records.filter(ENTITE, { project_id: projet.id }).find((x) => x.adresse === adresse);
  return g?.plan || null;
}

/**
 * La parcelle du projet : gardée si elle a moins de 90 jours, sinon lue. `lire` : { resoudre, autour } (remplacés dans
 * les tests). Rend { ok, plan } ou { ok: false, error }.
 */
export async function parcelleDuProjet(projet, { forcer = false, lire = {} } = {}) {
  const adresse = cleAdresse(projet?.adresse_complete);
  if (!adresse) return { ok: false, error: 'Le projet n\'a pas d\'adresse.' };
  const garde = Records.filter(ENTITE, { project_id: projet.id }).find((x) => x.adresse === adresse);
  // Une adresse qui ne situe pas le bien est gardée aussi, sans plan : on ne la relit pas, on ne montre rien de faux.
  if (garde && !forcer && Date.now() - Date.parse(garde.le) < GARDE_JOURS * 86400000 && (garde.plan || garde.erreur)) {
    return garde.plan ? { ok: true, plan: garde.plan } : { ok: false, error: garde.erreur };
  }
  const garder = (plan, erreur = null) => {
    const donnees = { project_id: projet.id, adresse, plan, erreur, le: new Date().toISOString() };
    if (garde) Records.update(ENTITE, garde.id, donnees); else Records.create(ENTITE, donnees);
  };
  const resoudre = lire.resoudre || (await import('./adresse-ban.js')).resoudreAdresse;
  const autour = lire.autour || (await import('./kfoncier.js')).parcellesAutour;
  const a = await resoudre(projet.adresse_complete).catch(() => null);
  if (!a?.lat || !a?.lon) return { ok: false, error: 'Adresse introuvable dans la Base Adresse Nationale.' };
  const sure = adresseSure(projet.adresse_complete, a);
  if (!sure.ok) { garder(null, sure.error); return sure; }
  let parcelles;
  try { parcelles = await autour(a.lat, a.lon, RAYON_M); } catch (e) { return { ok: false, error: `Cadastre indisponible : ${e?.message || e}` }; }
  const plan = planDeLaParcelle({ point: { lat: a.lat, lon: a.lon, label: a.label || null }, parcelles });
  garder(plan);
  return { ok: true, plan };
}

/**
 * Le rapport Géorisques d'une adresse (26 nov. 2026, Jules : « Géorisques, que tu mets dans Diagnostics ») : la page
 * « Les risques près de chez moi » ouverte sur l'adresse. Elle demande les coordonnées et le code commune : l'adresse
 * passe par la Base Adresse Nationale. Sans adresse reconnue, l'accueil de Géorisques.
 */
export const ACCUEIL_GEORISQUES = 'https://www.georisques.gouv.fr/';
export function urlGeorisques(a) {
  if (!a?.lat || !a?.lon || !a?.code_insee) return ACCUEIL_GEORISQUES;
  const p = new URLSearchParams({
    'form-adresse': 'true', isCadastre: 'false', city: a.ville || '', type: a.numero ? 'housenumber' : 'street', typeForm: 'adresse',
    codeInsee: a.code_insee, lon: String(a.lon), lat: String(a.lat), adresse: a.label || '',
  });
  return `https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?${p}`;
}
export async function lienGeorisques(adresse, { resoudre = null } = {}) {
  const t = String(adresse || '').trim();
  if (t.length < 6) return ACCUEIL_GEORISQUES;
  const r = resoudre || (await import('./adresse-ban.js')).resoudreAdresse;
  const a = await r(t).catch(() => null);
  return urlGeorisques(a);
}
