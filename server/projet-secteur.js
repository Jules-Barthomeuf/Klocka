// Le secteur d'un projet, en chiffres : ce que la page projet montre sous
// « La ville » et « Le secteur ».
//
// Ce qui est gratuit se lit tout seul : l'agglomération (fichier Insee
// embarqué), la mairie (geo.api.gouv.fr), le résidentiel (Le Figaro, pages
// publiques), la rue (relevé OpenStreetMap et valeur locative Data-B). Les flux
// et la commercialité viennent de l'étude d'implantation Data-B, qui coûte un
// crédit : on reprend celle du dossier ou du cache, et on ne la lance que sur
// demande de l'équipe.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference', 'unites-urbaines.json'), 'utf8'));

export const JOURS_GARDE = 30;
export const ENTITE = 'SecteurProjet';

/** Paris, Lyon et Marseille : un arrondissement renvoie à sa commune. */
export function communeParente(code) {
  const c = String(code || '');
  if (/^751(0[1-9]|1\d|20)$/.test(c)) return '75056';
  if (/^6938[1-9]$/.test(c)) return '69123';
  if (/^132(0[1-9]|1[0-6])$/.test(c)) return '13055';
  return c;
}

/** L'unité urbaine de la commune : son nom, ses habitants, ses communes. */
export function agglomerationDe(code, reference = REFERENCE) {
  const u = reference.communes[communeParente(code)];
  const fiche = u ? reference.unites[u] : null;
  if (!fiche) return null;
  const [nom, population, communes] = fiche;
  return { nom, population, communes, source: 'Insee, unité urbaine 2020' };
}

/** Distance à vol d'oiseau, en mètres. */
export function distanceM(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/** La mairie de la commune : c'est elle qui tient lieu de centre-ville. */
export async function mairieDe(code) {
  const r = await fetch(`https://geo.api.gouv.fr/communes/${encodeURIComponent(code)}?fields=nom,mairie,centre`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null;
  const c = await r.json();
  const point = c.mairie?.coordinates || c.centre?.coordinates;
  if (!point) return null;
  return { nom: c.nom, lat: point[1], lon: point[0], repere: c.mairie ? 'mairie' : 'centre de la commune' };
}

/** Le résidentiel du Figaro : le quartier d'abord, la commune à défaut. */
export function residentielDe(r) {
  if (!r) return null;
  const q = r.quartier;
  const c = r.commune;
  const niveau = q?.prix?.median ? q : c;
  if (!niveau?.prix?.median && !niveau?.loyer?.median) return null;
  // Une évolution absente au quartier se prend à la commune, en le disant.
  const evolution = (cle) => {
    if (niveau.prix?.[cle] != null) return { valeur: niveau.prix[cle], echelle: niveau === q ? 'quartier' : 'commune' };
    if (niveau === q && c?.prix?.[cle] != null) return { valeur: c.prix[cle], echelle: 'commune' };
    return null;
  };
  return {
    echelle: niveau === q ? 'quartier' : 'commune',
    nom: niveau.nom || r.ville || null,
    prix_m2: niveau.prix?.median ?? null,
    loyer_m2_mois: niveau.loyer?.median ?? null,
    evolution_1_an: evolution('sur_1_an'),
    evolution_5_ans: evolution('sur_5_ans'),
    lien: niveau.lien || null,
  };
}

/** La rue selon ALX : loyer de marché (Data-B), prix au m², rang. */
export function rueDe(e) {
  if (!e) return null;
  const [bas, haut] = Array.isArray(e.loyer) ? e.loyer : [null, null];
  const loyer = Number.isFinite(bas) && Number.isFinite(haut) ? Math.round((bas + haut) / 2) : null;
  const prix = Number.isFinite(e.prix_m2) ? e.prix_m2 : null;
  if (loyer == null && prix == null) return null;
  return {
    nom: e.rue || null,
    loyer_m2_an: loyer,
    loyer_bas: Number.isFinite(bas) ? bas : null,
    loyer_haut: Number.isFinite(haut) ? haut : null,
    loyer_source: e.loyer_source || null,
    prix_m2: prix,
    prix_m2_source: e.prix_m2_source || null,
    vitrines: e.vitrines ?? null,
  };
}

/** Les étoiles de l'étude d'implantation. Un flux déclaré indisponible n'a pas de note. */
export function fluxDe(r) {
  if (!r) return null;
  const note = (n) => (n && Number.isFinite(n.note) ? { note: n.note, sur: n.sur || 5 } : null);
  const sortie = {
    pieton: r.flux_pieton?.indisponible ? null : note(r.flux_pieton?.note),
    voiture: r.flux_voiture?.indisponible ? null : note(r.flux_voiture?.note),
    commercialite: note(r.troncon?.note),
    troncon: r.troncon?.libelle || null,
  };
  return sortie.pieton || sortie.voiture || sortie.commercialite ? sortie : null;
}

/** La clé d'adresse du cache Data-B, sans l'activité (voir data-b-implantation.js). */
export const cleAdresse = (a) => `${a.numero} ${a.rue} ${a.code_postal} ${a.ville}`.toLowerCase().replace(/\s+/g, ' ').trim();

/** L'étude la plus récente de cette adresse qui porte au moins une note. */
export function implantationEnCache(adresse, enregistrements) {
  const debut = `${cleAdresse(adresse)}|`;
  return (enregistrements || [])
    .filter((r) => String(r.cle || '').startsWith(debut) && fluxDe(r.resultat))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0]?.resultat || null;
}

/** Le lot du dossier dont vient le projet : celui de sa rue, sinon le premier. */
export function lotDuProjet(projet, deal) {
  const lots = deal?.lots || [];
  if (lots.length < 2) return lots[0] || null;
  const norme = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const cible = norme(projet.adresse_complete);
  return lots.find((l) => {
    const rue = norme(l.lot?.adresse?.valeur?.rue);
    return rue && cible.includes(rue);
  }) || lots[0];
}

/** Assemble les chiffres du secteur. Les lecteurs sont injectables pour les tests. */
export async function calculerSecteur(projet, {
  resoudre = async (t) => (await import('./data-b.js')).resoudreAdresse(t),
  mairie = mairieDe,
  figaro = async (t) => {
    const { prixResidentiel } = await import('./figaro.js');
    const r = await prixResidentiel(t);
    return r.ok ? r.resultat : null;
  },
  rue = async (t) => (await import('./alx/emplacement.js')).emplacementDeLAdresse(t),
  etudes = () => Records.list('DataBImplantation'),
  dealDe = (id) => Records.findBy('Deal', 'deal_id', id),
} = {}) {
  const texte = String(projet.adresse_complete || '').trim();
  const adresse = texte ? await resoudre(texte).catch(() => null) : null;
  const lot = lotDuProjet(projet, projet.deal_id ? dealDe(projet.deal_id) : null);

  const [hotel, residentiel, emplacement] = await Promise.all([
    adresse?.code_insee ? mairie(communeParente(adresse.code_insee)).catch(() => null) : null,
    lot?.prix_residentiel || (texte ? figaro(texte).catch(() => null) : null),
    texte ? rue(texte).catch(() => null) : null,
  ]);
  const implantation = fluxDe(lot?.implantation) ? lot.implantation : adresse ? implantationEnCache(adresse, etudes()) : null;

  return {
    adresse: adresse ? { label: adresse.label, lat: adresse.lat, lon: adresse.lon, code_insee: adresse.code_insee } : null,
    agglomeration: adresse ? agglomerationDe(adresse.code_insee) : null,
    centre: hotel && adresse ? { distance_m: distanceM(adresse, hotel), repere: `${hotel.repere} de ${hotel.nom}` } : null,
    residentiel: residentielDe(residentiel),
    rue: rueDe(emplacement),
    flux: fluxDe(implantation),
  };
}

const enCours = new Map();

/**
 * Trente jours pour une fiche complète ; une heure quand Le Figaro ou la rue
 * manquent. Le premier passage sur une commune bâtit son relevé OpenStreetMap
 * pendant que les autres lecteurs attendent, et revenait sans rue ni
 * résidentiel : gardée trente jours, la fiche restait vide un mois.
 */
export function dureeDeGarde(donnees) {
  return donnees?.residentiel && donnees?.rue ? JOURS_GARDE * 86400000 : HEURE_INCOMPLET;
}
const HEURE_INCOMPLET = 3600000;

const dernier = (projetId) => Records.filter(ENTITE, { project_id: projetId })
  .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0] || null;

/**
 * Ce que la page affiche tout de suite, et le calcul relancé en arrière-plan
 * quand la fiche a plus de trente jours ou que l'adresse a changé.
 */
export function lireSecteur(projet, { forcer = false, calculer = calculerSecteur } = {}) {
  const garde = dernier(projet.id);
  const frais = garde && garde.adresse === projet.adresse_complete && Date.now() - Date.parse(garde.le) < dureeDeGarde(garde.donnees);
  if ((forcer || !frais) && projet.adresse_complete && !enCours.has(projet.id)) {
    const tache = calculer(projet)
      .then((donnees) => {
        const fiche = { project_id: projet.id, adresse: projet.adresse_complete, donnees, le: new Date().toISOString() };
        const avant = dernier(projet.id);
        if (avant) Records.update(ENTITE, avant.id, fiche);
        else Records.create(ENTITE, fiche);
      })
      .catch((e) => console.warn(`[secteur] ${projet.id} : ${e?.message || e}`))
      .finally(() => enCours.delete(projet.id));
    enCours.set(projet.id, tache);
  }
  return { ...(garde?.donnees || {}), le: garde?.le || null, en_cours: enCours.has(projet.id) };
}

/** Attend le calcul en cours d'un projet (pour les tests et l'étude à la demande). */
export const attendreSecteur = (projetId) => enCours.get(projetId) || Promise.resolve();
