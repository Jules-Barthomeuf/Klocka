// Le fil de conversation de l'assistant, en base.
//
// Il vivait dans l'état React : un rechargement de page l'effaçait, et avec lui
// le contexte de ce qu'on était en train de faire. La table `conversations`
// existait déjà — elle n'était simplement pas branchée.
//
// Un fil par personne, remplacé à chaque échange : on garde une conversation
// courante, pas un historique de tout.

import { Conversations } from './db.js';

const AGENT = 'assistant-commande';

// Au-delà, le fil n'aide plus personne à se souvenir.
const MAX_MESSAGES = 40;

const filDe = (user) =>
  Conversations.list(AGENT).find((c) => c.metadata?.utilisateur === (user?.email || 'anonyme')) || null;

/** Les messages du fil courant. */
export function lireFil(user) {
  return filDe(user)?.messages || [];
}

/** Remplace le fil courant par la conversation telle qu'elle est. */
export function enregistrerFil(user, messages) {
  const derniers = (messages || []).slice(-MAX_MESSAGES);
  const existant = filDe(user);
  if (existant) {
    Conversations.setMessages(existant.id, derniers);
    return existant.id;
  }
  const cree = Conversations.create({ agent_name: AGENT, metadata: { utilisateur: user?.email || 'anonyme' } });
  Conversations.setMessages(cree.id, derniers);
  return cree.id;
}

/** Efface le fil : on repart de zéro. */
export function effacerFil(user) {
  const existant = filDe(user);
  if (existant) Conversations.delete(existant.id);
}
