// Les dossiers qui attendent un Oui ou un Non : nés d'une fiche, préanalysés,
// pas encore tranchés. Le référent de l'agent tranche, dans les 48 heures.

import { Records } from '../db.js';

export async function listeDeDecisions({ maintenant = new Date() } = {}) {
  const { fiches } = await import('./index.js');
  const { agentParEmail } = await import('./carnet.js');
  return (await fiches())
    .filter((f) => f.deal_id && f.etape === 'recue')
    .map((f) => {
      const d = Records.findBy('Deal', 'deal_id', f.deal_id);
      if (!d || d.decision || d.test) return null;
      const lot = d.lots?.[0] || {};
      const a = f.agent_email ? agentParEmail(f.agent_email) : null;
      return {
        deal_id: f.deal_id, titre: f.titre, ville: f.ville, agent: f.agent, agent_email: f.agent_email, agent_id: a?.id || null,
        referent: a?.referent || null, verdict: lot.evaluation?.verdict || null,
        motifs: (lot.evaluation?.motifs || []).slice(0, 3).map((m) => (typeof m === 'string' ? m : m?.motif || m?.texte || '')).filter(Boolean),
        recu_le: f.le, depuis_h: Math.round((Date.parse(maintenant) - Date.parse(f.le)) / 3600000),
      };
    })
    .filter(Boolean);
}
