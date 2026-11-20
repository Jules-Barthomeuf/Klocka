// Les échanges par mail avec chaque agent, rangés sur les fiches (19 nov. 2026, Jules : « aller dans ma boîte mail et
// voir les échanges avec chaque agent pour mettre à jour toutes les fiches possibles »).
//
// Pour un agent de la Prospection qui a une adresse : ses mails dans les boîtes lisibles (de lui ou à lui), les plus
// récents d'abord, mis bout à bout comme une note ; l'assistant les lit comme il lit une note liée à l'agent et à ses
// dossiers, et propose ce qu'il en retient. Rien ne s'écrit sur les fiches sans OK : chaque agent donne une note
// « proposée », qui attend dans « Aujourd'hui ». Un agent déjà lu n'est relu que s'il a écrit depuis.
//
// Lancer : node --env-file=.env server/fiche-dossier/mails-agents.js --compte jules.b@klocka.immo [--agent <id>] [--max 20] [--essai]

import { Records } from '../db.js';
import { dossiersQuiNomment } from './modele.js';

const MAX_MAILS = 12;
const MAX_CARACTERES = 14000;
const PAR_MAIL = 1600;

/** Le texte d'un mail sans la partie citée (« Le … a écrit : », « > … ») ni la signature de transfert. */
export function sansCitation(texte) {
  const lignes = String(texte || '').replace(/\r/g, '').split('\n');
  const garde = [];
  for (const l of lignes) {
    if (/^\s*>/.test(l)) continue;
    if (/^\s*(Le .{3,80} a écrit ?:|On .{3,80} wrote:|-{2,}\s*(Message d'origine|Original Message|Forwarded message)|De ?: .+@)/i.test(l)) break;
    garde.push(l);
  }
  return garde.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Les mails mis bout à bout, du plus ancien au plus récent, dans la limite de longueur (le plus récent gardé). */
export function echangesLisibles(mails, agent) {
  const tri = [...mails].filter((m) => m?.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const blocs = tri.map((m) => {
    const deLui = (agent.emails || []).some((e) => String(m.de_email || '').toLowerCase() === String(e).toLowerCase());
    const corps = sansCitation(m.texte || m.extrait).slice(0, PAR_MAIL);
    return `— ${jour(m.date)}, ${deLui ? `de ${agent.nom}` : `de ${m.de || 'Klocka'} à ${agent.nom}`} · objet : ${m.objet || '(sans objet)'}${m.pieces_jointes?.length ? ` · pièces : ${m.pieces_jointes.slice(0, 4).join(', ')}` : ''}\n${corps}`;
  });
  const garde = [];
  let total = 0;
  for (const b of blocs.reverse()) {
    if (total + b.length > MAX_CARACTERES && garde.length) break;
    garde.unshift(b);
    total += b.length;
  }
  return { texte: garde.join('\n\n'), lus: garde.length, du: tri[tri.length - garde.length]?.date || null, au: tri[tri.length - 1]?.date || null };
}

/**
 * Lit les échanges d'un agent et propose une note liée à lui et à ses dossiers.
 * @param {object} agent  un AgentImmo (id, nom, emails)
 * @param {{ comptes: string[], user: object, lister?: Function, lire?: Function, proposer?: Function, maintenant?: Date }} o
 * @returns {Promise<{ agent: string, mails: number, note_id?: string, rien?: string }>}
 */
export async function lireAgent(agent, { comptes, user, lister, lire, proposer, maintenant = new Date() }) {
  const adresses = [...new Set((agent.emails || []).map((e) => String(e).toLowerCase().trim()).filter((e) => e.includes('@')))].slice(0, 3);
  if (!adresses.length) return { agent: agent.nom, mails: 0, rien: 'sans adresse' };
  const deja = Records.findBy('LectureMailsAgent', 'agent_id', agent.id);
  const apres = deja?.jusqu_au ? new Date(deja.jusqu_au) : null;
  const q = `(${adresses.map((e) => `from:${e} OR to:${e}`).join(' OR ')})${apres ? ` after:${Math.floor(apres.getTime() / 1000)}` : ''}`;
  const mails = [];
  for (const compte of comptes) {
    const { ids } = await lister(compte, { q, max: MAX_MAILS });
    for (const id of ids.slice(0, MAX_MAILS)) {
      if (mails.some((m) => m.gmail_message_id === id)) continue;
      mails.push(await lire(compte, id));
    }
  }
  const nouveaux = mails.filter((m) => m?.date && (!apres || new Date(m.date) > apres));
  if (!nouveaux.length) return { agent: agent.nom, mails: 0, rien: apres ? 'rien de neuf' : 'aucun échange' };

  const ech = echangesLisibles(nouveaux, agent);
  const cle = `agent:${agent.id}`;
  const dossiers = dossiersQuiNomment(agent.nom, { emails: adresses }).slice(0, 3);
  const liens = [{ cle, genre: 'agent', nom: agent.nom }, ...dossiers.map((d) => ({ cle: d.cle, genre: 'bien', nom: d.nom }))];
  const texte = `Échanges par mail entre l'équipe Klocka et ${agent.nom} (${ech.lus} mail${ech.lus > 1 ? 's' : ''}, du ${jour(ech.du)} au ${jour(ech.au)}). Ce sont des mails, pas une note : ce qu'ils disent de l'agent va sur sa fiche, ce qu'ils disent d'un dossier lié va sur ce dossier ; les dates sont celles des mails.\n\n${ech.texte}`;
  const r = await proposer({ texte, liens }, user, { maintenant });
  const fin = ech.au || maintenant.toISOString();
  if (deja) Records.update('LectureMailsAgent', deja.id, { jusqu_au: fin, le: maintenant.toISOString(), note_id: r?.note_id || null });
  else Records.create('LectureMailsAgent', { agent_id: agent.id, jusqu_au: fin, le: maintenant.toISOString(), note_id: r?.note_id || null });
  return { agent: agent.nom, mails: ech.lus, note_id: r?.note_id || null, ...(r?.ok === false ? { rien: r.error } : {}) };
}

/** Les agents à lire : ceux qui ont une adresse ; un seul si `agentId`. */
export function agentsALire({ agentId = null } = {}) {
  const tous = Records.champs('AgentImmo', ['nom', 'prenom', 'nom_famille', 'emails']).filter((a) => (a.emails || []).length);
  return (agentId ? tous.filter((a) => a.id === agentId) : tous).map((a) => ({ ...a, nom: a.nom || [a.prenom, a.nom_famille].filter(Boolean).join(' ') || 'Agent' }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
  const comptes = (arg('compte') || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!comptes.length) { console.log('Préciser --compte (une ou plusieurs boîtes séparées par une virgule).'); process.exit(1); }
  const essai = process.argv.includes('--essai');
  const max = Number(arg('max', '0')) || Infinity;
  const { listerMessagesGmail, lireMessage } = await import('../gmail-inbox.js');
  const { proposer } = await import('./ranger.js');
  const user = { email: arg('par', comptes[0]) };
  // L'essai compte seulement : quels agents ont des échanges, sans appeler l'IA ni rien écrire.
  const proposerOuCompter = essai ? async () => ({ ok: true, note_id: null }) : proposer;
  let faits = 0;
  for (const a of agentsALire({ agentId: arg('agent') })) {
    if (faits >= max) break;
    try {
      const r = essai
        ? await (async () => { const { ids } = await listerMessagesGmail(comptes[0], { q: a.emails.map((e) => `from:${e} OR to:${e}`).join(' OR '), max: 50 }); return { agent: a.nom, mails: ids.length }; })()
        : await lireAgent(a, { comptes, user, lister: listerMessagesGmail, lire: lireMessage, proposer: proposerOuCompter });
      if (r.mails) { faits += 1; console.log(`${r.agent} : ${r.mails} mail(s)${r.note_id ? `, note ${r.note_id}` : ''}${r.rien ? ` (${r.rien})` : ''}`); }
    } catch (e) {
      console.log(`${a.nom} : ${e.message}`);
      if (/n'est plus valable|non connecté|expirée/.test(e.message)) break;
    }
  }
  console.log(`${faits} agent(s) avec des échanges${essai ? ' (essai : rien écrit, aucune IA)' : ', une note proposée chacun'}`);
}
