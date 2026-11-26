// Ce que veut dire chaque clause d'un bail commercial, pour un client qui ne connaît pas (26 nov. 2026, Jules : « sous la
// clause, “qu'est-ce que l'indexation ?” ; on clique, et à droite, à la place du bail, une explication ; pour toutes »).
// Écrit une fois, à la main : pas d'IA, le même texte pour tous les biens. Les clés sont celles de SECTIONS_BAIL.
// { question (le lien sous la clause), titre, texte (paragraphes, le premier commence par le terme : « Le dépôt de
// garantie est une somme… ») }. Plus de « À retenir » ni de « Expliqué simplement » (26 nov. 2026, Jules : « juste
// Définition, en pervenche, puis le texte »).

export const EXPLICATIONS_BAIL = {
  type_bail: {
    question: "Qu'est-ce qu'un bail 3/6/9 ?",
    titre: "Le type de bail",
    texte: [
      "Le bail 3/6/9 est le bail commercial classique : il dure au moins neuf ans, et le locataire peut partir à la fin de chaque période de trois ans, en prévenant six mois à l'avance.",
      "Le propriétaire, lui, ne peut pas reprendre son local en cours de route, sauf cas très encadrés. À la fin du bail, le locataire a le droit de le renouveler ; s'il est refusé, le propriétaire lui doit en principe une indemnité.",
      "Certains baux sont « fermes » (six ou neuf ans ferme) : le locataire renonce à partir aux échéances de trois ans. Un bail dérogatoire, lui, est court (trois ans au plus) et n'offre pas ces protections.",
    ],
  },
  dates_bail: {
    question: "Que veulent dire ces dates ?",
    titre: "Les dates du bail",
    texte: [
      "Les dates du bail disent quand il commence et quand il finit. La prise d'effet est le jour où le bail commence : le locataire entre dans les lieux et le loyer court (après une éventuelle franchise).",
      "L'échéance est la fin prévue du bail. Entre les deux, les échéances triennales (tous les trois ans) sont les seuls moments où un locataire en bail 3/6/9 peut partir.",
      "À l'échéance, le bail ne s'arrête pas tout seul : sans congé ni renouvellement, il se prolonge aux mêmes conditions.",
    ],
  },
  parties: {
    question: "Qui sont les parties ?",
    titre: "Les parties",
    texte: [
      "Les parties sont les deux signataires du bail. Le bailleur est le propriétaire des murs : c'est lui qui reçoit le loyer. En achetant le bien, vous prenez sa place, avec le bail tel qu'il est.",
      "Le preneur est le locataire : la société qui exploite le commerce et paie le loyer. Ce peut être l'enseigne elle-même ou un franchisé qui exploite sous son nom.",
    ],
  },
  loyer: {
    question: "Qu'est-ce que le loyer de signature ?",
    titre: "Le loyer",
    texte: [
      "Le loyer de signature est celui fixé le jour où le bail a été signé. Il est exprimé par an, hors taxes (HT) et hors charges (HC).",
      "Depuis, il a pu évoluer avec l'indexation : le loyer en cours est souvent un peu plus haut que le loyer de signature.",
      "C'est la base du rendement : rendement brut = loyer annuel ÷ prix d'achat. Un loyer de 95 000\u00a0€ par an pour un prix de 1,9\u00a0M€ donne 5\u00a0% brut.",
    ],
  },
  conditions_exceptionnelles: {
    question: "Qu'est-ce qu'une franchise ou un palier ?",
    titre: "Les conditions exceptionnelles",
    texte: [
      "Les conditions exceptionnelles sont les avantages accordés au locataire sur le loyer. Une franchise de loyer, ce sont des mois où le locataire ne paie pas de loyer, souvent au début du bail pour financer ses travaux d'installation.",
      "Un palier, c'est un loyer qui monte par étapes : plus bas les premières années, puis au niveau prévu.",
    ],
  },
  mode_reglement: {
    question: "Comment le loyer est-il payé ?",
    titre: "Le paiement du loyer",
    texte: [
      "Le mode de règlement dit à quel rythme et comment le locataire paie son loyer : chaque mois ou chaque trimestre, le plus souvent.",
      "« D'avance » (ou « à échoir ») veut dire qu'il paie au début de la période, avant d'occuper les lieux pour ce mois ou ce trimestre. C'est le plus confortable pour le propriétaire.",
      "Le moyen est aussi précisé : virement ou prélèvement.",
    ],
  },
  tva_loyer: {
    question: "Pourquoi un loyer avec TVA ?",
    titre: "La TVA sur le loyer",
    texte: [
      "L'option pour la TVA est le choix du propriétaire de soumettre le loyer à la TVA : sans elle, la location d'un local commercial nu n'y est pas soumise.",
      "Avec l'option, le locataire paie le loyer plus 20\u00a0% de TVA, que le propriétaire reverse à l'État. Pour un locataire qui récupère la TVA, cela ne lui coûte rien.",
      "L'intérêt pour le propriétaire : il peut récupérer la TVA payée sur ses travaux, et parfois sur l'achat.",
    ],
  },
  destination: {
    question: "Qu'est-ce que la destination ?",
    titre: "La destination du bail",
    texte: [
      "La destination du bail est la liste des activités que le locataire a le droit d'exercer dans le local : restauration rapide, prêt-à-porter, pharmacie…",
      "Pour en changer, il lui faut l'accord du propriétaire ou suivre une procédure encadrée (la déspécialisation).",
      "Une destination large rend le local plus facile à céder ou à relouer ; une destination étroite protège l'usage voulu par le propriétaire ou la copropriété.",
    ],
  },
  cession: {
    question: "Qu'est-ce que la cession du bail ?",
    titre: "La cession du bail",
    texte: [
      "La cession du bail est sa transmission à quelqu'un d'autre. Le plus souvent, le locataire vend son fonds de commerce et le bail part avec.",
      "Le bail peut limiter cette cession : seulement avec le fonds, ou avec l'accord du propriétaire. Il peut aussi prévoir que l'ancien locataire reste garant du nouveau ; la loi limite cette garantie à trois ans.",
      "La sous-location (louer à son tour tout ou partie du local) est interdite, sauf si le bail ou le propriétaire l'autorise.",
    ],
  },
  indexation: {
    question: "Qu'est-ce que l'indexation ?",
    titre: "L'indexation",
    texte: [
      "L'indexation fait évoluer le loyer chaque année, tout seul, au rythme d'un indice publié par l'INSEE.",
      "Pour un commerce, c'est l'indice des loyers commerciaux (ILC) ; pour des bureaux, l'indice des activités tertiaires (ILAT). L'ancien indice du coût de la construction (ICC), plus volatil, se rencontre encore dans de vieux baux.",
      "Le calcul : nouveau loyer = loyer de départ × nouvel indice ÷ indice de départ. Si l'indice a pris 5\u00a0%, le loyer prend 5\u00a0%.",
    ],
  },
  depot: {
    question: "À quoi sert le dépôt de garantie ?",
    titre: "Le dépôt de garantie",
    texte: [
      "Le dépôt de garantie est une somme que le locataire verse au propriétaire à la signature, souvent trois mois de loyer hors taxes.",
      "Le propriétaire la garde pendant tout le bail et la rend à la fin, moins ce que le locataire doit encore (loyers impayés, réparations).",
      "Quand les murs sont vendus, le dépôt passe au nouveau propriétaire, qui devra le rendre au locataire en fin de bail.",
    ],
  },
  pas_de_porte: {
    question: "Qu'est-ce qu'un pas de porte ?",
    titre: "Le pas de porte",
    texte: [
      "Le pas de porte est une somme que le locataire paie au propriétaire en entrant dans les lieux, en plus du loyer.",
      "Il paie l'emplacement : un local très recherché peut le justifier. Selon le bail, c'est un supplément de loyer ou une indemnité, ce qui change sa fiscalité.",
    ],
  },
  charges: {
    question: "Quelles charges paie le locataire ?",
    titre: "Les charges refacturées",
    texte: [
      "Les charges refacturées sont les dépenses de l'immeuble que le locataire rembourse au propriétaire : copropriété, entretien des parties communes, assurance… Le bail dit lesquelles.",
      "Depuis la loi Pinel (2014), le bail doit les lister, et certaines ne peuvent jamais être mises au locataire : les grosses réparations de l'article 606 du Code civil (toiture, gros murs, structure) restent au propriétaire.",
      "Le locataire paie souvent une provision chaque mois ou trimestre, ajustée une fois par an sur les dépenses réelles.",
    ],
  },
  taxe_fonciere: {
    question: "Qui paie la taxe foncière ?",
    titre: "Les taxes refacturées",
    texte: [
      "La taxe foncière est un impôt payé chaque année par le propriétaire des murs.",
      "Le bail peut prévoir que le locataire la rembourse, avec la taxe d'enlèvement des ordures ménagères ; c'est l'usage dans la plupart des baux commerciaux.",
      "Si le bail ne le dit pas, elle reste à la charge du propriétaire et vient en déduction du loyer encaissé.",
    ],
  },
};

/** L'explication d'une clause, ou null. */
export const explicationDe = (id) => EXPLICATIONS_BAIL[id] || null;
