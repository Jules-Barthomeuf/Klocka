// Les cas d'essai du rappel et de l'appel rapide (19 oct. 2026, Jules : « un mode pour tester sans passer d'appel
// réel »). On en choisit un, l'appel se joue phrase par phrase comme une vraie transcription, Haka le lit pour de
// vrai ; tout se passe dans la liste fictive du mode Essai : ni Monday, ni mail, ni carnet réel. Les agences citées
// sont celles de cette liste (Agence Essai Commerces, Riviera Test Immobilier, Cabinet Démo Transactions, Agence
// Fictive du Port) ; « Nouvelle Vague » et « Agence du Levant » n'y sont pas : on les crée en nouveau contact.

export const SCENARIOS_RAPPEL = [
  {
    cle: "sophie_bien", sens: "entrant", titre: "Sophie Essai rappelle : elle a un bien",
    aide: "Elle se présente : Assistant KPartners doit la proposer d'emblée, puis demander la fiche.",
    phrases: [
      "Allô, bonjour, Sophie Essai de l'Agence Essai Commerces, vous m'avez appelée hier ?",
      "Oui, bonjour Madame, merci de me rappeler. Nous achetons des murs commerciaux loués, je voulais savoir si vous aviez des choses en ce moment.",
      "Justement, j'ai les murs d'une boulangerie, rue de France, loués 24 000 euros par an, bail renouvelé l'an dernier.",
      "Très intéressant. Vous pouvez m'envoyer la fiche ?",
      "Oui, je vous l'envoie cet après-midi par mail.",
      "Parfait, merci, bonne journée.",
    ],
  },
  {
    cle: "assistante", sens: "entrant", titre: "L'assistante du Cabinet Démo rappelle",
    aide: "Pas de nom de personne, seulement l'agence : elle doit sortir en premier, et le mail doit être proposé.",
    phrases: [
      "Bonjour, Cabinet Démo Transactions, vous avez essayé de nous joindre ?",
      "Oui, bonjour, je cherchais à joindre le responsable commerce, nous achetons des murs commerciaux.",
      "Il n'est pas là aujourd'hui. Envoyez-nous un mail, je lui transmets.",
      "Très bien, à quelle adresse ?",
      "transactions arobase cabinet tiret demo point invalid.",
      "C'est noté, merci beaucoup, au revoir.",
    ],
  },
  {
    cle: "inconnu", sens: "entrant", titre: "Une inconnue rappelle (nouveau contact)",
    aide: "Son agence n'est nulle part : « Nouveau contact » doit se remplir tout seul avec son nom et son agence.",
    phrases: [
      "Allô, bonjour, Julie Marchand de l'agence Nouvelle Vague, à Antibes. On m'a transmis votre message.",
      "Bonjour, merci de rappeler. Nous achetons des murs commerciaux loués sur la Côte d'Azur.",
      "Pour l'instant je n'ai rien, mais je rentre un mandat sur un local commercial d'ici trois semaines.",
      "Très bien, je peux vous rappeler à ce moment-là ?",
      "Oui, ou notez mon portable, le 06 12 34 56 78.",
      "Parfait, à bientôt.",
    ],
  },
  {
    cle: "marc_mandat", sens: "entrant", titre: "Marc Démo rappelle : pas de murs, un mandat dans un mois",
    aide: "Une relance doit être proposée à l'échéance du mandat.",
    phrases: [
      "Bonjour, Marc Démo, Riviera Test Immobilier, je vous rappelle.",
      "Merci Monsieur Démo. Vous auriez des murs commerciaux à vendre ?",
      "Pas en ce moment. Rappelez-moi dans un mois, j'aurai peut-être un mandat sur le port.",
      "Entendu, je vous rappelle début décembre.",
    ],
  },
  {
    cle: "point_dossier", sens: "sortant", titre: "Appel rapide : le point avec Sophie Essai",
    aide: "Choisissez « Agence Essai Commerces » avant de lancer : pas d'identification après.",
    phrases: [
      "Allô, Sophie Essai, bonjour.",
      "Bonjour Madame, Jules de Klocka. Je vous appelle pour faire le point sur la boulangerie de la rue de France.",
      "Oui, le propriétaire a baissé son prix, il est maintenant à 380 000 euros.",
      "Très bien, vous pouvez m'envoyer le bail et le dernier avis de taxe foncière ?",
      "Je vous les envoie demain matin.",
      "Merci, bonne journée.",
    ],
  },
  {
    cle: "contact_hors_base", sens: "sortant", titre: "Appel rapide vers un contact pas en base",
    aide: "Paul Martin n'existe pas : créez-le depuis l'écran « Qui appelez-vous ? » (nom, agence, téléphone), puis lancez.",
    phrases: [
      "Allô, Paul Martin, Agence du Levant.",
      "Bonjour Monsieur Martin, Jules de Klocka, on m'a donné votre numéro. Nous achetons des murs commerciaux loués.",
      "Ah oui, j'ai un local loué à une pharmacie, à Menton, loyer 30 000 euros par an.",
      "Vous pouvez m'envoyer la fiche ?",
      "Oui, je vous l'envoie ce soir.",
    ],
  },
];
