// Le noyau partagé par toutes les familles de routes.
//
// index.js faisait près de trois mille lignes et cent soixante-quatorze routes.
// Les familles de routes vivent désormais dans server/routes/, et elles ont
// toutes besoin des mêmes quelques outils : qui parle, comment répondre,
// comment rattraper une erreur, où se déposent les fichiers. Les voici, une
// fois, pour que chaque module les importe au lieu de recevoir un sac de
// dépendances en paramètre.

import multer from 'multer';
import { CHEMIN_UPLOADS, Records } from './db.js';
import { ADMIN_EMAIL } from './seed.js';
import { sessionEmail } from './sessions.js';
import { listAccounts } from './email.js';

// Les fichiers déposés suivent la base : sur un disque persistant quand
// KLOCKA_DATA_DIR le désigne, sinon à côté du code. Un document versé à un
// dossier ne doit pas survivre moins longtemps que le dossier lui-même.
export const UPLOAD_DIR = CHEMIN_UPLOADS;

export const PORT = process.env.PORT || 3001;

// APP_URL en https = déploiement : cookies Secure (sessions.js), CORS fermé,
// pas de données de démonstration. Derrière un proxy (Render, etc.), les
// en-têtes x-forwarded-* font foi.
export const APP_URL_PROD = (process.env.APP_URL || '').replace(/\/$/, '');
export const EN_PRODUCTION = APP_URL_PROD.startsWith('https://');

// L'authentification est toujours exigée. AUTH_DESACTIVEE=true rétablit
// l'ancien comportement, uniquement pour du développement local — jamais sur
// un serveur accessible, et index.js refuse de démarrer si on essaie.
export const AUTH_DESACTIVEE = /^(1|true|oui|yes)$/i.test(process.env.AUTH_DESACTIVEE || '');

/** L'utilisateur de la requête, résolu par le cookie de session. */
export function currentUser(req) {
  if (AUTH_DESACTIVEE) {
    return Records.filter('User', { email: ADMIN_EMAIL })[0] || Records.list('User')[0] || null;
  }
  const email = req ? sessionEmail(req) : null;
  if (!email) return null;
  return Records.findBy('User', 'email', email) || null;
}

/** L'empreinte du mot de passe ne doit jamais quitter le serveur. */
export function sansSecret(user) {
  if (!user || typeof user !== 'object') return user;
  const { mot_de_passe, ...reste } = user;
  return { ...reste, mot_de_passe_defini: !!mot_de_passe };
}

// Champs qu'un utilisateur ne peut pas se donner à lui-même.
const CHAMPS_PROTEGES = [
  'role', 'mot_de_passe', 'mot_de_passe_defini', 'email', 'id', 'invitation_jeton',
  'invitation_expire_le', 'acces', 'inscrit_le', 'inscription_via', 'promu_client_le', 'promu_par',
];

export function retirerChampsProteges(patch) {
  const copie = { ...(patch || {}) };
  for (const c of CHAMPS_PROTEGES) delete copie[c];
  return copie;
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();

/**
 * L'adresse publique de l'application, telle que le navigateur la voit : c'est
 * elle qui figure dans les liens envoyés. APP_URL seul casserait sur Codespaces.
 */
export function urlPublique(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : APP_URL_PROD || 'http://localhost:3001';
}

export const ok = (res, data) => res.json(data);

/** Une route asynchrone qui échoue répond 500 au lieu de laisser pendre la requête. */
export const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
};

// Les dépôts sont bornés : sans limite, une seule requête peut remplir le disque
// de l'hébergeur — et avec lui la base, qui vit sur le même volume.
// 50 Mo couvre largement un bail scanné ; 20 fichiers, un dossier complet.
const TAILLE_MAX_FICHIER = 50 * 1024 * 1024;

export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: TAILLE_MAX_FICHIER, files: 20 },
});

/**
 * Un utilisateur ne relève que les boîtes qu'il a lui-même connectées.
 * Partagé par les routes de la boîte de réception, des dossiers et de
 * l'assistant.
 */
export function compteAutorise(req, compte) {
  const user = currentUser(req);
  return listAccounts(user?.email).some((a) => a.id === String(compte || '').toLowerCase());
}
