// Le secteur d'un projet, en chiffres : ce que la page projet montre sous
// « La ville » et « Le secteur ».
//
// Ce qui est gratuit se lit tout seul : l'agglomération (fichier Insee
// embarqué), la mairie (geo.api.gouv.fr), le résidentiel (Le Figaro, pages
// publiques). Le loyer des commerces autour vient d'Equimmox seul : 500 m,
// locaux à ±20 % de la surface du bien (6 oct. 2026). Les flux
// et la commercialité viennent de l'étude d'implantation interne, longue la
// première fois : on reprend celle du dossier ou du cache, et on ne la lance
// que sur demande de l'équipe.

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

/**
 * Le loyer des commerces autour, lu chez Equimmox : des baux constatés à
 * 500 m, sur des locaux à ±20 % de la surface du bien. Equimmox et Data-B
 * sont les seules sources du loyer de l'onglet Marché (6 oct. 2026, décision
 * de Jules) : ni ALX, ni loyer déduit des ventes.
 */
export function loyerDe(r, nomRue = null) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  const moyenne = n(r?.moyenne) ?? (n(r?.bas) != null && n(r?.haut) != null ? Math.round((r.bas + r.haut) / 2) : null);
  if (moyenne == null) return null;
  return {
    nom: nomRue || null,
    loyer_m2_an: Math.round(moyenne),
    loyer_bas: n(r.bas),
    loyer_haut: n(r.haut),
    loyer_source: 'Equimmox',
    rayon: r.rayon || null,
    surface_min: n(r.surface_min),
    surface_max: n(r.surface_max),
    le: r.le || null,
  };
}

/**
 * Data-B, quand Equimmox n'a rien constaté : son estimation du quartier, la
 * maille la plus proche des 500 m, sinon la rue. Data-B ne filtre pas par
 * surface, et l'écran le dit.
 */
export function loyerDataBDe(d, nomRue = null) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  const niveau = [d?.quartier, d?.rue, d?.ville].find((x) => x && (n(x.basse) != null || n(x.haute) != null));
  if (!niveau) return null;
  const bas = n(niveau.basse) ?? n(niveau.haute);
  const haut = n(niveau.haute) ?? n(niveau.basse);
  return {
    nom: nomRue || null,
    loyer_m2_an: Math.round((bas + haut) / 2),
    loyer_bas: bas,
    loyer_haut: haut,
    loyer_source: 'Data-B',
    maille: niveau === d.quartier ? 'quartier' : niveau === d.rue ? 'rue' : 'ville',
    le: d.le || null,
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

/** La clé d'adresse du cache des études, sans l'activité (voir implantation/etude.js). */
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
  resoudre = async (t) => (await import('./adresse-ban.js')).resoudreAdresse(t),
  mairie = mairieDe,
  figaro = async (t) => {
    const { prixResidentiel } = await import('./figaro.js');
    const r = await prixResidentiel(t);
    return r.ok ? r.resultat : null;
  },
  // Equimmox à 500 m (son rayon par défaut), la surface du bien à ±20 %.
  // `forcerLoyer` : l'équipe relance l'analyse du loyer, sans le cache de
  // trente jours d'Equimmox ni celui de Data-B.
  forcerLoyer = false,
  loyer = async (t, surface, forcer = false) => {
    const { analyseLoyer, equimmoxConfigure } = await import('./equimmox.js');
    if (!equimmoxConfigure()) return null;
    const r = await analyseLoyer(t, { surface, forcer });
    return r.ok ? r.resultat : null;
  },
  dataB = async (t, forcer = false) => {
    const { valeurLocative, dataBConfigure } = await import('./data-b.js');
    if (!dataBConfigure()) return null;
    const r = await valeurLocative(t, { forcer });
    return r.ok ? r.resultat : null;
  },
  // Les études internes d'abord ; les anciennes études (DataBImplantation) restent lisibles.
  etudes = () => [...Records.list('EtudeImplantation'), ...Records.list('DataBImplantation')],
  dealDe = (id) => Records.findBy('Deal', 'deal_id', id),
} = {}) {
  // L'adresse avec la ville du projet ; un résultat d'une autre ville ne vaut rien.
  const { adresseAChercher, memeVille } = await import('../src/lib/adresse-projet.js');
  const texte = adresseAChercher(projet) || '';
  const trouvee = texte ? await resoudre(texte).catch(() => null) : null;
  const adresse = trouvee && memeVille(projet, trouvee.ville, trouvee.code_postal) ? trouvee : null;
  const lot = lotDuProjet(projet, projet.deal_id ? dealDe(projet.deal_id) : null);

  const surface = Number(projet.sim_surface) || Number(projet.surface_m2) || null;
  const [hotel, residentiel, equimmox] = await Promise.all([
    adresse?.code_insee ? mairie(communeParente(adresse.code_insee)).catch(() => null) : null,
    lot?.prix_residentiel || (texte ? figaro(texte).catch(() => null) : null),
    adresse ? loyer(adresse.label, surface, forcerLoyer).catch(() => null) : null,
  ]);
  const implantation = fluxDe(lot?.implantation) ? lot.implantation : adresse ? implantationEnCache(adresse, etudes()) : null;

  return {
    adresse: adresse ? { label: adresse.label, lat: adresse.lat, lon: adresse.lon, code_insee: adresse.code_insee } : null,
    agglomeration: adresse ? agglomerationDe(adresse.code_insee) : null,
    centre: hotel && adresse ? { distance_m: distanceM(adresse, hotel), repere: `${hotel.repere} de ${hotel.nom}` } : null,
    residentiel: residentielDe(residentiel),
    rue: loyerDe(equimmox, adresse?.rue || null)
      || (adresse ? loyerDataBDe(await dataB(adresse.label, forcerLoyer).catch(() => null), adresse.rue || null) : null),
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
// Version 3 (6 oct. 2026) : le loyer vient d'Equimmox, plus d'ALX ; la
// surface du bien entre dans la fiche, et la changer la recalcule.
// Version 4 (même jour) : Equimmox lit les baux existants des commerces.
const VERSION = 4;

const dernier = (projetId) => Records.filter(ENTITE, { project_id: projetId })
  .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0] || null;

/**
 * Ce que la page affiche tout de suite, et le calcul relancé en arrière-plan
 * quand la fiche a plus de trente jours ou que l'adresse a changé.
 */
export function lireSecteur(projet, { forcer = false, forcerLoyer = false, calculer = calculerSecteur } = {}) {
  const garde = dernier(projet.id);
  // Version 2 (5 oct. 2026) : l'adresse est cherchée avec la ville du projet ; les fiches d'avant se recalculent.
  const surface = Number(projet.sim_surface) || Number(projet.surface_m2) || null;
  const frais = garde && garde.version === VERSION && garde.adresse === projet.adresse_complete && (garde.surface ?? null) === surface && Date.now() - Date.parse(garde.le) < dureeDeGarde(garde.donnees);
  if ((forcer || forcerLoyer || !frais) && projet.adresse_complete && !enCours.has(projet.id)) {
    const tache = calculer(projet, forcerLoyer ? { forcerLoyer: true } : undefined)
      .then((donnees) => {
        const fiche = { project_id: projet.id, adresse: projet.adresse_complete, surface, version: VERSION, donnees, le: new Date().toISOString() };
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

/**
 * La fiche gardée, telle quelle, sans rien relancer : pour le lien public,
 * qu'un visiteur ne fasse pas partir une recherche Equimmox.
 */
export function secteurGarde(projetId) {
  const garde = dernier(projetId);
  return garde?.version === VERSION ? garde.donnees || null : null;
}

/** Attend le calcul en cours d'un projet (pour les tests et l'étude à la demande). */
export const attendreSecteur = (projetId) => enCours.get(projetId) || Promise.resolve();
