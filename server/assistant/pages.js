// Ingestion paginée.
//
// Toute la valeur d'Alexis tient à l'ancrage : chaque donnée relevée doit
// pointer vers la page exacte du document. On conserve donc le texte page par
// page, et non un texte global — c'est cette découpe qui permet ensuite de
// vérifier qu'une citation figure bien sur la page annoncée, et d'ouvrir le PDF
// au bon endroit.

import path from 'path';
import { PDFParse } from 'pdf-parse';
import { simpleParser } from 'mailparser';
import { generateFromDocument } from '../llm.js';

const MIN_CARACTERES_PAR_PAGE = 80;
const IMAGES = ['.jpg', '.jpeg', '.png', '.webp'];

const nettoyer = (t) =>
  (t || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Le modèle sert d'OCR : il retranscrit sans interpréter, en balisant les pages
// pour qu'on puisse reconstituer la pagination.
const PROMPT_OCR = `Transcris INTÉGRALEMENT et LITTÉRALEMENT ce document.

Règles impératives :
- Fais précéder le texte de CHAQUE page par une ligne seule : ===PAGE n=== (n = numéro de page, à partir de 1).
- Recopie le texte tel quel, sans corriger, reformuler ni résumer.
- Conserve les nombres, montants, dates et unités exactement tels qu'écrits.
- Conserve les tableaux : une ligne par ligne, colonnes séparées par " | ".
- Aucun commentaire, aucune analyse. Uniquement le texte du document.
- Zone illisible : écris [illisible] à cet endroit plutôt que de deviner.`;

function decouperParMarqueurs(texte) {
  const morceaux = String(texte || '').split(/^\s*={2,}\s*PAGE\s+(\d+)\s*={2,}\s*$/gim);
  if (morceaux.length < 3) return [{ page: 1, texte: nettoyer(texte) }];
  const pages = [];
  for (let i = 1; i < morceaux.length; i += 2) {
    const num = Number(morceaux[i]) || pages.length + 1;
    const contenu = nettoyer(morceaux[i + 1]);
    if (contenu) pages.push({ page: num, texte: contenu });
  }
  return pages.length ? pages : [{ page: 1, texte: nettoyer(texte) }];
}

async function transcrire(buffer, mimetype) {
  const brut = await generateFromDocument({ buffer, mimetype, prompt: PROMPT_OCR });
  return decouperParMarqueurs(brut);
}

/**
 * @returns {Promise<{pages: {page:number, texte:string}[], transcrit: boolean, avertissements: string[]}>}
 */
export async function lirePages({ buffer, filename, mimetype, texte }) {
  const avertissements = [];

  if (texte && texte.trim()) {
    return { pages: [{ page: 1, texte: nettoyer(texte) }], transcrit: false, avertissements };
  }
  if (!buffer?.length) throw new Error('Document vide.');

  const ext = path.extname(filename || '').toLowerCase();
  const mime = (mimetype || '').toLowerCase();

  if (ext === '.eml' || mime === 'message/rfc822') {
    const mail = await simpleParser(buffer);
    const corps = mail.text || mail.html?.replace(/<[^>]+>/g, ' ') || '';
    return { pages: [{ page: 1, texte: nettoyer(corps) }], transcrit: false, avertissements };
  }

  if (ext === '.txt' || mime.startsWith('text/')) {
    return { pages: [{ page: 1, texte: nettoyer(buffer.toString('utf-8')) }], transcrit: false, avertissements };
  }

  if (IMAGES.includes(ext) || mime.startsWith('image/')) {
    const pages = await transcrire(buffer, mime || 'image/jpeg');
    return { pages, transcrit: true, avertissements };
  }

  if (ext === '.pdf' || mime === 'application/pdf') {
    let natif = null;
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const r = await parser.getText();
      natif = (r.pages || []).map((p) => ({ page: p.num ?? p.pageNumber, texte: nettoyer(p.text) }));
    } catch {
      // Couche texte illisible : on bascule sur la transcription.
    } finally {
      await parser.destroy().catch(() => {});
    }

    const utiles = (natif || []).filter((p) => p.texte.length >= MIN_CARACTERES_PAR_PAGE);
    if (natif?.length && utiles.length >= Math.ceil(natif.length / 2)) {
      return { pages: natif.filter((p) => p.texte), transcrit: false, avertissements };
    }

    const pages = await transcrire(buffer, 'application/pdf');
    return { pages, transcrit: true, avertissements };
  }

  throw new Error(`Format non pris en charge : ${filename || mime || 'inconnu'}`);
}

/** Texte complet, pages balisées — ce que voit le modèle d'extraction. */
export function texteBalise(pages) {
  return pages.map((p) => `===PAGE ${p.page}===\n${p.texte}`).join('\n\n');
}
