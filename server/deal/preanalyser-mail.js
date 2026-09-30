// La pré-analyse d'un mail reçu : le message entier (RFC 822, pièces
// comprises) passe dans le pipeline .eml, le dossier naît, le mail lui est
// lié et l'expéditeur devient le contact agent. L'écran et AK font pareil.
//
// Un mail qui porte PLUSIEURS fiches (« 4 fiches » d'un même agent : Mantes,
// Mâcon, Vimoutiers, Tourcoing) donne un dossier par fiche : chaque pièce qui
// peut être une fiche (piecesFiche : ni bail, ni PV, ni diagnostic) est lue
// seule. Le mail est lié au premier dossier et garde la liste de tous.

import { Records } from '../db.js';
import { telechargerRaw, telechargerPieceJointe } from '../gmail-inbox.js';
import { analyserFiche } from './index.js';
import { piecesFiche, dossierDeLaConversation, doublonDe, contexteDesConversations } from './fiches-auto.js';
import { ajouterSuivi } from './lifecycle.js';

/**
 * @returns {Promise<object>} le premier dossier ; avec plusieurs fiches, sa
 *   propriété `dossiers` les liste tous, dans l'ordre des pièces.
 */
export async function preanalyserMail(mailRecu, { user = null, uploadDir = null, contactEmail = undefined } = {}) {
  if (mailRecu.deal_id) throw new Error('Ce mail a déjà été préanalysé.');

  // Une réponse dans la conversation d'un dossier, ou la même fiche déjà
  // traitée il y a peu : on ne recrée rien. Le mail est rattaché au dossier
  // (ses pièces y suivront par la veille), et l'appelant le dit. C'est la
  // garde de TOUS les chemins de création — le bouton, AK, « fais tout ».
  const contexte = contexteDesConversations();
  const conversation = dossierDeLaConversation(mailRecu, contexte);
  const doublon = conversation ? null : doublonDe(mailRecu, { mails: contexte.mails, deals: contexte.deals });
  const dealExistant = conversation || doublon;
  if (dealExistant) {
    const deal = Records.findBy('Deal', 'deal_id', dealExistant);
    Records.update('MailRecu', mailRecu.id, { deal_id: dealExistant });
    ajouterSuivi(deal, {
      type: 'mail_rattache',
      detail: `« ${String(mailRecu.objet || '').slice(0, 100)} » de ${mailRecu.de_email || '?'} ${conversation ? 'répond à la conversation de ce dossier' : 'porte une fiche déjà traitée ici'} : rattaché, pas de nouveau dossier`,
    }, user);
    return { ...deal, repris_conversation: !!conversation, doublon: !!doublon };
  }
  // L'expéditeur devient le contact agent, sauf quand on dit le contraire :
  // un mail transféré par quelqu'un de l'équipe n'a pas d'agent dedans.
  const contact = contactEmail === undefined ? mailRecu.de_email || null : contactEmail;
  const origine = { mail_recu_id: mailRecu.id, de: mailRecu.de, objet: mailRecu.objet, date: mailRecu.date };

  const fiches = piecesFiche(mailRecu).filter((p) => p?.piece_id);
  if (fiches.length >= 2) {
    const dossiers = [];
    for (const p of fiches) {
      const buffer = await telechargerPieceJointe(mailRecu.compte, mailRecu.gmail_message_id, p.piece_id);
      const dossier = await analyserFiche(
        { buffer, filename: p.nom, mimetype: p.mime || undefined, contactEmail: contact },
        { user, uploadDir }
      );
      Records.update('Deal', Records.findBy('Deal', 'deal_id', dossier.deal_id).id, { source_mail: { ...origine, piece: p.nom } });
      dossiers.push(dossier);
    }
    Records.update('MailRecu', mailRecu.id, { deal_id: dossiers[0].deal_id, deal_ids: dossiers.map((d) => d.deal_id) });
    return Object.assign(dossiers[0], { dossiers });
  }

  const buffer = await telechargerRaw(mailRecu.compte, mailRecu.gmail_message_id);
  const dossier = await analyserFiche(
    { buffer, filename: `${(mailRecu.objet || 'mail').slice(0, 60)}.eml`, mimetype: 'message/rfc822', contactEmail: contact },
    { user, uploadDir }
  );
  Records.update('MailRecu', mailRecu.id, { deal_id: dossier.deal_id });
  Records.update('Deal', Records.findBy('Deal', 'deal_id', dossier.deal_id).id, { source_mail: origine });
  return dossier;
}

const norme = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Un mail déjà préanalysé en un seul dossier alors qu'il portait plusieurs
 * fiches (avant le 30 septembre 2026, tout le mail faisait un dossier) : les
 * fiches restantes deviennent chacune un dossier. Celle du dossier existant
 * est reconnue à sa ville dans le nom du fichier ; sans ville reconnue, on ne
 * devine pas et on ne crée rien.
 * @returns {Promise<{ok: boolean, dossiers?: object[], ecartee?: string, error?: string}>}
 */
export async function completerFichesDuMail(mailRecu, { user = null, uploadDir = null, contactEmail = undefined } = {}) {
  const fiches = piecesFiche(mailRecu).filter((p) => p?.piece_id);
  if (fiches.length < 2) return { ok: false, error: 'Ce mail ne porte qu\'une fiche.' };
  if (mailRecu.deal_ids?.length > 1) return { ok: false, error: 'Les fiches de ce mail ont déjà chacune leur dossier.' };
  const existant = Records.findBy('Deal', 'deal_id', mailRecu.deal_id);
  const lot = existant?.lots?.[0]?.lot || {};
  const adresse = lot.adresse?.valeur ?? lot.adresse;
  const ville = norme((adresse && typeof adresse === 'object' ? adresse.ville : null) || existant?.lots?.[0]?.enrichissement?.commune?.nom || existant?.nom || '');
  const mots = ville.split(' ').filter((m) => m.length > 3);
  const deja = fiches.find((p) => mots.length && mots.every((m) => norme(p.nom).includes(m)));
  if (!deja) return { ok: false, error: 'Je ne reconnais pas, parmi les fiches du mail, celle du dossier déjà créé : dis-moi laquelle c\'est.' };
  const contact = contactEmail === undefined ? mailRecu.de_email || null : contactEmail;
  const origine = { mail_recu_id: mailRecu.id, de: mailRecu.de, objet: mailRecu.objet, date: mailRecu.date };
  const dossiers = [];
  for (const p of fiches.filter((x) => x !== deja)) {
    const buffer = await telechargerPieceJointe(mailRecu.compte, mailRecu.gmail_message_id, p.piece_id);
    const dossier = await analyserFiche({ buffer, filename: p.nom, mimetype: p.mime || undefined, contactEmail: contact }, { user, uploadDir });
    Records.update('Deal', Records.findBy('Deal', 'deal_id', dossier.deal_id).id, { source_mail: { ...origine, piece: p.nom } });
    dossiers.push(dossier);
  }
  Records.update('MailRecu', mailRecu.id, { deal_ids: [mailRecu.deal_id, ...dossiers.map((d) => d.deal_id)] });
  return { ok: true, dossiers, ecartee: deja.nom };
}
