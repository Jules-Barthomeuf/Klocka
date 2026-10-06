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
import { analyseLoyer, equimmoxConfigure } from './equimmox.js';
import { valeurLocative as valeurLocativeDataB, dataBConfigure } from './data-b.js';

const ENTITE = 'ValeurLocativeRecherche';
// Version 2 (6 oct. 2026) : Equimmox lit les baux des commerces, plus les
// offres de bureaux ; les recherches d'avant ne se reprennent plus.
const VERSION = 2;
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
        du_cache: !!eq.du_cache,
      };
    } else if (dataB?.[cle] && (dataB[cle].basse != null || dataB[cle].haute != null)) {
      // Equimmox n'a rien constaté à ce rayon : l'estimation Data-B de la même
      // échelle prend la place, et le dit.
      const d = dataB[cle];
      const moyenne = d.basse != null && d.haute != null ? Math.round((d.basse + d.haute) / 2) : null;
      niveaux[cle] = { nom: d.nom || null, basse: d.basse ?? d.haute, moyenne, haute: d.haute ?? d.basse, rayon: null, source: 'Data-B', estime: true, du_cache: !!dataB.du_cache };
    } else {
      niveaux[cle] = null;
    }
  }
  const constate = ECHELLES.some(({ cle }) => niveaux[cle]?.source === 'Equimmox');
  const estimeDataB = ECHELLES.some(({ cle }) => niveaux[cle]?.source === 'Data-B');
  return {
    source: [constate && 'Equimmox · Analyse de loyer', estimeDataB && 'Data-B · Valeurs locatives'].filter(Boolean).join(' + ')
      || 'aucune source',
    unite: UNITE,
    adresse: adresse.label,
    rue: niveaux.rue,
    quartier: niveaux.quartier,
    ville: niveaux.ville,
    dvf: null,
    // L'estimation Data-B, entière et à part, même quand Equimmox a répondu.
    data_b: dataB ? { rue: dataB.rue || null, quartier: dataB.quartier || null, ville: dataB.ville || null, lien: dataB.lien || null, le: dataB.le || null } : null,
    constate,
  };
}

/**
 * La valeur locative d'une adresse.
 * @param {string} texte
 * @param {{forcer?: boolean, user?: object, surJalon?: Function}} opts
 * @returns {Promise<{ok: true, id, resultat: object, du_cache?: boolean} | {ok: false, error: string}>}
 */
export async function valeurLocative(texte, { forcer = false, user = null, surJalon = () => {} } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };

  const cle = cleDe(adresse.label);
  if (!forcer) {
    const recent = Records.filter(ENTITE, { cle })
      .filter((x) => x.version === VERSION && Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, id: recent.id, resultat: { ...recent.resultat, du_cache: true }, du_cache: true };
  }

  const erreurs = [];
  // Data-B d'abord : une page HTTP, quelques secondes, gardée trente jours.
  let dataB = null;
  if (dataBConfigure()) {
    surJalon('data-b');
    try {
      const d = await valeurLocativeDataB(adresse.label, { forcer, user });
      if (d.ok) dataB = d.resultat; else erreurs.push(`Data-B : ${d.error}`);
    } catch (e) { erreurs.push(`Data-B : ${e?.message || e}`); }
  }

  // Puis Equimmox, rayon par rayon : chaque lecture est gardée à part, une
  // panne sur l'un ne perd pas les autres.
  const equimmox = {};
  if (equimmoxConfigure()) {
    for (const { cle: echelle, rayon } of ECHELLES) {
      surJalon(echelle);
      try {
        const r = await analyseLoyer(adresse.label, { rayon, forcer, user });
        if (r.ok) equimmox[rayon] = r.resultat; else erreurs.push(`Equimmox ${rayon} m : ${r.error}`);
      } catch (e) { erreurs.push(`Equimmox ${rayon} m : ${e?.message || e}`); }
    }
  } else {
    erreurs.push("Equimmox n'est pas configuré.");
  }

  const resultat = { ...composer(adresse, equimmox, null, dataB), erreurs, le: new Date().toISOString(), par: user?.email || null };
  if (!resultat.rue && !resultat.quartier && !resultat.ville) {
    return { ok: false, error: `Aucune valeur locative lisible ici : ${erreurs.join(' ; ') || 'aucune source n\'a répondu'}.` };
  }
  const record = Records.create(ENTITE, { cle, version: VERSION, adresse: adresse.label, point: { lat: adresse.lat, lon: adresse.lon, code_insee: adresse.code_insee, ville: adresse.ville }, resultat, le: resultat.le, par: resultat.par }, user?.email);
  console.log(`[valeur-locative] ${adresse.label} : ${resultat.source}${user?.email ? ` — ${user.email}` : ''}`);
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
