// Contexte de marché local, sourcé par recherche web (grounding Gemini).
//
// Cette étape est PUREMENT INFORMATIVE : son résultat est affiché à
// l'utilisateur avec ses sources, mais n'entre JAMAIS dans le verdict
// (rules.js), la synthèse ni les mails — le web n'est pas une donnée vérifiée
// du dossier. Elle n'est exécutée qu'une fois, à l'analyse initiale, et son
// échec n'est jamais bloquant.

import { invokeLLMGrounded, invokeLLM } from '../llm.js';

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
      // Les mêmes informations en cases : c'est ce que la fiche projet
      // affiche. Un paragraphe de douze phrases ne se lit pas, une fourchette
      // de prix au m² se lit d'un coup d'œil.
      chiffres: await chiffresDuMarche(r.text, ville),
      sources: r.sources || [],
      genere_le: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[preanalyse] contexte marché impossible :', e?.message || e);
    return null;
  }
}

// Ce que la fiche projet sait afficher en cases. Un chiffre absent du texte
// vaut 0 : le formulaire traite 0 comme « non renseigné » et laisse la case
// vide, plutôt que d'inventer une fourchette que personne n'a écrite.
const SCHEMA_CHIFFRES = {
  type: 'object',
  properties: {
    quartier: { type: 'string', description: "Le quartier ou l'axe commerçant le plus recherché cité dans le texte, sinon chaîne vide." },
    prix_m2_bas: { type: 'number', description: 'Prix de vente bas des murs commerciaux, en € par m². 0 si le texte ne le donne pas.' },
    prix_m2_median: { type: 'number', description: 'Prix de vente médian ou moyen, en € par m². 0 si absent.' },
    prix_m2_haut: { type: 'number', description: 'Prix de vente haut, en € par m². 0 si absent.' },
    loyer_offre_bas: { type: 'number', description: 'Loyer demandé bas sur les locaux proposés, en € par m² et par an. 0 si absent.' },
    loyer_offre_moyen: { type: 'number', description: 'Loyer demandé moyen, en € par m² et par an. 0 si absent.' },
    loyer_offre_haut: { type: 'number', description: 'Loyer demandé haut, en € par m² et par an. 0 si absent.' },
    loyer_baux_bas: { type: 'number', description: 'Loyer bas des baux en place, en € par m² et par an. 0 si absent.' },
    loyer_baux_moyen: { type: 'number', description: 'Loyer moyen des baux en place, en € par m² et par an. 0 si absent.' },
    loyer_baux_haut: { type: 'number', description: 'Loyer haut des baux en place, en € par m² et par an. 0 si absent.' },
    evolution_1an: { type: 'number', description: 'Évolution des prix sur un an, en %. 0 si absente.' },
    evolution_5ans: { type: 'number', description: 'Évolution des prix sur cinq ans, en %. 0 si absente.' },
  },
  required: ['quartier'],
};

/**
 * Relit le point de marché et en sort les chiffres, sans rien ajouter.
 * @returns {Promise<object|null>}
 */
export async function chiffresDuMarche(texte, ville) {
  try {
    const r = await invokeLLM({
      prompt: `Voici un point de marché rédigé sur ${ville}. Reprends UNIQUEMENT les chiffres qui y figurent, sans en déduire ni en inventer aucun. Un chiffre que le texte ne donne pas vaut 0.\n\n--- TEXTE ---\n${String(texte).slice(0, 12000)}\n--- FIN ---`,
      response_json_schema: SCHEMA_CHIFFRES,
      // Relever des nombres déjà écrits : aucune réflexion à mener.
      effort: 'low',
    });
    return r && typeof r === 'object' ? r : null;
  } catch (e) {
    console.warn('[preanalyse] chiffres du marché illisibles :', e?.message || e);
    return null;
  }
}
