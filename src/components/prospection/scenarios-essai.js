// Les cas de figure du mode Essai (8 oct. 2026) : on en choisit un, l'appel se
// joue tout seul, phrase par phrase, comme une vraie transcription ; AK le
// lit pour de vrai et propose ses actions. Rien n'est écrit dans Monday,
// aucun mail ne part. `attendu` dit ce qu'on doit voir, pour vérifier d'un
// coup d'œil ; `notes` remplit les notes de l'appel (elles font foi) ;
// `motif` joue l'appel comme une relance (Bien retenu, Bien refusé).

export const GROUPES_ESSAI = [
  ["personne", "Personne au bout du fil"],
  ["sans_bien", "On s'est parlé, pas de bien"],
  ["bien", "Il a un bien"],
  ["non", "Pas intéressé"],
  ["cas", "Cas particuliers"],
  ["relance", "Relances"],
];

export const SCENARIOS_ESSAI = [
  {
    cle: "pas_de_reponse", groupe: "personne", titre: "Pas de réponse",
    phrases: [],
    attendu: "Issue « Pas de réponse » ; relance dans 2 jours ouvrés, à l'autre moment de la journée ; rien dans Monday.",
  },
  {
    cle: "repondeur", groupe: "personne", titre: "Répondeur, message laissé",
    phrases: [
      "Bonjour, vous êtes bien sur la messagerie de l'agence, nous ne pouvons pas vous répondre pour le moment.",
      "Laissez-nous votre message après le bip sonore.",
      "Bonjour, c'est Jules de Klocka, nous achetons des murs commerciaux loués et cherchons des agents partenaires.",
      "Je vous rappelle dans quelques jours, ou rappelez-moi au 06 49 78 81 76. Bonne journée.",
    ],
    attendu: "Issue « Répondeur » ; relance à J+3 ; rien dans Monday.",
  },
  {
    cle: "mauvais_numero", groupe: "personne", titre: "Mauvais numéro",
    phrases: [
      "Allô ?",
      "Ah non, ici ce n'est pas une agence immobilière, c'est un cabinet dentaire.",
      "Vous devez faire erreur, au revoir.",
    ],
    attendu: "Compté comme un appel non abouti ; à changer en « Pas intéressé » ou passer l'agence si le numéro est faux.",
  },
  {
    cle: "pas_de_bien", groupe: "sans_bien", titre: "Pas de bien pour l'instant",
    phrases: [
      "Bonjour, oui c'est Marc Démo, le gérant.",
      "Non, en ce moment je n'ai rien en murs commerciaux, on fait surtout du résidentiel.",
      "Mais envoyez-moi ce que vous cherchez, je garde ça sous le coude si quelque chose rentre.",
    ],
    attendu: "Issue « Pas de bien pour l'instant » ; mail de présentation ; liste de diffusion ; point du mois à J+30.",
  },
  {
    cle: "date_dite", groupe: "sans_bien", titre: "Pas de bien, rappeler jeudi prochain",
    phrases: [
      "Bonjour, Sophie Essai à l'appareil, je suis la gérante.",
      "Là tout de suite je n'ai rien qui corresponde, je suis en rendez-vous toute la semaine.",
      "Rappelez-moi plutôt jeudi prochain, je serai au bureau le matin.",
    ],
    attendu: "Relance au jeudi prochain, avec « Pourquoi cette date » : la phrase exacte puis le contexte.",
  },
  {
    cle: "mandat_a_venir", groupe: "sans_bien", titre: "Pas de bien, un mandat dans 2 à 3 semaines",
    phrases: [
      "Bonjour, oui c'est moi, Marc Démo.",
      "Aujourd'hui je n'ai pas de bien pour vous, mais je dois rentrer en mandat un commerce bien placé.",
      "C'est une boulangerie louée en centre-ville, ça devrait se faire d'ici deux à trois semaines.",
      "Envoyez-moi une présentation de votre activité, je vous recontacte dès que c'est signé.",
    ],
    attendu: "Relance à l'échéance du mandat ; « Pourquoi cette date » cite « d'ici deux à trois semaines » ; mail de présentation.",
  },
  {
    cle: "veut_mail", groupe: "sans_bien", titre: "Il veut d'abord un mail",
    phrases: [
      "Oui bonjour, écoutez je n'ai vraiment pas le temps là.",
      "Envoyez-moi un mail avec ce que vous cherchez exactement, je regarderai ce soir.",
      "Mon adresse c'est contact arobase riviera tiret test point invalide.",
    ],
    attendu: "Issue « Pas de bien pour l'instant » ; mail de présentation à l'adresse dite ; relance.",
  },
  {
    cle: "a_un_bien", groupe: "bien", titre: "A un bien intéressant",
    phrases: [
      "Bonjour, Sophie Essai, gérante de l'agence.",
      "Oui justement, j'ai des murs de pharmacie loués à Nice, rue de France.",
      "Le prix est de quatre cent cinquante mille euros, le loyer vingt-huit mille par an, bail renouvelé en 2023.",
      "Je vous envoie la fiche commerciale dans la journée.",
    ],
    attendu: "Issue « A un bien intéressant » ; mail qui demande la fiche commerciale seule ; relance J+3 ouvrés annulée si la fiche arrive ; bien évoqué noté.",
  },
  {
    cle: "bien_et_mandat", groupe: "bien", titre: "Un bien, et un mandat annoncé",
    phrases: [
      "Bonjour, Marc Démo à l'appareil.",
      "J'ai un local de quatre-vingts mètres carrés loué à une banque, à Antibes, je vous envoie la fiche.",
      "Et j'aurai aussi une supérette en mandat d'ici la fin du mois, je vous en parlerai.",
    ],
    attendu: "Deux relances : la fiche à J+3 ouvrés, puis le point sur le mandat à la fin du mois.",
  },
  {
    cle: "documents", groupe: "bien", titre: "Un bien, on demande les documents",
    phrases: [
      "Oui, j'ai un commerce de bouche loué, murs à vendre à Cannes.",
      "Vous pouvez m'envoyer le bail, les trois dernières quittances et la taxe foncière ?",
      "Oui pas de problème, je vous envoie tout ça avec la fiche.",
    ],
    attendu: "Mail de demande des pièces du dossier (bail, quittances, taxe foncière), pas seulement la fiche.",
  },
  {
    cle: "pas_interesse", groupe: "non", titre: "Pas intéressé",
    phrases: [
      "Bonjour.",
      "Non merci, on ne travaille pas avec des investisseurs, on a nos propres clients.",
      "Ne me rappelez plus s'il vous plaît.",
    ],
    attendu: "Issue « Pas intéressé » ; « Ne plus appeler » ; aucune relance.",
  },
  {
    cle: "nouveau_contact", groupe: "cas", titre: "Il donne un autre contact",
    phrases: [
      "Bonjour, ce n'est pas moi qui m'occupe du commerce ici.",
      "Appelez ma collègue Sophie Martin, c'est elle la responsable des locaux commerciaux.",
      "Son portable c'est le 06 12 34 56 78.",
    ],
    attendu: "Action « Ajouter Sophie Martin et l'appeler en tête de file ».",
  },
  {
    cle: "email_notes", groupe: "cas", titre: "Email mal entendu, corrigé dans les notes",
    phrases: [
      "Oui c'est Marc Démo, envoyez-moi vos critères.",
      "Mon mail c'est marc point demo, arobase, riviera test, point invalide.",
    ],
    notes: "email : marc.demo@riviera-test.invalid",
    attendu: "L'email des notes (marc.demo@riviera-test.invalid) remplace celui entendu, dans le mail et dans Monday.",
  },
  {
    cle: "nom_notes", groupe: "cas", titre: "Nom difficile, précisé dans les notes",
    phrases: [
      "Bonjour, madame Lefèvre-Duponchel à l'appareil, je gère l'agence.",
      "Pour l'instant rien en commerce, rappelez-moi dans un mois.",
    ],
    notes: "Nom exact : Isabelle Lefebvre-Duponchelle",
    attendu: "Interlocuteur « Isabelle Lefebvre-Duponchelle », tiré des notes ; relance dans un mois.",
  },
  {
    cle: "contradiction", groupe: "cas", titre: "Il se reprend sur la date",
    phrases: [
      "Rappelez-moi lundi.",
      "Non attendez, lundi je suis en visite toute la journée, plutôt mardi après-midi.",
    ],
    attendu: "Relance au mardi ; la date retenue est la dernière dite.",
  },
  {
    cle: "bien_retenu", groupe: "relance", titre: "Relance : bien retenu, agent prévenu", motif: "bien_retenu",
    phrases: [
      "Bonjour Marc, c'est Jules de Klocka.",
      "Bonne nouvelle : on retient votre pharmacie de la rue de France, on lance l'analyse.",
      "Super, merci beaucoup, je vous envoie les documents demain.",
    ],
    attendu: "Issue « Agent prévenu » ; point du mois à J+30 ; pas de mail.",
  },
  {
    cle: "bien_refuse", groupe: "relance", titre: "Relance : bien refusé, il a un autre bien", motif: "bien_refuse",
    phrases: [
      "Bonjour Sophie, c'est Jules de Klocka, je vous appelle pour le kebab de l'avenue Jean Médecin.",
      "Malheureusement on ne peut pas aller plus loin, le prix est trop élevé pour le loyer.",
      "Dommage, mais j'ai autre chose : un local loué à une agence bancaire à Antibes, je vous envoie la fiche.",
    ],
    attendu: "Issue « A un bien intéressant » (un autre bien) ; demande de la fiche ; relance J+3 ouvrés.",
  },
];

export const scenarioEssai = (cle) => SCENARIOS_ESSAI.find((s) => s.cle === cle) || null;
