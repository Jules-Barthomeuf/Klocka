// La page de la personne avec qui on a parlé (16 nov. 2026, Jules : « un lien vers une page avec la personne, genre la page
// équipe de la personne »), montrée dans le chat à la fin de chaque appel. Dans l'ordre :
//   1. sa page déjà trouvée (gardée sur l'agent, `page_personne`) ;
//   2. la page équipe du site de son agence, parmi les pages déjà lues du site (/equipe, /notre-equipe, /team…) ;
//   3. son profil LinkedIn, s'il est connu ;
//   4. sinon, une recherche web (Claude) « nom agence ville » qui rend l'adresse d'une page qui la présente ; gardée.

import { Records } from '../db.js';

const EQUIPE = /(equipe|équipe|team|nos-?conseillers|nos-?agents|nos-?collaborateurs|conseillers|collaborateurs|qui-sommes|a-propos|about)/i;

/** Pure : la page équipe parmi les pages lues d'un site (la plus parlante d'abord : équipe, puis qui sommes-nous). */
export function pageEquipe(pages = []) {
  const urls = (pages || []).map(String).filter((u) => /^https?:\/\//.test(u) && EQUIPE.test(u));
  return urls.sort((a, b) => Number(/qui-sommes|a-propos|about/i.test(a)) - Number(/qui-sommes|a-propos|about/i.test(b)))[0] || null;
}

/** Pure : la première adresse web d'une réponse, nettoyée de sa ponctuation finale. */
export function premiereUrl(texte) {
  const m = String(texte || '').match(/https?:\/\/[^\s)\]>»"']+/);
  return m ? m[0].replace(/[.,;:]+$/, '') : null;
}

const agenceDe = (agent) => Records.list('AgenceProspect').find((g) => g.carnet_id === agent.id)
  || Records.list('AgenceProspect').find((g) => (g.agents || []).some((x) => x.nom && agent.nom && x.nom.toLowerCase() === agent.nom.toLowerCase()))
  || (agent.agence ? Records.list('AgenceProspect').find((g) => String(g.nom || '').toLowerCase() === String(agent.agence).toLowerCase()) : null);

/** La page de la personne. `chercher` : la recherche web est permise (elle prend une à deux minutes la première fois). */
export async function pagePersonne(agentId, { chercher = true } = {}) {
  const agent = agentId ? Records.get('AgentImmo', agentId) : null;
  if (!agent) return { url: null };
  if (agent.page_personne?.url) return agent.page_personne;
  const agence = agenceDe(agent);
  const garder = (p) => { Records.update('AgentImmo', agent.id, { page_personne: { ...p, le: new Date().toISOString() } }); return p; };
  const equipe = pageEquipe(agence?.pages_lues || []);
  if (equipe) return garder({ url: equipe, source: 'page équipe du site' });
  if (agent.linkedin) return garder({ url: agent.linkedin, source: 'LinkedIn' });
  if (!chercher || process.env.NODE_TEST_CONTEXT) return { url: null };
  try {
    const { invokeLLMGrounded } = await import('../llm.js');
    const ville = agent.ville || agence?.ville || '';
    const r = await invokeLLMGrounded({ via: 'anthropic', prompt: `Trouve la page web qui présente ${agent.nom}${agent.poste ? `, ${agent.poste},` : ''} de l'agence immobilière ${agent.agence || agence?.nom || ''} ${ville}${agence?.site ? ` (site ${agence.site})` : ''} : la page équipe du site de l'agence où cette personne figure, sa page de conseiller sur le site d'un réseau, ou son profil LinkedIn. Réponds par la seule adresse de la page, sans rien d'autre ; « aucune » si tu ne la trouves pas.` });
    const url = premiereUrl(r?.final || r?.text);
    return url ? garder({ url, source: 'recherche web' }) : { url: null };
  } catch (e) {
    console.warn(`[page personne] ${agent.nom} : ${e?.message || e}`);
    return { url: null };
  }
}
