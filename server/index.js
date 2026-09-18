// Local backend replacing the Base44 cloud for the Klocka app.
// Serves the same API surface the frontend SDK shim expects:
//   /api/apps/public/...   app public settings (auth bootstrap)
//   /api/auth/...          current user / updateMe / logout
//   /api/entities/...      generic CRUD over all Base44 entities
//   /api/integrations/...  InvokeLLM, UploadFile, SendEmail, etc.
//   /api/functions/:name   ported Base44 backend functions
//   /uploads/...           locally stored uploaded files

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Records, Meta, infoStockage } from './db.js';
import { derniersIncidents, noterIncident } from './incidents.js';

// L'heure de ce processus-ci : « depuis quand tourne le serveur » répond à la
// moitié des questions qui commencent par « ça a planté vers ».
const demarreLe = new Date().toISOString();
import { mesurerRequetes } from './llm-couts.js';
import { runSeedIfEmpty, ADMIN_EMAIL } from './seed.js';
import { restaurerSeedSiNecessaire } from './seed-donnees.js';
import { llmEnabled, llmStatus } from './llm.js';
import { sendEmail, listAccounts } from './email.js';
import { ensureMailTemplates } from './mail.js';
import { googleEnabled, googleStatus, buildAuthUrl, handleCallback, redirectUriPour } from './google-oauth.js';
import { createSession, sessionEmail, destroySession, purgeExpiredSessions, prolongerSession } from './sessions.js';
import {
  hacherMotDePasse,
  verifierMotDePasse,
  validerMotDePasse,
  tropDeTentatives,
  enregistrerEchec,
  reinitialiserTentatives,
  minutesDAttente,
} from './passwords.js';
import { callFunction } from './functions.js';
import { lireArticle } from './lecture.js';
import { journaliser, purgerAudit, lireAudit, resumeAudit } from './audit.js';
import { RETOUR_POPUP, authResultPage, popupConnectePage } from './pages-oauth.js';
import { monterPreanalyse } from './routes/preanalyse.js';
import { monterAssistant } from './routes/assistant.js';
import { monterMarche } from './routes/marche.js';
import { monterEntites } from './routes/entites.js';
import { monterAlexis } from './routes/alexis.js';
import { monterCourriel } from './routes/courriel.js';
import { monterIntegrations } from './routes/integrations.js';
import { monterMonday } from './routes/monday.js';
import { monterAlx } from './routes/alx.js';
import { monterKZoning } from './routes/kzoning.js';
import { monterKExpertise } from './routes/kexpertise.js';
import { monterKEstimation } from './routes/kestimation.js';
import { monterKValeurLocative } from './routes/kvaleurlocative.js';
// Le noyau partagé : qui parle, comment répondre, où se déposent les fichiers.
import {
  UPLOAD_DIR,
  PORT,
  APP_URL_PROD,
  EN_PRODUCTION,
  AUTH_DESACTIVEE,
  currentUser,
  sansSecret,
  retirerChampsProteges,
  normEmail,
  urlPublique,
  ok,
  wrap,
  upload,
  compteAutorise,
} from './contexte.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ID = process.env.VITE_BASE44_APP_ID || 'klocka-local';

// Les données réelles chiffrées du dépôt d'abord (déploiement autoportant),
// le seed de démonstration ensuite — il ne joue que si rien n'a été restauré.
restaurerSeedSiNecessaire();
runSeedIfEmpty();

// Le mode découverte a vécu : les comptes qui y étaient redeviennent des
// clients ordinaires (étape 1 au moins), et le projet de démonstration s'en
// va. Une fois, puis plus jamais.
try {
  if (!Meta.get('migration_acces_v2')) {
    let n = 0;
    for (const u of Records.list('User')) {
      if (u.acces === 'decouverte') {
        Records.update('User', u.id, { acces: null, etape_actuelle: Math.max(1, u.etape_actuelle || 0) });
        n += 1;
      }
    }
    for (const p of Records.list('Project')) if (p.demo_vitrine) Records.delete('Project', p.id);
    Meta.set('migration_acces_v2', `${n} le ${new Date().toISOString()}`);
    if (n) console.log(`[acces] ${n} compte(s) découverte redevenu(s) client(s)`);
  }
} catch (e) {
  console.warn('[acces] migration :', e?.message || e);
}
// Les comptes importés jamais activés reviennent en attente d'activation
// (étape 0), comme avant : c'est de là qu'on les invite, et l'invitation les
// active. Ne touche qu'aux comptes que la migration découverte avait déplacés.
try {
  if (!Meta.get('migration_acces_v3')) {
    let n = 0;
    for (const u of Records.list('User')) {
      if (u.role !== 'admin' && u.inscription_via === 'import' && !u.mot_de_passe) {
        Records.update('User', u.id, { etape_actuelle: 0, inscrit_le: null, inscription_via: null, acces: null });
        n += 1;
      }
    }
    Meta.set('migration_acces_v3', `${n} le ${new Date().toISOString()}`);
    if (n) console.log(`[acces] ${n} compte(s) importé(s) remis en attente d'activation`);
  }
} catch (e) {
  console.warn('[acces] migration v3 :', e?.message || e);
}
// Les ressources voyagent avec le code : sur une base neuve (déploiement sans
// disque persistant), elles se réimportent depuis server/ressources-seed.json.
try {
  const grainRessources = new URL('./ressources-seed.json', import.meta.url);
  if (Records.count('Resource') === 0 && fs.existsSync(grainRessources)) {
    const grains = JSON.parse(fs.readFileSync(grainRessources, 'utf-8'));
    for (const r of grains) Records.create('Resource', r);
    console.log(`[seed] ${grains.length} ressource(s) réimportée(s) — base neuve`);
  }
} catch (e) {
  console.warn('[seed] ressources :', e?.message || e);
}
ensureMailTemplates();
purgeExpiredSessions();
{
  // Le journal d'audit ne garde que six mois : passé ce délai il pèserait plus
  // que ce qu'il surveille.
  const purgees = purgerAudit();
  if (purgees) console.log(`[audit] ${purgees} entrée(s) au-delà de la rétention supprimée(s)`);
}


// AUTH_DESACTIVEE ouvre l'application en grand, avec les droits de l'admin et
// sans mot de passe. C'est une commodité de poste de travail. Sur une adresse
// publique en https, c'est la porte ouverte à toute la base : on refuse de
// démarrer plutôt que de servir cela. Le commentaire du .env.example le
// disait déjà ; rien ne l'empêchait.
if (AUTH_DESACTIVEE && EN_PRODUCTION) {
  console.error(
    "\n  ✖ AUTH_DESACTIVEE=true avec une APP_URL en https : refus de démarrer.\n" +
      "    Cette variable supprime toute authentification et donne les droits\n" +
      "    d'administrateur à n'importe quel visiteur. Elle n'a sa place qu'en\n" +
      `    développement local. Retirez-la de l'environnement de ${APP_URL_PROD}.\n`
  );
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
// En production, seule l'origine de l'application est admise ; les cookies de
// session restant SameSite, le CORS ouvert du dev ne doit pas suivre en prod.
// Les réponses partaient telles quelles : le premier chargement du tableau de
// bord pesait 3,2 Mo sur le réseau alors que le même contenu compressé en fait
// moins d'un. Cela vaut aussi pour l'API — une liste de projets est du JSON,
// c'est-à-dire du texte très répétitif.
app.use(compression());
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
// Chaque requête à l'API sait ce qu'elle a coûté en modèle, et à qui.
app.use(mesurerRequetes(currentUser));
// Qui a fait quoi. Avant le service des fichiers déposés : un bail téléchargé
// est précisément ce qu'on veut pouvoir retracer, et les fichiers statiques ne
// traversent pas les middlewares montés après eux.
app.use(journaliser(currentUser));
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
  // Chaque ouverture de l'application repousse l'échéance de la session.
  if (!AUTH_DESACTIVEE) prolongerSession(req, res);
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

const ipDe = (req) => (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

// Même amorçage que la connexion Google : l'adresse admin déclarée dans .env
// (et la toute première personne d'une base vierge) est toujours reconnue,
// même si son compte n'existe pas encore — il sera créé au moment où elle
// définit son mot de passe. Sans cela, une installation neuve refuse tout le
// monde, y compris l'admin.
const amorcagePossible = (email) =>
  Records.count('User') === 0 || email === normEmail(ADMIN_EMAIL);

app.post('/api/auth/verifier-email', wrap(async (req, res) => {
  const email = normEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: 'Adresse manquante' });

  const user = Records.findBy('User', 'email', email);
  if (!user) {
    if (amorcagePossible(email)) {
      return ok(res, { connu: true, email, prenom: null, role: 'admin', mot_de_passe_defini: false });
    }
    // Inconnue : les comptes se créent sur invitation.
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
  let user = Records.findBy('User', 'email', email);

  if (!user && amorcagePossible(email)) {
    user = Records.create('User', { email, role: 'admin', etape_actuelle: 0 });
    console.log(`[auth] amorçage : compte admin créé pour ${email}`);
  }
  if (!user) return res.status(404).json({ error: 'Compte inconnu.' });
  if (user.mot_de_passe) {
    return res.status(409).json({ error: 'Un mot de passe existe déjà pour ce compte. Connectez-vous.' });
  }

  // Le lien d'accès est le même pour tous : la personne saisit son adresse et
  // choisit son mot de passe. Un compte qui a reçu un lien nominatif garde sa
  // preuve par jeton ; les autres entrent par l'adresse.
  if (user.invitation_jeton) {
    const { jeton } = req.body || {};
    const expire = user.invitation_expire_le && new Date(user.invitation_expire_le) < new Date();
    if (!jeton || jeton !== user.invitation_jeton) {
      return res.status(403).json({ error: "Ce compte a reçu un lien d'invitation : ouvrez-le pour choisir votre mot de passe." });
    }
    if (expire) return res.status(410).json({ error: "Ce lien d'invitation a expiré. Demandez-en un nouveau à votre interlocuteur." });
  }

  const controle = validerMotDePasse(mot_de_passe);
  if (!controle.valide) return res.status(400).json({ error: controle.erreur });

  Records.update('User', user.id, {
    mot_de_passe: await hacherMotDePasse(mot_de_passe),
    mot_de_passe_defini_le: new Date().toISOString(),
    invitation_jeton: null,
    invitation_expire_le: null,
  });

  const fenetre = !!req.body?.fenetre;
  const jeton = createSession(res, email, { sansCookie: fenetre });
  console.log(`[auth] mot de passe défini et connexion : ${email} (${user.role || 'user'})`);
  ok(res, { success: true, email, role: user.role || 'user', ...(fenetre ? { jeton_session: jeton } : {}) });
}));

// Le lien d'invitation : ce qu'il ouvre, avant tout mot de passe.
app.get('/api/auth/invitation/:jeton', wrap((req, res) => {
  // « commun » : le lien unique, sans nom — la personne saisit son adresse.
  if (req.params.jeton === 'commun') return ok(res, { valide: true, commun: true });
  const user = Records.filter('User', { invitation_jeton: req.params.jeton })[0];
  if (!user) return ok(res, { valide: false, raison: 'inconnu' });
  if (user.mot_de_passe) return ok(res, { valide: false, raison: 'deja_actif', email: user.email });
  if (user.invitation_expire_le && new Date(user.invitation_expire_le) < new Date()) {
    return ok(res, { valide: false, raison: 'expire' });
  }
  ok(res, {
    valide: true,
    email: user.email,
    prenom: (user.full_name || '').split(' ')[0] || null,
  });
}));

// Le mail d'accès : court, le lien sous « Créer mon espace », une signature
// au prénom, le logo. Le même pour tous. En HTML pour que le lien soit un
// lien ; en texte pour les boîtes qui ne lisent que ça.
function mailAcces(prenom, lien, admin, base = '') {
  const signature = admin?.full_name?.split(' ')[0] || admin?.full_name || 'Klocka';
  const logo = base ? `${base}/icones/icone-192.png` : null;
  const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = `Bonjour${prenom ? ` ${prenom}` : ''},

Tu peux dès à présent accéder à ton espace Klocka via le lien suivant : ${lien}

Au plaisir de t'accompagner !

${signature}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111">
<p>Bonjour${prenom ? ` ${esc(prenom)}` : ''},</p>
<p>Tu peux dès à présent accéder à ton espace Klocka via le lien suivant : <a href="${esc(lien)}" style="color:#1a56db;text-decoration:underline">Créer mon espace</a></p>
<p>Au plaisir de t'accompagner !</p>
<p>${esc(signature)}</p>
${logo ? `<p style="margin-top:18px"><img src="${esc(logo)}" alt="Klocka" width="48" height="48" style="border-radius:10px"></p>` : ''}
</div>`;
  return { body, html };
}

const OBJET_ACCES = 'Klocka — Créez votre profil';


// Inviter un client : le compte est créé par l'équipe, la personne reçoit un
// lien et n'a qu'à choisir son mot de passe. Le compte entre directement à
// l'étape 1 — la salle d'attente n'a de sens que pour une inscription sauvage.
app.post('/api/admin/clients/inviter', wrap(async (req, res) => {
  const admin = currentUser(req);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { creerInvitation } = await import('./clients-invitation.js');
  const r = creerInvitation({ email: req.body?.email, full_name: req.body?.full_name, admin, base: urlPublique(req) });
  if (!r.ok) return res.status(r.error?.includes('invalide') ? 400 : 409).json({ error: r.error });
  if (r.promu) {
    console.log(`[auth] compte découverte passé client : ${r.user.email} par ${admin.email}`);
    return ok(res, { email: r.user.email, user_id: r.user.id, promu: true, lien: null, envoye: false, simule: false, erreur_envoi: null });
  }

  const prenom = (r.user.full_name || '').split(' ')[0];
  let envoi = null;
  if (req.body?.envoyer) {
    envoi = await sendEmail({
      owner: admin.email,
      to: r.user.email,
      subject: OBJET_ACCES,
      ...mailAcces(prenom, r.lien, admin, urlPublique(req)),
    });
  }
  console.log(`[auth] invitation : ${r.user.email} par ${admin.email}${envoi ? (envoi.simulated ? ' (mail simulé)' : ' (mail envoyé)') : ''}`);
  ok(res, {
    email: r.user.email,
    user_id: r.user.id,
    lien: r.lien,
    expire_le: r.expire_le,
    envoye: !!(envoi && envoi.success && !envoi.simulated),
    simule: !!envoi?.simulated,
    erreur_envoi: envoi && !envoi.success && !envoi.simulated ? envoi.error || 'Envoi impossible' : null,
  });
}));

// Le lien d'accès, le même pour tous : on le transmet tel quel.
app.get('/api/admin/clients/lien-acces', wrap((req, res) => {
  const admin = currentUser(req);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  ok(res, { lien: `${urlPublique(req)}/Bienvenue`, mail: mailAcces('', `${urlPublique(req)}/Bienvenue`, admin, urlPublique(req)).body });
}));

// Tous les comptes sans mot de passe reçoivent leur lien, d'un coup : c'est
// ainsi que les clients importés entrent — ils cliquent, choisissent leur mot
// de passe, et tout ce qui les attend (étape, projets) est là.
app.post('/api/admin/clients/inviter-tous', wrap(async (req, res) => {
  const admin = currentUser(req);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { creerInvitation } = await import('./clients-invitation.js');
  const base = urlPublique(req);
  const envoyer = !!req.body?.envoyer;
  const cibles = Records.list('User').filter((u) => u.role !== 'admin' && !u.mot_de_passe && u.email);
  const liens = [];
  let envoyes = 0;
  const lienCommun = `${base}/Bienvenue`;
  for (const u of cibles) {
    const r = creerInvitation({ email: u.email, admin, base });
    if (!r.ok) continue;
    // Le même lien pour tout le monde : c'est l'adresse qui identifie.
    r.lien = lienCommun;
    let mail = null;
    if (envoyer) {
      const prenom = (r.user.full_name || '').split(' ')[0];
      mail = await sendEmail({
        owner: admin.email,
        to: r.user.email,
        subject: OBJET_ACCES,
        ...mailAcces(prenom, r.lien, admin, base),
      });
      if (mail?.success && !mail.simulated) envoyes += 1;
    }
    liens.push({ email: r.user.email, nom: r.user.full_name || null, lien: r.lien, envoye: !!(mail?.success && !mail.simulated) });
  }
  console.log(`[auth] liens d'invitation : ${liens.length} compte(s), ${envoyes} mail(s) envoyé(s), par ${admin.email}`);
  ok(res, { total: liens.length, envoyes, liens });
}));

// Le chat du tableau de bord, mode Client : le compte rendu d'un appel de
// découverte devient une fiche Monday, un compte Klocka et un lien. Deux
// temps — lire, puis créer — pour que l'admin relise entre les deux.
app.post('/api/admin/clients/decouverte/extraire', wrap(async (req, res) => {
  const admin = currentUser(req);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const texte = String(req.body?.texte || '').trim();
  if (texte.length < 40) return res.status(400).json({ error: 'Collez le compte rendu de l\'appel — il est trop court pour être lu.' });
  const { extraireClient } = await import('./clients-decouverte.js');
  ok(res, { champs: await extraireClient(texte, { par: admin }) });
}));

app.post('/api/admin/clients/decouverte/creer', wrap(async (req, res) => {
  const admin = currentUser(req);
  if (admin?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const champs = req.body?.champs || {};
  if (!champs.prenom && !champs.nom && !champs.email) return res.status(400).json({ error: 'Il faut au moins un nom ou une adresse.' });
  const { creerClientDepuisDecouverte } = await import('./clients-decouverte.js');
  ok(res, await creerClientDepuisDecouverte(champs, { admin, base: urlPublique(req) }));
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

  const user = Records.findBy('User', 'email', email);
  const ok_ = user?.mot_de_passe ? await verifierMotDePasse(mot_de_passe, user.mot_de_passe) : false;

  if (!ok_) {
    enregistrerEchec(email, ip);
    // Message unique : ne pas indiquer si c'est l'email ou le mot de passe qui
    // est faux à ce stade du parcours.
    return res.status(401).json({ error: 'Adresse ou mot de passe incorrect.' });
  }

  reinitialiserTentatives(email, ip);
  // `fenetre` : session propre à la fenêtre, rendue dans la réponse au lieu
  // du cookie — pour ouvrir deux comptes côte à côte sur le même navigateur.
  const fenetre = !!req.body?.fenetre;
  const jeton = createSession(res, email, { sansCookie: fenetre });
  Records.update('User', user.id, { derniere_connexion: new Date().toISOString() });
  console.log(`[auth] connexion : ${email} (${user.role || 'user'})${fenetre ? ' — session de fenêtre' : ''}`);
  ok(res, { success: true, email, role: user.role || 'user', ...(fenetre ? { jeton_session: jeton } : {}) });
}));

app.post('/api/auth/logout', (req, res) => {
  destroySession(req, res);
  ok(res, { success: true });
});
app.get('/api/auth/isAuthenticated', (req, res) => ok(res, { authenticated: !!currentUser(req) }));

// --- Connexion Google : identité seule (nom, adresse, photo). Le rattachement
// --- d'une boîte est un autre parcours, réservé aux admins — voir plus bas.

app.get('/api/auth/google/login', (req, res) => {
  if (!googleEnabled) {
    return authResultPage(res, {
      ok: false,
      title: 'Connexion Google non configurée',
      detail:
        "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET sont absents du fichier .env. Consultez la section « Connexion » du README.",
    });
  }
  const url = buildAuthUrl({ returnTo: req.query.returnTo || '/Dashboard', req, fenetre: req.query.fenetre === '1' });
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
      console.log(`[auth] refusé, adresse sans invitation : ${emailGoogle}`);
      return authResultPage(res, {
        ok: false,
        title: 'Adresse non reconnue',
        detail: `${profile.email} n'a pas d'accès Klocka. Les comptes se créent sur invitation : rapprochez-vous de votre conseiller, il vous enverra votre lien.`,
      });
    }
    if (!user) {
      user = Records.create('User', {
        email: emailGoogle,
        full_name: profile.name,
        picture: profile.picture,
        role: 'admin',
        etape_actuelle: 0,
      });
      console.log(`[auth] nouveau compte : ${profile.email} (${user.role})`);
    }
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
    // La boîte vient d'être autorisée : on la relève tout de suite, sans
    // attendre le prochain passage de la veille ni un clic de plus. Se
    // connecter une fois doit suffire.
    if (profile.peut_lire) {
      import('./deal/veille-mails.js')
        .then(({ relever }) => relever())
        .then((r) => console.log(`[veille] relève immédiate après connexion : ${r?.nouveaux || 0} mail(s)`))
        .catch((e) => console.warn('[veille] relève après connexion impossible :', e?.message || e));
    }
    return popupConnectePage(res, profile);
  }

  if (profile.fenetre) {
    // Session de fenêtre : le jeton voyage dans le fragment (jamais envoyé au
    // serveur), la page le range dans sa fenêtre et efface l'adresse.
    const jeton = createSession(res, profile.email, { sansCookie: true });
    return res.redirect(`${profile.returnTo || '/Dashboard'}#session=${jeton}`);
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
  //
  // Les routes de marché — marche, equimmox, data-b, figaro — étaient dans le
  // même cas : l'état d'une recherche et son journal portent l'adresse du bien,
  // ses loyers et le nom du dossier. Leurs seuls appelants sont l'écran
  // d'équipe, déjà réservé aux administrateurs : exiger une connexion ne
  // retire rien à personne.
  if (
    !/^\/api\/(entities|integrations|functions|preanalyse|alexis|mails|admin|assistant|monday|journal|monitoring|marche|equimmox|data-b|figaro|projets|projects|alx|kzoning|kexpertise|kestimation|kvaleurlocative)\b/.test(
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
const PREFIXES_EQUIPE = /^\/api\/(preanalyse|alexis|mails|assistant|monday|monitoring|alx|kzoning|kexpertise|kestimation|kvaleurlocative)\b/;

app.use((req, res, next) => {
  if (AUTH_DESACTIVEE) return next();
  if (!PREFIXES_EQUIPE.test(req.path)) return next();
  // Déclarer sa propre visite reste ouvert à tous : c'est ce que fait un client
  // en naviguant.
  if (req.path.startsWith('/api/journal/')) return next();
  if (currentUser(req)?.role === 'admin') return next();
  res.status(403).json({ error: "Réservé à l'équipe Klocka." });
});


// Les chutes du serveur et ses redémarrages : de quoi expliquer, après coup,
// une erreur 502 dans l'interface.
app.get('/api/monitoring/incidents', wrap((req, res) => {
  if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: "Réservé à l'équipe Klocka." });
  ok(res, { incidents: derniersIncidents({ limite: Math.min(200, Number(req.query.limite) || 50) }), depuis: demarreLe });
}));

// Le journal d'audit, lisible par l'équipe. Il ne se journalise pas lui-même.
app.get('/api/monitoring/audit', wrap((req, res) => {
  if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: "Réservé à l'équipe Klocka." });
  const jours = Math.min(180, Math.max(1, Number(req.query.jours) || 30));
  ok(res, {
    jours,
    par_personne: resumeAudit({ depuisJours: jours }),
    entrees: lireAudit({ depuisJours: jours, limite: Number(req.query.limite) || 200, email: req.query.email || null }),
  });
}));

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------



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
// Connexion Google (envoi de mails)
// ---------------------------------------------------------------------------





// ---------------------------------------------------------------------------
// Boîte de réception (relève Gmail, sur action utilisateur — pas de polling)
// ---------------------------------------------------------------------------



















































































































// ---------------------------------------------------------------------------
// Sauvegarde de la base
//
// Le module existait et l'écran appelait, mais aucune route ne les reliait :
// « Télécharger » renvoyait la page d'accueil, « Restaurer » échouait. Chez un
// hébergeur sans disque persistant, c'est la seule protection contre la perte
// totale au prochain déploiement.
// ---------------------------------------------------------------------------
app.get('/api/admin/sauvegarde', wrap(async (req, res) => {
  if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { exporterTout } = await import('./sauvegarde.js');
  const jour = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="klocka-${jour}.json"`);
  res.send(JSON.stringify(exporterTout()));
}));

app.post('/api/admin/sauvegarde', upload.single('fichier'), wrap(async (req, res) => {
  if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const { restaurerTout } = await import('./sauvegarde.js');
  let dump;
  try {
    dump = JSON.parse(fs.readFileSync(req.file.path, 'utf-8'));
  } catch {
    return res.status(400).json({ error: "Ce fichier n'est pas lisible." });
  } finally {
    // Le dépôt ne sert qu'à lire : il ne reste pas sur le disque.
    try { fs.unlinkSync(req.file.path); } catch { /* déjà parti */ }
  }
  ok(res, restaurerTout(dump));
}));

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------
app.post('/api/functions/:name', wrap(async (req, res) => {
  const user = currentUser(req);
  // `base` porte l'adresse publique telle que le navigateur la voit : les mails
  // partis d'ici contiennent des liens cliquables, même sans APP_URL.
  ok(res, await callFunction(req.params.name, req.body || {}, { user, base: urlPublique(req) }));
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

// L'état du service, lisible depuis n'importe quel navigateur : c'est ce qu'on
// ouvre quand « ça ne marche pas » sur l'hébergeur, avant toute hypothèse.
// Une base créée il y a quelques minutes sur un service en ligne depuis des
// semaines dit tout : le disque est éphémère.
app.get('/api/health', (req, res) => {
  const stockage = infoStockage();
  const surRender = !!process.env.RENDER;
  // Le diagnostic dit quoi faire, pas seulement ce qui va mal.
  const diagnostic = !surRender
    ? null
    : !stockage.declare
      ? "Aucun disque déclaré : dans Render, Disks → Add Disk (Mount Path /var/data), puis Environment → KLOCKA_DATA_DIR=/var/data."
      : !stockage.monte
        ? `KLOCKA_DATA_DIR vaut « ${stockage.chemin} » mais ce chemin n'est pas un disque monté : le Mount Path du Disk doit être exactement le même (redéployez après l'avoir attaché).`
        : 'Disque monté : la base survit aux déploiements.';
  ok(res, {
    status: 'ok',
    version: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null,
    en_ligne_depuis_s: Math.round(process.uptime()),
    base: {
      creee_le: Meta.get('base_creee_le') || null,
      persistante: stockage.declare && stockage.monte,
      declaree: stockage.declare,
      disque_monte: stockage.monte,
      point_de_montage: stockage.point_de_montage,
      emplacement: stockage.chemin,
      taille_ko: stockage.taille_base_ko,
      diagnostic,
      utilisateurs: Records.count('User'),
      dossiers: Records.count('Deal'),
      projets: Records.count('Project'),
      sessions: Records.count('Session'),
    },
    hebergeur: process.env.RENDER ? 'render' : null,
    ia: llmStatus().label,
    google: googleEnabled,
    comptes_google: listAccounts().length,
  });
});

// ---------------------------------------------------------------------------
// Frontend — servi par le même serveur, pour n'avoir qu'un seul port à ouvrir.
// Présent uniquement après `npm run build` (le mode dev utilise Vite).
// ---------------------------------------------------------------------------
monterPreanalyse(app);

monterAssistant(app);

monterMarche(app);

monterEntites(app);

monterAlexis(app);

monterCourriel(app);

monterIntegrations(app);

monterMonday(app);
monterAlx(app);
monterKZoning(app);
monterKExpertise(app);
monterKEstimation(app);
monterKValeurLocative(app);

// L'état de la plateforme, écrit dans docs/etat-plateforme.md : une session de
// travail le lit et connaît l'usage réel au lieu de repartir de zéro.
import('./etat-plateforme.js')
  .then((m) => m.tenirAJour())
  .catch((e) => console.error('[état] module absent :', e.message));

const DIST_DIR = path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  // Les fichiers d'`assets` portent une empreinte dans leur nom : un contenu
  // modifié change de nom. Ils peuvent donc être gardés sans limite par le
  // navigateur — c'est ce qui fait qu'une deuxième visite ne retélécharge rien.
  // index.html, lui, ne doit jamais être gardé : c'est lui qui désigne les
  // empreintes du moment.
  app.use(
    express.static(DIST_DIR, {
      setHeaders: (res, chemin) => {
        if (/[/\\]assets[/\\]/.test(chemin)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (chemin.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );
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
}).catch((e) => console.warn(`[démarrage] extractions en attente : ${e?.message || e}`));

// La base retient sa date de naissance : c'est elle qu'on lit dans /api/health
// pour savoir si l'hébergeur l'a effacée.
if (!Meta.get('base_creee_le')) Meta.set('base_creee_le', new Date().toISOString());

// Sur Render sans disque, tout est perdu au prochain déploiement : le dire au
// démarrage, en clair, avant que ce soit arrivé.
if (process.env.RENDER && !(process.env.KLOCKA_DATA_DIR || '').trim()) {
  console.warn(
    '\n  ⚠  BASE ÉPHÉMÈRE : ce service tourne sur Render sans KLOCKA_DATA_DIR.\n' +
      '     Comptes, sessions, dossiers et clients seront effacés au prochain déploiement.\n' +
      '     Attachez un disque (ex. /var/data) et déclarez KLOCKA_DATA_DIR=/var/data.\n'
  );
}

// Les demandes déjà envoyées avant l'existence du registre des engagements
// entrent au registre rétroactivement — EmailLog garde tout, rien n'est perdu.
import('./deal/engagements.js').then(({ rattraperDepuisEmailLog }) => {
  rattraperDepuisEmailLog();
}).catch((e) => console.warn(`[démarrage] registre des engagements : ${e?.message || e}`));

// Agents des dossiers → fiches CRM, dès le démarrage.
import('./deal/crm-sync.js').then(({ synchroniserAgents }) => {
  const { crees, completes } = synchroniserAgents();
  if (crees || completes) console.log(`  ▸ CRM : ${crees} agent(s) créé(s), ${completes} complété(s)`);
}).catch((e) => console.warn(`[démarrage] synchronisation CRM : ${e?.message || e}`));

// Veille des boîtes mail : relève périodique et rattachement des réponses aux
// dossiers. Sans portée de lecture Gmail accordée, elle ne démarre pas.
import('./deal/veille-mails.js').then(({ demarrerVeille }) => {
  const active = demarrerVeille();
  console.log(
    active
      ? `  ▸ Veille des boîtes mail active (toutes les ${process.env.MAIL_VEILLE_MINUTES || 5} min)`
      : '  ▸ Veille des boîtes mail inactive (GOOGLE_GMAIL_READ absent)'
  );
}).catch((e) => console.warn(`[démarrage] veille des boîtes mail : ${e?.message || e}`));

// Lectures de marché restées incomplètes : on avait promis d'y revenir, un
// redémarrage n'annule pas la promesse.
import('./marche/replanification.js').then(({ reprendreLesPromesses }) => {
  const n = reprendreLesPromesses();
  if (n) console.log(`  ▸ ${n} lecture(s) de marché à reprendre`);
}).catch((e) => console.warn(`[démarrage] reprise des lectures de marché : ${e?.message || e}`));

// Dernier filet. Une erreur asynchrone qui n'a trouvé personne pour la
// rattraper — une page Playwright qui meurt, une réponse Google inattendue —
// arrête le processus sous Node : l'application entière tombe pour un incident
// qui ne concernait qu'un dossier. On la journalise et on reste debout.
// Une exception non rattrapée, elle, laisse le processus dans un état incertain :
// on la journalise aussi, mais on rend la main à l'hébergeur, qui redémarrera.
// Les deux sont écrits dans server/data/incidents.log : un 502 dans
// l'interface pendant que le serveur redémarre n'est explicable que si la
// chute a laissé une trace ailleurs que dans un terminal refermé.
process.on('unhandledRejection', (raison) => {
  console.error('[rejet non traité]', raison instanceof Error ? raison.stack : raison);
  noterIncident('rejet', raison);
});
process.on('uncaughtException', (e) => {
  console.error('[exception non rattrapée]', e?.stack || e);
  noterIncident('exception', e);
  process.exit(1);
});

app.listen(PORT, () => {
  // Un démarrage est un incident comme un autre : c'est lui qui date les
  // redémarrages, et donc les 502 qu'ils ont provoqués.
  noterIncident('demarrage', `Klocka démarre sur le port ${PORT}`);
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
