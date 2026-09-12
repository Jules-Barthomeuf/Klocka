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

const HORS_JEU = ['Stand-by', 'Abandonné', 'Projet Signé', 'Mandat signé'];

const COL = {
  statut: 'status1',
  budget: 'numeric_mkv6khwn',
  fonds_propres: 'numeric_mkv27he0',
  revenu: 'numeric_mkv24e64',
  lieu_recherche: 'text_mkzm6pdz',
  objectif: 'color_mkzm7em7',
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
export function clientsDe(lignes) {
  return (lignes || [])
    .filter((l) => !HORS_JEU.includes(l.colonnes[COL.statut]))
    .map((l) => ({
      id: l.id,
      nom: l.nom,
      statut: l.colonnes[COL.statut] || null,
      budget: nombre(l.colonnes[COL.budget]),
      fonds_propres: nombre(l.colonnes[COL.fonds_propres]),
      revenu: nombre(l.colonnes[COL.revenu]),
      lieu_recherche: l.colonnes[COL.lieu_recherche] || null,
      objectif: l.colonnes[COL.objectif] || null,
    }));
}

/**
 * Les clients dont le statut n'est ni Stand-by, ni Abandonné, ni conclu.
 * @returns {Promise<{id, nom, statut, budget, fonds_propres, revenu, lieu_recherche, objectif}[]>}
 */
export async function clientsActifs() {
  if (!clientsConfigure()) return [];
  return clientsDe(await lireTableau(TABLEAUX.investisseurs));
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
