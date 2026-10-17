// Haka : créer une compétence à partir d'un exemple (17 oct. 2026, Jules, comme « Document to Agent »
// chez Hebbia). Jules dépose un livrable de référence (une ancienne fiche deal bien faite) ou décrit sa
// méthode ; Haka propose un brouillon complet : en-tête et corps. RIEN n'est publié : c'est un brouillon
// sans version publiée, que Jules relit, teste et publie lui-même.

import * as C from './competences.js';

const SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: 'Une à deux phrases : ce que fait la compétence et quand l\'utiliser.' },
    declencheurs: { type: 'array', items: { type: 'string', enum: C.DECLENCHEURS } },
    entrees: { type: 'array', items: { type: 'string' } },
    outils: { type: 'array', items: { type: 'object', properties: { cle: { type: 'string', enum: C.OUTILS }, obligatoire: { type: 'boolean' } }, required: ['cle'] } },
    livrable: { type: 'string' },
    destination: { type: 'string', enum: C.DESTINATIONS },
    mode_execution: { type: 'string', enum: C.MODES },
    corps: { type: 'string', description: 'La méthode en Markdown, en étapes numérotées, avec une section « Ne jamais ». Une page au plus.' },
  },
  required: ['resume', 'declencheurs', 'entrees', 'outils', 'livrable', 'corps'],
};

export const consigne = ({ nom, texte }) => [
  `Tu écris une COMPÉTENCE pour Haka, l'agent de l'équipe Klocka (investissement dans les murs de commerce). Nom : « ${nom} ».`,
  'Une compétence est une méthode de travail en français : quand agir, quelles sources consulter, quelles règles appliquer, quel livrable rendre. Elle ne contient pas de code.',
  "Partage : l'IA lit, cherche, rédige ; le CODE calcule, applique les seuils chiffrés et écrit. N'enterre donc aucun seuil dans le texte : cite-les par leur nom.",
  'Choisis les outils et sources UNIQUEMENT dans la liste fournie ; marque obligatoires ceux sans lesquels la compétence ne peut pas se faire.',
  'Écris une section « Ne jamais » : inventer une valeur, écraser une valeur corrigée par un humain, envoyer quoi que ce soit sans validation.',
  '',
  "L'EXEMPLE OU LA DESCRIPTION DE JULES :",
  String(texte || '').slice(0, 24000),
].join('\n');

/**
 * @param {{nom: string, texte: string}} demande
 * @param {object} user
 * @param {{ecrire?: (prompt: string) => Promise<object>}} options  `ecrire` remplace le modèle (tests)
 */
export async function depuisExemple({ nom, texte }, user, { ecrire = null } = {}) {
  if (!String(texte || '').trim()) return { ok: false, statut: 400, error: 'Déposez un exemple ou décrivez la méthode.' };
  const cree = C.creer({ nom }, user);
  if (!cree.ok) return cree;
  const cle = cree.competence.cle;
  let proposition;
  try {
    const ecrireModele = ecrire || (async (prompt) => (await import('../llm.js')).invokeLLM({ prompt, response_json_schema: SCHEMA }));
    proposition = await ecrireModele(consigne({ nom, texte }));
  } catch (e) {
    return { ok: true, competence: C.lire(cle), brouillon_vide: true, avertissement: `Le brouillon est créé, mais Haka n'a pas pu l'écrire : ${String(e?.message || e).slice(0, 200)}` };
  }
  const r = C.enregistrerBrouillon(cle, {
    resume: proposition.resume, declencheurs: proposition.declencheurs, entrees: proposition.entrees, outils: proposition.outils,
    livrable: proposition.livrable, destination: proposition.destination, mode_execution: proposition.mode_execution, corps: proposition.corps,
  }, user);
  return { ...r, propose_par_haka: true };
}
