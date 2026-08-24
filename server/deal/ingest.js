// BLOC 1 — Ingestion.
//
// Transforme une fiche commerciale (PDF natif ou scanné, image, texte de mail,
// .eml) en un texte brut unique, qui devient LA source de vérité du dossier.
//
// Tout ce qui suit dans le pipeline travaille sur ce texte : c'est lui que le
// garde-fou de citation interroge. Un PDF scanné est donc transcrit AVANT
// l'extraction, et non lu directement par l'extracteur — sans quoi il n'y
// aurait aucun texte contre lequel vérifier les citations.

import fs from 'fs';
import path from 'path';
import { simpleParser } from 'mailparser';
import { transcribeDocument } from './vision.js';

const TEXT_EXTS = new Set(['.txt', '.md', '.csv']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']);

// Un PDF « natif » embarque une couche texte. En dessous de ce seuil de
// caractères utiles par page, on considère qu'il s'agit d'un scan.
const MIN_CHARS_PAR_PAGE = 120;

function nettoyer(texte) {
  return (texte || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function lirePdf(buffer) {
  // pdf-parse v2 expose une classe : la couche texte se lit page par page.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const r = await parser.getText();
    const pages = r.pages || [];
    return {
      texte: nettoyer(pages.map((pg) => pg.text || '').join('\n\n')),
      pages: pages.length || 1,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function lireEml(buffer) {
  const mail = await simpleParser(buffer);
  const corps = mail.text || mail.html?.replace(/<[^>]+>/g, ' ') || '';
  const entete = [
    mail.subject ? `Objet : ${mail.subject}` : null,
    mail.from?.text ? `De : ${mail.from.text}` : null,
    mail.date ? `Date : ${mail.date.toISOString().slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  // Les fiches arrivent souvent en pièce jointe plutôt que dans le corps.
  const pieces = [];
  for (const att of mail.attachments || []) {
    const nom = att.filename || 'piece-jointe';
    const ext = path.extname(nom).toLowerCase();
    try {
      if (ext === '.pdf') {
        const { texte } = await lirePdf(att.content);
        pieces.push({ nom, texte });
      } else if (TEXT_EXTS.has(ext)) {
        pieces.push({ nom, texte: nettoyer(att.content.toString('utf-8')) });
      } else if (IMAGE_MIMES.has(att.contentType)) {
        const texte = await transcribeDocument(att.content, att.contentType);
        pieces.push({ nom, texte: nettoyer(texte), transcrit: true });
      }
    } catch (e) {
      pieces.push({ nom, texte: '', erreur: String(e?.message || e) });
    }
  }

  const blocs = [entete, nettoyer(corps)];
  for (const p of pieces) {
    if (p.texte) blocs.push(`--- Pièce jointe : ${p.nom} ---\n${p.texte}`);
  }
  return { texte: nettoyer(blocs.filter(Boolean).join('\n\n')), pieces };
}

/**
 * Normalise une entrée quelconque en texte source exploitable.
 * @param {object} entree
 * @param {Buffer} [entree.buffer] - contenu du fichier
 * @param {string} [entree.filename]
 * @param {string} [entree.mimetype]
 * @param {string} [entree.texte] - texte collé directement (corps de mail)
 * @returns {Promise<{texte: string, source: string, transcrit: boolean, pages: number, avertissements: string[]}>}
 */
export async function ingerer({ buffer, filename, mimetype, texte } = {}) {
  const avertissements = [];

  if (texte && texte.trim()) {
    return { texte: nettoyer(texte), source: 'texte', transcrit: false, pages: 1, avertissements };
  }

  if (!buffer || !buffer.length) {
    throw new Error('Aucun document fourni.');
  }

  const ext = path.extname(filename || '').toLowerCase();
  const mime = (mimetype || '').toLowerCase();

  // --- .eml -----------------------------------------------------------------
  if (ext === '.eml' || mime === 'message/rfc822') {
    const { texte: t, pieces } = await lireEml(buffer);
    if (!t) avertissements.push("Le mail ne contient ni texte ni pièce jointe exploitable.");
    if (pieces.some((p) => p.erreur)) {
      avertissements.push(`Pièce(s) jointe(s) illisible(s) : ${pieces.filter((p) => p.erreur).map((p) => p.nom).join(', ')}`);
    }
    return {
      texte: t,
      source: 'eml',
      transcrit: pieces.some((p) => p.transcrit),
      pages: 1,
      avertissements,
    };
  }

  // --- Texte brut -----------------------------------------------------------
  if (TEXT_EXTS.has(ext) || mime.startsWith('text/')) {
    return { texte: nettoyer(buffer.toString('utf-8')), source: 'texte', transcrit: false, pages: 1, avertissements };
  }

  // --- Image ----------------------------------------------------------------
  if (IMAGE_MIMES.has(mime) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const t = nettoyer(await transcribeDocument(buffer, mime || 'image/jpeg'));
    if (!t) avertissements.push("La transcription de l'image n'a rien produit.");
    return { texte: t, source: 'image', transcrit: true, pages: 1, avertissements };
  }

  // --- PDF ------------------------------------------------------------------
  if (ext === '.pdf' || mime === 'application/pdf') {
    let natif = { texte: '', pages: 1 };
    try {
      natif = await lirePdf(buffer);
    } catch {
      // Couche texte illisible : on bascule sur la transcription.
    }

    const densite = natif.texte.length / Math.max(1, natif.pages);
    if (densite >= MIN_CHARS_PAR_PAGE) {
      return { texte: natif.texte, source: 'pdf', transcrit: false, pages: natif.pages, avertissements };
    }

    // PDF scanné : on transcrit, et c'est cette transcription qui fait foi.
    const t = nettoyer(await transcribeDocument(buffer, 'application/pdf'));
    if (!t) avertissements.push("La transcription du PDF n'a rien produit.");
    return { texte: t, source: 'pdf_scanne', transcrit: true, pages: natif.pages, avertissements };
  }

  throw new Error(`Format non pris en charge : ${filename || mime || 'inconnu'}`);
}

/**
 * Archive le document source à côté du dossier, pour pouvoir y revenir.
 * @returns {string|null} chemin relatif servi par /uploads
 */
export function archiverSource(buffer, filename, dossier) {
  if (!buffer) return null;
  const safe = (filename || 'fiche').replace(/[^a-zA-Z0-9._-]/g, '_');
  const nom = `${Date.now()}-${safe}`;
  fs.writeFileSync(path.join(dossier, nom), buffer);
  return `/uploads/${nom}`;
}
