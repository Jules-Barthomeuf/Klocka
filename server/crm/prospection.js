// La Prospection, un tableau du CRM (11 nov. 2026, Jules : « un truc dans le CRM pour voir qui on a appelé, en
// tableau comme ce qu'on avait ») : les agences de toutes les listes de la Prospection, une ligne chacune, avec leur
// statut, le dernier appel (quand, par qui, l'issue), la relance prévue et la personne associée. Servi depuis Klocka
// (server/prospection/agent-ia.js), au format de l'écran du CRM, comme Utilisateurs. Pour l'équipe seule, en lecture :
// on appelle depuis la Prospection.

import { choisir } from './utilisateurs.js';

export const SINGULIER = 'prospection';
const erreur = (status, message) => Object.assign(new Error(message), { status });
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const prenom = (qui) => {
  const p = String(qui || '').split('@')[0].split(/[ ._-]/)[0];
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : '';
};

export function objet() {
  const champ = (nom, libelle, type) => ({ id: `p-${nom}`, nom, libelle, type, options: [], modifiable: false, colonne: true });
  const champs = [
    champ('name', 'Agence', 'TEXT'),
    champ('ville', 'Ville', 'TEXT'),
    champ('interlocuteur', 'Interlocuteur', 'TEXT'),
    champ('telephone', 'Téléphone', 'TEXT'),
    champ('statut', 'Statut', 'TEXT'),
    champ('dernierAppel', 'Dernier appel', 'DATE_TIME'),
    champ('appelePar', 'Appelé par', 'TEXT'),
    champ('issue', 'Issue', 'TEXT'),
    champ('relance', 'Relance', 'DATE'),
    champ('associe', 'Associé à', 'TEXT'),
  ];
  const colonnes = champs.map((c) => c.nom);
  const vue = (id, nom, filtres = [], tri = { champ: 'dernierAppel', sens: 'desc' }) => ({ id, nom, colonnes, tri, filtres });
  return {
    singulier: SINGULIER, pluriel: SINGULIER, nom: 'Prospection', nom_un: 'Agence', niveau: 'klocka', klocka: true, principal: 'name',
    champs,
    vues: [
      vue('p-appelees', 'Appelées', [{ champ: 'dernierAppel', op: 'non_vide' }]),
      vue('p-relances', 'À relancer', [{ champ: 'relance', op: 'non_vide' }], { champ: 'relance', sens: 'asc' }),
      vue('p-tout', 'Tout'),
    ],
    tri: { champ: 'dernierAppel', sens: 'desc' },
    liees: [],
    deplacer: [],
  };
}

/** Pure : la ligne du tableau d'une agence d'une liste (statut croisé par server/prospection/mode-appel.js). */
export function ligne(a, ville) {
  const s = a.statut || {};
  const interlocuteur = (a.gerants || [])[0]?.nom || (a.agents || [])[0]?.nom || '';
  return {
    id: a.id,
    name: a.nom || a.raison_sociale || '',
    ville: ville || '',
    interlocuteur,
    telephone: a.telephone || (a.agents || []).find((x) => x.telephone)?.telephone || '',
    statut: s.libelle || '',
    dernierAppel: s.appelee ? s.quand || null : null,
    appelePar: s.appelee ? prenom(s.qui) : '',
    issue: s.appelee ? s.dernier_statut || '' : '',
    relance: s.relance_le || null,
    associe: [...new Set([...(a.pour || []), s.proprietaire].filter(Boolean))].map(prenom).join(', '),
  };
}

// Relire toutes les listes coûte (le statut de chaque agence se recalcule) : gardé 30 secondes.
let garde = null;
async function lignes() {
  if (garde && Date.now() - garde.le < 30_000) return garde.lignes;
  const IA = await import('../prospection/agent-ia.js');
  const vues = new Set();
  const out = [];
  for (const l of IA.listes()) {
    for (const a of IA.liste(l.id)?.lignes || []) {
      if (a.fermee || vues.has(a.id)) continue;
      vues.add(a.id);
      out.push(ligne(a, l.ville));
    }
  }
  garde = { le: Date.now(), lignes: out };
  return out;
}

export async function page({ q = '', ...options } = {}) {
  const t = norm(q);
  const cherchees = (await lignes()).filter((l) => !t || norm(`${l.name} ${l.ville} ${l.interlocuteur} ${l.telephone} ${String(l.telephone).replace(/\D/g, '')} ${l.appelePar} ${l.associe}`).includes(t));
  const fiches = choisir(cherchees, { ...options, tri: options.tri || 'dernierAppel', sens: options.tri ? options.sens : 'desc' });
  return { fiches, liens: {}, suite: null, total: fiches.length };
}

export async function fiche(id) {
  const l = (await lignes()).find((x) => x.id === id);
  if (!l) throw erreur(404, 'Agence introuvable.');
  return { fiche: l, liens: {}, liees: [], notes: [], taches: [], pieces: [] };
}

export async function changer() {
  throw erreur(403, 'La Prospection se lit ici ; on appelle et on note depuis la page Prospection.');
}
