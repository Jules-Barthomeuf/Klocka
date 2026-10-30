// La Mémoire dans Twenty CRM (30 oct. 2026, Jules : « ça va aussi mettre dans Twenty l'adresse du bien avec l'agent
// lié, le loyer, le prix »). Chaque bien de la Mémoire devient une « Propriété » au statut Mémoire, reliée à son
// « Agent immobilier » (retrouvé ou créé par son adresse mail) ; les chiffres d'un agent se posent sur sa fiche.
// Le schéma (statut, relation, champs) est posé par scripts/crm/memoire-twenty.mjs.
//
// Twenty seulement en CRM=twenty ou CRM=double ; en CRM=monday on passe et on le dit. Rejouer ne crée rien deux
// fois : la propriété garde son id Twenty, l'agent se retrouve par mail.

import { Records } from '../db.js';
import { TWENTY } from './drapeaux.js';
import { ENTITE } from './memoire.js';

const PROPRIETES = 'proprietesListe';
const AGENTS = 'agentImmobilierListe';

async function pret() {
  const T = await import('../twenty.js');
  const { crmTwenty, crmDouble } = await import('../monday.js');
  if (!(crmTwenty() || crmDouble())) return { ok: false, raison: 'CRM=monday : Twenty sauté' };
  if (!T.twentyConfigure()) return { ok: false, raison: 'Twenty non configuré' };
  return { ok: true, T };
}

const nomDe = (b) => [b.ville, b.adresse?.rue].filter(Boolean).join(' - ') || b.cle_adresse || 'Bien';
const adresseTwenty = (a) => ({ addressStreet1: a?.rue || '', addressCity: a?.ville || '', addressPostcode: a?.code_postal || '', addressCountry: 'France' });

/** L'agent dans Twenty : retrouvé par mail, sinon créé avec ce que la fiche dit. Rend son id, ou null. */
export async function agentTwenty(agent, T) {
  const email = String(agent?.email || '').trim().toLowerCase();
  if (!email) return null;
  const existant = await T.trouver(AGENTS, { 'eMail.primaryEmail': email });
  if (existant?.id) return existant.id;
  const { versTwenty } = await import('../crm/monday-sur-twenty.js');
  const cree = await T.creer(AGENTS, {
    name: agent.nom || email,
    eMail: versTwenty('EMAILS', email),
    ...(agent.telephone ? { telephone: versTwenty('PHONES', agent.telephone) } : {}),
    ...(agent.agence ? { entreprise: agent.agence } : {}),
  });
  return cree?.id || null;
}

/** Pose ou met à jour un bien de la Mémoire dans « Propriétés ». */
export async function pousserBienMemoire(bien) {
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const { T } = p;
  const agentId = await agentTwenty(bien.agent, T);
  const valeurs = {
    name: nomDe(bien),
    adresse: adresseTwenty(bien.adresse),
    statut: bien.statut === 'dossier' ? undefined : 'MEMOIRE',
    loyer: bien.loyer_annuel ?? null,
    prix: bien.prix ?? null,
    m: bien.surface_m2 ?? null,
    activiteLocataire: [bien.locataire_nom, bien.locataire_activite].filter(Boolean).join(' · ') || null,
    agentImmobilier: bien.agent?.nom || bien.agent?.agence || bien.agent_email || null,
    ...(agentId ? { agentId } : {}),
    date: bien.recu_le ? String(bien.recu_le).slice(0, 10) : null,
    notes: [bien.bail_type ? `Bail ${bien.bail_type}` : null, bien.bail_echeance ? `échéance ${bien.bail_echeance}` : null, bien.type_actif, bien.compte ? `reçu sur ${bien.compte}` : null].filter(Boolean).join(' · ') || null,
  };
  for (const k of Object.keys(valeurs)) if (valeurs[k] === undefined) delete valeurs[k];
  const r = await T.poser(PROPRIETES, { id: bien.twenty_id || null, valeurs });
  Records.update(ENTITE, bien.id, { twenty_id: r.id, twenty_le: new Date().toISOString(), twenty_agent_id: agentId });
  return { id: r.id, cree: !!r.cree, agent_id: agentId };
}

/** Les chiffres d'un agent (server/memoire/agents.js) sur sa fiche Twenty. */
export async function pousserChiffresAgent(email, chiffres) {
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const { T } = p;
  const a = await T.trouver(AGENTS, { 'eMail.primaryEmail': String(email || '').toLowerCase() });
  if (!a?.id) return { ignore: true, raison: 'agent absent de Twenty' };
  const f = (x) => (x?.min != null ? `${Math.round(x.min).toLocaleString('fr-FR')} · ${Math.round(x.mediane).toLocaleString('fr-FR')} · ${Math.round(x.max).toLocaleString('fr-FR')}` : null);
  await T.modifier(AGENTS, a.id, {
    fichesRecues: chiffres.nb_fiches,
    villesFiches: (chiffres.villes || []).join(', ') || null,
    loyersFiches: f(chiffres.loyers),
    prixFiches: f(chiffres.prix),
    dernierEnvoi: chiffres.dernier_envoi ? String(chiffres.dernier_envoi).slice(0, 10) : null,
    tauxRetenu: chiffres.taux_retenu == null ? null : Math.round(chiffres.taux_retenu * 100),
  });
  return { id: a.id };
}

/**
 * Les biens pas encore dans Twenty (ou modifiés depuis), par paquets ; puis les chiffres des agents touchés.
 * Appelé par le tour du lecteur de nuit ; éteint sans MEMOIRE_TWENTY.
 */
export async function synchroniser({ max = 50 } = {}) {
  if (!TWENTY) return { ignore: true, raison: 'MEMOIRE_TWENTY éteint' };
  const p = await pret();
  if (!p.ok) return { ignore: true, raison: p.raison };
  const aFaire = Records.list(ENTITE).filter((b) => !b.twenty_le || String(b.maj_le || '') > String(b.twenty_le)).slice(0, max);
  let poses = 0;
  const agents = new Set();
  for (const b of aFaire) {
    try {
      await pousserBienMemoire(b);
      poses += 1;
      if (b.agent_email) agents.add(b.agent_email);
    } catch (e) { console.warn(`[mémoire] Twenty ${b.id} :`, e?.message || e); }
  }
  let chiffres = 0;
  if (agents.size) {
    const { chiffresAgent } = await import('./agents.js');
    const tous = Records.list(ENTITE);
    for (const email of agents) {
      try { await pousserChiffresAgent(email, chiffresAgent(tous.filter((b) => b.agent_email === email))); chiffres += 1; } catch (e) { console.warn(`[mémoire] chiffres ${email} :`, e?.message || e); }
    }
  }
  return { poses, chiffres, restants: Math.max(0, Records.list(ENTITE).filter((b) => !b.twenty_le).length) };
}
