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
import { invokeLLM, llmEnabled, llmStatus } from './llm.js';
import { sendEmail, sendSMS, listAccounts } from './email.js';
import { ensureMailTemplates } from './mail.js';
import { googleEnabled, googleStatus, buildAuthUrl, handleCallback, redirectUriPour } from './google-oauth.js';
import { createSession, sessionEmail, destroySession, purgeExpiredSessions } from './sessions.js';
import {
  hacherMotDePasse, verifierMotDePasse, validerMotDePasse,
  tropDeTentatives, enregistrerEchec, reinitialiserTentatives, minutesDAttente,
} from './passwords.js';
import { analyserFiche, reevaluerLot, listerDossiers, obtenirDossier } from './deal/index.js';
import { ajouterAuReferentiel } from './deal/enrich.js';
import { profilsConfigures } from './deal/rules.js';
import {
  analyserDocument, listerDossiers as listerDossiersDoc, obtenirDossier as obtenirDossierDoc,
  renommerDossier, supprimerDocument, reclasserDocument, TYPES,
} from './assistant/index.js';
import { callFunction } from './functions.js';
import { Agents } from './agents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = process.env.PORT || 3001;
const APP_ID = process.env.VITE_BASE44_APP_ID || 'klocka-local';

runSeedIfEmpty();
ensureMailTemplates();
purgeExpiredSessions();

// L'authentification est désormais toujours exigée : le compte se résout par le
// cookie de session, jamais par un repli implicite sur l'admin.
// AUTH_DESACTIVEE=true rétablit l'ancien comportement, uniquement pour du
// développement local — jamais sur un serveur accessible.
const AUTH_DESACTIVEE = /^(1|true|oui|yes)$/i.test(process.env.AUTH_DESACTIVEE || '');

function currentUser(req) {
  if (AUTH_DESACTIVEE) {
    return Records.filter('User', { email: ADMIN_EMAIL })[0] || Records.list('User')[0] || null;
  }
  const email = req ? sessionEmail(req) : null;
  if (!email) return null;
  return Records.filter('User', { email })[0] || null;
}

// L'empreinte du mot de passe ne doit jamais quitter le serveur.
function sansSecret(user) {
  if (!user || typeof user !== 'object') return user;
  const { mot_de_passe, ...reste } = user;
  return { ...reste, mot_de_passe_defini: !!mot_de_passe };
}

// Champs qu'un utilisateur ne peut pas se donner à lui-même.
const CHAMPS_PROTEGES = ['role', 'mot_de_passe', 'mot_de_passe_defini', 'email', 'id'];
function retirerChampsProteges(patch) {
  const copie = { ...(patch || {}) };
  for (const c of CHAMPS_PROTEGES) delete copie[c];
  return copie;
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
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  ok(res, sansSecret(user));
}));

app.post('/api/auth/updateMe', wrap((req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  // Sans ce filtre, n'importe qui pourrait s'attribuer le rôle admin.
  ok(res, sansSecret(Records.update('User', user.id, retirerChampsProteges(req.body))));
}));

// Changer son mot de passe une fois connecté.
app.post('/api/auth/changer-mot-de-passe', wrap(async (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const { ancien, nouveau } = req.body || {};

  if (user.mot_de_passe && !(await verifierMotDePasse(ancien, user.mot_de_passe))) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  const controle = validerMotDePasse(nouveau);
  if (!controle.valide) return res.status(400).json({ error: controle.erreur });

  Records.update('User', user.id, {
    mot_de_passe: await hacherMotDePasse(nouveau),
    mot_de_passe_defini_le: new Date().toISOString(),
  });
  ok(res, { success: true });
}));

// --- Connexion par email + mot de passe ------------------------------------
//
// Parcours en deux temps : on saisit son email, l'app reconnaît le compte, puis
// on saisit son mot de passe — ou on le choisit s'il s'agit de la première
// connexion. Seuls les emails déjà présents en base peuvent se connecter :
// personne ne crée de compte librement.

const normEmail = (e) => String(e || '').trim().toLowerCase();
const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

app.post('/api/auth/verifier-email', wrap((req, res) => {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Adresse manquante' });

  const user = Records.filter('User', { email })[0];
  if (!user) {
    return ok(res, { connu: false });
  }
  ok(res, {
    connu: true,
    email: user.email,
    prenom: (user.full_name || '').split(' ')[0] || null,
    role: user.role || 'user',
    // Première connexion : le mot de passe reste à définir.
    mot_de_passe_defini: !!user.mot_de_passe,
  });
}));

app.post('/api/auth/definir-mot-de-passe', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const { mot_de_passe } = req.body || {};
  const user = Records.filter('User', { email })[0];

  if (!user) return res.status(404).json({ error: 'Compte inconnu.' });
  if (user.mot_de_passe) {
    return res.status(409).json({ error: 'Un mot de passe existe déjà pour ce compte. Connectez-vous.' });
  }

  const controle = validerMotDePasse(mot_de_passe);
  if (!controle.valide) return res.status(400).json({ error: controle.erreur });

  Records.update('User', user.id, {
    mot_de_passe: await hacherMotDePasse(mot_de_passe),
    mot_de_passe_defini_le: new Date().toISOString(),
  });

  createSession(res, email);
  console.log(`[auth] mot de passe défini et connexion : ${email} (${user.role || 'user'})`);
  ok(res, { success: true, email, role: user.role || 'user' });
}));

app.post('/api/auth/connexion', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  const { mot_de_passe } = req.body || {};
  const ip = ipDe(req);

  if (tropDeTentatives(email, ip)) {
    return res.status(429).json({
      error: `Trop de tentatives. Réessayez dans ${minutesDAttente} minutes.`,
    });
  }

  const user = Records.filter('User', { email })[0];
  const ok_ = user?.mot_de_passe ? await verifierMotDePasse(mot_de_passe, user.mot_de_passe) : false;

  if (!ok_) {
    enregistrerEchec(email, ip);
    // Message unique : ne pas indiquer si c'est l'email ou le mot de passe qui
    // est faux à ce stade du parcours.
    return res.status(401).json({ error: 'Adresse ou mot de passe incorrect.' });
  }

  reinitialiserTentatives(email, ip);
  createSession(res, email);
  Records.update('User', user.id, { derniere_connexion: new Date().toISOString() });
  console.log(`[auth] connexion : ${email} (${user.role || 'user'})`);
  ok(res, { success: true, email, role: user.role || 'user' });
}));

app.post('/api/auth/logout', (req, res) => {
  destroySession(req, res);
  ok(res, { success: true });
});
app.get('/api/auth/isAuthenticated', (req, res) => ok(res, { authenticated: !!currentUser(req) }));

// --- Connexion Google : elle authentifie l'utilisateur ET autorise l'envoi de
// --- mails en son nom, en une seule demande de consentement.

app.get('/api/auth/google/login', (req, res) => {
  if (!googleEnabled) {
    return authResultPage(res, {
      ok: false,
      title: 'Connexion Google non configurée',
      detail:
        "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont absents du fichier .env. Consultez la section « Connexion » du README.",
    });
  }
  const url = buildAuthUrl({ returnTo: req.query.returnTo || '/Dashboard', req });
  // Journalisé à chaque tentative : c'est la seule façon de savoir ce que Google
  // reçoit réellement, et donc de diagnostiquer un redirect_uri_mismatch.
  console.log(`[auth] tentative depuis host=${req.headers.host} proto=${req.headers['x-forwarded-proto'] || req.protocol}`);
  console.log(`[auth]   redirect_uri envoyée : ${new URL(url).searchParams.get('redirect_uri')}`);
  console.log(`[auth]   client_id            : ${new URL(url).searchParams.get('client_id')}`);
  res.redirect(url);
});

// Diagnostic : renvoie l'URI exacte à déclarer chez Google pour l'adresse
// depuis laquelle vous consultez l'app. Sert à régler les redirect_uri_mismatch.
app.get('/api/auth/google/redirect-uri', (req, res) =>
  ok(res, { redirect_uri: redirectUriPour(req), configuree_dans_env: googleStatus().redirect_uri })
);

app.get('/api/auth/google/callback', wrap(async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return authResultPage(res, {
      ok: false,
      title: 'Connexion refusée',
      detail: `Google a renvoyé : ${error}. Vous n'avez pas été connecté.`,
    });
  }

  let profile;
  try {
    // An existing session means "connect an extra mailbox", not "sign in".
    profile = await handleCallback({ code, state, owner: sessionEmail(req) || undefined });
  } catch (e) {
    console.error('[auth] connexion Google échouée:', e?.message || e);
    return authResultPage(res, { ok: false, title: 'Connexion impossible', detail: String(e?.message || e) });
  }

  // Create the app account on first sign-in.
  let user = Records.filter('User', { email: profile.email })[0];
  if (!user) {
    const isFirstUser = Records.count('User') === 0;
    user = Records.create('User', {
      email: profile.email,
      full_name: profile.name,
      picture: profile.picture,
      // The very first person to sign in, and the configured admin, are admins.
      role: isFirstUser || profile.email === ADMIN_EMAIL ? 'admin' : 'user',
      etape_actuelle: 0,
    });
    console.log(`[auth] nouveau compte : ${profile.email} (${user.role})`);
  } else if (!user.full_name || !user.picture) {
    user = Records.update('User', user.id, { full_name: user.full_name || profile.name, picture: profile.picture });
  }

  createSession(res, profile.email);
  console.log(`[auth] connecté : ${profile.email}`);
  res.redirect(profile.returnTo || '/Dashboard');
}));

// ---------------------------------------------------------------------------
// Garde d'authentification
//
// Dès que la connexion Google est configurée, l'API de données exige une
// session : verrouiller l'interface sans verrouiller l'API ne protégerait rien.
// Restent ouvertes les routes du parcours de connexion et celles que les pages
// publiques (lien de projet partagé) appellent.
// ---------------------------------------------------------------------------
const PUBLIC_FUNCTIONS = new Set(['getPublicProject']);

app.use((req, res, next) => {
  if (!googleEnabled) return next();
  if (!/^\/api\/(entities|integrations|agents|functions|preanalyse|alexis)\b/.test(req.path)) return next();
  if (req.path.startsWith('/api/functions/')) {
    const name = req.path.split('/')[3];
    if (PUBLIC_FUNCTIONS.has(name)) return next();
  }
  if (currentUser(req)) return next();
  res.status(401).json({ error: 'Not authenticated' });
});

// ---------------------------------------------------------------------------
// Entities (generic CRUD)
//
// L'entité User est traitée à part : ses enregistrements portent l'empreinte du
// mot de passe et le rôle. On les nettoie en lecture, et on interdit d'y
// toucher via ce CRUD générique — le rôle se change entre admins seulement,
// le mot de passe uniquement par son propriétaire.
// ---------------------------------------------------------------------------
const estUser = (entity) => entity === 'User';
const nettoyer = (entity, data) =>
  !estUser(entity) ? data : Array.isArray(data) ? data.map(sansSecret) : sansSecret(data);

app.get('/api/entities/:entity', wrap((req, res) => {
  const { entity } = req.params;
  const { sort, limit, skip } = req.query;
  ok(
    res,
    nettoyer(
      entity,
      Records.list(entity, {
        sort,
        limit: limit != null ? Number(limit) : undefined,
        skip: skip != null ? Number(skip) : undefined,
      })
    )
  );
}));

app.post('/api/entities/:entity/filter', wrap((req, res) => {
  const { entity } = req.params;
  const { query, sort, limit } = req.body || {};
  ok(
    res,
    nettoyer(entity, Records.filter(entity, query, { sort, limit: limit != null ? Number(limit) : undefined }))
  );
}));

app.get('/api/entities/:entity/:id', wrap((req, res) => {
  const rec = Records.get(req.params.entity, req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  ok(res, nettoyer(req.params.entity, rec));
}));

app.post('/api/entities/:entity', wrap((req, res) => {
  const user = currentUser(req);
  if (estUser(req.params.entity) && user?.role !== 'admin') {
    return res.status(403).json({ error: 'Seul un administrateur peut créer un compte.' });
  }
  const corps = estUser(req.params.entity)
    ? { ...retirerChampsProteges(req.body), email: normEmail(req.body?.email), role: req.body?.role === 'admin' ? 'admin' : 'user' }
    : req.body || {};
  ok(res, nettoyer(req.params.entity, Records.create(req.params.entity, corps, user?.email)));
}));

app.put('/api/entities/:entity/:id', wrap((req, res) => {
  const { entity, id } = req.params;
  let patch = req.body || {};

  if (estUser(entity)) {
    const user = currentUser(req);
    const estAdmin = user?.role === 'admin';
    if (!estAdmin && user?.id !== id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre compte.' });
    }
    // Le mot de passe ne passe jamais par ici. Le rôle, seulement entre admins.
    patch = retirerChampsProteges(patch);
    if (estAdmin && (req.body?.role === 'admin' || req.body?.role === 'user')) patch.role = req.body.role;
  }

  const rec = Records.update(entity, id, patch);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  ok(res, nettoyer(entity, rec));
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
// Connexion Google (envoi de mails)
// ---------------------------------------------------------------------------

// Small HTML page used to report the outcome of the OAuth round-trip.
function authResultPage(res, { ok, title, detail }) {
  const color = ok ? '#2A9D8F' : '#e76f51';
  res.status(ok ? 200 : 400).send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="max-width:520px;padding:32px;text-align:center">
    <div style="font-size:40px;margin-bottom:12px">${ok ? '✓' : '⚠'}</div>
    <h1 style="color:${color};font-size:20px;margin:0 0 12px">${title}</h1>
    <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 24px">${detail}</p>
    <a href="/Mails" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px">Retour à la page Mails</a>
  </div>
</body></html>`);
}

// Rattacher une boîte supplémentaire : même flux, retour sur la page Mails.
app.get('/api/mail/google/connect', (req, res) =>
  res.redirect('/api/auth/google/login?returnTo=%2FMails')
);

// ---------------------------------------------------------------------------
// Préanalyse de fiches commerciales
// ---------------------------------------------------------------------------
app.post('/api/preanalyse/analyser', upload.single('fichier'), wrap(async (req, res) => {
  const user = currentUser(req);
  // multer a déjà écrit le fichier dans UPLOAD_DIR : on le relit plutôt que
  // d'en archiver une seconde copie.
  const dossier = await analyserFiche(
    {
      buffer: req.file ? fs.readFileSync(req.file.path) : null,
      filename: req.file?.originalname,
      mimetype: req.file?.mimetype,
      texte: req.body?.texte,
      sourceUrl: req.file ? `/uploads/${req.file.filename}` : null,
    },
    { user }
  );
  ok(res, dossier);
}));

app.get('/api/preanalyse/dossiers', wrap((req, res) => ok(res, listerDossiers())));

app.get('/api/preanalyse/dossiers/:dealId', wrap((req, res) => {
  const d = obtenirDossier(req.params.dealId);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  ok(res, d);
}));

// Saisie humaine (emplacement, prix négocié) : rejoue les blocs déterministes.
app.post('/api/preanalyse/dossiers/:dealId/lots/:index', wrap(async (req, res) => {
  const r = await reevaluerLot(req.params.dealId, Number(req.params.index), req.body || {});
  if (r.error) return res.status(404).json(r);
  ok(res, r);
}));

// Valide une enseigne qualifiée par l'IA et l'inscrit au référentiel.
app.post('/api/preanalyse/enseignes', wrap((req, res) => {
  ok(res, ajouterAuReferentiel(req.body || {}));
}));

// ---------------------------------------------------------------------------
// Alexis — dépouillement documentaire
// ---------------------------------------------------------------------------
app.get('/api/alexis/grille', wrap((req, res) => ok(res, { types: TYPES })));

app.post('/api/alexis/documents', upload.single('fichier'), wrap(async (req, res) => {
  const user = currentUser(req);
  if (!req.file) return res.status(400).json({ error: 'Aucun document fourni.' });
  const r = await analyserDocument(
    {
      buffer: fs.readFileSync(req.file.path),
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      url: `/uploads/${req.file.filename}`,
    },
    { dossierId: req.body?.dossier_id || null, typeForce: req.body?.type || null, user }
  );
  ok(res, r);
}));

app.get('/api/alexis/dossiers', wrap((req, res) => ok(res, listerDossiersDoc())));

app.get('/api/alexis/dossiers/:id', wrap((req, res) => {
  const d = obtenirDossierDoc(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
  ok(res, d);
}));

app.post('/api/alexis/dossiers/:id/titre', wrap((req, res) => {
  const r = renommerDossier(req.params.id, req.body?.titre);
  if (r.error) return res.status(404).json(r);
  ok(res, r);
}));

app.post('/api/alexis/dossiers/:id/documents/:docId/type', wrap(async (req, res) => {
  const r = await reclasserDocument(req.params.id, req.params.docId, req.body?.type);
  if (r.error) return res.status(400).json(r);
  ok(res, r);
}));

app.delete('/api/alexis/dossiers/:id/documents/:docId', wrap((req, res) => {
  const r = supprimerDocument(req.params.id, req.params.docId);
  if (r.error) return res.status(404).json(r);
  ok(res, r);
}));

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
app.post('/api/functions/:name', wrap(async (req, res) => {
  const user = currentUser(req);
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
  const user = currentUser(req);
  ok(res, await Agents.addMessage(req.params.id, req.body || {}, user));
}));

// ---------------------------------------------------------------------------
// App logs (no-op sink)
// ---------------------------------------------------------------------------
app.post('/api/logs', (req, res) => ok(res, { success: true }));

app.get('/api/health', (req, res) =>
  ok(res, { status: 'ok', llm: llmEnabled, google: googleEnabled, accounts: listAccounts().length })
);

// ---------------------------------------------------------------------------
// Frontend — servi par le même serveur, pour n'avoir qu'un seul port à ouvrir.
// Présent uniquement après `npm run build` (le mode dev utilise Vite).
// ---------------------------------------------------------------------------
const DIST_DIR = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA fallback: any non-API route is handled by React Router.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  const url = process.env.APP_URL || `http://localhost:${PORT}`;
  const accounts = listAccounts();
  console.log(`\n  ▸ Klocka : ${url}\n`);
  console.log(`    Interface  : ${fs.existsSync(DIST_DIR) ? 'servie sur ce port' : 'absente — lancez `npm run build`'}`);
  console.log(`    IA         : ${llmEnabled ? llmStatus().label : 'désactivée — ajoutez GEMINI_API_KEY dans .env'}`);
  const g = googleStatus();
  console.log(
    `    Connexion Google : ${googleEnabled ? `prête${g.gmail_send ? ' (+ envoi de mails)' : ''}` : 'non configurée — ajoutez GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET dans .env'}`
  );
  if (googleEnabled) {
    // Première cause d'échec de connexion : une URI enregistrée chez Google qui
    // diffère de celle envoyée. On l'affiche telle quelle, à copier-coller.
    console.log(`    URI de redirection à déclarer chez Google (au caractère près) :`);
    console.log(`      ${g.redirect_uri}`);
  }
  console.log(
    `    Expéditeurs : ${accounts.length ? accounts.map((a) => a.email).join(', ') : 'aucun — connectez un compte depuis la page Mails'}\n`
  );
});
