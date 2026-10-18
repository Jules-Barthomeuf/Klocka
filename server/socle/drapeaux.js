// L'interrupteur de la boîte à outils de Haka (18 oct. 2026, plan validé : chaque lot livré derrière un
// interrupteur). Allumé par BOITE_OUTILS=1, ou depuis Paramètres › Sources (meta « boite_outils.actif »).
// Éteint, rien de neuf ne tourne : ni imports planifiés, ni routes du socle ; les outils restent tels quels.

import { Meta } from '../db.js';

const CLE = 'boite_outils.actif';
const vrai = (v) => ['1', 'true', 'oui'].includes(String(v || '').trim().toLowerCase());

export function boiteOutilsActive() {
  if (process.env.BOITE_OUTILS !== undefined && process.env.BOITE_OUTILS !== '') return vrai(process.env.BOITE_OUTILS);
  return vrai(Meta.get(CLE));
}

export function poserBoiteOutils(actif) {
  Meta.set(CLE, actif ? '1' : '0');
  return boiteOutilsActive();
}
