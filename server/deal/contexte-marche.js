// Contexte de marché local, sourcé par recherche web (grounding Gemini).
//
// Cette étape est PUREMENT INFORMATIVE : son résultat est affiché à
// l'utilisateur avec ses sources, mais n'entre JAMAIS dans le verdict
// (rules.js), la synthèse ni les mails — le web n'est pas une donnée vérifiée
// du dossier. Elle n'est exécutée qu'une fois, à l'analyse initiale, et son
// échec n'est jamais bloquant.

import { invokeLLMGrounded } from '../llm.js';

/**
 * @param {object} p - { ville, code_postal, type_actif }
 * @returns {Promise<{resume, sources, genere_le} | null>}
 */
export async function contexteMarcheLocal({ ville, code_postal, type_actif } = {}) {
  if (!ville) return null;

  const quartierHint = /^(69|13|75)/.test(code_postal || '')
    ? ' Précise quels arrondissements ou quartiers sont les plus recherchés pour le commerce, et lesquels sont à éviter.'
    : ' Précise quels quartiers ou axes commerçants sont les plus recherchés.';

  try {
    const r = await invokeLLMGrounded({
      prompt: `Tu es analyste en immobilier commercial. Fais un point synthétique (8-12 phrases, texte brut sans markdown) sur le marché des locaux commerciaux (murs de boutique) à ${ville}${code_postal ? ` (${code_postal})` : ''}.

Couvre : dynamisme commercial de la ville, niveaux de loyers et de rendements constatés pour ${type_actif || 'des locaux commerciaux'}, tendance récente.${quartierHint}

Appuie-toi sur des sources web récentes. Reste factuel : si une information est incertaine ou datée, dis-le.`,
    });
    if (!r?.text) return null;
    return {
      resume: r.text,
      sources: r.sources || [],
      genere_le: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[preanalyse] contexte marché impossible :', e?.message || e);
    return null;
  }
}
