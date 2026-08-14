// Classement du document par type (bail, PV d'AG, RCP, quittance, diagnostics).
//
// Rapprochement par indices d'abord : c'est reproductible, gratuit et suffisant
// dans la grande majorité des cas. Le modèle n'intervient qu'en cas d'égalité
// ou d'absence d'indice, et son verdict est marqué en confiance basse.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { invokeLLM, llmEnabled } from '../llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const GRILLE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data', 'documents.json'), 'utf-8')
);

export const TYPES = GRILLE.types;
export const typeParCode = (code) => TYPES.find((t) => t.code === code) || null;

function normaliser(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Score par indices, sur le début du document (là où le type se révèle). */
function scorer(texte, nomFichier) {
  const debut = normaliser(texte.slice(0, 6000));
  const nom = normaliser(nomFichier);
  return TYPES.map((t) => {
    const trouves = (t.indices || []).filter((i) => debut.includes(normaliser(i)));
    // Le nom du fichier pèse lourd : « bail_signe.pdf » est un signal franc.
    const bonusNom = (t.indices || []).some((i) => nom.includes(normaliser(i))) ? 3 : 0;
    return { code: t.code, libelle: t.libelle, score: trouves.length + bonusNom, indices: trouves };
  }).sort((a, b) => b.score - a.score);
}

const SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string', enum: [...TYPES.map((t) => t.code), 'inconnu'] },
    justification: { type: 'string' },
  },
  required: ['code'],
};

/**
 * @returns {Promise<{code:string|null, libelle:string|null, confiance:'haute'|'moyenne'|'basse',
 *                    source:string, candidats:object[]}>}
 */
export async function classer(texte, nomFichier) {
  const scores = scorer(texte || '', nomFichier || '');
  const [premier, second] = scores;

  // Indice net et sans concurrence sérieuse : on tranche sans appeler le modèle.
  if (premier?.score >= 2 && premier.score > (second?.score || 0)) {
    return {
      code: premier.code,
      libelle: premier.libelle,
      confiance: 'haute',
      source: 'indices',
      candidats: scores,
    };
  }

  if (llmEnabled) {
    try {
      const r = await invokeLLM({
        prompt: `Identifie la nature de ce document immobilier français.

Types possibles :
${TYPES.map((t) => `- ${t.code} : ${t.libelle}`).join('\n')}
- inconnu : aucun de ces types

Réponds "inconnu" plutôt que de forcer un rapprochement douteux.

--- DÉBUT DU DOCUMENT ---
${(texte || '').slice(0, 6000)}
--- FIN ---`,
        response_json_schema: SCHEMA,
      });
      const t = typeParCode(r?.code);
      if (t) {
        return { code: t.code, libelle: t.libelle, confiance: 'basse', source: 'ia', candidats: scores };
      }
    } catch {
      /* on retombe sur les indices */
    }
  }

  if (premier?.score > 0) {
    return {
      code: premier.code,
      libelle: premier.libelle,
      confiance: 'basse',
      source: 'indices_faibles',
      candidats: scores,
    };
  }
  return { code: null, libelle: null, confiance: 'basse', source: 'aucun', candidats: scores };
}
