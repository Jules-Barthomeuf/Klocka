// Local implementation of base44.agents.* — conversational agents backed by
// Claude with the getMesProjects tool, matching the KlockAI page's expectations.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Conversations } from './db.js';
import { runAgent } from './llm.js';
import { callFunction } from './functions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load a Base44 agent definition (instructions + tools) from base44/agents/*.
function loadAgentDef(agentName) {
  try {
    const file = path.join(__dirname, '..', 'base44', 'agents', `${agentName}.jsonc`);
    const raw = fs.readFileSync(file, 'utf-8');
    // jsonc: strip // line comments before parsing
    const cleaned = raw.replace(/^\s*\/\/.*$/gm, '');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const getMesProjectsTool = {
  name: 'getMesProjects',
  description:
    "Récupère les projets de l'utilisateur. Paramètre optionnel 'search' pour filtrer par nom de projet, locataire ou adresse.",
  input_schema: {
    type: 'object',
    properties: {
      search: { type: 'string', description: 'Terme de recherche (nom, adresse, locataire).' },
    },
  },
};

export async function generateAssistantReply(conversation, user) {
  const def = loadAgentDef(conversation.agent_name) || {};
  const system = def.instructions || 'Tu es un assistant immobilier expert. Réponds en français.';

  const messages = (conversation.messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  const { text } = await runAgent({
    system,
    messages,
    tools: [getMesProjectsTool],
    onTool: async ({ name, input }) => {
      if (name === 'getMesProjects') {
        return callFunction('getMesProjects', input, { user });
      }
      return { error: `Unknown tool ${name}` };
    },
  });

  return { role: 'assistant', content: text, is_streaming: false };
}

export const Agents = {
  listConversations({ agent_name } = {}) {
    return Conversations.list(agent_name);
  },
  getConversation(id) {
    return Conversations.get(id);
  },
  createConversation({ agent_name, metadata } = {}) {
    return Conversations.create({ agent_name, metadata });
  },
  deleteConversation(id) {
    return Conversations.delete(id);
  },
  async addMessage(conversationId, message, user) {
    const conv = Conversations.get(conversationId);
    if (!conv) return { error: 'Conversation not found' };
    const messages = [...(conv.messages || []), { role: message.role, content: message.content }];
    Conversations.setMessages(conversationId, messages);

    if (message.role === 'user') {
      const updated = Conversations.get(conversationId);
      const reply = await generateAssistantReply(updated, user);
      const finalMessages = [...updated.messages, reply];
      Conversations.setMessages(conversationId, finalMessages);
    }
    return Conversations.get(conversationId);
  },
};
