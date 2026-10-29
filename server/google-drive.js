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
import { Records } from './db.js';
import { storedAccount, accessTokenFor } from './google-oauth.js';
import { SUPER_ADMINS } from './acces-pages.js';

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

// Le compte qui voit le Drive partagé (16 oct. 2026, Jules : « il doit bien être connecté au drive Klocka »).
// Le compte de la personne qui parle d'abord : c'est son autorisation qui est engagée. S'il n'est pas membre
// du Drive partagé (sourcing@ ne l'était pas), le compte déclaré par GOOGLE_DRIVE_COMPTE, puis les comptes de
// Jules connectés qui le voient : le Drive de l'équipe n'est pas celui d'une personne. Le compte utilisé est
// toujours rendu, pour être dit. Retenu dix minutes. Personne ne le voit : l'erreur dit qui ajouter.
const GARDE_COMPTE_MS = 10 * 60 * 1000;
const comptesRetenus = new Map();
export const oublierComptesDrive = () => comptesRetenus.clear();

async function voitLeDrive(account) {
  try { return !!(await trouverDrivePartage(await accessTokenFor(account))); } catch { return false; }
}

export async function compteDriveEffectif(email) {
  const demande = compteDrive(email);
  if (!drivePartageDemande) return demande;
  const cle = String(email || '').toLowerCase();
  const garde = comptesRetenus.get(cle);
  if (garde && Date.now() - garde.le < GARDE_COMPTE_MS) return garde.compte;
  let choisi = null;
  if (await voitLeDrive(demande)) choisi = demande;
  else {
    const autres = [...new Set([process.env.GOOGLE_DRIVE_COMPTE, ...SUPER_ADMINS].map((x) => String(x || '').trim().toLowerCase()).filter((x) => x && x !== demande.email))];
    for (const e of autres) {
      const a = Records.filter('MailAccount', { email: e })[0];
      if (a?.peut_drive && (await voitLeDrive(a))) { choisi = a; break; }
    }
  }
  if (!choisi) {
    throw new Error(`Drive partagé « ${DRIVE_PARTAGE_NOM || DRIVE_PARTAGE_ID} » introuvable depuis ${demande.email}, et aucun compte de Jules connecté ne le voit. Ajoutez ${demande.email} comme membre du Drive (Drive, KLOCKA, Gérer les membres), ou connectez un compte qui en est membre.`);
  }
  comptesRetenus.set(cle, { le: Date.now(), compte: choisi });
  return choisi;
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

/**
 * Met un fichier ou un dossier à la corbeille.
 * Sert à annuler une création : la corbeille se récupère, la suppression non.
 * @param {string} compteEmail - le compte qui a créé le dossier
 */
export async function corbeille(compteEmail, fileId) {
  const account = await compteDriveEffectif(compteEmail);
  const token = await accessTokenFor(account);
  return driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
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

/** Dépose un fichier dans un dossier Drive déjà connu (son identifiant), sans le rechercher par nom. */
export async function deposerDansDossier(compteEmail, dossierId, { nom, buffer, mime }) {
  const account = await compteDriveEffectif(compteEmail);
  const token = await accessTokenFor(account);
  return uploaderFichier(token, { nom, buffer, mime, parentId: dossierId });
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
  const account = await compteDriveEffectif(compteEmail);
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
    compte: account.email,
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
  const account = await compteDriveEffectif(compteEmail);
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

/**
 * Téléverse un Word en le convertissant en Google Doc (modifiable en ligne,
 * à plusieurs). Rangé dans le dossier Drive donné, sinon dans
 * « Klocka Projets/Lettres d'intention ».
 * @returns {{ id, doc_url }}
 */
export async function uploaderEnDoc(compteEmail, { nom, buffer, parentId = null }) {
  const account = await compteDriveEffectif(compteEmail);
  const token = await accessTokenFor(account);

  let parent = parentId;
  if (!parent) {
    // Le Drive partagé quand le compte y a accès ; sinon le Drive du compte
    // lui-même : une lettre qu'on peut ouvrir vaut mieux qu'une lettre bien
    // rangée nulle part.
    try {
      const { dossier: racine, driveId } = await assurerDossierProjets(token);
      parent = (await assurerDossier(token, "Lettres d'intention", racine.id, driveId)).id;
    } catch {
      parent = (await assurerDossier(token, "Lettres d'intention")).id;
    }
  }

  const boundary = `klocka${Date.now()}`;
  // Le mimeType Google du meta déclenche la conversion DOCX → Doc.
  const meta = JSON.stringify({ name: nom, mimeType: 'application/vnd.google-apps.document', parents: [parent] });
  const corps = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const fichier = await driveFetch(token, `${DRIVE_UPLOAD}&fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: corps,
  });
  return { id: fichier.id, doc_url: `https://docs.google.com/document/d/${fichier.id}/edit` };
}

/**
 * Les fichiers du Drive qu'on peut importer dans un dossier : ceux du dossier
 * du deal s'il existe, sinon les documents récents du compte. Les Google Docs
 * natifs sont exclus : seuls les fichiers binaires se rapatrient tels quels.
 * @param {string} compteEmail
 * @param {{ dossierId?: string, recherche?: string, limite?: number }} options
 */
export async function listerFichiers(compteEmail, { dossierId = null, recherche = '', limite = 50 } = {}) {
  const account = await compteDriveEffectif(compteEmail);
  const token = await accessTokenFor(account);
  const clauses = ["trashed = false", "not mimeType contains 'application/vnd.google-apps'"];
  if (dossierId) clauses.push(`'${q(dossierId)}' in parents`);
  if (recherche) clauses.push(`name contains '${q(recherche)}'`);
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
    orderBy: 'modifiedTime desc',
    pageSize: String(Math.min(200, limite)),
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });
  const data = await driveFetch(token, `${DRIVE_API}/files?${params}`);
  return (data.files || []).map((f) => ({
    id: f.id,
    nom: f.name,
    mime: f.mimeType,
    taille: Number(f.size) || 0,
    modifie_le: f.modifiedTime || null,
    url: f.webViewLink || null,
  }));
}

/**
 * Rapatrie un fichier du Drive : son contenu et son nom. Un Google Doc, Sheet
 * ou Slides n'a pas de contenu binaire : il sort en PDF, comme on l'enverrait
 * à la main.
 */
export async function telechargerFichier(compteEmail, fileId) {
  const account = await compteDriveEffectif(compteEmail);
  const token = await accessTokenFor(account);
  const meta = await driveFetch(
    token,
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`
  );
  if (String(meta.mimeType || '').startsWith('application/vnd.google-apps')) {
    const exp = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application%2Fpdf&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!exp.ok) throw new Error(`Drive a refusé l'export PDF de « ${meta.name} » (${exp.status})`);
    return { nom: `${meta.name}.pdf`, mime: 'application/pdf', buffer: Buffer.from(await exp.arrayBuffer()) };
  }
  const resp = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) throw new Error(`Drive a répondu ${resp.status} au téléchargement de « ${meta.name} »`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { nom: meta.name, mime: meta.mimeType, buffer };
}

/**
 * Le rangement d'une Data Room (29 oct. 2026, Jules : « créer le Google Drive avec les bons noms ») : le dossier
 * du deal (connu, ou créé à son nom dans Projets), un sous-dossier par famille de pièces, chaque pièce sous son nom
 * validé, et le Google Doc « Contexte du dossier » remplacé par sa version du jour. Une pièce dont le nom est déjà
 * dans son sous-dossier ne repart pas en double.
 * @param {string} compteEmail
 * @param {{ titre: string, dossierId?: string|null, groupes: Array<{ sousDossier: string, fichiers: Array<{ id, nom, buffer, mime }> }>, contexte?: string|null }} options
 * @returns {{ folder_id, folder_url, compte, liens: Record<string, { drive_file_id, drive_url, deja?: boolean }>, erreurs: string[] }}
 */
export async function rangerDataRoom(compteEmail, { titre, dossierId = null, groupes = [], contexte = null }) {
  const account = await compteDriveEffectif(compteEmail);
  const token = await accessTokenFor(account);
  const { dossier: racine, driveId } = await assurerDossierProjets(token);
  let dossier = null;
  if (dossierId) {
    try { dossier = await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(dossierId)}?fields=id,name,webViewLink,trashed&supportsAllDrives=true`); } catch { dossier = null; }
    if (dossier?.trashed) dossier = null;
  }
  if (!dossier) dossier = await assurerDossier(token, titre || 'Deal sans titre', racine.id, driveId);
  const portee = driveId ? `&corpora=drive&driveId=${encodeURIComponent(driveId)}&includeItemsFromAllDrives=true&supportsAllDrives=true` : '';
  const nomsDans = async (parentId) => {
    const r = await driveFetch(token, `${DRIVE_API}/files?q=${encodeURIComponent(`'${q(parentId)}' in parents and trashed=false`)}&fields=files(id,name,webViewLink)&pageSize=200${portee}`);
    return new Map((r.files || []).map((f) => [String(f.name).toLowerCase(), f]));
  };
  const liens = {};
  const erreurs = [];
  for (const g of groupes) {
    if (!g.fichiers.length) continue;
    let sous;
    try { sous = await assurerDossier(token, g.sousDossier, dossier.id, driveId); } catch (e) { erreurs.push(`${g.sousDossier} : ${e?.message || e}`); continue; }
    const presents = await nomsDans(sous.id).catch(() => new Map());
    for (const f of g.fichiers) {
      try {
        const deja = presents.get(String(f.nom).toLowerCase());
        if (deja) { liens[f.id] = { drive_file_id: deja.id, drive_url: deja.webViewLink || null, deja: true }; continue; }
        const u = await uploaderFichier(token, { nom: f.nom, buffer: f.buffer, mime: f.mime, parentId: sous.id });
        liens[f.id] = { drive_file_id: u.id, drive_url: u.webViewLink || null };
      } catch (e) {
        erreurs.push(`${f.nom} : ${e?.message || e}`);
      }
    }
  }
  if (contexte) {
    try {
      const NOM = 'Contexte du dossier';
      const ancien = (await nomsDans(dossier.id)).get(NOM.toLowerCase());
      if (ancien) await driveFetch(token, `${DRIVE_API}/files/${encodeURIComponent(ancien.id)}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      const boundary = `klocka${Date.now()}`;
      const meta = JSON.stringify({ name: NOM, mimeType: 'application/vnd.google-apps.document', parents: [dossier.id] });
      const corps = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`),
        Buffer.from(contexte, 'utf8'),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      await driveFetch(token, `${DRIVE_UPLOAD}&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: corps });
    } catch (e) {
      erreurs.push(`Contexte du dossier : ${e?.message || e}`);
    }
  }
  return { folder_id: dossier.id, folder_url: dossier.webViewLink || `https://drive.google.com/drive/folders/${dossier.id}`, compte: account.email, liens, erreurs };
}
