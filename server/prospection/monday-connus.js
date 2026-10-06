// Qui est déjà en contact, d'après Monday : avant qu'une agence entre dans
// une liste de l'agent IA, on la compare aux deux tableaux de l'équipe
// (« Prospection Agent Immo » et « Agent immobilier ») par téléphone, mail,
// domaine du site et nom d'agence. Une agence connue reste dans la liste,
// marquée « déjà en contact » avec ce que Monday en dit (le tableau, le
// statut, la date) : on ne la rappelle pas comme une inconnue.
//
// Les deux tableaux sont relus au plus toutes les dix minutes.

import { Records } from '../db.js';
import { normTel, normEmail } from './regles.js';
import { cleAgence, domaineDe } from './agent-ia.js';

const AGENCE = 'AgenceProspect';
const GARDE_MS = 10 * 60_000;
let cache = null;

/** Pure : l'index des contacts Monday, par téléphone, mail, domaine et nom d'agence. */
export function indexer(lignes) {
  const tels = new Map();
  const mails = new Map();
  const domaines = new Map();
  const agences = new Map();
  for (const l of lignes) {
    // Qui suit le contact (« Collaborateurs » ou « SPOC »), et la prochaine relance.
    const qui = l.referent || (l.collaborateurs || [])[0] || null;
    const info = { tableau: l.tableau, nom: l.nom || null, agence: l.agence || null, statut: l.statut || null, date: l.date || null, id: l.id || null, qui, relance: l.prochaine_relance || l.relance || null };
    for (const t of String(l.telephone || '').split(/[,;/]/)) { const n = normTel(t); if (n && !tels.has(n)) tels.set(n, info); }
    for (const e of String(l.email || '').split(/[,;\s]/)) {
      const n = normEmail(e);
      if (!n) continue;
      if (!mails.has(n)) mails.set(n, info);
      const d = domaineDe(n);
      if (d && !domaines.has(d)) domaines.set(d, info);
    }
    const k = cleAgence(l.agence);
    if (k && k.length > 2 && !agences.has(k)) agences.set(k, info);
  }
  return { tels, mails, domaines, agences, total: lignes.length };
}

/** L'index, relu dans Monday au plus toutes les dix minutes. Null si Monday n'est pas branché. */
export async function contactsMonday({ forcer = false, lire = null } = {}) {
  if (!forcer && cache && Date.now() - cache.le < GARDE_MS) return cache.index;
  let lignes;
  if (lire) lignes = await lire();
  else {
    const M = await import('./monday.js');
    if (!M.mondayConfigure()) return null;
    const [prospects, agents] = await Promise.all([M.lireProspects().catch(() => []), M.lireAgentsImmo().catch(() => [])]);
    lignes = [
      ...prospects.map((p) => ({ ...p, tableau: 'Prospection Agent Immo' })),
      ...agents.map((a) => ({ ...a, statut: a.priorite, tableau: 'Agent immobilier' })),
    ];
  }
  cache = { le: Date.now(), index: indexer(lignes) };
  return cache.index;
}

/**
 * Pure : ce que Monday sait d'une agence (ou d'un agent), ou null. Le
 * téléphone normalisé d'abord, puis le mail : ceux-là sont sûrs. Le domaine
 * et le nom ne sont qu'une correspondance probable (`confiance`), que l'écran
 * dit comme telle au lieu de trancher seul.
 */
export function connu(index, { telephone = null, email = null, site = null, nom = null } = {}) {
  if (!index) return null;
  const t = normTel(telephone);
  if (t && index.tels.has(t)) return { ...index.tels.get(t), par: 'téléphone', confiance: 'sure' };
  const m = normEmail(email);
  if (m && index.mails.has(m)) return { ...index.mails.get(m), par: 'mail', confiance: 'sure' };
  const d = domaineDe(site) || domaineDe(email);
  if (d && index.domaines.has(d)) return { ...index.domaines.get(d), par: 'domaine', confiance: 'probable' };
  const k = cleAgence(nom);
  if (k && k.length > 2 && index.agences.has(k)) return { ...index.agences.get(k), par: 'nom', confiance: 'probable' };
  return null;
}

/**
 * Marque les agences d'une liste (et leurs agents) déjà en contact dans
 * Monday. Rend { ok, connues, total } ; sans Monday, { ok: false }.
 */
export async function marquerListe(listeId, { index = null } = {}) {
  const ix = index || await contactsMonday();
  if (!ix) return { ok: false, error: 'Monday n\'est pas branché.' };
  const agences = Records.list(AGENCE).filter((a) => a.liste_id === listeId);
  let connues = 0;
  for (const a of agences) {
    const agents = (a.agents || []).map((x) => {
      const c = connu(ix, { telephone: x.telephone, email: x.email });
      return { ...x, monday: c ? { tableau: c.tableau, statut: c.statut, date: c.date, qui: c.qui || null, relance: c.relance || null, id: c.id || null, confiance: c.confiance } : null };
    });
    const direct = connu(ix, { telephone: a.telephone, email: a.email, site: a.site, nom: a.nom });
    const parAgent = agents.find((x) => x.monday);
    // Un rapprochement sûr passe avant un probable : celui d'un agent par son
    // numéro vaut mieux que celui de l'agence par son nom.
    const parAgentSur = agents.find((x) => x.monday?.confiance === 'sure');
    const info = (direct?.confiance === 'sure' ? direct : null)
      || (parAgentSur ? { ...parAgentSur.monday, nom: parAgentSur.nom, par: 'un de ses agents' } : null)
      || direct || (parAgent ? { ...parAgent.monday, nom: parAgent.nom, par: 'un de ses agents' } : null);
    if (info) connues += 1;
    Records.update(AGENCE, a.id, { agents, monday_connu: info ? { tableau: info.tableau, nom: info.nom || null, statut: info.statut || null, date: info.date || null, par: info.par, qui: info.qui || null, relance: info.relance || null, id: info.id || null, confiance: info.confiance || 'probable' } : null, monday_verifie_le: new Date().toISOString() });
  }
  return { ok: true, connues, total: agences.length };
}
