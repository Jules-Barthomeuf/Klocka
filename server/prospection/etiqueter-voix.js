// Qui parle, lu au sens (16 nov. 2026, Jules : « la transcription s'affiche normale, sans étiqueter les voix, puis toutes les
// trois secondes ça les étiquette ; on entend la transcription, ça process, et ça étiquette ensuite »). Un seul micro capte
// les deux voix : le volume ne suffit pas. Un modèle rapide relit la conversation et dit, phrase par phrase, si c'est
// l'analyste de Klocka (« vous ») ou l'agent immobilier appelé (« autre ») : l'analyste se présente, explique la recherche
// de ses investisseurs, épelle son nom et son mail ; l'agent répond, demande la ville, le nom, le numéro, le mail.

const MODELE_RAPIDE = 'claude-haiku-4-5';

/** Pure : la consigne, avec les phrases numérotées et celles déjà étiquetées pour le contexte. */
export function consigneEtiquettes(lignes, { analyste = null, interlocuteur = null } = {}) {
  const qui = (q) => (q === 'vous' ? 'ANALYSTE' : q === 'autre' ? 'AGENT' : '?');
  return [
    `Transcription d'un appel téléphonique de prospection, sans les noms : un seul micro a capté les deux voix.`,
    `- L'ANALYSTE${analyste ? ` (${analyste})` : ''} travaille chez Klocka (souvent mal transcrit : Clo-Cal, Cloca, Clocka) : il se présente, explique qu'il cherche des murs commerciaux loués pour des investisseurs, épelle son nom, son numéro et son mail quand on les lui demande.`,
    `- L'AGENT immobilier appelé${interlocuteur ? ` (${interlocuteur})` : ''} : il répond, dit ce qu'il a ou n'a pas, demande la ville, le nom, le numéro, le mail, propose de laisser un message.`,
    `Toute phrase qui dit ou épelle Klocka, le nom de l'analyste, son numéro ou son mail (« P-A-M-A », « K-L-O-C-K-A », « arrobase », « point immo ») est de l'ANALYSTE.`,
    `Une réponse courte (« Oui », « D'accord ») est de celui qui ne parlait pas juste avant, sauf si elle continue sa phrase.`,
    `Pour chaque phrase marquée ?, écris son numéro suivi de A (ANALYSTE) ou G (AGENT), séparés par des espaces, par exemple « 4A 5G 6G ». Les phrases déjà marquées servent de contexte.`,
    '',
    ...lignes.map((l, i) => `${i + 1}. [${qui(l.qui)}] ${l.texte}`),
  ].join('\n');
}

/**
 * Pure : les étiquettes rendues par le modèle, rangées par clé de phrase. La réponse est courte, « 4A 5G 6G » (le numéro
 * de la phrase, A pour l'analyste, G pour l'agent) : elle revient vite, même quand toute la conversation est relue, et
 * le numéro garde chaque lettre sur sa phrase.
 */
export function lireEtiquettes(reponse, lignes) {
  const out = {};
  for (const [, n, c] of String(reponse?.lettres || '').toUpperCase().matchAll(/(\d+)\s*([AG])/g)) {
    const l = lignes[Number(n) - 1];
    if (l && !l.qui) out[l.cle] = c === 'A' ? 'vous' : 'autre';
  }
  return out;
}

/**
 * Les étiquettes des phrases sans nom. `lignes` : [{ cle, texte, qui }] dans l'ordre, `qui` déjà connu ou null.
 * Rend { etiquettes: { cle: 'vous' | 'autre' } }.
 */
export async function etiqueterVoix(lignes, { analyste = null, interlocuteur = null } = {}) {
  const liste = (lignes || []).filter((l) => l?.cle && String(l.texte || '').trim()).slice(-60)
    .map((l) => ({ cle: String(l.cle), texte: String(l.texte).slice(0, 400), qui: l.qui === 'vous' || l.qui === 'autre' ? l.qui : null }));
  if (!liste.some((l) => !l.qui)) return { etiquettes: {} };
  const { invokeLLM } = await import('../llm.js');
  const r = await invokeLLM({
    prompt: consigneEtiquettes(liste, { analyste, interlocuteur }),
    response_json_schema: { type: 'object', properties: { lettres: { type: 'string' } }, required: ['lettres'] },
    modele: MODELE_RAPIDE,
    max_tokens: 600,
  });
  return { etiquettes: lireEtiquettes(r, liste) };
}
