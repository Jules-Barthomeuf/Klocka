// La cloche « Ce qui t'attend », ce que chacun en retire (21 oct. 2026, Jules : « on doit pouvoir enlever les notifs
// toujours dedans ») : une ligne se retire, pour soi seul ; ou se remet à plus tard par un rappel, et revient ce
// jour-là. Rien n'est supprimé à la source : une proposition reste dans À valider, une relance dans les Appels.

import { Records } from '../db.js';

const ENTITE = 'ClocheMasque';
const norm = (e) => String(e || '').trim().toLowerCase();

/** Pure : les clés retirées qui comptent encore (sans date de retour, ou dont la date n'est pas passée). */
export function clesActives(masques = [], maintenant = new Date()) {
  const t = maintenant.toISOString();
  return [...new Set(masques.filter((m) => !m.jusqua || m.jusqua > t).map((m) => m.cle))];
}

/** Les lignes retirées par une personne, encore actives. */
export const masquesDe = (email) => clesActives(Records.list(ENTITE).filter((m) => m.email === norm(email)));

/**
 * Retire une ligne de la cloche. Avec `jusqua` (et la phrase de la ligne), elle revient ce jour-là, et un rappel est
 * posé à la même date : il revient sous le chat et dans la cloche, avec son texte.
 */
export async function masquer(user, { cle, jusqua = null, phrase = null, lien = null }) {
  const email = norm(user?.email);
  const c = String(cle || '').trim();
  if (!email || !c) return { ok: false, error: 'Ligne inconnue.' };
  const date = jusqua ? new Date(jusqua) : null;
  if (jusqua && Number.isNaN(date?.getTime())) return { ok: false, error: 'Date de rappel invalide.' };
  Records.create(ENTITE, { email, cle: c, jusqua: date ? date.toISOString() : null, le: new Date().toISOString() });
  let rappel = null;
  if (date && phrase) {
    const jj = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const { creerRappel } = await import('../rappels.js');
    const r = await creerRappel({ texte: `le ${jj}/${mm} à 9h : ${String(phrase).slice(0, 300)}${lien ? ` (${lien})` : ''}`, user });
    rappel = r?.ok ? r.rappel : null;
  }
  return { ok: true, rappel };
}
