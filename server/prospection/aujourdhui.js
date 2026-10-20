// L'onglet Aujourd'hui des Appels (19 oct. 2026, Jules) : une page divisée, « À relancer » et « À rappeler », chaque
// analyste avec ses personnes, et la transcription complète de chaque appel à un clic.
//
// À rappeler : la dernière fois, on n'a pas parlé à la bonne personne (pas de réponse, répondeur, à rappeler, il
// rappelle). À relancer : on s'est parlé, la suite convenue tombe aujourd'hui ou est en retard (point du mois, fiche
// pas arrivée, mail à relire…). Une personne est à l'analyste qui l'a appelée en premier (la règle des relances du
// matin, 17 oct. 2026) ; sans appel validé, elle est à l'équipe.

import { Records } from '../db.js';
import * as R from './regles.js';

/** La transcription se garde entière : 200 000 caractères, plus de trois heures d'appel. */
export const TRANSCRIPTION_MAX = 200000;

const A_RAPPELER = ['pas_de_reponse', 'repondeur', 'a_rappeler', 'rappelle_bientot', 'invalide'];
const norm = (e) => String(e || '').trim().toLowerCase();
const reel = (x) => !x.essai && !x.faux && !['remplace', 'abandonne'].includes(x.etat);

/** Pure : « à rappeler » ou « à relancer », d'après le dernier appel (ou le statut, sans appel). */
export function colonneDe(agent, dernier) {
  if (dernier) return A_RAPPELER.includes(dernier.issue_tapee || dernier.issue) ? 'rappeler' : 'relancer';
  return agent.statut === 'a_rappeler' || agent.statut === 'nouveau' ? 'rappeler' : 'relancer';
}

/**
 * Pure : les personnes du jour, en deux colonnes. `pour` : l'analyste ; `tous` : toute l'équipe.
 * @returns {{relancer: Array, rappeler: Array, miens: number, equipe: number}}
 */
export function aujourdhui({ pour, tous = false, maintenant = new Date(), agents = [], appels = [], users = [] } = {}) {
  const auj = R.jourDe(maintenant);
  const admins = new Map(users.filter((u) => u.role === 'admin').map((u) => [norm(u.email), (u.full_name || u.email || '').split(/[ @.]/)[0]]));
  const prenom = (e) => admins.get(norm(e)) || (String(e || '').split(/[@.]/)[0] || null);
  const parAgent = new Map();
  for (const x of appels.filter(reel)) {
    if (!x.agent_id) continue;
    const l = parAgent.get(x.agent_id) || [];
    l.push(x);
    parAgent.set(x.agent_id, l);
  }
  const jours = (le) => Math.round((Date.parse(`${auj}T12:00:00Z`) - Date.parse(`${String(le).slice(0, 10)}T12:00:00Z`)) / 86400000);
  const lignes = [];
  for (const a of agents) {
    if (a.essai || a.statut === 'archive' || a.ne_plus_appeler || !a.prochaine?.le || String(a.prochaine.le).slice(0, 10) > auj) continue;
    const siens = (parAgent.get(a.id) || []).sort((x, y) => String(x.le).localeCompare(String(y.le)));
    const premier = siens.find((x) => x.etat === 'valide' && x.par && admins.has(norm(x.par)));
    const proprietaire = premier ? norm(premier.par) : null;
    if (!tous && proprietaire !== norm(pour)) continue;
    const dernier = siens[siens.length - 1] || null;
    const retard = jours(a.prochaine.le);
    lignes.push({
      id: a.id, nom: a.nom, agence: a.agence && a.agence !== a.nom ? a.agence : null, ville: a.ville || null, telephone: (a.telephones || [])[0] || null,
      quoi: a.prochaine.quoi || 'rappeler', le: String(a.prochaine.le).slice(0, 10), retard, heure: a.prochaine.heure || null,
      colonne: colonneDe(a, dernier),
      proprietaire: proprietaire ? { email: proprietaire, prenom: prenom(proprietaire) } : null,
      appels: siens.length,
      dernier_appel: dernier ? { id: dernier.id, le: dernier.le, par: prenom(dernier.par), issue: R.ISSUES[dernier.issue_tapee || dernier.issue] || dernier.issue || null, transcription: !!String(dernier.transcription_gardee || '').trim(), duree_s: dernier.duree_s || null } : null,
      verrou: R.verrouTenu(a.verrou) ? { par: a.verrou.par, prenom: prenom(a.verrou.par), a_moi: norm(a.verrou.par) === norm(pour) } : null,
    });
  }
  // Les plus en retard d'abord, puis l'heure dite, puis le nom.
  lignes.sort((x, y) => y.retard - x.retard || String(x.heure || '99').localeCompare(String(y.heure || '99')) || String(x.nom).localeCompare(String(y.nom)));
  return { relancer: lignes.filter((l) => l.colonne === 'relancer'), rappeler: lignes.filter((l) => l.colonne === 'rappeler') };
}

/** Lu dans la base. */
export function aujourdhuiDeLaBase({ pour, tous = false, maintenant = new Date() } = {}) {
  return aujourdhui({ pour, tous, maintenant, agents: Records.list('AgentImmo'), appels: Records.list('AppelAgent'), users: Records.list('User') });
}

/** Les appels d'un agent, les plus récents d'abord, avec leur transcription complète, leurs notes et ce que l'IA en a tiré. */
export function appelsDeLAgent(agentId) {
  const users = Records.list('User');
  const prenom = (e) => (users.find((u) => norm(u.email) === norm(e))?.full_name || e || '').split(/[ @.]/)[0] || null;
  const a = Records.get('AgentImmo', agentId);
  if (!a) return { ok: false, error: 'Agent introuvable.' };
  const appels = Records.list('AppelAgent').filter((x) => x.agent_id === agentId && reel(x)).sort((x, y) => String(y.le).localeCompare(String(x.le)))
    .map((x) => ({
      id: x.id, le: x.le, par: prenom(x.par), issue: R.ISSUES[x.issue_tapee || x.issue] || x.issue || null, duree_s: x.duree_s || null,
      sens: x.rappel_entrant ? (x.sens === 'sortant' ? 'Appel rapide' : x.sens === 'raconte' ? 'Échange raconté' : 'Il a rappelé') : 'Appel',
      transcription: String(x.transcription_gardee || '').trim() || null,
      notes: x.notes || null, passe: x.passe || null, resume: x.resume || null,
    }));
  return { ok: true, agent: { id: a.id, nom: a.nom, agence: a.agence || null, telephone: (a.telephones || [])[0] || null, prochaine: a.prochaine || null }, appels };
}
