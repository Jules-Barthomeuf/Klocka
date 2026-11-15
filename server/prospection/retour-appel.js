// Le retour d'AK sur un appel (15 nov. 2026, Jules : « à la fin, dans les actions proposées, le chat demande : voulez-vous
// mon analyse de ce que vous pouvez améliorer ? On met oui, et il dit : vous avez dit 4 fois "en fait", l'agent doutait
// de votre rémunération, dites-le comme ça »). À la demande seulement : rien ne part tout seul. Le retour se garde avec
// l'appel (`retour_ak`) : la personne le relit, Jules le voit dans Suivi > Appels.
//
// La grille vient de l'analyse des premiers appels réels de Maxime (15 nov. 2026) : l'ouverture posée à l'accueil, la
// rémunération dite en négatif (« pas de partage d'honoraires »), un appel non préparé, une suite qui ne tient qu'à un
// rappel promis. Les tics sont repérés ici (un modèle compte mal) ; le modèle dit lesquels sont de l'appelant.

import { Records } from '../db.js';

const APPEL = 'AppelAgent';

// Les tics de langage qu'on relève, et leur forme écrite dans les transcriptions.
export const TICS = [
  ['en fait', /\ben fait\b/gi],
  ['du coup', /\bdu coup\b/gi],
  ['un peu', /\bun peu\b/gi],
  ['potentiellement', /\bpotentiellement\b/gi],
  ['je dirais', /\bje dirais\b/gi],
  ['voilà', /\bvoil[aà]\b/gi],
  ['ouais', /\bouais\b/gi],
  ['genre', /\bgenre\b/gi],
  ['quoi', /\bquoi\s*[,.!?]/gi],
  ['tu vois', /\btu vois\b/gi],
];

/** Pure : chaque tic relevé dans la transcription, avec le bout de phrase autour (pour savoir qui l'a dit). */
export function ticsDe(transcription) {
  const t = String(transcription || '');
  const out = [];
  for (const [mot, re] of TICS) {
    const extraits = [];
    for (const m of t.matchAll(new RegExp(re.source, re.flags))) {
      const debut = Math.max(0, m.index - 70);
      extraits.push(t.slice(debut, m.index + m[0].length + 50).replace(/\s+/g, ' ').trim());
    }
    if (extraits.length) out.push({ mot, n: extraits.length, extraits: extraits.slice(0, 8) });
  }
  return out.sort((a, b) => b.n - a.n);
}

const SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string', description: "Le retour tel qu'il s'affiche dans le chat, en vouvoyant. Une phrase d'ouverture, puis 2 à 4 points numérotés ; chaque point : ce qui a été dit (citation exacte entre « »), pourquoi ça gêne en une phrase, puis la phrase exacte à dire à la place entre « ». Puis, s'il y en a, une ligne sur les tics de l'appelant avec leur nombre. Si l'appel est bon, dites-le et donnez un seul point à travailler. Pas de tiret cadratin, pas d'emoji, pas de titre." },
    points: {
      type: 'array',
      items: { type: 'object', properties: { theme: { type: 'string' }, cite: { type: 'string' }, pourquoi: { type: 'string' }, a_dire: { type: 'string' } }, required: ['theme', 'pourquoi', 'a_dire'] },
      description: 'Les mêmes points, séparés, pour le Suivi.',
    },
    tics: { type: 'array', items: { type: 'object', properties: { mot: { type: 'string' }, n: { type: 'integer' } }, required: ['mot', 'n'] }, description: "Les tics dits par l'APPELANT seulement (pas par l'agent), avec leur nombre, d'après les extraits fournis." },
    bien: { type: 'string', description: "Ce qui a bien marché, en une phrase courte, ou vide." },
  },
  required: ['message', 'points', 'tics'],
};

/** Pure : le prompt du retour. */
export function construirePrompt({ appel, agence = null, par = '', tics = [], recherches = [], ville = null }) {
  const transcription = String(appel.transcription_gardee || appel.transcription || '').slice(0, 12000);
  const notes = String(appel.notes || '').slice(0, 1500);
  return `Tu es le coach des appels de prospection de Klocka. Tu fais un retour franc, précis et bienveillant à ${par || "l'analyste"} qui vient de raccrocher.

CE QUE FAIT KLOCKA (pour juger le discours) :
- Klocka accompagne des investisseurs qui achètent des murs commerciaux loués (boutiques de pied d'immeuble, entrepôts, retail parks). On appelle des agents immobiliers qu'on ne connaît pas encore, dans les grandes villes, pour créer une relation et recevoir leurs biens, si possible avant leur mise en ligne.
- L'appel parfait : l'agent comprend vite ce qu'on fait, voit l'intérêt (un acheteur déjà financé, accompagné de bout en bout), dit qu'il a des murs loués et promet d'envoyer des fiches commerciales.
- La rémunération : c'est l'investisseur qui paie Klocka, via un mandat de recherche signé avec lui. L'agent garde 100 % de ses honoraires. Rien n'est demandé à l'agent.

LA GRILLE (ne retiens que ce qui compte vraiment dans CET appel, 2 à 4 points, le plus important d'abord) :
1. La bonne personne : si l'accueil, un standard ou un service client répond, a-t-il demandé tout de suite qui s'occupe des murs commerciaux, son nom et sa ligne directe ou son mail, avant de dérouler ses critères ?
2. L'ouverture : une question fermée (« avez-vous en vente… ? ») posée à quelqu'un qui ne peut pas répondre fait perdre l'appel. Mieux : se présenter en une phrase, demander la personne en charge du commerce, puis un pitch court et concret.
3. La rémunération : « il n'y a pas de partage d'honoraires » est ambigu (l'agent comprend « vous travaillez gratuitement ? » ou « vous ne me payez pas »). La dire en positif et une seule fois : « Vous gardez 100 % de vos honoraires : c'est notre client investisseur qui nous rémunère, via un mandat de recherche. » Si l'agent a douté (« vous travaillez gratuitement ? », « et vous, comment êtes-vous payé ? »), c'est le point principal. Les mots qui embrouillent : « on charge notre client », « il paye vos honoraires ».
4. La préparation : c'est souvent l'AGENT qui demande « vous avez vu nos annonces ? » ; si l'appelant répond non, le dire et proposer de repérer un local avant l'appel (« J'ai vu votre boutique rue X, elle est louée ? »).
5. Le concret : citer une recherche client précise (ville, budget, rendement) vaut mieux qu'un discours général. Pour l'exemple, prends une des RECHERCHES CLIENTS RÉELLES ci-dessous ; s'il n'y en a pas, reprends les critères que l'appelant a dits pendant l'appel.
6. La suite : repartir avec un nom, une ligne directe ou un mail, et une prochaine étape datée. « On vous rappellera » sans rien d'autre est faible.
7. Les objections : a-t-il répondu court et calmement, ou par un long argumentaire ?
8. Les tics : seulement ceux de l'appelant, s'ils sont nombreux (3 fois ou plus).

RÈGLES :
- Cite les phrases exactes de la transcription. N'invente rien : si la transcription est trop courte ou ratée, dis-le simplement.
- La transcription vient d'une reconnaissance vocale : « l'appareil » veut dire « à l'appareil », « partage d'horaire » veut dire « partage d'honoraires ». Ne reproche pas une erreur de reconnaissance.
- La transcription ne sépare pas les voix : déduis qui parle du sens. L'appelant est ${par || "l'analyste"}, de Klocka.
- Chaque point donne la phrase exacte à dire à la place, prête à l'emploi : jamais de crochets ni de trous à remplir, jamais de chiffre, de ville ou de client inventé.
- Ne commente pas les notes de l'analyste ni son humeur.
- Ton : direct, comme un bon manager, jamais humiliant. Vouvoiement.

L'APPEL :
Agence : ${agence || appel.agence || 'inconnue'}
Issue : ${appel.issue_tapee || appel.issue || 'inconnue'}
Durée : ${appel.duree_s ? `${Math.round(appel.duree_s)} s` : 'inconnue'}
Notes de l'analyste (ce qu'il a tapé, pour le contexte) : ${notes || 'aucune'}

RECHERCHES CLIENTS RÉELLES${ville ? ` (autour de ${ville})` : ''} :
${recherches.length ? recherches.slice(0, 6).map((r) => `- ${r}`).join('\n') : 'aucune connue'}

TICS RELEVÉS (sur toute la transcription, les deux voix mêlées ; garde seulement ceux de l'appelant) :
${tics.length ? tics.map((t) => `- « ${t.mot} » : ${t.n} fois. Extraits : ${t.extraits.map((e) => `« ${e} »`).join(' / ')}`).join('\n') : 'aucun'}

TRANSCRIPTION :
${transcription || '(aucune)'}`;
}

/** Pure : la ligne des tics, ajoutée au message quand le modèle l'a oubliée (le comptage vient du code, pas de lui). */
export function avecTics(message, tics) {
  if (!tics.length || tics.some((t) => message.includes(`« ${t.mot} »`))) return message;
  return `${message}\n\nVos tics : ${tics.map((t) => `« ${t.mot} » ${t.n} fois`).join(', ')}. Retirez-les : le message gagne en assurance.`;
}

/**
 * Le retour sur un appel : gardé avec lui, refait seulement si on le demande (`refaire`).
 * `lire` : un faux modèle pour les tests.
 */
export async function retourSurAppel({ appel_id, user, refaire = false, lire = null }) {
  const appel = Records.get(APPEL, appel_id);
  if (!appel) return { ok: false, error: 'Appel introuvable.' };
  if (appel.retour_ak?.message && !refaire) return { ok: true, retour: appel.retour_ak, deja: true };
  const transcription = String(appel.transcription_gardee || appel.transcription || '').trim();
  if (transcription.length < 80) return { ok: true, retour: { message: "Je n'ai pas assez de transcription pour juger cet appel : il était trop court, ou il n'a pas été enregistré.", points: [], tics: [], vide: true } };
  const ag = appel.agence_id ? Records.get('AgenceProspect', appel.agence_id) : null;
  const par = user?.full_name ? String(user.full_name).split(' ')[0] : String(appel.par || user?.email || '').split('@')[0].split('.')[0];
  // Les recherches clients de la ville (les mêmes que l'accroche du Mode appel) : l'exemple concret du retour est vrai.
  const ville = (ag?.liste_id && Records.get('ListeAgences', ag.liste_id)?.ville) || ag?.ville || null;
  let recherches = [];
  if (ville) {
    try { const MA = await import('./mode-appel.js'); recherches = MA.recherchesDeLaZone(Records.list('DemandeClient'), ville, { departement: MA.departementDe([ag]) }); } catch { /* sans recherches, les critères dits pendant l'appel */ }
  }
  const prompt = construirePrompt({ appel, agence: ag?.nom || null, par: par ? par.charAt(0).toUpperCase() + par.slice(1) : '', tics: ticsDe(transcription), recherches, ville });
  let brut;
  if (lire) brut = await lire(prompt);
  else {
    const { invokeLLM } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    brut = (await mesurer({ operation: 'retour appel', sur: appel_id }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'medium', max_tokens: 3000 }))).resultat;
  }
  const message = String(brut?.message || '').replace(/\s*—\s*/g, ', ').trim();
  if (!message) return { ok: false, error: "L'analyse n'a pas abouti. Réessayez dans un instant." };
  const tics = (Array.isArray(brut.tics) ? brut.tics : []).filter((t) => t?.mot && Number(t.n) >= 3).slice(0, 6).map((t) => ({ mot: String(t.mot).slice(0, 30), n: Math.round(Number(t.n)) }));
  const retour = {
    message: avecTics(message, tics).slice(0, 4000),
    points: (Array.isArray(brut.points) ? brut.points : []).slice(0, 5).map((p) => ({ theme: String(p.theme || '').slice(0, 80), cite: String(p.cite || '').slice(0, 400), pourquoi: String(p.pourquoi || '').slice(0, 400), a_dire: String(p.a_dire || '').slice(0, 600) })),
    tics,
    bien: String(brut.bien || '').slice(0, 300) || null,
    le: new Date().toISOString(),
    demande_par: user?.email || null,
  };
  Records.update(APPEL, appel_id, { retour_ak: retour });
  return { ok: true, retour };
}
