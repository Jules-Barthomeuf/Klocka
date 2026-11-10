// Valeur locative : la fourchette de loyer au m² d'une adresse, lue chez Equimmox, qui constate des baux
// signés, à trois rayons : la rue (200 m), le quartier (500 m), la ville (1 km), chacun en fourchette basse et
// haute, en euros HT HC par m² et par an. Trois lectures prennent trois à quatre minutes : la recherche part en
// tâche de fond et la page vient demander où elle en est. Chaque lecture se garde trente jours.
//
// Les fonctions pures de classement des IRIS (classes, indice de position) restent ici : la carte des quartiers
// n'est plus calculée (10 nov. 2026), elles servent encore aux tests et pourront resservir.

import { Records } from './db.js';
import { resoudreAdresse } from './adresse-ban.js';
import { composer, ECHELLES, ouvrirValeurLocative, listerValeursLocatives } from './valeur-locative.js';
import { analyseLoyer, analyseLoyerEnCache, equimmoxConfigure } from './equimmox.js';

export const NIVEAUX = ['tres_elevee', 'elevee', 'moyenne', 'tres_faible'];
export const LIBELLES_NIVEAU = {
  tres_elevee: 'Très élevée',
  elevee: 'Élevée / intermédiaire',
  moyenne: 'Moyenne / faible',
  tres_faible: 'Très faible',
};
// Les parts de chaque classe, du plus cher au moins cher : un cœur de ville
// étroit, une couronne, le gros de la commune, la périphérie.
const PARTS = { tres_elevee: 0.1, elevee: 0.2, moyenne: 0.45 };

/** Un nom sans accent, sans casse, sans ponctuation : pour comparer. */
export const normaliser = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── La géométrie, juste ce qu'il faut ───────────────────────────────────────

function dansAnneau(lon, lat, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]; const [xj, yj] = anneau[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Le point est-il dans la géométrie ? Les trous comptent. */
export function contient(geometry, lon, lat) {
  const polys = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  for (const anneaux of polys) {
    if (!anneaux?.length || !dansAnneau(lon, lat, anneaux[0])) continue;
    if (anneaux.slice(1).some((trou) => dansAnneau(lon, lat, trou))) continue;
    return true;
  }
  return false;
}

/** L'aire en km², par la formule du lacet, avec la longitude ramenée en mètres. */
export function aireKm2(geometry) {
  const polys = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  let total = 0;
  for (const anneaux of polys) {
    anneaux.forEach((anneau, k) => {
      const latMoy = anneau.reduce((s, p) => s + p[1], 0) / anneau.length;
      const kx = 111320 * Math.cos((latMoy * Math.PI) / 180); const ky = 111320;
      let a = 0;
      for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) a += anneau[j][0] * kx * anneau[i][1] * ky - anneau[i][0] * kx * anneau[j][1] * ky;
      total += (k === 0 ? 1 : -1) * Math.abs(a) / 2;
    });
  }
  return total / 1e6;
}

function centreDe(geometry) {
  const anneau = geometry?.type === 'MultiPolygon' ? geometry.coordinates?.[0]?.[0] : geometry?.coordinates?.[0];
  if (!anneau?.length) return null;
  return { lon: anneau.reduce((s, p) => s + p[0], 0) / anneau.length, lat: anneau.reduce((s, p) => s + p[1], 0) / anneau.length };
}

// ── Les classes ─────────────────────────────────────────────────────────────

/** La classe d'un quartier dont on a la fourchette, comparée à celle de la ville. */
export function classerParValeur(q, ville) {
  if (!q || (q.basse == null && q.haute == null)) return null;
  const mid = ((q.basse ?? q.haute) + (q.haute ?? q.basse)) / 2;
  if (!ville || (ville.basse == null && ville.haute == null)) return 'moyenne';
  const vb = ville.basse ?? ville.haute; const vh = ville.haute ?? ville.basse;
  if (mid >= vh) return 'tres_elevee';
  if (mid >= (vb + vh) / 2) return 'elevee';
  if (mid >= vb) return 'moyenne';
  return 'tres_faible';
}

/** Les classes de tous les secteurs, par quantiles de l'indice. Pure. */
export function classerParIndice(scores) {
  const tries = [...scores].filter((s) => s.score != null).sort((a, b) => b.score - a.score);
  const n = tries.length;
  const bornes = [Math.round(n * PARTS.tres_elevee), Math.round(n * (PARTS.tres_elevee + PARTS.elevee)), Math.round(n * (PARTS.tres_elevee + PARTS.elevee + PARTS.moyenne))];
  const par = {};
  tries.forEach((s, i) => { par[s.code_iris] = i < bornes[0] ? 'tres_elevee' : i < bornes[1] ? 'elevee' : i < bornes[2] ? 'moyenne' : 'tres_faible'; });
  return par;
}

/**
 * L'indice de position de chaque IRIS : densité de commerces et niveau de
 * vie, chacun ramené à son rang, puis pondérés. Pure : testée sans réseau.
 * @param {Array} iris       features GeoJSON
 * @param {Array} commerces  points [lon, lat]
 * @param {Array} carreaux   features Filosofi, avec ind et ind_snv
 */
export function indiceDe(iris, commerces, carreaux) {
  const lignes = (iris || []).map((f) => {
    const g = f.geometry;
    const aire = aireKm2(g) || null;
    let n = 0;
    for (const [lon, lat] of commerces || []) if (contient(g, lon, lat)) n++;
    let ind = 0; let snv = 0;
    for (const c of carreaux || []) {
      const ctr = centreDe(c.geometry);
      if (!ctr || !contient(g, ctr.lon, ctr.lat)) continue;
      ind += Number(c.properties?.ind) || 0; snv += Number(c.properties?.ind_snv) || 0;
    }
    return { code_iris: f.properties?.code_iris, nom_iris: f.properties?.nom_iris, commerces: n, densite: aire ? n / aire : null, niveau_de_vie: ind > 0 ? Math.round(snv / ind) : null };
  });
  const rang = (cle) => {
    const avec = lignes.filter((l) => l[cle] != null).sort((a, b) => a[cle] - b[cle]);
    const r = new Map(); avec.forEach((l, i) => r.set(l.code_iris, avec.length > 1 ? i / (avec.length - 1) : 0.5));
    return r;
  };
  const rd = rang('densite'); const rn = rang('niveau_de_vie');
  for (const l of lignes) {
    const d = rd.get(l.code_iris); const v = rn.get(l.code_iris);
    l.score = d == null ? null : v == null ? d : Math.round((0.65 * d + 0.35 * v) * 1000) / 1000;
  }
  return lignes;
}


/**
 * Attribue une classe à chaque IRIS. Pure : testée sans réseau.
 * @param {Array} iris        features GeoJSON de la commune
 * @param {Array} recherches  résultats déjà en base pour cette commune
 * @param {string|null} quartierIci le quartier de la recherche en cours
 * @param {object|null} indice l'indice de position de la commune
 */
export function colorerSecteurs(iris, recherches, quartierIci = null, indice = null) {
  const parQuartier = new Map();
  let ville = null;
  for (const r of recherches || []) {
    const q = r?.quartier;
    if (q?.nom && (q.basse != null || q.haute != null) && !parQuartier.has(normaliser(q.nom))) parQuartier.set(normaliser(q.nom), q);
    if (!ville && r?.ville && (r.ville.basse != null || r.ville.haute != null)) ville = r.ville;
  }
  const classes = classerParIndice(indice?.secteurs || []);
  const details = new Map((indice?.secteurs || []).map((s) => [s.code_iris, s]));
  const ici = normaliser(quartierIci);
  return (iris || []).map((f) => {
    const p = f.properties || {};
    const nom = p.nom_iris || '';
    const q = parQuartier.get(normaliser(nom));
    const d = details.get(p.code_iris);
    return {
      code_iris: p.code_iris,
      nom_iris: nom,
      basse: q?.basse ?? null,
      haute: q?.haute ?? null,
      niveau: q ? classerParValeur(q, ville) : classes[p.code_iris] || null,
      origine: q ? 'quartier' : classes[p.code_iris] ? 'indice' : null,
      commerces: d?.commerces ?? null,
      niveau_de_vie: d?.niveau_de_vie ?? null,
      ici: !!ici && normaliser(nom) === ici,
      geometry: f.geometry,
    };
  });
}

// ── La recherche : Equimmox, et rien d'autre ───────────────────────────────
//
// 10 nov. 2026, Jules : « je veux juste que ça aille sur Equimmox, que ça fasse la recherche puis retourne les
// résultats ». L'outil lit Equimmox à ses trois rayons (200 m la rue, 500 m le quartier, 1 km la ville) et rend
// les fourchettes. Ni loyers Klocka, ni Data-B, ni carte des IRIS (elle demandait OpenStreetMap et l'INSEE, et
// tombait avec eux). La valeur locative de l'avis et du projet (valeur-locative.js) ne change pas : elle reste la
// sienne, ses recherches ne se mélangent pas à celles-ci.

const ENTITE = 'ValeurLocativeEquimmox';
const CACHE_JOURS = 30;
const travaux = new Map();
const PLAFOND_TRAVAUX = 50;
const cleDe = (label) => String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();
const pointDe = (adresse) => ({ lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee, ville: adresse.ville });

/** Les trois lectures Equimmox d'une adresse, composées et gardées. */
async function lireEquimmox(adresse, { forcer = false, user = null, surJalon = () => {} } = {}) {
  if (!equimmoxConfigure()) return { ok: false, error: "Equimmox n'est pas configuré : EQUIMMOX_EMAIL et EQUIMMOX_MOT_DE_PASSE manquent." };
  const equimmox = {};
  const erreurs = [];
  for (const { cle, rayon } of ECHELLES) {
    surJalon(cle);
    try {
      const r = await analyseLoyer(adresse.label, { rayon, forcer, user });
      if (r.ok) equimmox[rayon] = r.resultat; else erreurs.push(`Equimmox ${rayon} m : ${r.error}`);
    } catch (e) { erreurs.push(`Equimmox ${rayon} m : ${e?.message || e}`); }
  }
  const resultat = { ...composer(adresse, equimmox), erreurs, le: new Date().toISOString(), par: user?.email || null };
  if (!resultat.rue && !resultat.quartier && !resultat.ville) return { ok: false, error: `Equimmox n'a rien rendu ici : ${erreurs.join(' ; ') || 'aucune lecture'}.` };
  const x = Records.create(ENTITE, { cle: cleDe(adresse.label), adresse: adresse.label, point: pointDe(adresse), resultat, le: resultat.le, par: resultat.par }, user?.email);
  return { ok: true, id: x.id, resultat };
}

/** Les dernières recherches, une par adresse : celles d'Equimmox, puis celles d'avant. */
export function listerRecherches(limite = 40) {
  const vues = new Set();
  const liste = [];
  // 10 nov. 2026, Jules : écran d'arrivée. La colonne « Lue » dit « Jules · date » : le prénom de qui a cherché.
  const prenoms = new Map(Records.list('User').map((u) => [String(u.email || '').toLowerCase(), String(u.full_name || '').trim().split(/\s+/)[0]]));
  const prenomDe = (email) => (email ? prenoms.get(String(email).toLowerCase()) || String(email).split('@')[0] : null);
  const ajouter = (x, origine) => {
    const cle = normaliser(x.adresse);
    if (vues.has(cle) || liste.length >= limite) return;
    vues.add(cle);
    liste.push({ id: x.id, adresse: x.adresse, le: x.le, par: x.par, par_nom: prenomDe(x.par), rue: x.rue ?? x.resultat?.rue ?? null, quartier: x.quartier ?? x.resultat?.quartier ?? null, ville: x.ville ?? x.resultat?.ville ?? null, origine });
  };
  for (const x of Records.list(ENTITE).sort((a, b) => String(b.le).localeCompare(String(a.le)))) ajouter(x, 'equimmox');
  for (const x of listerValeursLocatives(limite)) ajouter(x, 'valeur-locative');
  for (const x of Records.list('DataBRecherche').sort((a, b) => String(b.le).localeCompare(String(a.le)))) if (x.resultat?.rue || x.resultat?.quartier) ajouter(x, 'ancienne');
  return liste;
}

/**
 * Une recherche. Si les trois rayons sont déjà lus (trente jours), le résultat revient tout de suite. Sinon les
 * lectures partent en tâche de fond (une minute par rayon) et l'on rend la clé : la page demande l'état.
 */
export async function rechercher(texte, { forcer = false, user = null } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const cle = cleDe(adresse.label);
  if (!forcer) {
    const garde = Records.filter(ENTITE, { cle }).filter((x) => Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (garde) return { ok: true, id: garde.id, resultat: { ...garde.resultat, du_cache: true }, point: pointDe(adresse), secteurs: [] };
  }
  if (!forcer && ECHELLES.every(({ rayon }) => analyseLoyerEnCache(adresse.label, null, rayon))) {
    const r = await lireEquimmox(adresse, { user });
    if (!r.ok) return r;
    return { ok: true, id: r.id, resultat: { ...r.resultat, du_cache: true }, point: pointDe(adresse), secteurs: [] };
  }
  const enCours = travaux.get(cle);
  if (enCours?.etat !== 'en_cours') {
    const travail = { etat: 'en_cours', jalon: 'rue', id: null, erreur: null, depuis: new Date().toISOString() };
    travaux.set(cle, travail);
    if (travaux.size > PLAFOND_TRAVAUX) for (const [k, t] of travaux) { if (travaux.size <= PLAFOND_TRAVAUX) break; if (t.etat !== 'en_cours') travaux.delete(k); }
    lireEquimmox(adresse, { forcer, user, surJalon: (j) => { travail.jalon = j; } })
      .then((r) => { travail.etat = r.ok ? 'pret' : 'erreur'; travail.id = r.ok ? r.id : null; travail.erreur = r.ok ? null : r.error; })
      .catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || String(e); });
  }
  const t = travaux.get(cle);
  return { ok: true, en_cours: true, cle, jalon: t.jalon, point: pointDe(adresse) };
}

/** Où en est une recherche partie en tâche de fond ; prête, elle revient entière. */
export async function etat(cle) {
  const t = travaux.get(String(cle || '').toLowerCase());
  if (!t) return { ok: false, error: 'Aucune recherche en cours sous cette clé.' };
  if (t.etat === 'en_cours') return { ok: true, en_cours: true, jalon: t.jalon, depuis: t.depuis };
  if (t.etat === 'erreur') return { ok: false, error: t.erreur || 'La recherche a échoué.' };
  return ouvrir(t.id);
}

/** Rouvre une recherche passée, sans rien relancer. Celles d'avant Equimmox seul restent lisibles. */
export async function ouvrir(id) {
  const x = Records.get(ENTITE, id) || ouvrirValeurLocative(id) || Records.get('DataBRecherche', id);
  if (!x?.resultat) return { ok: false, error: 'Cette recherche n\'existe plus.' };
  return { ok: true, id, resultat: { ...x.resultat, du_cache: true }, point: x.point ? { ...x.point, label: x.point.label || x.adresse } : null, secteurs: [] };
}
