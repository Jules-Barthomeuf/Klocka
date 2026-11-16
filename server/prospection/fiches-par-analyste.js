// Les fiches reçues par analyste (15 nov. 2026, Jules : « puisqu'on ne sait pas combien on reçoit de fiches par
// semaine, on ne peut pas savoir ce qu'une modification de la prospection change »). Dans Suivi seulement, jamais dans la
// Prospection : les chiffres sont encore presque tous à zéro, l'équipe ne les voit pas.
//
// Une fiche compte ses biens (fiches-stats.js, biensDe) : un PDF de trois biens en vaut trois, un logo zéro. Elle revient
// à une personne de l'équipe, dans cet ordre :
//   1. la correction à la main dans Suivi (« c'est Nora ») ;
//   2. « suite à l'appel » : l'agent qui l'envoie a été appelé par elle dans les FENETRE_JOURS d'avant ;
//   3. « transférée » : c'est elle qui l'a fait suivre à sourcing@ ;
//   4. sinon, la fiche est « spontanée ».
// Le chiffre qui juge la prospection : les biens « suite à l'appel » pour 100 appels. Une fiche rendue à la main à une
// personne compte avec eux : on la corrige parce que c'est son travail qui l'a fait venir.
//
// Pur : calculé sur les listes qu'on lui donne, testé sans base.

export const FENETRE_JOURS = 60;
const JOUR = 86400000;
const min = (e) => String(e || '').trim().toLowerCase();

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
export function fichesParAnalyste({ fiches = [], appels = [], agents = new Map(), agences = new Map(), equipe = [], depuis, semaines = 8, maintenant = new Date(), fenetreJours = FENETRE_JOURS }) {
  const emails = new Set(equipe.map((m) => min(m.email)));
  const prenom = (e) => equipe.find((m) => min(m.email) === e)?.prenom || (e ? e.split('@')[0] : null);
  const parAdresse = appelsParAdresse(appels, { agents, agences });
  const dans = (iso) => String(iso || '') >= depuis;

  const lignes = fiches.filter((f) => dans(f.le)).map((f) => {
    const a = analysteDeLaFiche(f, parAdresse, { equipe: emails, fenetreJours });
    const ecartee = !!f.compte?.pas_fiche;
    return {
      id: f.id, le: f.le, titre: f.titre, ville: f.ville, agent: f.agent, agent_email: f.agent_email,
      biens: ecartee ? 0 : f.biens ?? 1, ecartee, biens_corriges: Number.isFinite(Number(f.compte?.biens)),
      analyste: a.analyste, prenom: a.analyste ? prenom(a.analyste) : null, via: a.via, appel_le: a.appel_le || null,
      deal_id: f.deal_id, etape: f.etape,
    };
  });
  const comptees = lignes.filter((l) => !l.ecartee);

  const appelsPeriode = appels.filter((x) => dans(x.le));
  const personnes = new Map(equipe.map((m) => [min(m.email), { email: min(m.email), prenom: m.prenom, appels: 0, biens_appel: 0, biens_transfert: 0, fiches: 0 }]));
  const ligneDe = (e) => {
    if (!personnes.has(e)) personnes.set(e, { email: e, prenom: prenom(e), appels: 0, biens_appel: 0, biens_transfert: 0, fiches: 0 });
    return personnes.get(e);
  };
  for (const x of appelsPeriode) ligneDe(min(x.par)).appels += 1;
  for (const l of comptees) {
    if (!l.analyste) continue;
    const p = ligneDe(l.analyste);
    p.fiches += 1;
    if (l.via === 'appel' || l.via === 'corrige') p.biens_appel += l.biens;
    else p.biens_transfert += l.biens;
  }
  const analystes = [...personnes.values()]
    .map((p) => ({ ...p, biens: p.biens_appel + p.biens_transfert, pour_100_appels: p.appels ? Math.round((p.biens_appel / p.appels) * 1000) / 10 : null }))
    .sort((a, b) => b.biens - a.biens || b.appels - a.appels);

  // Semaine par semaine : appels et biens suite à un appel, pour juger un changement sur plusieurs semaines.
  const lundi = (iso) => { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10); };
  const fin = lundi(maintenant);
  const liste = [];
  for (let i = semaines - 1; i >= 0; i -= 1) liste.push(new Date(Date.parse(`${fin}T00:00:00Z`) - i * 7 * JOUR).toISOString().slice(0, 10));
  const parSemaine = new Map(liste.map((s) => [s, { semaine: s, appels: 0, biens_appel: 0, biens: 0 }]));
  for (const x of appels) parSemaine.get(lundi(x.le)) && (parSemaine.get(lundi(x.le)).appels += 1);
  for (const f of fiches) {
    if (f.compte?.pas_fiche) continue;
    const s = parSemaine.get(lundi(f.le));
    if (!s) continue;
    const a = analysteDeLaFiche(f, parAdresse, { equipe: emails, fenetreJours });
    s.biens += f.biens ?? 1;
    if (a.via === 'appel' || a.via === 'corrige') s.biens_appel += f.biens ?? 1;
  }

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
    },
    analystes,
    semaines: [...parSemaine.values()],
    fiches: lignes.sort((a, b) => String(b.le).localeCompare(String(a.le))),
  };
}
