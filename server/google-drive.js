// Classement des documents d'un deal dans Google Drive.
//
// Deux destinations possibles :
//
//  - Un Drive partagé (recommandé en équipe) : les documents appartiennent à
//    l'organisation, pas à la personne qui a connecté son compte. Configuré par
//    GOOGLE_DRIVE_NOM (nom du Drive partagé, ex. « Klocka ») ou GOOGLE_DRIVE_ID,
//    et GOOGLE_DRIVE_DOSSIER pour le dossier d'accueil (défaut « Projets »).
//    Retrouver un Drive partagé créé par quelqu'un d'autre suppose la portée
//    drive complète : voir GOOGLE_DRIVE_COMPLET.
//
//  - Le Drive personnel du compte connecté, à défaut de configuration. Les
//    documents partent alors dans « Klocka Projets/<titre du deal> ».
//
// TOUT appel touchant un Drive partagé doit porter supportsAllDrives : sans ce
// paramètre l'API répond comme si le Drive partagé n'existait pas.
// Un échec Drive n'est jamais bloquant pour le reste du flux.

import fs from 'fs';
import path from 'path';
import { storedAccount, accessTokenFor } from './google-oauth.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';
const DOSSIER_RACINE = 'Klocka Projets';

// Drive partagé visé, par nom ou par identifiant.
const DRIVE_PARTAGE_NOM = (process.env.GOOGLE_DRIVE_NOM || '').trim();
const DRIVE_PARTAGE_ID = (process.env.GOOGLE_DRIVE_ID || '').trim();
const DOSSIER_PROJETS = (process.env.GOOGLE_DRIVE_DOSSIER || 'Projets').trim();
export const drivePartageDemande = !!(DRIVE_PARTAGE_NOM || DRIVE_PARTAGE_ID);

function compteDrive(email) {
  const account = storedAccount(email);
  if (!account) throw new Error(`Compte Google non connecté : ${email}`);
  if (!account.peut_drive) {
    throw new Error(
      `Le compte ${account.email} n'a pas autorisé l'accès Drive. Reconnectez-le depuis le dashboard (GOOGLE_DRIVE doit être actif).`
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

/**
 * Retrouve le Drive partagé visé, par identifiant ou par nom.
 * @returns {{id, name} | null} null si aucun Drive partagé n'est configuré
 */
export async function trouverDrivePartage(token) {
  if (DRIVE_PARTAGE_ID) {
    const d = await driveFetch(token, `${DRIVE_API}/drives/${encodeURIComponent(DRIVE_PARTAGE_ID)}`);
    return { id: d.id, name: d.name };
  }
  if (!DRIVE_PARTAGE_NOM) return null;

  const liste = await driveFetch(
    token,
    `${DRIVE_API}/drives?q=${encodeURIComponent(`name='${q(DRIVE_PARTAGE_NOM)}'`)}&pageSize=10&fields=drives(id,name)`
  );
  const exact = (liste.drives || []).find(
    (d) => d.name.toLowerCase() === DRIVE_PARTAGE_NOM.toLowerCase()
  );
  if (!exact) {
    throw new Error(
      `Drive partagé « ${DRIVE_PARTAGE_NOM} » introuvable depuis ce compte. Vérifiez qu'il en est membre, ou renseignez GOOGLE_DRIVE_ID.`
    );
  }
  return { id: exact.id, name: exact.name };
}

/**
 * Retrouve ou crée un dossier par nom, dans un parent donné.
 * @param {string} [driveId] - identifiant du Drive partagé, s'il y en a un
 */
export async function assurerDossier(token, nom, parentId = null, driveId = null) {
  const clauses = [
    `name='${q(nom)}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    ...(parentId ? [`'${q(parentId)}' in parents`] : []),
  ];
  // Dans un Drive partagé, la recherche doit être explicitement cadrée sur lui.
  const portee = driveId
    ? `&corpora=drive&driveId=${encodeURIComponent(driveId)}&includeItemsFromAllDrives=true&supportsAllDrives=true`
    : '';
  const trouve = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(clauses.join(' and '))}&fields=files(id,name,webViewLink)&pageSize=1${portee}`
  );
  if (trouve.files?.length) return trouve.files[0];

  return driveFetch(token, `${DRIVE_API}/files?fields=id,name,webViewLink&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nom,
      mimeType: 'application/vnd.google-apps.folder',
      // Racine d'un Drive partagé : son identifiant sert de parent.
      ...(parentId ? { parents: [parentId] } : driveId ? { parents: [driveId] } : {}),
    }),
  });
}

/**
 * Dossier d'accueil des projets : « <Drive partagé>/Projets » si un Drive
 * partagé est configuré, sinon « Klocka Projets » dans le Drive personnel.
 * @returns {{ dossier, driveId, chemin }}
 */
export async function assurerDossierProjets(token) {
  const partage = await trouverDrivePartage(token);
  if (partage) {
    const dossier = await assurerDossier(token, DOSSIER_PROJETS, null, partage.id);
    return { dossier, driveId: partage.id, chemin: `${partage.name}/${DOSSIER_PROJETS}` };
  }
  const dossier = await assurerDossier(token, DOSSIER_RACINE);
  return { dossier, driveId: null, chemin: DOSSIER_RACINE };
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

  const { dossier: racine, driveId, chemin } = await assurerDossierProjets(token);
  const dossier = await assurerDossier(token, titre || 'Deal sans titre', racine.id, driveId);

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
    chemin: `${chemin}/${titre || 'Deal sans titre'}`,
    drive_partage: !!driveId,
    envoyes,
    erreurs,
  };
}

/**
 * Téléverse un PPTX en le convertissant en Google Slides (modifiable en
 * ligne). Rangé dans « Klocka Projets/Présentations banque ».
 * @returns {{ id, slides_url }}
 */
export async function uploaderEnSlides(compteEmail, { nom, buffer }) {
  const account = compteDrive(compteEmail);
  const token = await accessTokenFor(account);

  const { dossier: racine, driveId } = await assurerDossierProjets(token);
  const dossier = await assurerDossier(token, 'Présentations banque', racine.id, driveId);

  const boundary = `klocka${Date.now()}`;
  // Le mimeType Google du meta déclenche la conversion PPTX → Slides.
  const meta = JSON.stringify({
    name: nom,
    mimeType: 'application/vnd.google-apps.presentation',
    parents: [dossier.id],
  });
  const corps = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const fichier = await driveFetch(token, `${DRIVE_UPLOAD}&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: corps,
  });

  return { id: fichier.id, slides_url: `https://docs.google.com/presentation/d/${fichier.id}/edit` };
}
