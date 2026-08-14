// Transcription des documents sans couche texte (PDF scannés, photos de fiches).
//
// Le modèle est ici employé comme un simple OCR : il retranscrit, il n'interprète
// pas. C'est important pour la suite du pipeline — le texte produit devient la
// source contre laquelle le garde-fou vérifie chaque citation, donc il doit
// rester fidèle au document et ne rien reformuler.

import { generateFromDocument } from '../llm.js';

const PROMPT_TRANSCRIPTION = `Transcris INTÉGRALEMENT et LITTÉRALEMENT le texte de ce document.

Règles impératives :
- Recopie le texte tel qu'il apparaît, sans corriger, reformuler ni résumer.
- Conserve les nombres, montants, unités et dates exactement tels qu'écrits (y compris les espaces dans "320 000 €").
- Conserve la structure : titres, listes, et surtout les tableaux (une ligne par ligne du tableau, colonnes séparées par " | ").
- Si le document décrit plusieurs lots ou plusieurs biens, transcris chaque bloc séparément et conserve les intitulés qui les distinguent.
- N'ajoute aucun commentaire, aucune analyse, aucune balise. Uniquement le texte du document.
- Si une zone est illisible, écris [illisible] à cet endroit plutôt que de deviner.`;

/**
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>} texte transcrit
 */
export async function transcribeDocument(buffer, mimetype) {
  return generateFromDocument({ buffer, mimetype, prompt: PROMPT_TRANSCRIPTION });
}
