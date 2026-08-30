// Les échéances : ce qui attend une réponse, ce qui a été promis, ce qui dort.
//
// Le mode « Échéances » du chat du tableau de bord montre des cartes : « Marc a
// reçu la demande de documents il y a six jours — pas de réponse », « le
// syndic doit le règlement de copropriété pour jeudi, en retard de deux
// jours », « le dossier ouvert après l'appel de mardi n'a encore rien reçu ».
//
// Tout est déduit des faits déjà en base — EmailLog (nos envois), MailRecu
// (leurs réponses), le registre des engagements, les dossiers — sans modèle :
// une échéance ne s'invente pas.

import { Records } from '../db.js';
import { engagementsOuverts, enRetard } from './engagements.js';

const JOUR = 86400000;
const jours = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / JOUR)) : null);
// Les anciens titres embarquaient le verdict ; une carte n'en veut pas.
const nettoyer = (t) =>
  String(t || '')
    .replace(/\s*[:—–-]\s*verdict\s*:?\s*.*$/i, '')
    .replace(/\s*:\s*(GO SOUS R[ÉE]SERVE|NO-?GO|GO|INSUFFISANT)\s*$/i, '')
    .trim();
const titreDeal = (d) => nettoyer(d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id || 'dossier');
const adresse = (s) => String(s || '').split(',')[0].trim().toLowerCase();

/** Un dossier clos n'attend plus rien. */
const clos = (d) => d.archived || /abandon|refus|sign|perdu|clos/.test(String(d.statut || ''));

/**
 * @returns {{sans_reponse: object[], engagements: object[], silencieux: object[]}}
 */
export function echeances() {
  const deals = Records.list('Deal').filter((d) => !clos(d));
  const parDeal = new Map(deals.map((d) => [d.deal_id, d]));
  const envois = Records.list('EmailLog').filter((l) => l.deal_id && l.statut === 'envoye' && parDeal.has(l.deal_id));
  const recus = Records.list('MailRecu');

  // --- Nos mails restés sans réponse ---------------------------------------
  // Pour chaque dossier, le dernier envoi ; une réponse est un mail reçu de
  // la même adresse (ou rattaché au dossier) après cet envoi.
  const dernierEnvoi = new Map();
  for (const l of envois) {
    const d = dernierEnvoi.get(l.deal_id);
    if (!d || String(l.sent_at || '') > String(d.sent_at || '')) dernierEnvoi.set(l.deal_id, l);
  }
  const sans_reponse = [];
  for (const [dealId, envoi] of dernierEnvoi) {
    const deal = parDeal.get(dealId);
    const dest = adresse(envoi.destinataire || envoi.to);
    const repondu = recus.some(
      (m) =>
        String(m.date || '') > String(envoi.sent_at || '') &&
        (adresse(m.de_email) === dest || (m.deal_id && m.deal_id === dealId))
    );
    if (repondu) continue;
    // Un mail d'abandon ou de refus n'attend pas de réponse.
    if (['abandon', 'refus'].includes(envoi.intention)) continue;
    // Les documents sont là, ou le dossier a avancé depuis : la demande a eu
    // sa réponse, même si elle n'est pas passée par une boîte relevée.
    if (envoi.intention === 'demande_documents' && ['documents_recus', 'depouille', 'projet_cree'].includes(deal.statut)) continue;
    if ((deal.documents || []).some((doc) => String(doc.recu_le || doc.ajoute_le || doc.created_date || '') > String(envoi.sent_at || ''))) continue;
    const j = jours(envoi.sent_at);
    if (j == null || j < 1) continue;
    sans_reponse.push({
      deal_id: dealId,
      dossier: titreDeal(deal),
      statut: deal.statut || 'analyse',
      destinataire: dest,
      agent: deal.contact_agent_nom || null,
      objet: envoi.subject || envoi.sujet || null,
      intention: envoi.intention || null,
      envoye_le: envoi.sent_at,
      jours: j,
    });
  }
  sans_reponse.sort((a, b) => b.jours - a.jours);

  // --- Ce qui a été promis ---------------------------------------------------
  const engagements = engagementsOuverts()
    .filter((e) => !e.deal_id || parDeal.has(e.deal_id))
    .map((e) => {
      const retard = enRetard(e);
      const dans = e.echeance ? Math.ceil((new Date(e.echeance).getTime() - Date.now()) / JOUR) : null;
      const deal = e.deal_id ? parDeal.get(e.deal_id) : null;
      return { ...e, dossier: deal ? titreDeal(deal) : nettoyer(e.dossier), en_retard: retard, dans, jours_retard: retard ? jours(e.echeance) : 0 };
    })
    .sort((a, b) => {
      if (a.en_retard !== b.en_retard) return a.en_retard ? -1 : 1;
      return String(a.echeance || '9999').localeCompare(String(b.echeance || '9999'));
    });

  // --- Les dossiers qui dorment ---------------------------------------------
  // Ouvert après une note ou une fiche, aucun mail parti, aucun document reçu
  // depuis deux jours : c'est à nous de bouger, pas à l'agent.
  const dealsAvecEnvoi = new Set(envois.map((l) => l.deal_id));
  const dealsAvecEngagement = new Set(engagements.map((e) => e.deal_id).filter(Boolean));
  const silencieux = deals
    .filter((d) => !dealsAvecEnvoi.has(d.deal_id) && !dealsAvecEngagement.has(d.deal_id))
    .filter((d) => !(d.documents || []).length)
    .map((d) => ({
      deal_id: d.deal_id,
      dossier: titreDeal(d),
      statut: d.statut || 'analyse',
      agent: d.contact_agent_nom || null,
      destinataire: d.contact_agent_email || null,
      ouvert_le: d.cree_le || d.created_date,
      jours: jours(d.cree_le || d.created_date),
    }))
    .filter((d) => d.jours != null && d.jours >= 2)
    .sort((a, b) => b.jours - a.jours)
    .slice(0, 12);

  return { sans_reponse, engagements, silencieux };
}
