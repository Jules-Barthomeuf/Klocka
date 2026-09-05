// BLOC 3 — Rédaction.
//
// Le modèle met en mots un résultat déjà arrêté. Il reçoit UNIQUEMENT le JSON
// consolidé et la sortie du moteur de règles. Il n'a pas accès au document
// source, ni au texte transcrit, ni aux citations.
//
// Cette privation d'accès est la protection anti-hallucination centrale : le
// rédacteur ne peut pas inventer un chiffre qu'il n'a jamais vu, et il ne peut
// pas contredire le verdict puisqu'il ne dispose d'aucun élément pour le
// recalculer. S'il manque une donnée, il ne peut que le dire.

import { invokeLLM, llmEnabled } from '../llm.js';

/**
 * Réduit le dossier à ce que le rédacteur a le droit de voir.
 * Toute évolution de cette fonction doit préserver l'invariant : aucun extrait
 * du document source ne doit s'y glisser.
 */
export function vueRedacteur(dossierLot) {
  const { evaluation, enrichissement, lot } = dossierLot;
  const v = (c) => (c && c.absent === false ? c.valeur : null);

  return {
    verdict: evaluation.verdict,
    profil: evaluation.profil,
    motifs: evaluation.motifs,
    reserves: (evaluation.reserves || []).map((r) => r.motif),
    informations_manquantes: evaluation.libelles_manquants || [],
    bien: {
      adresse: v(lot.adresse),
      type_actif: v(lot.type_actif),
      surface_m2: v(lot.surface_m2),
      locataire: v(lot.locataire_nom),
      activite: enrichissement?.activite?.libelle ?? null,
      bail_echeance: v(lot.bail_echeance),
      bail_type: v(lot.bail_type),
      annees_bail_restantes: evaluation.contexte?.annees_bail_restantes ?? null,
    },
    finances: {
      prix_fai: evaluation.aem?.prix_fai ?? null,
      prix_aem: evaluation.aem?.prix_aem ?? null,
      surcout_vs_fai: evaluation.aem?.surcout_vs_fai ?? null,
      rendement_annonce: v(lot.rendement_annonce),
      rendement_fai: evaluation.aem?.rendement_fai ?? null,
      rendement_aem: evaluation.aem?.rendement_aem ?? null,
      loyer_annuel_ht_hc: v(lot.loyer_annuel_ht_hc),
    },
    marche: {
      commune: enrichissement?.commune?.nom ?? null,
      population: enrichissement?.commune?.population ?? null,
      typologie_ville: enrichissement?.typologie_ville ?? null,
      ville_riche: enrichissement?.ville_riche ?? null,
      signature: enrichissement?.signature?.niveau ?? null,
      signature_a_valider: enrichissement?.signature?.a_valider ?? false,
      emplacement: enrichissement?.emplacement ?? 'a_qualifier',
    },
  };
}

const SCHEMA_SYNTHESE = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'Une ligne : nature du bien, surface, ville, locataire si connu. Sans le verdict.' },
    synthese: { type: 'string', description: 'Deux phrases, trois au plus, 60 mots maximum : pourquoi ce verdict, et ce qui manque ou reste à faire.' },
    points_forts: { type: 'array', items: { type: 'string' } },
    points_vigilance: { type: 'array', items: { type: 'string' } },
  },
  required: ['titre', 'synthese'],
};

const CONSIGNES_SYNTHESE = `Tu rédiges la synthèse d'une préanalyse d'investissement en murs commerciaux pour Klocka.

Le verdict a DÉJÀ été arrêté par un moteur de règles déterministe. Tu le mets en mots, tu ne le rejuges pas.

RÈGLES IMPÉRATIVES :
1. N'utilise QUE les données du JSON ci-dessous. Tu n'as pas accès au document d'origine — c'est voulu.
2. N'invente aucun chiffre, aucune caractéristique, aucun élément de contexte local. Une donnée à null est une donnée que nous n'avons pas : dis-le, ne la comble pas.
3. Ne remets jamais le verdict en cause et n'en propose pas un autre.
4. Distingue explicitement le rendement annoncé (sur prix FAI) du rendement AEM (sur prix de revient, droits et honoraires inclus) : c'est le second qui fait foi chez nous.
5. Ton professionnel, sobre, français, sans superlatif commercial. Pas de markdown, pas de listes à puces dans "synthese".
6. COURT. La synthèse fait deux phrases, trois au plus, soixante mots maximum. Les chiffres (prix, rendements, surface, échéance) sont déjà affichés à côté : ne les répète pas, sauf un seul s'il décide du verdict. Dis ce qui fait le verdict, puis ce qui manque ou reste à faire. Rien d'autre.
7. Si l'emplacement est "a_qualifier", dis-le en trois mots au plus dans la dernière phrase ("emplacement à qualifier").
8. Le titre ne contient pas le verdict.`;

/**
 * Rédige la synthèse motivée d'un lot évalué.
 */
export async function redigerSynthese(dossierLot) {
  const vue = vueRedacteur(dossierLot);

  if (!llmEnabled) {
    return { ...syntheseDeSecours(vue), ia: false };
  }

  try {
    const r = await invokeLLM({
      prompt: `${CONSIGNES_SYNTHESE}\n\n--- DOSSIER CONSOLIDÉ ---\n${JSON.stringify(vue, null, 2)}\n--- FIN ---`,
      response_json_schema: SCHEMA_SYNTHESE,
    });
    if (!r?.synthese) return { ...syntheseDeSecours(vue), ia: false };
    return {
      titre: r.titre || syntheseDeSecours(vue).titre,
      synthese: r.synthese,
      points_forts: Array.isArray(r.points_forts) ? r.points_forts : [],
      points_vigilance: Array.isArray(r.points_vigilance) ? r.points_vigilance : [],
      ia: true,
    };
  } catch (e) {
    console.error('[preanalyse] rédaction impossible :', e?.message || e);
    return { ...syntheseDeSecours(vue), ia: false };
  }
}

// Sans IA, on énonce factuellement la sortie du moteur : pas de rédaction, mais
// pas de blocage — le verdict, lui, est déjà calculé.
function syntheseDeSecours(vue) {
  const ville = vue.marche.commune || vue.bien.adresse?.ville || 'localisation inconnue';
  const phrases = vue.motifs.slice(0, 2);
  return {
    titre: `${vue.bien.type_actif || 'Actif commercial'} — ${ville}`,
    synthese: phrases.join(' '),
    points_forts: [],
    points_vigilance: vue.reserves,
  };
}

// ---------------------------------------------------------------------------
// Mail de relance agent
// ---------------------------------------------------------------------------

const SCHEMA_MAIL = {
  type: 'object',
  properties: {
    objet: { type: 'string' },
    corps: { type: 'string', description: 'Texte brut, sans markdown, signature comprise.' },
  },
  required: ['objet', 'corps'],
};

/**
 * Rédige le mail demandant à l'agent les informations manquantes.
 * N'est produit que lorsque le dossier est INSUFFISANT.
 */
export async function redigerMailAgent(dossierLot, { signature } = {}) {
  const vue = vueRedacteur(dossierLot);
  const manquantes = vue.informations_manquantes;
  if (!manquantes.length) return null;

  const reference = vue.bien.adresse?.rue
    ? `${vue.bien.adresse.rue}${vue.bien.adresse.ville ? `, ${vue.bien.adresse.ville}` : ''}`
    : vue.marche.commune || 'le bien présenté';

  if (!llmEnabled) {
    return {
      objet: `Demande de compléments – ${reference}`,
      corps: `Bonjour,\n\nMerci pour votre envoi concernant ${reference}.\n\nAfin de pouvoir présenter ce dossier à nos clients, il nous manque les éléments suivants :\n${manquantes
        .map((m) => `- ${m}`)
        .join('\n')}\n\nPour rappel, nous travaillons avec des mandats de recherche : vos honoraires resteront inchangés.\n\nBien à vous,\n${signature || 'Klocka'}`,
      ia: false,
    };
  }

  try {
    const r = await invokeLLM({
      prompt: `Tu rédiges un mail court d'un analyste de Klocka (investissement en murs commerciaux) à l'agent immobilier qui vient de transmettre une fiche incomplète.

Objectif : obtenir les informations manquantes, sans juger le bien ni annoncer de décision.

RÈGLES :
1. N'utilise que le JSON ci-dessous. N'invente aucune caractéristique du bien.
2. Demande exactement les éléments listés dans "informations_manquantes", ni plus ni moins.
3. Ne mentionne ni verdict, ni rendement, ni analyse : l'agent n'a pas à connaître notre grille.
4. Rappelle brièvement que nous travaillons avec des mandats de recherche et que les honoraires de l'agent restent inchangés.
5. Français, vouvoiement, ton courtois et direct. Texte brut, pas de markdown. Termine par la signature fournie.

Signature à utiliser : ${signature || 'Klocka'}

--- DOSSIER ---
${JSON.stringify({ bien: vue.bien, informations_manquantes: manquantes }, null, 2)}
--- FIN ---`,
      response_json_schema: SCHEMA_MAIL,
    });
    if (!r?.corps) return null;
    return { objet: r.objet || `Demande de compléments – ${reference}`, corps: r.corps, ia: true };
  } catch (e) {
    console.error('[preanalyse] mail agent impossible :', e?.message || e);
    return null;
  }
}
