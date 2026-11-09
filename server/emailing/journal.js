// Le socle du module Emailing (8 nov. 2026, Jules) : ce qui grossit vite vit dans de vraies tables indexées, jamais
// dans Records (un Records.list charge tout en mémoire, et Render a 2 Go).
//
//   mail_evenement   tout fait daté sur un contact : inscrit, lead magnet pris, ouvert, répondu, fiche reçue, call pris
//   mail_opposition  les adresses à ne plus écrire, valables sur tous les canaux
//   mail_parcours    où en est un contact dans une automatisation
//   mail_file        chaque mail à partir, sous une clé unique : un redémarrage ne renvoie rien
//
// Les objets peu nombreux (contacts, listes, modèles, automatisations, formulaires) restent dans Records.

import { randomBytes, randomUUID } from 'crypto';
import db, { Records } from '../db.js';
import { E } from './schema.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS mail_evenement (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    email       TEXT NOT NULL,
    contact_id  TEXT,
    source      TEXT,
    charge      TEXT,
    cle         TEXT,
    le          TEXT NOT NULL,
    traite      INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_evt_cle ON mail_evenement(cle) WHERE cle IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_mail_evt_traite ON mail_evenement(traite, id);
  CREATE INDEX IF NOT EXISTS idx_mail_evt_email ON mail_evenement(email, type, le);
  CREATE INDEX IF NOT EXISTS idx_mail_evt_type ON mail_evenement(type, le);

  CREATE TABLE IF NOT EXISTS mail_opposition (
    email   TEXT PRIMARY KEY,
    motif   TEXT NOT NULL,
    portee  TEXT NOT NULL DEFAULT 'marketing',
    source  TEXT,
    par     TEXT,
    le      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mail_parcours (
    id                TEXT PRIMARY KEY,
    automatisation_id TEXT NOT NULL,
    contact_id        TEXT NOT NULL,
    email             TEXT NOT NULL,
    noeud_id          TEXT,
    attente           INTEGER NOT NULL DEFAULT 0,
    statut            TEXT NOT NULL,
    raison            TEXT,
    prochain_le       TEXT,
    entre_le          TEXT NOT NULL,
    sorti_le          TEXT,
    boite             TEXT,
    contexte          TEXT,
    fil               TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_parcours_unique ON mail_parcours(automatisation_id, contact_id) WHERE statut IN ('en_cours', 'attente_envoi');
  CREATE INDEX IF NOT EXISTS idx_mail_parcours_du ON mail_parcours(statut, prochain_le);
  CREATE INDEX IF NOT EXISTS idx_mail_parcours_contact ON mail_parcours(contact_id, statut);
  CREATE INDEX IF NOT EXISTS idx_mail_parcours_auto ON mail_parcours(automatisation_id, statut);

  CREATE TABLE IF NOT EXISTS mail_file (
    id                TEXT PRIMARY KEY,
    cle               TEXT NOT NULL UNIQUE,
    parcours_id       TEXT,
    automatisation_id TEXT,
    noeud_id          TEXT,
    contact_id        TEXT,
    email             TEXT NOT NULL,
    canal             TEXT NOT NULL,
    boite             TEXT,
    objet             TEXT,
    texte             TEXT,
    html              TEXT,
    etat              TEXT NOT NULL,
    prevu_le          TEXT NOT NULL,
    valide_par        TEXT,
    valide_le         TEXT,
    envoye_le         TEXT,
    externe_id        TEXT,
    thread_id         TEXT,
    erreur            TEXT,
    tentatives        INTEGER NOT NULL DEFAULT 0,
    ouvert_le         TEXT,
    clique_le         TEXT,
    repondu_le        TEXT,
    cree_le           TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mail_file_etat ON mail_file(etat, prevu_le);
  CREATE INDEX IF NOT EXISTS idx_mail_file_boite ON mail_file(boite, envoye_le);
  CREATE INDEX IF NOT EXISTS idx_mail_file_email ON mail_file(email, envoye_le);
  CREATE INDEX IF NOT EXISTS idx_mail_file_externe ON mail_file(externe_id);
  CREATE INDEX IF NOT EXISTS idx_mail_file_auto ON mail_file(automatisation_id, etat);
  CREATE INDEX IF NOT EXISTS idx_mail_file_parcours ON mail_file(parcours_id);

  CREATE INDEX IF NOT EXISTS idx_records_emailing_email ON records(json_extract(data, '$.email')) WHERE entity = 'EmailingContact';
`);

export const maintenant = () => new Date().toISOString();
export const norm = (e) => String(e || '').trim().toLowerCase();
export const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm(e));
const lireJson = (t, defaut = null) => { try { return t ? JSON.parse(t) : defaut; } catch { return defaut; } };

// --- Les contacts ------------------------------------------------------------------------

const parEmail = db.prepare(`SELECT id FROM records WHERE entity = 'EmailingContact' AND json_extract(data, '$.email') = ? LIMIT 1`);

export function contactParEmail(email) {
  const ligne = parEmail.get(norm(email));
  return ligne ? Records.get(E.CONTACT, ligne.id) : null;
}

/** Le contact de cette adresse, créé au besoin. Les champs vides d'une fiche existante se complètent, le reste ne bouge pas. */
export function contactPour(email, infos = {}) {
  const e = norm(email);
  if (!emailValide(e)) return null;
  const existant = contactParEmail(e);
  const tags = infos.tags || [];
  const listes = infos.listes || [];
  if (existant) {
    const patch = {};
    for (const k of ['prenom', 'nom', 'entreprise', 'ville']) if (infos[k] && !existant[k]) patch[k] = infos[k];
    for (const k of ['base_legale', 'consentement']) if (infos[k]) patch[k] = infos[k];
    if (infos.suivi_par && !existant.suivi_par) patch.suivi_par = norm(infos.suivi_par);
    if (tags.some((t) => !(existant.tags || []).includes(t))) patch.tags = [...new Set([...(existant.tags || []), ...tags])];
    if (listes.some((l) => !(existant.listes || []).includes(l))) patch.listes = [...new Set([...(existant.listes || []), ...listes])];
    return Object.keys(patch).length ? Records.update(E.CONTACT, existant.id, patch) : existant;
  }
  const oppose = opposition(e);
  return Records.create(E.CONTACT, {
    email: e, prenom: infos.prenom || '', nom: infos.nom || '', entreprise: infos.entreprise || '', ville: infos.ville || '',
    type: infos.type || 'lead', champs: infos.champs || {}, tags, listes, source: infos.source || 'module',
    statut: oppose ? 'desinscrit' : 'abonne', jeton: randomBytes(16).toString('hex'), ajoute_le: maintenant(),
    base_legale: infos.base_legale || null, consentement: infos.consentement || null, suivi_par: infos.suivi_par ? norm(infos.suivi_par) : null,
  });
}

// --- Les événements ----------------------------------------------------------------------

const insererEvt = db.prepare(`INSERT OR IGNORE INTO mail_evenement (type, email, contact_id, source, charge, cle, le) VALUES (@type, @email, @contact_id, @source, @charge, @cle, @le)`);

/** Écrit un fait. Ne lève jamais : un fait perdu ne doit pas casser l'appel, le webhook ou le formulaire qui l'émet. */
export function emettre(type, { email, contact_id = null, source = null, charge = null, le = null, cle = null } = {}) {
  try {
    const e = norm(email);
    if (!e) return null;
    const id = contact_id || contactParEmail(e)?.id || null;
    const r = insererEvt.run({ type, email: e, contact_id: id, source, charge: charge ? JSON.stringify(charge) : null, cle, le: le || maintenant() });
    return r.changes ? Number(r.lastInsertRowid) : null;
  } catch (x) {
    console.warn('[emailing] événement perdu :', x?.message || x);
    return null;
  }
}

const versEvt = (l) => ({ ...l, charge: lireJson(l.charge, {}) });
export const aTraiter = (limite = 500) => db.prepare('SELECT * FROM mail_evenement WHERE traite = 0 ORDER BY id LIMIT ?').all(limite).map(versEvt);
export const marquerTraite = (id) => db.prepare('UPDATE mail_evenement SET traite = 1 WHERE id = ?').run(id);
export const evenementsDe = (email, limite = 500) => db.prepare('SELECT * FROM mail_evenement WHERE email = ? ORDER BY id DESC LIMIT ?').all(norm(email), limite).map(versEvt);
export const aRecuQuelqueChose = (email) => !!(db.prepare(`SELECT 1 FROM mail_file WHERE email = ? AND etat IN ('envoye', 'redirige', 'simule') LIMIT 1`).get(norm(email))
  || db.prepare(`SELECT 1 FROM mail_evenement WHERE email = ? AND type = 'delivre' LIMIT 1`).get(norm(email)));
export function evenementDepuis(email, type, depuis) {
  return !!db.prepare('SELECT 1 FROM mail_evenement WHERE email = ? AND type = ? AND le >= ? LIMIT 1').get(norm(email), type, depuis);
}

// --- Les oppositions ---------------------------------------------------------------------

export const opposition = (email) => db.prepare('SELECT * FROM mail_opposition WHERE email = ?').get(norm(email)) || null;

/** Peut-on écrire à cette adresse ? `nature` : « diffusion », « prospection » ou « individuel » (un humain écrit une personne). */
export function peutEcrire(email, { nature = 'diffusion' } = {}) {
  const o = opposition(email);
  if (!o) return { ok: true };
  if (nature === 'individuel' && o.portee !== 'tout') return { ok: true };
  return { ok: false, motif: o.motif, le: o.le, error: `${norm(email)} ne veut plus recevoir nos mails (${MOTIFS[o.motif] || o.motif}).` };
}
export const MOTIFS = { desinscription: 'désinscription', rebond: 'adresse invalide', plainte: 'plainte', ne_plus_ecrire: 'demande de ne plus écrire', equipe: 'retiré par l\'équipe' };

/** Arrête tout ce qui était en route pour cette adresse : parcours en cours et mails pas encore partis. */
export function arreterPour(email, raison, quand = maintenant()) {
  const e = norm(email);
  db.prepare(`UPDATE mail_parcours SET statut = 'sortie', raison = ?, sorti_le = ? WHERE email = ? AND statut IN ('en_cours', 'attente_envoi')`).run(raison, quand, e);
  db.prepare(`UPDATE mail_file SET etat = 'annule', erreur = ? WHERE email = ? AND etat IN ('a_valider', 'a_partir')`).run(raison, e);
}

/**
 * Pose une opposition. Une plainte, un rebond ou une demande de ne plus écrire valent pour tout ; une désinscription
 * vaut pour ce qui part en nombre et en séquence, un échange individuel reste possible.
 */
export function poserOpposition(email, { motif = 'desinscription', source = null, par = null, quand = maintenant() } = {}) {
  const e = norm(email);
  if (!emailValide(e)) return { ok: false, error: 'Adresse invalide.' };
  const portee = motif === 'desinscription' ? 'marketing' : 'tout';
  db.prepare(`INSERT INTO mail_opposition (email, motif, portee, source, par, le) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET motif = excluded.motif, portee = excluded.portee, source = excluded.source, par = excluded.par, le = excluded.le
    WHERE mail_opposition.portee != 'tout' OR excluded.portee = 'tout'`).run(e, motif, portee, source, par, quand);
  arreterPour(e, motif, quand);
  const c = contactParEmail(e);
  if (c && c.statut === 'abonne') Records.update(E.CONTACT, c.id, { statut: motif === 'rebond' ? 'bounce' : motif === 'plainte' ? 'plainte' : 'desinscrit', statut_le: quand });
  return { ok: true, email: e };
}

/** Lève une opposition. Un contact redevient joignable, ce qui reste tracé dans son journal. */
export function leverOpposition(email, par = null) {
  const e = norm(email);
  const o = opposition(e);
  if (!o) return { ok: false, error: 'Aucune opposition sur cette adresse.' };
  db.prepare('DELETE FROM mail_opposition WHERE email = ?').run(e);
  const c = contactParEmail(e);
  if (c && c.statut !== 'abonne') Records.update(E.CONTACT, c.id, { statut: 'abonne', statut_le: maintenant() });
  emettre('opposition_levee', { email: e, source: par, charge: { motif: o.motif, par } });
  return { ok: true };
}

export function oppositions({ q = '', limite = 200 } = {}) {
  const motif = `%${norm(q)}%`;
  return db.prepare('SELECT * FROM mail_opposition WHERE email LIKE ? ORDER BY le DESC LIMIT ?').all(motif, limite);
}

/** Reprend une fois les contacts déjà désinscrits, en rebond ou en plainte. Rejouable. */
export function reprendreOppositions() {
  let n = 0;
  for (const c of Records.list(E.CONTACT)) {
    if (c.statut === 'abonne' || opposition(c.email)) continue;
    poserOpposition(c.email, { motif: c.statut === 'bounce' ? 'rebond' : c.statut === 'plainte' ? 'plainte' : 'desinscription', source: 'reprise', quand: c.statut_le || maintenant() });
    n += 1;
  }
  return n;
}

// --- Les parcours et la file -------------------------------------------------------------

export const versParcours = (l) => (l ? { ...l, contexte: lireJson(l.contexte, {}), fil: lireJson(l.fil, null) } : null);

export function creerParcours({ automatisation_id, contact_id, email, noeud_id, prochain_le, boite = null, contexte = {} }) {
  const id = randomUUID();
  const r = db.prepare(`INSERT OR IGNORE INTO mail_parcours (id, automatisation_id, contact_id, email, noeud_id, statut, prochain_le, entre_le, boite, contexte)
    VALUES (?, ?, ?, ?, ?, 'en_cours', ?, ?, ?, ?)`).run(id, automatisation_id, contact_id, norm(email), noeud_id, prochain_le, maintenant(), boite, JSON.stringify(contexte || {}));
  return r.changes ? id : null;
}

export function majParcours(id, patch) {
  const champs = { ...patch };
  if (champs.contexte !== undefined) champs.contexte = JSON.stringify(champs.contexte);
  if (champs.fil !== undefined) champs.fil = JSON.stringify(champs.fil);
  const cles = Object.keys(champs);
  if (!cles.length) return;
  db.prepare(`UPDATE mail_parcours SET ${cles.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...champs, id });
}

export const parcours = (id) => versParcours(db.prepare('SELECT * FROM mail_parcours WHERE id = ?').get(id));
export const parcoursDe = (contactId) => db.prepare('SELECT * FROM mail_parcours WHERE contact_id = ? ORDER BY entre_le DESC').all(contactId).map(versParcours);
export const dejaPasse = (automatisationId, contactId) => !!db.prepare('SELECT 1 FROM mail_parcours WHERE automatisation_id = ? AND contact_id = ? LIMIT 1').get(automatisationId, contactId);
export const parcoursEnCoursDe = (email) => db.prepare(`SELECT * FROM mail_parcours WHERE email = ? AND statut IN ('en_cours', 'attente_envoi')`).all(norm(email)).map(versParcours);

export function parcoursDus(quand, automatisations, limite = 300) {
  if (!automatisations.length) return [];
  return db.prepare(`SELECT * FROM mail_parcours WHERE statut = 'en_cours' AND prochain_le <= ? AND automatisation_id IN (${automatisations.map(() => '?').join(',')}) ORDER BY prochain_le LIMIT ?`)
    .all(quand, ...automatisations, limite).map(versParcours);
}

export function enFile(m) {
  const id = randomUUID();
  const r = db.prepare(`INSERT OR IGNORE INTO mail_file (id, cle, parcours_id, automatisation_id, noeud_id, contact_id, email, canal, boite, objet, texte, html, etat, prevu_le, cree_le)
    VALUES (@id, @cle, @parcours_id, @automatisation_id, @noeud_id, @contact_id, @email, @canal, @boite, @objet, @texte, @html, @etat, @prevu_le, @cree_le)`)
    .run({ id, parcours_id: null, automatisation_id: null, noeud_id: null, contact_id: null, boite: null, html: null, cree_le: maintenant(), ...m, email: norm(m.email) });
  return r.changes ? id : null;
}

export const ligneFile = (id) => db.prepare('SELECT * FROM mail_file WHERE id = ?').get(id) || null;
export const dernierEnvoiA = (email) => db.prepare(`SELECT * FROM mail_file WHERE email = ? AND etat IN ('envoye', 'redirige', 'simule') ORDER BY envoye_le DESC LIMIT 1`).get(norm(email)) || null;
export const fileDe = (email, limite = 100) => db.prepare('SELECT * FROM mail_file WHERE email = ? ORDER BY cree_le DESC LIMIT ?').all(norm(email), limite);

export function majFile(id, patch) {
  const cles = Object.keys(patch);
  if (!cles.length) return;
  db.prepare(`UPDATE mail_file SET ${cles.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...patch, id });
}

export const fileDue = (quand, limite = 300) => db.prepare(`SELECT * FROM mail_file WHERE etat = 'a_partir' AND prevu_le <= ? ORDER BY prevu_le LIMIT ?`).all(quand, limite);
export const aValider = (limite = 500) => db.prepare(`SELECT * FROM mail_file WHERE etat = 'a_valider' ORDER BY prevu_le LIMIT ?`).all(limite);
export const compterAValider = () => db.prepare(`SELECT COUNT(*) n FROM mail_file WHERE etat = 'a_valider'`).get().n;

/** Le nombre de mails partis d'une boîte sur les dernières 24 h glissantes. */
export const envoyesParBoite = (boite, depuis) => db.prepare(`SELECT COUNT(*) n FROM mail_file WHERE boite = ? AND canal = 'gmail' AND etat = 'envoye' AND envoye_le >= ?`).get(norm(boite), depuis).n;

/** Le retour de Resend sur un mail du module : l'événement du contact, et la ligne de la file. */
export function depuisResend(type, { email, resend_id = null, le = maintenant(), lien = null, svix = null }) {
  const noms = { delivre: 'delivre', ouvert: 'ouvert', clique: 'clique', bounce: 'rebond', supprime: 'rebond', plainte: 'plainte' };
  if (!noms[type]) return;
  emettre(noms[type], { email, source: 'resend', charge: { lien, resend_id }, le, cle: svix ? `resend:${svix}` : null });
  if (resend_id) {
    const l = db.prepare('SELECT id, ouvert_le, clique_le FROM mail_file WHERE externe_id = ?').get(resend_id);
    if (l && type === 'ouvert' && !l.ouvert_le) majFile(l.id, { ouvert_le: le });
    if (l && type === 'clique' && !l.clique_le) majFile(l.id, { clique_le: le });
  }
  if (type === 'bounce' || type === 'supprime') poserOpposition(email, { motif: 'rebond', source: 'resend', quand: le });
  if (type === 'plainte') poserOpposition(email, { motif: 'plainte', source: 'resend', quand: le });
}
