// Les pièces jointes d'une réponse entrent dans le dossier, toutes seules.
//
// C'était le maillon manquant : on savait qu'un agent avait joint « bail.pdf »,
// on en gardait le nom, et l'analyste devait rouvrir Gmail, télécharger, revenir
// et déposer le fichier. Tout l'aval existait déjà — classement, extraction,
// remplissage du projet ; seul le raccordement manquait.
//
// Ce module télécharge, dépose et met en file. Rien n'est décidé ici : un
// document arrivé est un document arrivé.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, CHEMIN_UPLOADS } from '../db.js';
import { telechargerPieceJointe } from '../gmail-inbox.js';
import { ajouterDocument } from './espace.js';
import { enfiler } from './file-extraction.js';
import { ajouterSuivi } from './lifecycle.js';

// Ce qu'un agent transmet réellement — mêmes critères que le tri des mails.
const UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp)$/i;
const PARASITES = /^(image\d+|logo|signature|banniere|banner|icon|unnamed)/i;

// La veille tourne sans requête HTTP : elle résout elle-même le dossier des
// uploads plutôt que de dépendre d'un paramètre transmis.

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
  const vide = { deposes: [], ignorees: 0, erreurs: [], echecs: [] };
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

  // L'extraction part immédiatement : quand l'analyste ouvre le dossier,
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

  // Les pièces sont au dossier : on les range dans le Drive et on met la fiche
  // Monday à jour dans la foulée. Ni l'un ni l'autre ne peut faire échouer la
  // récupération elle-même — un document reçu doit rester reçu.
  const rangement = nouveaux.length
    ? await ranger(mail, deposes, user)
    : { drive: null, monday: null, erreurs: [], echecs: [] };
  erreurs.push(...rangement.erreurs);

  Records.update('MailRecu', mail.id, { pieces_ingerees: true, pieces_deposees: deposes });
  return {
    deposes,
    ignorees,
    erreurs,
    echecs: rangement.echecs || [],
    drive: rangement.drive,
    monday: rangement.monday,
  };
}

/**
 * Classe les documents d'un dossier dans son Drive.
 *
 * Extrait de `ranger()` parce qu'un classement raté doit pouvoir se rejouer
 * plus tard, depuis le rapport, sans qu'un mail soit à rejouer avec lui.
 *
 * @param {object} deal
 * @param {{noms?: string[], comptePrefere?: string}} options - `noms` limite
 *   l'envoi aux pièces nommées quand le dossier Drive existe déjà ; sinon tout
 *   l'historique repartirait en double.
 * @returns {Promise<{drive: object|null, erreurs: string[]}>}
 */
export async function classerDeal(deal, { noms = null, comptePrefere = null } = {}) {
  const erreurs = [];
  try {
    const { comptesEquipe } = await import('../google-oauth.js');
    const comptes = comptesEquipe().filter((a) => a.peut_drive);
    const compte =
      comptes.find((a) => String(a.email).toLowerCase() === String(comptePrefere || '').toLowerCase())?.email ||
      comptes[0]?.email;
    if (!compte) return { drive: null, erreurs: ["aucun compte Google n'autorise le Drive"] };

    const { classerDansDrive } = await import('../google-drive.js');
    const tous = deal.documents_espace || [];
    const aEnvoyer = (deal.drive_folder_url && noms ? tous.filter((d) => noms.includes(d.nom)) : tous)
      .filter((d) => d.url)
      .map((d) => ({ nom: d.nom, chemin: d.url }));

    const titre = deal.nom || deal.lots?.[0]?.synthese?.titre || deal.deal_id;
    const r = await classerDansDrive(compte, titre, aEnvoyer, CHEMIN_UPLOADS);
    Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
    erreurs.push(...(r.erreurs || []));
    return { drive: { url: r.folder_url, chemin: r.chemin, classes: r.envoyes.length }, erreurs };
  } catch (e) {
    return { drive: null, erreurs: [String(e?.message || e)] };
  }
}

/**
 * Range les documents dans le Drive du dossier et rafraîchit sa fiche Monday.
 *
 * Le compte Drive est celui qui a reçu le mail — c'est son autorisation qui est
 * engagée ; à défaut, le premier compte de l'équipe qui autorise le Drive.
 */
async function ranger(mail, deposes, user) {
  const erreurs = [];
  // Un échec écrit en toutes lettres ne se rattrape pas : il faut savoir quel
  // dossier et quelle opération ont manqué pour pouvoir les relancer d'un clic.
  const echecs = [];
  let drive = null;
  let monday = null;

  const deal = Records.filter('Deal', { deal_id: mail.deal_id })[0];
  if (!deal) return { drive, monday, erreurs, echecs };

  const titreDeal = deal.nom || deal.lots?.[0]?.synthese?.titre || deal.deal_id;
  const echec = (operation, quoi, cause) => {
    echecs.push({
      operation,
      deal_id: deal.deal_id,
      dossier: titreDeal,
      quoi,
      cause: String(cause || '').slice(0, 240),
      le: new Date().toISOString(),
    });
  };

  // --- Drive ---------------------------------------------------------------
  const classement = await classerDeal(deal, { noms: deposes, comptePrefere: mail.compte });
  drive = classement.drive;
  erreurs.push(...classement.erreurs.map((e) => `Drive : ${e}`));
  for (const e of classement.erreurs) {
    echec('drive', classement.drive ? `${titreDeal} — document non versé` : `${deposes.length} document(s) non classé(s)`, e);
  }

  // --- Monday --------------------------------------------------------------
  try {
    const { pousserBien } = await import('./monday-sync.js');
    const r = await pousserBien(Records.filter('Deal', { deal_id: mail.deal_id })[0], {
      motif: `Documents reçus de ${mail.de_email} : ${deposes.join(', ')}`,
    });
    if (!r?.ignore) monday = { id: r?.id, cree: r?.cree };
  } catch (e) {
    erreurs.push(`Monday : ${e?.message || e}`);
    echec('monday', `Fiche « ${titreDeal} » non mise à jour`, e?.message || e);
  }

  if (drive || monday) {
    ajouterSuivi(
      Records.filter('Deal', { deal_id: mail.deal_id })[0],
      {
        type: 'documents_recus',
        detail: [
          drive ? `${drive.classes} document(s) classé(s) dans ${drive.chemin}` : null,
          monday ? (monday.cree ? 'fiche Monday créée' : 'fiche Monday mise à jour') : null,
        ]
          .filter(Boolean)
          .join(' · '),
      },
      user
    );
  }

  return { drive, monday, erreurs, echecs };
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
  let classes = 0;
  let fiches = 0;
  const erreurs = [];
  const echecs = [];
  const lignes = [];
  for (const mail of aTraiter) {
    try {
      const r = await ingererPiecesJointes(mail, uploadDir, user);
      documents += r.deposes.length;
      classes += r.drive?.classes || 0;
      if (r.monday) fiches += 1;
      erreurs.push(...r.erreurs);
      echecs.push(...(r.echecs || []));

      if (r.deposes.length) {
        const deal = Records.filter('Deal', { deal_id: mail.deal_id })[0];
        lignes.push({
          dossier: deal?.nom || deal?.lots?.[0]?.synthese?.titre || mail.deal_id,
          deal_id: mail.deal_id,
          de: mail.de_email,
          documents: r.deposes,
          drive: r.drive?.chemin || null,
          monday: r.monday ? (r.monday.cree ? 'fiche créée' : 'fiche mise à jour') : null,
        });
      }
    } catch (e) {
      erreurs.push(`${mail.objet || mail.id} : ${e?.message || e}`);
    }
  }
  return { mails: aTraiter.length, documents, classes, fiches, lignes, erreurs, echecs };
}
