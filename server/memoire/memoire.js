// La Mémoire Klocka (30 oct. 2026, Jules : « ça va servir à mettre les fiches des biens qu'on supprime normalement ;
// tous ces biens vont nous servir à avoir de la data »). Un bien en Mémoire, c'est les faits d'une fiche et la fiche
// elle-même : adresse, loyer, prix, surface, locataire, bail, agent, agence, date, d'où elle vient. Jamais la Data
// Room, jamais le Drive, jamais le texte du mail : la Mémoire est une donnée de marché, pas une copie des dossiers.
//
// Entité `BienMemoire`. `statut` : « dossier » tant que le dossier vit (la ligne sert au taux de biens retenus et au
// dédoublonnage du lecteur), « memoire » quand il n'en reste que la fiche. Un dossier de test n'y entre jamais.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Records, CHEMIN_UPLOADS } from '../db.js';
import { comparerBiens, normaliserAdresse } from '../haka/doublons.js';

export const ENTITE = 'BienMemoire';
export const DOSSIER_FICHES = path.join(CHEMIN_UPLOADS, 'memoire');

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? (x.absent ? null : x.valeur) : (x ?? null));
const nombre = (x) => { const n = Number(val(x)); return Number.isFinite(n) && n > 0 ? n : null; };
const texte = (x) => { const t = val(x); return t == null ? null : String(t).trim() || null; };
const email = (x) => (texte(x) || '').toLowerCase() || null;

/**
 * Pure : les faits d'un lot extrait (`extraire`), à plat. `agent` : celui lu dans la fiche ; `meta` : ce que la
 * fiche ne dit pas (date de réception, boîte, mail, dossier, origine).
 */
export function bienDepuisLot(lotBrut, agent = null, meta = {}) {
  const l = lotBrut?.lot || lotBrut || {};
  const a = val(l.adresse);
  const adresse = a && typeof a === 'object'
    ? { rue: texte(a.rue), code_postal: texte(a.code_postal), ville: texte(a.ville) }
    : { rue: texte(a), code_postal: null, ville: null };
  const ag = agent && typeof agent === 'object' ? agent : {};
  const agentEmail = email(ag.email) || email(meta.agent_email);
  return {
    cle_adresse: normaliserAdresse(adresse).cle,
    adresse,
    ville: adresse.ville,
    code_postal: adresse.code_postal,
    loyer_annuel: nombre(l.loyer_annuel_ht_hc),
    prix: nombre(l.prix_fai),
    surface_m2: nombre(l.surface_m2),
    rendement_annonce: nombre(l.rendement_annonce),
    locataire_nom: texte(l.locataire_nom),
    locataire_activite: texte(l.locataire_activite),
    bail_type: texte(l.bail_type),
    bail_echeance: texte(l.bail_echeance),
    type_actif: texte(l.type_actif),
    agent: { nom: texte(ag.nom) || texte(meta.agent_nom), email: agentEmail, telephone: texte(ag.telephone) || texte(meta.agent_telephone), agence: texte(ag.agence) || texte(meta.agence) },
    agent_email: agentEmail,
    recu_le: meta.recu_le || new Date().toISOString(),
    compte: meta.compte || null,
    gmail_message_id: meta.gmail_message_id || null,
    hash_piece: meta.hash_piece || null,
    mail_recu_id: meta.mail_recu_id || null,
    deal_id: meta.deal_id || null,
    fiche: meta.fiche || null,
    origine: meta.origine || 'scraper',
    statut: meta.statut || 'memoire',
  };
}

/** Pure : le bien d'un dossier (lot 0), avec l'agent du dossier plutôt que celui de la fiche quand il est connu. */
export function bienDepuisDeal(deal, { origine = 'dossier' } = {}) {
  const lot = deal?.lots?.[0] || {};
  const ap = deal?.apercu || {};
  const fa = deal?.fiche_agent || {};
  const mailRecu = deal?.source_mail?.mail_recu_id ? Records.get('MailRecu', deal.source_mail.mail_recu_id) : null;
  return bienDepuisLot(lot, null, {
    agent_nom: fa.nom || ap.agent_nom || null,
    agent_email: fa.email || deal?.contact_agent_email || null,
    agent_telephone: fa.telephone || ap.agent_telephone || null,
    agence: fa.agence || ap.agence || null,
    recu_le: deal?.source_mail?.date || deal?.cree_le || deal?.created_date || new Date().toISOString(),
    compte: mailRecu?.compte || null,
    gmail_message_id: mailRecu?.gmail_message_id || null,
    mail_recu_id: deal?.source_mail?.mail_recu_id || null,
    deal_id: deal?.deal_id || null,
    origine,
    statut: origine === 'dossier' ? 'dossier' : 'memoire',
  });
}

/** Pure : la clé d'adresse d'un bien `{ adresse }`, celle qu'on indexe. */
export const normaliserCle = (bien) => normaliserAdresse(bien?.adresse).cle;

export const hashDe = (buffer) => (buffer ? crypto.createHash('sha1').update(buffer).digest('hex') : null);

/** Copie la fiche d'un dossier sous uploads/memoire, avant que la suppression ne l'efface. */
export function copierFiche(deal) {
  const url = deal?.source?.url;
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const source = path.join(CHEMIN_UPLOADS, url.replace(/^\/uploads\//, ''));
  if (!path.resolve(source).startsWith(path.resolve(CHEMIN_UPLOADS)) || !fs.existsSync(source)) return null;
  fs.mkdirSync(DOSSIER_FICHES, { recursive: true });
  const nom = `${deal.deal_id || Date.now()}-${path.basename(source)}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  fs.copyFileSync(source, path.join(DOSSIER_FICHES, nom));
  return { url: `/uploads/memoire/${nom}`, nom: deal.source?.nom_fichier || path.basename(source), mime: deal.source?.type || null };
}

/** Écrit une fiche reçue du lecteur sous uploads/memoire. */
export function ecrireFiche(buffer, nom, mime = null) {
  if (!buffer) return null;
  fs.mkdirSync(DOSSIER_FICHES, { recursive: true });
  const safe = `${Date.now()}-${String(nom || 'fiche').replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  fs.writeFileSync(path.join(DOSSIER_FICHES, safe), buffer);
  return { url: `/uploads/memoire/${safe}`, nom: nom || safe, mime };
}

/**
 * Un dossier entre en Mémoire. Rejouer ne crée pas de doublon : la ligne du dossier est retrouvée par `deal_id`
 * (puis par le mail d'origine) et mise à jour. Un dossier de test n'y entre jamais.
 * @param {object} deal
 * @param {{ origine: 'suppression'|'abandon'|'dossier', par?: object|null }} o
 */
export function memoriser(deal, { origine = 'dossier', par = null } = {}) {
  if (!deal || deal.test) return { ok: false, raison: 'dossier de test' };
  const bien = bienDepuisDeal(deal, { origine });
  if (!bien.cle_adresse && !bien.prix && !bien.loyer_annuel) return { ok: false, raison: 'rien à retenir' };
  const existant = Records.findBy(ENTITE, 'deal_id', deal.deal_id)
    || (bien.gmail_message_id ? Records.findBy(ENTITE, 'gmail_message_id', bien.gmail_message_id) : null);
  // La fiche se copie une fois : si la ligne l'a déjà, on la garde.
  const fiche = existant?.fiche || copierFiche(deal);
  const patch = { ...bien, fiche, maj_le: new Date().toISOString(), ...(par?.email ? { par: par.email } : {}) };
  if (existant) {
    // Un dossier vivant qui redevient « dossier » ne remonte pas une suppression passée.
    return { ok: true, cree: false, bien: Records.update(ENTITE, existant.id, patch) };
  }
  return { ok: true, cree: true, bien: Records.create(ENTITE, patch, par?.email || null) };
}

/**
 * Pure : les biens de la Mémoire qui portent le même bien (même adresse, ou proche), du plus sûr au moins sûr.
 * @returns {Array<{ bien: object, niveau: 'identique'|'meme_adresse'|'proche' }>}
 */
export function chercherDansMemoire(bien, biens = []) {
  if (!bien?.adresse) return [];
  const rang = { identique: 0, meme_adresse: 1, proche: 2 };
  return biens
    .map((b) => ({ bien: b, niveau: comparerBiens(bien, { adresse: b.adresse, prix: b.prix }) }))
    .filter((x) => x.niveau !== 'different')
    .sort((a, b) => rang[a.niveau] - rang[b.niveau] || String(b.bien.recu_le || '').localeCompare(String(a.bien.recu_le || '')));
}

const moisFr = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : 'une date inconnue');
const kEuros = (n) => (n ? `${Math.round(n / 1000).toLocaleString('fr-FR')} k€` : 'prix inconnu');
const qui = (b) => b?.agent?.agence || b?.agent?.nom || b?.agent_email || 'un agent';

/**
 * Pure : « vu en mars 2026 chez X à 450 k€, aujourd'hui 420 k€ chez Y ». Rien sans correspondance.
 * @param {{ prix?: number|null, agent?: object }} bien le bien qui arrive
 * @param {Array<{ bien: object, niveau: string }>} hits
 */
export function phraseHistorique(bien, hits = []) {
  const surs = hits.filter((h) => h.niveau !== 'proche');
  if (!surs.length) return null;
  const vus = surs.slice(0, 3).map(({ bien: b }) => `vu en ${moisFr(b.recu_le)} chez ${qui(b)} à ${kEuros(b.prix)}`);
  const maintenant = bien?.prix ? `aujourd'hui ${kEuros(bien.prix)}${bien?.agent?.agence || bien?.agent?.nom ? ` chez ${bien.agent.agence || bien.agent.nom}` : ''}` : null;
  const phrase = `Déjà en Mémoire : ${vus.join(', ')}${maintenant ? `, ${maintenant}` : ''}.`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Les biens de la Mémoire, du plus récent au plus ancien, filtrés par un mot (adresse, ville, agent, agence, locataire). */
export function listerMemoire({ q = '', limite = 200, statut = null } = {}) {
  const t = String(q || '').trim().toLowerCase();
  return Records.list(ENTITE, { sort: '-recu_le' })
    .filter((b) => !statut || b.statut === statut)
    .filter((b) => !t || [b.adresse?.rue, b.ville, b.code_postal, b.agent?.nom, b.agent?.agence, b.agent_email, b.locataire_nom, b.locataire_activite].some((x) => String(x || '').toLowerCase().includes(t)))
    .slice(0, limite);
}
