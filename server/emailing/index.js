// L'emailing : les contacts, les séquences, les mails de la plateforme (et,
// à venir, les campagnes et les statistiques). Le modèle est décrit dans
// schema.js ; tout envoi passe par le garde-fou d'envoi.js : hors Render,
// aucun email ne part chez un vrai contact.

import { randomBytes } from 'crypto';
import { Records } from '../db.js';
import { rendreEmail, remplir } from '../../src/lib/email-design.js';
import { envoyerResend, resendConfigure } from './resend.js';
import { MAILS_PLATEFORME, sequenceWebinaire } from './modeles.js';
import { E as ENT, cleEnvoi, listeDuNom, audience, envoyable, HEURE_PAR_DEFAUT } from './schema.js';
import { expedier, jourParis, aParis } from './envoi.js';

const CONTACT = ENT.CONTACT;
const SEQUENCE = ENT.SEQUENCE;
const INSCRIPTION = ENT.INSCRIPTION;
const ENVOI = ENT.ENVOI;
const TEMPLATE = ENT.TEMPLATE;
const PAR_TOUR = 60;
const maintenant = () => new Date().toISOString();
const normEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]{2,}$/;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const base = () => (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3001').replace(/\/$/, '');
const logo = () => `${base()}/icones/icone-192.png`;
const ENVOYE = new Set(['envoye', 'redirige', 'simule']);
/** Le statut d'un envoi d'après la réponse du garde-fou. */
const statutEnvoi = (r) => (!r.ok ? 'echec' : r.redirige ? 'redirige' : r.simule ? 'simule' : 'envoye');

// --- Contacts -----------------------------------------------------------------

/**
 * Pure : des lignes collées ou un CSV en contacts. Avec un en-tête (email,
 * prénom, nom), on suit ses colonnes ; sans, l'adresse se trouve dans la
 * ligne et le reste fait le prénom puis le nom.
 */
export function lireContacts(texte) {
  const lignes = String(texte || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lignes.length) return [];
  const sep = (l) => (l.includes('\t') ? '\t' : l.includes(';') ? ';' : ',');
  // Une cellule entre guillemets garde ses séparateurs ; "" vaut un guillemet.
  const cellules = (l) => {
    const d = sep(l);
    const out = [];
    let cour = '';
    let entre = false;
    for (let i = 0; i < l.length; i += 1) {
      const ch = l[i];
      if (entre) {
        if (ch === '"' && l[i + 1] === '"') { cour += '"'; i += 1; } else if (ch === '"') entre = false; else cour += ch;
      } else if (ch === '"') entre = true;
      else if (ch === d) { out.push(cour.trim()); cour = ''; } else cour += ch;
    }
    out.push(cour.trim());
    return out;
  };
  const entete = cellules(lignes[0]).map((c) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  // Le nom exact d'abord : « prénom » contient « nom ».
  const col = (...noms) => {
    const exact = entete.findIndex((c) => noms.includes(c));
    return exact >= 0 ? exact : entete.findIndex((c) => noms.some((n) => c.includes(n)) && !(noms.includes('nom') && c.includes('prenom')));
  };
  const iEmail = col('email', 'e-mail', 'mail', 'adresse');
  const avecEntete = iEmail >= 0 && !EMAIL.test(cellules(lignes[0])[iEmail] || '');
  const iPrenom = avecEntete ? col('prenom', 'first') : -1;
  const iNom = avecEntete ? col('nom', 'last', 'name') : -1;
  const iEntreprise = avecEntete ? col('entreprise', 'societe', 'company', 'organisation') : -1;
  const iVille = avecEntete ? col('ville', 'city', 'commune') : -1;
  const vus = new Set();
  const sortie = [];
  for (const l of avecEntete ? lignes.slice(1) : lignes) {
    const c = cellules(l);
    let email;
    let prenom = '';
    let nom = '';
    let entreprise = '';
    let ville = '';
    if (avecEntete) {
      email = normEmail(c[iEmail]);
      prenom = iPrenom >= 0 ? c[iPrenom] || '' : '';
      nom = iNom >= 0 && iNom !== iPrenom ? c[iNom] || '' : '';
      entreprise = iEntreprise >= 0 && iEntreprise !== iNom ? c[iEntreprise] || '' : '';
      ville = iVille >= 0 ? c[iVille] || '' : '';
    } else {
      const morceaux = l.split(/[\s,;\t<>"]+/).filter(Boolean);
      email = normEmail(morceaux.find((m) => EMAIL.test(m)));
      const reste = morceaux.filter((m) => !EMAIL.test(m));
      prenom = reste[0] || '';
      nom = reste.slice(1).join(' ');
    }
    if (!EMAIL.test(email || '') || vus.has(email)) continue;
    vus.add(email);
    sortie.push({ email, prenom: prenom.trim(), nom: nom.trim(), ...(entreprise.trim() ? { entreprise: entreprise.trim() } : {}), ...(ville.trim() ? { ville: ville.trim() } : {}) });
  }
  return sortie;
}

/**
 * Pure : un classeur Excel (.xlsx) en CSV (séparateur « ; », la première
 * feuille, son en-tête d'abord), prêt pour lireContacts. Un ancien .xls
 * (format binaire d'avant 2007) ne se lit pas : il faut l'enregistrer en .xlsx.
 */
export async function excelEnCsv(buffer, nom = '') {
  if (/\.xls$/i.test(nom)) throw new Error('Ancien format Excel (.xls) : enregistrez le fichier en .xlsx, puis réessayez.');
  const { lireXlsx } = await import('../xlsx.js');
  const lignes = lireXlsx(buffer);
  if (!lignes.length) return { csv: '', lignes: 0 };
  const cellule = (v) => { const t = String(v ?? '').replace(/\r?\n/g, ' ').trim(); return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const entete = Object.keys(lignes[0]);
  const csv = [entete.map(cellule).join(';'), ...lignes.map((l) => entete.map((h) => cellule(l[h])).join(';'))].join('\n');
  return { csv, lignes: lignes.length };
}

/**
 * Ajoute des contacts à une liste. Une adresse déjà connue est mise à jour
 * (elle rejoint la liste, ses champs vides se complètent), jamais dupliquée ;
 * son statut ne change pas : un désinscrit le reste.
 */
export function importerContacts(texte, { liste, source = 'webinaire', par = null } = {}) {
  const nomListe = String(liste || '').trim();
  if (!nomListe) return { ok: false, error: 'Nommez la liste (ex. « Webinaire 12 oct. »).' };
  const lus = lireContacts(texte);
  if (!lus.length) return { ok: false, error: 'Aucune adresse lue : une par ligne, ou un CSV avec une colonne email.' };
  const l = listeDuNom(nomListe, par);
  const tous = new Map(Records.list(CONTACT).map((c) => [c.email, c]));
  let nouveaux = 0;
  let deja = 0;
  for (const c of lus) {
    const ancien = tous.get(c.email);
    if (ancien) {
      deja += 1;
      const complete = Object.fromEntries(['prenom', 'nom', 'entreprise', 'ville'].filter((k) => c[k] && !ancien[k]).map((k) => [k, c[k]]));
      Records.update(CONTACT, ancien.id, { listes: [...new Set([...(ancien.listes || []), l.id])], ...complete, maj_le: maintenant() });
    } else {
      Records.create(CONTACT, { ...c, listes: [l.id], tags: [], champs: {}, source, statut: 'abonne', jeton: randomBytes(16).toString('hex'), ajoute_le: maintenant(), ajoute_par: par });
      nouveaux += 1;
    }
  }
  return { ok: true, lus: lus.length, nouveaux, deja, liste: nomListe, liste_id: l.id };
}

const nomsDesListes = () => new Map(Records.list(ENT.LISTE).map((l) => [l.id, l.nom]));
/** Un contact tel que l'écran le lit : ses listes par leur nom. */
const vueContact = (c, noms = nomsDesListes()) => ({ ...c, liste_ids: c.listes || [], listes: (c.listes || []).map((id) => noms.get(id)).filter(Boolean) });
const idDeListe = (x) => (x ? Records.list(ENT.LISTE).find((l) => l.id === x || l.nom === x)?.id || null : null);

/** Les contacts, ceux d'une liste (par son nom ou son identifiant) si elle est donnée. */
export function contacts({ liste = null } = {}) {
  const id = liste ? idDeListe(liste) : null;
  if (liste && !id) return [];
  const noms = nomsDesListes();
  return Records.list(CONTACT)
    .filter((c) => !id || (c.listes || []).includes(id))
    .sort((a, b) => String(b.ajoute_le).localeCompare(String(a.ajoute_le)))
    .map((c) => vueContact(c, noms));
}

/** Les listes, avec leur nombre de contacts et d'abonnés. */
export function listes() {
  const tous = Records.list(CONTACT);
  return Records.list(ENT.LISTE).map((l) => {
    const dedans = tous.filter((c) => (c.listes || []).includes(l.id));
    return { id: l.id, nom: l.nom, total: dedans.length, abonnes: dedans.filter(envoyable).length };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function supprimerContact(id) {
  const c = Records.get(CONTACT, id);
  if (!c) return { ok: false, error: 'Contact introuvable.' };
  for (const i of Records.list(INSCRIPTION).filter((x) => x.contact_id === id)) Records.delete(INSCRIPTION, i.id);
  Records.delete(CONTACT, id);
  return { ok: true };
}

/** Sort un contact de toutes ses séquences en cours, avec la raison. */
function sortirDesSequences(contactId, raison) {
  for (const i of Records.list(INSCRIPTION).filter((x) => x.contact_id === contactId && x.statut === 'en_cours')) {
    Records.update(INSCRIPTION, i.id, { statut: 'sortie', raison, sortie_le: maintenant() });
  }
}

/** Le lien de désinscription d'un contact : plus aucun email marketing, toutes séquences arrêtées. */
export function desinscrire(jeton, source = null) {
  const c = Records.list(CONTACT).find((x) => x.jeton && x.jeton === jeton);
  if (!c) return { ok: false };
  // La source (« campagne:id », « sequence:id ») compte la désinscription dans ses statistiques.
  if (c.statut === 'abonne') Records.update(CONTACT, c.id, { statut: 'desinscrit', statut_le: maintenant(), desinscription_source: /^(campagne|sequence):[\w-]+$/.test(source || '') ? source : null });
  sortirDesSequences(c.id, 'desinscription');
  return { ok: true, email: c.email };
}

const lienDesinscription = (c, source = null) => `${base()}/api/emailing/desinscription/${c.jeton}${source ? `?s=${encodeURIComponent(source)}` : ''}`;

// --- Séquences ------------------------------------------------------------------

/** Le nom de la liste d'un déclencheur « liste » (pour l'écran et AK). */
const listeDuDeclencheur = (s) => (s.declencheur?.type === 'liste' ? Records.get(ENT.LISTE, s.declencheur.ref)?.nom || null : null);

function resumeSequence(s) {
  const ins = Records.list(INSCRIPTION).filter((i) => i.sequence_id === s.id);
  const envois = Records.list(ENVOI).filter((e) => e.sequence_id === s.id);
  return {
    ...s,
    liste: listeDuDeclencheur(s),
    heure_envoi: s.heure_envoi ?? HEURE_PAR_DEFAUT,
    inscrits: ins.length,
    en_cours: ins.filter((i) => i.statut === 'en_cours').length,
    terminees: ins.filter((i) => i.statut === 'terminee').length,
    desinscrits: ins.filter((i) => i.statut === 'sortie' && i.raison === 'desinscription').length,
    envoyes: envois.filter((e) => ENVOYE.has(e.statut)).length,
    echecs: envois.filter((e) => e.statut === 'echec').length,
  };
}

export const sequences = () => Records.list(SEQUENCE).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le))).map(resumeSequence);

export function sequence(id) {
  const s = Records.get(SEQUENCE, id);
  if (!s) return null;
  const contactsParId = new Map(Records.list(CONTACT).map((c) => [c.id, c]));
  const envois = Records.list(ENVOI).filter((e) => e.sequence_id === id);
  const parEtape = Object.fromEntries((s.etapes || []).map((e) => [e.id, envois.filter((x) => x.etape_id === e.id && ENVOYE.has(x.statut)).length]));
  const inscriptions = Records.list(INSCRIPTION).filter((i) => i.sequence_id === id).map((i) => {
    const c = contactsParId.get(i.contact_id);
    return { id: i.id, statut: i.statut, raison: i.raison || null, etape: i.etape, prochain_envoi: i.prochain_envoi, email: c?.email || null, prenom: c?.prenom || null, nom: c?.nom || null };
  }).sort((a, b) => String(a.email).localeCompare(String(b.email)));
  return { ...resumeSequence(s), envoyes_par_etape: parEtape, inscriptions };
}

/** Pure : un déclencheur depuis le nom d'une liste (l'ancienne forme). */
const declencheurDeListe = (nom, par) => {
  const l = nom ? listeDuNom(nom, par) : null;
  return l ? { type: 'liste', ref: l.id } : { type: 'manuel' };
};

export function creerSequence({ nom, liste = null, declencheur = null }, user) {
  const n = String(nom || '').trim() || 'Nouvelle séquence';
  return Records.create(SEQUENCE, {
    nom: n, statut: 'brouillon', etapes: sequenceWebinaire(),
    declencheur: declencheur || declencheurDeListe(liste, user?.email),
    heure_envoi: HEURE_PAR_DEFAUT, sortie: { si_reponse: false },
    repondre_a: user?.email || null, cree_par: user?.email || null, cree_le: maintenant(),
  });
}

const ETAPE = (e, i) => ({
  id: String(e.id || `e${Date.now().toString(36)}${i}`),
  delai_jours: Math.max(0, Math.min(90, Number(e.delai_jours) || 0)),
  objet: String(e.objet || '').slice(0, 200),
  apercu: String(e.apercu || '').slice(0, 200),
  // L'heure d'envoi de cet email (« 09:00 », Paris) ; sans elle, celle de la séquence.
  heure: /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(e.heure || '')) ? String(e.heure).padStart(5, '0') : null,
  design: { theme: e.design?.theme || 'clair', logo: e.design?.logo !== false, blocs: Array.isArray(e.design?.blocs) ? e.design.blocs.slice(0, 40) : [] },
});
const TYPES_DECLENCHEUR = new Set(['liste', 'segment', 'tag', 'manuel']);

export function modifierSequence(id, patch) {
  const s = Records.get(SEQUENCE, id);
  if (!s) return { ok: false, error: 'Séquence introuvable.' };
  const champs = {};
  if (patch.nom != null) champs.nom = String(patch.nom).trim().slice(0, 120) || s.nom;
  if (patch.liste !== undefined) champs.declencheur = declencheurDeListe(patch.liste);
  if (patch.declencheur && TYPES_DECLENCHEUR.has(patch.declencheur.type)) champs.declencheur = { type: patch.declencheur.type, ref: patch.declencheur.ref || null };
  if (patch.heure_envoi !== undefined) champs.heure_envoi = Math.max(0, Math.min(23, Number(patch.heure_envoi) || 0));
  if (patch.sortie) champs.sortie = { si_reponse: !!patch.sortie.si_reponse };
  if (patch.repondre_a !== undefined) champs.repondre_a = normEmail(patch.repondre_a) || null;
  if (patch.expediteur_nom !== undefined) champs.expediteur_nom = String(patch.expediteur_nom || '').trim().slice(0, 80) || null;
  if (Array.isArray(patch.etapes)) champs.etapes = patch.etapes.slice(0, 12).map(ETAPE);
  return { ok: true, sequence: Records.update(SEQUENCE, id, champs) };
}

export function supprimerSequence(id) {
  if (!Records.get(SEQUENCE, id)) return { ok: false, error: 'Séquence introuvable.' };
  for (const i of Records.list(INSCRIPTION).filter((x) => x.sequence_id === id)) Records.delete(INSCRIPTION, i.id);
  Records.delete(SEQUENCE, id);
  return { ok: true };
}

/**
 * Pure : le prochain envoi, `jours` après `depuis`, le matin de ce jour-là à
 * `heure` (Paris). Le jour 0 part à l'heure s'il est encore temps, sinon tout
 * de suite : un contact ajouté en cours de route démarre au jour 0.
 */
export function prochainEnvoi(depuis, jours, heure = HEURE_PAR_DEFAUT, minute = 0) {
  const d = new Date(depuis);
  const [a, m, j] = jourParis(d).split('-').map(Number);
  const jour = new Date(Date.UTC(a, m - 1, j + (Number(jours) || 0))).toISOString().slice(0, 10);
  const prevu = aParis(jour, heure, minute);
  return (jours ? prevu : new Date(Math.max(d.getTime(), prevu.getTime()))).toISOString();
}

/** Pure : l'heure et la minute d'envoi d'un email de la séquence. */
export function heureDe(s, etape) {
  const m = String(etape?.heure || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? [Number(m[1]), Number(m[2])] : [s.heure_envoi ?? HEURE_PAR_DEFAUT, 0];
}

/** Active, met en pause ou reprend. Activer inscrit l'audience du déclencheur. */
export function changerStatut(id, statut) {
  const s = Records.get(SEQUENCE, id);
  if (!s) return { ok: false, error: 'Séquence introuvable.' };
  if (!['active', 'pause'].includes(statut)) return { ok: false, error: 'Statut inconnu.' };
  if (statut === 'active') {
    if (!(s.etapes || []).length) return { ok: false, error: 'La séquence n\'a aucun email.' };
    if (!s.declencheur || (s.declencheur.type !== 'manuel' && !s.declencheur.ref)) return { ok: false, error: 'Choisissez la liste de contacts à qui écrire.' };
    if ((s.etapes || []).some((e) => !e.objet?.trim())) return { ok: false, error: 'Chaque email a besoin d\'un objet.' };
  }
  Records.update(SEQUENCE, id, { statut, ...(statut === 'active' && !s.active_le ? { active_le: maintenant() } : {}), ...(statut === 'active' ? { erreur: null } : {}) });
  const inscrits = statut === 'active' ? inscrireListe(id).nouveaux : 0;
  return { ok: true, statut, inscrits };
}

/** Les contacts que le déclencheur d'une séquence fait entrer. */
function contactsDuDeclencheur(s) {
  const d = s.declencheur || {};
  if (d.type === 'liste' && d.ref) return audience({ listes: [d.ref] });
  if (d.type === 'segment' && d.ref) return audience({ segments: [d.ref] });
  if (d.type === 'tag' && d.ref) return audience({ tags: [d.ref] });
  return [];
}

/** Un contact entre dans une séquence (une seule fois), au jour 0. */
export function inscrireContact(sequenceId, contactId, { quand = maintenant() } = {}) {
  const s = Records.get(SEQUENCE, sequenceId);
  const c = Records.get(CONTACT, contactId);
  if (!s || !c) return { ok: false, error: 'Séquence ou contact introuvable.' };
  if (!envoyable(c)) return { ok: false, error: `${c.email} ne reçoit plus d'emails (${c.statut}).` };
  if (Records.list(INSCRIPTION).some((i) => i.sequence_id === sequenceId && i.contact_id === contactId)) return { ok: true, deja: true };
  Records.create(INSCRIPTION, { sequence_id: sequenceId, contact_id: contactId, etape: 0, statut: 'en_cours', prochain_envoi: prochainEnvoi(quand, s.etapes?.[0]?.delai_jours || 0, ...heureDe(s, s.etapes?.[0])), inscrit_le: quand });
  return { ok: true };
}

/**
 * Les contacts du déclencheur entrent dans la séquence (une seule fois
 * chacun). Ceux qui arrivent plus tard entrent au tour suivant.
 */
export function inscrireListe(id, { quand = maintenant() } = {}) {
  const s = Records.get(SEQUENCE, id);
  if (!s) return { nouveaux: 0 };
  const deja = new Set(Records.list(INSCRIPTION).filter((i) => i.sequence_id === id).map((i) => i.contact_id));
  let nouveaux = 0;
  for (const c of contactsDuDeclencheur(s)) {
    if (deja.has(c.id)) continue;
    if (inscrireContact(id, c.id, { quand }).ok) nouveaux += 1;
  }
  return { nouveaux };
}

const varsContact = (c, s) => ({ prenom: c.prenom || '', nom: c.nom || '', email: c.email, entreprise: c.entreprise || '', ville: c.ville || '', ...(c.champs || {}), expediteur: s?.signature || 'L\'équipe Klocka' });

/** Rendu d'une étape pour un contact (ou des valeurs d'exemple). */
export function rendreEtape(etape, vars, { desinscription = null, contact = null } = {}) {
  const { html, texte } = rendreEmail(etape.design, vars, { desinscription, logo: logo(), apercu: etape.apercu, contact });
  return { objet: remplir(etape.objet, vars).trim(), html, texte };
}

/**
 * Le tour d'envoi des séquences : chaque inscription dont l'heure est venue
 * reçoit son email, puis avance d'une étape. Un email déjà parti sous sa clé
 * ne repart pas. Au plus PAR_TOUR emails par tour, au rythme permis.
 */
export async function tourEmailing({ quand = new Date(), envoyer = envoyerResend } = {}) {
  if (!resendConfigure() && envoyer === envoyerResend) return { envoyes: 0 };
  const actives = Records.list(SEQUENCE).filter((s) => s.statut === 'active');
  for (const s of actives) inscrireListe(s.id, { quand: quand.toISOString() });
  const parId = new Map(actives.map((s) => [s.id, s]));
  const dues = Records.list(INSCRIPTION)
    .filter((i) => i.statut === 'en_cours' && parId.has(i.sequence_id) && Date.parse(i.prochain_envoi) <= quand.getTime())
    .sort((a, b) => String(a.prochain_envoi).localeCompare(String(b.prochain_envoi)))
    .slice(0, PAR_TOUR);
  const partis = new Set(Records.list(ENVOI).filter((e) => ENVOYE.has(e.statut)).map((e) => e.cle_envoi));
  let envoyes = 0;
  for (const i of dues) {
    const s = parId.get(i.sequence_id);
    if (!s) continue;
    const c = Records.get(CONTACT, i.contact_id);
    const etape = s.etapes?.[i.etape];
    if (!envoyable(c)) { Records.update(INSCRIPTION, i.id, { statut: 'sortie', raison: c ? c.statut : 'contact_supprime', sortie_le: quand.toISOString() }); continue; }
    if (!etape) { Records.update(INSCRIPTION, i.id, { statut: 'terminee', terminee_le: quand.toISOString() }); continue; }
    const cle = cleEnvoi.sequence(s.id, etape.id, c.id);
    const avancer = () => {
      const suivante = s.etapes[i.etape + 1];
      Records.update(INSCRIPTION, i.id, suivante
        ? { etape: i.etape + 1, prochain_envoi: prochainEnvoi(quand, suivante.delai_jours, ...heureDe(s, suivante)), dernier_envoi: quand.toISOString() }
        : { etape: i.etape + 1, statut: 'terminee', terminee_le: quand.toISOString(), dernier_envoi: quand.toISOString() });
    };
    if (partis.has(cle)) { avancer(); continue; }
    const lien = lienDesinscription(c, `sequence:${s.id}`);
    const { objet, html, texte } = rendreEtape(etape, varsContact(c, s), { desinscription: lien, contact: c });
    const r = await expedier({
      a: c.email, objet, html, texte, repondreA: s.repondre_a || null,
      ...(s.expediteur_nom ? { de: `${s.expediteur_nom} <equipe@notifications-klocka.com>` } : {}),
      entetes: { 'List-Unsubscribe': `<${lien}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      etiquettes: [['sequence', s.id], ['etape', etape.id]],
      idempotence: cle,
    }, { testeur: s.cree_par, envoyer });
    Records.create(ENVOI, { type: 'sequence', cle_envoi: cle, sequence_id: s.id, etape_id: etape.id, contact_id: c.id, email: c.email, objet, statut: statutEnvoi(r), redirige_vers: r.redirige || null, resend_id: r.id || null, erreur: r.ok ? null : r.error, le: quand.toISOString() });
    if (r.ok) {
      envoyes += 1;
      partis.add(cle);
      avancer();
    } else if (r.definitif) {
      // Une adresse refusée ne se réessaie pas ; un domaine refusé arrête la séquence.
      if (/domain|from/i.test(r.error)) { Records.update(SEQUENCE, s.id, { statut: 'pause', erreur: r.error }); parId.delete(s.id); break; }
      Records.update(INSCRIPTION, i.id, { statut: 'echec', erreur: r.error });
    }
    await pause(150);
  }
  return { envoyes };
}

/** Un email de la séquence envoyé à soi-même, avec des valeurs d'exemple. */
export async function envoyerTest(id, etapeId, a, { envoyer = envoyerResend } = {}) {
  const s = Records.get(SEQUENCE, id);
  const etape = s?.etapes?.find((e) => e.id === etapeId);
  if (!etape) return { ok: false, error: 'Email introuvable.' };
  const { objet, html, texte } = rendreEtape(etape, { prenom: 'Jules', nom: 'Exemple', email: a, expediteur: 'L\'équipe Klocka' }, { desinscription: `${base()}/api/emailing/desinscription/test` });
  // Le test va à soi-même : il n'a pas à passer par le garde-fou.
  const r = await envoyer({ a, objet: `[Test] ${objet}`, html, texte, repondreA: s.repondre_a || null });
  if (r.ok) Records.update(SEQUENCE, id, { etapes: s.etapes.map((e) => (e.id === etapeId ? { ...e, test_envoye_le: maintenant() } : e)) });
  return r;
}

// --- Les mails de la plateforme ---------------------------------------------------

const templatePlateforme = (cle) => Records.list(TEMPLATE).find((x) => x.categorie === 'plateforme' && x.cle === cle) || null;

export function modelesPlateforme() {
  return Object.entries(MAILS_PLATEFORME).map(([cle, m]) => {
    const r = templatePlateforme(cle);
    return { cle, nom: m.nom, description: m.description, variables: m.variables, objet: r?.objet ?? m.objet, apercu: r?.apercu ?? m.apercu, design: r?.design || m.design, modifie_le: r?.modifie_le || null };
  });
}

export function modifierModele(cle, patch, user) {
  if (!MAILS_PLATEFORME[cle]) return { ok: false, error: 'Modèle inconnu.' };
  const r = templatePlateforme(cle);
  const etape = ETAPE({ id: cle, ...modelesPlateforme().find((m) => m.cle === cle), ...patch }, 0);
  const champs = { categorie: 'plateforme', cle, objet: etape.objet, apercu: etape.apercu, design: etape.design, modifie_le: maintenant(), modifie_par: user?.email || null };
  return { ok: true, modele: r ? Records.update(TEMPLATE, r.id, champs) : Records.create(TEMPLATE, champs) };
}

export function retablirModele(cle) {
  for (const r of Records.list(TEMPLATE).filter((x) => x.categorie === 'plateforme' && x.cle === cle)) Records.delete(TEMPLATE, r.id);
  return { ok: true };
}

/**
 * Un mail de la plateforme, rendu avec ses valeurs. Rend { objet, html,
 * texte } ou null si le modèle n'existe pas.
 */
export function mailPlateforme(cle, vars = {}) {
  const m = modelesPlateforme().find((x) => x.cle === cle);
  return m ? rendreEtape(m, vars) : null;
}

/**
 * Envoie un mail de la plateforme par Resend, sous le garde-fou (`testeur` :
 * l'admin qui agit, qui le reçoit en local). Pas de désinscription marketing,
 * mais une adresse en bounce ou en plainte n'est pas servie (`bloque` : ne
 * pas retomber sur Gmail). Sinon { ok: false, error } : l'appelant retombe
 * sur la boîte Gmail.
 */
export async function envoyerPlateforme(cle, { a, vars = {}, repondreA = null, testeur = null }, { envoyer = envoyerResend } = {}) {
  const m = mailPlateforme(cle, vars);
  if (!m) return { ok: false, error: 'Modèle inconnu.' };
  const email = normEmail(a);
  const contact = Records.list(CONTACT).find((c) => c.email === email);
  if (contact && ['bounce', 'plainte'].includes(contact.statut)) return { ok: false, bloque: true, error: `${email} est en ${contact.statut} : l'adresse n'est plus servie.` };
  if (!resendConfigure() && envoyer === envoyerResend) return { ok: false, error: 'Resend non configuré.' };
  const r = await expedier({ a: email, objet: m.objet, html: m.html, texte: m.texte, repondreA, etiquettes: [['plateforme', cle]] }, { testeur: testeur || repondreA, envoyer });
  Records.create(ENVOI, { type: 'plateforme', cle, cle_envoi: `plateforme:${cle}:${email}:${maintenant()}`, email, objet: m.objet, statut: statutEnvoi(r), redirige_vers: r.redirige || null, resend_id: r.id || null, erreur: r.ok ? null : r.error, le: maintenant() });
  return r;
}

export function envoisRecents(limite = 50) {
  return Records.list(ENVOI).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, limite);
}

// --- La règle « arrêter la séquence si le contact répond » -------------------------

/**
 * Les mails reçus dans les boîtes connectées de l'équipe (veille Gmail,
 * retenus ou écartés) depuis le dernier passage : un contact qui écrit sort
 * des séquences dont la règle « arrêter s'il répond » est cochée. Rend le
 * nombre de sorties.
 */
export async function reponsesRecues() {
  const { Meta } = await import('../db.js');
  const depuis = Meta.get('emailing:reponses_le') || '1970-01-01T00:00:00Z';
  const recus = [...Records.list('MailRecu'), ...Records.list('MailEcarte')]
    .map((m) => ({ email: normEmail(m.de_email), le: m.date || m.le || m.created_date || null }))
    .filter((m) => m.email && m.le && m.le > depuis);
  Meta.set('emailing:reponses_le', maintenant());
  if (!recus.length) return 0;
  const parEmail = new Map(Records.list(CONTACT).map((c) => [c.email, c]));
  const avecRegle = new Set(Records.list(SEQUENCE).filter((s) => s.sortie?.si_reponse).map((s) => s.id));
  let sorties = 0;
  for (const m of recus) {
    const c = parEmail.get(m.email);
    if (!c) continue;
    for (const i of Records.list(INSCRIPTION).filter((x) => x.contact_id === c.id && x.statut === 'en_cours' && avecRegle.has(x.sequence_id) && String(x.inscrit_le) < m.le)) {
      Records.update(INSCRIPTION, i.id, { statut: 'sortie', raison: 'reponse', sortie_le: maintenant() });
      sorties += 1;
    }
  }
  return sorties;
}

/** Les inscriptions d'une séquence à la main (des contacts choisis). */
export function inscrireContacts(sequenceId, ids) {
  let n = 0;
  const refus = [];
  for (const id of ids) {
    const r = inscrireContact(sequenceId, id);
    if (r.ok && !r.deja) n += 1;
    else if (!r.ok) refus.push(r.error);
  }
  return { ok: true, inscrits: n, refus };
}
