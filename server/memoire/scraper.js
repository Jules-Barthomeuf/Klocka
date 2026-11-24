// Le lecteur des boîtes (30 oct. 2026, Jules : « un scraper qu'on va autoriser, qui va se connecter à notre boîte
// mail, aller voir chaque mail de chaque personne et prendre toutes les fiches de bien »).
//
// Dès qu'une boîte est autorisée (30 oct. 2026, Jules : « pas la nuit, pas de limite de budget, direct quand on dit
// autorisé »), il la lit d'un bout à l'autre, une page de messages à la fois (Gmail filtre déjà sur les pièces
// jointes), garde ce qui porte une fiche (la règle de la veille, sans IA), lit la fiche une fois (un appel au modèle),
// et pose le bien en Mémoire. Il tient son point de reprise par boîte (la page suivante de Gmail) : un redémarrage ou
// une pause reprennent là où il en était, sans relire. Il ne crée aucun dossier, n'envoie rien, n'écrit rien dans la
// boîte de réception de l'application. Seule la pause l'arrête.
//
// Une fiche déjà connue (le mail d'un dossier, un bien déjà en Mémoire, la même pièce reçue deux fois) n'est pas
// relue : identifiant Gmail, hash de la pièce, identifiant du dossier.

import { setTimeout as attendre } from 'timers/promises';
import { Records, Meta } from '../db.js';
import { GMAIL_Q, PAGE, PAUSE_MS } from './drapeaux.js';
import { ENTITE, bienDepuisLot, ecrireFiche, hashDe } from './memoire.js';
import { estTableur } from '../deal/lire-bureautique.js';

const CLE_PAUSE = 'memoire.scraper.pause';
const CLE_NUIT = 'memoire.scraper.nuit';
const cleBoite = (email) => `memoire.scraper.${String(email || '').toLowerCase()}`;

const lireJson = (cle, defaut = null) => { try { const v = Meta.get(cle); return v ? JSON.parse(v) : defaut; } catch { return defaut; } };
const ecrireJson = (cle, v) => Meta.set(cle, JSON.stringify(v));

export const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

/** Ce que la lecture a coûté aujourd'hui (un jour de Paris), pour l'écran : aucune limite. */
export function depenseDuJour(d = new Date()) {
  const n = lireJson(CLE_NUIT, null);
  return n?.jour === jourParis(d) ? Number(n.depense) || 0 : 0;
}
export const ajouterDepense = (eur, d = new Date()) => ecrireJson(CLE_NUIT, { jour: jourParis(d), depense: depenseDuJour(d) + (Number(eur) || 0) });

export const enPause = () => Meta.get(CLE_PAUSE) === '1';
export const mettreEnPause = (oui) => Meta.set(CLE_PAUSE, oui ? '1' : '0');

/** Le point de reprise d'une boîte. */
export const pointDeReprise = (email) => lireJson(cleBoite(email), { pageToken: null, lus: 0, fiches: 0, ignores: 0, erreurs: 0, termine_le: null, derniere_date: null, commence_le: null });
const noterReprise = (email, p) => ecrireJson(cleBoite(email), p);
/** Repartir du début pour une boîte (Jules, depuis l'écran) : on relira la liste, pas les fiches déjà connues. */
export const recommencer = (email) => noterReprise(email, { ...pointDeReprise(email), pageToken: null, termine_le: null, commence_le: null });

const INTERNE = /@klocka\.immo$/i;
const DELAI_VEILLE_MS = 3 * 3600000;
// « Pas une fiche » et « Déjà reçue » répondus à l'Assistant (fiche-recue.js) : rien à lire ; « Hors critères » se lit.
const PAS_LUE = new Set(['pas_une_fiche', 'deja_recue']);
// Les pièces lues au plus dans un même mail : souvent une fiche, parfois quatre ; au-delà, des photos ou des annexes.
const PIECES_MAX = 4;

/**
 * Pure : faut-il lire ce message ? Non s'il est déjà connu (mail d'un dossier, bien en Mémoire), ou s'il ne porte
 * aucune fiche selon la règle de la veille.
 */
export function aLire(mail, { porteUneFiche, dejaEnMemoire = false, dejaUnDossier = false } = {}) {
  if (dejaEnMemoire) return { lire: false, raison: 'déjà en Mémoire' };
  if (dejaUnDossier) return { lire: false, raison: 'déjà un dossier' };
  if (!porteUneFiche(mail)) return { lire: false, raison: 'pas de fiche' };
  return { lire: true };
}

/**
 * Lit un message d'une boîte et, s'il porte une fiche, pose le bien en Mémoire.
 * @returns {Promise<{ fiche: boolean, raison?: string, cout_eur?: number }>}
 */
export async function traiterMessage(compte, gmailMessageId, deps = {}) {
  const G = deps.gmail || await import('../gmail-inbox.js');
  const F = deps.fiches || await import('../deal/fiches-auto.js');
  const E = deps.extraire || (await import('../deal/extraire-faits.js')).extraireFaits;
  if (Records.findBy(ENTITE, 'gmail_message_id', gmailMessageId)) return { fiche: false, raison: 'déjà en Mémoire' };
  const recu = Records.filter('MailRecu', { gmail_message_id: gmailMessageId })[0] || null;
  if (recu?.deal_id || recu?.deal_ids?.length) return { fiche: false, raison: 'déjà un dossier' };

  const mail = await G.lireMessage(compte, gmailMessageId);
  const verdict = aLire(mail, { porteUneFiche: F.porteUneFiche });
  if (!verdict.lire) return { fiche: false, raison: verdict.raison };

  // Chaque fiche du mail, et chaque bien d'une fiche (22 nov. 2026, Jules : « parfois un pdf avec plusieurs fiches dedans
  // et ça en compte qu'une ») : avant, la première pièce et son premier bien seulement. Quatre pièces au plus par mail.
  const pieces = F.piecesFiche(mail).filter((p) => p?.piece_id).slice(0, PIECES_MAX);
  if (!pieces.length) return { fiche: false, raison: 'pièce sans identifiant' };
  // L'expéditeur fait l'agent quand la fiche ne le nomme pas, sauf s'il est de la maison (un transfert).
  const deEmail = mail.de_email && !INTERNE.test(mail.de_email) ? mail.de_email : null;
  const deNom = deEmail ? String(mail.de || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || null : null;
  const crees = [];
  const deja = [];
  const lectures = [];
  let cout = 0;
  let illisible = false;
  for (const piece of pieces) {
    const buffer = await G.telechargerPieceJointe(compte, gmailMessageId, piece.piece_id);
    const hash = hashDe(buffer);
    const lus = Records.filter(ENTITE, { hash_piece: hash });
    if (lus.length) { deja.push(...lus.map((b) => b.id)); continue; }
    const faits = await E({ buffer, filename: piece.nom, mimetype: piece.mime }, { par: compte });
    cout += Number(faits.cout_eur) || 0;
    const agentFiche = faits.agent || {};
    let fiche = null;
    const avant = crees.length;
    for (const lot of (faits.lots || []).length ? faits.lots : [null]) {
      const bien = bienDepuisLot(lot, { ...agentFiche, email: agentFiche.email || deEmail, nom: agentFiche.nom || deNom }, {
        recu_le: mail.date || new Date().toISOString(),
        compte,
        gmail_message_id: gmailMessageId,
        hash_piece: hash,
        mail_recu_id: recu?.id || null,
        origine: deps.origine || 'scraper',
        statut: 'memoire',
      });
      if (!bien.cle_adresse && !bien.prix && !bien.loyer_annuel) { illisible = true; continue; }
      // Le PDF écrit une fois, partagé par les biens qu'il porte.
      fiche = fiche || ecrireFiche(buffer, piece.nom, piece.mime);
      bien.fiche = fiche;
      crees.push(Records.create(ENTITE, { ...bien, objet_mail: String(mail.objet || '').slice(0, 200), maj_le: new Date().toISOString() }).id);
    }
    lectures.push({ nom: piece.nom || null, biens: crees.length - avant, annonce: faits.biens_annonces ?? null, tableur: faits.source === 'tableur' || estTableur(piece.nom, piece.mime), le: new Date().toISOString() });
  }
  // Le mail reçu garde ses biens : le compte des fiches reçues lit un bien par fiche (deal/fiches-stats.js).
  if (recu && (crees.length || deja.length || lectures.length)) {
    const r = Records.get('MailRecu', recu.id) || recu;
    Records.update('MailRecu', recu.id, {
      ...(crees.length ? { memoire_id: r.memoire_id || crees[0], memoire_ids: [...new Set([...(r.memoire_ids || []), ...crees])] } : {}),
      ...(deja.length ? { memoire_deja_ids: [...new Set([...(r.memoire_deja_ids || []), ...deja])] } : {}),
      ...(lectures.length ? { fiches_lues: [...(r.fiches_lues || []).filter((x) => !lectures.some((l) => l.nom === x.nom)), ...lectures] } : {}),
    });
  }
  if (!crees.length) return { fiche: false, raison: deja.length ? 'même pièce déjà lue' : illisible ? 'fiche illisible' : 'rien de lisible', cout_eur: cout };
  return { fiche: true, n: crees.length, cout_eur: cout };
}

/** Une page d'une boîte : la liste, chaque message, puis le point de reprise. S'arrête net en pause. */
export async function unePage(compte, deps = {}) {
  const G = deps.gmail || await import('../gmail-inbox.js');
  const p = pointDeReprise(compte);
  if (p.termine_le) return { ...p, rien: true };
  if (!p.commence_le) p.commence_le = new Date().toISOString();
  const { ids, suivant } = await G.listerMessagesGmail(compte, { q: GMAIL_Q, pageToken: p.pageToken, max: PAGE });
  for (const id of ids) {
    if (enPause()) { noterReprise(compte, p); return { ...p, interrompu: true }; }
    try {
      const r = await traiterMessage(compte, id, deps);
      p.lus += 1;
      if (r.fiche) p.fiches += r.n || 1; else p.ignores += 1;
      if (r.cout_eur) ajouterDepense(r.cout_eur);
    } catch (e) {
      p.erreurs += 1;
      console.warn(`[mémoire] ${compte} message ${id} :`, e?.message || e);
    }
    if (PAUSE_MS) await attendre(PAUSE_MS);
  }
  // La page est faite : le point de reprise avance d'un coup. Sans page suivante, la boîte est lue en entier.
  p.pageToken = suivant;
  if (!suivant) p.termine_le = new Date().toISOString();
  p.derniere_date = new Date().toISOString();
  noterReprise(compte, p);
  return p;
}

/** Les boîtes que Jules a autorisées, lisibles, et pas encore lues en entier. */
export async function boitesAFaire() {
  const { comptesEquipe } = await import('../google-oauth.js');
  return comptesEquipe().filter((a) => a.peut_lire && a.memoire_autorisee_le && !pointDeReprise(a.email).termine_le);
}

/**
 * Le continu : une fiche reçue par la veille et restée sans dossier trois heures entre en Mémoire. Même lecture que la
 * nuit, même garde-fous. Trois heures et non plus deux jours (22 nov. 2026, Jules : « que pour n'importe quel type de
 * documents ça marche parfaitement ») : le compte des fiches reçues ne reste pas deviné deux jours ; une fiche que
 * l'analyste pré-analyse ensuite est lue une seconde fois (0,02 à 0,06 €). « Pas une fiche » et « Déjà reçue » ne sont jamais lus.
 */
export async function traiterMailsRecus({ max = 10, maintenant = Date.now(), deps = {} } = {}) {
  const F = deps.fiches || await import('../deal/fiches-auto.js');
  const vieux = maintenant - DELAI_VEILLE_MS;
  const candidats = Records.list('MailRecu')
    .filter((m) => !m.deal_id && !m.deal_ids?.length && !m.memoire_vue_le && !PAS_LUE.has(m.fiche_refusee?.categorie) && !m.fiche_compte?.pas_fiche && m.gmail_message_id && m.compte && Date.parse(m.date || 0) < vieux && F.piecesFiche(m).length)
    .slice(0, max);
  let fiches = 0;
  for (const m of candidats) {
    if (enPause()) break;
    try {
      const r = await traiterMessage(m.compte, m.gmail_message_id, { ...deps, origine: 'veille' });
      if (r.fiche) fiches += r.n || 1;
      if (r.cout_eur) ajouterDepense(r.cout_eur);
    } catch (e) { console.warn(`[mémoire] veille ${m.id} :`, e?.message || e); }
    Records.update('MailRecu', m.id, { memoire_vue_le: new Date().toISOString() });
  }
  return { candidats: candidats.length, fiches };
}

// Les boîtes en cours de lecture : une seule lecture par boîte à la fois.
const enLecture = new Set();

/**
 * Lit une boîte jusqu'au bout, page après page, sans attendre : lancé à l'autorisation, et repris après un
 * redémarrage. S'arrête en pause, quand la boîte est finie, ou si l'autorisation est retirée.
 */
export async function lireBoite(email, deps = {}) {
  const cle = String(email || '').toLowerCase();
  if (enLecture.has(cle)) return { ignore: 'déjà en cours' };
  enLecture.add(cle);
  const avant = pointDeReprise(cle).fiches || 0;
  let p = pointDeReprise(cle);
  try {
    const { storedAccount } = deps.oauth || await import('../google-oauth.js');
    while (!enPause() && !p.termine_le) {
      const compte = storedAccount(cle);
      if (!compte?.peut_lire || !compte?.memoire_autorisee_le) break;
      p = await unePage(cle, deps);
      if (p.interrompu) break;
    }
  } catch (e) {
    console.warn(`[mémoire] lecture de ${cle} :`, e?.message || e);
  } finally {
    enLecture.delete(cle);
  }
  const fiches = (p.fiches || 0) - avant;
  console.log(`[mémoire] ${cle} : ${p.termine_le ? 'lue en entier' : 'arrêtée'}, ${fiches} fiche(s) de plus, ${p.lus || 0} message(s) lus en tout`);
  return { email: cle, fiches, termine: !!p.termine_le };
}

/** Un tour : chaque boîte autorisée et pas finie se lit (en fond), puis les fiches de la veille, puis Twenty. */
export async function tour() {
  // La pause arrête la lecture des boîtes, pas Propriétés Klocka (24 nov. 2026, Jules : « les deux doivent être en
  // synchronisation »).
  if (enPause()) {
    const klocka = await (await import('./twenty.js')).synchroniserKlocka({ max: 50 }).catch((e) => ({ erreur: e?.message || String(e) }));
    return { ignore: 'en pause', twenty: { klocka } };
  }
  const lancees = [];
  for (const a of await boitesAFaire()) {
    if (enLecture.has(String(a.email).toLowerCase())) continue;
    lancees.push(a.email);
    lireBoite(a.email).catch((e) => console.warn('[mémoire] :', e?.message || e));
  }
  let veille = 0;
  let twenty = null;
  try {
    veille = (await traiterMailsRecus()).fiches;
    const T = await import('./twenty.js');
    twenty = await T.synchroniser({ max: 50 });
    const klocka = await T.synchroniserKlocka({ max: 50 });
    twenty = { ...twenty, klocka };
    // Le Drive Klocka une fois toutes les fiches reçues posées (8 nov. 2026, Jules) ; sur Render seulement : les fiches
    // de la Mémoire sont sur son disque.
    if (process.env.RENDER && klocka.restants === 0) (await import('./drive.js')).lireDrive().catch((e) => console.warn('[mémoire] Drive :', e?.message || e));
  } catch (e) { console.warn('[mémoire] tour :', e?.message || e); }
  return { lancees, veille, twenty };
}

/** L'état pour l'écran : les boîtes, leur avancement, la dépense du jour, la pause. */
export async function etat() {
  const { comptesEquipe } = await import('../google-oauth.js');
  return {
    pause: enPause(),
    depense_jour: depenseDuJour(),
    boites: comptesEquipe().map((a) => ({
      email: a.email, proprietaire: a.owner_email || a.email, peut_lire: !!a.peut_lire,
      autorisee_le: a.memoire_autorisee_le || null, autorisee_par: a.memoire_autorisee_par || null,
      en_cours: enLecture.has(String(a.email).toLowerCase()),
      ...pointDeReprise(a.email),
    })),
  };
}

/**
 * Au démarrage puis toutes les cinq minutes : une boîte autorisée et pas finie reprend sa lecture (après un
 * redémarrage, une pause levée). Rien ne se lit tant qu'aucune boîte n'est autorisée.
 */
export function planifier() {
  const lancer = () => { tour().catch((e) => console.warn('[mémoire] :', e?.message || e)); };
  setTimeout(lancer, 60_000).unref?.();
  const t = setInterval(lancer, 5 * 60_000);
  t.unref?.();
  return t;
}
