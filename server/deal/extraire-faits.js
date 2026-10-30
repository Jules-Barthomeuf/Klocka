// Les faits d'une fiche, sans dossier (30 oct. 2026, la Mémoire Klocka) : le texte du document (`ingerer`) puis
// l'extraction (`extraire`), un seul appel au modèle, et rien d'autre. Pas d'enrichissement, pas d'évaluation, pas
// de synthèse : `analyserFiche` fait tout cela et enregistre un Deal ; ici on ne veut que ce que la fiche dit.

import { ingerer } from './ingest.js';
import { extraire } from './extract.js';
import { EUR_PAR_USD, mesurer } from '../llm-couts.js';

export const OPERATION = 'mémoire : fiche';

/**
 * @param {{ buffer?: Buffer, filename?: string, mimetype?: string, texte?: string }} entree
 * @param {{ par?: string|null }} [o] qui paie la lecture (la boîte lue)
 * @returns {Promise<{ lots: object[], agent: object|null, incidents: object[], ia: boolean, texte: string, cout_eur: number }>}
 */
export async function extraireFaits(entree, { par = null } = {}) {
  const { resultat, consommation } = await mesurer({ operation: OPERATION, par }, async () => {
    const source = await ingerer(entree);
    const texte = source?.texte || '';
    const r = await extraire(texte);
    return { lots: r.lots || [], agent: r.agent || null, incidents: r.incidents || [], ia: !!r.ia, texte };
  });
  // Le compteur est en dollars (le prix des modèles) ; le budget de la nuit se compte en euros.
  return { ...resultat, cout_eur: Number(consommation?.cout || 0) * EUR_PAR_USD };
}
