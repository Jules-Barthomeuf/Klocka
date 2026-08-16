// Cycle de vie d'un deal de préanalyse.
//
// Le statut vit À PLAT sur l'enregistrement Deal (Records.update fait un merge
// superficiel : on réécrit toujours le tableau `suivi` en entier). Les relances
// ne reposent sur aucun cron : `aRelancer()` est calculé au moment du listing.

import { Records } from '../db.js';

export const STATUTS = [
  'analyse',
  'documents_demandes',
  'documents_recus',
  'depouille',
  'abandonne',
  'projet_cree',
];

export const LIBELLES_STATUTS = {
  analyse: 'Analysé',
  documents_demandes: 'Docs demandés',
  documents_recus: 'Docs reçus',
  depouille: 'Dépouillé',
  abandonne: 'Abandonné',
  projet_cree: 'Projet créé',
};

// Transitions autorisées. L'abandon est possible à tout moment tant que le
// deal n'est pas déjà clos.
const TRANSITIONS = {
  analyse: ['documents_demandes', 'documents_recus', 'abandonne'],
  documents_demandes: ['documents_recus', 'depouille', 'abandonne'],
  documents_recus: ['depouille', 'abandonne'],
  depouille: ['projet_cree', 'abandonne'],
  abandonne: [],
  projet_cree: [],
};

export const RELANCE_JOURS = Math.max(1, Number(process.env.DEAL_RELANCE_JOURS) || 7);

export const statutDe = (deal) => deal?.statut || 'analyse';

export function aRelancer(deal) {
  return (
    statutDe(deal) === 'documents_demandes' &&
    !!deal.relance_prevue_le &&
    new Date(deal.relance_prevue_le) <= new Date()
  );
}

function dansXJours(jours) {
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d.toISOString();
}

/**
 * Ajoute une entrée au journal de suivi du deal (append, tableau réécrit).
 * @param {object} deal - l'enregistrement Deal complet (avec son id SQLite)
 * @param {object} evt  - { type, detail?, intention?, destinataire? }
 */
export function ajouterSuivi(deal, evt, user) {
  const suivi = [
    ...(deal.suivi || []),
    { le: new Date().toISOString(), par: user?.email || null, ...evt },
  ];
  Records.update('Deal', deal.id, { suivi });
  deal.suivi = suivi;
  return suivi;
}

/**
 * Change le statut d'un deal en validant la transition.
 * Pose les effets de bord du statut : date de relance, archivage.
 * @returns {{ ok: true, deal } | { ok: false, error }}
 */
export function changerStatut(deal, statut, { user, note } = {}) {
  const courant = statutDe(deal);
  if (statut === courant) return { ok: true, deal };
  if (!STATUTS.includes(statut)) return { ok: false, error: `Statut inconnu : ${statut}` };
  if (!(TRANSITIONS[courant] || []).includes(statut)) {
    return { ok: false, error: `Transition impossible : ${courant} → ${statut}` };
  }

  const patch = { statut };
  if (statut === 'documents_demandes') patch.relance_prevue_le = dansXJours(RELANCE_JOURS);
  if (statut === 'documents_recus' || statut === 'depouille') patch.relance_prevue_le = null;
  if (statut === 'abandonne' || statut === 'projet_cree') {
    patch.relance_prevue_le = null;
    if (statut === 'abandonne') patch.archived = true;
  }
  patch.suivi = [
    ...(deal.suivi || []),
    {
      le: new Date().toISOString(),
      par: user?.email || null,
      type: 'statut',
      detail: note || `${LIBELLES_STATUTS[courant]} → ${LIBELLES_STATUTS[statut]}`,
      de: courant,
      vers: statut,
    },
  ];

  Records.update('Deal', deal.id, patch);
  return { ok: true, deal: { ...deal, ...patch } };
}

/** Repousse la relance de X jours (après l'envoi d'un mail de relance). */
export function repousserRelance(deal, user) {
  const patch = { relance_prevue_le: dansXJours(RELANCE_JOURS) };
  patch.suivi = [
    ...(deal.suivi || []),
    { le: new Date().toISOString(), par: user?.email || null, type: 'relance', detail: `Relance envoyée, prochaine dans ${RELANCE_JOURS} jours` },
  ];
  Records.update('Deal', deal.id, patch);
  return { ...deal, ...patch };
}
