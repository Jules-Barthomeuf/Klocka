// Les appels sur la fiche de l'agent (27 nov. 2026, Jules : « une fois, on met tout à jour avec les appels : l'historique,
// le résumé ; et ensuite, à chaque fois qu'on passe un appel, ça met la fiche à jour »).
//
// Deux temps, le même chemin que les notes (ranger.js) :
//   - le rattrapage, une fois : pour chaque agent appelé, une seule lecture de tous ses appels qui ont eu une conversation,
//     du plus ancien au plus récent, les agents appelés le plus récemment d'abord. Le modèle relit la fiche (ce qu'on en
//     savait, ce que Jules y a écrit) et rend le nouveau résumé, le profil, les décisions ; les biens que les appels
//     citent reçoivent leurs lignes ;
//   - après chaque appel validé du mode appel : la ligne de l'appel tout de suite, puis la lecture de cet appel seul.
// La ligne d'historique de chaque appel vient de historiqueDesAppels (sans IA) ; la lecture ne la refait pas. Chaque
// appel n'est lu qu'une fois (ImportSource `appel:<id>`, la même clé que l'ancien import des appels). Rien n'est effacé ni
// réécrit sur la fiche, hormis le résumé, que le modèle refait à partir de l'ancien.

import { Records } from '../db.js';
import { dejaImporte, historiqueDesAppels, importerTexte, lancerLot } from './import.js';
import { historiqueDesEnvois } from './fiches-envoyees.js';
import { fiche } from './modele.js';
import { ISSUES } from '../prospection/regles.js';

const SANS_CONTACT = new Set(['pas_de_reponse', 'repondeur', 'invalide']);
const APPEL_VIDE = /n'a rien dit|n'appara[iî]t pas dans|d[ée]monstration de l'outil|entre coll[èe]gues|que des consignes internes/i;
const propre = (t, n = 4000) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const prenom = (e) => String(e || '').split('@')[0].split('.')[0].replace(/^./, (x) => x.toUpperCase()) || null;
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/** Pure : un appel où l'on a parlé (ni répondeur, ni essai, ni enregistrement vide), qui a de quoi être lu. */
export function appelParle(a) {
  if (!a?.agent_id || a.essai || SANS_CONTACT.has(a.issue) || APPEL_VIDE.test(String(a.resume || ''))) return false;
  return propre([a.resume, a.passe, a.notes, a.transcription_gardee, a.transcription].filter((x) => typeof x === 'string').join(' ')).length >= 40;
}

/** Pure : un appel en texte, daté, pour la lecture. */
export function texteDeLAppel(a, { transcription = 3000 } = {}) {
  const biens = Array.isArray(a.biens) ? a.biens.filter(Boolean).join(' ; ') : propre(a.biens, 500);
  const trans = typeof a.transcription_gardee === 'string' ? a.transcription_gardee : typeof a.transcription === 'string' ? a.transcription : '';
  return [
    `Le ${jour(a.le)}, appel${a.par ? ` de ${prenom(a.par)}` : ''}${ISSUES[a.issue] ? ` (${ISSUES[a.issue]})` : ''}${a.rappel_entrant ? ', il nous a rappelés' : ''}.`,
    a.resume ? `Résumé : ${propre(a.resume, 800)}` : null,
    biens ? `Biens évoqués : ${biens}` : null,
    typeof a.notes === 'string' && a.notes.trim() ? `Notes de l'analyste : ${propre(a.notes, 1200)}` : null,
    trans && transcription ? `Transcription : ${propre(trans, transcription)}` : null,
  ].filter(Boolean).join('\n');
}

/** Pure : les appels en un texte, du plus ancien au plus récent ; trop long, les plus anciens perdent d'abord leur transcription. */
export function texteDesAppels(appels, max = 24000) {
  const tries = [...appels].sort((a, b) => String(a.le).localeCompare(String(b.le)));
  for (const t of [3000, 1200, 0]) {
    const blocs = tries.map((a, i) => texteDeLAppel(a, { transcription: i >= tries.length - 3 ? 3000 : t }));
    const texte = blocs.join('\n\n');
    if (texte.length <= max || t === 0) return texte.length <= max ? texte : texte.slice(-max);
  }
  return '';
}

/** Les fiches de biens que les appels citent, devinées par leurs noms (sans IA). */
async function biensCites(appels, user) {
  const texte = appels.map((a) => (Array.isArray(a.biens) ? a.biens.join(' ; ') : a.biens || '')).filter(Boolean).join('\n');
  if (propre(texte).length < 6) return [];
  try {
    const { fichesDevinees } = await import('./ranger.js');
    return (await fichesDevinees(texte, user, { limite: 4 })).filter((l) => l.genre === 'bien');
  } catch { return []; }
}

/**
 * Lit des appels d'un agent et les range sur sa fiche (et les biens cités). `appels` : ceux à lire (par défaut, ceux qui
 * ont parlé et n'ont pas été lus). Rend le résultat de importerTexte, ou { ok: true, rien: true }.
 */
export async function rangerAppelsSurFiche(agentId, user, { appels = null, lire = null } = {}) {
  const agent = Records.get('AgentImmo', agentId);
  if (!agent) return { ok: false, error: 'Agent introuvable.' };
  const cle = `agent:${agentId}`;
  if (!Records.findBy('FicheDossier', 'cle', cle)) fiche(cle, { genre: 'agent', nom: agent.nom });
  historiqueDesAppels({ agentId });
  try { historiqueDesEnvois(cle, { nom: agent.nom }); } catch { /* les envois n'arrêtent pas la lecture */ }
  const aLire = (appels || Records.filter('AppelAgent', { agent_id: agentId })).filter((a) => appelParle(a) && !dejaImporte(`appel:${a.id}`))
    .sort((a, b) => String(a.le).localeCompare(String(b.le)));
  if (!aLire.length) return { ok: true, rien: true };
  const dernier = aLire[aLire.length - 1];
  const nom = agent.nom || 'l\'agent';
  const texte = `${aLire.length > 1 ? `Les ${aLire.length} appels` : 'Un appel'} avec ${nom}${agent.agence ? `, agent chez ${agent.agence}` : ''}${agent.ville ? ` (${agent.ville})` : ''}.\n\n${texteDesAppels(aLire)}`;
  const liens = [{ cle, genre: 'agent', nom }, ...(await biensCites(aLire, user))];
  const r = await importerTexte({
    texte, liens, sansEvenementSur: cle,
    source: { genre: 'appel', de: prenom(dernier.par), le: dernier.le, lieu: aLire.length > 1 ? `${aLire.length} appels avec ${nom}` : `appel avec ${nom}` },
    cle: aLire.length > 1 ? `appels:${agentId}:${dernier.id}` : `appel:${dernier.id}`,
  }, user, { lire });
  // Chaque appel lu est marqué : l'import des appels et la mise à jour d'après un appel ne le relisent pas.
  if (r?.ok && !r.deja) {
    for (const a of aLire) if (!Records.findBy('ImportSource', 'cle', `appel:${a.id}`)) Records.create('ImportSource', { cle: `appel:${a.id}`, genre: 'appel', note_id: r.note_id || null, le: new Date().toISOString(), du: a.le, lu_avec: aLire.length > 1 ? `appels:${agentId}:${dernier.id}` : null });
  }
  return r;
}

/** Les agents à rattraper : ceux qui ont un appel parlé pas encore lu, les plus récemment appelés d'abord. */
export function agentsARattraper() {
  const parAgent = new Map();
  for (const a of Records.list('AppelAgent')) {
    if (!appelParle(a) || dejaImporte(`appel:${a.id}`)) continue;
    const p = parAgent.get(a.agent_id);
    if (!p || String(a.le) > p) parAgent.set(a.agent_id, String(a.le));
  }
  return [...parAgent.entries()].filter(([id]) => Records.get('AgentImmo', id)).sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id);
}

/**
 * Après un appel validé (appel.js, validerAppel) : la ligne de l'appel tout de suite, puis sa lecture en fond. Jamais
 * bloquant ; rien pendant les tests ni hors de Render (le poste local parle au vrai modèle), sauf FICHE_APPELS_LOCAL=1.
 */
export function apresAppel(appelId, user) {
  const a = Records.get('AppelAgent', appelId);
  if (!a?.agent_id || a.essai) return;
  try {
    const agent = Records.get('AgentImmo', a.agent_id);
    const cle = `agent:${a.agent_id}`;
    if (agent && !Records.findBy('FicheDossier', 'cle', cle)) fiche(cle, { genre: 'agent', nom: agent.nom });
    historiqueDesAppels({ agentId: a.agent_id });
  } catch { /* la ligne reviendra à l'ouverture de la fiche */ }
  if (process.env.NODE_TEST_CONTEXT || (!process.env.RENDER && process.env.FICHE_APPELS_LOCAL !== '1')) return;
  if (!appelParle(a)) return;
  rangerAppelsSurFiche(a.agent_id, user, { appels: [a] }).catch((e) => console.error('[fiche] appel', appelId, e?.message || e));
}

/**
 * Le rattrapage, lancé depuis Paramètres > Import des fiches : une lecture par agent, les plus récemment appelés d'abord,
 * trois à la fois. Relancé, il ne relit que les appels pas encore lus.
 */
export function lancerRattrapage(user) {
  const ids = agentsARattraper();
  const taches = ids.map((id) => () => rangerAppelsSurFiche(id, user));
  return lancerLot('appels', `Appels · ${ids.length} agent${ids.length > 1 ? 's' : ''}`, taches, user, { parallele: 3 });
}
