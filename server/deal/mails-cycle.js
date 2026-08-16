// Mails d'intention du cycle de vie d'un deal.
//
// Généralisation de redigerMailAgent : chaque moment du cycle (refus, demande
// de documents, relance, abandon, présentation client) a son intention. Le
// rédacteur LLM ne voit toujours QUE vueRedacteur() — jamais le texte source —
// et ne révèle jamais le verdict ni la grille à l'agent. Sans clé LLM, un
// texte de secours complet est produit : le flux n'est jamais bloqué.

import { invokeLLM, llmEnabled } from '../llm.js';
import { vueRedacteur } from './redact.js';

const SCHEMA_MAIL = {
  type: 'object',
  properties: {
    objet: { type: 'string' },
    corps: { type: 'string', description: 'Texte brut, sans markdown, signature comprise.' },
  },
  required: ['objet', 'corps'],
};

export const INTENTIONS = [
  'refus',
  'demande_documents',
  'relance',
  'abandon',
  'presentation_client',
];

const DOCUMENTS_STANDARDS = [
  'le bail commercial en cours et ses avenants',
  "les trois derniers procès-verbaux d'assemblée générale",
  'le règlement de copropriété',
  'les dernières quittances de loyer',
  'les diagnostics (DPE, amiante, électricité…)',
  'la taxe foncière et le détail des charges de copropriété',
];

function referenceBien(vue) {
  return vue.bien.adresse?.rue
    ? `${vue.bien.adresse.rue}${vue.bien.adresse.ville ? `, ${vue.bien.adresse.ville}` : ''}`
    : vue.marche.commune || 'le bien présenté';
}

// Textes de secours (sans IA) — un par intention.
function mailDeSecours(intention, vue, { signature, raisons }) {
  const ref = referenceBien(vue);
  const sig = signature || 'Klocka';
  switch (intention) {
    case 'refus':
      return {
        objet: `Retour sur votre proposition – ${ref}`,
        corps: `Bonjour,\n\nMerci pour votre envoi concernant ${ref}.\n\nAprès étude, nous ne donnerons pas suite à cette opportunité pour le moment.\n\nNous restons en recherche active d'autres opportunités en murs commerciaux pour nos clients : n'hésitez pas à nous transmettre vos prochaines fiches.\n\nBien à vous,\n${sig}`,
      };
    case 'demande_documents':
      return {
        objet: `Suite de l'étude – documents du dossier ${ref}`,
        corps: `Bonjour,\n\nMerci pour votre envoi concernant ${ref}. Le dossier a retenu notre attention et nous souhaitons pousser l'étude.\n\nPourriez-vous nous transmettre les documents suivants :\n${DOCUMENTS_STANDARDS.map((d) => `- ${d}`).join('\n')}\n\nPour rappel, nous travaillons avec des mandats de recherche : vos honoraires resteront inchangés.\n\nBien à vous,\n${sig}`,
      };
    case 'relance':
      return {
        objet: `Relance – documents du dossier ${ref}`,
        corps: `Bonjour,\n\nSauf erreur de notre part, nous restons dans l'attente des documents du dossier ${ref} évoqués dans notre précédent échange.\n\nNos clients sont en capacité de se positionner rapidement : dès réception, nous finalisons l'étude.\n\nBien à vous,\n${sig}`,
      };
    case 'abandon':
      return {
        objet: `Retour sur le dossier ${ref}`,
        corps: `Bonjour,\n\nMerci pour les éléments transmis sur ${ref}.\n\nAprès étude approfondie, nous ne donnerons pas suite${raisons ? ` : ${raisons}` : '.'}\n\nNous restons en recherche active d'autres opportunités pour nos clients et serons ravis d'étudier vos prochains dossiers.\n\nBien à vous,\n${sig}`,
      };
    case 'presentation_client':
      return {
        objet: `Dossier ${ref} – présentation à notre client`,
        corps: `Bonjour,\n\nMerci pour les éléments transmis sur ${ref}. L'étude est concluante : nous allons présenter ce dossier à l'un de nos clients investisseurs.\n\nNous revenons vers vous très prochainement avec son retour et, le cas échéant, une proposition.\n\nBien à vous,\n${sig}`,
      };
    default:
      return null;
  }
}

// Consignes spécifiques par intention, ajoutées aux règles communes.
const CONSIGNES_INTENTION = {
  refus: `Objectif : décliner poliment l'opportunité SANS donner nos critères ni notre analyse.
- Ne mentionne ni verdict, ni rendement, ni grille d'analyse : l'agent n'a pas à connaître nos critères.
- Indique clairement que nous ne donnons pas suite pour le moment.
- Termine en rappelant que nous restons en recherche active d'autres opportunités en murs commerciaux et que l'agent est invité à envoyer ses prochaines fiches.`,
  demande_documents: `Objectif : annoncer que le dossier retient notre attention et demander les documents nécessaires pour pousser l'étude.
- Demande la liste de documents fournie dans le JSON ("documents_a_demander"), en liste à tirets.
- Ne mentionne ni verdict, ni rendement, ni analyse chiffrée.
- Rappelle brièvement que nous travaillons avec des mandats de recherche et que les honoraires de l'agent restent inchangés.`,
  relance: `Objectif : relancer courtoisement l'agent qui n'a pas envoyé les documents demandés précédemment.
- Reste bref (4-6 phrases), courtois mais direct.
- Rappelle que nos clients peuvent se positionner rapidement dès réception des documents.
- Ne mentionne ni verdict ni analyse.`,
  abandon: `Objectif : annoncer que nous abandonnons le dossier après étude approfondie des documents.
- Intègre les raisons fournies dans le JSON ("raisons_abandon") en les reformulant de façon professionnelle et factuelle, sans agressivité.
- Ne révèle ni notre grille d'analyse ni de chiffres internes ; reste au niveau des raisons données.
- Termine en rappelant que nous restons en recherche d'autres opportunités.`,
  presentation_client: `Objectif : annoncer que l'étude est concluante et que nous allons présenter le dossier à l'un de nos clients investisseurs.
- Ton positif mais sobre ; pas d'engagement ferme, pas de montant.
- Indique que nous reviendrons rapidement avec le retour du client.`,
};

/**
 * Rédige le mail correspondant à une intention du cycle de vie.
 * @param {object} dossierLot - { lot, enrichissement, evaluation }
 * @param {string} intention  - une valeur de INTENTIONS
 * @param {object} opts       - { signature, raisons }
 * @returns {Promise<{objet, corps, ia} | null>}
 */
export async function redigerMailIntention(dossierLot, intention, { signature, raisons } = {}) {
  if (!INTENTIONS.includes(intention)) return null;
  const vue = vueRedacteur(dossierLot);
  const secours = mailDeSecours(intention, vue, { signature, raisons });

  if (!llmEnabled) return { ...secours, ia: false };

  const donnees = {
    bien: vue.bien,
    reference: referenceBien(vue),
    ...(intention === 'demande_documents'
      ? {
          documents_a_demander: DOCUMENTS_STANDARDS,
          informations_manquantes: vue.informations_manquantes,
        }
      : {}),
    ...(intention === 'abandon' ? { raisons_abandon: raisons || 'non précisées' } : {}),
  };

  try {
    const r = await invokeLLM({
      prompt: `Tu rédiges un mail court d'un analyste de Klocka (investissement en murs commerciaux) à l'agent immobilier qui a transmis une fiche.

${CONSIGNES_INTENTION[intention]}

RÈGLES COMMUNES :
1. N'utilise que le JSON ci-dessous. N'invente aucune caractéristique du bien.
2. Français, vouvoiement, ton courtois et professionnel. Texte brut, pas de markdown.
3. Termine par la signature fournie.

Signature à utiliser : ${signature || 'Klocka'}

--- DOSSIER ---
${JSON.stringify(donnees, null, 2)}
--- FIN ---`,
      response_json_schema: SCHEMA_MAIL,
    });
    if (!r?.corps) return { ...secours, ia: false };
    return { objet: r.objet || secours.objet, corps: r.corps, ia: true };
  } catch (e) {
    console.error(`[preanalyse] mail ${intention} impossible :`, e?.message || e);
    return { ...secours, ia: false };
  }
}
