// Les contacts de l'emailing : la lecture d'un tableau collé ou importé,
// l'import avec correspondance des colonnes, la recherche, les actions en
// masse, les listes, les segments, les champs personnalisés et la fiche d'un
// contact. Le modèle est dans schema.js.

import { randomBytes } from 'crypto';
import { Records } from '../db.js';
import { E, listeDuNom, audience, dansSegment, envoyable, STATUTS_CONTACT } from './schema.js';

const maintenant = () => new Date().toISOString();
const normEmail = (e) => String(e || '').trim().toLowerCase();
export const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[^@\s,;<>"]{2,}$/;
const sansAccent = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// --- Lire un tableau ------------------------------------------------------------------

/** Pure : une ligne en cellules ; une cellule entre guillemets garde ses séparateurs, "" vaut un guillemet. */
export function cellules(l, d) {
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
}

/**
 * Pure : un texte collé ou un CSV en tableau. Rend { entetes, lignes } ;
 * sans en-tête reconnaissable (la première ligne porte déjà une adresse),
 * les colonnes s'appellent « Colonne 1 », « Colonne 2 »…
 */
export function lireTableau(texte) {
  const brutes = String(texte || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!brutes.length) return { entetes: [], lignes: [] };
  const d = brutes[0].includes('\t') ? '\t' : brutes[0].includes(';') ? ';' : ',';
  const tableau = brutes.map((l) => cellules(l, d));
  const premiere = tableau[0];
  const avecEntete = !premiere.some((c) => EMAIL.test(c));
  const largeur = Math.max(...tableau.map((l) => l.length));
  const entetes = avecEntete ? Array.from({ length: largeur }, (_, i) => premiere[i] || `Colonne ${i + 1}`) : Array.from({ length: largeur }, (_, i) => `Colonne ${i + 1}`);
  return { entetes, lignes: avecEntete ? tableau.slice(1) : tableau };
}

const CHAMPS_BASE = ['email', 'prenom', 'nom', 'entreprise', 'ville'];

/** Le type d'un contact : qui il est pour Klocka. Un contact sans type est un lead. */
export const TYPES_CONTACT = ['lead', 'client', 'mandataire', 'partenaire'];
export function typeContact(v) {
  const t = sansAccent(v);
  if (!t) return null;
  if (TYPES_CONTACT.includes(t)) return t;
  if (/^client|investisseur/.test(t)) return 'client';
  if (/mandataire|agent/.test(t)) return 'mandataire';
  if (/partenaire|cgp|notaire|banque/.test(t)) return 'partenaire';
  if (/lead|prospect/.test(t)) return 'lead';
  return null;
}
const RECONNAITRE = [
  ['email', ['email', 'e-mail', 'mail', 'adresse mail', 'adresse email', 'courriel']],
  ['prenom', ['prenom', 'first name', 'firstname', 'first']],
  ['nom', ['nom', 'last name', 'lastname', 'nom de famille', 'last']],
  ['entreprise', ['entreprise', 'societe', 'company', 'organisation', 'organization']],
  ['ville', ['ville', 'city', 'commune']],
  ['tags', ['tags', 'tag', 'etiquettes']],
  ['type', ['type', 'categorie', 'profil']],
];

/**
 * Pure : la correspondance proposée, colonne par colonne (« email »,
 * « prenom », « champs.budget », « tags » ou « ignorer »). Une colonne sans
 * en-tête qui porte des adresses devient l'email.
 */
// Les intitulés tels qu'ils arrivent dans les fichiers : « Adresse e-mail »,
// « Prénom du contact », « Nom de l'entreprise ». Après les noms exacts, ces
// motifs, dans cet ordre : l'entreprise passe avant le nom, le prénom aussi.
const MOTIFS = [
  ['email', /\b(e ?mail|mail|courriel)\b/],
  ['prenom', /\b(prenom|first ?name)\b/],
  ['entreprise', /\b(entreprise|societe|company|organisation|organization|raison sociale|cabinet|agence)\b/],
  ['nom', /^(nom|last ?name|surname|nom de famille|nom famille)$|\bnom\b|\blast ?name\b/],
  ['ville', /\b(ville|city|commune|localite)\b/],
  ['tags', /\b(tags?|etiquettes?)\b/],
  ['type', /\b(type|categorie|profil)\b/],
];

/** Pure : ce qu'un intitulé de colonne désigne, ou null. */
export function cibleDeEntete(h) {
  const t = sansAccent(h);
  const exact = RECONNAITRE.find(([, noms]) => noms.includes(t))?.[0];
  if (exact) return exact;
  const mots = t.replace(/[^a-z0-9]+/g, ' ').trim();
  return MOTIFS.find(([, motif]) => motif.test(mots))?.[0] || null;
}

export function proposerCorrespondance({ entetes, lignes }, champs = []) {
  const pris = new Set();
  return entetes.map((h, i) => {
    const t = sansAccent(h);
    let choix = champs.find((c) => sansAccent(c.libelle) === t || c.cle === t)?.cle && `champs.${champs.find((c) => sansAccent(c.libelle) === t || c.cle === t).cle}`
      || cibleDeEntete(h)
      || null;
    if (!choix && lignes.slice(0, 20).some((l) => EMAIL.test(l[i] || ''))) choix = 'email';
    if (!choix || pris.has(choix)) return 'ignorer';
    pris.add(choix);
    return choix;
  });
}

/** L'aperçu d'un import : les colonnes, la correspondance proposée, les premières lignes. */
export function analyserImport(texte) {
  const t = lireTableau(texte);
  if (!t.lignes.length) return { ok: false, error: 'Aucune ligne lue.' };
  const correspondance = proposerCorrespondance(t, champs());
  return { ok: true, entetes: t.entetes, correspondance, apercu: t.lignes.slice(0, 5), total: t.lignes.length };
}

/** Pure : une ligne en contact, selon la correspondance. */
export function ligneEnContact(ligne, correspondance) {
  const c = { champs: {}, tags: [] };
  correspondance.forEach((cible, i) => {
    const v = String(ligne[i] ?? '').trim();
    if (!v || !cible || cible === 'ignorer') return;
    if (cible === 'email') c.email = normEmail(v);
    else if (cible === 'type') c.type = typeContact(v);
    else if (cible === 'tags') c.tags = v.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
    else if (cible.startsWith('champs.')) c.champs[cible.slice(7)] = v;
    else if (CHAMPS_BASE.includes(cible)) c[cible] = v;
  });
  return c;
}

/**
 * Importe un tableau selon sa correspondance. Une adresse connue est mise à
 * jour (champs vides complétés, listes et tags ajoutés), jamais dupliquée, et
 * garde son statut : un désinscrit le reste.
 */
export function importer(texte, { correspondance = null, liste = null, tags = [], source = 'import', par = null } = {}) {
  const t = lireTableau(texte);
  const corr = correspondance || proposerCorrespondance(t, champs());
  if (!corr.includes('email')) return { ok: false, error: 'Aucune colonne n\'est l\'adresse email.' };
  const l = liste ? listeDuNom(liste, par) : null;
  const parEmail = new Map(Records.list(E.CONTACT).map((c) => [c.email, c]));
  const vus = new Set();
  let nouveaux = 0;
  let maj = 0;
  let invalides = 0;
  for (const ligne of t.lignes) {
    const c = ligneEnContact(ligne, corr);
    if (!EMAIL.test(c.email || '')) { invalides += 1; continue; }
    if (vus.has(c.email)) continue;
    vus.add(c.email);
    const tousTags = [...new Set([...(c.tags || []), ...tags])];
    const ancien = parEmail.get(c.email);
    if (ancien) {
      const complete = Object.fromEntries(['prenom', 'nom', 'entreprise', 'ville'].filter((k) => c[k] && !ancien[k]).map((k) => [k, c[k]]));
      const champsComplets = { ...c.champs, ...(ancien.champs || {}) };
      Records.update(E.CONTACT, ancien.id, {
        ...complete, champs: champsComplets, ...(c.type && !ancien.type ? { type: c.type } : {}),
        tags: [...new Set([...(ancien.tags || []), ...tousTags])],
        listes: l ? [...new Set([...(ancien.listes || []), l.id])] : ancien.listes || [],
        maj_le: maintenant(),
      });
      maj += 1;
    } else {
      Records.create(E.CONTACT, {
        email: c.email, prenom: c.prenom || '', nom: c.nom || '', entreprise: c.entreprise || '', ville: c.ville || '', type: c.type || 'lead',
        champs: c.champs, tags: tousTags, listes: l ? [l.id] : [], source, statut: 'abonne',
        jeton: randomBytes(16).toString('hex'), ajoute_le: maintenant(), ajoute_par: par,
      });
      nouveaux += 1;
    }
  }
  return { ok: true, lus: t.lignes.length, nouveaux, mis_a_jour: maj, invalides, liste: l?.nom || null, liste_id: l?.id || null };
}

/** Ajoute un contact à la main ; une adresse connue est mise à jour. */
export function creerContact(c, { par = null } = {}) {
  const email = normEmail(c.email);
  if (!EMAIL.test(email)) return { ok: false, error: 'Adresse invalide.' };
  const ancien = Records.list(E.CONTACT).find((x) => x.email === email);
  if (ancien) return { ok: true, deja: true, contact: ancien };
  const contact = Records.create(E.CONTACT, {
    email, prenom: c.prenom || '', nom: c.nom || '', entreprise: c.entreprise || '', ville: c.ville || '', type: typeContact(c.type) || 'lead',
    champs: c.champs || {}, tags: c.tags || [], listes: (c.listes || []).filter(Boolean), source: c.source || 'manuel', statut: 'abonne',
    jeton: randomBytes(16).toString('hex'), ajoute_le: maintenant(), ajoute_par: par,
  });
  return { ok: true, contact };
}

// --- Rechercher -----------------------------------------------------------------------

/**
 * Les contacts filtrés : texte libre (adresse, nom, entreprise, ville), liste,
 * segment, tag, statut. Rend une page et le total.
 */
export function rechercher({ q = '', liste = null, segment = null, tag = null, statut = null, type = null, page = 1, parPage = 50 } = {}) {
  const seg = segment ? Records.get(E.SEGMENT, segment) : null;
  const t = sansAccent(q);
  const tous = Records.list(E.CONTACT).filter((c) => (!liste || (c.listes || []).includes(liste))
    && (!type || (c.type || 'lead') === type)
    && (!seg || dansSegment(c, seg))
    && (!tag || (c.tags || []).includes(tag))
    && (!statut || c.statut === statut)
    && (!t || sansAccent([c.email, c.prenom, c.nom, c.entreprise, c.ville].join(' ')).includes(t)))
    .sort((a, b) => String(b.ajoute_le).localeCompare(String(a.ajoute_le)));
  const noms = new Map(Records.list(E.LISTE).map((l) => [l.id, l.nom]));
  const debut = (Math.max(1, page) - 1) * parPage;
  // La dernière activité de la page seulement : les envois et événements de ses contacts.
  const page_ = tous.slice(debut, debut + parPage);
  const ids = new Set(page_.map((c) => c.id));
  const envoisPage = Records.list(E.ENVOI).filter((e) => ids.has(e.contact_id));
  const contactDeEnvoi = new Map(envoisPage.map((e) => [e.id, e.contact_id]));
  const evtsPage = Records.list(E.EVENEMENT).filter((e) => contactDeEnvoi.has(e.envoi_id));
  const activite = new Map(page_.map((c) => [c.id, derniereActivite(c, envoisPage.filter((e) => e.contact_id === c.id), evtsPage.filter((e) => contactDeEnvoi.get(e.envoi_id) === c.id))]));
  return {
    total: tous.length,
    contacts: tous.slice(debut, debut + parPage).map((c) => ({ ...c, type: c.type || 'lead', liste_ids: c.listes || [], listes: (c.listes || []).map((id) => noms.get(id)).filter(Boolean), derniere_activite: activite.get(c.id) || derniereActivite(c, [], []) })),
  };
}

const VERBES = { ouvert: 'A ouvert', clique: 'A cliqué', bounce: 'Bounce sur', plainte: 'Plainte sur', delivre: 'A reçu' };

/**
 * Pure : la dernière chose qu'a faite (ou reçue) un contact. Les envois et
 * événements donnés sont les siens. Rend { texte, le }.
 */
export function derniereActivite(c, envois, evenements) {
  const parId = new Map(envois.map((e) => [e.id, e]));
  const faits = [
    ...evenements.filter((e) => VERBES[e.type]).map((e) => ({ le: e.le, texte: `${VERBES[e.type]} « ${parId.get(e.envoi_id)?.objet || 'un email'} »` })),
    ...envois.filter((e) => e.statut !== 'echec').map((e) => ({ le: e.le, texte: `A reçu « ${e.objet || 'un email'} »` })),
    ...(c.statut === 'desinscrit' && c.statut_le ? [{ le: c.statut_le, texte: 'Désinscrit' }] : []),
    ...(c.ajoute_le ? [{ le: c.ajoute_le, texte: c.source === 'manuel' ? 'Ajouté à la main' : `Ajouté (${c.source || 'import'})` }] : []),
  ].filter((f) => f.le).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return faits[0] || null;
}

/** Les tags utilisés, avec leur nombre de contacts. */
export function tags() {
  const n = new Map();
  for (const c of Records.list(E.CONTACT)) for (const t of c.tags || []) n.set(t, (n.get(t) || 0) + 1);
  return [...n.entries()].map(([nom, total]) => ({ nom, total })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Une action sur plusieurs contacts : tag, liste, désinscription, suppression. */
export function enMasse(ids, { action, valeur = null } = {}) {
  const liste = Records.list(E.CONTACT).filter((c) => ids.includes(c.id));
  for (const c of liste) {
    if (action === 'ajouter_tag' && valeur) Records.update(E.CONTACT, c.id, { tags: [...new Set([...(c.tags || []), valeur])] });
    else if (action === 'retirer_tag') Records.update(E.CONTACT, c.id, { tags: (c.tags || []).filter((x) => x !== valeur) });
    else if (action === 'ajouter_liste' && valeur) Records.update(E.CONTACT, c.id, { listes: [...new Set([...(c.listes || []), valeur])] });
    else if (action === 'retirer_liste') Records.update(E.CONTACT, c.id, { listes: (c.listes || []).filter((x) => x !== valeur) });
    else if (action === 'desinscrire' && c.statut === 'abonne') {
      Records.update(E.CONTACT, c.id, { statut: 'desinscrit', statut_le: maintenant(), desinscription_source: 'equipe' });
      for (const i of Records.list(E.INSCRIPTION).filter((x) => x.contact_id === c.id && x.statut === 'en_cours')) Records.update(E.INSCRIPTION, i.id, { statut: 'sortie', raison: 'desinscription', sortie_le: maintenant() });
    } else if (action === 'supprimer') {
      for (const i of Records.list(E.INSCRIPTION).filter((x) => x.contact_id === c.id)) Records.delete(E.INSCRIPTION, i.id);
      Records.delete(E.CONTACT, c.id);
    }
  }
  return { ok: true, touches: liste.length };
}

/** Modifie un contact : ses champs, ses tags, ses listes. Son statut ne se change pas ici, sauf pour le désinscrire. */
export function modifierContact(id, patch) {
  const c = Records.get(E.CONTACT, id);
  if (!c) return { ok: false, error: 'Contact introuvable.' };
  const champs = {};
  for (const k of ['prenom', 'nom', 'entreprise', 'ville']) if (patch[k] !== undefined) champs[k] = String(patch[k] || '').trim();
  if (patch.type !== undefined) champs.type = typeContact(patch.type) || 'lead';
  if (patch.champs && typeof patch.champs === 'object') champs.champs = { ...(c.champs || {}), ...patch.champs };
  if (Array.isArray(patch.tags)) champs.tags = [...new Set(patch.tags.map((t) => String(t).trim()).filter(Boolean))];
  if (Array.isArray(patch.listes)) champs.listes = patch.listes.filter(Boolean);
  if (patch.statut === 'desinscrit' && c.statut === 'abonne') enMasse([id], { action: 'desinscrire' });
  champs.maj_le = maintenant();
  return { ok: true, contact: Records.update(E.CONTACT, id, champs) };
}

/** La fiche d'un contact : ses champs, ses campagnes, ses séquences, son historique. */
export function fiche(id) {
  const c = Records.get(E.CONTACT, id);
  if (!c) return null;
  const envois = Records.list(E.ENVOI).filter((e) => e.contact_id === id || e.email === c.email);
  const evts = Records.list(E.EVENEMENT).filter((e) => envois.some((x) => x.id === e.envoi_id));
  const campagnes = new Map(Records.list(E.CAMPAGNE).map((x) => [x.id, x]));
  const sequences = new Map(Records.list(E.SEQUENCE).map((x) => [x.id, x]));
  const noms = new Map(Records.list(E.LISTE).map((l) => [l.id, l.nom]));
  const historique = [
    ...envois.map((e) => ({ le: e.le, type: e.statut === 'echec' ? 'echec' : 'envoye', objet: e.objet, source: e.campagne_id ? campagnes.get(e.campagne_id)?.nom : e.sequence_id ? sequences.get(e.sequence_id)?.nom : e.cle || null })),
    ...evts.map((e) => ({ le: e.le, type: e.type, lien: e.lien || null, objet: envois.find((x) => x.id === e.envoi_id)?.objet || null })),
  ].sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return {
    contact: { ...c, listes_noms: (c.listes || []).map((x) => noms.get(x)).filter(Boolean) },
    campagnes: envois.filter((e) => e.campagne_id).map((e) => ({ id: e.campagne_id, nom: campagnes.get(e.campagne_id)?.nom || 'Campagne supprimée', le: e.le, statut: e.statut, ouvert: !!e.ouvert_le, clique: !!e.clique_le })),
    sequences: Records.list(E.INSCRIPTION).filter((i) => i.contact_id === id).map((i) => ({ id: i.sequence_id, nom: sequences.get(i.sequence_id)?.nom || 'Séquence supprimée', statut: i.statut, raison: i.raison || null, etape: i.etape, total: sequences.get(i.sequence_id)?.etapes?.length || 0, prochain_envoi: i.prochain_envoi })),
    historique,
  };
}

// --- Listes ------------------------------------------------------------------------------

export function creerListe(nom, par = null) {
  const n = String(nom || '').trim();
  if (!n) return { ok: false, error: 'Nommez la liste.' };
  if (Records.list(E.LISTE).some((l) => l.nom === n)) return { ok: false, error: 'Une liste porte déjà ce nom.' };
  return { ok: true, liste: listeDuNom(n, par) };
}

export function renommerListe(id, nom) {
  const n = String(nom || '').trim();
  if (!n || !Records.get(E.LISTE, id)) return { ok: false, error: 'Liste introuvable ou nom vide.' };
  return { ok: true, liste: Records.update(E.LISTE, id, { nom: n }) };
}

/** Supprime une liste ; ses contacts restent, sans elle. */
export function supprimerListe(id) {
  if (!Records.get(E.LISTE, id)) return { ok: false, error: 'Liste introuvable.' };
  for (const c of Records.list(E.CONTACT).filter((x) => (x.listes || []).includes(id))) Records.update(E.CONTACT, c.id, { listes: c.listes.filter((x) => x !== id) });
  Records.delete(E.LISTE, id);
  return { ok: true };
}

// --- Segments ---------------------------------------------------------------------------

const OPERATEURS = new Set(['egal', 'different', 'contient', 'vide', 'non_vide', 'a_tag', 'sans_tag', 'dans_liste', 'hors_liste']);
const regles = (r) => ({
  combinaison: r?.combinaison === 'ou' ? 'ou' : 'et',
  conditions: (r?.conditions || []).filter((c) => OPERATEURS.has(c.operateur)).slice(0, 20).map((c) => ({ champ: c.champ || null, operateur: c.operateur, valeur: c.valeur ?? null })),
});

export function segments() {
  const tous = Records.list(E.CONTACT);
  return Records.list(E.SEGMENT).map((s) => {
    const dedans = tous.filter((c) => dansSegment(c, s));
    return { ...s, total: dedans.length, abonnes: dedans.filter(envoyable).length };
  }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function enregistrerSegment({ id = null, nom, regles: r }, par = null) {
  const n = String(nom || '').trim();
  if (!n) return { ok: false, error: 'Nommez le segment.' };
  const champs = { nom: n, regles: regles(r) };
  if (!champs.regles.conditions.length) return { ok: false, error: 'Un segment a au moins une règle.' };
  if (id) return Records.get(E.SEGMENT, id) ? { ok: true, segment: Records.update(E.SEGMENT, id, champs) } : { ok: false, error: 'Segment introuvable.' };
  return { ok: true, segment: Records.create(E.SEGMENT, { ...champs, cree_le: maintenant(), cree_par: par }) };
}

export function supprimerSegment(id) {
  if (!Records.get(E.SEGMENT, id)) return { ok: false, error: 'Segment introuvable.' };
  Records.delete(E.SEGMENT, id);
  return { ok: true };
}

/** Le nombre de contacts d'une audience (listes, segments, tags), envoyables et en tout. */
export function compterAudience(a) {
  const tous = audience(a, { tous: true });
  return { total: tous.length, eligibles: tous.filter(envoyable).length, exclus: tous.filter((c) => !envoyable(c)).length };
}

// --- Champs personnalisés -----------------------------------------------------------------

export const champs = () => Records.list(E.CHAMP).sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

export function creerChamp({ libelle, type = 'texte', options = [] }) {
  const l = String(libelle || '').trim();
  if (!l) return { ok: false, error: 'Nommez le champ.' };
  const cle = sansAccent(l).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (!cle || ['email', 'prenom', 'nom', 'entreprise', 'ville', 'lien', 'expediteur'].includes(cle)) return { ok: false, error: 'Ce nom est réservé.' };
  if (Records.list(E.CHAMP).some((c) => c.cle === cle)) return { ok: false, error: 'Ce champ existe déjà.' };
  return { ok: true, champ: Records.create(E.CHAMP, { cle, libelle: l, type: ['texte', 'nombre', 'choix'].includes(type) ? type : 'texte', options: Array.isArray(options) ? options.slice(0, 30) : [] }) };
}

export function supprimerChamp(id) {
  if (!Records.get(E.CHAMP, id)) return { ok: false, error: 'Champ introuvable.' };
  Records.delete(E.CHAMP, id);
  return { ok: true };
}

export { STATUTS_CONTACT };
