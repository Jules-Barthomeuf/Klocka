// Qui possède les murs d'une adresse, d'après les fichiers publics.
//
// Data Foncier, chez Data-B, le disait contre un compte de service. Les
// mêmes faits sont publiés par la DGFiP : le fichier des locaux des
// personnes morales donne, parcelle par parcelle, chaque société
// propriétaire avec son SIREN, sa forme, son droit, et l'étage de chacun de
// ses locaux. Deux lectures de ce fichier existent déjà dans le dépôt : le
// millésime national par département (personnes-morales.js, celui qu'ALX
// extrait pour ses mesures) et une copie en ligne, par section cadastrale
// (kfoncier.js, millésime plus ancien mais sans rien à télécharger). On lit
// la première quand elle est là, la seconde sinon.
//
// La parcelle, elle, vient du cadastre d'Etalab (cadastre.js) : le point de
// la vitrine tombe dans un contour, et c'est cette parcelle qu'on interroge.
// Pas de « bâtiment le plus proche » à confirmer par un numéro : la parcelle
// est celle du point, ou celle à dix mètres du trottoir.
//
// Ce que ces fichiers ne disent pas, et que rien d'ouvert ne dit : les
// PARTICULIERS propriétaires. Une parcelle sans personne morale est,
// presque toujours, détenue par des personnes physiques, que la loi ne
// publie pas. On le dit tel quel, avec la démarche qui permet de le savoir :
// un relevé de propriété se demande au service de la publicité foncière.
//
// Les gérants ne sont pas ici : l'annuaire des entreprises les donne, par
// SIREN, avec leur tranche d'âge, et enrichir.js l'appelle déjà.

import { resoudreAdresse } from '../data-b.js';
import { DATA_DIR } from '../db.js';
import { chargerParcelles, indexerParcelles } from './cadastre.js';
import { dejaLa, lire, parParcelle, PREMIERE_ANNEE } from './personnes-morales.js';
import { locauxDeSection, grouperProprietaires } from '../kfoncier.js';
import fs from 'fs';
import path from 'path';

export const SOURCE = 'DGFiP · locaux des personnes morales';
/** Où demander qui possède une parcelle quand aucune société n'y est publiée. */
export const DEMARCHE_RELEVE = 'https://www.impots.gouv.fr/particulier/questions/comment-obtenir-un-releve-de-propriete';

/** L'âge, s'il vient d'ailleurs, devient une tranche et rien d'autre. */
export function trancheAge(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return null;
  if (a >= 70) return '70+';
  if (a >= 50) return '50-70';
  return '-50';
}

/**
 * « 00 », « RDC », « Rez-de-chaussée » : le lot du bas. « Parcelle » aussi :
 * ce propriétaire-là possède tout, le rez-de-chaussée compris.
 */
export function estRezDeChaussee(etage) {
  const e = String(etage || '').trim().toLowerCase();
  if (!e) return false;
  if (/rdc|rez|parcelle/.test(e)) return true;
  return /^0+$/.test(e.replace(/\D/g, '')) && /\d/.test(e);
}

/** « Société civile immobilière » et ses écritures deviennent « SCI ». */
export const formeCourte = (forme) => (/soci[ée]t[ée]\s+civile\s+immobili|^sci\b/i.test(String(forme || '')) ? 'SCI' : String(forme || '').trim() || null);

/**
 * Le droit sur le local, tel que la DGFiP le code : une lettre jusqu'en 2023,
 * « P - Propriétaire » ensuite. On rend le mot, et l'on sait si le droit est
 * démembré — un usufruitier ne vend pas seul.
 */
const DROITS = { P: 'Propriétaire', U: 'Usufruitier', N: 'Nu-propriétaire', B: 'Bailleur à construction', R: 'Preneur à construction', F: 'Foncier', D: 'Domanier', T: 'Tenuyer', G: 'Gérant de biens', A: 'Locataire attributaire', C: 'Fiduciaire', L: 'Fonctionnaire logé', E: 'Emphytéote', K: 'Antichrésiste', V: 'Bailleur d\'un bail à réhabilitation', W: 'Preneur d\'un bail à réhabilitation', X: 'Preneur d\'un bail à long terme', Y: 'Preneur d\'un bail emphytéotique', J: 'Jeune agriculteur', M: 'Propriétaire indivis', S: 'Syndic de copropriété', O: 'Autorité concédante', Q: 'Concessionnaire', H: 'Associé dans une société d\'attribution', Z: 'Autre' };
export function droitDe(brut) {
  const s = String(brut || '').trim();
  if (!s) return { code: null, libelle: null, demembre: false };
  const code = s.split(/\s+-\s+/)[0].trim().toUpperCase();
  const libelle = DROITS[code] || (s.includes(' - ') ? s.split(/\s+-\s+/).slice(1).join(' - ').trim() : s);
  return { code: DROITS[code] ? code : null, libelle, demembre: code === 'U' || code === 'N' || /usufruit|nue?-?propri/i.test(s) };
}

/**
 * Un propriétaire tel que le classement le lit, depuis une ligne groupée du
 * fichier DGFiP. Pure : testée sans réseau.
 *
 * @param {{siren, nom, forme, droit, lots?: Array, rez_de_chaussee?: boolean, locaux?: number, adresse?: string}} g
 */
export function enProprietaire(g) {
  const droit = droitDe(g?.droit);
  const lots = (g?.lots || []).map((l) => ({
    etage: l.niveau ?? l.etage ?? null,
    rez_de_chaussee: estRezDeChaussee(l.niveau ?? l.etage),
    batiment: l.batiment || null,
    entree: l.entree || null,
    porte: l.porte || null,
    droit: l.droit ? droitDe(l.droit).libelle : droit.libelle,
  }));
  return {
    nom: g?.nom || null,
    siren: /^\d{9}$/.test(String(g?.siren || '')) ? String(g.siren) : null,
    forme: formeCourte(g?.forme),
    droit: droit.libelle,
    droit_code: droit.code,
    demembre: droit.demembre,
    proprietaire: true,
    occupant: false,
    rez_de_chaussee: lots.length ? lots.some((l) => l.rez_de_chaussee) : !!g?.rez_de_chaussee,
    locaux: lots.length || g?.locaux || 0,
    lots,
    adresse: g?.adresse || null,
    activite: null,
    creation: null,
    effectif: null,
    gerants: [],
  };
}

/**
 * Qui retenir : l'exploitant s'il possède ses murs, sinon le propriétaire du
 * rez-de-chaussée. Un seul propriétaire pour tout l'immeuble, c'est lui.
 * Plusieurs au rez-de-chaussée, ou aucun étage renseigné : personne n'est
 * choisi, la liste est rendue et l'équipe tranche. Pure : testée sans réseau.
 */
export function choisirProprietaire(proprietaires, occupant = null) {
  const p = (proprietaires || []).filter((x) => x.proprietaire !== false);
  if (p.length === 1) return { choix: p[0], motif: 'seul propriétaire publié sur la parcelle' };
  const memeNom = (a, b) => a && b && String(a).toLowerCase().replace(/[^a-z0-9]/g, '') === String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
  const occ = occupant ? p.find((x) => (occupant.siren && x.siren === occupant.siren) || memeNom(x.nom, occupant.nom) || memeNom(x.nom, occupant.enseigne)) : null;
  if (occ) return { choix: occ, motif: "l'exploitant du commerce est propriétaire de ses murs", occupant_proprietaire: true };
  const rdc = p.filter((x) => x.rez_de_chaussee);
  if (rdc.length === 1) return { choix: rdc[0], motif: 'propriétaire du rez-de-chaussée' };
  if (rdc.length > 1) {
    const immo = rdc.filter((x) => x.forme === 'SCI' || /location|immobili/i.test(x.activite || ''));
    if (immo.length === 1) return { choix: immo[0], motif: `${rdc.length} propriétaires au rez-de-chaussée, une seule société immobilière` };
    return { choix: null, motif: `${rdc.length} propriétaires au rez-de-chaussée : à départager` };
  }
  return { choix: null, motif: p.length ? `${p.length} propriétaires, aucun lot au rez-de-chaussée identifié` : 'aucun propriétaire publié' };
}

/** « 06029000CR0099 » → { insee, section, numero }. Pure. */
export function decomposerParcelle(id) {
  const m = String(id || '').match(/^(\d{5})(\d{3})([0-9A-Z]{2})(\d{4})$/);
  return m ? { insee: m[1], prefixe: m[2], section: m[3], numero: m[4] } : null;
}

// --- Les deux lectures du fichier DGFiP --------------------------------------

/** Le millésime le plus récent déjà extrait pour ce département, ou null. */
export function millesimeExtrait(dept) {
  const annee = new Date().getFullYear();
  for (let a = annee; a >= PREMIERE_ANNEE; a--) if (dejaLa(a, dept)) return a;
  return null;
}

const indexParDept = new Map();
/** L'index parcelle → propriétaires d'un département extrait, gardé en mémoire. */
function indexDgfip(dept, annee) {
  const cle = `${dept}|${annee}`;
  if (!indexParDept.has(cle)) indexParDept.set(cle, parParcelle(lire(annee, dept)));
  return indexParDept.get(cle);
}

/** Les propriétaires d'une parcelle, par la lecture la plus fraîche disponible. */
async function proprietairesDeLaParcelle(id) {
  const p = decomposerParcelle(id);
  if (!p) return { proprietaires: [], millesime: null, lecture: null };
  const dept = p.insee.slice(0, 2);
  const annee = millesimeExtrait(dept);
  if (annee) {
    const groupes = indexDgfip(dept, annee).get(id) || [];
    return { proprietaires: groupes.map(enProprietaire), millesime: annee, lecture: 'fichier DGFiP du département' };
  }
  const doc = await locauxDeSection(p.insee, p.section);
  const groupes = grouperProprietaires(doc.lignes)[p.numero] || [];
  return { proprietaires: groupes.map(enProprietaire), millesime: doc.annee ? Number(doc.annee) : null, lecture: 'MAJIC par section, en ligne' };
}

const indexCadastre = new Map();
async function parcelleDuPoint(insee, lat, lon) {
  if (!indexCadastre.has(insee)) indexCadastre.set(insee, indexerParcelles(await chargerParcelles(insee)));
  return indexCadastre.get(insee).parcelleProche(lat, lon);
}

/** L'aire d'un anneau [lat, lon][] en m², pour la contenance quand on l'a sous la main. */
export function aireDe(anneau) {
  if (!anneau || anneau.length < 4) return null;
  const lat0 = anneau[0][0] * Math.PI / 180;
  const kx = 111320 * Math.cos(lat0); const ky = 110540;
  let s = 0;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [ay, ax] = anneau[i]; const [by, bx] = anneau[j];
    s += (bx * kx) * (ay * ky) - (ax * kx) * (by * ky);
  }
  return Math.round(Math.abs(s) / 2);
}

function contenanceDe(insee, id) {
  try {
    const fichier = path.join(DATA_DIR, 'cadastre', `${insee}.json`);
    if (!fs.existsSync(fichier)) return null;
    const p = JSON.parse(fs.readFileSync(fichier, 'utf-8')).find((x) => x.id === id);
    return p ? aireDe(p.c) : null;
  } catch { return null; }
}

/**
 * Les propriétaires d'une adresse, par les fichiers publics.
 *
 * Même forme de sortie que l'ancien Data Foncier, pour que l'enrichissement
 * et les écrans n'aient rien à réapprendre. `prive` dit qu'aucune société
 * n'est publiée sur la parcelle : les murs sont, selon toute vraisemblance,
 * à des particuliers, que rien d'ouvert ne nomme.
 *
 * @returns {Promise<{adresse, parcelle, distance_m, surface_parcelle, proprietaires, choix, motif_choix, prive, millesime, source, lu_le}|null>}
 */
export async function proprietairesDe(texteAdresse, { occupant = null, point = null } = {}) {
  const adresse = point?.lat != null && point?.lon != null
    ? { label: texteAdresse, lat: Number(point.lat), lon: Number(point.lon), code_insee: point.code_insee || null }
    : await resoudreAdresse(texteAdresse);
  if (!adresse) return null;
  if (!adresse.code_insee) {
    const ban = await resoudreAdresse(texteAdresse).catch(() => null);
    adresse.code_insee = ban?.code_insee || null;
  }
  if (!adresse.code_insee) return null;

  const parcelle = await parcelleDuPoint(adresse.code_insee, adresse.lat, adresse.lon);
  const lu_le = new Date().toISOString();
  if (!parcelle) {
    return { adresse: adresse.label, parcelle: null, proprietaires: [], choix: null, motif_choix: 'aucune parcelle cadastrale sous ce point', prive: false, millesime: null, source: SOURCE, lu_le };
  }

  const { proprietaires, millesime, lecture } = await proprietairesDeLaParcelle(parcelle);
  const { choix, motif, occupant_proprietaire = false } = choisirProprietaire(proprietaires, occupant);
  const prive = !proprietaires.length;
  return {
    occupant_proprietaire,
    adresse: adresse.label,
    adresse_fiche: null,
    adresse_non_confirmee: false,
    confirmee_par: 'parcelle',
    parcelle,
    batiment_id: null,
    distance_m: 0,
    surface_parcelle: contenanceDe(adresse.code_insee, parcelle),
    surface_batiment: null,
    proprietaires,
    choix,
    motif_choix: prive
      ? `propriétaire privé, non publié : aucune société sur cette parcelle au 1er janvier ${millesime || ''}`.trim()
      : motif,
    prive,
    demarche: prive ? DEMARCHE_RELEVE : null,
    millesime,
    lecture,
    source: SOURCE,
    lu_le,
  };
}
