// Les clients actifs de Monday : leur budget, leur zone de recherche, leur
// objectif. C'est ce qui dit à ALX pour qui il cherche.
//
// Le tableau, les colonnes et les statuts sont ceux de server/clients-decouverte.js
// (COL, LISTES) : un seul endroit sait ce que le tableau « Clients » de Monday
// appelle chaque chose. On ne redéclare rien ici.
//
// « Clients en cours » : tous les statuts sauf Stand-by et Abandonné (plus
// vendeur), Projet Signé et Mandat signé (déjà conclus). C'est la demande
// exacte : chercher pour ceux qui cherchent encore, pas pour ceux qui ont fini.

import { mondayConfigure, TABLEAUX, lireTableau } from '../monday.js';
import { twentyConfigure } from '../twenty.js';
import * as Twenty from '../crm/monday-sur-twenty.js';

const HORS_JEU = ['Stand-by', 'Abandonné', 'Projet Signé', 'Mandat signé'];

const COL = {
  statut: 'status1',
  budget: 'numeric_mkv6khwn',
  fonds_propres: 'numeric_mkv27he0',
  revenu: 'numeric_mkv24e64',
  lieu_recherche: 'text_mkzm6pdz',
  objectif: 'color_mkzm7em7',
  remarque: 'long_text_mkv2twrk',
  information: 'text_mkvngea0',
  // Où vit le client et ce qu'il fait (31 oct. 2026, Jules : montrés aux mandataires).
  localisation: 'location_mkv2tpc2',
  fonction: 'text_mkvnmx09',
};

const nombre = (t) => {
  const n = Number(String(t || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const clientsConfigure = () => mondayConfigure() && !!TABLEAUX.investisseurs;

/**
 * Le filtre et la mise en forme, séparés de l'appel réseau : c'est ce qui se
 * teste sans jeton Monday, sur une page telle que lireTableau() la rend.
 * @param {{id, nom, colonnes: Record<string,string>}[]} lignes
 */
export function clientsDe(lignes, { tous = false } = {}) {
  return (lignes || [])
    .filter((l) => tous || !HORS_JEU.includes(l.colonnes[COL.statut]))
    .map((l) => ({
      // Une ligne lue dans Twenty garde son ancien id Monday comme id (c'est lui que les fiches locales connaissent),
      // et son id Twenty à part ; une fiche née dans Twenty n'a que celui-là.
      id: l.monday_id || l.id,
      twenty_id: 'monday_id' in l ? l.id : null,
      nom: l.nom,
      statut: l.colonnes[COL.statut] || null,
      budget: nombre(l.colonnes[COL.budget]),
      fonds_propres: nombre(l.colonnes[COL.fonds_propres]),
      revenu: nombre(l.colonnes[COL.revenu]),
      lieu_recherche: l.colonnes[COL.lieu_recherche] || null,
      objectif: l.colonnes[COL.objectif] || null,
      remarque: l.colonnes[COL.remarque] || null,
      information: l.colonnes[COL.information] || null,
      localisation: l.colonnes[COL.localisation] || null,
      fonction: l.colonnes[COL.fonction] || null,
      entre_le: l.cree_le || null,
      groupe: l.groupe || null,
    }));
}

/**
 * Les clients dont le statut n'est ni Stand-by, ni Abandonné, ni conclu.
 * @returns {Promise<{id, nom, statut, budget, fonds_propres, revenu, lieu_recherche, objectif}[]>}
 */
// Gardés dix minutes (30 oct. 2026) : chaque appel relisait tout le tableau des clients dans le CRM, par le réseau
// (près de 4 s), et la barre de menu de chaque admin le demandait toutes les cinq minutes. Deux appels en même temps
// partagent la même lecture ; un échec n'est pas gardé.
const DIX_MINUTES = 10 * 60_000;
let enCache = null;
export async function clientsActifs() {
  if (!clientsConfigure()) return [];
  if (enCache && Date.now() - enCache.le < DIX_MINUTES) return enCache.promesse;
  const promesse = lireTableau(TABLEAUX.investisseurs).then(clientsDe);
  enCache = { le: Date.now(), promesse };
  promesse.catch(() => { if (enCache?.promesse === promesse) enCache = null; });
  return promesse;
}
/** Pour les tests et après une écriture dans le tableau des clients : la prochaine lecture repart du CRM. */
export const oublierClientsActifs = () => { enCache = null; enCacheTwenty = null; };

// Les clients lus dans Twenty CRM, quel que soit le CRM du reste de la plateforme (31 oct. 2026, Jules : le vrai
// fichier des clients est dans Twenty ; en CRM=double, le reste lit encore Monday). Même filtre, même forme.
export const clientsTwentyConfigure = () => twentyConfigure() && !!TABLEAUX.investisseurs;
let enCacheTwenty = null;
/** Le groupe « Clients en cours » de Twenty CRM : ce sont eux que les mandataires voient (31 oct. 2026, Jules). */
export const GROUPE_EN_COURS = 'CLIENTS_EN_COURS';
export const enCoursTwenty = (c) => c.groupe === GROUPE_EN_COURS;
/** Toutes les fiches clients de Twenty CRM, quel que soit leur statut (le tri se fait sur le groupe). */
export async function clientsActifsTwenty() {
  if (!clientsTwentyConfigure()) return [];
  if (enCacheTwenty && Date.now() - enCacheTwenty.le < DIX_MINUTES) return enCacheTwenty.promesse;
  const promesse = Twenty.lireTableau(TABLEAUX.investisseurs).then((l) => clientsDe(l, { tous: true }));
  enCacheTwenty = { le: Date.now(), promesse };
  promesse.catch(() => { if (enCacheTwenty?.promesse === promesse) enCacheTwenty = null; });
  return promesse;
}

/**
 * La fourchette de budget des clients actifs, pour recaler le périmètre par
 * défaut (200 000 à 1 000 000) sur ce que l'équipe cherche vraiment.
 */
export async function fourchetteBudgets() {
  const clients = (await clientsActifs()).filter((c) => c.budget);
  if (!clients.length) return null;
  const budgets = clients.map((c) => c.budget).sort((a, b) => a - b);
  return { min: budgets[0], max: budgets[budgets.length - 1], mediane: budgets[Math.floor(budgets.length / 2)], effectif: clients.length };
}

/** Les clients dont le budget encadre une fourchette de prix — pour dire à qui une cible parlerait. */
export async function clientsPourFourchette([bas, haut]) {
  if (bas == null || haut == null) return [];
  return (await clientsActifs()).filter((c) => c.budget && c.budget >= bas * 0.8 && c.budget <= haut * 1.2);
}
