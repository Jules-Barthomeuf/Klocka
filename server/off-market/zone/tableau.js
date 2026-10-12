// Off-market, mode Simple : ce que montre la page admin « Modèle Zone »
// (11 oct. 2026). Le nombre de jugements, leur répartition par verdict et par
// raison, la version active, les cinq dernières versions, les poids ou
// coefficients et leur évolution, et les vingt derniers désaccords entre le
// score affiché et le jugement.

import { Records } from '../../db.js';
import { COMMERCE } from '../simple.js';
import { nomLisible, rueLisible } from '../casse.js';
import { CONFIG, POIDS_INITIAUX } from './score.js';
import { JOURNAL, JUGEMENT, exemplesExploitables, modeleActif, versions } from './modele.js';
import { RAISONS, VERDICTS } from './raisons.js';

/** Pure : un désaccord : le score affiché disait l'inverse du jugement. 50 tout rond n'est ni l'un ni l'autre. */
export const desaccord = (j) => j.score_affiche != null && ((j.verdict === 'interessant' && j.score_affiche < 50) || (j.verdict === 'pas_interessant' && j.score_affiche > 50));

/** Pure : les coefficients d'une régression, regroupés par caractéristique d'origine. */
export function coefficientsParCle(parametres) {
  const enc = parametres?.encodage;
  if (!enc) return {};
  const noms = [...enc.num.map((n) => n.cle), ...['type_voie', 'naf_section'].flatMap((c) => (enc.cat[c] || []).map((v) => `${c} = ${v}`))];
  return Object.fromEntries(noms.map((n, j) => [n, Math.round((parametres.coefficients[j] || 0) * 1000) / 1000]));
}

export function tableauModele() {
  const tous = Records.list(JUGEMENT).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const parVerdict = Object.fromEntries(Object.keys(VERDICTS).map((v) => [v, tous.filter((j) => j.verdict === v).length]));
  const parRaison = Object.fromEntries(Object.keys(RAISONS).map((r) => [r, tous.filter((j) => (j.raisons || []).includes(r)).length]));
  const actif = modeleActif();
  const journal = Records.list(JOURNAL).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  // L'évolution des poids de la version à règles : la valeur de départ, puis après chaque ajustement (les 60 derniers).
  const ajustements = journal.filter((j) => j.type === 'ajustement').slice(0, 60).reverse();
  const evolution = {};
  for (const a of ajustements) for (const c of a.changements || []) (evolution[c.cle] ||= []).push({ le: a.le, valeur: c.apres });
  const regles = versions().find((m) => m.type === 'regles');
  const nomsCommerces = new Map();
  const nomDe = (id) => {
    if (!nomsCommerces.has(id)) { const c = Records.get(COMMERCE, id); nomsCommerces.set(id, c ? { nom: nomLisible(c.enseigne || c.nom), adresse: rueLisible(c.adresse), ville_id: c.ville_id } : null); }
    return nomsCommerces.get(id);
  };
  return {
    jugements: { total: tous.length, exploitables: exemplesExploitables(tous).length, par_verdict: parVerdict, par_raison: parRaison, pour_apprendre: CONFIG.jugements_pour_apprendre },
    actif: { version: actif.version, type: actif.type, active_depuis: actif.active_depuis || null, nb_exemples: actif.nb_exemples },
    versions: versions().slice(0, 5).map((m) => ({ id: m.id, version: m.version, type: m.type, actif: !!m.actif, trained_at: m.trained_at, nb_exemples: m.nb_exemples, metriques: m.metriques || {} })),
    poids: regles ? Object.entries(regles.parametres.poids).map(([cle, valeur]) => ({ cle, depart: POIDS_INITIAUX[cle], valeur, raison: CONFIG.poids[cle]?.raison || null, evolution: evolution[cle] || [] })) : [],
    coefficients: actif.type === 'logistique' ? coefficientsParCle(actif.parametres) : null,
    desaccords: tous.filter(desaccord).slice(0, 20).map((j) => ({ id: j.id, point_id: j.point_id, ville_id: j.ville_id, commerce: nomDe(j.point_id), verdict: j.verdict, score_affiche: j.score_affiche, version: j.model_version, commentaire: j.commentaire, raisons: j.raisons, par: j.user_id, le: j.created_at })),
    journal: journal.filter((j) => j.type !== 'ajustement').slice(0, 20),
    raisons: RAISONS,
    verdicts: VERDICTS,
  };
}
