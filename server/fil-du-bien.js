// Un fil par bien (1er nov. 2026, Jules) : de la première fois qu'on parle d'un commerce à l'assistant jusqu'à la
// vente, une seule conversation. La prospection (la fiche), la Pré-visite, l'Avis de valeur et le Mandat écrivent
// tous dans le fil de la fiche (`mandataire-fiche-<id>`) ; seul le moteur qui répond change avec l'étape.

import * as C from './assistant-conversations.js';
import { Conversations } from './db.js';

export const espaceDuBien = (proprietaireId) => `mandataire-fiche-${proprietaireId}`;

/** Le fil du bien : sa conversation la plus récente, ou null. */
export function filDuBien(user, proprietaireId) {
  if (!proprietaireId) return null;
  const espace = espaceDuBien(proprietaireId);
  const derniere = [...C.listerConversations(user, { espace })].sort((a, b) => String(b.maj_le || '').localeCompare(String(a.maj_le || '')))[0];
  return derniere ? C.lireConversation(user, derniere.id, { espace }) : null;
}

/** L'étape s'écrit-elle déjà dans ce fil ? */
export const dansLeFil = (user, proprietaireId, conversationId) =>
  !!(proprietaireId && conversationId && C.lireConversation(user, conversationId, { espace: espaceDuBien(proprietaireId) }));

/**
 * Une étape rejoint le fil : ses messages d'ouverture (ce qu'on sait, ce qui manque) s'ajoutent à la suite de ce qui
 * s'est déjà dit. Sans fil encore, il naît avec eux. Rend l'identifiant du fil.
 */
export function rejoindreLeFil(user, proprietaireId, messages = []) {
  const espace = espaceDuBien(proprietaireId);
  const fil = filDuBien(user, proprietaireId);
  const r = C.enregistrerConversation(user, { id: fil?.id || null, messages: [...(fil?.messages || []), ...messages], espace });
  // Marqué comme le fil d'un bien : il ne part jamais avec le ménage des vieilles conversations.
  const c = r?.ok ? Conversations.get(r.id) : null;
  if (c && c.metadata?.bien !== proprietaireId) Conversations.setMetadata(c.id, { ...(c.metadata || {}), bien: proprietaireId });
  return r;
}
