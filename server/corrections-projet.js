// Les corrections de l'équipe sur les projets rentrés, et ce que la plateforme en apprend (13 nov. 2026, Jules : « quand
// on rentre le projet et que celui qui a analysé corrige des choses, je veux que toutes ces corrections soient loguées et
// que ça les utilise pour s'améliorer ; si tous les projets remettent une majuscule au départ, tu la mettras dès le
// départ, sans demander ; mets-le dans Suivi »).
//
// 1. Noter : chaque enregistrement d'un projet venu d'un dossier, par l'éditeur (PUT /api/entities/Project/:id), compare
//    l'avant et l'après champ par champ et garde ce qui a changé (CorrectionProjet). Les gestes de l'agent et d'AK ne
//    passent pas par cette route : seules les mains de l'équipe sont notées. La saisie au fil des touches se fond en une
//    correction : même projet, même champ, même personne, moins de quinze minutes.
// 2. Apprendre : une correction mécanique qui revient sur plusieurs projets devient une règle (majuscule au début d'un
//    champ, même texte remplacé par le même). Elle s'applique d'office, sans validation (Jules), et se coupe dans Suivi.
// 3. Appliquer : l'agent qui rentre un projet passe ses règles à la fin (agent-projet.js), et le dit dans ses étapes.
// Le reste (chiffres corrigés, cases remplies à la main) se lit dans Suivi > Corrections pour aller plus loin.

import { Records } from './db.js';

export const ENTITE = 'CorrectionProjet';
export const ENTITE_REGLE = 'RegleCorrection';
/** Projets distincts à partir desquels une correction mécanique devient une règle. */
export const SEUIL_REGLE = 3;
/** Une remplacement identique (même texte avant, même texte après) se retient dès deux projets. */
export const SEUIL_REMPLACEMENT = 2;
const FUSION_MS = 15 * 60000;
const FENETRE_JOURS = 90;

// Ce qui n'est pas une correction de contenu : l'ordre, les listes, les dates techniques, ce que l'agent tient à jour.
const IGNORES = new Set(['updated_date', 'created_date', 'created_by', 'sources_champs', 'champs_masques', 'photos', 'fichiers_projet', 'documents', 'docs_checklist', 'questions_ouverture', 'client_emails', 'admins', 'ordre_blocs', 'blocs_ajoutes', 'secteur', 'rentre_par_agent_le', 'statut', 'historique', 'versions', 'deal_id', 'lot_index', 'id']);

const LIBELLES = {
  titre: 'Titre', adresse_complete: 'Adresse', activite_locataire: 'Activité du locataire', nom_locataire: 'Nom du locataire',
  surface_m2: 'Surface', surface_detail: 'Détail de la surface', ville_secteur_champ1: 'Ville', ville_habitants_agglo: 'Habitants',
  ville_revenu_median: 'Revenu médian', marche_loyer_autour: 'Loyer autour', marche_rue_prix_m2: 'Prix résidentiel',
  marche_evolution_1an: 'Évolution sur un an', marche_evolution_5ans: 'Évolution sur cinq ans', bail_date_debut: 'Début du bail',
  echeance_bail: 'Échéance du bail', bail_date_echeance: 'Échéance du bail', locataire_depuis: 'Locataire depuis',
  loyer_annuel_ht: 'Loyer annuel', sim_loyer_initial_ht: 'Loyer (simulateur)', sim_prix_bien_fai: 'Prix FAI', sim_prix_bien_negocie: 'Prix négocié',
  sim_surface: 'Surface (simulateur)', sim_apport: 'Apport', sim_taux_interet: "Taux d'intérêt", sim_duree_credit: 'Durée du crédit',
  taxe_fonciere_an: 'Taxe foncière', charges_copropriete: 'Charges de copropriété', provision_charges: 'Provision de charges',
  description_bien: 'Description du bien', description_locataire: 'Description du locataire',
};
const ZONES = { bien: 'Bien', bail: 'Bail', locataire: 'Locataire', copropriete: 'Copropriété', analyse: 'Analyse du bail' };

/** Pure : le nom lisible d'un champ (« Activité du locataire », « Bien › activité › valeur »). */
export function libelleChamp(champ) {
  const c = String(champ || '');
  if (LIBELLES[c]) return LIBELLES[c];
  const [tete, ...reste] = c.split('.');
  if (tete === 'cases_forcees' && reste.length >= 2) {
    const quoi = reste.at(-1);
    return `${ZONES[reste[0]] || reste[0]} › ${reste.slice(1, -1).join(' ').replace(/_/g, ' ')}${quoi === 'valeur' ? '' : ` (${quoi})`}`;
  }
  if (tete === 'valeurs_forcees') return `Valeur forcée › ${reste.join(' ').replace(/_/g, ' ')}`;
  return c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());
}

const vide = (v) => v == null || (typeof v === 'string' && !v.trim());
const norme = (v) => String(v ?? '').trim();
const enNombre = (v) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[\s\u202f\u00a0\u20ac%]/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

/** Pure : le genre d'une correction, ce qui dit si elle s'apprend toute seule. */
export function genreCorrection(avant, apres) {
  if (vide(avant) && !vide(apres)) return 'ajout';
  if (!vide(avant) && vide(apres)) return 'retrait';
  const a = norme(avant);
  const b = norme(apres);
  if (a === b) return 'aucune';
  if (a.toLowerCase() === b.toLowerCase()) {
    if (a.slice(1) === b.slice(1)) return b[0] === b[0].toUpperCase() ? 'majuscule' : 'minuscule';
    return 'casse';
  }
  const forme = (s) => s.toLowerCase().replace(/[\s.,;:!?«»"'’()-]+/g, ' ').trim();
  if (forme(a) === forme(b)) return 'forme';
  if (enNombre(a) != null && enNombre(b) != null) return 'chiffre';
  return 'texte';
}

/** Pure : les feuilles d'une valeur (objets à plat jusqu'à trois niveaux), chemin → valeur simple. */
function feuilles(valeur, chemin, sortie, profondeur = 0) {
  if (valeur && typeof valeur === 'object' && !Array.isArray(valeur) && profondeur < 3) {
    for (const [k, v] of Object.entries(valeur)) feuilles(v, [...chemin, k], sortie, profondeur + 1);
  } else if (valeur == null || ['string', 'number', 'boolean'].includes(typeof valeur)) {
    sortie.set(chemin.join('.'), valeur);
  }
  return sortie;
}

/**
 * Pure : ce qui a changé entre le projet d'avant et ce qu'on enregistre. `affiche(champ)` rend la valeur que la page
 * montrait pour un champ calculé (une case du résumé jamais forcée), pour que « restauration rapide » → « Restauration
 * rapide » soit une majuscule et pas un ajout. Rend [{ champ, avant, apres, genre }].
 */
export function changements(avant = {}, patch = {}, { affiche = () => undefined } = {}) {
  const sortie = [];
  for (const [cle, nouveau] of Object.entries(patch || {})) {
    if (IGNORES.has(cle) || /_le$/.test(cle)) continue;
    const ancien = feuilles(avant?.[cle], [cle], new Map());
    for (const [champ, apres] of feuilles(nouveau, [cle], new Map())) {
      let av = ancien.get(champ);
      if (av === undefined) av = affiche(champ);
      if (typeof apres === 'boolean' || typeof av === 'boolean') continue;
      const genre = genreCorrection(av, apres);
      if (genre === 'aucune' || (vide(av) && vide(apres))) continue;
      if (genre === 'chiffre' && enNombre(av) === enNombre(apres)) continue;
      sortie.push({ champ, avant: vide(av) ? null : av, apres: vide(apres) ? null : apres, genre });
    }
  }
  return sortie;
}

/** La valeur montrée par une case du résumé, quand elle n'était pas encore forcée (cases_forcees.<zone>.<id>.valeur). */
async function afficheDe(projet) {
  let zones = null;
  return async (champ) => {
    const m = String(champ).match(/^cases_forcees\.([a-z_]+)\.([a-z0-9_]+)\.(valeur|detail|titre)$/);
    if (!m) return undefined;
    if (!zones) {
      try { zones = (await import('./projet-cases.js')).casesDuProjet(projet, { sansSources: true }); } catch { zones = {}; }
    }
    const c = (Array.isArray(zones[m[1]]) ? zones[m[1]] : []).find((x) => x.id === m[2]);
    return c ? c[m[3]] ?? undefined : undefined;
  };
}

/**
 * Note les corrections d'un enregistrement de projet par l'équipe. `avant` : le projet tel qu'il était, `patch` : ce qui
 * s'enregistre, `par` : l'adresse de la personne. Seulement les projets venus d'un dossier (rentrés par la plateforme).
 */
export async function noterCorrections(avant, patch, par, { maintenant = Date.now() } = {}) {
  if (!avant?.id || !(avant.deal_id || avant.rentre_par_agent_le) || !patch || typeof patch !== 'object') return [];
  const lire = await afficheDe(avant);
  const valeurs = new Map();
  for (const champ of Object.keys(patch)) {
    if (champ === 'cases_forcees') {
      for (const [z] of Object.entries(patch.cases_forcees || {})) {
        for (const quoi of ['valeur', 'detail', 'titre']) {
          const k = `cases_forcees.${z}.${quoi}`;
          valeurs.set(k, await lire(k));
        }
      }
    }
  }
  const liste = changements(avant, patch, { affiche: (champ) => valeurs.get(champ) });
  const notees = [];
  for (const c of liste) {
    const recent = Records.filter(ENTITE, { project_id: avant.id, champ: c.champ, par: par || null })
      .find((x) => maintenant - Date.parse(x.maj_le || x.le) < FUSION_MS);
    if (recent) {
      const genre = genreCorrection(recent.avant, c.apres);
      if (genre === 'aucune') { Records.delete(ENTITE, recent.id); continue; }
      notees.push(Records.update(ENTITE, recent.id, { apres: c.apres, genre, maj_le: new Date(maintenant).toISOString() }));
    } else {
      notees.push(Records.create(ENTITE, {
        project_id: avant.id, deal_id: avant.deal_id || null, titre: avant.titre || null, champ: c.champ, libelle: libelleChamp(c.champ),
        avant: c.avant, apres: c.apres, genre: c.genre, par: par || null, le: new Date(maintenant).toISOString(),
        projet_rentre_le: avant.rentre_par_agent_le || null,
      }));
    }
  }
  return notees;
}

const majusculeInitiale = (s) => { const t = String(s); return t ? t[0].toUpperCase() + t.slice(1) : t; };

/**
 * Pure : les règles que les corrections enseignent, et ce qui est encore en observation. `coupees` : les clés coupées
 * par Jules dans Suivi. Une règle se fonde sur des projets distincts, jamais sur plusieurs corrections du même.
 */
export function reglesDesCorrections(corrections = [], { coupees = new Set(), maintenant = Date.now() } = {}) {
  const depuis = maintenant - FENETRE_JOURS * 86400000;
  const recentes = corrections.filter((c) => Date.parse(c.le) >= depuis);
  const parChamp = new Map();
  for (const c of recentes) {
    if (!parChamp.has(c.champ)) parChamp.set(c.champ, []);
    parChamp.get(c.champ).push(c);
  }
  const regles = [];
  const observations = [];
  for (const [champ, liste] of parChamp) {
    const projets = (genre) => new Set(liste.filter((c) => c.genre === genre).map((c) => c.project_id));
    const maj = projets('majuscule');
    const contre = projets('minuscule');
    if (maj.size >= SEUIL_REGLE && contre.size === 0) {
      const cle = `majuscule:${champ}`;
      regles.push({ cle, type: 'majuscule', champ, libelle: libelleChamp(champ), phrase: `Mettre une majuscule au début de « ${libelleChamp(champ)} »`, projets: maj.size, active: !coupees.has(cle) });
    } else if (maj.size > 0) {
      observations.push({ champ, libelle: libelleChamp(champ), genre: 'majuscule', projets: maj.size, seuil: SEUIL_REGLE });
    }
    const paires = new Map();
    for (const c of liste.filter((x) => ['texte', 'forme', 'casse'].includes(x.genre) && x.avant != null && x.apres != null)) {
      const k = `${norme(c.avant)}\u0000${norme(c.apres)}`;
      if (!paires.has(k)) paires.set(k, { de: norme(c.avant), vers: norme(c.apres), projets: new Set() });
      paires.get(k).projets.add(c.project_id);
    }
    for (const p of paires.values()) {
      if (p.projets.size >= SEUIL_REMPLACEMENT) {
        const cle = `remplacement:${champ}:${p.de}`;
        regles.push({ cle, type: 'remplacement', champ, libelle: libelleChamp(champ), de: p.de, vers: p.vers, phrase: `Écrire « ${p.vers} » au lieu de « ${p.de} » dans « ${libelleChamp(champ)} »`, projets: p.projets.size, active: !coupees.has(cle) });
      }
    }
    for (const genre of ['ajout', 'chiffre', 'texte', 'retrait']) {
      const n = projets(genre).size;
      if (n) observations.push({ champ, libelle: libelleChamp(champ), genre, projets: n, seuil: null });
    }
  }
  regles.sort((a, b) => b.projets - a.projets);
  observations.sort((a, b) => b.projets - a.projets);
  return { regles, observations };
}

/** Pure : ce qu'une règle change à une valeur, ou undefined si elle n'y touche pas. */
export function appliquerRegle(regle, valeur) {
  if (typeof valeur !== 'string' || !valeur.trim()) return undefined;
  if (regle.type === 'majuscule') { const v = majusculeInitiale(valeur); return v !== valeur ? v : undefined; }
  if (regle.type === 'remplacement') return norme(valeur) === regle.de ? regle.vers : undefined;
  return undefined;
}

/** Les règles du moment, lues dans les corrections gardées. */
export function reglesDuMoment() {
  const coupees = new Set(Records.filter(ENTITE_REGLE, { coupee: true }).map((r) => r.cle));
  return reglesDesCorrections(Records.list(ENTITE), { coupees });
}

/** Coupe ou rallume une règle (Suivi > Corrections). */
export function couperRegle(cle, coupee, par) {
  const r = Records.findBy(ENTITE_REGLE, 'cle', cle);
  const maj = { cle, coupee: !!coupee, par: par || null, le: new Date().toISOString() };
  return r ? Records.update(ENTITE_REGLE, r.id, maj) : Records.create(ENTITE_REGLE, maj);
}

/**
 * Applique les règles actives à un projet que l'agent vient de rentrer : les champs simples, et les cases du résumé par
 * leur valeur affichée (forcée alors dans cases_forcees). Rend les lignes à dire dans les étapes de l'agent.
 */
export async function appliquerAuProjet(projetId) {
  const projet = Records.get('Project', projetId);
  if (!projet) return [];
  const { regles } = reglesDuMoment();
  const actives = regles.filter((r) => r.active);
  if (!actives.length) return [];
  const lire = await afficheDe(projet);
  const patch = {};
  const lignes = [];
  for (const r of actives) {
    const m = r.champ.match(/^cases_forcees\.([a-z_]+)\.([a-z0-9_]+)\.(valeur|detail|titre)$/);
    const actuelle = m ? (projet.cases_forcees?.[`${m[1]}.${m[2]}`]?.[m[3]] ?? await lire(r.champ)) : projet[r.champ];
    const nouvelle = appliquerRegle(r, actuelle);
    if (nouvelle === undefined) continue;
    if (m) {
      const cle = `${m[1]}.${m[2]}`;
      patch.cases_forcees = { ...(patch.cases_forcees || projet.cases_forcees || {}) };
      patch.cases_forcees[cle] = { ...(patch.cases_forcees[cle] || {}), [m[3]]: nouvelle };
    } else {
      patch[r.champ] = nouvelle;
    }
    lignes.push(`${r.libelle} : « ${actuelle} » → « ${nouvelle} »`);
    const fiche = Records.findBy(ENTITE_REGLE, 'cle', r.cle);
    const appliquee = { cle: r.cle, appliquee_n: (fiche?.appliquee_n || 0) + 1, appliquee_le: new Date().toISOString() };
    if (fiche) Records.update(ENTITE_REGLE, fiche.id, appliquee); else Records.create(ENTITE_REGLE, { ...appliquee, coupee: false });
  }
  if (Object.keys(patch).length) Records.update('Project', projetId, patch);
  return lignes;
}

/** Ce que Suivi > Corrections affiche : les règles, l'observation, les dernières corrections, les champs les plus repris. */
export function etatCorrections({ limite = 300 } = {}) {
  const toutes = Records.list(ENTITE).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  const { regles, observations } = reglesDuMoment();
  const appliquees = new Map(Records.list(ENTITE_REGLE).map((r) => [r.cle, r]));
  const projets = new Set(toutes.map((c) => c.project_id));
  const parChamp = new Map();
  for (const c of toutes) parChamp.set(c.libelle || c.champ, (parChamp.get(c.libelle || c.champ) || 0) + 1);
  return {
    regles: regles.map((r) => ({ ...r, appliquee_n: appliquees.get(r.cle)?.appliquee_n || 0, appliquee_le: appliquees.get(r.cle)?.appliquee_le || null })),
    observations,
    corrections: toutes.slice(0, limite),
    total: toutes.length,
    projets: projets.size,
    champs: [...parChamp].map(([libelle, n]) => ({ libelle, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    seuil: SEUIL_REGLE,
  };
}
