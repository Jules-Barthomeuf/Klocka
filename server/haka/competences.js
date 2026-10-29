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
import { createHash } from 'node:crypto';
import { Records, Meta } from '../db.js';
import { REGLES_PAR_DEFAUT, nettoyerRegles } from './regles-preanalyse.js';

const ENTITE = 'HakaCompetence';
const DOSSIER = new URL('../../docs/ak/procedures/', import.meta.url);
// Les tests exportent ailleurs : le dépôt ne bouge pas quand ils tournent.
const DOSSIER_EXPORT = process.env.HAKA_EXPORT_DIR ? pathToFileURL(process.env.HAKA_EXPORT_DIR.replace(/\/?$/, '/')) : DOSSIER;
const maintenant = () => new Date().toISOString();
const norm = (e) => String(e || '').trim().toLowerCase();

// Les déclencheurs de la spec du 17 oct. 2026 (mail_fiche_recue, fiche_deposee, documents_recus, planifie, demande_chat, bouton)
// s'ajoutent aux quatre d'origine, que les neuf fiches importées portent encore.
export const DECLENCHEURS = ['chat', 'dossier', 'mail', 'automatique', 'mail_fiche_recue', 'fiche_deposee', 'documents_recus', 'planifie', 'demande_chat', 'bouton'];
/** Ce que chaque point d'entrée de l'écran propose : un clic de carte ou de raccourci vaut `bouton`, une phrase vaut `demande_chat`. */
const ENTREES_ECRAN = { chat: ['chat', 'demande_chat', 'bouton'], dossier: ['dossier', 'bouton', 'fiche_deposee'] };
export const MODES = ['temps_reel', 'batch'];
export const DESTINATIONS = ['dossier', 'file', 'chat'];
export const LIVRABLES = ['grille_dossier', 'mail', 'page_plateforme', 'loi', 'dossier_bancaire', 'reponse_chat'];
export const VALIDE_PAR = ['responsable', 'jules', 'personne'];

/** Les outils qu'une compétence peut nommer : les 28 groupes d'AK v2 et les sources de marché. Le front y met icône et nom (src/lib/sources.js). */
export const OUTILS = [
  'documents', 'fiche', 'preanalyse', 'dossiers', 'projet', 'clients', 'layer', 'gmail', 'drive', 'agenda', 'monday', 'web',
  'dvf', 'equimmox', 'data_b', 'valeur_locative', 'vacance', 'annuaire', 'figaro', 'bodacc',
  'kzoning', 'kexpertise', 'kestimation', 'kprospective', 'kvacance', 'kfoncier', 'ktransactions',
  'simulateur', 'modele_klocka', 'presentation', 'loi', 'emailing', 'off_market', 'prospection',
  // Ajoutés avec la pré-analyse en compétence (17 oct. 2026) : le référentiel d'enseignes, les annonces, Maps, Pappers.
  'enseignes', 'annonces', 'google_maps', 'pappers',
];

// L'en-tête de départ des neuf fiches : ce que la recette lit et produit, d'après son texte.
const CORPS_PRE_ANALYSE = "1. **Lire la fiche.** Extraire, un lot par bien : adresse, prix FAI, honoraires, loyer annuel HT HC, surface, locataire et enseigne, activité, type de bail et échéance, occupé ou vacant. Chaque valeur avec sa citation exacte.\n2. **Compléter.** Pour toute valeur manquante, chercher avant de la déclarer manquante : annonces en ligne pour la même adresse, Google Maps (activité, enseigne), Pappers (locataire), Layer (ce que l'agent a déjà dit, dossiers passés à la même adresse). Indiquer la source de chaque valeur trouvée. Ce qui reste introuvable est « non renseigné ».\n3. **Critères éliminatoires** (appliqués par le code, un seul suffit) : rendement brut inférieur à `rendement_brut_min` ; prix supérieur à `prix_max` ; local vacant sans promesse de bail d'un locataire ; activité dans `activites_exclues`.\n4. **Points à vérifier** (le dossier passe, ces points sont signalés) : activité dans `activites_a_verifier` ; prix au-dessus du marché (DVF) de plus de `ecart_marche_max` ; loyer au-dessus du marché (Equimmox, valeur locative) de plus de `ecart_marche_max`, avec le rendement recalculé au loyer de marché ; vacance commerciale au-dessus de `vacance_max` ; enseigne absente du référentiel ; toute valeur « non renseignée ».\n5. **Verdict.**\n   - Écarté : avec son motif. Le dossier va dans « Écartés ». Aucun mail pour l'instant.\n   - À vérifier : points triés par impact, le premier en une phrase chiffrée (ex. « Loyer à +60 % du marché : à loyer de marché, le rendement tomberait à 4,9 % »).\n   - Conforme : aucun point bloquant ni à vérifier.\n6. **Ne jamais** : inventer une valeur ; écraser une valeur corrigée par un humain ; envoyer quoi que ce soit. Cette compétence ne produit aucun mail. La demande de documents et le refus seront deux compétences séparées, au ton défini dans Paramètres › Mails.";

const DEFAUTS = {
  'pre-analyse-fiche': {
    nom: "Pré-analyse d'une fiche",
    resume: "Lit une fiche commerciale de murs de commerce, la complète, applique les critères Klocka et rend un verdict. Utiliser quand une fiche arrive dans la boîte d'un analyste, est déposée, ou quand on demande de pré-analyser un bien.",
    declencheurs: ['mail_fiche_recue', 'fiche_deposee', 'demande_chat'],
    entrees: ['fiche', 'analyste_destinataire'],
    outils: [{ cle: 'fiche', obligatoire: true }, { cle: 'documents', obligatoire: true }, { cle: 'dossiers', obligatoire: true }, { cle: 'dvf' }, { cle: 'equimmox' }, { cle: 'valeur_locative' }, { cle: 'vacance' }, { cle: 'enseignes' }, { cle: 'annonces' }, { cle: 'google_maps' }, { cle: 'pappers' }, { cle: 'layer' }],
    regles: REGLES_PAR_DEFAUT,
    livrable: 'La grille du dossier remplie et le verdict (écarté, à vérifier, conforme), chaque valeur avec sa source', format: 'grille_dossier', destination: 'dossier',
    valide_par: 'responsable', mode_execution: 'temps_reel', dossiers_test: ['ADG Bordeaux', 'Lyon Paul Santy'],
    corps: CORPS_PRE_ANALYSE,
  },
  preanalyse: { nom: 'Pré-analyser une fiche', declencheurs: ['chat', 'mail', 'automatique'], entrees: ['La fiche commerciale (PDF, texte collé, capture)'], outils: [{ cle: 'fiche', obligatoire: true }, { cle: 'preanalyse', obligatoire: true }, { cle: 'dvf' }, { cle: 'equimmox' }, { cle: 'valeur_locative' }, { cle: 'simulateur' }], livrable: 'Le dossier à l\'étape Pré-analyse : verdict, grille, simulateur, mail à l\'agent', format: 'dossier', valide_par: 'responsable' },
  'data-room': { resume: "Analyse les documents d'une data room (bail, quittances, PV d'AG, règlement, diagnostics) et complète la page Analyse du dossier. À utiliser quand les documents d'un dossier sont reçus, ou sur demande.", nom: 'Analyser la data room', declencheurs: ['chat', 'dossier', 'automatique'], entrees: ['Les documents du dossier (bail, quittances, PV d\'AG, règlement, diagnostics)'], outils: [{ cle: 'documents', obligatoire: true }, { cle: 'dossiers', obligatoire: true }, { cle: 'dvf' }, { cle: 'equimmox' }, { cle: 'valeur_locative' }, { cle: 'vacance' }, { cle: 'annuaire' }, { cle: 'clients' }], livrable: 'La page du dossier à l\'étape Analyse, complétée : grilles, marché, simulateur, chaque chiffre avec sa source', format: 'dossier', valide_par: 'responsable' },
  'lecture-bail': { resume: "Lit un bail commercial et ses annexes, remplit la grille du bail et liste les points à trancher. À utiliser sur un bail ou un avenant reçu.", nom: 'Lire un bail', declencheurs: ['chat', 'dossier'], entrees: ['Le bail, ses avenants, les PV d\'AG, le règlement de copropriété'], outils: [{ cle: 'documents', obligatoire: true }], livrable: 'La grille du bail remplie, les points à trancher', format: 'grille', valide_par: 'responsable' },
  loi: { resume: "Rédige la lettre d'intention d'un acquéreur pour un bien, au modèle Klocka. À utiliser quand on demande une offre ou une LOI.", nom: 'Rédiger une LOI', declencheurs: ['chat', 'dossier'], entrees: ['L\'acquéreur, le bien ou son dossier, le vendeur, le prix, l\'apport'], outils: [{ cle: 'dossiers', obligatoire: true }, { cle: 'projet' }, { cle: 'clients' }, { cle: 'modele_klocka', obligatoire: true }], livrable: 'La lettre d\'intention, au modèle Klocka, dans Offres', format: 'loi', valide_par: 'responsable' },
  'presentation-bancaire': { resume: "Prépare la présentation bancaire d'un projet de la plateforme, chaque chiffre avec sa source. À utiliser quand un dossier bancaire est demandé.", nom: 'Préparer le dossier bancaire', declencheurs: ['chat', 'dossier'], entrees: ['Le projet de la plateforme (ses chiffres, son bail, son marché)'], outils: [{ cle: 'projet', obligatoire: true }, { cle: 'equimmox' }, { cle: 'dvf' }, { cle: 'figaro' }, { cle: 'modele_klocka', obligatoire: true }], livrable: 'La présentation bancaire, seize diapositives, chaque chiffre sourcé', format: 'presentation', valide_par: 'responsable' },
  'mails-agents': { resume: "Rédige un mail à un agent (demande de documents, relance, refus, suite), prêt à valider, depuis la boîte de l'analyste. À utiliser quand un mail à un agent est à préparer.", nom: 'Écrire à un agent', declencheurs: ['chat', 'dossier', 'automatique'], entrees: ['Le dossier et son agent ; l\'intention (demande de documents, relance, refus, suite)'], outils: [{ cle: 'dossiers', obligatoire: true }, { cle: 'gmail', obligatoire: true }, { cle: 'layer' }], livrable: 'Un mail prêt, dans À valider, qui part de la boîte de l\'analyste', format: 'mail', valide_par: 'responsable' },
  'prospection-appels': { resume: "Note un appel d'agent dicté ou collé : fiche de l'agent, ligne Sunday CRM, relance posée. À utiliser après un appel.", nom: 'Noter un appel', declencheurs: ['chat'], entrees: ['La note dictée ou collée, l\'agent, l\'agence'], outils: [{ cle: 'prospection', obligatoire: true }, { cle: 'monday' }, { cle: 'clients' }], livrable: 'La fiche de l\'agent et sa ligne Sunday CRM à jour, la relance posée', format: 'note', valide_par: 'responsable' },
  emailing: { resume: "Conçoit une séquence d'emails (newsletter, relance de webinaire) pour une liste de contacts. À utiliser pour préparer une campagne.", nom: 'Concevoir une séquence d\'emails', declencheurs: ['chat'], entrees: ['L\'objectif, le webinaire, l\'appel à l\'action, la liste de contacts'], outils: [{ cle: 'emailing', obligatoire: true }], livrable: 'Les emails en brouillon, dans Emailing', format: 'emails', valide_par: 'jules' },
  'off-market': { resume: "Prospecte l'off-market : cibles, sociétés, courriers relus avant d'être postés. À utiliser sur une ville ou une cible.", nom: 'Prospecter l\'off-market', declencheurs: ['chat'], entrees: ['Une ville, une cible, une société'], outils: [{ cle: 'off_market', obligatoire: true }, { cle: 'annuaire' }, { cle: 'bodacc' }], livrable: 'Les cibles, les sociétés, les courriers relus avant d\'être postés', format: 'off_market', valide_par: 'responsable' },
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
    Object.keys(c.regles || {}).length ? `Règles (appliquées par le code) : ${Object.entries(c.regles).map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(', ') : v}`).join(' ; ')}` : null,
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
    `slug: ${c.cle}`, `cle: ${c.cle}`, `nom: ${y(c.nom || '')}`, `resume: ${y(c.resume || '')}`, `version: ${c.version || 0}`, `publiee_le: ${y(c.publiee_le || '')}`,
    `declencheurs: ${y(c.declencheurs || [])}`, `entrees: ${y(c.entrees || [])}`, `outils: ${y(c.outils || [])}`,
    `livrable: ${y(c.livrable || '')}`, `format: ${y(c.format || '')}`, `destination: ${y(c.destination || 'dossier')}`, `valide_par: ${y(c.valide_par || 'responsable')}`,
    `mode_execution: ${y(c.mode_execution || 'temps_reel')}`, `regles: ${y(c.regles || {})}`, `dossiers_test: ${y(c.dossiers_test || [])}`,
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

/** Une fiche d'avant qu'une compétence de la spec remplace : elle est désactivée une fois (la nouvelle prend les cartes et les raccourcis). */
const REMPLACEES = { preanalyse: 'pre-analyse-fiche' };

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
    const c = { cle, ...entete, resume: fichier.resume || d.resume || '', corps: fichier.corps || d.corps || '', version, etat: 'publiee', publiee_le: fichier.publiee_le || maintenant(), par: null, brouillon: null, versions: [] };
    c.versions = [{ version, publiee_le: c.publiee_le, par: null, ...instantane(c) }];
    Records.create(ENTITE, c);
    n += 1;
  }
  // Une description vide (les neuf fiches importées n'en avaient pas) reprend celle du défaut : la spec en fait un champ obligatoire.
  for (const x of Records.list(ENTITE)) {
    const defaut = DEFAUTS[x.cle]?.resume;
    if (defaut && !String(x.resume || '').trim()) Records.update(ENTITE, x.id, { resume: defaut });
  }
  // La compétence remplacée sort des cartes, une seule fois : Jules peut la réactiver ensuite.
  if (!Meta.get('haka.competences.remplacees.v1')) {
    for (const [ancienne, nouvelle] of Object.entries(REMPLACEES)) {
      const a = Records.list(ENTITE).find((x) => x.cle === ancienne);
      if (a && Records.list(ENTITE).some((x) => x.cle === nouvelle)) Records.update(ENTITE, a.id, { desactivee: true, remplacee_par: nouvelle });
    }
    Meta.set('haka.competences.remplacees.v1', maintenant());
  }
  return n;
}

const instantane = (c) => ({
  nom: c.nom, resume: c.resume, declencheurs: c.declencheurs, entrees: c.entrees, outils: c.outils, regles: c.regles || {}, livrable: c.livrable, format: c.format,
  destination: c.destination || 'dossier', valide_par: c.valide_par, mode_execution: c.mode_execution || 'temps_reel', dossiers_test: c.dossiers_test || [],
  annexes: c.annexes || [], corps: c.corps,
});

export const lister = () => { amorcer(); return Records.list(ENTITE).sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr')); };
export const lire = (cle) => { amorcer(); return Records.list(ENTITE).find((c) => c.cle === norm(cle)) || null; };

/** La version publiée, telle que Haka et AK la lisent (le brouillon n'y est pas). */
export function publiee(cle) {
  const c = lire(cle);
  // Une compétence jamais publiée n'existe pas pour Haka ni pour AK.
  return c && Number(c.version) > 0 ? { ...c, brouillon: undefined } : null;
}

/** Les compétences qu'un déclencheur propose (les cartes), avec leurs pastilles. */
export const pourDeclencheur = (declencheur) => {
  const voulus = ENTREES_ECRAN[declencheur] || [declencheur];
  return lister()
    .filter((c) => !c.desactivee && Number(c.version) > 0 && (c.declencheurs || []).some((d) => voulus.includes(d)))
    .map(({ cle, nom, resume, outils, livrable, format, version, declencheurs }) => ({ cle, nom, resume, outils, livrable, format, version, declencheurs }));
};

/** Pure : l'empreinte du contenu d'un brouillon. Un test ne vaut que pour l'empreinte sur laquelle il a tourné. */
export const empreinte = (b) => createHash('sha1').update(JSON.stringify(instantane(b || {}))).digest('hex').slice(0, 16);

/** Pure : les erreurs de format d'un en-tête (elles bloquent la publication, pas l'enregistrement). */
export function validerFormat(c) {
  const e = [];
  const vide = (x) => !String(x || '').trim();
  if (vide(c.nom)) e.push('Le nom est obligatoire.');
  if (vide(c.resume)) e.push('La description est obligatoire : elle dit quand utiliser la compétence.');
  if (!(c.declencheurs || []).length) e.push('Au moins un déclencheur.');
  if (!(c.entrees || []).length) e.push('Au moins une entrée.');
  const outils = c.outils || [];
  if (!outils.length) e.push('Au moins un outil ou une source.');
  if (outils.some((o) => !OUTILS.includes(o.cle))) e.push('Un outil ou une source ne figure pas au registre.');
  if (outils.length && !outils.some((o) => o.obligatoire)) e.push('Au moins une source obligatoire.');
  if (vide(c.livrable)) e.push('Le livrable est obligatoire.');
  if (!VALIDE_PAR.includes(c.valide_par)) e.push('Qui valide : une règle valide est obligatoire.');
  if (!MODES.includes(c.mode_execution)) e.push("Le mode d'exécution est obligatoire (temps réel ou batch).");
  if (!DESTINATIONS.includes(c.destination)) e.push('La destination du livrable est obligatoire (dossier, file ou chat).');
  if ((c.dossiers_test || []).length < 2) e.push('Au moins deux dossiers de test.');
  for (const [nom, v] of Object.entries(c.regles || {})) {
    if (!(typeof v === 'number' || typeof v === 'boolean' || Array.isArray(v) || (typeof v === 'string' && v.trim()))) e.push(`La règle « ${nom} » n'a pas de valeur valable.`);
  }
  return e;
}

/** Jules enregistre un brouillon : rien ne s'applique avant la publication. Un seul brouillon à la fois par compétence. */
export function enregistrerBrouillon(cle, patch, user) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  const base = { ...instantane(c), ...(c.brouillon || {}) };
  const annexes = Array.isArray(patch.annexes) ? patch.annexes : base.annexes;
  const b = {
    nom: String(patch.nom ?? base.nom).trim().slice(0, 80) || base.nom,
    resume: String(patch.resume ?? base.resume ?? '').trim().slice(0, 400),
    declencheurs: nettoyerListe(patch.declencheurs ?? base.declencheurs, DECLENCHEURS),
    entrees: nettoyerListe(patch.entrees ?? base.entrees).slice(0, 12),
    outils: nettoyerOutils(patch.outils ?? base.outils),
    regles: nettoyerRegles(patch.regles ?? base.regles),
    livrable: String(patch.livrable ?? base.livrable ?? '').trim().slice(0, 300),
    format: String(patch.format ?? base.format ?? '').trim().slice(0, 40),
    destination: DESTINATIONS.includes(patch.destination) ? patch.destination : (base.destination || 'dossier'),
    valide_par: VALIDE_PAR.includes(patch.valide_par) ? patch.valide_par : (base.valide_par || 'responsable'),
    mode_execution: MODES.includes(patch.mode_execution) ? patch.mode_execution : (base.mode_execution || 'temps_reel'),
    dossiers_test: nettoyerListe(patch.dossiers_test ?? base.dossiers_test).slice(0, 12),
    annexes: (annexes || []).filter((a) => a && String(a.nom || '').trim()).slice(0, 10).map((a) => ({ nom: String(a.nom).trim().slice(0, 60), texte: String(a.texte || '').slice(0, 20000) })),
    corps: String(patch.corps ?? base.corps ?? '').slice(0, 20000),
    modifie_le: maintenant(), par: norm(user?.email) || null,
  };
  // Un test ne vaut que pour le contenu sur lequel il a tourné : modifier le brouillon l'invalide.
  b.tests_pour = c.brouillon?.tests_pour && c.brouillon.tests_pour === empreinte(b) ? c.brouillon.tests_pour : null;
  Records.update(ENTITE, c.id, { brouillon: b });
  return { ok: true, competence: lire(cle), erreurs_format: validerFormat(b) };
}

/** Nouvelle compétence (Jules) : un brouillon, sans version publiée. Rien ne l'applique tant qu'elle n'est pas publiée. */
export function creer({ nom, slug = null, resume = '' }, user) {
  const n = String(nom || '').trim().slice(0, 80);
  if (!n) return { ok: false, statut: 400, error: 'Le nom est obligatoire.' };
  const cle = (slug ? String(slug) : n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  if (!cle) return { ok: false, statut: 400, error: 'Le nom ne donne pas d\'identifiant valable.' };
  if (lire(cle)) return { ok: false, statut: 409, error: `Une compétence « ${cle} » existe déjà.` };
  Records.create(ENTITE, { cle, nom: n, resume: String(resume || '').trim().slice(0, 400), declencheurs: [], entrees: [], outils: [], regles: {}, livrable: '', format: '', destination: 'dossier', valide_par: 'responsable', mode_execution: 'temps_reel', dossiers_test: [], annexes: [], corps: '', version: 0, etat: 'brouillon', publiee_le: null, par: norm(user?.email) || null, brouillon: null, versions: [], desactivee: false });
  return enregistrerBrouillon(cle, { nom: n, resume }, user);
}

/**
 * « Tester » : le brouillon sur chaque dossier de test, en lecture seule, comparé à la version publiée.
 * Garde les résultats (haka_tests) et marque le brouillon comme testé quand TOUS les dossiers ont tourné.
 */
export async function tester(cle) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  if (!c.brouillon) return { ok: false, statut: 400, error: "Pas de brouillon à tester : modifiez d'abord la compétence." };
  const { essayer } = await import('./banc.js');
  const { noterTest } = await import('./executions.js');
  const b = c.brouillon;
  const publie = Number(c.version) > 0 ? instantane(c) : null;
  const resultats = (b.dossiers_test || []).map((ref) => essayer({ slug: c.cle, brouillon: b, publiee: publie, ref }));
  for (const r of resultats) noterTest({ competence: c.cle, dossier: r.dossier, brouillon_le: b.modifie_le, comparaison: r });
  const tous = resultats.length >= 2 && resultats.every((r) => !r.erreur);
  Records.update(ENTITE, c.id, { brouillon: { ...b, tests_pour: tous ? empreinte(b) : null, tests_le: maintenant() } });
  return { ok: true, resultats, tous_ont_tourne: tous, competence: lire(cle) };
}

/** Pure : ce qui empêche de publier ce brouillon, dans l'ordre. */
export function obstaclesPublication(c) {
  const b = c?.brouillon;
  if (!b) return ['Rien à publier : le brouillon est vide.'];
  const o = [];
  const format = validerFormat(b);
  if (format.length) o.push(...format);
  if (!b.tests_pour || b.tests_pour !== empreinte(b)) o.push('Les dossiers de test n\'ont pas tourné sur ce brouillon : cliquez sur Tester.');
  return o;
}

/** Jules publie le brouillon : nouvelle version (la précédente est archivée), note de version, export vers le dépôt. */
export function publier(cle, user, { note = '' } = {}) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  const obstacles = obstaclesPublication(c);
  if (obstacles.length) return { ok: false, statut: 400, error: obstacles[0], obstacles };
  const n = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!n) return { ok: false, statut: 400, error: 'Une note de version, d\'une ligne, est obligatoire.' };
  const version = (Number(c.version) || 0) + 1;
  const { modifie_le, par, tests_pour, tests_le, ...champs } = c.brouillon;
  return poserVersion(c, champs, version, user, n, par);
}

function poserVersion(c, champs, version, user, note, par = null) {
  const publiee_le = maintenant();
  const auteur = norm(user?.email) || par || null;
  Records.update(ENTITE, c.id, { ...champs, version, etat: 'publiee', publiee_le, par: auteur, brouillon: null, versions: [...(c.versions || []), { version, publiee_le, par: auteur, note, ...champs }].slice(-40) });
  const apres = lire(c.cle);
  return { ok: true, competence: apres, exporte: exporter(apres) };
}

/** Retour arrière : une version archivée est copiée en NOUVELLE version publiée. L'historique n'est jamais réécrit. */
export function republier(cle, version, user) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  const v = (c.versions || []).find((x) => x.version === Number(version));
  if (!v) return { ok: false, statut: 404, error: `La version ${version} n'existe pas.` };
  if (v.version === c.version) return { ok: false, statut: 400, error: 'Cette version est déjà la version publiée.' };
  const { version: _v, publiee_le: _p, par: _a, note: _n, ...champs } = v;
  return poserVersion(c, champs, (Number(c.version) || 0) + 1, user, `Retour à la version ${v.version}`);
}

/** Désactiver : la compétence disparaît des cartes, des raccourcis et des automatismes. Ses exécutions passées restent consultables. */
export function basculerActivation(cle, active) {
  const c = lire(cle);
  if (!c) return { ok: false, statut: 404, error: 'Compétence introuvable.' };
  if (active && !(Number(c.version) > 0)) return { ok: false, statut: 400, error: 'Une compétence jamais publiée ne peut pas être activée.' };
  Records.update(ENTITE, c.id, { desactivee: !active });
  return { ok: true, competence: lire(cle) };
}

/** Pure : un diff ligne à ligne (plus longue sous-suite commune) entre deux textes. */
export function diffTexte(avant = '', apres = '') {
  const a = String(avant).split('\n'); const b = String(apres).split('\n');
  const n = a.length; const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ genre: '=', texte: a[i] }); i += 1; j += 1; }
    else if (t[i + 1][j] >= t[i][j + 1]) { out.push({ genre: '-', texte: a[i] }); i += 1; }
    else { out.push({ genre: '+', texte: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ genre: '-', texte: a[i] }); i += 1; }
  while (j < m) { out.push({ genre: '+', texte: b[j] }); j += 1; }
  return out;
}

/** Le diff de l'en-tête et du corps entre deux versions (ou une version et le brouillon). */
export function diffVersions(cle, de, vers) {
  const c = lire(cle);
  if (!c) return null;
  const prendre = (x) => (x === 'brouillon' ? (c.brouillon ? { ...instantane(c), ...c.brouillon } : null) : (c.versions || []).find((v) => v.version === Number(x)) || null);
  const a = prendre(de); const b = prendre(vers);
  if (!a || !b) return null;
  const champs = ['nom', 'resume', 'declencheurs', 'entrees', 'outils', 'regles', 'livrable', 'format', 'destination', 'valide_par', 'mode_execution', 'dossiers_test'];
  const entete = champs.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => ({ champ: k, avant: a[k] ?? null, apres: b[k] ?? null }));
  return { entete, corps: diffTexte(a.corps, b.corps) };
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
