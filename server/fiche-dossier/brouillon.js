// Le Brouillon (27 nov. 2026, Jules, après l'analyse des notes de Maxime : « je pense qu'il faut qu'on rajoute un truc
// comme ça ; test ») : une page de texte libre par personne, privée, qui se garde, comme l'onglet de notes où l'équipe
// écrit ses messages petit à petit avant de les copier. Deux gestes : « Ranger » à la place d'effacer (le passage part au
// rangement des notes libres, avec un OK), et « Copier » puis « Envoyé » (le message entre dans l'historique de la fiche).
// Ce qui est rangé quitte la page ; le dernier passage rangé se garde pour être remis.

import { Records } from '../db.js';

const ENTITE = 'BrouillonPerso';
const LIMITE = 60000;
const norm = (e) => String(e || '').trim().toLowerCase();

const sienDe = (user) => Records.filter(ENTITE, { par: norm(user?.email) })[0] || null;

/** Le brouillon de la personne, vide s'il n'existe pas encore. */
export function lire(user) {
  const b = sienDe(user);
  return { texte: b?.texte || '', maj_le: b?.maj_le || null, dernier_range: b?.dernier_range || null };
}

/** Écrit le brouillon tel quel (la page l'enregistre une seconde après la dernière frappe). */
export function ecrire(user, { texte = '', dernier_range } = {}, { maintenant = new Date() } = {}) {
  if (!user?.email) return { ok: false, error: 'Connexion requise.' };
  const t = String(texte ?? '').slice(0, LIMITE);
  const patch = { texte: t, maj_le: maintenant.toISOString() };
  // Ce qui vient d'être rangé, pour « Remettre » ; null l'oublie.
  if (dernier_range !== undefined) patch.dernier_range = dernier_range ? { texte: String(dernier_range.texte || '').slice(0, LIMITE), le: maintenant.toISOString(), envoye: !!dernier_range.envoye } : null;
  const b = sienDe(user);
  const r = b ? Records.update(ENTITE, b.id, patch) : Records.create(ENTITE, { par: norm(user.email), ...patch });
  return { ok: true, texte: r.texte, maj_le: r.maj_le, dernier_range: r.dernier_range || null };
}
