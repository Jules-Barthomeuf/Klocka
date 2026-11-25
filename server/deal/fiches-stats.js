// Les fiches commerciales, de l'arrivée à la signature : combien on en reçoit
// par semaine, et ce qu'elles deviennent. Le but de l'équipe est de battre
// son record de fiches par semaine ; cette page le mesure, elle ne sert pas
// à travailler.
//
// Une fiche, c'est un dossier né d'une fiche (mail, dépôt, chat), ou une
// fiche arrivée dans une boîte et pas encore préanalysée. Ses étapes :
//   reçue → Oui (la demande de documents est partie) → présentée (son
//   projet a un client) → aboutie (son projet est signé).
// Chaque fiche compte dans la semaine où elle est arrivée : on suit la
// cohorte, pas le calendrier des étapes. Le compte part de COMPTE_DEPUIS :
// l'équipe l'a remis à zéro le 25 septembre 2026, ce qui précède (essais,
// doublons, projets importés) ne compte plus.
//
// L'agent d'une fiche est celui qui l'a envoyée, jamais quelqu'un de
// l'équipe : une fiche transférée par Jules ou Paul prend l'expéditeur
// d'origine du mail transféré, et une correction à la main l'emporte.
//
// Tout est calculé ici, sur les listes de la base : pur, testé sans réseau.

import { statutDe } from './lifecycle.js';
import { piecesFiche, porteUneFiche, parleDUnBien } from './fiches-auto.js';
import { zipsDuMail } from './zip-fiches.js';
import { normaliserAdresse } from '../haka/doublons.js';
import { estTableur } from './lire-bureautique.js';
import { commercesLoues } from './commerces.js';

// La même adresse reçue deux fois en six mois : une seule fiche.
const DOUBLON_JOURS = 180;
// Un tableur de cinq biens et plus est une liste : comptée à part, hors du record.
export const LISTE_MIN = 5;
// Les réponses à l'Assistant qui disent que ce n'est pas une fiche à compter (haka/competences/fiche-recue.js).
const PAS_COMPTEE = new Set(['pas_une_fiche', 'deja_recue']);
/** Pure : la clé d'adresse d'un lot de dossier, la même que celle de la Mémoire (memoire.js, haka/doublons.js). */
const cleDuLot = (l) => {
  const a = val(l?.lot?.adresse ?? l?.adresse);
  return a && typeof a === 'object' ? normaliserAdresse(a).cle : null;
};

// La boîte commune où l'équipe transfère chaque fiche reçue (règle d'équipe).
const boiteCommune = () => (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();

const OUI = new Set(['documents_demandes', 'documents_recus', 'depouille', 'projet_cree']);
export const ETAPES = ['recue', 'oui', 'presente', 'abouti'];
export const LIBELLES_ETAPES = { recue: 'Reçue', non: 'Non', oui: 'Oui', presente: 'Présentée au client', abouti: 'Aboutie' };
export const COMPTE_DEPUIS = process.env.FICHES_DEPUIS || '2026-09-24T22:00:00.000Z';

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);

/** Pure : le lundi (UTC) de la semaine d'une date, en AAAA-MM-JJ. */
export function semaineDe(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const lundi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
  return lundi.toISOString().slice(0, 10);
}

/** Pure : la dernière étape atteinte par un dossier. */
export function etapeDuDossier(deal, projetsParDeal = new Map()) {
  const statut = statutDe(deal);
  const projet = projetsParDeal.get(deal.deal_id) || null;
  if (projet?.statut === 'signe') return 'abouti';
  if (projet && (projet.client_email || (projet.client_emails || []).length)) return 'presente';
  // Un projet créé sans client n'est qu'un Oui qui avance : il n'a pas d'étape à lui.
  if (projet || deal.projet_id || statut === 'projet_cree') return 'oui';
  const demandeEnvoyee = (deal.suivi || []).some((s) => s.intention === 'demande_documents');
  if (OUI.has(statut) || demandeEnvoyee) return 'oui';
  if (statut === 'abandonne') return 'non';
  return 'recue';
}

const rang = (etape) => (etape === 'non' ? 0 : Math.max(0, ETAPES.indexOf(etape)));

const ADRESSE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Pure : la personne de l'équipe qui a fait suivre la fiche (15 nov. 2026, Jules : « dès qu'ils reçoivent une fiche,
 * ils la transfèrent à sourcing@ »). L'expéditeur du mail quand il est de l'équipe, sinon personne.
 */
export function transfereePar(mail, estInterne = () => false) {
  const e = String(mail?.de_email || '').toLowerCase();
  return e && (mail.interne || estInterne(e)) ? e : null;
}

/**
 * Pure : combien de biens une fiche apporte (15 nov. 2026, Jules : « des fois un PDF avec plusieurs fiches dedans ») :
 * la correction à la main d'abord, puis les biens lus dans le dossier, sinon un.
 */
export function biensDe(record) {
  const corrige = Number(record?.fiche_compte?.biens);
  if (Number.isFinite(corrige) && corrige >= 0) return corrige;
  return Math.max(1, biensDesLots(record?.lots));
}

/** Pure : les biens des lots d'un dossier, un portefeuille comptant ses commerces loués (24 nov. 2026, Jules). */
export const biensDesLots = (lots = []) => (lots || []).reduce((n, l) => n + Math.max(1, commercesLoues(l?.lot ?? l).length), 0);

/** Pure : la clé d'adresse de chaque bien des lots, répétée pour chaque commerce d'un portefeuille. */
const clesDesLots = (lots = [], suffixe = '') => (lots || []).flatMap((l) => {
  const k = cleDuLot(l);
  return Array.from({ length: Math.max(1, commercesLoues(l?.lot ?? l).length) }, () => (k && suffixe ? `${k}#${suffixe}` : k));
});

/**
 * Pure : la marque d'une pièce jointe (nom et taille). Un transfert garde la pièce telle quelle : la fiche reçue dans une
 * boîte personnelle puis transférée à sourcing@, ou renvoyée par l'agent, a la même marque et ne compte qu'une fois.
 */
export const marqueDe = (p) => (p?.nom && p?.taille ? `${String(p.nom).trim().toLowerCase()}|${p.taille}` : null);

/**
 * Pure : les fiches d'un mail pas encore lu (22 nov. 2026, Jules : « parfois un pdf avec plusieurs fiches dedans ») : une
 * par pièce qui peut être une fiche et par ZIP (au moins une dedans), un au moins. Ce qu'on ne peut pas savoir sans lire
 * (un PDF qui en porte quatre) se sait à la lecture : le dossier a un lot par fiche, la Mémoire un bien par fiche.
 */
export function fichesAttendues(mail, dejaVues = new Set()) {
  const pieces = [...piecesFiche(mail), ...zipsDuMail(mail).filter((z) => !piecesFiche(mail).includes(z))];
  const nouvelles = pieces.filter((p) => { const k = marqueDe(p); return !k || !dejaVues.has(k); });
  return { n: nouvelles.length, toutes_vues: pieces.length > 0 && nouvelles.length === 0 };
}
const nomSeul = (t) => String(t || '').replace(/<[^>]*>/, '').replace(/["']/g, '').trim() || null;

/**
 * Pure : l'expéditeur d'origine d'un mail transféré (« De : Laurent Sebban
 * <laurent@…> » sous « Message transféré »). Le premier qui n'est pas de
 * l'équipe, ou null.
 */
export function expediteurDOrigine(texte, estInterne = () => false) {
  const lignes = String(texte || '').split(/\r?\n/);
  for (const l of lignes) {
    const m = l.match(/^\s*>?\s*(?:\*\*)?(?:De|From|Exp[ée]diteur)\s*(?:\*\*)?\s*:\s*(.+)$/i);
    if (!m) continue;
    const email = (m[1].match(ADRESSE) || [])[0];
    if (!email || estInterne(email.toLowerCase())) continue;
    return { email: email.toLowerCase(), nom: nomSeul(m[1].replace(ADRESSE, '')) || null };
  }
  return null;
}

/**
 * Pure : l'agent d'une fiche. La correction à la main d'abord, puis
 * l'expéditeur s'il n'est pas de l'équipe, puis l'expéditeur d'origine d'un
 * transfert, puis le contact agent du dossier. Personne de l'équipe, jamais.
 */
export function agentDeLaFiche({ corrige = null, mail = null, contact = null }, estInterne = () => false) {
  if (corrige?.email || corrige?.nom) return { email: corrige.email || null, nom: corrige.nom || corrige.email, corrige: true };
  if (mail?.de_email && !mail.interne && !estInterne(String(mail.de_email).toLowerCase())) return { email: String(mail.de_email).toLowerCase(), nom: nomSeul(mail.de) || mail.de_email };
  const origine = mail ? expediteurDOrigine(mail.texte, estInterne) : null;
  if (origine) return { email: origine.email, nom: origine.nom || origine.email };
  if (contact && !estInterne(String(contact).toLowerCase())) return { email: String(contact).toLowerCase(), nom: contact };
  return null;
}

/**
 * Pure : toutes les fiches depuis la remise à zéro, les plus récentes
 * d'abord. Un dossier sans fiche (une coquille nommée à la main, jamais
 * analysée) n'en est pas une ; un mail déjà devenu dossier ne compte qu'une fois.
 */
export function listerFiches({ deals = [], mails = [], projets = [], biensMemoire = [], manuelles = [] } = {}, { depuis = COMPTE_DEPUIS, estInterne = () => false } = {}) {
  const memoireParId = new Map(biensMemoire.map((b) => [b.id, b]));
  const projetsParDeal = new Map(projets.filter((p) => p.deal_id).map((p) => [p.deal_id, p]));
  const mailsParDeal = new Map(mails.filter((m) => m.deal_id).map((m) => [m.deal_id, m]));
  for (const m of mails) for (const id of m.deal_ids || []) if (!mailsParDeal.has(id)) mailsParDeal.set(id, m);
  const mailsParId = new Map(mails.map((m) => [m.id, m]));
  // Les mails déjà devenus dossier, même sans `deal_id` posé sur le mail (un dossier né d'une de ses pièces) : jamais comptés deux fois.
  const mailsEnDossier = new Set(deals.map((d) => d.source_mail?.mail_recu_id).filter(Boolean));
  // Les pièces déjà comptées : une fiche transférée ou renvoyée ne compte qu'une fois.
  const vues = new Set();
  const voir = (mail, piece = null) => {
    if (!mail) return;
    const pieces = piece ? (mail.pieces_jointes || []).filter((p) => p.nom === piece) : [...piecesFiche(mail), ...zipsDuMail(mail)];
    for (const p of pieces) { const k = marqueDe(p); if (k) vues.add(k); }
  };
  const fiches = [];
  // Les biens déjà comptés, par adresse (22 nov. 2026, Jules : « que ça marche parfaitement ») : la même boutique reçue
  // deux fois (deux agents, un renvoi, la Mémoire puis un dossier) compte une fois, pour le premier envoi qui l'apporte,
  // sur DOUBLON_JOURS. Dans un même envoi, deux lots à la même adresse restent deux fiches.
  const adresses = new Map();
  const nouveauxBiens = (cles, le, total) => {
    // Avant la remise à zéro (essais, doublons, projets importés), rien ne compte : pas même pour prendre une adresse.
    if (depuis && String(le || '') < depuis) return total;
    const t = Date.parse(le || '') || 0;
    let doublons = 0;
    for (const k of new Set(cles.filter(Boolean))) {
      const avant = adresses.get(k);
      if (avant != null && Math.abs(t - avant) <= DOUBLON_JOURS * 86400000) doublons += cles.filter((x) => x === k).length;
    }
    for (const k of cles) if (k && !adresses.has(k)) adresses.set(k, t);
    return Math.max(0, total - doublons);
  };
  // Le contrôle : ce que le document annonce (« 4 actifs ») contre ce que la lecture a trouvé. Un écart est « à vérifier ».
  const controle = (lus, annonce, corrige) => (!corrige && annonce && annonce !== lus ? { a_verifier: `Le document annonce ${annonce} bien${annonce > 1 ? 's' : ''}, la lecture en a trouvé ${lus}.` } : {});
  // Une liste de biens (un tableur de cinq lignes et plus) se compte à part : elle ne fait pas le record.
  const enListe = (tableur, lus, corrige) => !corrige && tableur && lus >= LISTE_MIN;

  const lesDossiers = deals.filter((d) => !d.test && (d.lots?.length || d.source))
    .map((d) => ({ d, mail: d.source_mail?.mail_recu_id ? mailsParId.get(d.source_mail.mail_recu_id) : mailsParDeal.get(d.deal_id) }))
    .sort((a, b) => String(a.mail?.date || a.d.created_date || '').localeCompare(String(b.mail?.date || b.d.created_date || '')));
  for (const { d, mail } of lesDossiers) {
    voir(mail, d.source_mail?.piece || null);
    const ville = val(d.lots?.[0]?.lot?.adresse)?.ville || d.lots?.[0]?.enrichissement?.commune?.nom || null;
    const agent = agentDeLaFiche({ corrige: d.fiche_agent, mail, contact: d.contact_agent_email }, estInterne);
    const le = mail?.date || d.created_date || null;
    const corrige = Number.isFinite(Number(d.fiche_compte?.biens)) && Number(d.fiche_compte?.biens) >= 0;
    const lus = Math.max(1, biensDesLots(d.lots));
    // Un dossier par commerce d'un portefeuille : trois dossiers à la même adresse restent trois fiches.
    const cles = clesDesLots(d.lots, d.portefeuille?.commerce ? String(d.portefeuille.commerce).toLowerCase() : '');
    const uniques = nouveauxBiens(cles, le, lus);
    if (!corrige && uniques === 0 && lus > 0 && cles.some(Boolean)) continue;
    const tableur = d.source?.type === 'tableur' || estTableur(d.source?.nom_fichier || '');
    const liste = enListe(tableur, lus, corrige);
    fiches.push({
      id: d.deal_id,
      le,
      agent: agent?.nom || null,
      agent_email: agent?.email || null,
      agent_corrige: !!agent?.corrige,
      boite: mail?.compte || null,
      transferee_par: transfereePar(mail, estInterne),
      biens: corrige ? biensDe(d) : liste ? 0 : uniques,
      ...(liste ? { liste: lus } : {}),
      ...(uniques < lus && !corrige ? { doublons: lus - uniques } : {}),
      ...controle(lus, d.extraction?.biens_annonces, corrige),
      compte: d.fiche_compte || null,
      // Arrivée par mail : seule une fiche reçue a un expéditeur à rattacher (11 oct. 2026).
      par_mail: !!mail,
      rentree: 'dossier',
      titre: d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || 'Dossier',
      ville,
      verdict: d.lots?.[0]?.evaluation?.verdict || null,
      etape: etapeDuDossier(d, projetsParDeal),
      deal_id: d.deal_id,
      projet_id: projetsParDeal.get(d.deal_id)?.id || d.projet_id || null,
    });
  }
  // Un mail dont le dossier a été supprimé : comme si la fiche n'avait jamais été importée, elle ne compte pas, même « à
  // préanalyser ». Les mails rentrés en Mémoire d'abord, puis les autres, les plus anciens d'abord : la première arrivée
  // d'une pièce compte. « Pas une fiche » et « Déjà reçue », répondus à l'Assistant, ne comptent pas.
  const ordre = mails.filter((m) => !m.deal_id && !m.dossier_supprime_le && !mailsEnDossier.has(m.id))
    .filter((m) => !PAS_COMPTEE.has(m.fiche_refusee?.categorie) || Number.isFinite(Number(m.fiche_compte?.biens)))
    .sort((a, b) => Number(!(a.memoire_ids || []).length) - Number(!(b.memoire_ids || []).length) || String(a.date || '').localeCompare(String(b.date || '')));
  for (const m of ordre) {
    // Ce que le transfert a rentré en Mémoire (20 nov. 2026, Jules : « on en a reçu plus » que les 16 comptées) : un bien
    // par fiche lue, plusieurs pour un PDF qui en porte plusieurs. Une pièce déjà lue (un renvoi) ne compte pas deux fois.
    // Les biens supprimés de la Mémoire ne comptent plus ; un mail dont tous les biens sont supprimés non plus.
    const rentres = [...new Set(m.memoire_ids || [])].filter((id) => !memoireParId.get(id)?.supprime_le);
    if (!rentres.length && (m.memoire_ids || []).length) continue;
    if (!rentres.length && (m.memoire_deja_ids || []).length) continue;
    // Un transfert de l'équipe à sourcing@ avec une pièce est une fiche par la règle d'équipe, même si son nom ne le dit
    // pas ; sauf des pièces pour un dossier ou une question. Rien de rentré : il compte, à vérifier.
    // Un ZIP compte comme une pièce de fiche (9 nov. 2026 : ses fiches font chacune un dossier) ; venu du dehors, quand le
    // mail parle d'un bien.
    const zips = zipsDuMail(m).length > 0;
    const transfert = String(m.compte || '').toLowerCase() === boiteCommune() && !!transfereePar(m, estInterne)
      && (piecesFiche(m).length > 0 || zips) && !['documents', 'question'].includes(m.haka_transfert?.intention);
    if (!rentres.length && !transfert && !porteUneFiche(m) && !(zips && parleDUnBien(m))) continue;
    const agent = agentDeLaFiche({ corrige: m.fiche_agent, mail: m }, estInterne);
    // Un mail interne sans expéditeur d'origine n'est pas une fiche reçue : c'est un échange d'équipe.
    if (m.interne && !agent && !rentres.length && !transfert) continue;
    const corrige = Number(m.fiche_compte?.biens);
    const aCorrige = Number.isFinite(corrige) && corrige >= 0;
    // Lu : une fiche par bien rentré, moins ceux déjà comptés à la même adresse. Pas lu : une par pièce de fiche pas déjà
    // comptée ailleurs. Toutes déjà comptées (la même fiche dans la boîte de l'analyste et dans sourcing@, ou devenue
    // dossier par l'autre mail) : il ne compte pas.
    const attendues = fichesAttendues(m, vues);
    if (!aCorrige && attendues.toutes_vues) continue;
    voir(m);
    const lectures = m.fiches_lues || [];
    let biens;
    let extra = {};
    if (aCorrige) biens = corrige;
    else if (rentres.length) {
      // Un portefeuille rentré en une ligne compte ses commerces loués (24 nov. 2026).
      const cles = rentres.flatMap((id) => { const b = memoireParId.get(id); return Array.from({ length: Math.max(1, commercesLoues(b).length) }, () => b?.cle_adresse || null); });
      const uniques = nouveauxBiens(cles, m.date, cles.length);
      if (uniques === 0) continue;
      const annonce = lectures.length && lectures.every((x) => x.annonce) ? lectures.reduce((n, x) => n + x.annonce, 0) : null;
      const tableur = lectures.filter((x) => x.tableur).reduce((n, x) => n + (x.biens || 0), 0);
      const liste = enListe(tableur > 0, tableur, false);
      biens = liste ? uniques - Math.min(uniques, tableur) : uniques;
      extra = { ...(liste ? { liste: tableur } : {}), ...(uniques < cles.length ? { doublons: cles.length - uniques } : {}), ...controle(cles.length, annonce, false) };
    } else {
      biens = Math.max(1, m.lots?.length || 0, attendues.n);
      extra = { a_verifier: 'Pas encore lue : le nombre de fiches est estimé d\'après les pièces jointes.' };
    }
    fiches.push({ id: `mail:${m.id}`, le: m.date || null, agent: agent?.nom || null, agent_email: agent?.email || null, agent_corrige: !!agent?.corrige, boite: m.compte || null, transferee_par: transfereePar(m, estInterne), biens, ...extra, compte: m.fiche_compte || null, par_mail: true, rentree: rentres.length ? 'memoire' : 'non', titre: m.objet || '(sans objet)', ville: rentres.map((id) => memoireParId.get(id)?.ville).find(Boolean) || null, verdict: null, etape: 'recue', deal_id: null, projet_id: null, a_preanalyser: true });
  }
  // Les fiches envoyées hors d'une boîte mail, au numéro WhatsApp de Klocka (memoire/fiche-directe.js) : un envoi par
  // document, au nom de la personne qui l'a envoyé.
  const directs = new Map();
  for (const b of biensMemoire) if (b.envoi_id && !b.supprime_le) { if (!directs.has(b.envoi_id)) directs.set(b.envoi_id, []); directs.get(b.envoi_id).push(b); }
  for (const [envoi, biens] of [...directs].sort((a, b) => String(a[1][0].recu_le || '').localeCompare(String(b[1][0].recu_le || '')))) {
    const b0 = biens.find((b) => b.fiche_compte) || biens[0];
    const corrige = Number.isFinite(Number(b0.fiche_compte?.biens)) && Number(b0.fiche_compte.biens) >= 0;
    const uniques = nouveauxBiens(biens.map((b) => b.cle_adresse || null), b0.recu_le, biens.length);
    if (!uniques && !corrige) continue;
    const liste = enListe(!!b0.fiche_tableur, biens.length, corrige);
    fiches.push({ id: envoi, le: b0.recu_le || null, agent: b0.agent?.nom || b0.agent_email || null, agent_email: b0.agent_email || null, agent_corrige: false, boite: null, transferee_par: b0.par || null, biens: corrige ? Number(b0.fiche_compte.biens) : liste ? 0 : uniques, ...(liste ? { liste: biens.length } : {}), ...(uniques < biens.length && !corrige ? { doublons: biens.length - uniques } : {}), ...controle(biens.length, b0.fiche_annonce, corrige), compte: b0.fiche_compte || null, par_mail: false, canal: String(envoi).split(':')[0], rentree: 'memoire', titre: b0.objet_mail || b0.fiche?.nom || 'Fiche envoyée', ville: b0.ville || null, verdict: null, etape: 'recue', deal_id: null, projet_id: null });
  }
  // Les fiches reçues hors de toute boîte et de tout envoi lu (23 nov. 2026, Jules : « en live ça met 19 alors que c'est
  // 25 ») : ajoutées à la main dans Statistiques, avec leur nombre et la personne à qui elles reviennent.
  for (const x of manuelles) {
    const n = Number(x.nombre);
    if (!Number.isInteger(n) || n < 1) continue;
    fiches.push({ id: `main:${x.id}`, le: x.le || x.created_date || null, agent: x.agent || null, agent_email: null, agent_corrige: false, boite: null, transferee_par: null, biens: x.fiche_compte?.pas_fiche ? 0 : Number.isFinite(Number(x.fiche_compte?.biens)) ? Number(x.fiche_compte.biens) : n, compte: { ...(x.fiche_compte || {}), ...(x.analyste ? { analyste: x.analyste } : {}) }, par_mail: false, canal: 'main', rentree: 'main', titre: x.titre || 'Ajoutée à la main', ville: x.ville || null, verdict: null, etape: 'recue', deal_id: null, projet_id: null });
  }
  return fiches
    .filter((f) => !depuis || String(f.le || '') >= depuis)
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')));
}

/**
 * Pure : les chiffres par semaine, de la plus ancienne à la plus récente,
 * sur `semaines` semaines finissant par celle de `maintenant`. Chaque fiche
 * compte dans la semaine de son arrivée ; une étape atteinte compte aussi
 * pour les étapes d'avant (une fiche présentée a eu son Oui).
 */
export function statsParSemaine(fiches, { semaines = 12, maintenant = new Date() } = {}) {
  const fin = semaineDe(maintenant);
  const liste = [];
  for (let i = semaines - 1; i >= 0; i--) {
    const d = new Date(`${fin}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    liste.push(d.toISOString().slice(0, 10));
  }
  const vide = () => ({ fiches: 0, oui: 0, presente: 0, abouti: 0 });
  const par = new Map(liste.map((s) => [s, vide()]));
  for (const f of fiches) {
    const s = par.get(semaineDe(f.le));
    if (!s) continue;
    // En fiches, pas en envois : un PDF de quatre fiches en vaut quatre.
    const n = f.compte?.pas_fiche ? 0 : f.biens ?? 1;
    s.fiches += n;
    const r = rang(f.etape);
    if (r >= 1) s.oui += n;
    if (r >= 2) s.presente += n;
    if (r >= 3) s.abouti += n;
  }
  return liste.map((semaine) => ({ semaine, ...par.get(semaine) }));
}

/** Pure : le record de fiches en une semaine, sur toute l'histoire. */
export function recordDeFiches(fiches) {
  const par = new Map();
  for (const f of fiches) {
    const s = semaineDe(f.le);
    if (s) par.set(s, (par.get(s) || 0) + (f.compte?.pas_fiche ? 0 : f.biens ?? 1));
  }
  let record = { semaine: null, fiches: 0 };
  for (const [semaine, n] of par) if (n > record.fiches || (n === record.fiches && semaine > (record.semaine || ''))) record = { semaine, fiches: n };
  return record;
}
