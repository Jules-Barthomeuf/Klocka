// Ce que coûte chaque geste.
//
// Le journal disait déjà combien de temps une demande avait pris ; il ne disait
// pas ce qu'elle avait consommé. Or l'extraction envoie des PDF entiers —
// parfois cent pages — et une facture ne se pilote pas à l'aveugle.
//
// La consommation est captée à la source, dans llm.js, puis attribuée à
// l'opération courante grâce à un contexte asynchrone : une demande à
// l'assistant peut déclencher six appels au modèle, ils comptent tous pour elle.

import { AsyncLocalStorage } from 'node:async_hooks';
import { Records } from './db.js';

const contexte = new AsyncLocalStorage();

// Tarifs publics, en dollars par million de jetons. Une lecture de cache coûte
// un dixième d'une entrée neuve, une écriture un quart de plus.
const TARIFS = {
  'claude-opus-5': { entree: 5, sortie: 25 },
  'claude-opus-4-8': { entree: 5, sortie: 25 },
  'claude-sonnet-5': { entree: 2, sortie: 10 },
  'claude-haiku-4-5': { entree: 1, sortie: 5 },
  'claude-fable-5': { entree: 10, sortie: 50 },
};

const PART_CACHE_LECTURE = 0.1;
const PART_CACHE_ECRITURE = 1.25;

// Le journal compte en dollars, les écrans affichent des euros. Un seul taux,
// ici, pour que la page des coûts et l'état de la plateforme disent le même
// prix.
export const EUR_PAR_USD = 0.92;
export const euros = (n, precis = false) => {
  if (n == null) return '—';
  const e = n * EUR_PAR_USD;
  if (e === 0) return '0 €';
  if (e < 0.01 || precis) return `${e.toFixed(e < 0.01 ? 4 : 3).replace('.', ',')} €`;
  return `${e.toFixed(2).replace('.', ',')} €`;
};

/** Coût en dollars d'un appel, ou null si le modèle n'a pas de tarif connu. */
export function coutDe(modele, u) {
  const t = TARIFS[modele];
  if (!t || !u) return null;
  const entree = (u.entree || 0) * t.entree;
  const lecture = (u.cache_lecture || 0) * t.entree * PART_CACHE_LECTURE;
  const ecriture = (u.cache_ecriture || 0) * t.entree * PART_CACHE_ECRITURE;
  const sortie = (u.sortie || 0) * t.sortie;
  return (entree + lecture + ecriture + sortie) / 1_000_000;
}

/**
 * Enregistre la consommation d'un appel. Appelé depuis llm.js.
 * Hors opération identifiée, la ligne est écrite telle quelle : mieux vaut une
 * consommation orpheline qu'une consommation invisible.
 */
export function enregistrerUsage(modele, usage) {
  if (!usage) return;
  const cout = coutDe(modele, usage);
  const courant = contexte.getStore();
  if (courant) {
    courant.appels += 1;
    courant.entree += usage.entree || 0;
    courant.sortie += usage.sortie || 0;
    courant.cache_lecture += usage.cache_lecture || 0;
    courant.cache_ecriture += usage.cache_ecriture || 0;
    courant.cout += cout || 0;
    courant.modele = modele;
    return;
  }
  ecrire({ operation: 'hors contexte', modele, appels: 1, ...usage, cout: cout || 0, par: null, duree_ms: null });
}

/**
 * Exécute une opération en comptant ce qu'elle consomme.
 * @param {{operation: string, par?: string, sur?: string}} quoi
 */
export async function mesurer(quoi, fn) {
  // Sans personne nommée, la mesure hérite de celle de la requête qui l'a lancée.
  const parent = contexte.getStore();
  const par = quoi.par || parent?.par || null;
  const compteur = { ...nouveauCompteur(), par };
  const debut = Date.now();
  const resultat = await contexte.run(compteur, fn);
  if (compteur.appels) ecrire(ligneDe({ ...quoi, par }, compteur, Date.now() - debut));
  return { resultat, consommation: compteur };
}

const nouveauCompteur = () => ({ appels: 0, entree: 0, sortie: 0, cache_lecture: 0, cache_ecriture: 0, cout: 0, modele: null });

const ligneDe = (quoi, c, duree_ms) => ({
  operation: quoi.operation,
  par: quoi.par || null,
  sur: quoi.sur || null,
  groupe: quoi.groupe || null,
  libelle: quoi.libelle || null,
  modele: c.modele,
  appels: c.appels,
  entree: c.entree,
  sortie: c.sortie,
  cache_lecture: c.cache_lecture,
  cache_ecriture: c.cache_ecriture,
  cout: c.cout,
  duree_ms,
});

// Ce qu'une route consomme sans être mesurée explicitement est quand même
// attribué : à la personne connectée, à la route, avec la durée de la réponse.
// Une opération mesurée à l'intérieur écrit sa propre ligne, et la route n'en
// écrit pas une seconde : le compteur le plus proche gagne.
export function mesurerRequetes(lireUser) {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const compteur = nouveauCompteur();
    // La personne est connue dès l'entrée : tout ce que la requête déclenche,
    // même en tâche de fond après la réponse, lui est attribué.
    try { compteur.par = lireUser(req)?.email || null; } catch { compteur.par = null; }
    const debut = Date.now();
    res.on('finish', () => {
      if (!compteur.appels) return;
      const par = compteur.par;
      const route = req.route?.path || req.path;
      ecrire(ligneDe({ operation: libelleRoute(req.method, route), par, sur: req.params?.dealId || req.params?.id || null }, compteur, Date.now() - debut));
    });
    contexte.run(compteur, next);
  };
}

const LIBELLES_ROUTE = [
  // Le chemin d'une route Express garde ses paramètres (`/functions/:name`) :
  // sans les deux-points, la fonction générique restait « POST /api/... » et
  // tombait dans les opérations non rangées.
  [/\/functions\/:?(\w+)/, (m) => `fonction ${m[1]}`],
  [/\/marche\/question/, () => 'question de marché'],
  [/\/marche/, () => 'marché'],
  [/\/alx\/villes\/[^/]+\/commande/, () => 'commande ALX'],
  [/\/alx\/cibles\/[^/]+\/devanture/, () => 'devanture'],
  [/\/alx\/cibles\/[^/]+\/message/, () => 'message ALX'],
  [/\/alx/, () => 'ALX'],
  [/\/integrations\/invoke-llm/, () => 'modèle (direct)'],
  [/\/preanalyse\/dossiers\/[^/]+\/matrice/, () => 'matrice'],
  [/\/preanalyse\/dossiers\/[^/]+\/(extraction|extraire)/, () => 'extraction'],
  [/\/preanalyse\/dossiers\/[^/]+\/(conversation|question|converser)/, () => 'chat du dossier'],
  [/\/preanalyse\/dossiers\/[^/]+\/video/, () => 'vidéo'],
  [/\/preanalyse\/dossiers\/[^/]+\/presentation/, () => 'présentation'],
  [/\/preanalyse\/dossiers\/[^/]+\/mails?/, () => 'mail du dossier'],
  [/\/preanalyse\/dossiers\/[^/]+\/(redaction|redact|fiche)/, () => 'rédaction'],
  [/\/preanalyse/, () => 'pré-analyse'],
  [/\/assistant\/boite/, () => 'boîte'],
  [/\/assistant/, () => 'assistant'],
  [/\/mails/, () => 'mails'],
  [/\/monday/, () => 'monday'],
];
function libelleRoute(methode, route) {
  for (const [motif, l] of LIBELLES_ROUTE) { const m = route.match(motif); if (m) return l(m); }
  return `${methode} ${route}`;
}

// Au-delà, l'historique pèse sans rien apprendre de plus.
const PLAFOND = 10000;

function ecrire(ligne) {
  try {
    Records.create('CoutIA', { ...ligne, le: new Date().toISOString() });
    const tout = Records.list('CoutIA');
    if (tout.length > PLAFOND) {
      const trop = tout
        .sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')))
        .slice(0, tout.length - PLAFOND);
      for (const l of trop) Records.delete('CoutIA', l.id);
    }
  } catch (e) {
    console.warn('[couts] ligne non écrite :', e?.message || e);
  }
}

/**
 * Synthèse des coûts sur une fenêtre : par opération, par personne, par jour,
 * et le journal ligne à ligne, du plus récent au plus ancien.
 */
export function syntheseCouts(jours = 30, { limite = 100, par = null } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const lignes = Records.list('CoutIA').filter((l) => (l.le || '') >= depuis);

  const cumuler = (map, cle, l) => {
    const e = map.get(cle) || { cle, requetes: 0, appels: 0, entree: 0, sortie: 0, cout: 0, duree_ms: 0 };
    e.requetes += 1;
    e.appels += l.appels || 0;
    e.entree += l.entree || 0;
    e.sortie += l.sortie || 0;
    e.cout += l.cout || 0;
    e.duree_ms += l.duree_ms || 0;
    map.set(cle, e);
  };
  const gestes = regrouper(lignes);
  const groupes = par ? gestes.filter((g) => (g.par || 'tâche de fond') === par) : gestes;
  const journal = groupes.slice(0, limite);
  // Par personne, on compte des gestes, pas des appels : une analyse = une requête.
  const gestesPar = new Map();
  for (const g of gestes) gestesPar.set(g.par || 'tâche de fond', (gestesPar.get(g.par || 'tâche de fond') || 0) + 1);

  const parOperation = new Map();
  const parPersonne = new Map();
  const parJour = new Map();
  for (const l of lignes) {
    cumuler(parOperation, l.operation || 'inconnue', l);
    cumuler(parPersonne, l.par || 'tâche de fond', l);
    cumuler(parJour, (l.le || '').slice(0, 10), l);
  }

  for (const [cle, e] of parPersonne) if (gestesPar.has(cle)) e.requetes = gestesPar.get(cle);
  const tri = (m) => [...m.values()].sort((a, b) => b.cout - a.cout);
  return {
    total: {
      appels: lignes.reduce((n, l) => n + (l.appels || 0), 0),
      entree: lignes.reduce((n, l) => n + (l.entree || 0), 0),
      sortie: lignes.reduce((n, l) => n + (l.sortie || 0), 0),
      cout: lignes.reduce((n, l) => n + (l.cout || 0), 0),
    },
    operations: tri(parOperation),
    personnes: tri(parPersonne),
    jours: [...parJour.values()].sort((a, b) => a.cle.localeCompare(b.cle)),
    journal,
    journal_total: groupes.length,
  };
}

// Une analyse lancée d'un clic, c'est un geste : vingt lectures de documents
// étalées sur un quart d'heure font une ligne, qu'on ouvre pour le détail.
// Les lignes portent un groupe explicite quand l'opération le sait ; sinon,
// la même opération par la même personne, sans trou de plus de dix minutes,
// forme un groupe.
const TROU_MAX_MS = 10 * 60000;
function regrouper(lignes) {
  const chrono = [...lignes].sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')));
  const ouverts = new Map(); // clé → groupe en cours
  const tous = [];
  for (const l of chrono) {
    const t = Date.parse(l.le || '') || 0;
    const debutLigne = t - (l.duree_ms || 0);
    const cle = l.groupe || `${l.operation || 'inconnue'}|${l.par || ''}`;
    let g = ouverts.get(cle);
    if (g && !l.groupe && debutLigne - g.fin_ms > TROU_MAX_MS) g = null;
    if (!g) {
      g = { id: l.id, groupe: l.groupe || null, operation: l.operation || 'inconnue', par: l.par || null, modele: l.modele || null,
        debut_ms: debutLigne, fin_ms: t, appels: 0, entree: 0, sortie: 0, cache_lecture: 0, cout: 0, lignes: [], sur: new Set() };
      ouverts.set(cle, g); tous.push(g);
    }
    g.debut_ms = Math.min(g.debut_ms, debutLigne);
    g.fin_ms = Math.max(g.fin_ms, t);
    g.appels += l.appels || 0; g.entree += l.entree || 0; g.sortie += l.sortie || 0; g.cache_lecture += l.cache_lecture || 0; g.cout += l.cout || 0;
    if (l.modele) g.modele = l.modele;
    if (l.sur) g.sur.add(l.sur);
    g.lignes.push({ id: l.id, le: l.le, libelle: l.libelle || null, sur: l.sur || null, modele: l.modele || null, appels: l.appels || 0,
      entree: l.entree || 0, sortie: l.sortie || 0, cout: l.cout || 0, duree_ms: l.duree_ms ?? null });
  }
  return tous
    .sort((a, b) => b.fin_ms - a.fin_ms)
    .map((g) => ({
      id: g.id, groupe: g.groupe, operation: g.operation, par: g.par, modele: g.modele,
      debut: new Date(g.debut_ms).toISOString(), fin: new Date(g.fin_ms).toISOString(),
      // La durée d'un geste isolé est celle de sa requête ; celle d'une série va du premier au dernier appel.
      duree_ms: g.lignes.length === 1 ? g.lignes[0].duree_ms : g.fin_ms - g.debut_ms,
      appels: g.appels, entree: g.entree, sortie: g.sortie, cache_lecture: g.cache_lecture, cout: g.cout,
      sur: [...g.sur], etapes: g.lignes.length, lignes: g.lignes.sort((a, b) => String(a.le).localeCompare(String(b.le))),
    }));
}

// ---------------------------------------------------------------------------
// Ce que coûte un geste, et non une opération technique.
//
// Le journal parle en noms de code — « matrice », « grille Bail », « hors
// contexte ». Personne ne travaille en ces termes : on lit une pièce, on
// rédige un mail, on pose une question. Cette vue traduit, et surtout ramène
// chaque coût à SON unité. « Matrice : 25 € » ne dit rien ; « lire une pièce :
// 0,35 € » dit tout, parce qu'on sait combien de pièces on dépose par semaine.
// ---------------------------------------------------------------------------

// `parAppel` : le coût se ramène à un appel au modèle (une pièce lue, un mail
// jugé). Sinon il se ramène au geste entier, quel que soit le nombre d'appels
// qu'il a fallu.
const ACTIONS = [
  { cle: 'lecture_piece', libelle: 'Lire une pièce du dossier', unite: 'par document', parAppel: true, operations: ['matrice', 'lecture des pièces'], ou: "Étape Analyse, à l'arrivée d'une pièce ou sur « Relancer l'analyse »" },
  { cle: 'extraction', libelle: 'Extraire un document déposé', unite: 'par document', parAppel: true, operations: ['extraction'], ou: 'Au dépôt dans l’espace du dossier' },
  { cle: 'preanalyse', libelle: 'Analyser une fiche commerciale', unite: 'par fiche', parAppel: false, operations: ['pré-analyse'], ou: 'Étape Pré-analyse, ou fiche collée dans un chat' },
  { cle: 'grille', libelle: 'Mettre en forme une grille', unite: 'par grille', parAppel: false, prefixe: 'grille ', ou: 'Onglets Bail, Quittances, Copropriété, Diagnostics' },
  { cle: 'question', libelle: 'Poser une question sur les pièces', unite: 'par question', parAppel: false, operations: ['chat du dossier'], ou: 'Chat du dossier, étape Analyse' },
  { cle: 'assistant', libelle: "Demander quelque chose à l'assistant", unite: 'par demande', parAppel: false, operations: ['assistant'], ou: 'Bulle flottante et page Note' },
  { cle: 'mail', libelle: 'Rédiger un mail', unite: 'par mail', parAppel: false, operations: ['mail du dossier', 'mails', 'rédaction'], ou: 'Étape Mail, décision Oui/Non, relance' },
  { cle: 'boite', libelle: 'Trier ce qu’on colle dans la boîte', unite: 'par dépôt', parAppel: false, operations: ['boîte', 'boîte : tri'], ou: 'Chat du tableau de bord' },
  { cle: 'note_appel', libelle: 'Transformer une note d’appel en fiche', unite: 'par note', parAppel: false, operations: ["note d'appel"], ou: 'Chat du tableau de bord, dictée' },
  { cle: 'client', libelle: 'Créer un client depuis un appel', unite: 'par compte rendu', parAppel: false, operations: ['découverte client'], ou: 'Chat du tableau de bord' },
  { cle: 'veille', libelle: 'Juger un mail entrant', unite: 'par mail douteux', parAppel: true, operations: ['veille des boîtes', 'veille de la boîte', 'releve'], ou: 'Veille automatique des boîtes', fond: true },
  { cle: 'engagement', libelle: 'Relever une promesse dans un mail', unite: 'par mail', parAppel: false, operations: ['engagements'], ou: 'Veille automatique', fond: true },
  { cle: 'annonce', libelle: 'Retrouver l’annonce en ligne', unite: 'par bien', parAppel: false, operations: ['annonce'], ou: 'À l’analyse, en arrière-plan', fond: true },
  { cle: 'marche', libelle: 'Faire le point de marché', unite: 'par ville', parAppel: false, operations: ['contexte marché', 'marché'], ou: 'À l’analyse, en arrière-plan', fond: true },
  { cle: 'question_marche', libelle: 'Poser une question sur le marché', unite: 'par question', parAppel: false, operations: ['question de marché'], ou: 'Chat de l’onglet Marché' },
  { cle: 'alx', libelle: 'Prospecter avec ALX', unite: 'par commande', parAppel: false, operations: ['commande ALX', 'ALX'], ou: 'Chat d’une ville, onglets Rues et Commerces' },
  { cle: 'devanture', libelle: 'Lire une devanture', unite: 'par commerce', parAppel: false, operations: ['devanture'], ou: 'Fiche d’un commerce, photo Street View' },
  { cle: 'message_alx', libelle: 'Écrire au propriétaire', unite: 'par message', parAppel: false, operations: ['message ALX'], ou: 'Fiche d’un commerce, onglet Messages' },
  { cle: 'rappel', libelle: 'Préparer un rappel', unite: 'par rappel', parAppel: false, operations: ['rappel'], ou: 'Relances automatiques', fond: true },
  { cle: 'fonction', libelle: 'Exécuter une fonction', unite: 'par appel', parAppel: false, prefixe: 'fonction ', ou: 'Écrans qui appellent une fonction serveur' },
  { cle: 'presentation', libelle: 'Générer une présentation', unite: 'par dossier', parAppel: false, operations: ['présentation', 'vidéo'], ou: 'Étape Présentation' },
  { cle: 'avis', libelle: 'Écrire un prompt de correction', unite: 'par pouce', parAppel: false, operations: ['avis sur une réponse'], ou: 'Sous une réponse de l’IA' },
  { cle: 'direct', libelle: 'Appel direct au modèle', unite: 'par appel', parAppel: false, operations: ['modèle (direct)'], ou: 'Écrans qui appellent le modèle sans passer par un geste nommé' },
  { cle: 'non_attribue', libelle: 'Non attribué', unite: 'par appel', parAppel: false, operations: ['hors contexte', 'inconnue'], ou: 'Travail de fond sans contexte de mesure', fond: true },
];

/**
 * Les leviers sur la dépense, et où chacun en est.
 *
 * Ils vivaient écrits en dur dans la page ; l'état de la plateforme
 * (server/etat-plateforme.js) en a besoin aussi, et deux listes qui divergent
 * valent moins qu'une. `effet` peut porter deux jalons résolus sur les
 * chiffres de la période : {{mediane:cle}} et {{part_cache}}.
 *
 * `etat` : 'pose' (c'est fait), 'regler' (un réglage attend), 'decider' (une
 * décision attend, elle coûte autre chose que de l'argent).
 */
export const LEVIERS = [
  {
    cle: 'cache',
    etat: 'pose',
    titre: 'Le cache des pièces',
    effet: 'une relecture à un dixième du prix',
    ou: 'Posé le 9 septembre · une heure de rétention',
    texte: 'Une pièce déjà envoyée au modèle revient dix fois moins cher pendant une heure. Vous en êtes à {{part_cache}} de jetons servis par le cache sur cette période.',
    // Tant que le cache est jeune, les lectures d'avant pèsent dans la moyenne.
    sous_le_seuil: "Vous en êtes à {{part_cache}} de jetons servis par le cache sur cette période : les lectures d'avant la mise en place pèsent encore dans la moyenne, le chiffre montera de lui-même.",
  },
  {
    cle: 'pdf_texte',
    etat: 'pose',
    titre: 'Le texte du PDF plutôt que ses images',
    effet: '279 574 → 91 061 jetons',
    ou: "Repli automatique sur les images pour un scan · KLOCKA_PDF_NATIF=1 rétablit l'ancien",
    texte: 'Un PDF envoyé tel quel fait rendre chacune de ses pages en image. Sur un bail de 119 pages, sa seule couche texte pèse trois fois moins, pour des valeurs extraites identiques et des citations qui gardent leur page.',
  },
  {
    cle: 'pas_de_relecture',
    etat: 'pose',
    titre: 'Ne pas relire une pièce inchangée',
    effet: '{{mediane:lecture_piece}} économisés par relecture évitée',
    effet_defaut: 'une lecture entière économisée',
    ou: 'Empreinte : la pièce, les questions posées, la version du gabarit',
    texte: 'Revenir sur un dossier ne relance plus rien. Seuls les deux boutons « Relancer l\'analyse » forcent une relecture.',
  },
  {
    cle: 'devis',
    etat: 'pose',
    titre: 'Le prix annoncé avant de relire',
    effet: "le devis s'affiche, puis attend",
    ou: 'Bouton « Relancer l\'analyse », en tête de chaque grille',
    texte: "Les jetons sont comptés par l'API avant l'envoi, ce comptage ne coûte rien. Vous voyez le prix, vous confirmez ou vous annulez.",
  },
  {
    cle: 'mail_ecarte',
    etat: 'pose',
    titre: "Un mail écarté n'est plus rejugé",
    effet: '536 appels sur 516 passages, avant',
    ou: 'Décision gardée avec sa raison',
    texte: 'Le tri des boîtes ne mémorisait que les mails retenus. Un mail refusé repassait donc devant le modèle toutes les cinq minutes, indéfiniment.',
  },
  {
    cle: 'espacement_veille',
    etat: 'regler',
    titre: "L'espacement de la veille",
    effet: '{{mediane:veille}} par mail douteux',
    effet_defaut: 'quelques centimes par passage',
    ou: 'Variable MAIL_VEILLE_MINUTES · 5 minutes aujourd\'hui',
    texte: "Depuis que les mails écartés sont mémorisés, un passage sans nouveau mail ne coûte rien. Quinze minutes suffiraient probablement, et rien ne serait perdu : un mail reçu à 9 h 02 entrerait à 9 h 15.",
  },
  {
    cle: 'differe',
    etat: 'decider',
    titre: 'Le traitement différé',
    effet: 'moitié prix sur tout',
    ou: 'Concerne la lecture des pièces et la veille, jamais le chat',
    texte: "L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai.",
  },
  {
    cle: 'modele_moins_cher',
    etat: 'decider',
    titre: 'Un modèle moins cher sur les gestes mécaniques',
    effet: 'à mesurer sur vos dossiers',
    ou: `Variable ANTHROPIC_MODEL · ${process.env.ANTHROPIC_MODEL || 'claude-opus-5'} aujourd'hui`,
    texte: "Mettre en forme une valeur déjà lue, trier un mail, ranger un texte dicté : ces gestes partent déjà à effort minimal. Descendre d'un modèle est le levier suivant, mais un modèle moins cher au jeton n'est pas toujours moins cher par dossier abouti. Cela demande un jeu de dossiers de référence, pas une intuition.",
  },
];

/** Les jalons d'un levier, remplis avec les chiffres de la période. */
export function resoudreLevier(levier, { actions = [], part_cache = 0 } = {}) {
  const medianeDe = (cle) => actions.find((a) => a.cle === cle)?.mediane ?? null;
  const jalons = (texte) =>
    String(texte || '')
      .replace(/\{\{part_cache\}\}/g, `${Math.round((part_cache || 0) * 100)} %`)
      .replace(/\{\{mediane:([a-z_]+)\}\}/g, (_, cle) => {
        const m = medianeDe(cle);
        return m == null ? '—' : `${(m * EUR_PAR_USD).toFixed(2).replace('.', ',')} €`;
      });
  const manquant = /\{\{mediane:([a-z_]+)\}\}/.test(levier.effet || '') && medianeDe((levier.effet.match(/\{\{mediane:([a-z_]+)\}\}/) || [])[1]) == null;
  const texte = levier.sous_le_seuil && (part_cache || 0) < 0.05 ? levier.sous_le_seuil : levier.texte;
  return {
    cle: levier.cle,
    etat: levier.etat,
    titre: levier.titre,
    effet: manquant && levier.effet_defaut ? levier.effet_defaut : jalons(levier.effet),
    ou: levier.ou,
    texte: jalons(texte),
  };
}

const actionDe = (operation) => {
  const op = String(operation || 'inconnue');
  const cherche = (nom) => {
    for (const a of ACTIONS) {
      if (a.prefixe && nom.startsWith(a.prefixe)) return a;
      if ((a.operations || []).includes(nom)) return a;
    }
    return null;
  };
  const trouve = cherche(op);
  if (trouve) return trouve;
  // Les lignes écrites avant qu'une route ait un nom sont restées « POST
  // /api/... ». On leur applique les libellés d'aujourd'hui : le passé se
  // range tout seul au lieu de peupler « non classé » pour toujours.
  const brute = op.match(/^([A-Z]+)\s(\/\S+)$/);
  return brute ? cherche(libelleRoute(brute[1], brute[2])) : null;
};

/** La médiane : une moyenne se fait emporter par un dossier hors norme. */
function mediane(valeurs) {
  if (!valeurs.length) return 0;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Coût par geste sur une fenêtre, plus de quoi juger les leviers.
 * @param {number} jours
 */
export function coutsParAction(jours = 30) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const lignes = Records.list('CoutIA').filter((l) => (l.le || '') >= depuis);

  const par = new Map();
  const inconnues = new Map();
  for (const l of lignes) {
    const a = actionDe(l.operation);
    if (!a) {
      inconnues.set(l.operation || 'inconnue', (inconnues.get(l.operation || 'inconnue') || 0) + (l.cout || 0));
      continue;
    }
    const e = par.get(a.cle) || { ...a, operations: undefined, prefixe: undefined, unites: 0, gestes: 0, cout: 0, entree: 0, sortie: 0, cache_lecture: 0, cache_ecriture: 0, duree_ms: 0, echantillon: [] };
    const unites = a.parAppel ? Math.max(1, l.appels || 1) : 1;
    e.unites += unites;
    e.gestes += 1;
    e.cout += l.cout || 0;
    e.entree += l.entree || 0;
    e.sortie += l.sortie || 0;
    e.cache_lecture += l.cache_lecture || 0;
    e.cache_ecriture += l.cache_ecriture || 0;
    e.duree_ms += l.duree_ms || 0;
    e.echantillon.push((l.cout || 0) / unites);
    par.set(a.cle, e);
  }

  const actions = [...par.values()]
    .map((e) => ({
      cle: e.cle,
      libelle: e.libelle,
      unite: e.unite,
      ou: e.ou,
      fond: !!e.fond,
      unites: e.unites,
      gestes: e.gestes,
      cout: e.cout,
      moyenne: e.unites ? e.cout / e.unites : 0,
      mediane: mediane(e.echantillon),
      maxi: e.echantillon.length ? Math.max(...e.echantillon) : 0,
      jetons: e.entree + e.sortie + e.cache_lecture + e.cache_ecriture,
      part_cache: e.entree + e.cache_lecture > 0 ? e.cache_lecture / (e.entree + e.cache_lecture) : 0,
      duree_moyenne_ms: e.gestes ? e.duree_ms / e.gestes : 0,
    }))
    .sort((a, b) => b.cout - a.cout);

  const total = actions.reduce((n, a) => n + a.cout, 0);
  const fond = actions.filter((a) => a.fond).reduce((n, a) => n + a.cout, 0);
  const entree = lignes.reduce((n, l) => n + (l.entree || 0), 0);
  const cacheLu = lignes.reduce((n, l) => n + (l.cache_lecture || 0), 0);

  return {
    jours,
    total,
    depuis,
    fond,
    part_fond: total ? fond / total : 0,
    part_cache: entree + cacheLu > 0 ? cacheLu / (entree + cacheLu) : 0,
    actions,
    // Une opération qu'aucun geste ne réclame : à ranger, plutôt qu'à cacher.
    non_classees: [...inconnues.entries()].map(([operation, cout]) => ({ operation, cout })).sort((a, b) => b.cout - a.cout),
    leviers: LEVIERS.map((l) => resoudreLevier(l, {
      actions,
      part_cache: entree + cacheLu > 0 ? cacheLu / (entree + cacheLu) : 0,
    })),
  };
}
