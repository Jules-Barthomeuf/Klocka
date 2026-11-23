// Les fiches reçues par analyste (15 nov. 2026, Jules : « puisqu'on ne sait pas combien on reçoit de fiches par
// semaine, on ne peut pas savoir ce qu'une modification de la prospection change »). Dans Suivi seulement, jamais dans la
// Prospection : les chiffres sont encore presque tous à zéro, l'équipe ne les voit pas.
//
// Une fiche compte ses biens (fiches-stats.js, biensDe) : un PDF de trois biens en vaut trois, un logo zéro. Tous les
// chiffres comptent en fiches, jamais en envois (22 nov. 2026, Jules : « un pdf avec plusieurs fiches dedans et ça en
// compte qu'une ») : les fiches reçues, les dossiers, les Oui, le record ; `envois` garde le nombre de mails et de
// dépôts. Une ligne revient à une personne de l'équipe, dans cet ordre :
//   1. la correction à la main dans Suivi (« c'est Nora ») ;
//   2. « suite à l'appel » : l'agent qui l'envoie a été appelé par elle dans les FENETRE_JOURS d'avant ;
//   3. « transférée » : c'est elle qui l'a fait suivre à sourcing@ ;
//   4. sinon, la fiche est « spontanée ».
// Le chiffre qui juge la prospection : les biens « suite à l'appel » pour 100 appels. Une fiche rendue à la main à une
// personne compte avec eux : on la corrige parce que c'est son travail qui l'a fait venir.
//
// Pur : calculé sur les listes qu'on lui donne, testé sans base.

import { nomAgent as nomLisible } from '../nom-agent.js';
import { justesseDuCompte } from '../deal/justesse-compte.js';

export const FENETRE_JOURS = 60;
const JOUR = 86400000;
const min = (e) => String(e || '').trim().toLowerCase();
// L'étape d'une fiche (fiches-stats.js, etapeDuDossier) : reçue, Oui, présentée au client, aboutie ; « non » à part.
const ORDRE = ['recue', 'oui', 'presente', 'abouti'];
const rang = (etape) => (etape === 'non' ? 0 : Math.max(0, ORDRE.indexOf(etape)));
// Les fiches d'une ligne : ses biens (0 pour une ligne écartée ou corrigée à zéro).
const nb = (f) => (f.compte?.pas_fiche || f.ecartee ? 0 : f.biens ?? 1);
const avancer = (c, etape, n = 1) => {
  if (etape === 'non') { c.non += n; return; }
  const r = rang(etape);
  if (r >= 1) c.oui += n;
  if (r >= 2) c.presente += n;
  if (r >= 3) c.abouti += n;
};
/** Le record de biens en une semaine, sur toute l'histoire. */
const recordDe = (fiches) => {
  const par = new Map();
  for (const f of fiches) {
    const d = new Date(f.le || '');
    if (Number.isNaN(d.getTime())) continue;
    const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
    par.set(s, (par.get(s) || 0) + nb(f));
  }
  let r = { semaine: null, biens: 0 };
  for (const [semaine, biens] of par) if (biens > r.biens) r = { semaine, biens };
  return r;
};

/** Le record d'un analyste : le plus de fiches reçues en une semaine (du lundi au dimanche), sur toute l'histoire ; un PDF de quatre fiches en vaut quatre. */
export function recordAnalyste(fiches, analysteDe, prenom = (e) => e.split('@')[0]) {
  const par = new Map();
  for (const f of fiches) {
    const d = new Date(f.le || '');
    if (Number.isNaN(d.getTime())) continue;
    const qui = analysteDe(f);
    if (!qui) continue;
    const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
    const k = `${qui}|${s}`;
    if (!par.has(k)) par.set(k, { email: qui, semaine: s, fiches: 0, biens: 0, envois: 0 });
    const x = par.get(k);
    x.fiches += nb(f);
    x.biens += nb(f);
    x.envois += 1;
  }
  const meilleur = [...par.values()].filter((x) => x.fiches > 0).sort((a, b) => b.fiches - a.fiches || a.envois - b.envois || a.semaine.localeCompare(b.semaine))[0];
  return meilleur ? { ...meilleur, prenom: prenom(meilleur.email) } : null;
}

/** Pure : chaque adresse d'agent ou d'agence, et les appels qui l'ont jointe (les plus récents d'abord). */
export function appelsParAdresse(appels, { agents = new Map(), agences = new Map() } = {}) {
  const par = new Map();
  const noter = (email, appel) => {
    const e = min(email);
    if (!e.includes('@')) return;
    if (!par.has(e)) par.set(e, []);
    par.get(e).push(appel);
  };
  for (const x of appels) {
    const ag = x.agent_id ? agents.get(x.agent_id) : null;
    for (const e of ag?.emails || []) noter(e, x);
    const agence = x.agence_id ? agences.get(x.agence_id) : null;
    if (agence?.email) noter(agence.email, x);
    for (const a of agence?.agents || []) if (a?.email) noter(a.email, x);
  }
  for (const l of par.values()) l.sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return par;
}

/** Pure : à qui revient une fiche, et pourquoi. */
export function analysteDeLaFiche(f, parAdresse, { equipe = new Set(), fenetreJours = FENETRE_JOURS } = {}) {
  const corrige = f.compte?.analyste;
  // « Personne » à la main : la fiche est venue seule, même si son agent a été appelé.
  if (corrige === 'personne') return { analyste: null, via: 'spontanee' };
  if (corrige) return { analyste: min(corrige), via: 'corrige' };
  const t = Date.parse(f.le || '');
  if (f.agent_email && Number.isFinite(t)) {
    const appel = (parAdresse.get(min(f.agent_email)) || []).find((x) => {
      const ta = Date.parse(x.le);
      return ta <= t && t - ta <= fenetreJours * JOUR;
    });
    if (appel) return { analyste: min(appel.par), via: 'appel', appel_le: appel.le };
  }
  const tr = min(f.transferee_par);
  if (tr && (!equipe.size || equipe.has(tr))) return { analyste: tr, via: 'transfert' };
  const boite = min(f.boite);
  if (boite && equipe.has(boite)) return { analyste: boite, via: 'boite' };
  return { analyste: null, via: 'spontanee' };
}

/**
 * Pure : le tableau du Suivi.
 * @param {{ fiches, appels, agents?: Map, agences?: Map, equipe: Array<{email, prenom}>, depuis: string, maintenant?: Date }} d
 *   fiches : listerFiches ; appels : les appels téléphoniques de la période et d'avant (pour la fenêtre).
 */
export function fichesParAnalyste({ fiches = [], appels = [], agents = new Map(), agences = new Map(), equipe = [], depuis, avant = null, semaines = 8, maintenant = new Date(), fenetreJours = FENETRE_JOURS }) {
  const emails = new Set(equipe.map((m) => min(m.email)));
  const prenom = (e) => equipe.find((m) => min(m.email) === e)?.prenom || (e ? e.split('@')[0] : null);
  const parAdresse = appelsParAdresse(appels, { agents, agences });
  const dans = (iso) => String(iso || '') >= depuis;

  // Chaque fiche de l'histoire, rattachée une fois ; la période en est tirée.
  const toutes = fiches.map((f) => {
    const a = analysteDeLaFiche(f, parAdresse, { equipe: emails, fenetreJours });
    const ecartee = !!f.compte?.pas_fiche;
    return {
      id: f.id, le: f.le, titre: f.titre, ville: f.ville, agent: f.agent, agent_email: f.agent_email,
      biens: ecartee ? 0 : f.biens ?? 1, ecartee, biens_corriges: Number.isFinite(Number(f.compte?.biens)),
      analyste: a.analyste, prenom: a.analyste ? prenom(a.analyste) : null, via: a.via, appel_le: a.appel_le || null,
      deal_id: f.deal_id, etape: f.etape || 'recue',
      // Un dossier entré : la fiche a été ouverte en dossier pour être étudiée (20 nov. 2026, Jules : « combien on étudie de dossiers »).
      dossier: !!f.deal_id,
      // Où la fiche est rentrée (20 nov. 2026, Jules : « s'assurer qu'il soit vraiment bien rentré ») : « dossier »,
      // « memoire », ou « non » (un transfert à sourcing@ qui n'a rien donné, à reprendre).
      rentree: f.rentree || null,
      // Le contrôle du compte (22 nov. 2026) : l'écart entre ce que le document annonce et ce qui a été lu, ou une fiche
      // pas encore lue ; une liste de biens comptée à part ; les biens déjà reçus à la même adresse.
      a_verifier: !ecartee && !Number.isFinite(Number(f.compte?.biens)) ? f.a_verifier || null : null,
      liste: f.liste || 0,
      doublons: f.doublons || 0,
      // Vérifiée à la main (23 nov. 2026) : « Juste », un nombre corrigé, « Pas une fiche », ou ajoutée à la main.
      verifiee: f.canal === 'main' || !!(f.compte && (f.compte.valide || 'biens' in f.compte || f.compte.pas_fiche)),
      auto: f.compte?.auto ?? null,
      canal: f.canal || (f.par_mail ? 'mail' : 'depot'),
    };
  });
  const lignes = toutes.filter((l) => dans(l.le));
  const comptees = lignes.filter((l) => !l.ecartee);

  const appelsPeriode = appels.filter((x) => dans(x.le));
  const vide = () => ({ appels: 0, biens_appel: 0, biens_transfert: 0, fiches: 0, envois: 0, fiches_appel: 0, dossiers: 0, oui: 0, presente: 0, abouti: 0, non: 0 });
  const personnes = new Map(equipe.map((m) => [min(m.email), { email: min(m.email), prenom: m.prenom, ...vide() }]));
  const ligneDe = (e) => {
    if (!personnes.has(e)) personnes.set(e, { email: e, prenom: prenom(e), ...vide() });
    return personnes.get(e);
  };
  for (const x of appelsPeriode) ligneDe(min(x.par)).appels += 1;
  for (const l of comptees) {
    if (!l.analyste) continue;
    const p = ligneDe(l.analyste);
    p.fiches += l.biens;
    p.envois += 1;
    if (l.dossier) p.dossiers += l.biens;
    avancer(p, l.etape, l.biens);
    if (l.via === 'appel' || l.via === 'corrige') { p.biens_appel += l.biens; p.fiches_appel += l.biens; }
    else p.biens_transfert += l.biens;
  }
  const analystes = [...personnes.values()]
    .map((p) => ({ ...p, biens: p.biens_appel + p.biens_transfert, pour_100_appels: p.appels ? Math.round((p.biens_appel / p.appels) * 1000) / 10 : null, taux_oui: p.fiches ? Math.round((p.oui / p.fiches) * 100) : null,
      // Appels passés et fiches reçues (20 nov. 2026, Jules : « un ratio entre appels passés et fiches reçues, en pourcentage »).
      fiches_par_appel: p.appels ? Math.round((p.fiches_appel / p.appels) * 1000) / 10 : null }))
    .sort((a, b) => b.biens - a.biens || b.appels - a.appels);

  // Semaine par semaine : appels et biens suite à un appel, pour juger un changement sur plusieurs semaines.
  const lundi = (iso) => { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10); };
  const fin = lundi(maintenant);
  const liste = [];
  for (let i = semaines - 1; i >= 0; i -= 1) liste.push(new Date(Date.parse(`${fin}T00:00:00Z`) - i * 7 * JOUR).toISOString().slice(0, 10));
  const parSemaine = new Map(liste.map((s) => [s, { semaine: s, appels: 0, biens_appel: 0, biens: 0, fiches: 0, envois: 0, dossiers: 0, oui: 0, par_analyste: {}, fiches_par_analyste: {}, dossiers_par_analyste: {} }]));
  for (const x of appels) parSemaine.get(lundi(x.le)) && (parSemaine.get(lundi(x.le)).appels += 1);
  for (const f of fiches) {
    if (f.compte?.pas_fiche) continue;
    const s = parSemaine.get(lundi(f.le));
    if (!s) continue;
    const a = analysteDeLaFiche(f, parAdresse, { equipe: emails, fenetreJours });
    const n = nb(f);
    s.biens += n;
    s.fiches += n;
    s.envois += 1;
    if (rang(f.etape) >= 1) s.oui += n;
    if (a.via === 'appel' || a.via === 'corrige') s.biens_appel += n;
    const qui = a.analyste || 'personne';
    s.par_analyste[qui] = (s.par_analyste[qui] || 0) + n;
    s.fiches_par_analyste[qui] = (s.fiches_par_analyste[qui] || 0) + n;
    if (f.deal_id) { s.dossiers += n; s.dossiers_par_analyste[qui] = (s.dossiers_par_analyste[qui] || 0) + n; }
  }

  // Global : l'entonnoir des fiches de la période (une fiche présentée a eu son Oui), les agents et les villes qui en
  // envoient le plus (20 nov. 2026, Jules : « des statistiques de fiches dans Suivi, par analyste, global »).
  const entonnoir = { fiches: 0, envois: 0, dossiers: 0, oui: 0, presente: 0, abouti: 0, non: 0 };
  for (const l of comptees) { entonnoir.fiches += l.biens; entonnoir.envois += 1; if (l.dossier) entonnoir.dossiers += l.biens; avancer(entonnoir, l.etape, l.biens); }
  const premier = (q) => Object.entries(q).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const classer = (liste, cle, nom, max = 12) => {
    const par = new Map();
    for (const l of liste) {
      const k = cle(l);
      if (!k) continue;
      if (!par.has(k)) par.set(k, { cle: k, nom: nom(l), fiches: 0, biens: 0, oui: 0, analystes: {}, villes: {} });
      const x = par.get(k);
      x.fiches += l.biens; x.biens += l.biens;
      if (rang(l.etape) >= 1) x.oui += l.biens;
      if (l.analyste) x.analystes[l.analyste] = (x.analystes[l.analyste] || 0) + l.biens;
      if (l.ville) x.villes[l.ville.trim()] = (x.villes[l.ville.trim()] || 0) + l.biens;
    }
    return [...par.values()]
      .map(({ analystes: q, villes: v, ...x }) => {
        const e = premier(q);
        return { ...x, analyste: e ? prenom(e) : null, analyste_email: e, ville: premier(v) };
      })
      .sort((a, b) => b.biens - a.biens || b.oui - a.oui).slice(0, max);
  };
  const cleAgent = (l) => min(l.agent_email) || (l.agent ? l.agent.toLowerCase() : null);
  // « Prénom Nom », jamais l'adresse quand on peut l'éviter (22 nov. 2026, Jules : « le même format tout le temps »).
  const nomAgent = (l) => nomLisible(l.agent) || nomLisible(l.agent_email) || l.agent || l.agent_email;
  const agentsTop = classer(comptees, cleAgent, nomAgent);
  const villesTop = classer(comptees, (l) => (l.ville ? l.ville.trim().toLowerCase() : null), (l) => l.ville);
  // Le classement commun des agents (22 nov. 2026, Jules : « Meilleurs agents ») : sur toute l'histoire, pas la période.
  const agentsTous = classer(toutes.filter((l) => !l.ecartee), cleAgent, nomAgent, 60);
  // La période d'avant, de même longueur, pour l'écart des chiffres de tête (22 nov. 2026, maquette de Jules).
  const precedentes = avant ? toutes.filter((l) => !l.ecartee && String(l.le || '') >= avant && String(l.le || '') < depuis) : null;

  const somme = (k) => comptees.reduce((t, l) => t + (k(l) ? l.biens : 0), 0);
  return {
    fenetre_jours: fenetreJours,
    total: {
      appels: appelsPeriode.length,
      biens: somme(() => true),
      biens_appel: somme((l) => l.via === 'appel' || l.via === 'corrige'),
      biens_transfert: somme((l) => l.via === 'transfert' || l.via === 'boite'),
      biens_spontanes: somme((l) => l.via === 'spontanee'),
      ecartees: lignes.length - comptees.length,
      ...entonnoir,
      sans_analyste: somme((l) => !l.analyste),
      a_verifier: comptees.filter((l) => l.a_verifier).length,
      listes: comptees.filter((l) => l.liste).length,
      biens_listes: comptees.reduce((t, l) => t + (l.liste || 0), 0),
      non_rentrees: somme((l) => l.rentree === 'non'),
      fiches_appel: somme((l) => l.via === 'appel' || l.via === 'corrige'),
      fiches_par_appel: appelsPeriode.length ? Math.round((somme((l) => l.via === 'appel' || l.via === 'corrige') / appelsPeriode.length) * 1000) / 10 : null,
    },
    record: recordDe(fiches.filter((f) => !f.compte?.pas_fiche)),
    // La justesse du compte automatique, semaine par semaine depuis la remise à zéro (23 nov. 2026, Jules : « on pourra
    // mesurer l'amélioration au fil du temps ») : la part des envois vérifiés que la machine avait bien comptés.
    justesse: justesseDuCompte(fiches),
    // Le record d'un analyste (22 nov. 2026, Jules : « le record de fiches reçues, avec la tête de l'analyste qui l'a fait ») :
    // le plus de fiches en une semaine, sur toute l'histoire ; à égalité, les biens, puis le premier à l'avoir atteint.
    record_analyste: recordAnalyste(fiches.filter((f) => !f.compte?.pas_fiche), (f) => analysteDeLaFiche(f, parAdresse, { equipe: emails, fenetreJours }).analyste, prenom),
    agents: agentsTop,
    agents_tous: agentsTous,
    precedent: precedentes ? { fiches: precedentes.reduce((t, l) => t + l.biens, 0), envois: precedentes.length, dossiers: precedentes.reduce((t, l) => t + (l.dossier ? l.biens : 0), 0), biens: precedentes.reduce((t, l) => t + l.biens, 0) } : null,
    villes: villesTop,
    analystes,
    semaines: [...parSemaine.values()],
    fiches: lignes.sort((a, b) => String(b.le).localeCompare(String(a.le))),
  };
}
