// « Il me rappelle » (spec du 8 oct. 2026) : un agent rappelle sur le
// téléphone de l'analyste. L'enregistrement démarre d'un seul tap, sans
// chercher qui appelle ; on l'identifie après, parmi trois candidats au plus
// (ses appels sans réponse des trois derniers jours, les noms entendus, un
// numéro tapé dans les notes), puis l'appel suit exactement le chemin d'un
// appel sortant du mode appel : AK lit l'appel, l'écran d'actions, la
// validation, le reçu relu. Rien n'est exécuté sans agent identifié et sans
// validation.
//
// Les notes de l'analyste font foi sur la transcription (email, numéro, nom,
// date). Comme les autres appels, l'audio ne se garde pas ; la transcription
// du rappel n'est gardée que jusqu'à la validation ou l'abandon.

import { Records } from '../db.js';
import * as R from './regles.js';
import { prenomDe } from './equipe.js';

const ENTITE = 'RappelEntrant';
const AGENCE = 'AgenceProspect';
const LISTE = 'ListeAgences';
const APPEL = 'AppelAgent';
const SANS_REPONSE = ['pas_de_reponse', 'repondeur'];
const OUVERTS = ['enregistrement', 'a_identifier', 'identifie'];
const TROIS_JOURS = 3 * 86400000;

const maintenant = () => new Date().toISOString();
const moiDe = (user) => String(user?.email || '').toLowerCase();

// ---------------------------------------------------------------------------
// Les notes font foi
// ---------------------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const TEL = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/;

/** Pure : l'email et le numéro tapés dans les notes, au format vérifié ; ce qui ressemble à un email sans en être un est signalé. */
export function lireNotes(notes) {
  const t = String(notes || '');
  const email = (t.match(EMAIL) || [])[0] || null;
  const tel = (t.match(TEL) || [])[0] || null;
  const presqueEmail = !email && /\S+@\S+/.test(t) ? (t.match(/\S+@\S+/) || [])[0] : null;
  return {
    email: email ? R.normEmail(email) : null,
    telephone: tel && R.normTel(tel) ? R.telAffiche(tel) : null,
    avertissements: [presqueEmail ? `« ${presqueEmail} » n'est pas une adresse valide` : null].filter(Boolean),
  };
}

/** Pure : ce qui a été compris, corrigé par les notes : leur email et leur numéro remplacent ceux entendus. */
export function notesFontFoi(compris, notes) {
  const n = lireNotes(notes);
  const champs = { ...(compris?.champs || {}) };
  if (n.email) champs.email = { valeur: n.email, source: 'Notes de l\'analyste', note: true };
  if (n.telephone) champs.telephone = { valeur: n.telephone, source: 'Notes de l\'analyste', note: true };
  return { ...(compris || {}), champs };
}

/** Pure : le texte qu'AK lit : la transcription, puis les notes, qui l'emportent en cas de désaccord. */
export const texteAAnalyser = (transcription, notes) => [
  transcription ? String(transcription).trim() : null,
  String(notes || '').trim() ? `Notes de l'analyste (elles font foi sur la transcription : email, numéro, nom, date) :\n${String(notes).trim()}` : null,
].filter(Boolean).join('\n\n');

/** Pure : un appel sans contenu utile (« Rien de nouveau ») : presque rien d'entendu, rien de noté. */
export const sansContenu = (transcription, notes) => String(transcription || '').trim().length < 40 && !String(notes || '').trim();

// ---------------------------------------------------------------------------
// Qui a appelé : trois candidats au plus
// ---------------------------------------------------------------------------

const MOTS_VIDES = new Set(['agence', 'agences', 'immobilier', 'immobiliere', 'immo', 'cabinet', 'groupe', 'transaction', 'transactions', 'commerce', 'commerces', 'entreprise', 'entreprises', 'conseil', 'gestion', 'monsieur', 'madame', 'real', 'estate', 'properties', 'france', 'bonjour', 'merci']);
const mots = (s) => R.norm(s).split(' ').filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));

/** Pure : « aujourd'hui à 10 h 12 », « hier à 9 h 05 », « lundi à 16 h 40 ». */
export function quandDit(iso, maintenantD = new Date()) {
  const d = new Date(iso);
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' }).format(d).replace(':', ' h ');
  const j = R.jourDe(d);
  const auj = R.jourDe(maintenantD);
  if (j === auj) return `aujourd'hui à ${heure}`;
  if (j === R.plusJours(auj, -1)) return `hier à ${heure}`;
  return `${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(d)} à ${heure}`;
}

// Les heures dites en lettres (« à dix heures ») : une à vingt-trois.
const HEURES_MOTS = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, midi: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix sept': 17, 'dix huit': 18, 'dix neuf': 19, vingt: 20, 'vingt et une': 21, 'vingt et un': 21, 'vingt deux': 22, 'vingt trois': 23 };

/**
 * Pure : l'heure et le jour de notre appel tels que dits (« vous m'avez
 * appelé à 10 h », « hier à dix heures », « ce matin »). L'heure en minutes
 * depuis minuit, ou null ; le jour : 'hier', 'aujourdhui' ou null.
 */
export function momentDit(texte) {
  const t = R.norm(String(texte || '').replace(/-/g, ' '));
  let minutes = null;
  const chiffres = t.match(/\b(\d{1,2})\s*(?:h|heures?)\s*(\d{2})?\b/);
  if (chiffres && Number(chiffres[1]) <= 23) minutes = Number(chiffres[1]) * 60 + Number(chiffres[2] || 0);
  if (minutes == null) {
    const mot = Object.keys(HEURES_MOTS).sort((x, y) => y.length - x.length).find((k) => new RegExp(`\\b${k}\\s+heures?\\b`).test(t) || (k === 'midi' && /\bmidi\b/.test(t)));
    if (mot) minutes = HEURES_MOTS[mot] * 60 + (new RegExp(`\\b${mot}\\s+heures?\\s+et\\s+demie`).test(t) ? 30 : 0);
  }
  const jour = /\bhier\b/.test(t) ? 'hier' : /\b(ce matin|cet apres midi|aujourd hui|tout a l heure|tout a l heure)\b/.test(t) ? 'aujourdhui' : null;
  return { minutes, jour };
}

const minutesParis = (iso) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  return (Number(p.find((x) => x.type === 'hour')?.value) % 24) * 60 + Number(p.find((x) => x.type === 'minute')?.value || 0);
};

/** Pure : un nom entendu dans le texte : tous ses mots qui comptent y sont (deux au moins pour une personne). */
export function entendu(nom, texteNorm, { personne = false } = {}) {
  const m = mots(nom);
  if (!m.length || (personne && m.length < 2 && m[0].length < 6)) return false;
  return m.every((x) => new RegExp(`\\b${x}\\b`).test(texteNorm));
}

/**
 * Pure : les candidats, classés. Un numéro tapé dans les notes est une
 * preuve : il passe devant. Puis les appels sans réponse de l'analyste (les
 * plus récents d'abord), renforcés si le nom est aussi entendu, puis les noms
 * entendus seuls. Deux homonymes restent deux candidats, chacun avec son
 * agence et sa ville : jamais de choix automatique.
 */
export function classer({ sansReponse = [], agents = [], agences = [], texte = '', notes = '', maintenantD = new Date() }) {
  const t = R.norm(`${texte} ${notes}`);
  const tel = lireNotes(notes).telephone ? R.normTel(lireNotes(notes).telephone) : null;
  const scores = new Map();
  const ajouter = (cle, base, points, raison) => {
    const x = scores.get(cle) || { ...base, score: 0, raisons: [] };
    x.score += points;
    if (raison && !x.raisons.includes(raison)) x.raisons.push(raison);
    scores.set(cle, x);
  };
  for (const a of agents) {
    const base = { cle: a.id, agent_id: a.id, agence_id: a.agence_id || null, nom: a.nom, agence: a.agence || null, ville: a.ville || null, telephone: (a.telephones || [])[0] || null, ne_plus_appeler: !!a.ne_plus_appeler || a.statut === 'archive' };
    if (tel && (a.telephones || []).some((x) => R.normTel(x) === tel)) ajouter(a.id, base, 100, 'numéro des notes');
    if (entendu(a.nom, t, { personne: true })) ajouter(a.id, base, 20, 'nom entendu');
    else if (a.agence && entendu(a.agence, t)) ajouter(a.id, base, 8, 'agence entendue');
  }
  // L'heure ou le jour de notre appel, s'ils ont été dits, départagent les sans-réponse ; un appel qui ne colle pas sort du lot.
  const dit = momentDit(`${texte} ${notes}`);
  const auj = R.jourDe(maintenantD);
  sansReponse.forEach((x, i) => {
    const a = agents.find((y) => y.id === x.agent_id);
    if (!a) return;
    const base = { cle: a.id, agent_id: a.id, agence_id: x.agence_id || a.agence_id || null, nom: a.nom, agence: a.agence || null, ville: a.ville || null, telephone: (a.telephones || [])[0] || null, ne_plus_appeler: !!a.ne_plus_appeler || a.statut === 'archive' };
    let points = 40 - i;
    let raison = `appelé ${quandDit(x.le, maintenantD)}`;
    if (dit.minutes != null) {
      const ecart = Math.abs(minutesParis(x.le) - dit.minutes);
      if (ecart <= 60) { points += 30; raison += ', l\'heure dite'; } else points -= 60;
    }
    if (dit.jour) {
      const j = R.jourDe(new Date(x.le));
      const attendu = dit.jour === 'hier' ? R.plusJours(auj, -1) : auj;
      if (j === attendu) points += 10; else points -= 30;
    }
    ajouter(a.id, base, points, raison);
  });
  for (const g of agences) {
    if (g.carnet_id && scores.has(g.carnet_id)) continue;
    const base = { cle: g.carnet_id || `ag:${g.id}`, agent_id: g.carnet_id || null, agence_id: g.id, nom: g.monday_connu?.nom || null, agence: g.nom, ville: g.ville || null, telephone: g.telephone || null, ne_plus_appeler: !!g.ne_plus_appeler };
    if (tel && [g.telephone, ...(g.agents || []).map((x) => x.telephone)].some((x) => R.normTel(x) === tel)) ajouter(base.cle, base, 100, 'numéro des notes');
    else if (entendu(g.nom, t)) ajouter(base.cle, base, 8, 'agence entendue');
  }
  // Un candidat sans rien pour lui (un appel qui ne colle pas à l'heure dite) ne se propose pas.
  const t3 = [...scores.values()].filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 3);
  // « Probablement » seulement s'il se détache : sinon « Peut-être », et l'analyste choisit.
  return t3.map((x, i) => ({ ...x, raison: x.raisons.join(', '), probable: i === 0 && x.score >= 30 && (!t3[1] || x.score - t3[1].score >= 10) }));
}

/** Les candidats d'un rappel, lus dans la base. */
function candidatsDe(rappel, maintenantD = new Date()) {
  const listes = new Map(Records.list(LISTE).filter((l) => !l.essai).map((l) => [l.id, l]));
  const agencesTout = Records.list(AGENCE).filter((g) => (g.liste_id ? listes.has(g.liste_id) : g.hors_liste));
  const parCarnet = new Map(agencesTout.filter((g) => g.carnet_id).map((g) => [g.carnet_id, g]));
  const agents = Records.list('AgentImmo').filter((a) => !a.essai).map((a) => {
    const g = parCarnet.get(a.id);
    return { ...a, agence_id: g?.id || null, agence: a.agence || g?.nom || null, ville: a.ville || (g ? listes.get(g.liste_id)?.ville || g.ville : null) };
  });
  const depuis = new Date(maintenantD.getTime() - TROIS_JOURS).toISOString();
  const sansReponse = Records.list(APPEL)
    .filter((x) => x.par === rappel.par && SANS_REPONSE.includes(x.issue) && !x.essai && String(x.le) >= depuis)
    .sort((x, y) => String(y.le).localeCompare(String(x.le)))
    .filter((x, i, t) => t.findIndex((y) => y.agent_id === x.agent_id) === i);
  const agences = agencesTout.map((g) => ({ ...g, ville: g.liste_id ? listes.get(g.liste_id)?.ville : g.ville }));
  return classer({ sansReponse, agents, agences, texte: rappel.transcription || '', notes: rappel.notes || '', maintenantD });
}

/** Chercher l'agent : les 4 derniers chiffres de son numéro, son nom, ou son agence. */
export function chercher(q, { max = 8 } = {}) {
  const brut = String(q || '').trim();
  const chiffres = brut.replace(/\D/g, '');
  const t = R.norm(brut);
  if (chiffres.length < 4 && t.length < 2) return [];
  const finit = (x) => chiffres.length >= 4 && R.normTel(x || '').endsWith(chiffres.slice(-Math.min(chiffres.length, 10)));
  const listes = new Map(Records.list(LISTE).filter((l) => !l.essai).map((l) => [l.id, l]));
  const out = [];
  const vus = new Set();
  for (const a of Records.list('AgentImmo')) {
    if (a.essai) continue;
    if ((a.telephones || []).some(finit) || (!chiffres.length && t.length >= 2 && (R.norm(a.nom).includes(t) || R.norm(a.agence).includes(t)))) {
      out.push({ cle: a.id, agent_id: a.id, agence_id: null, nom: a.nom, agence: a.agence || null, ville: a.ville || null, telephone: (a.telephones || [])[0] || null, ne_plus_appeler: !!a.ne_plus_appeler || a.statut === 'archive' });
      vus.add(a.id);
    }
  }
  for (const g of Records.list(AGENCE)) {
    if (!(g.liste_id ? listes.has(g.liste_id) : g.hors_liste) || (g.carnet_id && vus.has(g.carnet_id))) continue;
    if ([g.telephone, ...(g.agents || []).map((x) => x.telephone)].some(finit) || (!chiffres.length && t.length >= 2 && R.norm(g.nom).includes(t))) {
      out.push({ cle: g.carnet_id || `ag:${g.id}`, agent_id: g.carnet_id || null, agence_id: g.id, nom: g.monday_connu?.nom || null, agence: g.nom, ville: g.liste_id ? listes.get(g.liste_id)?.ville : g.ville || null, telephone: g.telephone || null, ne_plus_appeler: !!g.ne_plus_appeler });
    }
    if (out.length >= max * 3) break;
  }
  return out.slice(0, max);
}

// ---------------------------------------------------------------------------
// Le rappel, de l'enregistrement à la validation
// ---------------------------------------------------------------------------

/** Ce que l'écran reçoit d'un rappel : sans la transcription brute quand il est fini. */
function vue(r) {
  if (!r) return null;
  const agent = r.agent_id ? Records.get('AgentImmo', r.agent_id) : null;
  const agence = r.agence_id ? Records.get(AGENCE, r.agence_id) : null;
  return {
    id: r.id, etat: r.etat, debut: r.debut, fin: r.fin || null, duree_s: r.duree_s || null,
    notes: r.notes || '', notes_analysees: r.notes_analysees ?? null, transcription: r.transcription || null, transcription_echec: r.transcription_echec || null,
    candidats: r.candidats || [], appel_id: r.appel_id || null, rien_de_nouveau: !!r.rien_de_nouveau,
    agent: agent ? { id: agent.id, nom: agent.nom, agence: agent.agence || agence?.nom || null, telephone: (agent.telephones || [])[0] || null } : null,
    agence: agence ? { id: agence.id, nom: agence.nom } : null,
    avertissements: r.avertissements || [],
    notes_avertissements: lireNotes(r.notes).avertissements,
    // L'appel à valider, pour reprendre l'écran d'actions là où on l'avait laissé.
    appel: appelAValider(r, agence),
  };
}

function appelAValider(r, agence) {
  const a = r.appel_id ? Records.get(APPEL, r.appel_id) : null;
  if (!a || a.etat !== 'a_valider') return null;
  return { id: a.id, agent_id: a.agent_id, agence: agence?.nom || a.agent, issue: a.issue, issue_tapee: a.issue_tapee || a.issue, issue_deduite: true, resume: a.resume, compris: a.compris, propositions: a.propositions || [], biens: a.biens || [], citations: a.citations || null, rappel_entrant: true };
}

export function ouvrir(user) {
  const r = Records.create(ENTITE, { par: moiDe(user), debut: maintenant(), etat: 'enregistrement', notes: '' });
  return { ok: true, rappel: vue(r) };
}

export function lire(id, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user)) return { ok: false, error: 'Rappel introuvable.' };
  return { ok: true, rappel: vue(reconcilier(r)) };
}

/** Un rappel dont l'appel a été validé (ailleurs, ou avant une coupure) est fini. */
function reconcilier(r) {
  if (!OUVERTS.includes(r.etat) || !r.appel_id) return r;
  const a = Records.get(APPEL, r.appel_id);
  if (a?.etat === 'valide') return Records.update(ENTITE, r.id, { etat: 'valide', transcription: null, termine_le: maintenant() });
  return r;
}

/** Les rappels de l'analyste pas encore terminés : le bandeau « Rappel à terminer ». */
export function enCours(user) {
  const moi = moiDe(user);
  return Records.list(ENTITE).filter((r) => r.par === moi && OUVERTS.includes(r.etat)).map(reconcilier).filter((r) => OUVERTS.includes(r.etat))
    .sort((x, y) => String(y.debut).localeCompare(String(x.debut)))
    .map((r) => ({ id: r.id, etat: r.etat, debut: r.debut, agent: r.agent_id ? Records.get('AgentImmo', r.agent_id)?.nom || null : null }));
}

export function noter(id, notes, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || !OUVERTS.includes(r.etat)) return { ok: false, error: 'Rappel introuvable.' };
  const n = String(notes || '').slice(0, 4000);
  const r2 = Records.update(ENTITE, id, { notes: n, candidats: r.etat === 'a_identifier' ? candidatsDe({ ...r, notes: n }) : r.candidats });
  return { ok: true, rappel: vue(r2) };
}

/**
 * Stop : la transcription se termine (les morceaux déjà transcrits pendant
 * l'appel, et ceux qui ne l'étaient pas encore), puis les candidats.
 */
export async function finir(id, { morceaux = [], audios = [], notes = null, duree_s = null }, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user)) return { ok: false, error: 'Rappel introuvable.' };
  let k = 0;
  const textes = [];
  let echec = null;
  const { transcrire } = await import('./appel.js');
  for (const m of morceaux) {
    if (typeof m === 'string') { textes.push(m); continue; }
    const b = audios[k++];
    if (b) { try { textes.push(await transcrire(b)); } catch (e) { echec = String(e?.message || e).slice(0, 200); } }
  }
  const transcription = textes.filter(Boolean).join('\n').trim() || null;
  const base = { ...r, transcription, notes: notes != null ? String(notes).slice(0, 4000) : r.notes };
  const r2 = Records.update(ENTITE, id, {
    etat: 'a_identifier', fin: maintenant(), duree_s, transcription, transcription_echec: echec,
    notes: base.notes, candidats: candidatsDe(base),
  });
  return { ok: true, rappel: vue(r2) };
}

/** L'agence d'un agent du carnet, ou une ligne hors des listes de villes pour pouvoir l'appeler. */
async function agenceDe(agentId) {
  const g = Records.list(AGENCE).filter((x) => x.carnet_id === agentId).sort((x, y) => (x.liste_id ? 0 : 1) - (y.liste_id ? 0 : 1))[0];
  if (g) return g;
  const f = Records.get('AgentImmo', agentId);
  return Records.create(AGENCE, { liste_id: null, hors_liste: true, nom: f.agence || f.nom, telephone: (f.telephones || [])[0] || null, email: (f.emails || [])[0] || null, ville: f.ville || null, carnet_id: f.id, sources: ['Carnet'], cree_pour: 'rappel', cree_le: maintenant() });
}

/**
 * L'agent est confirmé (un candidat, une recherche, ou un nouveau contact).
 * Avertissements : « Ne plus appeler » en rouge, et la relance qu'un collègue
 * avait prise, libérée : le rappel est prioritaire.
 */
export async function identifier(id, { agent_id = null, agence_id = null, nouveau = null }, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || !OUVERTS.includes(r.etat)) return { ok: false, error: 'Rappel introuvable.' };
  let agentId = agent_id;
  let agence = agence_id ? Records.get(AGENCE, agence_id) : null;
  if (nouveau) {
    const nom = String(nouveau.nom || '').trim();
    if (!nom) return { ok: false, error: 'Le nom du contact manque.' };
    const g = nouveau.agence_id ? Records.get(AGENCE, nouveau.agence_id) : null;
    const notes = lireNotes(r.notes);
    const C = await import('./carnet.js');
    const c = { nom, agence: g?.nom || String(nouveau.agence || '').trim() || null, ville: nouveau.ville || g?.ville || null, telephone: nouveau.telephone || notes.telephone || null, email: nouveau.email || notes.email || null, source: 'Rappel entrant' };
    const integre = R.clesDe(c).length ? C.integrer([c]) : null;
    const fiche = integre?.crees[0] || (integre ? C.agents().find((a) => (c.telephone && (a.telephones || []).map(R.normTel).includes(R.normTel(c.telephone))) || (c.email && (a.emails || []).includes(R.normEmail(c.email)))) : null)
      || Records.create('AgentImmo', C.ficheDuCandidat(c));
    agentId = fiche.id;
    agence = g || null;
    if (agence && !agence.carnet_id) Records.update(AGENCE, agence.id, { carnet_id: fiche.id });
    C.journal(fiche.id, { type: 'note', texte: 'Nouveau contact, depuis un rappel entrant', par: moiDe(user) });
  }
  if (!agentId && agence?.carnet_id) agentId = agence.carnet_id;
  if (!agentId && agence) {
    // Une agence jamais appelée : elle entre au carnet, comme au premier appel sortant.
    const IA = await import('./agent-ia.js');
    const p = await IA.pourAppeler(agence.id, {}, user);
    if (!p.ok) return p;
    agentId = p.agent_id;
  }
  const f = agentId ? Records.get('AgentImmo', agentId) : null;
  if (!f) return { ok: false, error: 'Agent introuvable.' };
  if (!agence) agence = await agenceDe(f.id);
  const avertissements = [];
  if (f.ne_plus_appeler || f.statut === 'archive' || agence.ne_plus_appeler) {
    const le = f.ne_plus_appeler_le || (f.journal || []).find((j) => /ne plus appeler|pas intéressé/i.test(j.texte || ''))?.le || f.maj_le || null;
    avertissements.push({ genre: 'ne_plus_appeler', texte: `Ne plus appeler${le ? `, depuis le ${new Date(le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` : ''}` });
  }
  // Une relance prise par un collègue : le rappel passe devant, sa ligne est libérée.
  const RL = await import('./relances.js');
  const prise = RL.prises()[f.id] || RL.prises()[`ag:${agence.id}`];
  if (prise && prise.par !== moiDe(user)) {
    avertissements.push({ genre: 'pris', texte: `En cours chez ${prise.prenom} : sa relance est libérée, le rappel passe devant.` });
    RL.liberer(f.id);
    RL.liberer(`ag:${agence.id}`);
  }
  const r2 = Records.update(ENTITE, id, { etat: 'identifie', agent_id: f.id, agence_id: agence.id, avertissements });
  return { ok: true, rappel: vue(r2) };
}

/** Lever « Ne plus appeler » : l'agent est revenu de lui-même. Confirmation explicite demandée à l'écran. */
export async function lever(id, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || !r.agent_id) return { ok: false, error: 'Rappel introuvable.' };
  const C = await import('./carnet.js');
  const f = Records.get('AgentImmo', r.agent_id);
  C.majAgent(f.id, { ne_plus_appeler: false, ne_plus_appeler_le: null, statut: f.statut === 'archive' ? 'a_rappeler' : f.statut });
  if (r.agence_id && Records.get(AGENCE, r.agence_id)?.ne_plus_appeler) Records.update(AGENCE, r.agence_id, { ne_plus_appeler: false });
  C.journal(f.id, { type: 'note', texte: '« Ne plus appeler » levé : il nous a rappelés de lui-même', par: moiDe(user) });
  const r2 = Records.update(ENTITE, id, { avertissements: (r.avertissements || []).filter((x) => x.genre !== 'ne_plus_appeler') });
  return { ok: true, rappel: vue(r2) };
}

/**
 * L'analyse, une fois l'agent identifié : le même chemin qu'un appel sortant
 * (noterIssue), sur la transcription et les notes. « Ne plus appeler » n'est
 * jamais coché d'office. Un appel sans contenu : « Rien de nouveau ».
 */
export async function analyser(id, { remplace = null, titre = null, issue = 'auto', surEtape = null } = {}, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || r.etat !== 'identifie') return { ok: false, error: r && r.etat === 'a_identifier' ? 'Identifiez d\'abord l\'agent.' : 'Rappel introuvable.' };
  if (sansContenu(r.transcription, r.notes)) {
    Records.update(ENTITE, id, { rien_de_nouveau: true, notes_analysees: r.notes || '' });
    return { ok: true, rien_de_nouveau: true, rappel: vue(Records.get(ENTITE, id)) };
  }
  const MA = await import('./mode-appel.js');
  const lu = await MA.noterIssue({
    // Une issue changée à la main (« changer ») : jamais un sans-réponse, l'agent a appelé.
    agence_id: r.agence_id, agent_id: r.agent_id, issue: SANS_REPONSE.includes(issue) ? 'auto' : issue, transcription: texteAAnalyser(r.transcription, r.notes),
    notes: r.notes || null, entrant: true, remplace: remplace || r.appel_id || null, surEtape, source: 'rappel', dureeS: r.duree_s || null, user,
  });
  if (!lu.ok) return lu;
  const propositions = (lu.appel.propositions || []).map((p) => (p.type === 'ne_plus_appeler' ? { ...p, coche: false, toujours: false } : p));
  Records.update(APPEL, lu.appel.id, { propositions, rappel_id: id, rappel_entrant: true, ...(titre ? { resume: String(titre).slice(0, 600) } : {}) });
  Records.update(ENTITE, id, { appel_id: lu.appel.id, notes_analysees: r.notes || '', rien_de_nouveau: false });
  return { ok: true, appel: { ...lu.appel, propositions, rappel_entrant: true }, rappel: vue(Records.get(ENTITE, id)) };
}

/** « Compris : … » modifié à l'écran : c'est ce résumé qui part dans Monday. */
export function titrer(id, titre, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || !r.appel_id) return { ok: false, error: 'Rappel introuvable.' };
  const a = Records.get(APPEL, r.appel_id);
  if (!a || a.etat !== 'a_valider') return { ok: false, error: 'Appel déjà validé.' };
  Records.update(APPEL, a.id, { resume: String(titre || '').trim().slice(0, 600) || a.resume });
  return { ok: true };
}

/**
 * « Rien de nouveau », validé : l'agent est joint, son dernier contact est
 * aujourd'hui, la retentative qui attendait tombe ; rien d'autre.
 */
export async function rienDeNouveau(id, user, { maintenantD = new Date() } = {}) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || r.etat !== 'identifie') return { ok: false, error: 'Identifiez d\'abord l\'agent.' };
  const C = await import('./carnet.js');
  const f = Records.get('AgentImmo', r.agent_id);
  const iso = maintenantD.toISOString();
  const retentative = f.prochaine && (/essai \d|sans réponse|message laissé/i.test(f.prochaine.quoi || '') || ['a_rappeler', 'nouveau'].includes(f.statut));
  C.majAgent(f.id, { dernier_contact_le: iso, tentatives: 0, ...(retentative ? { prochaine: { quoi: 'point du mois : a-t-il rentré des murs ?', le: R.ouvre(R.plusJours(R.jourDe(maintenantD), 30)) } } : {}), ...(['a_rappeler', 'nouveau'].includes(f.statut) ? { statut: 'en_discussion' } : {}) });
  C.journal(f.id, { type: 'appel', texte: 'Rappel entrant : rien de nouveau', par: moiDe(user), le: iso });
  const appel = Records.create(APPEL, { agent_id: f.id, agence_id: r.agence_id, agent: f.nom, par: moiDe(user), le: iso, issue: 'rien_de_nouveau', issue_tapee: 'rien_de_nouveau', resume: 'Rappel entrant : rien de nouveau.', etat: 'valide', valide_le: iso, rappel_id: id, rappel_entrant: true, source: 'rappel', duree_s: r.duree_s || null, enregistre: !!String(r.transcription || '').trim(), notes: r.notes || null });
  await (await import('./relances.js')).apresAppel({ agent_id: f.id, agence_id: r.agence_id, issue: 'rien_de_nouveau', user, maintenantD });
  if (r.appel_id) { const a = Records.get(APPEL, r.appel_id); if (a?.etat === 'a_valider') Records.update(APPEL, a.id, { etat: 'remplace', remplace_par: appel.id }); }
  Records.update(ENTITE, id, { etat: 'valide', appel_id: appel.id, transcription: null, termine_le: iso });
  return { ok: true, texte: `${f.nom} : rien de nouveau, dernier contact aujourd'hui` };
}

/** L'appel a été validé dans l'écran d'actions : le rappel est fini, sa transcription s'efface. */
export function terminer(id, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user)) return { ok: false, error: 'Rappel introuvable.' };
  const r2 = reconcilier(r);
  return r2.etat === 'valide' ? { ok: true } : { ok: false, error: 'L\'appel n\'est pas encore validé.' };
}

/** Abandon explicite : rien n'est exécuté, la transcription s'efface. */
export function abandonner(id, user) {
  const r = Records.get(ENTITE, id);
  if (!r || r.par !== moiDe(user) || !OUVERTS.includes(r.etat)) return { ok: false, error: 'Rappel introuvable.' };
  if (r.appel_id) { const a = Records.get(APPEL, r.appel_id); if (a?.etat === 'a_valider') Records.update(APPEL, a.id, { etat: 'abandonne' }); }
  Records.update(ENTITE, id, { etat: 'abandonne', transcription: null, abandonne_le: maintenant() });
  return { ok: true, par: prenomDe(r.par) };
}
