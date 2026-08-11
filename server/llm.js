// Anthropic (Claude) wrapper used by the local integrations layer.
// If ANTHROPIC_API_KEY is set, calls go to the real API; otherwise every helper
// returns a deterministic stub so the app still runs offline.

import Anthropic from '@anthropic-ai/sdk';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

export const llmEnabled = !!API_KEY;

const client = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null;

function extractText(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// Parse a JSON object out of a model reply, tolerating ```json fences and prose.
function parseJsonLoose(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(t.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
  }
  return null;
}

// Placeholder value generator matching a Base44 response_json_schema shape.
function stubFromSchema(schema) {
  if (!schema || typeof schema !== 'object') return '[réponse IA indisponible : ANTHROPIC_API_KEY non configurée]';
  const type = schema.type;
  if (type === 'object') {
    const out = {};
    for (const [key, prop] of Object.entries(schema.properties || {})) {
      out[key] = stubFromSchema(prop);
    }
    return out;
  }
  if (type === 'array') return [];
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'boolean') return false;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  return '[IA non configurée]';
}

/**
 * Core LLM call used by InvokeLLM.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {object} [opts.response_json_schema] - when present, returns a parsed object
 * @param {string[]} [opts.file_urls] - resolved to text and appended to the prompt
 * @param {boolean} [opts.add_context_from_internet]
 * @param {function} [opts.resolveFileText] - async (url) => string
 */
export async function invokeLLM({ prompt, response_json_schema, file_urls, resolveFileText } = {}) {
  const wantsJson = !!response_json_schema;

  if (!client) {
    return wantsJson ? stubFromSchema(response_json_schema) : stubFromSchema(null);
  }

  let fullPrompt = prompt || '';

  if (Array.isArray(file_urls) && file_urls.length && resolveFileText) {
    for (const url of file_urls) {
      try {
        const text = await resolveFileText(url);
        if (text) fullPrompt += `\n\n--- Contenu du fichier (${url}) ---\n${text}`;
      } catch {
        /* ignore unreadable files */
      }
    }
  }

  let system;
  if (wantsJson) {
    system =
      'Tu réponds UNIQUEMENT avec un objet JSON valide correspondant exactement au schéma fourni. ' +
      'Aucun texte hors du JSON, aucune balise de code.\n\nSchéma:\n' +
      JSON.stringify(response_json_schema);
  }

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: fullPrompt }],
  });

  const text = extractText(message);
  if (wantsJson) {
    const parsed = parseJsonLoose(text);
    return parsed != null ? parsed : stubFromSchema(response_json_schema);
  }
  return text;
}

/**
 * Runs a Claude tool-use loop for the local agents implementation.
 * @param {object} opts
 * @param {string} opts.system
 * @param {Array} opts.messages - [{role, content}]
 * @param {Array} opts.tools - Anthropic tool defs
 * @param {function} opts.onTool - async ({name, input}) => resultObject
 */
export async function runAgent({ system, messages, tools = [], onTool }) {
  if (!client) {
    return {
      text:
        "L'assistant IA n'est pas configuré en local (ANTHROPIC_API_KEY manquante). " +
        'Ajoutez votre clé Anthropic dans server/.env pour activer les réponses.',
    };
  }

  const convo = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < 6; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      ...(tools.length ? { tools } : {}),
      messages: convo,
    });

    if (resp.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: resp.content });
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          let result;
          try {
            result = onTool ? await onTool({ name: block.name, input: block.input }) : {};
          } catch (e) {
            result = { error: String(e) };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }
      }
      convo.push({ role: 'user', content: toolResults });
      continue;
    }

    return { text: extractText(resp) };
  }

  return { text: 'Désolé, je n’ai pas pu terminer l’analyse (trop d’étapes).' };
}
