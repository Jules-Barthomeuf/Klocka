// BLOC 2 (3/3) — Moteur de règles.
//
// C'EST ICI, ET NULLE PART AILLEURS, QUE LE VERDICT EST PRODUIT.
// Aucun appel LLM. Aucune heuristique implicite. Tout se lit dans rules.json.
//
// Ordre d'évaluation :
//   1. knock-outs communs        -> NO-GO immédiat
//   2. champs clés manquants     -> INSUFFISANT (et mail de relance)
//   3. profils d'acquéreur       -> aucun profil = NO-GO (hors cible)
//   4. réserves                  -> GO SOUS RÉSERVE, sinon GO

import { REGLES } from './enrich.js';
import { calculerAEM } from './aem.js';

export const VERDICTS = ['GO', 'GO SOUS RÉSERVE', 'INSUFFISANT', 'NO-GO'];

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

// --- Comparateurs déclaratifs ----------------------------------------------

function comparer(condition, valeur, attendu) {
  if (valeur === null || valeur === undefined) return false;
  switch (condition) {
    case 'egal':
      return valeur === attendu;
    case 'different':
      return valeur !== attendu;
    case 'superieur':
      return Number(valeur) > Number(attendu);
    case 'superieur_ou_egal':
      return Number(valeur) >= Number(attendu);
    case 'inferieur':
      return Number(valeur) < Number(attendu);
    case 'inferieur_ou_egal':
      return Number(valeur) <= Number(attendu);
    case 'entre':
      return Number(valeur) >= Number(attendu[0]) && Number(valeur) <= Number(attendu[1]);
    case 'dans':
      return Array.isArray(attendu) && attendu.includes(valeur);
    case 'pas_dans':
      return Array.isArray(attendu) && !attendu.includes(valeur);
    case 'vrai':
      return valeur === true;
    case 'faux':
      return valeur === false;
    default:
      return false;
  }
}

/** Années restantes de bail, à partir d'une échéance en texte libre. */
function anneesBailRestantes(echeance) {
  if (!echeance) return null;
  const s = String(echeance);
  let date = null;

  const jjmmaaaa = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  const aaaammjj = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  const anneeSeule = s.match(/\b(20\d{2})\b/);

  if (jjmmaaaa) date = new Date(Number(jjmmaaaa[3]), Number(jjmmaaaa[2]) - 1, Number(jjmmaaaa[1]));
  else if (aaaammjj) date = new Date(Number(aaaammjj[1]), Number(aaaammjj[2]) - 1, Number(aaaammjj[3]));
  else if (anneeSeule) date = new Date(Number(anneeSeule[1]), 11, 31);

  if (!date || Number.isNaN(date.getTime())) return null;
  const ans = (date.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
  return Math.round(ans * 10) / 10;
}

/**
 * Aplatit lot + enrichissement en un jeu de variables plat, seule surface que
 * les règles manipulent. Toute règle de rules.json cite un nom de ce tableau.
 */
export function construireContexte(lot, enrichissement, aem) {
  const confiancesBasses = Object.entries(lot)
    .filter(([, c]) => c && typeof c === 'object' && c.absent === false && c.confiance === 'basse')
    .map(([nom]) => nom);

  return {
    // Extraction
    adresse: val(lot.adresse),
    prix_fai: val(lot.prix_fai),
    loyer_annuel_ht_hc: val(lot.loyer_annuel_ht_hc),
    surface_m2: val(lot.surface_m2),
    locataire_nom: val(lot.locataire_nom),
    bail_echeance: val(lot.bail_echeance),
    bail_type: val(lot.bail_type),
    occupe: val(lot.occupe),
    rendement_annonce: val(lot.rendement_annonce),
    type_actif: val(lot.type_actif),
    honoraires_inclus: val(lot.honoraires_inclus),

    // Calculs
    prix_aem: aem?.prix_aem ?? null,
    rendement_aem: aem?.rendement_aem ?? null,
    rendement_fai: aem?.rendement_fai ?? null,
    annees_bail_restantes: anneesBailRestantes(val(lot.bail_echeance)),

    // Enrichissement
    typologie_ville: enrichissement?.typologie_ville ?? null,
    population: enrichissement?.commune?.population ?? null,
    ville_riche: enrichissement?.ville_riche ?? null,
    paris: enrichissement?.paris ?? false,
    signature: enrichissement?.signature?.niveau ?? null,
    signature_confiance: enrichissement?.signature?.confiance ?? null,
    categorie_activite: enrichissement?.activite?.code ?? null,
    activite_exclue: enrichissement?.activite?.exclue ?? false,
    emplacement: enrichissement?.emplacement ?? 'a_qualifier',

    // Qualité de l'extraction
    extraction_confiance_basse: confiancesBasses.length > 0,
    champs_confiance_basse: confiancesBasses,
  };
}

// --- Étapes du moteur ------------------------------------------------------

function evaluerKnockOuts(ctx) {
  for (const ko of REGLES.knock_outs || []) {
    if (comparer(ko.condition, ctx[ko.champ], ko.valeur)) {
      return { id: ko.id, verdict: ko.verdict, motif: ko.motif, champ: ko.champ, valeur: ctx[ko.champ] };
    }
  }
  return null;
}

function evaluerDonneesRequises(ctx) {
  const conf = REGLES.donnees_requises || {};
  const manquants = (conf.champs || []).filter((c) => {
    const v = ctx[c];
    if (v === null || v === undefined || v === '') return true;
    // L'adresse ne compte que si elle porte au moins une ville ou une rue.
    if (c === 'adresse') return !v.ville && !v.rue;
    return false;
  });
  if (!manquants.length) return null;
  return {
    id: conf.id || 'KO-DONNEES',
    verdict: conf.verdict || 'INSUFFISANT',
    manquants,
    libelles: manquants.map((c) => conf.libelles?.[c] || c),
    motif: `Informations manquantes : ${manquants.map((c) => conf.libelles?.[c] || c).join(', ')}.`,
  };
}

function evaluerProfils(ctx) {
  const profils = (REGLES.profils?.liste || []).filter((p) => p.actif && (p.criteres || []).length);
  if (!profils.length) {
    return { profil: null, aucun_profil_configure: true, details: [] };
  }
  const details = [];
  for (const p of profils) {
    const criteres = p.criteres.map((c) => ({
      champ: c.champ,
      condition: c.condition,
      attendu: c.valeur,
      obtenu: ctx[c.champ],
      passe: comparer(c.condition, ctx[c.champ], c.valeur),
    }));
    details.push({ code: p.code, libelle: p.libelle, criteres, passe: criteres.every((c) => c.passe) });
    if (criteres.every((c) => c.passe)) {
      return { profil: { code: p.code, libelle: p.libelle }, aucun_profil_configure: false, details };
    }
  }
  return { profil: null, aucun_profil_configure: false, details };
}

function evaluerReserves(ctx) {
  return (REGLES.reserves?.liste || [])
    .filter((r) => comparer(r.condition, ctx[r.champ], r.valeur))
    .map((r) => ({ id: r.id, motif: r.motif, champ: r.champ }));
}

/**
 * Produit le verdict d'un lot.
 * @returns {{verdict: string, profil: object|null, motifs: string[], reserves: object[],
 *            manquants: string[], contexte: object, trace: object}}
 */
export function evaluer(lot, enrichissement) {
  const aem = calculerAEM({
    prixFai: val(lot.prix_fai),
    loyerAnnuel: val(lot.loyer_annuel_ht_hc),
  });
  const ctx = construireContexte(lot, enrichissement, aem);

  const trace = { knock_out: null, donnees: null, profils: null, reserves: [] };

  // 1. Knock-outs
  const ko = evaluerKnockOuts(ctx);
  trace.knock_out = ko;
  if (ko) {
    return {
      verdict: ko.verdict,
      profil: null,
      motifs: [ko.motif],
      reserves: [],
      manquants: [],
      aem,
      contexte: ctx,
      trace,
    };
  }

  // 2. Données clés
  const donnees = evaluerDonneesRequises(ctx);
  trace.donnees = donnees;
  if (donnees) {
    return {
      verdict: donnees.verdict,
      profil: null,
      motifs: [donnees.motif],
      reserves: [],
      manquants: donnees.manquants,
      libelles_manquants: donnees.libelles,
      aem,
      contexte: ctx,
      trace,
    };
  }

  // 3. Profil
  const profils = evaluerProfils(ctx);
  trace.profils = profils;

  if (profils.aucun_profil_configure) {
    // Aucun profil n'est encore défini dans rules.json : le moteur ne peut pas
    // conclure. Il le dit plutôt que d'inventer un GO.
    return {
      verdict: 'GO SOUS RÉSERVE',
      profil: null,
      motifs: [
        "Aucun profil d'acquéreur n'est défini dans rules.json : le dossier passe les knock-outs et les données clés sont complètes, mais l'adéquation au profil n'a pas pu être vérifiée.",
      ],
      reserves: evaluerReserves(ctx),
      manquants: [],
      profils_a_configurer: true,
      aem,
      contexte: ctx,
      trace,
    };
  }

  if (!profils.profil) {
    return {
      verdict: 'NO-GO',
      profil: null,
      motifs: ["Le bien ne correspond à aucun profil d'acquéreur."],
      reserves: [],
      manquants: [],
      aem,
      contexte: ctx,
      trace,
    };
  }

  // 4. Réserves
  const reserves = evaluerReserves(ctx);
  trace.reserves = reserves;

  return {
    verdict: reserves.length ? 'GO SOUS RÉSERVE' : 'GO',
    profil: profils.profil,
    motifs: reserves.length ? reserves.map((r) => r.motif) : ['Le bien correspond aux critères du profil.'],
    reserves,
    manquants: [],
    aem,
    contexte: ctx,
    trace,
  };
}

// ---------------------------------------------------------------------------
// La grille : nos critères à gauche, le bien à droite, une croix ou une coche.
//
// Le verdict se lit ici ligne à ligne. Chaque ligne rejoue la même règle, avec
// le même `comparer`, sur le même contexte : la grille et le verdict ne
// peuvent pas se contredire. Calculée à la lecture, elle suit rules.json.
// ---------------------------------------------------------------------------

const LIBELLES_CHAMPS = {
  occupe: 'Bien occupé',
  categorie_activite: 'Activité du locataire',
  activite_exclue: 'Activité exclue',
  prix_fai: 'Prix FAI',
  prix_aem: 'Prix acte en main',
  loyer_annuel_ht_hc: 'Loyer annuel HT HC',
  rendement_annonce: 'Rendement annoncé',
  rendement_fai: 'Rendement FAI',
  rendement_aem: 'Rendement AEM',
  surface_m2: 'Surface',
  adresse: 'Adresse',
  locataire_nom: 'Locataire',
  bail_echeance: 'Échéance du bail',
  bail_type: 'Type de bail',
  annees_bail_restantes: 'Bail restant',
  typologie_ville: 'Typologie de ville',
  population: 'Population',
  ville_riche: 'Ville riche',
  paris: 'Paris',
  emplacement: 'Emplacement',
  signature: 'Enseigne',
  signature_confiance: "Signature de l'enseigne",
  honoraires_inclus: 'Honoraires inclus',
  extraction_confiance_basse: 'Lecture de la fiche',
};

const VALEURS_LISIBLES = {
  petite_ville: 'petite ville',
  ville_moyenne: 'ville moyenne',
  grande_ville: 'grande ville',
  metropole: 'métropole',
  a_qualifier: 'à qualifier',
  n1: 'n°1',
  n1_bis: 'n°1 bis',
  n2: 'n°2',
  basse: 'basse',
  moyenne: 'moyenne',
  haute: 'haute',
  etablissement_de_nuit: 'établissement de nuit',
  profession_liberale: 'profession libérale',
  restauration_rapide_kebab: 'restauration rapide',
};

const lisible = (v) => (v in VALEURS_LISIBLES ? VALEURS_LISIBLES[v] : String(v).replace(/_/g, ' '));

function formaterValeur(champ, v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (champ === 'adresse' && typeof v === 'object') return [v.rue, v.ville].filter(Boolean).join(', ') || null;
  if (typeof v === 'number') {
    if (/prix|loyer/.test(champ)) return `${Math.round(v).toLocaleString('fr-FR')} €`;
    if (/rendement/.test(champ)) return `${v} %`;
    if (champ === 'surface_m2') return `${v} m²`;
    if (champ === 'annees_bail_restantes') return `${Math.round(v * 10) / 10} an${v >= 2 ? 's' : ''}`;
    if (champ === 'population') return `${Math.round(v).toLocaleString('fr-FR')} hab.`;
    return String(v);
  }
  if (Array.isArray(v)) return v.map(lisible).join(', ');
  return lisible(v);
}

function formaterAttendu(champ, condition, attendu) {
  const f = (x) => formaterValeur(champ, x) ?? lisible(x);
  switch (condition) {
    case 'egal': return typeof attendu === 'boolean' ? (attendu ? 'oui' : 'non') : f(attendu);
    case 'different': return `≠ ${f(attendu)}`;
    case 'superieur': return `> ${f(attendu)}`;
    case 'superieur_ou_egal': return `≥ ${f(attendu)}`;
    case 'inferieur': return `< ${f(attendu)}`;
    case 'inferieur_ou_egal': return `≤ ${f(attendu)}`;
    case 'entre': return `entre ${f(attendu[0])} et ${f(attendu[1])}`;
    case 'dans': return (attendu || []).map(lisible).join(' ou ');
    case 'pas_dans': return `hors ${(attendu || []).map(lisible).join(', ')}`;
    case 'vrai': return 'oui';
    case 'faux': return 'non';
    default: return String(attendu);
  }
}

// Une condition « interdite » (knock-out, réserve) se lit à l'envers : ce que
// nous voulons, c'est son contraire.
const CONTRAIRE = {
  egal: 'different', different: 'egal', superieur: 'inferieur_ou_egal', superieur_ou_egal: 'inferieur',
  inferieur: 'superieur_ou_egal', inferieur_ou_egal: 'superieur', dans: 'pas_dans', pas_dans: 'dans',
  vrai: 'faux', faux: 'vrai',
};

/**
 * La grille d'un lot évalué.
 * @param {{contexte: object, profil?: object, trace?: object}} evaluation
 * @returns {Array<{groupe, champ, critere, attendu, valeur, ok: boolean|null, motif?}>}
 */
export function grilleCriteres(evaluation) {
  const ctx = evaluation?.contexte;
  if (!ctx) return [];
  const lignes = [];
  const absent = (v) => v === null || v === undefined || v === '';

  // 1. Exclusions : ce que nous n'achetons pas.
  for (const ko of REGLES.knock_outs || []) {
    const v = ctx[ko.champ];
    const declenche = comparer(ko.condition, v, ko.valeur);
    lignes.push({
      groupe: 'Exclusions',
      champ: ko.champ,
      critere: LIBELLES_CHAMPS[ko.champ] || ko.champ,
      attendu: formaterAttendu(ko.champ, CONTRAIRE[ko.condition] || ko.condition, ko.valeur),
      valeur: formaterValeur(ko.champ, v),
      ok: absent(v) ? null : !declenche,
      motif: declenche ? ko.motif : null,
    });
  }

  // 2. Données clés : sans elles, pas de décision.
  const conf = REGLES.donnees_requises || {};
  for (const champ of conf.champs || []) {
    const v = ctx[champ];
    const manque = absent(v) || (champ === 'adresse' && !v?.ville && !v?.rue);
    lignes.push({
      groupe: 'Données clés',
      champ,
      critere: LIBELLES_CHAMPS[champ] || conf.libelles?.[champ] || champ,
      attendu: 'renseigné',
      valeur: formaterValeur(champ, v),
      ok: !manque,
    });
  }

  // 3. Profil : celui retenu ; sinon celui qui passe le plus de critères — on
  //    montre ce qui a manqué de peu, pas une liste arbitraire.
  const profils = (REGLES.profils?.liste || []).filter((p) => p.actif && (p.criteres || []).length);
  let cible = null;
  if (evaluation.profil?.code) {
    cible = profils.find((p) => p.code === evaluation.profil.code && p.criteres.every((c) => comparer(c.condition, ctx[c.champ], c.valeur)))
      || profils.find((p) => p.code === evaluation.profil.code);
  } else if (profils.length) {
    cible = profils
      .map((p) => ({ p, n: p.criteres.filter((c) => comparer(c.condition, ctx[c.champ], c.valeur)).length / p.criteres.length }))
      .sort((a, b) => b.n - a.n)[0].p;
  }
  if (cible) {
    for (const c of cible.criteres) {
      const v = ctx[c.champ];
      lignes.push({
        groupe: cible.libelle,
        champ: c.champ,
        critere: LIBELLES_CHAMPS[c.champ] || c.champ,
        attendu: formaterAttendu(c.champ, c.condition, c.valeur),
        valeur: formaterValeur(c.champ, v),
        ok: absent(v) ? null : comparer(c.condition, v, c.valeur),
      });
    }
  }

  // 4. Réserves : ce qui reste à lever avant de décider.
  for (const r of REGLES.reserves?.liste || []) {
    const v = ctx[r.champ];
    const declenche = comparer(r.condition, v, r.valeur);
    lignes.push({
      groupe: 'Réserves',
      champ: r.champ,
      critere: LIBELLES_CHAMPS[r.champ] || r.champ,
      attendu: formaterAttendu(r.champ, CONTRAIRE[r.condition] || r.condition, r.valeur),
      valeur: formaterValeur(r.champ, v),
      ok: absent(v) ? null : !declenche,
      motif: declenche ? r.motif : null,
    });
  }
  return lignes;
}

/** Signalé au démarrage : un moteur sans profil ne peut pas trancher. */
export function profilsConfigures() {
  return (REGLES.profils?.liste || []).filter((p) => p.actif && (p.criteres || []).length).length;
}
