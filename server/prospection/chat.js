// La suite d'un appel, dans Google Chat. Après l'appel, l'assistant envoie en
// privé le résumé et ses propositions numérotées ; on lui répond « 1 2 3 »,
// « tout », « tout sauf 2 » ou « rien », et il le fait. Un mail choisi n'est
// pas envoyé : il est montré en entier, et il part sur un « envoie », comme
// les mails aux agents des dossiers.

import { Records, Meta } from '../db.js';

const CLE_ENVOI = 'prospection.envoi_attente';
const FRAIS_MS = 24 * 3600000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').trim();

// Les mots qui entourent un choix sans rien dire d'autre.
const LIANTS = new Set(['ok', 'oui', 'fais', 'fait', 'le', 'la', 'les', 'et', 'vas', 'y', 'vas-y', 'go', 'stp', 'svp', 'merci', 'seulement', 'juste', 'que', 'bien', 'parfait', 'nickel', 'top', 'alors', 'du', 'coup', 'numero', 'numeros', 'n', 'point', 'points', 'propositions', 'proposition', 'c', 'est', 'bon', 'moi', 'ca']);

/**
 * Pure : le choix lu dans une réponse, parmi `n` propositions numérotées de 1
 * à n. Rend la liste des numéros, [] pour « rien », ou null si le message
 * n'est pas un choix (il repart alors à l'assistant comme une demande).
 */
export function choixDansLeTexte(texte, n) {
  const t = norm(texte);
  if (!t || t.length > 80 || !n) return null;
  const mots = t.split(/[\s,;.!+&/]+/).filter(Boolean);
  const nombres = [];
  let tout = false;
  let rien = false;
  let sauf = false;
  const exclus = [];
  for (const m of mots) {
    if (/^\d+$/.test(m)) { const k = Number(m); if (k < 1 || k > n) return null; (sauf ? exclus : nombres).push(k); continue; }
    if (m === 'tout' || m === 'tous' || m === 'toutes') { tout = true; continue; }
    if (m === 'rien' || m === 'aucun' || m === 'aucune') { rien = true; continue; }
    if (m === 'sauf' || m === 'pas' || m === 'hors') { sauf = true; continue; }
    if (LIANTS.has(m)) continue;
    return null;
  }
  if (rien && !nombres.length && !tout) return [];
  if (tout) return Array.from({ length: n }, (_, i) => i + 1).filter((k) => !exclus.includes(k));
  if (nombres.length) return [...new Set(nombres)].sort((a, b) => a - b);
  return null;
}

/** L'appel dont la suite attend une réponse dans cet espace, s'il y en a un de moins d'un jour. */
export function appelEnAttente(espace, maintenant = Date.now()) {
  return Records.filter('AppelAgent', { espace, etat: 'a_valider' })
    .filter((a) => maintenant - Date.parse(a.le) < FRAIS_MS)
    .sort((x, y) => String(y.le).localeCompare(String(x.le)))[0] || null;
}

const lireEnvois = () => { try { return JSON.parse(Meta.get(CLE_ENVOI) || '{}'); } catch { return {}; } };

/** Le mail de prospection montré dans cet espace, qui attend un « envoie ». */
export function envoiEnAttente(espace, maintenant = Date.now()) {
  const e = lireEnvois()[espace];
  if (!e || maintenant - Date.parse(e.le) > FRAIS_MS) return null;
  const m = Records.get('ProspectionMail', e.mail_id);
  return m && ['pret', 'prevu'].includes(m.etat) ? { ...e, mail: m } : null;
}

/** Pure : un mail tel qu'il s'affiche dans le chat, signature comprise. */
export function afficherMail(m, signature) {
  return [`le mail pour ${m.nom} :`, `à : ${m.a || '(adresse manquante : donne-la moi)'}`, `objet : ${m.objet}`, '', String(m.corps).replace(/\{signature\}/g, signature), '', 'dis « envoie » et il part'].join('\n');
}

/**
 * Une réponse aux propositions d'un appel. Rend le texte à poster, ou null
 * si le message n'est pas un choix.
 */
export async function repondreAuChoix(message, user) {
  const appel = appelEnAttente(message.espace);
  if (!appel) return null;
  const numerotees = appel.propositions.filter((p) => p.type !== 'statut');
  const choix = choixDansLeTexte(message.texte, numerotees.length);
  if (choix === null) return null;
  const { validerAppel } = await import('./appel.js');
  const ids = ['statut', ...choix.map((k) => numerotees[k - 1].id)];
  const r = await validerAppel({ appel_id: appel.id, choix: ids, user });
  if (!r.ok) return `dsl, ça a raté : ${r.error}`;
  const signature = user?.full_name || String(user?.email || '').split('@')[0];
  const lignes = [`c'est fait pour ${appel.agent} : ${r.faits.filter((f) => !/À envoyer/.test(f)).join(', ') || 'appel noté'}.`];
  if (r.mail_id) {
    const m = Records.get('ProspectionMail', r.mail_id);
    Meta.set(CLE_ENVOI, JSON.stringify({ ...lireEnvois(), [message.espace]: { mail_id: m.id, le: new Date().toISOString() } }));
    lignes.push('', afficherMail(m, signature));
  }
  if (r.sms_id) {
    const s = Records.get('ProspectionMail', r.sms_id);
    lignes.push('', `le SMS à envoyer depuis ton téléphone (${s.a}) :`, String(s.corps).replace(/\{signature\}/g, signature));
  }
  return lignes.join('\n');
}

/** « envoie » après un mail de prospection montré dans le chat. */
export async function envoyerDepuisLeChat(espace, user) {
  const e = envoiEnAttente(espace);
  if (!e) return null;
  const { envoyerMails } = await import('./mails.js');
  const r = await envoyerMails([e.mail.id], user);
  const envois = lireEnvois();
  delete envois[espace];
  Meta.set(CLE_ENVOI, JSON.stringify(envois));
  const x = r.resultats[0];
  if (!x?.ok) return `dsl, le mail n'est pas parti : ${x?.error || 'erreur'}. il attend dans « À envoyer » sur la page Prospection.`;
  if (x.simule) return 'rien n\'est parti : aucune boîte connectée pour toi. le mail attend dans « À envoyer ».';
  return `c'est parti, mail envoyé à ${e.mail.a}.${e.mail.avec_relance ? ' la relance est prête pour dans trois jours ouvrés, je te la montrerai, elle ne part pas seule.' : ''}`;
}
