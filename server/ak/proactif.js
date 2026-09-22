// AK se propose de lui-même : un dossier dont l'analyse n'est pas complète,
// il le dit dans le groupe, une fois, et demande s'il s'en occupe.
//
// Tout est déterministe : ce qui manque se lit dans la base (documents,
// agent, projet, analyses K-Data, engagements en retard), la phrase est
// écrite ici. Aucun appel au modèle : ça ne coûte rien, et ça ne dit jamais
// autre chose que ce qui est vrai. Un dossier signalé ne l'est plus pendant
// sept jours, et seulement aux heures de bureau.

import { Records, Meta } from '../db.js';

const CLE_SIGNALES = 'ak.signales';
const CLE_DERNIER = 'ak.proactif.dernier';
const REPIT_JOURS = 7;
const FENETRE_JOURS = 3;
const INTERVALLE_MIN = Math.max(5, Number(process.env.AK_PROACTIF_MIN ?? 30));

const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id;
const signales = () => { try { return JSON.parse(Meta.get(CLE_SIGNALES) || '{}'); } catch { return {}; } };

/** Pure : est-ce une heure où l'on dérange l'équipe ? Jours ouvrés, 8 h à 19 h. */
export function heureDeBureau(maintenant = new Date()) {
  const j = maintenant.getDay();
  return j >= 1 && j <= 5 && maintenant.getHours() >= 8 && maintenant.getHours() < 19;
}

/**
 * Pure : ce qui manque à un dossier, dans l'ordre où l'équipe le lit.
 * @returns {string[]} vide quand tout est là
 */
export function manques(deal, { analyses = [], engagementsEnRetard = [], manquants = [] } = {}) {
  const m = [];
  // Cinq pièces manquantes, c'est « tous les docs » : la liste en entier ne dit rien de plus.
  if (manquants.length >= 5) m.push('aucun doc reçu');
  else if (manquants.length) m.push(`il manque ${manquants.map((x) => x.libelle.replace(/^(le|la|les) /, '')).join(', ')}`);
  if (!deal.contact_agent_email) m.push("pas d'agent rattaché");
  if (!analyses.length) m.push('aucune analyse K-Data');
  if (!deal.projet_id) m.push('pas de fiche projet');
  for (const e of engagementsEnRetard) m.push(`« ${e.quoi} » en retard depuis le ${new Date(e.echeance).toLocaleDateString('fr-FR')}`);
  return m;
}

/** Pure : la phrase d'AK pour un dossier, sur le ton de l'équipe. */
export function phrase(deal, liste, responsable = null) {
  const qui = responsable ? `${responsable} ` : '';
  const docs = liste.some((x) => x.startsWith('il manque') || x === 'aucun doc reçu');
  const proposition = docs && deal.contact_agent_email ? 'je relance l\'agent ?'
    : docs ? 'tu me files l\'agent et je relance ?'
      : liste.some((x) => x.includes('K-Data')) ? 'je lance k-data dessus ?'
        : liste.some((x) => x.includes('projet')) ? 'je crée le projet ?' : 'on fait quoi ?';
  return `${qui}le dossier ${titreDeal(deal)} est pas complet : ${liste.join(', ')}. ${proposition}`;
}

/**
 * Les dossiers à signaler maintenant : actifs, touchés ces derniers jours,
 * incomplets, pas encore signalés cette semaine. Rend les phrases ; ne marque
 * rien tant qu'on n'a pas appelé `marquer`.
 */
export async function aSignaler({ maintenant = new Date(), mentionner = (x) => x } = {}) {
  const { documentsManquants } = await import('../deal/propositions.js');
  const { engagementsOuverts, enRetard } = await import('../deal/engagements.js');
  const deja = signales();
  const analysesParDeal = new Map();
  for (const a of Records.list('AnalyseKData')) if (a.dossier_id) analysesParDeal.set(a.dossier_id, [...(analysesParDeal.get(a.dossier_id) || []), a]);
  const retards = engagementsOuverts().filter(enRetard);
  const recent = (d) => maintenant - new Date(d.updated_date || d.created_date || 0) < FENETRE_JOURS * 86400000;
  const sortie = [];
  for (const d of Records.list('Deal')) {
    if (d.archived || d.test || !recent(d)) continue;
    if (deja[d.deal_id] && maintenant - new Date(deja[d.deal_id]) < REPIT_JOURS * 86400000) continue;
    const liste = manques(d, { analyses: analysesParDeal.get(d.deal_id) || [], engagementsEnRetard: retards.filter((e) => e.deal_id === d.deal_id), manquants: documentsManquants(d) });
    if (!liste.length) continue;
    const responsable = (d.responsables || [])[0] ? mentionner((d.responsables || [])[0]) : null;
    sortie.push({ deal_id: d.deal_id, texte: phrase(d, liste, responsable) });
  }
  return sortie.slice(0, 3);
}

/**
 * Les mails reçus ces dernières heures, pas rattachés, avec une pièce jointe :
 * une fiche à pré-analyser, probablement. Signalés une fois.
 */
export function mailsASignaler({ maintenant = new Date(), mails = Records.list('MailRecu') } = {}) {
  const deja = signales();
  return mails
    .filter((m) => !m.deal_id && (m.pieces_jointes || []).length && maintenant - new Date(m.date || 0) < 6 * 3600000)
    .filter((m) => !deja[`mail:${m.id}`])
    .slice(0, 3)
    .map((m) => ({ cle: `mail:${m.id}`, texte: `un mail de ${m.de || m.de_email} vient d'arriver : « ${String(m.objet || '').slice(0, 80)} », avec ${m.pieces_jointes.length} pièce${m.pieces_jointes.length > 1 ? 's' : ''} jointe${m.pieces_jointes.length > 1 ? 's' : ''}. je pré-analyse ?` }));
}

export function marquer(dealIds, maintenant = new Date()) {
  const s = signales();
  for (const id of dealIds) s[id] = maintenant.toISOString();
  Meta.set(CLE_SIGNALES, JSON.stringify(s));
}

/** Le passage est-il dû ? Toutes les INTERVALLE_MIN minutes, aux heures de bureau. */
export function estDu(maintenant = new Date()) {
  if (!heureDeBureau(maintenant)) return false;
  const dernier = Number(Meta.get(CLE_DERNIER) || 0);
  if (maintenant - dernier < INTERVALLE_MIN * 60000) return false;
  Meta.set(CLE_DERNIER, String(maintenant.getTime()));
  return true;
}
