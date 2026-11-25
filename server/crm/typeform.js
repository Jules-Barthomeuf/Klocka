// Les réponses Typeform dans les Prospects de Twenty CRM (25 nov. 2026, Jules : « ils vont sur le site, répondent à des
// questions et prennent un call Calendly ; je veux ces personnes dans Prospects ; deux Typeform, celui du site et celui
// de la VSL de nos publicités : un champ pour les distinguer »).
//
// Chaque formulaire envoie ses réponses à /api/typeform/webhook?source=site (ou ?source=vsl), signées avec le secret
// TYPEFORM_WEBHOOK_SECRET. La personne est cherchée dans Prospects par son mail, puis son numéro : trouvée, sa ligne
// est complétée (rien d'écrit à la main n'est écrasé) ; sinon une ligne naît, au statut « A Relancer ». La colonne
// Source (source9) dit SITE WEB ou VSL ; toutes les réponses vont dans Information et dans une note de la fiche.
// Le call Calendly pris ensuite passe la ligne en « R1 Visio » (callCalendly, appelé par le webhook Calendly).

import crypto from 'node:crypto';
import * as T from '../twenty.js';
import { valeurOption } from './correspondance.js';

export const OBJET = { nameSingular: 'prospects', namePlural: 'prospectsListe' };
const CIBLE_NOTE = 'targetProspectsId';
export const SOURCES = { site: 'SITE WEB', vsl: 'VSL' };
const STATUT_NOUVEAU = 'A_RELANCER';
const STATUT_CALL = 'R1_VISIO';

/** Pure : la signature Typeform (en-tête « Typeform-Signature: sha256=<base64> », HMAC SHA-256 du corps brut). */
export function signatureTypeform({ entete, corps, cle }) {
  if (!cle || !entete || corps == null) return false;
  const attendu = `sha256=${crypto.createHmac('sha256', cle).update(corps).digest('base64')}`;
  const a = Buffer.from(String(entete));
  const b = Buffer.from(attendu);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pure : le texte d'une réponse Typeform, quel que soit son type. */
export function texteReponse(r) {
  if (!r) return '';
  switch (r.type) {
    case 'text': case 'email': case 'url': case 'phone_number': case 'date': return String(r[r.type] ?? '');
    case 'number': return String(r.number ?? '');
    case 'boolean': return r.boolean ? 'Oui' : 'Non';
    case 'choice': return r.choice?.label || r.choice?.other || '';
    case 'choices': return [...(r.choices?.labels || []), r.choices?.other].filter(Boolean).join(', ');
    case 'file_url': return r.file_url || '';
    case 'payment': return r.payment?.amount ? `${r.payment.amount}` : '';
    default: return String(r[r.type] ?? '');
  }
}

/** Pure : un montant dit (« 300 000 € », « 1,2 M€ », « 500k ») en euros, ou null. */
export function montant(t) {
  const s = norm(t).replace(/\s/g, '');
  const m = s.match(/(\d+(?:[.,]\d+)?)(m|k)?/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.round(m[2] === 'm' || /million/.test(s) ? n * 1e6 : m[2] === 'k' ? n * 1e3 : n);
}

/**
 * Pure : ce qu'un envoi Typeform dit de la personne. Les questions sont lues par leur type (mail, téléphone) puis par
 * leurs mots (prénom, nom, patrimoine, revenus, apport ou fonds propres) ; toutes restent, question et réponse, dans
 * `reponses`, pour ne rien perdre d'un formulaire qui change.
 */
export function lireEnvoi(formResponse) {
  const champs = new Map((formResponse?.definition?.fields || []).map((f) => [f.id, f]));
  const out = { prenom: null, nom: null, email: null, telephone: null, patrimoine: null, revenu: null, fondsPropre: null, reponses: [], le: formResponse?.submitted_at || null, formulaire: formResponse?.form_id || null, titre: formResponse?.definition?.title || null };
  for (const r of formResponse?.answers || []) {
    const q = champs.get(r.field?.id) || r.field || {};
    const titre = String(q.title || q.ref || '').replace(/\*|\{\{[^}]*\}\}/g, '').trim();
    const t = texteReponse(r).trim();
    if (!t) continue;
    out.reponses.push({ question: titre || 'Question', reponse: t });
    const n = norm(titre);
    if (r.type === 'email' && !out.email) out.email = t.toLowerCase();
    else if (r.type === 'phone_number' && !out.telephone) out.telephone = t;
    else if (/pre-?nom|first ?name/.test(n) && !out.prenom) out.prenom = t;
    else if (/(^|\b)(nom|last ?name)\b/.test(n) && !/pre-?nom/.test(n) && !out.nom) out.nom = t;
    else if (/patrimoine/.test(n) && !out.patrimoine) out.patrimoine = t;
    else if (/revenu/.test(n) && out.revenu == null) out.revenu = montant(t);
    else if (/apport|fonds? propres?|epargne|capacite/.test(n) && out.fondsPropre == null) out.fondsPropre = montant(t);
  }
  // Les champs cachés (hidden fields) et le contact d'un bloc « Contact info ».
  const caches = formResponse?.hidden || {};
  out.email = out.email || (caches.email ? String(caches.email).toLowerCase() : null);
  for (const r of formResponse?.answers || []) {
    if (r.type === 'contact_info' || r.contact_info) {
      const c = r.contact_info || {};
      out.prenom = out.prenom || c.first_name || null;
      out.nom = out.nom || c.last_name || null;
      out.email = out.email || (c.email ? String(c.email).toLowerCase() : null);
      out.telephone = out.telephone || c.phone_number || null;
    }
  }
  return out;
}

/** Pure : le texte des réponses, pour la case Information et la note. */
export const texteDesReponses = (lu, source) => [`Typeform ${SOURCES[source] || source}${lu.le ? ` du ${new Date(lu.le).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''}`, ...lu.reponses.map((x) => `${x.question} : ${x.reponse}`)].join('\n');

const telephoneTwenty = (t) => {
  const chiffres = String(t || '').replace(/[^\d+]/g, '');
  if (!chiffres) return null;
  const fr = chiffres.startsWith('+33') ? chiffres.slice(3) : chiffres.startsWith('0') ? chiffres.slice(1) : chiffres.replace(/^\+/, '');
  return { primaryPhoneNumber: fr, primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: [] };
};

/**
 * Pure : ce qu'on écrit sur la ligne. Une ligne qui existe garde ce qui y est déjà (nom, statut, montants) : seules
 * les cases vides se remplissent, la Source et l'Information s'ajoutent.
 */
export function valeursProspect(lu, source, existante = null) {
  const nom = [lu.prenom, lu.nom].filter(Boolean).join(' ').trim() || lu.email || 'Prospect Typeform';
  const vide = (k) => !existante || existante[k] == null || existante[k] === '' || (typeof existante[k] === 'object' && !Object.values(existante[k]).some((v) => v && (!Array.isArray(v) || v.length)));
  const v = {};
  if (vide('name')) v.name = nom;
  if (lu.email && (!existante || !existante.email?.primaryEmail)) v.email = { primaryEmail: lu.email, additionalEmails: existante?.email?.additionalEmails || [] };
  if (lu.telephone && (!existante || !existante.numero?.primaryPhoneNumber)) v.numero = telephoneTwenty(lu.telephone);
  if (lu.patrimoine && vide('patrimoine')) v.patrimoine = lu.patrimoine;
  if (lu.revenu != null && vide('revenu')) v.revenu = lu.revenu;
  if (lu.fondsPropre != null && vide('fondsPropre')) v.fondsPropre = lu.fondsPropre;
  v.source9 = valeurOption(SOURCES[source]);
  const texte = texteDesReponses(lu, source);
  v.information = existante?.information && !String(existante.information).includes(texte) ? `${existante.information}\n\n${texte}` : texte;
  if (!existante) { v.statut = STATUT_NOUVEAU; v.date = String(lu.le || new Date().toISOString()).slice(0, 10); v.groupe = 'PROSPECTS'; }
  return v;
}

/** L'option SITE WEB (ou VSL) de la colonne Source, posée dans Twenty si elle manque. */
let optionVue = null;
export async function assurerOptions() {
  if (optionVue) return;
  const objets = await T.objetsTwenty();
  const liste = Array.isArray(objets) ? objets : objets?.objects || objets?.data?.objects || [];
  const o = liste.find((x) => x.nameSingular === OBJET.nameSingular);
  const f = (o?.fields || []).find((x) => x.name === 'source9');
  if (!f) throw new Error('La colonne Source des Prospects est introuvable dans Twenty CRM.');
  const manquantes = Object.values(SOURCES).filter((l) => !(f.options || []).some((op) => op.value === valeurOption(l)));
  if (manquantes.length) {
    const options = [...(f.options || []), ...manquantes.map((label, i) => ({ value: valeurOption(label), label, color: label === 'VSL' ? 'purple' : 'sky', position: (f.options || []).length + i }))];
    await T.modifierChamp(f.id, { options });
  }
  optionVue = true;
}

/** La ligne de la personne dans Prospects : par son mail, sinon par son numéro. */
export async function trouverProspect({ email, telephone }) {
  if (email) {
    const x = await T.trouver(OBJET.namePlural, { 'email.primaryEmail': email });
    if (x) return x;
  }
  const tel = telephoneTwenty(telephone)?.primaryPhoneNumber;
  if (tel) return T.trouver(OBJET.namePlural, { 'numero.primaryPhoneNumber': tel });
  return null;
}

/** Un envoi Typeform reçu : la ligne des Prospects créée ou complétée, et une note avec toutes les réponses. */
export async function recevoirTypeform(corps, source) {
  if (!SOURCES[source]) return { ok: false, error: 'Source inconnue : ?source=site ou ?source=vsl.' };
  if (corps?.event_type && corps.event_type !== 'form_response') return { ok: true, ignore: 'type' };
  const lu = lireEnvoi(corps?.form_response);
  if (!lu.email && !lu.telephone) return { ok: true, ignore: 'ni mail ni téléphone' };
  if (!T.twentyConfigure()) return { ok: false, error: 'Twenty CRM n\'est pas configuré.' };
  await assurerOptions();
  const existante = await trouverProspect(lu);
  const valeurs = valeursProspect(lu, source, existante);
  const ligne = existante ? await T.modifier(OBJET.namePlural, existante.id, valeurs) : await T.creer(OBJET.namePlural, valeurs);
  const id = existante?.id || ligne?.id;
  if (id) await T.noter(CIBLE_NOTE, id, `Typeform ${SOURCES[source]}`, texteDesReponses(lu, source)).catch((e) => console.warn(`[typeform] note : ${e?.message || e}`));
  return { ok: true, id, cree: !existante };
}

/**
 * Le call Calendly pris : la ligne des Prospects passe en « R1 Visio », avec la date du call, si elle attendait encore
 * (A Relancer ou sans statut) ; une note le dit dans tous les cas.
 */
export async function callCalendly(evenement) {
  if (evenement?.event !== 'invitee.created' || !T.twentyConfigure()) return { ok: true, ignore: 'type' };
  const email = String(evenement?.payload?.email || '').trim().toLowerCase();
  if (!email) return { ok: true, ignore: 'sans mail' };
  const x = await trouverProspect({ email });
  if (!x) return { ok: true, ignore: 'pas dans Prospects' };
  const debut = evenement?.payload?.scheduled_event?.start_time || null;
  const quand = debut ? new Date(debut).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' }) : null;
  if (!x.statut || x.statut === STATUT_NOUVEAU) await T.modifier(OBJET.namePlural, x.id, { statut: STATUT_CALL, ...(debut ? { date: debut.slice(0, 10) } : {}) });
  await T.noter(CIBLE_NOTE, x.id, 'Call Calendly pris', `${evenement?.payload?.name || email} a pris un call${quand ? ` pour le ${quand}` : ''}.`).catch(() => {});
  return { ok: true, id: x.id };
}
