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
import { restaurerSeedSiNecessaire } from './seed-donnees.js';
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
import { changerStatut, statutDe, ajouterSuivi as ajouterSuiviDeal, STATUTS, LIBELLES_STATUTS } from './deal/lifecycle.js';
import { redigerMailIntention, INTENTIONS } from './deal/mails-cycle.js';
import { alimenterBaseMarche } from './deal/marche.js';
import { releverBoite, listerBoite, telechargerRaw } from './gmail-inbox.js';
import { classerDansDrive } from './google-drive.js';
import { syntheseDocuments } from './deal/synthese-docs.js';
import { ajouterDocument as ajouterDocumentEspace, renommerDocument as renommerDocumentEspace, supprimerDocument as supprimerDocumentEspace, converser, supprimerConversation, renommerConversation, extraireDocuments, supprimerExtraction, renommerExtraction, majLigneExtraction } from './deal/espace.js';
import { creerProjetDepuisDeal } from './deal/projet.js';
import { ajouterAuReferentiel } from './deal/enrich.js';
import { profilsConfigures } from './deal/rules.js';
import {
  analyserDocument, listerDossiers as listerDossiersDoc, obtenirDossier as obtenirDossierDoc,
  renommerDossier, supprimerDocument, reclasserDocument, TYPES,
} from './assistant/index.js';
import { callFunction } from './functions.js';
import { Agents } from './agents.js';
import { lireArticle } from './lecture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = process.env.PORT || 3001;
const APP_ID = process.env.VITE_BASE44_APP_ID || 'klocka-local';

// Les données réelles chiffrées du dépôt d'abord (déploiement autoportant),
// le seed de démonstration ensuite — il ne joue que si rien n'a été restauré.
restaurerSeedSiNecessaire();
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

// APP_URL en https = déploiement : cookies Secure (sessions.js), CORS fermé,
// pas de données de démo. Derrière un proxy (Render, etc.), les en-têtes
// x-forwarded-* font foi.
const APP_URL_PROD = (process.env.APP_URL || '').replace(/\/$/, '');
const EN_PRODUCTION = APP_URL_PROD.startsWith('https://');

const app = express();
app.set('trust proxy', 1);
// En production, seule l'origine de l'application est admise ; les cookies de
// session restant SameSite, le CORS ouvert du dev ne doit pas suivre en prod.
app.use(EN_PRODUCTION ? cors({ origin: APP_URL_PROD, credentials: true }) : cors());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN et non DENY : la visionneuse de documents affiche les PDF de
  // /uploads dans une iframe de l'application elle-même.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '25mb' }));
// Les fichiers déposés (fiches, baux, photos) sont réservés aux personnes
// connectées : rien de tout cela n'est public.
app.use(
  '/uploads',
  (req, res, next) => {
    if (AUTH_DESACTIVEE || currentUser(req)) return next();
    res.status(401).json({ error: 'Not authenticated' });
  },
  express.static(UPLOAD_DIR)
);

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

// Même amorçage que la connexion Google : l'adresse admin déclarée dans .env
// (et la toute première personne d'une base vierge) est toujours reconnue,
// même si son compte n'existe pas encore — il sera créé au moment où elle
// définit son mot de passe. Sans cela, une installation neuve refuse tout le
// monde, y compris l'admin.
const amorcagePossible = (email) =>
  Records.count('User') === 0 || email === normEmail(ADMIN_EMAIL);

app.post('/api/auth/verifier-email', wrap((req, res) => {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Adresse manquante' });

  const user = Records.filter('User', { email })[0];
  if (!user) {
    if (amorcagePossible(email)) {
      return ok(res, { connu: true, email, prenom: null, role: 'admin', mot_de_passe_defini: false });
    }
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
  let user = Records.filter('User', { email })[0];

  if (!user && amorcagePossible(email)) {
    user = Records.create('User', { email, role: 'admin', etape_actuelle: 0 });
    console.log(`[auth] amorçage : compte admin créé pour ${email}`);
  }
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

  // Une session déjà ouverte signifie « rattacher une boîte », pas « se
  // connecter » : son identité ne doit pas changer en cours de route.
  const sessionAvant = sessionEmail(req);

  let profile;
  try {
    profile = await handleCallback({ code, state, owner: sessionAvant || undefined });
  } catch (e) {
    console.error('[auth] connexion Google échouée:', e?.message || e);
    return authResultPage(res, { ok: false, title: 'Connexion impossible', detail: String(e?.message || e) });
  }

  // Une session déjà ouverte = rattachement d'une boîte d'envoi. L'adresse
  // Gmail rattachée n'a alors pas à être un compte Klocka.
  const rattachement = !!sessionAvant;

  const emailGoogle = normEmail(profile.email);
  let user = Records.filter('User', { email: emailGoogle })[0];
  if (!user && !rattachement) {
    // Même règle que la connexion par mot de passe : aucun compte ne se crée
    // librement. Seuls l'amorçage (toute première personne) et l'adresse
    // administrateur déclarée entrent sans avoir été enregistrés au préalable.
    const amorcage = Records.count('User') === 0 || emailGoogle === normEmail(ADMIN_EMAIL);
    if (!amorcage) {
      console.log(`[auth] refusé, adresse inconnue : ${emailGoogle} (base : ${Records.count('User')} comptes)`);
      return authResultPage(res, {
        ok: false,
        title: 'Adresse non reconnue',
        detail: `${profile.email} ne correspond à aucun compte Klocka. Les accès sont créés par Klocka : vérifiez le compte Google choisi, ou rapprochez-vous de votre interlocuteur.`,
      });
    }
    user = Records.create('User', {
      email: emailGoogle,
      full_name: profile.name,
      picture: profile.picture,
      role: 'admin',
      etape_actuelle: 0,
    });
    console.log(`[auth] nouveau compte : ${profile.email} (${user.role})`);
  } else if (user && (!user.full_name || !user.picture)) {
    user = Records.update('User', user.id, { full_name: user.full_name || profile.name, picture: profile.picture });
  }

  if (profile.returnTo === RETOUR_POPUP) {
    // Rattachement d'une boîte d'envoi : on ne crée une session que si
    // personne n'était connecté (cas d'une première connexion en popup).
    if (!sessionAvant) createSession(res, profile.email);
    console.log(`[auth] boîte rattachée : ${profile.email} (envoi ${profile.peut_envoyer ? 'autorisé' : 'REFUSÉ'})`);
    if (!profile.peut_envoyer) {
      return authResultPage(res, {
        ok: false,
        title: "Autorisation d'envoi refusée",
        detail:
          "Vous n'avez pas accordé l'autorisation d'envoyer des mails : la boîte ne peut pas servir d'expéditeur. Réessayez en cochant la case demandée par Google.",
      });
    }
    return popupConnectePage(res, profile);
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
  // L'authentification est TOUJOURS exigée sur l'API métier. Seule la variable
  // AUTH_DESACTIVEE (dev local uniquement) l'assouplit — jamais l'absence de
  // configuration Google, qui n'a rien à voir avec l'identité.
  if (AUTH_DESACTIVEE) return next();
  // Toute famille de routes métier doit figurer ici. Les surfaces ajoutées
  // après coup — assistant, monday, journal, monitoring — répondaient sans la
  // moindre authentification, alors que l'assistant écrit dans Monday, crée des
  // dossiers Drive et envoie des mails.
  if (
    !/^\/api\/(entities|integrations|agents|functions|preanalyse|alexis|mails|admin|assistant|monday|journal|monitoring)\b/.test(
      req.path
    )
  ) {
    return next();
  }
  if (req.path.startsWith('/api/functions/')) {
    const name = req.path.split('/')[3];
    if (PUBLIC_FUNCTIONS.has(name)) return next();
  }
  if (currentUser(req)) return next();
  res.status(401).json({ error: 'Not authenticated' });
});

// Arrière-boutique : les dossiers, l'assistant, Monday et le suivi ne
// concernent que l'équipe. Sans ce filtre, un compte client — il y en a
// soixante-quinze — pouvait lire les verdicts, les prix et les adresses des
// agents, et déclencher des actions en son nom.
const PREFIXES_EQUIPE = /^\/api\/(preanalyse|alexis|mails|assistant|monday|monitoring)\b/;

app.use((req, res, next) => {
  if (AUTH_DESACTIVEE) return next();
  if (!PREFIXES_EQUIPE.test(req.path)) return next();
  // Déclarer sa propre visite reste ouvert à tous : c'est ce que fait un client
  // en naviguant.
  if (req.path.startsWith('/api/journal/')) return next();
  if (currentUser(req)?.role === 'admin') return next();
  res.status(403).json({ error: "Réservé à l'équipe Klocka." });
});

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

// Import d'utilisateurs depuis un export Base44 (page Admin Clients).
// Idempotent : les adresses déjà en base ne sont pas touchées.
app.post('/api/admin/import-utilisateurs', wrap(async (req, res) => {
  const user = currentUser(req);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { importerUtilisateurs } = await import('./utilisateurs-import.js');
  const r = importerUtilisateurs(req.body?.utilisateurs, { par: user.email });
  if (r.error) return res.status(400).json(r);
  console.log(
    `[admin] import utilisateurs par ${user.email} : ${r.crees.length} créés, ${r.existants.length} existants, ${r.invalides.length} invalides`
  );
  ok(res, r);
}));

// Import de projets depuis un export JSON (page Import Projets). Accepte le
// format de la page Export Projets ({ projects: [...] }) ou un tableau brut.
// Idempotent : les projets dont l'id existe déjà sont mis à jour.
app.post('/api/admin/import-projets', wrap(async (req, res) => {
  const user = currentUser(req);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { importerProjets } = await import('./projets-import.js');
  const corps = req.body || {};
  const liste = Array.isArray(corps.projets) ? corps.projets
    : Array.isArray(corps.projets?.projects) ? corps.projets.projects
    : corps.projets;
  const r = importerProjets(liste, { par: user.email });
  if (r.error) return res.status(400).json(r);
  console.log(
    `[admin] import projets par ${user.email} : ${r.crees} créés, ${r.maj} mis à jour, ${r.invalides} invalides`
  );
  ok(res, r);
}));

// Présentation de financement d'un projet (page Présentations) : PPTX généré
// depuis les données du projet, converti en Google Slides quand un compte
// Drive est fourni. Le PPTX reste téléchargeable dans tous les cas.
app.post('/api/admin/projets/:id/presentation', wrap(async (req, res) => {
  const user = currentUser(req);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const projet = Records.get('Project', req.params.id);
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' });

  // Six photos choisies dans la page : sommaire, ville, quartier, local ×2,
  // conditions. Celle des conditions est mémorisée : c'est toujours la même
  // d'un dossier à l'autre.
  const photos = { ...(req.body?.photos || {}) };
  const reglages = Records.filter('AppSettings', { setting_key: 'global' })[0];
  if (photos.conditions && reglages && photos.conditions !== reglages.presentation_conditions_photo) {
    Records.update('AppSettings', reglages.id, { presentation_conditions_photo: photos.conditions });
  }
  if (!photos.conditions) photos.conditions = reglages?.presentation_conditions_photo || null;

  const { genererPresentationProjet } = await import('./presentation-projet.js');
  const buffer = await genererPresentationProjet(projet, photos);

  const nomFichier = `presentation-projet-${String(projet.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
  const dossierPres = path.join(UPLOAD_DIR, 'presentations');
  fs.mkdirSync(dossierPres, { recursive: true });
  fs.writeFileSync(path.join(dossierPres, nomFichier), buffer);
  const pptx_url = `/uploads/presentations/${nomFichier}`;

  const { compte } = req.body || {};
  let slides_url = null;
  let erreur_slides = null;
  if (compte) {
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    try {
      const { uploaderEnSlides } = await import('./google-drive.js');
      const r = await uploaderEnSlides(compte, {
        nom: `Projet de financement — ${projet.titre || projet.adresse_complete || projet.id}`,
        buffer,
      });
      slides_url = r.slides_url;
    } catch (e) {
      erreur_slides = e?.message || String(e);
      console.error('[presentation projet] conversion Slides impossible :', erreur_slides);
    }
  }

  Records.update('Project', projet.id, {
    presentation_google_slides: slides_url || projet.presentation_google_slides || '',
    presentation_pptx_url: pptx_url,
    presentation_generee_le: new Date().toISOString(),
  });
  ok(res, { slides_url, pptx_url, erreur_slides });
}));

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

// Ces entités portent des jetons (sessions, refresh tokens Google) : elles ne
// transitent JAMAIS par le CRUD HTTP, quel que soit le rôle. Les modules
// serveur y accèdent en direct.
const ENTITES_INTERDITES = new Set(['Session', 'MailAccount']);
// Outils internes : pipeline de deals, boîte mail, CRM, base marché. Les pages
// qui les consomment sont toutes réservées aux admins.
const ENTITES_ADMIN = new Set([
  'Deal', 'MailRecu', 'EmailLog', 'MailTemplate', 'DonneeMarche', 'RegleTriMail', 'AssistantAction',
  'AssistantRequete', 'VisitePage', 'CoutIA', 'SuiviProposition', 'RapportAuto',
]);

// Contrôle d'accès du CRUD générique. Renvoie l'utilisateur, ou null après
// avoir répondu 403.
function accesEntite(req, res, entity) {
  if (ENTITES_INTERDITES.has(entity)) {
    res.status(403).json({ error: 'Cette entité n’est pas accessible par l’API.' });
    return null;
  }
  const user = currentUser(req) || {};
  if (ENTITES_ADMIN.has(entity) && user.role !== 'admin') {
    res.status(403).json({ error: 'Réservé aux administrateurs.' });
    return null;
  }
  return user;
}

// Un non-admin ne voit que les projets où il figure, jamais les archivés.
const projetVisiblePar = (user) => (p) =>
  !p.archived &&
  (p.admin_principal === user.email ||
    p.client_email === user.email ||
    (Array.isArray(p.client_emails) && p.client_emails.includes(user.email)) ||
    p.created_by === user.email);

const filtrerProjets = (user, data) =>
  user.role === 'admin' ? data : (Array.isArray(data) ? data.filter(projetVisiblePar(user)) : data);

app.get('/api/entities/:entity', wrap((req, res) => {
  const { entity } = req.params;
  const user = accesEntite(req, res, entity);
  if (!user) return;
  const { sort, limit, skip } = req.query;
  let data = Records.list(entity, {
    sort,
    limit: limit != null ? Number(limit) : undefined,
    skip: skip != null ? Number(skip) : undefined,
  });
  if (entity === 'Project') data = filtrerProjets(user, data);
  ok(res, nettoyer(entity, data));
}));

app.post('/api/entities/:entity/filter', wrap((req, res) => {
  const { entity } = req.params;
  const user = accesEntite(req, res, entity);
  if (!user) return;
  const { query, sort, limit } = req.body || {};
  let data = Records.filter(entity, query, { sort, limit: limit != null ? Number(limit) : undefined });
  if (entity === 'Project') data = filtrerProjets(user, data);
  ok(res, nettoyer(entity, data));
}));

app.get('/api/entities/:entity/:id', wrap((req, res) => {
  const user = accesEntite(req, res, req.params.entity);
  if (!user) return;
  const rec = Records.get(req.params.entity, req.params.id);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  // Même réponse qu'un enregistrement inexistant : ne pas révéler l'existence
  // d'un projet auquel on n'a pas accès.
  if (req.params.entity === 'Project' && user.role !== 'admin' && !projetVisiblePar(user)(rec)) {
    return res.status(404).json({ error: 'Not found' });
  }
  ok(res, nettoyer(req.params.entity, rec));
}));

app.post('/api/entities/:entity', wrap((req, res) => {
  const user = accesEntite(req, res, req.params.entity);
  if (!user) return;
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
  const user = accesEntite(req, res, entity);
  if (!user) return;
  let patch = req.body || {};

  if (estUser(entity)) {
    const estAdmin = user?.role === 'admin';
    if (!estAdmin && user?.id !== id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre compte.' });
    }
    // Le mot de passe ne passe jamais par ici. Le rôle, seulement entre admins.
    patch = retirerChampsProteges(patch);
    if (estAdmin && (req.body?.role === 'admin' || req.body?.role === 'user')) patch.role = req.body.role;
  }

  // Un non-admin ne modifie que les projets où il figure.
  if (entity === 'Project' && user.role !== 'admin') {
    const rec = Records.get(entity, id);
    if (!rec || !projetVisiblePar(user)(rec)) return res.status(404).json({ error: 'Not found' });
  }

  const rec = Records.update(entity, id, patch);
  if (!rec) return res.status(404).json({ error: 'Not found' });
  ok(res, nettoyer(entity, rec));
}));

app.delete('/api/entities/:entity/:id', wrap((req, res) => {
  const user = accesEntite(req, res, req.params.entity);
  if (!user) return;
  // La suppression est un geste d'administrateur, quelle que soit l'entité.
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  }
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

// ---------------------------------------------------------------------------
// Connexion Google (envoi de mails)
// ---------------------------------------------------------------------------

// Small HTML page used to report the outcome of the OAuth round-trip.
// Canal de dialogue entre la fenêtre surgissante de connexion et la page qui
// l'a ouverte : elle garde ainsi son brouillon de mail intact.
const CANAL_POPUP = 'klocka-google';
const RETOUR_POPUP = '__popup__';

const echapper = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

function authResultPage(res, { ok, title, detail }) {
  const color = ok ? '#2A9D8F' : '#e76f51';
  res.status(ok ? 200 : 400).send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="max-width:520px;padding:32px;text-align:center">
    <div style="font-size:40px;margin-bottom:12px">${ok ? '✓' : '!'}</div>
    <h1 style="color:${color};font-size:20px;margin:0 0 12px">${title}</h1>
    <p style="color:#9ca3af;font-size:14px;line-height:1.6;margin:0 0 24px">${detail}</p>
    <a href="/Dashboard" id="retour" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:10px 20px;border-radius:10px;font-size:14px">Retour au dashboard</a>
  </div>
  <script>
    // Ouverte en fenêtre surgissante : prévenir la page appelante et proposer
    // de fermer plutôt que de naviguer.
    if (window.opener) {
      window.opener.postMessage(
        { type: ${JSON.stringify(CANAL_POPUP)}, ok: false, error: ${JSON.stringify(String(detail || title))} },
        window.location.origin
      );
      var b = document.getElementById('retour');
      b.textContent = 'Fermer cette fenêtre';
      b.href = '#';
      b.onclick = function (e) { e.preventDefault(); window.close(); };
    }
  </script>
</body></html>`);
}

// Fin de parcours en fenêtre surgissante : on prévient la page appelante que
// la boîte est connectée, puis on se referme.
function popupConnectePage(res, { email }) {
  res.send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Boîte connectée</title></head>
<body style="margin:0;background:#000;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
  <div style="text-align:center">
    <div style="font-size:40px;margin-bottom:12px">✓</div>
    <p style="color:#9ca3af;font-size:14px">${echapper(email)} connectée. Cette fenêtre se referme…</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage(
        { type: ${JSON.stringify(CANAL_POPUP)}, ok: true, email: ${JSON.stringify(email)} },
        window.location.origin
      );
    }
    setTimeout(function () { window.close(); }, 600);
  </script>
</body></html>`);
}

// Rattacher une boîte supplémentaire : même flux, retour sur le dashboard.
app.get('/api/mail/google/connect', (req, res) =>
  res.redirect('/api/auth/google/login?returnTo=%2FMails')
);

// Variante en fenêtre surgissante : la page appelante (et son brouillon de
// mail en cours de rédaction) n'est jamais quittée.
app.get('/api/mail/google/connect-popup', (req, res) =>
  res.redirect(`/api/auth/google/login?returnTo=${encodeURIComponent(RETOUR_POPUP)}`)
);

// ---------------------------------------------------------------------------
// Boîte de réception (relève Gmail, sur action utilisateur — pas de polling)
// ---------------------------------------------------------------------------
// Un utilisateur ne peut relever que les boîtes qu'il a lui-même connectées.
function compteAutorise(req, compte) {
  const user = currentUser(req);
  return listAccounts(user?.email).some((a) => a.id === String(compte || '').toLowerCase());
}

app.post('/api/mails/inbox/relever', wrap(async (req, res) => {
  const { compte } = req.body || {};
  if (!compte) return res.status(400).json({ error: 'Compte manquant' });
  if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  ok(res, await releverBoite(compte));
}));

app.get('/api/mails/inbox', wrap((req, res) => {
  const compte = req.query.compte;
  if (!compte) return res.status(400).json({ error: 'Compte manquant' });
  if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  ok(res, listerBoite(compte));
}));

// Préanalyse d'un mail reçu : téléchargement RFC 822 → pipeline .eml existant
// (texte + pièces jointes), puis liaison mail ↔ deal et mémorisation de
// l'expéditeur comme contact agent.
app.post('/api/mails/inbox/:id/preanalyser', wrap(async (req, res) => {
  const mailRecu = Records.get('MailRecu', req.params.id);
  if (!mailRecu) return res.status(404).json({ error: 'Mail introuvable' });
  if (!compteAutorise(req, mailRecu.compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
  if (mailRecu.deal_id) {
    return res.status(409).json({ error: 'Ce mail a déjà été préanalysé.', deal_id: mailRecu.deal_id });
  }

  const user = currentUser(req);
  const buffer = await telechargerRaw(mailRecu.compte, mailRecu.gmail_message_id);
  const dossier = await analyserFiche(
    {
      buffer,
      filename: `${(mailRecu.objet || 'mail').slice(0, 60)}.eml`,
      mimetype: 'message/rfc822',
      contactEmail: mailRecu.de_email || null,
    },
    { user, uploadDir: UPLOAD_DIR }
  );

  Records.update('MailRecu', mailRecu.id, { deal_id: dossier.deal_id });
  Records.update('Deal', Records.filter('Deal', { deal_id: dossier.deal_id })[0].id, {
    source_mail: {
      mail_recu_id: mailRecu.id,
      de: mailRecu.de,
      objet: mailRecu.objet,
      date: mailRecu.date,
    },
  });
  ok(res, dossier);
}));

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
    { user, dealId: req.body?.deal_id || null }
  );
  ok(res, dossier);
}));

app.get('/api/preanalyse/dossiers', wrap((req, res) => ok(res, listerDossiers())));

// Mode test : crée un deal fictif réel (statut 'analyse') pour parcourir tout
// le cycle sans appel API — mails simulés, documents fictifs, marché intact.
app.post('/api/preanalyse/test', wrap(async (req, res) => {
  const { creerDealTest } = await import('./deal/test.js');
  ok(res, creerDealTest(currentUser(req)));
}));

// Simule la réception + l'extraction des documents d'un deal de test.
app.post('/api/preanalyse/dossiers/:dealId/documents/simuler', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const { simulerDocumentsTest } = await import('./deal/test.js');
  const r = simulerDocumentsTest(dossier, currentUser(req));
  if (r.error) return res.status(400).json(r);
  ok(res, r);
}));

// Suppression — réservée aux deals de test (nettoyage après le parcours).
app.delete('/api/preanalyse/dossiers/:dealId', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const { supprimerDealTest } = await import('./deal/test.js');
  const r = supprimerDealTest(dossier);
  if (r.error) return res.status(403).json(r);
  ok(res, r);
}));

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

// Vue pipeline : tous les dossiers avec statut + compteurs par étape.
// Création d'un dossier nommé, avant toute analyse : une coquille qui porte
// le nom et les responsables ; l'analyse de la fiche la remplira (étape 2).
app.post('/api/preanalyse/dossiers', wrap(async (req, res) => {
  const { randomUUID } = await import('crypto');
  const user = currentUser(req);
  const nom = String(req.body?.nom || '').trim();
  if (!nom) return res.status(400).json({ error: 'Donnez un nom au dossier.' });
  const responsables = Array.isArray(req.body?.responsables)
    ? req.body.responsables.map((r) => String(r).trim()).filter(Boolean).slice(0, 8)
    : [];
  const dossier = {
    deal_id: randomUUID(),
    nom,
    responsables,
    cree_le: new Date().toISOString(),
    cree_par: user?.email || null,
    statut: 'analyse',
    etape_max: 1,
    archived: false,
    relance_prevue_le: null,
    contact_agent_email: null,
    dossier_doc_id: null,
    projet_id: null,
    lots: [],
    multi_lots: false,
    suivi: [{ le: new Date().toISOString(), par: user?.email || null, type: 'creation', detail: `Dossier créé : ${nom}` }],
  };
  Records.create('Deal', dossier, user?.email);
  ok(res, dossier);
}));

// Renommer un dossier.
app.post('/api/preanalyse/dossiers/:dealId/renommer', wrap((req, res) => {
  const brut = Records.filter('Deal', { deal_id: req.params.dealId })[0];
  if (!brut) return res.status(404).json({ error: 'Dossier introuvable' });
  const nom = String(req.body?.nom || '').trim();
  if (!nom) return res.status(400).json({ error: 'Le nom ne peut pas être vide.' });
  Records.update('Deal', brut.id, { nom });
  ajouterSuiviDeal(Records.get('Deal', brut.id), { type: 'renommage', detail: `Renommé : ${nom}` }, currentUser(req));
  ok(res, { nom });
}));

// Abandonner un dossier directement depuis la liste (sans mail).
app.post('/api/preanalyse/dossiers/:dealId/abandonner', wrap((req, res) => {
  const brut = Records.filter('Deal', { deal_id: req.params.dealId })[0];
  if (!brut) return res.status(404).json({ error: 'Dossier introuvable' });
  const r = changerStatut(brut, 'abandonne', { user: currentUser(req), note: req.body?.note || 'Abandon depuis la liste' });
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, { statut: 'abandonne' });
}));

// ---------------------------------------------------------------------------
// Espace de travail d'un dossier : documents importés et conversations (chat
// libre ou analyses sur documents cochés). Voir deal/espace.js.
// ---------------------------------------------------------------------------
app.post('/api/preanalyse/dossiers/:dealId/espace/documents', upload.single('fichier'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
  const user = currentUser(req);
  const r = ajouterDocumentEspace(req.params.dealId, {
    nom: req.body?.nom || req.file.originalname,
    url: `/uploads/${req.file.filename}`,
    mime: req.file.mimetype,
    taille: req.file.size,
  }, user);
  if (!r.ok) return res.status(404).json({ error: r.error });

  // L'extraction part tout seul, en tâche de fond : la réponse n'attend
  // pas l'analyse, et personne ne reste devant l'écran.
  const { enfiler } = await import('./deal/file-extraction.js');
  enfiler(req.params.dealId, [r.document.id], { uploadDir: UPLOAD_DIR, user });
  ok(res, r.document);
}));

app.post('/api/preanalyse/dossiers/:dealId/espace/documents/:docId/renommer', wrap((req, res) => {
  const r = renommerDocumentEspace(req.params.dealId, req.params.docId, req.body?.nom, req.body?.categorie);
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, r);
}));

app.delete('/api/preanalyse/dossiers/:dealId/espace/documents/:docId', wrap((req, res) => {
  const r = supprimerDocumentEspace(req.params.dealId, req.params.docId, UPLOAD_DIR);
  if (!r.ok) return res.status(404).json({ error: r.error });
  ok(res, r);
}));

app.post('/api/preanalyse/dossiers/:dealId/espace/chat', wrap(async (req, res) => {
  const { message, mode, documents, conversation_id } = req.body || {};
  const r = await converser(req.params.dealId, {
    message,
    mode: ['analyse', 'verification', 'web'].includes(mode) ? mode : 'question',
    documents: Array.isArray(documents) ? documents : [],
    conversationId: conversation_id || null,
    uploadDir: UPLOAD_DIR,
    user: currentUser(req),
  });
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, r.conversation);
}));

// Extraction : chaque document coché devient une table de données sourcées
// (libellé, valeur, page, citation), consultable en onglets sous le chat.
app.post('/api/preanalyse/dossiers/:dealId/espace/extraire', wrap(async (req, res) => {
  const r = await extraireDocuments(req.params.dealId, {
    documents: Array.isArray(req.body?.documents) ? req.body.documents : [],
    uploadDir: UPLOAD_DIR,
    user: currentUser(req),
  });
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, r.extractions);
}));

// Correction manuelle d'une ligne : constat, statut ou commentaire.
app.post('/api/preanalyse/dossiers/:dealId/espace/extractions/:extId/lignes/:index', wrap((req, res) => {
  const r = majLigneExtraction(req.params.dealId, req.params.extId, Number(req.params.index), req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, r);
}));

// La grille de lecture, pour que le front propose les mêmes statuts.
app.get('/api/preanalyse/grille', wrap(async (req, res) => {
  const { GRILLE, STATUTS_LIGNE } = await import('./deal/grille.js');
  ok(res, { grille: GRILLE, statuts: STATUTS_LIGNE });
}));

// L'onglet d'une analyse porte un titre libre, à défaut sa catégorie.
app.post('/api/preanalyse/dossiers/:dealId/espace/extractions/:extId/renommer', wrap((req, res) => {
  const r = renommerExtraction(req.params.dealId, req.params.extId, req.body?.titre);
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, r);
}));

app.delete('/api/preanalyse/dossiers/:dealId/espace/extractions/:extId', wrap((req, res) => {
  const r = supprimerExtraction(req.params.dealId, req.params.extId);
  if (!r.ok) return res.status(404).json({ error: r.error });
  ok(res, r);
}));

app.post('/api/preanalyse/dossiers/:dealId/espace/conversations/:convId/renommer', wrap((req, res) => {
  const r = renommerConversation(req.params.dealId, req.params.convId, req.body?.titre);
  if (!r.ok) return res.status(400).json({ error: r.error });
  ok(res, r);
}));

app.delete('/api/preanalyse/dossiers/:dealId/espace/conversations/:convId', wrap((req, res) => {
  const r = supprimerConversation(req.params.dealId, req.params.convId);
  if (!r.ok) return res.status(404).json({ error: r.error });
  ok(res, r);
}));

// Descripteur des étapes d'un dossier : le front consomme la même source que
// le serveur au lieu de la réécrire.
app.get('/api/preanalyse/etapes', wrap(async (req, res) => {
  const { ETAPES } = await import('./deal/etapes.js');
  ok(res, { etapes: ETAPES });
}));

// Déblocage explicite : « passer à l'étape suivante ». L'étape atteinte ne
// recule jamais ; on ne peut débloquer que l'étape immédiatement suivante.
app.post('/api/preanalyse/dossiers/:dealId/etape-suivante', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const { ETAPES, etapeMax } = await import('./deal/etapes.js');
  const brut = Records.filter('Deal', { deal_id: req.params.dealId })[0];
  const courante = etapeMax(brut);
  // Une étape cible peut être demandée : y aller valide toutes les
  // précédentes d'un coup. Sans cible, on avance d'un cran. Jamais en arrière.
  const cible = Number(req.body?.etape);
  const suivante = Math.min(ETAPES.length, Math.max(courante, isFinite(cible) && cible > 0 ? cible : courante + 1));
  if (suivante <= courante) return ok(res, { etape_max: courante });
  Records.update('Deal', brut.id, { etape_max: suivante });
  const user = currentUser(req);
  ajouterSuiviDeal(Records.get('Deal', brut.id), {
    type: 'etape',
    detail: `Étape débloquée : ${ETAPES[suivante - 1].label}`,
  }, user);
  ok(res, { etape_max: suivante });
}));

// Revenir à une étape antérieure : le dossier redevient modifiable à partir
// de là (le mail se rouvre, la pré-analyse se refait). Les données déjà
// produites — lots, documents, conversations — ne sont jamais effacées.
app.post('/api/preanalyse/dossiers/:dealId/revenir', wrap(async (req, res) => {
  const brut = Records.filter('Deal', { deal_id: req.params.dealId })[0];
  if (!brut) return res.status(404).json({ error: 'Dossier introuvable' });
  const { ETAPES } = await import('./deal/etapes.js');
  const demandee = Number(req.body?.etape);
  const cible = Math.min(ETAPES.length, Math.max(1, isFinite(demandee) && demandee > 0 ? demandee : 1));
  Records.update('Deal', brut.id, { etape_max: cible });
  ajouterSuiviDeal(Records.get('Deal', brut.id), {
    type: 'etape',
    detail: `Retour à l'étape ${cible} — ${ETAPES[cible - 1].label}`,
  }, currentUser(req));
  ok(res, { etape_max: cible });
}));

app.get('/api/preanalyse/pipeline', wrap((req, res) => {
  const dossiers = listerDossiers(200);
  const compteurs = {};
  for (const s of STATUTS) compteurs[s] = 0;
  let aRelancerTotal = 0;
  for (const d of dossiers) {
    compteurs[d.statut] = (compteurs[d.statut] || 0) + 1;
    if (d.a_relancer) aRelancerTotal++;
  }
  ok(res, { dossiers, compteurs, a_relancer: aRelancerTotal, libelles: LIBELLES_STATUTS });
}));

// Brouillon de mail d'intention (refus, demande de documents, relance,
// abandon, présentation client). Rien n'est envoyé ici.
app.post('/api/preanalyse/dossiers/:dealId/mail', wrap(async (req, res) => {
  const { intention, lot_index = 0, raisons } = req.body || {};
  if (!INTENTIONS.includes(intention)) {
    return res.status(400).json({ error: `Intention inconnue : ${intention}` });
  }
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const lot = dossier.lots?.[Number(lot_index)] || dossier.lots?.[0];
  if (!lot) return res.status(404).json({ error: 'Lot introuvable' });

  const user = currentUser(req);
  const mail = await redigerMailIntention(lot, intention, {
    signature: user?.full_name || user?.email,
    raisons,
    // Deal de test : texte de secours directement, aucun appel LLM.
    sansIA: !!dossier.test,
  });
  ok(res, { ...mail, intention, destinataire: dossier.contact_agent_email || '' });
}));

// Dépôt d'un document sur le deal : extraction via le pipeline Alexis,
// liaison Deal ↔ DossierDoc, avancement du statut et synthèse recalculée.
app.post('/api/preanalyse/dossiers/:dealId/documents', upload.single('fichier'), wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  if (dossier.test) {
    return res.status(400).json({ error: 'Deal de test : utilisez « Simuler la réception des documents ».' });
  }
  if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

  const user = currentUser(req);
  const r = await analyserDocument(
    {
      buffer: fs.readFileSync(req.file.path),
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      url: `/uploads/${req.file.filename}`,
    },
    { dossierId: dossier.dossier_doc_id || undefined, typeForce: req.body?.type || undefined, user }
  );

  const patch = {};
  if (!dossier.dossier_doc_id) {
    patch.dossier_doc_id = r.dossier_id;
    // Le dossier documentaire porte le titre du deal pour s'y retrouver.
    const titre = dossier.lots?.[0]?.synthese?.titre;
    if (titre) renommerDossier(r.dossier_id, titre);
  }

  // La synthèse « points à vérifier » est recalculée à chaque dépôt.
  const dossierDoc = obtenirDossierDoc(r.dossier_id);
  const synthese = await syntheseDocuments(dossier.lots?.[0], dossierDoc);
  if (synthese) patch.synthese_documents = synthese;
  if (Object.keys(patch).length) Records.update('Deal', dossier.id, patch);

  // Avancement : demandes → reçus → extrait (les transitions invalides sont
  // ignorées, un dépôt sur un deal déjà extrait ne change rien).
  const enrichi = { ...dossier, ...patch };
  if (statutDe(enrichi) === 'documents_demandes' || statutDe(enrichi) === 'analyse') {
    changerStatut(enrichi, 'documents_recus', { user, note: `Document reçu : ${req.file.originalname}` });
    enrichi.statut = 'documents_recus';
    enrichi.suivi = Records.get('Deal', dossier.id)?.suivi || enrichi.suivi;
  }
  if (statutDe(enrichi) === 'documents_recus') {
    changerStatut(enrichi, 'depouille', { user, note: 'Extraction effectuée' });
  }

  ok(res, { ...r, deal: { deal_id: dossier.deal_id, statut: statutDe(Records.get('Deal', dossier.id)), dossier_doc_id: patch.dossier_doc_id || dossier.dossier_doc_id, synthese_documents: patch.synthese_documents || dossier.synthese_documents } });
}));

// Classement des documents du deal dans le Drive du compte connecté.
app.post('/api/preanalyse/dossiers/:dealId/drive', wrap(async (req, res) => {
  // Deal de test : classement simulé, aucun appel Google.
  const dossierTest = obtenirDossier(req.params.dealId);
  if (dossierTest?.test) {
    ajouterSuiviDeal(dossierTest, { type: 'documents_recus', detail: 'Classement Drive simulé (mode test)' }, currentUser(req));
    return ok(res, {
      simulated: true,
      envoyes: [{ nom: 'bail-commercial.pdf' }, { nom: 'pv-ag-2025.pdf' }, { nom: 'diagnostics.pdf' }],
      erreurs: [],
      folder_url: null,
    });
  }

  const { compte } = req.body || {};
  if (!compte) return res.status(400).json({ error: 'Compte manquant' });
  if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });

  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

  const fichiers = [];
  // Les documents extraits, plus la fiche commerciale d'origine.
  const dossierDoc = dossier.dossier_doc_id ? obtenirDossierDoc(dossier.dossier_doc_id) : null;
  for (const d of dossierDoc?.documents || []) {
    if (d.url) fichiers.push({ nom: d.nom_fichier, chemin: d.url });
  }
  if (dossier.source?.url) {
    fichiers.push({ nom: dossier.source.nom_fichier || 'fiche-commerciale', chemin: dossier.source.url });
  }
  // Aucun fichier n'empêche rien : le dossier Drive peut être créé en avance,
  // les documents s'y classeront au fil de l'eau.

  const titre = dossier.lots?.[0]?.synthese?.titre || dossier.source?.nom_fichier || dossier.deal_id;
  const r = await classerDansDrive(compte, titre, fichiers, UPLOAD_DIR);

  Records.update('Deal', dossier.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
  const user = currentUser(req);
  const dealMaj = Records.get('Deal', dossier.id);
  ajouterSuiviDeal(dealMaj, { type: 'documents_recus', detail: `${r.envoyes.length} fichier(s) classé(s) dans le Drive` }, user);
  ok(res, r);
}));

// Présentation bancaire du lot : PPTX généré depuis les données du deal,
// converti en Google Slides (modifiable) quand un compte Drive est fourni.
// Le PPTX reste téléchargeable dans tous les cas.
app.post('/api/preanalyse/dossiers/:dealId/lots/:index/presentation', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const idx = Number(req.params.index);
  const lot = dossier.lots?.[idx];
  if (!lot) return res.status(404).json({ error: 'Lot introuvable' });

  const { genererPresentationBanque } = await import('./deal/presentation.js');
  const buffer = await genererPresentationBanque(dossier, lot);

  const nomFichier = `presentation-banque-${String(dossier.deal_id).replace(/[^a-zA-Z0-9_-]/g, '_')}-lot${idx}.pptx`;
  const dossierPres = path.join(UPLOAD_DIR, 'presentations');
  fs.mkdirSync(dossierPres, { recursive: true });
  fs.writeFileSync(path.join(dossierPres, nomFichier), buffer);
  const pptx_url = `/uploads/presentations/${nomFichier}`;

  const { compte } = req.body || {};
  let slides_url = null;
  let erreur_slides = null;
  if (compte) {
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    try {
      const { uploaderEnSlides } = await import('./google-drive.js');
      const r = await uploaderEnSlides(compte, {
        nom: `Présentation banque — ${lot.synthese?.titre || dossier.deal_id}`,
        buffer,
      });
      slides_url = r.slides_url;
    } catch (e) {
      erreur_slides = e?.message || String(e);
      console.error('[presentation] conversion Slides impossible :', erreur_slides);
    }
  }

  const lots = [...(dossier.lots || [])];
  lots[idx] = { ...lot, presentation: { slides_url, pptx_url, genere_le: new Date().toISOString() } };
  Records.update('Deal', dossier.id, { lots });

  ok(res, { slides_url, pptx_url, erreur_slides });
}));

// Création d'un projet pré-rempli depuis un lot du deal.
app.post('/api/preanalyse/dossiers/:dealId/lots/:index/projet', wrap(async (req, res) => {
  const user = currentUser(req);
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

  // Documents présents mais jamais extraits : on extrait d'abord, puis on
  // crée le projet avec les données relevées. Entrer le deal dans la plateforme
  // ne demande donc plus d'être passé par l'étape 3 à la main.
  let analyse = null;
  const aDesDocuments = (dossier.documents_espace || []).length > 0;
  if (aDesDocuments && !(dossier.extractions || []).length) {
    const r = await extraireDocuments(req.params.dealId, {
      documents: (dossier.documents_espace || []).map((d) => d.id),
      uploadDir: UPLOAD_DIR,
      user,
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    analyse = {
      documents: r.extractions.length,
      donnees: r.extractions.reduce((n, e) => n + (e.lignes || []).filter((l) => l.constat).length, 0),
    };
  }

  const r = creerProjetDepuisDeal(req.params.dealId, Number(req.params.index), user);
  if (!r.ok) return res.status(r.project_id ? 409 : 400).json({ error: r.error, project_id: r.project_id });
  ok(res, { project_id: r.project.id, titre: r.project.titre, champs_remplis: r.champs_remplis, analyse });
}));

// ---------------------------------------------------------------------------
// Assistant : le plan de travail.
// La pile est calculée à la demande depuis l'état en base — rien n'est stocké,
// donc rien ne se périme. Aucune action n'est déclenchée ici.
// ---------------------------------------------------------------------------
app.get('/api/assistant/propositions', wrap(async (req, res) => {
  const user = currentUser(req);
  const { construirePropositions } = await import('./deal/propositions.js');
  const { etatVeille } = await import('./deal/veille-mails.js');
  // Chacun ne voit que les boîtes qu'il a connectées.
  const comptes = listAccounts(user?.email).map((c) => c.id);
  const propositions = await construirePropositions({ comptes });

  // Une proposition montrée est notée : sans cela, rien ne dit ce qui est suivi
  // d'effet et les priorités restent des constantes jamais confrontées.
  const { noterVues } = await import('./suivi-propositions.js');
  noterVues(propositions, user);

  ok(res, { propositions, veille: etatVeille() });
}));

// Relève immédiate, sans attendre le prochain passage de la veille.
app.post('/api/assistant/relever', wrap(async (req, res) => {
  const { relever } = await import('./deal/veille-mails.js');
  ok(res, await relever());
}));

// Une proposition traitée : c'est ce qui ferme la boucle de mesure.
app.post('/api/assistant/propositions/traitee', wrap(async (req, res) => {
  const { type, deal_id, mail_id, id, action } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Type manquant' });
  const { noterTraitee } = await import('./suivi-propositions.js');
  const r = noterTraitee({ type, deal_id, mail_id, id, action, user: currentUser(req) });
  ok(res, { notee: !!r });
}));

// Ce que deviennent les propositions, et ce que coûte l'IA.
app.get('/api/monitoring/propositions', wrap(async (req, res) => {
  if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { syntheseTraitement } = await import('./suivi-propositions.js');
  ok(res, syntheseTraitement(Number(req.query.jours) || 30));
}));

app.get('/api/monitoring/couts', wrap(async (req, res) => {
  if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { syntheseCouts } = await import('./llm-couts.js');
  ok(res, syntheseCouts(Number(req.query.jours) || 30));
}));

// Correction du tri par l'équipe. Elle vaut pour l'expéditeur entier : la
// question ne se repose jamais deux fois.
app.post('/api/assistant/mails/:id/tri', wrap(async (req, res) => {
  const { decision, motif, portee } = req.body || {};
  if (!['garder', 'ignorer'].includes(decision)) {
    return res.status(400).json({ error: 'Décision inconnue' });
  }
  const mail = Records.get('MailRecu', req.params.id);
  if (!mail) return res.status(404).json({ error: 'Mail introuvable' });

  const { apprendre } = await import('./deal/tri-mails.js');
  const email = String(mail.de_email || '').toLowerCase();
  const r = apprendre({
    email,
    decision,
    motif,
    // Défaut volontaire : ce mail-ci, pas tout l'expéditeur. Un agent envoie de
    // bons biens et des mails sans intérêt ; le faire taire serait pire.
    portee: ['expediteur', 'domaine'].includes(portee) ? portee : 'mail',
    exemple: mail,
    par: currentUser(req)?.email,
  });
  if (!r.ok) return res.status(400).json(r);

  // Un mail écarté n'a plus à figurer dans la pile : la correction le retire.
  if (decision === 'ignorer') Records.delete('MailRecu', mail.id);
  ok(res, { ...r, expediteur: mail.de_email });
}));

// Faire taire un expéditeur, ou le réhabiliter. Séparé de la correction d'un
// mail : celui-ci est supprimé au passage, il ne peut plus servir de référence.
app.post('/api/assistant/tri-expediteur', wrap(async (req, res) => {
  const { email, decision, motif, portee } = req.body || {};
  if (!['garder', 'ignorer'].includes(decision)) {
    return res.status(400).json({ error: 'Décision inconnue' });
  }
  if (!email) return res.status(400).json({ error: 'Expéditeur manquant' });

  const { apprendre } = await import('./deal/tri-mails.js');
  const r = apprendre({
    email,
    decision,
    motif,
    portee: portee === 'domaine' ? 'domaine' : 'expediteur',
    par: currentUser(req)?.email,
  });
  if (!r.ok) return res.status(400).json(r);

  // Les mails déjà remontés de cet expéditeur quittent la pile.
  let retires = 0;
  if (decision === 'ignorer') {
    for (const m of Records.filter('MailRecu', { de_email: String(email).toLowerCase() })) {
      if (m.deal_id) continue; // un mail rattaché à un dossier reste
      Records.delete('MailRecu', m.id);
      retires += 1;
    }
  }
  ok(res, { ...r, retires });
}));

// Monday : découverte des tableaux et de leurs colonnes. Sans les identifiants
// de colonnes, impossible d'écrire quoi que ce soit — chacune est adressée par
// son id, pas par son titre.
app.get('/api/monday/tableaux', wrap(async (req, res) => {
  const { mondayConfigure, listerTableaux, TABLEAUX } = await import('./monday.js');
  if (!mondayConfigure()) {
    return ok(res, { configure: false, tableaux: [], vises: TABLEAUX });
  }
  const tableaux = await listerTableaux();
  ok(res, {
    configure: true,
    vises: TABLEAUX,
    tableaux: tableaux.map((t) => ({
      id: t.id,
      nom: t.name,
      colonnes: (t.columns || []).map((c) => ({ id: c.id, titre: c.title, type: c.type })),
    })),
  });
}));

// L'assistant de commande : une phrase, une action.
app.post('/api/assistant/commande', wrap(async (req, res) => {
  const { messages, contexte } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'Message manquant' });
  }
  const user = currentUser(req);
  const { commander } = await import('./assistant-commande.js');
  const debut = Date.now();
  // La demande est mesurée : une seule question peut déclencher six appels au
  // modèle, ils comptent tous pour elle.
  const { mesurer } = await import('./llm-couts.js');
  const { resultat: r, consommation } = await mesurer(
    { operation: 'assistant', par: user?.email, sur: contexte?.deal_id || contexte?.projet_id },
    () => commander(messages.slice(-12), user, contexte)
  );

  // Chaque échange laisse une ligne : la question, la réponse, les outils
  // consultés et ceux qui ont agi.
  const { consignerRequete } = await import('./journal-usage.js');
  consignerRequete({
    question: messages[messages.length - 1]?.contenu,
    reponse: r.texte,
    outils: r.outils,
    actions: (r.actions || []).map((a) => a.name),
    user,
    duree_ms: Date.now() - debut,
    cout: consommation?.cout ?? null,
    jetons: consommation ? consommation.entree + consommation.sortie : null,
    contexte,
  });

  // Le fil survit au rechargement : il vit en base, pas dans l'onglet.
  const { enregistrerFil } = await import('./assistant-fil.js');
  enregistrerFil(user, [...messages, { role: 'assistant', contenu: r.texte }]);
  ok(res, r);
}));

// Consignation d'une page ouverte. Ouvert à tout utilisateur connecté : c'est
// son propre passage qu'il déclare.
app.post('/api/journal/page', wrap(async (req, res) => {
  const { consignerVisite } = await import('./journal-usage.js');
  consignerVisite({ page: req.body?.page, url: req.body?.url, user: currentUser(req) });
  ok(res, { consigne: true });
}));

// Centre de suivi : réservé aux administrateurs, il expose l'usage de chacun.
app.get('/api/monitoring', wrap(async (req, res) => {
  const user = currentUser(req);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { synthese } = await import('./journal-usage.js');
  ok(res, synthese(Number(req.query.jours) || 30));
}));

// L'historique complet des échanges avec l'assistant.
app.get('/api/monitoring/requetes', wrap(async (req, res) => {
  const user = currentUser(req);
  if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { historiqueRequetes } = await import('./journal-usage.js');
  ok(
    res,
    historiqueRequetes({
      limite: Math.min(Number(req.query.limite) || 50, 200),
      depuis: Number(req.query.depuis) || 0,
      par: req.query.par || null,
    })
  );
}));

// Ce que la plateforme a fait toute seule, et ce que cette personne n'a pas
// encore vu.
app.get('/api/assistant/rapports', wrap(async (req, res) => {
  const { rapports } = await import('./rapport-auto.js');
  ok(res, rapports(currentUser(req), { jours: Number(req.query.jours) || 7 }));
}));

// Rattraper une opération manquée pendant la nuit, sans rejouer tout le passage.
app.post('/api/assistant/rapports/:id/relancer', wrap(async (req, res) => {
  const { relancer } = await import('./rapport-auto.js');
  try {
    ok(res, await relancer(req.params.id, Number(req.body?.index)));
  } catch (e) {
    res.status(400).json({ error: e?.message || 'Relance impossible' });
  }
}));

app.post('/api/assistant/rapports/vus', wrap(async (req, res) => {
  const { marquerVus } = await import('./rapport-auto.js');
  ok(res, { marques: marquerVus(currentUser(req), req.body?.ids) });
}));

// Le fil de conversation de l'utilisateur, tel qu'il l'a laissé.
app.get('/api/assistant/fil', wrap(async (req, res) => {
  const { lireFil } = await import('./assistant-fil.js');
  ok(res, { messages: lireFil(currentUser(req)) });
}));

app.delete('/api/assistant/fil', wrap(async (req, res) => {
  const { effacerFil } = await import('./assistant-fil.js');
  effacerFil(currentUser(req));
  ok(res, { efface: true });
}));

// À qui correspond chaque projet, d'après les investisseurs tenus dans Monday.
// Un seul appel pour toute la page : la liste des investisseurs est en cache,
// une requête par projet la relirait pour rien.
app.get('/api/monday/projets/clients', wrap(async (req, res) => {
  const { mondayConfigure } = await import('./monday.js');
  if (!mondayConfigure()) return ok(res, { configure: false, par_projet: {} });

  const { investisseursPourProjet } = await import('./deal/monday-sync.js');
  const projets = Records.list('Project').filter((p) => !p.archived);

  const parProjet = {};
  for (const projet of projets) {
    const candidats = await investisseursPourProjet(projet);
    if (candidats.length) {
      parProjet[projet.id] = candidats.map((c) => ({
        nom: c.client.nom,
        budget: c.client.budget,
        statut: c.client.statut,
        raisons: c.raisons,
      }));
    }
  }
  ok(res, { configure: true, par_projet: parProjet });
}));

// Pousser un projet de la plateforme dans Monday.
app.post('/api/monday/projets/:id', wrap(async (req, res) => {
  const projet = Records.get('Project', req.params.id);
  if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
  const { pousserProjet } = await import('./deal/monday-sync.js');
  const r = await pousserProjet(projet, { motif: req.body?.motif });
  if (r?.ignore) return res.status(400).json({ error: 'Monday non configuré' });
  ok(res, r);
}));

// Pousser un dossier dans « Propriétés Klocka » sans attendre sa clôture.
app.post('/api/monday/dossiers/:dealId', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const { pousserBien } = await import('./deal/monday-sync.js');
  const r = await pousserBien(Records.filter('Deal', { deal_id: req.params.dealId })[0], {
    motif: req.body?.motif,
  });
  if (r?.ignore) return res.status(400).json({ error: 'Monday non configuré' });
  ok(res, r);
}));

// CRM : les agents des dossiers deviennent des fiches contact, sans saisie.
app.post('/api/assistant/crm/synchroniser', wrap(async (req, res) => {
  const { synchroniserAgents } = await import('./deal/crm-sync.js');
  ok(res, synchroniserAgents());
}));

// Agenda d'équipe : création de l'agenda partagé et report des échéances.
app.get('/api/assistant/calendrier', wrap(async (req, res) => {
  const { lienCalendrier, calendrierConfigure } = await import('./google-calendar.js');
  const { calendarDemande } = await import('./google-oauth.js');
  ok(res, { actif: calendarDemande, configure: calendrierConfigure(), lien: lienCalendrier() });
}));

app.post('/api/assistant/calendrier/synchroniser', wrap(async (req, res) => {
  const user = currentUser(req);
  const { compte, partager } = req.body || {};
  if (!compte) return res.status(400).json({ error: 'Compte manquant' });
  if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });

  const { synchroniserEcheances, partagerCalendrier, lienCalendrier } = await import('./google-calendar.js');
  const r = await synchroniserEcheances(compte, APP_URL_PROD || `http://localhost:${PORT}`);

  // Partage avec l'équipe : tous les admins, sauf le compte propriétaire.
  let partage = null;
  if (partager !== false) {
    const admins = Records.filter('User', { role: 'admin' })
      .map((u) => u.email)
      .filter((e) => e && e.toLowerCase() !== String(compte).toLowerCase());
    if (admins.length) partage = await partagerCalendrier(compte, admins);
  }
  ok(res, { ...r, partage, lien: lienCalendrier(), par: user?.email || null });
}));

// Ce que l'extraction sait remplir dans la fiche projet, ligne par ligne :
// l'onglet « Données extraites » de l'étape Analyse s'appuie dessus.
app.get('/api/preanalyse/dossiers/:dealId/donnees-projet', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const { donneesProjet } = await import('./deal/donnees-projet.js');
  ok(res, { lignes: donneesProjet(dossier) });
}));

// Vidéo de présentation client (~30 s, Remotion). Le rendu tourne en
// arrière-plan ; le MP4 fini se télécharge depuis /uploads/videos/.
app.post('/api/preanalyse/dossiers/:dealId/lots/:index/video', wrap(async (req, res) => {
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
  const { lancerVideoLot } = await import('./video/index.js');
  const r = lancerVideoLot(dossier, Number(req.params.index));
  if (r.error) return res.status(404).json(r);
  ok(res, r);
}));

// État du rendu (en_cours / pret / erreur / aucune) + URL du fichier.
app.get('/api/preanalyse/dossiers/:dealId/lots/:index/video', wrap(async (req, res) => {
  const { statutVideo } = await import('./video/index.js');
  ok(res, statutVideo(req.params.dealId, Number(req.params.index)));
}));

// Changement de statut manuel (décision sans mail, réception de documents…).
app.post('/api/preanalyse/dossiers/:dealId/statut', wrap((req, res) => {
  const { statut, note } = req.body || {};
  const dossier = obtenirDossier(req.params.dealId);
  if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

  const user = currentUser(req);
  const r = changerStatut(dossier, statut, { user, note });
  if (!r.ok) return res.status(400).json({ error: r.error });

  // Un abandon capitalise l'observation dans la base marché (hors deal de test).
  if (statut === 'abandonne' && statutDe(dossier) !== 'abandonne' && !dossier.test) {
    for (const lot of dossier.lots || []) alimenterBaseMarche(dossier, lot, user);
  }
  ok(res, { deal_id: dossier.deal_id, statut: r.deal.statut, suivi: r.deal.suivi });
}));

// ---------------------------------------------------------------------------
// Alexis — extraction documentaire
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

// ---------------------------------------------------------------------------
// Lecture intégrée d'un article public (fiches « Aller plus loin »)
// ---------------------------------------------------------------------------
app.get('/api/lecture', wrap(async (req, res) => {
  try {
    ok(res, await lireArticle(String(req.query.url || '')));
  } catch (e) {
    res.status(e.statut || 500).json({ error: e.message });
  }
}));

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

// En production, le premier rendu vidéo paie le téléchargement du navigateur
// et le bundle webpack : on les préchauffe en arrière-plan dès le démarrage.
// En local, inutile — le premier clic les construit en quelques secondes.
if (EN_PRODUCTION) {
  import('./video/index.js').then((m) => m.prechaufferVideo()).catch(() => {});
}

// Extractions interrompus par un arrêt du serveur : on les reprend, sinon
// leurs pièces resteraient marquées « en cours » sans que rien n'avance.
import('./deal/file-extraction.js').then(({ reprendreEnAttente }) => {
  const n = reprendreEnAttente(UPLOAD_DIR);
  if (n) console.log(`  ▸ ${n} extraction(s) repris après redémarrage`);
});

// Agents des dossiers → fiches CRM, dès le démarrage.
import('./deal/crm-sync.js').then(({ synchroniserAgents }) => {
  const { crees, completes } = synchroniserAgents();
  if (crees || completes) console.log(`  ▸ CRM : ${crees} agent(s) créé(s), ${completes} complété(s)`);
});

// Veille des boîtes mail : relève périodique et rattachement des réponses aux
// dossiers. Sans portée de lecture Gmail accordée, elle ne démarre pas.
import('./deal/veille-mails.js').then(({ demarrerVeille }) => {
  const active = demarrerVeille();
  console.log(
    active
      ? `  ▸ Veille des boîtes mail active (toutes les ${process.env.MAIL_VEILLE_MINUTES || 5} min)`
      : '  ▸ Veille des boîtes mail inactive (GOOGLE_GMAIL_READ absent)'
  );
});

app.listen(PORT, () => {
  const url = process.env.APP_URL || `http://localhost:${PORT}`;
  const accounts = listAccounts();
  console.log(`\n  ▸ Klocka : ${url}\n`);
  console.log(`    Interface  : ${fs.existsSync(DIST_DIR) ? 'servie sur ce port' : 'absente — lancez `npm run build`'}`);
  console.log(`    IA         : ${llmEnabled ? llmStatus().label : 'désactivée — ajoutez ANTHROPIC_API_KEY dans .env'}`);
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
    `    Expéditeurs : ${accounts.length ? accounts.map((a) => a.email).join(', ') : 'aucun — connectez un compte depuis le dashboard'}\n`
  );
});
