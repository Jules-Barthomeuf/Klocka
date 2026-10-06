// AK dans l'éditeur d'emails : des propositions, jamais des envois. Réécrire,
// raccourcir, changer le ton ou traduire un texte ; trois variantes d'objet ;
// relire un email avant l'envoi. Ce qu'il rend s'applique dans l'éditeur, où
// l'on peut encore le modifier.

import { invokeLLM } from '../llm.js';
import { versTexte } from '../../src/lib/email-design.js';

const STYLE = `Klocka accompagne des particuliers qui investissent dans des murs commerciaux (un local loué à un commerce). Style des emails : vouvoiement, phrases courtes, concret, chaleureux sans emphase ; jamais de tiret cadratin, jamais d'emoji, pas de jargon creux (« n'hésitez pas », « solution innovante »). Garde tels quels les **gras** et les variables entre doubles accolades ({{prenom | "…"}}).`;

const ACTIONS = {
  reecrire: 'Réécris ce texte : plus clair, plus vivant, même sens, même longueur à peu près.',
  raccourcir: 'Raccourcis ce texte d\'environ moitié sans rien perdre d\'essentiel.',
  ton: 'Réécris ce texte avec ce ton : ',
  traduire: 'Traduis ce texte en ',
  libre: 'Fais ceci sur le texte : ',
};

async function mesure(operation, par, fn) {
  try {
    const { mesurer } = await import('../llm-couts.js');
    return (await mesurer({ operation, par }, fn)).resultat;
  } catch {
    return fn();
  }
}

/** Une proposition de texte pour un bloc ou une sélection. */
export async function retoucher({ texte, action = 'reecrire', precision = '' }, user = null) {
  const t = String(texte || '').trim();
  if (!t) return { ok: false, error: 'Rien à retoucher.' };
  const consigne = ACTIONS[action] || ACTIONS.reecrire;
  const demande = `${STYLE}\n\n${consigne}${['ton', 'traduire', 'libre'].includes(action) ? (precision || (action === 'traduire' ? 'anglais' : 'plus direct')) : ''}\n\nTexte :\n${t}\n\nRends seulement le texte proposé.`;
  const r = await mesure('emailing : retouche', user?.email, () => invokeLLM({ prompt: demande, response_json_schema: { type: 'object', properties: { texte: { type: 'string' } }, required: ['texte'] } }));
  const propose = String(r?.texte || '').trim();
  return propose ? { ok: true, texte: propose } : { ok: false, error: 'AK n\'a rien proposé.' };
}

/** Trois variantes d'objet, d'après le contenu de l'email. */
export async function objets({ objet = '', design }, user = null) {
  const corps = versTexte(design, {}).slice(0, 3000);
  const demande = `${STYLE}\n\nPropose trois objets d'email différents (angle, longueur), courts (40 à 60 caractères), précis, sans majuscules criardes ni fausse urgence, pour cet email.${objet ? ` L'objet actuel est : « ${objet} ».` : ''}\n\nEmail :\n${corps}`;
  const r = await mesure('emailing : objets', user?.email, () => invokeLLM({ prompt: demande, response_json_schema: { type: 'object', properties: { objets: { type: 'array', items: { type: 'string' } } }, required: ['objets'] } }));
  const liste = (r?.objets || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
  return liste.length ? { ok: true, objets: liste } : { ok: false, error: 'AK n\'a rien proposé.' };
}

/** La relecture avant envoi : fautes, lien manquant, ton, longueur. */
export async function relire({ objet = '', apercu = '', design }, user = null) {
  const corps = versTexte(design, {}).slice(0, 4000);
  const liens = (design?.blocs || []).filter((b) => b.type === 'bouton').map((b) => `${b.texte} -> ${b.lien || '(aucun lien)'}`);
  const demande = `${STYLE}\n\nRelis cet email avant son envoi à des prospects. Signale seulement ce qui mérite d'être corrigé : fautes d'orthographe ou de grammaire, bouton sans lien ou lien suspect, promesse ou chiffre douteux, ton qui ne colle pas au style, longueur, objet faible. Pour chaque point : le passage, le problème, la correction proposée. Aucun point si tout va bien.\n\nObjet : ${objet}\nAperçu : ${apercu}\nBoutons : ${liens.join(' ; ') || 'aucun'}\n\nEmail :\n${corps}`;
  const r = await mesure('emailing : relecture', user?.email, () => invokeLLM({ prompt: demande, response_json_schema: { type: 'object', properties: { points: { type: 'array', items: { type: 'object', properties: { passage: { type: 'string' }, probleme: { type: 'string' }, correction: { type: 'string' } }, required: ['probleme'] } } }, required: ['points'] } }));
  return { ok: true, points: (r?.points || []).slice(0, 12) };
}
