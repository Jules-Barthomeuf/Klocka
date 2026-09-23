// Les pièces d'un projet, pour les joindre à un mail.
//
// Un projet porte ses documents dans l'onglet Documents (fichiers_projet) :
// le plus souvent des liens Drive partagés, parfois un fichier déposé sur la
// plateforme (/uploads/…). S'il vient d'un dossier de préanalyse qui a son
// dossier Drive, les fichiers de ce dossier comptent aussi. L'assistant ne
// lisait que ce dernier cas : un projet saisi à la main, dont les pièces
// vivent dans des liens, lui paraissait vide.
//
// Chaque pièce reçoit un identifiant stable (drive:<id>, upload:<fichier>) :
// c'est lui qui circule jusqu'au navigateur et revient à l'envoi, jamais un
// chemin, pour qu'on ne puisse joindre qu'une pièce du projet.

import fs from 'fs';
import path from 'path';
import { Records } from './db.js';
import { UPLOAD_DIR } from './contexte.js';

/** Gmail refuse au-delà de 25 Mo, encodage compris : on garde de la marge. */
export const LIMITE_OCTETS = 18 * 1024 * 1024;

/** Pure : l'identifiant d'un fichier dans une adresse Drive, ou null. */
export function idDrive(url) {
  const s = String(url || '');
  if (!/drive\.google\.com|docs\.google\.com/.test(s)) return null;
  const m = s.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{20,})/) || s.match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : null;
}

/** Pure : le nom de fichier d'un dépôt sur la plateforme, ou null. */
export function fichierDepose(url) {
  const m = String(url || '').match(/^\/uploads\/([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Pure : les pièces déclarées dans l'onglet Documents. Une pièce qui n'est ni
 * sur le Drive ni déposée ici reste un lien : elle part dans le corps du mail.
 */
export function piecesDeclarees(projet) {
  const vues = new Set();
  const pieces = [];
  for (const f of projet?.fichiers_projet || []) {
    const nom = String(f?.nom || '').trim() || 'Document';
    const drive = idDrive(f?.url);
    const depose = fichierDepose(f?.url);
    const id = drive ? `drive:${drive}` : depose ? `upload:${depose}` : null;
    if (id && vues.has(id)) continue;
    if (id) vues.add(id);
    pieces.push({ id, nom, url: f?.url || null, joignable: !!id });
  }
  return pieces;
}

/** Le compte Google qui lira le Drive : celui de la personne, sinon celui de l'équipe. */
function compteDrive(user) {
  const comptes = Records.list('MailAccount').filter((a) => a.provider === 'google' && a.peut_drive && a.refresh_token);
  const moi = String(user?.email || '').toLowerCase();
  const ak = (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();
  return (comptes.find((a) => (a.owner_email || a.email) === moi) || comptes.find((a) => a.email === ak) || comptes[0])?.email || null;
}

/**
 * Toutes les pièces d'un projet : l'onglet Documents, puis le dossier Drive
 * de son dossier de préanalyse s'il en a un.
 * @returns {Promise<{pieces: Array, drive_url: string|null, avertissement: string|null}>}
 */
export async function piecesDuProjet(projet, { user = null } = {}) {
  const pieces = piecesDeclarees(projet);
  const deal = projet?.deal_id ? Records.findBy('Deal', 'deal_id', projet.deal_id) : null;
  const dossierId = projet?.drive_folder_id || deal?.drive_folder_id || null;
  const driveUrl = projet?.drive_folder_url || deal?.drive_folder_url || null;
  let avertissement = null;
  if (dossierId) {
    const compte = compteDrive(user);
    if (!compte) avertissement = "Aucune boîte Google n'a l'accès Drive : le dossier Drive du projet n'a pas pu être lu.";
    else {
      try {
        const { listerFichiers } = await import('./google-drive.js');
        const deja = new Set(pieces.map((p) => p.id));
        for (const f of await listerFichiers(compte, { dossierId, limite: 40 })) {
          if (deja.has(`drive:${f.id}`)) continue;
          pieces.push({ id: `drive:${f.id}`, nom: f.nom, url: f.url, joignable: true, taille: f.taille || null });
        }
      } catch (e) {
        avertissement = `Le dossier Drive du projet n'a pas pu être lu : ${e?.message || e}`;
      }
    }
  }
  return { pieces, drive_url: driveUrl, avertissement };
}

// Le nom sous lequel le destinataire reçoit la pièce : le libellé de l'onglet
// Documents (« Bail commercial (2003) ») avec l'extension du vrai fichier.
const nomDeFichier = (libelle, vrai) => {
  const ext = path.extname(String(vrai || '')).toLowerCase();
  const base = String(libelle || '').trim();
  if (!base) return vrai || 'document';
  return path.extname(base) ? base : `${base}${ext || ''}`;
};

/**
 * Charge les pièces choisies, par identifiant, pour MailComposer. Seules les
 * pièces du projet se chargent : un identifiant venu d'ailleurs est ignoré.
 * @returns {Promise<{attachments: Array, jointes: string[], ratees: string[]}>}
 */
export async function chargerPieces(projet, ids, { user = null } = {}) {
  const { pieces } = await piecesDuProjet(projet, { user });
  const voulues = new Set((ids || []).map(String));
  const choisies = pieces.filter((p) => p.joignable && voulues.has(p.id));
  const attachments = [];
  const jointes = [];
  const ratees = [];
  let total = 0;
  const compte = choisies.some((p) => p.id.startsWith('drive:')) ? compteDrive(user) : null;
  for (const p of choisies) {
    try {
      let fichier;
      if (p.id.startsWith('upload:')) {
        const nom = path.basename(p.id.slice(7));
        const chemin = path.join(UPLOAD_DIR, nom);
        if (!chemin.startsWith(path.resolve(UPLOAD_DIR))) throw new Error('chemin refusé');
        fichier = { nom, buffer: fs.readFileSync(chemin), mime: undefined };
      } else {
        if (!compte) throw new Error("aucune boîte Google n'a l'accès Drive");
        const { telechargerFichier } = await import('./google-drive.js');
        fichier = await telechargerFichier(compte, p.id.slice(6));
      }
      if (total + fichier.buffer.length > LIMITE_OCTETS) {
        ratees.push(`${p.nom} : trop lourd pour tenir dans le mail`);
        continue;
      }
      total += fichier.buffer.length;
      const filename = nomDeFichier(p.nom, fichier.nom);
      attachments.push({ filename, content: fichier.buffer, ...(fichier.mime ? { contentType: fichier.mime } : {}) });
      jointes.push(filename);
    } catch (e) {
      ratees.push(`${p.nom} : ${e?.message || e}`);
    }
  }
  return { attachments, jointes, ratees };
}
