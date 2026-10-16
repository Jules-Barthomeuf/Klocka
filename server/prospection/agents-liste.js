// La page Agents (16 oct. 2026, Jules) : tous les agents immobiliers du carnet,
// en cartes comme les Clients, et pour chacun l'intégralité de ses appels :
// qui a appelé, quand, l'issue, et la transcription quand elle a été gardée
// (depuis le 13 oct.), sinon le résumé et les notes. La fiche elle-même
// (échanges, mails, fiches, parcours, qui a échangé avec lui) est celle de
// server/prospection/fiche-contact.js.

import { Records } from '../db.js';
import { ISSUES, appelReel } from './fiche-contact.js';

const SANS_PERSONNE = new Set(['repondeur', 'pas_de_reponse']);
const nomAgent = (a) => [a?.prenom, a?.nom_famille].filter(Boolean).join(' ') || a?.nom || 'Agent';
const minuscule = (s) => String(s || '').trim().toLowerCase();

/** Pure : la ligne d'un agent, avec ses appels comptés. */
export function ligneAgent(a, siens = []) {
  const tries = [...siens].sort((x, y) => String(y.le).localeCompare(String(x.le)));
  const dernier = tries[0] || null;
  const contact = [a.dernier_contact_le, dernier?.le].filter(Boolean).sort().at(-1) || null;
  return {
    id: a.id, nom: nomAgent(a), agence: a.agence || null, ville: a.ville || null, poste: a.poste || null, statut: a.statut || null,
    referent: minuscule(a.referent) || null, telephone: (a.telephones || [])[0] || null, email: (a.emails || [])[0] || null,
    appels: siens.length, conversations: siens.filter((x) => !SANS_PERSONNE.has(x.issue)).length,
    dernier_contact: contact, dernier_par: dernier ? minuscule(dernier.par) : null,
    appelants: [...new Set(siens.map((x) => minuscule(x.par)).filter(Boolean))],
    resume: dernier?.resume || a.resume_dernier_appel || null,
  };
}

/** Tous les agents du carnet (sans les fiches d'essai), les derniers contactés d'abord. */
export function listerAgents({ agents = Records.list('AgentImmo'), appels = Records.list('AppelAgent') } = {}) {
  const parAgent = new Map();
  for (const x of appels) {
    if (!x.agent_id || !appelReel(x)) continue;
    if (!parAgent.has(x.agent_id)) parAgent.set(x.agent_id, []);
    parAgent.get(x.agent_id).push(x);
  }
  return agents.filter((a) => !a.essai)
    .map((a) => ligneAgent(a, parAgent.get(a.id) || []))
    .sort((x, y) => String(y.dernier_contact || '').localeCompare(String(x.dernier_contact || '')) || x.nom.localeCompare(y.nom, 'fr'));
}

/** Pure : un appel, en entier. */
export function appelEntier(x) {
  const champs = Object.fromEntries(Object.entries(x.compris?.champs || {}).map(([k, v]) => [k, Array.isArray(v?.valeur) ? v.valeur.join(' ; ') : v?.valeur ?? null]).filter(([, v]) => v));
  return {
    id: x.id, le: x.le, par: minuscule(x.par) || null, issue: ISSUES[x.issue] || x.issue || null, conversation: !SANS_PERSONNE.has(x.issue),
    entrant: !!x.rappel_entrant, duree_s: Number(x.duree_s) || null,
    resume: x.resume || null, passe: x.passe || null, notes: x.notes || null, pourquoi_relance: x.pourquoi_relance || null,
    transcription: x.transcription_gardee || null,
    citations: Object.entries(x.citations || {}).filter(([, v]) => v).map(([cle, phrase]) => ({ cle, phrase })),
    compris: champs, objection: x.objection || null,
  };
}

/** Tous les appels d'un agent, du plus récent au plus ancien. */
export function appelsDeLAgent(id, { appels = Records.list('AppelAgent') } = {}) {
  return appels.filter((x) => x.agent_id === id && appelReel(x)).sort((a, b) => String(b.le).localeCompare(String(a.le))).map(appelEntier);
}
