// L'agent d'une fiche, à chaque préanalyse : qui l'a envoyée, et est-il dans
// Monday ? Une fiche arrive avec son agent (l'expéditeur, la signature du
// mail transféré, le pied de la fiche) ; sans lui sur le dossier, le mail de
// refus ou la demande de documents ne sait à qui partir.
//
// Monday : le tableau « Agent immobilier » est celui des agents qui nous
// envoient des fiches. Un agent absent y est ajouté à sa première fiche ; un
// agent présent n'est jamais retouché, sa fiche est tenue à la main. Rien de
// bloquant : la préanalyse est faite, ce qui manque se dit sur le dossier.

import { Records } from '../db.js';
import { ajouterSuivi } from './lifecycle.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

/**
 * Pure : l'agent du dossier. L'adresse vient de l'expéditeur s'il n'est pas
 * de l'équipe, sinon de la fiche lue, sinon de l'en-tête d'un transfert. Le
 * nom, le téléphone et l'agence viennent de la fiche quand elle parle du même
 * agent (ou ne donne pas d'adresse).
 * @returns {{email, nom, telephone, agence} | null}
 */
export function agentDuDossier({ contact = null, extrait = null, origine = null }, estInterne = () => false) {
  const externe = (e) => (e && !estInterne(String(e).toLowerCase()) ? String(e).toLowerCase() : null);
  const email = externe(contact) || externe(extrait?.email) || externe(origine?.email);
  const memeAgent = extrait && (!extrait.email || String(extrait.email).toLowerCase() === email);
  const agent = {
    email,
    nom: (memeAgent && extrait.nom) || (origine?.email === email && origine?.nom) || null,
    telephone: (memeAgent && extrait.telephone) || null,
    agence: (memeAgent && extrait.agence) || null,
  };
  return agent.email || agent.nom ? agent : null;
}

/** Pure : la phrase qui le dit, sur le dossier et au tableau de bord. */
export function phraseAgent(agent, monday) {
  if (!agent) return "Aucun agent trouvé dans la fiche : ajoutez son adresse sur le dossier avant de lui écrire.";
  const qui = [agent.nom, agent.email, agent.telephone, agent.agence].filter(Boolean).join(' · ');
  if (!agent.email) return `Agent ${qui} relevé, mais sans adresse mail : ajoutez-la sur le dossier avant de lui écrire.`;
  if (monday?.etat === 'cree') return `Agent ${qui} : ajouté dans Monday (Agent immobilier).`;
  if (monday?.etat === 'existant') return `Agent ${qui} : déjà dans Monday.`;
  if (monday?.etat === 'erreur') return `Agent ${qui} : Monday n'a pas répondu (${monday.raison}), à ajouter depuis le dossier.`;
  return `Agent ${qui} rattaché au dossier.`;
}

/**
 * Rattache l'agent au dossier et, s'il manque, l'ajoute dans Monday.
 * @returns {Promise<{agent: object|null, monday: {etat: string, raison?: string}|null, phrase: string}>}
 */
export async function rattacherAgent(dealId, { contact = null, extrait = null, texte = '', user = null } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { agent: null, monday: null, phrase: '' };

  const { referentielTri } = await import('./tri-mails.js');
  const { expediteurDOrigine } = await import('./fiches-stats.js');
  const ref = referentielTri();
  const estInterne = (email) => ref.internes.has(email) || ref.domaines.has(email.split('@')[1] || '');
  const agent = agentDuDossier({ contact, extrait, origine: expediteurDOrigine(texte, estInterne) }, estInterne);

  if (agent) {
    const apercu = deal.apercu || {};
    Records.update('Deal', deal.id, {
      contact_agent_email: deal.contact_agent_email || agent.email || null,
      apercu: {
        ...apercu,
        agent_nom: apercu.agent_nom || agent.nom || null,
        agent_telephone: apercu.agent_telephone || agent.telephone || null,
        agence: apercu.agence || agent.agence || null,
      },
    });
  }

  let monday = null;
  if (agent?.email && !deal.test) monday = await inscrireDansMonday(agent, deal);

  const phrase = phraseAgent(agent, monday);
  // Ce qui s'est passé, lisible par « Ce qui vous attend » : l'agent ajouté
  // s'annonce, l'agent sans adresse attend qu'on la donne.
  const etat = !agent ? 'introuvable' : !agent.email ? 'sans_email' : monday?.etat || 'rattache';
  const courant = Records.findBy('Deal', 'deal_id', dealId);
  Records.update('Deal', courant.id, { agent_rattache: { le: new Date().toISOString(), etat, ...(agent || {}), raison: monday?.raison || null } });
  ajouterSuivi(Records.findBy('Deal', 'deal_id', dealId), { type: 'agent', detail: phrase }, user);
  return { agent, monday, etat, phrase };
}

async function inscrireDansMonday(agent, deal) {
  try {
    const { mondayConfigure, TABLEAUX } = await import('../monday.js');
    if (!mondayConfigure() || !TABLEAUX.agents) return null;
    const { agents, creerAgentMonday } = await import('./monday-sync.js');
    if ((await agents()).some((a) => a.email === agent.email)) return { etat: 'existant' };
    const lot = deal.lots?.[0];
    const ville = val(lot?.lot?.adresse)?.ville || lot?.enrichissement?.commune?.nom || null;
    const r = await creerAgentMonday({ nom: agent.nom || agent.email, email: agent.email, telephone: agent.telephone, ville, entreprise: agent.agence });
    if (r?.ignore) return null;
    if (r?.erreur) return { etat: 'erreur', raison: r.erreur };
    return { etat: r?.cree === false ? 'existant' : 'cree' };
  } catch (e) {
    console.warn(`[agent] ${agent.email} : Monday injoignable (${e?.message || e})`);
    return { etat: 'erreur', raison: String(e?.message || e).slice(0, 120) };
  }
}
