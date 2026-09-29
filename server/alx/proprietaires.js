// Le propriétaire des murs : Data Foncier (Data-B) d'abord, les fichiers
// DGFiP en secours.
//
// Data Foncier nomme aussi ce que les fichiers publics taisent ; les fichiers
// DGFiP répondent en une demi-seconde, sans compte. Les deux rendent la même
// forme (foncier.js, foncier-ouvert.js) : l'enrichissement, le vendeur et la
// fiche d'une cible lisent l'une ou l'autre sans le savoir, et `source` dit
// laquelle a répondu.

import { proprietairesDe as parDataB } from './foncier.js';
import { proprietairesDe as parDgfip } from './foncier-ouvert.js';
import { dataBConfigure } from '../data-b.js';

export async function proprietairesDe(texteAdresse, options = {}) {
  let motifRepli = null;
  if (dataBConfigure()) {
    try {
      const r = await parDataB(texteAdresse, options);
      if (r?.proprietaires?.length) return r;
      motifRepli = r ? 'Data Foncier ne publie aucun propriétaire ici' : 'Data-B ne trouve pas cette adresse';
    } catch (e) {
      motifRepli = `Data-B indisponible (${e?.message || e})`;
    }
  } else {
    motifRepli = "Data-B n'est pas configuré";
  }
  const r = await parDgfip(texteAdresse, options);
  return r ? { ...r, repli: motifRepli } : r;
}
