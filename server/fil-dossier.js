// Le fil d'un dossier mandataire : la conversation entre le mandataire et
// l'analyste Klocka qui suit son bien, du mandat signé à la décision. Un seul
// fil par bien, vu à deux endroits (page Dossier du mandataire, dossier dans
// Analyse). Il ne dépend pas d'un analyste : quand celui-ci est absent (son
// « Absent du bureau » Google, ou son absence déclarée sur sa page Compte),
// le dossier passe à un analyste présent, qui reçoit un briefing écrit par
// l'IA ; au retour, le dossier revient à son titulaire.

import { Records, Meta } from './db.js';

// L'équipe d'analyse. Jules, le 2 octobre 2026.
export const ANALYSTES = [
  { nom: 'Maxime', email: 'maxime.p@klocka.immo' },
  { nom: 'Nora', email: 'nora.l@klocka.immo' },
  { nom: 'Coralie', email: 'coralie.g@klocka.immo' },
  { nom: 'Jules', email: 'jules.b@klocka.immo' },
];
const ENTITE = 'MessageDossier';
const DOSSIERS = 'DossierMandataire';
const OUVERTS = new Set(['documents_en_cours', 'complet', 'complements', 'en_etude']);
const maintenant = () => new Date().toISOString();
const bas = (e) => String(e || '').toLowerCase();

export const nomAnalyste = (email) => ANALYSTES.find((a) => a.email === bas(email))?.nom
  || Records.list('User').find((u) => bas(u.email) === bas(email))?.full_name?.split(' ')[0]
  || String(email || '').split('@')[0] || 'Klocka';

const chargeDe = (email) => Records.list(DOSSIERS).filter((d) => bas(d.analyste_email) === bas(email) && OUVERTS.has(d.statut)).length;

// --- L'absence ----------------------------------------------------------------

/** Pure : un événement Google est-il une absence (« Absent du bureau », ou une journée de congés) ? */
export function estAbsence(ev) {
  if (!ev || ev.status === 'cancelled') return false;
  const titre = String(ev.summary || '');
  return ev.eventType === 'outOfOffice'
    || (!!ev.start?.date && /cong|absen|vacanc|\bo+o+\b|\boff\b|\brtt\b|repos|maladie|férié|ferie/i.test(titre));
}

/** Pure : un événement Google est-il une absence qui couvre `quand` ? */
export function evenementDAbsence(ev, quand = new Date()) {
  if (!estAbsence(ev)) return null;
  const debut = new Date(ev.start?.dateTime || ev.start?.date || 0);
  const fin = new Date(ev.end?.dateTime || ev.end?.date || 0);
  if (!(debut <= quand && quand < fin)) return null;
  return { jusqu_au: fin.toISOString(), titre: String(ev.summary || '') };
}

/** Pure : la prochaine absence qui commence dans les `jours` à venir. */
export function prochaineAbsence(evs, quand = new Date(), jours = 7) {
  const limite = quand.getTime() + jours * 86400000;
  return (evs || []).filter(estAbsence)
    .map((ev) => ({ debut: new Date(ev.start?.dateTime || ev.start?.date || 0), fin: new Date(ev.end?.dateTime || ev.end?.date || 0), titre: String(ev.summary || '') }))
    .filter((a) => a.debut > quand && a.debut.getTime() < limite)
    .sort((x, y) => x.debut - y.debut)
    .map((a) => ({ du: a.debut.toISOString(), jusqu_au: a.fin.toISOString(), titre: a.titre }))[0] || null;
}

/** L'agenda Google de l'analyste sur la semaine : son absence en cours, la prochaine. Cache 30 min. */
async function lireAgenda(email) {
  const cle = `agenda-semaine:${bas(email)}`;
  try {
    const cache = JSON.parse(Meta.get(cle) || 'null');
    if (cache && Date.now() - cache.lu < 30 * 60000) return cache;
  } catch { /* cache illisible : on relit */ }
  const compte = Records.filter('AgendaAnalyste', { owner_email: bas(email) })[0];
  if (!compte) return { connecte: false, absence: null, prochaine: null };
  const lu = { lu: Date.now(), connecte: true, lisible: false, absence: null, prochaine: null };
  try {
    const { accessTokenFor } = await import('./google-oauth.js');
    const jeton = await accessTokenFor(compte, 'AgendaAnalyste');
    const debut = new Date(Date.now() - 36 * 3600000).toISOString();
    const fin = new Date(Date.now() + 8 * 86400000).toISOString();
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${encodeURIComponent(debut)}&timeMax=${encodeURIComponent(fin)}&maxResults=250`, {
      headers: { Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const evs = (await r.json()).items || [];
      lu.lisible = true;
      for (const ev of evs) {
        const a = evenementDAbsence(ev);
        if (a && (!lu.absence || a.jusqu_au > lu.absence.jusqu_au)) lu.absence = { ...a, source: 'agenda' };
      }
      lu.prochaine = prochaineAbsence(evs);
    } else {
      console.warn(`[fil] agenda de ${email} illisible : ${r.status}`);
    }
  } catch (e) {
    console.warn(`[fil] agenda de ${email} :`, e?.message || e);
  }
  Meta.set(cle, JSON.stringify(lu));
  return lu;
}

const absenceAgenda = async (email) => (await lireAgenda(email)).absence;

/** L'analyste est-il absent maintenant ? L'absence déclarée prime sur l'agenda. */
export async function absenceDe(email) {
  const u = Records.list('User').find((x) => bas(x.email) === bas(email));
  if (u?.absent_jusqu_au && Date.parse(u.absent_jusqu_au) > Date.now()) return { jusqu_au: u.absent_jusqu_au, source: 'manuel' };
  return absenceAgenda(email);
}

/**
 * Les analystes qu'un mandataire peut choisir en transférant un dossier :
 * disponibles cette semaine, c'est-à-dire avec leur agenda connecté et
 * présents. Les autres sont rendus aussi, avec la raison, pour être grisés.
 */
export async function analystesDisponibles() {
  const liste = [];
  for (const a of ANALYSTES) {
    const u = Records.list('User').find((x) => bas(x.email) === a.email);
    const manuel = u?.absent_jusqu_au && Date.parse(u.absent_jusqu_au) > Date.now() ? { jusqu_au: u.absent_jusqu_au } : null;
    const agenda = await lireAgenda(a.email);
    const absence = manuel || agenda.absence;
    const disponible = agenda.connecte && !absence;
    const date = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
    const raison = !agenda.connecte ? 'Agenda pas encore connecté'
      : absence ? `Absent jusqu'au ${date(absence.jusqu_au)}`
        : agenda.prochaine ? `Disponible, absent à partir du ${date(agenda.prochaine.du)}`
          : 'Disponible cette semaine';
    liste.push({ email: a.email, nom: a.nom, disponible, raison, charge: chargeDe(a.email), photo: u?.picture || null });
  }
  return liste;
}

// --- L'attribution ------------------------------------------------------------


/** L'analyste présent qui suit le moins de dossiers ouverts. */
export async function analystePresent(sauf = []) {
  const candidats = [];
  for (const a of ANALYSTES) {
    if (sauf.map(bas).includes(a.email)) continue;
    if (await absenceDe(a.email)) continue;
    candidats.push({ ...a, charge: chargeDe(a.email) });
  }
  candidats.sort((x, y) => x.charge - y.charge);
  return candidats[0] || null;
}

/** L'analyste titulaire d'un dossier : celui de la fiche du mandataire, sinon le moins chargé. */
export async function attribuer(dossierId) {
  const d = Records.get(DOSSIERS, dossierId);
  if (!d) return null;
  if (d.analyste_titulaire) return d;
  const fiche = Records.list('FicheMandataire').find((f) => f.email === bas(d.mandataire_email));
  const titulaire = bas(fiche?.analyste_email) || (await analystePresent())?.email || ANALYSTES[0].email;
  return Records.update(DOSSIERS, d.id, { analyste_titulaire: titulaire, analyste_email: titulaire });
}

// --- Les messages -------------------------------------------------------------

/** Un message du fil. `interne` : seulement visible de Klocka (briefings). */
export function poserMessage(dossierId, { auteur_email = null, cote = 'systeme', texte, pieces = [], interne = false, genre = 'message' }) {
  const t = String(texte || '').trim();
  if (!t && !pieces.length) return null;
  return Records.create(ENTITE, {
    dossier_id: dossierId, auteur_email: bas(auteur_email) || null, cote, genre, interne: !!interne,
    texte: t.slice(0, 6000), pieces: pieces.slice(0, 10), le: maintenant(), lu_par: auteur_email ? [bas(auteur_email)] : [],
  });
}

/** Un événement du dossier, écrit dans le fil (« pièce reçue », « Go »…). */
export const evenement = (dossierId, texte) => poserMessage(dossierId, { cote: 'systeme', genre: 'evenement', texte });

/** Le fil vu d'un côté : le mandataire ne voit pas les notes internes. */
export function filDe(dossierId, { pourKlocka = false } = {}) {
  return Records.list(ENTITE)
    .filter((m) => m.dossier_id === dossierId && (pourKlocka || !m.interne))
    .sort((a, b) => String(a.le).localeCompare(String(b.le)));
}

export function marquerLu(dossierId, email) {
  for (const m of Records.list(ENTITE).filter((x) => x.dossier_id === dossierId && !(x.lu_par || []).includes(bas(email)))) {
    Records.update(ENTITE, m.id, { lu_par: [...(m.lu_par || []), bas(email)] });
  }
}

const nonLus = (dossierId, email, pourKlocka) => filDe(dossierId, { pourKlocka }).filter((m) => !(m.lu_par || []).includes(bas(email)) && m.genre !== 'evenement').length;
export { nonLus };

// --- Le briefing --------------------------------------------------------------

/** Le briefing d'un dossier pour l'analyste qui le reprend, écrit par l'IA. */
export async function briefing(dossierId, { pour = null, motif = 'reprise' } = {}) {
  const d = Records.get(DOSSIERS, dossierId);
  if (!d) return null;
  const { checklist } = await import('./mandataire-portes.js');
  const c = checklist(d);
  const deal = d.deal_id ? Records.findBy('Deal', 'deal_id', d.deal_id) : null;
  const verdict = deal?.lots?.[0]?.evaluation?.verdict || null;
  const fil = filDe(dossierId, { pourKlocka: true }).filter((m) => m.genre !== 'briefing').slice(-30)
    .map((m) => `[${String(m.le).slice(0, 16).replace('T', ' ')}] ${m.cote === 'mandataire' ? 'Mandataire' : m.cote === 'analyste' ? `Analyste (${nomAnalyste(m.auteur_email)})` : 'Événement'} : ${m.texte}`).join('\n');
  const faits = [
    `Bien : ${d.bien}${d.adresse ? `, ${d.adresse}` : ''}`,
    `Mandataire : ${d.mandataire_email}`,
    `Statut : ${d.statut}${d.commentaire ? ` (${d.commentaire})` : ''}`,
    `Pièces reçues : ${c.lignes.filter((l) => l.recue).map((l) => l.mot).join(', ') || 'aucune'}`,
    `Pièces manquantes : ${c.manquantes.map((m) => m.mot).join(', ') || 'aucune'}`,
    verdict ? `Verdict de la préanalyse : ${verdict}` : null,
  ].filter(Boolean).join('\n');
  let texte = null;
  try {
    const { invokeLLM } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    const { resultat } = await mesurer({ operation: 'fil dossier', par: pour }, () => invokeLLM({
      prompt: `Tu briefes un analyste immobilier de Klocka qui ${motif === 'retour' ? 'revient de son absence et reprend' : 'reprend au pied levé'} le dossier d'un mandataire K Partners. En 5 à 8 lignes courtes, sans formule : où en est le dossier, ce qui a été reçu et ce qui manque, ce qui a été décidé ou promis, la question en suspens et ce que le mandataire attend maintenant. N'invente rien.\n\nFAITS :\n${faits}\n\nFIL (du plus ancien au plus récent) :\n${fil || '(aucun message)'}`,
      response_json_schema: { type: 'object', properties: { briefing: { type: 'string' } }, required: ['briefing'] },
    }));
    // Une réponse illisible revient en bouche-trou (« [IA non configurée] ») : ce n'est pas un briefing.
    texte = resultat?.briefing && !/^\[IA /.test(resultat.briefing) ? resultat.briefing : null;
  } catch (e) {
    console.warn('[fil] briefing :', e?.message || e);
  }
  // Sans modèle, le briefing reste utile : les faits, tels quels.
  texte = texte || `Où en est le dossier :\n${faits}`;
  return poserMessage(dossierId, { cote: 'systeme', genre: 'briefing', interne: true, texte: `Briefing pour ${nomAnalyste(pour)} : ${texte}` });
}

// --- Le relais ----------------------------------------------------------------

async function notifier(pour, titre, texte, lien) {
  const { notifier: n } = await import('./notifications.js');
  n({ pour, titre, texte, lien, action: 'Ouvrir', cle: `fil:${pour}:${titre}:${Date.now()}` });
}

/**
 * Passe le dossier à un analyste présent si le sien est absent, et le rend à
 * son titulaire à son retour. Prévient tout le monde, briefe le repreneur.
 */
export async function verifierRelais(dossierId) {
  let d = Records.get(DOSSIERS, dossierId);
  if (!d || !OUVERTS.has(d.statut)) return { change: false };
  if (!d.analyste_titulaire) d = await attribuer(d.id);
  const actuel = bas(d.analyste_email);
  const titulaire = bas(d.analyste_titulaire);

  // Retour du titulaire : il reprend son dossier.
  if (actuel !== titulaire && !(await absenceDe(titulaire))) return transferer(d.id, titulaire, { motif: 'retour' });

  const absence = await absenceDe(actuel);
  if (!absence) return { change: false };
  const relais = await analystePresent([actuel]);
  if (!relais) return { change: false, personne: true };
  return transferer(d.id, relais.email, { motif: 'absence', jusqu_au: absence.jusqu_au });
}

/** Le passage de relais, automatique ou demandé à la main. */
export async function transferer(dossierId, versEmail, { motif = 'manuel', jusqu_au = null, par = null } = {}) {
  const d = Records.get(DOSSIERS, dossierId);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const vers = bas(versEmail);
  if (!ANALYSTES.some((a) => a.email === vers)) return { ok: false, error: 'Analyste inconnu.' };
  if (bas(d.analyste_email) === vers) return { ok: true, change: false };
  const avant = d.analyste_email;
  Records.update(DOSSIERS, d.id, {
    analyste_email: vers,
    ...(motif === 'manuel' ? { analyste_titulaire: vers } : {}),
    relais: motif === 'absence' ? { de: avant, jusqu_au, le: maintenant() } : null,
  });
  // Le dossier d'analyse suit : il est « chez » le nouvel analyste.
  const deal = d.deal_id ? Records.findBy('Deal', 'deal_id', d.deal_id) : null;
  if (deal) Records.update('Deal', deal.id, { responsables: [nomAnalyste(vers)] });
  const nom = nomAnalyste(vers);
  const quand = jusqu_au ? ` jusqu'au ${new Date(jusqu_au).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` : '';
  evenement(d.id, motif === 'retour'
    ? `De retour, ${nom} reprend votre dossier.`
    : motif === 'absence'
      ? `${nomAnalyste(avant)} n'est pas là${quand} : votre analyste est maintenant ${nom}. Écrivez ici, tout l'historique a été transmis.`
      : `Votre analyste est maintenant ${nom}${par ? ` (à la demande de ${nomAnalyste(par)})` : ''}. Tout l'historique a été transmis.`);
  await briefing(d.id, { pour: vers, motif: motif === 'retour' ? 'retour' : 'reprise' });
  await notifier(vers, `Vous reprenez un dossier · ${d.bien}`, `${motif === 'retour' ? 'De retour : ' : ''}le briefing vous attend en haut du fil.`, `/Analyse${d.deal_id ? `?deal_id=${d.deal_id}` : ''}`);
  await notifier(d.mandataire_email, `Votre analyste est maintenant ${nom}`, `${d.bien}${quand ? ` · ${quand.trim()}` : ''}`, '/DossierMandataire');
  return { ok: true, change: true, analyste: vers };
}

/** Le tour des relais : chaque heure, les dossiers ouverts. */
export async function tourDesRelais() {
  let changes = 0;
  for (const d of Records.list(DOSSIERS).filter((x) => OUVERTS.has(x.statut))) {
    try { if ((await verifierRelais(d.id)).change) changes += 1; } catch (e) { console.warn(`[fil] relais ${d.id} :`, e?.message || e); }
  }
  return changes;
}

// --- L'écriture des deux côtés --------------------------------------------------

/** Le mandataire écrit : l'analyste en charge est prévenu (et relayé s'il est absent). */
export async function ecrireMandataire(dossierId, user, { texte, pieces = [] }) {
  const d = Records.get(DOSSIERS, dossierId);
  if (!d || bas(d.mandataire_email) !== bas(user?.email) && user?.role !== 'admin') return { ok: false, error: 'Dossier introuvable.' };
  const m = poserMessage(d.id, { auteur_email: user.email, cote: 'mandataire', texte, pieces });
  if (!m) return { ok: false, error: 'Message vide.' };
  // Un dossier pas encore transféré n'a pas d'analyste : le premier message lui en donne un.
  if (!d.analyste_email) await attribuer(d.id);
  await verifierRelais(d.id);
  const frais = Records.get(DOSSIERS, d.id);
  await notifier(frais.analyste_email || ANALYSTES[0].email, `Message du mandataire · ${d.bien}`, String(texte || '').slice(0, 160), d.deal_id ? `/Analyse?deal_id=${d.deal_id}` : `/Conversations?dossier=${d.id}`);
  return { ok: true, message: m };
}

/** L'analyste écrit : le mandataire est prévenu. */
export async function ecrireAnalyste(dossierId, user, { texte, pieces = [], interne = false }) {
  const d = Records.get(DOSSIERS, dossierId);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  if (user?.role !== 'admin') return { ok: false, error: 'Réservé à Klocka.' };
  const m = poserMessage(d.id, { auteur_email: user.email, cote: 'analyste', texte, pieces, interne: !!interne });
  if (!m) return { ok: false, error: 'Message vide.' };
  // Une note interne reste chez Klocka : le mandataire ne la voit ni n'en est prévenu.
  if (interne) return { ok: true, message: m };
  await notifier(d.mandataire_email, `${nomAnalyste(user.email)} vous a écrit · ${d.bien}`, String(texte || '').slice(0, 160), `/DossierMandataire?dossier=${d.id}&conv=1`);
  return { ok: true, message: m };
}
