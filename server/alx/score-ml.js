// Le score appris, dans l'application : lire le modèle XGBoost et le faire
// tourner sur une cible, sans Python.
//
// L'entraînement (ml/train_explainer.py) exporte le modèle au format JSON de
// XGBoost : une forêt d'arbres, chaque nœud une variable, un seuil, et une
// direction par défaut pour les valeurs manquantes. Ce module parcourt ces
// arbres — soixante lignes de descente, rien d'autre — et un fichier d'or
// généré à chaque entraînement garantit que la descente JavaScript rend la
// même probabilité que Python, au dix-millième.
//
// Le score qui en sort N'EST PAS le classement : les knock-outs de
// classement.js restent au-dessus, non négociables (un local vide, un
// usufruit, une activité exclue ne se rachètent pas par une probabilité).
// La formule hybride est :
//
//     score = proba du modèle × indice de confiance
//
// où la confiance est la part des variables RENSEIGNÉES, pondérée par leur
// importance : une probabilité posée sur des trous vaut moins qu'une posée
// sur du connu, et l'écran doit voir la différence.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.join(__dirname, 'data', 'ml');

const sigmoide = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

/**
 * Charge un modèle XGBoost depuis son JSON. Pure hormis la lecture : tout le
 * reste se teste sur un modèle fabriqué.
 * @param {object} brut - le JSON écrit par booster.save_model
 * @param {string[]} features - l'ordre des colonnes à l'entraînement
 */
export function modeleDe(brut, features) {
  const learner = brut.learner;
  const arbres = learner.gradient_booster.model.trees;
  const base = Number(learner.learner_model_param.base_score);
  // En classification logistique, le biais de départ est le logit du
  // base_score : c'est ainsi que XGBoost initialise sa marge.
  const biais = logit(Math.min(1 - 1e-7, Math.max(1e-7, base)));

  /** La descente d'un arbre : gauche/droite au seuil, côté par défaut au trou. */
  const descendre = (arbre, valeurs) => {
    let nid = 0;
    while (arbre.left_children[nid] !== -1) {
      const v = valeurs[arbre.split_indices[nid]];
      if (v == null || Number.isNaN(v)) {
        nid = arbre.default_left[nid] ? arbre.left_children[nid] : arbre.right_children[nid];
      } else {
        nid = v < arbre.split_conditions[nid] ? arbre.left_children[nid] : arbre.right_children[nid];
      }
    }
    // Une feuille garde sa valeur dans split_conditions : c'est le format.
    return arbre.split_conditions[nid];
  };

  return {
    features,
    /**
     * La probabilité pour un jeu de variables `{ nom: valeur | null }`.
     * Un nom absent vaut null : le trou suit la branche par défaut, comme à
     * l'entraînement.
     */
    predire(nommees) {
      const valeurs = features.map((f) => {
        const v = nommees[f];
        return v == null || v === '' ? null : Number(v);
      });
      let marge = biais;
      for (const arbre of arbres) marge += descendre(arbre, valeurs);
      return sigmoide(marge);
    },
  };
}

/**
 * L'indice de confiance d'un jeu de variables : la part renseignée, pondérée
 * par le poids global de chaque variable. 1 = tout est connu, 0 = tout est
 * trou. C'est le multiplicateur du score hybride.
 * @param {{feature: string, poids_pct: number}[]} poids - de model_global_weights
 */
export function confianceDe(nommees, poids) {
  const total = poids.reduce((t, p) => t + p.poids_pct, 0) || 1;
  const connu = poids.reduce((t, p) => t + (nommees[p.feature] != null ? p.poids_pct : 0), 0);
  return Math.round((connu / total) * 1000) / 1000;
}

// --- Le modèle de l'application, chargé une fois ----------------------------------

let charge = null;

/** Le scorer de l'application, ou null si aucun entraînement n'a été fait. */
export function scorer() {
  if (charge !== null) return charge.modele ? charge : null;
  try {
    const brut = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'modele.json'), 'utf-8'));
    const { features } = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'modele-colonnes.json'), 'utf-8'));
    const { poids } = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'resultats.json'), 'utf-8'));
    charge = { modele: modeleDe(brut, features), poids };
  } catch {
    charge = { modele: null };
  }
  return charge.modele ? charge : null;
}

/**
 * Le score hybride d'une cible ALX, avec ce qu'on sait d'elle aujourd'hui.
 * Chaque variable absente reste un trou — le modèle a appris à en faire
 * quelque chose, et la confiance dit combien il devine.
 *
 * Ce score est EXPÉRIMENTAL : il n'entre pas dans le classement en piles,
 * qui reste celui de classement.js et de ses knock-outs.
 */
export function scoreDeCible(cible, { rues = [] } = {}) {
  const s = scorer();
  if (!s) return null;
  const v = cible.valorisation || {};
  const p = cible.proprietaire || {};

  // Le rang de la rue parmi les rues classées de sa ville, en part.
  const k = String(cible.rue || '').toLowerCase();
  const triees = [...rues].filter((r) => r.commerces ?? r.vitrines).sort((a, b) => (b.commerces ?? b.vitrines) - (a.commerces ?? a.vitrines));
  const rang = triees.findIndex((r) => String(r.nom || '').toLowerCase() === k);
  const laRue = rang >= 0 ? triees[rang] : null;

  const gerants = (p.gerants || []).map((g) => {
    const m = String(g.tranche_age || '').match(/(\d+)\s*[-–]\s*(\d+)/);
    return m ? (Number(m[1]) + Number(m[2])) / 2 : /70|80|\+/.test(String(g.tranche_age || '')) ? 75 : null;
  }).filter((a) => a != null).sort((a, b) => a - b);

  const mutation = cible.mutation?.du_local ? cible.mutation : null;
  const moisDepuis = (iso) => (iso ? Math.round((Date.now() - Date.parse(iso)) / (30.44 * 86400000)) : null);
  const installation = moisDepuis(cible.societe?.creation || null);

  const nommees = {
    surface_bati: v.surface ?? (v.surface_estimee ? Math.round((v.surface_estimee[0] + v.surface_estimee[1]) / 2) : null),
    mois_depuis_mutation: moisDepuis(mutation?.date || null),
    deja_mute: mutation ? 1 : null,
    dernier_prix: mutation?.prix ?? null,
    achete_en_bloc: mutation ? (mutation.lots > 1 ? 1 : 0) : null,
    est_personne_morale: p.siren ? 1 : p.nom ? 0 : null,
    forme_sci: p.nom || p.forme ? (/\bSCI\b/i.test(`${p.forme || ''} ${p.nom || ''}`) ? 1 : 0) : null,
    taille_portefeuille: p.nb_biens ?? null,
    nb_locaux_proprio_parcelle: null,
    rez_de_chaussee_pm: null,
    detention_min_annees: cible.detention_annees ?? null,
    detention_censuree: null,
    nb_ventes_autres_24m: null,
    a_vendu_ailleurs_24m: null,
    vitrines_rue: laRue ? laRue.commerces ?? laRue.vitrines : null,
    rang_rue_part: rang >= 0 ? Math.round(((rang + 1) / triees.length) * 100) / 100 : null,
    procedures_rue_18m: cible.vitalite?.rue?.procedures ?? null,
    nb_vitrines_parcelle: null,
    mois_depuis_installation: installation,
    proximite_echeance_369: installation != null ? Math.min(installation % 36, 36 - (installation % 36)) : null,
    age_gerant: gerants.length ? gerants[Math.floor(gerants.length / 2)] : null,
  };

  const proba = s.modele.predire(nommees);
  const confiance = confianceDe(nommees, s.poids);
  return {
    proba: Math.round(proba * 1000) / 1000,
    confiance,
    score: Math.round(proba * confiance * 1000) / 1000,
    variables: nommees,
  };
}
