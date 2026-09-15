// Le score appris, ville par ville.
//
// L'application calcule les MÊMES variables que l'entraînement, avec le même
// code (dataset-ml.js) : le cadastre, DVF, le fichier DGFiP des sociétés
// propriétaires, les vitrines OpenStreetMap, le BODACC. Un score calculé sur
// d'autres variables que celles apprises ne vaut rien : l'ancienne version en
// laissait quatre-vingt-six pour cent vides et rendait 2 % à tout le monde.
//
// Chaque commerce est ensuite situé dans le classement de sa ville (toutes les
// parcelles à vitrine, scorées aujourd'hui), et sa tranche dit ce qu'elle a
// valu sur l'année de test : dans le top 5 %, quelle part des adresses a vu un
// local commercial se vendre dans les douze mois.
//
// Ce que le score dit, et ne dit pas :
//   - l'étiquette est à la PARCELLE : « un local commercial de cette parcelle
//     se vend dans l'année », pas forcément celui de ce commerce ;
//   - le fichier DGFiP ne connaît que les sociétés : quand le propriétaire est
//     une personne physique, le modèle est presque aveugle, et l'écran le dit.

import { Records } from '../db.js';
import { scorer } from './score-ml.js';
import { lireCommune } from './mesure-dvf.js';
import {
  featuresA, indexerLocaux, mutationsParParcelle, parcellesCommercantes,
  osmDeLaCommune, proceduresDeLaCommune, registreEnseignes, communesEnCache,
} from './dataset-ml.js';
import { dejaLa, lire as lirePM, parParcelle, parSiren } from './personnes-morales.js';

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Ce que valent les tranches et la fiabilité (mesures, pas intuitions)
// ---------------------------------------------------------------------------

/**
 * Les tranches du classement, avec le taux de vente observé sur l'année de
 * test du dernier entraînement. Les taux sont cumulés : « top 10 % » compte
 * aussi le top 5 %.
 */
export function tranchesDe(metrics) {
  const h = metrics?.holdout_final;
  const t = h?.lift_en_tete;
  if (!t?.top_5 || !t?.top_20) return null;
  const ventesTop20 = Math.round(t.top_20.taux_vente * t.top_20.n);
  const resteN = h.n - t.top_20.n;
  const resteTaux = resteN > 0 ? (h.positifs - ventesTop20) / resteN : null;
  return [
    { cle: 'top_5', jusqua: 0.05, libelle: 'Top 5 % de la ville', taux: t.top_5.taux_vente, lift: t.top_5.lift },
    { cle: 'top_10', jusqua: 0.10, libelle: 'Top 10 % de la ville', taux: t.top_10.taux_vente, lift: t.top_10.lift },
    { cle: 'top_20', jusqua: 0.20, libelle: 'Top 20 % de la ville', taux: t.top_20.taux_vente, lift: t.top_20.lift },
    { cle: 'reste', jusqua: 1, libelle: 'Au-delà du top 20 %', taux: resteTaux, lift: resteTaux != null && h.prevalence ? Math.round((resteTaux / h.prevalence) * 100) / 100 : null },
  ].map((x) => ({ ...x, prevalence: h.prevalence }));
}

/** La tranche d'un rang (part des parcelles de la ville classées devant ou à égalité). */
export const trancheDe = (tranches, rangPart) => (tranches || []).find((t) => rangPart <= t.jusqua) || null;

/**
 * La fiabilité selon ce qu'on sait du propriétaire. Mesurée sur 2023 avec un
 * modèle entraîné sur les années d'avant (voir la réponse du 15/09/2026) :
 * c'est là que la taille de l'immeuble ne suffit plus à expliquer le tri.
 */
export const FIABILITE = {
  plusieurs_societes: { mot: 'correcte', auc: 0.66, detail: 'Plusieurs sociétés possèdent des lots sur la parcelle : c\'est le cas où le modèle trie le mieux.' },
  une_societe: { mot: 'faible', auc: 0.58, detail: 'Une seule société propriétaire : le modèle trie peu (dans son top 5 %, deux fois plus de ventes que la moyenne, pas davantage).' },
  inconnu: { mot: 'très faible', auc: 0.57, detail: 'Aucune société propriétaire dans le fichier DGFiP, souvent une personne physique : le modèle ne voit presque rien du propriétaire.' },
};

export const groupeProprietaire = (v) => (v.multi_proprietaires_pm === 1 ? 'plusieurs_societes' : v.multi_proprietaires_pm === 0 ? 'une_societe' : 'inconnu');

/** La part des parcelles au moins aussi probables : 0,03 = dans les 3 % de tête. */
export function rangDans(probasDecroissantes, p) {
  const n = probasDecroissantes.length;
  if (!n) return null;
  let bas = 0;
  let haut = n;
  while (bas < haut) {
    const milieu = (bas + haut) >> 1;
    if (probasDecroissantes[milieu] >= p) bas = milieu + 1;
    else haut = milieu;
  }
  return Math.max(1, bas) / n;
}

// ---------------------------------------------------------------------------
// Ce qui pèse, en clair
// ---------------------------------------------------------------------------

const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;
const euros = (n) => `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, String.fromCharCode(160))}${String.fromCharCode(160)}€`;
const anneesMois = (mois) => (mois >= 24 ? pluriel(Math.round(mois / 12), 'an') : pluriel(Math.round(mois), 'mois', 'mois'));

/** Ce que dit une variable, dans les mots de la prospection. */
export function phraseVariable(f, v) {
  switch (f) {
    case 'multi_proprietaires_pm': return v === 1 ? 'Plusieurs sociétés possèdent des lots sur la parcelle' : v === 0 ? 'Une seule société possède la parcelle' : 'Aucune société propriétaire connue (souvent une personne physique)';
    case 'nb_vitrines_parcelle': return v != null ? `${pluriel(v, 'vitrine')} sur la parcelle` : null;
    case 'nb_locaux_proprio_parcelle': return v != null ? `Le propriétaire détient ${pluriel(v, 'local', 'locaux')} sur la parcelle` : null;
    case 'taille_portefeuille': return v != null ? `Le propriétaire détient ${pluriel(v, 'parcelle')} dans la commune` : null;
    case 'detention_min_annees': return v != null ? `Même propriétaire depuis au moins ${pluriel(v, 'an')}` : null;
    case 'detention_censuree': return v === 1 ? 'Propriétaire déjà là au premier millésime lu' : null;
    case 'vitrines_rue': return v != null ? `${pluriel(v, 'vitrine')} dans la rue` : null;
    case 'rang_rue_part': return v != null ? `Rue dans les ${Math.max(1, Math.round(v * 100))} % les plus commerçantes de la ville` : null;
    case 'procedures_rue_18m': return v != null ? (v ? `${pluriel(v, 'procédure collective', 'procédures collectives')} dans la rue en 18 mois` : 'Aucune procédure collective dans la rue en 18 mois') : null;
    case 'mois_depuis_mutation': return v != null ? `Dernière vente commerciale sur la parcelle il y a ${anneesMois(v)}` : null;
    case 'deja_mute': return v === 0 ? 'Aucune vente commerciale sur la parcelle dans DVF' : v === 1 ? 'La parcelle a déjà changé de mains' : null;
    case 'dernier_prix': return v != null ? `Dernière vente à ${euros(v)}` : null;
    case 'achete_en_bloc': return v === 1 ? 'Dernière vente en bloc (plusieurs lots)' : v === 0 ? 'Dernière vente d\'un seul lot' : null;
    case 'est_personne_morale': return v === 1 ? 'Propriétaire : une société' : null;
    case 'forme_sci': return v === 1 ? 'Propriétaire en SCI' : v === 0 ? 'Société propriétaire qui n\'est pas une SCI' : null;
    case 'rez_de_chaussee_pm': return v === 1 ? 'Le propriétaire détient le rez-de-chaussée' : null;
    case 'nb_ventes_autres_24m': return v != null ? (v ? `${pluriel(v, 'vente')} du propriétaire ailleurs en 24 mois` : 'Aucune vente du propriétaire ailleurs en 24 mois') : null;
    case 'a_vendu_ailleurs_24m': return v === 1 ? 'Le propriétaire a vendu ailleurs récemment' : null;
    case 'droit_demembre': return v === 1 ? 'Propriété démembrée (usufruit et nue-propriété)' : null;
    case 'enseigne_nationale': return v === 1 ? 'Une enseigne nationale sur la parcelle' : v === 0 ? 'Commerçants indépendants sur la parcelle' : null;
    case 'surface_bati': return v != null ? `${v} m² bâtis` : null;
    case 'mois_depuis_installation': return v != null ? `Commerçant installé depuis ${anneesMois(v)}` : null;
    case 'proximite_echeance_369': return v != null ? `À ${pluriel(v, 'mois', 'mois')} d'une échéance triennale` : null;
    case 'age_gerant': return v != null ? `Gérant autour de ${v} ans` : null;
    default: return null;
  }
}

/** D'où vient la raison : l'immeuble, le propriétaire, la rue, l'historique, le commerce. */
export const NATURE = {
  multi_proprietaires_pm: 'immeuble', nb_vitrines_parcelle: 'immeuble', nb_locaux_proprio_parcelle: 'immeuble', surface_bati: 'immeuble', rez_de_chaussee_pm: 'immeuble',
  taille_portefeuille: 'propriétaire', detention_min_annees: 'propriétaire', detention_censuree: 'propriétaire', est_personne_morale: 'propriétaire', forme_sci: 'propriétaire', droit_demembre: 'propriétaire', nb_ventes_autres_24m: 'propriétaire', a_vendu_ailleurs_24m: 'propriétaire', age_gerant: 'propriétaire',
  vitrines_rue: 'rue', rang_rue_part: 'rue', procedures_rue_18m: 'rue',
  mois_depuis_mutation: 'historique', deja_mute: 'historique', dernier_prix: 'historique', achete_en_bloc: 'historique',
  enseigne_nationale: 'commerce', mois_depuis_installation: 'commerce', proximite_echeance_369: 'commerce',
};

/**
 * Les raisons d'un score : les variables qui ont le plus poussé ou retenu,
 * chacune en phrase. Une contribution est en logit ; « forte » dès 0,3
 * (à peu près +35 % de chances relatives), « nette » dès 0,12.
 */
export function raisonsDe(contributions, variables, libelles = {}, { max = 5, seuil = 0.03 } = {}) {
  return Object.entries(contributions)
    .filter(([, c]) => Math.abs(c) >= seuil)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([f, c]) => ({
      variable: f,
      libelle: libelles[f] || f,
      phrase: phraseVariable(f, variables[f]) || `${libelles[f] || f} : inconnu`,
      sens: c > 0 ? 1 : -1,
      // « effet fort », « effet net », « effet léger » : le mot suit l'effet.
      force: Math.abs(c) >= 0.3 ? 'fort' : Math.abs(c) >= 0.12 ? 'net' : 'léger',
      nature: NATURE[f] || 'autre',
      contribution: Math.round(c * 1000) / 1000,
    }))
    .slice(0, max);
}

// ---------------------------------------------------------------------------
// Une ville
// ---------------------------------------------------------------------------

/**
 * Tout ce qu'il faut pour calculer les variables d'aujourd'hui dans une
 * commune. null quand le département n'a aucun millésime DGFiP : sans
 * propriétaire, les variables ne ressemblent plus à celles apprises.
 */
export async function contexteVille(insee, { journal = () => {} } = {}) {
  const dept = String(insee).slice(0, 2);
  const annee = new Date().getFullYear();
  const pm = new Map();
  for (let a = 2019; a <= annee; a += 1) {
    if (!dejaLa(a, dept)) continue;
    const groupes = (lirePM(a, dept) || []).filter((g) => g.commune === insee);
    if (groupes.length) pm.set(a, { parcelles: parParcelle(groupes), sirens: parSiren(groupes) });
  }
  const annees = [...pm.keys()].sort((a, b) => a - b);
  if (!annees.length) return null;
  const millesime = annees[annees.length - 1];
  // Aujourd'hui se lit au dernier millésime publié (situation au 1er janvier).
  if (millesime < annee) pm.set(annee, pm.get(millesime));

  const { lignes } = await lireCommune(insee, { journal });
  const mutations = mutationsParParcelle(indexerLocaux(lignes));
  const ventesParParcelle = new Map();
  for (const [parcelle, liste] of mutations) ventesParParcelle.set(parcelle, liste.filter((m) => m.vente).map((m) => m.date));

  const { chargerParcelles, indexerParcelles } = await import('./cadastre.js');
  const cadastre = indexerParcelles(await chargerParcelles(insee, { journal }));
  const releve = await osmDeLaCommune(insee, journal);
  const procedures = await proceduresDeLaCommune(insee, '2019-01-01', journal).catch(() => null);
  const { parcelles } = parcellesCommercantes(releve.vitrines, cadastre);

  return {
    insee, millesime, pm, mutations, ventesParParcelle, cadastre, parcelles, procedures,
    rues: new Map(Object.entries(releve.rues)),
    nationale: registreEnseignes(communesEnCache()),
  };
}

/** Les variables d'une parcelle à la date d'aujourd'hui, par le code de l'entraînement. */
export function variablesDeParcelle(ctx, parcelle, secours = {}) {
  const connue = ctx.parcelles.get(parcelle);
  const sujet = {
    ...(connue || { parcelle, rue: secours.rue || null, numero: null, vitrines_parcelle: 1, enseignes: secours.enseigne ? [secours.enseigne] : [], installation: null }),
    surface: null,
    mutations: ctx.mutations.get(parcelle) || [],
  };
  sujet.enseigne_nationale = ctx.nationale(sujet.enseignes);
  return featuresA(sujet, aujourdhui(), ctx);
}

/** Toutes les parcelles à vitrine de la ville, scorées : la référence du rang. */
export function classementVille(ctx, modele) {
  const probas = [];
  for (const parcelle of ctx.parcelles.keys()) probas.push(modele.predire(variablesDeParcelle(ctx, parcelle)));
  return probas.sort((a, b) => b - a);
}

/**
 * Le score d'une cible dans sa ville. Pure hormis ce que le contexte porte :
 * c'est ce qui se pose sur la cible et que classement.js lit.
 */
export function scoreDansVille(cible, { ctx, s, probas, libelles = {} }) {
  if (cible.lat == null || cible.lon == null) return null;
  const parcelle = ctx.cadastre.parcelleProche(Number(cible.lat), Number(cible.lon));
  if (!parcelle) return null;
  const variables = variablesDeParcelle(ctx, parcelle, { rue: cible.rue, enseigne: cible.enseigne });
  const { proba, contributions } = s.modele.expliquer(variables);
  const rang = rangDans(probas, proba);
  const tranches = tranchesDe(s.metrics);
  const tranche = trancheDe(tranches, rang);
  const groupe = groupeProprietaire(variables);
  return {
    proba: Math.round(proba * 10000) / 10000,
    rang_part: rang != null ? Math.round(rang * 1000) / 1000 : null,
    tranche: tranche ? { cle: tranche.cle, libelle: tranche.libelle, taux: tranche.taux, lift: tranche.lift, prevalence: tranche.prevalence } : null,
    fiabilite: { cle: groupe, ...FIABILITE[groupe] },
    raisons: raisonsDe(contributions, variables, libelles),
    parcelle,
    parcelle_a_vitrine: ctx.parcelles.has(parcelle),
    parcelles_ville: probas.length,
    millesime_dgfip: ctx.millesime,
    variables,
    modele_le: s.metrics?.le || null,
    le: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Le travail de fond : rescorer une ville et reclasser ses cibles
// ---------------------------------------------------------------------------

const enCours = new Map();

/** Rescore les cibles d'une ville, puis les reclasse. Une seule passe à la fois par ville. */
export function rescorerVille(villeId, { journal = console.log } = {}) {
  if (enCours.has(villeId)) return enCours.get(villeId);
  const tache = (async () => {
    const ville = Records.get('Ville', villeId);
    if (!ville?.code_insee) return { ok: false, raison: 'Ville sans code INSEE.' };
    const s = scorer();
    if (!s) return { ok: false, raison: 'Aucun modèle entraîné.' };
    const ctx = await contexteVille(ville.code_insee, { journal });
    if (!ctx) return { ok: false, raison: `Pas de fichier des sociétés propriétaires pour le département ${String(ville.code_insee).slice(0, 2)} : le modèle ne peut pas lire cette ville.` };
    const probas = classementVille(ctx, s.modele);
    const { libelles = {} } = s.colonnes || {};
    const { reclasser } = await import('./index.js');
    let scorees = 0;
    let sansParcelle = 0;
    for (const c of Records.filter('Cible', { ville_id: villeId })) {
      const score = scoreDansVille(c, { ctx, s, probas, libelles });
      if (!score) { sansParcelle += 1; continue; }
      Records.update('Cible', c.id, { score_ml: score });
      reclasser(c.id);
      scorees += 1;
    }
    journal(`[alx] ${ville.nom} : ${scorees} cibles scorées par le modèle sur ${probas.length} parcelles à vitrine (DGFiP ${ctx.millesime})${sansParcelle ? `, ${sansParcelle} sans parcelle` : ''}.`);
    return { ok: true, ville: ville.nom, cibles: scorees, sans_parcelle: sansParcelle, parcelles: probas.length, millesime_dgfip: ctx.millesime };
  })().finally(() => enCours.delete(villeId));
  enCours.set(villeId, tache);
  return tache;
}

export const rescoreEnCours = (villeId) => enCours.has(villeId);

/**
 * Rescore toutes les villes qui ont des cibles, l'une après l'autre. Une
 * ville que le modèle ne sait pas lire (pas de fichier des sociétés pour son
 * département) garde le classement par signaux, et le journal le dit.
 */
export async function rescorerToutesLesVilles({ journal = console.log } = {}) {
  const avecCibles = new Set(Records.list('Cible').map((c) => c.ville_id).filter(Boolean));
  const bilan = [];
  for (const ville of Records.list('Ville').filter((v) => avecCibles.has(v.id) && v.code_insee)) {
    try {
      const r = await rescorerVille(ville.id, { journal });
      if (!r.ok) journal(`[alx] ${ville.nom} : ${r.raison}`);
      bilan.push({ ville: ville.nom, ...r });
    } catch (e) {
      journal(`[alx] ${ville.nom} : score appris impossible (${e.message}).`);
      bilan.push({ ville: ville.nom, ok: false, raison: e.message });
    }
  }
  return bilan;
}
