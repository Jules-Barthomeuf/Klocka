// Haka, compétence « transfert » (23 oct. 2026, Jules : « mes collaborateurs gardent chacun leur boîte ; pour lancer
// une pré-analyse, la data room, etc., ils transfèrent le mail à sourcing@klocka.immo. L'assistant reçoit les
// documents et les rentre directement dans la plateforme, comme un collaborateur à qui on transmet le mail. Je préfère
// ça à l'agent qui va lui-même dans les boîtes. »).
//
// Le transfert EST la décision humaine : Haka agit sans redemander, puis répond au collègue depuis sourcing@.
//   1. lire        le transfert : la note du collègue, l'expéditeur d'origine (l'agent), l'objet d'origine, les pièces.
//   2. comprendre  une fiche à pré-analyser, des documents pour un dossier, ou une simple demande (le chat de Haka).
//                  Le dossier se trouve sans modèle : l'agent d'origine, le nom ou l'adresse du dossier dans la note
//                  ou l'objet. Un seul dossier : on y va. Plusieurs, ou aucun quand il en faut un : on demande.
//   3. choisir     (externe, seulement si Haka a demandé) : la réponse du collègue dans sa cloche.
//   4. agir        la pré-analyse (dossier au nom du collègue, l'agent d'origine en contact) ou les pièces dans la
//                  Data Room du dossier (extraction, Drive et Monday comme pour une pièce reçue).
//   5. repondre    un mail au collègue depuis sourcing@ : ce qui a été fait, avec le lien.
//
// Drapeau : HAKA_TRANSFERT (avec HAKA_FILE). Allumé, Haka ne lit plus les boîtes personnelles pour les fiches et les
// mails (le transfert remplace la veille de Haka) ; les autres passes de la veille ne changent pas.

import fs from 'node:fs';
import { Records, CHEMIN_UPLOADS } from '../../db.js';
import { SIMULER } from '../drapeaux.js';
import * as taches from '../taches.js';
import * as file from '../file.js';
import { sourceMail } from '../sources.js';
import { membreDeLEquipe, ecrireDepuisSourcing } from './demande-equipe.js';
import { piecesFiche } from '../../deal/fiches-auto.js';

export const COMPETENCE = 'transfert';
export const VERSION = '1';
const norm = (e) => String(e || '').trim().toLowerCase();
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const URL_APP = () => (process.env.URL_PUBLIQUE || 'https://app.klocka.immo').replace(/\/$/, '');
const UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp)$/i;
const PARASITES = /^(image\d+|logo|signature|banniere|banner|icon|unnamed|outlook-)/i;
const piecesUtiles = (mail) => (mail?.pieces_jointes || []).filter((p) => UTILES.test(p?.nom || '') && !PARASITES.test(p?.nom || ''));

// ---------------------------------------------------------------------------
// 1. Lire le transfert
// ---------------------------------------------------------------------------

const MARQUES = [
  /-{3,}\s*(forwarded message|message transf[ée]r[ée]|message d'origine|message original|original message)\s*-{3,}/i,
  /d[ée]but du message r[ée]exp[ée]di[ée]\s*:/i,
  /begin forwarded message\s*:/i,
  // Outlook : une ligne de soulignés, puis « De : ».
  /^_{10,}\s*\n\s*(de|from)\s*:/im,
];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Pure : « Marc Agent <marc@agence.fr> » → { nom, email }. */
export function lireAdresse(s) {
  const t = String(s || '').replace(/mailto:/gi, '').trim();
  const email = (t.match(EMAIL) || [])[0] || null;
  const nom = t.replace(/<[^>]*>/g, '').replace(EMAIL, '').replace(/["'[\]()]/g, '').trim() || null;
  return { nom, email: email ? email.toLowerCase() : null };
}

/**
 * Pure : ce que dit un mail transféré. La note du collègue (avant la marque du transfert), l'expéditeur d'origine,
 * l'objet d'origine. Sans marque, un objet « TR: / Fwd: » suffit à dire que c'est un transfert.
 */
export function lireTransfert({ texte = '', objet = '' } = {}) {
  const t = String(texte || '').replace(/\r/g, '');
  let i = -1;
  for (const m of MARQUES) { const r = t.match(m); if (r && (i < 0 || r.index < i)) i = r.index; }
  const objetPropre = String(objet || '').replace(/^\s*((tr|fw|fwd|re)\s*:\s*)+/i, '').trim();
  const estTransfert = i >= 0 || /^\s*(tr|fw|fwd)\s*:/i.test(String(objet || ''));
  if (i < 0) return { transfert: estTransfert, note: t.trim().slice(0, 2000), origine: null, objet_origine: objetPropre || null };
  const note = t.slice(0, i).trim();
  const entete = t.slice(i).split('\n').slice(1, 14).join('\n');
  const champ = (...noms) => { for (const n of noms) { const r = entete.match(new RegExp(`^\\s*\\*?${n}\\*?\\s*:\\s*(.+)$`, 'im')); if (r) return r[1].trim(); } return null; };
  const de = lireAdresse(champ('De', 'From', 'Expéditeur'));
  return {
    transfert: true,
    note: note.slice(0, 2000),
    origine: de.email ? de : null,
    objet_origine: (champ('Objet', 'Subject') || objetPropre || '').replace(/^\s*((tr|fw|fwd|re)\s*:\s*)+/i, '').trim() || null,
    date_origine: champ('Date', 'Envoyé', 'Sent') || null,
  };
}

// ---------------------------------------------------------------------------
// 2. Comprendre
// ---------------------------------------------------------------------------

const MOTS_FICHE = /pr[ée][\s-]?analys|nouvelle fiche|nouveau (bien|dossier)|fiche (commerciale|du bien)|[àa] analyser|[ée]tudier ce bien/;
const MOTS_DOCUMENTS = /data[\s-]?room|documents?|pi[eè]ces?|[àa] ranger|[àa] classer|ajoute|rajoute|mets? (le|les|dans)|bail|taxe fonci[eè]re/;
const OUVERTS = (d) => !d.archived && !d.doublon_de && !['abandonne', 'perdu', 'refuse', 'clos'].includes(d.statut);

/** Pure : les mots qui comptent dans un nom de dossier (« Boulangerie Aux Délices - Mâcon » → boulangerie, delices, macon). */
const motsDe = (s) => sansAccents(s).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !['murs', 'local', 'commercial', 'commerce', 'avec', 'dans', 'pour', 'rue', 'avenue'].includes(m));

/**
 * Pure : les dossiers que le transfert vise, du plus sûr au moins sûr. L'agent d'origine en contact d'un dossier
 * ouvert compte le plus ; ensuite le nom ou la ville du dossier dans la note et l'objet. À égalité, ceux du collègue.
 */
export function dossiersVises(lu, deals, { collegue = null } = {}) {
  const texte = sansAccents(`${lu.note || ''} ${lu.objet_origine || ''}`);
  const scores = [];
  for (const d of deals.filter(OUVERTS)) {
    let s = 0;
    if (lu.origine?.email && norm(d.contact_agent_email) === lu.origine.email) s += 3;
    const mots = motsDe(d.nom);
    const touches = mots.filter((m) => texte.includes(m)).length;
    if (touches) s += Math.min(3, touches * (mots.length <= 2 ? 1.5 : 1));
    if (!s) continue;
    if (collegue && norm(d.responsable_email) === norm(collegue)) s += 0.5;
    scores.push({ deal_id: d.deal_id, nom: d.nom || d.deal_id, score: s });
  }
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * Pure : ce que le collègue demande. `fiche` (pré-analyser), `documents` (dans la Data Room d'un dossier), `demande`
 * (une question, sans pièce : le chat de Haka). `dossier` : celui retenu ; `candidats` : quand il faut demander.
 */
export function comprendre(lu, { pieces = [], fiches = [], vises = [] } = {}) {
  const note = sansAccents(lu.note || '');
  if (!pieces.length) return { intention: 'demande' };
  const veutFiche = MOTS_FICHE.test(note);
  const veutDocs = !veutFiche && MOTS_DOCUMENTS.test(note);
  const sur = vises[0] && (vises.length === 1 || vises[0].score >= vises[1].score + 1.5) && vises[0].score >= 1.5 ? vises[0] : null;
  if (veutFiche) return { intention: 'fiche' };
  if (veutDocs) return sur ? { intention: 'documents', dossier: sur.deal_id } : { intention: 'documents', candidats: vises.slice(0, 4) };
  // Sans consigne : un dossier évident reçoit les pièces ; sinon une fiche sans dossier est une fiche ; sinon on demande.
  if (sur) return { intention: 'documents', dossier: sur.deal_id };
  if (fiches.length && !vises.length) return { intention: 'fiche' };
  return { intention: 'documents', candidats: vises.slice(0, 4), ou_fiche: fiches.length > 0 };
}

// ---------------------------------------------------------------------------
// 4. Agir
// ---------------------------------------------------------------------------

/** Une pièce simulée (`local:`) se lit sur le disque ; une vraie, dans la boîte sourcing@. */
const telecharger = async (compte, messageId, pieceId) => {
  if (String(pieceId || '').startsWith('local:')) return fs.readFileSync(String(pieceId).slice('local:'.length));
  const { telechargerPieceJointe } = await import('../../gmail-inbox.js');
  return telechargerPieceJointe(compte, messageId, pieceId);
};

async function preanalyser(mail, { membre, lu, uploadDir }) {
  const contact = lu.origine?.email && !membreDeLEquipe(lu.origine.email) ? lu.origine.email : null;
  const locale = piecesUtiles(mail).find((p) => String(p?.piece_id || '').startsWith('local:'));
  let dossier;
  if (locale || SIMULER) {
    if (!locale) throw new Error("Simulation : le mail n'a pas de pièce locale à lire.");
    const { analyserFiche } = await import('../../deal/index.js');
    dossier = await analyserFiche({ buffer: fs.readFileSync(String(locale.piece_id).slice('local:'.length)), filename: locale.nom, mimetype: locale.mime || undefined, contactEmail: contact }, { user: membre, uploadDir, automatique: true });
    Records.update('MailRecu', mail.id, { deal_id: dossier.deal_id });
  } else {
    const { preanalyserMail } = await import('../../deal/preanalyser-mail.js');
    dossier = await preanalyserMail(mail, { user: membre, uploadDir, contactEmail: contact, automatique: true });
  }
  const rejoint = !!(dossier.repris_conversation || dossier.doublon);
  const deal = Records.findBy('Deal', 'deal_id', dossier.deal_id);
  if (deal && !rejoint) {
    const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? (x.absent ? null : x.valeur) : x);
    const l = deal.lots?.[0]?.lot || {};
    const adresse = val(l.adresse) || {};
    const { titreDossier } = await import('../../deal/titre-dossier.js');
    const nom = titreDossier({ enseigne: val(l.locataire_nom), activite: val(l.locataire_activite), ville: (typeof adresse === 'object' && adresse.ville) || deal.lots?.[0]?.enrichissement?.commune?.nom || null });
    Records.update('Deal', deal.id, {
      ...(nom ? { nom } : {}),
      responsables: [membre.full_name || membre.email], responsable_email: norm(membre.email),
      source_mail: { mail_recu_id: mail.id, de: lu.origine?.email || mail.de_email, objet: lu.objet_origine || mail.objet, date: lu.date_origine || mail.date, transfere_par: norm(membre.email) },
      par_haka: { competence: COMPETENCE, version: VERSION, le: new Date().toISOString() },
      apports: [...(deal.apports || []), { de: lu.origine?.email || null, transfere_par: norm(membre.email), mail_recu_id: mail.id, le: new Date().toISOString() }],
    });
    const { ajouterSuivi } = await import('../../deal/lifecycle.js');
    ajouterSuivi(Records.get('Deal', deal.id), { type: 'preanalyse_auto', detail: `Transféré à Haka par ${membre.full_name || membre.email}${lu.origine?.email ? ` (fiche de ${lu.origine.email})` : ''} : dossier créé et pré-analysé` }, membre);
  }
  const d = Records.findBy('Deal', 'deal_id', dossier.deal_id);
  return { fait: rejoint ? 'rejoint' : 'fiche', deal_id: dossier.deal_id, nom: d?.nom || null, verdict: d?.lots?.[0]?.evaluation?.verdict || null };
}

async function ranger(mail, { membre, dealId, uploadDir }) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) throw new Error('Dossier introuvable');
  Records.update('MailRecu', mail.id, { deal_id: dealId, haka_attente_rangement: false, pieces_ingerees: false });
  const { ingererPiecesJointes } = await import('../../deal/pieces-mails.js');
  const r = await ingererPiecesJointes(Records.get('MailRecu', mail.id), uploadDir || CHEMIN_UPLOADS, membre, telecharger, { ranger: !SIMULER && !deal.test });
  if (!r.deposes.length && r.erreurs.length && !r.erreurs.every((e) => /déjà au dossier/.test(e))) throw new Error(r.erreurs[0]);
  return { fait: 'documents', deal_id: dealId, nom: deal.nom || dealId, deposes: r.deposes, deja: r.erreurs.filter((e) => /déjà au dossier/.test(e)).map((e) => e.split(' : ')[0]) };
}

/** Pure : le mail de Haka au collègue, une fois le geste fait. */
export function compteRendu(r, { prenom = null, objet = '' } = {}) {
  const lien = r.deal_id ? `${URL_APP()}/Dossiers?deal_id=${r.deal_id}` : null;
  const bonjour = `Bonjour${prenom ? ` ${prenom}` : ''},`;
  let corps;
  if (r.fait === 'fiche') corps = `C'est fait : le dossier « ${r.nom || 'nouveau bien'} » est créé à votre nom et pré-analysé${r.verdict ? ` (verdict : ${r.verdict})` : ''}.`;
  else if (r.fait === 'rejoint') corps = `Ce bien était déjà en dossier (« ${r.nom || r.deal_id} ») : j'y ai rattaché votre transfert, sans en créer un second.`;
  else if (r.fait === 'documents') corps = r.deposes.length ? `C'est fait : ${r.deposes.length} pièce${r.deposes.length > 1 ? 's' : ''} dans la Data Room de « ${r.nom} » (${r.deposes.join(', ')}). La lecture des pièces est lancée.${r.deja.length ? ` Déjà présentes, non redéposées : ${r.deja.join(', ')}.` : ''}` : `Ces pièces étaient déjà dans la Data Room de « ${r.nom} » : rien à ajouter.`;
  else corps = "Je n'ai rien fait de ce transfert.";
  return { objet: `Re: ${String(objet || 'votre transfert').replace(/^\s*re\s*:\s*/i, '')}`, corps: `${bonjour}\n\n${corps}${lien ? `\n\n${lien}` : ''}\n\nHaka` };
}

taches.enregistrer(COMPETENCE, {
  version: VERSION,
  etapes: [
    {
      nom: 'comprendre',
      async run({ charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        if (!mail) throw new Error('Mail introuvable');
        const membre = membreDeLEquipe(mail.de_email);
        if (!membre) return { fin: true, ignore: 'expéditeur hors équipe' };
        const lu = lireTransfert({ texte: mail.texte, objet: mail.objet });
        const pieces = piecesUtiles(mail);
        const fiches = piecesFiche(mail).filter(Boolean);
        const vises = dossiersVises(lu, Records.list('Deal'), { collegue: membre.email });
        const c = comprendre(lu, { pieces, fiches, vises });
        Records.update('MailRecu', mail.id, { haka_transfert: { intention: c.intention, origine: lu.origine?.email || null, le: new Date().toISOString() } });
        return { ...c, lu, pour: norm(membre.email), pieces: pieces.map((p) => p.nom) };
      },
    },
    {
      // Une simple demande, sans pièce : la compétence « demande de l'équipe » (le chat de Haka) la prend.
      nom: 'demande',
      async run({ resultats, charge }) {
        if (resultats.comprendre.intention !== 'demande') return {};
        const t = taches.enfiler('demande_equipe', { mail_id: charge.mail_id }, { cle: `demande:${charge.mail_id}`, pour: resultats.comprendre.pour });
        Records.update('MailRecu', charge.mail_id, { haka_tache_id: t.id });
        return { fin: true, demande: t.id };
      },
    },
    {
      // Plusieurs dossiers possibles, ou aucun : on demande au collègue, dans sa cloche.
      nom: 'demander_dossier',
      async run({ tache, resultats, charge }) {
        const c = resultats.comprendre;
        if (c.intention === 'fiche' || c.dossier) return { sauter: ['choisir'] };
        const mail = Records.get('MailRecu', charge.mail_id);
        const choix = [
          ...(c.candidats || []).map((x) => ({ cle: x.deal_id, libelle: x.nom })),
          { cle: 'fiche', libelle: c.ou_fiche ? "C'est un nouveau bien : pré-analyser" : 'Nouveau dossier (pré-analyser)' },
        ];
        const p = await file.proposer({
          type: 'transfert_dossier', titre: `Votre transfert « ${String(c.lu.objet_origine || mail.objet || '').slice(0, 60)} » : pour quel dossier ?`,
          resume: `${c.pieces.length} pièce${c.pieces.length > 1 ? 's' : ''} : ${c.pieces.slice(0, 4).join(', ')}.${(c.candidats || []).length ? '' : " Je n'ai reconnu aucun dossier ouvert : dites-moi lequel dans la note du prochain transfert, ou pré-analysez."}`,
          charge: { mail_id: mail.id, candidats: (c.candidats || []).map((x) => ({ deal_id: x.deal_id, titre: x.nom, niveau: 'transfert' })) },
          sources: [sourceMail(mail)], pour: c.pour, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'choisir',
          cle: `transfert:${mail.id}`, actions: ['choisir'], choix,
        });
        return { attendre: 'validation', proposition_id: p.id };
      },
    },
    {
      nom: 'choisir', externe: true,
      async run({ charge }) {
        if (!charge.choix) throw new Error('Choisissez un dossier, ou « Nouveau dossier ».');
        // La suite (une pré-analyse, ou le dépôt des pièces) est longue : le clic rend la main, la tâche repart en fond.
        return { choix: charge.choix, enFond: true };
      },
    },
    {
      nom: 'agir',
      async run({ resultats, charge }) {
        const c = resultats.comprendre;
        const mail = Records.get('MailRecu', charge.mail_id);
        const membre = membreDeLEquipe(mail.de_email);
        const choix = resultats.choisir?.choix || null;
        const uploadDir = charge.uploadDir || CHEMIN_UPLOADS;
        const r = c.intention === 'fiche' || choix === 'fiche'
          ? await preanalyser(mail, { membre, lu: c.lu, uploadDir })
          : await ranger(mail, { membre, dealId: c.dossier || choix, uploadDir });
        return { ...r, dossier: r.deal_id };
      },
    },
    {
      nom: 'repondre',
      async run({ resultats, charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        const membre = membreDeLEquipe(mail.de_email);
        const { objet, corps } = compteRendu(resultats.agir, { prenom: String(membre?.full_name || '').split(' ')[0] || null, objet: mail.objet });
        const envoi = await ecrireDepuisSourcing({ a: norm(membre.email), objet, corps, template_id: `haka-transfert:${mail.id}` });
        return { ...envoi, corps };
      },
    },
  ],
});

/** Un transfert d'un membre de l'équipe sur sourcing@ devient une tâche. */
export function surTransfert(mail, { uploadDir = null, lancer } = {}) {
  const t = taches.enfiler(COMPETENCE, { mail_id: mail.id, uploadDir }, { cle: `transfert:${mail.id}`, pour: norm(mail.de_email), ...(lancer === undefined ? {} : { lancer }) });
  Records.update('MailRecu', mail.id, { haka_tache_id: t.id });
  return t;
}

