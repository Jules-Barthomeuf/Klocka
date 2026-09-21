// La rue et son tronçon, d'après le registre Sirene et OpenStreetMap.
//
// Sirene dit chaque établissement avec son activité, son adresse, son point
// et sa date de création ; OpenStreetMap dit le tracé de la rue, sa longueur
// et son type de voie. De là : combien de commerces la rue porte, par
// famille, depuis quand ; et sur cent mètres autour du numéro, qui est là,
// numéro par numéro, côté pair et côté impair.
//
// Les notes sur cinq suivent des seuils de nombre de commerces, écrits ici,
// et calés sur trois rapports archivés d'un service payant (server/data/marche/
// implantation-*.txt) : 13 commerces sur un tronçon faisaient « commerçant »
// (3/5), 19 et 33 « premium » (5/5).

import { cleRue, rueDe } from '../alx/commerces.js';
import { familleDe, parFamille, FAMILLES_COMMERCE } from './familles.js';
import { metres } from './geo.js';

export const RAYON_TRONCON = 100;

/** Les seuils du tronçon : [minimum de commerces, note, libellé]. */
export const SEUILS_TRONCON = [[18, 5, 'tronçon premium'], [14, 4, 'tronçon très commerçant'], [8, 3, 'tronçon commerçant'], [3, 2, 'tronçon peu commerçant'], [0, 1, 'tronçon résidentiel']];
/** Les seuils de la rue, par nombre de commerces en activité. */
export const SEUILS_RUE = [[40, 5, 'rue n°1'], [20, 4, 'rue très commerçante'], [10, 3, 'rue commerçante'], [4, 2, 'rue semi-commerçante'], [0, 1, 'rue peu commerçante']];

const noter = (n, seuils) => seuils.find(([min]) => n >= min) || seuils[seuils.length - 1];

/** Le numéro d'une adresse Sirene : « 49 RUE DABRAY 06000 NICE » donne 49. */
export function numeroDe(adresse) {
  const m = String(adresse || '').trim().match(/^(\d+)\s*(bis|ter|quater|[a-z])?\b/i);
  return m ? { n: Number(m[1]), libelle: m[2] ? `${m[1]} ${m[2].toLowerCase()}` : m[1] } : null;
}

/** L'ancienneté d'un commerce, par tranche : la lecture du renouvellement. */
export function trancheAnciennete(ouverture, aujourdhui = new Date()) {
  const t = Date.parse(ouverture || '');
  if (!Number.isFinite(t) || t < Date.parse('1901-01-01')) return null;
  const ans = (aujourdhui - t) / (365.25 * 86400000);
  return ans < 3 ? '0-3 ans' : ans < 6 ? '3-6 ans' : ans < 9 ? '6-9 ans' : '+ 9 ans';
}

/**
 * Les établissements de la rue : ceux du registre dont l'adresse porte ce
 * nom. Le registre écrit la voie sans son type (« DABRAY ») ; c'est l'adresse
 * recomposée (« 49 RUE DABRAY 06000 NICE ») qui redonne « Rue Dabray ». Pure.
 */
export function etablissementsDeLaRue(etablissements, nomRue) {
  const cle = cleRue(nomRue);
  if (!cle) return [];
  return (etablissements || []).filter((e) => {
    const rue = rueDe(e.adresse)?.rue || e.voie;
    return rue && cleRue(rue) === cle;
  });
}

/**
 * La rue : ses commerces en activité, par famille et par ancienneté, sa
 * longueur et sa note. Pure.
 * @param {Array} etablissements ceux de la rue, actifs et fermés récents
 * @param {{longueur_m?:number, type?:string}|null} osm la rue chez OpenStreetMap
 */
export function lireRue(etablissements, nomRue, osm = null, aujourdhui = new Date()) {
  const dansLaRue = etablissementsDeLaRue(etablissements, nomRue).map((e) => ({ ...e, famille: familleDe(e.activite) })).filter((e) => e.famille);
  const actifs = dansLaRue.filter((e) => e.etat === 'A');
  const commerces = actifs.filter((e) => FAMILLES_COMMERCE.has(e.famille));
  const tranches = ['0-3 ans', '3-6 ans', '6-9 ans', '+ 9 ans'].map((tranche) => ({ tranche, n: 0 }));
  for (const e of commerces) { const t = trancheAnciennete(e.ouverture, aujourdhui); const x = tranches.find((y) => y.tranche === t); if (x) x.n += 1; }
  const [, note, libelle] = noter(commerces.length, SEUILS_RUE);
  const fermes = dansLaRue.filter((e) => e.etat === 'F').length;
  return {
    nom: nomRue,
    commerces: commerces.length,
    entreprises: actifs.length,
    longueur_m: osm?.longueur_m ?? null,
    type_voie: osm?.type ?? null,
    familles: parFamille(actifs),
    anciennete: tranches.map((t) => ({ ...t, part: commerces.length ? Math.round((t.n / commerces.length) * 100) : 0 })),
    fermetures_recentes: fermes,
    note: { note, sur: 5 },
    libelle: `${commerces.length} commerce${commerces.length > 1 ? 's' : ''} - ${libelle}`,
    liste: actifs,
  };
}

/**
 * Le tronçon : cent mètres autour du point, numéro par numéro. Un numéro
 * sans commerce entre le premier et le dernier de son côté est une
 * habitation. Pure.
 */
export function lireTroncon(etablissementsDeLaRue, point, rayon = RAYON_TRONCON) {
  const proches = (etablissementsDeLaRue || [])
    .filter((e) => e.etat === 'A' && e.lat != null && e.lon != null && metres(point, e) <= rayon)
    .map((e) => ({ ...e, famille: e.famille || familleDe(e.activite), num: numeroDe(e.adresse) }))
    .filter((e) => e.famille && e.num);
  const commerces = proches.filter((e) => FAMILLES_COMMERCE.has(e.famille));
  const cotes = { pair: [], impair: [] };
  const parNumero = new Map();
  for (const e of proches) {
    const k = e.num.libelle;
    if (!parNumero.has(k)) parNumero.set(k, { numero: k, n: e.num.n, cote: e.num.n % 2 === 0 ? 'pair' : 'impair', commerces: [] });
    parNumero.get(k).commerces.push({ activite: e.activite_libelle || e.activite, enseigne: e.enseigne || e.nom || null, famille: e.famille, siret: e.siret });
  }
  for (const cote of ['pair', 'impair']) {
    const presents = [...parNumero.values()].filter((x) => x.cote === cote).sort((a, b) => a.n - b.n);
    if (!presents.length) continue;
    const pas = 2;
    for (let n = presents[0].n; n <= presents[presents.length - 1].n; n += pas) {
      const x = presents.find((y) => y.n === n);
      if (x) cotes[cote].push(...presents.filter((y) => y.n === n).map(({ numero, cote: c, commerces: cs }) => ({ numero, cote: c, commerces: cs })));
      else cotes[cote].push({ numero: String(n), cote, habitation: true, commerces: [] });
    }
  }
  const numeros = [...cotes.pair, ...cotes.impair];
  const bornes = proches.length ? { du: Math.min(...proches.map((e) => e.num.n)), au: Math.max(...proches.map((e) => e.num.n)) } : null;
  const [, note, libelle] = noter(commerces.length, SEUILS_TRONCON);
  return {
    troncon: { libelle: `${commerces.length} commerce${commerces.length > 1 ? 's' : ''} - ${libelle}`, note: { note, sur: 5 }, bornes, rayon_m: rayon, entreprises: proches.length },
    commerces_troncon: { numeros, total: commerces.length },
  };
}
