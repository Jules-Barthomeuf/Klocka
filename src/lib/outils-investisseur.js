// Les outils publics des newsletters (9 oct. 2026) : le quiz « Quel
// investisseur en murs êtes-vous ? » et « Vision », le plan retraite. Pur et
// sans réseau : les pages publiques le calculent dans le navigateur, les tests
// du serveur le vérifient.
//
// Les rendements et les tickets reprennent les typologies de la feuille de
// route (server/leadmagnet.js, TYPOLOGIES) : une hypothèse se discute à un
// seul endroit, et la page l'affiche toujours avec le résultat.

// --- Le quiz -----------------------------------------------------------------

export const PROFILS = {
  prudent: {
    nom: "L'investisseur prudent",
    phrase: "Vous voulez un loyer qui tombe chaque mois, sans surprise.",
    texte: "Votre terrain : les commerces de proximité tenus par des enseignes solides, avec des baux longs. Le rendement est un peu plus bas, entre 6 et 7,5 %, mais la vacance est rare et le locataire reste.",
    cible: "Commerce de proximité ou enseigne nationale",
  },
  rendement: {
    nom: "L'investisseur rendement",
    phrase: "Vous cherchez le meilleur loyer pour chaque euro investi.",
    texte: "Votre terrain : les boutiques de service (coiffure, institut, agence) à des tickets plus petits, entre 7 et 9 % de rendement. Le risque de vacance est plus élevé : l'emplacement et le choix du locataire font tout.",
    cible: "Boutique de service, ticket de 90 000 à 150 000 €",
  },
  patrimonial: {
    nom: "L'investisseur patrimonial",
    phrase: "Vous bâtissez un patrimoine qui prend de la valeur et se transmet.",
    texte: "Votre terrain : les meilleurs emplacements de centre-ville et les immeubles mixtes. Le rendement est plus sage, entre 5,5 et 6,5 %, mais la valeur tient et monte avec la rue.",
    cible: "Emplacement n°1 ou immeuble mixte",
  },
};

export const QUESTIONS = [
  {
    question: "Votre locataire vous annonce son départ. Votre première pensée ?",
    choix: [
      ["prudent", "Combien de mois sans loyer ?"],
      ["rendement", "L'occasion de relouer plus cher."],
      ["patrimonial", "Sur cette rue, le local se relouera vite."],
    ],
  },
  {
    question: "Ce que vous attendez d'abord de vos murs :",
    choix: [
      ["prudent", "Un revenu sûr, chaque mois."],
      ["rendement", "Le meilleur rendement possible."],
      ["patrimonial", "Une valeur qui monte et se transmet."],
    ],
  },
  {
    question: "Votre locataire idéal :",
    choix: [
      ["prudent", "Une enseigne nationale, bail de 9 ans ou plus."],
      ["rendement", "Un commerçant indépendant qui paie un bon loyer."],
      ["patrimonial", "Peu importe qui, pourvu que la rue soit la meilleure."],
    ],
  },
  {
    question: "Combien de temps garderez-vous ces murs ?",
    choix: [
      ["prudent", "Jusqu'à la retraite, pour en vivre."],
      ["rendement", "Dix à quinze ans, puis je revends ou je réinvestis."],
      ["patrimonial", "Toujours : ils iront à mes enfants."],
    ],
  },
  {
    question: "Le crédit, pour vous, c'est :",
    choix: [
      ["prudent", "Le moins possible, et vite remboursé."],
      ["rendement", "Le plus long possible : le loyer le paie."],
      ["patrimonial", "Ce qu'il faut pour acheter le meilleur emplacement."],
    ],
  },
];

/**
 * Le profil d'une suite de réponses (une clé de profil par question). Le plus
 * fréquent l'emporte ; à égalité, la dernière question tranche, puis l'ordre
 * prudent, rendement, patrimonial.
 */
export function profilDuQuiz(reponses = []) {
  const scores = { prudent: 0, rendement: 0, patrimonial: 0 };
  for (const r of reponses) if (r in scores) scores[r] += 1;
  const max = Math.max(...Object.values(scores));
  const ex = Object.keys(scores).filter((k) => scores[k] === max);
  const derniere = [...reponses].reverse().find((r) => ex.includes(r));
  return { profil: ex.length === 1 ? ex[0] : derniere || ex[0], scores };
}

// --- Vision : le plan retraite ---------------------------------------------

/** Les commerces qu'on propose, leur ticket type et leur rendement brut (milieu de la fourchette de TYPOLOGIES). */
export const COMMERCES = [
  { cle: "service", nom: "Boutique de service", exemple: "coiffure, institut, agence", prix: 120000, rendement: 8 },
  { cle: "proximite", nom: "Commerce de proximité", exemple: "boulangerie, opticien, pharmacie", prix: 250000, rendement: 7.25 },
  { cle: "enseigne", nom: "Restaurant ou enseigne", exemple: "café, restaurant, supérette", prix: 500000, rendement: 6.75 },
  { cle: "mixte", nom: "Immeuble mixte", exemple: "commerce en bas, logements au-dessus", prix: 900000, rendement: 6 },
];

export const HYPOTHESES = {
  /** La part du loyer qu'on garde après vacance, charges non refacturées et entretien. */
  partLoyerGardee: 0.9,
  /** Ce qu'on met au pot à chaque achat : frais d'acquisition et part demandée par la banque. */
  partApport: 0.15,
  tauxCredit: 4.5,
  dureeCredit: 20,
  /** Au-delà, l'objectif n'est pas atteignable de cette façon. */
  anneesMax: 40,
};

/** L'annuité d'un crédit amortissable. */
export function annuite(capital, tauxPct, annees) {
  const t = tauxPct / 100;
  if (!capital || !annees) return 0;
  if (!t) return capital / annees;
  return (capital * t) / (1 - (1 + t) ** -annees);
}

/**
 * Le plan : combien de murs pour toucher `revenuMensuel` une fois les crédits
 * remboursés, et quand on peut les acheter avec son épargne et les excédents
 * des loyers. Rend aussi ce que le plan verse à l'horizon voulu.
 */
export function planRetraite({ revenuMensuel, commerce = "proximite", epargneMensuelle = 0, apportInitial = 0, horizon = 20, prix = null } = {}, h = HYPOTHESES) {
  const c = COMMERCES.find((x) => x.cle === commerce) || COMMERCES[1];
  const ticket = Number(prix) > 0 ? Number(prix) : c.prix;
  const loyerGarde = ticket * (c.rendement / 100) * h.partLoyerGardee;
  const credit = annuite(ticket * (1 - h.partApport), h.tauxCredit, h.dureeCredit);
  const apport = ticket * h.partApport;
  const murs = Math.max(1, Math.ceil((Math.max(0, Number(revenuMensuel) || 0) * 12) / loyerGarde));

  const achats = [];
  let caisse = Math.max(0, Number(apportInitial) || 0);
  for (let annee = 0; annee <= h.anneesMax && achats.length < murs; annee += 1) {
    if (annee > 0) {
      caisse += Math.max(0, Number(epargneMensuelle) || 0) * 12;
      for (const a of achats) caisse += loyerGarde - (annee - a <= h.dureeCredit ? credit : 0);
    }
    while (caisse >= apport && achats.length < murs) { achats.push(annee); caisse -= apport; }
  }
  const complet = achats.length === murs;
  // Un mur acheté l'année a paie son crédit les années a+1 à a+durée : il est libre l'année d'après.
  const anneeLibre = complet ? achats[achats.length - 1] + h.dureeCredit + 1 : null;
  // À l'horizon : le loyer gardé des murs remboursés, l'excédent des autres.
  const revenuHorizon = achats.filter((a) => a < horizon).reduce((s, a) => s + loyerGarde - (horizon - a <= h.dureeCredit ? credit : 0), 0) / 12;
  return {
    commerce: c, ticket, murs, achats, complet, anneeLibre,
    loyerMensuelParMur: loyerGarde / 12,
    excedentMensuelParMur: (loyerGarde - credit) / 12,
    apportParMur: apport,
    investissement: murs * ticket,
    revenuHorizon: Math.max(0, revenuHorizon),
    atteint: complet && anneeLibre <= horizon,
  };
}
