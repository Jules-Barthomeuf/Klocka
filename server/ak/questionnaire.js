// Le questionnaire de l'assistant, en propositions : AK montre une façon de
// faire, comme un message qu'il écrirait, et la personne dit si elle aime ou
// pas. Chaque réponse devient une consigne qu'AK suit pour elle seule ; elle
// s'ajoute à ses préférences personnelles (lecons.js), jamais à la consigne
// commune : ce que Nora aime ne change rien pour Max.
//
// Les propositions vivent ici, avec la consigne qu'un « j'aime » et qu'un
// « j'aime pas » donnent à AK (null : ça ne change rien) ; la page les lit par
// la route, AK par preferencesDe.

import { Records } from '../db.js';

const ENTITE = 'AkProfil';

export const PROPOSITIONS = [
  {
    id: 'une_ligne',
    theme: 'Ses réponses',
    titre: 'Une action faite, une ligne',
    exemple: "c bon, le dossier Glacier est créé.",
    oui: 'une action faite : une ligne, rien autour',
    non: "une action faite : dis en deux ou trois lignes ce que tu as fait et ce qui reste",
  },
  {
    id: 'pourquoi',
    theme: 'Ses réponses',
    titre: 'Le pourquoi avec la réponse',
    exemple: "ça tourne pas franchement : 5,8 % de rendement global pour 6,5 % visés, parce que le loyer est déjà au-dessus du marché, donc pas de marge à la relocation.",
    oui: 'donne le pourquoi avec ta réponse, en une phrase',
    non: 'donne la réponse sans expliquer pourquoi, sauf si on te le demande',
  },
  {
    id: 'argot',
    theme: 'Ses réponses',
    titre: 'Le parler de l\'équipe',
    exemple: "dcp je relance l'agent demain pr le bail, bg.",
    oui: null,
    non: 'avec lui ou elle, pas d\'argot ni d\'abréviations (dcp, pr, bg) : des phrases simples et correctes',
  },
  {
    id: 'prenom',
    theme: 'Ses réponses',
    titre: 'Son prénom en début de réponse',
    exemple: "Jules, c'est fait : la LOI Devred est dans le chat.",
    oui: 'commence tes réponses par son prénom',
    non: null,
  },
  {
    id: 'emojis',
    theme: 'Ses réponses',
    titre: 'Des emojis de temps en temps',
    exemple: "📁 c'est fait, la préz bancaire est sur le Drive.",
    oui: 'un emoji de temps en temps, pour une action faite, ça va',
    non: 'jamais d\'emoji avec lui ou elle',
  },
  {
    id: 'piques',
    theme: 'Ses réponses',
    titre: 'Un peu de caractère',
    exemple: "bon, y'a du taf là. c'est parti : K-Data, la LOI et le mail à l'agent.",
    oui: null,
    non: 'avec lui ou elle, pas de pique ni de râlerie : tu fais, et tu le dis sobrement',
  },
  {
    id: 'suite',
    theme: 'Ses réponses',
    titre: 'Proposer la suite',
    exemple: "le dossier est prêt. je prépare la demande de documents à l'agent ?",
    oui: 'finis par la suite logique, en une question (« je prépare la demande de docs ? »)',
    non: 'ne propose pas de suite : il ou elle te dira quoi faire',
  },
  {
    id: 'avis_renta',
    theme: 'Son avis sur un dossier',
    titre: 'La renta en premier',
    exemple: "6,9 % de rendement global pour 6,5 % visés : ça passe. le loyer est un peu au-dessus du marché, emplacement à vérifier.",
    oui: "quand tu parles d'un dossier, commence par la renta et la négo",
    non: null,
  },
  {
    id: 'avis_emplacement',
    theme: 'Son avis sur un dossier',
    titre: 'L\'emplacement en premier',
    exemple: "Rambuteau, flux touristique fort, commerce de bouche : l'emplacement tient. côté renta, 6,9 % global, ça passe.",
    oui: "quand tu parles d'un dossier, commence par l'emplacement",
    non: null,
  },
  {
    id: 'chiffres_ronds',
    theme: 'Son avis sur un dossier',
    titre: 'Des chiffres arrondis',
    exemple: "environ 35 k de négo pour atteindre 7 %.",
    oui: 'arrondis les chiffres (35 k, 7 %)',
    non: 'donne les chiffres précis (34 800 €, 6,93 %)',
  },
  {
    id: 'kdata_seul',
    theme: 'Ce qu\'il fait sans demander',
    titre: 'Lancer K-Data tout seul après une préanalyse',
    exemple: "dossier créé. j'ai lancé K-Zoning, K-Expertise et l'estimation dessus, je te dis quand c'est fini.",
    oui: 'tu peux lancer K-Data (K-Zoning, K-Expertise, Estimation) sur ses dossiers sans demander',
    non: 'ne lance jamais K-Data sans lui ou elle demander',
  },
  {
    id: 'docs_seul',
    theme: 'Ce qu\'il fait sans demander',
    titre: 'Préparer la demande de documents tout seul',
    exemple: "le dossier passe, j'ai préparé la demande de documents à l'agent : la voilà, dis « envoie » et elle part.",
    oui: "quand un de ses dossiers passe, prépare la demande de documents à l'agent sans attendre qu'on la demande (sans l'envoyer)",
    non: null,
  },
  {
    id: 'projet_seul',
    theme: 'Ce qu\'il fait sans demander',
    titre: 'Créer le projet tout seul quand le dossier passe',
    exemple: "le Glacier passe : j'ai créé le projet sur la plateforme, il manque le bail et l'échéance.",
    oui: "quand un de ses dossiers passe, tu peux créer son projet sans demander",
    non: null,
  },
  {
    id: 'mails_courts',
    theme: 'Ses mails aux agents',
    titre: 'Des mails courts',
    exemple: "Bonjour, merci pour la fiche du 58 rue Rambuteau. Le bien nous intéresse : pourriez-vous nous envoyer le bail, les trois derniers PV d'AG et la taxe foncière ? Bien à vous, Jules",
    oui: 'ses mails aux agents : courts, quatre ou cinq lignes, sans formule de fin longue',
    non: 'ses mails aux agents : complets et formels',
  },
];

const PAR_ID = new Map(PROPOSITIONS.map((p) => [p.id, p]));

/** Pure : ne garde que des « oui » et des « non », sur des propositions connues. */
export function nettoyer(reponses = {}) {
  const propre = {};
  for (const [id, v] of Object.entries(reponses || {})) if (PAR_ID.has(id) && (v === 'oui' || v === 'non')) propre[id] = v;
  return propre;
}

/** Pure : les consignes que les réponses donnent à AK. Une réponse qui ne change rien n'en donne pas. */
export function consignesDuProfil(reponses = {}) {
  return PROPOSITIONS.map((p) => (reponses?.[p.id] === 'oui' ? p.oui : reponses?.[p.id] === 'non' ? p.non : null)).filter(Boolean);
}

/** Les propositions telles que la page les montre. */
export const questionsPubliques = () => PROPOSITIONS.map(({ id, theme, titre, exemple }) => ({ id, theme, titre, exemple }));

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
  if (existant) Records.update(ENTITE, existant.id, { reponses: propre, maj_le: maintenant });
  else Records.create(ENTITE, { email: e, reponses: propre, maj_le: maintenant });
  return { ok: true, reponses: propre, maj_le: maintenant, consignes: consignesDuProfil(propre) };
}
