// La photo de profil suit dans Twenty (26 nov. 2026, Jules : « lorsque quelqu'un change sa photo de profil dans Mon
// profil, ça change aussi dans Twenty ; ça change partout »). Dans Klocka, la photo déposée (User.picture) est déjà lue
// partout ; Twenty, lui, ne peut pas afficher une adresse de Klocka (les fichiers déposés sont réservés aux personnes
// connectées). La photo est donc déposée dans le stockage de Twenty, puis posée sur le membre de l'espace qui a la même
// adresse mail.
//
// Le dépôt, relu sur le schéma GraphQL de l'instance (/metadata) et essayé sur le membre de Jules le 26 nov. 2026 :
//   createFileUpload(filename, size, fileFolder: CorePicture) → { fileId, uploadUrl, contentType }
//   PUT des octets sur uploadUrl
//   completeWorkspaceMemberProfilePictureUpload(fileId) → { id, path, url }  (completeFileUpload refuse une photo de
//   profil : « completed by its dedicated mutation » ; avec la clé d'API, elle ne pose la photo sur aucun membre)
// puis PATCH /rest/workspaceMembers/{id} { avatarUrl: url sans son jeton }. Twenty signe l'adresse à chaque lecture ;
// le chemin seul (« core-picture/… ») ou l'identifiant donnent un avatar vide.
// Seulement sur Render (ou PHOTO_TWENTY_LOCAL=1), jamais pendant les tests : le poste local et les tests parlent au vrai
// Twenty.
// Jamais bloquant : sans Twenty, sans membre ou sur une erreur, la photo de Klocka reste changée et rien ne casse.

import fs from 'node:fs';
import { modifier, twentyConfigure, urlTwentyApi } from '../twenty.js';
import { membres, oublierMembres } from './membres.js';

const norm = (s) => String(s || '').trim().toLowerCase();

async function metadata(query, variables) {
  const resp = await fetch(`${urlTwentyApi()}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(process.env.TWENTY_API_KEY || '').trim()}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await resp.json().catch(() => null);
  if (!resp.ok || j?.errors?.length) throw new Error(j?.errors?.[0]?.message || `Twenty a répondu ${resp.status}`);
  return j.data;
}

/**
 * Pure : l'adresse à poser en avatar. Sans le jeton (Twenty signe à chaque lecture) et sur l'adresse publique de Twenty
 * (TWENTY_URL) : sur Render, Klocka parle à Twenty par le réseau privé, que le navigateur ne voit pas.
 */
export function adresseAvatar(url, publique = process.env.TWENTY_URL) {
  const u = new URL(url);
  const base = String(publique || '').trim().replace(/\/+$/, '');
  return base ? `${base}${u.pathname}` : `${u.origin}${u.pathname}`;
}

/** Le membre de l'espace Twenty qui a cette adresse mail, ou null. */
export async function membreDe(email, liste = null) {
  const l = liste || (await membres());
  return l.find((m) => norm(m.userEmail) === norm(email)) || null;
}

/**
 * Dépose la photo (un fichier du disque) dans Twenty et la pose sur le membre de cette adresse mail.
 * @returns {Promise<{ ok: boolean, raison?: string }>}
 */
export async function photoVersTwenty(email, chemin, { mime = 'image/jpeg', nom = 'photo.jpg', forcer = false } = {}) {
  if (!forcer && (process.env.NODE_TEST_CONTEXT || (!process.env.RENDER && process.env.PHOTO_TWENTY_LOCAL !== '1'))) return { ok: false, raison: 'hors de Render' };
  if (!twentyConfigure()) return { ok: false, raison: 'Twenty non configuré' };
  const membre = await membreDe(email);
  if (!membre) return { ok: false, raison: 'pas de membre Twenty à cette adresse' };
  const octets = fs.readFileSync(chemin);
  const { createFileUpload: cible } = await metadata(
    'mutation($filename: String!, $size: Float!) { createFileUpload(filename: $filename, size: $size, fileFolder: CorePicture) { fileId uploadUrl contentType } }',
    { filename: nom, size: octets.length },
  );
  const envoi = await fetch(cible.uploadUrl, { method: 'PUT', headers: { 'Content-Type': cible.contentType || mime }, body: octets });
  if (!envoi.ok) throw new Error(`Le dépôt dans Twenty a répondu ${envoi.status}`);
  const { completeWorkspaceMemberProfilePictureUpload: fichier } = await metadata(
    'mutation($fileId: String!) { completeWorkspaceMemberProfilePictureUpload(fileId: $fileId) { id path url } }',
    { fileId: cible.fileId },
  );
  if (!fichier?.url) throw new Error("Twenty n'a pas rendu l'adresse de la photo.");
  await modifier('workspaceMembers', membre.id, { avatarUrl: adresseAvatar(fichier.url) });
  oublierMembres();
  return { ok: true };
}
