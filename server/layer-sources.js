// Les sources du Layer, phase 9 (16 oct. 2026) : les mails et Monday.
//
// Mails : ceux que la plateforme envoie un par un (sendEmail : le mode appel,
// les demandes de documents, les fiches commerciales) et ceux qu'elle a
// retenus dans la boîte de réception (MailRecu). Chacun entre comme source
// « mail », dédupliqué par son Message-ID, rattaché à l'agent par l'adresse
// (et à son agence, et au dossier quand le mail en porte un). Pas de lecture
// d'une boîte externe au-delà de ce que la relève garde déjà ; les
// newsletters de Resend n'entrent pas : un même texte envoyé à des centaines
// d'adresses n'apprend rien sur personne.
//
// Monday : les changements de statut et les commentaires des tableaux
// Agents immobiliers et Propriétés, reçus par webhook, entrent comme source
// « evenement », rattachés par l'identifiant Monday de la ligne
// (AgentImmo.monday_ligne_id, Deal / Project.monday_item_id). Chaque source
// garde le lien vers sa ligne Monday.

import { fileURLToPath } from 'url';
import { Records } from './db.js';
import { ajouterSource, planifierExtraction, SOURCE } from './layer.js';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const adresses = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((x) => { const m = String(x).match(/<([^>]+)>/); return (m ? m[1] : String(x)).trim().toLowerCase(); }).filter((x) => x.includes('@'));

/** L'agent dont une des adresses est celle-ci, ou null. */
export function agentParAdresse(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return Records.list('AgentImmo').find((a) => (a.emails || []).some((x) => String(x).trim().toLowerCase() === e)) || null;
}

/** L'agence d'un agent, par son nom (AgentImmo.agence est un nom, pas un identifiant). */
export function agenceDe(agent) {
  const n = norm(agent?.agence);
  if (!n) return null;
  return Records.list('AgenceProspect').find((a) => norm(a.nom) === n && (!agent.ville || !a.ville || norm(a.ville) === norm(agent.ville)))
    || Records.list('AgenceProspect').find((a) => norm(a.nom) === n) || null;
}

function liensAgent(agent) {
  if (!agent) return [];
  const agence = agenceDe(agent);
  return [{ type_entite: 'agent', entite_id: agent.id }, agence && { type_entite: 'agence', entite_id: agence.id }].filter(Boolean);
}

function liensDossier(dealId) {
  if (!dealId) return [];
  return Records.findBy('Deal', 'deal_id', dealId) ? [{ type_entite: 'dossier', entite_id: dealId }] : [];
}

const unique = (liens) => { const vus = new Set(); return liens.filter((l) => { const k = `${l.type_entite}:${l.entite_id}`; if (vus.has(k)) return false; vus.add(k); return true; }); };

/**
 * Un mail entre dans le Layer. `sens` : 'envoye' (un EmailLog) ou 'recu' (un MailRecu).
 * Rend la source, ou null (rien à garder : pas parti, vide, sans identifiant).
 */
export function depuisMail(mail, { sens = 'envoye', extraire = true } = {}) {
  if (!mail) return null;
  if (sens === 'envoye' && mail.statut !== 'envoye') return null;
  const id = sens === 'envoye' ? mail.message_id : (mail.message_id_rfc || mail.gmail_message_id);
  const corps = String(sens === 'envoye' ? (mail.body || mail.contenu || '') : (mail.texte || mail.extrait || '')).trim();
  if (!id || !corps) return null;
  const de = sens === 'envoye' ? (mail.expediteur || adresses(mail.from)[0] || null) : (mail.de_email || null);
  const a = sens === 'envoye' ? adresses(mail.to || mail.destinataire) : adresses(mail.compte);
  const objet = String((sens === 'envoye' ? mail.subject || mail.sujet : mail.objet) || '').trim();
  // L'agent : le destinataire d'un mail envoyé, l'expéditeur d'un mail reçu.
  const agents = (sens === 'envoye' ? a : [de]).map(agentParAdresse).filter(Boolean);
  const liens = unique([...agents.flatMap(liensAgent), ...liensDossier(mail.deal_id)]);
  const qui = agents.map((x) => [x.prenom, x.nom_famille].filter(Boolean).join(' ') || x.nom).filter(Boolean).join(', ');
  const entete = `${sens === 'envoye' ? 'Mail envoyé' : 'Mail reçu'} de ${de || 'inconnu'} à ${a.join(', ') || 'inconnu'}${objet ? `, objet « ${objet} »` : ''}.`;
  const s = ajouterSource({
    type: 'mail', auteur: sens === 'envoye' ? de : null, date: (sens === 'envoye' ? mail.sent_at : mail.date) || mail.created_date || null,
    titre: `${sens === 'envoye' ? 'Mail à' : 'Mail de'} ${qui || (sens === 'envoye' ? a[0] : de) || 'inconnu'}${objet ? ` : ${objet}` : ''}`,
    contenu: `${entete}\n\n${corps}`, lien_original: mail.deal_id ? `/Analyse?deal_id=${mail.deal_id}` : (agents[0] ? `/Prospection?agent=${agents[0].id}` : null),
    liens, id_externe: id,
  });
  if (!s.ok) return null;
  if (!s.deja && extraire) planifierExtraction(s.source.id);
  return s.source;
}

// --- Monday ---------------------------------------------------------------------------------

const lienLigne = (board, item) => `https://klocka-company.monday.com/boards/${board}/pulses/${item}`;
const tableaux = () => ({ agents: (process.env.MONDAY_BOARD_AGENTS || '').trim(), proprietes: (process.env.MONDAY_BOARD_PROPRIETES || process.env.MONDAY_BOARD_ECARTES || '').trim() });

/** Le tableau visé ('agents', 'proprietes'), ou null pour un autre tableau. */
export function tableauDe(boardId) {
  const t = tableaux();
  const b = String(boardId || '');
  if (b && b === t.agents) return 'agents';
  if (b && b === t.proprietes) return 'proprietes';
  return null;
}

/** Les fiches qui portent cette ligne Monday. */
export function liensMonday(tableau, itemId) {
  const id = String(itemId || '');
  if (!id) return [];
  if (tableau === 'agents') {
    const agent = Records.list('AgentImmo').find((a) => String(a.monday_ligne_id || '') === id);
    return liensAgent(agent);
  }
  if (tableau === 'proprietes') {
    const deal = Records.list('Deal').find((d) => String(d.monday_item_id || '') === id && !d.supprime);
    const projet = Records.list('Project').find((p) => String(p.monday_item_id || '') === id);
    return [deal && { type_entite: 'dossier', entite_id: deal.deal_id }, projet && { type_entite: 'projet', entite_id: projet.id }].filter(Boolean);
  }
  return [];
}

const NOMS = { agents: 'Agents immobiliers', proprietes: 'Propriétés' };
const texteStatut = (v) => v?.label?.text ?? v?.text ?? null;

/**
 * Un événement du webhook Monday (le corps reçu, `{ event }` ou l'événement seul).
 * Rend { ok, source?, ignore? }.
 */
export function depuisMonday(corps, { extraire = true } = {}) {
  const e = corps?.event || corps;
  if (!e?.type) return { ok: true, ignore: 'sans événement' };
  const tableau = tableauDe(e.boardId);
  if (!tableau) return { ok: true, ignore: 'tableau non suivi' };
  const nom = e.pulseName ? `« ${e.pulseName} »` : `la ligne ${e.pulseId}`;
  let contenu = null;
  let id = null;
  let titre = null;
  if (e.type === 'create_update') {
    const texte = String(e.textBody || '').trim();
    if (!texte) return { ok: true, ignore: 'commentaire vide' };
    id = `update:${e.updateId || e.triggerUuid}`;
    titre = `Commentaire Monday sur ${nom}`;
    contenu = `Commentaire laissé sur Monday, tableau ${NOMS[tableau]}, sur ${nom}${e.replyId ? ' (réponse à un commentaire)' : ''} :\n\n${texte}`;
  } else if (e.type === 'update_column_value' && (e.columnType === 'color' || e.columnType === 'status')) {
    const avant = texteStatut(e.previousValue);
    const apres = texteStatut(e.value);
    if (!apres || apres === avant) return { ok: true, ignore: 'statut inchangé' };
    id = `statut:${e.triggerUuid || `${e.pulseId}:${e.columnId}:${e.triggerTime}`}`;
    titre = `Monday : ${e.pulseName || e.pulseId}, ${e.columnTitle || 'statut'} « ${apres} »`;
    contenu = `Sur Monday, tableau ${NOMS[tableau]}, ${nom} : la colonne « ${e.columnTitle || e.columnId || 'statut'} » passe ${avant ? `de « ${avant} » ` : ''}à « ${apres} ».`;
  } else return { ok: true, ignore: `événement ${e.type} non suivi` };
  const s = ajouterSource({
    type: 'evenement', date: e.triggerTime || null, titre, contenu, lien_original: lienLigne(e.boardId, e.pulseId),
    liens: liensMonday(tableau, e.pulseId), id_externe: `monday:${id}`,
  });
  if (!s.ok) return s;
  if (!s.deja && extraire) planifierExtraction(s.source.id);
  return { ok: true, source: s.source, deja: !!s.deja };
}

/** Le webhook ne s'ouvre qu'avec le jeton du lien (MONDAY_WEBHOOK_JETON) ; sans jeton réglé, il est fermé. */
export function jetonValide(jeton) {
  const attendu = (process.env.MONDAY_WEBHOOK_JETON || '').trim();
  return !!attendu && String(jeton || '') === attendu;
}

/**
 * Pose les webhooks sur les deux tableaux (statut et commentaires). À lancer à
 * la main, une fois, depuis Render : `npm run layer:monday -- https://klocka-unus.onrender.com`.
 */
export async function brancherWebhooks(base, { graphql = null } = {}) {
  const jeton = (process.env.MONDAY_WEBHOOK_JETON || '').trim();
  if (!jeton) throw new Error('MONDAY_WEBHOOK_JETON manque.');
  const url = `${String(base).replace(/\/$/, '')}/api/layer/monday/webhook?jeton=${encodeURIComponent(jeton)}`;
  if (url.length > 255) throw new Error('Lien du webhook trop long pour Monday (255 caractères).');
  const appeler = graphql || (await import('./monday.js')).requeteMonday;
  const poses = [];
  for (const [nom, board] of Object.entries(tableaux())) {
    if (!board) { poses.push({ tableau: nom, error: 'tableau non configuré' }); continue; }
    for (const event of ['change_status_column_value', 'create_update']) {
      const r = await appeler('mutation ($board: ID!, $url: String!, $event: WebhookEventType!) { create_webhook(board_id: $board, url: $url, event: $event) { id board_id } }', { board, url, event });
      poses.push({ tableau: nom, event, id: r?.create_webhook?.id || null });
    }
  }
  return poses;
}

/** L'historique : les mails envoyés et retenus des `jours` derniers jours. L'extraction tourne en fond. */
export function importerMails({ jours = 92 } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const dejaLa = new Set(Records.list(SOURCE).map((s) => s.cle).filter(Boolean));
  let n = 0;
  for (const m of Records.list('EmailLog').filter((x) => x.statut === 'envoye' && String(x.sent_at || x.created_date || '') >= depuis)) {
    if (m.message_id && dejaLa.has(`mail:${m.message_id}`)) continue;
    if (depuisMail(m, { sens: 'envoye' })) n += 1;
  }
  for (const m of Records.list('MailRecu').filter((x) => String(x.date || x.created_date || '') >= depuis)) {
    const id = m.message_id_rfc || m.gmail_message_id;
    if (id && dejaLa.has(`mail:${id}`)) continue;
    if (depuisMail(m, { sens: 'recu' })) n += 1;
  }
  return { ok: true, importes: n };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  if (!base) { console.error('Usage : node server/layer-sources.js https://klocka-unus.onrender.com'); process.exit(1); }
  brancherWebhooks(base).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });
}
