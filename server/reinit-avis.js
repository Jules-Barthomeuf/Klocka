// La remise à zéro des avis de valeur (1er nov. 2026, Jules : « supprime-les […] dès qu'on arrive sur l'avis de valeur,
// il n'est pas complété ; ce modèle s'applique à tous les biens »). Le modèle a changé (capitalisation seule, taux de
// rendement validé, plus d'analyse de marché) : les avis rédigés avant gardaient l'ancien contenu. Tous les avis des
// mandataires sont effacés une fois, après une sauvegarde complète ; chaque bien repart d'un avis neuf.
//
// Effet voulu : un mandat préparé depuis un avis effacé ne se rattache plus à son bien (le bien revient à l'Avis de
// valeur). Les conversations et les taux de base validés restent.

import fs from 'fs';
import path from 'path';
import { Records, Meta, DATA_DIR } from './db.js';

export const CLE_REINIT_AVIS = 'reinit_avis_2026_11_01';

/** Efface tous les avis de valeur des mandataires, une seule fois, après les avoir sauvegardés. */
export function reinitialiserAvis({ maintenant = new Date(), dossier = path.join(DATA_DIR, 'sauvegardes') } = {}) {
  if (Meta.get(CLE_REINIT_AVIS)) return { ok: true, deja: Meta.get(CLE_REINIT_AVIS) };
  const avis = Records.list('EstimationMandataire');
  let sauvegarde = null;
  if (avis.length) {
    fs.mkdirSync(dossier, { recursive: true });
    sauvegarde = path.join(dossier, `avis-avant-reinit-${maintenant.toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(sauvegarde, JSON.stringify({ le: maintenant.toISOString(), avis }, null, 1));
  }
  for (const e of avis) Records.delete('EstimationMandataire', e.id);
  const bilan = `${avis.length} avis effacés le ${maintenant.toISOString()}${sauvegarde ? `, sauvegarde ${path.basename(sauvegarde)}` : ''}`;
  Meta.set(CLE_REINIT_AVIS, bilan);
  return { ok: true, effaces: avis.length, sauvegarde };
}
