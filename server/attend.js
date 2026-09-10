// Ce qui vous attend : une seule liste, trois sources.
//
// Klocka savait déjà trois choses, chacune dans son coin — les rappels qu'on
// se pose à soi-même, les promesses des agents (« je vous envoie le PV
// jeudi »), et les dossiers dont la relance est prévue. Trois endroits où
// regarder, donc aucun. Ici tout est ramené à une ligne datée, du même
// vocabulaire, triée par échéance.
//
// Rien n'est recalculé ni décidé : on lit ce que les trois registres disent
// déjà. Une ligne mène toujours à l'endroit où l'on peut agir.

import { Records } from './db.js';
import { listerRappels } from './rappels.js';
import { engagementsOuverts } from './deal/engagements.js';
import { aRelancer, statutDe } from './deal/lifecycle.js';

const aMidi = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; };
/** Jours d'écart avec aujourd'hui : négatif si c'est passé. */
const dans = (iso) => (!iso ? null : Math.round((aMidi(new Date(iso)) - aMidi(new Date())) / 86400000));

// Le verdict colle souvent au titre d'un dossier (« … : Verdict NO-GO ») :
// il n'a rien à faire dans une liste de choses à faire.
const sansVerdict = (t) =>
  String(t || '')
    .replace(/\s*[—:-]\s*(?:Verdict\s+)?(GO SOUS R[ÉE]SERVE|NO-?GO|GO|INSUFFISANT|Non conforme|Conforme(?: sous réserve)?|Dossier incomplet)\s*$/i, '')
    .trim();

const titreDeal = (d) =>
  sansVerdict(d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id || 'Dossier').slice(0, 90);

/**
 * Tout ce qui attend une personne, en une liste.
 *
 * @param {{email?: string}} user
 * @returns {{lignes: Array, en_retard: number, aujourdhui: number, total: number}}
 */
export function ceQuiAttend(user) {
  const lignes = [];

  // 1. Les rappels que la personne s'est posés. Les siens seulement.
  const { dus, a_venir } = listerRappels(user);
  for (const r of [...dus, ...a_venir]) {
    lignes.push({
      id: r.id,
      source: 'rappel',
      nature: 'Rappel',
      titre: r.nom ? `Rappeler ${r.nom}` : r.quoi || r.note || 'Rappel',
      detail: r.nom ? r.note && r.note !== r.nom ? r.note : null : null,
      telephone: r.telephone || null,
      echeance: r.echeance,
      dans: dans(r.echeance),
      deal_id: null,
      lien: null,
      // Un rappel se clôt et se supprime : c'est le seul dont on est maître.
      cloturable: true,
    });
  }

  // 2. Les promesses des agents, tenues par le registre des engagements.
  //    Sans échéance, une promesse n'attend rien de datable : on la laisse.
  for (const e of engagementsOuverts()) {
    if (!e.echeance) continue;
    lignes.push({
      id: e.id,
      source: 'promesse',
      nature: 'Promesse',
      titre: e.quoi ? String(e.quoi).slice(0, 120) : 'Document promis',
      detail: e.de || null,
      telephone: null,
      echeance: e.echeance,
      dans: dans(e.echeance),
      deal_id: e.deal_id || null,
      lien: e.deal_id ? `/Analyse?deal_id=${e.deal_id}` : null,
      dossier: sansVerdict(e.dossier) || null,
      cloturable: false,
    });
  }

  // 3. Les dossiers dont la relance est prévue, ou déjà due.
  for (const d of Records.list('Deal')) {
    if (d.archived || !d.relance_prevue_le) continue;
    if (statutDe(d) !== 'documents_demandes') continue;
    lignes.push({
      id: d.deal_id,
      source: 'dossier',
      nature: 'Relance',
      titre: `Relancer ${d.contact_agent_email || 'l’agent'}`,
      detail: titreDeal(d),
      telephone: null,
      echeance: d.relance_prevue_le,
      dans: dans(d.relance_prevue_le),
      deal_id: d.deal_id,
      lien: `/Analyse?deal_id=${d.deal_id}`,
      dossier: titreDeal(d),
      // `aRelancer` dit si la date est franchie ; on garde l'information telle
      // quelle plutôt que de la recalculer côté écran.
      due: aRelancer(d),
      cloturable: false,
    });
  }

  lignes.sort((a, b) => String(a.echeance || '9999').localeCompare(String(b.echeance || '9999')));
  return {
    lignes,
    en_retard: lignes.filter((l) => l.dans != null && l.dans < 0).length,
    aujourdhui: lignes.filter((l) => l.dans === 0).length,
    total: lignes.length,
  };
}
