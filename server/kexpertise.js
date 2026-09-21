// K-Expertise : l'étude d'implantation d'une adresse, en grand.
//
// Ce que le rapport montre en vingt-quatre pages tient en quatre sources,
// toutes ouvertes :
//
//   1. L'étude d'implantation interne (implantation/etude.js) : les flux
//      piéton et voiture estimés, la rue, le tronçon numéro par numéro, la
//      démographie et le revenu des zones à pied. Sirene, OpenStreetMap,
//      IGN, INSEE. Gratuite ; quelques minutes la première fois dans une
//      grande ville, puis trente jours de cache par adresse et activité.
//   2. OpenStreetMap, pour les générateurs de flux : arrêts, gares, bouches
//      de métro, supermarchés, hôpitaux, écoles — avec leur distance.
//   3. L'INSEE, pour les trois zones de chalandise : des isochrones à pied
//      de l'IGN (5, 10, 15 minutes), lus en carreaux Filosofi de 200 m et en
//      IRIS du recensement. Quand l'IGN ne répond pas, trois rayons — 400,
//      800, 1 200 m — prennent la place et l'écran le dit.
//   4. Google, pour le plan et la vue de la rue, côté écran.
//
// Une étude prend plusieurs minutes : elle part en tâche de fond, écrit sa
// progression au fur et à mesure, et l'écran la suit. Une étape qui tombe ne
// fait pas tomber les autres : le rapport se rend avec ce qu'il a, et dit ce
// qui manque.

import { Records } from './db.js';
import { geocoder } from './deal/geocodage.js';
import { interroger, construireRequete } from './kzoning-commerces.js';
import { habitantsDeLaZone } from './kzoning-insee.js';

const ENTITE = 'ExpertiseKData';

/** Les trois zones de chalandise. À pied, cinq minutes font environ 400 m. */
export const ZONES = [
  { cle: 'primaire', nom: 'Zone primaire', rayon_m: 400, marche: '5 minutes à pied' },
  { cle: 'secondaire', nom: 'Zone secondaire', rayon_m: 800, marche: '10 minutes à pied' },
  { cle: 'tertiaire', nom: 'Zone tertiaire', rayon_m: 1200, marche: '15 minutes à pied' },
];

/** Les étapes, dans l'ordre où elles se suivent à l'écran. */
export const ETAPES = [
  { cle: 'adresse', nom: "Localisation de l'adresse" },
  { cle: 'etude', nom: 'Étude d\'implantation : flux, rue, tronçon, quartier' },
  { cle: 'generateurs', nom: 'Générateurs de flux autour du point' },
  { cle: 'zones', nom: 'Zones de chalandise : habitants, logements' },
  { cle: 'synthese', nom: 'Synthèse' },
];

// Ce qui attire du monde, et ce qu'on en dit. L'ordre est celui du rapport.
const GENERATEURS = [
  { famille: 'Transport', cle: 'railway', valeurs: ['station', 'halt', 'tram_stop', 'subway_entrance'], genre: (t) => ({ station: 'Gare', halt: 'Halte', tram_stop: 'Tramway', subway_entrance: 'Métro' })[t.railway] },
  { famille: 'Transport', cle: 'highway', valeurs: ['bus_stop'], genre: () => 'Bus' },
  { famille: 'Distribution', cle: 'shop', valeurs: ['supermarket', 'convenience', 'department_store', 'mall'], genre: (t) => ({ supermarket: 'Supermarché', convenience: 'Supérette', department_store: 'Grand magasin', mall: 'Centre commercial' })[t.shop] },
  { famille: 'Santé', cle: 'amenity', valeurs: ['hospital', 'clinic', 'pharmacy'], genre: (t) => ({ hospital: 'Hôpital', clinic: 'Clinique', pharmacy: 'Pharmacie' })[t.amenity] },
  { famille: 'Enseignement', cle: 'amenity', valeurs: ['school', 'college', 'university'], genre: (t) => ({ school: 'École', college: 'Enseignement supérieur', university: 'Université' })[t.amenity] },
  { famille: 'Loisirs', cle: 'amenity', valeurs: ['cinema', 'theatre'], genre: (t) => ({ cinema: 'Cinéma', theatre: 'Théâtre' })[t.amenity] },
];
const RAYON_GENERATEURS = 300;

function metresEntre(lat1, lon1, lat2, lon2) {
  const R = 6371000; const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad; const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/**
 * Les générateurs de flux, classés du plus proche, par bande de distance.
 * Pure sur `elements` : testée sans réseau.
 */
export function classerGenerateurs(elements, centre) {
  const vus = new Set();
  const liste = [];
  for (const e of elements || []) {
    const t = e.tags || {};
    const lat = e.lat ?? e.center?.lat; const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const cle = `${e.type}/${e.id}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const g = GENERATEURS.find((x) => x.valeurs.includes(t[x.cle]));
    if (!g) continue;
    liste.push({
      famille: g.famille,
      genre: g.genre(t) || t[g.cle],
      nom: t.name || t.brand || null,
      adresse: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || null,
      distance_m: metresEntre(centre.lat, centre.lon, lat, lon),
      lat, lon,
    });
  }
  liste.sort((a, b) => a.distance_m - b.distance_m);
  // Un arrêt de bus a souvent deux quais au même nom : on garde le plus près.
  const parNom = new Map();
  const uniques = [];
  for (const g of liste) {
    const k = `${g.famille}|${g.genre}|${(g.nom || '').toLowerCase()}`;
    if (g.nom && parNom.has(k)) continue;
    parNom.set(k, true);
    uniques.push(g);
  }
  const bande = (d) => (d < 50 ? 'Moins de 50 mètres' : d <= 100 ? 'De 50 à 100 mètres' : "Plus de 100 mètres");
  return uniques.slice(0, 20).map((g, i) => ({ ...g, rang: i + 1, bande: bande(g.distance_m) }));
}

export async function generateursAutour(lat, lon) {
  const filtres = GENERATEURS.map(({ cle, valeurs }) => ({ cle, valeurs }));
  const brut = await interroger(construireRequete(filtres, lat, lon, RAYON_GENERATEURS));
  return classerGenerateurs(brut.elements, { lat, lon });
}

const noter = (id, patch) => Records.update(ENTITE, id, patch);
const etape = (id, cle, etat, detail = null) => {
  const e = Records.get(ENTITE, id);
  const etapes = (e?.etapes || []).map((x) => (x.cle === cle ? { ...x, etat, detail, le: new Date().toISOString() } : x));
  const faites = etapes.filter((x) => x.etat === 'faite' || x.etat === 'ratee').length;
  noter(id, { etapes, progression: Math.round((faites / ETAPES.length) * 100) });
};

/** Ce que l'écran lit d'une expertise : jamais la page HTML gardée à part. */
export function listerExpertises() {
  return Records.list(ENTITE)
    .map(({ id, adresse, activite, etat, progression, cree_le, fini_le, par, libelle }) => ({ id, adresse, activite, etat, progression, cree_le, fini_le, par, libelle }))
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
}

export function lireExpertise(id) {
  return Records.get(ENTITE, id) || null;
}

/**
 * Lance une expertise et rend tout de suite son identifiant. Le travail se
 * fait derrière, étape par étape ; l'écran suit `progression` et `etapes`.
 */
export function lancerExpertise({ adresse, activite = null, forcer = false }, user = null) {
  const texte = String(adresse || '').trim();
  if (texte.length < 5) return { ok: false, error: 'Il faut une adresse précise : numéro, rue, ville.' };
  const e = Records.create(ENTITE, {
    adresse: texte,
    activite: String(activite || '').trim() || 'Tous les commerces',
    etat: 'en_cours',
    progression: 0,
    etapes: ETAPES.map((x) => ({ ...x, etat: 'a_faire', detail: null })),
    cree_le: new Date().toISOString(),
    fini_le: null,
    par: user?.email || null,
    resultat: null,
    libelle: texte,
  }, user?.email);
  // Pas d'attente : la réponse part, le travail continue.
  executer(e.id, { forcer, user }).catch((err) => {
    noter(e.id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: err?.message || String(err) });
  });
  return { ok: true, id: e.id };
}

async function executer(id, { forcer, user }) {
  const e = Records.get(ENTITE, id);
  const resultat = { sources: [] };

  // 1. L'adresse.
  etape(id, 'adresse', 'en_cours');
  const point = await geocoder({ adresse: e.adresse });
  if (!point) {
    etape(id, 'adresse', 'ratee', 'adresse introuvable dans la Base Adresse Nationale');
    noter(id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: `Adresse introuvable : « ${e.adresse} ».` });
    return;
  }
  resultat.point = { lat: point.lat, lon: point.lon, libelle: point.libelle, precis: point.precis };
  noter(id, { libelle: point.libelle, resultat });
  etape(id, 'adresse', 'faite', point.libelle);

  // 2. L'étude interne : les flux, la rue, le tronçon, les zones à pied.
  etape(id, 'etude', 'en_cours');
  try {
    const { etudeImplantation } = await import('./implantation/etude.js');
    const r = await etudeImplantation(e.adresse, { activite: e.activite === 'Tous les commerces' ? null : e.activite, forcer, journal: (m) => etape(id, 'etude', 'en_cours', m) });
    if (r.ok) {
      resultat.etude = r.resultat;
      resultat.sources.push(...(r.resultat.sources || []).filter((x) => !resultat.sources.includes(x)));
      etape(id, 'etude', 'faite', r.resultat.du_cache ? 'étude déjà en base' : r.resultat.manques?.length ? `étude faite, ${r.resultat.manques.length} lecture(s) manquante(s)` : 'étude faite');
    } else {
      resultat.etude = null;
      resultat.etude_erreur = r.error;
      etape(id, 'etude', 'ratee', r.error);
    }
  } catch (err) {
    resultat.etude = null;
    resultat.etude_erreur = err?.message || String(err);
    etape(id, 'etude', 'ratee', resultat.etude_erreur);
  }
  noter(id, { resultat });

  // 3. Les générateurs de flux.
  etape(id, 'generateurs', 'en_cours');
  try {
    resultat.generateurs = await generateursAutour(point.lat, point.lon);
    if (!resultat.sources.includes('OpenStreetMap')) resultat.sources.push('OpenStreetMap');
    etape(id, 'generateurs', 'faite', `${resultat.generateurs.length} générateurs dans ${RAYON_GENERATEURS} m`);
  } catch (err) {
    resultat.generateurs = [];
    etape(id, 'generateurs', 'ratee', err?.message || String(err));
  }
  noter(id, { resultat });

  // 4. Les trois zones de chalandise : celles de l'étude quand elle les a
  //    lues (isochrones), sinon trois rayons Filosofi.
  etape(id, 'zones', 'en_cours');
  const zonesEtude = (resultat.etude?.zones || []).filter((z) => z.insee);
  if (zonesEtude.length === ZONES.length) {
    resultat.zones = zonesEtude.map((z) => ({ ...z, erreur: null }));
    etape(id, 'zones', 'faite', zonesEtude[0].approximation ? '3 zones, en rayons : l\'IGN n\'a pas rendu les isochrones' : '3 zones à pied, isochrones IGN');
  } else {
    resultat.zones = [];
    for (const z of ZONES) {
      const h = await habitantsDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: z.rayon_m });
      resultat.zones.push({ ...z, approximation: `rayon de ${z.rayon_m} m`, insee: h.ok ? h.insee : null, erreur: h.ok ? null : h.error });
    }
    etape(id, 'zones', resultat.zones.every((z) => z.insee) ? 'faite' : 'ratee', `${resultat.zones.filter((z) => z.insee).length} zones sur 3, en rayons`);
  }
  if (resultat.zones.some((z) => z.insee) && !resultat.sources.includes('INSEE Filosofi')) resultat.sources.push('INSEE Filosofi');
  noter(id, { resultat });

  // 5. La synthèse : rien de calculé de neuf, tout est déjà là.
  etape(id, 'synthese', 'faite');
  noter(id, { etat: 'terminee', fini_le: new Date().toISOString(), progression: 100, resultat });
}

export function supprimerExpertise(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: "Cette expertise n'existe plus." };
  Records.delete(ENTITE, id);
  return { ok: true };
}
