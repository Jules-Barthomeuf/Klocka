// Quiz sur l'immobilier commercial - 10 questions
// Chaque question est liée à une catégorie de ressource pour recommander du contenu

const quizImmoCommercial = [
  {
    id: 1,
    question: "Quelle est la durée standard d'un bail commercial en France ?",
    options: ["3 ans", "6 ans", "9 ans", "12 ans"],
    correctIndex: 2,
    explanation: "Le bail commercial classique est un bail 3/6/9, d'une durée totale de 9 ans avec possibilité de résiliation tous les 3 ans.",
    categorie: "juridique"
  },
  {
    id: 2,
    question: "Qu'est-ce que le rendement brut d'un bien immobilier commercial ?",
    options: [
      "Le loyer annuel divisé par le prix d'achat",
      "Le loyer mensuel multiplié par 12",
      "Le bénéfice net après impôts",
      "La plus-value à la revente"
    ],
    correctIndex: 0,
    explanation: "Le rendement brut = (loyer annuel / prix d'acquisition) × 100. C'est le premier indicateur pour évaluer la rentabilité.",
    categorie: "analyse"
  },
  {
    id: 3,
    question: "Quel indice est généralement utilisé pour indexer les loyers commerciaux ?",
    options: ["IPC", "IRL", "ILC", "ICC"],
    correctIndex: 2,
    explanation: "L'ILC (Indice des Loyers Commerciaux) est l'indice de référence pour la révision des loyers des baux commerciaux depuis 2008.",
    categorie: "juridique"
  },
  {
    id: 4,
    question: "Qu'est-ce qu'un pas-de-porte en immobilier commercial ?",
    options: [
      "Le seuil d'entrée du local",
      "Une somme versée au bailleur à l'entrée dans les lieux",
      "Les frais de notaire",
      "Le dépôt de garantie"
    ],
    correctIndex: 1,
    explanation: "Le pas-de-porte est une somme versée par le locataire au propriétaire lors de la conclusion du bail, en contrepartie d'avantages commerciaux.",
    categorie: "juridique"
  },
  {
    id: 5,
    question: "Quel est l'avantage principal d'investir via une SCI à l'IS ?",
    options: [
      "Pas de comptabilité nécessaire",
      "Amortissement du bien et optimisation fiscale",
      "Aucun impôt sur les revenus locatifs",
      "Pas de frais de notaire"
    ],
    correctIndex: 1,
    explanation: "La SCI à l'IS permet d'amortir le bien, ce qui réduit le bénéfice imposable et optimise la fiscalité sur les revenus locatifs.",
    categorie: "fiscalite"
  },
  {
    id: 6,
    question: "Quel taux de rendement brut est généralement considéré comme attractif en immobilier commercial ?",
    options: ["2-3%", "4-5%", "6-8%", "12-15%"],
    correctIndex: 2,
    explanation: "En immobilier commercial, un rendement brut de 6 à 8% est considéré comme attractif, supérieur au résidentiel (3-5%).",
    categorie: "strategie"
  },
  {
    id: 7,
    question: "Que signifie le terme 'vacance locative' ?",
    options: [
      "Les congés du locataire",
      "La période pendant laquelle le bien n'est pas loué",
      "Le taux d'occupation d'un immeuble",
      "La clause de sortie du bail"
    ],
    correctIndex: 1,
    explanation: "La vacance locative désigne la période où le bien reste inoccupé entre deux locataires, impactant directement la rentabilité.",
    categorie: "analyse"
  },
  {
    id: 8,
    question: "Qu'est-ce que le droit au bail ?",
    options: [
      "Le droit de construire sur un terrain",
      "La valeur économique du bail cédée par le locataire sortant",
      "Le droit de modifier les locaux",
      "L'autorisation d'exercer une activité"
    ],
    correctIndex: 1,
    explanation: "Le droit au bail représente la valeur du bail commercial, cédée par le locataire sortant au nouveau locataire entrant.",
    categorie: "juridique"
  },
  {
    id: 9,
    question: "Quel est l'apport personnel minimum généralement demandé par les banques pour un investissement commercial ?",
    options: ["0%", "10-15%", "20-30%", "50%"],
    correctIndex: 2,
    explanation: "Les banques demandent généralement un apport de 20 à 30% pour un investissement en immobilier commercial, plus élevé qu'en résidentiel.",
    categorie: "financement"
  },
  {
    id: 10,
    question: "Qu'est-ce qu'un bail 'triple net' ?",
    options: [
      "Un bail avec trois locataires",
      "Un bail de trois ans",
      "Un bail où le locataire supporte taxes, assurance et entretien",
      "Un bail avec triple indexation"
    ],
    correctIndex: 2,
    explanation: "Dans un bail triple net, le locataire prend en charge la taxe foncière, l'assurance et l'entretien, en plus du loyer.",
    categorie: "juridique"
  }
];

export default quizImmoCommercial;