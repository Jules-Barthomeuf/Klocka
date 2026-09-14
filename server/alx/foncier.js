// Data Foncier, le module de Data-B qui dit qui possède quoi à une adresse.
//
// La page du module fait deux appels, on fait les mêmes avec le compte de
// service de l'équipe (server/data-b.js) : les bâtiments autour d'un point
// (api/batimentV2), puis la fiche d'un bâtiment (company/foncier) avec ses
// propriétaires, leurs lots, leur société et leurs gérants.
//
// Un commerce est au rez-de-chaussée : c'est le propriétaire du lot du bas
// qu'on cherche. Quand la fiche ne distingue pas les étages, ou qu'ils sont
// plusieurs au rez-de-chaussée, on rend la liste et l'équipe tranche.
//
// Données personnelles : Data-B affiche l'âge exact des gérants et une clé
// qui contient leur mois de naissance. On ne garde ni l'un ni l'autre : une
// tranche d'âge, le nom, la fonction. Rien de plus ne sort d'ici.

import { postDataB, resoudreAdresse, dataBConfigure } from '../data-b.js';
import { ErreurSource } from '../marche/erreurs.js';

const BATIMENTS = 'https://data-b.com/api/batimentV2';
const FICHE = 'https://data-b.com/company/foncier';

// Le rayon de lecture, en mètres : celui de la carte au zoom le plus fin.
const RAYON_M = 60;

const decoder = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** L'âge affiché devient une tranche, et rien d'autre ne sort d'ici. */
export function trancheAge(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return null;
  if (a >= 70) return '70+';
  if (a >= 50) return '50-70';
  return '-50';
}

/**
 * « Étage 00 », « RDC », « Rez-de-chaussée » : le lot du bas. « Parcelle »
 * aussi : ce propriétaire-là possède tout, le rez-de-chaussée compris.
 */
export function estRezDeChaussee(etage) {
  const e = String(etage || '').trim().toLowerCase();
  if (!e) return false;
  if (/rdc|rez|parcelle/.test(e)) return true;
  return /^0+$/.test(e.replace(/\D/g, '')) && /\d/.test(e);
}

/** Un bloc de propriétaire de la fiche, tel que Data-B l'écrit. */
function lireCarte(carte) {
  const nom = decoder((carte.match(/class="company-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
  const siren = (carte.match(/class="company-title[^"]*"[^>]*\ssiren="(\d{9})"/) || [])[1] || null;
  const types = (carte.match(/data-owner-types="([^"]*)"/) || [])[1] || '';
  const usages = [...carte.matchAll(/class="foncierUsageBadge"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => decoder(m[1]));

  const lots = [...carte.matchAll(/<div class="foncierLot[^"]*">([\s\S]*?)<div class="foncierLot__rights">([\s\S]*?)<\/div>/g)].map((m) => {
    const bloc = m[1];
    const etage = decoder((bloc.match(/foncierLot__type[^>]*>([\s\S]*?)<\/div>/) || [])[1]).replace(/^étage\s*/i, '');
    const detail = Object.fromEntries([...bloc.matchAll(/<span>\s*<small>([^<]*)<\/small>([^<]*)<\/span>/g)].map((d) => [decoder(d[1]).toLowerCase(), decoder(d[2])]));
    return {
      etage: etage || null,
      rez_de_chaussee: estRezDeChaussee(etage),
      batiment: detail['bâtiment'] || detail.batiment || null,
      entree: detail['entrée'] || detail.entree || null,
      porte: detail.porte || null,
      droit: decoder(m[2]) || null,
    };
  });

  const infos = Object.fromEntries(
    [...carte.matchAll(/<div class="row">\s*<div class="k">([\s\S]*?)<\/div>\s*<div class="v">([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => [decoder(m[1]).toLowerCase(), decoder(m[2])])
  );
  const creation = infos['création'] || infos.creation || null;
  const creationIso = creation && /^\d{2}\/\d{2}\/\d{4}$/.test(creation) ? creation.split('/').reverse().join('-') : null;

  const gerants = [...carte.matchAll(/<div class="person foncierPerson[^"]*"[^>]*>([\s\S]*?)<div class="actions/g)].map((m) => {
    const bloc = m[1];
    const titre = (bloc.match(/class="p-title[^"]*">([\s\S]*?)<\/div>/) || [])[1] || '';
    const nomComplet = decoder((titre.match(/<span class="company_mapping[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
    const usage = (nomComplet.match(/\(([^)]+)\)\s*$/) || [])[1] || null;
    const age = (titre.match(/-\s*(\d{2,3})\s*ans/) || [])[1];
    return {
      nom: nomComplet.replace(/\s*\([^)]*\)\s*$/, '').trim() || null,
      nom_usage: usage,
      tranche_age: trancheAge(age),
      qualite: decoder((bloc.match(/class="p-meta">([\s\S]*?)<\/div>/) || [])[1]) || null,
    };
  });

  const sci = /\bsci\b/.test(types) || /^SCI\b/i.test(nom);
  return {
    nom: nom || null,
    siren,
    forme: sci ? 'SCI' : null,
    proprietaire: usages.some((u) => /propri/i.test(u)),
    occupant: usages.some((u) => /occupant|locataire/i.test(u)),
    lots,
    rez_de_chaussee: lots.some((l) => l.rez_de_chaussee),
    adresse: infos.adresse || null,
    activite: infos['activité'] || infos.activite || null,
    creation: creationIso,
    effectif: infos.effectif || null,
    gerants,
  };
}

/**
 * La fiche d'un bâtiment, ramenée à ce qu'ALX garde.
 * @param {string} html la réponse de company/foncier
 */
export function lireFiche(html) {
  const h = String(html || '');
  // La fiche répète les cartes dans plusieurs onglets : on ne lit que le premier.
  const debut = h.indexOf('id="prop_all"');
  const fin = h.indexOf('id="prop_usage_proprietaires"');
  const zone = debut >= 0 ? h.slice(debut, fin > debut ? fin : undefined) : h;

  const entete = decoder((h.match(/<h1[^>]*class="[^"]*(?:foncier|company)[^"]*"[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
  // Les adresses du bâtiment lui-même sont dans le popover d'adresses (un
  // immeuble d'angle en a plusieurs). La première adresse écrite en gros dans
  // la page est souvent celle du siège d'un propriétaire : elle ne dit rien
  // du bâtiment, on ne s'y fie qu'à défaut.
  const adresses = [...new Set([...h.matchAll(/foncierAddressPopover__item[\s\S]*?<span>([\s\S]*?)<\/span>/g)].map((m) => decoder(m[1])).filter((a) => /\d{5}/.test(a)))];
  const adresse = adresses[0] || decoder((h.match(/^[\s\S]*?<(?:h1|h2|div)[^>]*>\s*([^<]*\d{5}\s+[A-ZÉÈ' -]+)\s*</) || [])[1]) || entete || null;
  const surfaceParcelle = Number((h.match(/Taille de la parcelle\s*:\s*([\d\s]+)\s*m/) || [])[1]?.replace(/\s/g, '')) || null;
  const surfaceBatiment = Number((h.match(/Taille du bâtiment\s*:\s*([\d\s]+)\s*m/) || [])[1]?.replace(/\s/g, '')) || null;

  const cartes = zone.split(/(?=<div class="foncierCard check_save foncierOwnerCard)/).slice(1);
  const vus = new Set();
  const proprietaires = [];
  for (const c of cartes) {
    const p = lireCarte(c);
    if (!p.nom) continue;
    const cle = p.siren || p.nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    proprietaires.push(p);
  }
  return { adresse, adresses, surface_parcelle: surfaceParcelle, surface_batiment: surfaceBatiment, proprietaires };
}

/**
 * Parmi les propriétaires d'un bâtiment, celui du commerce : le lot du
 * rez-de-chaussée. Un seul propriétaire pour tout l'immeuble, c'est lui.
 * Plusieurs au rez-de-chaussée, ou aucun étage renseigné : personne n'est
 * choisi, la liste est rendue et l'équipe tranche.
 */
export function choisirProprietaire(proprietaires, occupant = null) {
  const p = (proprietaires || []).filter((x) => x.proprietaire !== false);
  if (p.length === 1) return { choix: p[0], motif: 'seul propriétaire du bâtiment' };
  // L'exploitant du commerce est aussi propriétaire : c'est lui, sans hésiter.
  const memeNom = (a, b) => a && b && String(a).toLowerCase().replace(/[^a-z0-9]/g, '') === String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
  const occ = occupant ? p.find((x) => (occupant.siren && x.siren === occupant.siren) || memeNom(x.nom, occupant.nom) || memeNom(x.nom, occupant.enseigne)) : null;
  if (occ) return { choix: occ, motif: "l'exploitant du commerce est propriétaire de ses murs", occupant_proprietaire: true };
  const rdc = p.filter((x) => x.rez_de_chaussee);
  if (rdc.length === 1) return { choix: rdc[0], motif: 'propriétaire du rez-de-chaussée' };
  if (rdc.length > 1) {
    // Plusieurs au rez-de-chaussée, mais une seule société immobilière parmi eux : les murs, c'est elle.
    const immo = rdc.filter((x) => x.forme === 'SCI' || /location|immobili/i.test(x.activite || ''));
    if (immo.length === 1) return { choix: immo[0], motif: `${rdc.length} propriétaires au rez-de-chaussée, une seule société immobilière` };
    return { choix: null, motif: `${rdc.length} propriétaires au rez-de-chaussée : à départager` };
  }
  return { choix: null, motif: p.length ? `${p.length} propriétaires, aucun lot au rez-de-chaussée identifié` : 'aucun propriétaire publié' };
}

const distanceM = (lat1, lon1, lat2, lon2) => Math.hypot((lat2 - lat1) * 111000, (lon2 - lon1) * 111000 * Math.cos((lat1 * Math.PI) / 180));

const numeroDe = (adresse) => (String(adresse || '').match(/^\s*(\d+)\s*(bis|ter)?/i) || [])[1] || null;
/** Les numéros de rue d'une fiche : toutes les adresses du bâtiment. */
const numerosDe = (fiche) => (fiche.adresses?.length ? fiche.adresses : [fiche.adresse]).map(numeroDe).filter(Boolean);

/**
 * Les propriétaires d'une adresse, par Data Foncier.
 *
 * L'adresse passe par la Base Adresse Nationale pour un point, Data-B rend
 * les bâtiments autour, on ouvre les plus proches jusqu'à trouver celui dont
 * la fiche porte le même numéro de rue. Sans numéro qui concorde, on prend le
 * plus proche et on le dit (adresse_non_confirmee).
 *
 * @returns {Promise<{adresse, adresse_fiche, adresse_non_confirmee, parcelle, batiment_id, surface_parcelle, surface_batiment, proprietaires, choix, motif_choix, source, lu_le}|null>}
 */
export async function proprietairesDe(texteAdresse, { rayon = RAYON_M, essais = 3, occupant = null, point = null } = {}) {
  if (!dataBConfigure()) throw new ErreurSource("Data-B n'est pas configuré (DATAB_EMAIL, DATAB_MOT_DE_PASSE).", { service: 'Data-B', classe: 'definitive' });
  // Un point précis (la vitrine vue sur Maps) vaut mieux qu'une adresse
  // résolue : on part de lui, et le numéro ne sert qu'à confirmer.
  const adresse = point?.lat != null && point?.lon != null
    ? { label: texteAdresse, lat: Number(point.lat), lon: Number(point.lon), numero: numeroDe(texteAdresse) }
    : await resoudreAdresse(texteAdresse);
  if (!adresse) return null;

  const brut = await postDataB(BATIMENTS, { lat: adresse.lat, lng: adresse.lon, area: rayon, has_owner: '1', has_occupant: '1' });
  if (brut == null) throw new ErreurSource('Data-B refuse la session pour Data Foncier.', { service: 'Data-B' });
  let batiments;
  try {
    batiments = JSON.parse(brut);
  } catch {
    throw new ErreurSource("Data Foncier n'a pas rendu de bâtiments lisibles.", { service: 'Data-B' });
  }
  if (!Array.isArray(batiments) || !batiments.length) return { adresse: adresse.label, proprietaires: [], choix: null, motif_choix: 'aucun bâtiment publié autour de cette adresse', source: 'Data-B · Foncier', lu_le: new Date().toISOString() };

  // Les bâtiments avec un propriétaire publié d'abord, du plus proche au plus
  // loin ; les autres ensuite, pour au moins rendre une fiche.
  const tries = batiments
    .filter((b) => b && b.id && b.parcelle_id)
    .map((b) => ({ ...b, distance_m: Math.round(distanceM(adresse.lat, adresse.lon, Number(b.lat), Number(b.lng))) }))
    .sort((a, b) => (String(b.has_owner) === '1') - (String(a.has_owner) === '1') || a.distance_m - b.distance_m);

  const numero = adresse.numero || numeroDe(texteAdresse);
  let retenu = null;
  let fiche = null;
  for (const b of tries.slice(0, essais)) {
    const html = await postDataB(FICHE, { load: 'ajax', batiment_id: b.id, id_ODbL: b.id_ODbL || '', parcelle_id: b.parcelle_id, onglet: '' });
    if (!html) continue;
    const f = lireFiche(html);
    if (!fiche) {
      fiche = f;
      retenu = b;
    }
    if (numero && numerosDe(f).includes(String(numero))) {
      fiche = f;
      retenu = b;
      break;
    }
  }
  if (!fiche) throw new ErreurSource("Data Foncier n'a pas rendu de fiche pour ces bâtiments.", { service: 'Data-B' });

  const { choix, motif, occupant_proprietaire = false } = choisirProprietaire(fiche.proprietaires, occupant);
  // Sans numéro mais avec un point précis, le bâtiment le plus proche à
  // moins de quinze mètres est le bon : une vitrine touche son immeuble.
  const nonConfirmee = numero ? !numerosDe(fiche).includes(String(numero)) : !(point && retenu.distance_m <= 15);
  return {
    occupant_proprietaire,
    adresse: adresse.label,
    adresse_fiche: fiche.adresse,
    adresse_non_confirmee: nonConfirmee,
    confirmee_par: !nonConfirmee ? (numero ? 'numéro' : 'position') : null,
    parcelle: retenu.parcelle_id,
    batiment_id: retenu.id,
    distance_m: retenu.distance_m,
    surface_parcelle: fiche.surface_parcelle,
    surface_batiment: fiche.surface_batiment,
    proprietaires: fiche.proprietaires,
    choix,
    motif_choix: motif,
    source: 'Data-B · Foncier',
    lu_le: new Date().toISOString(),
  };
}
