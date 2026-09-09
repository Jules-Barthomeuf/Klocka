// L'avis sur une réponse de l'IA : un pouce en haut, un pouce en bas.
//
// Chaque avis devient une remarque dans le Feedback, avec l'échange complet.
// Et surtout : le modèle rédige, à partir de cet échange, un prompt prêt à
// coller dans Claude Code — le contexte technique, ce qui cloche exactement,
// et ce qu'il faut corriger. C'est ce prompt qui fait le travail ensuite.

import { Records } from './db.js';
import { invokeLLM } from './llm.js';
import { mesurer } from './llm-couts.js';

const SURFACES = {
  dossier: "le chat d'un dossier (src/components/preanalyse/ChatDossier.jsx → POST /api/preanalyse/dossiers/:dealId/espace/chat → converser() dans server/deal/espace.js → chatDocuments() dans server/llm.js ; le prompt système se construit dans consigne() de espace.js, avec les consignes SANS_MARKDOWN et PROFONDEURS)",
  dashboard: "le chat du tableau de bord (src/components/dashboard/ChatDashboard.jsx → POST /api/assistant/boite → traiterBoite() dans server/assistant-boite.js, qui classe puis appelle commander() dans server/assistant-commande.js ; le prompt système est consigne() de assistant-commande.js)",
  assistant: "l'assistant flottant (src/components/AssistantFlottant.jsx → POST /api/assistant/commande → commander() dans server/assistant-commande.js)",
};

const SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: "Une phrase : ce qui va, ou ce qui ne va pas" },
    prompt: { type: 'string', description: 'Le prompt à coller dans Claude Code' },
  },
  required: ['resume', 'prompt'],
};

/**
 * Enregistre un avis et fait rédiger le prompt de correction.
 * @param {{pouce:'haut'|'bas', question:string, reponse:string, surface:string, deal_id?:string, precision?:string, user?:object}} avis
 */
export async function enregistrerAvis({ pouce, question, reponse, surface = 'dossier', deal_id = null, precision = '', user } = {}) {
  const bas = pouce === 'bas';
  const q = String(question || '').trim().slice(0, 6000);
  const r = String(reponse || '').trim().slice(0, 12000);
  if (!r) return { ok: false, error: 'Rien à juger : la réponse est vide.' };

  const ou = SURFACES[surface] || SURFACES.dossier;
  const consigne = bas
    ? `Tu écris un prompt pour Claude Code, l'assistant de développement qui travaille sur cette application (Klocka, plateforme d'investissement en murs commerciaux ; React 18 + Vite côté client, Express + better-sqlite3 côté serveur ; tout est en français).

Un membre de l'équipe vient de juger MAUVAISE une réponse de l'IA dans ${ou}.

Analyse l'échange, puis rédige un prompt qui permette de corriger la cause, pas le symptôme. Le prompt doit :
- décrire le problème en une ou deux phrases, précisément (réponse trop longue, hors sujet, invente une donnée, ignore une pièce, mauvais format, ton inadapté, oublie de citer la source…) ;
- citer l'échange (la question posée, puis l'extrait fautif de la réponse, tronqué s'il est long) ;
- dire où regarder dans le code, avec les fichiers et fonctions ci-dessus ;
- proposer une piste de correction concrète (consigne à changer, réglage de profondeur, donnée à passer au modèle, garde-fou à ajouter) sans imposer une solution si plusieurs sont possibles ;
- se terminer par ce qu'il faudrait vérifier une fois corrigé.
Écris-le à la deuxième personne, comme une demande adressée à Claude Code. En français correctement accentué (é, è, à, ç, ù : jamais de texte sans accents), texte brut, sans markdown. Ne dis pas « l'utilisateur a mis un pouce en bas », décris le défaut.`
    : `Tu écris une note pour Claude Code, l'assistant de développement qui travaille sur cette application (Klocka, plateforme d'investissement en murs commerciaux ; React 18 + Vite, Express + better-sqlite3 ; tout est en français).

Un membre de l'équipe vient de juger BONNE une réponse de l'IA dans ${ou}.

Rédige un prompt qui serve de garde-fou : ce qui a été bien fait ici (longueur, ton, structure, citation des pièces…), et la consigne à ne pas casser en modifiant ${ou}. Cite l'échange en exemple. En français correctement accentué (é, è, à, ç, ù : jamais de texte sans accents), texte brut, sans markdown, à la deuxième personne.`;

  const prompt = `${consigne}

--- ÉCHANGE ---
Question de l'utilisateur :
${q || '(question non transmise)'}

Réponse de l'IA :
${r}
${precision ? `\n--- CE QUE L'UTILISATEUR REPROCHE ---\n${String(precision).trim().slice(0, 2000)}` : ''}`;

  let resultat = null;
  try {
    const { resultat: rr } = await mesurer(
      { operation: 'avis sur une réponse', par: user?.email || null, sur: deal_id },
      () => invokeLLM({ prompt, response_json_schema: SCHEMA })
    );
    resultat = rr;
  } catch (e) {
    resultat = null;
  }

  const resume = resultat?.resume || (bas ? 'Réponse jugée mauvaise dans le chat.' : 'Réponse jugée bonne dans le chat.');
  const promptCorrection = resultat?.prompt || `${bas ? "Corrige ce que l'IA a mal fait" : "Garde ce comportement"} dans ${ou}.\n\nQuestion : ${q}\n\nRéponse : ${r}${precision ? `\n\nReproche : ${precision}` : ''}`;

  const remarque = Records.create('Suggestion', {
    contenu: `${bas ? '👎' : '👍'} ${resume}${precision ? `\n\nCe qui est reproché : ${precision}` : ''}`,
    statut: 'nouveau',
    // Une réponse fautive passe devant ; un bon point est une note, pas une tâche.
    urgence: bas ? 4 : 1,
    source: 'chat',
    pouce: bas ? 'bas' : 'haut',
    surface,
    deal_id,
    echange: { question: q, reponse: r },
    prompt_correction: promptCorrection,
    client_email: user?.email || null,
    client_name: user?.full_name || user?.email || null,
  });

  return { ok: true, remarque, prompt: promptCorrection, resume };
}
