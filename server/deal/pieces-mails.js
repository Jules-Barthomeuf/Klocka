// Les pièces jointes d'une réponse entrent dans le dossier, toutes seules.
//
// C'était le maillon manquant : on savait qu'un agent avait joint « bail.pdf »,
// on en gardait le nom, et l'analyste devait rouvrir Gmail, télécharger, revenir
// et déposer le fichier. Tout l'aval existait déjà — classement, dépouillement,
// remplissage du projet ; seul le raccordement manquait.
//
// Ce module télécharge, dépose et met en file. Rien n'est décidé ici : un
// document arrivé est un document arrivé.

import fs from 'fs';
import path from 'path';
import { Records } from '../db.js';
import { telechargerPieceJointe } from '../gmail-inbox.js';
import { ajouterDocument } from './espace.js';
import { enfiler } from './file-extraction.js';
import { ajouterSuivi } from './lifecycle.js';

// Ce qu'un agent transmet réellement — mêmes critères que le tri des mails.
const UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp)$/i;
const PARASITES = /^(image\d+|logo|signature|banniere|banner|icon|unnamed)/i;

const nomSur = (nom) => String(nom || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

/**
 * Récupère les pièces jointes d'un mail rattaché à un dossier.
 * Idempotent : un mail déjà traité ne l'est pas deux fois, et un document de
 * même nom déjà présent n'est pas redéposé.
 *
 * @param {object} mail - enregistrement MailRecu
 * @param {string} uploadDir
 * @param {object} [user]
 * @param {Function} [telecharger] - injectable, pour tester sans appeler Gmail
 * @returns {Promise<{ deposes: string[], ignorees: number, erreurs: string[] }>}
 */
export async function ingererPiecesJointes(mail, uploadDir, user = null, telecharger = telechargerPieceJointe) {
  const vide = { deposes: [], ignorees: 0, erreurs: [] };
  if (!mail?.deal_id || mail.pieces_ingerees) return vide;

  const deal = Records.filter('Deal', { deal_id: mail.deal_id })[0];
  if (!deal) return vide;

  const candidates = (mail.pieces_jointes || []).filter(
    (p) => p.piece_id && UTILES.test(p.nom || '') && !PARASITES.test(p.nom || '')
  );
  const ignorees = (mail.pieces_jointes || []).length - candidates.length;
  if (!candidates.length) {
    Records.update('MailRecu', mail.id, { pieces_ingerees: true });
    return { ...vide, ignorees };
  }

  // Un même document renvoyé deux fois par l'agent ne crée pas de doublon.
  const dejaLa = new Set((deal.documents_espace || []).map((d) => String(d.nom || '').toLowerCase()));

  const deposes = [];
  const erreurs = [];
  const nouveaux = [];
  for (const piece of candidates) {
    if (dejaLa.has(String(piece.nom).toLowerCase())) {
      erreurs.push(`${piece.nom} : déjà au dossier`);
      continue;
    }
    try {
      const buffer = await telecharger(mail.compte, mail.gmail_message_id, piece.piece_id);
      const fichier = `${Date.now()}-${nomSur(piece.nom)}`;
      fs.writeFileSync(path.join(uploadDir, fichier), buffer);

      const r = ajouterDocument(
        mail.deal_id,
        { nom: piece.nom, url: `/uploads/${fichier}`, mime: piece.mime, taille: buffer.length },
        user
      );
      if (!r.ok) throw new Error(r.error);
      deposes.push(piece.nom);
      nouveaux.push(r.document.id);
    } catch (e) {
      erreurs.push(`${piece.nom} : ${e?.message || e}`);
    }
  }

  // Le dépouillement part immédiatement : quand l'analyste ouvre le dossier,
  // les données sont déjà là.
  if (nouveaux.length) {
    enfiler(mail.deal_id, nouveaux, { uploadDir, user });
    ajouterSuivi(
      Records.filter('Deal', { deal_id: mail.deal_id })[0],
      {
        type: 'documents_recus',
        detail: `${deposes.length} pièce(s) jointe(s) récupérée(s) depuis le mail de ${mail.de_email} : ${deposes.join(', ')}`,
      },
      user
    );
  }

  Records.update('MailRecu', mail.id, { pieces_ingerees: true, pieces_deposees: deposes });
  return { deposes, ignorees, erreurs };
}

/**
 * Passe sur tous les mails rattachés dont les pièces n'ont pas été récupérées.
 * @returns {Promise<{ mails: number, documents: number, erreurs: string[] }>}
 */
export async function ingererEnAttente(uploadDir, user = null) {
  const aTraiter = Records.list('MailRecu').filter(
    (m) => m.deal_id && !m.pieces_ingerees && (m.pieces_jointes || []).length
  );

  let documents = 0;
  const erreurs = [];
  for (const mail of aTraiter) {
    try {
      const r = await ingererPiecesJointes(mail, uploadDir, user);
      documents += r.deposes.length;
      erreurs.push(...r.erreurs);
    } catch (e) {
      erreurs.push(`${mail.objet || mail.id} : ${e?.message || e}`);
    }
  }
  return { mails: aTraiter.length, documents, erreurs };
}
