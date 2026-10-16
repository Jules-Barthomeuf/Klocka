// La présentation vue du client (16 oct. 2026, Jules : « le client voit
// exactement ce qu'on voit nous : l'éditeur à gauche et le design à droite »).
//
// Le chat du client : AK, mais enfermé dans SA présentation. Il lit la
// présentation (presentationPourAK) et rend des changements de diapositives
// (appliquerChangements), rien d'autre : ni outil, ni base, ni autre client.
// Ce que le client pouvait déjà faire à la main dans l'éditeur, il peut le
// demander. Une demande hors de la présentation reçoit une réponse polie.
//
// La note du design : de une à cinq étoiles, une par client et par
// présentation, rangée dans le Feedback (Suggestion) pour l'équipe.

import { Records } from './db.js';

const SCHEMA = {
  type: 'object',
  properties: {
    reponse: { type: 'string', description: "ce que tu dis au client, en français, deux ou trois phrases, vouvoiement : ce que tu as changé, ou pourquoi tu ne peux pas" },
    changements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          diapo: { type: 'string', description: "l'id de la diapositive, tel que la présentation le montre" },
          chemin: { type: 'string', description: 'le chemin pointé du champ, tel que la présentation le montre' },
          valeur: { description: 'la nouvelle valeur : texte, nombre, booléen ou null' },
        },
        required: ['diapo', 'chemin'],
      },
    },
  },
  required: ['reponse'],
};

/** Pure : l'historique du chat, borné (dix échanges, 600 caractères chacun). */
export function historiqueCourt(historique = []) {
  return (Array.isArray(historique) ? historique : []).slice(-10)
    .map((m) => ({ role: m?.role === 'assistant' ? 'AK' : 'Client', texte: String(m?.texte || '').slice(0, 600) }))
    .filter((m) => m.texte.trim());
}

/** Le client demande ; AK retouche sa présentation et le dit. */
export async function discuter(id, user, { texte, historique = [] }, { invoke = null } = {}) {
  const P = await import('./presentation-bancaire.js');
  if (!P.lirePourClient(id, user)) return { ok: false, error: 'Présentation introuvable.' };
  const demande = String(texte || '').trim().slice(0, 2000);
  if (!demande) return { ok: false, error: 'Message vide.' };
  const presentation = P.presentationPourAK(id, { ouverte: true });
  const passe = historiqueCourt(historique).map((m) => `${m.role} : ${m.texte}`).join('\n');
  const prompt = `Tu es l'assistant de Klocka (investissement en murs commerciaux). Pour le client, tu t'appelles « l'assistant » : ne te nomme jamais AK. Tu aides un client à retoucher SA présentation bancaire, celle-ci et aucune autre.
Tu peux seulement changer les champs des diapositives tels qu'ils sont montrés ci-dessous (par l'id de la diapositive et le chemin du champ) : textes, intitulés, chiffres qu'il te donne.
Tu n'inventes aucun chiffre : un chiffre change seulement si le client le donne. Tu ne parles d'aucun autre client, d'aucun autre bien, d'aucune donnée interne.
Une demande hors de la présentation : dis-le poliment, sans rien changer, et propose de poser la question à l'équipe avec « Une question ».
Ne mentionne jamais un écart, une note interne, une source interne ni le nom d'un outil de l'équipe.
Réponds au client en français, en le vouvoyant.

--- LA PRÉSENTATION ---
${String(presentation || '').slice(0, 24000)}
--- FIN ---
${passe ? `\nL'échange jusqu'ici :\n${passe}\n` : ''}
Le client : ${demande}`;
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const appeler = invoke || ((o) => invokeLLM(o));
  const { resultat } = await mesurer({ operation: 'chat client présentation', par: user?.email || null }, () => appeler({ prompt, response_json_schema: SCHEMA }));
  const lu = resultat || {};
  const changements = (Array.isArray(lu.changements) ? lu.changements : []).filter((c) => c && c.diapo && c.chemin).slice(0, 30);
  let appliques = 0;
  if (changements.length) {
    const r = P.appliquerChangements(id, changements);
    if (!r.ok) return { ok: true, reponse: `Je n'ai pas pu appliquer ce changement : ${r.error || 'erreur'}.`, changes: 0 };
    appliques = changements.length;
  }
  return { ok: true, reponse: String(lu.reponse || (appliques ? 'C\'est fait.' : 'Je n\'ai rien changé.')).slice(0, 1500), changes: appliques };
}

/** La note du design (1 à 5), une par client et par présentation, dans le Feedback. */
export async function noter(id, user, note) {
  const P = await import('./presentation-bancaire.js');
  const d = P.lirePourClient(id, user);
  if (!d) return { ok: false, error: 'Présentation introuvable.' };
  const n = Math.round(Number(note));
  if (!(n >= 1 && n <= 5)) return { ok: false, error: 'La note va de 1 à 5.' };
  const email = String(user?.email || '').toLowerCase();
  const titre = d.presentation?.titre || d.titre || 'la présentation';
  const champs = {
    contenu: `Note du design de la présentation « ${titre} » : ${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n}/5)`,
    note_design: n, type: 'note_design', presentation_id: id, page: `/MesPresentations?presentation=${id}`,
    client_email: email, client_name: user?.full_name || null, urgence: 1,
  };
  const deja = Records.list('Suggestion').find((s) => s.type === 'note_design' && s.presentation_id === id && String(s.client_email || '').toLowerCase() === email);
  const s = deja ? Records.update('Suggestion', deja.id, { ...champs, maj_le: new Date().toISOString() }) : Records.create('Suggestion', { ...champs, statut: 'nouveau' }, email);
  return { ok: true, note: n, suggestion_id: s.id };
}

/** La note déjà donnée par ce client à cette présentation, ou null. */
export function maNote(id, user) {
  const email = String(user?.email || '').toLowerCase();
  return Records.list('Suggestion').find((s) => s.type === 'note_design' && s.presentation_id === id && String(s.client_email || '').toLowerCase() === email)?.note_design || null;
}

// --- Les conversations du client, pour l'historique du chat (le même composant que l'équipe) ---

const CONV = 'ConversationClient';
const proprio = (user) => String(user?.email || '').toLowerCase();

export function conversations(user) {
  return Records.list(CONV).filter((c) => c.par === proprio(user))
    .sort((a, b) => String(b.maj_le || '').localeCompare(String(a.maj_le || '')))
    .map((c) => ({ id: c.id, titre: c.titre, maj_le: c.maj_le, presentation_id: c.presentation_id || null, messages: (c.messages || []).length }));
}

export function conversation(id, user) {
  const c = Records.get(CONV, id);
  return c && c.par === proprio(user) ? c : null;
}

/** Garde le fil : un client ne lit et n'écrit que ses conversations. */
export function garderConversation(user, { id = null, messages = [], presentation_id = null }) {
  const fil = (Array.isArray(messages) ? messages : []).slice(-80);
  const premier = fil.find((m) => m?.role === 'user');
  const titre = String(premier?.contenu || premier?.texte || 'Conversation').replace(/\s+/g, ' ').slice(0, 70);
  const deja = id ? conversation(id, user) : null;
  if (deja) return Records.update(CONV, deja.id, { messages: fil, maj_le: new Date().toISOString(), titre: deja.titre_choisi ? deja.titre : titre });
  return Records.create(CONV, { par: proprio(user), messages: fil, titre, presentation_id, maj_le: new Date().toISOString() });
}

export function renommer(id, user, titre) {
  const c = conversation(id, user);
  if (!c) return null;
  return Records.update(CONV, c.id, { titre: String(titre || '').slice(0, 80) || c.titre, titre_choisi: true });
}

export function supprimer(id, user) {
  const c = conversation(id, user);
  if (!c) return false;
  Records.delete(CONV, c.id);
  return true;
}
