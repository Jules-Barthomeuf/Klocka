// L'adresse, résolue par la Base Adresse Nationale.
//
// Toutes les lectures de marché partent d'une adresse tapée par quelqu'un :
// c'est ici qu'elle devient un point, une rue, une commune et son code INSEE,
// gratuitement. Voir adresse.js pour le choix entre les propositions.

import { ErreurSource } from './marche/erreurs.js';
import { classer, redemanderSansCodePostal } from './adresse.js';

// --- L'adresse, résolue par la Base Adresse Nationale ------------------------------------
/**
 * @returns {Promise<{label, code_insee, numero, rue, ville, code_postal, departement, region, lat, lon, score}|null>}
 */
/** En deçà, la BAN a répondu mais ne connaît pas vraiment cette adresse. */
const SEUIL_BAN = 0.4;

/**
 * Les propositions de la BAN pour une question.
 *
 * « La BAN n'a pas répondu » et « la BAN ne connaît pas cette adresse » sont
 * deux choses différentes, et les confondre coûtait cher : les trois
 * collecteurs HTTP passent par ici, et un service d'adresses en panne les
 * faisait tous annoncer « adresse introuvable ». Une absence de donnée ne se
 * réessaie pas — la lecture de marché restait donc vide sans que personne ne
 * repasse. Une panne de transport est désormais une panne, et remonte comme
 * telle.
 */
export async function propositionsBan(q, limite = 8) {
  let r;
  try {
    r = await fetch(`https://api-adresse.data.gouv.fr/search/?limit=${limite}&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new ErreurSource(`La Base Adresse Nationale n'a pas répondu (${e?.message || e}).`, { service: 'BAN', cause: e });
  }
  if (!r.ok) throw new ErreurSource(`La Base Adresse Nationale a répondu ${r.status}.`, { service: 'BAN', statut: r.status });
  return ((await r.json()).features || []).map((f) => ({
    ...f.properties,
    lat: f.geometry?.coordinates?.[1],
    lon: f.geometry?.coordinates?.[0],
  }));
}

/**
 * L'adresse retenue, choisie parmi les propositions plutôt que prise au
 * sommet de la pile. Voir adresse.js : le type de voie tranche, et un code
 * postal erroné ne doit pas emporter la réponse vers une autre voie.
 */
export async function resoudreAdresse(texte) {
  const q = String(texte || '').trim();
  if (q.length < 4) return null;

  let classees = classer(q, await propositionsBan(q));
  let meilleur = classees.find((x) => (x.score ?? 0) >= SEUIL_BAN) || null;

  // Le code postal tapé ne mène à rien de fidèle : on repose la question sans
  // lui. Se tromper de code postal est plus courant que se tromper de rue.
  const sansCp = redemanderSansCodePostal(q, meilleur);
  if (sansCp) {
    const autres = classer(sansCp, await propositionsBan(sansCp));
    const autre = autres.find((x) => (x.score ?? 0) >= SEUIL_BAN) || null;
    if (autre && autre.note > (meilleur?.note ?? 0)) { meilleur = autre; classees = autres; }
  }

  // Là, en revanche, elle a bien répondu : elle ne connaît pas cette adresse.
  if (!meilleur) return null;
  const p = meilleur;
  // « 06, Alpes-Maritimes, Provence-Alpes-Côte d'Azur »
  const contexte = String(p.context || '').split(',').map((x) => x.trim());
  const k = p.concordance || {};
  return {
    label: p.label,
    // Le code INSEE de la commune : c'est lui qui adresse les pages du Figaro.
    code_insee: p.citycode || '',
    numero: p.housenumber || '',
    rue: p.street || p.name || '',
    ville: p.city || '',
    code_postal: p.postcode || '',
    departement: contexte[1] || '',
    region: contexte[2] || '',
    lat: p.lat,
    lon: p.lon,
    score: p.score,
    // De quoi dire à l'écran qu'on a peut-être compris autre chose que voulu :
    // un code postal qui ne colle pas, ou un mot demandé qu'on n'a pas retrouvé.
    ambigu: !!k.code_postal_contredit || (k.part ?? 1) < 1,
    code_postal_demande: k.code_postal_demande || null,
    alternatives: classees.filter((x) => x !== p).slice(0, 3).map((x) => ({ label: x.label, score: x.score })),
  };
}
