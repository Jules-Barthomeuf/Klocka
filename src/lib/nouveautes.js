// « Quoi de neuf » (16 oct. 2026, Jules) : chaque jour, ce qui a été ajouté à
// la plateforme, dit pour l'équipe. Depuis le 18 oct. 2026 (Jules : « au lieu de la pop-up, dans le mail »),
// il n'y a plus de fenêtre : ces lignes partent dans le mail du matin « Ma journée » (server/nouveautes-mail.js).
//
// Une entrée par nouveauté, la plus récente journée en haut. `page` : le nom
// de page (createPageUrl) que « Voir » ouvre ; `requete` : ce qui suit l'adresse.
// Écrit pour l'équipe : ce que ça change pour elle, en une phrase, sans jargon.

export const NOUVEAUTES = [
  {
    jour: "2026-10-18",
    items: [
      { titre: "Corriger la fiche, directement dans le tableau", texte: "Dans la Pré-analyse, chaque valeur de la Fiche du bien se modifie d'un clic et relance l'analyse. Changer l'adresse relit le prix et le loyer du marché, et déplace Street View et le plan, désormais à droite du tableau.", page: "Analyse" },
      { titre: "Convertir un fichier dans la Data Room", texte: "Dans un dossier, glissez un fichier sur la Data Room en tenant Maj : une roue s'ouvre, lâchez-le sur un format. PDF en Word, JPG, PNG ou texte ; images en JPG, PNG, WEBP, PDF, compressées ou réduites ; Word et texte en PDF. Tout se fait dans le navigateur, le fichier converti arrive dans vos téléchargements. Aussi par le bouton « Convertir » et le menu ⋯ d'une pièce.", page: "Analyse" },
      { titre: "La police Inter", texte: "Une police de plus dans Personnalisation : Inter, à côté d'Instrument Sans, Figtree et Montserrat. Elle s'applique partout dès qu'on la choisit.", page: "Personnalisation" },
      { titre: "Le mail « Ma journée »", texte: "Chaque matin ouvré vers 8 h : les nouveautés de la plateforme (plus de fenêtre à l'arrivée), vos relances à faire aujourd'hui et ce qu'il y a à faire dans Dossiers. Rien ne part s'il n'y a rien à dire.", page: "Dashboard" },
    ],
  },
  {
    jour: "2026-10-17",
    items: [
      { titre: "La cloche", texte: "En haut à droite, sur toutes les pages : le nombre d'éléments qui attendent une action de votre part (vos dossiers, les relances de vos agents, vos rappels dus). Un clic ouvre la liste, et « Ouvrir » vous mène droit à l'objet.", page: "Dashboard" },
      { titre: "La page Haka", texte: "Le Dashboard devient la page Haka : vous donnez du travail à l'assistant et vous voyez ce qu'il a préparé. Choisissez un dossier dans la saisie pour qu'il l'ait en contexte, lancez une demande d'un raccourci, et retrouvez en bas ce qui attend votre clic et ce qu'il a fait seul.", page: "Dashboard" },
      { titre: "Un menu plus court", texte: "Dashboard, Projets, Dossiers, Appels, puis Relations (Clients, Agents) et Administration (Intelligence, Utilisateurs). Le reste est dans Autre. Paramètres est en bas de la barre, avec le Suivi dedans.", page: "Personnalisation" },
    ],
  },
  {
    jour: "2026-10-16",
    items: [
      { titre: "Dossiers, une nouvelle organisation", texte: "La liste se range en À traiter (à toi d'agir, en attente d'un tiers), Pipeline (Tri, Qualification, Commercialisation, Transaction) et Écartés par AK. Un dossier ouvert montre une frise de huit étapes, son verdict, l'action suivante et, à droite, ses documents, ses livrables et son fil.", page: "Analyse" },
      { titre: "Prospection et Relances, une seule page", texte: "Trois onglets : Aujourd'hui (qui appeler, avec les mails à envoyer à droite), Listes (« Relances dues » en première liste ; le « + » en tête cherche une ville : l'agent IA en crée la liste) et Suivi. Le mode appel est un interrupteur, à droite : allumé, il prend la place de la page.", page: "Prospection" },
      { titre: "Les notes d'appel dans Agents", texte: "Un appel raconté dans le chat s'inscrit maintenant sur la fiche de l'agent, dans Agents, en plus de Monday : dernier contact, résumé, relance. S'il n'est pas au carnet, il y entre.", page: "Agents" },
      { titre: "AK, en bas à gauche", texte: "AK a sa place en bas de la barre : parlez-lui à tout moment. Quand une fiche commerciale arrive, il la pré-analyse et vous l'écrit, la discussion s'ouvre toute seule.", page: "Dashboard" },
      { titre: "Agents", texte: "Tous les agents immobiliers en cartes : un clic, et tout ce qui s'est dit avec lui, chaque appel en entier (transcription ou résumé), et qui de l'équipe l'a appelé.", page: "Agents" },
      { titre: "Clients", texte: "Une fiche par client, nourrie par vos appels : enregistrez l'appel ou collez le résumé, la fiche, Monday et le réseau des mandataires se remplissent.", page: "AdminClients" },
      { titre: "La calculatrice en appel", texte: "Dès qu'un prix ou un loyer est dit au téléphone, elle s'ouvre et calcule le rendement. Elle se déplace où vous voulez.", page: "Prospection", requete: "?partie=appel" },
      { titre: "Le clip d'objection", texte: "Une objection que vous n'avez pas su lever ? Quinze secondes partent sur le Dashboard : l'équipe écoute et propose la réponse.", page: "Dashboard" },
      { titre: "Mes appels", texte: "Vos chiffres et vos graphiques jour par jour, dont votre part de parole pendant les appels.", page: "SuiviAppels" },
      { titre: "Outils", texte: "K-Data s'appelle Outils, et Signaux de vacance y a rejoint les autres.", page: "KData" },
      { titre: "Agenda", texte: "Qui est là cette semaine. Un clic sur un jour : un briefing pour qui revient, ou pour ceux qui restent quand vous partez. Il le lit ce jour-là, dans son Agenda.", page: "Semaine" },
      { titre: "AK vous pose des questions sur vos appels", texte: "Un appel corrigé, pas validé, validé sans appel ou validé trop lentement : votre écran pendant l'appel est rejoué sur le Dashboard, avec un résumé et deux ou trois questions. Vos réponses servent à améliorer le module.", page: "Dashboard" },
      { titre: "La vacance, rue par rue", texte: "Dans Vacance, « Sur la rue » mesure toute une rue d'un bout à l'autre et la coupe en tronçons : on voit lequel est le plus vide, et les locaux à regarder.", page: "Outils" },
      { titre: "La fiche d'un agent", texte: "Un clic sur son nom : combien de fois on s'est parlé, ses fiches reçues, ce qu'il nous dit souvent et les actions à proposer.", page: "Prospection" },
    ],
  },
];

/** Pure : les journées pas encore vues (après `vu`), des sept derniers jours, la plus récente d'abord. */
export function journeesAVoir(vu, aujourdhui = new Date().toISOString().slice(0, 10), nouveautes = NOUVEAUTES) {
  const limite = new Date(new Date(`${aujourdhui}T12:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  return nouveautes.filter((j) => j.jour <= aujourdhui && j.jour >= limite && (!vu || j.jour > vu) && j.items?.length).sort((a, b) => b.jour.localeCompare(a.jour));
}
