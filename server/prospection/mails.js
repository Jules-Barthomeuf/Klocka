// « À envoyer » : tout ce qui part vers l'extérieur, préparé par l'assistant
// et envoyé seulement quand quelqu'un clique. Aucun envoi automatique, même
// pour une relance : la relance d'un mail envoyé se prépare pour J+3 et
// attend, comme le reste, qu'on la valide. Elle disparaît si l'agent répond
// ou envoie une fiche avant.
//
// Genres : agent (le mail proposé après un appel), relance (la relance de ce
// mail), sms (à copier dans son téléphone : l'envoi de SMS n'est pas branché),
// oui (la demande de documents d'un dossier retenu), retour (la réponse d'un
// dossier Non, avec sa raison).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';
import * as R from './regles.js';

const ENTITE = 'ProspectionMail';
const ici = path.dirname(fileURLToPath(import.meta.url));
const PRENOMS = (() => {
  try { const p = JSON.parse(fs.readFileSync(path.join(ici, '../ak/prenoms.json'), 'utf8')); return new Set([...(p.feminins || []), ...(p.masculins || []), ...(p.mixtes || [])]); } catch { return new Set(); }
})();

/** Pure : le prénom d'un nom de personne (« Sophie Martin » → Sophie), ou null pour une agence. */
export function prenomDeLAgent(nom, prenoms = PRENOMS) {
  const premier = String(nom || '').trim().split(/[\s,]+/)[0] || '';
  const cle = premier.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z-]/g, '');
  if (!cle || !prenoms.has(cle)) return null;
  return premier.charAt(0).toUpperCase() + premier.slice(1).toLowerCase();
}
const bonjour = (a) => { const p = prenomDeLAgent(a.nom); return `Bonjour${p ? ` ${p}` : ''},`; };

/**
 * Pure : le mail de présentation avec nos critères. Un texte de réglages qui
 * commence par « Bonjour » ou contient {prenom} est le mail entier ; sinon il
 * est posé au milieu d'un mail court. {signature} devient le nom de qui envoie.
 */
export function mailDeCriteres(a, { criteres, objet = 'Nos critères d\'investissement' }) {
  const prenom = prenomDeLAgent(a.nom);
  const remplir = (t) => String(t).replace(/\{prenom\}/g, prenom || '').replace(/\{agence\}/g, a.agence || '').replace(/\{ville\}/g, a.ville || '').replace(/Bonjour ,/g, 'Bonjour,');
  const texte = String(criteres || '').trim() || 'Nous achetons des murs commerciaux loués, en centre-ville.';
  const complet = /^bonjour/i.test(texte) || texte.includes('{prenom}');
  const corps = complet
    ? remplir(texte)
    : [bonjour(a), '', 'Merci pour notre échange. Comme convenu, voici ce que nous recherchons :', '', remplir(texte), '', 'Dès qu\'un bien s\'en approche, envoyez-nous sa fiche en réponse à ce mail : nous vous disons rapidement si nous y allons, et pourquoi.', '', 'Bien à vous,', '{signature}'].join('\n');
  return { objet: remplir(objet), corps: corps.includes('{signature}') ? corps : `${corps}\n\n{signature}` };
}

/** Pure : la demande de fiche, après un appel où l'agent a parlé de murs. */
export function mailDemandeFiche(a, biens = []) {
  const quoi = biens.length ? `les biens dont nous avons parlé (${biens.slice(0, 3).join(' ; ')})` : 'les murs dont nous avons parlé';
  return { objet: 'Suite à notre échange : la fiche du bien', corps: [bonjour(a), '', `Merci pour votre temps au téléphone. Pourriez-vous nous envoyer la fiche commerciale pour ${quoi} : adresse, prix, loyer et bail ?`, '', 'Nous revenons vers vous rapidement avec une réponse, oui ou non.', '', 'Bien à vous,', '{signature}'].join('\n') };
}

/** Pure : le mail après trois appels sans réponse. */
export function mailSansReponse(a) {
  return { objet: 'Klocka : investisseur en murs commerciaux', corps: [bonjour(a), '', 'J\'ai essayé de vous joindre ces derniers jours. Nous achetons des murs commerciaux loués et cherchons des agents avec qui travailler régulièrement.', '', 'Si vous avez ou rentrez ce type de biens, un appel de cinq minutes suffit : dites-moi quand vous êtes disponible.', '', 'Bien à vous,', '{signature}'].join('\n') };
}

/** Pure : le SMS après trois appels sans réponse. */
export const smsSansReponse = (a) => `${bonjour(a)} j'ai essayé de vous joindre : nous achetons des murs commerciaux loués et cherchons des agents partenaires. Quand êtes-vous disponible pour un court appel ? {signature}, Klocka`;

/** Pure : la relance d'un mail resté sans réponse. */
export function mailRelance(m, a, envoyeLe) {
  return { objet: /^re\s*:/i.test(m.objet) ? m.objet : `Re : ${m.objet}`, corps: [bonjour(a), '', `Je me permets de revenir vers vous au sujet de mon mail du ${R.dateCourte(R.jourDe(envoyeLe))}.${m.sous_genre === 'demande_fiche' ? ' Avez-vous pu retrouver la fiche du bien ?' : ' Avez-vous des murs commerciaux qui pourraient nous correspondre ?'}`, '', 'Bien à vous,', '{signature}'].join('\n') };
}

export function mettreEnAttente(champs) {
  return Records.create(ENTITE, { etat: 'pret', cree_le: new Date().toISOString(), ...champs });
}

/** Ce qui attend un clic : les mails prêts, et les relances dont le jour est venu. */
export function aEnvoyer(maintenant = new Date()) {
  const auj = R.jourDe(maintenant);
  return Records.list(ENTITE)
    .filter((m) => m.etat === 'pret' || (m.etat === 'prevu' && m.pour_le <= auj))
    .sort((x, y) => String(y.cree_le).localeCompare(String(x.cree_le)));
}
/** Les relances préparées pour plus tard. */
export const programmes = (maintenant = new Date()) => Records.list(ENTITE).filter((m) => m.etat === 'prevu' && m.pour_le > R.jourDe(maintenant)).sort((x, y) => String(x.pour_le).localeCompare(String(y.pour_le)));

export function modifierMail(id, { objet, corps, a }) {
  const m = Records.get(ENTITE, id);
  if (!m || !['pret', 'prevu'].includes(m.etat)) return { ok: false, error: 'Mail introuvable ou déjà parti.' };
  const champs = {};
  if (objet !== undefined) champs.objet = String(objet).slice(0, 300);
  if (corps !== undefined) champs.corps = String(corps).slice(0, 20000);
  if (a !== undefined) {
    const e = m.genre === 'sms' ? R.telAffiche(a) : R.normEmail(a);
    if (!e) return { ok: false, error: m.genre === 'sms' ? 'Numéro invalide.' : 'Adresse invalide.' };
    champs.a = e;
  }
  return { ok: true, mail: Records.update(ENTITE, id, champs) };
}

export function ecarterMail(id, par = null) {
  const m = Records.get(ENTITE, id);
  if (!m || !['pret', 'prevu'].includes(m.etat)) return { ok: false, error: 'Mail introuvable ou déjà parti.' };
  Records.update(ENTITE, id, { etat: 'ecarte', ferme_le: new Date().toISOString(), par });
  return { ok: true };
}

/** Les relances d'un agent qui attendent encore : annulées, il a répondu ou envoyé une fiche. */
export function annulerRelances(agentId, raison) {
  let n = 0;
  for (const m of Records.filter(ENTITE, { agent_id: agentId })) {
    if (m.genre === 'relance' && ['pret', 'prevu'].includes(m.etat)) { Records.update(ENTITE, m.id, { etat: 'annule', raison, ferme_le: new Date().toISOString() }); n += 1; }
  }
  return n;
}

/**
 * Envoie ce qu'on a choisi, tel que relu, depuis la boîte de qui clique.
 * Un SMS ne s'envoie pas d'ici : il est marqué fait (copié dans le téléphone).
 * Un mail d'agent avec relance fait préparer sa relance pour J+3, qui
 * attendra elle aussi un clic.
 */
export async function envoyerMails(ids, user) {
  const { functions } = await import('../functions.js');
  const { agentDe, journal, majAgent } = await import('./carnet.js');
  const signature = user?.full_name || String(user?.email || '').split('@')[0];
  const resultats = [];
  for (const id of ids || []) {
    const m = Records.get(ENTITE, id);
    if (!m || !['pret', 'prevu'].includes(m.etat)) { resultats.push({ id, ok: false, error: 'déjà parti ou écarté' }); continue; }
    const corps = String(m.corps).replace(/\{signature\}/g, signature);
    const maintenant = new Date();
    if (m.genre === 'sms') {
      Records.update(ENTITE, id, { etat: 'envoye', envoye_le: maintenant.toISOString(), par: user?.email || null, corps });
      if (m.agent_id) journal(m.agent_id, { type: 'sms', texte: corps, par: user?.email });
      resultats.push({ id, ok: true, sms: true });
      continue;
    }
    if (!m.a) { resultats.push({ id, ok: false, error: 'pas d\'adresse' }); continue; }
    const deal = ['oui', 'retour'].includes(m.genre) ? { deal_id: m.deal_id, intention: m.intention } : {};
    let r;
    try { r = await functions.sendMail({ to: m.a, subject: m.objet, body: corps, ...deal }, { user }); } catch (e) { r = { success: false, error: e?.message || String(e) }; }
    if (!r?.success && !r?.simulated) { resultats.push({ id, ok: false, error: r?.error || 'envoi raté' }); continue; }
    Records.update(ENTITE, id, { etat: r.success ? 'envoye' : 'simule', envoye_le: maintenant.toISOString(), par: user?.email || null, corps });
    if (m.agent_id && agentDe(m.agent_id)) {
      journal(m.agent_id, { type: 'mail', texte: `${m.objet}`, par: user?.email });
      majAgent(m.agent_id, { dernier_mail_le: maintenant.toISOString() });
      if (m.avec_relance) {
        const a = agentDe(m.agent_id);
        mettreEnAttente({ genre: 'relance', sous_genre: m.sous_genre, agent_id: m.agent_id, nom: m.nom, agence: m.agence, a: m.a, ...mailRelance(m, a, maintenant), etat: 'prevu', pour_le: R.plusJoursOuvres(R.jourDe(maintenant), 3), relance_de: m.id });
      }
    }
    resultats.push({ id, ok: true, simule: !r.success });
  }
  return { ok: true, resultats, envoyes: resultats.filter((x) => x.ok && !x.simule && !x.sms).length, simules: resultats.filter((x) => x.simule).length, sms: resultats.filter((x) => x.sms).length, rates: resultats.filter((x) => !x.ok).length };
}

export const RAISONS_NON = ['Rendement insuffisant', 'Prix trop élevé', 'Emplacement', 'Locataire ou bail fragile', 'Hors de nos critères', 'Surface', 'Autre'];

/**
 * La décision sur un dossier. Oui : la demande de documents se prépare. Non :
 * la réponse à l'agent se prépare avec la raison choisie. Rien ne part : les
 * deux attendent dans « À envoyer ». « Non, sans mail » range le dossier.
 */
export async function decider(dealId, { decision, raison = null, sans_mail = false, user }) {
  const d = Records.findBy('Deal', 'deal_id', dealId);
  if (!d) return { ok: false, error: 'Dossier introuvable.' };
  const { obtenirDossier, lotOuVide } = await import('../deal/index.js');
  const dossier = obtenirDossier(dealId);
  const maintenant = new Date().toISOString();
  Records.update('Deal', d.id, { decision: { decision, raison, par: user?.email || null, le: maintenant } });
  if (decision === 'non' && sans_mail) {
    const { changerStatut } = await import('../deal/lifecycle.js');
    const r = changerStatut(Records.findBy('Deal', 'deal_id', dealId), 'abandonne', { user, note: `Non : ${raison || 'sans raison'}` });
    return r.ok ? { ok: true, range: true } : r;
  }
  if (!d.contact_agent_email) return { ok: false, error: 'Ce dossier n\'a pas l\'adresse de son agent : ajoute-la sur le dossier.' };
  const { redigerMailIntention } = await import('../deal/mails-cycle.js');
  const intention = decision === 'oui' ? 'demande_documents' : 'refus';
  const mail = await redigerMailIntention(lotOuVide(dossier, 0), intention, { signature: '{signature}', raisons: decision === 'non' ? raison : null, sansIA: !!d.test });
  if (!mail?.objet) return { ok: false, error: 'Rédaction impossible.' };
  for (const m of Records.filter(ENTITE, { deal_id: dealId })) if (['pret', 'prevu'].includes(m.etat)) Records.update(ENTITE, m.id, { etat: 'remplace' });
  const cree = mettreEnAttente({ genre: decision === 'oui' ? 'oui' : 'retour', deal_id: dealId, dossier: d.nom, nom: d.apercu?.agent_nom || d.contact_agent_email, a: d.contact_agent_email, objet: mail.objet, corps: mail.corps, intention, raison });
  return { ok: true, mail: cree };
}
