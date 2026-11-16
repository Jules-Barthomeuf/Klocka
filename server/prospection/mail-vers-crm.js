// Un mail d'agent dans le CRM, dès qu'il arrive (16 nov. 2026, Jules : « dès que le vendeur envoie un mail, il faut que ça
// l'update dans le CRM directement »). Chaque mail relevé (gmail-inbox.js, releverBoite) passe ici : son expéditeur, ou
// l'expéditeur d'origine d'un mail transféré par l'équipe à sourcing@, est cherché parmi les contacts du tableau des agents
// de Twenty CRM (adresse, puis nom) ; trouvé, le mail s'inscrit dans le fil de sa fiche : la date, l'objet, un extrait et
// les pièces jointes. Une fois par mail (`crm_note_le`). Rien sans Twenty branché ; rien pour un mail de l'équipe.

import { Records } from '../db.js';

/** Pure : la ligne écrite dans le fil du contact. */
export function ligneDuMail({ de = null, de_email = null, objet = '', texte = '', pieces = [], date = null }, { transfere_par = null } = {}) {
  const quand = new Date(date || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const extrait = String(texte || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  const nb = (pieces || []).length;
  return [
    `Mail reçu le ${quand} de ${de || de_email || 'l\'agent'}${transfere_par ? ` (transféré par ${transfere_par})` : ''} : « ${String(objet || '(sans objet)').trim()} »`,
    extrait ? `${extrait}${String(texte || '').length > 280 ? '…' : ''}` : null,
    nb ? `${nb} pièce${nb > 1 ? 's' : ''} jointe${nb > 1 ? 's' : ''} : ${(pieces || []).map((p) => p.nom || p.filename).filter(Boolean).slice(0, 4).join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

/** Le mail reçu inscrit sur le contact de l'agent dans Twenty CRM. Rend { etat, texte }. */
export async function mailRecuVersCrm(recu) {
  if (!recu?.id || recu.crm_note_le) return { etat: 'deja' };
  const { referentielTri } = await import('../deal/tri-mails.js');
  const ref = referentielTri();
  const estInterne = (e) => ref.internes.has(String(e || '').toLowerCase()) || ref.domaines.has(String(e || '').toLowerCase().split('@')[1] || '');
  const { agentDeLaFiche } = await import('../deal/fiches-stats.js');
  const agent = agentDeLaFiche({ mail: recu }, estInterne);
  if (!agent?.email) return { etat: 'interne' };
  const MA = await import('./monday-agents.js');
  if (!(await MA.mondayAgentsBranche())) return { etat: 'indisponible' };
  const fiche = Records.list('AgentImmo').find((a) => (a.emails || []).map((x) => String(x).toLowerCase()).includes(agent.email)) || null;
  const toutes = await MA.lignes({ ageMax: 15 * 60000 });
  const m = MA.trouverLigne(toutes, { emails: [agent.email], telephones: fiche?.telephones || [], contact: fiche?.nom || agent.nom || null });
  if (m.etat !== 'trouvee') return { etat: 'absent', texte: `${agent.email} n'est pas un contact du CRM` };
  const transfere = recu.interne || estInterne(recu.de_email) ? String(recu.de_email || '').toLowerCase() : null;
  const { commenter } = await import('../monday.js');
  await commenter(m.ligne.id, ligneDuMail({ ...recu, de: agent.nom, de_email: agent.email, pieces: (recu.pieces_jointes || []).map((p) => (typeof p === 'string' ? { nom: p } : p)) }, { transfere_par: transfere }));
  Records.update('MailRecu', recu.id, { crm_note_le: new Date().toISOString(), crm_ligne: m.ligne.id });
  return { etat: 'ok', ligne: m.ligne.id };
}
