// La valeur locative d'une adresse : la fourchette de loyer au m² de la rue,
// du quartier et de la ville, en euros HT HC par m² et par an.
//
// Data-B vendait ces trois échelles, estimées par un algorithme qu'il ne
// décrivait pas. Elles se lisent désormais chez Equimmox, qui constate des
// baux signés, à trois rayons, les crans de son curseur : 200 m pour la rue,
// 500 m pour le quartier, 1 km pour la ville. Un constat vaut mieux qu'une
// estimation, et il n'y a plus de crédit. Chaque rayon est une recherche
// pilotée dans un navigateur, une minute environ, gardée trente jours : une
// adresse se lit une fois.
//
// En complément, et en repli quand Equimmox n'est pas configuré, le loyer
// DÉDUIT des ventes DVF au taux de rendement (loyer-dvf.js). Il est marqué
// comme tel, jusque sur l'écran : une déduction n'est pas un bail.
//
// La forme rendue est celle que lisaient déjà les écrans et le projet :
// { rue, quartier, ville } × { nom, basse, haute }.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { analyseLoyer, equimmoxConfigure } from './equimmox.js';
import { loyerDvf } from './loyer-dvf.js';

const ENTITE = 'ValeurLocativeRecherche';
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
 * @param {{basse, moyenne, haute, n, rayon, prix_m2}|null} dvf le loyer déduit des ventes
 */
export function composer(adresse, equimmox = {}, dvf = null) {
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
    } else {
      niveaux[cle] = null;
    }
  }
  // Sans Equimmox, le quartier prend le loyer déduit des ventes, et le dit.
  if (!niveaux.quartier && dvf) {
    niveaux.quartier = { nom: `${dvf.rayon} autour`, basse: dvf.basse, moyenne: dvf.moyenne, haute: dvf.haute, rayon: dvf.rayon, source: 'DVF, déduit', derive: true };
  }
  const constate = ECHELLES.some(({ cle }) => niveaux[cle]?.source === 'Equimmox');
  return {
    source: constate ? 'Equimmox · Analyse de loyer' : dvf ? 'DVF · prix des murs × taux de rendement' : 'aucune source',
    unite: UNITE,
    adresse: adresse.label,
    rue: niveaux.rue,
    quartier: niveaux.quartier,
    ville: niveaux.ville,
    // Le loyer déduit des ventes, toujours à part : c'est le second regard,
    // celui qui dit si le constat et le marché des murs racontent la même chose.
    dvf: dvf ? { basse: dvf.basse, moyenne: dvf.moyenne, haute: dvf.haute, rayon: dvf.rayon, n: dvf.n, prix_m2: dvf.prix_m2, taux: dvf.taux, lien: dvf.lien } : null,
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
      .filter((x) => Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, id: recent.id, resultat: { ...recent.resultat, du_cache: true }, du_cache: true };
  }

  const erreurs = [];
  // Le loyer déduit des ventes d'abord : une seconde, et il sert de repli.
  surJalon('dvf');
  let dvf = null;
  try {
    const d = await loyerDvf(adresse.label, { user });
    if (d.ok) dvf = d.resultat; else erreurs.push(`DVF : ${d.error}`);
  } catch (e) { erreurs.push(`DVF : ${e?.message || e}`); }

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
    erreurs.push("Equimmox n'est pas configuré : seule la déduction DVF est disponible.");
  }

  const resultat = { ...composer(adresse, equimmox, dvf), erreurs, le: new Date().toISOString(), par: user?.email || null };
  if (!resultat.rue && !resultat.quartier && !resultat.ville) {
    return { ok: false, error: `Aucune valeur locative lisible ici : ${erreurs.join(' ; ') || 'aucune source n\'a répondu'}.` };
  }
  const record = Records.create(ENTITE, { cle, adresse: adresse.label, point: { lat: adresse.lat, lon: adresse.lon, code_insee: adresse.code_insee, ville: adresse.ville }, resultat, le: resultat.le, par: resultat.par }, user?.email);
  console.log(`[valeur-locative] ${adresse.label} : ${resultat.constate ? 'Equimmox' : 'DVF seul'}${user?.email ? ` — ${user.email}` : ''}`);
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
