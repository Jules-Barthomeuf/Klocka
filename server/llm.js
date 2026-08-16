// Couche IA de l'application, avec deux fournisseurs interchangeables.
//
// Choix du fournisseur :
//   - LLM_PROVIDER=gemini|anthropic force explicitement ;
//   - sinon, la première clé présente gagne (GEMINI_API_KEY puis
//     ANTHROPIC_API_KEY) ;
//   - sans aucune clé, chaque appel renvoie une réponse factice pour que
//     l'application reste utilisable hors ligne.

// Chargé ici aussi pour que les modules restent utilisables hors du serveur
// (scripts, tests) sans dépendre de l'ordre des imports.
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

function pickProvider() {
  const forced = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (forced === 'gemini') return GEMINI_KEY ? 'gemini' : 'none';
  if (forced === 'anthropic' || forced === 'claude') return ANTHROPIC_KEY ? 'anthropic' : 'none';
  if (GEMINI_KEY) return 'gemini';
  if (ANTHROPIC_KEY) return 'anthropic';
  return 'none';
}

export const provider = pickProvider();
export const llmEnabled = provider !== 'none';
export const llmModel = provider === 'gemini' ? GEMINI_MODEL : provider === 'anthropic' ? ANTHROPIC_MODEL : null;

export function llmStatus() {
  return {
    enabled: llmEnabled,
    provider,
    model: llmModel,
    label: llmEnabled ? `${provider === 'gemini' ? 'Gemini' : 'Claude'} (${llmModel})` : 'désactivée',
  };
}

const anthropic = provider === 'anthropic' ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

// ---------------------------------------------------------------------------
// Utilitaires communs
// ---------------------------------------------------------------------------

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
  if (!schema || typeof schema !== 'object') return '[réponse IA indisponible : aucune clé API configurée]';
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

function jsonSystemPrompt(schema) {
  return (
    'Tu réponds UNIQUEMENT avec un objet JSON valide correspondant exactement au schéma fourni. ' +
    'Aucun texte hors du JSON, aucune balise de code.\n\nSchéma:\n' +
    JSON.stringify(schema)
  );
}

// ---------------------------------------------------------------------------
// Gemini (API Google AI — endpoint generateContent)
// ---------------------------------------------------------------------------

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function geminiGenerate({ systemInstruction, contents, tools, json }) {
  const body = {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
    generationConfig: {
      maxOutputTokens: 8192,
      // On demande du JSON par le type MIME plutôt que par responseSchema : les
      // schémas de l'app viennent de Base44 et ne respectent pas toujours le
      // sous-ensemble OpenAPI strict qu'exige responseSchema (qui répond 400).
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gemini a répondu ${resp.status}`);
  }
  return data;
}

function geminiParts(data) {
  return data?.candidates?.[0]?.content?.parts || [];
}

// ---------------------------------------------------------------------------
// Génération avec recherche web (grounding Google Search).
//
// Gemini uniquement : le grounding est incompatible avec responseMimeType
// JSON strict, la réponse est donc du texte libre accompagné des sources
// consultées (groundingMetadata). Renvoie null si le fournisseur ne le
// supporte pas — l'appelant traite l'étape comme simplement absente.
// ---------------------------------------------------------------------------
export async function invokeLLMGrounded({ prompt } = {}) {
  if (provider !== 'gemini') return null;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { maxOutputTokens: 2048 },
  };

  const resp = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gemini a répondu ${resp.status}`);
  }

  const meta = data?.candidates?.[0]?.groundingMetadata;
  const sources = (meta?.groundingChunks || [])
    .map((c) => c?.web)
    .filter(Boolean)
    .map((w) => ({ titre: w.title || w.uri, url: w.uri }))
    // Dédupliqué par URL : un même site est souvent cité plusieurs fois.
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i);

  const text = geminiText(data);
  if (!text) return null;
  return { text, sources };
}

function geminiText(data) {
  return geminiParts(data)
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

// Anthropic tool defs ({name, description, input_schema}) -> Gemini
// functionDeclarations ({name, description, parameters}). Gemini rejects the
// JSON-Schema keywords below, so they are stripped.
function toGeminiTools(tools = []) {
  const clean = (schema) => {
    if (!schema || typeof schema !== 'object') return undefined;
    const { $schema, additionalProperties, ...rest } = schema;
    if (rest.properties) {
      rest.properties = Object.fromEntries(
        Object.entries(rest.properties).map(([k, v]) => [k, clean(v) ?? v])
      );
    }
    if (rest.items) rest.items = clean(rest.items) ?? rest.items;
    return rest;
  };
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: clean(t.input_schema || t.parameters) || { type: 'object', properties: {} },
  }));
}

// ---------------------------------------------------------------------------
// InvokeLLM
// ---------------------------------------------------------------------------

/**
 * Core LLM call used by InvokeLLM.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {object} [opts.response_json_schema] - when present, returns a parsed object
 * @param {string[]} [opts.file_urls] - resolved to text and appended to the prompt
 * @param {function} [opts.resolveFileText] - async (url) => string
 */
export async function invokeLLM({ prompt, response_json_schema, file_urls, resolveFileText } = {}) {
  const wantsJson = !!response_json_schema;

  if (!llmEnabled) {
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

  const system = wantsJson ? jsonSystemPrompt(response_json_schema) : undefined;
  let text;

  if (provider === 'gemini') {
    const data = await geminiGenerate({
      systemInstruction: system,
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      json: wantsJson,
    });
    text = geminiText(data);
  } else {
    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8192,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: fullPrompt }],
    });
    text = (message.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  }

  if (wantsJson) {
    const parsed = parseJsonLoose(text);
    return parsed != null ? parsed : stubFromSchema(response_json_schema);
  }
  return text;
}

// ---------------------------------------------------------------------------
// Lecture de document (PDF / image)
// ---------------------------------------------------------------------------

/**
 * Envoie un document binaire au modèle et renvoie sa réponse texte.
 * Sert à transcrire les fiches scannées : les deux fournisseurs acceptent
 * nativement les PDF et les images, ce qui évite un moteur d'OCR séparé.
 * @param {object} opts
 * @param {Buffer} opts.buffer
 * @param {string} opts.mimetype - ex. application/pdf, image/jpeg
 * @param {string} opts.prompt
 */
export async function generateFromDocument({ buffer, mimetype, prompt } = {}) {
  if (!llmEnabled) throw new Error('Aucune clé IA configurée : impossible de lire un document scanné.');
  if (!buffer?.length) throw new Error('Document vide.');
  const data = Buffer.from(buffer).toString('base64');

  if (provider === 'gemini') {
    const resp = await geminiGenerate({
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: mimetype, data } }, { text: prompt }],
        },
      ],
    });
    return geminiText(resp);
  }

  const isPdf = mimetype === 'application/pdf';
  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: isPdf ? 'document' : 'image',
            source: { type: 'base64', media_type: mimetype, data },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Agent (boucle d'appel d'outils)
// ---------------------------------------------------------------------------

const MAX_TOOL_ROUNDS = 6;

/**
 * Runs a tool-use loop for the local agents implementation.
 * @param {object} opts
 * @param {string} opts.system
 * @param {Array} opts.messages - [{role, content}]
 * @param {Array} opts.tools - [{name, description, input_schema}]
 * @param {function} opts.onTool - async ({name, input}) => resultObject
 */
export async function runAgent({ system, messages, tools = [], onTool }) {
  if (!llmEnabled) {
    return {
      text:
        "L'assistant IA n'est pas configuré (aucune clé API). " +
        'Ajoutez GEMINI_API_KEY (ou ANTHROPIC_API_KEY) dans .env pour activer les réponses.',
    };
  }

  return provider === 'gemini'
    ? runAgentGemini({ system, messages, tools, onTool })
    : runAgentAnthropic({ system, messages, tools, onTool });
}

async function runAgentGemini({ system, messages, tools, onTool }) {
  const declarations = toGeminiTools(tools);
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content ?? '') }],
  }));

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const data = await geminiGenerate({ systemInstruction: system, contents, tools: declarations });
    const parts = geminiParts(data);
    const calls = parts.filter((p) => p.functionCall);

    if (!calls.length) return { text: geminiText(data) };

    contents.push({ role: 'model', parts });

    const results = [];
    for (const part of calls) {
      const { name, args } = part.functionCall;
      let result;
      try {
        result = onTool ? await onTool({ name, input: args || {} }) : {};
      } catch (e) {
        result = { error: String(e) };
      }
      results.push({
        functionResponse: {
          name,
          // La réponse doit être un objet JSON.
          response: result && typeof result === 'object' ? result : { result: String(result) },
        },
      });
    }
    contents.push({ role: 'user', parts: results });
  }

  return { text: 'Désolé, je n’ai pas pu terminer l’analyse (trop d’étapes).' };
}

async function runAgentAnthropic({ system, messages, tools, onTool }) {
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
    const resp = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
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

    return {
      text: (resp.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim(),
    };
  }

  return { text: 'Désolé, je n’ai pas pu terminer l’analyse (trop d’étapes).' };
}
