// Une fiche commerciale arrive dans une boîte de l'équipe : le dossier naît
// tout seul. Personne ne clique, personne n'est prévenu ; on le trouve dans
// la liste des dossiers, préanalysé.
//
// Ce qui décide est écrit ici, sans modèle. Le tri des mails a déjà dit que
// le mail parle d'un bien ; il reste à distinguer une fiche nouvelle d'un
// complément pour un dossier (le bail, un diagnostic). Une fiche porte un PDF
// ou un Word qui n'est pas un document de dossier, et ne continue la
// conversation d'aucun dossier. Qui l'envoie ne compte pas : l'agent d'un
// dossier ouvert qui envoie une autre fiche envoie un autre bien.
//
// Cette passe tourne AVANT le rattachement, et le rattachement par
// expéditeur ne prend jamais un mail qui porte une fiche.

import { Records, Meta } from '../db.js';
import { typeDepuisCategorie } from './grille.js';
import { ajouterSuivi } from './lifecycle.js';

export const AUTO = /^(1|true|oui|yes)$/i.test(process.env.MAIL_PREANALYSE_AUTO || '');
const CLE_DEPUIS = 'mail.preanalyse_auto.depuis';
// Une préanalyse coûte un appel au modèle : trois par passage au plus, les
// suivantes passent au passage d'après.
const PAR_PASSAGE = 3;
const ESSAIS_MAX = 2;
const DOUBLON_JOURS = 14;

const FICHE = /\.(pdf|docx?)$/i;
const PARASITES = /^(image\d+|logo|signature|banniere|banner|icon|unnamed)/i;
// Ce que le classement par nom ne voit pas : « DIAG DT », « diag. ».
const DOCUMENT_DE_DOSSIER = /\bdiag\b|\bdt\b|\bdpe\b|\bkbis\b|\bstatuts\b|\brib\b|\bfacture\b/i;
const REPONSE = /^\s*(re|ré|aw|sv|antw)\s*:/i;
const COMPLEMENT = /compl[ée]ment|doc(ument)?s?\s+compl|pi[èe]ces?\s+(compl|suppl)|suite\s+(à|a)\s+(notre|votre)|comme\s+convenu|ci-joint\s+(le|les)\s+(bail|pv|diag)/i;

const nomPiece = (p) => String((typeof p === 'string' ? p : p?.nom) || '');

/** Pure : les pièces qui peuvent être la fiche. Un bail, un PV, un diagnostic n'en sont pas. */
export function piecesFiche(mail) {
  return (mail?.pieces_jointes || []).filter((p) => {
    const nom = nomPiece(p);
    if (!FICHE.test(nom) || PARASITES.test(nom)) return false;
    const lisible = nom.replace(/[_\-.()]+/g, ' ');
    return !typeDepuisCategorie(null, nom) && !DOCUMENT_DE_DOSSIER.test(lisible);
  });
}

const sansPrefixes = (objet) => {
  let t = String(objet || '').trim();
  let avant;
  do { avant = t; t = t.replace(/^\s*(re|ré|tr|fw|fwd|aw|sv|antw)\s*:\s*/i, ''); } while (t !== avant);
  return t.toLowerCase().replace(/\s+/g, ' ').trim();
};

/**
 * Pure : le dossier dont ce mail continue la conversation. Un fil Gmail déjà
 * lié à un dossier, ou la réponse à un mail envoyé pour un dossier (même fil,
 * ou « Re: » de son objet, par la personne à qui on l'a écrit). C'est la
 * seule façon d'entrer dans un dossier existant pour un mail qui porte une
 * fiche : son expéditeur, lui, ne dit rien.
 */
export function dossierDeLaConversation(mail, { mails = [], envois = [], deals = [] } = {}) {
  if (!mail) return null;
  const vivants = new Set(deals.filter((d) => !d.archived).map((d) => d.deal_id));
  if (mail.thread_id) {
    const m = mails.find((x) => x.id !== mail.id && x.deal_id && x.thread_id === mail.thread_id && vivants.has(x.deal_id));
    if (m) return m.deal_id;
    const e = envois.find((x) => x.deal_id && x.thread_id && x.thread_id === mail.thread_id && vivants.has(x.deal_id));
    if (e) return e.deal_id;
  }
  if (REPONSE.test(String(mail.objet || ''))) {
    const sujet = sansPrefixes(mail.objet);
    const de = String(mail.de_email || '').toLowerCase();
    const e = envois
      .filter((x) => x.deal_id && vivants.has(x.deal_id) && de && sansPrefixes(x.subject || x.sujet) === sujet && String(x.to || x.destinataire || '').toLowerCase().includes(de))
      .sort((x, y) => String(y.sent_at || '').localeCompare(String(x.sent_at || '')))[0];
    if (e) return e.deal_id;
  }
  return null;
}

/**
 * Pure : le mail porte-t-il une fiche ? Une pièce qui peut l'être, et rien
 * qui l'annonce comme un complément. Vrai même pour l'agent d'un dossier
 * ouvert : une fiche fait un dossier, quel que soit celui qui l'envoie.
 */
export function porteUneFiche(mail) {
  if (COMPLEMENT.test(`${mail?.objet || ''} ${String(mail?.texte || '').slice(0, 400)}`)) return false;
  return piecesFiche(mail).length > 0;
}

/** Pure : une nouvelle fiche, à préanalyser : elle ne continue la conversation d'aucun dossier. */
export function estUneNouvelleFiche(mail, contexte = {}) {
  if (!mail || mail.deal_id) return false;
  if ((mail.preanalyse_auto?.essais || 0) >= ESSAIS_MAX) return false;
  if (dossierDeLaConversation(mail, contexte)) return false;
  return porteUneFiche(mail);
}

/** Ce qu'il faut pour lire les conversations : les mails, les envois liés à un dossier, les dossiers. */
export function contexteDesConversations() {
  return {
    mails: Records.list('MailRecu'),
    envois: Records.list('EmailLog').filter((e) => e.deal_id),
    deals: Records.list('Deal'),
  };
}

/**
 * Pure : la même fiche déjà préanalysée depuis un autre mail (un transfert à
 * une autre boîte, un renvoi) : même nom de pièce, il y a moins de quatorze
 * jours. Le mail rejoint ce dossier au lieu d'en créer un second.
 */
export function doublonDe(mail, { mails, deals, maintenant = Date.now() }) {
  const noms = new Set(piecesFiche(mail).map((p) => nomPiece(p).toLowerCase()));
  if (!noms.size) return null;
  const sources = new Map(deals.filter((d) => d.source_mail?.mail_recu_id && !d.archived).map((d) => [d.source_mail.mail_recu_id, d.deal_id]));
  for (const m of mails) {
    if (m.id === mail.id || !sources.has(m.id)) continue;
    if (maintenant - Date.parse(m.date || 0) > DOUBLON_JOURS * 86400000) continue;
    if (piecesFiche(m).some((p) => noms.has(nomPiece(p).toLowerCase()))) return sources.get(m.id);
  }
  return null;
}

/**
 * La passe : chaque nouvelle fiche devient un dossier préanalysé et nommé
 * « Enseigne - Ville ». Le premier passage fixe la date de mise en route :
 * les mails d'avant restent au dashboard, la veille ne rejoue pas la boîte.
 * Une fiche qui rate est retentée une fois, puis laissée au dashboard.
 */
export async function preanalyserLesNouvellesFiches({ uploadDir, maintenant = new Date(), actif = AUTO, preanalyser = null } = {}) {
  const bilan = { crees: 0, rejoints: 0, lignes: [], erreurs: [], echecs: [] };
  if (!actif) return bilan;
  let depuis = Meta.get(CLE_DEPUIS);
  if (!depuis) { depuis = maintenant.toISOString(); Meta.set(CLE_DEPUIS, depuis); }

  const contexte = contexteDesConversations();
  const candidats = contexte.mails
    .filter((m) => Date.parse(m.date || 0) >= Date.parse(depuis) && estUneNouvelleFiche(m, contexte))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, PAR_PASSAGE);
  if (!candidats.length) return bilan;

  const faire = preanalyser || (await import('./preanalyser-mail.js')).preanalyserMail;
  const { titreDossier } = await import('./titre-dossier.js');
  const { referentielTri } = await import('./tri-mails.js');
  const ref = referentielTri();
  const estInterne = (email) => {
    const e = String(email || '').toLowerCase();
    return ref.internes.has(e) || ref.domaines.has(e.split('@')[1] || '');
  };
  for (const mail of candidats) {
    const doublon = doublonDe(mail, { mails: Records.list('MailRecu'), deals: Records.list('Deal'), maintenant: maintenant.getTime() });
    if (doublon) {
      Records.update('MailRecu', mail.id, { deal_id: doublon });
      const deal = Records.findBy('Deal', 'deal_id', doublon);
      if (deal) ajouterSuivi(deal, { type: 'mail_recu', detail: `La même fiche est aussi arrivée chez ${mail.compte}, de ${mail.de_email}` }, null);
      bilan.rejoints += 1;
      continue;
    }
    try {
      const auteur = Records.filter('User', { email: mail.compte })[0] || null;
      // Une fiche transférée par l'équipe n'a pas d'agent dedans.
      const interne = mail.interne || estInterne(mail.de_email);
      const dossier = await faire(mail, { user: auteur, uploadDir, contactEmail: interne ? null : undefined });
      const deal = Records.findBy('Deal', 'deal_id', dossier.deal_id);
      const l = deal?.lots?.[0]?.lot || {};
      const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
      const adresse = val(l.adresse) || {};
      const nom = titreDossier({ enseigne: val(l.locataire_nom), activite: val(l.locataire_activite), ville: (typeof adresse === 'object' && adresse.ville) || deal?.lots?.[0]?.enrichissement?.commune?.nom || null });
      if (deal && nom) Records.update('Deal', deal.id, { nom, cree_par_la_veille: true });
      if (deal) ajouterSuivi(Records.get('Deal', deal.id), { type: 'preanalyse_auto', detail: `Préanalysé tout seul à l'arrivée du mail de ${mail.de_email} dans ${mail.compte} : « ${String(mail.objet || '').slice(0, 120)} »` }, null);
      bilan.crees += 1;
      bilan.lignes.push({ dossier: nom || dossier.deal_id, deal_id: dossier.deal_id, de: mail.de_email, documents: piecesFiche(mail).map(nomPiece), preanalyse: true });
    } catch (e) {
      const essais = (mail.preanalyse_auto?.essais || 0) + 1;
      Records.update('MailRecu', mail.id, { preanalyse_auto: { essais, erreur: String(e?.message || e).slice(0, 240), le: new Date().toISOString() } });
      bilan.erreurs.push(`Préanalyse de « ${mail.objet || mail.id} » : ${e?.message || e}`);
      bilan.echecs.push({ operation: 'preanalyse_auto', compte: mail.compte, quoi: `Fiche « ${String(mail.objet || '').slice(0, 80)} » non préanalysée`, cause: String(e?.message || e).slice(0, 240), le: new Date().toISOString() });
    }
  }
  return bilan;
}
