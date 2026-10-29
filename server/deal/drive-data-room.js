// Une pièce importée dans la Data Room part aussi dans le Drive du dossier (27 oct. 2026, Jules : « dès qu'on importe un
// document dans la data room admin, ça doit automatiquement le mettre aussi dans le Google Drive du dossier »).
//
// En tâche de fond, après la réponse : l'import ne l'attend pas, un échec Drive ne bloque rien. Le dossier Drive connu
// (drive_folder_id) reçoit la pièce directement ; à défaut, ou s'il a disparu, il est créé à son nom
// (« VILLE - adresse ») et retenu sur le dossier. La pièce garde son lien Drive (drive_url, drive_copie_le) : une pièce
// déjà copiée ne repart pas. Un dossier de test ne touche jamais Google.

import fs from 'fs';
import path from 'path';
import { Records } from '../db.js';
import { nomDossierDrive } from './nom-drive.js';

/** Le compte Google de l'équipe qui autorise le Drive : celui de la personne qui importe d'abord. */
async function compteDuDrive(email) {
  const { comptesEquipe } = await import('../google-oauth.js');
  const comptes = comptesEquipe().filter((a) => a.peut_drive);
  const voulu = String(email || '').toLowerCase();
  return comptes.find((a) => String(a.email).toLowerCase() === voulu)?.email || comptes[0]?.email || null;
}

/**
 * @param {string} dealId
 * @param {string[]|null} docIds - les pièces de documents_espace à copier ; null : toute la Data Room (le chat,
 *   « mets la data room dans le Drive »)
 * @param {{uploadDir: string, user?: object, drive?: object}} options - `drive` remplace le module Google (tests)
 * @returns {Promise<{copies: number, deja: number, erreurs: string[], folder_url?: string, compte?: string, ignore?: string}>}
 */
export async function copierAuDrive(dealId, docIds, { uploadDir, user = null, drive = null } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { copies: 0, erreurs: [], ignore: 'dossier introuvable' };
  if (deal.test) return { copies: 0, erreurs: [], ignore: 'dossier de test' };
  let pieces = (deal.documents_espace || []).filter((d) => (!docIds || docIds.includes(d.id)) && d.url && !d.drive_copie_le);
  // Demandé par le chat sans pièce à copier : le dossier se crée quand même, vide, prêt à recevoir.
  const creerVide = !docIds && !pieces.length && !deal.drive_folder_url;
  if (!pieces.length && !creerVide) return { copies: 0, deja: 0, erreurs: [], folder_url: deal.drive_folder_url || null };

  const compte = await compteDuDrive(user?.email);
  if (!compte) return { copies: 0, deja: 0, erreurs: ["aucun compte Google de l'équipe n'autorise le Drive"] };
  const G = drive || (await import('../google-drive.js'));
  if (creerVide) {
    try {
      const r = await G.classerDansDrive(compte, nomDossierDrive(deal), [], uploadDir);
      Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
      return { copies: 0, deja: 0, erreurs: [], folder_url: r.folder_url, compte };
    } catch (e) {
      return { copies: 0, deja: 0, erreurs: [String(e?.message || e)] };
    }
  }

  let dossierId = deal.drive_folder_id || null;
  const liens = {};
  const erreurs = [];
  // Les pièces d'avant (sans date de copie) peuvent déjà être dans le dossier, classées à la main ou par un mail : même
  // nom, elles ne repartent pas en double, elles sont seulement marquées.
  let deja = 0;
  if (dossierId) {
    try {
      const noms = new Set((await G.listerFichiers(compte, { dossierId, limite: 200 })).map((f) => String(f.nom).toLowerCase()));
      for (const d of pieces) if (noms.has(String(d.nom).toLowerCase())) { liens[d.id] = { drive_url: deal.drive_folder_url || null }; deja += 1; }
      pieces = pieces.filter((d) => !liens[d.id]);
    } catch { /* dossier illisible : il sera recréé plus bas */ }
  }
  for (const d of pieces) {
    try {
      const buffer = fs.readFileSync(path.join(uploadDir, path.basename(d.url)));
      let f = null;
      if (dossierId) {
        try { f = await G.deposerDansDossier(compte, dossierId, { nom: d.nom, buffer, mime: d.mime }); } catch { dossierId = null; }
      }
      if (!f) {
        // Pas de dossier, ou il n'existe plus : créé (ou retrouvé) à son nom, avec la pièce dedans.
        const r = await G.classerDansDrive(compte, nomDossierDrive(deal), [{ nom: d.nom, buffer, mime: d.mime }], uploadDir);
        if (r.erreurs?.length) throw new Error(r.erreurs[0]);
        dossierId = r.folder_id;
        Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
        liens[d.id] = { drive_url: r.folder_url };
        continue;
      }
      liens[d.id] = { drive_file_id: f.id, drive_url: f.webViewLink || null };
    } catch (e) {
      erreurs.push(`${d.nom} : ${e?.message || e}`);
    }
  }

  // Relu juste avant d'écrire : d'autres pièces ont pu arriver pendant l'envoi.
  if (Object.keys(liens).length) {
    const frais = Records.get('Deal', deal.id);
    Records.update('Deal', deal.id, {
      documents_espace: (frais.documents_espace || []).map((d) => (liens[d.id] ? { ...d, ...liens[d.id], drive_copie_le: new Date().toISOString() } : d)),
    });
  }
  if (erreurs.length) console.warn(`[drive-data-room] ${dealId} : ${erreurs.join(' ; ')}`);
  const url = Records.get('Deal', deal.id)?.drive_folder_url || null;
  return { copies: Object.keys(liens).length - deja, deja, erreurs, folder_url: url, compte };
}
