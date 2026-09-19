// K-Vacance : les locaux vides, et depuis combien de temps le quartier tourne.
//
// Deux sources, qui ne disent pas la même chose et se complètent :
//
//   OPENSTREETMAP dit ce qu'on voit depuis le trottoir. Un local marqué
//   `shop=vacant` ou `disused:shop` est un rideau baissé, relevé par quelqu'un
//   qui est passé devant. C'est la vacance visible, et c'est elle qui donne le
//   taux : vides sur total des devantures de la rue.
//
//   SIRENE dit ce que le registre enregistre. Un établissement fermé porte sa
//   date de création et sa date de fermeture : la différence, c'est la durée
//   d'exploitation. La médiane de ces durées sur une rue, c'est le turn-over.
//
// Une précaution sur Sirene : la recherche par rayon ne rend que les
// établissements de sociétés ENCORE VIVANTES. Les sociétés entièrement
// radiées — justement celles qui ont mis la clé sous la porte — n'y sont pas.
// On interroge donc aussi les sociétés cessées de la commune, et on les filtre
// par distance. Sans ce second passage, le turn-over serait faux par
// construction, et flatteur.
//
// Tout est gratuit et public. Aucun crédit n'est dépensé.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';

const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 30000;
const RECHERCHE = 'RechercheVacance';
const RAYON_DEFAUT = 400;
// Au-delà, une fermeture ne dit plus rien du quartier d'aujourd'hui.
const ANNEES_FERMETURE = 8;
const PAGES_MAX = 6;

const metres = (a, b, c, d) => {
  const R = 6371000; const rad = Math.PI / 180;
  const x = (c - a) * rad; const y = (d - b) * rad;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(y / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

export const normaliserRue = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b(rue|avenue|av|boulevard|bd|place|pl|cours|chemin|impasse|allee|allees|quai|route|rte)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const mediane = (xs) => {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
};

/**
 * Le taux de vacance d'une zone, et rue par rue. Pure : testée sans réseau.
 *
 * Une rue qui n'a qu'une devanture relevée n'a pas de taux : un vide sur un
 * donnerait cent pour cent de vacance, ce qui ne veut rien dire.
 */
export const MINIMUM_PAR_RUE = 4;

export function tauxDeVacance(commerces) {
  const total = commerces.length;
  const vides = commerces.filter((c) => c.vacant).length;
  const parRue = new Map();
  for (const c of commerces) {
    const rue = normaliserRue((c.adresse || '').replace(/^\d+\w*\s+/, ''));
    if (!rue) continue;
    const r = parRue.get(rue) || { rue, libelle: (c.adresse || '').replace(/^\d+\w*\s+/, ''), total: 0, vides: 0, points: [] };
    r.total += 1;
    if (c.vacant) { r.vides += 1; r.points.push({ lat: c.lat, lon: c.lon, adresse: c.adresse }); }
    parRue.set(rue, r);
  }
  const rues = [...parRue.values()]
    .filter((r) => r.total >= MINIMUM_PAR_RUE)
    .map((r) => ({ ...r, taux: Math.round((r.vides / r.total) * 1000) / 10 }))
    .sort((a, b) => b.taux - a.taux || b.total - a.total);
  return {
    total,
    vides,
    taux: total ? Math.round((vides / total) * 1000) / 10 : null,
    rues,
    rues_ecartees: parRue.size - rues.length,
    minimum_par_rue: MINIMUM_PAR_RUE,
  };
}

/**
 * Le turn-over : combien d'années un commerce tient avant de fermer.
 * Pure : testée sans réseau.
 */
export function turnOver(fermetures) {
  const durees = fermetures.map((f) => f.duree_ans).filter((d) => d != null && d >= 0);
  const parAnnee = new Map();
  for (const f of fermetures) {
    if (!f.annee_fermeture) continue;
    parAnnee.set(f.annee_fermeture, (parAnnee.get(f.annee_fermeture) || 0) + 1);
  }
  return {
    n: fermetures.length,
    duree_mediane: mediane(durees),
    duree_moyenne: durees.length ? Math.round((durees.reduce((s, d) => s + d, 0) / durees.length) * 10) / 10 : null,
    // Moins de trois ans, c'est un emplacement qui ne pardonne pas.
    part_moins_3_ans: durees.length ? Math.round((durees.filter((d) => d < 3).length / durees.length) * 100) : null,
    par_annee: [...parAnnee.entries()].sort((a, b) => a[0] - b[0]).map(([annee, n]) => ({ annee, n })),
  };
}

async function annuaire(chemin, params) {
  const r = await fetch(`${ANNUAIRE}${chemin}?${new URLSearchParams(params)}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(DELAI_MS),
  });
  if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1200)); return annuaire(chemin, params); }
  if (!r.ok) throw new Error(`L'annuaire a répondu ${r.status}`);
  return r.json();
}

/** Une fermeture, telle qu'on la garde. Pure : testée sans réseau. */
export function lireFermeture(societe, etab, centre) {
  const lat = Number(etab.latitude); const lon = Number(etab.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const fin = etab.date_fermeture || societe.date_fermeture;
  if (!fin) return null;
  const debut = etab.date_creation || etab.date_debut_activite || societe.date_creation;
  const duree = debut ? Math.round(((Date.parse(fin) - Date.parse(debut)) / (365.25 * 86400000)) * 10) / 10 : null;
  return {
    siret: etab.siret,
    nom: societe.nom_complet || societe.nom_raison_sociale,
    enseigne: (etab.liste_enseignes || [])[0] || null,
    activite: etab.activite_principale || societe.activite_principale,
    adresse: etab.adresse || null,
    lat, lon,
    distance_m: centre ? metres(centre.lat, centre.lon, lat, lon) : null,
    ouverture: debut,
    fermeture: fin,
    annee_fermeture: Number(String(fin).slice(0, 4)) || null,
    duree_ans: duree != null && duree >= 0 ? duree : null,
    societe_cessee: societe.etat_administratif === 'C',
  };
}

/** Les fermetures autour d'un point : les deux chemins, réunis. */
async function fermeturesAutour(point, codeInsee, rayon) {
  const vues = new Set();
  const sortie = [];
  const depuis = new Date().getFullYear() - ANNEES_FERMETURE;
  const garder = (societe, etabs) => {
    for (const e of etabs || []) {
      if (e.etat_administratif !== 'F' && societe.etat_administratif !== 'C') continue;
      const f = lireFermeture(societe, e, point);
      if (!f || vues.has(f.siret)) continue;
      if (f.distance_m > rayon) continue;
      if (f.annee_fermeture && f.annee_fermeture < depuis) continue;
      vues.add(f.siret);
      sortie.push(f);
    }
  };

  const erreurs = [];
  // 1. Les établissements fermés de sociétés encore vivantes : par rayon.
  try {
    for (let page = 1; page <= PAGES_MAX; page++) {
      const d = await annuaire('/near_point', { lat: point.lat, long: point.lon, radius: Math.max(0.1, rayon / 1000), per_page: '25', page: String(page), limite_matching_etablissements: '10' });
      for (const r of d.results || []) garder(r, r.matching_etablissements);
      if ((d.results || []).length < 25) break;
    }
  } catch (e) { erreurs.push(`fermetures autour du point : ${e?.message || e}`); }

  // 2. Les sociétés entièrement cessées de la commune, filtrées par distance.
  //    Sans elles, il manquerait les commerces qui ont vraiment disparu.
  if (codeInsee) {
    try {
      for (let page = 1; page <= PAGES_MAX; page++) {
        const d = await annuaire('/search', { code_commune: codeInsee, etat_administratif: 'C', per_page: '25', page: String(page), limite_matching_etablissements: '10' });
        for (const r of d.results || []) garder(r, r.matching_etablissements);
        if ((d.results || []).length < 25) break;
      }
    } catch (e) { erreurs.push(`sociétés cessées de la commune : ${e?.message || e}`); }
  }

  sortie.sort((a, b) => String(b.fermeture).localeCompare(String(a.fermeture)));
  return { fermetures: sortie, erreurs };
}

/** Une adresse : sa vacance visible, et le rythme auquel le quartier tourne. */
export async function analyser(texte, { rayon = RAYON_DEFAUT, user = null } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const point = { lat: adresse.lat, lon: adresse.lon, label: adresse.label, ville: adresse.ville, code_insee: adresse.code_insee };

  const [osm, sirene] = await Promise.all([
    (async () => {
      try {
        const { commercesDeLaZone } = await import('./kzoning-commerces.js');
        const { TOUS_LES_COMMERCES } = await import('./kzoning-metiers.js');
        const r = await commercesDeLaZone({ lat: adresse.lat, lon: adresse.lon, rayon_m: rayon, filtres: TOUS_LES_COMMERCES.filtres });
        return r.ok ? { commerces: r.commerces || [] } : { erreur: r.error };
      } catch (e) { return { erreur: e?.message || String(e) }; }
    })(),
    fermeturesAutour(point, adresse.code_insee, rayon),
  ]);

  const vacance = osm.erreur ? null : tauxDeVacance(osm.commerces);
  const rotation = turnOver(sirene.fermetures);

  const existante = Records.list(RECHERCHE).find((x) => x.adresse === adresse.label);
  const le = new Date().toISOString();
  if (existante) Records.update(RECHERCHE, existante.id, { le, par: user?.email || existante.par });
  else Records.create(RECHERCHE, { adresse: adresse.label, point, le, par: user?.email || null }, user?.email);

  return {
    ok: true,
    point,
    rayon,
    annees_fermeture: ANNEES_FERMETURE,
    vacance,
    vacance_erreur: osm.erreur || null,
    locaux_vides: osm.erreur ? [] : osm.commerces.filter((c) => c.vacant).map(({ lat, lon, adresse: a, genre }) => ({ lat, lon, adresse: a, genre })),
    turnover: rotation,
    fermetures: sirene.fermetures.slice(0, 80),
    erreurs: sirene.erreurs,
  };
}

export function listerRecherches(limite = 30) {
  const vues = new Set();
  return Records.list(RECHERCHE)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .filter((x) => !vues.has(x.adresse) && vues.add(x.adresse))
    .slice(0, limite)
    .map(({ id, adresse, point, le, par }) => ({ id, adresse, point, le, par }));
}
