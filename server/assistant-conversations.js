// L'historique du chat du dashboard : une conversation par échange entamé,
// que chacun retrouve, rouvre et continue. Le fil vivait dans l'onglet et se
// perdait au rechargement ; il est maintenant enregistré tel quel — textes
// et blocs (fiche analysée, compte rendu client) — au fil de la discussion.
//
// À part du fil de la bulle flottante (assistant-fil.js), qui reste une
// conversation courante unique : ici, c'est la bibliothèque.

import { Conversations } from './db.js';

const AGENT = 'dashboard';
const MAX_MESSAGES = 80;
const MAX_CONVERSATIONS = 30;
const ROLES = new Set(['user', 'assistant', 'bloc']);

const proprietaire = (user) => user?.email || 'anonyme';
// Conversations.list rend les plus récentes d'abord (updated_date DESC).
const miennes = (user) => Conversations.list(AGENT).filter((c) => c.metadata?.utilisateur === proprietaire(user));

/** Pure : le titre d'une conversation, son premier message. */
export function titreDe(messages) {
  const premier = (messages || []).find((m) => m?.role === 'user' && m.contenu);
  return String(premier?.contenu || '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Conversation';
}

/** Pure : ne garde que ce qui se range — textes et blocs sérialisables. */
export function serialisables(messages) {
  const propres = [];
  for (const m of messages || []) {
    if (!m || !ROLES.has(m.role)) continue;
    if (m.role === 'bloc') {
      try {
        const donnees = m.donnees === undefined ? null : JSON.parse(JSON.stringify(m.donnees));
        propres.push({ role: 'bloc', type: String(m.type || ''), donnees });
      } catch { /* un bloc non sérialisable ne vaut pas de perdre la conversation */ }
    } else if (typeof m.contenu === 'string' && m.contenu.trim()) {
      propres.push({ role: m.role, contenu: m.contenu });
    }
  }
  return propres;
}

export function listerConversations(user) {
  return miennes(user).map((c) => ({
    id: c.id,
    titre: c.metadata?.titre || 'Conversation',
    maj_le: c.updated_date,
    nb: (c.messages || []).filter((m) => m.role !== 'bloc').length,
  }));
}

export function lireConversation(user, id) {
  const c = Conversations.get(id);
  if (!c || c.agent_name !== AGENT || c.metadata?.utilisateur !== proprietaire(user)) return null;
  return { id: c.id, titre: c.metadata?.titre || 'Conversation', messages: c.messages || [] };
}

/**
 * Enregistre la conversation entière (le client l'envoie telle qu'affichée).
 * Sans identifiant, ou si l'identifiant n'est pas à la personne, une
 * conversation naît — et les plus vieilles au-delà du plafond s'effacent.
 */
export function enregistrerConversation(user, { id = null, messages = [] } = {}) {
  const propres = serialisables(messages).slice(-MAX_MESSAGES);
  if (!propres.some((m) => m.role === 'user')) return { ok: false, error: 'Rien à garder.' };
  let c = id ? Conversations.get(id) : null;
  if (c && (c.agent_name !== AGENT || c.metadata?.utilisateur !== proprietaire(user))) c = null;
  if (!c) {
    c = Conversations.create({ agent_name: AGENT, metadata: { utilisateur: proprietaire(user), titre: titreDe(propres) } });
    for (const vieille of miennes(user).filter((x) => x.id !== c.id).slice(MAX_CONVERSATIONS - 1)) {
      Conversations.delete(vieille.id);
    }
  }
  Conversations.setMessages(c.id, propres);
  return { ok: true, id: c.id, titre: c.metadata?.titre || titreDe(propres) };
}

export function supprimerConversation(user, id) {
  const c = Conversations.get(id);
  if (!c || c.agent_name !== AGENT || c.metadata?.utilisateur !== proprietaire(user)) return { ok: false, error: 'Conversation introuvable.' };
  Conversations.delete(id);
  return { ok: true };
}
