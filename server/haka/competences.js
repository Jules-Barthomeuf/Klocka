// Haka : les compétences (17 oct. 2026, Jules). Une compétence est une
// recette : les données à prendre, les règles à appliquer, le livrable à
// produire. Jules seul les écrit et les publie, dans Paramètres › Compétences.
//
// Une compétence = un en-tête structuré (nom, déclencheurs, entrées, outils
// autorisés avec ceux qui sont obligatoires, livrable, qui valide) + un corps
// libre (la recette, en texte). Chaque publication fait une version ; chaque
// exécution de Haka enregistre la version utilisée. Les neuf fiches de
// docs/ak/procedures/ sont importées au premier passage ; chaque publication
// y est réexportée (sauvegarde versionnée par git, quand le serveur tourne sur
// un dépôt). AK les lit par lire_procedure : la version publiée l'emporte sur
// le fichier.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Records } from '../db.js';

const ENTITE = 'HakaCompetence';
const DOSSIER = new URL('../../docs/ak/procedures/', import.meta.url);
// Les tests exportent ailleurs : le dépôt ne bouge pas quand ils tournent.
const DOSSIER_EXPORT = process.env.HAKA_EXPORT_DIR ? pathToFileURL(process.env.HAKA_EXPORT_DIR.replace(/\/?$/, '/')) : DOSSIER;
const maintenant = () => new Date().toISOString();
const norm = (e) => String(e || '').trim().toLowerCase();

export const DECLENCHEURS = ['chat', 'dossier', 'mail', 'automatique'];
export const VALIDE_PAR = ['responsable', 'jules', 'personne'];

/** Les outils qu'une compétence peut nommer : les 28 groupes d'AK v2 et les sources de marché. Le front y met icône et nom (src/lib/sources.js). */
export const OUTILS = [
  'documents', 'fiche', 'preanalyse', 'dossiers', 'projet', 'clients', 'layer', 'gmail', 'drive', 'agenda', 'monday', 'web',
  'dvf', 'equimmox', 'data_b', 'valeur_locative', 'vacance', 'annuaire', 'figaro', 'bodacc',
  'kzoning', 'kexpertise', 'kestimation', 'kprospective', 'kvacance', 'kfoncier', 'ktransactions',
  'simulateur', 'modele_klocka', 'presentation', 'loi', 'emailing', 'off_market', 'prospection',
];

// L'en-tête de départ des neuf fiches : ce que la recette lit et produit, d'après son texte.
const DEFAUTS = {
  preanalyse: { nom: 'Pré-analyser une fiche', declencheurs: ['chat', 'mail', 'automatique'], entrees: ['La fiche commerciale (PDF, texte collé, capture)'], outils: [{ cle: 'fiche', obligatoire: true }, { cle: 'preanalyse', obligatoire: true }, { cle: 'dvf' }, { cle: 'equimmox' }, { cle: 'valeur_locative' }, { cle: 'simulateur' }], livrable: 'Le dossier à l\'étape Pré-analyse : verdict, grille, simulateur, mail à l\'agent', format: 'dossier', valide_par: 'responsable' },
  'data-room': { nom: 'Analyser la data room', declencheurs: ['chat', 'dossier', 'automatique'], entrees: ['Les documents du dossier (bail, quittances, PV d\'AG, règlement, diagnostics)'], outils: [{ cle: 'documents', obligatoire: true }, { cle: 'dossiers', obligatoire: true }, { cle: 'dvf' }, { cle: 'equimmox' }, { cle: 'valeur_locative' }, { cle: 'vacance' }, { cle: 'annuaire' }, { cle: 'clients' }], livrable: 'La page du dossier à l\'étape Analyse, complétée : grilles, marché, simulateur, chaque chiffre avec sa source', format: 'dossier', valide_par: 'responsable' },
  'lecture-bail': { nom: 'Lire un bail', declencheurs: ['chat', 'dossier'], entrees: ['Le bail, ses avenants, les PV d\'AG, le règlement de copropriété'], outils: [{ cle: 'documents', obligatoire: true }], livrable: 'La grille du bail remplie, les points à trancher', format: 'grille', valide_par: 'responsable' },
  loi: { nom: 'Rédiger une LOI', declencheurs: ['chat', 'dossier'], entrees: ['L\'acquéreur, le bien ou son dossier, le vendeur, le prix, l\'apport'], outils: [{ cle: 'dossiers', obligatoire: true }, { cle: 'projet' }, { cle: 'clients' }, { cle: 'modele_klocka', obligatoire: true }], livrable: 'La lettre d\'intention, au modèle Klocka, dans Offres', format: 'loi', valide_par: 'responsable' },
  'presentation-bancaire': { nom: 'Préparer le dossier bancaire', declencheurs: ['chat', 'dossier'], entrees: ['Le projet de la plateforme (ses chiffres, son bail, son marché)'], outils: [{ cle: 'projet', obligatoire: true }, { cle: 'equimmox' }, { cle: 'dvf' }, { cle: 'figaro' }, { cle: 'modele_klocka', obligatoire: true }], livrable: 'La présentation bancaire, seize diapositives, chaque chiffre sourcé', format: 'presentation', valide_par: 'responsable' },
  'mails-agents': { nom: 'Écrire à un agent', declencheurs: ['chat', 'dossier', 'automatique'], entrees: ['Le dossier et son agent ; l\'intention (demande de documents, relance, refus, suite)'], outils: [{ cle: 'dossiers', obligatoire: true }, { cle: 'gmail', obligatoire: true }, { cle: 'layer' }], livrable: 'Un mail prêt, dans À valider, qui part de la boîte de l\'analyste', format: 'mail', valide_par: 'responsable' },
  'prospection-appels': { nom: 'Noter un appel', declencheurs: ['chat'], entrees: ['La note dictée ou collée, l\'agent, l\'agence'], outils: [{ cle: 'prospection', obligatoire: true }, { cle: 'monday' }, { cle: 'clients' }], livrable: 'La fiche de l\'agent et sa ligne Monday à jour, la relance posée', format: 'note', valide_par: 'responsable' },
  emailing: { nom: 'Concevoir une séquence d\'emails', declencheurs: ['chat'], entrees: ['L\'objectif, le webinaire, l\'appel à l\'action, la liste de contacts'], outils: [{ cle: 'emailing', obligatoire: true }], livrable: 'Les emails en brouillon, dans Emailing', format: 'emails', valide_par: 'jules' },
  'off-market': { nom: 'Prospecter l\'off-market', declencheurs: ['chat'], entrees: ['Une ville, une cible, une société'], outils: [{ cle: 'off_market', obligatoire: true }, { cle: 'annuaire' }, { cle: 'bodacc' }], livrable: 'Les cibles, les sociétés, les courriers relus avant d\'être postés', format: 'off_market', valide_par: 'responsable' },
};

const nettoyerOutils = (outils = []) => {
  const vus = new Set();
  return (Array.isArray(outils) ? outils : []).map((o) => (typeof o === 'string' ? { cle: o } : o)).filter((o) => o && OUTILS.includes(o.cle) && !vus.has(o.cle) && vus.add(o.cle)).map((o) => ({ cle: o.cle, obligatoire: !!o.obligatoire }));
};
const nettoyerListe = (l, autorises = null) => [...new Set((Array.isArray(l) ? l : String(l || '').split('\n')).map((x) => String(x || '').trim()).filter(Boolean))].filter((x) => !autorises || autorises.includes(x));

/** Pure : l'en-tête + le corps, tels qu'AK les lit et tels qu'on les exporte. */
export function rendre(c) {
  const lignes = [
    `${String(c.nom || c.cle).toUpperCase()}`,
    c.resume ? c.resume : null,
    '',
    `Déclencheurs : ${(c.declencheurs || []).join(', ') || '—'}`,
    `Entrées : ${(c.entrees || []).join(' ; ') || '—'}`,
    `Outils : ${(c.outils || []).map((o) => `${o.cle}${o.obligatoire ? ' (obligatoire)' : ''}`).join(', ') || '—'}`,
    `Livrable : ${c.livrable || '—'}${c.format ? ` (${c.format})` : ''}`,
    `Valide : ${c.valide_par || 'responsable'}`,
    `Version : ${c.version || 0}`,
    '',
    String(c.corps || '').trim(),
  ].filter((x) => x !== null);
  return lignes.join('\n');
}

/** Le fichier exporté : un en-tête YAML simple, puis le corps. */
export function versFichier(c) {
  const y = (v) => JSON.stringify(v);
  return [
    '---',
    `cle: ${c.cle}`, `nom: ${y(c.nom || '')}`, `resume: ${y(c.resume || '')}`, `version: ${c.version || 0}`, `publiee_le: ${y(c.publiee_le || '')}`,
    `declencheurs: ${y(c.declencheurs || [])}`, `entrees: ${y(c.entrees || [])}`, `outils: ${y(c.outils || [])}`,
    `livrable: ${y(c.livrable || '')}`, `format: ${y(c.format || '')}`, `valide_par: ${y(c.valide_par || 'responsable')}`,
    '---', '', String(c.corps || '').trim(), '',
  ].join('\n');
}

/** Pure : lit un fichier exporté (en-tête YAML simple + corps) ; un fichier d'avant (sans en-tête) ne donne que le corps. */
export function depuisFichier(texte) {
  const m = String(texte || '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { corps: String(texte || '').trim() };
  const entete = {};
  for (const ligne of m[1].split('\n')) {
    const i = ligne.indexOf(':');
    if (i < 0) continue;
    const k = ligne.slice(0, i).trim(); const v = ligne.slice(i + 1).trim();
    try { entete[k] = v.startsWith('[') || v.startsWith('"') || v.startsWith('{') ? JSON.parse(v) : v; } catch { entete[k] = v; }
  }
  return { ...entete, version: Number(entete.version) || 0, corps: m[2].trim() };
}

/** Les neuf fiches entrent en base au premier passage (publiées, version 1) ; une compétence déjà là ne bouge pas. */
export function amorcer() {
  const existantes = new Set(Records.list(ENTITE).map((c) => c.cle));
  let n = 0;
  for (const [cle, d] of Object.entries(DEFAUTS)) {
    if (existantes.has(cle)) continue;
    let fichier = { corps: '' };
    try { fichier = depuisFichier(fs.readFileSync(new URL(`${cle}.md`, DOSSIER), 'utf8')); } catch { /* pas de fichier : la recette est à écrire */ }
    const entete = { ...d, ...(fichier.nom ? { nom: fichier.nom } : {}), ...(fichier.declencheurs ? { declencheurs: fichier.declencheurs } : {}), ...(fichier.outils ? { outils: fichier.outils } : {}), ...(fichier.entrees ? { entrees: fichier.entrees } : {}), ...(fichier.livrable ? { livrable: fichier.livrable } : {}) };
    const version = Math.max(1, fichier.version || 1);
    const c = { cle, ...entete, resume: fichier.resume || d.resume || '', corps: fichier.corps || '', version, etat: 'publiee', publiee_le: fichier.publiee_le || maintenant(), par: null, brouillon: null, versions: [] };
    c.versions = [{ version, publiee_le: c.publiee_le, par: null, ...instantane(c) }];
    Records.create(ENTITE, c);
    n += 1;
  }
  return n;
}

const instantane = (c) => ({ nom: c.nom, resume: c.resume, declencheurs: c.declencheurs, entrees: c.entrees, outils: c.outils, livrable: c.livrable, format: c.format, valide_par: c.valide_par, corps: c.corps });

export const lister = () => { amorcer(); return Records.list(ENTITE).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')); };
export const lire = (cle) => { amorcer(); return Records.list(ENTITE).find((c) => c.cle === norm(cle)) || null; };

/** La version publiée, telle que Haka et AK la lisent (le brouillon n'y est pas). */
export function publiee(cle) {
  const c = lire(cle);
  return c ? { ...c, brouillon: undefined } : null;
}

/** Les compétences qu'un déclencheur propose (les cartes), avec leurs pastilles. */
export const pourDeclencheur = (declencheur) => lister().filter((c) => (c.declencheurs || []).includes(declencheur)).map(({ cle, nom, resume, outils, livrable, format, version, declencheurs }) => ({ cle, nom, resume, outils, livrable, format, version, declencheurs }));

/** Jules enregistre un brouillon : rien ne s'applique avant la publication. */
export function enregistrerBrouillon(cle, patch, user) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  const base = { ...instantane(c), ...(c.brouillon || {}) };
  const b = {
    nom: String(patch.nom ?? base.nom).trim().slice(0, 80) || base.nom,
    resume: String(patch.resume ?? base.resume ?? '').trim().slice(0, 300),
    declencheurs: nettoyerListe(patch.declencheurs ?? base.declencheurs, DECLENCHEURS),
    entrees: nettoyerListe(patch.entrees ?? base.entrees).slice(0, 12),
    outils: nettoyerOutils(patch.outils ?? base.outils),
    livrable: String(patch.livrable ?? base.livrable ?? '').trim().slice(0, 300),
    format: String(patch.format ?? base.format ?? '').trim().slice(0, 40),
    valide_par: VALIDE_PAR.includes(patch.valide_par) ? patch.valide_par : (base.valide_par || 'responsable'),
    corps: String(patch.corps ?? base.corps ?? '').slice(0, 20000),
    modifie_le: maintenant(), par: norm(user?.email) || null,
  };
  Records.update(ENTITE, c.id, { brouillon: b });
  return { ok: true, competence: lire(cle) };
}

/** Jules publie le brouillon : nouvelle version, export vers le dépôt. */
export function publier(cle, user) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  if (!c.brouillon) return { ok: false, statut: 400, error: 'Rien à publier : le brouillon est vide.' };
  const version = (Number(c.version) || 0) + 1;
  const { modifie_le, par, ...champs } = c.brouillon;
  const publiee_le = maintenant();
  Records.update(ENTITE, c.id, { ...champs, version, publiee_le, par: norm(user?.email) || par || null, brouillon: null, versions: [...(c.versions || []), { version, publiee_le, par: norm(user?.email) || null, ...champs }].slice(-30) });
  const apres = lire(cle);
  const exporte = exporter(apres);
  return { ok: true, competence: apres, exporte };
}

/** Jules abandonne le brouillon. */
export function abandonnerBrouillon(cle) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  Records.update(ENTITE, c.id, { brouillon: null });
  return { ok: true, competence: lire(cle) };
}

/** Le fichier docs/ak/procedures/<cle>.md suit la version publiée (sauvegarde versionnée par git, quand le dépôt est là). */
export function exporter(c) {
  try {
    fs.mkdirSync(DOSSIER_EXPORT, { recursive: true });
    fs.writeFileSync(new URL(`${c.cle}.md`, DOSSIER_EXPORT), versFichier(c), 'utf8');
    return { ok: true, chemin: `docs/ak/procedures/${c.cle}.md` };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Ce qu'AK lit par lire_procedure : la version publiée, rendue ; null si la compétence n'existe pas en base. */
export function pourAK(nom) {
  const c = publiee(nom);
  return c ? rendre(c) : null;
}
