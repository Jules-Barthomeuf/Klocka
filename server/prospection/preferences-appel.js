// Les étapes qu'une personne ne veut plus voir proposées après un appel (19 oct. 2026, Jules : « pouvoir supprimer
// les trucs dans chaque appel en Mode appel, et que ça s'améliore tout seul, pour ne plus les proposer après et
// dans les autres villes »). Retirer une étape la fait disparaître de l'appel en cours et de tous les suivants de
// cette personne, quelle que soit la liste ; la rétablir la fait revenir. Monday et « Ne plus appeler » ne se
// retirent pas : l'un est toujours écrit, l'autre est une décision.

import { Records } from '../db.js';

const ENTITE = 'PreferenceAppel';
export const RETIRABLES = ['mail', 'sms', 'diffusion', 'signaler_bien', 'nouveau_contact', 'relance', 'relance_suivante', 'prevenir'];
const cle = (x) => String(x || '').toLowerCase();

/** Les types d'étape que cette personne a retirés. */
export function retirees(par) {
  const p = Records.list(ENTITE).find((x) => x.par === cle(par));
  return new Set((p?.retirees || []).filter((t) => RETIRABLES.includes(t)));
}

function ecrire(par, types) {
  const p = Records.list(ENTITE).find((x) => x.par === cle(par));
  const retirees = [...new Set(types)].filter((t) => RETIRABLES.includes(t));
  if (p) Records.update(ENTITE, p.id, { retirees, le: new Date().toISOString() });
  else Records.create(ENTITE, { par: cle(par), retirees, le: new Date().toISOString() });
  return retirees;
}

export function retirer(par, type) {
  if (!RETIRABLES.includes(type)) return { ok: false, error: 'Cette étape ne se retire pas.' };
  return { ok: true, retirees: ecrire(par, [...retirees(par), type]) };
}

export function retablir(par, type) {
  return { ok: true, retirees: ecrire(par, [...retirees(par)].filter((t) => t !== type)) };
}

/** Pure : les étapes d'un appel, sans celles que la personne a retirées. */
export const sansRetirees = (actions, types) => (actions || []).filter((a) => !types.has(a.type));
