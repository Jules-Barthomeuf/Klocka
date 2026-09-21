// Le classement ALX : une cible, trois piles, une phrase.
//
// C'EST ICI, ET NULLE PART AILLEURS, QUE LA PILE EST DÉCIDÉE. Aucun appel au
// modèle, aucune heuristique cachée : tout se lit dans data/signaux.json, et
// chaque décision porte sa trace (quel signal, quelle valeur, quelle source,
// quel poids).
//
// Deux natures de règles, qui ne se mélangent pas :
//   - les FAITS, dans l'ordre, déterministes : knock-outs, puis drapeau
//     bloquant, puis les écarts posés par l'équipe. Ils ne prédisent rien,
//     ils constatent, et ils passent avant tout le reste ;
//   - les PARIS : chaque signal porte un poids, les poids s'additionnent, et
//     le score fait la pile (seuils_score). Une cascade « un fort → appeler »
//     perdait la combinaison : un marchand de biens dont le locataire tombe
//     n'est pas le même dossier qu'un marchand de biens seul. Ici la somme le
//     dit, et le motif montre chaque contribution avec son poids.
//
// Un drapeau lent (indivision, achat en bloc) retient un appel en courrier :
// on écrit, on n'appelle pas cette semaine pour un dossier qui prendra un an.
//
// Une cible est un objet plat rempli au fil des connecteurs et des saisies
// manuelles. Ce module ne sait pas d'où viennent les valeurs ; il sait
// seulement ce qu'elles impliquent. Ce qui manque n'est pas un signal : une
// cible sans propriétaire connu tombe en « surveiller », pas en « écartée ».

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const REGLES = JSON.parse(fs.readFileSync(path.join(ici, 'data', 'signaux.json'), 'utf-8'));

export const PILES = ['appeler', 'ecrire', 'surveiller', 'ecartee'];
export const LIBELLES_PILES = {
  appeler: 'À appeler',
  ecrire: 'À écrire',
  surveiller: 'À surveiller',
  ecartee: 'Écartée',
};

const MOIS_MS = 30.44 * 24 * 3600 * 1000;
const moisDepuis = (iso, maintenant) => (iso ? (maintenant - new Date(iso).getTime()) / MOIS_MS : null);
const regle = (famille, cle) => (REGLES[famille] || []).find((r) => r.cle === cle) || {};

/** Les seuils du score : au-dessus, on appelle ; au milieu, on écrit ; en dessous, on surveille. */
export const SEUILS = { appeler: REGLES.seuils_score?.appeler ?? 3, ecrire: REGLES.seuils_score?.ecrire ?? 0.7 };
const POIDS_DEFAUT = { fort: 3, patient: 0.8 };

/** Le poids d'une règle, par type d'événement quand elle en distingue. */
const poidsDe = (r, famille, type = null) => {
  if (type && r.poids_par_type) {
    const t = String(type).toLowerCase();
    const cle = Object.keys(r.poids_par_type).find((k) => t.includes(k.toLowerCase()));
    if (cle) return r.poids_par_type[cle];
  }
  return typeof r.poids === 'number' ? r.poids : POIDS_DEFAUT[famille];
};
const arrondi = (x) => Math.round(x * 10) / 10;

/** Un signal s'observe-t-il dans une rue prospectée, ou seulement sur un dossier entré ? */
export const observableEnProspection = (cle) => {
  const r = [...(REGLES.signaux_forts || []), ...(REGLES.signaux_patients || [])].find((x) => x.cle === cle);
  return !r || r.observable_en_prospection !== false;
};

/**
 * Le nom de famille d'un gérant, pour repérer une SCI familiale.
 *
 * L'annuaire des entreprises le donne à part (nom_famille) : on le prend. Pour
 * une saisie libre, « Marie DUPONT » se lit au mot en capitales ; quand tout
 * est en capitales, comme « MARC JOSEPH PRETAZZINI », c'est le dernier mot,
 * une fois retirée une mention entre parenthèses (nom d'usage, « (BOSCA) »).
 * Une personne morale n'a pas de famille.
 */
/** « Saint-Laurent-du-Var » et « SAINT LAURENT DU VAR » sont la même ville. */
const simple = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function nomDeFamille(gerant) {
  if (!gerant || gerant.personne_morale) return null;
  if (gerant.nom_famille) return String(gerant.nom_famille).trim().toLowerCase() || null;
  const nom = String(gerant.nom || '').replace(/\([^)]*\)/g, ' ').trim();
  if (!nom) return null;
  const mots = nom.split(/\s+/).filter(Boolean);
  const toutEnCapitales = mots.every((m) => m === m.toUpperCase());
  if (toutEnCapitales) return mots[mots.length - 1].toLowerCase();
  const capitale = mots.find((m) => m.length > 1 && m === m.toUpperCase());
  return (capitale || mots[mots.length - 1]).toLowerCase();
}

/**
 * Les signaux présents sur une cible, forts et patients, chacun avec sa trace.
 * @param {object} cible
 * @param {{maintenant?: number}} [opts] - l'horloge, remplaçable en test
 */
export function signauxDe(cible, { maintenant = Date.now() } = {}) {
  const forts = [];
  const patients = [];
  const s = cible.societe || {};
  const p = cible.proprietaire || {};
  const m = cible.mutation || {};
  // Chaque signal part avec son poids : la trace dit ce qu'il a pesé.
  const fort = (cle, r, reste, type = null) => forts.push({ cle, libelle: r.libelle, poids: poidsDe(r, 'fort', type), ...reste });
  const patient = (cle, r, reste) => patients.push({ cle, libelle: r.libelle, poids: poidsDe(r, 'patient'), ...reste });

  // --- Forts ---------------------------------------------------------------
  const rMarchand = regle('signaux_forts', 'marchand_fenetre');
  const ape = String(s.ape || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  const moisAchat = moisDepuis(m.date, maintenant);
  if (ape === '6810Z' && moisAchat != null) {
    const [min, max] = rMarchand.fenetre_mois || [18, 48];
    if (moisAchat >= min && moisAchat <= max) {
      fort('marchand_fenetre', rMarchand, {
        valeur: `${Math.round(moisAchat)} mois après la mutation`,
        source: 'Annuaire (APE) et DVF (mutation), inférence',
      });
    }
  }

  const rEvt = regle('signaux_forts', 'evenement_recent');
  const evtRecent = (cible.evenements || []).find((e) => {
    const mois = moisDepuis(e.date, maintenant);
    return mois != null && mois <= (rEvt.fenetre_mois || 6) && /gerance|gérance|siege|siège|collective|dissolution|radiation|décès|deces/i.test(e.type || '');
  });
  if (evtRecent) {
    fort('evenement_recent', rEvt, { valeur: `${evtRecent.type} le ${String(evtRecent.date).slice(0, 10)}`, source: evtRecent.source || 'BODACC' }, evtRecent.type);
  }

  const rEch = regle('signaux_forts', 'echeance_proche');
  const moisEcheance = cible.bail_echeance ? -moisDepuis(cible.bail_echeance, maintenant) : null;
  if (moisEcheance != null && moisEcheance >= 0 && moisEcheance <= (rEch.fenetre_mois || 24)) {
    fort('echeance_proche', rEch, { valeur: `dans ${Math.round(moisEcheance)} mois`, source: cible.bail_source || 'saisie' });
  }

  // Le BODACC du locataire, pas du propriétaire : un exploitant qui tombe fait
  // un bailleur qui vend.
  const rLoc = regle('signaux_forts', 'locataire_en_difficulte');
  const locEnDifficulte = (cible.evenements_locataire || []).find((e) => {
    const mois = moisDepuis(e.date, maintenant);
    return mois != null && mois <= (rLoc.fenetre_mois || 12) && /collective|dissolution|radiation/i.test(e.type || '');
  });
  if (locEnDifficulte) {
    fort('locataire_en_difficulte', rLoc, { valeur: `${locEnDifficulte.type} le ${String(locEnDifficulte.date).slice(0, 10)}`, source: locEnDifficulte.source || 'BODACC (locataire)' });
  }

  // --- Patients ------------------------------------------------------------
  const rDet = regle('signaux_patients', 'detention_longue');
  const anneesMin = rDet.annees_min || 20;
  const depuis = m.date || s.creation || null;
  const anneesDetention = depuis ? (maintenant - new Date(depuis).getTime()) / (365.25 * 24 * 3600 * 1000) : null;
  if (anneesDetention != null && anneesDetention >= anneesMin && ape !== '6810Z') {
    patient('detention_longue', rDet, { valeur: `${Math.floor(anneesDetention)} ans`, source: m.date ? 'DVF' : 'Annuaire (création)' });
  }

  const rAge = regle('signaux_patients', 'gerant_age');
  const gerants = Array.isArray(s.gerants) ? s.gerants : [];
  const age = gerants.find((g) => String(g.tranche_age || '') === (rAge.tranche || '70+'));
  if (age) patient('gerant_age', rAge, { valeur: age.nom || 'un gérant', source: 'Annuaire des entreprises' });

  const rFam = regle('signaux_patients', 'famille');
  const familles = gerants.map(nomDeFamille).filter(Boolean);
  const meme = familles.find((n, i) => familles.indexOf(n) !== i);
  if (meme) patient('famille', rFam, { valeur: `${familles.filter((n) => n === meme).length} gérants ${meme.toUpperCase()}`, source: 'Annuaire des entreprises' });

  const rLoyer = regle('signaux_patients', 'loyer_bas');
  const v = cible.valorisation || {};
  if (cible.loyer_m2_bail > 0 && v.loyer_m2_marche > 0 && cible.loyer_m2_bail / v.loyer_m2_marche <= (rLoyer.ratio_max || 0.7)) {
    patient('loyer_bas', rLoyer, { valeur: `${Math.round((cible.loyer_m2_bail / v.loyer_m2_marche) * 100)} % du marché`, source: v.loyer_source || 'DVF / Equimmox' });
  }

  const rIsole = regle('signaux_patients', 'bien_isole');
  if (p.distance_siege_km != null && p.distance_siege_km >= (rIsole.distance_km_min || 100) && (p.nombre_biens == null || p.nombre_biens <= 1)) {
    patient('bien_isole', rIsole, { valeur: `siège à ${Math.round(p.distance_siege_km)} km`, source: 'Annuaire (siège)' });
  }

  // Le siège ailleurs : seulement quand on connaît les deux villes, jamais deviné.
  const rSiege = regle('signaux_patients', 'siege_ailleurs');
  const villeSiege = String(s.siege?.ville || s.siege?.commune || '').trim();
  const villeLocal = String(cible.ville || '').trim();
  if (rSiege.cle && villeSiege && villeLocal && simple(villeSiege) !== simple(villeLocal)) {
    patient('siege_ailleurs', rSiege, { valeur: `siège à ${villeSiege}`, source: 'Annuaire (siège)' });
  }

  // Un autre lot de la parcelle qui mute : DVF, sur les lots qui ne sont pas le local.
  const rVoisin = regle('signaux_patients', 'voisin_mute');
  const mv = cible.mutation_voisine || null;
  const moisVoisin = mv?.date ? moisDepuis(mv.date, maintenant) : null;
  if (rVoisin.cle && moisVoisin != null && moisVoisin >= 0 && moisVoisin <= (rVoisin.fenetre_mois || 24)) {
    patient('voisin_mute', rVoisin, { valeur: `${mv.type_local || 'un lot'} vendu le ${String(mv.date).slice(0, 10)}`, source: 'DVF (même parcelle)' });
  }

  return { forts, patients };
}

/** Les drapeaux techniques : ils ne disent pas s'il vendra, mais si la vente est faisable. */
export function drapeauxDe(cible) {
  const out = [];
  const p = cible.proprietaire || {};
  const droit = String(p.droit || '').toLowerCase();

  if (/usufruit|nue[- ]?propri/.test(droit)) out.push({ ...regle('drapeaux', 'droit_partiel'), valeur: p.droit });
  if (/indivis/.test(droit) || p.indivision === true) {
    const d = { ...regle('drapeaux', 'indivision'), valeur: p.droit || 'indivision' };
    // Une indivision successorale est un vivier, pas un obstacle.
    if (p.indivision_successorale === true) d.effet = 'patient';
    out.push(d);
  }
  if (cible.mutation?.nombre_lots > 1 || cible.mutation?.en_bloc === true) out.push({ ...regle('drapeaux', 'vente_en_bloc'), valeur: `${cible.mutation.nombre_lots || 'plusieurs'} lots` });
  if (cible.occupe !== false) out.push({ ...regle('drapeaux', 'droit_preference'), valeur: 'local loué' });
  // Maps le dit fermé : ni signal ni knock-out, une vérification à faire.
  if (cible.occupant?.ferme === true && regle('drapeaux', 'fermeture_maps').cle) out.push({ ...regle('drapeaux', 'fermeture_maps'), valeur: 'fermé sur Maps' });
  return out;
}

/**
 * Le score d'une cible : la somme des poids de ses signaux, et chaque
 * contribution avec son poids, pour que le motif puisse les montrer.
 * Un drapeau « patient » (une indivision successorale) compte comme un
 * signal patient.
 */
export function scoreDe(signaux, drapeaux = []) {
  const contributions = [
    ...(signaux.forts || []).map((s) => ({ cle: s.cle, libelle: s.libelle, valeur: s.valeur || null, poids: s.poids ?? POIDS_DEFAUT.fort })),
    ...(signaux.patients || []).map((s) => ({ cle: s.cle, libelle: s.libelle, valeur: s.valeur || null, poids: s.poids ?? POIDS_DEFAUT.patient })),
    ...drapeaux.filter((d) => d.effet === 'patient').map((d) => ({ cle: d.cle, libelle: d.libelle, valeur: d.valeur || null, poids: d.poids_si_patient ?? POIDS_DEFAUT.patient })),
  ].sort((a, b) => b.poids - a.poids);
  return { total: arrondi(contributions.reduce((t, c) => t + c.poids, 0)), contributions };
}

const virgule = (x) => String(arrondi(x)).replace('.', ',');
/** « marchand de biens dans sa fenêtre (26 mois après la mutation) +3 » */
const contributionEnMots = (c) => `${c.libelle.charAt(0).toLowerCase()}${c.libelle.slice(1)}${c.valeur ? ` (${c.valeur})` : ''} ${c.poids >= 0 ? '+' : ''}${virgule(c.poids)}`;

/** Les knock-outs : ce qui sort la cible avant tout classement. */
export function knockOutsDe(cible) {
  const out = [];
  const { prix_min, prix_max } = REGLES.perimetre;
  if (cible.activite_exclue === true) out.push({ ...regle('knock_outs', 'activite_exclue'), valeur: cible.activite || cible.categorie_activite });
  const f = cible.valorisation?.fourchette;
  if (Array.isArray(f) && f.length === 2 && f[1] != null && f[0] != null && (f[1] < prix_min || f[0] > prix_max)) {
    out.push({ ...regle('knock_outs', 'hors_prix'), valeur: `${f[0]} – ${f[1]} €` });
  }
  if (cible.occupe === false) out.push({ ...regle('knock_outs', 'local_vide'), valeur: 'vide' });
  return out;
}

/**
 * La pile d'une cible, et pourquoi.
 * @returns {{pile: string, motif: string, signaux: object, drapeaux: object[], knock_outs: object[]}}
 */
export function classer(cible, opts = {}) {
  const knock_outs = knockOutsDe(cible);
  const drapeaux = drapeauxDe(cible);
  const signaux = signauxDe(cible, opts);
  const base = { signaux, drapeaux, knock_outs };

  if (cible.ecartee_equipe) return { ...base, pile: 'ecartee', motif: `Écartée par l'équipe${cible.ecartee_motif ? ` : ${cible.ecartee_motif}` : ''}.` };
  if (cible.ecartee_regle) return { ...base, pile: 'ecartee', motif: `Écartée par une règle de l'équipe, ${cible.ecartee_regle.pourquoi}${cible.ecartee_regle.motif ? ` : ${cible.ecartee_regle.motif}` : ''}.` };
  if (knock_outs.length) return { ...base, pile: 'ecartee', motif: knock_outs[0].libelle + (knock_outs[0].valeur ? ` (${knock_outs[0].valeur})` : '') };

  const bloquant = drapeaux.find((d) => d.effet === 'bloquant');
  if (bloquant) return { ...base, pile: 'ecartee', motif: `${bloquant.libelle} : ${bloquant.detail}` };

  // Une enseigne nationale propriétaire de ses murs ne vend pas sur un coup de
  // fil, et ses mouvements de siège ou de gérance ne disent rien du local.
  if (cible.proprietaire_occupant && cible.occupant?.chaine) {
    return { ...base, score: scoreDe(signaux, drapeaux), pile: 'surveiller', motif: "Enseigne nationale propriétaire de ses murs : pas de vendeur à appeler. Veille DVF." };
  }

  // Le modèle appris, quand la ville est scorée (score-ville.js) : sa tranche
  // fait la pile. Les exclusions ci-dessus restent au-dessus ; les signaux
  // restent lus et montrés, ils ne décident plus. Mesurés sur DVF, ils ne
  // triaient rien (lift proche de 1) ; le modèle, lui, met quatre fois plus
  // de ventes dans son top 5 % que la moyenne.
  const ml = cible.score_ml;
  if (ml?.tranche?.cle) {
    const scoreSignaux = scoreDe(signaux, drapeaux);
    const lentMl = drapeaux.find((d) => d.effet === 'lent');
    const pousse = (ml.raisons || []).filter((r) => r.sens > 0).slice(0, 3)
      .map((r) => r.phrase.charAt(0).toLowerCase() + r.phrase.slice(1)).join(', ');
    const taux = ml.tranche.taux != null ? ` : ${Math.round(ml.tranche.taux * 100)} % des adresses de ce niveau ont vu un local commercial se vendre dans l'année` : '';
    const suite = pousse ? ` Ce qui pousse : ${pousse}.` : '';
    const tete = ml.tranche.cle === 'top_5';
    const aveugle = ml.fiabilite?.cle === 'inconnu';
    if (tete && !lentMl && !aveugle) {
      return { ...base, score: scoreSignaux, pile: 'appeler', motif: `${ml.tranche.libelle}${taux}.${suite}` };
    }
    if (tete || ml.tranche.cle === 'top_10' || ml.tranche.cle === 'top_20') {
      const retenue = !tete ? '' : lentMl ? `, mais ${lentMl.libelle.toLowerCase()} : un dossier lent` : ", mais le propriétaire n'est pas une société connue : le modèle voit mal";
      return { ...base, score: scoreSignaux, pile: 'ecrire', motif: `${ml.tranche.libelle}${taux}${retenue}.${suite}` };
    }
    return { ...base, score: scoreSignaux, pile: 'surveiller', motif: `${ml.tranche.libelle}${taux}. Veille BODACC et DVF.` };
  }

  // Sans score appris (ville non couverte) : les paris. La somme des poids
  // fait la pile, et le motif montre chaque contribution. Un drapeau lent
  // retient un appel en courrier : on écrit, on n'appelle pas cette semaine
  // pour un dossier qui prendra un an.
  const score = scoreDe(signaux, drapeaux);
  const lent = drapeaux.find((d) => d.effet === 'lent');
  const avecScore = { ...base, score };
  const detail = score.contributions.slice(0, 4).map(contributionEnMots).join(', ');

  if (score.total >= SEUILS.appeler && !lent) {
    return { ...avecScore, pile: 'appeler', motif: `Score ${virgule(score.total)} : ${detail}.` };
  }
  if (score.total >= SEUILS.appeler && lent) {
    return { ...avecScore, pile: 'ecrire', motif: `Score ${virgule(score.total)} (${detail}), mais ${lent.libelle.toLowerCase()} : un dossier lent.` };
  }
  if (score.total >= SEUILS.ecrire) {
    return { ...avecScore, pile: 'ecrire', motif: `Score ${virgule(score.total)} : ${detail}.` };
  }

  const manque = !cible.proprietaire?.nom ? 'Propriétaire à établir.' : score.contributions.length ? `Indices faibles, sous le seuil (score ${virgule(score.total)} : ${detail}).` : 'Aucun signal chez le propriétaire.';
  return { ...avecScore, pile: 'surveiller', motif: `${manque} Veille BODACC et DVF.` };
}
