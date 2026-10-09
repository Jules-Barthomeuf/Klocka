// Les newsletters (9 oct. 2026, plan de Jules) : le cœur de l'emailing.
//
// Une newsletter écrit à une cohorte fixe : une ou plusieurs listes (les
// inscrits d'un webinaire), une date de départ, un rythme (14 jours) et une
// heure fixe, à Paris. Ses mails sont des cartes datées : la date se calcule
// (départ + rang × rythme) et se change à la main, pour ce mail seulement.
// Chaque mail est Brouillon, Prêt ou Envoyé ; seul un mail Prêt part, à sa
// date, à tous les inscrits encore actifs. Rien ne part tout seul en
// brouillon : trois jours avant, si le mail suivant n'est pas prêt (ou
// n'existe pas encore), une alerte arrive dans l'application et par mail.
//
// L'envoi passe par le moteur des campagnes (campagnes.js) : chaque mail
// devient, à son heure, une campagne cachée (`origine`), avec sa clé unique
// par contact, ses lots, le garde-fou hors Render et le lien de désinscription.
//
// Un contact sort de toutes les newsletters quand il prend un call (le tag
// « Call pris »), se désinscrit, fait un bounce ou se plaint. S'il répond, il
// reste inscrit et l'auteur de la newsletter reçoit une notification.
//
// Le simulateur : {{lien_simulateur}} donne à chaque contact son lien
// personnel ; ce qu'il y fait (ses valeurs, le call pris depuis le bouton
// « Parler au fondateur ») se range dans sa fiche (EmailingActivite).

import crypto from 'crypto';
import { Records } from '../db.js';
import { E, audience, envoyable } from './schema.js';
import { aParis } from './envoi.js';
import { designNewsletter } from './modeles.js';

export const NEWSLETTER = 'EmailingNewsletter';
export const ACTIVITE = 'EmailingActivite';
export const TAG_CALL = 'Call pris';
export const RYTHMES = [7, 14, 21, 28, 30];
const ENVOYE = new Set(['envoye', 'redirige']);
const RETARD_MAX_MS = 48 * 3600 * 1000;
const ALERTE_AVANT_MS = 3 * 86400 * 1000;
const maintenant = () => new Date().toISOString();
const base = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001').replace(/\/$/, '');
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const taux = (n, sur) => (sur ? Math.round((n / sur) * 1000) / 10 : 0);

// --- Les dates ------------------------------------------------------------------------

/** Pure : AAAA-MM-JJ plus n jours. */
export const plusJours = (jour, n) => {
  const [a, m, j] = String(jour).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
};

/** Pure : le jour d'un mail : le sien s'il a été fixé à la main, sinon départ + rang × rythme. */
export function dateDuMail(n, i) {
  const m = n.mails?.[i];
  if (m?.date && JOUR.test(m.date)) return m.date;
  return n.depart && JOUR.test(n.depart) ? plusJours(n.depart, i * (Number(n.rythme_jours) || 14)) : null;
}

/** Pure : l'instant d'envoi du mail de rang i (le jour, à l'heure de la newsletter, Paris). */
export function instantDuMail(n, i) {
  const j = dateDuMail(n, i);
  if (!j) return null;
  const [h, mi] = (HEURE.test(String(n.heure || '')) ? n.heure : '08:30').split(':').map(Number);
  return aParis(j, h, mi);
}

/** Pure : le prochain mardi (ou aujourd'hui si on est mardi), pour une nouvelle newsletter. */
export function prochainMardi(quand = new Date()) {
  const d = new Date(Date.UTC(quand.getUTCFullYear(), quand.getUTCMonth(), quand.getUTCDate()));
  const ecart = (2 - d.getUTCDay() + 7) % 7 || 7;
  return new Date(d.getTime() + ecart * 86400000).toISOString().slice(0, 10);
}

// --- Les contacts d'une newsletter --------------------------------------------------------

/** Un contact reçoit-il encore les newsletters ? Abonné, et pas de call pris. */
export const actif = (c) => envoyable(c) && !c.call_pris_le;

/** Les inscrits encore actifs d'une newsletter : ses listes, sans les calls pris. */
export const inscrits = (n) => audience({ listes: n.listes || [] }).filter(actif);

/** Le lien personnel du simulateur d'un contact. */
export const lienSimulateur = (contact, source = null) => `${base()}/SimulateurPublic?k=${encodeURIComponent(contact?.jeton || 'exemple')}${source ? `&s=${encodeURIComponent(source)}` : ''}`;

// --- La newsletter --------------------------------------------------------------------------

const idMail = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const mailNeuf = (design = null, objet = '') => ({ id: idMail(), objet, apercu: '', design: design || designNewsletter(), statut: 'brouillon', date: null });

export function creerNewsletter({ nom = '', listes = [], template = null } = {}, user = null) {
  return Records.create(NEWSLETTER, {
    nom: String(nom).trim() || 'Nouvelle newsletter', statut: 'brouillon', listes: (listes || []).slice(0, 20),
    depart: prochainMardi(), rythme_jours: 14, heure: '08:30',
    expediteur_nom: 'L\'équipe Klocka', repondre_a: user?.email || null,
    mails: [mailNeuf(template?.design || null, template?.objet || '')], alertes: {},
    cree_par: user?.email || null, cree_le: maintenant(),
  });
}

/** Ce que l'écran lit : chaque mail avec sa date, son instant, et ses chiffres une fois parti. */
export function vue(n) {
  if (!n) return null;
  const campagnes = new Map(Records.list(E.CAMPAGNE).filter((c) => c.origine?.newsletter_id === n.id).map((c) => [c.id, c]));
  const mails = (n.mails || []).map((m, i) => {
    const instant = instantDuMail(n, i);
    const c = m.campagne_id ? campagnes.get(m.campagne_id) : null;
    return { ...m, rang: i, date_calculee: dateDuMail({ ...n, mails: n.mails.map((x, k) => (k === i ? { ...x, date: null } : x)) }, i), jour: dateDuMail(n, i), instant: instant?.toISOString() || null, campagne_statut: c?.statut || null, en_retard: m.statut === 'pret' && !m.campagne_id && instant && Date.now() - instant.getTime() > RETARD_MAX_MS };
  });
  const prochain = mails.find((m) => m.statut !== 'envoye') || null;
  return { ...n, mails, inscrits: inscrits(n).length, prochain: prochain ? { id: prochain.id, instant: prochain.instant, statut: prochain.statut } : null };
}

export const newsletters = () => Records.list(NEWSLETTER).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le))).map((n) => {
  const v = vue(n);
  const s = statsNewsletter(n.id, { leger: true });
  return { ...v, calls: s?.entonnoir?.calls || 0, envoyes: s?.entonnoir?.envoyes || 0 };
});
export const newsletter = (id) => vue(Records.get(NEWSLETTER, id));

const designPropre = (d) => ({ theme: d?.theme || 'clair', logo: d?.logo !== false, blocs: Array.isArray(d?.blocs) ? d.blocs.slice(0, 60) : [] });

/** Les réglages et le contenu des mails non partis. Un mail envoyé ne change plus ; le statut a sa route. */
export function modifierNewsletter(id, patch) {
  const n = Records.get(NEWSLETTER, id);
  if (!n) return { ok: false, error: 'Newsletter introuvable.' };
  const champs = {};
  if (patch.nom != null) champs.nom = String(patch.nom).trim().slice(0, 120) || n.nom;
  if (Array.isArray(patch.listes)) champs.listes = patch.listes.map(String).slice(0, 20);
  if (patch.depart != null && JOUR.test(String(patch.depart))) champs.depart = String(patch.depart);
  if (patch.rythme_jours != null) champs.rythme_jours = Math.max(1, Math.min(90, Math.round(Number(patch.rythme_jours) || 14)));
  if (patch.heure != null && HEURE.test(String(patch.heure))) champs.heure = String(patch.heure).padStart(5, '0');
  if (patch.expediteur_nom !== undefined) champs.expediteur_nom = String(patch.expediteur_nom || '').trim().slice(0, 80) || 'L\'équipe Klocka';
  if (patch.repondre_a !== undefined) champs.repondre_a = String(patch.repondre_a || '').trim().toLowerCase() || null;
  if (Array.isArray(patch.mails)) {
    const parId = new Map((n.mails || []).map((m) => [m.id, m]));
    champs.mails = (n.mails || []).map((m) => {
      const p = patch.mails.find((x) => x.id === m.id);
      if (!p || m.statut === 'envoye') return m;
      const maj = { ...m };
      if (p.objet != null) maj.objet = String(p.objet).slice(0, 200);
      if (p.apercu != null) maj.apercu = String(p.apercu).slice(0, 200);
      if (p.design?.blocs) maj.design = designPropre(p.design);
      if (p.date !== undefined) maj.date = p.date && JOUR.test(String(p.date)) ? String(p.date) : null;
      // Un mail prêt qu'on retouche reste prêt : c'est le contenu qui partira.
      return maj;
    });
    // L'ordre des cartes peut changer (glisser) : seuls les identifiants connus comptent.
    const ordre = patch.mails.map((x) => x.id).filter((x) => parId.has(x));
    if (ordre.length === champs.mails.length) champs.mails = ordre.map((x) => champs.mails.find((m) => m.id === x));
  }
  return { ok: true, newsletter: vue(Records.update(NEWSLETTER, id, champs)) };
}

export function supprimerNewsletter(id) {
  const n = Records.get(NEWSLETTER, id);
  if (!n) return { ok: false, error: 'Newsletter introuvable.' };
  if ((n.mails || []).some((m) => m.campagne_id && ['programmee', 'en_cours'].includes(Records.get(E.CAMPAGNE, m.campagne_id)?.statut))) return { ok: false, error: 'Un mail part en ce moment : attendez la fin.' };
  Records.delete(NEWSLETTER, id);
  return { ok: true };
}

export function ajouterMail(id, { template = null } = {}) {
  const n = Records.get(NEWSLETTER, id);
  if (!n) return { ok: false, error: 'Newsletter introuvable.' };
  const m = mailNeuf(template?.design || (n.mails || []).at(-1)?.design || null, template?.objet || '');
  return { ok: true, mail: m, newsletter: vue(Records.update(NEWSLETTER, id, { mails: [...(n.mails || []), m] })) };
}

export function retirerMail(id, mailId) {
  const n = Records.get(NEWSLETTER, id);
  const m = n?.mails?.find((x) => x.id === mailId);
  if (!m) return { ok: false, error: 'Mail introuvable.' };
  if (m.statut === 'envoye') return { ok: false, error: 'Un mail envoyé reste dans la newsletter.' };
  return { ok: true, newsletter: vue(Records.update(NEWSLETTER, id, { mails: n.mails.filter((x) => x.id !== mailId) })) };
}

/** Pure : ce qui empêche un mail d'être prêt. */
export function manques(m) {
  const out = [];
  if (!String(m?.objet || '').trim()) out.push('l\'objet');
  const blocs = m?.design?.blocs || [];
  if (!blocs.some((b) => String(b.texte || '').trim() || b.src)) out.push('un contenu');
  if (blocs.filter((b) => b.type === 'bouton').some((b) => !/^https?:\/\//.test(String(b.lien || '').replace(/\{\{.*?\}\}/g, 'https://x')))) out.push('un lien à chaque bouton');
  return out;
}

/** Prêt ou Brouillon. Un mail prêt part à sa date ; un mail envoyé ne revient pas en arrière. */
export function statutDuMail(id, mailId, statut) {
  const n = Records.get(NEWSLETTER, id);
  const m = n?.mails?.find((x) => x.id === mailId);
  if (!m) return { ok: false, error: 'Mail introuvable.' };
  if (m.statut === 'envoye') return { ok: false, error: 'Ce mail est déjà parti.' };
  if (!['pret', 'brouillon'].includes(statut)) return { ok: false, error: 'Statut inconnu.' };
  if (statut === 'pret') {
    const manque = manques(m);
    if (manque.length) return { ok: false, error: `Il manque ${manque.join(', ')}.` };
  }
  const mails = n.mails.map((x) => (x.id === mailId ? { ...x, statut, pret_le: statut === 'pret' ? maintenant() : null } : x));
  return { ok: true, newsletter: vue(Records.update(NEWSLETTER, id, { mails })) };
}

/** Active ou met en pause. Une newsletter active envoie ses mails prêts à leur date. */
export function changerStatut(id, statut) {
  const n = Records.get(NEWSLETTER, id);
  if (!n) return { ok: false, error: 'Newsletter introuvable.' };
  if (!['active', 'pause'].includes(statut)) return { ok: false, error: 'Statut inconnu.' };
  if (statut === 'active') {
    if (!(n.listes || []).length) return { ok: false, error: 'Choisissez au moins une liste.' };
    if (!n.depart) return { ok: false, error: 'Choisissez la date de départ.' };
  }
  return { ok: true, newsletter: vue(Records.update(NEWSLETTER, id, { statut, ...(statut === 'active' && !n.active_le ? { active_le: maintenant() } : {}) })) };
}

// --- Le tour : les mails qui partent, les alertes ----------------------------------------

/** Le mail devient une campagne cachée, programmée maintenant : le moteur des campagnes l'envoie. */
function lancer(n, i, quand) {
  const m = n.mails[i];
  const c = Records.create(E.CAMPAGNE, {
    nom: `${n.nom} · ${m.objet || `Mail ${i + 1}`}`, origine: { newsletter_id: n.id, mail_id: m.id },
    statut: 'programmee', programmee_le: quand.toISOString(), audience: { listes: n.listes || [], segments: [], tags: [] },
    objet: m.objet, apercu: m.apercu, design: m.design, expediteur_nom: n.expediteur_nom || 'L\'équipe Klocka', repondre_a: n.repondre_a || null,
    cree_par: n.cree_par, cree_le: quand.toISOString(),
  });
  return { ...m, statut: 'envoye', campagne_id: c.id, envoye_le: quand.toISOString() };
}

/**
 * Le tour des newsletters (chaque minute, avec la file de l'emailing) : les
 * mails prêts dont l'heure est venue partent ; un mail en retard de plus de
 * 48 h ne part pas seul (sa date est à revoir) ; trois jours avant une date,
 * un mail pas prêt ou absent donne une alerte, une seule fois.
 */
export async function tourNewsletters({ quand = new Date(), alerter = alerteParDefaut } = {}) {
  let lances = 0;
  let alertes = 0;
  for (const n of Records.list(NEWSLETTER).filter((x) => x.statut === 'active')) {
    let mails = [...(n.mails || [])];
    let change = false;
    mails.forEach((m, i) => {
      if (m.statut !== 'pret' || m.campagne_id) return;
      const t = instantDuMail({ ...n, mails }, i);
      if (!t || t.getTime() > quand.getTime() || quand.getTime() - t.getTime() > RETARD_MAX_MS) return;
      mails[i] = lancer({ ...n, mails }, i, quand);
      change = true;
      lances += 1;
    });
    // L'alerte : le prochain rendez-vous non couvert par un mail prêt.
    const i = mails.findIndex((m) => m.statut !== 'envoye');
    const rang = i < 0 ? mails.length : i;
    const t = instantDuMail({ ...n, mails }, rang);
    const pret = i >= 0 && mails[i].statut === 'pret';
    const jour = t ? t.toISOString().slice(0, 10) : null;
    const dejaAlerte = jour && n.alertes?.[jour];
    if (t && !pret && !dejaAlerte && t.getTime() - quand.getTime() <= ALERTE_AVANT_MS && t.getTime() > quand.getTime()) {
      await alerter(n, { absent: i < 0, mail: i >= 0 ? mails[i] : null, instant: t });
      n.alertes = { ...(n.alertes || {}), [jour]: quand.toISOString() };
      change = true;
      alertes += 1;
    }
    if (change) Records.update(NEWSLETTER, n.id, { mails, alertes: n.alertes || {} });
  }
  return { lances, alertes };
}

const jourLong = (t) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/** L'alerte : une notification dans l'application et un mail à l'auteur de la newsletter. */
async function alerteParDefaut(n, { absent, mail, instant }) {
  const titre = absent ? `« ${n.nom} » : aucun mail pour le ${jourLong(instant)}` : `« ${n.nom} » : le mail du ${jourLong(instant)} n'est pas prêt`;
  const texte = absent ? 'Ajoutez la prochaine carte et passez-la en Prêt : sinon rien ne part.' : `« ${mail.objet || 'Sans objet'} » est encore en brouillon : passez-le en Prêt, sinon il ne part pas.`;
  const pour = n.cree_par || null;
  try { (await import('../notifications.js')).notifier({ pour, titre, texte, lien: '/Emailing', genre: 'alerte', cle: `newsletter-alerte:${n.id}:${instant.toISOString().slice(0, 10)}` }); } catch { /* la notification n'empêche rien */ }
  if (pour) {
    try { await (await import('./index.js')).envoyerPlateforme('alerte_newsletter', { a: pour, vars: { titre, texte, lien: `${base()}/Emailing` }, testeur: pour }); } catch { /* le mail d'alerte n'empêche rien */ }
  }
}

// --- Les réponses : on reste inscrit, l'auteur est prévenu --------------------------------

/** Les mails reçus des contacts d'une newsletter (après un de ses envois) : une notification chacun. */
export async function signalerReponses(recus) {
  if (!recus?.length) return 0;
  const parEmail = new Map(Records.list(E.CONTACT).map((c) => [c.email, c]));
  const campagnes = new Map(Records.list(E.CAMPAGNE).filter((c) => c.origine?.newsletter_id).map((c) => [c.id, c]));
  if (!campagnes.size) return 0;
  const { notifier } = await import('../notifications.js');
  let n = 0;
  for (const m of recus) {
    const c = parEmail.get(m.email);
    if (!c) continue;
    const dernier = Records.list(E.ENVOI).filter((e) => e.contact_id === c.id && campagnes.has(e.campagne_id) && ENVOYE.has(e.statut) && String(e.le) < m.le).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (!dernier) continue;
    const nl = Records.get(NEWSLETTER, campagnes.get(dernier.campagne_id).origine.newsletter_id);
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ') || c.email;
    if (notifier({ pour: nl?.cree_par || null, titre: `${nom} a répondu à « ${nl?.nom || 'la newsletter'} »`, texte: `Il reste inscrit. Sa réponse est dans votre boîte (${dernier.objet || 'newsletter'}).`, lien: '/Emailing', cle: `newsletter-reponse:${c.id}:${m.le}` })) {
      Records.create(ACTIVITE, { contact_id: c.id, type: 'reponse', source: `newsletter:${nl?.id || ''}`, le: m.le });
      n += 1;
    }
  }
  return n;
}

// --- Le simulateur et le call --------------------------------------------------------------

const contactDuJeton = (k) => (k && k !== 'exemple' ? Records.list(E.CONTACT).find((c) => c.jeton && c.jeton === String(k)) : null);
const SOURCE = /^(newsletter|campagne|sequence):[\w-]+(:[\w-]+)?$/;
const VALEURS = ['prixBienFAI', 'loyerInitialHTHC', 'surface', 'apport', 'dureeCredit', 'tauxInteret', 'sansCredit', 'rendement_brut', 'cashflow_mensuel'];

/** Pour la page publique : qui la visite, sans rien d'autre que le prénom et l'adresse (pour préremplir le rendez-vous). */
export function visiteur(k) {
  const c = contactDuJeton(k);
  return c ? { ok: true, prenom: c.prenom || '', nom: c.nom || '', email: c.email, call_pris: !!c.call_pris_le } : { ok: false };
}

/**
 * Ce qu'un contact fait depuis son lien : « simulateur » (ses valeurs, une
 * session par demi-heure), « clic_call » (le bouton « Parler au fondateur »),
 * « call_pris » (le rendez-vous réservé dans la fenêtre Calendly).
 */
export async function noterActivite({ k, type, valeurs = null, source = null, quand = new Date() }) {
  const c = contactDuJeton(k);
  if (!c) return { ok: false, error: 'Lien inconnu.' };
  if (!['simulateur', 'clic_call', 'call_pris', 'lead_magnet'].includes(type)) return { ok: false, error: 'Type inconnu.' };
  const src = SOURCE.test(String(source || '')) ? String(source) : null;
  if (type === 'call_pris') return marquerCallPris(c, { via: 'simulateur', source: src, quand });
  const propres = valeurs && typeof valeurs === 'object' ? Object.fromEntries(VALEURS.filter((x) => valeurs[x] != null && ['number', 'boolean'].includes(typeof valeurs[x])).map((x) => [x, valeurs[x]])) : null;
  if (type === 'simulateur') {
    const derniere = Records.list(ACTIVITE).filter((a) => a.contact_id === c.id && a.type === 'simulateur').sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (derniere && quand.getTime() - Date.parse(derniere.le) < 30 * 60000) {
      Records.update(ACTIVITE, derniere.id, { valeurs: propres || derniere.valeurs, le: quand.toISOString(), changements: (derniere.changements || 0) + 1 });
      return { ok: true };
    }
  }
  Records.create(ACTIVITE, { contact_id: c.id, type, valeurs: propres, source: src, le: quand.toISOString(), changements: 0 });
  return { ok: true };
}

/** Le call pris : le tag « Call pris », la sortie de toutes les newsletters et séquences, une notification. */
export async function marquerCallPris(c, { via = 'calendly', source = null, quand = new Date() } = {}) {
  if (!c) return { ok: false, error: 'Contact inconnu.' };
  if (c.call_pris_le) return { ok: true, deja: true };
  Records.update(E.CONTACT, c.id, { call_pris_le: quand.toISOString(), call_pris_via: via, tags: [...new Set([...(c.tags || []), TAG_CALL])] });
  Records.create(ACTIVITE, { contact_id: c.id, type: 'call_pris', source, via, le: quand.toISOString() });
  for (const i of Records.list(E.INSCRIPTION).filter((x) => x.contact_id === c.id && x.statut === 'en_cours')) Records.update(E.INSCRIPTION, i.id, { statut: 'sortie', raison: 'call', sortie_le: quand.toISOString() });
  const nl = Records.list(NEWSLETTER).find((n) => (n.listes || []).some((l) => (c.listes || []).includes(l)));
  try {
    (await import('../notifications.js')).notifier({ pour: nl?.cree_par || null, titre: `${[c.prenom, c.nom].filter(Boolean).join(' ') || c.email} a pris un call`, texte: `Depuis ${via === 'calendly' ? 'Calendly' : 'le simulateur'}. Il ne reçoit plus les newsletters.`, lien: '/Emailing', genre: 'succes', cle: `call-pris:${c.id}` });
  } catch { /* la notification n'empêche rien */ }
  return { ok: true };
}

/**
 * Pure : la signature d'un webhook Calendly est-elle valable ? En-tête
 * « t=horodatage,v1=signature », signature HMAC-SHA256 (hex) de
 * « horodatage.corps brut » avec la clé de signature du webhook.
 */
export function signatureCalendly({ entete, corps, cle }) {
  if (!cle || !entete || corps == null) return false;
  const parts = Object.fromEntries(String(entete).split(',').map((x) => x.split('=').map((y) => y.trim())));
  if (!parts.t || !parts.v1) return false;
  const attendue = crypto.createHmac('sha256', cle).update(`${parts.t}.${corps}`).digest('hex');
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(attendue);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Un rendez-vous réservé dans Calendly (invitee.created) : le contact de cette adresse a pris un call. */
export async function rendezVousCalendly(evenement) {
  if (evenement?.event !== 'invitee.created') return { ok: true, ignore: 'type' };
  const email = String(evenement?.payload?.email || '').trim().toLowerCase();
  const c = email ? Records.list(E.CONTACT).find((x) => x.email === email) : null;
  if (!c) return { ok: true, ignore: 'contact inconnu' };
  return marquerCallPris(c, { via: 'calendly' });
}

// --- Les chiffres --------------------------------------------------------------------------

/** Pure : le score d'engagement d'un contact. Ouvert 1, cliqué 3, simulateur 5, call 20. */
export function score({ ouverts = 0, cliques = 0, simulateur = 0, call = false }) {
  return ouverts + cliques * 3 + simulateur * 5 + (call ? 20 : 0);
}

/** Le score de chaque contact, d'un coup (pour le tableau des contacts). */
export function scores() {
  const parContact = new Map();
  const a = (id) => { if (!parContact.has(id)) parContact.set(id, { ouverts: 0, cliques: 0, simulateur: 0, call: false }); return parContact.get(id); };
  for (const e of Records.list(E.ENVOI)) { if (!e.contact_id || e.type === 'plateforme') continue; if (e.ouvert_le) a(e.contact_id).ouverts += 1; if (e.clique_le) a(e.contact_id).cliques += 1; }
  for (const x of Records.list(ACTIVITE)) { if (x.type === 'simulateur') a(x.contact_id).simulateur += 1; }
  for (const c of Records.list(E.CONTACT)) if (c.call_pris_le) a(c.id).call = true;
  return new Map([...parContact.entries()].map(([id, v]) => [id, { ...v, score: score(v) }]));
}

/**
 * Les chiffres d'une newsletter : l'entonnoir (envoyés → délivrés → ouverts →
 * cliqués → simulateur utilisé → call pris, en contacts) et chaque mail
 * (ouvertures, clics, liens cliqués, désinscriptions).
 */
export function statsNewsletter(id, { leger = false } = {}) {
  const n = Records.get(NEWSLETTER, id);
  if (!n) return null;
  const campagnes = Records.list(E.CAMPAGNE).filter((c) => c.origine?.newsletter_id === id);
  const ids = new Set(campagnes.map((c) => c.id));
  const envois = Records.list(E.ENVOI).filter((e) => ids.has(e.campagne_id) && ENVOYE.has(e.statut));
  const premier = new Map();
  for (const e of envois) if (!premier.has(e.contact_id) || String(e.le) < premier.get(e.contact_id)) premier.set(e.contact_id, String(e.le));
  const contacts = new Map(Records.list(E.CONTACT).map((c) => [c.id, c]));
  const atteints = [...premier.keys()];
  const avec = (f) => new Set(envois.filter(f).map((e) => e.contact_id)).size;
  const activites = Records.list(ACTIVITE);
  const simulateur = atteints.filter((cid) => activites.some((x) => x.contact_id === cid && x.type === 'simulateur' && String(x.le) >= premier.get(cid))).length;
  const calls = atteints.filter((cid) => contacts.get(cid)?.call_pris_le && String(contacts.get(cid).call_pris_le) >= premier.get(cid)).length;
  const entonnoir = { envoyes: atteints.length, delivres: avec((e) => e.delivre_le), ouverts: avec((e) => e.ouvert_le), cliques: avec((e) => e.clique_le), simulateur, calls };
  if (leger) return { entonnoir };
  const evts = Records.list(E.EVENEMENT).filter((e) => ids.has(e.campagne_id));
  const parCampagne = new Map(campagnes.map((c) => [c.origine.mail_id, c]));
  const mails = (n.mails || []).map((m, i) => {
    const c = parCampagne.get(m.id);
    const es = c ? envois.filter((e) => e.campagne_id === c.id) : [];
    const ev = c ? evts.filter((e) => e.campagne_id === c.id) : [];
    const liens = new Map();
    for (const x of ev.filter((y) => y.type === 'clique' && y.lien)) liens.set(x.lien, (liens.get(x.lien) || 0) + 1);
    const ouverts = es.filter((e) => e.ouvert_le).length;
    const cliques = es.filter((e) => e.clique_le).length;
    return {
      id: m.id, rang: i, objet: m.objet, statut: m.statut, envoye_le: m.envoye_le || null,
      envoyes: es.length, delivres: es.filter((e) => e.delivre_le).length, ouverts, cliques,
      taux_ouverture: taux(ouverts, es.length), taux_clic: taux(cliques, es.length),
      bounces: es.filter((e) => e.bounce_le).length, plaintes: es.filter((e) => e.plainte_le).length,
      desinscrits: c ? Records.list(E.CONTACT).filter((x) => x.desinscription_source === `campagne:${c.id}`).length : 0,
      liens: [...liens.entries()].map(([lien, clics]) => ({ lien, clics })).sort((a, b) => b.clics - a.clics).slice(0, 8),
    };
  });
  return { entonnoir, mails, inscrits: inscrits(n).length };
}

/** La santé du domaine sur `jours` jours : bounces, plaintes, désinscriptions, et l'alerte au-delà des seuils. */
export const SEUILS = { bounce: 2, plainte: 0.1, desinscription: 1 };
export function sante({ jours = 30, quand = new Date() } = {}) {
  const depuis = quand.getTime() - jours * 86400000;
  const envois = Records.list(E.ENVOI).filter((e) => e.type !== 'plateforme' && ENVOYE.has(e.statut) && Date.parse(e.le) >= depuis);
  const n = envois.length;
  const bounces = envois.filter((e) => e.bounce_le).length;
  const plaintes = envois.filter((e) => e.plainte_le).length;
  const desinscriptions = Records.list(E.CONTACT).filter((c) => c.statut === 'desinscrit' && Date.parse(c.statut_le || 0) >= depuis).length;
  const t = { bounce: taux(bounces, n), plainte: taux(plaintes, n), desinscription: taux(desinscriptions, n) };
  const alertes = Object.entries(SEUILS).filter(([k, s]) => n >= 50 && t[k] >= s).map(([k]) => k);
  return { jours, envoyes: n, bounces, plaintes, desinscriptions, taux: t, seuils: SEUILS, alertes };
}

/** La timeline d'un contact côté newsletters : ses activités (simulateur, call, réponses) et son score. */
export function activitesDe(contactId) {
  return Records.list(ACTIVITE).filter((a) => a.contact_id === contactId).sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

/**
 * Les contacts à cibler : les plus engagés d'abord, avec ce qu'ils ont fait.
 * « simulateur_sans_call » : a utilisé le simulateur mais n'a pas pris de call.
 */
export function engagement({ limite = 30, filtre = null } = {}) {
  const sc = scores();
  return Records.list(E.CONTACT)
    .map((c) => ({ id: c.id, email: c.email, prenom: c.prenom || '', nom: c.nom || '', statut: c.statut, call_pris_le: c.call_pris_le || null, ...(sc.get(c.id) || { ouverts: 0, cliques: 0, simulateur: 0, call: !!c.call_pris_le, score: c.call_pris_le ? 20 : 0 }) }))
    .filter((c) => (filtre === 'simulateur_sans_call' ? c.simulateur > 0 && !c.call : c.score > 0))
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}
