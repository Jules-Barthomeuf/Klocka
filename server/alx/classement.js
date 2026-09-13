// Le classement ALX : une cible, trois piles, une phrase.
//
// C'EST ICI, ET NULLE PART AILLEURS, QUE LA PILE EST DÉCIDÉE. Aucun appel au
// modèle, aucune heuristique cachée : tout se lit dans data/signaux.json, et
// chaque décision porte sa trace (quel signal, quelle valeur, quelle source).
//
// Ordre d'évaluation, comme pour le verdict de la préanalyse :
//   1. knock-outs           -> écartée, avec le motif
//   2. drapeau bloquant     -> écartée
//   3. un signal fort       -> appeler
//   4. un signal patient    -> ecrire
//   5. rien                 -> surveiller
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

/**
 * Le nom de famille d'un gérant, pour repérer une SCI familiale.
 *
 * L'annuaire des entreprises le donne à part (nom_famille) : on le prend. Pour
 * une saisie libre, « Marie DUPONT » se lit au mot en capitales ; quand tout
 * est en capitales, comme « MARC JOSEPH PRETAZZINI », c'est le dernier mot,
 * une fois retirée une mention entre parenthèses (nom d'usage, « (BOSCA) »).
 * Une personne morale n'a pas de famille.
 */
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

  // --- Forts ---------------------------------------------------------------
  const rMarchand = regle('signaux_forts', 'marchand_fenetre');
  const ape = String(s.ape || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  const moisAchat = moisDepuis(m.date, maintenant);
  if (ape === '6810Z' && moisAchat != null) {
    const [min, max] = rMarchand.fenetre_mois || [18, 48];
    if (moisAchat >= min && moisAchat <= max) {
      forts.push({
        cle: 'marchand_fenetre',
        libelle: rMarchand.libelle,
        valeur: `${Math.round(moisAchat)} mois après la mutation`,
        source: 'Annuaire (APE) et DVF (mutation), inférence',
      });
    }
  }

  const rEvt = regle('signaux_forts', 'evenement_recent');
  const evtRecent = (cible.evenements || []).find((e) => {
    const mois = moisDepuis(e.date, maintenant);
    return mois != null && mois <= (rEvt.fenetre_mois || 6) && /gerance|gérance|siege|siège|collective|dissolution/i.test(e.type || '');
  });
  if (evtRecent) {
    forts.push({ cle: 'evenement_recent', libelle: rEvt.libelle, valeur: `${evtRecent.type} le ${String(evtRecent.date).slice(0, 10)}`, source: evtRecent.source || 'BODACC' });
  }

  const rEch = regle('signaux_forts', 'echeance_proche');
  const moisEcheance = cible.bail_echeance ? -moisDepuis(cible.bail_echeance, maintenant) : null;
  if (moisEcheance != null && moisEcheance >= 0 && moisEcheance <= (rEch.fenetre_mois || 24)) {
    forts.push({ cle: 'echeance_proche', libelle: rEch.libelle, valeur: `dans ${Math.round(moisEcheance)} mois`, source: cible.bail_source || 'saisie' });
  }

  // --- Patients ------------------------------------------------------------
  const rDet = regle('signaux_patients', 'detention_longue');
  const anneesMin = rDet.annees_min || 20;
  const depuis = m.date || s.creation || null;
  const anneesDetention = depuis ? (maintenant - new Date(depuis).getTime()) / (365.25 * 24 * 3600 * 1000) : null;
  if (anneesDetention != null && anneesDetention >= anneesMin && ape !== '6810Z') {
    patients.push({ cle: 'detention_longue', libelle: rDet.libelle, valeur: `${Math.floor(anneesDetention)} ans`, source: m.date ? 'DVF' : 'Annuaire (création)' });
  }

  const rAge = regle('signaux_patients', 'gerant_age');
  const gerants = Array.isArray(s.gerants) ? s.gerants : [];
  const age = gerants.find((g) => String(g.tranche_age || '') === (rAge.tranche || '70+'));
  if (age) patients.push({ cle: 'gerant_age', libelle: rAge.libelle, valeur: age.nom || 'un gérant', source: 'Annuaire des entreprises' });

  const rFam = regle('signaux_patients', 'famille');
  const familles = gerants.map(nomDeFamille).filter(Boolean);
  const meme = familles.find((n, i) => familles.indexOf(n) !== i);
  if (meme) patients.push({ cle: 'famille', libelle: rFam.libelle, valeur: `${familles.filter((n) => n === meme).length} gérants ${meme.toUpperCase()}`, source: 'Annuaire des entreprises' });

  const rLoyer = regle('signaux_patients', 'loyer_bas');
  const v = cible.valorisation || {};
  if (cible.loyer_m2_bail > 0 && v.loyer_m2_marche > 0 && cible.loyer_m2_bail / v.loyer_m2_marche <= (rLoyer.ratio_max || 0.7)) {
    patients.push({ cle: 'loyer_bas', libelle: rLoyer.libelle, valeur: `${Math.round((cible.loyer_m2_bail / v.loyer_m2_marche) * 100)} % du marché`, source: v.loyer_source || 'Data-B / Equimmox' });
  }

  const rIsole = regle('signaux_patients', 'bien_isole');
  if (p.distance_siege_km != null && p.distance_siege_km >= (rIsole.distance_km_min || 100) && (p.nombre_biens == null || p.nombre_biens <= 1)) {
    patients.push({ cle: 'bien_isole', libelle: rIsole.libelle, valeur: `siège à ${Math.round(p.distance_siege_km)} km`, source: 'Annuaire (siège)' });
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
  return out;
}

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
    return { ...base, pile: 'surveiller', motif: "Enseigne nationale propriétaire de ses murs : pas de vendeur à appeler. Veille DVF." };
  }

  // Un drapeau lent retient un signal fort en pile patiente : on écrit, on
  // n'appelle pas cette semaine pour un dossier qui prendra un an.
  const lent = drapeaux.find((d) => d.effet === 'lent');

  if (signaux.forts.length && !lent) {
    const s = signaux.forts[0];
    return { ...base, pile: 'appeler', motif: `${s.libelle} (${s.valeur}).` };
  }
  if (signaux.forts.length && lent) {
    const s = signaux.forts[0];
    return { ...base, pile: 'ecrire', motif: `${s.libelle}, mais ${lent.libelle.toLowerCase()} : un dossier lent.` };
  }
  const patient = signaux.patients[0] || drapeaux.find((d) => d.effet === 'patient');
  if (patient) return { ...base, pile: 'ecrire', motif: `${patient.libelle}${patient.valeur ? ` (${patient.valeur})` : ''}.` };

  const manque = !cible.proprietaire?.nom ? 'Propriétaire à établir.' : 'Aucun signal chez le propriétaire.';
  return { ...base, pile: 'surveiller', motif: `${manque} Veille BODACC et DVF.` };
}
