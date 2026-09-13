// Les rues d'une ville, proposées par ALX.
//
// On balaie le centre : tous les établissements actifs autour du point de la
// commune (annuaire de l'État), on ne garde que les commerces de pied
// d'immeuble, on les compte par rue. Les rues assez denses passent chez
// Data-B pour leur loyer de marché : c'est lui qui fait l'emplacement, 1 ou 2,
// ou qui écarte la rue. Tout est écrit avec son motif ; l'équipe corrige.

import { REGLES } from './classement.js';
import { etablissementsAutour } from './annuaire.js';
import { cleRue, joliNomDeRue } from './commerces.js';

const SEUILS = REGLES.parcours || { rayon_km: 1.5, min_commerces_par_rue: 8, max_rues: 30, loyer_emplacement_1: 650, loyer_emplacement_2: 280 };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** La commune par la Base Adresse Nationale : INSEE, centre. */
export async function communeDe(nom) {
  const r = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&type=municipality&q=${encodeURIComponent(nom)}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`La Base Adresse Nationale a répondu ${r.status}.`);
  const f = (await r.json()).features?.[0];
  if (!f || (f.properties?.score ?? 0) < 0.5) return null;
  return { nom: f.properties.city || f.properties.label, code_insee: f.properties.citycode, code_postal: f.properties.postcode, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
}

/** Le nom officiel d'une rue et son code postal, par la BAN ; à défaut, ce qu'on avait. */
export async function rueOfficielle(nom, ville) {
  try {
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=1&type=street&q=${encodeURIComponent(`${nom} ${ville}`)}`, { signal: AbortSignal.timeout(15000) });
    const f = (await r.json()).features?.[0];
    if (!f || (f.properties?.score ?? 0) < 0.5) return null;
    const p = f.properties;
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

/**
 * L'emplacement d'une rue d'après le milieu de sa fourchette de loyer de
 * marché (€/m²/an) : 1, 2, ou null (écartée) avec le motif. Pure.
 */
export function emplacementParLoyer(loyer, commerces, seuils = SEUILS) {
  const basse = loyer?.basse ?? null;
  const haute = loyer?.haute ?? null;
  const milieu = basse != null && haute != null ? (basse + haute) / 2 : haute ?? basse;
  const fourchette = milieu != null ? `loyer ${Math.round(basse ?? milieu)}–${Math.round(haute ?? milieu)} €/m²/an` : 'loyer inconnu';
  const densite = `${commerces} commerce${commerces > 1 ? 's' : ''}`;
  if (milieu == null) return { classe: 2, motif: `${densite} · ${fourchette} : classée 2 par défaut, à vérifier` };
  if (milieu >= seuils.loyer_emplacement_1) return { classe: 1, motif: `${densite} · ${fourchette}` };
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
export async function proposerRues(ville, { rayon_km = SEUILS.rayon_km, journal = () => {}, arreter = () => false, loyerDe = null } = {}) {
  let commune = ville.code_insee && ville.centre ? { code_insee: ville.code_insee, code_postal: ville.code_postal, ...ville.centre, nom: ville.nom } : null;
  if (!commune) {
    commune = await communeDe(ville.nom);
    if (!commune) throw new Error(`La Base Adresse Nationale ne connaît pas la commune « ${ville.nom} ».`);
  }
  journal(`Commune ${commune.nom} (INSEE ${commune.code_insee}), balayage sur ${rayon_km} km autour du centre.`);

  const etablissements = await etablissementsAutour({
    lat: commune.lat,
    lon: commune.lon,
    rayon_km,
    arreter,
    sur_page: (p, n) => { if (p.page % 40 === 0) journal(`Annuaire : page ${p.page} sur ${p.total_pages}, ${n} établissements actifs lus.`); },
  });
  const { rues, ignores } = grouperParRue(etablissements);
  const commerces = rues.reduce((a, r) => a + r.commerces, 0);
  const motifs = Object.entries(ignores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `${n} ${m}`).join(', ');
  journal(`${etablissements.length} établissements, ${commerces} commerces de pied d'immeuble sur ${rues.length} rues. Ignorés : ${motifs || 'aucun'}.`);

  const denses = rues.filter((r) => r.commerces >= SEUILS.min_commerces_par_rue).slice(0, SEUILS.max_rues);
  journal(`${denses.length} rues avec au moins ${SEUILS.min_commerces_par_rue} commerces : lecture du loyer de marché chez Data-B.`);

  const lireLoyer = loyerDe || (async (adresse) => {
    const { valeurLocative } = await import('../data-b.js');
    const r = await valeurLocative(adresse);
    return r.ok ? r.resultat : null;
  });

  const classees = [];
  const ecartees = [];
  for (const r of denses) {
    if (arreter()) break;
    const officielle = await rueOfficielle(r.nom, commune.nom);
    const nom = officielle?.nom ? joliNomDeRue(officielle.nom) : r.nom;
    const cp = officielle?.code_postal || r.code_postal || commune.code_postal;
    let loyer = null;
    let valeurLocative = null;
    try {
      valeurLocative = await lireLoyer(`${nom}, ${cp} ${commune.nom}`);
      loyer = valeurLocative?.rue || valeurLocative?.quartier || null;
    } catch (e) {
      journal(`${nom} : Data-B n'a pas rendu de loyer (${e.message}).`);
    }
    const { classe, motif } = emplacementParLoyer(loyer, r.commerces);
    const base = { nom, cle: r.cle, code_postal: cp, commerces: r.commerces, chaines: r.chaines.slice(0, 8), loyer: loyer ? [loyer.basse, loyer.haute] : null, loyer_source: valeurLocative?.rue ? 'Data-B, rue' : valeurLocative?.quartier ? 'Data-B, quartier' : null, centre: officielle ? { lat: officielle.lat, lon: officielle.lon } : null, motif };
    if (classe) classees.push({ ...base, classe });
    else ecartees.push(base);
    await pause(400);
  }
  classees.sort((a, b) => a.classe - b.classe || b.commerces - a.commerces);
  return { commune, classees, ecartees, commerces_total: commerces, etablissements_par_rue: Object.fromEntries(rues.map((r) => [r.cle, r.etablissements])) };
}
