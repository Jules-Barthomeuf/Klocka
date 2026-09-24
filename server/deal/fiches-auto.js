// Une fiche commerciale arrive dans une boîte de l'équipe : le dossier naît
// tout seul. Personne ne clique, personne n'est prévenu ; on le trouve dans
// la liste des dossiers, préanalysé.
//
// Ce qui décide est écrit ici, sans modèle. Le tri des mails a déjà dit que
// le mail parle d'un bien ; il reste à distinguer une fiche nouvelle d'un
// complément envoyé pour un dossier ouvert (le bail, un diagnostic). Une
// fiche ouvre une conversation (ce n'est pas une réponse) et porte un PDF ou
// un Word qui n'est pas un document de dossier. Tout le reste suit l'ancien
// chemin : le rattachement au dossier de l'expéditeur.
//
// Cette passe tourne AVANT le rattachement : sans ça, la fiche d'un agent
// qui a déjà un dossier ouvert y entrait comme une simple pièce jointe.

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

/** Pure : le mail répond-il à une conversation déjà suivie ? */
export function estUneReponse(mail, filsConnus = new Set()) {
  return REPONSE.test(String(mail?.objet || '')) || (!!mail?.thread_id && filsConnus.has(mail.thread_id));
}

/** Pure : une nouvelle fiche, à préanalyser. */
export function estUneNouvelleFiche(mail, { filsConnus = new Set() } = {}) {
  if (!mail || mail.deal_id) return false;
  if ((mail.preanalyse_auto?.essais || 0) >= ESSAIS_MAX) return false;
  if (estUneReponse(mail, filsConnus)) return false;
  if (COMPLEMENT.test(`${mail.objet || ''} ${String(mail.texte || '').slice(0, 400)}`)) return false;
  return piecesFiche(mail).length > 0;
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

/** Les fils Gmail déjà liés à un dossier : un mail qui s'y inscrit est une réponse. */
function filsDesDossiers(mails) {
  return new Set(mails.filter((m) => m.deal_id && m.thread_id).map((m) => m.thread_id));
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

  const mails = Records.list('MailRecu');
  const filsConnus = filsDesDossiers(mails);
  const candidats = mails
    .filter((m) => Date.parse(m.date || 0) >= Date.parse(depuis) && estUneNouvelleFiche(m, { filsConnus }))
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
