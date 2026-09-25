// Les outils propres à AK qui vont au-delà de la plateforme : le couperet de
// la renta, la recherche de biens, la lecture d'une pièce jointe, ALX, le
// brouillon au propriétaire. Chaque outil est du code ordinaire ; le modèle
// choisit, le code fait. Les fonctions pures sont testées sans réseau.

import { titreDossier } from '../deal/titre-dossier.js';
import { lotPourLecture } from '../deal/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records } from '../db.js';

const ici = path.dirname(fileURLToPath(import.meta.url));
export const SEUILS = JSON.parse(fs.readFileSync(path.join(ici, 'seuils.json'), 'utf8'));

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
const nombre = (x) => { const n = Number(val(x)); return Number.isFinite(n) && n > 0 ? n : null; };
const titreDeal = (d) => d?.nom || d?.lots?.[0]?.synthese?.titre || d?.source?.nom_fichier || d?.deal_id;

/** La date de fin d'un bail, lue dans ce qu'on a écrit : « 06/07/2034 », « 2028-01-31 », « janvier 2028 ». Pure. */
export function finDeBail(texte) {
  const t = String(val(texte) || '').trim();
  if (!t) return null;
  let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const bas = t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  m = bas.match(new RegExp(`(${MOIS.join('|')})\\s+(\\d{4})`));
  if (m) return new Date(Date.UTC(+m[2], MOIS.indexOf(m[1]) + 1, 0));
  m = bas.match(/\b(20\d{2})\b/);
  if (m) return new Date(Date.UTC(+m[1], 11, 31));
  return null;
}

const cran = (valeur, seuils, plusEstMieux = true) => {
  if (valeur == null) return null;
  if (plusEstMieux) return valeur >= seuils.tourne ? 'tourne' : valeur <= seuils.dead ? 'dead' : 'limite';
  return valeur <= seuils.tourne ? 'tourne' : valeur >= seuils.dead ? 'dead' : 'limite';
};

/**
 * Le couperet : ça tourne, c'est limite, ou c'est dead. Pure.
 * @param {{prix_fai:number, loyer:number, bail_fin?:Date|null, ca?:number|null, honoraires_inclus?:boolean, honoraires?:number|null}} b
 * @param {Date} [aujourdhui]
 */
export function couperet(b, aujourdhui = new Date(), seuils = SEUILS) {
  const prix = nombre(b.prix_fai); const loyer = nombre(b.loyer);
  if (!prix || !loyer) return { verdict: null, motif: !prix ? 'prix inconnu' : 'loyer inconnu' };
  const honoraires = b.honoraires_inclus === false && nombre(b.honoraires) ? nombre(b.honoraires) : 0;
  const aem = Math.round((prix + honoraires) * (1 + seuils.frais_acquisition_pct / 100));
  // L'acte en main de la fiche quand on l'a (droits, fees, honoraires réels) ; sinon le forfait des seuils.
  const rendement = Number(b.rendement_aem_fiche) > 0 ? Number(b.rendement_aem_fiche) : Math.round((loyer / aem) * 10000) / 100;
  const rendementFai = Math.round((loyer / prix) * 10000) / 100;
  const bailAns = b.bail_fin ? Math.round(((b.bail_fin - aujourdhui) / (365.25 * 86400000)) * 10) / 10 : null;
  const effort = nombre(b.ca) ? Math.round((loyer / nombre(b.ca)) * 1000) / 10 : null;
  // Le rendement global (net moyen sur la durée, indexation comprise) tranche
  // quand on l'a, contre le seuil de la grille du dossier : c'est celui de la
  // fiche. L'acte en main de la première année reste cité, il ne décide plus.
  const global = Number(b.rendement_global) > 0 ? Math.round(Number(b.rendement_global) * 10) / 10 : null;
  const seuilGlobal = { tourne: Number(b.vise_global) > 0 ? Number(b.vise_global) : seuils.rendement_net_moyen?.tourne ?? 6.5, dead: seuils.rendement_net_moyen?.dead ?? 5 };
  const crans = {
    rendement: global != null ? cran(global, seuilGlobal) : cran(rendement, seuils.rendement_aem),
    bail: cran(bailAns, seuils.bail_restant_ans),
    effort: cran(effort, seuils.taux_effort_pct, false),
  };
  const notes = Object.values(crans).filter(Boolean);
  const verdict = notes.includes('dead') ? 'dead' : notes.includes('limite') ? 'limite' : 'tourne';
  const raisons = [];
  const juge = crans.rendement === 'tourne' ? '' : crans.rendement === 'dead' ? ', trop bas' : ', juste';
  if (global != null) raisons.push(`rendement global ${String(global).replace('.', ',')} % sur la durée pour ${String(seuilGlobal.tourne).replace('.', ',')} % visés${juge} (${String(rendement).replace('.', ',')} % AEM la première année)`);
  else raisons.push(`rendement AEM ${String(rendement).replace('.', ',')} % (${String(rendementFai).replace('.', ',')} % FAI)${juge}`);
  if (bailAns != null) raisons.push(`bail restant ${String(bailAns).replace('.', ',')} an${bailAns > 1 ? 's' : ''}${crans.bail === 'dead' ? ', trop court' : crans.bail === 'limite' ? ', court' : ''}`);
  if (effort != null) raisons.push(`taux d'effort ${String(effort).replace('.', ',')} %${crans.effort === 'dead' ? ', le locataire tient pas' : crans.effort === 'limite' ? ', tendu' : ''}`);
  return { verdict, aem, rendement_global: global, rendement_aem: rendement, rendement_fai: rendementFai, bail_restant_ans: bailAns, taux_effort: effort, crans, raisons, seuils: { rendement_aem: seuils.rendement_aem, bail_restant_ans: seuils.bail_restant_ans, taux_effort_pct: seuils.taux_effort_pct } };
}

/** Le couperet d'un dossier ou d'un projet de la plateforme. */
export function verifierRenta({ deal_id = null, projet_id = null }) {
  if (deal_id) {
    const deal = Records.findBy('Deal', 'deal_id', deal_id);
    if (!deal) return { ok: false, error: 'Dossier introuvable.' };
    const l = deal.lots?.[0]?.lot || {};
    // Le rendement global et son seuil, tels que la fiche du bien les montre.
    const lu = lotPourLecture(deal.lots?.[0]);
    const seuil = (lu?.evaluation?.grille || []).find((c) => c.champ === 'rendement_net_moyen' && /\d/.test(String(c.attendu || '')));
    const vise = seuil ? Number(String(seuil.attendu).replace(',', '.').match(/(\d+(?:\.\d+)?)/)?.[1]) : null;
    const r = couperet({ prix_fai: val(l.prix_fai), loyer: val(l.loyer_annuel_ht_hc), bail_fin: finDeBail(l.bail_echeance), honoraires_inclus: val(l.honoraires_inclus), honoraires: val(l.montant_honoraires), ca: val(l.chiffre_affaires) ?? val(l.ca_ht), rendement_global: lu?.evaluation?.contexte?.rendement_net_moyen, vise_global: vise, rendement_aem_fiche: lu?.evaluation?.aem?.rendement_aem });
    return { ok: true, titre: titreDeal(deal), ...r };
  }
  if (projet_id) {
    const p = Records.get('Project', projet_id);
    if (!p) return { ok: false, error: 'Projet introuvable.' };
    const r = couperet({ prix_fai: p.prix_acquisition, loyer: p.loyer_annuel_ht, bail_fin: finDeBail(p.echeance_bail), rendement_global: Number(p.sim_rendement_locatif_global_net) || null });
    return { ok: true, titre: p.titre, ...r };
  }
  return { ok: false, error: 'Il faut un dossier ou un projet.' };
}

const norme = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Les biens de la plateforme qui répondent à des critères : dossiers de
 * préanalyse et projets, avec ce qu'on sait d'eux. Pure sur ses listes.
 */
export function chercherBiens(criteres = {}, { deals = Records.list('Deal'), projets = Records.list('Project') } = {}, aujourdhui = new Date()) {
  const c = criteres;
  const lignes = [];
  for (const d of deals) {
    if (d.archived || d.test) continue;
    const l = d.lots?.[0]?.lot || {};
    const adresse = val(l.adresse) || {};
    lignes.push({ genre: 'dossier', id: d.deal_id, titre: titreDeal(d), ville: adresse.ville || d.lots?.[0]?.enrichissement?.commune?.nom || '', prix: nombre(l.prix_fai), loyer: nombre(l.loyer_annuel_ht_hc), surface: nombre(l.surface_m2), activite: val(l.locataire_activite) || '', bail_fin: finDeBail(l.bail_echeance) });
  }
  for (const p of projets) {
    if (p.archived) continue;
    lignes.push({ genre: 'projet', id: p.id, titre: p.titre, ville: p.ville_secteur_champ1 || '', prix: nombre(p.prix_acquisition), loyer: nombre(p.loyer_annuel_ht), surface: nombre(p.surface_m2), activite: p.activite_locataire || '', bail_fin: finDeBail(p.echeance_bail) });
  }
  const ans = (x) => (x.bail_fin ? (x.bail_fin - aujourdhui) / (365.25 * 86400000) : null);
  return lignes
    .map((x) => ({ ...x, rendement: x.prix && x.loyer ? Math.round((x.loyer / x.prix) * 10000) / 100 : null, bail_restant_ans: ans(x) != null ? Math.round(ans(x) * 10) / 10 : null }))
    .filter((x) => !c.ville || norme(x.ville).includes(norme(c.ville)) || norme(x.titre).includes(norme(c.ville)))
    .filter((x) => !c.prix_max || (x.prix != null && x.prix <= c.prix_max))
    .filter((x) => !c.prix_min || (x.prix != null && x.prix >= c.prix_min))
    .filter((x) => !c.rendement_min || (x.rendement != null && x.rendement >= c.rendement_min))
    .filter((x) => !c.bail_min_ans || (x.bail_restant_ans != null && x.bail_restant_ans >= c.bail_min_ans))
    .filter((x) => !c.surface_min || (x.surface != null && x.surface >= c.surface_min))
    .filter((x) => !c.activite || norme(x.activite).includes(norme(c.activite)))
    .map(({ bail_fin, ...x }) => ({ ...x, bail_fin: bail_fin ? bail_fin.toISOString().slice(0, 10) : null }))
    .slice(0, 12);
}

/** Le texte d'une pièce jointe, pour la résumer sans rien créer. */
export async function lirePiece(chemin) {
  const buffer = fs.readFileSync(chemin);
  if (/\.pdf$/i.test(chemin)) {
    const { coucheTexteDuPdf } = await import('../deal/ingest.js');
    const lu = await coucheTexteDuPdf(buffer);
    if (!lu?.texte) return { ok: false, error: 'PDF sans texte lisible (un scan ?).' };
    return { ok: true, pages: lu.pages, texte: lu.texte.slice(0, 12000), tronque: lu.texte.length > 12000 };
  }
  if (/\.(txt|md|csv|eml)$/i.test(chemin)) return { ok: true, texte: buffer.toString('utf8').slice(0, 12000) };
  return { ok: false, error: 'Je ne sais lire que les PDF et les fichiers texte.' };
}

/** Les cibles ALX qui ressemblent à ce qu'on cherche : enseigne, adresse, ville. */
export function chercherCibles(recherche) {
  const mots = norme(recherche).split(/\s+/).filter((m) => m.length > 1);
  if (!mots.length) return [];
  const villes = new Map(Records.list('Ville').map((v) => [v.id, v.nom]));
  return Records.list('Cible')
    .map((c) => ({ id: c.id, enseigne: c.enseigne || null, adresse: c.adresse, ville: villes.get(c.ville_id) || '', pile: c.pile, classe: c.classe ?? null, proprietaire: c.proprietaire?.choix?.nom || c.foncier?.choix?.nom || null }))
    .filter((c) => { const t = norme(`${c.enseigne} ${c.adresse} ${c.ville}`); return mots.every((m) => t.includes(m)); })
    .slice(0, 8);
}

/** Lance la prospection ALX d'une ville, en tâche de fond. */
export async function lancerAlx({ ville, code_postal = null, classes = null, user = null }) {
  const { creerVille, listerVillesLeger } = await import('../alx/index.js');
  const { lancer } = await import('../alx/parcours.js');
  const existante = listerVillesLeger().find((v) => norme(v.nom) === norme(ville));
  let id = existante?.id;
  if (!id) {
    const r = creerVille({ nom: ville, code_postal, user });
    if (!r.ok) return r;
    id = r.ville.id;
  }
  const r = lancer(id, { user, tout: true, classes: Array.isArray(classes) && classes.length ? classes : null });
  if (!r.ok) return r;
  return { ok: true, ville_id: id, nom: r.ville.nom };
}


// --- Les mails, le Drive, l'agenda : par le compte de l'équipe (AK_COMPTE) ---

const COMPTE = (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();

/**
 * Les mails reçus non traités, les plus récents d'abord. Avant de lister, la
 * boîte est relevée : « je viens de te l'envoyer » ne doit pas attendre le
 * passage suivant de la veille. Sans compte lisible, on liste ce qu'on a.
 */
export async function boiteRecue(mails = null, { limite = 10, non_rattaches = true, relever = mails == null } = {}) {
  if (relever) {
    try { const { releverBoite } = await import('../gmail-inbox.js'); await releverBoite(COMPTE, { repecher: true }); } catch { /* la boîte n'est pas lisible d'ici : on liste ce qu'on a */ }
  }
  return trierBoite(mails || Records.list('MailRecu'), { limite, non_rattaches });
}

/** Pure : le tri de la boîte, testé sans réseau. */
export function trierBoite(mails, { limite = 10, non_rattaches = true } = {}) {
  return mails
    .filter((m) => !non_rattaches || !m.deal_id)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, limite)
    .map((m) => ({ id: m.id, de: m.de || m.de_email, objet: m.objet, date: m.date, extrait: String(m.extrait || '').slice(0, 160), pieces_jointes: (m.pieces_jointes || []).map((p) => (typeof p === 'string' ? p : p?.nom)).filter(Boolean), interne: !!m.interne, deal_id: m.deal_id || null }));
}

export function lireMail(id) {
  const m = Records.get('MailRecu', id) || Records.list('MailRecu').find((x) => x.gmail_message_id === id);
  if (!m) return { ok: false, error: 'Mail introuvable.' };
  return { ok: true, id: m.id, de: m.de || m.de_email, objet: m.objet, date: m.date, texte: String(m.texte || m.extrait || '').slice(0, 8000), pieces_jointes: m.pieces_jointes || [], deal_id: m.deal_id || null };
}

/** Les mails d'un dossier : reçus et envoyés, dans l'ordre. */
export function mailsDuDossier(dealId, { limite = 8 } = {}) {
  const recus = Records.filter('MailRecu', { deal_id: dealId }).map((m) => ({ sens: 'reçu', de: m.de || m.de_email, objet: m.objet, date: m.date, texte: String(m.texte || m.extrait || '').slice(0, 1500) }));
  const envoyes = Records.filter('EmailLog', { deal_id: dealId }).map((m) => ({ sens: 'envoyé', a: m.to || m.a || null, objet: m.subject || m.objet, date: m.sent_at || m.le || m.created_date, texte: String(m.text || m.corps || '').slice(0, 800) }));
  return [...recus, ...envoyes].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, limite);
}

export async function preanalyserMailRecu(id, user) {
  const m = Records.get('MailRecu', id);
  if (!m) return { ok: false, error: 'Mail introuvable.' };
  if (m.deal_id) return { ok: false, error: 'Ce mail a déjà été préanalysé.', deal_id: m.deal_id };
  const { preanalyserMail } = await import('../deal/preanalyser-mail.js');
  const { CHEMIN_UPLOADS } = await import('../db.js');
  // Une fiche transférée par l'équipe n'a pas d'agent dedans : l'expéditeur n'en devient pas un.
  const d = await preanalyserMail(m, { user, uploadDir: CHEMIN_UPLOADS, contactEmail: m.interne || estInterne(m.de_email) ? null : undefined });
  const lot = d.lots?.[0];
  return { ok: true, cree: true, deal_id: d.deal_id, titre: lot?.synthese?.titre || m.objet, verdict: lot?.synthese?.verdict || null };
}

/** Cherche un fichier sur le Drive partagé, dans le dossier d'un deal si on en a un. */
export async function chercherSurLeDrive({ recherche = '', deal_id = null }) {
  const { listerFichiers } = await import('../google-drive.js');
  const deal = deal_id ? Records.findBy('Deal', 'deal_id', deal_id) : null;
  const fichiers = await listerFichiers(COMPTE, { dossierId: deal?.drive_folder_id || null, recherche, limite: 12 });
  return { fichiers, dossier_url: deal?.drive_folder_url || null };
}

/** Range une pièce jointe du chat dans le dossier Drive d'un deal (créé au besoin). */
export async function rangerSurLeDrive({ deal_id, chemin, nom = null }) {
  const deal = Records.findBy('Deal', 'deal_id', deal_id);
  if (!deal) return { ok: false, error: 'Dossier introuvable.' };
  const { classerDansDrive } = await import('../google-drive.js');
  const { nomDossierDrive } = await import('../deal/nom-drive.js');
  const nomFichier = (nom || path.basename(chemin)).replace(/^ak-\d+-/, '');
  const r = await classerDansDrive(COMPTE, nomDossierDrive(deal), [{ nom: nomFichier, buffer: fs.readFileSync(chemin), mime: /\.pdf$/i.test(nomFichier) ? 'application/pdf' : undefined }]);
  if (!deal.drive_folder_id) Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
  return { ok: true, envoyes: r.envoyes, erreurs: r.erreurs, dossier_url: r.folder_url, chemin: r.chemin };
}

/** Un rendez-vous dans l'agenda d'équipe. */
export async function bloquerRendezVous({ titre, debut, fin = null, lieu = null, description = null }) {
  const { poserRendezVous } = await import('../google-calendar.js');
  return { ok: true, ...(await poserRendezVous(COMPTE, { titre, debut, fin, lieu, description })) };
}

/** Les rendez-vous d'un jour (AAAA-MM-JJ), pour le mot du matin ou une question. */
export async function agendaDuJour(jour) {
  const { evenementsDuJour } = await import('../google-calendar.js');
  return evenementsDuJour(COMPTE, jour);
}


// --- Le nom des dossiers ----------------------------------------------------

/**
 * Le nom d'un dossier, comme l'équipe le dit : « Devred - Firminy », l'enseigne
 * (ou l'activité, ou le nom donné) puis la ville. Pure.
 */
export function titreCourt({ nom = null, enseigne = null, activite = null, ville = null } = {}) {
  return titreDossier({ enseigne: enseigne || nom, activite, ville });
}

/** Un dossier tout juste né de la pré-analyse reçoit son nom court. */
export function nommer(dealId) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  const l = deal?.lots?.[0]?.lot || {};
  const a = val(l.adresse) || {};
  const ville = (typeof a === 'object' && a.ville) || deal?.lots?.[0]?.enrichissement?.commune?.nom || null;
  const nom = titreCourt({ enseigne: val(l.locataire_nom), activite: val(l.locataire_activite), ville });
  if (deal && nom) Records.update('Deal', deal.id, { nom });
  return nom;
}

/** L'adresse d'un dossier en une ligne, pour K-Data. Pure. */
export function adresseDuDeal(deal) {
  const a = val(deal?.lots?.[0]?.lot?.adresse) || {};
  if (typeof a === 'string') return a.trim() || null;
  const ligne = [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ').trim();
  return ligne || null;
}

/**
 * Un mail vient-il de l'équipe ? Alors son expéditeur n'est pas l'agent du
 * bien. Pure sur ses listes : les domaines des comptes de l'équipe, et
 * MAIL_DOMAINES_INTERNES.
 */
export function estInterne(email, { domaines = domainesInternes() } = {}) {
  const d = String(email || '').toLowerCase().split('@')[1];
  return !!d && domaines.includes(d);
}
function domainesInternes() {
  const env = String(process.env.MAIL_DOMAINES_INTERNES || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  const equipe = Records.filter('User', { role: 'admin' }).map((u) => String(u.email || '').toLowerCase().split('@')[1]).filter((x) => x && !/gmail|outlook|hotmail|yahoo|klocka\.local/.test(x));
  return [...new Set([...env, ...equipe])];
}

// --- « Prends ce mail, fais tout » --------------------------------------------

/** Les outils K-Data du « fais tout » : ce qu'une due diligence commence par regarder. */
export const OUTILS_TOUT = ['kzoning', 'kexpertise', 'kestimation'];

/**
 * Pure : dans quel ordre traiter plusieurs mails. Celui qui porte la fiche
 * (un PDF) ouvre le dossier ; les autres y déposent leurs pièces. À pièces
 * égales, le plus ancien d'abord : c'est lui qui a lancé l'affaire.
 */
export function ordonnerMails(mails) {
  const pdfs = (m) => (m.pieces_jointes || []).filter((p) => /\.pdf$/i.test(p?.nom || '') || /pdf/i.test(p?.mime || '')).length;
  return [...(mails || [])].sort((a, b) => (pdfs(b) > 0) - (pdfs(a) > 0) || String(a.date || '').localeCompare(String(b.date || '')));
}

/**
 * D'un ou plusieurs mails reçus, ou de pièces jointes du chat : le dossier de
 * préanalyse, son dossier Drive avec les pièces d'origine, et K-Data lancé
 * dessus et rangé dedans. Avec plusieurs mails, le premier fait le dossier,
 * les autres y déposent leurs pièces. Chaque étape qui rate est dite, elle
 * n'arrête pas les suivantes.
 */
export async function faireTout({ mail_id = null, mail_ids = [], chemins = [], outils = null, user = null, fond = () => {} }) {
  const { CHEMIN_UPLOADS } = await import('../db.js');
  const etapes = [];
  const fichiers = [];
  let dealId = null;
  let agent = null;

  const ids = [...new Set([mail_id, ...(mail_ids || [])].filter(Boolean))];
  const mails = ids.map((id) => Records.get('MailRecu', id));
  if (ids.length && mails.some((m) => !m)) return { ok: false, error: 'Un des mails est introuvable.' };

  // 1. Le dossier.
  if (mails.length) {
    const [premier, ...autres] = ordonnerMails(mails);
    const interne = estInterne(premier.de_email);
    agent = interne ? null : premier.de_email || null;
    if (premier.deal_id && Records.findBy('Deal', 'deal_id', premier.deal_id)) {
      dealId = premier.deal_id;
      etapes.push('dossier déjà créé depuis ce mail, repris');
    } else {
      const { preanalyserMail } = await import('../deal/preanalyser-mail.js');
      const d = await preanalyserMail(premier, { user, uploadDir: CHEMIN_UPLOADS, contactEmail: agent });
      dealId = d.deal_id;
      etapes.push(`dossier créé depuis le mail de ${premier.de || premier.de_email}${interne ? ' (interne : pas d\'agent rattaché)' : ''}`);
    }
    // Les pièces de tous les mails, pour le Drive ; celles des autres mails
    // sont aussi déposées sur le dossier (bail, PV, diagnostics…).
    const { telechargerPieceJointe } = await import('../gmail-inbox.js');
    const { deposerDocument } = await import('../deal/deposer-document.js');
    for (const m of [premier, ...autres]) {
      let deposees = 0;
      for (const p of m.pieces_jointes || []) {
        if (!p?.piece_id) continue;
        let buffer;
        try { buffer = await telechargerPieceJointe(m.compte, m.gmail_message_id, p.piece_id); }
        catch (e) { etapes.push(`pièce ${p.nom} non lue : ${e?.message || e}`); continue; }
        fichiers.push({ nom: p.nom, buffer, mime: p.mime || undefined });
        if (m === premier) continue;
        try { await deposerDocument(dealId, { buffer, filename: p.nom, mimetype: p.mime || undefined }, { user }); deposees += 1; }
        catch (e) { etapes.push(`${p.nom} non déposé : ${e?.message || e}`); }
      }
      if (m !== premier) {
        if (!m.deal_id) Records.update('MailRecu', m.id, { deal_id: dealId });
        etapes.push(`mail de ${m.de || m.de_email} : ${deposees} pièce${deposees > 1 ? 's' : ''} déposée${deposees > 1 ? 's' : ''} sur le dossier`);
      }
    }
  } else {
    const pdfs = chemins.filter((c) => /\.pdf$/i.test(c));
    const fiche = pdfs[0] || chemins[0];
    const { analyserFiche } = await import('../deal/index.js');
    const nomDe = (c) => path.basename(c).replace(/^ak-\d+-/, '');
    const d = await analyserFiche({ buffer: fs.readFileSync(fiche), filename: nomDe(fiche), mimetype: /\.pdf$/i.test(fiche) ? 'application/pdf' : undefined, sourceUrl: `/uploads/${path.basename(fiche)}` }, { user });
    dealId = d.deal_id;
    etapes.push('dossier créé depuis la pièce jointe');
    const { deposerDocument } = await import('../deal/deposer-document.js');
    for (const c of chemins) {
      fichiers.push({ nom: nomDe(c), buffer: fs.readFileSync(c), mime: /\.pdf$/i.test(c) ? 'application/pdf' : undefined });
      if (c === fiche) continue;
      try { await deposerDocument(dealId, { buffer: fs.readFileSync(c), filename: nomDe(c), mimetype: /\.pdf$/i.test(c) ? 'application/pdf' : undefined, url: `/uploads/${path.basename(c)}` }, { user }); etapes.push(`${nomDe(c)} déposé sur le dossier`); }
      catch (e) { etapes.push(`${nomDe(c)} non déposé : ${e?.message || e}`); }
    }
  }
  const titre = nommer(dealId);
  const deal = Records.findBy('Deal', 'deal_id', dealId);

  // 2. Le Drive : le dossier du deal, avec les pièces d'origine dedans.
  let drive = null;
  try {
    const { classerDansDrive } = await import('../google-drive.js');
    const { nomDossierDrive } = await import('../deal/nom-drive.js');
    const r = await classerDansDrive(COMPTE, nomDossierDrive(deal), fichiers, CHEMIN_UPLOADS);
    if (!deal.drive_folder_id) Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
    drive = r.folder_url;
    etapes.push(`Drive : ${r.envoyes.length} fichier${r.envoyes.length > 1 ? 's' : ''} rangé${r.envoyes.length > 1 ? 's' : ''}${r.erreurs.length ? `, ${r.erreurs.length} raté(s)` : ''}`);
  } catch (e) {
    etapes.push(`Drive raté : ${e?.message || e}`);
  }

  // 3. K-Data, rangé dans le dossier ; la veille dira quand c'est fini.
  const adresse = adresseDuDeal(deal);
  let kdata = null;
  if (adresse) {
    const { lancerAnalyses, ranger } = await import('../kdata.js');
    const choisis = Array.isArray(outils) && outils.length ? outils : OUTILS_TOUT;
    const r = lancerAnalyses({ adresse, outils: choisis, reglages: {} }, user);
    if (r.ok) {
      ranger(r.ids, dealId);
      kdata = choisis;
      fond({ genre: 'kdata', libelle: `K-Data sur ${titre || adresse} : ${choisis.join(', ')}`, ids: r.ids, deal_id: dealId });
      etapes.push(`K-Data lancé : ${choisis.join(', ')}`);
    } else etapes.push(`K-Data non lancé : ${r.error}`);
  } else etapes.push("K-Data non lancé : le dossier n'a pas d'adresse lisible");

  return { ok: true, cree: true, deal_id: dealId, titre, agent, drive, kdata, etapes };
}

/**
 * Les pièces d'un mail reçu, déposées sur un dossier qui existe déjà (les PV
 * d'AG, les avis d'échéance arrivés après la fiche), et sur son Drive. Le
 * mail est lié au dossier.
 */
export async function deposerMail({ mail_id, deal_id, user = null }) {
  const m = Records.get('MailRecu', mail_id);
  if (!m) return { ok: false, error: 'Mail introuvable.' };
  const deal = Records.findBy('Deal', 'deal_id', deal_id);
  if (!deal) return { ok: false, error: 'Dossier introuvable.' };
  const { telechargerPieceJointe } = await import('../gmail-inbox.js');
  const { deposerDocument } = await import('../deal/deposer-document.js');
  const { CHEMIN_UPLOADS } = await import('../db.js');
  const deposees = []; const ratees = []; const fichiers = [];
  for (const p of m.pieces_jointes || []) {
    if (!p?.piece_id) continue;
    try {
      const buffer = await telechargerPieceJointe(m.compte, m.gmail_message_id, p.piece_id);
      fichiers.push({ nom: p.nom, buffer, mime: p.mime || undefined });
      const r = await deposerDocument(deal_id, { buffer, filename: p.nom, mimetype: p.mime || undefined }, { user });
      if (r.ok) deposees.push(`${p.nom}${r.type ? ` (${r.type})` : ''}`); else ratees.push(`${p.nom} : ${r.error}`);
    } catch (e) { ratees.push(`${p.nom} : ${e?.message || e}`); }
  }
  let drive = null;
  if (fichiers.length) {
    try {
      const { classerDansDrive } = await import('../google-drive.js');
      const { nomDossierDrive } = await import('../deal/nom-drive.js');
      const r = await classerDansDrive(COMPTE, nomDossierDrive(deal), fichiers, CHEMIN_UPLOADS);
      if (!deal.drive_folder_id) Records.update('Deal', deal.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
      drive = r.folder_url;
    } catch (e) { ratees.push(`Drive : ${e?.message || e}`); }
  }
  if (!m.deal_id) Records.update('MailRecu', m.id, { deal_id });
  return { ok: true, deal_id, titre: deal.nom || deal.lots?.[0]?.synthese?.titre || deal_id, deposees, ratees, drive };
}
