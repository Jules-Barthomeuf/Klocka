// Une fiche arrive dans la boîte : AK la signale en privé et demande s'il la
// préanalyse. Un « oui », et il fait tout seul (dossier nommé, fiche dedans,
// critères, marché, clients), puis revient avec son avis. Un « non », et le
// mail est écarté comme « Pas pertinent » sur le dashboard.
//
// C'est, avec l'annonce d'une tâche finie, le seul message qu'AK envoie sans
// qu'on lui parle : l'équipe ne veut pas de « le dossier X est incomplet ».
// Il écrit en privé aux adresses d'AK_FICHES_POUR ; vide, personne n'est
// prévenu. Une question à la fois par personne : la suivante attend la
// réponse, sinon un « oui » ne dirait pas à quelle fiche il répond.

import { Records, Meta } from '../db.js';

const ENTITE = 'AkQuestion';
const CLE_DEPUIS = 'ak.fiches.depuis';
const CLE_PRIVES = 'ak.prives';
// Une fiche plus vieille n'est plus une nouvelle : on ne la signale pas.
const FENETRE_MS = 48 * 3600000;
const PIECES_UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp|eml)$/i;
const PIECES_INUTILES = /^(image\d+|logo|signature|banniere|banner|icon)/i;
// Une fiche collée dans le corps du mail, sans pièce jointe.
const TEXTE_FICHE = 400;

export const destinataires = (brut = process.env.AK_FICHES_POUR) =>
  String(brut || '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => x.includes('@'));

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const nomPiece = (p) => (typeof p === 'string' ? p : p?.nom || '');

/** Pure : les pièces qui comptent, sans les logos et les signatures. */
export const piecesUtiles = (mail) => (mail?.pieces_jointes || []).map(nomPiece).filter((n) => PIECES_UTILES.test(n) && !PIECES_INUTILES.test(n));

/** Pure : ce mail porte-t-il une fiche ? Une pièce utile, ou un texte assez long pour en être une. */
export function ressembleAUneFiche(mail) {
  return piecesUtiles(mail).length > 0 || String(mail?.texte || '').trim().length >= TEXTE_FICHE;
}

/**
 * Pure : les mails à proposer à une personne, du plus ancien au plus récent.
 * Pas encore rattachés à un dossier, reçus depuis l'activation et depuis
 * moins de 48 h, qui ressemblent à une fiche, et jamais proposés à elle.
 */
export function fichesAProposer({ mails, questions, pour, depuis, maintenant = new Date() }) {
  const deja = new Set(questions.filter((q) => q.pour_email === pour).map((q) => q.mail_id));
  const t0 = Date.parse(depuis || 0) || 0;
  return mails
    .filter((m) => !m.deal_id && m.date && Date.parse(m.date) >= t0 && maintenant - Date.parse(m.date) < FENETRE_MS)
    .filter((m) => !deja.has(m.id) && ressembleAUneFiche(m))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Pure : la question, sur le ton de l'équipe. */
export function questionPour(mail, { apres = 0 } = {}) {
  const pieces = piecesUtiles(mail);
  const quoi = pieces.length
    ? `${pieces.length} pièce${pieces.length > 1 ? 's' : ''} : ${pieces.slice(0, 3).join(', ')}${pieces.length > 3 ? '…' : ''}`
    : 'la fiche est dans le corps du mail';
  const suite = apres ? `\n(${apres} autre${apres > 1 ? 's' : ''} fiche${apres > 1 ? 's' : ''} derrière, je te les propose après)` : '';
  return `nouvelle fiche de ${mail.de || mail.de_email} : « ${String(mail.objet || '(sans objet)').slice(0, 90)} », ${quoi}. je la préanalyse ? oui ou non${suite}`;
}

/** Pure : « non », « nan », « pas pertinent », « laisse tomber », « rav ». Lu avant le oui : « non pas sûr » n'est pas un oui. */
export function estUnNon(texte) {
  const t = norm(texte);
  return t.length <= 80 && /(^|\b)(non|nan|nope|pas pertinent|pas la peine|laisse tomber|rav|osef|skip|pas interessant|poubelle)(\b|$)/.test(t);
}

const ouvertes = () => Records.filter(ENTITE, { etat: 'posee' });

/**
 * La question en attente dans un espace, s'il y en a une. Une fiche
 * préanalysée entre-temps (depuis la plateforme, par quelqu'un d'autre)
 * ferme la question : il n'y a plus rien à demander.
 */
export function questionOuverte(espace) {
  for (const q of ouvertes().filter((x) => x.espace === espace)) {
    const m = Records.get('MailRecu', q.mail_id);
    if (!m || m.deal_id) { Records.update(ENTITE, q.id, { etat: 'caduque', ferme_le: new Date().toISOString() }); continue; }
    return q;
  }
  return null;
}

/** Le privé avec une personne, ouvert une fois de notre côté puis gardé. */
export async function priveDe(email, { assurerPrive }) {
  const prives = (() => { try { return JSON.parse(Meta.get(CLE_PRIVES) || '{}'); } catch { return {}; } })();
  if (prives[email]) return prives[email];
  // spaces.setup accepte l'adresse comme identifiant : users/nom@domaine.
  const espace = await assurerPrive(`users/${email}`);
  if (espace) Meta.set(CLE_PRIVES, JSON.stringify({ ...prives, [email]: espace }));
  return espace;
}

/**
 * Pose les questions dues : pour chaque personne d'AK_FICHES_POUR sans
 * question en attente, la plus ancienne fiche pas encore proposée. Le
 * premier passage fixe la date d'activation : les fiches d'avant restent
 * au dashboard, AK ne déterre pas la boîte.
 * @returns {Promise<number>} questions posées
 */
export async function poserLesQuestions({ assurerPrive, envoyer, memoriser = () => {}, pour = destinataires(), maintenant = new Date() }) {
  if (!pour.length) return 0;
  let depuis = Meta.get(CLE_DEPUIS);
  if (!depuis) { depuis = maintenant.toISOString(); Meta.set(CLE_DEPUIS, depuis); }
  const mails = Records.list('MailRecu');
  let posees = 0;
  for (const email of pour) {
    const liste = fichesAProposer({ mails, questions: Records.list(ENTITE), pour: email, depuis, maintenant });
    if (!liste.length) continue;
    const espace = await priveDe(email, { assurerPrive });
    if (!espace || questionOuverte(espace)) continue;
    const [mail, ...reste] = liste;
    const texte = questionPour(mail, { apres: reste.length });
    await envoyer(espace, texte);
    memoriser(espace, texte, `mail_id ${mail.id}, de boite_recue`);
    Records.create(ENTITE, { genre: 'fiche', mail_id: mail.id, pour_email: email, espace, etat: 'posee', pose_le: maintenant.toISOString() });
    posees += 1;
  }
  return posees;
}

/**
 * La réponse à une question en attente. Rend ce qu'il faut faire, ou null
 * quand le message n'est ni un oui ni un non : il repart alors au modèle,
 * comme n'importe quelle demande, et la question reste ouverte.
 * @returns {{texte:string, tache?:object}|null}
 */
export function repondreALaQuestion(message, { estUnOui, par = null }) {
  const q = questionOuverte(message.espace);
  if (!q) return null;
  const texte = message.texte || '';
  const mail = Records.get('MailRecu', q.mail_id);
  const maintenant = new Date().toISOString();
  if (estUnNon(texte)) {
    Records.update(ENTITE, q.id, { etat: 'refusee', ferme_le: maintenant });
    ecarter(mail, par);
    return { texte: 'ok je laisse tomber, elle reviendra pas' };
  }
  if (estUnOui(texte)) {
    Records.update(ENTITE, q.id, { etat: 'acceptee', ferme_le: maintenant });
    return {
      texte: "c'est parti, je te fais un retour dès que c'est prêt",
      tache: { genre: 'preanalyse', libelle: `la préanalyse de « ${String(mail?.objet || 'la fiche').slice(0, 60)} »`, mail_id: q.mail_id },
    };
  }
  return null;
}

/** Le « non » vaut « Pas pertinent » : ce mail-ci sert d'exemple au tri, l'expéditeur reste écouté. */
function ecarter(mail, par) {
  if (!mail) return;
  import('../deal/tri-mails.js')
    .then(({ apprendre }) => {
      apprendre({ email: String(mail.de_email || '').toLowerCase(), decision: 'ignorer', motif: 'refusé dans le chat', portee: 'mail', exemple: mail, par });
      Records.delete('MailRecu', mail.id);
    })
    .catch((e) => console.warn('[ak] tri du mail refusé impossible :', e?.message || e));
}
