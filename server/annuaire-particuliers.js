// L'annuaire des particuliers (118000.fr, l'annuaire universel) : le numéro
// d'un propriétaire de murs chez lui, pas celui de son commerce.
//
// Apollo ne connaît que les professionnels en activité ; les propriétaires
// sont des particuliers, souvent retraités. L'annuaire universel publie ceux
// qui ne sont pas en liste rouge : on y cherche le nom, et on ne retient un
// numéro QUE si l'adresse colle à celle qu'on connaît déjà (le siège de la
// SCI, c'est-à-dire presque toujours le domicile). Jamais d'à-peu-près : un
// homonyme d'une autre ville ne donne pas son numéro.
//
// Une recherche par nom, mémorisée quatre-vingt-dix jours, quelques-unes par
// liste : le site est interrogé comme le ferait la personne, page par page.

import { Records } from './db.js';

const QUATRE_VINGT_DIX_JOURS = 90 * 86400000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const motsDe = (t) => new Set(norm(t).split(' ').filter((m) => m && !['m', 'mr', 'mme', 'monsieur', 'madame', 'saint', 'st', 'les', 'le', 'la', 'de', 'du', 'sur', 'sous'].includes(m)));

/** Pure : le JSON-LD de la page de résultats → des candidats propres. */
export function lireResultats(html) {
  const bloc = (String(html).match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/) || [])[1];
  if (!bloc) return [];
  let j;
  try { j = JSON.parse(bloc); } catch { return []; }
  const liste = (j['@graph'] || []).find((x) => x['@type'] === 'ItemList');
  return (liste?.itemListElement || [])
    .map((x) => x.item)
    .filter((it) => it?.telephone)
    .map((it) => ({
      nom: it.name || '',
      telephone: String(it.telephone).replace(/^\+33/, '0').replace(/[^\d]/g, ''),
      rue: it.address?.streetAddress || '',
      code_postal: it.address?.postalCode || '',
      ville: it.address?.addressLocality || '',
    }));
}

/**
 * Pure : le candidat retenu, ou null. Le nom du candidat (souvent le nom de
 * famille seul) doit être contenu dans le nom cherché ; puis l'adresse
 * tranche : même code postal, sinon même commune. Plusieurs candidats au
 * même endroit : seul celui dont la rue est celle du siège passe.
 */
export function choisirCandidat(candidats, { nom, code_postal = null, ville = null, rue = null }) {
  const cherche = motsDe(nom);
  const duNom = candidats.filter((c) => {
    const m = motsDe(c.nom);
    return m.size > 0 && [...m].every((x) => cherche.has(x));
  });
  const surPlace = duNom.filter((c) =>
    (code_postal && c.code_postal === String(code_postal)) || (ville && norm(c.ville) === norm(ville)));
  if (!surPlace.length) return null;
  if (surPlace.length === 1) return surPlace[0];
  const motsRue = motsDe(rue);
  const parRue = surPlace.filter((c) => { const m = motsDe(c.rue); return m.size && [...m].some((x) => motsRue.has(x)); });
  return parRue.length === 1 ? parRue[0] : null;
}

// L'annuaire bride les requêtes rapprochées : on espace chaque interrogation
// de deux à quatre secondes, au rythme d'une personne qui cherche à la main.
let dernierPassage = 0;
async function chercher(qui) {
  const cle = norm(qui);
  const deja = Records.filter('AnnuaireRecherche', { cle })[0];
  if (deja && Date.now() - Date.parse(deja.le) < QUATRE_VINGT_DIX_JOURS) return deja.candidats || [];
  const attente = dernierPassage + 2000 + Math.random() * 2000 - Date.now();
  if (attente > 0) await new Promise((f) => setTimeout(f, attente));
  dernierPassage = Date.now();
  const r = await fetch(`https://www.118000.fr/search?who=${encodeURIComponent(qui)}`, {
    headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9' },
    signal: AbortSignal.timeout(20000),
  });
  // 404 : l'annuaire ne connaît personne à ce nom. C'est une réponse (liste
  // vide, mémorisée comme les autres), pas une panne : la prendre pour une
  // panne faisait resservir les mêmes noms à chaque tour et bloquait la file.
  if (!r.ok && r.status !== 404) throw new Error(`L'annuaire a répondu ${r.status}.`);
  const candidats = r.status === 404 ? [] : lireResultats(await r.text());
  if (deja) Records.update('AnnuaireRecherche', deja.id, { candidats, le: new Date().toISOString() });
  else Records.create('AnnuaireRecherche', { cle, candidats, le: new Date().toISOString() });
  return candidats;
}

/** Pure : « 11 PLACE GARDON 71000 MACON » → { rue, code_postal, ville }. */
export function lireAdresse(adresse) {
  const m = String(adresse || '').match(/^(.*?)\s*(\d{5})\s+(.+)$/);
  return m ? { rue: m[1].trim(), code_postal: m[2], ville: m[3].trim() } : { rue: String(adresse || '').trim(), code_postal: null, ville: null };
}

/**
 * Le numéro d'une personne à une adresse connue. Deux recherches au plus :
 * « prénom nom », puis le nom de famille seul (les particuliers de
 * l'annuaire sont souvent au nom de famille sans prénom).
 */
export async function numeroDuParticulier({ prenom = null, nom, adresse }) {
  if (!String(nom || '').trim()) return null;
  const ou = lireAdresse(adresse);
  const essais = [...new Set([[prenom, nom].filter(Boolean).join(' ').trim(), String(nom).trim()])];
  for (const qui of essais) {
    const choix = choisirCandidat(await chercher(qui), { nom: [prenom, nom].filter(Boolean).join(' '), ...ou });
    if (choix) return { telephone: choix.telephone, nom: choix.nom, adresse: [choix.rue, choix.code_postal, choix.ville].filter(Boolean).join(' '), source: 'Pages Blanches (118000)' };
  }
  return null;
}
