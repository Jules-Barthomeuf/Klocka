// Signaux de vacance : les règles, sans réseau ni base.
//
// Tout ce qui se décide ici se teste sans rien appeler : ranger une annonce
// BODACC dans un type de signal, déduire le type de bien d'un code NAF, relier
// un signal d'entreprise aux locaux qu'elle occupe, mesurer une distance,
// regrouper les signaux d'un même local pour la carte.
//
// Spec du 13 oct. 2026 (« Signaux de vacance »). Les seuils de rattachement y
// sont des paramètres : ils vivent dans PARAMETRES, pas dans les fonctions.

/** Les seuils de la spec, à valider sur un échantillon réel. */
export const PARAMETRES = {
  // Un établissement fermé depuis moins de douze mois à la date du signal est encore « son » local.
  mois_rattachement: 12,
  // Au-delà, c'est un réseau : on ne garde que le siège, avec la mention multi-sites.
  max_etablissements: 10,
  // L'ancien siège d'un transfert : fermé à soixante jours près de la parution.
  jours_transfert: 60,
  // Une fermeture suivie d'une ouverture du même SIREN ailleurs dans ce délai : un déménagement.
  jours_demenagement: 90,
  // Ce qu'on charge d'une commune la première fois.
  mois_historique: 36,
  rayon_min_m: 100,
  rayon_max_m: 5000,
  rayon_defaut_m: 500,
  limite_resultats: 2000,
};

// Les types de bien et de signal : les mêmes mots que l'écran (src/lib/vacance-signaux.js).
export { CATEGORIES, TYPES_SIGNAL, CLES_TYPES, CLES_CATEGORIES } from '../../src/lib/vacance-signaux.js';
import { CLES_TYPES, CLES_CATEGORIES } from '../../src/lib/vacance-signaux.js';

/**
 * La table NAF → type de bien de la spec, telle qu'elle est posée en base la
 * première fois. Elle s'ajuste ensuite en base, sans déploiement. Un préfixe
 * est une division (« 47 »), un groupe (« 952 ») ou une classe.
 */
export const NAF_CATEGORIE_DEFAUT = [
  ...['45', '47', '56', '952', '960'].map((p) => [p, 'commerce']),
  ...['58', '59', '60', '61', '62', '63', '64', '65', '66', '68', '69', '70', '71', '72', '73', '74', '77', '78', '79', '80', '81', '82', '84'].map((p) => [p, 'bureau']),
  ...Array.from({ length: 24 }, (_, i) => String(10 + i)).map((p) => [p, 'industrie']),
  ...['41', '42', '43'].map((p) => [p, 'industrie']),
  ...['46', '49', '50', '51', '52', '53'].map((p) => [p, 'entrepot']),
  ...['75', '86', '87', '88'].map((p) => [p, 'sante']),
].map(([prefixe, categorie]) => ({ prefixe, categorie }));

/**
 * Le type de bien d'un code NAF, d'après une table de préfixes. Le préfixe le
 * plus long l'emporte : « 952 » (réparation de biens personnels, un commerce)
 * passe avant « 95 ». Un code inconnu ou absent est « autre ».
 */
export function categorieDe(codeNaf, table = NAF_CATEGORIE_DEFAUT) {
  const code = String(codeNaf || '').replace(/\./g, '').toUpperCase();
  if (!code) return 'autre';
  let meilleur = null;
  for (const { prefixe, categorie } of table) {
    const p = String(prefixe).replace(/\./g, '').toUpperCase();
    if (code.startsWith(p) && (!meilleur || p.length > meilleur.p.length)) meilleur = { p, categorie };
  }
  return meilleur?.categorie || 'autre';
}

const lireJson = (v) => {
  if (!v) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
};

/** Le SIREN d'une annonce : le champ registre, sans espaces. */
export function sirenDe(annonce) {
  const r = Array.isArray(annonce.registre) ? annonce.registre[0] : annonce.registre;
  const s = String(r || '').replace(/\D/g, '');
  return /^\d{9}$/.test(s) ? s : null;
}

/** L'adresse écrite dans l'annonce (siège, personne physique ou établissement), en une ligne. */
export function adresseAnnonce(annonce) {
  const pers = lireJson(annonce.listepersonnes)?.personne;
  const p = Array.isArray(pers) ? pers[0] : pers;
  const etab = lireJson(annonce.listeetablissements)?.etablissement;
  const e = Array.isArray(etab) ? etab[0] : etab;
  const a = e?.adresse || p?.adresseSiegeSocial || p?.adressePP || p?.adresseEtablissementPrincipal;
  if (!a) return null;
  const ligne = [a.numeroVoie, a.typeVoie, a.nomVoie, a.codePostal, a.ville].filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s-\s/g, ' ').trim();
  return ligne || null;
}

/**
 * Le type de signal d'une annonce BODACC, et sa date retenue. Pure.
 *
 * BODACC A (procédures collectives) : la nature du jugement tranche. Une
 * ouverture ou une conversion en liquidation est une liquidation ; les actes
 * de pure procédure (dépôt de l'état des créances, liste des créances) ne sont
 * pas des signaux et sont ignorés. BODACC B : radiations, et parmi les
 * modifications, seules les dissolutions et les changements d'adresse du
 * siège. Tout le reste (créations, ventes, dépôts de comptes) rend null.
 *
 * @returns {{type: string, date: string, detail: object}|null}
 */
export function classerAnnonce(a) {
  const famille = String(a.familleavis || '').toLowerCase();
  if (famille === 'collective') {
    const j = lireJson(a.jugement) || {};
    const nature = String(j.nature || '');
    const n = nature.toLowerCase();
    if (/avis de d[ée]p[ôo]t/i.test(j.famille || '') || /^d[ée]p[ôo]t|^liste des cr[ée]ances/.test(n)) return null;
    let type = 'autre_procedure';
    if (/liquidation/.test(n) && /ouverture|conversion|prononçant|résolution/.test(n)) type = 'liquidation';
    else if (/ouverture.*redressement/.test(n)) type = 'redressement';
    else if (/ouverture.*sauvegarde/.test(n)) type = 'sauvegarde';
    // « Autre jugement et ordonnance » : le complément dit parfois la vraie nature.
    else if (/autre jugement/.test(n)) {
      const c = String(j.complementJugement || '').toLowerCase();
      if (/ouvre .*liquidation|prononce la liquidation/.test(c)) type = 'liquidation';
      else if (/ouvre .*redressement/.test(c)) type = 'redressement';
      else if (/ouvre .*sauvegarde/.test(c)) type = 'sauvegarde';
    }
    return { type, date: j.date || a.dateparution, detail: { nature: nature || null, tribunal: a.tribunal || null, complement: j.complementJugement ? String(j.complementJugement).slice(0, 400) : null } };
  }
  if (famille === 'radiation') {
    const r = lireJson(a.radiationaurcs) || {};
    return { type: 'radiation', date: a.dateparution, detail: { cessation: r.dateCessationActivitePP || r.dateCessationActivitePM || null, tribunal: a.tribunal || null } };
  }
  if (famille === 'modification') {
    const m = lireJson(a.modificationsgenerales) || {};
    const d = String(m.descriptif || '').toLowerCase();
    if (/dissolution/.test(d)) return { type: 'dissolution', date: a.dateparution, detail: { descriptif: m.descriptif, effet: m.dateEffet || null, tribunal: a.tribunal || null } };
    if (/si[èe]ge/.test(d) && /adresse|transfert/.test(d)) return { type: 'transfert_siege', date: a.dateparution, detail: { descriptif: m.descriptif, effet: m.dateEffet || null, tribunal: a.tribunal || null } };
  }
  return null;
}

const jours = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

/**
 * Les établissements d'une entreprise auxquels un signal se rattache. Pure.
 *
 * Procédures, dissolution, radiation : ceux actifs à la date du signal, ou
 * fermés dans les douze mois précédents. Au-delà de dix, le siège seul, avec
 * la mention multi-sites. Transfert de siège : l'ancien siège, fermé à
 * soixante jours près de la parution ; à défaut, rien.
 *
 * @param {{type: string, date: string}} signal
 * @param {Array<{siret: string, etat: string, date_fermeture?: string|null, est_siege?: boolean}>} etablissements
 * @returns {{etablissements: Array, multi_sites: boolean}}
 */
export function rattacher(signal, etablissements, P = PARAMETRES) {
  const liste = etablissements || [];
  if (signal.type === 'transfert_siege') {
    const anciens = liste
      .filter((e) => e.etat === 'ferme' && e.date_fermeture && Math.abs(jours(e.date_fermeture, signal.date)) <= P.jours_transfert)
      .sort((a, b) => Math.abs(jours(a.date_fermeture, signal.date)) - Math.abs(jours(b.date_fermeture, signal.date)));
    return { etablissements: anciens.slice(0, 1), multi_sites: false };
  }
  const concernes = liste.filter((e) => {
    if (e.etat !== 'ferme') return true;
    if (!e.date_fermeture) return false;
    const ecart = jours(signal.date, e.date_fermeture);
    return ecart <= P.mois_rattachement * 30.44 && ecart >= -P.jours_transfert;
  });
  if (concernes.length > P.max_etablissements) {
    const siege = concernes.find((e) => e.est_siege) || liste.find((e) => e.est_siege) || concernes[0];
    return { etablissements: siege ? [siege] : [], multi_sites: true };
  }
  return { etablissements: concernes, multi_sites: false };
}

/**
 * Une fermeture suivie d'une ouverture du même SIREN à une autre adresse, dans
 * le délai : l'entreprise a déménagé, le local n'est pas forcément « vacant ».
 */
export function estDemenagement(ferme, freres, P = PARAMETRES) {
  if (!ferme?.date_fermeture) return false;
  return (freres || []).some((e) => e.siret !== ferme.siret && e.etat === 'actif' && e.date_creation
    && e.adresse !== ferme.adresse && Math.abs(jours(e.date_creation, ferme.date_fermeture)) <= P.jours_demenagement);
}

/** La distance géodésique en mètres (haversine). */
export function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000; const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad; const dLon = (lon2 - lon1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Le rectangle qui contient le cercle : ce que la base filtre avant la vraie distance. */
export function boite(lat, lon, rayonM) {
  const dLat = rayonM / 111320;
  const dLon = rayonM / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { lat_min: lat - dLat, lat_max: lat + dLat, lon_min: lon - dLon, lon_max: lon + dLon };
}

/**
 * Les paramètres d'une recherche, relus et bornés. Rend {ok:false, error} si
 * l'un d'eux n'a pas de sens : la carte ne doit pas partir sur une question
 * mal posée.
 */
export function lireParametres(q = {}, P = PARAMETRES) {
  const lon = Number(q.lon); const lat = Number(q.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: 'Coordonnées manquantes ou invalides.' };
  const rayon = Math.round(Number(q.rayon_m ?? P.rayon_defaut_m));
  if (!Number.isFinite(rayon) || rayon < P.rayon_min_m || rayon > P.rayon_max_m) return { ok: false, error: `Le rayon va de ${P.rayon_min_m} à ${P.rayon_max_m} m.` };
  const liste = (v, toutes) => {
    if (v == null || v === '') return toutes;
    const l = (Array.isArray(v) ? v : String(v).split(',')).map((x) => x.trim()).filter(Boolean);
    return l.filter((x) => toutes.includes(x));
  };
  const categories = liste(q.categories, CLES_CATEGORIES);
  const types = liste(q.types, CLES_TYPES);
  if (!categories.length) return { ok: false, error: 'Cochez au moins un type de bien.' };
  if (!types.length) return { ok: false, error: 'Cochez au moins un type de signal.' };
  const date = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && !Number.isNaN(Date.parse(v)) ? String(v) : null);
  const date_min = date(q.date_min); const date_max = date(q.date_max);
  if (date_min && date_max && date_min > date_max) return { ok: false, error: 'La date « après le » est postérieure à la date « avant le ».' };
  return { ok: true, lon, lat, rayon_m: rayon, categories, types, date_min, date_max };
}

/**
 * Les signaux retenus, regroupés par local : un établissement = un marqueur
 * qui porte le signal le plus récent et la chronologie complète. Pure.
 *
 * @param {Array} signaux  lignes de la base, déjà dans la boîte
 * @param {{lat:number, lon:number, rayon_m:number, categories:string[], types:string[], date_min?:string|null, date_max?:string|null}} p
 */
export function regrouper(signaux, p, P = PARAMETRES) {
  const parLocal = new Map();
  for (const s of signaux) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    if (!p.categories.includes(s.categorie_bien)) continue;
    if (!p.types.includes(s.type_signal)) continue;
    if (p.date_min && s.date_signal < p.date_min) continue;
    if (p.date_max && s.date_signal > p.date_max) continue;
    const d = distanceM(p.lat, p.lon, s.lat, s.lon);
    if (d > p.rayon_m) continue;
    const cle = s.siret || `${s.source}:${s.source_id}`;
    const details = typeof s.details === 'string' ? (lireJson(s.details) || {}) : (s.details || {});
    const entree = { type: s.type_signal, date: s.date_signal, source: s.source, url: s.url_source || null, ...details };
    const local = parLocal.get(cle);
    if (!local) {
      parLocal.set(cle, {
        cle, siret: s.siret || null, siren: s.siren || null, denomination: s.denomination || null, enseigne: s.enseigne || null,
        adresse: s.adresse || null, categorie_bien: s.categorie_bien, code_naf: s.code_naf || null, activite: s.activite || null,
        lat: s.lat, lon: s.lon, distance_m: Math.round(d), multi_sites: !!s.multi_sites, demenagement: !!details.demenagement, signaux: [entree],
      });
    } else {
      local.signaux.push(entree);
      local.multi_sites = local.multi_sites || !!s.multi_sites;
      local.demenagement = local.demenagement || !!details.demenagement;
    }
  }
  const locaux = [...parLocal.values()];
  for (const l of locaux) {
    l.signaux.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    l.signal_principal = { type: l.signaux[0].type, date: l.signaux[0].date };
  }
  locaux.sort((a, b) => String(b.signal_principal.date).localeCompare(String(a.signal_principal.date)));
  const total = locaux.length;
  const gardes = locaux.slice(0, P.limite_resultats);
  const repartition = {};
  for (const l of gardes) for (const s of l.signaux) repartition[s.type] = (repartition[s.type] || 0) + 1;
  return { locaux: gardes, total, tronque: total > P.limite_resultats, repartition };
}

/** Le GeoJSON de la réponse : une feature par local. */
export function enGeoJson(r, zone = null) {
  return {
    type: 'FeatureCollection',
    total: r.total,
    tronque: r.tronque,
    repartition: r.repartition,
    zone,
    features: r.locaux.map((l) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lon, l.lat] },
      properties: {
        cle: l.cle, siret: l.siret, siren: l.siren, denomination: l.denomination, enseigne: l.enseigne, adresse: l.adresse,
        categorie_bien: l.categorie_bien, code_naf: l.code_naf, activite: l.activite, distance_m: l.distance_m,
        signal_principal: l.signal_principal, signaux: l.signaux, multi_sites: l.multi_sites, demenagement: l.demenagement,
        url_annuaire: l.siren ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${l.siren}` : null,
      },
    })),
  };
}
