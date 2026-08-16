// Local implementation of base44.agents.* — conversational agents backed by
// Claude with the getMesProjects tool, matching the KlockAI page's expectations.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Conversations } from './db.js';
import { runAgent } from './llm.js';
import { callFunction } from './functions.js';
import { addressBook, listTemplates } from './mail.js';

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
  if (conversation.agent_name === 'mailier') {
    return replyMailier(conversation, user);
  }

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

// ---------------------------------------------------------------------------
// Agent « mailier » : composition de mails en conversation multi-tours.
//
// Le modèle propose et révise un brouillon via l'outil proposerBrouillon —
// chaque appel remplace le brouillon courant, attaché au message assistant
// pour que l'interface l'affiche dans le panneau éditable. Les règles
// reprennent celles de composeWithAI (mail.js) : templates, carnet
// d'adresses, aucune invention.
// ---------------------------------------------------------------------------

const mailierTools = [
  {
    name: 'chercherContact',
    description:
      "Cherche un destinataire dans le carnet d'adresses (contacts agents + clients CRM) par nom, société ou email. Renvoie jusqu'à 10 correspondances.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Nom, société ou email recherché.' } },
      required: ['query'],
    },
  },
  {
    name: 'listerTemplates',
    description: 'Liste les templates de mail disponibles (id, titre, usage, objet, corps).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'proposerBrouillon',
    description:
      "Propose ou révise LE brouillon de mail affiché à l'utilisateur. À appeler à chaque fois que le brouillon doit changer — c'est la seule façon de le mettre à jour.",
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Adresse(s) destinataire, séparées par des virgules. Vide si inconnue.' },
        cc: { type: 'string', description: 'Adresses en copie, séparées par des virgules.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Texte brut, signature comprise.' },
        template_id: { type: 'string', description: 'Id du template utilisé, le cas échéant.' },
      },
      required: ['subject', 'body'],
    },
  },
];

async function replyMailier(conversation, user) {
  const signature = user?.full_name || user?.email || 'Klocka';
  const system = `Tu es l'assistant mail de Klocka (investissement en murs commerciaux). Tu aides à préparer puis affiner un brouillon d'email en conversation.

OUTILS : chercherContact (résoudre un destinataire), listerTemplates (voir les modèles), proposerBrouillon (créer ou réviser le brouillon affiché à l'utilisateur).

RÈGLES :
1. Dès que l'utilisateur décrit un mail à préparer, consulte les templates, choisis le plus pertinent, résous le destinataire via chercherContact, puis appelle proposerBrouillon.
2. À chaque demande de modification (« ajoute… », « change le ton… », « autre destinataire… »), rappelle proposerBrouillon avec le brouillon complet révisé.
3. Pars du corps du template : garde son ton, sa structure, ses arguments. Remplace toutes les variables {{...}} ({{signature}} = ${signature}).
4. N'invente jamais un fait qui n'est ni dans un template ni dans la conversation ; laisse un repère entre [crochets] et dis-le.
5. Si le destinataire est introuvable dans le carnet, laisse "to" vide et dis-le.
6. Corps en texte brut (pas de markdown), terminé par la signature : ${signature}.
7. Français, vouvoiement. Tes messages de conversation restent courts : le contenu vit dans le brouillon.
8. C'est l'utilisateur qui envoie le mail depuis le panneau : toi, tu ne peux qu'éditer le brouillon.`;

  const messages = (conversation.messages || [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }));

  let brouillon = null;
  const { text } = await runAgent({
    system,
    messages,
    tools: mailierTools,
    onTool: async ({ name, input }) => {
      if (name === 'chercherContact') {
        const q = String(input?.query || '').toLowerCase();
        const hits = addressBook()
          .filter((c) =>
            [c.nom, c.entreprise, c.email, c.fonction].some((v) => v && String(v).toLowerCase().includes(q))
          )
          .slice(0, 10)
          .map(({ nom, entreprise, fonction, email }) => ({ nom, entreprise, fonction, email }));
        return { resultats: hits };
      }
      if (name === 'listerTemplates') {
        return {
          templates: listTemplates().map((t) => ({
            id: t.id,
            titre: t.titre,
            usage: t.description || '',
            objet: t.objet,
            corps: t.contenu,
          })),
        };
      }
      if (name === 'proposerBrouillon') {
        brouillon = {
          to: input?.to || '',
          cc: input?.cc || '',
          subject: input?.subject || '',
          body: input?.body || '',
          template_id: input?.template_id || null,
        };
        return { ok: true, affiche: true };
      }
      return { error: `Unknown tool ${name}` };
    },
  });

  return {
    role: 'assistant',
    content: text || (brouillon ? 'Voici le brouillon, dites-moi ce que vous voulez ajuster.' : ''),
    ...(brouillon ? { brouillon } : {}),
    is_streaming: false,
  };
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
