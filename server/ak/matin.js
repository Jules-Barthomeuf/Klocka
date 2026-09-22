// Le mot du matin : chaque jour ouvré, AK dit dans le groupe ce qui attend
// l'équipe, et relance ceux qui doivent quelque chose.
//
// La matière est déterministe : le plan du jour (propositions.js), le
// registre des engagements, les dossiers sans agent. Le modèle ne fait que
// la mettre en trois lignes, sur le ton de l'équipe. Une seule fois par jour
// (Meta), à l'heure AK_BRIEF_HEURE, jamais le week-end.

import { Records, Meta } from '../db.js';
import { runAgent } from '../llm.js';

const HEURE = (process.env.AK_BRIEF_HEURE || '').trim();
const CLE_JOUR = 'ak.brief.jour';

const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id;

/** Pure : est-ce le moment ? Après l'heure, un jour ouvré, pas encore fait aujourd'hui. */
export function estLeMoment(maintenant = new Date(), { heure = HEURE, dernierJour = Meta.get(CLE_JOUR) } = {}) {
  if (!heure) return false;
  const [h, m] = heure.split(':').map(Number);
  if (!Number.isFinite(h)) return false;
  const jour = maintenant.getDay();
  if (jour === 0 || jour === 6) return false;
  const aujourdhui = maintenant.toISOString().slice(0, 10);
  if (dernierJour === aujourdhui) return false;
  return maintenant.getHours() > h || (maintenant.getHours() === h && maintenant.getMinutes() >= (m || 0));
}

/** La matière du matin, sans le modèle. */
export async function matiere() {
  const { construirePropositions } = await import('../deal/propositions.js');
  const { engagementsOuverts, enRetard } = await import('../deal/engagements.js');
  const propositions = await construirePropositions({}).catch(() => []);
  const engagements = engagementsOuverts();
  let rendez_vous = [];
  try { const { agendaDuJour } = await import('./outils.js'); rendez_vous = await agendaDuJour(new Date().toISOString().slice(0, 10)); } catch { rendez_vous = []; }
  let mails = [];
  try { const { boiteRecue } = await import('./outils.js'); mails = boiteRecue(undefined, { limite: 5 }).map((m) => ({ de: m.de, objet: m.objet, pieces: m.pieces_jointes.length })); } catch { mails = []; }
  const sansAgent = Records.list('Deal').filter((d) => !d.archived && !d.test && !d.contact_agent_email && ['analyse', 'documents_demandes'].includes(d.statut || 'analyse')).map(titreDeal);
  return {
    propositions: propositions.slice(0, 8).map((p) => ({ quoi: p.titre, detail: p.detail, urgence: p.priorite === 1 ? "aujourd'hui" : p.priorite === 2 ? 'attendu' : 'courant' })),
    en_retard: engagements.filter(enRetard).map((e) => ({ de: e.de, quoi: e.quoi, dossier: e.dossier, echeance: e.echeance })),
    a_venir: engagements.filter((e) => !enRetard(e)).slice(0, 5).map((e) => ({ de: e.de, quoi: e.quoi, dossier: e.dossier, echeance: e.echeance })),
    sans_agent: sansAgent.slice(0, 5),
    rendez_vous,
    mails_a_traiter: mails,
  };
}

/**
 * Le texte du matin. `mentionner(de)` rend la mention Chat d'une personne
 * (« <users/123> ») ou son prénom quand on ne la connaît pas.
 */
export async function motDuMatin({ mentionner = (x) => x, modele = null, consigne = '' } = {}) {
  const m = await matiere();
  const vide = !m.propositions.length && !m.en_retard.length && !m.a_venir.length && !m.sans_agent.length && !m.rendez_vous.length && !m.mails_a_traiter.length;
  if (vide) return null;
  const retards = m.en_retard.map((e) => `${mentionner(e.de) || 'quelqu\'un'} doit « ${e.quoi} »${e.dossier ? ` (${e.dossier})` : ''}, c'était pour le ${new Date(e.echeance).toLocaleDateString('fr-FR')}`);
  const { text } = await runAgent({
    system: `${consigne}\n\nTu écris le mot du matin dans le groupe de l'équipe : deux à quatre lignes, texte brut, ton de l'équipe (minuscules, « dcp », « bg »), pas de liste à puces, pas de politesse. Tu dis ce qu'il y a à faire aujourd'hui, tu relances nommément ceux qui ont un engagement en retard en recopiant EXACTEMENT la mention entre chevrons telle qu'elle t'est donnée (<users/123>), tu signales les dossiers sans agent, tu rappelles les rendez-vous du jour (heure, quoi, où) et les mails reçus pas encore traités. Rien d'autre, aucun chiffre inventé.`,
    messages: [{ role: 'user', content: `Matière du jour :\n- à faire : ${JSON.stringify(m.propositions)}\n- engagements en retard : ${JSON.stringify(retards)}\n- à venir : ${JSON.stringify(m.a_venir)}\n- dossiers sans agent : ${JSON.stringify(m.sans_agent)}\n- rendez-vous du jour : ${JSON.stringify(m.rendez_vous)}\n- mails reçus à traiter : ${JSON.stringify(m.mails_a_traiter)}` }],
    model: modele,
  });
  return String(text || '').trim() || null;
}

export const marquerFait = (jour = new Date().toISOString().slice(0, 10)) => Meta.set(CLE_JOUR, jour);
