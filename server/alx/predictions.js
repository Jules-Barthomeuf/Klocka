// Le journal des prédictions : ce qu'ALX a dit, quand, et ce qui est arrivé.
//
// Sans ceci, dans un an on ne saura toujours pas si les signaux ont raison.
// Chaque fois qu'une cible change de lecture (sa pile, ses signaux, son
// score), la lecture est figée ici avec sa date : la pile, chaque signal et
// son poids, les drapeaux, la version des règles. On ne la modifie plus.
//
// Plus tard, DVF dit si les murs se sont vendus (une mutation du local datée
// après la prédiction), et le suivi des approches dit si le propriétaire a
// répondu oui. C'est la confrontation : par pile, quelle part s'est réalisée,
// et au bout de combien de mois. Le taux de base à battre est de 3 à 5 % par
// an, et un classement vaut ce qu'il fait par rapport à ce chiffre.
//
// Pendant la lecture d'une cible, les connecteurs arrivent en rafale (le
// propriétaire, puis le BODACC, puis DVF) et la pile bouge trois fois en une
// minute : une prédiction encore chaude est mise à jour en place, pas
// doublée. Passé une heure, une nouvelle lecture fait une nouvelle ligne.

import { Records } from '../db.js';
import { REGLES } from './classement.js';

const CHAUDE_MS = 60 * 60 * 1000;
const MOIS_MS = 30.44 * 24 * 3600 * 1000;
/** Une prédiction se juge après au moins douze mois : avant, rien n'a eu le temps d'arriver. */
export const DELAI_VERIFIABLE_MOIS = 12;

const cles = (liste) => (liste || []).map((s) => s.cle).sort();

/**
 * La dernière prédiction d'une cible. La cible en garde l'identifiant : un
 * accès direct, pas un balayage de toute la table à chaque reclassement.
 */
export function dernierePrediction(c) {
  if (c?.derniere_prediction_id) {
    const p = Records.get('Prediction', c.derniere_prediction_id);
    if (p) return p;
  }
  return c?.id ? Records.filter('Prediction', { cible_id: c.id }, { sort: '-le', limit: 1 })[0] || null : null;
}

/** Ce qui fait qu'une lecture est la même qu'une autre. */
export function signatureDe(c) {
  return [c.pile, cles(c.signaux?.forts).join('+'), cles(c.signaux?.patients).join('+'), cles(c.drapeaux).join('+'), cles(c.knock_outs).join('+'), c.score?.total ?? '', c.score_ml?.tranche?.cle ?? ''].join('|');
}

/**
 * Fige la lecture d'une cible, ou met à jour celle qui est encore chaude.
 * @param {object} c - la cible, telle que reclasser() vient de l'écrire
 * @param {{maintenant?: number}} [opts]
 */
export function figerPrediction(c, { maintenant: now = Date.now() } = {}) {
  if (!c?.id || !c.pile) return null;
  const signature = signatureDe(c);
  const derniere = dernierePrediction(c);
  if (derniere && derniere.signature === signature) return derniere;

  const ligne = {
    cible_id: c.id,
    ville_id: c.ville_id || null,
    ville: c.ville || null,
    rue: c.rue || null,
    adresse: c.adresse || null,
    enseigne: c.enseigne || null,
    le: new Date(now).toISOString(),
    pile: c.pile,
    score: c.score?.total ?? null,
    contributions: (c.score?.contributions || []).map((x) => ({ cle: x.cle, poids: x.poids, valeur: x.valeur || null })),
    signaux: [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((s) => ({ cle: s.cle, valeur: s.valeur || null, poids: s.poids ?? null })),
    drapeaux: cles(c.drapeaux),
    knock_outs: cles(c.knock_outs),
    motif: c.motif || null,
    regles_version: REGLES.version,
    signature,
    // Ce que l'avenir dira. Vide tant qu'on ne sait pas.
    realisee: null,
    realisee_le: null,
    delai_mois: null,
    reponse_oui: null,
    verifiee_le: null,
  };

  // Encore chaude, et personne ne l'a encore vérifiée : la même lecture qui se précise.
  const figee = derniere && !derniere.verifiee_le && now - new Date(derniere.le).getTime() < CHAUDE_MS
    ? Records.update('Prediction', derniere.id, { ...ligne, le: derniere.le })
    : Records.create('Prediction', ligne);
  if (c.derniere_prediction_id !== figee.id) Records.update('Cible', c.id, { derniere_prediction_id: figee.id });
  return figee;
}

/**
 * Confronte une prédiction à ce qu'on sait aujourd'hui de la cible : une
 * mutation du local datée après la prédiction, ou un oui du propriétaire.
 * Rend la prédiction mise à jour.
 */
export function verifierPrediction(p, c, { maintenant: now = Date.now() } = {}) {
  if (!p || !c) return p;
  const jourP = String(p.le).slice(0, 10);
  const m = c.mutation || null;
  const vendu = !!(m && m.du_local && m.date && String(m.date).slice(0, 10) > jourP);
  const oui = Records.filter('Approche', { cible_id: c.id }).some((a) => a.issue === 'oui' && a.reponse_le && String(a.reponse_le) > p.le);
  const patch = {
    verifiee_le: new Date(now).toISOString(),
    realisee: vendu,
    realisee_le: vendu ? String(m.date).slice(0, 10) : null,
    delai_mois: vendu ? Math.round((new Date(m.date).getTime() - new Date(p.le).getTime()) / MOIS_MS) : null,
    reponse_oui: oui,
  };
  return Records.update('Prediction', p.id, patch);
}

/**
 * Vérifie toutes les prédictions assez vieilles pour l'être. Sans relire DVF
 * (relire = null), on confronte à ce que la cible porte déjà ; avec relire,
 * la fonction reçoit l'identifiant de la cible et va chercher la mutation.
 */
export async function verifierToutes({ relire = null, maintenant: now = Date.now(), journal = () => {} } = {}) {
  const limite = now - DELAI_VERIFIABLE_MOIS * MOIS_MS;
  const anciennes = Records.list('Prediction').filter((p) => new Date(p.le).getTime() <= limite);
  const parCible = new Map();
  for (const p of anciennes) { if (!parCible.has(p.cible_id)) parCible.set(p.cible_id, []); parCible.get(p.cible_id).push(p); }
  let verifiees = 0, realisees = 0, relues = 0;
  for (const [cibleId, liste] of parCible) {
    let c = Records.get('Cible', cibleId);
    if (!c) continue;
    if (relire) {
      try { const r = await relire(cibleId); if (r?.cible) { c = r.cible; relues += 1; } } catch (e) { journal(`${c.adresse} : DVF non relu (${e.message}).`); }
    }
    for (const p of liste) {
      const maj = verifierPrediction(p, c, { maintenant: now });
      verifiees += 1;
      if (maj.realisee) realisees += 1;
    }
  }
  journal(`${verifiees} prédictions vérifiées${relire ? ` (${relues} cibles relues sur DVF)` : ''}, ${realisees} réalisées.`);
  return { verifiees, realisees, relues };
}

const taux = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);

/**
 * Le bilan des prédictions : combien figées, combien vérifiables, combien
 * réalisées, par pile et par signal. Les lignes trop jeunes ne comptent pas
 * dans les taux : elles n'ont pas encore eu le temps d'avoir tort.
 */
export function bilanPredictions({ maintenant: now = Date.now() } = {}) {
  const toutes = Records.list('Prediction');
  const limite = now - DELAI_VERIFIABLE_MOIS * MOIS_MS;
  const verifiables = toutes.filter((p) => new Date(p.le).getTime() <= limite);
  const verifiees = verifiables.filter((p) => p.verifiee_le);
  const groupe = (liste, cleDe) => {
    const out = new Map();
    for (const p of liste) {
      for (const k of cleDe(p)) {
        const e = out.get(k) || { cle: k, figees: 0, verifiees: 0, realisees: 0, oui: 0 };
        e.figees += 1;
        if (p.verifiee_le) { e.verifiees += 1; if (p.realisee) e.realisees += 1; if (p.reponse_oui) e.oui += 1; }
        out.set(k, e);
      }
    }
    return [...out.values()].map((e) => ({ ...e, taux_realisation: taux(e.realisees, e.verifiees) })).sort((a, b) => b.figees - a.figees);
  };
  return {
    figees: toutes.length,
    verifiables: verifiables.length,
    verifiees: verifiees.length,
    realisees: verifiees.filter((p) => p.realisee).length,
    taux_realisation: taux(verifiees.filter((p) => p.realisee).length, verifiees.length),
    plus_ancienne: toutes.length ? toutes.map((p) => p.le).sort()[0] : null,
    par_pile: groupe(toutes, (p) => [p.pile]),
    par_signal: groupe(toutes, (p) => (p.signaux || []).map((s) => s.cle)),
  };
}
