// Le tableau de bord de la prospection et le récapitulatif du vendredi :
// appels passés, agents joints, dossiers reçus, taux de Oui, délai de
// réponse, meilleurs agents, dossiers en attente de décision, relances en
// retard. Pur : calculé sur les listes qu'on lui donne.

import * as R from './regles.js';
import { semaineDe } from '../deal/fiches-stats.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/**
 * @param {{appels, fiches, agents, decisions?: Map<deal_id, {le}>, maintenant?}} d
 *   appels : AppelAgent validés ou non ; fiches : listerFiches ; decisions :
 *   la date de décision de chaque dossier, pour le délai de réponse.
 */
export function tableauDeBord({ appels = [], fiches = [], agents = [], decisions = new Map(), maintenant = new Date() }) {
  const semaine = semaineDe(maintenant);
  const cette = (iso) => semaineDe(iso) === semaine;
  const a = appels.filter((x) => cette(x.le));
  const joints = new Set(a.filter((x) => !['pas_de_reponse', 'invalide'].includes(x.issue)).map((x) => x.agent_id));
  const f = fiches.filter((x) => cette(x.le));
  const tranchees = f.filter((x) => x.etape !== 'recue');
  const oui = f.filter((x) => ['oui', 'presente', 'abouti'].includes(x.etape)).length;
  const delais = fiches
    .filter((x) => x.deal_id && decisions.get(x.deal_id)?.le && cette(decisions.get(x.deal_id).le))
    .map((x) => (Date.parse(decisions.get(x.deal_id).le) - Date.parse(x.le)) / 3600000)
    .filter((h) => h >= 0);
  const parPersonne = {};
  for (const x of a) parPersonne[x.par] = (parPersonne[x.par] || 0) + 1;
  const auj = R.jourDe(maintenant);
  return {
    semaine,
    appels: a.length,
    agents_joints: joints.size,
    dossiers_recus: f.length,
    oui,
    taux_oui: pct(oui, tranchees.length),
    delai_reponse_h: delais.length ? Math.round(delais.reduce((t, h) => t + h, 0) / delais.length) : null,
    appels_par_personne: parPersonne,
    meilleurs_agents: [...agents].filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 5).map((x) => ({ id: x.id, nom: x.nom, agence: x.agence, score: x.score, fiches: x.fiches || 0 })),
    en_attente_de_decision: fiches.filter((x) => x.etape === 'recue' && x.deal_id).map((x) => ({ deal_id: x.deal_id, titre: x.titre, agent: x.agent, depuis_h: Math.round((Date.parse(maintenant) - Date.parse(x.le)) / 3600000) })),
    relances_en_retard: agents.filter((x) => x.prochaine?.le && x.prochaine.le < auj && x.statut !== 'archive').length,
  };
}

/** Pure : le récapitulatif du vendredi, en quelques lignes. */
export function recapitulatif(t) {
  const lignes = [
    `Le point de la semaine : ${t.appels} appel${t.appels > 1 ? 's' : ''}, ${t.agents_joints} agent${t.agents_joints > 1 ? 's' : ''} joint${t.agents_joints > 1 ? 's' : ''}, ${t.dossiers_recus} dossier${t.dossiers_recus > 1 ? 's' : ''} reçu${t.dossiers_recus > 1 ? 's' : ''}, ${t.oui} Oui${t.dossiers_recus ? ` (${t.taux_oui} % des dossiers tranchés)` : ''}.`,
    t.delai_reponse_h != null ? `Délai moyen de décision : ${t.delai_reponse_h} h.` : null,
    t.meilleurs_agents.length ? `Les agents qui rapportent : ${t.meilleurs_agents.slice(0, 3).map((x) => `${x.nom} (${x.fiches} fiche${x.fiches > 1 ? 's' : ''})`).join(', ')}.` : null,
    t.en_attente_de_decision.length ? `En attente de décision : ${t.en_attente_de_decision.slice(0, 5).map((x) => x.titre).join(', ')}.` : 'Aucun dossier en attente de décision.',
    t.relances_en_retard ? `${t.relances_en_retard} relance${t.relances_en_retard > 1 ? 's' : ''} en retard.` : null,
  ];
  return lignes.filter(Boolean).join('\n');
}
