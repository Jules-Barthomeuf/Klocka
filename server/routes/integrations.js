// Les intégrations : modèle, envoi de mail, dépôt de fichier.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import fs from 'fs';
import path from 'path';
import { invokeLLM } from '../llm.js';
import { sendEmail, sendSMS } from '../email.js';
import { UPLOAD_DIR, currentUser, ok, upload, wrap } from '../contexte.js';

// Relit un fichier déposé, en texte, pour le passer au modèle.
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

/** Monte les routes « integrations » sur l'application. */
export function monterIntegrations(app) {
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
    // `owner` borne les boîtes d'envoi à celles de l'appelant — même règle que
    // sendMail, et jamais surchargée par le corps de la requête.
    ok(res, await sendEmail({ ...(req.body || {}), owner: currentUser(req)?.email }));
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
}
