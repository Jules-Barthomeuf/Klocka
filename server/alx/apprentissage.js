// Ce qu'ALX apprend des corrections de l'équipe sur les rues.
//
// Quand l'équipe reclasse une rue, elle dit pourquoi. Chaque correction
// devient une leçon (LeconRue) qui garde la rue telle qu'ALX la voyait :
// loyer, vitrines, longueur, type de voie, flux. Trois usages :
//   - tout de suite, proposer les rues semblables de la même ville, pour
//     corriger d'un coup ce qui se ressemble ;
//   - au prochain relevé, appliquer les règles apprises avant de proposer :
//     un plafond de classe pour les rues qui ressemblent à celles qu'on a
//     rétrogradées (résidentielles, trop courtes, sans passage), un plancher
//     pour celles qui ressemblent à une rue qu'on a montée ;
//   - la rue corrigée elle-même garde sa classe pour toujours (c'est déjà le
//     cas : une rue classée à la main n'est jamais reproposée autrement).
// Tout est écrit avec sa raison, et se lit dans le motif de la rue.

import { Records } from '../db.js';
import { libelleEmplacement } from './rues.js';

// Chaque motif a un sens : « baisse » quand l'équipe rétrograde une rue (de
// 1 vers 1 bis, de 1 bis vers 2), « hausse » quand elle la monte. On ne
// propose que ceux du bon sens : « loyer trop haut » n'explique pas une montée.
export const MOTIFS = [
  { cle: 'loyer_surestime', sens: 'baisse', mot: 'Loyer de marché trop haut pour cette rue', portee: 'rue', detail: 'Retenu pour cette rue seulement.' },
  { cle: 'peu_de_passage', sens: 'baisse', mot: 'Trop peu de passage', portee: 'partout', detail: 'Les rues aussi calmes ne monteront plus au-dessus de cette classe.' },
  { cle: 'residentielle', sens: 'baisse', mot: 'Rue de quartier, résidentielle', portee: 'partout', detail: 'Les rues de ce type, aussi peu denses, resteront à cette classe.' },
  { cle: 'trop_courte', sens: 'baisse', mot: 'Trop courte, trop peu de vitrines', portee: 'partout', detail: 'Les rues aussi courtes et aussi peu garnies resteront à cette classe.' },
  { cle: 'vacance', sens: 'baisse', mot: 'Beaucoup de locaux vides', portee: 'rue', detail: 'Retenu pour cette rue seulement.' },
  { cle: 'loyer_sousestime', sens: 'hausse', mot: 'Loyer de marché trop bas pour cette rue', portee: 'rue', detail: 'Retenu pour cette rue seulement.' },
  { cle: 'artere', sens: 'hausse', mot: 'Artère ou place principale de la ville', portee: 'partout', detail: 'Les rues aussi longues et aussi garnies de la ville monteront à cette classe.' },
  { cle: 'beaucoup_de_passage', sens: 'hausse', mot: 'Beaucoup de passage', portee: 'partout', detail: 'Les rues aussi passantes et aussi denses monteront à cette classe.' },
  { cle: 'meilleure', sens: 'hausse', mot: 'Plus commerçante que le loyer ne le dit', portee: 'partout', detail: 'Les rues aussi denses, du même type, monteront à cette classe.' },
  { cle: 'autre', sens: 'les_deux', mot: 'Autre raison', portee: 'rue', detail: 'Retenu pour cette rue seulement.' },
];

/** Les motifs qui expliquent un passage de `de` à `vers` (1 < 1.5 < 2). */
export const motifsPour = (de, vers) => MOTIFS.filter((m) => m.sens === 'les_deux' || (de == null ? true : m.sens === (vers < de ? 'hausse' : 'baisse')));

const motifDe = (cle) => MOTIFS.find((m) => m.cle === cle) || MOTIFS[MOTIFS.length - 1];

const maintenant = () => new Date().toISOString();
const milieu = (loyer) => (loyer?.[0] != null && loyer?.[1] != null ? (loyer[0] + loyer[1]) / 2 : null);
const RESIDENTIELS = new Set(['residential', 'living_street', 'unclassified', 'pedestrian']);

/** La rue telle qu'ALX la voit, en chiffres : ce que les leçons retiennent. */
export function traitsDe(r) {
  const vitrines = r.commerces ?? r.vitrines ?? 0;
  const longueur = r.longueur_m || null;
  return {
    loyer_milieu: milieu(r.loyer),
    vitrines,
    longueur_m: longueur,
    densite: longueur ? vitrines / (Math.max(longueur, 50) / 100) : null,
    type: r.type || null,
    flux: r.flux?.note ?? r.flux_estime?.note ?? null,
  };
}

/** Écrit une leçon : la rue, la classe d'ALX, celle de l'équipe, la raison. */
export function enregistrerLecon({ ville, rue, de, vers, motif_cle = 'autre', motif = null, user = null }) {
  return Records.create('LeconRue', {
    ville_id: ville.id,
    ville: ville.nom,
    rue: rue.nom,
    cle: rue.cle || null,
    de,
    vers,
    motif_cle: motifDe(motif_cle).cle,
    motif: motif || null,
    traits: traitsDe(rue),
    par: user?.email || null,
    le: maintenant(),
  }, user?.email);
}

export const leconsDe = (villeId = null) => Records.list('LeconRue').filter((l) => !villeId || l.ville_id === villeId || motifDe(l.motif_cle).portee === 'partout');

/**
 * Les rues de la même ville qui ressemblent à celle qu'on vient de corriger,
 * pour la raison donnée : mêmes chiffres, même classe d'origine. Pure.
 */
export function ruesSemblables(rue, rues, motif_cle, n = 6) {
  const t = traitsDe(rue);
  const de = rue.classe;
  const proches = (a, b, marge) => a != null && b != null && Math.abs(a - b) <= Math.abs(b) * marge;
  const test = {
    loyer_surestime: (x) => proches(x.loyer_milieu, t.loyer_milieu, 0.15),
    peu_de_passage: (x) => (x.flux ?? 5) <= (t.flux ?? 5) && (x.densite ?? 0) <= (t.densite ?? 0) * 1.2,
    residentielle: (x, r) => RESIDENTIELS.has(r.type) && (x.densite ?? 0) <= (t.densite ?? 0) * 1.2,
    trop_courte: (x) => (x.longueur_m ?? 9e9) <= (t.longueur_m ?? 0) * 1.2 && (x.vitrines ?? 0) <= (t.vitrines ?? 0) * 1.2,
    meilleure: (x, r) => r.type === rue.type && (x.densite ?? 0) >= (t.densite ?? 0) * 0.8,
    beaucoup_de_passage: (x) => (x.flux ?? 0) >= (t.flux ?? 0) && (x.densite ?? 0) >= (t.densite ?? 0) * 0.8,
    artere: (x) => (x.longueur_m ?? 0) >= (t.longueur_m ?? 0) * 0.8 && (x.vitrines ?? 0) >= (t.vitrines ?? 0) * 0.8,
  }[motif_cle];
  if (!test) return [];
  return rues
    .filter((r) => r.nom !== rue.nom && r.classe === de && !r.correction)
    .map((r) => ({ r, x: traitsDe(r) }))
    .filter(({ r, x }) => test(x, r))
    .sort((a, b) => Math.abs((a.x.densite ?? 0) - (t.densite ?? 0)) - Math.abs((b.x.densite ?? 0) - (t.densite ?? 0)))
    .slice(0, n)
    .map(({ r, x }) => ({ nom: r.nom, classe: r.classe, commerces: r.commerces, longueur_m: r.longueur_m, loyer: r.loyer, type: r.type, densite: x.densite != null ? Math.round(x.densite * 10) / 10 : null }));
}

/**
 * Les règles que les leçons permettent de tirer. Pure.
 * - un plafond de classe pour les rues résidentielles, trop courtes ou sans
 *   passage, calé sur la plus « grosse » des rues rétrogradées pour ce motif,
 *   à partir de deux corrections ;
 * - un plancher pour les rues montées : aussi denses et du même type (plus
 *   commerçante), aussi passantes (beaucoup de passage), aussi longues et
 *   garnies (artère).
 * Les motifs sur le loyer restent propres à leur rue : l'emplacement étant un
 * rang dans la ville, corriger un loyer ne se généralise pas.
 */
export function reglesApprises(lecons) {
  const plafonds = {};
  const planchers = [];
  for (const l of lecons) {
    const t = l.traits || {};
    if (['peu_de_passage', 'residentielle', 'trop_courte'].includes(l.motif_cle) && l.vers > l.de) {
      const p = (plafonds[l.motif_cle] = plafonds[l.motif_cle] || { motif_cle: l.motif_cle, plafond: l.vers, n: 0, densite_max: 0, longueur_max: 0, vitrines_max: 0, flux_max: 0, types: new Set() });
      p.n += 1;
      p.plafond = Math.max(p.plafond, l.vers);
      p.densite_max = Math.max(p.densite_max, t.densite || 0);
      p.longueur_max = Math.max(p.longueur_max, t.longueur_m || 0);
      p.vitrines_max = Math.max(p.vitrines_max, t.vitrines || 0);
      p.flux_max = Math.max(p.flux_max, t.flux || 0);
      if (t.type) p.types.add(t.type);
    } else if (['meilleure', 'beaucoup_de_passage', 'artere'].includes(l.motif_cle) && l.vers < l.de) {
      planchers.push({ motif_cle: l.motif_cle, classe: l.vers, type: t.type, densite_min: t.densite || 0, flux_min: t.flux || 0, longueur_min: t.longueur_m || 0, vitrines_min: t.vitrines || 0, n: 1 });
    }
  }
  return {
    plafonds: Object.values(plafonds).filter((p) => p.n >= 2).map((p) => ({ ...p, types: [...p.types] })),
    planchers,
  };
}

/**
 * Applique les règles à une rue qu'ALX s'apprête à proposer. Rend la rue,
 * avec la classe et le motif corrigés quand une règle joue. Pure.
 */
export function appliquerLecons(rue, regles) {
  let r = { ...rue };
  const notes = [];
  const t = traitsDe(r);
  for (const p of regles.plafonds || []) {
    const ressemble = p.motif_cle === 'residentielle' ? RESIDENTIELS.has(r.type) && (t.densite ?? 0) <= p.densite_max * 1.05
      : p.motif_cle === 'trop_courte' ? (t.longueur_m ?? 9e9) <= p.longueur_max * 1.05 && (t.vitrines ?? 0) <= p.vitrines_max
        : (t.flux ?? 5) <= p.flux_max && (t.densite ?? 0) <= p.densite_max * 1.05;
    if (ressemble && r.classe < p.plafond) { r.classe = p.plafond; notes.push(`${motifDe(p.motif_cle).mot.toLowerCase()}, comme ${p.n} rues que vous avez reclassées`); }
  }
  for (const p of regles.planchers || []) {
    const ressemble = p.motif_cle === 'beaucoup_de_passage' ? (t.flux ?? 0) >= p.flux_min && (t.densite ?? 0) >= p.densite_min * 0.95
      : p.motif_cle === 'artere' ? (t.longueur_m ?? 0) >= p.longueur_min * 0.95 && (t.vitrines ?? 0) >= p.vitrines_min * 0.95
        : r.type === p.type && (t.densite ?? 0) >= p.densite_min;
    if (ressemble && r.classe > p.classe) {
      r.classe = p.classe;
      notes.push(p.motif_cle === 'artere' ? 'aussi longue et garnie qu\'une artère que vous avez montée' : p.motif_cle === 'beaucoup_de_passage' ? 'aussi passante qu\'une rue que vous avez montée' : 'aussi commerçante qu\'une rue que vous avez montée');
    }
  }
  if (notes.length) {
    r.motif = `${r.motif || ''} · ${libelleEmplacement(r.classe)} d'après vos corrections : ${notes.join(' ; ')}`.replace(/^ · /, '');
    r.apprise = true;
  }
  return r;
}
