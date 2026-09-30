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
import { listerRappels, titreDuRappel } from './rappels.js';
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

// Les relances de dossiers ne s'affichent qu'à qui les mène : une liste
// d'adresses, Jules par défaut. Les autres voient leurs rappels et les
// promesses, pas ces relances.
export const relancesPour = (brut = process.env.RELANCES_POUR || 'jules.b@klocka.immo') =>
  String(brut).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const voitLesRelances = (user) => relancesPour().includes(String(user?.email || '').toLowerCase());

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
      titre: titreDuRappel(r),
      // Le détail ne répète pas le titre : il ne dit que ce qu'il ajoute.
      detail: r.note && r.note !== r.quoi && r.note !== r.nom ? r.note : null,
      telephone: r.telephone || null,
      echeance: r.echeance,
      dans: dans(r.echeance),
      deal_id: null,
      lien: null,
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
      cloturable: true,
    });
  }

  // 3. Les dossiers dont la relance est prévue, ou déjà due. Pour qui les mène seulement.
  for (const d of voitLesRelances(user) ? Records.list('Deal') : []) {
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
      cloturable: true,
    });
  }

  // 4. L'agent d'une fiche préanalysée : ajouté dans Monday, on l'annonce deux
  //    jours ; sans adresse ou refusé par Monday, la ligne reste tant que le
  //    dossier n'a pas d'agent (deux semaines au plus, puis le dossier le dit seul).
  const maintenant = Date.now();
  for (const d of Records.list('Deal')) {
    const a = d.agent_rattache;
    if (!a?.le || a.vu_le || d.archived || d.test) continue;
    const age = (maintenant - Date.parse(a.le)) / 86400000;
    const qui = a.nom || a.email || 'L’agent';
    let titre = null;
    if (a.etat === 'cree' && age <= 2) titre = `${qui} ajouté dans Monday (Agent immobilier)`;
    else if (a.etat === 'erreur' && age <= 14 && d.contact_agent_email) titre = `${qui} pas encore dans Monday : Monday n'a pas répondu`;
    else if (['sans_email', 'introuvable'].includes(a.etat) && age <= 14 && !d.contact_agent_email) {
      titre = a.etat === 'sans_email' ? `${qui} : son adresse mail manque sur le dossier` : 'Agent introuvable dans la fiche : ajoutez son adresse';
    }
    if (!titre) continue;
    lignes.push({
      id: d.deal_id,
      source: 'agent',
      nature: 'Agent',
      titre,
      detail: [a.email, a.agence].filter(Boolean).join(' · ') || null,
      telephone: a.telephone ? String(a.telephone).replace(/[^\d+]/g, '') : null,
      echeance: a.le,
      dans: null,
      nouveau: true,
      deal_id: d.deal_id,
      lien: `/Analyse?deal_id=${d.deal_id}`,
      dossier: titreDeal(d),
      cloturable: true,
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

/**
 * « Fait » ou « Supprimer » sur une ligne, quelle que soit sa source : une
 * ligne qu'on ne peut pas faire partir finit par cacher celles qui comptent.
 *  - rappel : terminé, ou supprimé ;
 *  - promesse : tenue, ou effacée du registre ;
 *  - relance : faite (la suivante est replanifiée), ou retirée du dossier ;
 *  - agent : l'annonce est lue, elle part (les deux gestes se valent).
 * @param {'rappel'|'promesse'|'dossier'|'agent'} source
 * @param {string} id
 * @param {'fait'|'supprimer'} geste
 */
export async function agirSurLigne(source, id, geste, user) {
  if (!['fait', 'supprimer'].includes(geste)) return { ok: false, error: 'Geste inconnu.' };
  if (source === 'rappel') {
    const { terminerRappel, supprimerRappel } = await import('./rappels.js');
    return geste === 'fait' ? terminerRappel(id, user) : supprimerRappel(id, user);
  }
  if (source === 'promesse') {
    const { clore, effacer } = await import('./deal/engagements.js');
    return geste === 'fait' ? clore(id, { user, commentaire: 'fait depuis le tableau de bord' }) : effacer(id);
  }
  const deal = Records.findBy('Deal', 'deal_id', id);
  if (!deal) return { ok: false, error: 'Dossier introuvable.' };
  if (source === 'dossier') {
    if (!voitLesRelances(user)) return { ok: false, error: 'Relance introuvable.' };
    const { repousserRelance, ajouterSuivi } = await import('./deal/lifecycle.js');
    if (geste === 'fait') return { ok: true, deal: repousserRelance(deal, user) };
    Records.update('Deal', deal.id, { relance_prevue_le: null });
    ajouterSuivi(Records.get('Deal', deal.id), { type: 'relance', detail: 'Relance retirée depuis le tableau de bord' }, user);
    return { ok: true };
  }
  if (source === 'agent') {
    Records.update('Deal', deal.id, { agent_rattache: { ...(deal.agent_rattache || {}), vu_le: new Date().toISOString() } });
    return { ok: true };
  }
  return { ok: false, error: 'Ligne inconnue.' };
}
