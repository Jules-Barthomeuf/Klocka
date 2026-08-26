// Journal d'usage : qui consulte quoi, et ce qu'on demande à l'assistant.
//
// Deux flux distincts, volontairement séparés :
//
//   VisitePage      — une ligne par page ouverte, par personne.
//   AssistantRequete — une ligne par échange avec l'assistant : la question,
//                      la réponse, les outils appelés, ceux qui ont agi.
//
// L'entité AssistantAction, elle, ne consigne que ce qui a touché un système
// extérieur. Les trois ensemble répondent à trois questions différentes : qui
// utilise la plateforme, ce qu'on demande à l'IA, et ce qui a réellement été
// exécuté.
//
// Écritures en meilleur effort : un journal ne doit jamais faire échouer
// l'action qu'il observe.

import { Records } from './db.js';

// Au-delà, l'historique pèse sans rien apprendre de plus.
const PLAFOND_VISITES = 20000;
const PLAFOND_REQUETES = 5000;

/** Consigne l'ouverture d'une page. */
export function consignerVisite({ page, url, user }) {
  if (!page) return null;
  try {
    const visite = Records.create('VisitePage', {
      page,
      url: url || null,
      par: user?.email || null,
      role: user?.role || null,
      le: new Date().toISOString(),
    });
    elaguer('VisitePage', PLAFOND_VISITES);
    return visite;
  } catch (e) {
    console.warn('[journal] visite non consignée :', e?.message || e);
    return null;
  }
}

/** Consigne un échange avec l'assistant. */
export function consignerRequete({ question, reponse, outils, actions, user, duree_ms, cout, jetons, contexte }) {
  try {
    const requete = Records.create('AssistantRequete', {
      question: String(question || '').slice(0, 2000),
      reponse: String(reponse || '').slice(0, 4000),
      // Les outils appelés disent ce que l'assistant a consulté ; les actions,
      // ce qu'il a modifié. La distinction compte.
      outils: outils || [],
      actions: actions || [],
      par: user?.email || null,
      le: new Date().toISOString(),
      duree_ms: duree_ms ?? null,
      cout: cout ?? null,
      jetons: jetons ?? null,
      sur: contexte?.deal_id || contexte?.projet_id || null,
    });
    elaguer('AssistantRequete', PLAFOND_REQUETES);
    return requete;
  } catch (e) {
    console.warn('[journal] requête non consignée :', e?.message || e);
    return null;
  }
}

// Le journal ne grossit pas indéfiniment : les plus anciennes lignes partent.
function elaguer(entite, plafond) {
  const tout = Records.list(entite);
  if (tout.length <= plafond) return;
  const trop = tout
    .sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')))
    .slice(0, tout.length - plafond);
  for (const l of trop) Records.delete(entite, l.id);
}

const jourDe = (iso) => (iso || '').slice(0, 10);

/**
 * Vue d'ensemble de l'usage.
 * @param {number} jours - fenêtre d'observation
 */
export function synthese(jours = 30) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const visites = Records.list('VisitePage').filter((v) => (v.le || '') >= depuis);
  const requetes = Records.list('AssistantRequete').filter((r) => (r.le || '') >= depuis);
  const actions = Records.list('AssistantAction').filter((a) => (a.le || '') >= depuis);

  const parPersonne = new Map();
  const ajouter = (email, champ) => {
    const cle = email || 'inconnu';
    const e = parPersonne.get(cle) || { email: cle, role: null, visites: 0, requetes: 0, actions: 0, derniere: null };
    e[champ] += 1;
    parPersonne.set(cle, e);
    return e;
  };
  for (const v of visites) {
    const e = ajouter(v.par, 'visites');
    e.role = e.role || v.role;
    if (!e.derniere || v.le > e.derniere) e.derniere = v.le;
  }
  for (const r of requetes) {
    const e = ajouter(r.par, 'requetes');
    if (!e.derniere || r.le > e.derniere) e.derniere = r.le;
  }
  for (const a of actions) ajouter(a.par, 'actions');

  const parPage = new Map();
  for (const v of visites) parPage.set(v.page, (parPage.get(v.page) || 0) + 1);

  const parJour = new Map();
  for (const v of visites) {
    const j = jourDe(v.le);
    const e = parJour.get(j) || { jour: j, visites: 0, requetes: 0 };
    e.visites += 1;
    parJour.set(j, e);
  }
  for (const r of requetes) {
    const j = jourDe(r.le);
    const e = parJour.get(j) || { jour: j, visites: 0, requetes: 0 };
    e.requetes += 1;
    parJour.set(j, e);
  }

  const outils = new Map();
  for (const r of requetes) for (const o of r.outils || []) outils.set(o, (outils.get(o) || 0) + 1);

  return {
    fenetre_jours: jours,
    totaux: {
      visites: visites.length,
      requetes: requetes.length,
      actions: actions.length,
      personnes: parPersonne.size,
    },
    personnes: [...parPersonne.values()].sort((a, b) => b.visites + b.requetes - (a.visites + a.requetes)),
    pages: [...parPage.entries()].map(([page, n]) => ({ page, visites: n })).sort((a, b) => b.visites - a.visites),
    jours: [...parJour.values()].sort((a, b) => a.jour.localeCompare(b.jour)),
    outils: [...outils.entries()].map(([outil, n]) => ({ outil, appels: n })).sort((a, b) => b.appels - a.appels),
  };
}

/** L'historique complet des échanges avec l'assistant, du plus récent au plus ancien. */
export function historiqueRequetes({ limite = 100, depuis = 0, par = null } = {}) {
  const tout = Records.list('AssistantRequete')
    .filter((r) => !par || r.par === par)
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')));
  return { total: tout.length, requetes: tout.slice(depuis, depuis + limite) };
}
