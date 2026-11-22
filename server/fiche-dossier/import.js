// L'import des fiches (22 nov. 2026, Jules : « que la version en ligne soit au maximum faite et qu'il ne reste plus que
// quelques éléments que les utilisateurs feront eux-mêmes »). Trois couches :
//   1. le squelette, sans IA : une fiche par dossier actif (identité tirée de la plateforme), par agent appelé (son
//      dernier appel, son analyste), par client de Twenty (clients-twenty.js) ; un dossier abandonné garde sa raison ;
//   2. l'historique, tiré des textes par le même pipeline que les notes (ranger.js, `source`) : les récaps de Google Chat,
//      les exports WhatsApp des groupes de dossier, les appels du mode appel qui parlent d'un bien ; chaque source est
//      datée de son jour, ses consignes passées deviennent de l'histoire (pas des actions), un écart entre deux sources
//      est signalé ;
//   3. la relecture : rangé sans OK, chaque ligne porte l'étiquette « importé », la fiche attend son analyste
//      (modele.js, relecteurDe, validerFiche), qui la relit et clique OK.
// Chaque source n'entre qu'une fois (ImportSource, par sa clé) : relancer un lot ne double rien.
// Lancé depuis Paramètres > Import des fiches, en ligne, là où sont les vraies données.

import crypto from 'crypto';
import { Records } from '../db.js';
import { cleDuBien, fiche, objetDe, rangerNote } from './modele.js';
import { identite } from './dossier.js';
import { proposer } from './ranger.js';
import { lireConversation } from './whatsapp.js';

const SOURCE = 'ImportSource';
const LOT = 'ImportLot';
const empreinte = (t) => crypto.createHash('sha1').update(String(t || '')).digest('hex').slice(0, 20);
const propre = (t, n = 2000) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Une source restée vide (la lecture n'a rien rendu) n'est pas « déjà lue » : relancer l'import la relit.
export const dejaImporte = (cle) => { const d = Records.findBy(SOURCE, 'cle', cle); return !!d && !d.vide; };
const vide = (p) => !p?.titre && !(p?.fiches || []).length && !(p?.mentions || []).length;

// ---------------------------------------------------------------------------
// Les règles de travail d'une note : proposées au Cerveau, à valider (22 nov. 2026).
// ---------------------------------------------------------------------------

const PORTEE = { prospection: 'En prospection', dossiers: 'Sur les dossiers', general: 'Règle' };

/** Les règles gardées d'une note rangée, en savoirs du Cerveau qui attendent la validation de Jules. */
export async function garderRegles(note, user = null) {
  const regles = note?.creees?.regles || [];
  if (!regles.length) return { ok: true, regles: 0 };
  const { ajouterSource, rangerFaits } = await import('../layer.js');
  let n = 0;
  regles.forEach((r, i) => {
    const s = ajouterSource({ type: 'debrief', auteur: user?.email || note.par, date: note.le, titre: `Règle : ${r.texte}`.slice(0, 80), contenu: r.texte, cle: `regle:${note.id}:${i}` });
    if (!s.ok || s.deja) return;
    n += rangerFaits(s.source, [{ type: 'savoir', resume: `${PORTEE[r.portee] || 'Règle'} : ${r.texte}`, citation: r.texte, personne: user?.email || note.par || null, entites: [] }]).faits.length;
  });
  return { ok: true, regles: n };
}

// ---------------------------------------------------------------------------
// 1. Le squelette, sans IA.
// ---------------------------------------------------------------------------

const ACTIFS = new Set(['analyse', 'projet_cree', 'depouille', 'preanalyse', 'en_cours', 'offre', 'compromis']);

/** Pure : le résumé d'un bien tiré de son identité (« Murs d'une boulangerie à Lorient, 320 k€, loyer 24 k€ par an… »). */
export function resumeDuBien(id, nom) {
  if (!id) return null;
  const quoi = [id.activite ? `Murs ${/^[aeiouyh]/i.test(id.activite) ? "d'" : 'de '}${id.activite}` : null, id.locataire ? `loués à ${id.locataire}` : null].filter(Boolean).join(', ');
  const ou = id.adresse || id.ville;
  const chiffres = [id.prix_lisible ? `prix ${id.prix_lisible}` : null, id.loyer_lisible ? `loyer ${id.loyer_lisible}` : null, id.rendement_lisible ? `rendement ${id.rendement_lisible}` : null, id.surface ? `${id.surface} m²` : null, id.bail ? `bail jusqu'à ${id.bail}` : null].filter(Boolean).join(', ');
  const phrases = [
    quoi || ou ? `${quoi || nom}${ou ? ` ${quoi ? 'à' : '·'} ${ou}` : ''}.` : null,
    chiffres ? `${chiffres.charAt(0).toUpperCase()}${chiffres.slice(1)}.` : null,
  ].filter(Boolean);
  return phrases.length ? phrases.join(' ') : null;
}

/** La raison d'un abandon, dans le suivi du dossier (« Abandon : rendement trop bas »). */
function raisonAbandon(deal) {
  const s = [...(deal?.suivi || [])].reverse().find((x) => x?.vers === 'abandonne' || /abandon/i.test(x?.detail || ''));
  const d = propre(s?.raison || s?.motif || s?.detail || '', 200).replace(/^abandon(né)?\s*(depuis la liste)?\s*:?\s*/i, '');
  return d || null;
}

/** Pure : le résumé d'un agent tiré de son dernier appel. */
export function resumeDeLAgent(agent, appel) {
  const qui = [agent.agence ? `Agent chez ${agent.agence}` : 'Agent immobilier', agent.ville ? `à ${agent.ville}` : null].filter(Boolean).join(' ');
  const dernier = appel ? `Dernier appel le ${new Date(appel.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}${appel.par ? ` par ${String(appel.par).split('@')[0].split('.')[0].replace(/^./, (x) => x.toUpperCase())}` : ''}.` : null;
  const ce = propre(appel?.resume || appel?.passe || '', 500);
  return [`${qui}.`, dernier, ce || null].filter(Boolean).join(' ');
}

/**
 * Le squelette : une fiche pour chaque dossier actif et chaque agent appelé, sans IA ; un dossier abandonné garde sa
 * raison. Une fiche déjà résumée (par les notes) n'est jamais réécrite. Rend les comptes.
 */
export function squelette() {
  const compte = { biens: 0, biens_remplis: 0, abandons: 0, agents: 0, agents_remplis: 0 };
  for (const d of Records.list('Deal')) {
    if (d.archived) continue;
    const cle = cleDuBien({ deal_id: d.deal_id });
    if (!cle) continue;
    const actif = ACTIFS.has(d.statut) || (!d.statut && !d.archived);
    const abandon = d.statut === 'abandonne';
    if (!actif && !abandon) continue;
    const existe = Records.findBy('FicheDossier', 'cle', cle);
    if (abandon) {
      // Rien pour un dossier abandonné, hormis la raison (Jules) : elle dit à l'assistant nos critères.
      const raison = raisonAbandon(d);
      if (!raison || existe?.etat) continue;
      const f = existe || fiche(cle, { genre: 'bien' });
      Records.update('FicheDossier', f.id, { etape: 'Abandonné', etat: raison, source: f.source || 'plateforme' });
      compte.abandons += 1;
      continue;
    }
    const f = existe || fiche(cle, { genre: 'bien' });
    if (!existe) compte.biens += 1;
    if (!f.resume) {
      const o = objetDe(cle);
      const projet = d.projet_id ? Records.get('Project', d.projet_id) : null;
      const r = resumeDuBien(identite({ deal: d, projet }), o?.nom || f.nom);
      if (r) { Records.update('FicheDossier', f.id, { resume: r, source: f.source || 'plateforme' }); compte.biens_remplis += 1; }
    }
  }
  // Les agents : ceux qu'on a appelés, leur dernier appel ; leur historique viendra des appels suivants (Jules).
  const parAgent = new Map();
  for (const a of Records.list('AppelAgent')) {
    if (!a.agent_id) continue;
    const p = parAgent.get(a.agent_id);
    if (!p || String(a.le) > String(p.le)) parAgent.set(a.agent_id, a);
  }
  for (const [id, appel] of parAgent) {
    const agent = Records.get('AgentImmo', id);
    if (!agent) continue;
    const cle = `agent:${id}`;
    const existe = Records.findBy('FicheDossier', 'cle', cle);
    const f = existe || fiche(cle, { genre: 'agent', nom: agent.nom });
    if (!existe) compte.agents += 1;
    if (!f.resume) { Records.update('FicheDossier', f.id, { resume: resumeDeLAgent(agent, appel), source: f.source || 'prospection' }); compte.agents_remplis += 1; }
  }
  return compte;
}

/** Les clients de Twenty (en ligne seulement : Twenty est là-bas) ; sans Twenty, rien. */
export async function clientsDeTwenty() {
  const { remplirClients } = await import('./clients-twenty.js');
  const { requeteTwenty } = await import('../twenty.js');
  const tous = [];
  let apres = null;
  for (let page = 0; page < 40; page += 1) {
    const r = await requeteTwenty('GET', `/clientsListe?limit=60&depth=0${apres ? `&starting_after=${apres}` : ''}`);
    const l = r?.data?.clientsListe || [];
    tous.push(...l);
    if (!r?.pageInfo?.hasNextPage || !l.length) break;
    apres = r.pageInfo.endCursor;
  }
  return { lus: tous.length, ...remplirClients(tous) };
}

// ---------------------------------------------------------------------------
// 2. L'historique : une source passée, lue et rangée sans OK, marquée « importé ».
// ---------------------------------------------------------------------------

/**
 * Une source : un texte (un récap, un compte rendu) ou une conversation WhatsApp exportée. `source` : { genre, de, le,
 * lieu }. `liens` : les fiches qu'on sait déjà (un appel : l'agent) ; sans, elles sont devinées par les noms.
 */
export async function importerTexte({ texte = '', conversation = null, source, liens = [], cle = null, vous = null }, user, { lire = null } = {}) {
  const k = cle || `texte:${empreinte(`${texte}${conversation || ''}`)}`;
  if (dejaImporte(k)) return { ok: true, deja: true };
  let r = await proposer({ texte, liens, conversation, libre: !liens.length, source, vous }, user, { lire });
  // Une lecture qui ne rend rien du tout (22 nov. 2026, un groupe WhatsApp rendu vide puis bien lu au second essai) : une
  // seconde lecture ; la première note reste, écartée.
  if (r.ok && vide(r.proposition)) {
    if (r.note_id) Records.update('NoteDossier', r.note_id, { etat: 'ecartee', ecartee_le: new Date().toISOString() });
    r = await proposer({ texte, liens, conversation, libre: !liens.length, source, vous }, user, { lire });
  }
  if (!r.ok) return r;
  const note = Records.get('NoteDossier', r.note_id);
  const fiches = (note?.liens || []).length;
  const rangee = fiches ? rangerNote(note, {}, user, { maintenant: () => new Date(note.source?.le || note.le) }) : { ok: true, entrees: 0 };
  if (!fiches) Records.update('NoteDossier', note.id, { etat: 'ecartee', ecartee_le: new Date().toISOString() });
  // Les dossiers et les personnes que la source nomme sans qu'on leur trouve de fiche : dits dans le compte rendu du lot,
  // pour les rentrer à la main (un dossier jamais créé dans la plateforme, un agent hors de la Prospection).
  const manquants = (note?.proposition?.mentions || []).filter((m) => !(m.candidats || []).length).map((m) => m.texte);
  const ancienne = Records.findBy(SOURCE, 'cle', k);
  const ligne = { cle: k, genre: source?.genre || 'texte', note_id: note?.id || null, fiches, entrees: rangee.entrees || 0, manquants, le: new Date().toISOString(), de: source?.de || null, du: source?.le || null, vide: vide(note?.proposition) };
  if (ancienne) Records.update(SOURCE, ancienne.id, ligne); else Records.create(SOURCE, ligne);
  return { ok: true, note_id: note?.id, fiches: (note?.liens || []).map((l) => l.nom), entrees: rangee.entrees || 0, manquants };
}

/** Pure : les messages d'une conversation Google Chat regroupés par auteur, tant qu'ils se suivent à moins de 45 min. */
export function grouperMessages(messages, { ecartMin = 45, minimum = 60 } = {}) {
  const groupes = [];
  for (const m of [...messages].sort((a, b) => String(a.le).localeCompare(String(b.le)))) {
    const texte = String(m.texte || '').trim();
    if (!texte) continue;
    const g = groupes[groupes.length - 1];
    const meme = g && g.auteur === (m.auteur?.affiche || m.auteur?.nom) && (Date.parse(m.le) - Date.parse(g.fin)) / 60000 <= ecartMin;
    if (meme) { g.textes.push(texte); g.fin = m.le; g.noms.push(m.nom); } else groupes.push({ auteur: m.auteur?.affiche || m.auteur?.nom || null, le: m.le, fin: m.le, textes: [texte], noms: [m.nom] });
  }
  return groupes.map((g) => ({ ...g, texte: g.textes.join('\n\n') })).filter((g) => g.texte.length >= minimum);
}

// Google Chat, par un compte connecté avec la portée Chat (le compte d'AK par défaut, ou celui de la personne qui reçoit
// les récaps) : la conversation entière, page par page.
async function appelerChat(compteEmail, chemin, params) {
  const { accessTokenFor, storedAccount } = await import('../google-oauth.js');
  const a = storedAccount(compteEmail);
  if (!a) throw new Error(`Le compte ${compteEmail} n'est pas connecté à Klocka.`);
  if (!a.peut_chat) throw new Error(`Le compte ${compteEmail} est connecté sans la portée Google Chat : reconnectez-le avec GOOGLE_CHAT=true.`);
  const token = await accessTokenFor(Records.get('MailAccount', a.id) || a);
  const r = await fetch(`https://chat.googleapis.com/v1/${chemin}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google Chat a répondu ${r.status} : ${j?.error?.message || ''}`.trim());
  return j;
}

/** Les conversations Google Chat que le compte voit, pour choisir celle des récaps. */
export async function espacesChat(compteEmail) {
  const out = [];
  let page = null;
  for (let i = 0; i < 10; i += 1) {
    const j = await appelerChat(compteEmail, 'spaces', { pageSize: '200', ...(page ? { pageToken: page } : {}) });
    out.push(...(j.spaces || []).map((s) => ({ nom: s.name, titre: s.displayName || (s.spaceType === 'DIRECT_MESSAGE' ? 'Message privé' : s.name), type: s.spaceType || null })));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

/** Les messages d'une conversation, du plus ancien au plus récent, depuis une date. */
export async function messagesChat(compteEmail, espace, { depuis = null, max = 3000 } = {}) {
  const { lireMessage } = await import('../ak/chat.js');
  const out = [];
  let page = null;
  while (out.length < max) {
    const j = await appelerChat(compteEmail, `${espace}/messages`, { pageSize: '1000', orderBy: 'createTime asc', ...(depuis ? { filter: `createTime > "${new Date(depuis).toISOString()}"` } : {}), ...(page ? { pageToken: page } : {}) });
    out.push(...(j.messages || []).map(lireMessage));
    if (!j.nextPageToken) break;
    page = j.nextPageToken;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Les lots : lancés depuis Paramètres, suivis à l'écran, un à la fois par genre.
// ---------------------------------------------------------------------------

const enCours = new Set();

/** Lance un lot en tâche de fond ; rend son identifiant. `taches` : des fonctions qui rangent une source chacune. */
function lancerLot(genre, titre, taches, user) {
  if (enCours.has(genre)) return { ok: false, error: 'Un import de ce genre tourne déjà.' };
  const lot = Records.create(LOT, { genre, titre, par: user?.email || null, etat: 'en_cours', total: taches.length, faits: 0, deja: 0, fiches: 0, entrees: 0, erreurs: [], le: new Date().toISOString() });
  enCours.add(genre);
  (async () => {
    const c = { faits: 0, deja: 0, fiches: new Set(), entrees: 0, erreurs: [], manquants: new Map() };
    for (const t of taches) {
      try {
        const r = await t();
        if (r?.deja) c.deja += 1;
        else if (r?.ok === false) c.erreurs.push(propre(r.error, 200));
        else { c.faits += 1; c.entrees += r?.entrees || 0; for (const f of r?.fiches || []) c.fiches.add(f); for (const m of r?.manquants || []) c.manquants.set(m.toLowerCase(), m); }
      } catch (e) { c.erreurs.push(propre(e?.message || e, 200)); }
      Records.update(LOT, lot.id, { faits: c.faits, deja: c.deja, fiches: c.fiches.size, entrees: c.entrees, erreurs: c.erreurs.slice(-20), manquants: [...c.manquants.values()].slice(0, 40) });
    }
    Records.update(LOT, lot.id, { etat: 'fini', fini_le: new Date().toISOString() });
  })().catch((e) => Records.update(LOT, lot.id, { etat: 'echec', erreurs: [propre(e?.message || e, 200)] })).finally(() => enCours.delete(genre));
  return { ok: true, lot_id: lot.id, total: taches.length };
}

/** Les récaps d'une conversation Google Chat : un groupe de messages d'un même auteur, une source. */
export async function lancerGoogleChat({ compte, espace, titre = null, depuis = null, auteurs = [] }, user) {
  const messages = await messagesChat(compte, espace, { depuis });
  const voulus = (auteurs || []).map((a) => String(a).toLowerCase()).filter(Boolean);
  const groupes = grouperMessages(messages).filter((g) => !voulus.length || voulus.some((v) => String(g.auteur || '').toLowerCase().includes(v)));
  const taches = groupes.map((g) => () => importerTexte({ texte: g.texte, source: { genre: 'google_chat', de: g.auteur, le: g.le, lieu: titre ? `Google Chat, « ${titre} »` : 'Google Chat' }, cle: `gchat:${g.noms[0]}` }, user));
  return { ...lancerLot('google_chat', `Google Chat${titre ? ` · ${titre}` : ''}`, taches, user), messages: messages.length, groupes: groupes.length };
}

/**
 * Des exports WhatsApp : un groupe par dossier, le nom du groupe aide à le trouver. `exportePar` : qui les a exportés
 * (« Vous » dans le fichier) ; sans, celui qui importe.
 */
export function lancerWhatsapp(fichiers, user, { exportePar = null } = {}) {
  const vous = propre(exportePar, 80) || user?.full_name || null;
  const lus = (fichiers || []).map((f) => {
    const texte = String(f?.texte || '');
    const conv = texte ? lireConversation(texte, { vous }) : null;
    const nom = conv?.titre || propre(f?.nom, 120).replace(/\.(txt|zip|md)$/i, '').replace(/^(Discussion WhatsApp avec|WhatsApp Chat with)\s+/i, '');
    return conv ? { nom: propre(nom, 120), texte, conv } : null;
  }).filter(Boolean);
  const taches = lus.map((f) => () => importerTexte({ texte: `Groupe WhatsApp « ${f.nom} »`, conversation: f.texte, vous, source: { genre: 'whatsapp', de: null, le: f.conv.au, lieu: `groupe WhatsApp « ${f.nom} »` }, cle: `wa:${empreinte(f.texte)}` }, user));
  return { ...lancerLot('whatsapp', `WhatsApp · ${lus.length} groupe${lus.length > 1 ? 's' : ''}`, taches, user), lus: lus.length, ignores: (fichiers || []).length - lus.length };
}

/** Des textes collés (des récaps hors de Google Chat), datés à la main. */
export function lancerTextes(textes, user) {
  const taches = (textes || []).filter((t) => propre(t?.texte).length >= 40).map((t) => () => importerTexte({ texte: String(t.texte), source: { genre: 'texte', de: propre(t.de, 80) || null, le: t.le || new Date().toISOString(), lieu: propre(t.lieu, 80) || null } }, user));
  return lancerLot('texte', `Textes collés · ${taches.length}`, taches, user);
}

/** Les appels du mode appel qui ont parlé d'un bien : rangés sur l'agent et les dossiers qu'ils nomment. */
export function lancerAppels(user, { depuis = null } = {}) {
  const appels = Records.list('AppelAgent').filter((a) => a.agent_id && (!depuis || String(a.le) >= depuis))
    .filter((a) => Array.isArray(a.biens) ? a.biens.length > 0 : !!a.biens)
    .filter((a) => propre([a.notes, a.recit, a.transcription_gardee, a.transcription].filter((x) => typeof x === 'string').join(' ')).length >= 80 || propre(a.resume).length >= 80);
  const taches = appels.map((a) => () => {
    const agent = Records.get('AgentImmo', a.agent_id);
    const texte = [a.resume ? `Résumé de l'appel : ${a.resume}` : null, Array.isArray(a.biens) && a.biens.length ? `Biens évoqués : ${a.biens.join(' ; ')}` : null, typeof a.notes === 'string' ? `Notes : ${a.notes}` : null, typeof a.transcription_gardee === 'string' ? `Transcription : ${a.transcription_gardee}` : typeof a.transcription === 'string' ? `Transcription : ${a.transcription}` : null].filter(Boolean).join('\n\n');
    return importerTexte({ texte, liens: agent ? [{ cle: `agent:${agent.id}`, genre: 'agent', nom: agent.nom }] : [], source: { genre: 'appel', de: a.par ? String(a.par).split('@')[0] : null, le: a.le, lieu: `appel avec ${a.agent || agent?.nom || "l'agent"}` }, cle: `appel:${a.id}` }, user);
  });
  return lancerLot('appels', `Appels · ${appels.length}`, taches, user);
}

/** Où en sont les imports : les derniers lots et ce qui attend une relecture. */
export function etatImport() {
  const lots = Records.list(LOT).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 12);
  const aRelire = Records.filter('FicheDossier', { a_relire: true }).length;
  return { lots, a_relire: aRelire, sources: Records.list(SOURCE).length };
}
