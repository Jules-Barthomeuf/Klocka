// Classement des documents d'un deal dans le Google Drive du compte connecté.
//
// Portée drive.file (opt-in GOOGLE_DRIVE=true) : l'application ne voit QUE les
// dossiers et fichiers qu'elle a créés — jamais le reste du Drive. Tous les
// documents d'un deal partent dans « Klocka Projets/<titre du deal> ».
// Un échec Drive n'est jamais bloquant pour le reste du flux.

import fs from 'fs';
import path from 'path';
import { storedAccount, accessTokenFor } from './google-oauth.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const DOSSIER_RACINE = 'Klocka Projets';

function compteDrive(email) {
  const account = storedAccount(email);
  if (!account) throw new Error(`Compte Google non connecté : ${email}`);
  if (!account.peut_drive) {
    throw new Error(
      `Le compte ${account.email} n'a pas autorisé l'accès Drive. Reconnectez-le depuis la page Mails (GOOGLE_DRIVE doit être actif).`
    );
  }
  return account;
}

async function driveFetch(token, url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || `Drive a répondu ${resp.status}`);
  return data;
}

// Échappe les apostrophes pour la clause q de l'API Drive.
const q = (s) => String(s).replace(/'/g, "\\'");

/** Retrouve ou crée un dossier Drive par nom (dans un parent optionnel). */
export async function assurerDossier(token, nom, parentId = null) {
  const clauses = [
    `name='${q(nom)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    ...(parentId ? [`'${q(parentId)}' in parents`] : []),
  ];
  const trouve = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(clauses.join(' and '))}&fields=files(id,name,webViewLink)&pageSize=1`
  );
  if (trouve.files?.length) return trouve.files[0];

  return driveFetch(token, `${DRIVE_API}/files?fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nom,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
}

/** Upload multipart d'un fichier binaire dans un dossier Drive. */
export async function uploaderFichier(token, { nom, buffer, mime, parentId }) {
  const boundary = `klocka${Date.now()}`;
  const meta = JSON.stringify({ name: nom, ...(parentId ? { parents: [parentId] } : {}) });
  const corps = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  return driveFetch(token, `${DRIVE_UPLOAD}&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: corps,
  });
}

/**
 * Crée « Klocka Projets/<titre> » et y téléverse les fichiers donnés.
 * @param {string} compteEmail
 * @param {string} titre - nom du sous-dossier (titre du deal)
 * @param {Array<{nom, chemin?, buffer?, mime?}>} fichiers - chemin local OU buffer
 * @param {string} uploadDir - racine des uploads locaux (sécurise les chemins)
 * @returns {{ folder_id, folder_url, envoyes: string[], erreurs: string[] }}
 */
export async function classerDansDrive(compteEmail, titre, fichiers, uploadDir) {
  const account = compteDrive(compteEmail);
  const token = await accessTokenFor(account);

  const racine = await assurerDossier(token, DOSSIER_RACINE);
  const dossier = await assurerDossier(token, titre || 'Deal sans titre', racine.id);

  const envoyes = [];
  const erreurs = [];
  for (const f of fichiers) {
    try {
      let buffer = f.buffer;
      if (!buffer && f.chemin) {
        // Seuls les fichiers du répertoire d'uploads sont lisibles ici.
        const absolu = path.join(uploadDir, path.basename(f.chemin));
        buffer = fs.readFileSync(absolu);
      }
      if (!buffer) throw new Error('contenu introuvable');
      await uploaderFichier(token, { nom: f.nom, buffer, mime: f.mime, parentId: dossier.id });
      envoyes.push(f.nom);
    } catch (e) {
      erreurs.push(`${f.nom} : ${e?.message || e}`);
    }
  }

  return {
    folder_id: dossier.id,
    folder_url: dossier.webViewLink || `https://drive.google.com/drive/folders/${dossier.id}`,
    envoyes,
    erreurs,
  };
}
