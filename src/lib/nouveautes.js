// « Quoi de neuf » (16 oct. 2026, Jules) : chaque jour, ce qui a été ajouté à
// la plateforme, dit pour l'équipe. Depuis le 18 oct. 2026 (Jules : « au lieu de la pop-up, dans le mail »),
// il n'y a plus de fenêtre : ces lignes partent dans le mail du matin « Ma journée » (server/nouveautes-mail.js).
//
// Une entrée par nouveauté, la plus récente journée en haut. `page` : le nom
// de page (createPageUrl) que « Voir » ouvre ; `requete` : ce qui suit l'adresse.
// Écrit pour l'équipe : ce que ça change pour elle, en une phrase, sans jargon.

export const NOUVEAUTES = [
  {
    jour: "2026-10-21",
    items: [
      { titre: "Écrans d'appel harmonisés", texte: "Le rappel, l'appel rapide et l'appel en cours du Mode appel prennent le style des actions proposées : mêmes cartes, mêmes étiquettes, un trait qui relie les étapes, et Stop ou Raccrocher en grand bouton.", page: "Prospection" },
      { titre: "Les actions d'un appel toujours à l'écran", texte: "Après un appel, Email, liste de diffusion et relance sont toujours proposés. Quand l'issue ne les prévoit pas (pas de mail à envoyer, pas intéressé…), ils sont là mais décochés : un clic suffit pour les ajouter.", page: "Prospection" },
      { titre: "Le rappel ne devine plus", texte: "Après « Stop », dites en quinze secondes qui c'était et ce qu'il faut faire : Haka retrouve la fiche d'après votre note (numéro, nom, agence) et prépare la suite. Personne ne correspond : le nouveau contact est déjà rempli.", page: "Prospection" },
    ],
  },
  {
    jour: "2026-10-20",
    items: [
      { titre: "Nouvelle fiche : la rentrer ? Oui / Non", texte: "Quand une fiche commerciale arrive, une fenêtre s'ouvre avec la fiche et le mail : Oui la rentre ; Non demande pourquoi (obligatoire). Haka retient vos réponses et ne propose plus ce qui n'est pas une fiche.", page: "AValider" },
      { titre: "Rappel et appel rapide revus, avec un mode Essai", texte: "L'icône d'appel propose « Essai, sans appel » : un rappel ou un appel rapide se joue tout seul, Haka le lit pour de vrai, rien ne sort. L'écran est celui du Mode appel : la transcription à gauche, le micro à droite. Pendant un rappel, on dit qui appelle dès qu'il se présente ; un appel rapide commence par « Qui appelez-vous ? », avec vos personnes du jour, ou un contact créé en trois champs. « Pas la bonne personne » change de contact sans tout refaire.", page: "Prospection" },
      { titre: "Aujourd'hui : à relancer, à rappeler", texte: "L'onglet Aujourd'hui des Appels est coupé en deux : à gauche ceux à relancer (on s'est parlé, la suite tombe aujourd'hui), à droite ceux à rappeler (on n'a pas eu la bonne personne). Chacun voit ses personnes, « Toute l'équipe » montre tout le monde. « Transcription » ouvre ce qui a été dit, mot pour mot, appel par appel : la transcription est gardée entière.", page: "Prospection", requete: "?partie=journee" },
      { titre: "Voir la fiche avant de la rentrer", texte: "Quand une fiche commerciale arrive, la cloche dit « Une nouvelle fiche commerciale est arrivée ». « Voir » ouvre la fiche ou le mail ; puis « Pré-analyser » ou « Pas une fiche ».", page: "AValider" },
    ],
  },
  {
    jour: "2026-10-19",
    items: [
      { titre: "Ne plus se faire proposer une étape", texte: "Après un appel, chaque étape proposée (Email, Liste de diffusion, Relance…) a une croix : l'étape part de cet appel et ne vous est plus proposée ensuite, dans aucune ville. « Rétablir » la fait revenir. Le micro des appels prend aussi la couleur choisie dans les Paramètres.", page: "Prospection" },
      { titre: "Le projet en aperçu dans le dossier", texte: "Une fois le deal entré dans la plateforme, l'étape Plateforme du dossier montre la carte du projet (photo, étape, prix de revient, rendement, surface), où il en est, et trois gestes : ouvrir le projet, la vue client, le simulateur.", page: "Analyse" },
      { titre: "Le Mode appel toujours à portée dans les Listes", texte: "Dans Appels > Listes, le bouton Mode appel reste à droite des villes, même quand elles sont nombreuses, et la rangée reste en haut de l'écran quand on descend dans une longue liste.", page: "Prospection", requete: "?partie=listes" },
      { titre: "Trois raccourcis de plus sous Haka", texte: "Sur l'accueil de Haka : « Créer un projet », « Drafter un email » et « Créer un dossier Drive », à côté de la pré-analyse, de la data room, de la LOI et du dossier bancaire.", page: "Dashboard" },
      { titre: "Haka en une ou deux lignes", texte: "Paramètres > Haka > Longueur des réponses : « Une ou deux lignes » et Haka ne donne que la réponse, sans liste ni explication.", page: "Personnalisation" },
      { titre: "Le document joint se voit dans le chat", texte: "Un PDF ou une image joints à un message apparaissent en vignette au-dessus de votre question, avec leur type.", page: "Dashboard" },
      { titre: "Appel rapide, et raconter un échange à Haka", texte: "L'icône d'appel en haut à droite propose « Il me rappelle » et « Appel rapide » (vous appelez un agent pour un dossier, un point) : le même écran, la même suite, la fiche agent et l'Intelligence se mettent à jour. Un agent vous a écrit ou parlé sans téléphone ? Racontez-le à Haka dans le chat : l'écran de l'appel s'ouvre sur les actions à valider.", page: "Dashboard" },
      { titre: "La fiche se corrige d'un bloc", texte: "Dans la pré-analyse, modifiez tous les champs que vous voulez : ils s'affichent tout de suite, marqués « modifié ». Une barre en bas compte les changements ; « OK, refaire la pré-analyse » relance tout en une fois, « Annuler » efface le brouillon.", page: "Analyse" },
      { titre: "Vos notifications dans la cloche", texte: "La cloche montre vos notifications sous ce qui vous attend : un clic ouvre la page, la croix en supprime une, « Tout effacer » vide la liste.", page: "Dashboard" },
      { titre: "Haka corrige vraiment les cases du bail", texte: "Quand vous demandez à Haka de corriger une case du bail (loyer de signature, TVA…), dans un projet ou dans les tableaux d'un dossier, la correction s'affiche à l'écran, y compris en vert sous le titre de la clause. Le loyer de signature ne reprend plus celui de la fiche de l'agent : seul le bail compte.", page: "AdminProjets" },
      { titre: "Les fiches reçues attendent votre accord", texte: "Une fiche arrivée par mail n'est plus pré-analysée toute seule : la cloche la montre avec « Pré-analyser » ou « Pas une fiche ». Haka reconnaît aussi mieux ce qui est une fiche commerciale.", page: "AValider" },
      { titre: "Votre couleur de barre, toujours lisible", texte: "Dans Paramètres > Couleurs, « Personnaliser » la barre donne deux curseurs, la teinte et l'intensité ; la barre reste lisible.", page: "Personnalisation" },
      { titre: "Un menu Autre réduit à Feedback", texte: "Offres, Emailing, Présentations et les autres pages rangées dans Autre ne sont plus dans le menu : il ne reste que Feedback. Les pages existent toujours, par leur adresse.", page: "AdminSuggestions" },
      { titre: "Regrouper des dossiers en un seul", texte: "Demandez à Haka « mets le disquaire et le coiffeur rue de Cheverus dans un nouveau dossier » : un dossier à plusieurs lots naît, chaque lot garde sa pré-analyse ; les deux dossiers d'origine sont archivés, rien n'est supprimé.", page: "Analyse" },
      { titre: "Le menu des trois points passe au premier plan", texte: "Dans la liste des dossiers, le menu des trois points s'ouvre par-dessus la page : plus aucune carte voisine ne le cache ni ne le coupe.", page: "Analyse" },
      { titre: "L'icône Appel ouvre deux choix", texte: "En haut à droite, survolez l'icône d'appel : « Il me rappelle » enregistre un appel entrant, « Démarrer les appels » ouvre la Prospection en mode appel.", page: "Prospection" },
      { titre: "Haka répond au milieu, la navigation reste", texte: "Une demande à Haka garde le menu à gauche et le chat au centre ; la colonne de droite n'apparaît que si Haka a produit quelque chose. Dites-lui votre programme du jour : il reprend les étapes et demande par quoi commencer. « Rappelle-moi … » pose un rappel.", page: "Dashboard" },
      { titre: "Une colonne Notes dans les tableaux du dossier", texte: "Bien, Bail, Quittances, Copropriété, Diagnostics et les croisements de la Synthèse ont une colonne Notes : survolez une ligne, « Ajouter », écrivez une note pour l'équipe.", page: "Dossiers" },
      { titre: "Des effets doux dans les dossiers", texte: "La liste des dossiers entre en douceur, les cartes se soulèvent au survol, et quand AK analyse une fiche, son orbe et un reflet sur la phrase montrent que le travail avance.", page: "Dossiers" },
      { titre: "Une alerte quand un agent répond", texte: "Quand un mail arrive sur un dossier en cours (réponse d'un agent, pièces jointes), la personne responsable du dossier reçoit une notification avec le lien. Les nouvelles fiches en prévenaient déjà.", page: "Dossiers" },
      { titre: "Des effets doux, le Simulateur d'abord", texte: "Le Simulateur entre en douceur : le titre, la carte, le rail par la gauche, les blocs l'un après l'autre. Les indicateurs montent vers leur valeur et glissent quand on déplace un curseur, les sections de gauche s'ouvrent et se ferment en douceur. Rien ne bouge si vous avez choisi des animations réduites.", page: "SimulateurRentabilite" },
      { titre: "Le Simulateur, comme dans un dossier", texte: "La page Simulateur reprend le cadre de celui d'un dossier (la carte, le rail à gauche, les onglets soulignés), et la barre de navigation se replie quand on l'ouvre.", page: "SimulateurRentabilite" },
      { titre: "Haka pour les mandataires", texte: "L'accueil des mandataires reprend celui de l'équipe : choisir un de ses dossiers, « Répondre » ou « Produire », et des raccourcis (estimation, mandat, dossier, mail au propriétaire, appel, demandes des clients).", page: "Dashboard" },
      { titre: "Le menu des mandataires, comme celui de l'équipe", texte: "Six entrées : Haka (l'accueil, sur la mise en page de celui de l'équipe), Prospection (avec l'Off-market en onglet), Biens (Estimation, Mandat, Dossiers, Mise en marché en onglets), Clients, Projets, Simulateur ; Feedback dans « Autre », Paramètres en bas de la barre. Le Simulateur entre aussi dans le menu de l'équipe.", page: "Dashboard" },
      { titre: "L'usage de la plateforme, personne par personne", texte: "Suivi > Usage : cinq chiffres et leurs courbes (temps passé, personnes, connexions, durée moyenne, pages), le temps par page et l'heure de la semaine, puis un tableau par personne. Un clic sur une ligne montre ses sessions, page par page, avec le temps passé sur chacune.", page: "Monitoring" },
      { titre: "K-Vacance, la carte des signaux", texte: "K-Vacance reprend les Signaux de vacance : sur une carte, ce qui annonce qu'un local va se libérer, avec le taux de vacance de la zone, de la rue et de la commune. Il n'y a plus qu'une entrée dans les outils.", page: "KVacance" },
    ],
  },
  {
    jour: "2026-10-18",
    items: [
      { titre: "Modifier un projet, comme un dossier en mode IA", texte: "En modification de projet, la barre de navigation reste à gauche, et le chat reprend celui d'un dossier en mode IA : la question au centre, la saisie avec « + » pour joindre une pièce, les sources et l'historique.", page: "AdminProjets" },
      { titre: "Les courbes des clients", texte: "En tête de la page Utilisateurs : le nombre de clients jour après jour (comptes, et ceux qui se sont déjà connectés), et leur temps de connexion, sur 30 jours, 90 jours ou un an.", page: "AdminUtilisateurs" },
      { titre: "Le Suivi dans Administration", texte: "Le Suivi (usage, audience, appels, réunion, mandataires, chat, Haka) n'est plus dans Paramètres : c'est le quatrième onglet d'Administration, après Automatismes.", page: "Monitoring" },
      { titre: "Haka à votre façon", texte: "Paramètres, onglet Haka : son portrait (six au choix), la longueur de ses réponses (très courtes, courtes, détaillées) et les tableaux. Sous chaque réponse, un pouce se pose d'un clic.", page: "Personnalisation" },
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
