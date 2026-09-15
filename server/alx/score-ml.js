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
// Les variables d'aujourd'hui se calculent dans score-ville.js, avec le code
// de l'entraînement ; la tranche du modèle y fait la pile, sous les
// knock-outs de classement.js, qui restent non négociables.

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
export function modeleDe(brut, features, { eta = 1 } = {}) {
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

    /**
     * Ce que chaque variable a ajouté ou retiré à la marge (en logit), par
     * attribution le long du chemin de chaque arbre (méthode de Saabas) :
     * à chaque nœud franchi, la variable du nœud reçoit l'écart entre le
     * poids du nœud suivant et celui du nœud courant. La somme des
     * contributions plus la base redonne exactement la marge : l'explication
     * ne raconte rien que le modèle n'ait calculé.
     *
     * Les poids des nœuds intérieurs (base_weights) sont écrits avant le taux
     * d'apprentissage, ceux des feuilles après : `eta` les remet à la même
     * échelle.
     */
    expliquer(nommees) {
      const valeurs = features.map((f) => {
        const v = nommees[f];
        return v == null || v === '' ? null : Number(v);
      });
      const contributions = Object.fromEntries(features.map((f) => [f, 0]));
      let base = biais;
      for (const arbre of arbres) {
        let nid = 0;
        const chemin = [0];
        while (arbre.left_children[nid] !== -1) {
          const v = valeurs[arbre.split_indices[nid]];
          const gauche = v == null || Number.isNaN(v) ? arbre.default_left[nid] : v < arbre.split_conditions[nid];
          nid = gauche ? arbre.left_children[nid] : arbre.right_children[nid];
          chemin.push(nid);
        }
        // Une feuille porte sa valeur déjà multipliée par le taux ; un nœud
        // intérieur, non. Sans ce rattrapage, la racine pèse vingt fois trop
        // et les contributions se compensent à ±10.
        const poids = (n) => (arbre.left_children[n] === -1 ? arbre.base_weights[n] : arbre.base_weights[n] * eta);
        base += poids(0);
        for (let i = 0; i < chemin.length - 1; i += 1) {
          const f = features[arbre.split_indices[chemin[i]]];
          contributions[f] += poids(chemin[i + 1]) - poids(chemin[i]);
        }
      }
      const marge = base + Object.values(contributions).reduce((t, c) => t + c, 0);
      return { proba: sigmoide(marge), base, contributions };
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
    const colonnes = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'modele-colonnes.json'), 'utf-8'));
    const { features } = colonnes;
    const resultats = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'resultats.json'), 'utf-8'));
    charge = {
      modele: modeleDe(brut, features, { eta: Number(resultats.metrics?.modele?.learning_rate) || 1 }),
      poids: resultats.poids,
      metrics: resultats.metrics,
      colonnes,
    };
  } catch {
    charge = { modele: null };
  }
  return charge.modele ? charge : null;
}
