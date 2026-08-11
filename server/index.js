// Local backend replacing the Base44 cloud for the Klocka app.
// Serves the same API surface the frontend SDK shim expects:
//   /api/apps/public/...   app public settings (auth bootstrap)
//   /api/auth/...          current user / updateMe / logout
//   /api/entities/...      generic CRUD over all Base44 entities
//   /api/integrations/...  InvokeLLM, UploadFile, SendEmail, etc.
//   /api/functions/:name   ported Base44 backend functions
//   /api/agents/...        conversational agents
//   /uploads/...           locally stored uploaded files

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Records, Meta } from './db.js';
import { runSeedIfEmpty, ADMIN_EMAIL } from './seed.js';
import { invokeLLM, llmEnabled } from './llm.js';
import { sendEmail, sendSMS } from './email.js';
import { callFunction } from './functions.js';
import { Agents } from './agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = process.env.PORT || 3001;
const APP_ID = process.env.VITE_BASE44_APP_ID || 'klocka-local';

runSeedIfEmpty();

// Resolve the current user. Local mode authenticates as the seeded admin.
function currentUser() {
  const admins = Records.filter('User', { email: ADMIN_EMAIL });
  if (admins.length) return admins[0];
  const all = Records.list('User');
  return all[0] || null;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
});

// Read a locally-stored uploaded file back to text (for LLM file_urls).
async function resolveFileText(url) {
  if (!url || typeof url !== 'string') return '';
  const m = url.match(/\/uploads\/(.+)$/);
  if (!m) return '';
  const filePath = path.join(UPLOAD_DIR, m[1]);
  if (!fs.existsSync(filePath)) return '';
  const ext = path.extname(filePath).toLowerCase();
  const textExts = ['.txt', '.md', '.csv', '.json', '.html', '.xml'];
  if (textExts.includes(ext)) return fs.readFileSync(filePath, 'utf-8').slice(0, 100000);
  return `[fichier binaire ${path.basename(filePath)} — extraction texte non disponible en local]`;
}

const ok = (res, data) => res.json(data);
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
};

// ---------------------------------------------------------------------------
// App public settings — consumed by AuthContext to bootstrap the app.
// ---------------------------------------------------------------------------
app.get('/api/apps/public/prod/public-settings/by-id/:appId', (req, res) => {
  ok(res, {
    id: req.params.appId || APP_ID,
    public_settings: {
      requiresAuth: false,
      name: 'Klocka',
    },
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.get('/api/auth/me', wrap((req, res) => {
  const user = currentUser();
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  ok(res, user);
}));

app.post('/api/auth/updateMe', wrap((req, res) => {
  const user = currentUser();
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  ok(res, Records.update('User', user.id, req.body || {}));
}));

app.post('/api/auth/logout', (req, res) => ok(res, { success: true }));
app.get('/api/auth/isAuthenticated', (req, res) => ok(res, { authenticated: !!currentUser() }));

// ---------------------------------------------------------------------------
// Entities (generic CRUD)
// ---------------------------------------------------------------------------
app.get('/api/entities/:entity', wrap((req, res) => {
  const { entity } = req.params;
  const { sort, limit, skip } = req.query;
  ok(
    res,
    Records.list(entity, {
      sort,
      limit: limit != null ? Number(limit) : undefined,
      skip: skip != null ? Number(skip) : undefined,
    })
  );
}));

app.post('/api/entities/:entity/filter', wrap((req, res) => {
  const { entity } = req.params;
  const { query, sort, limit } = req.body || {};
  ok(res, Records.filter(entity, query, { sort, limit: limit != null ? Number(limit) : undefined }));
}));

app.get('/api/entities/:entity/:id', wrap((req, res) => {
  const rec = Records.get(req.params.entity, req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  ok(res, rec);
}));

app.post('/api/entities/:entity', wrap((req, res) => {
  const user = currentUser();
  ok(res, Records.create(req.params.entity, req.body || {}, user?.email));
}));

app.put('/api/entities/:entity/:id', wrap((req, res) => {
  const rec = Records.update(req.params.entity, req.params.id, req.body || {});
  if (!rec) return res.status(404).json({ error: 'Not found' });
  ok(res, rec);
}));

app.delete('/api/entities/:entity/:id', wrap((req, res) => {
  ok(res, Records.delete(req.params.entity, req.params.id));
}));

// ---------------------------------------------------------------------------
// Integrations (Core)
// ---------------------------------------------------------------------------
app.post('/api/integrations/invoke-llm', wrap(async (req, res) => {
  const result = await invokeLLM({ ...(req.body || {}), resolveFileText });
  ok(res, result);
}));

app.post('/api/integrations/upload-file', upload.single('file'), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  ok(res, { file_url: `/uploads/${req.file.filename}` });
}));

app.post('/api/integrations/send-email', wrap(async (req, res) => {
  ok(res, await sendEmail(req.body || {}));
}));

app.post('/api/integrations/send-sms', wrap(async (req, res) => {
  ok(res, await sendSMS(req.body || {}));
}));

app.post('/api/integrations/generate-image', wrap((req, res) => {
  const prompt = (req.body?.prompt || 'image').slice(0, 40);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#0f1720"/><text x="50%" y="50%" fill="#2A9D8F" font-family="sans-serif" font-size="20" text-anchor="middle">${prompt}</text></svg>`;
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  ok(res, { url: uri });
}));

app.post('/api/integrations/extract-data', wrap(async (req, res) => {
  const { file_url, json_schema } = req.body || {};
  const output = await invokeLLM({
    prompt: 'Extrais les données structurées de ce document selon le schéma.',
    response_json_schema: json_schema,
    file_urls: file_url ? [file_url] : [],
    resolveFileText,
  });
  ok(res, { status: 'success', output });
}));

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
app.post('/api/functions/:name', wrap(async (req, res) => {
  const user = currentUser();
  ok(res, await callFunction(req.params.name, req.body || {}, { user }));
}));

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------
app.get('/api/agents/conversations', wrap((req, res) => {
  ok(res, Agents.listConversations({ agent_name: req.query.agent_name }));
}));
app.post('/api/agents/conversations', wrap((req, res) => {
  ok(res, Agents.createConversation(req.body || {}));
}));
app.get('/api/agents/conversations/:id', wrap((req, res) => {
  const c = Agents.getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  ok(res, c);
}));
app.delete('/api/agents/conversations/:id', wrap((req, res) => {
  ok(res, Agents.deleteConversation(req.params.id));
}));
app.post('/api/agents/conversations/:id/messages', wrap(async (req, res) => {
  const user = currentUser();
  ok(res, await Agents.addMessage(req.params.id, req.body || {}, user));
}));

// ---------------------------------------------------------------------------
// App logs (no-op sink)
// ---------------------------------------------------------------------------
app.post('/api/logs', (req, res) => ok(res, { success: true }));

app.get('/api/health', (req, res) => ok(res, { status: 'ok', llm: llmEnabled }));

app.listen(PORT, () => {
  console.log(`[klocka] Backend local sur http://localhost:${PORT}`);
  console.log(`[klocka] IA Claude: ${llmEnabled ? 'activée' : 'désactivée (stub) — définissez ANTHROPIC_API_KEY'}`);
});
