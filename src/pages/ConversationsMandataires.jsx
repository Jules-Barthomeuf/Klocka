import React from "react";
import EspaceConversations from "@/components/conversations/EspaceConversations";

// Les conversations avec les mandataires K Partners, côté Klocka. L'équipe se
// parle sur Google Chat ; ici, seulement l'échange avec les mandataires.
export default function ConversationsMandataires() {
  return <EspaceConversations cote="klocka" />;
}
