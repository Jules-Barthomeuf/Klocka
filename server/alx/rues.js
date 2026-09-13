// Les rues d'une ville, proposées par ALX.
//
// OpenStreetMap donne en une seconde les rues du centre, leur tracé et les
// vitrines que les contributeurs y ont posées ; on compte les vitrines par
// rue. Les rues assez vivantes passent chez Data-B pour leur loyer de marché :
// c'est lui qui fait l'emplacement, 1, 1 bis ou 2, ou qui écarte la rue. Tout
// est écrit avec son motif ; l'équipe corrige.

import { REGLES } from './classement.js';
import { ruesEtVitrines } from './osm.js';
import { cleRue, joliNomDeRue } from './commerces.js';

const SEUILS = REGLES.parcours || { rayon_km: 1.5, min_commerces_par_rue: 5, max_rues: 30, loyer_emplacement_1: 800, loyer_emplacement_1bis: 550, loyer_emplacement_2: 350 };

/** « 1 », « 1 bis », « 2 » : le 1 bis se note 1.5 pour que les tris restent des tris. */
export const libelleEmplacement = (classe) => (classe === 1.5 ? '1 bis' : classe == null ? null : String(classe));

/** Lance `fn` sur chaque élément, au plus `n` à la fois, dans l'ordre de départ. */
async function parLots(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const un = async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, un));
  return out;
}

/** La commune par la Base Adresse Nationale : INSEE, centre. */
export async function communeDe(nom) {
  const r = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&type=municipality&q=${encodeURIComponent(nom)}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`La Base Adresse Nationale a répondu ${r.status}.`);
  const f = (await r.json()).features?.[0];
  if (!f || (f.properties?.score ?? 0) < 0.5) return null;
  return { nom: f.properties.city || f.properties.label, code_insee: f.properties.citycode, code_postal: f.properties.postcode, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
}

/** Le nom officiel d'une rue et son code postal, par la BAN ; à défaut, ce qu'on avait. */
export async function rueOfficielle(nom, ville, codeInsee = null) {
  try {
    const params = new URLSearchParams({ limit: '1', type: 'street', q: `${nom} ${ville}` });
    // Le code commune tient la BAN dans la ville : sans lui, une rue Jean Jaurès
    // de Cannes peut revenir de Lyon, et la carte avec.
    if (codeInsee) params.set('citycode', String(codeInsee));
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?${params}`, { signal: AbortSignal.timeout(15000) });
    const f = (await r.json()).features?.[0];
    if (!f || (f.properties?.score ?? 0) < 0.5) return null;
    const p = f.properties;
    if (codeInsee && p.citycode && String(p.citycode) !== String(codeInsee)) return null;
    if (cleRue(p.name || p.street) !== cleRue(nom)) return null;
    return { nom: p.name || p.street, code_postal: p.postcode, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  } catch {
    return null;
  }
}

/**
 * Les établissements groupés par rue : nombre de commerces de pied
 * d'immeuble, enseignes de chaînes, et ce qu'on a ignoré (avec les motifs).
 * Pure : testable sans réseau.
 */
export function grouperParRue(etablissements) {
  const rues = new Map();
  const ignores = {};
  for (const e of etablissements) {
    if (!e.cle_rue) continue;
    if (!e.pied_d_immeuble?.oui) {
      const m = e.pied_d_immeuble?.motif || 'hors commerce';
      ignores[m] = (ignores[m] || 0) + 1;
      continue;
    }
    const r = rues.get(e.cle_rue) || { cle: e.cle_rue, nom: e.rue, code_postal: e.code_postal, commerces: 0, chaines: [], etablissements: [] };
    r.commerces += 1;
    if (e.chaine && e.enseigne && !r.chaines.includes(e.enseigne)) r.chaines.push(e.enseigne);
    r.etablissements.push(e);
    rues.set(e.cle_rue, r);
  }
  return { rues: [...rues.values()].sort((a, b) => b.commerces - a.commerces), ignores };
}

const milieuDe = (loyer) => (loyer?.basse != null && loyer?.haute != null ? (loyer.basse + loyer.haute) / 2 : loyer?.haute ?? loyer?.basse ?? null);

/**
 * L'emplacement de chaque rue, relatif à la ville, comme dans le métier :
 * les rues sont rangées par leur loyer de marché, les 10 % du haut sont en
 * 1, jusqu'à 35 % en 1 bis, le reste en 2. Deux garde-fous absolus : une
 * rue en 1 doit avoir un loyer d'au moins `loyer_plancher_1` ; sous
 * `loyer_emplacement_2`, la rue est écartée. Une rue sans loyer est classée
 * 2 par défaut. Pure : rend les rues avec `classe` (null = écartée) et `motif`.
 */
export function classerParRang(rues, seuils = SEUILS) {
  const p1 = seuils.part_emplacement_1 ?? 0.10;
  const p15 = seuils.part_emplacement_1bis ?? 0.35;
  const avec = rues.filter((r) => milieuDe(r.loyer) != null).sort((a, b) => milieuDe(b.loyer) - milieuDe(a.loyer));
  const n = avec.length;
  const rang = new Map(avec.map((r, i) => [r, i]));
  return rues.map((r) => {
    const loyer = r.loyer;
    const m = milieuDe(loyer);
    const densite = `${r.vitrines ?? r.commerces ?? 0} vitrine${(r.vitrines ?? r.commerces ?? 0) > 1 ? 's' : ''}`;
    if (m == null) return { ...r, classe: 2, motif: `${densite} · loyer inconnu : classée 2 par défaut, à vérifier` };
    const fourchette = `loyer ${Math.round(loyer.basse ?? m)}–${Math.round(loyer.haute ?? m)} €/m²/an`;
    if (m < (seuils.loyer_emplacement_2 ?? 250)) return { ...r, classe: null, motif: `${densite} · ${fourchette} : trop bas pour le mandat` };
    const i = rang.get(r);
    const place = `${i + 1}e sur ${n} de la ville`;
    if (i < n * p1 && m >= (seuils.loyer_plancher_1 ?? 450)) return { ...r, classe: 1, motif: `${densite} · ${fourchette} · ${place}, dans les ${Math.round(p1 * 100)} % les plus chères` };
    if (i < n * p15) return { ...r, classe: 1.5, motif: `${densite} · ${fourchette} · ${place}, dans les ${Math.round(p15 * 100)} % les plus chères` };
    return { ...r, classe: 2, motif: `${densite} · ${fourchette} · ${place}` };
  });
}

/**
 * L'emplacement d'une rue seule, sans ville autour, d'après le milieu de sa
 * fourchette de loyer (€/m²/an) et des seuils absolus : 1, 1.5 (« 1 bis »),
 * 2, ou null (écartée), avec le motif. Pure.
 */
export function emplacementParLoyer(loyer, commerces, seuils = SEUILS) {
  const basse = loyer?.basse ?? null;
  const haute = loyer?.haute ?? null;
  const milieu = basse != null && haute != null ? (basse + haute) / 2 : haute ?? basse;
  const fourchette = milieu != null ? `loyer ${Math.round(basse ?? milieu)}–${Math.round(haute ?? milieu)} €/m²/an` : 'loyer inconnu';
  const densite = `${commerces} vitrine${commerces > 1 ? 's' : ''}`;
  if (milieu == null) return { classe: 2, motif: `${densite} · ${fourchette} : classée 2 par défaut, à vérifier` };
  if (milieu >= seuils.loyer_emplacement_1) return { classe: 1, motif: `${densite} · ${fourchette}` };
  if (seuils.loyer_emplacement_1bis != null && milieu >= seuils.loyer_emplacement_1bis) return { classe: 1.5, motif: `${densite} · ${fourchette}` };
  if (milieu >= seuils.loyer_emplacement_2) return { classe: 2, motif: `${densite} · ${fourchette}` };
  return { classe: null, motif: `${densite} · ${fourchette} : trop bas pour le mandat` };
}

/**
 * Recense et classe les rues d'une ville. Rend ce qu'il faut écrire sur la
 * Ville, sans l'écrire : le parcours s'en charge et tient le journal.
 *
 * @param {{nom:string, code_insee?:string, centre?:{lat,lon}}} ville
 * @param {{rayon_km?:number, journal?:Function, arreter?:Function, loyerDe?:Function}} o
 */
const RENDEMENT_DEFAUT = 7;

/**
 * Le prix au m² moyen des murs commerciaux autour d'une rue, et le rendement
 * que le loyer de marché y donne. DVF quand il y a assez de ventes ; sinon
 * le prix déduit du loyer au rendement par défaut, et on le dit.
 */
export async function prixDeLaRue(adresse, loyer, prixDe = null) {
  const milieu = loyer?.basse != null && loyer?.haute != null ? (loyer.basse + loyer.haute) / 2 : null;
  let dvf = null;
  if (adresse) {
    try {
      const lire = prixDe || (async (a) => {
        const { ventesAutour } = await import('../dvf.js');
        const r = await ventesAutour(a, { rayon: 150 });
        return r.ok ? r.resultat : null;
      });
      dvf = await lire(adresse);
    } catch {
      dvf = null;
    }
  }
  const prixDvf = dvf?.prix_m2?.median ?? null;
  const nDvf = dvf?.n ?? 0;
  if (prixDvf && nDvf >= 5) {
    return { prix_m2: Math.round(prixDvf), prix_m2_source: `DVF, ${nDvf} ventes autour`, rendement: milieu ? Math.round((milieu / prixDvf) * 1000) / 10 : null };
  }
  if (milieu) return { prix_m2: Math.round(milieu / (RENDEMENT_DEFAUT / 100)), prix_m2_source: `déduit du loyer à ${RENDEMENT_DEFAUT} %`, rendement: RENDEMENT_DEFAUT };
  return { prix_m2: null, prix_m2_source: null, rendement: null };
}

export async function proposerRues(ville, { rayon_km = SEUILS.rayon_km, journal = () => {}, arreter = () => false, loyerDe = null, prixDe = null, ruesDe = null } = {}) {
  let commune = ville.code_insee && ville.centre ? { code_insee: ville.code_insee, code_postal: ville.code_postal, ...ville.centre, nom: ville.nom } : null;
  if (!commune) {
    commune = await communeDe(ville.nom);
    if (!commune) throw new Error(`La Base Adresse Nationale ne connaît pas la commune « ${ville.nom} ».`);
  }
  journal(`Commune ${commune.nom} (INSEE ${commune.code_insee}) : rues et vitrines par OpenStreetMap.`);

  const osm = await (ruesDe || ruesEtVitrines)({ code_insee: commune.code_insee, lat: commune.lat, lon: commune.lon, rayon_km });
  const vitrines = osm.vitrines_total;
  journal(`${osm.rues.length} rues, ${vitrines} vitrines ${osm.zone === 'cercle' ? `à ${rayon_km} km du centre (contour de la commune inconnu)` : 'sur toute la commune'}${osm.sans_rue ? ` ; ${osm.sans_rue} sans rue à moins de 30 m, ignorées` : ''}.`);

  const denses = osm.rues.filter((r) => r.vitrines >= SEUILS.min_commerces_par_rue).slice(0, SEUILS.max_rues);
  journal(`${denses.length} rues avec au moins ${SEUILS.min_commerces_par_rue} vitrines : lecture du loyer de marché chez Data-B.`);

  const lireLoyer = loyerDe || (async (adresse) => {
    const { valeurLocative } = await import('../data-b.js');
    const r = await valeurLocative(adresse);
    return r.ok ? r.resultat : null;
  });

  // Trois rues à la fois chez Data-B : la trentaine passe en une dizaine de secondes.
  const lues = await parLots(denses, 3, async (r) => {
    if (arreter()) return null;
    const officielle = await rueOfficielle(r.nom, commune.nom, commune.code_insee);
    const nom = officielle?.nom ? joliNomDeRue(officielle.nom) : r.nom;
    const cp = officielle?.code_postal || commune.code_postal;
    let loyer = null;
    let valeurLocative = null;
    try {
      valeurLocative = await lireLoyer(`${nom}, ${cp} ${commune.nom}`);
      loyer = valeurLocative?.rue || valeurLocative?.quartier || null;
    } catch (e) {
      journal(`${nom} : Data-B n'a pas rendu de loyer (${e.message}).`);
    }
    // Le prix au m² des murs vendus autour de la rue (DVF), et le rendement qui
    // en découle avec le loyer ; à défaut, le prix que donne le loyer à 7 %.
    const marche = await prixDeLaRue(officielle ? `${nom}, ${cp} ${commune.nom}` : null, loyer, prixDe);
    return {
      nom, cle: r.cle, code_postal: cp, commerces: r.vitrines, enseignes: r.enseignes.slice(0, 8),
      trace: r.trace, longueur_m: r.longueur_m, type: r.type || null, flux_estime: r.flux_estime || null,
      loyer, loyer_source: valeurLocative?.rue ? 'Data-B, rue' : valeurLocative?.quartier ? 'Data-B, quartier' : null,
      ...marche,
      centre: officielle ? { lat: officielle.lat, lon: officielle.lon } : r.centre,
    };
  });

  // Le classement se fait sur toute la ville à la fois : l'emplacement est un rang.
  const classes = classerParRang(lues.filter(Boolean)).map((x) => ({ ...x, loyer: x.loyer ? [x.loyer.basse, x.loyer.haute] : null }));
  const classees = classes.filter((x) => x.classe);
  const ecartees = classes.filter((x) => !x.classe).map(({ classe, ...x }) => x);
  classees.sort((a, b) => a.classe - b.classe || b.commerces - a.commerces);
  return { commune, classees, ecartees, commerces_total: vitrines, etablissements_par_rue: {} };
}
