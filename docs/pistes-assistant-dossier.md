# Faire appel à l'assistant dans un dossier : les pistes

2 nov. 2026. Jules veut interroger l'IA sur un dossier depuis l'Analyse (« faire appel à l'assistant, c'est trop compliqué à voir »). Le moteur existe déjà : le chat du dossier (espace « dossier », server/ak/app.js) lit le dossier, ses pièces, ses mails et le Drive, connaît l'étape et l'onglet ouvert, et cite ses sources. La question est seulement : par où on l'appelle, et où la réponse s'affiche.

Ce qui est déjà tranché et que ces pistes respectent : plus de Mode IA / Normal ni d'écran coupé en deux à toutes les étapes (29 oct.) ; le chat de l'Offre reste à gauche (c'est son éditeur) ; plus de carte derrière le dossier (2 nov.).

## Où on l'appelle

### 1. La barre flottante en bas (en place le 2 nov.)
Une saisie de chat flottante, en bas au centre du dossier : « Une question sur ce dossier ? ». Envoyer ouvre le panneau à droite avec la réponse.
- Pour : toujours visible, le geste est évident (on écrit), même forme que partout ailleurs dans l'application.
- Contre : cache le bas de la page (une marge le compense) ; croise la pastille « n champs modifiés », posée au même endroit.
- Téléphone : pleine largeur en bas, comme le chat des mandataires.

### 2. La pilule « Assistant » dans l'en-tête (essayée le 2 nov., retirée)
- Pour : discrète, ne cache rien.
- Contre : perdue parmi les gestes du dossier ; Jules ne la voyait pas.

### 3. Le rond flottant en bas à droite
Un rond de 52 px, étincelles, comme le bouton d'un chat de site. Un clic ouvre le panneau.
- Pour : toujours visible, ne cache presque rien, motif connu de tout le monde.
- Contre : un geste de plus avant d'écrire ; le coin bas droit est aussi celui des notifications toast.
- Téléphone : au-dessus de la barre d'onglets, à droite.

### 4. Dans la colonne de droite du dossier
La colonne de 340 px (ColonneDroite : la checklist de la Data Room, les correspondances clients) commence par une petite saisie « Une question sur ce dossier ? », la réponse s'affiche dessous, dans la colonne.
- Pour : à sa place naturelle, dans l'espace « ce que je sais du dossier », sans rien de flottant.
- Contre : la colonne disparaît là où la page prend toute la largeur (Data Room, Simulateur, Offre) ; une réponse longue y est à l'étroit.
- Téléphone : la colonne passe sous le contenu, donc loin.

### 5. Un onglet « Assistant » dans l'Analyse
À la suite de Data Room, Bail, Quittances… Marché, Simulateur.
- Pour : le plus simple à construire, pleine largeur pour lire la réponse.
- Contre : on ne voit plus la grille dont on parle ; l'onglet n'existe qu'à l'étape Analyse.

### 6. Le raccourci clavier
Cmd+K (Ctrl+K) ouvre le panneau, curseur dans le champ, depuis n'importe quel écran du dossier.
- Pour : immédiat pour qui le connaît, ne prend aucune place.
- Contre : invisible ; seulement un complément d'une autre piste.

## Au plus près de ce qu'on regarde

### 7. Sur une case de la grille
Au survol d'une ligne (Loyer annuel, Indexation…), une petite icône « Demander » met la case dans la question : « Loyer annuel, 48 000 €, Bail p. 3 : ». Sur une case à vérifier (ambre), « Pourquoi ? » pose directement la question.
- Pour : la question naît là où le doute naît ; l'assistant sait exactement de quoi on parle.
- Contre : une icône de plus par ligne ; invisible au téléphone (pas de survol), il faut un appui long.

### 8. Sur un texte sélectionné
Sélectionner un passage dans une pièce ouverte (le panneau Source) fait apparaître « Demander à l'assistant ».
- Pour : naturel pour une clause de bail ou une résolution de PV.
- Contre : seulement là où le texte de la pièce s'affiche.

## L'assistant qui vient de lui-même

### 9. « Ce que je remarque », en tête de l'onglet
En arrivant sur Bail ou Copropriété, un encart de trois lignes : ce que l'assistant a relevé (« Le bail se termine dans 14 mois », « Travaux de façade votés en 2025, 38 000 € »), avec « Demander plus » qui ouvre le panneau sur ce point.
- Pour : on n'a même pas à penser à demander ; c'est le geste le plus utile au quotidien.
- Contre : un appel au modèle par onglet ouvert, à mettre en cache et à refaire seulement quand une pièce arrive ; un encart de plus sur la page.

### 10. Depuis l'Accueil, avec le dossier en contexte
Le chat de Haka sur l'Accueil propose le dossier ouvert en dernier comme sujet (« Sur Tabac · Sète ? »).
- Pour : rien de nouveau dans le dossier.
- Contre : il faut quitter le dossier ; c'est le détour qu'on veut éviter.

## Où s'affiche la réponse

- **Panneau à droite (en place)** : la grille reste visible, la conversation se garde tant que le dossier est ouvert.
- **Sous la barre, en bulle qui s'agrandit** : une réponse courte reste au-dessus de la barre, sans panneau ; une réponse longue l'ouvre.
- **Dans la colonne de droite** : seulement avec la piste 4.

## Ce que je recommande

La barre en bas (1) pour appeler l'assistant, la question sur une case (7) pour demander au bon endroit, et le raccourci (6) en complément. Puis « Ce que je remarque » (9) quand l'usage aura montré les questions qui reviennent : c'est le plus utile, mais aussi le seul qui coûte à chaque ouverture. À régler tout de suite pour la barre : la pastille « n champs modifiés » passe au-dessus d'elle.
