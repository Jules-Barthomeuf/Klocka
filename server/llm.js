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

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Délai conseillé par Google dans une erreur 429 (RetryInfo), sinon null.
function delaiRetryDe(data) {
  const details = data?.error?.details || [];
  for (const d of details) {
    const m = String(d?.retryDelay || '').match(/^(\d+(?:\.\d+)?)s$/);
    if (m) return Math.ceil(Number(m[1]) * 1000);
  }
  return null;
}

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

  // Le palier gratuit de Gemini plafonne à ~20 requêtes/minute : un dépôt de
  // plusieurs documents les enchaîne et tombe vite en 429. Plutôt que de faire
  // échouer le document, on attend et on réessaie (délai conseillé par Google,
  // sinon backoff progressif). Les 5xx passagers profitent du même filet.
  const MAX_TENTATIVES = 4;
  let derniereErreur = null;

  for (let tentative = 1; tentative <= MAX_TENTATIVES; tentative++) {
    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await resp.json().catch(() => ({}));
    if (resp.ok) return data;

    derniereErreur = new Error(data?.error?.message || `Gemini a répondu ${resp.status}`);
    const retryable = resp.status === 429 || resp.status >= 500;
    if (!retryable || tentative === MAX_TENTATIVES) break;

    const delai = delaiRetryDe(data) ?? [3000, 12000, 30000][tentative - 1];
    console.warn(
      `[llm] Gemini ${resp.status} (tentative ${tentative}/${MAX_TENTATIVES}) — nouvel essai dans ${Math.round(delai / 1000)} s`
    );
    await attendre(delai);
  }

  throw derniereErreur;
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

/**
 * Conversation sur des documents : l'historique des tours et les pièces
 * jointes (PDF, images, textes) partent ensemble au modèle. Gemini lit les
 * fichiers nativement ; les autres fournisseurs reçoivent le texte extrait
 * quand il existe, sinon le nom du document.
 *
 * @param {object} p
 * @param {string} p.system            consigne système
 * @param {Array<{role:'user'|'assistant', contenu:string}>} p.messages
 * @param {Array<{nom:string, buffer?:Buffer, mimetype?:string, texte?:string}>} p.documents
 * @returns {Promise<string>} la réponse
 */
export async function chatDocuments({ system, messages = [], documents = [] } = {}) {
  if (!llmEnabled) throw new Error('Aucune clé IA configurée.');
  const derniers = messages.slice(-12); // fenêtre de contexte raisonnable

  if (provider === 'gemini') {
    const pieces = documents.flatMap((d) => {
      if (d.buffer?.length && d.mimetype) {
        return [{ text: `Document « ${d.nom} » :` }, { inlineData: { mimeType: d.mimetype, data: Buffer.from(d.buffer).toString('base64') } }];
      }
      if (d.texte) return [{ text: `Document « ${d.nom} » :\n${String(d.texte).slice(0, 120000)}` }];
      return [{ text: `Document « ${d.nom} » (contenu non lisible).` }];
    });
    const contents = derniers.map((m, i) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      // Les pièces accompagnent le dernier message de l'utilisateur.
      parts: i === derniers.length - 1 && m.role === 'user' ? [...pieces, { text: m.contenu }] : [{ text: m.contenu }],
    }));
    const data = await geminiGenerate({ systemInstruction: system, contents });
    const texte = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!texte.trim()) throw new Error('Réponse vide du modèle.');
    return texte.trim();
  }

  // Autres fournisseurs : contexte textuel uniquement.
  const contexte = documents
    .map((d) => `Document « ${d.nom} » :\n${d.texte ? String(d.texte).slice(0, 60000) : '(contenu non lisible)'}`)
    .join('\n\n');
  const prompt = `${contexte ? contexte + '\n\n' : ''}${derniers.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Utilisateur'} : ${m.contenu}`).join('\n\n')}`;
  const r = await invokeLLM({ prompt: `${system}\n\n${prompt}` });
  return typeof r === 'string' ? r : JSON.stringify(r);
}

/**
 * Extraction structurée d'un document : renvoie des lignes « libellé / valeur »
 * accompagnées de leur source (page et citation), pour qu'on puisse remonter
 * à l'endroit exact du document. Le modèle répond en JSON.
 *
 * @param {{nom:string, buffer?:Buffer, mimetype?:string, texte?:string}} doc
 * @returns {Promise<{lignes: Array<{libelle:string, valeur:string, page:number|null, citation:string|null}>}>}
 */
export async function extraireDonneesDocument(doc = {}) {
  if (!llmEnabled) throw new Error('Aucune clé IA configurée.');

  // Avec une grille, le modèle répond élément par élément, dans l'ordre, sans
  // en inventer ni en omettre. Sans grille (document non classé), il relève
  // librement ce que la pièce contient.
  const grille = Array.isArray(doc.elements) && doc.elements.length ? doc.elements : null;
  const statuts = (doc.statuts || ['Conforme', 'À vérifier', 'Point de vigilance', 'Non renseigné'])
    .map((s) => `"${s}"`)
    .join(', ');

  const consigne = grille
    ? `Tu dépouilles un document d'un dossier d'investissement en murs commerciaux, ` +
      `selon une grille de lecture imposée.\n\n` +
      `Réponds pour CHACUN de ces éléments, dans cet ordre exact, sans en ajouter ni en retirer :\n` +
      grille.map((e, i) => `${i + 1}. ${e}`).join('\n') +
      `\n\nRéponds UNIQUEMENT en JSON :\n` +
      `{"lignes":[{"element":"...","constat":"...","statut":"...","commentaire":"...","page":1,"citation":"..."}]}\n` +
      `— "element" : repris mot pour mot de la liste ci-dessus.\n` +
      `— "constat" : la valeur relevée dans le document, telle qu'écrite (unités comprises). ` +
      `Chaîne vide si l'élément n'est pas traité par ce document.\n` +
      `— "statut" : un seul parmi ${statuts}. « Non renseigné » quand le document ne dit rien ; ` +
      `« Point de vigilance » quand la clause est défavorable ou inhabituelle ; ` +
      `« À vérifier » quand elle demande une confirmation ailleurs.\n` +
      `— "commentaire" : une phrase courte, seulement si elle apporte quelque chose (sinon chaîne vide).\n` +
      `— "page" : la page où figure l'information, ou null.\n` +
      `— "citation" : la phrase exacte du document, tronquée à 200 caractères, ou null.\n` +
      `N'invente rien : un élément absent du document reçoit un constat vide et le statut « Non renseigné ».`
    : `Tu dépouilles un document d'un dossier d'investissement en murs commerciaux.\n` +
      `Relève les données factuelles utiles : parties, surfaces, loyers, charges, taxes, dates, ` +
      `durées, prix, clauses notables, diagnostics, décisions.\n\n` +
      `Réponds UNIQUEMENT en JSON :\n` +
      `{"lignes":[{"element":"...","constat":"...","statut":"...","commentaire":"","page":1,"citation":"..."}]}\n` +
      `— "element" : le nom de la donnée, court et explicite.\n` +
      `— "constat" : la valeur telle qu'écrite (unités comprises).\n` +
      `— "statut" : un seul parmi ${statuts}.\n` +
      `— "page" : la page, ou null. — "citation" : la phrase exacte, ou null.\n` +
      `N'invente rien. Pas de commentaire hors du JSON.`;

  let brut = '';
  if (provider === 'gemini') {
    const parts = doc.buffer?.length && doc.mimetype
      ? [{ inlineData: { mimeType: doc.mimetype, data: Buffer.from(doc.buffer).toString('base64') } }, { text: consigne }]
      : [{ text: `Document « ${doc.nom} » :\n${String(doc.texte || '').slice(0, 120000)}\n\n${consigne}` }];
    const data = await geminiGenerate({ contents: [{ role: 'user', parts }], json: true });
    brut = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  } else {
    const r = await invokeLLM({
      prompt: `Document « ${doc.nom} » :\n${String(doc.texte || '').slice(0, 60000)}\n\n${consigne}`,
    });
    brut = typeof r === 'string' ? r : JSON.stringify(r);
  }

  // Le modèle encadre parfois le JSON de balises ou de texte : on isole l'objet.
  const debut = brut.indexOf('{');
  const fin = brut.lastIndexOf('}');
  if (debut === -1 || fin <= debut) throw new Error('Le modèle n’a pas renvoyé de JSON exploitable.');
  const objet = JSON.parse(brut.slice(debut, fin + 1));

  const normaliser = (l) => ({
    element: String(l.element || l.libelle || '').slice(0, 140),
    constat: l.constat == null ? (l.valeur == null ? '' : String(l.valeur)) : String(l.constat),
    statut: String(l.statut || 'Non renseigné').slice(0, 40),
    commentaire: l.commentaire ? String(l.commentaire).slice(0, 300) : '',
    page: Number.isFinite(Number(l.page)) && Number(l.page) > 0 ? Number(l.page) : null,
    citation: l.citation ? String(l.citation).slice(0, 220) : null,
  });

  const rendues = (Array.isArray(objet?.lignes) ? objet.lignes : []).map(normaliser).filter((l) => l.element);

  // Avec une grille, la liste fait foi : on remet les éléments dans l'ordre et
  // on complète ceux que le modèle aurait omis.
  if (!grille) return { lignes: rendues };
  const parElement = new Map(rendues.map((l) => [l.element.toLowerCase().trim(), l]));
  return {
    lignes: grille.map((e) => {
      const trouve = parElement.get(e.toLowerCase().trim());
      return trouve
        ? { ...trouve, element: e, constat: String(trouve.constat).slice(0, 600) }
        : { element: e, constat: '', statut: 'Non renseigné', commentaire: '', page: null, citation: null };
    }),
  };
}
