// La valeur locative d'une adresse : la fourchette de loyer au m² de la rue,
// du quartier et de la ville, en euros HT HC par m² et par an.
//
// Un service payant vendait ces trois échelles, estimées par un algorithme qu'il ne
// décrivait pas. Elles se lisent désormais chez Equimmox, qui constate des
// baux signés, à trois rayons, les crans de son curseur : 200 m pour la rue,
// 500 m pour le quartier, 1 km pour la ville. Un constat vaut mieux qu'une
// estimation, et il n'y a plus de crédit. Chaque rayon est une recherche
// pilotée dans un navigateur, une minute environ, gardée trente jours : une
// adresse se lit une fois.
//
// Le loyer déduit des ventes DVF n'entre plus (6 oct. 2026, décision de
// Jules) : les loyers viennent d'Equimmox et de Data-B, nos sources, et de
// rien d'autre. Sans eux, la valeur locative reste vide et le dit.
//
// Data-B revient à côté (29 septembre 2026) : sa fourchette estimée de la
// rue, du quartier et de la ville, lue en HTTP en quelques secondes. Elle
// remplit une échelle qu'Equimmox n'a pas pu lire, et reste toujours visible
// à part (`data_b`) pour le recoupement.
//
// La forme rendue est celle que lisaient déjà les écrans et le projet :
// { rue, quartier, ville } × { nom, basse, haute }.

import { Records } from './db.js';
import { resoudreAdresse } from './adresse-ban.js';
import { analyseLoyerRayons, equimmoxConfigure } from './equimmox.js';
import { valeurLocative as valeurLocativeDataB, dataBConfigure } from './data-b.js';
import { referencesKlocka } from './loyers-klocka.js';
import { referencesMemoire } from './memoire/comparables.js';
import { actualiserReferences, indicesIlc } from './ilc.js';
import { sourceActive, poidsSource } from './socle/registre-sources.js';
import { valeurParComparables, ecartDataB, distanceM } from './valeur-locative-comparables.js';

// --- Les loyers Klocka autour d'une adresse (18 oct. 2026) -----------------------------------
// Les références du même département, géocodées une fois et gardées (AdresseResolue) : une
// adresse de dossier ne repasse pas par la BAN à chaque recherche.
const ADRESSES = 'AdresseResolue';

async function pointDe(ligne) {
  const cle = cleDe(ligne);
  const garde = Records.filter(ADRESSES, { cle })[0];
  if (garde) return garde.point;
  let point = null;
  try {
    const a = await resoudreAdresse(ligne);
    point = a ? { lat: a.lat, lon: a.lon, code_insee: a.code_insee, code_postal: a.code_postal, rue: a.rue } : null;
  } catch { return null; }
  Records.create(ADRESSES, { cle, ligne, point, le: new Date().toISOString() });
  return point;
}

/**
 * Pure : les loyers Klocka sans le local lui-même (12 nov. 2026, KFC Lyon : son propre loyer, 528 €/m², revenait comme
 * comparable quand Equimmox ne répondait pas). Un loyer à moins de 15 m de l'adresse, ou à la même adresse écrite,
 * est celui du dossier qu'on juge : il ne peut pas servir de marché.
 */
export function sansLuiMeme(refs, adresse) {
  const cle = cleDe(adresse?.label);
  return (refs || []).filter((r) => {
    const d = distanceM(r.point, adresse);
    if (d != null && d <= 15) return false;
    return !(cle && cleDe(r.adresse?.ligne) === cle);
  });
}

export async function referencesAutour(adresse) {
  const dep = String(adresse.code_postal || '').slice(0, 2);
  // La Mémoire Klocka (30 oct. 2026) : chaque fiche vue compte comme une fiche (klocka_fiche), vieillie par sa date.
  const refs = [...referencesKlocka(Records.list('Deal')), ...referencesMemoire(Records.list('BienMemoire'))].filter((r) => !dep || r.departement === dep || (!r.departement && r.adresse.ville && r.adresse.ville.toLowerCase() === String(adresse.ville || '').toLowerCase()));
  for (const r of refs) {
    if (!r.adresse.ligne) continue;
    r.point = await pointDe(r.adresse.ligne);
    if (r.point?.code_insee && !r.adresse.code_insee) r.adresse.code_insee = r.point.code_insee;
    if (r.point?.code_postal && !r.adresse.code_postal) r.adresse.code_postal = r.point.code_postal;
  }
  // Chaque loyer Klocka ramené au dernier ILC publié, depuis la date de son dossier (Equimmox, lui, est actuel).
  return actualiserReferences(sansLuiMeme(refs, adresse), await indicesIlc());
}

/** Pure : les lectures Equimmox par rayon, en références de la liste commune. */
export function equimmoxEnComparables(equimmox = {}) {
  const niveau = { 200: 'rue', 500: 'quartier', 1000: 'commune' };
  return Object.entries(equimmox)
    .filter(([, e]) => e && (e.moyenne != null || e.bas != null))
    .map(([rayon, e]) => ({ loyer_m2: e.moyenne ?? Math.round(((e.bas ?? e.haut) + (e.haut ?? e.bas)) / 2), bas: e.bas ?? null, haut: e.haut ?? null, niveau: niveau[rayon] || 'quartier', libelle: `Equimmox, baux à ${Number(rayon) >= 1000 ? `${Number(rayon) / 1000} km` : `${rayon} m`}`, le: e.le || null }));
}

/** Pure : l'adresse telle qu'écrite (« 12 rue de la République, 69002 Lyon »), sans point, quand la BAN ne répond pas. */
export function adresseTapee(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (t.length < 4) return null;
  const cp = t.match(/\b(\d{5})\b/)?.[1] || '';
  const [tete, ...reste] = t.split(',');
  const ville = (reste.join(',') || (cp ? t.slice(t.indexOf(cp) + 5) : '')).replace(/\b\d{5}\b/, '').trim();
  const voie = reste.length || !cp ? tete : tete.slice(0, tete.indexOf(cp));
  return { label: t, numero: (tete.match(/^\s*(\d+(?:\s*(?:bis|ter))?)/i)?.[1] || '').trim(), rue: voie.replace(/^\s*\d+\s*(?:bis|ter)?\s*/i, '').trim(), ville, code_postal: cp, code_insee: '', lat: null, lon: null, tapee: true };
}

const ENTITE = 'ValeurLocativeRecherche';
// Version 2 (6 oct. 2026) : Equimmox lit les baux des commerces, plus les
// offres de bureaux ; les recherches d'avant ne se reprennent plus.
// Version 3 (18 oct. 2026) : les loyers Klocka entrent, Data-B n'est plus affiché.
const VERSION = 3;
const CACHE_JOURS = 30;
export const UNITE = '€ HT HC / m² / an';

/** Les trois échelles, et le rayon Equimmox qui les lit. */
export const ECHELLES = [
  { cle: 'rue', rayon: 200 },
  { cle: 'quartier', rayon: 500 },
  { cle: 'ville', rayon: 1000 },
];

const cleDe = (label) => String(label || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * La lecture qui fait foi pour une adresse (12 nov. 2026, Jules : « une seule règle pour le Marché et la préanalyse ») :
 * la plus récente de la version en cours, de moins de trente jours. Le Marché, la préanalyse et le cache de la lecture
 * passent tous par ici. `avecEquimmox` : seulement une lecture qui a des chiffres d'Equimmox.
 */
export function derniereLecture(cle, { avecEquimmox = false, maintenant = Date.now(), jours = CACHE_JOURS } = {}) {
  return Records.filter(ENTITE, { cle: cleDe(cle) })
    .filter((x) => x.version === VERSION && maintenant - Date.parse(x.le) < jours * 86400000 && (!avecEquimmox || x.resultat?.constate))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0] || null;
}

/**
 * La dernière lecture Equimmox connue d'une adresse, jusqu'à un an : ce que le Loyer montre, daté, quand Equimmox ne
 * répond pas et qu'aucune lecture de moins de trente jours n'existe (12 nov. 2026, « fiable à 100 % »).
 */
export async function derniereLectureConnue(texte, { jours = 365 } = {}) {
  const directe = derniereLecture(texte, { avecEquimmox: true, jours });
  if (directe) return directe;
  const ban = await resoudreAdresse(texte).catch(() => null);
  return ban?.label ? derniereLecture(ban.label, { avecEquimmox: true, jours }) : null;
}

const OU = { rue: 'dans la rue', quartier: 'dans le quartier', ville: 'dans la ville' };

/**
 * Pure : le loyer de marché auquel on compare (12 nov. 2026, Jules) : l'échelle la plus proche lue (la rue à 200 m,
 * sinon le quartier à 500 m, sinon la ville à 1 km), et sa moyenne Equimmox, leur calcul sur les baux ; le milieu de
 * la fourchette seulement quand Equimmox ne donne pas de moyenne. Le Marché et la préanalyse jugent sur ce chiffre.
 */
export function loyerDeReference(resultat) {
  for (const echelle of ['rue', 'quartier', 'ville']) {
    const n = resultat?.[echelle];
    if (!n) continue;
    const milieu = n.basse != null && n.haute != null ? Math.round((n.basse + n.haute) / 2) : n.basse ?? n.haute ?? null;
    const m2 = n.moyenne > 0 ? n.moyenne : milieu;
    if (!(m2 > 0)) continue;
    return { echelle, ou: OU[echelle], niveau: n, m2, reference: n.moyenne > 0 ? 'moyenne' : 'milieu', bas: n.basse ?? null, haut: n.haute ?? null };
  }
  return null;
}

/**
 * Compose le résultat à partir des lectures. Pure : testée sans réseau.
 *
 * @param {{label, rue, ville}} adresse
 * @param {Object<number, {bas, moyenne, haut, rayon, du_cache}>} equimmox lectures par rayon
 * @param {null} _dvf plus lu : la place reste, pour les appels d'avant
 * @param {{rue, quartier, ville, lien}|null} dataB l'estimation Data-B, par échelle
 */
export function composer(adresse, equimmox = {}, _dvf = null, dataB = null) {
  const niveaux = {};
  for (const { cle, rayon } of ECHELLES) {
    const eq = equimmox[rayon];
    if (eq && (eq.bas != null || eq.haut != null)) {
      niveaux[cle] = {
        nom: cle === 'rue' ? adresse.rue || null : cle === 'ville' ? adresse.ville || null : `${rayon} m autour`,
        basse: eq.bas ?? eq.moyenne ?? null,
        moyenne: eq.moyenne ?? null,
        haute: eq.haut ?? eq.moyenne ?? null,
        rayon: eq.rayon || (rayon >= 1000 ? `${rayon / 1000} km` : `${rayon} m`),
        source: 'Equimmox',
        capture: eq.capture || null,
        du_cache: !!eq.du_cache,
      };
    } else {
      niveaux[cle] = null;
    }
  }
  const constate = ECHELLES.some(({ cle }) => niveaux[cle]?.source === 'Equimmox');
  return {
    source: constate ? 'Equimmox · Analyse de loyer' : 'aucune source',
    unite: UNITE,
    adresse: adresse.label,
    rue: niveaux.rue,
    quartier: niveaux.quartier,
    ville: niveaux.ville,
    dvf: null,
    // Data-B n'est plus affiché (18 oct. 2026, sortie de Data-B) : appelé en parallèle, son écart est gardé à part.
    data_b: null,
    constate,
  };
}

/**
 * La valeur locative d'une adresse.
 * @param {string} texte
 * @param {{forcer?: boolean, user?: object, surJalon?: Function}} opts
 * @returns {Promise<{ok: true, id, resultat: object, du_cache?: boolean} | {ok: false, error: string}>}
 */
export async function valeurLocative(texte, { forcer = false, user = null, surJalon = () => {}, attenteReessai = 10000 } = {}) {
  let adresse;
  // La Géoplateforme en panne n'arrête plus la lecture (12 nov. 2026, Jules : « pourquoi tu as besoin de
  // Géoplateforme ? ») : Equimmox se tape avec l'adresse telle qu'écrite ; seuls les loyers Klocka autour, qui
  // demandent un point, manquent.
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { adresse = adresseTapee(texte); if (!adresse) return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };

  const cle = cleDe(adresse.label);
  if (!forcer) {
    const recent = derniereLecture(cle);
    if (recent) return { ok: true, id: recent.id, resultat: { ...recent.resultat, du_cache: true }, du_cache: true };
  }

  const erreurs = [];
  // Data-B en parallèle, pour la comparaison seulement (18 oct. 2026, plan de la boîte à outils) :
  // son chiffre n'est jamais affiché, l'écart à la valeur retenue est gardé avec la recherche.
  const dataBEnCours = dataBConfigure() && sourceActive('data_b')
    ? valeurLocativeDataB(adresse.label, { forcer, user }).then((d) => (d.ok ? d.resultat : null)).catch(() => null)
    : Promise.resolve(null);

  // Puis Equimmox : les trois rayons dans une seule session (12 nov. 2026, « rapide »), chaque lecture gardée à part.
  // Un rayon qui échoue est repris une fois, dans une session neuve, dix secondes plus tard ; si Equimmox n'a proposé
  // aucune adresse, la rue est tapée sans son numéro (« fiable à 100 % », Jules).
  const equimmox = {};
  if (equimmoxConfigure() && sourceActive('equimmox')) {
    const ban = adresse.tapee ? null : adresse;
    const echelleDe = Object.fromEntries(ECHELLES.map((e) => [e.rayon, e.cle]));
    const lire = (rayons, o = {}) => analyseLoyerRayons(adresse.label, rayons, { forcer, user, ban, surRayon: (r) => surJalon(echelleDe[r]), ...o })
      .catch((e) => Object.fromEntries(rayons.map((r) => [r, { ok: false, error: e?.message || String(e) }])));
    const rayons = ECHELLES.map((e) => e.rayon);
    let lus = await lire(rayons);
    const manquants = rayons.filter((r) => !lus[r]?.ok);
    if (manquants.length) {
      const sansNumero = manquants.some((r) => /aucune adresse/i.test(lus[r]?.error || ''));
      await new Promise((ok) => setTimeout(ok, attenteReessai));
      const reprise = await lire(manquants, { sansNumero });
      lus = { ...lus, ...Object.fromEntries(manquants.map((r) => [r, reprise[r]?.ok ? { ...reprise[r], reessai: true } : { ok: false, error: `deux essais ; ${lus[r]?.error || 'pas de réponse'}${reprise[r]?.error && reprise[r].error !== lus[r]?.error ? ` puis ${reprise[r].error}` : ''}` }])) };
    }
    for (const r of rayons) {
      if (lus[r]?.ok) equimmox[r] = lus[r].resultat;
      else erreurs.push(`Equimmox ${r} m : ${lus[r]?.error || "pas de réponse"}`);
    }
  } else {
    erreurs.push(sourceActive('equimmox') ? "Equimmox n'est pas configuré." : 'Equimmox est coupé (Paramètres › Sources).');
  }

  // Les loyers des dossiers Klocka, en cercles autour de l'adresse, avec Equimmox dans la même liste.
  surJalon('klocka');
  let comparables = null;
  let loyers_reels = null;
  try {
    // Les poids du registre (Paramètres › Sources) ; une source coupée n'entre pas dans la liste.
    const poids = Object.fromEntries(['klocka_bail', 'klocka_fiche', 'equimmox'].map((k) => [k, poidsSource(k)]).filter(([, v]) => v != null));
    poids.klocka_saisi = poids.klocka_fiche;
    const refs = (adresse.lat == null ? [] : await referencesAutour(adresse)).filter((r) => sourceActive(r.origine === 'reel' ? 'klocka_bail' : 'klocka_fiche'));
    comparables = valeurParComparables(adresse, refs, equimmoxEnComparables(equimmox), { poids });
    // Le loyer de marché par les loyers réels (10 nov. 2026) : murs occupés en vente et loyers Klocka, moyenne
    // simple à 1 km ; calculé à côté, rien d'affiché ne change tant que la source reste coupée.
    if (sourceActive('murs_occupes')) {
      const { loyerDeMarche, loyersReelsGardes } = await import('./loyers-reels.js');
      const klocka = refs.filter((r) => r.point).map((r) => ({ ...r, source: r.origine === 'reel' ? 'klocka_bail' : 'klocka_fiche' }));
      loyers_reels = loyerDeMarche(adresse, [...(await loyersReelsGardes()), ...klocka]);
    }
  } catch (e) { erreurs.push(`Loyers Klocka : ${e?.message || e}`); }

  const resultat = { ...composer(adresse, equimmox, null, null), comparables, loyers_reels, valeur: comparables?.valeur ? { ...comparables.valeur, source: comparables.affichee, niveau: comparables.niveau, confiance: comparables.confiance } : null, erreurs, le: new Date().toISOString(), par: user?.email || null };
  // Equimmox en panne sur les trois rayons (12 nov. 2026, KFC Lyon : la Géoplateforme tombée, son autocomplétion muette) :
  // la lecture d'avant, qui avait ses chiffres, n'est pas remplacée par une lecture sans eux.
  if (!resultat.constate && erreurs.some((x) => x.startsWith('Equimmox'))) {
    const avant = derniereLecture(cle, { avecEquimmox: true });
    if (avant) return { ok: true, id: avant.id, resultat: { ...avant.resultat, du_cache: true, erreurs_relecture: erreurs }, du_cache: true };
  }
  if (!resultat.rue && !resultat.quartier && !resultat.ville && !resultat.valeur) {
    return { ok: false, error: `Aucune valeur locative lisible ici : ${erreurs.join(' ; ') || 'aucune source n\'a répondu'}.` };
  }
  const dataB = await dataBEnCours;
  const ecart_data_b = ecartDataB(resultat.valeur, dataB);
  const record = Records.create(ENTITE, { cle, version: VERSION, adresse: adresse.label, point: { lat: adresse.lat, lon: adresse.lon, code_insee: adresse.code_insee, ville: adresse.ville }, resultat, ecart_data_b, data_b_lu: dataB ? { rue: dataB.rue || null, quartier: dataB.quartier || null, ville: dataB.ville || null, le: dataB.le || null } : null, le: resultat.le, par: resultat.par }, user?.email);
  console.log(`[valeur-locative] ${adresse.label} : ${resultat.valeur ? `${resultat.valeur.source}, confiance ${resultat.valeur.confiance}` : resultat.source}${user?.email ? ` — ${user.email}` : ''}`);
  return { ok: true, id: record.id, resultat };
}

// --- La recherche en fond --------------------------------------------------
//
// Trois lectures Equimmox font quatre minutes : trop long pour une requête
// HTTP. On rend la main tout de suite et la page vient demander où ça en est,
// comme pour l'analyse de loyer d'Equimmox.

const travaux = new Map();
const PLAFOND_TRAVAUX = 50;

/** Démarre — ou retrouve — la recherche pour cette adresse. */
export function lancerValeurLocative(texte, opts = {}) {
  const cle = cleDe(texte);
  const enCours = travaux.get(cle);
  if (enCours?.etat === 'en_cours') return { cle, ...enCours };
  const travail = { etat: 'en_cours', jalon: 'adresse', resultat: null, id: null, erreur: null, depuis: new Date().toISOString() };
  travaux.set(cle, travail);
  if (travaux.size > PLAFOND_TRAVAUX) {
    for (const [k, t] of travaux) {
      if (t.etat !== 'en_cours') travaux.delete(k);
      if (travaux.size <= PLAFOND_TRAVAUX) break;
    }
  }
  valeurLocative(texte, { ...opts, surJalon: (j) => { travail.jalon = j; } })
    .then((r) => {
      travail.etat = r.ok ? 'pret' : 'erreur';
      travail.resultat = r.ok ? r.resultat : null;
      travail.id = r.ok ? r.id : null;
      travail.erreur = r.ok ? null : r.error;
    })
    .catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || String(e); });
  return { cle, ...travail };
}

/** Où en est une recherche lancée. */
export function etatValeurLocative(cle) {
  const t = travaux.get(String(cle || '').toLowerCase());
  return t ? { cle, ...t } : null;
}

/** Une recherche déjà en base, par identifiant, sans rien relancer. */
export function ouvrirValeurLocative(id) {
  const x = Records.get(ENTITE, id);
  return x?.resultat ? { ok: true, id, adresse: x.adresse, point: x.point || null, resultat: { ...x.resultat, du_cache: true } } : null;
}

/** Les dernières recherches gardées, une par adresse. */
export function listerValeursLocatives(limite = 40) {
  const vues = new Set();
  const liste = [];
  for (const x of Records.list(ENTITE).sort((a, b) => String(b.le).localeCompare(String(a.le)))) {
    if (vues.has(x.cle)) continue;
    vues.add(x.cle);
    liste.push({ id: x.id, adresse: x.adresse, le: x.le, par: x.par, rue: x.resultat?.rue || null, quartier: x.resultat?.quartier || null, ville: x.resultat?.ville || null, point: x.point || null });
    if (liste.length >= limite) break;
  }
  return liste;
}
