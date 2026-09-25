// Le questionnaire de l'assistant : chaque admin dit comment AK doit
// travailler avec lui, et ses réponses deviennent des consignes qu'AK suit
// pour lui seul. Elles s'ajoutent à ses préférences personnelles (lecons.js),
// jamais à la consigne commune : ce que Nora veut ne change rien pour Max.
//
// Les questions vivent ici, avec la phrase que chaque réponse donne à AK :
// la page les lit par la route, AK les lit par preferencesDe, et le test
// vérifie les deux sur la même source.

import { Records } from '../db.js';

const ENTITE = 'AkProfil';

/**
 * Les questions, dans l'ordre de la page. `consigne` rend la phrase donnée à
 * AK pour une réponse, ou null quand la réponse ne change rien.
 */
export const QUESTIONS = [
  {
    id: 'appel',
    theme: 'Toi',
    question: 'Comment veux-tu qu\'AK t\'appelle ?',
    aide: 'Ton prénom, un surnom. Vide : ton prénom.',
    type: 'texte',
    exemple: 'Jules',
    consigne: (v) => (v ? `appelle-le ou appelle-la « ${v} »` : null),
  },
  {
    id: 'role',
    theme: 'Toi',
    question: 'Qu\'est-ce que tu fais surtout chez Klocka ?',
    type: 'multi',
    options: [
      { valeur: 'analyse', libelle: 'Analyse des dossiers' },
      { valeur: 'prospection', libelle: 'Prospection et agents' },
      { valeur: 'negociation', libelle: 'Négociation' },
      { valeur: 'clients', libelle: 'Relation clients investisseurs' },
      { valeur: 'banque', libelle: 'Financement et préz bancaires' },
    ],
    consigne: (v) => (v?.length ? `son travail : ${v.map((x) => ({ analyse: "l'analyse des dossiers", prospection: 'la prospection et les agents', negociation: 'la négociation', clients: 'la relation avec les clients investisseurs', banque: 'le financement et les préz bancaires' }[x] || x)).join(', ')} ; oriente tes réponses et tes propositions vers ça` : null),
  },
  {
    id: 'secteurs',
    theme: 'Toi',
    question: 'Quelles villes ou quels secteurs suis-tu ?',
    aide: 'AK les mettra en avant quand il te parle d\'un bien ou d\'un agent.',
    type: 'texte',
    exemple: 'Paris, Lyon, la Côte d\'Azur',
    consigne: (v) => (v ? `ses secteurs : ${v} ; signale quand un bien ou un agent en fait partie` : null),
  },
  {
    id: 'longueur',
    theme: 'Ses réponses',
    question: 'Tu veux des réponses de quelle longueur ?',
    type: 'choix',
    options: [
      { valeur: 'court', libelle: 'Une ligne, cash' },
      { valeur: 'normal', libelle: 'Deux ou trois lignes' },
      { valeur: 'detail', libelle: 'Détaillées, avec le pourquoi' },
    ],
    consigne: (v) => ({ court: 'réponds-lui en une ligne, sans rien autour', normal: null, detail: 'donne-lui le détail et le pourquoi, en quelques lignes, il ou elle préfère comprendre' }[v] ?? null),
  },
  {
    id: 'ton',
    theme: 'Ses réponses',
    question: 'Quel ton avec toi ?',
    type: 'choix',
    options: [
      { valeur: 'equipe', libelle: 'Comme l\'équipe : dcp, bg, minuscules' },
      { valeur: 'direct', libelle: 'Direct mais sans argot' },
      { valeur: 'pose', libelle: 'Posé et soigné' },
    ],
    consigne: (v) => ({ equipe: null, direct: 'avec lui ou elle, reste direct mais sans argot ni abréviations', pose: 'avec lui ou elle, écris des phrases posées et soignées, sans argot' }[v] ?? null),
  },
  {
    id: 'avis',
    theme: 'Son avis sur un dossier',
    question: 'Dans l\'avis d\'AK sur un dossier, qu\'est-ce que tu veux voir en premier ?',
    type: 'multi',
    options: [
      { valeur: 'renta', libelle: 'La renta et la négo' },
      { valeur: 'marche', libelle: 'Prix et loyer face au marché' },
      { valeur: 'emplacement', libelle: 'L\'emplacement' },
      { valeur: 'locataire', libelle: 'Le locataire et le bail' },
      { valeur: 'clients', libelle: 'Les clients qui pourraient coller' },
    ],
    consigne: (v) => (v?.length ? `quand tu parles d'un dossier, commence par ${v.map((x) => ({ renta: 'la renta et la négo', marche: 'le prix et le loyer face au marché', emplacement: "l'emplacement", locataire: 'le locataire et le bail', clients: 'les clients qui pourraient coller' }[x] || x)).join(', puis ')}` : null),
  },
  {
    id: 'rendement_mini',
    theme: 'Son avis sur un dossier',
    question: 'En dessous de quel rendement global un dossier ne t\'intéresse pas ?',
    aide: 'Le rendement net moyen sur la durée, celui de la fiche. Vide : le seuil de la grille.',
    type: 'nombre',
    unite: '%',
    exemple: '6,5',
    consigne: (v) => (Number(String(v).replace(',', '.')) > 0 ? `pour lui ou elle, un dossier sous ${String(v).replace('.', ',')} % de rendement global n'est pas intéressant : dis-le franchement` : null),
  },
  {
    id: 'autonomie',
    theme: 'Ce qu\'AK fait sans te demander',
    question: 'Qu\'est-ce qu\'AK peut faire pour toi sans te demander d\'abord ?',
    aide: 'Un mail ne part jamais sans ton « envoie », quoi que tu coches.',
    type: 'multi',
    options: [
      { valeur: 'kdata', libelle: 'Lancer K-Data sur un dossier' },
      { valeur: 'projet', libelle: 'Créer le projet d\'un dossier qui passe' },
      { valeur: 'drive', libelle: 'Ranger les pièces sur le Drive' },
      { valeur: 'brouillon_docs', libelle: 'Préparer la demande de documents à l\'agent' },
    ],
    consigne: (v) => (v?.length ? `pour lui ou elle, tu peux sans demander : ${v.map((x) => ({ kdata: 'lancer K-Data (K-Zoning, K-Expertise, Estimation) sur un dossier', projet: "créer le projet d'un dossier qui passe", drive: 'ranger les pièces sur le Drive', brouillon_docs: "préparer la demande de documents à l'agent (sans l'envoyer)" }[x] || x)).join(', ')}` : null),
  },
  {
    id: 'signature',
    theme: 'Ses mails',
    question: 'Comment signes-tu tes mails aux agents ?',
    type: 'texte',
    exemple: 'Jules Barthomeuf, Klocka, 06 12 34 56 78',
    consigne: (v) => (v ? `signe ses mails « ${v} »` : null),
  },
  {
    id: 'mails',
    theme: 'Ses mails',
    question: 'Tes mails aux agents, plutôt :',
    type: 'choix',
    options: [
      { valeur: 'courts', libelle: 'Courts, quatre ou cinq lignes' },
      { valeur: 'complets', libelle: 'Complets et formels' },
    ],
    consigne: (v) => ({ courts: 'ses mails aux agents : courts, quatre ou cinq lignes, sans formule de fin longue', complets: null }[v] ?? null),
  },
  {
    id: 'jamais',
    theme: 'Le reste',
    question: 'Qu\'est-ce qu\'AK ne doit jamais faire avec toi ?',
    type: 'texte_long',
    exemple: 'Me mettre des emojis, me relancer le vendredi soir…',
    consigne: (v) => (v ? `avec lui ou elle, ne fais jamais ça : ${v}` : null),
  },
  {
    id: 'autre',
    theme: 'Le reste',
    question: 'Autre chose qu\'AK devrait savoir sur ta façon de travailler ?',
    type: 'texte_long',
    consigne: (v) => (v ? `à savoir sur sa façon de travailler : ${v}` : null),
  },
];

const IDS = new Set(QUESTIONS.map((q) => q.id));

/** Pure : ne garde que des réponses propres, aux questions connues. */
export function nettoyer(reponses = {}) {
  const propre = {};
  for (const q of QUESTIONS) {
    const v = reponses?.[q.id];
    if (v == null || v === '') continue;
    if (q.type === 'multi') {
      const autorisees = new Set(q.options.map((o) => o.valeur));
      const liste = (Array.isArray(v) ? v : []).filter((x) => autorisees.has(x));
      if (liste.length) propre[q.id] = liste;
    } else if (q.type === 'choix') {
      if (q.options.some((o) => o.valeur === v)) propre[q.id] = v;
    } else if (q.type === 'nombre') {
      const n = Number(String(v).replace(',', '.'));
      if (n > 0 && n < 30) propre[q.id] = n;
    } else {
      const t = String(v).trim().slice(0, q.type === 'texte_long' ? 600 : 120);
      if (t) propre[q.id] = t;
    }
  }
  return propre;
}

/** Pure : les consignes que les réponses donnent à AK, une par question qui change quelque chose. */
export function consignesDuProfil(reponses = {}) {
  return QUESTIONS.map((q) => (IDS.has(q.id) ? q.consigne(reponses[q.id]) : null)).filter(Boolean);
}

/** Les questions telles que la page les montre (sans les fonctions). */
export const questionsPubliques = () => QUESTIONS.map(({ consigne, ...q }) => q);

export function profilDe(email) {
  const e = String(email || '').toLowerCase();
  return e ? Records.filter(ENTITE, { email: e })[0] || null : null;
}

export function enregistrerProfil(email, reponses) {
  const e = String(email || '').toLowerCase();
  if (!e) return { ok: false, error: 'Compte inconnu.' };
  const propre = nettoyer(reponses);
  const existant = profilDe(e);
  const maintenant = new Date().toISOString();
  const r = existant
    ? Records.update(ENTITE, existant.id, { reponses: propre, maj_le: maintenant })
    : Records.create(ENTITE, { email: e, reponses: propre, maj_le: maintenant });
  return { ok: true, reponses: propre, maj_le: r?.maj_le || maintenant, consignes: consignesDuProfil(propre) };
}
