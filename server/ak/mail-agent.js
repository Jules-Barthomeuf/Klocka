// Le mail à l'agent immobilier d'un dossier, depuis le chat. AK le rédige,
// le montre en entier, et il ne part que sur un « envoie » de quelqu'un qui
// l'a lu. Ce qui part est exactement ce qui a été montré : le brouillon est
// gardé tel quel (AkBrouillon) et c'est lui qu'on envoie, jamais une
// reformulation du modèle. L'envoi passe par sendMail, comme depuis la
// fiche : le suivi du dossier, son statut et Monday avancent pareil.

import { Records } from '../db.js';

const ENTITE = 'AkBrouillon';
const VALIDITE_MS = 24 * 3600000;

export const INTENTIONS_AGENT = ['refus', 'demande_documents', 'relance', 'abandon', 'presentation_client'];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Pure : « envoie », « ok envoie », « vas-y envoie-le », « balance ». Pas « n'envoie pas encore ». */
export function estUnEnvoi(texte) {
  const t = norm(texte);
  if (!t || t.length > 80) return false;
  if (/\b(n'?envoie pas|envoie pas|attends?|pas encore|pas tout de suite)\b/.test(t)) return false;
  return /\b(envoie|envoies|envoi|envoyer|envoye|balance|balances)\b/.test(t);
}

/** Pure : le brouillon tel qu'il s'affiche dans le chat. */
export function afficher(b, titre = null) {
  return [
    `le mail pour ${titre || 'le dossier'} :`,
    `à : ${b.a}`,
    `de : ${b.de || 'ta boîte par défaut'}`,
    `objet : ${b.objet}`,
    '',
    b.corps,
    '',
    'dis-moi « envoie » et il part',
  ].join('\n');
}

/** Pure : ce que l'envoi change au dossier, en fin de phrase. */
export function suiteDeLEnvoi(intention) {
  if (intention === 'refus' || intention === 'abandon') return ', le dossier passe en abandonné';
  if (intention === 'demande_documents') return ', le dossier attend les docs et la relance est calée';
  return '';
}

/** La boîte qui envoie : celle qui a reçu la fiche si on y a droit, sinon la boîte par défaut. */
async function expediteur(deal, user) {
  const { listAccounts } = await import('../email.js');
  const comptes = listAccounts(user?.email);
  const source = deal?.source_mail?.mail_recu_id ? Records.get('MailRecu', deal.source_mail.mail_recu_id)?.compte : null;
  const choisi = (source && comptes.find((c) => c.email === source)) || comptes.find((c) => c.par_defaut) || comptes[0] || null;
  return choisi?.email || null;
}

/**
 * Rédige le mail et le garde en attente dans l'espace. `objet` et `corps`
 * donnés : on les prend tels quels (une retouche demandée dans le chat).
 * Un nouveau brouillon remplace celui qui attendait dans le même espace.
 */
export async function redigerPourLAgent({ deal_id, intention = 'refus', raisons = null, objet = null, corps = null, a = null }, { user = null, espace = null, pour = null } = {}) {
  if (!INTENTIONS_AGENT.includes(intention)) return { ok: false, error: `Intention inconnue : ${intention}.` };
  const { obtenirDossier, lotOuVide } = await import('../deal/index.js');
  const dossier = obtenirDossier(deal_id);
  if (!dossier) return { ok: false, error: 'Dossier introuvable.' };
  const destinataire = String(a || dossier.contact_agent_email || '').trim();
  if (!destinataire.includes('@')) return { ok: false, error: "Pas de mail d'agent sur ce dossier : demande-le, puis rappelle mail_agent avec a." };

  let mail = objet && corps ? { objet, corps } : null;
  if (!mail) {
    const { redigerMailIntention } = await import('../deal/mails-cycle.js');
    const { engagementsOuverts } = await import('../deal/engagements.js');
    mail = await redigerMailIntention(lotOuVide(dossier, 0), intention, {
      signature: user?.full_name || user?.email,
      raisons,
      sansIA: !!dossier.test,
      engagements: engagementsOuverts(deal_id),
    });
  }
  if (!mail?.objet || !mail?.corps) return { ok: false, error: 'Rédaction impossible.' };

  const brut = Records.findBy('Deal', 'deal_id', deal_id);
  const de = await expediteur(brut, user);
  const maintenant = new Date().toISOString();
  for (const b of Records.filter(ENTITE, { espace, etat: 'attente' })) Records.update(ENTITE, b.id, { etat: 'remplace', ferme_le: maintenant });
  const b = Records.create(ENTITE, { espace, pour: pour?.nom || null, deal_id, intention, a: destinataire, de, objet: mail.objet, corps: mail.corps, etat: 'attente', cree_le: maintenant });
  return { ok: true, brouillon: b, titre: dossier.nom || dossier.titre, texte: afficher(b, dossier.nom || dossier.titre) };
}

/** Le brouillon qui attend un « envoie » dans cet espace, s'il est encore frais. */
export function brouillonEnAttente(espace, maintenant = Date.now()) {
  return Records.filter(ENTITE, { espace, etat: 'attente' })
    .filter((b) => maintenant - Date.parse(b.cree_le) < VALIDITE_MS)
    .sort((x, y) => String(y.cree_le).localeCompare(String(x.cree_le)))[0] || null;
}

/** Envoie le brouillon, tel qu'il a été montré. Rend la phrase à poster. */
export async function envoyerBrouillon(b, user) {
  const { functions } = await import('../functions.js');
  let r;
  try {
    r = await functions.sendMail({ from: b.de || undefined, to: b.a, subject: b.objet, body: b.corps, deal_id: b.deal_id, intention: b.intention }, { user });
  } catch (e) {
    r = { success: false, error: e?.message || String(e) };
  }
  const maintenant = new Date().toISOString();
  if (r?.success) {
    Records.update(ENTITE, b.id, { etat: 'envoye', ferme_le: maintenant });
    return `c'est parti, mail envoyé à ${b.a}${b.de ? ` depuis ${b.de}` : ''}${suiteDeLEnvoi(b.intention)}`;
  }
  if (r?.simulated) {
    Records.update(ENTITE, b.id, { etat: 'simule', ferme_le: maintenant });
    return `rien n'est parti (${r.test ? 'dossier de test' : 'aucune boîte connectée pour toi'}), mais le dossier avance comme si${suiteDeLEnvoi(b.intention)}`;
  }
  return `dsl, l'envoi a raté : ${r?.error || 'sans détail'}. le brouillon attend toujours, redis « envoie » quand c'est réglé`;
}
