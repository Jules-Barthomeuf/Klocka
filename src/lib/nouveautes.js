// « Quoi de neuf » (16 oct. 2026, Jules) : chaque jour, ce qui a été ajouté à
// la plateforme, dit pour l'équipe. Le Dashboard le montre une fois par jour
// et par navigateur, dans une fenêtre au registre de « Tout préparé ».
//
// Une entrée par nouveauté, la plus récente journée en haut. `page` : le nom
// de page (createPageUrl) que « Voir » ouvre ; `requete` : ce qui suit l'adresse.
// Écrit pour l'équipe : ce que ça change pour elle, en une phrase, sans jargon.

export const NOUVEAUTES = [
  {
    jour: "2026-10-16",
    items: [
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
