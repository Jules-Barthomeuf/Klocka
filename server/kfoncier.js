// K-Foncier : les parcelles autour d'une adresse, et qui les possède.
//
// Deux sources ouvertes, sans clé :
//
//   1. Les parcelles cadastrales, avec leur contenance, servies par la
//      Géoplateforme (Parcellaire Express). L'identifiant `idu` concatène la
//      commune, le préfixe, la section et le numéro : « 06088000KZ0014 ».
//   2. Les propriétaires : le fichier MAJIC des LOCAUX DES PERSONNES MORALES,
//      que la DGFiP ouvre chaque année (licence ouverte) et qu'Opendatasoft
//      sert enregistrement par enregistrement. Chaque local y porte son
//      bâtiment, son entrée, son niveau, sa porte, et le SIREN de la personne
//      morale qui le détient.
//
// Les personnes physiques n'y sont pas, et n'y seront jamais : la loi ne
// l'ouvre pas. Une parcelle en vert a au moins une personne morale
// propriétaire connue ; une parcelle en gris n'en a aucune, ce qui ne veut
// pas dire qu'elle n'a pas de propriétaire. L'écran le dit.
//
// Le millésime est celui que sert le miroir, et il s'affiche : une situation
// au 1er janvier d'une année donnée, pas « aujourd'hui ».

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { boiteDe } from './kzoning-insee.js';
import { societe } from './kzoning-societe.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const COUCHE_PARCELLES = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle';
const MAJIC = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/buildingref-france-majic-locaux-millesime/records';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 60000;
const RAYON_PARCELLES = 150;
const SECTIONS_MAX = 6;
const CACHE_SECTION = 'CacheMajicSection';
const CACHE_JOURS = 30;
const RECHERCHE = 'RechercheFoncier';

/** Les parcelles dans un rayon autour d'un point, avec leur contour. */
export async function parcellesAutour(lat, lon, rayon_m = RAYON_PARCELLES) {
  const b = boiteDe(lat, lon, rayon_m);
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE_PARCELLES,
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '600',
    BBOX: `${b.ouest},${b.sud},${b.est},${b.nord},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`La Géoplateforme a répondu ${r.status}`);
  return ((await r.json()).features || []).map((f) => {
    const q = f.properties || {};
    return { idu: q.idu, code_insee: q.code_insee, section: q.section, numero: q.numero, contenance: q.contenance ?? null, geometry: f.geometry };
  }).filter((x) => x.idu);
}

/** Les locaux des personnes morales d'une section, au dernier millésime servi. */
async function locauxDeSection(codeInsee, section) {
  const cle = `${codeInsee}-${section}`;
  const garde = Records.filter(CACHE_SECTION, { cle })[0];
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_JOURS * 86400000) return garde;

  const lignes = [];
  let annee = null;
  const select = 'year,num_plan,bat_local,entree_local,niveau_local,porte_local,siren_proprietaire,denomination_proprietaire,label_forme_juridique_proprietaire,label_code_droit,code_droit_local,adresse';
  for (let offset = 0; offset < 3000; offset += 100) {
    const p = new URLSearchParams({
      where: `com_arm_code="${codeInsee}" AND section="${section}"`,
      select, order_by: 'year desc', limit: '100', offset: String(offset),
    });
    const r = await fetch(`${MAJIC}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
    if (!r.ok) throw new Error(`Le fichier des personnes morales a répondu ${r.status}`);
    const d = await r.json();
    const lot = d.results || [];
    for (const x of lot) {
      if (!annee) annee = x.year;
      // Trié par millésime décroissant : dès qu'on change d'année, c'est fini.
      if (x.year !== annee) { offset = Infinity; break; }
      lignes.push(x);
    }
    if (lot.length < 100 || offset + 100 >= (d.total_count || 0)) break;
  }
  const doc = { cle, code_insee: codeInsee, section, annee, lignes, le: new Date().toISOString() };
  if (garde) Records.update(CACHE_SECTION, garde.id, doc);
  else Records.create(CACHE_SECTION, doc);
  return doc;
}

/**
 * Regroupe les locaux d'une section par parcelle puis par propriétaire.
 * Pure : testée sans réseau.
 * @returns {Object<string, Array>} numéro de plan → propriétaires, chacun avec ses lots
 */
export function grouperProprietaires(lignes) {
  const parParcelle = {};
  for (const l of lignes || []) {
    const num = String(l.num_plan || '').padStart(4, '0');
    const cle = l.siren_proprietaire || l.denomination_proprietaire;
    if (!num || !cle) continue;
    const liste = (parParcelle[num] ||= []);
    let p = liste.find((x) => x.cle === cle);
    if (!p) {
      p = {
        cle,
        siren: /^\d{9}$/.test(String(l.siren_proprietaire || '')) ? l.siren_proprietaire : null,
        nom: l.denomination_proprietaire || null,
        forme: l.label_forme_juridique_proprietaire || null,
        droit: l.label_code_droit || null,
        adresse: l.adresse || null,
        lots: [],
      };
      liste.push(p);
    }
    p.lots.push({ batiment: l.bat_local || null, entree: l.entree_local || null, niveau: l.niveau_local || null, porte: l.porte_local || null });
  }
  return parParcelle;
}

async function proprietairesDes(parcelles) {
  const sections = [...new Set(parcelles.map((p) => `${p.code_insee}|${p.section}`))].slice(0, SECTIONS_MAX);
  const parSection = {};
  let annee = null;
  const erreurs = [];
  for (const s of sections) {
    const [insee, section] = s.split('|');
    try {
      const doc = await locauxDeSection(insee, section);
      parSection[s] = grouperProprietaires(doc.lignes);
      annee = annee || doc.annee;
    } catch (e) {
      parSection[s] = {};
      erreurs.push(`${section} : ${e?.message || e}`);
    }
  }
  return {
    annee,
    erreurs,
    parcelles: parcelles.map((p) => ({ ...p, proprietaires: parSection[`${p.code_insee}|${p.section}`]?.[p.numero] || [] })),
  };
}

/** Une adresse : ses parcelles, et pour chacune ses propriétaires connus. */
export async function analyser(texte, user = null) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };

  let brut;
  try { brut = await parcellesAutour(adresse.lat, adresse.lon); }
  catch (e) { return { ok: false, error: `Les parcelles n'ont pas pu être lues : ${e?.message || e}` }; }
  const { annee, erreurs, parcelles } = await proprietairesDes(brut);

  const point = { lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee };
  const existante = Records.list(RECHERCHE).find((x) => x.adresse === adresse.label);
  const le = new Date().toISOString();
  if (existante) Records.update(RECHERCHE, existante.id, { le, par: user?.email || existante.par });
  else Records.create(RECHERCHE, { adresse: adresse.label, point, le, par: user?.email || null }, user?.email);

  return {
    ok: true,
    point,
    annee,
    erreurs,
    parcelles,
    total: parcelles.length,
    avec_proprietaires: parcelles.filter((p) => p.proprietaires.length).length,
  };
}

/** Une parcelle : ses propriétaires, chacun avec sa fiche société. */
export async function ficheParcelle({ code_insee, section, numero }) {
  if (!code_insee || !section || !numero) return { ok: false, error: 'Parcelle incomplète.' };
  let doc;
  try { doc = await locauxDeSection(code_insee, section); }
  catch (e) { return { ok: false, error: e?.message || String(e) }; }
  const proprietaires = grouperProprietaires(doc.lignes)[String(numero).padStart(4, '0')] || [];
  // Les fiches se lisent ensemble : l'une après l'autre, une parcelle à sept
  // propriétaires faisait attendre un quart de minute.
  await Promise.all(proprietaires.slice(0, 8).map(async (p) => {
    if (!p.siren) return;
    try {
      const r = await societe({ siret: p.siren, leger: true });
      p.societe = r.ok ? r.societe : null;
    } catch { p.societe = null; }
  }));
  return { ok: true, annee: doc.annee, proprietaires };
}

export function listerRecherches(limite = 30) {
  const vues = new Set();
  return Records.list(RECHERCHE)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .filter((x) => !vues.has(x.adresse) && vues.add(x.adresse))
    .slice(0, limite)
    .map(({ id, adresse, point, le, par }) => ({ id, adresse, point, le, par }));
}
