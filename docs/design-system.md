# Design system Klocka

À lire avant tout choix visuel : une page, un composant, une couleur, une marge.
Ce fichier dit **quoi choisir** ; les valeurs vivent dans le code
(`src/design/jetons.json`, `src/design/jetons.js`, `tailwind.config.js`,
`src/index.css`). Une valeur ne se recopie jamais ici : si elle change, elle
change là-bas.

Quand une demande de Jules tranche un point de design, on l'ajoute ici, avec
la date, pour ne plus avoir à la reposer.

---

## 1. L'esprit

- **Sombre, sobre, une seule couleur d'accent.** Le fond est presque noir,
  le texte gris clair, l'accent est la *menthe*. Tout le reste est du gris.
- **Du verre plutôt que des cartes.** Les surfaces sont de l'encre diluée
  posée sur le fond (`surface`, `relief`, `trait`). Une carte opaque est
  l'exception (infobulle, menu posé sur un graphique).
- **Des lignes plutôt que des cartes** pour toute liste d'objets (listes de
  prospection, estimations, mandats). Les cartes à grille de points
  (`GridPatternCard`) sont réservées aux choix à présenter (skills du chat).
- **Le chat au centre.** Une page de travail s'ouvre sur une question et le
  chat ; le travail se fait en parlant, l'écran montre ce qui se construit.
- **Rien d'inutile.** Pas de texte qui répète ce que l'écran montre déjà (pas de
  « ouvrez l'avis » quand l'avis est affiché à côté), pas de bouton qui ne sert
  à rien à cet endroit.

## 2. La couleur

Source unique : `src/design/jetons.json` (thème sombre dans `couleurs`, clair
dans `couleurs_clair`). Les noms disent **le rôle**, pas la teinte.

- **Jamais d'hexadécimal dans le JSX** : le lint le refuse. On écrit la classe
  Tailwind du rôle (`text-ardoise`, `bg-menthe`, `border-bord-doux`), ou
  `J["rôle"]` en style en ligne (`import { J } from "@/design/jetons"`).
  `JL` (valeurs littérales) seulement pour le SVG en attributs et le canvas.
- **L'accent est personnalisable** (Personnalisation : menthe, sauge, bleu…) :
  `menthe` est un rôle, jamais une teinte supposée. Ne pas coder « vert ».

| Rôle | Jetons | Pour |
|---|---|---|
| Fond | `fond`, `fond-halo` | La page. Le halo de Layout passe dessous. |
| Surfaces | `surface`, `relief`, `surface-pleine` | Verre ; `surface-pleine` quand il faut couvrir. |
| Texte | `encre` > `craie` > `ardoise` > `brume` | Du plus fort au plus pâle. `brume` est le plancher lisible (contraste 4,8). |
| Accent | `menthe`, `-survol`, `-clair`, `-fonce`, `-pale`, `sur-menthe` | Action principale, état « fait », sélection. `sur-menthe` = texte posé sur menthe. |
| Traits | `trait` (8 %) < `bord` < `bord-doux` (16 %) < `bord-vif` | `trait` pour séparer des lignes ; `bord-doux` pour une séparation qui doit se voir (chat / aperçu). |
| Chat | `barre`, `barre-relief` | Barre de saisie, bulles envoyées, fond derrière un aperçu (les trois identiques, 2 oct.). |
| Navigation et outils | `rail`, `rail-actif` | Barre latérale, panneaux d'outils (atelier, menu de style). |
| États | `alerte` (retard, erreur, suppression), `ambre` (attention) | Jamais pour décorer. |
| Métier | `emplacement-1/1bis/2`, `appel`, `ecrire`, `surveiller` | Leur sens et rien d'autre. 1 bis est orange, distinct du rouge. |

**Fond anthracite** : la barre de chat, les bulles envoyées et le fond
derrière un aperçu (jeton `barre`) prennent la teinte de la barre de
navigation (`rail`), sinon ils se confondent avec le fond. Posé dans
`appliquerPrefs` (`src/lib/personnalisation.js`). Décision du 3 oct. 2026.

**Présentation côté client** (13 oct. 2026) : l'équipe l'envoie depuis l'éditeur
(« Envoyer au client », le client du projet pré-coché, cases à cocher en
lignes) ; elle apparaît dans la page Présentations du client
(`MesPresentations`). Ouverte, elle prend tout l'écran : l'éditeur seul, sans
chat, avec la même pilule Édition / Lecture / Sources, le plein écran,
« Enregistré automatiquement » sous le titre, un « ? » qui rouvre
l'explication des modes (montrée une fois à la première visite) et le bouton
plein menthe « Une question », qui range la question dans le Feedback. Ni PDF
ni envoi côté client ; ses sources n'ont ni liens internes ni écarts de retouche.

**Flux sur la diapositive Emplacement** (13 oct. 2026) : en bas de la carte,
un bandeau sombre (`rgba` du fond de carte à 90 %, rayon 18, filet) en deux
colonnes, Flux piéton et Flux voiture : étiquette sauge, densité en 20 px
(« Très élevée (5/5) »), puis Heure creuse et Heure de pointe en lignes à filets.
Une valeur qu'aucune source ne donne s'écrit « Non estimé ».

**Contraste de la barre de chat** (12 oct. 2026) : dans l'écran scindé (chat à
côté d'un document : `html.k-sans-barre`), la barre de chat et les bulles
envoyées se posent sur le fond de la page ; avec le noir chaud d'origine elles
tombaient à 1,10 du fond. Elles prennent alors `--k-barre-ecart-rgb`, la teinte
de barre écartée du fond jusqu'à un rapport de 1,3 (`ecarterDuFond`,
`src/lib/personnalisation.js`) : plus claire sur fond sombre, plus foncée sur
fond clair. Ailleurs (dashboard, accueil d'une page, listes), la barre de chat
garde la teinte de la barre latérale, telle quelle ; les panneaux en `bg-rail`
aussi.

**Couleur de la barre** : chacun choisit, dans Compte, la teinte de la barre
latérale par mode (teintes de `barres` dans `jetons.json`, ou n'importe quelle
couleur au sélecteur). Tout panneau posé en `bg-rail` la suit : listes de la
Prospection et des Relances, mode appel, dossiers, fiches, et la barre de chat
(`barre`). Le fond qui porte des cartes s'écrit donc en `bg-rail`, jamais en
`bg-fond` ni en couleur figée, pour suivre ce choix. Décision du 9 oct. 2026.

**La ligne Monday** : dans l'étape « Contact Monday » des actions proposées,
la ligne s'affiche au dessin de Monday (fond blanc, colonnes dans l'ordre du
tableau, étiquettes de statut pleines, liens bleus), avec les teintes de
`monday` dans `jetons.json`, seule exception au thème de l'application : la
ressemblance met l'analyste en confiance. Décision du 9 oct. 2026.

**Thème clair** : tout ce qui passe par un jeton suit seul. Une couleur figée
(une barre noire) doit avoir sa variante claire dans `src/index.css`
(exemple : `.k-barre-apercu`, noire en sombre, `surface-pleine` en clair),
sinon le texte du thème devient illisible dessus.

## 3. Le texte

Police : `font-sans` (variable `--k-police`, Instrument Sans par défaut).
Sept pas (`jetons.texte`), et on s'y tient :

| Pas | Taille | Emploi |
|---|---|---|
| étiquette | 11 px | Capitales, `tracking-[.14em]` à `[.18em]`, `text-brume`. |
| note | 12,5 px | Métadonnées, statuts, aides sous un champ. |
| table | 13,5 px | Détail d'une ligne, tableaux, texte secondaire. |
| corps | 15 px (14–14,5 dans les panneaux) | Texte courant, messages du chat (16 px dans le fil). |
| chiffre | 18 px | Un nombre mis en avant. |
| intertitre | 20–24 px | Titre de section (« Vos estimations »). |
| titre | `clamp(22px, 2.1vw, 30px)`, `font-normal`, `tracking-[-0.02em]` | La question d'une page (« Quel bien estimez-vous ? »). |

- Titre d'une ligne de liste : 16 px `text-encre`. Son détail : 13,5 px
  `text-ardoise`, champs séparés par « · ».
- Les poids restent légers : `font-normal` pour les titres, `font-medium` à la
  rigueur sur un bouton. Pas de gras pour attirer l'œil : la couleur suffit.
- Chiffres alignés : `tabular-nums`. Nombres et dates en `fr-FR`.
- Téléphone : tout champ de saisie en 16 px (`max-md:text-[16px]`), sinon iOS
  zoome.

## 4. Les formes

- Trois rayons (`jetons.rayons`) : `rounded-champ` (10 px, champs),
  `rounded-bloc` (20 px, blocs), `rounded-full` (pastilles, boutons, onglets).
  Les menus et panneaux flottants : 14 px.
- Ombres rares et douces : un menu flottant `shadow-[0_18px_40px_rgb(0_0_0/0.18)]`.
- Icônes : lucide-react, `h-3.5 w-3.5` dans le texte, `h-4 w-4` dans un bouton.

## 5. Les composants

**Boutons**
- Principal : `rounded-full bg-menthe text-sur-menthe hover:bg-menthe-survol`,
  `h-9`/`h-10`, `px-4`/`px-5`, 13–14 px. Un seul par zone.
- Secondaire : `rounded-full border border-trait text-craie hover:border-menthe hover:text-encre`, fond transparent.
- Icône : `grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre`, fond transparent (`style={{ background: "transparent" }}`), `aria-label` et `title` toujours.
- Gestes d'une ligne (appeler, fait, reporter…) : cachés au repos à la souris
  (`opacity-0 group-hover:opacity-100 focus-within:opacity-100`), toujours
  visibles au doigt (`max-md:opacity-100`).

**Onglets** : pilule segmentée (`rounded-full bg-rail-actif p-1`, onglet actif
`bg-surface-pleine text-encre`). Pour des documents rangés (listes de
prospection) : le classeur, onglets en haut, l'actif raccordé à la page.

**Listes d'objets** (référence : « Vos mandats », « Vos estimations ») :
- encadrées `border-y border-trait`, lignes séparées `border-t border-trait`,
  `px-2 py-5`, pas de fond ;
- à gauche le titre et le détail ; à droite l'avancement, `w-[260px]` :
  libellé de l'étape (14 px `text-encre`) et `i/n` (`text-ardoise
  tabular-nums`), puis une barre de `n` segments `h-[5px] gap-1 rounded-full` :
  passé `bg-menthe`, en cours `bg-menthe/45`, à venir `bg-encre/[0.12]`, la
  dernière étape atteinte pleine ;
- menu « ⋯ » en bout de ligne ; un clic sur la ligne rouvre l'objet (sa
  conversation).

**Largeur des pages** : une page d'accueil ou de conversation reste centrée
(`max-w-[1100px]`) ; un **tableau** (les listes de prospection, avec leurs
colonnes) prend **toute la largeur** de la page, seulement bordé des marges
`px-5 md:px-8` (décision du 2 oct. 2026 : « trop resserré »).

**Panneaux secondaires** (fiche d'un bien, carte de détail à côté d'une
conversation, fenêtre) : fond à grille de points, classe `.k-grid` ou composant
`GridSurface` (`src/components/ui/grid-surface.jsx`). Points de 1 px, sans
lignes, pas de 14 px, rien dans une marge de 14 px au bord ; la grille ne défile pas et ne capte pas les clics. Pas et marge en
variables (`--k-grid-pas`, `--k-grid-marge`, ou `pas` / `marge` du composant),
couleurs dans `src/index.css` avec leur variante claire. Les fenêtres de
`ui/dialog` et `ui/alert-dialog` l'ont d'office. Décision du 2 oct. 2026.
Dans une zone à points (panneaux, listes de prospection, barre latérale), pas
de trait gris horizontal entre les rangées ni sous les intercalaires : les
points et l'espacement séparent ; seuls les tableaux gardent leurs lignes. La
force des points se règle dans Compte (curseur Intensité, `--k-grid-force`).
Les blocs de Compte défilent avec la page, aucun n'est collant. Décisions du
2 oct. 2026.
Les listes de prospection du mandataire (onglet Listes) prennent le dessin des
Listes de la Prospection de l'admin (décision du 9 oct. 2026, qui remplace
celle du 5 oct.) : classeur sur `bg-rail` (intercalaires `bg-surface`, l'ouvert
raccordé, le compte sur chaque intercalaire, la croix de suppression sur
l'ouvert, en fenêtre de confirmation), quatre blocs de chiffres
(propriétaires, % fait, RDV, à appeler), la recherche en pilule et les filtres
en pilule segmentée, le compte et les actions à droite, la barre des cochées
encadrée, le tableau sans traits verticaux, la ligne cochée `bg-menthe/[0.05]`,
l'aide sous le tableau avec sa flèche. Pas de corbeille par ligne : on coche,
puis « Retirer de la liste ».

**Carte de dossier** (« Vos dossiers » du mandataire, et le haut d'un dossier
ouvert) : le dessin de la carte de Klocka (Analyse, `CarteDossierAdmin`).
Rayon 18 px, bandeau de 112 px à grille de points (`k-grid-toujours`), jamais
de photo ; l'état en pastille 12 px à gauche, la date complète à droite, le
menu ⋯ au bas du bandeau (ouvrir, envoyer à un analyste). Corps
`px-5 pt-[18px] pb-5` : titre 17 px medium, pastille « Chez <analyste> » puis
ville, surface et prix en 13 px, pièces obligatoires en segments de 4 px, pas
de bouton. Grille de trois colonnes, écart 18 px. Décisions du 3 oct. 2026.
Côté admin (Dossiers), même carte avec un bandeau de 112 px dont les points
restent toujours visibles derrière la pastille d'étape, quel que soit le réglage
de grille dans Compte (`.k-grid-toujours`). Décision du 3 oct. 2026.

**Secteurs sur une carte** (mandataires) : chaque secteur a sa couleur et son
motif (hachures pour le premier, puis points, quadrillage, hachures inverses,
croisillons, horizontales, verticales, cercles), dessinés en SVG sous le
contour noir ; jamais de nom posé sur la carte. La liste montre la même
pastille (`MotifSecteur`). Décision du 9 oct. 2026.

**Supprimer** : toujours une fenêtre de l'application (`ui/alert-dialog`),
jamais `window.confirm` : titre « Supprimer … ? », ce que la suppression
retire, « Annuler » et le bouton d'action en `bg-alerte`. Décision du
9 oct. 2026.

**État vide** : une phrase `text-brume` centrée qui dit quoi faire
(« Aucun mandat encore : dites au chat quel mandat vous préparez. »).

**Vos présentations** (maquette de Jules, 12 oct. 2026, à reproduire telle
quelle) : 750 px de large, son propre dessin (pas `LigneDocument`). En tête,
« Vos présentations » 19 px medium et le nombre en 15 px `ardoise`, « Tout
afficher » à droite (14 px `craie`, au-delà de quatre lignes). Colonnes Nom,
Modifié (137 px), PDF (170 px) et ⋯ (43 px), titres en 12,5 px `brume` sur
41 px. Lignes de 73 px, filets `border-trait` : vignette 70 × 46 rayon 6
(photo, ou `bg-surface` et icône d'écran), titre 15 px medium, détail 13 px
`ardoise`. La date en tête de phrase (`depuisCourt` : « À l'instant », « Il y a
48 min », « Hier », « Il y a 9 jours » jusqu'à un mois). Le PDF : « Génération
9/14 » en `bleu` 13 px pendant l'export, un bouton de 34 px rayon 7
(`bg-surface`, `border-bord-doux`, flèche et date du dernier export) qui
télécharge, ou « Non exporté » en `brume`. L'aperçu et la suppression sont
dans le menu ⋯ ; « partez de la liste des projets » dans la phrase de la
liste vide ouvre le choix d'un projet.
Le 13 oct. 2026 : la liste se pose sur un panneau `bg-rail` (la teinte de la
barre de navigation, qui suit le choix de Compte), `rounded-[14px]`, 20 px de
marge, sans filet sous la dernière ligne.

**Fenêtres (pop-up)** : centrées sur la zone de contenu, pas sur l'écran
(`md:left-[var(--k-barre-largeur)]`) ; voile sombre flouté ; Échap et clic
dehors ferment. Bordure franche (`border-bord-vif`).

**Accueil du mandataire** (`mandataire/AccueilMandataire.jsx`) : à son
arrivée, une fenêtre par étape (« Bienvenue · étape 1 sur n »), un seul
bouton « Valider », pas de fermeture tant que ce n'est pas réglé ; chaque
réglage se retrouve ensuite dans Compte, où chaque case s'enregistre aussitôt.
Première étape : « Où cherche votre agent » (villes Klocka verrouillées en
pastilles menthe, les autres communes du secteur en cases). 5 oct. 2026.

**L'éditeur de présentation** (12 oct. 2026, Jules : « comme dans
l'estimation ») : la diapositive en grand, rien de figé autour. Un élément
cliqué en édition ouvre son menu « Styles » flottant en haut à droite de la
scène (`bg-rail`, 14 px, `border-trait`, ombre douce), comme celui de l'avis
de valeur ; la croix, Échap ou un clic dans le vide le ferment. Le panneau des
diapositives est fermé par défaut, il s'ouvre et se ferme par son bouton, sans
phrase d'aide. L'éditeur est un écran dans l'écran : une carte
(`rounded-[14px] border-bord-doux bg-rail`, 8 px de marge) posée sur le fond de
la page, d'une seule teinte, sa barre du haut et sa scène comprises (le fond
choisi dans Personnalisation n'y entre pas) ; le chat garde le fond de la page.
La poignée entre les deux se tire pour régler la largeur du chat (300 px au
moins, gardée dans le navigateur ; double-clic pour revenir à 420 px).

**Installer l'application** (`InstallerApp.jsx`, 12 oct. 2026) : pour tout le
monde, un instant après l'arrivée, tant que l'application n'est pas ouverte
depuis l'écran d'accueil. Une quête : le téléphone reconnu (pilule iPhone ·
iPad / Android), une carte par geste qui se coche (pastille menthe, « Fait »,
la prochaine marquée « À vous »), la barre à segments des listes et `i/n` ;
la fin se fête (trophée menthe, confettis aux couleurs des jetons, « Badge
débloqué »). Sous Chrome Android, « Installer en un geste ». « Plus tard » la
repousse d'une semaine ; finie, elle ne revient plus. Au téléphone, elle
monte du bas de l'écran.

**Plein écran** (éditeur ouvert sur téléphone) : rendu par
`createPortal(…, document.body)`, `fixed inset-0 z-[70]`, fond opaque, la page
derrière ne défile plus. Jamais dans un conteneur animé : il s'y calerait.

**Mode téléphone** (6 oct. 2026) : l'icône téléphone du compte, en bas de la
barre latérale (bureau seulement), ouvre la page en cours dans un cadre de
téléphone (`components/ApercuTelephone.jsx` : iPhone 15, petit Android, Pro
Max). C'est le vrai rendu : les `max-md:` suivent la largeur du cadre. Avant de
livrer un écran, le regarder là.

**Notifications** : `poser(ton, titre, opts)` de `src/components/ui/avis.jsx`
(ou `toast.success`…). Toutes ont la même forme (décision du 3 oct. 2026) :
une pilule sombre, un point coloré pour le ton (vert succès, accent
information, ambre, alerte), la phrase sur une ligne, une précision
éventuelle dessous, et « Voir » à droite quand il y a quelque chose à ouvrir.
Pas de croix : un clic sur la pilule la referme. Phrases courtes :
« Dossier transféré à Nora ».
Depuis le 9 oct. 2026 : en haut au centre, la pilule des boîtes connectées,
précision à la suite sur la même ligne, petite croix en haut à gauche.
Le 10 oct. 2026 : toutes de la même largeur (`min(520px, 100vw - 32px)`),
sur une ligne ; un texte trop long finit par « … » et passe sur deux lignes
au survol, la pile faisant place à la seconde ligne.

**Éditeur de projet** (décision du 5 oct. 2026) : tout chiffre de la page de
gauche se modifie au clic (`ValeurEditable` pour un champ du projet,
`ValeurForcee` pour une valeur calculée ou lue ailleurs, rangée dans
`valeurs_forcees` ; vide, elle revient au calcul). Toute carte se masque au
survol (`Bloc`, clé `bloc:<id>` dans `champs_masques`) ; masquée, elle reste en
pointillé dans l'éditeur avec « Afficher ». Une donnée n'a qu'une case dans le
panneau de droite : le loyer dans Simulateur, l'échéance et la prise d'effet
dans Analyse du bail, « en place depuis » dans Locataire, les chiffres du
marché dans Marché.

**Emailing** (refonte du 6 oct. 2026) : cinq onglets (Campagnes, Séquences,
Contacts, Templates, Statistiques) dans le sélecteur translucide. Un email a sa
propre palette figée (`src/lib/email-design.js`, trois designs : Clair, Menthe,
Sombre), comme les documents imprimés. L'éditeur (`components/emailing/
EditeurEmail.jsx`) : en haut l'objet et l'aperçu avec leur compteur et
« Insérer une variable » (valeur de repli `{{prenom | "…"}}`) ; à gauche les
blocs (glisser-déposer, dupliquer, condition d'affichage), à droite l'aperçu
exact (ordinateur ou téléphone, « Voir en tant que… ») ; AK en panneau
repliable à droite, qui propose et n'applique qu'au clic. Une campagne se crée
en quatre étapes visibles en haut ; une séquence se lit en timeline verticale
(déclencheur, puis une carte par email, « + » entre deux cartes), le chat
d'AK en panneau repliable à gauche. Le module suit le thème et le halo.
Les newsletters, à gauche de leur page, se rangent en lignes et non en cartes :
filets `border-t border-trait`, titre 15 px (`encre` pour la choisie, `craie`
sinon), détail 13 px `ardoise`, prochain envoi 12,5 px `brume`, la choisie
marquée d'un trait menthe de 2 px à gauche, la corbeille au survol. Décision
du 12 oct. 2026 (« les petites cases ne vont pas avec le reste »).

**Liste des documents d'une page d'éditeur** (12 oct. 2026, d'après la liste des
projets de Claude Design) : Présentations, Offres, Estimation et Mandat
partagent `components/ui/liste-documents.jsx`. Une ligne par document, sous
des titres de colonnes en 12,5 px `text-brume` (Nom, Modifié, Auteur, et
Avancement quand la page en a un) : à gauche l'aperçu de 86 × 54 px
(`Vignette` : la photo de couverture pour une présentation, une page blanche
à lignes et bandeau pour une lettre, un avis ou un mandat), le titre en 16 px
`text-encre` et son détail en 13,5 px `text-ardoise`, la date relative (« il y
a 4 jours », puis « 4 oct. » au-delà de huit jours), l'auteur (`Auteur` :
pastille d'initiale, « Vous » pour soi), l'avancement à 260 px, le menu ⋯.
Pas de carte : filets `border-t border-trait`. Une page qui met un bouton de
plus à droite (le PDF des présentations) donne `reserve` en pixels.

**Présentations bancaires** (12 oct. 2026) : la page Présentations prend
l'écran scindé d'Offres et du Mandat, avec le chat d'AK à gauche et la
présentation à droite (`components/presentations/`). Le modèle est le « Deck
complet » de Jules (artefact « Présentation bancaire Klocka », 12 oct.) :
seize diapositives de 1280 × 720, un panneau sauge à gauche (le chiffre ou le
titre qui porte la diapositive, l'accroche, la note, calés en bas), une carte
sombre à droite (le détail), une barre noire en bas (logo, étape, frise à
seize repères, compteur, deux flèches rondes), le numéro en filigrane (390 px,
encre à 10 %). Sa palette est celle du dossier, dans
`presentation-bancaire.css`, comme un document imprimé ; les mesures communes
à l'écran et au PPTX sont dans `src/lib/presentation-modele.js`.

Comme dans l'artefact, le deck est **un seul cadre** (`Deck.jsx`) qui
contient les seize diapositives sur trois bandes (cartes tous les 740 px,
textes de gauche tous les 500 px, filigranes) et une seule variable d'état,
le numéro courant : changer de diapositive fait glisser les bandes (1,3 s).
Deux modes, en pilule dans la barre : **édition** (un clic sur un élément le
choisit, cadre sauge ou encre, le texte se retape sur place, « + » et « × »
sur les listes, une photo se change au clic) et **lecture** (flèches,
repères, sommaire et ← → naviguent ; cascade des éléments, dézoom des photos,
barres qui poussent, repère qui pulse, inclinaison 3D à la souris ; plein
écran). À droite du deck, le panneau de l'atelier, comme pour l'avis de
valeur (`PanneauDeck.jsx`, `bg-rail`, 300 px) : onglet Diapositives (aller,
masquer, monter, descendre, éléments masqués) et onglet Élément (taille en
px, gras, italique, alignement, couleur de la palette du deck ou libre,
opacité, masquer, revenir au modèle). Une mise en forme se garde dans
`diapo.styles[chemin]` et sort dans le PPTX. Annuler et rétablir (⌘Z) dans la
barre. La sixième tuile d'enseigne reste en pointillé tant qu'elle est libre.
Revu le 12 oct. 2026 avec Jules : plus de bouton PPTX (la présentation sort en
PDF seulement), plus de bouton ni de panneau des diapositives (on feuillette
dans le deck, l'élément cliqué garde son menu « Styles »), et rien sous le
titre de la barre, sauf « Enregistrement… » pendant un enregistrement.

**Mode appel** (décision du 7 oct. 2026, qui remplace les boutons d'issue de la
spec du même jour) : pendant l'appel avec notes, la transcription s'affiche en
direct à droite, par morceaux de huit secondes ; pas de chronomètre (il
stressait) : le micro qui pulse, avec « Je vous écoute » dessous. Au raccrochage,
pas de bouton d'issue : la transcription à gauche, les actions d'AK à droite,
l'issue qu'AK a déduite écrite au-dessus avec un lien « changer ». Les boutons
d'issue ne restent que pour un appel sans notes.
Le mode appel de la Prospection prend le classeur de l'onglet Listes :
intercalaires de ville `rounded-t-[10px]` 13 px, l'ouvert en `bg-rail`
raccordé à la page à points (`k-points bg-rail`), toute la largeur ; l'onglet
Essai en pointillé au bout. Décision du 7 oct. 2026.

**Mode Essai** (8 oct. 2026) : dans le mode appel de la Prospection et de
Relances, l'intercalaire « Essai » en pointillé au bout des villes. Dans le
cadre Essai, une case « Écrire pour de vrai dans Monday » (cochée par défaut).
**Transitions** (8 oct. 2026) : chaque écran du mode appel entre en fondu
avec une montée de 8 px (500 ms) ; dans la fenêtre des actions, l'étape
glisse depuis la droite quand on avance, depuis la gauche quand on recule, et
la barre de l'étape courante s'épaissit ; les parties de la Prospection et
de Relances entrent en fondu. Sur la
fiche, un cadre en pointillé « MODE ESSAI · CAS DE FIGURE » : les cas rangés
par groupe en pilules (les relances d'abord dans Relances), « Attendu : … »
sous le cas choisi ; un clic joue l'appel. Pendant la lecture et les
actions, un bandeau en pointillé rappelle le cas et ce qu'on doit voir. Les
cas : `components/prospection/scenarios-essai.js`.

**Tout préparé** (8 oct. 2026, environ 3 s) : après le reçu (Annuler écoulé,
rien à choisir), une fenêtre par-dessus l'écran (`ToutPrepare.jsx`, voile
flouté), carte `fond` bordée d'un filet, sans couleur d'accent ; mode appel
(« Appel suivant → ») et Rappel (« Terminer → »).
« Tout préparé » en 40 px, gris, qu'un reflet blanc traverse de gauche à
droite (0,3 à 1,5 s) et laisse en `encre` ; à 1,3 s « Prochain appel à … le
… » monte dessous en `ardoise` ; à 1,5 s le récapitulatif (coche, action,
résultat en gris, filets entre les lignes) ; de 1,8 à 2,7 s chaque ligne se
coche (cercle plein `encre`, nom du gris au blanc) ; à 3,1 s « Appel suivant
→ » en pilule `encre`. Rien ne passe seul : le bouton enchaîne.

**Le micro pendant l'enregistrement** (maquette de Jules, 8 oct. 2026) :
`MicroEcoute.jsx`, 220 px. Un disque `menthe-pale` (57 % de la taille),
l'icône micro en `sur-menthe-pale`, deux anneaux fins (`encre` à 12 et 16 %)
qui respirent en décalé, et une onde qui part du disque toutes les deux
secondes. Mode appel et Rappel ; immobile si les animations sont réduites.

**AK lit l'appel** (8 oct. 2026) : plus de compte à rebours ni de trois
points ; la chaîne de raisonnement du chat (`ChaineEtapes.jsx`) : « AK lit
l'appel » en titre, puis chaque étape au moment où le serveur la fait (« Je
lis l'appel », « Je prépare les champs pour Monday », « Je prépare
l'email », « Je mets la relance au … dans le calendrier »), coche menthe
quand elle est faite, point qui pulse pour celle en cours. À l'écran
d'actions, elle se replie en « Analyse terminée · n étapes ». Mode appel et
Rappel.

**Pendant l'appel, des notes** (8 oct. 2026) : sous la transcription, un
bloc « NOTES » (même bordure, 20 px) pour ce que le micro capte mal ; elles
restent sous la transcription à l'écran d'actions, avec « Ré-analyser avec
les notes » quand elles ont changé. **Dates** : un calendrier du mois intégré
(`components/ui/calendrier.jsx`, lundi en premier, jours passés grisés, le
jour choisi en menthe) remplace le champ de date. Les cases de l'écran
d'actions n'ont plus « · nouveau » / « · modifié » après le libellé : le bleu
suffit ; une case vide dit en clair ce qu'on y écrit.

**Détail d'une action proposée** (maquette de Jules, 8 oct. 2026, qui
remplace celle du 7) : l'œil d'une étape ouvre une fenêtre (`SequenceActions.jsx`,
`Panneau`) de 1000 px au plus, haute de son contenu (720 px au plus), rayon
28 px. En haut, sur `fond` : le nom de l'étape au centre (30 px), « 1 / 8 » et
une croix ronde à droite ; dessous, la frise des étapes, une barre de 3 px
chacune (la courante en `encre`, les autres en `relief`), « MAINTENANT » puis
chaque date de relance au-dessus de la première étape de son groupe, les
étapes retirées en `brume`. Le corps, sur `surface-pleine`, défile : une
phrase d'introduction, puis des lignes libellé (170 px) / valeur (17 px) sur
deux colonnes, un trait sous chacune ; un point `bleu` devant le libellé de ce
qu'AK écrit ; une ligne longue (Remarques, un calendrier) prend les deux
colonnes. En pied : « ← Précédente », « Rétablir » en `ardoise`, et
« Suivante → » en pilule `encre` de 56 px. Au téléphone, plein écran.
Après la dernière étape, « Terminer » ouvre l'écran de fin : « Étapes
vérifiées » en titre, les barres de la frise en menthe, un cercle menthe
coché, « Toutes les étapes sont vérifiées », ce qui partira et ce qui est
retiré, la liste des étapes (un clic en rouvre une) ; en pied « ← Revoir »,
« Fermer » et « Valider · n étapes » en pilule menthe. On valide aussi d'ici à n'importe
quelle étape (« Valider · n », pilule bordée menthe à côté de « Suivante ») :
la fenêtre reste ouverte et devient « Envoi en cours » (8 oct. 2026), chaque
ligne (Monday, Email, Liste, Relance) passe de la roue à la coche une fois
relue, « Annuler · 10 s » en pied ; puis « Tout préparé » prend le relais.

**Relances** (spec de Jules du 8 oct. 2026, qui remplace les onglets et les
fiches du 7 oct.) : une page à part (menu « Relances », après Prospection),
partagée par toute l'équipe. **Le 16 oct. 2026 (Jules), le tableau de bord (total, mails
à valider, activité, pilotage) est retiré** : la page s'ouvre sur Liste, avec
Mode appel et Par mail ; le reste de ce paragraphe décrit la liste. Titre
centré, puis (ancien) tableau de
bord : le total (« 23 relances à faire · 4 en retard », 22 px), les motifs en
pastilles cliquables qui filtrent la liste (Bien retenu en `menthe` et Bien
refusé en `alerte` tant qu'il en reste), puis trois blocs bordés en grille :
Mails à valider (aperçu, Envoyer, Modifier, Ignorer), Activité, Pilotage
(barre des contactés avec un trait à la cible de 90 %). Au téléphone, seuls
le total et les motifs restent, « Tableau de bord » déplie le reste. La
liste : cinq colonnes (Pris par en initiales dans un rond, Motif en pastille,
Agent avec l'agence dessous, Ville, Échéance « Aujourd'hui » ou « En retard
de 4 j » en `ambre`), sur deux étages au téléphone ; une ligne prise par un
collègue est à 45 % d'opacité, « En cours : Maxime » au survol. Un clic ouvre
le mode appel de la Prospection sans écran intermédiaire, avec en tête de la
fiche le motif et la phrase à dire dans un cadre `ambre`. Après l'issue,
« Retour à la liste » et « Relance suivante » (principal). Dans les Listes de
la Prospection, « Envoyer dans Relances » reste sur les lignes cochées.

**Il me rappelle** (spec de Jules du 8 oct. 2026) : un bouton menthe
« Rappel » (icône d'appel entrant ; libellé raccourci le même jour) en haut à
droite de chaque page de l'équipe. Ce qu'une page pose en haut à droite le
rejoint dans le même coin fixe, côte à côte, 12 px d'écart (`#k-haut-droite`
dans Layout ; la pilule des boîtes du Dashboard y passe sur ordinateur), en icône dans la barre du haut au téléphone ; un tap démarre
l'enregistrement, sans écran intermédiaire. L'écran d'appel couvre la page
(plein écran, `z-[70]`) : bandeau « Rappel entrant · agent à identifier », le
micro qui pulse avec le chronomètre et Stop en `alerte` à gauche, la
transcription (à la fin de l'appel) et les notes à droite. Puis « Qui a
appelé » : le premier candidat dans un cadre menthe (« Probablement … »), deux
autres en lignes, chercher, nouveau contact ; le cadre des actions reste en
pointillé tant que l'agent n'est pas confirmé. « Ne plus appeler » en cadre
`alerte`, une relance prise par un collègue en `ambre`. Fermé avant la fin,
le rappel reste dans une pilule « Rappel à terminer » en bas, au centre.

**La calculatrice de l'appel** (Jules, 16 oct. 2026) : dès qu'un prix ou un
loyer est entendu (transcription ou notes), elle s'ouvre seule en fenêtre
devant la barre de gauche (280 px, `fixed left-3 top-20 z-[60]`,
fond `bg-fond/50` flou (`backdrop-blur-xl`), rayon 18, ombre de menu flottant ; au téléphone, en bas de
l'écran). Elle se déplace par son en-tête et garde sa place (navigateur) ; une
croix la ferme, le chiffre suivant la rouvre. Étiquette « CALCULATRICE », trois
champs soulignés en 18 px (Prix FAI, Loyer annuel HT, Surface), corrigeables,
puis des lignes libellé / valeur en 13,5 px : rendement brut, « Acte en main »
(sans le taux des frais), prix et loyer au m². Ni verdict ni prix cible
(Jules, même jour). Le dernier chiffre dit l'emporte. Lecture sans IA
(`src/lib/chiffres-entendus.js`) ; deux cas « Calculatrice » dans l'Essai.

**Haka et la file « À valider »** (Jules, 17 oct. 2026) : Haka est le nom de l'agent côté équipe (il remplacera AK ; côté client l'assistant reste « Assistant Klocka »). Tout ce qu'il propose passe par une seule file : la page « À valider » (titre centré, pilule Pour moi / Commun / Tout, ce dernier pour Jules), un volet en tête de la colonne de droite d'un dossier ouvert, une pastille menthe « n à valider » dans sa barre, et une ligne sur le Dashboard vers la page. Une proposition (`CarteProposition`, `rounded-[16px] bg-rail`) : titre 16 px, le dossier en lien menthe, pour qui, depuis quand, son coût en IA ; le résumé (le pourquoi) ; l'aperçu du livrable (un mail : À, De, objet, corps ; des choix : les dossiers candidats) ; « Sources » en petites capitales puis une ligne par source avec icône lucide et lien (§ 6) ; les gestes : « Valider » menthe plein, « Modifier » en contour (le mail devient éditable, le bouton dit « Valider la version modifiée »), « Rejeter » en texte alerte à droite, qui ouvre `ui/alert-dialog` avec un motif obligatoire ; « Je prends » sur un élément du Commun ; un élément d'information se marque « Vu ». Suivi › Haka : coûts par tâche, décisions, motifs de rejet. Rien n'est visible tant que `HAKA_FILE` n'est pas allumé.

**Les compétences de Haka et leurs cartes** (Jules, 17 oct. 2026) : une compétence est une recette, écrite et publiée par Jules seul dans Paramètres › Compétences (liste à gauche, à droite l'en-tête : nom, en une phrase, déclencheurs, qui valide, entrées, outils et sources en pastilles avec les obligatoires en menthe plein, livrable ; puis la recette en texte monospace ; « Enregistrer le brouillon », « Publier » en menthe ; chaque publication fait une version, exportée dans docs/ak/procedures). Les cartes « Ce que Haka sait faire » : sous le chat du Dashboard (grille de trois) et dans la colonne du chat d'un dossier en Mode IA (une colonne), `rounded-[16px] bg-rail p-4`, le nom en 15 px, la phrase en 12,5 px `text-ardoise`, puis les sources en pastilles `rounded-full border-bord-doux bg-surface-pleine` avec une icône lucide dans un rond `bg-rail-actif` ; un clic éteint une pastille pour ce lancement (barrée, `text-brume`), une source obligatoire ne s'éteint pas ; cliquer la carte remplit le champ du chat (« Analyser la data room du dossier « X » (sans DVF). »), la personne envoie. Le choix ne se garde pas. Le registre source → nom et icône est `src/lib/sources.js`, le seul endroit où une source se dessine. Les cartes remplacent « Connecter un skill » quand Haka est allumé.

**Haka, les relances du matin et sourcing@** (Jules, 17 oct. 2026) : à 8 h les jours ouvrés (Render), chaque relance due qu'on peut faire par mail arrive dans « À valider » pour l'analyste qui a appelé l'agent en premier (mail préparé dans sa boîte), ou dans le Commun ; valider envoie et note la relance comme après un appel, rejeter écarte le mail. sourcing@ est l'adresse où l'équipe écrit à Haka : un mail d'un @klocka.immo connu devient une réponse dans la file (« La demande » puis « La réponse de Haka » dans un cadre menthe, geste « Vu ») et une réponse par mail depuis sourcing@ avec le lien ; un extérieur va dans le Commun, jamais de réponse automatique.

**Le menu de l'équipe** (Jules, 17 oct. 2026) : Dashboard, Projets, Dossiers, Appels (la Prospection) ; « Relations » (Clients, Agents) et « Administration » (Intelligence, Utilisateurs), chacune une seule entrée qui ouvre sa première page, ses pages passant de l'une à l'autre par une pilule d'onglets centrée en tête (pas de menu déroulant) ; « Autre » pour le reste ; « Paramètres » (l'ancien Compte, icône roue) en bas de la barre, au-dessus d'AK, avec le Suivi en section. L'Agenda n'est plus au menu (la pastille du Dashboard y mène). « Nouveau chat » et l'entrée « Assistant Klocka · Discuter » (avec la tête d'AK) sont retirés de la barre ; le bas ne garde que la déconnexion. Structure dans `menuAdmin` (`src/lib/menu.js`), testée.

**Une entrée de menu externe : le CRM** (Jules, 27 oct. 2026) : « Twenty CRM » (nom choisi par Jules le 30 oct. ; « Sunday CRM » du 28 au 30 oct., « CRM » avant) ouvre Twenty (`VITE_CRM_URL`) dans un nouvel onglet, icône `Globe` de lucide (le globe choisi par Jules le 28 oct.), jamais active, jamais masquable ; sans adresse configurée, elle ne s'affiche pas. Toute autre entrée vers un outil hors de Klocka suit le même motif (`href` dans `DETAILS`, `LienRail` rend un `<a target="_blank">`).

**La page Haka** (Jules, 17 oct. 2026, « comme l'accueil de Max » ; d'abord « Accueil », renommée « Haka » le même jour) : le Dashboard de l'équipe s'appelle « Haka » partout (menu, page d'ouverture, retour du chat ; nom interne `Dashboard` inchangé ; clients et mandataires gardent « Dashboard »). La page sert à donner du travail à Haka et à voir ce qu'il a préparé ; aucun chiffre de pilotage. De haut en bas : Agenda à gauche, boîtes et Rappel à droite ; le salut et « Historique » ; la saisie avec « Dossier : aucun ▾ » à droite du « + » (`ChoixDossier` : recherche dans les dossiers, le choix part en contexte `page: dossiers, deal_id`, petite croix pour le retirer, une carte lancée depuis un dossier le choisit) ; une rangée de raccourcis en pilules `h-9` bordées (Pré-analyser, Analyser une data room, Préparer une LOI, Page plateforme, Dossier bancaire) qui posent la demande dans le champ, puis un « + » rond qui ouvre le choix des sources ; (les quatre cartes « Ce que Haka sait faire » ont été retirées de cette page le même jour, elles restent dans un dossier ouvert en Mode IA) ; puis deux colonnes en lignes, « À valider · n » (les cinq plus récentes, « Tout voir » au-delà) et « Fait par Haka » (passes de la veille et tâches finies, `/api/haka/fait`) ; une colonne vide n'est pas dessinée, et sans rien dans les deux le bloc disparaît (pas d'exemples factices, retirés à la demande de Jules le 17 oct. 2026) ; les questions d'AK sur les appels et les objections dessous, seulement quand il y en a. « Connecter un skill » disparaît. Une demande envoyée, l'écran se scinde comme Offres : Haka à gauche (poignée, `klocka.accueil.largeur-chat`), à droite une carte « Ce que Haka prépare » (titre du dossier choisi et « Ouvrir le dossier », ce que la conversation a produit avec Ouvrir ou Télécharger, puis les propositions nées pendant la conversation ou sur ce dossier, à valider sur place).

**La carte de compétence** (Jules, 17 oct. 2026, maquette) : fond `surface-pleine`, rayon 18, ombre douce ; la tâche en une phrase à 17 px `text-encre`, point final compris ; dessous, les sources l'une sous l'autre, rond de 28 px `bg-rail-actif` avec l'icône, nom à 14,5 px `text-ardoise`. Trois sources visibles, les obligatoires d'abord, puis « +n autres sources » qui déplie. Un clic sur une source l'éteint pour ce lancement (barrée, `text-brume`), une obligatoire ne s'éteint pas ; un clic sur la phrase pose la demande dans le chat. Sur l'Accueil, quatre cartes en ligne au-delà de 1280 px.

**Les réglages d'une demande à Haka** (Jules, 17 oct. 2026) : deux questions. Les sources : « Auto » par défaut (Haka choisit), ou celles qu'on coche ; le « + » à droite des raccourcis ouvre le panneau sous la rangée, « Sources : Auto / n » dans la barre l'ouvre aussi (au-dessus de la saisie pendant une conversation). La pastille de source a le dessin des raccourcis (Jules, même jour : « harmonisées avec Pré-analyser ») : `h-9`, rond complet, `border-trait` sur `surface-pleine`, `px-3.5`, l'icône de 14 px `text-ardoise` puis le nom à 13,5 px `text-encre` ; cochée, bordure et fond menthe, la coche à la place de l'icône. La réponse : bascule « Répondre | Produire » dans la barre, à droite du dossier ; une carte de compétence ou un raccourci passe en « Produire ». Les deux partent avec la demande (`contexte.sources`, `contexte.sortie`, lus par `server/ak/cadre-demande.js`).

**Le salut qui balaie** (Jules, 17 oct. 2026) : sur la page Haka, « Bonjour … Que puis-je faire pour vous ? » est traversé d'une bande plus pâle de gauche à droite, lentement (quatre secondes), à l'arrivée puis toutes les dix secondes (`.k-balayage`, index.css) ; rien quand le système demande moins de mouvement.

**Une ombre derrière la saisie** (Jules, 17 oct. 2026) : sur la page Haka, la barre de saisie porte l'ombre douce `shadow-[0_18px_40px_rgb(0_0_0/0.18)]` (les autres chats gardent la leur, plus légère).

**Le chat au centre** (Jules, 17 oct. 2026 ; saisie haute de trois lignes au départ ; « on ne doit pas pouvoir scroller dans cette page ») : sur la page Haka, le salut, la saisie et les raccourcis forment un seul bloc centré verticalement dans la fenêtre, large de 820 px au plus (« chat plus large », puis « moins large aussi » ; saisie et raccourcis restent alignés), sans barre de défilement visible, un peu au-dessus du centre exact (« remonte un peu toute la partie » : 10 vh de marge en bas), et la page ne défile pas (hauteur de l'écran, rien dessous). « À valider » et « Fait par Haka » ont quitté la page : ce qui attend est dans la cloche et dans la page À valider ; « Fait par Haka » reste dans le fil des dossiers (l'écran n'existe plus ; `/api/haka/fait` est gardé). Les questions d'AK sur les appels et les objections à résoudre restent sous le bloc quand il y en a (la page défile alors). Au téléphone, le bloc reste en haut.

**Paramètres › Compétences, deux niveaux** (Jules, 17 oct. 2026, spec « Compétences de Haka ») : la liste (filtre Actives / Désactivées / Brouillons / Toutes en pilules, « Nouvelle compétence » en menthe, tableau en lignes : compétence avec sa description sur une ligne, statut avec un point menthe / ambre / `bord-vif`, version et date, déclencheurs en petites pilules, usage, rejets et coût moyen sur 30 jours), puis la fiche d'une compétence : « < Toutes les compétences », nom en 22 px, état (« Publiée v3 » ou « Brouillon »), Désactiver, Abandonner le brouillon, Enregistrer, Tester (bordé menthe), Publier (menthe, grisé tant que le format est invalide ou que les dossiers de test n'ont pas tourné sur CE brouillon ; les obstacles sont listés dessous, une note de version d'une ligne est demandée). Quatre onglets en pilules : Définition (à gauche l'en-tête en formulaire, à droite la méthode en Markdown avec Écrire / Aperçu, les annexes et la carte telle qu'elle sera sur la page Haka ; les règles chiffrées en lignes nom / type / valeur ; outils et sources en pastilles à trois états : ajoutée, obligatoire, retirée), Tests (version publiée et brouillon côte à côte, écarts surlignés en `ambre`), Exécutions (tableau, la trace au clic : sources actives et éteintes, étapes, outils appelés, sorties et décisions), Historique (versions avec note, diff ligne à ligne en vert et rouge, « Republier cette version », rejets récents avec motif, corrections humaines). Les nouvelles compétences naissent en brouillon, sans version publiée : invisibles de Haka et d'AK jusqu'à leur publication ; « Écrire avec Haka » propose un brouillon complet à partir d'un exemple ou d'une description.

**Choisir une compétence depuis la page Haka** (Jules, 17 oct. 2026) : un raccourci ou une carte ne remplit plus le champ : la compétence devient une pastille menthe dans la saisie (croix pour la retirer), la demande passe en « Produire », et les sources de la compétence s'affichent sous la saisie, pour information (on n'éteint plus une source, retiré le 18 oct. 2026). L'envoi marche sans texte. Les raccourcis sont les compétences actives les plus utilisées (construites depuis leur en-tête).

**Administration › Automatismes** (Jules, 17 oct. 2026, spec § 11) : troisième onglet d'Administration, visible par l'équipe ; les boutons n'apparaissent que pour Jules. Titre 26 px, une phrase ; puis « Aujourd'hui : n exécutions · n propositions en attente · n erreurs » (chaque chiffre filtre la liste, pilule menthe quand il est choisi) et la jauge du plafond (barre de 6 px, menthe, `ambre` à 80 %, `alerte` à 100 %). Tableau en lignes : rond `bg-rail-actif` avec l'icône Workflow et le nom, la phrase du déclencheur, l'état (point menthe Actif, `bord-vif` En pause, `alerte` En erreur), la dernière exécution (« Il y a 12 min · À vérifier », le résultat teinté), aujourd'hui « 9 · 2 · 0 », la prochaine (planifié seulement), le coût du jour ; à droite « Lancer maintenant » et « Mettre en pause / Reprendre » en pilules bordées. Un clic ouvre un panneau latéral de 560 px sous la barre du haut (voile à 25 %) : sélecteur de date, une ligne par exécution (heure, événement concret, résultat teinté, durée, coût, liens Dossier / À valider / Trace, Relancer pour une erreur), l'erreur en phrase lisible en `alerte` avec le détail technique replié ; après une reprise, un bandeau `ambre` propose « Traiter les ignorés ». Les alertes (en erreur, plafond atteint, planifié qui n'a pas tourné) arrivent dans la cloche de Jules, jamais par mail.

**Pas d'attente à l'ouverture d'un onglet** (Jules, 18 oct. 2026) : plus de « Lecture du marché autour… » ; la dernière comparaison au marché gardée sur le lot s'affiche tout de suite, la relecture se fait derrière et remplace sans message. Toutes les grilles de l'analyse (Bail, Quittances, Copropriété, Diagnostics) et le journal du Marché se chargent à l'ouverture du dossier, pas au clic sur l'onglet ; plus de « Lecture… » en attendant.

**Le fond continue sous la barre, et les étapes se déplacent** (Jules, 18 oct. 2026) : le contenu de la page s'écarte de la barre latérale par un padding et non plus par une marge, donc son fond (et ses points) passe derrière les coins arrondis de la barre, sans trou noir en haut à gauche. Le menu des étapes à droite se déplace verticalement : on tient son haut (le chevron fermé, l'entête ouvert) et on glisse le long du bord droit ; un glissement n'ouvre ni ne ferme rien, la position est gardée dans le navigateur.

**Les étapes du dossier, à droite, par-dessus la page** (Jules, 18 oct. 2026, deux temps ; un premier essai y mettait les onglets de l'analyse, revenus ensuite en barre au-dessus du tableau) : la frise des huit étapes quitte le haut de la page. Elle ne prend aucune place dans la mise en page : elle flotte à droite, à mi-hauteur de l'écran, avec une ombre. Fermée (par défaut) : une fine pilule de 44 px (`bg-rail`, rayon 16), un chevron « < » en haut, un point par étape (fait : accent menthe ; ouvert : blanc et plus grand ; à venir : gris pâle), « 4/8 » en bas ; un point mène à son étape. Ouverte : un panneau de 220 px, « ÉTAPES · 4/8 » et un chevron « > » pour la refermer, une entrée par étape avec son rond (coche menthe, numéro sur fond `encre` pour l'ouverte, numéro gris à venir). Le passage de l'une à l'autre se fait en fondu glissé ; le choix est gardé dans le navigateur. Au téléphone, la frise reste en haut. Les points suivent la barre pendant qu'on la déplace, sans retard (18 oct. 2026, Jules) : ce sont de simples `span`, jamais des éléments `motion` en `layout`, que le déplacement du parent ferait rattraper en différé.

**Transitions de l'analyse** (Jules, 18 oct. 2026, « des transitions partout ») : changer d'onglet fait entrer le contenu en fondu en montant de 8 px (0,35 s) ; les lignes des tableaux (Bien, grilles, croisements, historique) et les blocs de la Synthèse montent l'un après l'autre (`.k-cascade`, 25 ms d'écart, douze au plus) ; la règle d'une ligne, ses valeurs par document et le motif d'« Écarter » se déplient en hauteur (`Depliant`) ; les actions d'un signalement s'échangent en fondu quand une décision tombe, et un signalement levé par une valeur retenue sort en fondu ; les lignes s'éclairent à peine au survol. Rien de tout cela quand le système demande moins de mouvement.

**Synthèse, croisements en tableau et tableaux d'analyse au style du Bien** (Jules, 18 oct. 2026, maquette) : les croisements de la Synthèse sont un tableau, une ligne par information (Loyer annuel HC HT, Surface, Locataire, Activité, TVA, Provision pour charges, Fréquence de paiement, Travaux à la charge du propriétaire, Taxe foncière), une colonne par onglet (Fiche, Bail, Quittances, Copropriété, Diagnostics, Bien (Kbis, avis, Pappers)), « · » en `brume` là où l'onglet ne dit rien, et une colonne Retenu : « 18 000 € · cohérent », « Écart : choisir la valeur » en `ambre`, le motif en `alerte` pour un bloquant, la valeur retenue en menthe. Un clic sur une ligne déplie les citations de chaque source, avec « Retenir ». Les signalements gardent leur sous-titre (Accepter, Négocier, Écarter expliqués), sont groupés par onglet avec « Ouvrir l'onglet › » en menthe ; un écart de valeurs (loyer, surface) propose « Retenir 48 m² » / « Retenir 52 m² » au lieu d'Accepter, Négocier, Écarter. Les grilles Bail, Quittances, Copropriété et Diagnostics prennent le même tableau que le Bien : Ligne / Ce qu'on y lit / Sources / Statut, la note sous la valeur, les sources en pastilles « Bail p. 4 » qui ouvrent la preuve, le statut en mot (OK, À checker, Info, Signalé, Bloquant, Non trouvé), un clic sur le statut pour le changer ; la légende dit « signalés », « bloquants », « non trouvés ».

**Module d'analyse, onglet Bien** (Jules, 18 oct. 2026, maquette) : un tableau `bg-rail` rayon 16, quatre colonnes « Ligne / Ce qu'on y lit / Sources / Statut » (entêtes 13 px `ardoise`, lignes séparées d'un trait). Dix lignes : Adresse et type de local, Surface, Prix FAI et honoraires, Rendement brut, Vendeur, Taxe foncière annuelle, Locataire, Activité réelle, Procédure collective, Santé financière. Les sources en pastilles bordées de 28 px (« Fiche p. 1 », « Bail p. 3 », « Calcul »), un clic ouvre la pièce à sa page, la citation au survol. Le statut : « Info » (pastille `rail-actif`), « Signalé » (`ambre`), « Bloquant » (`alerte`), « OK » en texte menthe, « Non trouvé » en `brume` avec les sources consultées. Le motif d'un signalement s'écrit sous la valeur en `ambre` ; une ligne à plusieurs valeurs se déplie, une par document. Calculé par le code (fiche et lecture des pièces) ; Pappers, BODACC et Google Maps restent à brancher, la ligne le dit. La fiche commerciale éditable suit, dessous.

**Module d'analyse, onglet Synthèse** (Jules, spec du 17 oct. 2026, livré le 18) : les onglets de l'analyse vont dans l'ordre Synthèse, Bien, Bail, Quittances, Copropriété, Diagnostics, Marché, Simulateur, Historique ; Synthèse s'ouvre par défaut. Chaque onglet porte dans son titre une petite pastille `ambre` avec le nombre de signalements qui y restent à traiter. La Synthèse, quatre cadres `bg-rail` rayon 16 : (1) la phrase « 0 bloquant · 7 signalements · 4 traités · rendement brut 7,8 % » à 18 px, puis la checklist des documents attendus en trois colonnes (rond menthe coché si reçu, « facultatif » en `brume`, « Demander à l'agent » en menthe pour un manquant, « demandé » ensuite) ; (2) les croisements entre sources : une ligne par information, ses sources en petites cartes côte à côte, « Concordant » en menthe ou le motif de l'écart en `ambre` (`alerte` si bloquant) ; en cas d'écart, un clic sur une carte la retient (bordure menthe, « retenue ») ; (3) les signalements à traiter, groupés par onglet, bloquants en tête (icône `alerte`, « Bloquant · à corriger ou arrêter », sans action), les autres avec Accepter, Négocier, Écarter (motif obligatoire dans un champ qui s'ouvre) ; (4) la validation, « Valider l'analyse » en menthe, active seulement sans bloquant et quand tout est traité. L'onglet Historique commence par « Historique de l'analyse », filtrable (Documents, Corrections, Décisions, Validation), rien ne s'y efface.

**Dossiers : une seule liste** (Jules, 18 oct. 2026) : les onglets « À traiter », « Pipeline » et « Écartés par AK » sont retirés. Sous le titre, plus de pilule « Dossiers · n » (retirée le 18 oct. 2026, Jules : le titre suffit), puis tous les dossiers (hors archivés) en cartes compactes sur trois colonnes, du plus récemment modifié au plus ancien ; un dossier écarté garde sa carte marquée « écarté ». Les cartes sont en `bg-rail`, la couleur de la barre de navigation (Jules, 18 oct. 2026) ; elles portent la classe `k-carte-rail` (fond `rail` à l'opacité de `--k-carte-opacite`, flou de 14 px derrière). Leur transparence se règle dans Personnalisation, Affichage, « Transparence des cartes » : curseur de 10 à 100 %, 100 % par défaut (préférence `cartes_opacite`). La recherche filtre cette liste. Le mail « Ma journée » garde, lui, le calcul « À toi d'agir ».

**« OS » dans un cadre** (Jules, 18 oct. 2026, deux maquettes) : dans la barre, le nom s'écrit « Klocka » suivi de « OS » dans un cadre arrondi (22 px de haut, rayon 7, trait fin de 1 px et texte en `encre`, 11,5 px gras), noir en thème clair, blanc en thème sombre.

**La marque de Klocka OS** (Jules, 18 oct. 2026, deux maquettes fournies) : trois losanges empilés à coins arrondis, à gauche du nom dans la barre (22 px, `MarqueKlocka.jsx`, SVG en ligne). Thème sombre : dessus blanc cassé, milieu doré, dessous gris ; thème clair : dessus noir, milieu doré plus foncé, dessous gris clair. Les trois couleurs sont les variables `--k-marque-haut`, `--k-marque-milieu`, `--k-marque-bas` de `index.css` : un logo n'est pas une couleur du système, il ne les prend pas aux jetons. Elle remplace l'ancien logo, y compris dans le rail replié.

**Klocka OS et la vue dans la barre** (Jules, 18 oct. 2026) : la marque en haut de la barre s'écrit « Klocka OS », en Instrument Sans fin (400, 18 px, interlettrage -0,02 em) comme le salut de la page Haka, avec la marque à trois losanges à sa gauche ; les entrées du menu commencent 28 px sous le choix Klocka | Outils. Le choix de la vue (Admin, Client, Mandataire) quitte le haut de la barre : une entrée « Vue » avec son icône (l'œil), juste au-dessus de Paramètres, qui dit la vue en cours à droite en `brume`. Un clic passe directement à la suivante (Admin, Client, Mandataire, puis Admin), sans menu. Les entrées du menu (Haka, Projets, Dossiers…) restent où elles sont.

**Projets récents dans la barre** (Jules, 17 oct. 2026) : sous « Administration » (d'abord sous « Projets », déplacé le même jour), un petit titre « Projets récents ▾ » (13 px `text-brume`, repliable, choix gardé dans le navigateur) puis les cinq derniers dossiers ouverts par l'équipe (complétés, tant qu'il en manque, par les plus récents mis dans la plateforme), en retrait de 16 px et un peu plus petits que les entrées du menu (icône des Projets, Building2, 14 px, titre tronqué 13,5 px `text-ardoise`, `bg-rail-actif` au survol et pour le dossier ouvert). Liste partagée, la plus récente en tête ; un dossier archivé ou de test n'y figure pas. Cachée quand la barre est repliée.

**La cloche « Ce qui t'attend »** (Jules, 17 oct. 2026, variante B) : dans la barre du haut, sur toutes les pages de l'équipe (ordinateur), entre les boîtes connectées et le mode appel (`Cloche.jsx`, montée dans Layout, fixée à droite du bouton Rappel). Rond de 38 px, `border-trait` sur `surface-pleine`, icône `text-ardoise` ; sans rien, aucun compteur. Le compteur (pastille `bg-ambre`) ne compte que ce qui attend une action de la personne : ses propositions (dossiers dont elle est responsable, relances de ses agents ; une ligne « n relances préparées » compte pour n) et ce qui était dû avant Haka (rappels, promesses, relances de dossier en retard). Un clic ouvre un volet de 440 px sous la cloche (`bg-rail`, rayon 18), le reste de la page s'assombrit (voile noir à 25 %) ; Échap, la croix ou un clic ailleurs le ferme. Chaque ligne : un point (ambre : une action est attendue ; menthe : une simple information, non comptée), une phrase courte, le lieu et le moment, un bouton « Ouvrir » qui mène à l'objet (dossier, Appels, À valider). On ne valide rien dans le volet. Une information (même bien reçu) se marque lue en ouvrant l'objet et disparaît ; un rappel sans lien a un bouton « Fait ». N'y entrent pas : ce que Haka a fait seul (colonne « Fait par Haka », fil du dossier) et les messages de conversation (Historique).

**Transitions de la page Haka** (Jules, 17 oct. 2026, « super smooth ») : un seul ressort doux (`RESSORT`, `ReglagesDemande.jsx`) pour tout ce qui bouge ; le panneau des sources se déplie en hauteur et en fondu (`Depliant`), ses pastilles arrivent l'une après l'autre ; le « + » pivote en croix ; la coche d'une source remplace son icône en tournant ; le fond de « Répondre | Produire » glisse d'un mot à l'autre ; les cartes entrent en cascade et se réarrangent sans saut quand on déplie leurs sources ; à l'envoi, la carte de droite glisse depuis la droite. Les cartes de compétences portent les mêmes pastilles que le « + » (éteinte : barrée, sans fond), trois visibles puis « +n ».

**Barre latérale arrondie** (Jules, 17 oct. 2026) : le bord droit de la barre latérale est arrondi (`rounded-r-[24px]`), avec son trait en haut, à droite et en bas.

## 6. Le chat et l'écran scindé

**L'Éditeur** (Jules, 28 oct. 2026) : la structure de toute page où l'on travaille un document avec le chat, dans `components/editeur/Editeur.jsx` ; une nouvelle page la reprend au lieu de la redessiner. À gauche le chat, sur le fond choisi par l'admin. Une ligne verticale `bg-trait` sépare les deux parties ; sous la souris elle passe en `bord-vif` avec sa poignée, on la tire pour régler la largeur (gardée par page, double-clic : 420 px). À droite le document, sur le même fond : aucune partie n'a de fond propre, pas de carte. En haut du document, une barre (`BarreEditeur`) : le nom du dossier ou du document à gauche, rien d'autre (l'état seulement pendant un enregistrement), puis sur la même ligne la pilule des trois modes, puis les actions. **Éditeur** : chaque élément se clique ; le panneau de l'élément choisi (`PanneauEditeur`, 320 px, filet à gauche, sans fond) s'ouvre à droite du document, avec ses champs, son texte et sa source ; Échap ou la croix le ferme. **Lecture** : rien ne se modifie. **Sources** : les éléments modifiés sont soulignés en menthe ; au survol, la fiche de leur source (`FicheSource`). Première page sur ce canevas : l'étape Offre d'un dossier (la lettre d'intention, vierge et pré-remplie depuis le dossier tant qu'on n'y a rien écrit).

Le chat est `ChatDashboard` ; une page en crée un espace (`ESPACES`), elle ne
le recopie pas.

- **Accueil d'une page de travail** : la question en titre, une phrase d'aide
  (une seule, celle du mode choisi), le chat, puis la liste des objets.
- **Modes** (« Avec le bail », « Sans document ») : pilule à gauche de la
  barre, masquée une fois la conversation lancée. Les skills : un simple lien
  « Connecter un skill » sous le chat, qui ouvre la fenêtre des skills.
- **Fil** : bulles envoyées en `J.barre`, réponses avec le portrait d'AK, les
  étapes de raisonnement affichées, la dictée disponible partout.
- **Portrait d'AK** (12 oct. 2026, décidé avec Jules) : partout où AK parle
  (chats admin et mandataire, Prospection), le composant
  `AvatarAK` (`public/avatars/ak.png`, rond, 36 px). Il remplace la pastille K
  et la pastille « AK » ; ne pas en dessiner d'autre.
- **Aperçu d'un PDF** (12 oct. 2026, décidé avec Jules) : il prend toute la
  page à droite de la barre latérale (`ApercuPdf`), sans marge ni fond flouté ;
  rien du chat ne doit dépasser. Fermer : la croix ou Échap.
- **Écran scindé** (Estimation, Mandat, Offres, et un dossier ouvert depuis le 17 oct. 2026, en « Mode IA » ; la pilule « Mode IA / Normal » de sa barre rend la barre latérale et le dossier en pleine page, choix gardé dans le navigateur : AK à gauche, le dossier à droite à toutes les étapes ; la colonne de droite du dossier passe sous le contenu en dessous de 1700 px), à partir de 1024 px :
  - grille `grid-cols-[minmax(360px,440px)_minmax(0,1fr)]`, `h-[100dvh]` ;
  - la barre latérale s'efface (`html.k-sans-barre`), la page ne défile plus,
    **chaque colonne défile seule** ;
  - séparation `border-l border-bord-doux` ; depuis le 17 oct. 2026 (Présentations, Offres, Dossier ouvert), le document est une carte posée sur le fond (`py-2 pr-2`, `rounded-[14px] border-bord-doux bg-rail`), avec une poignée qui règle la largeur du chat (double-clic : 420 px), et la barre du haut de l'éditeur de présentation : titre et état, pilule Édition / Lecture s'il y a lieu, actions, action principale en menthe, croix pour fermer ;
  - fond de l'aperçu : `bg-fond` pour l'avis de valeur, le même que derrière
    les réponses du chat (3 oct. 2026) ; `J.barre` pour le mandat (2 oct.) ;
  - après chaque message, l'aperçu de l'avis montre les étapes réelles du
    serveur (« Loyer annuel hc : 50 000 € », `MiseAJourDocument`) tant que le
    chat travaille, puis l'avis revient ;
  - **les deux barres du haut sont identiques** : `h-14`, `.k-barre-apercu`,
    bordure basse `border-trait` ; une seule barre de chaque côté ; côté chat,
    « Dashboard » et « Historique » seulement, sans le titre de la conversation ;
  - au **premier message tapé au tableau de bord**, l'aperçu joue d'abord la
    génération du document (`GenerationDocument` : sept étapes qui se cochent,
    ~0,65 s chacune, barre de progression), puis le document entre en fondu.
    Une reprise (liste, historique) l'affiche tout de suite (3 oct. 2026) ;
  - le chat garde sa place dans l'arbre d'un mode à l'autre (sinon il perd son
    fil) ;
  - un seul chat : il répond aux questions **et** modifie le document à droite ;
    un clic sur un élément du document le désigne au chat (« ça ») ;
  - le document se modifie à tout moment, flèches annuler / rétablir comprises ;
  - au téléphone : le chat seul, le document en plein écran.
- **Sources d'une réponse** : sous la réponse, « Sources » en petites
  capitales `text-brume`, puis un lien souligné par source (icône menthe,
  13,5 px `text-craie`). Un clic ouvre une fenêtre, sans quitter la page : les
  champs pris à gauche avec leur phrase relevée, le document à droite, phrases
  surlignées en `bg-menthe/20`, et le PDF d'origine à côté. Première page :
  la LOI rédigée sur Offres (`offres/SourcesLoi.jsx`, 5 oct. 2026).
- **Panneaux d'outils** (plan, versions, menu de mise en forme) : `bg-rail`,
  `rounded-[14px]`, `border-trait`, comme la barre de navigation.

### AK au travail, dans le panneau de droite (14 oct. 2026)

Décision de Jules : pendant qu'AK retouche un document (projet, présentation,
LOI, newsletter, avis de valeur), le panneau montre `MiseAJourDocument` :
trois mini-diapositives qui se relaient sur 6 s (texte, image et texte,
graphique), un reflet qui les traverse toutes les 2 s, le surtitre en menthe
(12 px), le titre en 28 px traversé d'une bande de lumière (2,4 s), et une ligne
d'état qui change toutes les 2 s (« Lecture de votre message », puis l'analyse
et la mise à jour du document en cours). CSS seul (`.k-pile`, `.k-mini`,
`.k-titre-metal`, `.k-etats` dans index.css), arrêté si le système demande
moins d'animations.

### La frise de raisonnement (18 oct. 2026, Jules, maquette « Planned next steps / Building Excel model »)

Remplace les quatre points qui tournent du 16 oct. (ci-dessous, gardés pour les notifications). Une étape faite : un rond plein `encre` de 20 px avec une coche (`fond`), qui arrive en ressort, le texte en `encre`. L'étape en cours : l'icône de ce que Haka fait (Mail, Fiche, Marché, Dossier, Analyse, Recherche, Rédaction, sinon la grille ; 18 px `craie`), son texte en `brume` balayé d'un reflet `encre` de gauche à droite en boucle de 2 s (`.k-raisonne`, arrêté si le système demande moins de mouvement). Un trait vertical de 1 px (`bord-vif`) relie les étapes, il se déroule en 0,3 s sous la nouvelle. Un fil relu montre les coches sans animation.

**La barre de navigation se ferme en entrant dans un dossier** (Jules, 18 oct. 2026) : ouvrir un dossier replie la barre latérale en rail d'icônes ; en sortir rend le réglage de la personne. On peut la rouvrir à la main pendant la visite. Repliée, elle garde toujours le choix Klocka | Outils : deux icônes l'une sur l'autre (la marque, la clé), l'active sur fond `surface-pleine`.

**Un seul fond « Halo » partout** (Jules, 18 oct. 2026 : « le même que dans la page projets ») : le réglage Halo allumé, chaque page montre le même fond, `FondHalo` posé par `Layout` et passé sous la barre latérale. La page Haka n'ajoute plus ses deux ellipses (`accueil-halo-a/b`) derrière le salut. Une page ne dessine pas son propre halo. Le dossier ouvert en écran scindé ne pose plus `k-sobre` (qui éteignait le fond) et n'a plus sa lumière dans le coin : il montre le même fond que Projets.

**Le dossier en mode IA garde la barre de navigation** (Jules, 18 oct. 2026) : la barre reste à gauche du chat, repliée en rail comme dans tout dossier ; la page ne défile pas, chaque colonne défile seule. La colonne du chat n'a plus de cartes de compétences : la question et la saisie suffisent. À droite, le dossier s'affiche comme en mode normal (titre, retour « Tous les dossiers », contenu), sans carte posée sur la page : une fine ligne verticale (`border-trait`) le sépare du chat. Cliquer « Mode IA » depuis le mode normal fait glisser le dossier vers la droite (0,7 s), puis le chat apparaît depuis la gauche.

**La Pré-analyse au dessin de l'Analyse** (Jules, 18 oct. 2026) : le tableau « Fiche du bien » prend les lignes de l'onglet Bien (Critère / Ce qu'on y lit / Statut / Notes, sans cadre de cellule, le statut en mot ou en pastille : OK, Signalé, Bloquant, Non trouvé, Info). Chaque valeur se modifie sur place, et la modification relance l'analyse ; « Corriger la fiche » n'existe plus. La ligne « Adresse et emplacement » porte l'adresse : la changer relit le marché (prix, loyer) et déplace Street View et le plan. Surface, type d'actif et bail ont leur ligne d'information. La colonne de droite montre l'emplacement (Street View puis le plan) à l'étape Pré-analyse, et la Data Room seulement à l'étape Data Room ; ailleurs, sans colonne, le contenu prend toute la largeur. Sous le plan, « Clients intéressés » (investisseurs de Monday compatibles). Le statut d'une ligne, dans la fiche comme dans les tableaux de l'Analyse, se change d'un clic sur sa case, sans menu : OK, puis À vérifier, puis Bloquant, puis OK. « Signalé » devient « À vérifier » partout.

**Le marché saisi à la main** (Jules, 18 oct. 2026) : sous Prix marché et Loyer marché, « Mettre mon chiffre » prend une valeur au m² (le loyer au m² par an) qui l'emporte sur la lecture partout où le marché est lu (tableau, statut, avis d'AK) ; la ligne dit « marché saisi » avec qui l'a posé, et « Revenir à la lecture » la retire.

**Les pouces d'un clic** (Jules, 18 oct. 2026) : sous une réponse, un pouce en haut ou en bas se pose d'un clic, sans champ ni fenêtre ; le pouce choisi reste allumé (menthe ou alerte, plein) et « Noté » apparaît. Aucun appel au modèle : la remarque part au Feedback et une leçon est proposée dans Suivi › Chat.

**Le chat du dossier comme celui de Haka** (Jules, 18 oct. 2026) : en mode IA, la saisie a le « + » (joindre une pièce au dossier) et « Sources : Auto », sans Répondre / Produire (l'assistant choisit selon la demande) ; un clic sur Sources déplie les pastilles au-dessus de la saisie (Auto, ou les sources cochées). Avant le premier message, elles se déplient sous la question ; pendant une conversation, à même le chat (sans cadre) juste au-dessus de la saisie, le fil remontant, la barre du haut intacte. Une fois la conversation ouverte, la barre « Tous les dossiers · Historique » est transparente : le fond Halo passe dessous.

**Le personnage de Haka** (Jules, 18 oct. 2026) : le portrait de l'assistant dans les chats est un personnage choisi dans Paramètres › Haka (« Personnage de Haka », préférence `personnage_haka`), avec la longueur des réponses (`haka_longueur` : très courtes, courtes par défaut, détaillées) et les tableaux (`haka_tableaux` : quand ils aident, jamais), envoyés avec chaque demande. Les portraits sont dans `public/avatars/haka/`, déclarés dans `PERSONNAGES_HAKA` (`src/lib/personnalisation.js`) ; six personnages (`haka-1` Boucles, `haka-2` Barbe, `haka-3` Chignon, `haka-4` Coupe courte, `haka-5` Lunettes, `haka-6` Cravate), chacun recadré en carré sur son disque.

### Les étapes d'AK quand il réfléchit (16 oct. 2026)

Spec de Jules, qui remplace le point qui pulse et la roue : l'étape en cours
porte **quatre petits points gris** (4 px, `brume`) dans un carré de 14 px, à
gauche du texte (`.k-carre`, `PointsEnCours`). Le premier est plein, ses deux
voisins à 75 %, le point opposé à 50 % : le dégradé donne le sens de rotation.
Un demi-tour dure 1,4 s : un quart de tour en se resserrant vers le centre
(à la moitié de la taille), un quart de tour en s'écartant ; chaque quart de
tour accélère et ralentit (`cubic-bezier(.45, 0, .55, 1)`). La boucle CSS fait deux
demi-tours (2,8 s) pour que le dégradé retrouve sa place sans saut. Le texte de
l'étape en cours est en `encre`. **Quand l'étape se termine**, les quatre
points disparaissent au profit d'**un seul point de 8 px** (`brume`,
`PointFait`) qui arrive en 0,5 s : d'un petit carré pivoté à 45°, plus grand et
presque transparent, qui se réduit, se redresse et s'arrondit jusqu'au rond
plein ; le texte passe en `craie`, comme les lignes finies. Chaque nouvelle
ligne glisse vers le haut en fondu (0,35 s), puis prend à son tour le carré.
Une étape d'un fil relu garde son point sans l'animer. Les gris et le blanc
cassé de la spec (#7a7f7d, #f2f2f2, #c4c4c4) sont les jetons `brume`, `encre`
et `craie`, donc ils suivent le thème clair. CSS seul, arrêté si le système
demande moins d'animations. Dans le fil (`Etapes`) et dans la notification du
chat embarqué (`EtapesNotif`).

### L'Intelligence (le Layer, 14 oct. 2026)

Spec MVP de Jules du 14 oct. 2026 (« Cerveau » jusqu'au 15 oct., renommée « Intelligence » ; le nom technique est « le Layer », voir `docs/layer.md`). Une page admin **Intelligence** (icône cerveau,
après Suivi, pastille du nombre de faits à valider) à trois onglets sur le
dessin des onglets du Suivi : À valider, Savoir, Sources. En tête, une bande
de trois chiffres (les critères du MVP qui se mesurent seuls). À valider : les
faits groupés par source, en lignes ; chaque ligne porte le type en petites
capitales colorées (décision menthe, information craie, engagement ambre,
savoir bleu), le résumé, la phrase de la source en retrait, les fiches en
puces ; trois gestes à droite : rejeter (croix), Corriger, Valider (menthe).
Un fait non validé ne se présente jamais comme acquis. L'onglet Historique
d'une fiche (étape Analyse d'un dossier, fiche d'un agent) reprend la même
frise, chaque fait cliquable vers sa source. Le tableau de bord n'en montre
qu'une ligne : « X éléments à valider à l'Intelligence ».

### L'éditeur de projet avec AK (14 oct. 2026)

Décision prise avec Jules : l'édition d'un projet existant reprend l'écran de
Présentations, à l'identique. Le chat d'AK est à gauche, avec une poignée de
largeur (`klocka.projets.largeur-chat`). À droite, le projet est dans sa carte
`bg-rail`, avec la barre `k-barre-apercu` : le titre et « Enregistré
automatiquement », la pilule Édition / Lecture / Sources, Annuler / Rétablir,
Enregistrer et le menu à neuf points.
- Les anciens onglets de champs deviennent ce tiroir « Tous les champs », à
  droite de la page.
- Chaque retouche s'enregistre seule, champ par champ, une seconde après. Le
  bouton Enregistrer (et ⌘S) envoie tout de suite et pose une version de la
  fiche entière ; « Historique des versions » les liste et en restaure une,
  l'état remplacé gardé en « Avant restauration » (14 oct. 2026).
- À droite d'Enregistrer, le menu à neuf points (`Grip`) : Assigner à un
  client, Voir tous les champs, Historique des versions.
- Photos (bouton du haut, en édition) : une fenêtre où l'on glisse les photos
  pour les réordonner, puis Enregistrer ; Annuler ne garde rien.
- ⌘Z annule aussi un geste d'AK en entier.
- AK peut changer tout chiffre, mais avec sa source et sa raison, que le mode
  Sources montre au survol (la fiche de Présentations). Un chiffre sans source
  est refusé.
- Au téléphone et à la création, l'éditeur d'avant reste.

### La fiche d'un agent ou d'une agence (Prospection, 16 oct. 2026)

Demande de Jules : « en un coup d'œil ». Un panneau à droite de 640 px
(`FicheContact`), rendu par portail, plein écran au téléphone ; il s'ouvre au
clic sur un nom (À appeler, la grille), par le bouton « Fiche » d'une agence
dans les Listes, ou par l'adresse (`?agent=`, `?agence=`). De haut en bas :
le nom (20 px) et sa ligne (poste, ville, statut, l'agence en lien) ; quatre
chiffres en cartes de `Chiffre` (On s'est parlé, Mails, Fiches reçues avec
Oui et Non, Dernier échange) ; « Ce qu'il nous dit souvent » (une phrase, la
pastille « n fois », sa citation entre guillemets) ; « Actions proposées »
numérotées en pastilles menthe pâle, chacune avec son pourquoi ; « Son
parcours avec nous » en frise verticale, le dernier point en menthe ;
« Échanges » en lignes avec une pilule de filtres (Tout, Appels, Mails,
Fiches, Monday) ; « Qui a échangé avec lui » (photo, Référent, compte) ;
ses collègues ou, pour une agence, ses agents, qui s'ouvrent à la suite
(« Retour ») ; l'Intelligence ; les coordonnées en dernier. Rien ne se
modifie ici : la grille reste l'endroit où l'on corrige une fiche.

**L'Agenda sur le Dashboard** (16 oct. 2026, Jules : « une pill comme les deux
boîtes, avec Agenda : on clique et on voit la page »). En haut à gauche du
Dashboard de l'équipe, une pilule au dessin de celle des boîtes mail
(`rounded-full border-trait bg-surface-pleine`, 13,5 px, une icône calendrier de
14 px puis « Agenda ») ; un point `ambre` quand quelque chose attend : un briefing
à faire, ou un résumé à relire (Jules). Un clic ouvre la page Agenda. Au
téléphone, les deux pilules se suivent sur la même ligne ; sur ordinateur, celle
des boîtes reste dans le coin en haut à droite. L'entrée « Agenda » du menu est
restée. Le même jour, « Reprenez là où vous en étiez » (les derniers dossiers
et projets ouverts) est retiré du Dashboard ; « Ce qui vous attend » reste, seul
et centré.

### L'Agenda (16 oct. 2026, « Semaine » jusqu'au même jour)

Qui est là, et les briefings. Centrée (`max-w-[1100px]`), des blocs `bg-rail`
en 14 px de rayon, empilés : « Bon retour, … » (le résumé relu par Jules, en
texte simple) ; « Briefing de … » (questions en `brume` 12,5 px, réponses en
`craie`) ; les briefings à faire (« Nora revient lundi 19 octobre », « Tu pars
lundi 26 octobre », bouton plein menthe, ou secondaire « Revoir mon
briefing ») ; pour Jules, « Le résumé pour … » (briefings reçus, qui manque,
« Écrire le brouillon » secondaire, titre et texte modifiables, « Valider »
plein menthe) ; puis « Présences ». Un clic sur un jour ouvre la fenêtre du
briefing : « Pour » en pastilles à cocher (menthe pâle cochée), une question
par zone de texte avec son aide en `brume`, « Envoyer le briefing » en plein
menthe. Les présences : une ligne par personne, un carré de 28 px par jour
ouvré sur cinq semaines, la lettre du jour dedans ; là = encre à 7 %, école =
menthe, congés = ambre, autre = `bord-vif` ; lu dans l'agenda = liseré ;
aujourd'hui = contour menthe. Jules a une pilule « Briefing / École / Congés
/ Absent » : Briefing par défaut, un motif pour poser les absences (Maj +
clic : la semaine). Décisions de Jules le même jour : pas de mail, pas de bloc
« Pendant l'absence de … », résumé court.

### Les questions d'AK sur les appels (Dashboard et Suivi, 16 oct. 2026)

Demande de Jules : AK surveille le journal des appels et interroge l'analyste.
Quatre cas : un appel **corrigé**, **pas validé** (au bout d'une heure),
**validé sans appel** (moins de 15 secondes, ni enregistrement ni notes),
**validé trop lentement** (plus de 2 minutes après le raccrochage ; « 2 min 47,
c'est trop »). Seuils dans `server/prospection/questions-appels.js`.

*Dashboard de l'analyste* (`QuestionsDAK`) : un bloc `bg-rail`, 18 px de rayon,
sous « Quoi de neuf » et au-dessus des objections, rien s'il n'y a pas de
question. Titre en capitales 11 px (« AK A UNE QUESTION SUR TON APPEL DU 15
OCTOBRE · AGENCE »). Deux colonnes (1,35 / 1) ; une seule au téléphone. À gauche,
l'écran de l'analyste pendant l'appel, rejoué par rrweb dans un cadre `rounded-[12px]`
(`EcranRejoue`), avec la date où il s'efface ; sans enregistrement, un cadre en
pointillé qui dit pourquoi. À droite : les motifs en pastilles, le résumé d'AK
en 15 px `encre`, « Ce que tu as fait » en lignes à filets (13 px : l'appel, ce
qu'AK avait compris, les corrections, les annulations, les étapes vues, le temps
de validation), puis une zone de texte par question, « Envoyer ma réponse »
plein menthe et « Plus tard » (la question revient demain). On tutoie.

*Suivi > Appels > Retours* (Jules seul) : une phrase qui dit les règles, cinq
cartes (un chiffre par cas, en appels, avec les réponses reçues sur les questions ;
le taux de réponse), « Ce qui revient, et ce qu'il faut améliorer » (la synthèse
d'AK, à la demande, avec ses exemples recopiés), puis la liste des appels, filtrable
(sans réponse, répondues, un cas) ; une ligne ouverte montre le résumé, ce que
l'analyste a fait, « Voir son écran » et les questions avec leurs réponses.

*Le lecteur d'écran* ne conclut plus « illisible » quand le serveur ne répond pas :
chaque mise en ligne coupe le service environ une minute (le disque de Render
empêche un déploiement sans coupure), il réessaie six fois en le disant, puis
propose « Réessayer ». Un fichier effacé, ou une question qui n'est pas la sienne,
le dit en clair. Les écrans restent 30 jours.

### L'écran de recherche (Off-market, 10 oct. 2026)

Décision prise avec Jules d'après PropStream, en gardant nos jetons et nos
motifs : de haut en bas, la barre de contexte (territoire en menu, champ de
recherche, « Filtrer » avec le nombre de critères actifs, « Sauvegarder »,
« Tout effacer »), un bandeau de compteurs cliquables (les listes rapides,
chacune avec son effectif en direct : un clic, et la liste est filtrée), puis
la carte et la liste côte à côte. Les cartes de bien portent toutes la même
grille (photo, adresse, référence cadastrale, valeur, occupant, propriétaire,
depuis quand, dernière mutation, scores) et leur numéro est celui de leur
point sur la carte. Le panneau de filtres s'ouvre plein écran : familles à
gauche avec une pastille menthe du nombre de critères actifs, critères de la
famille ouverte à droite (bouton à trois positions Indifférent / Oui / Non,
plages Min à Max, puces avec « Tout »), et en haut le compteur « Voir N
locaux » recalculé à chaque geste. Une recherche sauvegardée est une liste
dynamique. On ne simule jamais un filtre dont la source n'existe pas.

### Les graphiques (Suivi > Appels, 14 oct. 2026)

Jules : « plein de courbes, des graphiques ». Les briques sont dans
`components/monitoring/GraphesAppels.jsx` (recharts) ; on les reprend pour tout
nouveau graphique. Chaque graphique dans un `Cadre` (`rounded-[14px] border-trait
bg-surface`, titre en capitales menthe 11 px, une phrase d'aide `brume` au
besoin). Une seule échelle par graphique, jamais deux axes ; grille en filet
plein `trait`, horizontale seulement ; traits de 2 px, barres arrondies de 4 px
en haut ; une infobulle sur chaque marque (`surface-pleine`, filet `bord`) ;
une légende dès deux séries. Une série seule prend la menthe ; « sans
réponse » prend `brume`. Plusieurs personnes : les huit teintes de
`jetons.graphique` (sombre et clair), dans l'ordre, validées pour le
daltonisme ; la couleur suit la personne (rang de son adresse), jamais son
classement. Les couleurs sont lues sur le thème courant (`useCouleurs`) :
recharts écrit en attributs SVG, où une variable CSS ne se résout pas. Une
carte de chaleur est d'une seule teinte, de `trait` à la menthe, avec son
échelle dessous. Un libellé long passe en barres couchées.

### Vacance, le premier des Outils (13 oct. 2026)

Spec de Jules du 13 oct. 2026 (« Signaux de vacance »), posée dans un nouveau
menu **Outils** (icône clé, après Off-market), qui porte un onglet par outil
sur le dessin des onglets du Suivi (`components/outils/OngletsOutils.jsx`).
L'écran prend toute la hauteur : en tête les onglets, le titre et sa phrase
d'état, puis la barre de recherche sur une ligne (le champ d'adresse, qui
devient un libellé menthe avec sa croix une fois l'adresse choisie dans les
propositions ; le rayon en curseur et champ synchronisés ; les types de bien en
puces menthe avec leur croix et une flèche vers la liste à cases ; « + de
filtres » qui déplie les types de signal et les deux dates ; « Lancer » en
pilule menthe, grise tant qu'aucune adresse n'est choisie). Rien ne part sans
« Lancer » ; un paramètre changé après coup pose un bandeau ambre « Filtres
modifiés : relancez la recherche » et cerne le bouton. Les bandeaux (chargement
de la commune, erreur avec « Réessayer », aucun résultat, troncature, données
anciennes) sont des lignes `bg-surface` sous la barre, jamais des fenêtres.
La carte est Leaflet sur le fond IGN sombre (`.k-carte-rues`), le cercle du
rayon en menthe translucide, une épingle `encre` sur l'adresse, un rond de 7 px
à contour `encre` par local : `menthe-fonce` pour un signal de moins de douze
mois, `menthe-clair` au-delà ; au-delà de deux cents locaux, des grappes
chiffrées qui s'éclatent au zoom. Les bulles de Leaflet prennent les jetons
(`.k-vacance` dans `index.css`). À droite, la liste repliable sur `bg-rail`
(360 px ; au téléphone, le bas de l'écran) : une ligne par local, titre 15 px
`encre`, détail 13,5 px `ardoise` (signal · date · type de bien), la distance en
`brume` à droite ; survol = rond mis en avant, clic = carte centrée et fiche
ouverte. Les filtres ne montrent que les huit signaux dont la source est
branchée (BODACC, SIRENE) : les permis Sitadel attendent leur source.

**La vacance par rue et par tronçon** (16 oct. 2026, Jules : « pouvoir mesurer
la vacance par tronçon, en gros par rue, pas forcément par zone »). Dans la
barre, une pilule à deux choix à côté de l'adresse choisie : « Autour de
l'adresse » (le rayon, comme avant) et « Sur la rue » (`rounded-full bg-rail-actif
p-1`, le choix actif `bg-surface-pleine text-encre`). Sur la rue, le rayon, les
types de bien et les filtres de signaux disparaissent (ils parlent des signaux) ;
un libellé « Rue · … » dit la voie mesurée. Un clic sur une rue du tableau du
panneau de zone la mesure aussi, en entier. Le panneau devient « Taux de
vacance estimé · rue entière » : le nom de la rue (17 px), le pourcentage de la
rue (40 px), puis les tronçons en lignes (pastille numérotée de 20 px, « n° 43 à
91 · 677 m », le pourcentage à droite, une barre de 4 px et « vacants / tranchés » dessous ;
le plus vacant en pastille et barre `ambre`, le choisi sur `bg-rail-actif` avec une
pastille menthe), puis « À regarder » : les locaux vacants puis incertains du
tronçon choisi, ou de toute la rue. La carte se cadre sur la rue entière, ou sur le
tronçon choisi : un rond par local (vacant en `ambre`, plus gros ; incertain en
anneau creux ; occupé en `menthe-fonce`), un tracé par tronçon le long de l'axe de
la rue (sans les points mal géocodés), son numéro au milieu ; un clic sur le tracé,
le numéro ou la ligne choisit le tronçon, un clic sur un rond ouvre la fiche du
local (état, raison, occupants, dernier occupant). Même méthode que la zone
(`vacance-taux.js`, v1.4) : mêmes sources, mêmes règles, seuil de dix locaux
tranchés pour afficher un pourcentage ; un tronçon est un morceau d'environ
quinze locaux rangés par numéro (une rue de moins de trente locaux reste d'un
seul tenant), pour qu'un pourcentage ait du sens sans cacher un bout vide.

### Le jugement d'un point (Off-market Simple, 11 oct. 2026)

Décision de Jules : on juge en un clic, puis on dit pourquoi **librement**,
au clavier ou à la voix, jamais en cochant des puces de raisons. Dans la
fiche, sous la façade, un bloc `bg-surface/40` : « Zone : 72/100 » et les trois
raisons (« + » en menthe, « − » en ardoise), deux pilules « Intéressant » et
« Pas intéressant » (choisie : `bg-menthe text-sur-menthe`), « À revoir » en
lien discret `text-brume`. Le choix ouvre le champ de « Déjà appelé ? »
(textarea, micro de dictée, « Enregistrer » en pilule menthe). Sur la carte,
la couleur reste celle du propriétaire ; le score règle l'opacité, un point
jugé prend un contour menthe (intéressant) ou ardoise (pas intéressant).

**Dossiers, la nouvelle architecture** (Jules, 17 oct. 2026) : la liste a trois blocs. « À traiter » : deux colonnes, « À toi d'agir » et « En attente d'un tiers ». « Pipeline » : quatre colonnes `bg-rail`, Tri, Qualification, Commercialisation, Transaction. « Écartés par AK » : abandonnés ou jugés NO-GO. Cartes compactes (`CarteCompacte`, rayon 14 px) : nom, étape de la frise, qui, verdict, ce qui attend en ambre. Le dossier ouvert : nom et menu ⋯, frise de huit étapes en ronds reliés par un trait (Email, Pré-analyse, Data Room, Analyse, Plateforme, Clients, Offre, Dossier bancaire, sans sous-titre : faite cochée avec un trait vert, ouverte pleine, sans soulignement ; 24 px d'air au-dessus et en dessous ; les autres en rond vide), colonne principale (verdict d'AK, contenu de l'étape, action suivante) et colonne de droite de 340 px, fixe (investisseurs compatibles : les clients Monday dont le budget, l'apport et la zone correspondent ; Street View et plan, empilés ; et le fil quand le dossier vient d'un mandataire. Documents, livrables et le bloc « Emplacement » de la fiche retirés le 17 oct. 2026). Les règles de classement sont dans `src/lib/dossiers-architecture.js`, testées. Les huit étapes reposent sur les cinq portes du serveur.

**Relances dues dans les listes** (Jules, 17 oct. 2026) : le tableau des relances n'est plus sous la file d'Aujourd'hui ; c'est un intercalaire « Relances dues » (compteur ambre s'il y en a), première des listes. Même contenu : motifs, « Pris par », actions groupées ; un clic sur une ligne ouvre le mode appel dessus.

**Suivi en classeur** (Jules, 17 oct. 2026) : les vues du Suivi (Vue d'ensemble, Par analyste, Mes appels, Journal, Retours) sont des intercalaires de classeur comme les listes, l'ouvert raccordé au panneau `bg-rail` à points qui porte le contenu. Les périodes restent au-dessus.

**Animations de la Prospection** (Jules, 17 oct. 2026) : chaque changement entre en fondu avec une légère montée (`animate-in fade-in-0 slide-in-from-bottom-1`, 300 ms) : la page ou le mode appel qu'on allume, le tableau d'une liste, les lignes d'Aujourd'hui l'une après l'autre (40 ms d'écart, dix au plus) ; la barre de recherche du « + » glisse depuis la gauche et le « + » tourne en « × » ; les chiffres d'une liste descendent en fondu ; le curseur de l'interrupteur glisse. Le passage au mode appel (et le retour) : un fondu enchaîné simple, la page sortante s'efface (180 ms), l'autre apparaît (300 ms), sans mouvement ni flou (17 oct. 2026, Jules). Arrêtées si le système demande moins d'animations.

**Mode appel en interrupteur** (Jules, 17 oct. 2026) : plus d'onglet ; un interrupteur « Mode appel » (`BasculeModeAppel`, pilule à contour, curseur menthe allumé) est à droite, en tête d'Aujourd'hui et de chaque liste. Allumé, le mode appel prend la place de la page (l'interrupteur reste en haut pour l'éteindre). Les chiffres d'une liste ne sont plus en tête : un « + » après « Vérifier dans Monday » les montre. L'icône Rappel du coin reste le seul accès à « Il me rappelle ».

**Prospection et Relances, une seule page** (Jules, 16 oct. 2026) : la page Prospection a quatre onglets en pilule, Aujourd'hui (ouvert par défaut), Mode appel, Listes, Suivi. Aujourd'hui : à gauche la file (À appeler, puis « Relances dues » en tableau sur `bg-rail` à points, avec « Pris par »), à droite le panneau À envoyer (mails d'AK, puis « Relances par mail » à valider) et la fiabilité d'AK. Un clic sur une relance la prend et ouvre le Mode appel dessus ; sans ligne prise, le Mode appel est la file des villes. Listes (renommé le 17 oct. 2026) : les listes par ville ; un « + » en tête des intercalaires ouvre une barre de recherche, on y met une ville et l'agent IA en crée la liste (plus de bouton « Chercher une ville avec l'agent IA »). L'entrée Relances n'est plus au menu ; son adresse renvoie à la Prospection.

**Fiche du bien corrigée d'un bloc** (Jules, 19 oct. 2026) : modifier un champ de la pré-analyse ne relance plus rien ; le champ prend sa nouvelle valeur, marqué « modifié » en menthe. Une barre flottante en bas, au centre (pilule `bg-surface-pleine`, contour `bord-doux`), dit « N champs modifiés », avec « Annuler » (texte ardoise) et « OK, refaire la pré-analyse » (bouton menthe) : un seul recalcul pour tout le brouillon. Reprendre ce motif pour toute saisie qui déclenche un calcul coûteux.

**Listes de la Prospection, rangée collante** (Jules, 19 oct. 2026) : la rangée des intercalaires de villes n'est plus collée ni posée sur une bande de fond (retiré le 21 oct. 2026, Jules : la bande se voyait derrière les listes) ; l'interrupteur « Mode appel » se tient à sa droite, hors de la partie qui défile à l'horizontale : il est toujours visible.

**Étape Plateforme d'un dossier entré** (Jules, 19 oct. 2026) : plus de bloc centré avec un bouton ; un cadre `surface` en deux colonnes, à gauche la carte du projet (`CarteProjet`, la même que la page Projets, cliquable), à droite l'étiquette « Dans la plateforme » en menthe, la phrase, l'étape et la suivante, puis « Ouvrir le projet » (menthe) et deux boutons à contour (Vue client, Simulateur).

**Étapes d'un appel : ne plus proposer** (Jules, 19 oct. 2026) : chaque étape retirable (Email, SMS, Liste de diffusion, bien évoqué, contact donné, relances, prévenir un collègue) porte une petite croix `brume` à droite de son interrupteur, `alerte` au survol ; décocher vaut pour cet appel, la croix vaut pour tous les suivants de la personne. Sous les étapes, « Ne sera plus proposé : … Rétablir » (lien menthe). Le micro d'enregistrement (`MicroEcoute`) prend l'accent choisi (`bg-menthe`, plus `menthe-pale`).

**Après un appel : le « parce que » et la raison d'un clic** (Jules, 19 oct. 2026, derrière APPELS_V2) : sous le libellé de chaque étape, une ligne `ardoise` de 12,5 px « Parce que : … » (la raison du modèle, ou celle de la règle du code) ; sous la phrase de l'issue, la raison de l'issue. Quand l'analyste décoche une étape, change la date de relance ou retouche le mail, une rangée « Pourquoi ? » de six pastilles à contour (Trop tôt, Trop tard, Mauvais ton, Déjà fait, Il a dit autre chose, Autre) apparaît sous l'étape ; un clic enregistre la raison, la pastille choisie passe en menthe. Rien ne l'impose : on peut valider sans répondre.

**Appels, onglet Aujourd'hui** (Jules, 19 oct. 2026) : une page divisée, deux colonnes séparées par un filet `trait` : « À relancer » à gauche, « À rappeler » à droite, chacune avec son compte et une aide en `brume`. En tête, à droite, « Les miens / Toute l'équipe » (pilule à deux choix, l'actif en `encre`) puis l'interrupteur Mode appel. Une ligne : initiales, nom (ouvre la fiche), agence, retard en `ambre` ; la suite prévue ; « Dernier appel le … par … · issue ». À droite : Appeler (`encre`) et « Transcription » (pilule à contour). La transcription s'ouvre dans un panneau à droite (620 px, `bg-rail`) : chaque appel, le plus récent d'abord, ses notes, puis le texte entier ; jamais un résumé à la place. Dessous : À envoyer, Relances par mail, Fiabilité, en trois colonnes.

**Rappel et appel rapide, l'écran du Mode appel** (Jules, 19 oct. 2026) : pendant l'appel, la transcription en direct et les notes à gauche, le micro, le chrono et Stop à droite, puis sous le micro « Qui appelle ? » (une recherche, « C'est lui » d'un clic) ou « Vous appelez » avec « Changer ». Un appel rapide s'ouvre sur « Qui appelez-vous ? » : à gauche la recherche et les personnes du jour, à droite « Pas en base ? » en trois champs (nom, agence, téléphone) et « Créer et appeler ». Le premier candidat d'un rappel porte « C'est lui » en bouton menthe. Après l'analyse, « Pas la bonne personne » (bouton à contour) revient au choix sans perdre l'appel. Le mode Essai porte une pastille ambre « Essai » dans le bandeau. Au téléphone, une phrase ambre sous le micro rappelle que l'appel prend le micro.

**Écrans d'appel au registre des actions proposées** (Jules, 21 oct. 2026) : le rappel, l'appel rapide et l'appel en cours du Mode appel reprennent le vocabulaire de `SequenceActions`, posé dans `src/components/prospection/StyleAppel.jsx` : étiquettes en petites capitales (12 px, interlettrage .14em, `ardoise`), cartes à bord `bord-doux` et rayon de 18 px, champs de notes dans la même carte, trait vertical menthe qui relie les cartes avec son moment (« En ligne », « Fin de l'appel »), et l'action principale en grand bouton pleine largeur (`py-[18px]`, 17 px) : Stop et Raccrocher en `alerte`, Valider la note en `encre`. Les gestes secondaires (Rappeler, Message laissé, annuler) restent de petites pilules au-dessus.

**L'écran d'un appel en cours, rappel et appel rapide** (maquette de Jules, 21 oct. 2026, `EcranEnLigne.jsx`) : tout est centré dès l'appel, sans bandeau. En tête, une pastille à contour (point `alerte` qui pulse, l'état, le chrono, « Essai » en `ambre`), le nom en 34 px (celui qui se présente tant qu'il n'est pas confirmé), l'agence et « agent à confirmer » en `ardoise`, puis le micro en **simple contour** à la couleur choisie (jamais un disque plein) et « Raccrocher » en pilule `alerte`. Dessous, deux colonnes : la transcription en direct dans une carte (qui parle dans une gouttière de 66 px, la personne en `menthe`, « Vous » en `ardoise` ; montants, voies, bail et bien surlignés en `relief`, trois points tant qu'il en arrive), puis à droite la calculatrice (loyer et prix entendus, corrigeables, « Loyer repris de l'appel » en `menthe`, rendement brut sur fond `relief`, prix maximum pour viser 5, 6 et 7 %) et les notes, chacune dans sa carte. L'écran du rappel prend le fond choisi dans les Paramètres, halo compris (sauf en clair ou halo éteint), cadré dans l'écran ; ni l'appel en cours ni la note vocale n'ont de bandeau en haut, et le micro de la note est lui aussi un simple contour (21 oct. 2026).

**La note d'après l'appel, avant toute action** (Jules, 21 oct. 2026, `NoteApresAppel.jsx`) : au raccrochage (Mode appel, appel rapide, rappel déjà identifié), un écran centré « Une précision ? » ; le micro s'ouvre seul (simple contour, `menthe` quand il écoute), une barre fine se vide en cinq secondes (« Haka continue dans N s »), un champ pour l'écrire, « Continuer avec cette note » en grand bouton `encre`, « Passer » en lien. Rien dit ni tapé : l'écran passe seul et l'analyse suit comme avant. Une phrase dite rejoint les notes, qui font foi.

**Étapes du dossier validées à la main** (Jules, 21 oct. 2026) : le menu des étapes (rail à droite, frise au téléphone) n'a plus d'étape cochée d'office. Chaque étape non validée porte à droite un petit rond à contour avec un check ; un clic le valide, le rond de l'étape se remplit de `menthe` avec son check (même si c'est l'étape ouverte), et le check de droite disparaît. Valider l'étape n valide aussi toutes celles d'avant. L'état est gardé sur le dossier (`frise_validee`), indépendamment de l'avancement calculé par le serveur.

**Listes de la Prospection, toutes visibles** (Jules, 21 oct. 2026) : la rangée des intercalaires de villes passe à la ligne au lieu de défiler, toutes les listes se voient toujours ; celles qu'on ne consulte pas sont sur un voile clair (`encre` à 6 %, 10 % au survol), celle qu'on consulte garde la teinte sombre du classeur (`bg-rail`), raccordée au tableau.

**La fiche d'avant l'appel, en Mode appel** (maquette de Jules, 21 oct. 2026) : une carte arrondie à 24 px. En tête, « Tableau prospection · ville » et l'état en pastille (`menthe`, `ambre` en relance), le nom au pas « titre » (22 à 30 px ; texte réduit le 21 oct. 2026, Jules : « le texte est trop grand »), la personne, sa fonction et son numéro en `encre` ; à droite le micro en rond à contour, « Appeler » en pilule `menthe` avec le téléphone, « Passer » à contour. Un filet, puis trois colonnes : interlocuteurs (l'actif sur `relief`, sa source en `menthe`) et historique ; l'accroche au pas « intertitre » (20 px) puis les recherches clients en lignes au pas « table » (13,5 px) (ce qu'elles cherchent à gauche, le budget à droite) ; « Déjà appelé ? » : une grande carte pour dire ou écrire l'appel (dictée en bas à gauche, Analyser en pilule `menthe`), et « Pas de réponse ou répondeur » sur toute la largeur. Les filets horizontaux sont des `h-px bg-bord-doux`, pas des bordures : la grille de points efface les bordures horizontales. L'appel en cours garde ses trois parties.

**Après le raccrochage, la note dans une bande** (Jules, 21 oct. 2026 : « pas de gros carré au milieu, ça doit passer tout seul ») : pour un rappel ou un appel rapide, l'écran de l'appel reste (transcription, calculatrice, notes) ; l'en-tête cède la place à une bande compacte : la question au pas « titre », une ligne d'aide, le micro en rond à contour qui écoute seul, « Passer » (ou « Continuer » dès qu'une phrase est dite), et une barre fine qui se vide en cinq secondes. Rien dit : la suite part d'elle-même. Plus de grand champ de texte : on écrit dans la carte des notes. Le Mode appel prend la même bande.

**La Data Room, une zone de dépôt par type** (Jules, 29 oct. 2026 : « on n'a pas une dropbox, on en a plusieurs ; on met les documents, ça ne fait rien, on voit juste que c'est bien importé ») : l'étape Data Room n'affiche plus que ses zones, en grille (une colonne au téléphone, deux, trois en grand), pleine largeur, sans colonne de droite. Une zone par type : Bail, Avenants, Quittances de loyer, PV d'AG, Règlement de copropriété, Diagnostics, Avis de taxe foncière, Kbis du locataire, Fiche du bien ; puis les types nommés par l'analyste ; « Sans type » seulement s'il y reste une pièce d'avant. Toute la carte se clique pour importer (Jules, même jour). En dernier, la carte « + Autre type de document » remplace « Autre pièce » : on nomme le type, on peut écrire le contexte, puis « Choisir le fichier » ; un type créé et vide se retire d'une croix. Sous chaque pièce, son contexte en 12,5 px `ardoise` (« + Ajouter du contexte » en `brume` sinon), qui s'ouvre de lui-même après un import sans contexte ; l'IA le lit avec la pièce, à la lecture comme à la question. Cadre en pointillés rayon 14 (`bord`, `bord-doux` dès qu'une pièce est là, `menthe` et fond `menthe/[0.06]` au survol d'un glisser), titre 15 px, compte à droite (« 1 / 3 » en `brume` tant qu'il en manque, le nombre en `menthe` sinon), une ligne par pièce importée (coche `menthe`, nom, taille, croix de retrait au survol avec fenêtre de confirmation), « Cliquez ou glissez un fichier » en bas. Le dépôt ne lit rien, ne classe rien, ne convertit rien. En haut à droite du dossier, à gauche du « ⋯ », deux gestes numérotés dans l'ordre du travail (Jules, même jour, après avis ; d'abord posés sous les zones, remontés le même jour), qui n'apparaissent qu'une fois une pièce déposée : « 1 Ranger dans le Drive » (bordé `menthe` tant que des pièces n'y sont pas, leur nombre en pastille `ambre` si le Drive existe déjà) ouvre la fenêtre « Les noms pour le Drive » : par zone, un champ par pièce avec le nom proposé (« Bail commercial - SARL RIMEL - 16.03.2026.pdf », lu dans les deux premières pages, seulement à ce clic), « Aujourd'hui : » et l'ancien nom en `brume` dessous, puis « Créer le dossier Drive » en menthe et « Proposer à nouveau ». Valider renomme d'abord les pièces dans Klocka (toujours, même pour un dossier de test ou si le Drive refuse) puis les range dans le Drive du dossier (« VILLE - adresse »), un sous-dossier par famille (00 Fiche du bien, 01 Bail, 02 Quittances, 03 Copropriété, 04 Diagnostics, 05 Fiscalité et société, 06 Autres pièces), avec le Google Doc « Contexte du dossier ». « 2 Lancer l'analyse » (menthe une fois tout rangé) lit chaque pièce pas encore lue et ouvre l'étape Analyse. « Ouvrir le Drive » en icône à leur gauche, dès que le dossier Drive existe. Pas de bascule Mode IA / Normal sur la Data Room : toujours en mode normal. La source d'une case s'ouvre sur la page du PDF elle-même, dessinée par pdf.js, le passage cité surligné dessus en aplat `ambre/40` cerné d'`ambre/60`, amené au centre ; rien d'écrit au-dessus (ni « Passage cité », ni état de la page : Jules, même jour), seulement ‹ 3 / 12 › en haut à gauche quand la pièce a plusieurs pages. Un clic sur une source (pilule d'une ligne, valeur d'un croisement) n'ouvre à droite que cette page et son passage surligné, avec une croix flottante ; un clic sur la ligne fait de même avec la source retenue (Jules, même jour : « pas d'autre truc ») ; la citation absente de la page dite est cherchée dans les autres ; sur un scan (pas de couche texte), la page s'affiche d'abord, une pastille ronde à roue `ambre` en bas à gauche dit que l'OCR la lit (tesseract.js dans le navigateur, français, environ 2 s par page), puis le passage se surligne de la même façon, la page dite d'abord, puis celle d'après et celle d'avant ; « Texte » garde la page en texte brut. Les grilles ont des traits verticaux continus entre les colonnes et un trait à gauche du tableau (le remplissage dans les cellules) ; la source se nomme par sa pièce (« Bail p. 4 ») et aucun nom de fichier ne s'affiche sous le titre d'une grille ; les « Croisements entre pièces » ne s'affichent plus ; les onglets de l'Analyse descendent de 24 px sous l'en-tête (Jules, 29 oct. 2026). En tête du dossier, une seule ligne : « Tous les dossiers » à gauche, le nom au milieu, les gestes et le « ⋯ » à droite ; au téléphone, le nom passe dessous. Toutes les cases des grilles et du tableau Bien se modifient d'un clic sur « Ce qu'on y lit » (Entrée enregistre, Échap annule) ; toute la case d'état prend sa couleur, et un clic la fait tourner sans menu (Lu par l'IA, puis Modifié par, puis OK, puis Lu par l'IA ; la valeur saisie à la main reste de côté et revient au tour suivant ; une case sans valeur ne tourne pas) : grise « Lu par l'IA » (`rail-actif`), jaune « Modifié par Nora » (`jaune/15`, texte `jaune`), verte « OK » (`vert/15`, texte `vert`) ; vert et jaune sont fixes, ils ne suivent pas l'accent choisi dans Compte ; sans valeur, le mot d'origine (Non trouvé, Pièce absente), et aucune relecture ne change une case tranchée. Le libellé d'une ligne ouvre sa source. Tout tableau a ses lignes : cadre fermé, traits horizontaux et verticaux continus. Le dossier ouvert, titre compris, est posé sur une carte `bg-rail` (la couleur de la barre de navigation), rayon 18, filet `trait`, `p-6` (`p-4` au téléphone) ; le tableau Bien n'a plus de fond à lui (Jules, 29 oct. 2026). L'étape Analyse s'ouvre en mode normal, comme la Data Room (Jules, 29 oct. 2026, qui remplace « Analyse en mode IA » du 21 oct.). Les grilles de l'Analyse (Bail, Quittances, Copropriété, Diagnostics) se lisent case par case, la pièce et son passage surligné dans un panneau de 760 px à droite ; une pièce déposée et pas encore lue s'y dit « Pas encore lue ».

## 7. Les documents imprimés

L'avis de valeur (`avis-valeur.css`) et le mandat (`mandat-mynotary.css`) ont
**leur propre palette**, figée, en hexadécimal dans leur feuille : ils
s'impriment et ne suivent pas le thème.

- Pages A4 en millimètres ; tout se mesure en `mm` et `pt`.
- Le logo : `LogoKP` (tracé du K de « Logo K.pdf ») ou `public/logo-kpartners.png`.
- Les mentions de l'agence : `src/lib/agence-klocka.json`, jamais recopiées.
- Tout texte du document est modifiable ; une mise en forme se garde dans
  `avis.styles`, un déplacement dans `avis.positions` (en mm).
- À l'impression, rien de l'écran ne sort (`.avis-ecran`, cadres, poignées).
- La lettre d'intention (page Offres, `offres/lettre-intention.css`) suit le
  modèle « Lettre d'intention - 1 avenue Mirabeau v2 » : en-tête K et date en
  vert, acquéreur à gauche, vendeur dans l'encart gris, titres numérotés en
  vert, cadres de signature. Son texte vient d'un seul endroit
  (`server/ak/loi.js`, `blocs()`) : l'écran, le Word et le PDF en sortent. Un
  paragraphe retouché à la main porte un point dans la marge et une flèche
  pour revenir au modèle (4 oct. 2026).
- Deux modèles de lettre d'intention : « Classique » (le v2 ci-dessus) et
  « Menthe » (« Lettre d'intention - 1c bande menthe » : le K de Klocka en
  tête sur un filet noir (5 oct. 2026, à la place du mot KLOCKA), titre et adresse courte en menthe, sections 00 à 03 en grands
  chiffres fins, lignes de signature, bande menthe au pied). Une lettre neuve
  montre les deux côte à côte, remplies ; on choisit, puis tout se construit
  sur le modèle choisi, Word et PDF compris. « Changer de modèle » rouvre le
  choix (5 oct. 2026). Quel que soit le modèle, et dès le choix des deux
  côte à côte, la lettre se modifie dans l'aperçu : paragraphes, titres,
  parties, adresse du bien, noms au-dessus des signatures (5 oct. 2026).
- Deux marques pour ces documents (26 oct. 2026, Jules) : Klocka et K Partners. Le texte et la mise en page
  sont communs ; la marque change les couleurs, le logo et le pied. Chaque espace ne voit que la sienne (26 oct.
  2026, Jules) : l'équipe, Klocka (les lettres de la page Offres, sans choix) ; les mandataires, K Partners
  (l'avis de valeur). La lettre en K Partners : logo « kp » et son trait,
  accents indigo `#3F47B8`, encart brume `#EEF0FF`, bande indigo, Hanken Grotesk, pied « K Partners · un réseau
  Klocka » ; KLOCKA reste le conseil nommé (sa carte T porte l'opération). Le modèle « Menthe » s'appelle
  désormais « Bande », sa couleur suivant la marque. L'avis de valeur est K Partners pour les mandataires ;
  sa variante Klocka (`.avis-klocka`) reprend la palette d'avant la charte (sauge, Montserrat, le K de Klocka,
  `marque/LogoKlocka`). Les quatre se voient dans Administration > Modèles, remplis avec un exemple.
- 30 oct. 2026, Jules : la lettre d'intention suit le texte de la LOI de référence (« LOI OC - 1 av Mirabeau ») :
  le conseil, la désignation du bien et les pièces du vendeur en listes à tirets (bloc `liste`, un tiret par
  ligne, tiret en retrait et texte aligné dessous). « À l'attention de » : l'agence, « Représentée par » l'agent,
  l'adresse de l'agence, repris de Twenty CRM. Sans nom de vendeur, « Le vendeur », jamais « [vendeur] ».
- 30 oct. 2026, Jules : dans un document imprimé, **le pied de page est toujours en bas de page**, jamais à la
  suite du texte : à l'impression, le bas (`.loi-bas`) est fixé et se répète au bas de chaque page, et le corps
  réserve sa place en haut et en bas de chaque page (`box-decoration-break: clone`).

## 8. Les mots de l'interface

- Français, phrases courtes, vouvoiement du mandataire.
- Pas d'emoji, pas de tiret cadratin, pas de jargon interne à l'écran (« ALX »,
  « surcouche », noms de champs techniques).
- Un même objet porte le même nom partout (« Sans réponse » ou « Il n'a pas
  décroché » : choisir un).
- Un statut dit où l'on en est et ce qui manque (« 2 informations encore
  attendues »), pas ce que fait le code.

## 9. Avant de livrer un écran

- [ ] Que des jetons : aucune couleur, taille ou rayon inventé.
- [ ] Thème clair vérifié pour toute couleur figée.
- [ ] Téléphone : rien ne déborde, champs en 16 px, gestes visibles au doigt.
- [ ] Un seul bouton principal par zone ; chaque icône a son `aria-label`.
- [ ] L'état vide, le chargement et l'erreur ont chacun leur phrase.
- [ ] Le motif existe déjà ailleurs ? Le reprendre (listes, écran scindé, barres).
- [ ] Lint (`react/jsx-no-undef` compris), tests et build passent ; l'écran a
      été vu, ou il est dit qu'il ne l'a pas été.

**Suivi > Appels, « Mes appels »** (Jules, 16 oct. 2026) : l'onglet prend la place de « Contexte » (le contexte gagné se lit dans l'Intelligence). Chacun y voit ses propres chiffres, ceux du tableau par analyste, chacun dans une carte `Chiffre`, puis sa courbe par jour et un lien « Voir mes appels, un par un ». La « Part de parole » est la part du temps où l'analyste parle (voix séparées par Voxtral sur l'audio entier, envoyé après le raccrochage ; la voix la plus forte est la sienne, règle à vérifier sur de vrais appels) ; « — » tant qu'aucun appel n'est mesuré. Les filtres par mode (Tout, Prospection, Relances, Rappel, Essai) n'existent plus : le graphique « Par mode » reste dans la vue d'ensemble.

**Clients et Utilisateurs** (Jules, 16 oct. 2026) : l'ancienne page Clients (les comptes de la plateforme, invitations, familles) devient « Utilisateurs » (`/Utilisateurs`, icône Users). « Clients » (`/Clients`, icône BookUser) reprend la page Clients des mandataires (cartes ou tableau, recherche en pilule, fiche à droite en 600 px) avec les vrais noms. En tête : « Enregistrer un appel » (pilule menthe, icône micro) et « Nouveau client » (bordée). La fiche : « Enregistrer l'appel » et « Coller un résumé » sous le nom, la prochaine étape dans un cadre menthe, puis CE QU'IL CHERCHE, CE QU'ON SAIT DE LUI, CE QUE VOIENT LES MANDATAIRES (case à cocher et l'aperçu anonyme tel quel), APPELS (une ligne par appel, dépliable sur sa transcription). L'appel s'ouvre en fenêtre centrée de 640 px : deux onglets en pilule (Enregistrer l'appel, Coller le résumé), la transcription en direct dans un cadre, « Terminer l'appel » en `alerte` ; à la fin, le résumé, « Ce qui a changé » en lignes libellé / valeur (avant en `brume`), Monday et le réseau en une ligne chacun, « C'est bon » et « Annuler l'appel ».

**Outils (ex-K-Data)** (Jules, 16 oct. 2026) : l'espace K-Data s'appelle « Outils » partout à l'écran (bascule Klocka | Outils, barre du haut, tableau de bord, surtitres des pages) ; les noms des outils (K-Zoning, K-Expertise…) ne changent pas. Vacance, qui avait son entrée « Outils » dans le menu, devient l'outil « Signaux de vacance » de cet espace (carte sur le tableau de bord, image tirée de sa carte), et l'entrée du menu disparaît. Il s'ouvre seul : le composeur ne le lance pas sur une adresse (`lancable: false`).

**Mes appels, en graphiques** (Jules, 16 oct. 2026) : en tête, cinq `ChiffreCourbe` (Appels, Joints, Au téléphone, Part de parole, Post-appel) ; puis les graphiques de la vue d'ensemble sur ses seuls appels (par jour, joints, temps et nombre, après l'appel, cumul, durée, jour × heure, heures) ; puis Mes issues, Par mode, Durées ; enfin « Tous mes chiffres » en grille dans un `Cadre`.

**L'assistant Klocka, en bas à gauche** (Jules, 16 oct. 2026) : la fenêtre passe par-dessus la barre, collée à 12 px du bord gauche, 420 × 640 au départ. Elle se redimensionne par son coin en haut à droite (le coin se montre au survol, curseur `nesw-resize`, au moins 340 × 360) et garde sa taille dans le navigateur. Sa barre du haut, en `bg-rail` comme la barre de navigation : la photo d'AK (44 px) avec sa pastille `menthe`, « Assistant Klocka » seul, la croix. Le fil est compact : pas de portrait devant chaque réponse, la date entre deux jours (« AUJOURD'HUI » entre deux traits), l'heure puis les deux pouces sous chaque réponse. Partout, deux puces « Libellé : valeur — explication » ou plus, ou un tableau, deviennent une carte de chiffres : un cadre `trait` arrondi à 16 px, une ligne par chiffre, le libellé en `ardoise` à gauche, la valeur à droite, l'explication dessous en `craie` (`src/lib/chiffres-message.js`).

**Objections à résoudre** (Jules, 16 oct. 2026) : sur le Dashboard de l'équipe, sous la journée de l'Intelligence, un cadre `bg-rail` rayon 18, étiquette « OBJECTIONS À RÉSOUDRE · n », absent s'il n'y en a pas. Une objection par ligne : l'agence, qui appelait et quand en 12,5 px `ardoise`, le sujet en pastille bordée, la phrase entre guillemets en 15 px, le lecteur audio natif (15 s), les réponses proposées (prénom en `menthe`), puis un champ « Ce que vous auriez répondu… », « Proposer » (bordé) et « Résolue » (pilule menthe). Cinq au plus.

**Annonce « AK a un nouveau look »** (Jules, 16 oct. 2026) : même fenêtre que « Tout préparé » (fond `bg-fond`, rayon 28, voile flouté, blanc et gris sans accent). Le portrait d'AK (100 px) arrive en tournant sur lui-même (`k-ak-portrait`) puis flotte, dans un anneau de lumière qui tourne (`k-ak-anneau`) ; le titre en 32 px traversé du reflet (`k-reflet`) ; trois lignes cochées une à une (présentations, projets, données) ; « Découvrir AK → ». Une fois par personne et par navigateur (localStorage `klocka.ak-nouveau-look.v1`), sur le Dashboard de l'équipe.

**Quoi de neuf** (Jules, 16 oct. 2026) : le briefing du jour, même fenêtre que « Tout préparé ». En surtitre la date (« VENDREDI 16 OCTOBRE », ou « DEPUIS VOTRE DERNIÈRE VISITE » sur plusieurs jours), « Quoi de neuf » traversé du reflet, le nombre de nouveautés, puis une ligne cochée par nouveauté (titre en 16 px, phrase en 14,5 px `ardoise`, « Voir → » à droite) et « C'est parti → ». Sur le Dashboard de l'équipe, une fois par jour et par navigateur, après l'annonce d'AK. Le contenu vit dans `src/lib/nouveautes.js`, une journée par entrée, écrit pour l'équipe.

**Agents** (Jules, 16 oct. 2026) : page du menu, après Relances. Les cartes des Clients (petite tête tirée de l'identifiant, nom, agence · ville, dernier contact, appels et conversations, le dernier résumé sur deux lignes, « Appelé par … »), recherche en pilule et filtres Contactés (par défaut), Envoient des fiches, À rappeler, Tous ; soixante cartes puis « Afficher … de plus ». Un clic ouvre un tiroir à droite de 640 px : la fiche de l'agent (`FicheContact`, la même que dans la Prospection), puis TOUS SES APPELS, une ligne par appel (date, qui a appelé, durée, issue, résumé), dépliable sur ce qui a été compris, les phrases exactes, les notes et la transcription ; « Tout déplier ».

**Chargement** (Jules, 16 oct. 2026 : « des animations partout, harmonise ») : tout chargement passe par `src/components/ui/Chargement.jsx`, l'animation du panneau de droite des Présentations (mini-diapositives qui se relaient, titre traversé de lumière, phrase qui change toutes les 2 s). `taille="grand"` pour une page ou un panneau (et entre deux pages), `"moyen"` (défaut) pour un cadre, `"petit"` pour une ligne ; `titre` et `etats` (trois phrases) se disent selon l'endroit. Plus de « Lecture… » ni de roue seule ; la petite roue reste seulement dans un bouton qui travaille.

**Le mail « Ma journée » remplace « Quoi de neuf »** (Jules, 18 oct. 2026 : « au lieu de la pop-up, dans le mail ») : la fenêtre « Quoi de neuf » n'existe plus (composant supprimé, plus rien à l'arrivée). Chaque matin ouvré vers 8 h, sur Render, chaque personne de l'équipe reçoit son mail « Bonjour Nora, votre journée » (modèle de plateforme `ma_journee`, thème clair) : trois parties en titres majuscules, seulement celles qui ont quelque chose à dire. NOUVEAU SUR KLOCKA (les nouveautés pas encore annoncées, `src/lib/nouveautes.js` ; le lundi reprend le vendredi et le week-end), RELANCES À FAIRE AUJOURD'HUI (celles des agents qu'elle a appelés en premier, un agent par ligne avec son agence et son motif ; celles sans propriétaire comptées sans nom), À FAIRE DANS DOSSIERS (« À toi d'agir » de la page Dossiers, avec le pourquoi, huit au plus, et le nombre de dossiers qui attendent un tiers). Rien ne part pour quelqu'un dont les trois parties sont vides ; un passage complet fait par jour, un envoi raté est retenté au tour suivant. Le récap du matin personnel de Jules (launchd) est désactivé le même jour.

**Fenêtres d'arrivée et mail des nouveautés** (Jules, 16 oct. 2026) : l'annonce d'AK et « Quoi de neuf » s'ouvrent dès l'arrivée, sur n'importe quelle page de l'équipe (Layout), plus seulement sur le Dashboard. Chaque matin vers 8 h, l'équipe (les admins, sans comptes de test) reçoit le mail « Quoi de neuf sur Klocka » (modèle de plateforme `nouveautes_du_jour`, thème clair) : les nouveautés de la veille en lignes « **Titre** · phrase », puis « Ouvrir Klocka ». Du lundi au vendredi seulement ; le lundi reprend le vendredi et le week-end (Jules, même jour). Rien ne part un jour sans nouveauté ; sur Render seulement.

**Mode appel, trois cas lus dans l'appel** (Jules, 16 oct. 2026) : « Que du résidentiel » (validé d'office, l'agence sort de la file, ni relance ni Monday ni mail) ; « Il rappelle tout de suite » (validé d'office, l'appel est noté, rien d'autre ; son rappel passe par « Rappel ») ; un agent qui demande un SMS : l'étape « SMS » remplace l'email (texte modifiable, « Ouvrir dans Messages », « Copier le texte »), envoyé depuis le téléphone et noté au journal. Dans la fenêtre des actions, la barre blanche est portée par l'onglet ouvert (5 px, `bg-encre`), plus par un repère mesuré. Après les dix secondes d'annulation, l'écran attend le mail six secondes au plus, puis « Tout préparé » dit « En cours d'envoi ».

**La présentation vue du client** (Jules, 16 oct. 2026 : « il voit exactement ce qu'on voit ») : le même écran que l'équipe, à l'identique, l'assistant n'y est jamais nommé AK (Jules, même jour) ; il s'ouvre déjà en fil, la saisie en bas (`filVide`) : le même chat (`ChatDashboard`, espace « presentation_client », sa route `/api/client/ak`), la même colonne redimensionnable, l'éditeur en carte à droite, le fond sobre ; en tête « Que voulez-vous changer ? ». AK n'y touche qu'à cette présentation (`server/presentation-client.js`). Au téléphone, « Demander à AK » ouvre le chat en plein écran. En bas à droite, un cadre flou : « Comment aimez-vous le design de la présentation ? » et cinq étoiles (`ambre` une fois choisies) ; la note, une par client et par présentation, arrive dans le Feedback avec ses étoiles.

**Pour progresser, retiré le 17 oct. 2026 (Jules : « enlève la fonctionnalité »)** : le cadre, les tutos, le quiz du matin et leur route ne sont plus branchés ; `server/coaching.js` reste, déconnecté. Description d'origine (16 oct. 2026) : sur le Dashboard, sous le chat, un cadre `bg-rail` « POUR PROGRESSER » : le quiz du jour en carte menthe (« Je t'ai préparé un petit quiz ! », « Jouer → »), les tutos à lire en lignes (icône livre menthe, titre, « Après ton appel » ou « Tu l'as demandé » · 2 minutes, « Lire → »), puis « Sur quoi as-tu bloqué ? » et « Prépare-moi un tuto ». Le tuto et le quiz s'ouvrent dans la fenêtre de « Tout préparé » : titre traversé du reflet, étapes numérotées, « À DIRE, MOT POUR MOT » dans un cadre, le piège en `ambre` ; au quiz, la bonne réponse en menthe avec sa coche, la mauvaise bordée `alerte`, l'explication dessous, le score en titre.

**AK en bas à gauche, retiré le 17 oct. 2026** (Jules, 16 oct. 2026) : le bas de la barre latérale ne garde que l'entrée d'AK (portrait 32 px, « AK », « Discuter » ou « n nouveaux messages », anneau de lumière et pastille menthe quand il a écrit) et l'icône de déconnexion ; ni photo, ni nom, ni autres icônes. Nommée « Assistant Klocka » à l'écran (Jules, même jour). Au clic, ou tout seul à l'arrivée d'un message, un panneau de 420 px s'ouvre en bas à gauche, par-dessus la barre : le vrai chat d'AK (`ChatDashboard`, `cible="ak"`) sur la conversation « Messages d'AK », où il écrit de lui-même (pré-analyse d'une fiche arrivée par mail, avec la carte « Ouvrir »). Au téléphone, l'entrée flotte en bas à gauche.

**L'écran « Cet écran n'a pas pu s'afficher »** (Jules, 18 oct. 2026) : la barrière d'erreur (`BarriereErreur.jsx`) reprend l'interface au lieu d'un fond noir fixe. Le fond est le `FondHalo` des pages, qui suit le thème, le fond et l'accent choisis dans le compte (clair, anthracite, corail… tout passe par les variables posées sur `<html>` dès le chargement). Au centre : le portrait d'AK (48 px), le titre en 28 px `font-normal`, deux phrases en `ardoise`, puis « Recharger » en pilule `encre` (le bouton principal) et « Réessayer » en pilule bordée `trait`. Les boutons prennent le réglage Boutons du compte (`rounded-full`). Le détail technique est replié dans une carte `bg-rail` à 16 px de rayon.

**La roue de conversion de la Data Room** (Jules, 18 oct. 2026, d'après Tangerine) : un fichier glissé sur la Data Room en tenant Maj (carte Data Room de la colonne de droite, ou la vue Documents) ouvre une roue sous le curseur ; sans Maj, le glisser garde son effet. Aussi par le bouton « Convertir » (bordé, icône double flèche, à gauche d'« Ajouter des fichiers ») et « Convertir… » dans le menu ⋯ d'une pièce. La roue : 364 px, un disque `bg-fond/55` flouté, bordure `trait`, l'ombre douce des menus ; les secteurs en `barre-relief` opaque, séparés par une bande de 6 px de largeur constante, coins arrondis ; le secteur survolé en `menthe`, son texte en `sur-menthe` ; libellés en capitales 12 px (une icône au-dessus pour une action : Compresser, Réduire). Au centre, un moyeu de 96 px en `bg-rail` : le format d'origine, et « Data Room » ; y lâcher le fichier le range tel quel. Le catalogue est dans `src/lib/conversions.js` (une ligne par conversion), les convertisseurs dans `src/lib/convertir-fichier.js` : tout se fait dans le navigateur (pdf.js, mammoth, docx, jsPDF, JSZip, chargés au premier usage). Le résultat part dans les téléchargements ; l'avis propose « Ranger dans la Data Room ». Un PDF de plusieurs pages en images devient un ZIP, une image par page. Un PDF scanné n'a pas de texte : TXT et DOCX le disent et proposent JPG ou PNG.

**Utilisateurs, harmonisée** (Jules, 18 oct. 2026) : la page reprend les pages Relations (Agents, Clients). En-tête : le titre en 34 px `font-medium`, le compte à côté en `ardoise` (« 4 clients actifs · 76 en attente d'activation · 10 admins »), une phrase dessous ; à droite, la pilule segmentée Utilisateurs / Familles puis « Inviter un client » en pilule `menthe`. Le bandeau de cinq chiffres est retiré. La recherche en pilule de 48 px, « Envoyer les liens » en pilule `encre` à côté ; les étapes en pilules filtres (« Acculturation 4 »), l'active en `encre`. « En attente d'activation » et la liste sont des cartes `bg-rail` à 16 px, une ligne par compte ; les initiales sur `bg-relief` ; les étiquettes (Admin, Mandataire, Famille) en petites pilules `bg-rail-actif` en minuscules ; « Lien », « Inviter » et « Client direct » en pilules. Plus de capitales espacées hors des titres de bloc. Familles : champs en pilule, liste en carte.

**Le Suivi dans Administration** (Jules, 18 oct. 2026) : le Suivi quitte la section de Paramètres où il était depuis le 17 oct. et devient le quatrième onglet d'Administration (Intelligence, Utilisateurs, Automatismes, Suivi). Ses pages de détail (SuiviAppels, SuiviHaka…) gardent l'onglet allumé (`aussi` dans `src/lib/menu.js`).

**Les courbes des clients, page Utilisateurs** (Jules, 18 oct. 2026) : sous la phrase d'en-tête, « Évolution des clients » avec la période en petites pilules (30 jours, 90 jours, 1 an ; l'active en `menthe`), trois `ChiffreCourbe` (Comptes clients, Clients connectés, Temps moyen par client), puis deux `Croissance` côte à côte : « Nombre de clients » (comptes cumulés, déjà connectés) et « Durée de connexion des clients » (minutes du jour, moyenne par client connecté). Les mêmes composants que le Suivi et l'Intelligence (`GraphesAppels.jsx`). Un client : ni admin ni mandataire. La durée est estimée à partir des pages ouvertes (une pause de plus de 30 minutes coupe la session, une minute pour lire la dernière page), et l'aide du graphique le dit.

**La modification de projet, comme le mode IA d'un dossier** (Jules, 18 oct. 2026) : la barre de navigation reste à gauche, repliée en rail (Layout, comme un dossier ouvert), et le fond Halo reste. La colonne de gauche est celle du mode IA d'un dossier : « Par où commence-t-on ? » au centre en grand (22 à 28 px, `k-balayage`), la saisie en bas avec « + » (pièce jointe), « Sources : Auto » et le micro, « Historique » juste au-dessus ; la barre du haut (« Tous les projets ») n'apparaît qu'une fois la conversation lancée. Le projet est posé sur le fond comme un dossier, séparé du chat par un simple filet (maquette de Jules, le même jour) : plus de fenêtre encadrée. En-tête de page qui défile avec le contenu : « ← Tous les projets », le titre en 34 px, « Enregistré automatiquement » dessous ; à droite Édition / Lecture / Sources (le sélecteur de Mode IA / Normal), Annuler, Rétablir, l'aperçu, Enregistrer en pilule `menthe` et « … » (bordé, 40 px ; il ouvre Assigner, les champs, les versions, le dossier). Plus de croix : le lien retour la remplace. Dessous, les onglets soulignés (`Onglets` en taille page), avant la photo ; « Simulateur complet → » passe sous la photo (`sansBarreOnglets` de `ProjetContent`, l'éditeur seulement : la page du client garde ses pilules).


**K-Vacance devient la carte des signaux** (Jules, 19 oct. 2026 : « remplace K-Vacance par les Signaux de vacance, mais garde le nom K-Vacance ») : la page `/KVacance` est la carte des signaux publics (BODACC, SIRENE) avec le taux de vacance de la zone, de la rue et de la commune ; l'entrée « Signaux de vacance » n'existe plus dans le menu des outils, et l'ancienne adresse `/Outils` renvoie à K-Vacance avec la même recherche. L'ancienne lecture « devantures vides, rythme de rotation » n'a plus d'écran (ses recherches restent en base).

**Suivi > Usage, par personne et par session** (Jules, 19 oct. 2026 : « des graphiques comme dans Apple au lieu des trucs moches », « un grand tableau par personne, je clique dans sa ligne et je vois sa dernière session ») : en tête, cinq tuiles jointes (la grille à filets de l'Audience) avec leur évolution et une petite courbe : Temps passé, Personnes actives, Connexions, Durée moyenne, Pages ouvertes ; un clic sur une tuile la met dans le grand graphique (barres par jour, moyenne en pointillé, à la manière de Temps d'écran). Puis « Où passe le temps » (pages classées par temps, pas par ouvertures) et « Quand on travaille » (jour × heure, une teinte). Puis le tableau par personne, admins compris, trié par colonne : Pages, Dernière session, Connexions 7 j et 30 j, Durée moyenne, Temps total, Vu, et les 14 derniers jours en mini-barres ; la ligne ouverte montre ses sessions à gauche et la choisie à droite (une bande par page, puis heure, page, temps). Une durée estimée (dernière page sans battement du navigateur) est en `brume` et précédée de « ~ ». Retirés de cet écran : les colonnes IA et Actions, les outils de l'assistant, ce que coûte l'IA (la page Coûts IA reste à son adresse). Le calcul : `server/usage-sessions.js`.

**Le menu des mandataires, sur la structure de l'équipe** (Jules, 19 oct. 2026) : `MENU_MANDATAIRE` dans `src/lib/menu.js`, rendu comme `MENU_ADMIN`. Entrées simples et groupes (une entrée dans la barre, onglets en pilule en tête de page) : Haka (l'accueil du mandataire sur la mise en page de celui de l'équipe : `PlanDeTravail`, salut centré, saisie au milieu avec « Dossier : aucun » (ses dossiers à lui) et « Répondre / Produire », sans « Sources » ; dessous, ses raccourcis (`RaccourcisMandataire` : Faire une estimation, Préparer un mandat, Compléter un dossier, Écrire au propriétaire, Noter un appel, Demandes des clients), un clic pose la pastille et passe en « Produire » ; rien d'autre (rappels et « À faire » retirés le 19 oct.) ; avec son chat à lui, jamais l'assistant de l'équipe) ; Prospection (Prospection, Off-market ; icône épingle) ; Biens (Estimation, Mandat, Dossiers, Mise en marché ; icône dossier) ; Clients ; Projets ; Simulateur. Feedback dans « Autre », Paramètres en bas de la barre (l'ancien « Compte »). Le Simulateur entre aussi dans le menu de l'équipe, après Appels ; dans les deux menus il est `fixe` : une ancienne préférence qui le masquait ne le cache plus.

**Le Simulateur, comme celui d'un dossier** (Jules, 19 oct. 2026) : la barre de navigation se replie à son ouverture (`PAGES_PLEINE_LARGEUR` dans `Layout.jsx`), et la page reprend le cadre du simulateur d'un dossier : le titre « Simulateur » en 34 px, puis une carte `bg-rail` à 16 px avec filet, le rail de réglages à gauche (250 px) derrière une bordure `trait`, les onglets (Graphiques, Revente, Négociation, Paramètres avancés) soulignés en `menthe` à la place des pilules, un seul fond pour les cartes du dedans. Le calcul et les composants sont les mêmes (`calculerTableauAnnuel`).

**Effets doux** (Jules, 19 oct. 2026, « partout, le Simulateur d'abord ») : une boîte à outils dans `src/index.css`, posée page par page. Les survols et transitions des boutons, liens et champs sont déjà partout. Nouveaux : `.k-entree` (l'élément monte de 10 px en fondu, 0,55 s), `.k-serie` (ses enfants entrent l'un après l'autre, 70 ms d'écart), `.k-glisse` (entrée par le côté, pour un rail), `.k-leve` et `.k-serie-leve` (au survol, la carte se soulève d'un pixel par `translate`, son filet s'éclaircit, une ombre très douce). `ChiffreDoux` (`src/components/ui/`) fait glisser un chiffre vers sa valeur : monte de zéro à l'arrivée (0,7 s), glisse de l'ancienne à la nouvelle quand un curseur bouge (0,4 s). `Depliant` (déjà utilisé par Haka) ouvre et ferme un panneau en douceur. Tout se pose à son état final avec « animations réduites » et avec le réglage du système. Posés pour l'instant sur le Simulateur : le titre, la carte, le rail (par la gauche), les blocs du contenu en cascade, les cinq indicateurs clés, les sections du rail (Acquisition, Location, Financement, Frais, Revente) et leurs sous-curseurs.

**Effets doux du Dossier** (Jules, 19 oct. 2026, « dans le dossier, quand on analyse et partout ») : la liste des dossiers entre (titre, puis recherche, puis les cartes en série, soulevées au survol, même chose pour les dossiers mandataires) ; la colonne de droite d'un dossier entre bloc après bloc ; le résultat d'une pré-analyse se pose bloc après bloc. Le travail en cours se dit par l'orbe d'AK (`PenseeIA`) et un reflet clair qui passe en boucle sur la phrase grise (`.k-scintille`) : « AK analyse la fiche… », les étapes de lecture (chacune remplace la précédente en montant), la lecture des pièces, l'ouverture d'un dossier. Pas de balayage du chat à chaque changement d'onglet : essayé puis retiré le même jour (Jules).

**Colonne Notes** (Jules, 19 oct. 2026) : chaque tableau du dossier (Bien, les grilles Bail, Quittances, Copropriété, Diagnostics, les croisements de la Synthèse) a une dernière colonne Notes, un commentaire libre par ligne, signé. « Ajouter » apparaît au survol de la ligne (toujours visible sur mobile) ; Entrée enregistre, Échap annule. La note des grilles, qui était sous la valeur, passe dans cette colonne.

**Dossier en mode IA, la cloche et le « … »** (Jules, 19 oct. 2026) : le bouton « … » est un rond de 38 px comme la cloche et prend sa colonne (centre à 16 px + 19 px du bord de l'écran) ; `.k-dossier-ia .k-actions-dossier` le décale de 16 px à droite.

**Haka en conversation** (Jules, 19 oct. 2026) : une demande envoyée depuis l'Accueil garde la barre de navigation à gauche et le fond Halo ; le chat prend la mise en page du dossier en mode IA (barre « Haka · Historique » transparente, fil et saisie au milieu, 860 px au plus). La colonne de droite (« Ce que Haka prépare ») ne s'ouvre que quand Haka a produit quelque chose : une carte qui s'ouvre, un dossier créé, une proposition dans À valider. Une simple réponse reste au milieu. Un programme dit à Haka (« aujourd'hui je dois… ») reçoit une réponse : les étapes, ce qu'on sait de chacune, puis « par quoi commencer ? » ou un rappel ; « rappelle-moi … » écrit dans le fil pose le rappel.

**L'icône Appel du coin** (Jules, 19 oct. 2026) : le rond de 44 px en haut à droite reste à sa place (la cloche et le « … » du dossier restent alignés). Au survol (0,18 s), il grossit de 8 % depuis son centre, s'éclaircit d'un voile, son filet passe de `bord-doux` à `bord-vif` et une ombre le soulève (0 10px 30px). Le panneau des deux modes, « Il me rappelle » (l'appel entrant) et « Appel rapide » (j'appelle un agent pour un dossier, un point : le même écran que le rappel ; remplace « Démarrer les appels » le 19 oct. 2026, Jules), se déplie dessous depuis son coin droit : fondu 0,16 s, 6 px de descente et 97 % → 100 % en 0,18 s, à l'envers à la fermeture. Une bande invisible de 12 px relie l'icône au panneau, qui attend 120 ms avant de se refermer. Chaque mode s'éclaircit au survol (0,14 s). Au téléphone, l'icône de la barre du haut garde son geste : un tap enregistre l'appel entrant.

**Un seul chemin pour un échange avec un agent** (Jules, 19 oct. 2026) : rappel entrant, appel rapide et échange raconté à Haka dans le chat (sans téléphone) ouvrent le même écran et donnent la même chose : identifier l'agent, « Compris : … », les actions cochées, Valider (fiche agent, Monday, relance, Intelligence). Seuls changent l'en-tête (« Rappel entrant », « Appel rapide », « Échange raconté », avec leur icône) et, pour le raconté, l'absence de micro : les notes tiennent lieu d'appel, le bouton Analyser est menthe.

**Frise de la chronologie** (Jules, 19 oct. 2026) : les colonnes s'étirent sur toute la largeur de la carte ; la dernière garde ses 230 px et la ligne s'arrête à son point. Plus de blanc après « Fin du bail ».

**Le nom à l'écran** (Jules, 19 oct. 2026) : les libellés de travail disent « Haka » et non « AK » (« Haka lit votre demande », « Haka lit l'appel », « Haka rassemble les chiffres », « Haka prépare les mails »).

**Fiches reçues : une notification, pas une pré-analyse** (Jules, 19 oct. 2026) : une fiche arrivée dans une boîte n'est plus pré-analysée toute seule. Haka la pose dans « À valider » et dans la cloche, avec deux boutons : « Pré-analyser » (la pré-analyse part en fond, puis la suite habituelle) et « Pas une fiche » (rien n'est créé, le mail garde la réponse). Les fiches d'une boîte commune sonnent aussi dans la cloche.

**Détection des fiches** (Jules, 19 oct. 2026) : un nom qui dit la fiche (« Fiche », « Teaser », « Plaquette », « Présentation », « Annonce », « Descriptif », « Dossier de vente ») l'emporte sur le classement par type ; un devis, un CV, une facture, un mandat, une attestation, une présentation d'agence n'en sont jamais ; un PDF au nom muet ne compte que si le mail parle d'un bien à vendre (murs, local, loyer, rendement, à vendre…).

**Couleur de la barre, « Personnaliser »** (Jules, 19 oct. 2026) : plus de sélecteur libre (une couleur vive inondait les panneaux, un clic ne changeait rien de visible). Deux curseurs, la teinte et l'intensité ; la clarté est tenue par le mode (sombre en sombre, claire en clair), et une teinte se pose dès le clic.

**Cartes de projets** (Jules, 19 oct. 2026) : plus de boutons « Ouvrir le projet » ni « Étape suivante » ; un clic sur la carte (ou la ligne) ouvre le projet.

**Pièce jointe dans le chat** (Jules, 19 oct. 2026) : un document joint à un message s'affiche en carte de 120 px au-dessus de la bulle, coins de 14 px : la première page d'un PDF ou l'image elle-même (JPEG de 240 px, quelques Ko, gardé dans le fil), et son type en pastille en bas à gauche (PDF, IMG, DOC, MAIL…). Un Word ou un mail n'ont pas de vignette : la carte montre leur nom. La bulle ne garde que la phrase.

**Une fiche reçue s'ouvre avant d'être rentrée** (Jules, 20 oct. 2026, « un humain dans la boucle ») : la cloche dit « Une nouvelle fiche commerciale est arrivée », de qui et l'objet, avec un bouton « Voir ». L'aperçu (fenêtre de 960 px, fond rail) a deux vues en pilule, Fiche (la pièce, PDF ou image, dans la page ; une pièce par pastille s'il y en a plusieurs) et Email (expéditeur, boîte, objet, texte) ; en bas, « Pas une fiche » et « Pré-analyser ». La même carte dans « À valider » ouvre le même aperçu.

**Fiche reçue : Oui / Non, et Haka apprend** (Jules, 20 oct. 2026) : rien n'est rentré tout seul. À l'arrivée d'une fiche, une fenêtre s'ouvre d'elle-même sur toutes les pages de l'équipe : « Nouvelle fiche commerciale : je la rentre ? », la fiche et le mail, « Non » et « Oui ». Non ouvre « Pourquoi ? » : quatre raisons en pastilles (pas une fiche, hors critères, déjà reçue, autre) et un texte, obligatoires ; le serveur refuse un Non sans raison. La croix vaut « Plus tard » (trente minutes, la fiche reste dans la cloche). Chaque réponse est gardée (`FicheDecision`) : un expéditeur déjà accepté est proposé même pour un PDF au nom muet ; une pièce refusée comme « pas une fiche » et jamais acceptée, ou un expéditeur refusé deux fois sans acceptation, ne sont plus proposés.

**Le rappel : la note vocale fait foi** (Jules, 21 oct. 2026, « il ne faut pas que ça devine ») : après « Stop », l'écran « Qui c'était, et que faut-il faire ? » ouvre le micro tout seul (30 s au plus) ; la note se dicte ou s'écrit, « Valider la note » l'envoie. L'IA n'y relève que ce qui est dit (nom, agence, ville, numéro, email), puis la fiche se cherche à l'identique : numéro ou email, sinon nom et agence. Une seule fiche : l'appel est identifié, l'analyse part, la note en tête des notes. Sinon : les fiches qui correspondent à la note, ou le nouveau contact rempli d'après elle. La transcription de l'appel ne sert plus à reconnaître la personne. Sans objet pour un appel rapide (on sait qui on appelle), un échange raconté, ou sans micro.

**Le rappel, comme le mode appel** (Jules, 21 oct. 2026) : pendant un rappel entrant, plus de cadre « Qui appelle ? » (l'appel rapide garde « Vous appelez »). Après la note, l'écran du mode appel : les actions proposées seules au centre (680 px), le bouton « Transcription » qui les fait glisser et montre à gauche la transcription et les notes ; plus de « Compris » ni de colonne de gauche ; « Pas la bonne personne » et « Abandonner » en liens discrets dessous. Quand la note ne désigne personne d'unique : la note rappelée, les fiches qu'elle désigne, et un seul bouton « Créer le contact : nom · agence », rempli d'après elle ; « Chercher dans le carnet » ouvre l'ancien écran.

**Le rappel cherche dans Monday** (Jules, 21 oct. 2026, « il est dans Monday, je ne vais pas créer un contact ») : la personne de la note se cherche au carnet, puis, si personne d'unique, dans le tableau Monday « Agent immobilier » (numéro, email, puis nom avec l'agence). Le nom se compare aussi collé, à une ou deux lettres près, et le nom de famille seul contre la fin du nom (« Roche-Baron » dicté, « LARROCHE BARON » dans Monday). Une seule ligne : sa fiche locale est reprise ou créée depuis Monday, et l'appel est identifié ; plusieurs : on choisit. « Créer le contact » ne vient qu'après.

**Navigation rapide** (Jules, 21 oct. 2026, « sur la version live, naviguer entre les pages est super lent ») : le cadre (barre latérale, cloche, fenêtres) est monté une fois et ne se reconstruit plus à chaque page (`CadrePersistant` dans App.jsx, la page change dans l'Outlet). Une page pas encore téléchargée s'attend dans sa zone, la barre reste, et rien ne s'affiche les 300 premières millisecondes ; l'écran plein « Klocka s'ouvre » ne sert plus qu'à l'ouverture de l'application. Les pages du menu se téléchargent en fond quelques secondes après l'ouverture, et une page au survol de son lien (`src/lib/precharger.js`), sauf connexion lente ou économie de données. (Pas de durée de fraîcheur globale des requêtes : celles qui partent d'un `initialData` ne chargeraient plus.)

**La cloche se range** (Jules, 21 oct. 2026) : au survol d'une ligne de « Ce qui t'attend », un réveil (« Me le rappeler » : demain, lundi, dans une semaine, à 9 h) et une croix (« Retirer »). Retirer vaut pour soi seul et ne supprime rien à la source ; remettre pose aussi un rappel à la date. Le compteur ne compte que ce qui reste.

**Les mails reçus, ce que Haka en a fait** (Jules, 21 oct. 2026) : en bas d'Administration › Automatismes, les mails des trois derniers jours qui portent une pièce, avec leur sort en clair : « Proposée » (une notification est partie), « Au prochain relevé », ou « Pas proposée » et la raison (pas de pièce, pièce qui n'est pas une fiche, conversation d'un dossier, automatisme en pause, appris comme pas une fiche…).

**Le mode du dossier suit l'étape** (Jules, 21 oct. 2026) : on arrive en mode IA sur la Pré-analyse et l'Analyse, en mode normal sur la Data Room ; les autres étapes gardent le dernier choix. L'étape ouverte se garde le temps de la session, par dossier.

**Les intercalaires de la Prospection** (Jules, 21 oct. 2026) : plus de fond derrière les onglets au repos (« Relances dues », les villes, le « + ») ; seul l'onglet ouvert garde la teinte du classeur.

**Data Room et Synthèse** (Jules, 21 oct. 2026) : dans la Data Room, l'état (« Analysé »), le type (« PDF ») et la date d'un document ouvrent le fichier réel dans un nouvel onglet ; le menu « … » de la ligne propose Renommer, Convertir, Ouvrir et Supprimer (après confirmation) ; pas de corbeille à part. Dans la Synthèse, plus de « Demander à l'agent » sous les documents manquants (un document déjà demandé le reste dit).

**Supprimer un appel du journal** (Jules, 21 oct. 2026) : dans Suivi › Appels › Journal des appels (et Prospection › Suivi), le détail d'un appel se termine par « Supprimer l'appel », après confirmation. Son auteur ou Jules seulement. L'appel quitte le journal, les chiffres et l'historique de la fiche, son écran rejoué avec lui ; ce qui était déjà parti (Monday, mail) n'est pas défait. Un rappel resté sans appel se supprime de même.

**La relance attend le retour de l'analyste** (Jules, 22 oct. 2026) : après un appel, une relance (ou la seconde relance, ou celle du mois) qui tomberait pendant une absence de l'analyste (posée dans l'Agenda, ou lue dans son agenda Google) passe au premier jour de son retour. L'étape le dit en clair (« Maxime n'est pas là du 26 au 30 octobre (école) : la relance passe au lundi 2 novembre, le jour de son retour »), comme « Pourquoi cette date » dans l'aperçu ; la ligne Monday prend la date décalée. L'agenda Google n'est attendu que 4 secondes : au-delà, seules les absences posées comptent.

**La carte de Klocka** (Jules, 22 oct. 2026) : une seule carte (`src/components/carte/CarteKlocka.jsx`), posée dans Prospection › Carte, dans Projets (bouton « Carte ») et dans Clients (vue Carte). Quatre couches de points ronds cerclés de blanc, une couleur franche par couche : Projets en menthe foncé, Prospection en bleu (`emplacement-1` ; un point par ville, sa taille suit le nombre d'agents), Clients en orange (`emplacement-1bis`), Deals en brique (`emplacement-2`). Les points sont dessinés sur un canvas : leur couleur se lit dans `JL` (littérale), les pastilles dans `J`. La page met sa couche devant (plus grosse, plus opaque) ; les pastilles en haut à gauche montrent ou cachent une couche, avec son compte. Survol : le nom et une ligne ; clic : la fiche (Monday dans un nouvel onglet). Fond : le plan Google Maps en clair (Jules, 22 oct. : « utilise Maps »), IGN en repli ; monde entier, un client à New York y a sa place. Données : `server/carte.js`, gardées 30 minutes, préparées par le serveur.

**Oui / Non dans la cloche** (Jules, 22 oct. 2026, Haka ambiant) : une question de Haka (« 2 pièces reçues pour X : je les range ? ») porte ses deux réponses dans sa ligne de « Ce qui t'attend » : Non en contour, Oui en menthe, à droite, comme le bouton Voir des fiches. Non ouvre sous la ligne une pilule de saisie « Pourquoi non ? (Haka en apprend) » et Confirmer, désactivé sous trois lettres. Dans À valider, la même question montre le mail reçu (de qui, l'objet) et le geste exact (pièces, rappel daté, réponse à relire) ; ses boutons disent Oui et Non. Une question déjà dans « Ce qui t'attend » ne se répète pas sous « Notifications » (genre `question_haka`) ; sa carte en haut à droite suit la règle des cartes (deux au plus, huit secondes).

**Mandataires dans les listes de la Prospection** (Jules, 23 oct. 2026) : au-dessus d'une liste de ville, la bascule en pilules Agences / Mandataires / Tous (celle des Clients : `bg-rail-actif`, l'onglet actif en `bg-relief`), le nombre de mandataires après le mot. Sous le nom d'un mandataire, une étiquette bleue (`bg-bleu/15 text-bleu`) « Mandataire IAD » ou « Mandataire en nom propre », puis « Publie du commerce · n » en menthe, sinon « n annonces » en relief. Sous le numéro, sa source en petit (annonce, registre, Apollo). La colonne Gérants devient SIREN (avec l'année de création) pour un mandataire. Apollo, payant, n'est qu'un bouton dans la ligne dépliée d'un mandataire sans numéro.

**Prospection du mandataire et bouton Rues** (Jules, 23 oct. 2026, révisé le soir même) : plus de bascule Commerces / Rues. L'onglet Prospecter montre l'Off-market du mandataire en pleine largeur ; sur la carte, un bouton « Rues » en pilule (`h-9`, contour, voile flouté comme les autres boutons de carte) se tient juste à gauche du plein écran. Allumé (contour menthe), il dessine les rues classées par ALX dans la teinte de leur emplacement (`TEINTE_RUE` : n°1, 1 bis, 2), sous les points, avec une légende « N°1 · N°1 bis · N°2 » en bas à gauche ; le choix est gardé. L'Off-market n'a plus d'entrée dans le menu mandataire (son adresse mène à la Prospection) ; Prospection est une entrée simple.

**Prospecter pour un client** (Jules, 24 oct. 2026) : côté mandataire, la carte de la Prospection ne montre que les commerces qui répondent au client choisi ; sa fiche tient le haut du panneau de droite (initiales dans un rond menthe, référence et « client n sur N » cliquables pour la liste, flèches précédent / suivant, critères en grille comme la page Clients, règles en pastilles : « Emplacement n°1 seulement », « Enseigne nationale seulement » en bleu, « Pas de santé » en ambre, sa remarque entre guillemets, puis « n commerces pour lui à Ville » en menthe et « Tous les commerces »). Les lignes de filtres (exploitants, bailleurs…) restent dessous. La fiche d'un commerce ouvre sur un encadré menthe : la phrase que le mandataire dit au propriétaire (`accroche`, src/lib/clients-commerces.js).

**Les biens du mandataire, comme un dossier de l'équipe** (Jules, 24 oct. 2026) : le menu du mandataire a une entrée « Biens » à la place du groupe Estimation / Mandat / Dossiers / Mise en marché. On arrive sur tous ses biens en cartes (le dessin de la carte d'un dossier : l'étape en pastille sur la grille de points, la date, le bien, puis six segments, faits en menthe, l'étape en cours en menthe à 45 %). Un bien ouvert garde le menu d'étapes de droite des dossiers de l'équipe (`MenuEtapesDroite`, `src/components/preanalyse/EtapesDossier.jsx`), au téléphone la frise en haut : Estimation, Mandat, Analyse, Mise en marché, Offre, Vente ; on arrive sur l'étape en cours, les autres restent un clic plus loin. Une étape est cochée d'après le statut de son objet (avis prêt, mandat signé, go, bien présenté, compromis, acte), sans validation à la main. Une étape ne montre que ce bien, jamais les listes ni les onglets des autres (révisé le même jour) : Estimation et Mandat comme un dossier en mode IA, le chat à gauche (sa conversation rouverte d'elle-même, « Tous les biens » en tête) et l'avis ou le mandat à droite ; pas encore faits, le chat qui les commence (« Commencez l'estimation de ce bien »). Analyse : le dossier seul (pièces ou conversation à droite). Mise en marché, Offre, Vente : la mise en marché du bien, ouverte. Tant que le dossier ou la mise en marché n'existe pas, une phrase dit ce qui l'ouvrira. Ce qui naît dans un bien s'y rattache (mandat ↔ estimation, dossier ↔ estimation). Les biens se lisent sur les liens existants (`src/lib/biens-mandataire.js`) : rien de nouveau n'est stocké.

**Le matin et l'étape Contact des biens** (Jules, 24 oct. 2026) : le matin va en tête de la page Biens, pas sous le chat de Haka (Jules l'a vidé le 19 oct.). « Aujourd'hui » en liste de lignes (`border-y border-trait`) : les rendez-vous du jour avec leur heure, puis au plus dix propriétaires à contacter (ceux qui ont un signal d'abord), chacun avec son signal en `ambre`, l'argument entre guillemets et le moyen de contact en bouton secondaire (Appeler, Écrire, ou Passer au commerce, qui ouvre l'adresse dans Maps), puis les relances. Une notification par jour ouvré, à 8 h, « Votre matinée » y mène. Les cartes portent le statut du bien (À contacter, Contacté, Rendez-vous fixé, Estimation en cours, Estimation envoyée, Mandat signé…), et sept étapes : Contact s'ajoute devant Estimation. Un propriétaire devient une carte une fois contacté ; « à appeler », il vit dans le matin et dans les listes de la Prospection. L'étape Contact : la fiche sur grille de points (le nom, « Pourquoi maintenant » en `ambre`, « Ce que vous pouvez dire » dans un encadré menthe, le contact en bouton principal), puis « Après le contact, dites à Haka ce qui s'est passé » (Haka met le statut, le rendez-vous et la note) ou l'issue d'un clic (Contacté, Rendez-vous fixé, Pas vendeur), et l'historique.

**Les mandataires se gèrent depuis Utilisateurs** (Jules, 24 oct. 2026) : la page Utilisateurs a un troisième onglet en pilule, « Mandataires », qui reprend la page Mandataires sans son titre (Mandataires d'abord, puis Secteurs, Villes Klocka, Demandes clients, Prospections). L'en-tête compte les mandataires. Sur la ligne d'un mandataire, la pastille « Mandataire » et « Gérer le mandataire » (dans le détail) ouvrent l'onglet sur sa fiche, bordée de menthe ; « Retirer le rôle mandataire » le repasse en compte client, après confirmation, sans rien effacer. L'adresse /Mandataires reste ouverte.

**Prospecter pour ses clients** (Jules, 24 oct. 2026) : l'onglet Prospecter du mandataire s'ouvre sur « Pour mes clients » (pilule avec « Tous les commerces », l'Off-market d'avant). À gauche, la carte Google de son secteur, toujours délimité (rayon 18 px, pastille « Secteur … » en haut à gauche) ; à droite, en 400 px, un client à la fois en carrousel (flèches, « client n sur N ») : seulement ceux qui cherchent dans une ville du secteur. La carte du client reprend celle de la Prospection (initiales dans un rond menthe, Cherche, Budget, Rendement, « Dans votre secteur » en pastilles menthe, règles en pastilles bleu et ambre, sa remarque), et en bas « n murs pour lui » et « Prospecter » (bouton principal). Prospecter pose sur la carte au plus 25 murs en points menthe cerclés : dans ses villes du secteur, un signal de vente au moins, propriétaire et exploitant connus, dans son budget à 20 % près ; avec un rendement exigé, le budget se compare au prix qui le lui donne (loyer ÷ rendement), le prix de la ville sinon. Les signaux les plus forts d'abord (fonds cédé, succession, fermeture, puis gérant âgé, puis ancienneté). Révisé le même jour : la mise en page de « Tous les commerces ». En haut, la pilule du secteur, « Filtrer » (la même fenêtre de filtres) et le compte des murs ; la carte en 62vh à gauche ; à droite (460 px, 520 px en très grand) la carte du client puis, dessous, le panneau de la fiche du commerce (`rounded-bloc border bg-surface`), jamais posée sur la carte. Une fiche ouverte replie la carte du client sur une ligne (initiales, référence, ce qu'il cherche et son budget, un chevron pour la déplier). Sous la carte, le tableau des murs comme celui de « Tous les commerces » : recherche « Enseigne, activité, rue, propriétaire », « Tout afficher », « Envoyer vers une liste » avec les cases, tri par colonne (signaux les plus forts d'abord), pages de 50 ; la colonne de prix s'appelle « Prix pour lui ».

**Les villes d'un secteur se lisent d'elles-mêmes** (Jules, 24 oct. 2026) : tracé, redessiné ou réattribué, un secteur fait créer (avec leur centre) et lire en fond ses villes : les Villes Klocka du contour, puis les communes cochées par le mandataire (décision du 5 oct., jamais par population). Une Ville Klocka ajoutée, une commune cochée font de même ; au démarrage du serveur, les villes pas encore lues des secteurs attribués se rattrapent. Une ville à la fois, cinq secondes entre deux ; une lecture en échec revient en file après 10, 20 puis 40 minutes. Dans l'admin, le secteur ouvert montre ses villes en pastilles : menthe « lue », ambre « en lecture » ou « en attente », relief « pas encore lue » ; la liste se relit toutes les trente secondes tant qu'une ville se lit. Chez le mandataire, sur la carte de son secteur, une pastille ambre par ville encore en lecture. Celui qui a fait le geste reçoit une notification « Secteur … : n villes en lecture ».

**Les villes choisies d'un secteur** (Jules, 24 oct. 2026, révise le même jour la lecture des Villes Klocka du contour) : le secteur ouvert dans l'admin montre « Villes du secteur », toutes les communes du contour (un département ou une région entière par l'API Géo) à cocher, les Villes Klocka en tête avec leur pastille menthe, puis par population, une recherche au-delà de huit, « n choisies sur N », Annuler et Enregistrer. Le mandataire ne prospecte « pour mes clients » que dans ces villes ; « Dans votre secteur » sur la carte d'un client n'en montre que celles-là. Rien de choisi : « Klocka n'a pas encore choisi les villes de votre secteur ». Les villes choisies se créent et se lisent d'elles-mêmes. La bascule « Pour mes clients / Tous les commerces » est en tête de la ligne de « Filtrer », dans les deux vues (y compris pendant le chargement ou sans secteur) ; la carte et la colonne de droite prennent la hauteur de l'écran moins la barre (`calc(100dvh-190px)`, 560 px au moins). Un mur sans prix estimé reste sur la carte et dans le tableau, « Prix à vérifier » en ambre, après ceux dont le prix est connu ; sa phrase de cible finit par « prix à vérifier ». Pendant une prospection, la carte ne garde que les limites du secteur, en noir (`JL.fond`), sans motif. Dans la fiche d'un mur, juste au-dessus de la façade, une ligne en menthe dit pourquoi c'est une bonne cible (le signal le plus fort, qui possède les murs, le prix face à son budget ; tronquée, entière au survol). Un client sans mur dit la marche où tout s'arrête (villes pas lues, pas de signal, propriétaire ou exploitant inconnus, pas de prix estimé, rien dans son budget). La phrase « J'ai un acquéreur qui cherche exactement… » est retirée de la fiche d'un commerce pour l'instant (`ACCROCHE_CLIENT` dans Simple.jsx).

**La préparation tourne seule** (Jules, 24 oct. 2026 : « on fait le setup pour lui, le mandataire n'a pas à attendre ») : dès que l'équipe choisit les villes d'un secteur (attribué ou pas encore), elles se lisent ; puis un entretien toutes les trente minutes relit une ville de plus de trente jours, relance la recherche des propriétaires qui en reste et l'estimation des prix chaque jour (les cibles d'abord, au plafond de 40 rues neuves par ville et par jour). Dans « Pour mes clients », tant qu'une ville se prépare, une pastille menthe dit l'étape (« Lecture de … », « Propriétaires : n à chercher », « Prix en cours d'estimation ») suivie de « les murs s'ajoutent en direct », le détail par ville au survol ; les clients et les murs se relisent toutes les trente secondes. `VILLES_SECTEUR=0` arrête l'entretien.

**Préparer plus vite** (Jules, 24 oct. 2026) : les villes choisies se lisent l'une après l'autre sans attendre que les propriétaires de la précédente soient tous cherchés ; la recherche des propriétaires mène trois commerces à la fois (un seul pendant cinq minutes après un refus 429 de l'annuaire, désormais retenté deux fois), une ville à la fois menée jusqu'au bout (le fichier DGFiP d'un département pèse des centaines de Mo, la mémoire n'en garde que deux) ; une ville ouverte par quelqu'un passe devant ; un commerce interrompu par un redémarrage se reprend. Les prix des rues déjà lues (gratuits) partent cinq par cinq ; le plafond Data-B de 40 rues neuves par ville et par jour ne change pas. Mesuré : 55 propriétaires par minute (30 avant).

**La liste en grand écran** (Jules, 24 oct. 2026) : dans une liste de la Prospection, « Grand écran » (pilule bordée, icône Maximize2) ouvre la carte Google en plein écran avec les commerces de la liste en points menthe. Toucher un point montre seulement le nom du commerce, en pilule en bas au centre. Une petite croix ronde en haut à gauche ferme (Échap aussi). En bas à droite, un bouton rond « Me localiser » (LocateFixed) pose « vous êtes ici » en temps réel : un point bleu cerclé et sa marge d'erreur ; la carte s'y cale à l'appui, puis laisse la main. Les commerces sans position sont comptés en haut (« n sur la carte · m sans position »).
Révisé le même jour : toucher un point ouvre une fiche très courte, en bas de l'écran au-dessus du bouton de localisation (440 px au plus, rayon 18 px) : le nom et une croix, puis trois lignes libellé / valeur (Exploitant et « depuis 2008 » ; Murs : propriétaire, forme, « Gérant : nom, 70 ans et plus », ou « L'exploitant lui-même » ; Signal en ambre), et l'accroche à utiliser dans un encadré menthe. Les mêmes signal et accroche que le matin du mandataire (`ficheCourte`, server/mandataire-matin.js).

**Biens sans « Aujourd'hui »** (Jules, 24 oct. 2026, révise « Le matin et l'étape Contact des biens ») : la section « Aujourd'hui » quitte la page Biens ; on arrive directement sur les cartes. L'étape Contact d'un bien reste.

**Le prix ne filtre plus, il range** (Jules, 24 oct. 2026, relayé par la session de l'équipe : « prix trop bas, surfaces douteuses ») : dans « Pour mes clients », le prix estimé n'écarte plus aucun mur. Les murs dans le budget passent d'abord à force de signal égale ; un mur hors budget reste, son prix en `brume` suivi de « · hors budget », et sa phrase de cible dit « hors de son budget, à vérifier ». Une cinquantaine de murs par ville (plus de plafond global). Au survol d'un point, le commerce et son signal le plus fort. Le badge « Propriétaires : n sur N » ne tourne plus sans fin : un commerce interrompu compte comme à faire et se reprend.

**La fiche du mandataire** (Jules, 24 oct. 2026) : sur la carte, un point n'est que de la donnée brute (un commerce, son propriétaire, un signal), à personne ; seuls les points avec un signal et un propriétaire connu s'affichent ; un point pris par un autre mandataire disparaît ; un point dont la fiche est dans Biens devient noir. La fiche naît au premier geste (ajout à une liste, « Je l'appelle », « J'y suis passé ») et appartient à ce mandataire. Sur une page (`FicheMandataire`) : le commerce et l'exploitant (depuis quand), le propriétaire des murs (forme, gérant, âge), les signaux avec leur source et leur date, l'accroche dans un encadré menthe, le contact et sa source (« à confirmer » en ambre), les recherches clients compatibles en pastilles menthe, la prochaine action en menthe, la dictée, puis l'historique. La dictée : écrire ou dicter (micro), Haka dit ce qu'il a compris (encadré menthe pâle), le mandataire corrige le statut, les infos (à confirmer si d'un tiers), la tâche, puis « Confirmer ». En Prospection deux statuts (À contacter, Contacté) et Pas d'intérêt (sort des listes, relance à six mois) ; le rendez-vous fixé fait passer la fiche dans Biens, sans copie. Biens a neuf étapes (Rendez-vous fixé, Visité, Estimation, Prix d'accord, Mandat, Analyse, Mise en marché, Offres, Vente), le check à droite d'une étape la valide avec celles d'avant ; Rendez-vous fixé, Visité et Prix d'accord montrent la fiche ; « Mettre en pause » (prix refusé) pose une relance à trente jours et un nouvel argument, « Reprendre » l'enlève. Dans une liste, le panneau d'un commerce garde la Street View et l'appel, puis la fiche ; les filtres disent À prospecter, À contacter, Contacté, Sorties.

**Le mode téléphone dans Paramètres** (Jules, 24 oct. 2026) : le réglage « Mode téléphone » (bouton bordé « Voir en mode téléphone », icône Smartphone) ouvre le cadre d'aperçu (`ApercuTelephone` : iPhone 15, petit Android, iPhone Pro Max), parti du tableau de bord. Absent au téléphone et dans le cadre lui-même.

**Téléphone : plus de barre du haut** (Jules, 24 oct. 2026) : pour le mandataire et le client, la barre du haut (Klocka, menu) disparaît au téléphone ; il ne reste que la marge de l'encoche. Le menu devient le dernier onglet de la barre du bas (icône Menu, « Menu ») : chez le mandataire à la place de Compte (Paramètres est dans le menu), chez le client après Profil (absent de son menu). L'équipe, sans barre du bas, garde sa barre du haut.

**La carte d'une liste, révisée** (Jules, 24 oct. 2026) : plus de bouton « Grand écran » ; une petite carte (150 × 84 px, rayon 12 px, les points de la liste, une icône d'agrandissement dans un rond en bas à droite) tout à droite de la barre de la liste ouvre la carte en grand. Un point ouvre la fiche selon la maquette de Jules, sans accroche : à l'ordinateur à droite de la carte sur toute la hauteur (420 px, bord gauche), au téléphone au milieu de l'écran sur un voile (rayon 18 px). Dedans : le statut en pastille bleue, le commerce en 24 px et son adresse, l'encadré bleu pâle « POURQUOI IL VENDRAIT » (le signal en 16 px, puis la source et « publié le jj/mm »), les lignes Exploitant, Murs, Gérant, Contact (le numéro et sa source), Client compatible, le bouton en pilule de 44 px « Parler à l'assistant » en menthe, sur toute la largeur, qui ouvre la dictée dessous (pas d'Itinéraire', Jules, même jour), puis HISTORIQUE (date jj/mm, texte). Le bouton de localisation se décale à gauche de la fiche quand elle est ouverte.
Le bouton s'appelle « Parler à l'assistant » (Jules, même jour). Le tableau d'une liste a des lignes visibles : un trait sous chaque rangée et entre les colonnes (`border-bord-doux`), au lieu du trait presque invisible d'avant.
La saisie « Parler à l'assistant » est celle du chat (Jules, même jour) : plus de consigne au-dessus ni de long exemple, une pilule (`rounded-[22px]`, bord `bord-doux`, menthe au focus) avec le placeholder « Parler à l'assistant… », le micro et une flèche d'envoi ronde en menthe ; Entrée envoie. Ce que Haka a compris et la confirmation apparaissent dessous, comme avant.
La carte d'une liste est une icône (Jules, même jour) : un bouton rond bordé (icône Map, `h-9 w-9`) à droite des intercalaires de la page Listes, qui ouvre la carte en grand pour la liste ouverte ; grisé tant qu'aucun commerce de la liste n'a de position. La petite carte est retirée.

**La carte d'un client, plus douce** (Jules, 24 oct. 2026) : en haut, les petites têtes des clients (le visage dessiné du client, celui de la page Clients, 32 px, le client ouvert agrandi et cerclé de menthe, les autres atténuées ; un clic y passe ; neuf au plus, puis « +n »). Le chevron de repli est à gauche des flèches précédent / suivant. Le repli glisse en 500 ms (la hauteur et l'opacité passent de 1 à 0 en `ease-in-out`) et le chevron tourne aussi en 500 ms, au lieu de basculer d'un coup.
Les têtes sont les visages dessinés de la page Clients (`AvatarClient.jsx`, 24 visages de public/avatars, toujours le même par client) : dans les petites têtes et devant la référence du client (Jules, même jour).
Révisé encore (Jules, même jour) : la carte d'une liste est une icône seule (Map), hors de la pilule d'onglets de la Prospection, juste à sa droite et de sa hauteur (rond `bg-rail-actif` de 42 px), visible seulement sur Listes ; elle ouvre la carte de la liste ouverte. Plus d'icône à droite des intercalaires.

**Parler à l'assistant = le chat de Haka** (Jules, 24 oct. 2026) : dans une fiche (celle d'un point de la carte, celle d'une liste, celle de Biens), la saisie est le chat de Haka du tableau de bord du mandataire (`ChatFiche`, `ChatDashboard espace="mandataire"` en mode compact, sans raccourcis, placeholder « Parler à l'assistant… »). Il sait quelle fiche est ouverte (`proprietaire_id`) : ce que le mandataire raconte sans nommer personne la concerne, et Haka dit en une phrase ce qu'il a compris et fait. Chaque réponse relit la fiche. La dictée en deux temps (proposition puis confirmation) n'est plus affichée ; ses routes restent.
Le chat d'une fiche a un contour pervenche (`--k-pervenche-rgb`, les valeurs de l'accent « Pervenche » des jetons : 166 171 242 en sombre, 75 82 196 en clair ; prop `contour` de ChatDashboard), et la fiche d'un point montre le chat directement, sans bouton « Parler à l'assistant » (Jules, même jour).
Tout le bleu de ces écrans passe en pervenche (Jules, même jour) : la pastille de statut et l'encadré « Pourquoi il vendrait » de la fiche d'un point, les pastilles de règles d'un client (« Emplacement n°1 », « Enseigne nationale »), le bouton de localisation et le point « vous êtes ici » de la carte. Nouvelle couleur `pervenche` dans Tailwind (`--k-pervenche-rgb`). Le bleu des autres écrans (liens, cartes de l'équipe) ne change pas.
Les lignes du tableau d'une liste sont adoucies (Jules, même jour) : `border-bord-doux` mélangé à 45 % de transparence (60 % pour le cadre), au lieu du trait plein ; la case de la première colonne est centrée dans sa cellule (plus de marge à gauche).
« Propriétaires au cadastre : n restant » (Jules, même jour : « ça fait ça tout le temps, c'est énervant ») : le décompte vient du serveur (`resteACompleter`, mêmes règles que la recherche) et une fiche déjà cherchée sans résultat ne compte plus pendant sept jours ; le message disparaît une fois la recherche faite au lieu de rester sur « 1 restant ».
Dans la fiche d'un point (Jules, même jour) : la ligne de source sous « Pourquoi il vendrait » (« Registre des entreprises · publié le 25/05 ») est retirée ; Exploitant, Murs, Gérant, Contact, Client compatible forment un tableau à lignes comme celui des listes (cadre arrondi, un trait doux sous chaque rangée et entre les deux colonnes). Le signal d'ancienneté se dit « Société propriétaire créée il y a 43 ans ».
**Fermer en douceur** (Jules, 24 oct. 2026) : plus rien ne disparaît d'un coup. La fiche d'un point sur la carte d'une liste glisse de 28 px vers la droite en s'effaçant (au téléphone, elle se réduit légèrement au centre), son voile s'efface, la carte en grand se referme en fondu (0,3 s, `easeInOut`) ; dans « Pour mes clients », la fiche du commerce et son panneau vide se remplacent en fondu (0,28 s).
Au téléphone, la fiche d'un point est centrée par un conteneur flex (l'animation, qui pose un `transform`, annulait le centrage par `-translate`) : 440 px au plus, 12 px de marge. Le signal s'affiche sans la parenthèse du registre ; « il y a n jours » ne s'ajoute qu'à une annonce BODACC (Jules, même jour).
Le chat d'une fiche est épuré (prop `epure` de ChatDashboard, Jules, 25 oct. 2026) : ni le menu des modes (« Mode auto »), ni le bouton « Historique » des conversations.

- 25 oct. 2026 (Jules) : une seule fiche mandataire, celle de la carte, partout (listes, carte, Prospecter, Biens) : statut en pastille pervenche, commerce et adresse, « Pourquoi il vendrait », tableau à lignes, chat de Haka, historique. Pas d'accroche. Les rangées Exploitant, Murs, Gérant, Téléphone, Mail se modifient d'un clic (Entrée enregistre, Échap annule) ; la correction passe devant les registres, vide elle les rend. Tout panneau qui s'ouvre en glissant se referme de même, croix comprise.

- 25 oct. 2026 (Jules) : un bien ouvert n'a qu'un titre, en fil d'Ariane « Tous les biens › nom du bien › étape ». Au téléphone, plus de frise : le menu des étapes de droite, le même qu'à l'ordinateur, collé au bord et qu'on fait glisser de haut en bas (`MenuEtapesDroite telephone`).

- 25 oct. 2026 (Jules) : dans la fiche, chaque rangée qui en sait plus (Exploitant, Murs, Gérant quand il y en a plusieurs, Téléphone, Client compatible) et l'encadré « Pourquoi il vendrait » portent à droite une petite flèche (chevron vers le bas, qui se retourne) : elle déplie le détail en lignes courtes (société, SIREN, création, siège, comptes, parcelle, gérants avec qualité et âge, sources), en 0,28 s. Une rangée sans détail n'a pas de flèche.

- 25 oct. 2026 (Jules) : dans la fiche du mandataire, l'encadré pervenche du signal s.intitule « Remarque de votre assistant », en minuscules (13 px, sans capitales ni espacement), précédée de l'étincelle de l'IA (`Sparkles`, 14 px, pervenche), et non plus « Pourquoi il vendrait ».

- 25 oct. 2026 (Jules, charte K Partners) : documents K Partners (avis de valeur, mandat imprimés) : logo `LogoKP` (« kp_ », prop `fond="clair|nuit|mono"`), police Hanken Grotesk (`logo-kp.css`), couleurs nuit, indigo #3F47B8, pervenche #A7ABED, brume #EEF0FF. Ces hexadécimaux valent pour les documents imprimés seulement ; l'interface garde les jetons.

- 25 oct. 2026 (Jules) : côté mandataire, le haut du menu de gauche porte le logo K Partners (`LogoKP fond="theme"` : encre et trait pervenche par les jetons, 26 px, 22 px menu replié) à la place de la marque Klocka OS. L'équipe garde Klocka OS.

- 25 oct. 2026 (Jules) : sous « Biens » dans le menu du mandataire, les trois derniers biens ouverts, au dessin des « Projets récents » de l'équipe : un titre « Biens récents » repliable (chevron), puis les biens (icône immeuble, 13,5 px, décalés), le plus récent en tête ; le bien ouvert est surligné. Gardés dans le navigateur (`BiensRecents`), cachés menu replié.

- 25 oct. 2026 (Jules) : « Pour mes clients », un client déjà prospecté montre ses murs sur la carte dès qu'on arrive sur lui, sans recliquer, depuis le cache (pas d'attente) ; passer d'un client à l'autre ne prospecte jamais, seul le bouton date la prospection. Sa carte dit « Prospecté le 24 octobre » et le bouton devient « Mettre à jour » (contour, icône qui tourne pendant la relecture). « Prospecter » (plein, menthe) ne reste que pour un client jamais prospecté. La date se garde côté serveur, par mandataire.

- 25 oct. 2026 (Jules) : « Pour mes clients » : le titre « Votre secteur » (26 px, encre, 22 px au téléphone, centré) est tout en haut de la page, au-dessus des onglets Prospecter / Listes ; le nom du secteur (« Secteur Lyonnais ») n'est plus affiché.

- 25 oct. 2026 (Jules) : un tableau à colonnes figées (Listes) se dessine en bordures séparées (`border-separate border-spacing-0`), jamais fusionnées : fusionnés, les traits ne suivent pas les cellules collantes et le texte qui défile se voit au travers. Au téléphone, « Pour mes clients » tient sur une colonne `minmax(0,1fr)` : la carte prend la largeur de l'écran, sans déborder.

- 25 oct. 2026 (Jules) : un panneau arrondi qui défile garde ses coins des deux côtés : le cadre arrondi est en `overflow-hidden` et le défilement se fait dans un bloc intérieur (`min-h-0 flex-1 overflow-y-auto`). Sinon la barre de défilement, que les coins ne coupent pas, rend carrés les coins de droite (fiche d'un point sur la carte d'une liste, au téléphone).

- 25 oct. 2026 (Jules) : la carte de « Pour mes clients » a exactement les mesures de celle de « Tous les commerces » : 62 vh (460 px au moins) à l'ordinateur, 380 px au téléphone, la colonne de droite à la même hauteur (hauteur libre au téléphone). Remplace l'agrandissement essayé le même jour.

- 25 oct. 2026 (Jules) : la barre de Prospecter parle d'une seule voix : la bascule « Pour mes clients / Tous les commerces », « Filtrer », la pastille « n murs pour … » et celle de la préparation des villes sont toutes en 14 px, hautes de 40 px.

- 25 oct. 2026 (Jules : « trop gros, pas harmonisé ») : la fiche du mandataire suit les pas de texte d'un panneau : nom du commerce 20 px `font-normal`, adresse 13,5 px, statut 12,5 px, remarque de l'assistant 14,5 px sans gras, tableau 13,5 px, « Historique » en étiquette 11 px `brume`, ses lignes 13,5 px.

- 25 oct. 2026 (Jules : « prends exemple sur Tous les commerces ») : la fiche du mandataire reprend la mise en page de la fiche de « Tous les commerces » : en-tête (nom 20 px `font-normal` tronqué, activité · adresse 13 px `ardoise`, statut en pastille 12 px et croix à droite), marges 20 px, tableau `rounded-[12px] border-bord-doux bg-surface/40` en deux colonnes égales et centrées (libellé 13 px `ardoise`, valeur 14 px, flèche dans la case de la valeur, détail centré en 12,5 px). La remarque de l'assistant en 14 px.

- 25 oct. 2026 (Jules) : la carte d'un client dans « Pour mes clients » n'a plus la rangée de petites têtes ni le « +n » au-dessus : on change de client par les flèches.

- 25 oct. 2026 (Jules) : dans « Pour mes clients », le haut de la carte du client s'aligne sur la bascule « Pour mes clients / Tous les commerces » : deux colonnes dès le haut, la barre et la carte à gauche, la colonne du client à droite haute de la carte plus la barre (`calc(62vh + 56px)`). Au-dessous de `lg`, l'ordre reste barre, carte, client.

- 25 oct. 2026 (Jules) : sous les initiales d'un client, ses critères seuls (« Pharmacie · 300 k€ – 1,7 M€ », 12,5 px `ardoise`), carte ouverte ou repliée ; plus de « profil · client n sur N ».

- 25 oct. 2026 (Jules) : dans « Pour mes clients », le panneau du commerce a le fond de la carte du client : `bg-rail`, `border-bord-doux`, rayon 18 px.

- 25 oct. 2026 (Jules) : dans « Tous les commerces » du mandataire, la barre ne montre plus « Propriétaires lus pour n sur n » ni « +n vus sur Google Maps » une fois la lecture finie (l'équipe les garde) ; les pastilles de lecture en cours restent.


- 25 oct. 2026 (Jules) : la Prospection du mandataire n'a plus qu'une rangée de navigation, « Pour mes clients · Tous les commerces · Listes » (bascule pilule, 14 px), à gauche de la ligne de « Filtrer » ; plus de pilule centrée Prospecter / Listes. Le titre centré en haut suit le choix (« Votre secteur », « Tous les commerces », « Vos listes ») ; chaque vue garde ses outils à droite sur la même ligne (la carte de la liste pour Listes). La pastille « n murs pour … » est retirée (le nombre est sur la carte du client et au-dessus du tableau).
- 25 oct. 2026 (Jules) : dans « Pour mes clients », les blocs de la page (carte du client, panneau du commerce, tableau des murs) ont le fond de la barre de navigation : `bg-rail`, `border-bord-doux`, rayon 18 px.
- 25 oct. 2026 (Jules) : dans la barre de la Prospection (les trois choix, la ville, l'adresse, « Filtrer », les pastilles de lecture et de préparation, la carte d'une liste), tout a le même bord et le même fond que la barre de navigation : `border-bord-doux`, `bg-rail`, 40 px de haut, texte 14 px. « Filtrer » avec des filtres actifs prend le fond de la remarque de l'assistant (`bg-pervenche/10`), sans contour, et son compteur passe en pervenche.

- 25 oct. 2026 (Jules) : dans « Pour mes clients », le bas du panneau du commerce est exactement au bas de la carte : la colonne de droite prend la hauteur de la rangée de la grille (celle de la colonne de gauche, barre + carte) et son contenu est posé en absolu (`relative` dehors, `lg:absolute lg:inset-0` dedans), donc une barre sur deux lignes ou une fiche longue ne décalent rien.

- 25 oct. 2026 (Jules, après l'avis produit « le client est un filtre, pas une vue ») : la Prospection du mandataire n'a plus que deux choix, « Mon secteur · Listes ». « Pour mes clients » et « Tous les commerces » fusionnent : « Mon secteur » arrive sur tous les commerces du secteur (carte « Tous les commerces », icône repère pervenche, villes du secteur, nombre, les 1 500 premiers par signaux), et les flèches de la carte passent à l'un des clients : seuls ses murs restent sur la carte et dans le tableau, sans geste « Prospecter » pour « tous » (le geste ne reste que pour un client). Une seule fiche, celle du mandataire (« Je l'appelle » / « J'y suis passé »). Le sélecteur de client de l'Off-market n'est plus utilisé côté mandataire. Reste à faire : la ville et l'adresse comme filtre « Zone » de « Filtrer », et le cas d'une ville hors secteur.

- 25 oct. 2026 (Jules) : sur la carte d'un client, « ← Tous les commerces » (12,5 px `ardoise`, au-dessus de l'en-tête) revient d'un clic à tous les commerces du secteur ; les flèches restent pour passer de client en client.

- 25 oct. 2026 (Jules : « fais ça plutôt ») : dans « Mon secteur », le client se choisit dans une liste déroulante, dans l'en-tête de la carte : le nom affiché (« Tous les commerces » ou un client, avec ses critères dessous) et un chevron ouvrent la liste, « Tous les commerces » d'abord puis les clients (visage, critères, point menthe si déjà prospecté, coche sur le choix) ; on saute directement à n'importe lequel. Plus de flèches précédent / suivant ni de lien « ← Tous les commerces ». Sans client, un simple titre.

- 25 oct. 2026 (Jules) : la Prospection du mandataire n'a plus de titre centré (« Votre secteur », « Vos listes ») : le choix sélectionné de la rangée « Mon secteur · Listes » dit déjà où l'on est, et la carte et le tableau montent d'autant. L'icône de « Tous les commerces » est un repère de carte cerclé de noir (`MapPin` dans un rond `border-2 border-encre`), comme la maquette de Jules.

- 25 oct. 2026 (Jules : « exactement la fiche de la carte dans Listes ») : dans « Mon secteur », le panneau du commerce est la fiche de la carte des listes, la même partout (`FicheMandataire`) : statut, remarque de l'assistant, tableau à lignes modifiable, chat de Haka, historique. Un commerce sans fiche s'ouvre en aperçu (« Pas encore de fiche », lecture seule, composé depuis le commerce sans rien créer) avec « Je l'appelle » / « J'y suis passé » à la place du chat ; le premier geste crée la fiche et la même fiche devient complète. Plus de fiche Off-market (Street View) dans ce panneau.

- 25 oct. 2026 (Jules, après l'avis produit « garder, puis travailler ») : un commerce sans fiche n'a plus « Vous agissez » ni « Je l'appelle » / « J'y suis passé ». Un seul geste, « Ajouter à ma liste « Lyon » » (menthe, pleine largeur, collé en bas du panneau, la dernière liste choisie, un chevron pour une autre ou une nouvelle) : la fiche naît dans la liste et la même carte devient la fiche complète. Toute fiche vit dans une liste : « Dans la liste « Lyon » · changer » sous l'adresse. Le statut se change sur sa pastille (À contacter, Contacté, Pas d'intérêt, ce dernier relance dans six mois) ; plus de bouton « Pas d'intérêt » à part. Appeler : toucher le numéro dans le tableau ; une visite ou un appel se raconte dans le chat.

- 25 oct. 2026 (Jules) : dans l'en-tête de la carte de « Mon secteur », l'icône qui ouvre la liste des clients est un hamburger (`Menu`, 18 px, `ardoise`, `encre` ouvert), plus un chevron.

- 25 oct. 2026 (Jules, après l'avis produit « la liste devient une file, la fiche fait le reste ») : une liste du mandataire est une file de travail. Cinq colonnes : Commerce (nom 14 px, ville dessous), Statut (pastille à choix), Numéro (touché, il appelle ; à défaut celui du commerce, dit « (commerce) »), Prochaine action, Dernier échange ; les autres colonnes (dirigeant, société, effectif, adresse du propriétaire…) vivent dans la fiche. Ordre : relances dues, puis « À contacter », puis le reste, la plus ancienne échéance d'abord. Trois filtres comptés : À contacter (par défaut), Contacté, Sorties. Un clic ouvre la fiche commune (à droite, au milieu au téléphone), sans vitrine ni boutons à part ; plus de « Sans rép. », de colonne Appel ni de phrase d'aide. Les quatre tuiles de chiffres deviennent une ligne : « 12 faits sur 40 · 3 RDV ». Au téléphone, plus de tableau : une ligne par commerce (nom, prochaine action, pastille du statut).

- 25 oct. 2026 (Jules, après l'avis produit « une seule histoire avec le propriétaire » ; **annulé le même jour** : Jules garde l'ancien design de Biens, l'Estimation et le Mandat en chat + document sur ordinateur, l'avancée d'étape depuis le chat de Haka avec une confirmation d'un tap ; le serveur reste : conversation de la fiche, prix d'accord, outils rattachés à la fiche) : un bien né d'une fiche montrait Rendez-vous fixé, Visité, Estimation, Prix d'accord et Mandat sur un seul écran, au dessin d'un dossier en mode IA. À gauche, le fil d'Ariane, une phrase qui dit la suite (avec au besoin un geste en pilule menthe bordée, « Lancer l'avis » ou « Préparer le mandat », qui remplit le chat sans l'envoyer), puis le chat de Haka de la fiche, au bas de la colonne : une seule conversation par bien, gardée sur la fiche et rouverte d'une étape à l'autre. Haka y lit l'étape, l'historique et le prix d'accord : l'avis reprend ce que la visite a appris, le mandat suit l'estimation du bien au prix d'accord. À droite, le document de l'étape : la fiche (sans son chat) pour Rendez-vous fixé et Visité, l'avis pour Estimation et Prix d'accord, le mandat pour Mandat. Prix d'accord : une ligne en tête de l'avis, « Prix d'accord avec le propriétaire », le chiffre en € net vendeur et « Enregistrer », qui valide l'étape. Au téléphone, la colonne seule et la pastille « Voir la fiche / l'avis / le mandat » ; la ligne du prix passe dans la colonne. Un bien sans fiche garde l'estimation et le mandat d'avant.

- 25 oct. 2026 (Jules, via Biens) : sur la fiche d'un bien, la pastille du statut dit l'étape en cours (« Visité », « Prix d'accord »…) ou « En pause », jamais « Dans Biens ».

- 25 oct. 2026 (Jules) : un bien avance depuis le dashboard Haka, au téléphone : le mandataire le dit (« la visite est faite », « il est d'accord à 460 k€ ») et Haka propose l'étape (outil `avancer_bien`, rien n'est écrit) ; sous sa réponse, une pastille menthe « Confirmer · Visité » l'enregistre d'un tap, à côté des « Annuler » habituels. Les pages Estimation et Mandat d'un bien gardent leur dessin d'avant (optimisé pour l'ordinateur : chat à gauche, document à droite ; un bien pas encore commencé n'a qu'un chat pour commencer) : l'écran unique Rendez-vous → Mandat du même jour est retiré. Le chat des fiches est celui du dashboard, sans contour pervenche.

- 25 oct. 2026 (Jules : « le mode terrain, c'est vraiment une fonctionnalité importante », puis « non, la carte en grand ») : Terrain est le troisième choix de la rangée « Mon secteur · Listes · Terrain » (plus de seconde bascule « Liste · Terrain », changé le même jour à la demande de Jules) : il ouvre la carte en plein écran par-dessus la liste : une croix en haut à gauche referme (Échap aussi), « Toutes mes listes » ou une seule, la position du mandataire qui le suit (centrée à l'ouverture, un bouton recentre), les commerces grisés s'il y est passé aujourd'hui. Un point touché ouvre la fiche du commerce au centre de l'écran, sur ordinateur comme au téléphone (`FichePoint centre`). Pas de bande « le plus proche ». Accès rapide depuis le dashboard : la pastille « Mode terrain » des raccourcis du mandataire ouvre directement ce plein écran (`?onglet=listes&terrain=1`).

- 25 oct. 2026 (Jules, maquette « Haka, chat avec aura ») : la saisie du chat d'une fiche porte une aura : un halo flou qui tourne derrière elle (`.k-aura-halo`, dégradé conique pervenche puis bleu, flou 18 px, opacité 0,75) et un filet lumineux net sur son bord (`.k-aura-filet::before`, pervenche puis blanc), synchronisés, 9 s le tour (`ChatDashboard lueur`, ralenti de 5 à 9 s le même jour). Sans mouvement (préférence système) : ni halo ni filet. D'abord réservée au chat des fiches, elle est mise dans tous les chats le 26 oct. 2026 (Jules : « la lumière dans tous les chats » ; `lueur` vrai par défaut, `lueur={false}` l'éteint).

- 25 oct. 2026 (Jules : « crée des dossiers d'exemple à Lyon aussi ») : en plus des exemples d'origine, un jeu lyonnais (`exemplesLyon`, une fois par mandataire qui a des exemples) : la liste « Lyon · exemple » de vrais commerces de Lyon (signal, propriétaire et exploitant connus, position), à contacter et deux contactés, pour la carte, le terrain et Mon secteur ; et un bien par étape à Lyon (rendez-vous, visite, estimation, prix d'accord sur de vrais commerces ; mandat, dossier, mise en marché, offre, vente). Retirer les exemples les retire aussi, et les commerces oublient la liste.

- 25 oct. 2026 (Jules) : dans Biens, Rendez-vous fixé, Visité et Prix d'accord s'ouvrent sur un chat seul, centré, sous la question de l'étape (« Vous avez visité le bien ? Racontez ce qu'il s'est passé : la surface, le bail, le loyer, l'état, ce que veut le propriétaire. »). Au premier message, la barre de gauche se replie (`klocka:replier-barre`), le chat passe à gauche et la fiche mise à jour par Haka à droite (`FicheMandataire sansChat`), comme l'Estimation ; la conversation est celle du bien, gardée sur la fiche, et se rouvre en revenant. Au téléphone : le chat, et « Voir la fiche ».

- 25 oct. 2026 (Jules) : les chats de Biens (Rendez-vous fixé, Visité, Prix d'accord, Estimation, Mandat) ont le même style que celui des fiches : l'aura qui tourne (`ChatDashboard lueur`).

- 25 oct. 2026 (Jules) : dans un bien, le chat de l'Estimation n'affiche plus le choix « Avec le bail / Sans document » ; le bail se joint avec « + » si on l'a.

- 25 oct. 2026 (Jules : « on peut lui parler où on veut ») : un bien a un seul fil, de l'ajout à la liste jusqu'au mandat. Le chat de la fiche (liste, carte, terrain, Mon secteur), les étapes racontées de Biens et le dashboard y écrivent ; avant de répondre depuis une fiche, Haka relit ce qui s'est dit ailleurs. Dans Biens, le fil se rouvre en entier (`ChatDashboard dansLeFil`). Depuis le dashboard, quand un échange touche un seul bien, il est rangé dans son fil et une carte « Rangé dans le fil de … · Ouvrir » y mène. Un fil de bien ne s'efface jamais avec les vieilles conversations. Reste à faire : les conversations des pages Estimation et Mandat d'un bien ont encore leur propre moteur et ne s'y rangent pas.

- 25 oct. 2026 (Jules) : toute fiche de commerce montre sa vitrine (Street View, `FacadeLocal`, celle de la fiche Off-market) sous l'en-tête, même un commerce pas encore dans une liste (aperçu) ; pas en vue Conversation.
- 31 oct. 2026 (Jules : « juste une image du commerce, pas l'intégration Google Maps, qui coûte cher ») : en tête des fiches de commerce (mandataire et Off-market), la photo de sa fiche Google remplace le panorama Street View intégré. Une image fixe de 200 px de haut, rayon 14, recadrée ; dessous, « Voir sur Google Maps » (ouvre le lieu dans un nouvel onglet) et « Photo : auteur » en `brume`, comme Google le demande. Sans photo, seulement le lien. L'image est cherchée une fois par commerce et gardée (`server/photo-commerce.js`). La ligne Gérant reste telle quelle pour l'instant.
- 31 oct. 2026 (Jules) : dans la fenêtre « Filtrer », les filtres défilent et la barre « Tout effacer » / « Voir n commerces » reste fixée en bas. Le tableau d'une liste du mandataire, et celui de « Mon secteur », ont un cadre du même trait que ses lignes (`bord-doux` à 45 %), sans trait doublé contre le cadre à droite ni en bas ; la version téléphone, en `trait`. Leurs cases à cocher vides prennent aussi ce trait (menthe au survol et une fois cochées). Le nom d'une liste se renomme d'un clic sur son intercalaire ouvert (Entrée ou clic ailleurs enregistre, Échap annule) ; plus de bouton « Renommer ». Une fiche de commerce rouverte reprend sa dernière conversation avec Haka : la bascule « Fiche · Conversation » est là, sur la fiche ; chaque fiche (et le même bien dans Biens et la Pré-visite) garde ses conversations à part de celles du dashboard. La « Prochaine action » de la fiche se lit dans l'encadré « Remarque de votre assistant », sous la remarque, en blanc (`encre`). Dans une liste du mandataire, une seule liste avec sa colonne Statut : le filtre « Tous » (par défaut) montre les commerces à contacter et les contactés ensemble, « À contacter », « Contacté » et « Sorties » ne montrent que les leurs. Un clic sur le titre d'une colonne trie (deuxième clic : à l'envers, troisième : retour à l'ordre de la file, relances dues d'abord) ; les cases vides restent en bas.
- 31 oct. 2026 (Jules : « il va tout simplement parler à son assistant, comme une assistante ») : le terrain se dit à l'assistant du dashboard, au clavier ou au micro, sans formulaire. « Je suis passé à la boulangerie du 19 rue de l'Exemple à Cannes, j'ai eu M. Bernard, 06 12…, il vend dans deux ans » : l'assistant retrouve d'abord le commerce parmi ceux que Klocka connaît (par l'adresse, puis par le nom dans la ville ; deux possibles, il demande lequel), crée la fiche (celle du commerce, avec photo, propriétaire et signaux ; sinon une fiche « Terrain » née de ce qui a été dit), y met le nom, le numéro, le mail, la remarque et la suite à donner, et pose une seule question : où la ranger (sa dernière liste proposée, une autre, une nouvelle, ou aucune). Il ne réclame que le commerce ou l'adresse, et la ville. Plusieurs commerces dans un même message se traitent tous, une ligne par commerce. Le mode Terrain (point par point) reste la même chose à l'envers : le commerce est connu, l'assistant n'écoute que ce qui s'est dit.
- 31 oct. 2026 (Jules) : « Haka » s'appelle désormais « Assistant KPartners » partout où on le lit (menus, titres, chats, notifications, messages, consignes de l'IA, « Quoi de neuf »). Seuls les noms de code gardent l'ancien mot : dossier `server/haka/`, `components/haka/`, routes (`/SuiviHaka`), variables d'environnement (`HAKA_FILE`…), entités de la base (`HakaProposition`…) et clés de personnalisation. Les décisions datées ci-dessus disent encore « Haka » : elles se lisent comme « Assistant KPartners ». Dans une phrase : « l'Assistant KPartners » (« demandez à l'Assistant KPartners »), seul en libellé : « Assistant KPartners ».
- 31 oct. 2026 (Jules : « toutes les actions, absolument toutes, de la couleur de K Partners, pas le vert de Klocka ; je les ai corrigées trois fois ») : côté mandataire, l'accent est toujours la pervenche de K Partners, quel que soit le choix gardé dans le compte (`definirEspace` dans `src/lib/personnalisation.js`, appelé par le Layout selon la vue ; l'admin qui prévisualise la vue Mandataire la voit aussi). La cause des retours du vert : `menthe-pale` et `sur-menthe-pale` (le bouton « ✓ Fait » des cartes d'action, l'envoi du chat) n'étaient pas dans la famille d'accent recalculée, ils restaient verts. Ils y sont, avec les autres. La page Personnalisation du mandataire n'a plus de choix d'accent. Les cartes d'action du chat (« ✓ Fait », « Ouvrir ») et les boutons pleins de l'espace mandataire (exporter vers une liste, envoyer, prospecter pour un client) sont en pervenche en dur (`J.pervenche`, `bg-pervenche`), dans tous les espaces. Dans le menu, l'entrée du Dashboard s'appelle « Assistant ». Règle pour tout composant : jamais un vert écrit à la main ; `menthe*` suit l'accent, donc la marque. Seuls `vert` (OK, état) et les teintes de données (`emplacement-*`, tracés de carte en `JL`) restent à part.

- 25 oct. 2026 (Jules) : en vue Conversation, la fiche n'a qu'un en-tête d'une ligne : le nom (17 px), la bascule « Fiche · Conversation » et la croix ; l'adresse, la liste et le statut restent dans la vue Fiche.

- 26 oct. 2026 (Jules, la préparation du rendez-vous) : au rendez-vous fixé, Haka prépare en fond une section « Préparation du rendez-vous » de la fiche (cadre pervenche pâle, étincelle, repliable, ouverte par défaut, « mise à jour … ») : pré-estimation (interne, à ne pas annoncer), les murs, le locataire, la rue, le signal, les clients compatibles, puis « À demander » (bail, charges et taxe foncière, fin du bail, travaux, prix et délai, documents). La veille à 18 h, elle est mise à jour et une notification « Demain 10 h, … : votre préparation est prête » mène à l'étape (`server/preparation-rdv.js`, sur Render ou PREPARATION_RDV=1). L'étape Rendez-vous fixé de Biens s'ouvre directement scindée : chat à gauche, fiche et préparation à droite. Après la visite racontée, Haka lance l'avis de valeur avec la préparation et la visite ; « Rapport prêt » ouvre l'étape Estimation du bien.

- 26 oct. 2026 (Jules) : l'étape Rendez-vous fixé (puis Visité et Prix d'accord une fois la conversation ouverte) a la mise en page du Mandat : colonne de chat sur toute la hauteur, le titre du bien et la question de l'étape en tête tant qu'on n'a rien dit, la saisie en bas ; la fiche et sa préparation à droite, sur toute la hauteur.

- 26 oct. 2026 (Jules) : dans la préparation du rendez-vous, de petites lignes (`border-pervenche/15`) séparent les rangées et les questions « À demander ».

- 26 oct. 2026 (Jules) : dans les étapes racontées de Biens, comme au Mandat, une ligne verticale sépare le chat de la fiche, et la partie de droite a sa barre du haut (« La fiche du bien », 56 px, 12,5 px `ardoise`) soulignée d'une ligne horizontale.

- 26 oct. 2026 (Jules) : dans une liste, toute la ligne ouvre la fiche (curseur main), pas seulement le nom ; la case, le statut, le numéro et les cellules à modifier gardent leur geste.

- 26 oct. 2026 (Jules, après l'avis franc sur les étapes) : un bien a sept étapes, chacune nommée par ce qu'il faut faire et portant un document : Pré-visite (la préparation, le chat du bien), Avis de valeur, Mandat, Analyse, Mise en marché, Offres, Vente. « Rendez-vous fixé », « Visité » et « Prix d'accord » ne sont plus des étapes : le rendez-vous fixé fait entrer le bien en Pré-visite, la visite racontée lance l'avis (le bien passe à l'Avis de valeur), et le prix d'accord est le résultat de l'avis. Dans l'Avis de valeur d'un bien né d'une fiche, une ligne d'état au-dessus de la saisie (`EtatAvis`, encadré `rounded-[14px] border-bord-doux bg-rail`, un point de couleur) : « Pas encore d'avis », « En rédaction », « Prêt », « Envoyé le jj/mm · en attente du propriétaire » (ambre), « Accepté à … € » (menthe), « Refusé, relance le jj/mm » (ambre) ; l'avis parti, le prix d'accord se note là (« Noter ») et « Refusé » met le bien en pause trente jours. L'étape est faite quand le prix est noté. Sur la page Biens, une pastille « En attente du propriétaire » (point ambre, nombre) filtre les avis envoyés sans réponse ; elle n'apparaît que s'il y en a. Les anciennes fiches gardent leurs mots (`rangValide`, src/lib/biens-mandataire.js). **Pas de nouveau changement de structure des étapes avant les premiers dossiers d'un vrai mandataire.**
- 26 oct. 2026 (Jules, Pré-visite refaite) : la préparation est le contenu de la page, Haka une aide. Sur ordinateur : le fil d'Ariane en tête (jamais la frise d'étapes en haut : elles restent dans le menu de droite), à droite « Haka » (panneau latéral de 440 px qui s'ouvre), « ⋯ » (Rendez-vous décalé, Rendez-vous annulé, Pas vendeur) et « Raconter la visite » (menthe, icône micro : Haka s'ouvre, la dictée démarre) ; la préparation au centre (720 px), la fiche du bien à droite, repliable (« La fiche »). Au téléphone, la mise en page ne change pas (le chat du bien, « ⋯ » et « Voir la fiche ») : seul le contenu sous « Voir la fiche » est la nouvelle préparation, au-dessus de la fiche. Pas de bouton « Démarrer la visite » ni « La visite est faite » : à la fin du rendez-vous, un vocal à Haka ; l'avis qu'il lance fait passer le bien à l'Avis de valeur. La préparation, en blocs numérotés séparés d'un filet : Le rendez-vous (Itinéraire, Appeler, Décaler), La personne (ce qu'il a déjà dit, comment l'aborder), Pourquoi il pourrait vendre, Le bien et le locataire, La pré-estimation interne (repliée), Les clients compatibles (repliés, avec le prix au-delà duquel plus aucun ne suit), Les questions à poser (les trois indispensables numérotées en pervenche, puis les autres, puis celles nées du « à confirmer » en ambre), Les objections probables (repliées), Les documents à demander (cases à cocher, « Envoyer la liste au propriétaire » prépare le mail). Chaque information porte sa source en `brume` (12,5 px) ; ce qui est déduit porte la pastille « à confirmer » (bord ambre). Un bien hors Prospection a une préparation allégée, depuis son adresse.

- 26 oct. 2026 (Jules : « j'ai eu le numéro du propriétaire » → Haka proposait une relance faute d'outil) : Haka complète une fiche existante avec l'outil `modifier_fiche` (numéro, mail, propriétaire, murs, gérant, exploitant, remarque), tout de suite, sans relance ni doublon ; un numéro d'un tiers est « à confirmer », la source dit « dit à Haka » ; l'historique de la fiche le note.

- 26 oct. 2026 (Jules : « il faut qu'il puisse modifier toute la fiche, rajouter une partie ») : `modifier_fiche` couvre toute la fiche (contact, propriétaire, murs, gérant, exploitant, commerce, adresse, ville, activité, remarque, prochaine action et date, statut, liste) et ses parties libres : Haka ajoute, réécrit ou retire une partie (un titre, un texte), affichée sous le tableau dans un cadre `border-bord-doux bg-surface/40`, titre 13 px `ardoise`, texte 14 px.

- 26 oct. 2026 : au téléphone, le menu d'étapes glissant de droite est fermé par défaut en petite pastille (chevron et « 2/7 », sans les points, 40 px de large) posée à 168 px du haut, et non au milieu, où il couvrait le bouton Envoyer du chat ; il se glisse plus bas s'il gêne, sa position gardée à part de celle de l'ordinateur.

- 26 oct. 2026 : au téléphone, plus de menu d'étapes flottant dans Biens (toute place fixe à droite tombait sur un titre ou un bouton) : le dernier mot du fil d'Ariane devient un bouton « Avis de valeur · 2/7 ▾ » qui déplie la liste des étapes sous lui (`MenuEtapesFil`), avec la coche pour valider. À l'ordinateur, le menu glissant de droite reste.

- 26 oct. 2026 (Jules) : dans le menu de l'équipe, « Autre » montre Offres et Dossier bancaire (la page d'admin des dossiers bancaires, icône banque), en plus de Feedback.

- 26 oct. 2026 (Jules : « c'est juste dans les filtres, on filtre la classe d'actif ») : la classe d'actif n'est ni une vue ni un onglet, c'est le premier filtre de « Filtrer » (Commerce · Bureaux · Entrepôt, rien de coché = tout), avec le compte. La lecture d'une ville lit trois familles de codes NAF (commerces de pied d'immeuble, bureaux, entrepôts et grossistes) ; chaque point porte sa classe (`classe`), affichée dans la fiche devant l'activité quand ce n'est pas un commerce. Un client dont la recherche dit « bureaux » ou « entrepôt » ne voit que cette classe. Le fonds de commerce n'est pas une classe ici (c'est l'exploitation, pas les murs).

- 26 oct. 2026 (Jules, maquette du deck) : l'Avis de valeur d'un bien a une deuxième vue, « Présentation », le deck que le mandataire montre au vendeur (bascule « Avis · Présentation » en tête de la colonne de droite ; au téléphone, « Présenter » à côté de « Voir l'avis » ; « Plein écran » pour le rendez-vous, Échap ou la croix le referment). Douze pages : couverture, sommaire, bilan locatif, la ville, le quartier, le local, activités et valeur locative, le taux, le calcul, les comparables, la valeur (carte indigo), votre mandataire. Dessiné en 1920 × 1080 et mis à l'échelle (bandes noires), fond pervenche, numéro en filigrane, titre 104 px, phrase 36 px avec un passage indigo, carte noire à droite avec la suivante visible au bord, barre noire en bas (logo kp, section, progression à repères, « 01 / 12 », flèches). Glissement de 1,3 s, cubic-bezier(.7, 0, .2, 1), cartes en profondeur (la suivante à 22° et 90 %, la sortante à 84 %), cascade des éléments (0,7 s, 0,5 s puis toutes les 0,1 s), relief à la souris ; ← →, Page suivante / précédente, repères cliquables, glissement du doigt, « #n » dans l'adresse en plein écran. Couleurs de la charte dans `deck-avis.css`, comme le document imprimé. **Le deck n'a aucun chiffre à lui** : tout vient de l'avis (`deckDeLAvis`, src/lib/deck-avis.js) ; ce qui manque se dit « à renseigner » en italique gris, jamais inventé (la ville : INSEE et K-Vacance, pas encore branchés ; l'expérience du mandataire). Les textes longs de l'avis sont raccourcis à leur première proposition dans le deck.

- **26 oct. 2026, Jules : Mon secteur montre tous les commerces, sans plafond.** Plus de limite à 1 500 : Lyon seul en a plus de 10 000. Au-delà de 300 points, la carte du secteur les dessine sur un canevas (la couche de l'Off-market, `creerCouche`), un clic touche le point le plus proche ; en dessous, les marqueurs Google restent. Le tableau dessous pagine par 50.

- 26 oct. 2026 (Jules) : l'avis de valeur d'un bien estimable par Equimmox (murs commerciaux, bureaux, local d'activité) prend sa valeur dans l'estimation multicritères d'Equimmox : offres actuelles (coef. 2), offres anciennes (1), transactions DVF (1), capitalisation (2 : loyer annuel du bail, taux moyen du secteur de Data-B avant ajustements, investissement à prévoir vide sauf s'il est dit). Klocka choisit les comparables de chaque méthode : ceux à plus de 40 % de la médiane au m² écartés, les plus proches d'abord (pour les offres actuelles, la plus récente à 250 m près), cinq au plus, chacun avec sa raison (distance, surface, date, écart à la médiane). La valeur retenue est celle d'Equimmox arrondie au millier ; la fourchette, la même pondération faite sur le bas puis le haut de chaque méthode. Le rapport est gardé sur l'estimation (`equimmox`) : il remplit l'avis (valeur, marché, comparables, ventes DVF d'abord) et le deck (la page « Le calcul » montre les méthodes et leurs coefficients). Les étapes s'affichent dans le chat (« Offres actuelles, 5 retenus sur 15 »), une à deux minutes. Sans Equimmox, Data-B prend le relais et l'avis le dit.
- **26 oct. 2026 : lire une grande ville en entier.** L'annuaire s'arrête à 10 000 résultats par recherche : au-delà, le cercle de lecture se découpe en quatre quartiers (jusqu'à trois fois). Lyon passe de 10 238 commerces (tronqués) à 58 920 points (18 545 commerces, 33 661 bureaux, 6 714 entrepôts). Mon secteur reçoit des points allégés (les champs de la carte, des filtres et du tableau ; la fiche vient au clic) : 5,3 Mo compressés pour 74 000 points.
- 27 oct. 2026 (Jules) : **la restitution de l'avis de valeur**, entre l'avis et le mandat. L'avis fini, Haka propose une fois « Je prépare le mail au propriétaire, avec l'avis en PDF ? » ; à son oui, le mail s'ouvre dans une fenêtre (À, Objet, texte, tout modifiable). Il part de la messagerie du mandataire, Klocka n'envoie rien pour lui : au téléphone, le partage du système joint le PDF ; sinon le PDF se télécharge et la messagerie s'ouvre. Puis « Le mail est parti ? » : l'affaire passe en **Estimation envoyée** (le filtre de Biens prend ce nom) et l'appel de J+2 se programme. Le PDF est fait par le serveur, depuis les pages de l'éditeur en lecture (A4, `ImpressionAvis`). Ensuite le mandataire dicte ce qu'a dit le propriétaire (au chat, à la fiche, ou « Ce que dit le propriétaire » sous l'avis) : Haka propose le cas, il confirme d'un tap. Les cas : d'accord sur le prix conseillé ou à un autre prix (Prix d'accord ; au-dessus de la fourchette, l'alerte « À ce prix, X clients compatibles » et une révision du prix à 30 jours), réfléchit ou ne répond pas (reste Estimation envoyée : J+5 mail, J+10 appel, après J+10 En pause), famille ou comptable, événement attendu, prix trop bas (En pause, relance à sa date, ou à 14 j, 60 j, 3 mois), autre agent, plus vendeur, injoignable (Perdu avec son motif, relance à 3 ou 6 mois), bail qui change la valeur (à revoir, l'avis se renvoie corrigé). Un statut, une prochaine action, une date : aucune affaire sans relance. En pause et Perdu restent dans Biens (« Reprendre »). Le passage se fait par la dictée, pas par un bouton dans la frise.
- **27 oct. 2026, Jules : « Mise en marché » devient « Commercialisation », et les visites d'acquéreurs s'y font.** L'étape 5 garde sa place (pas de nouvelle étape) ; une section « Visites · n » au-dessus du suivi de commercialisation, visible même avant le go de l'analyste. Une ligne par visite : date, acquéreur (un client de Klocka par sa référence, jamais son nom), l'intérêt en point de couleur, l'état du bon (« Bon signé » menthe, « Bon à signer » ambre, « Sans bon signé » alerte). « Nouvelle visite » (acquéreur et heure) ou Haka (`noter_visite_acquereur`). Une visite s'ouvre dans un panneau centré (plein écran au téléphone) : le bon de visite prérempli, signé au doigt sur place (encre sur papier blanc, jetons du thème clair) et imprimable ; « Racontez la visite » (micro ou écrit, ou `raconter_visite_acquereur` depuis Haka) ; puis les deux documents à relire, « Note interne · Compte rendu au propriétaire », « Valider les deux documents », et « Envoyer au propriétaire » qui ouvre le mail dans la messagerie du mandataire. Le compte rendu ne porte jamais le nom, le budget ni le financement de l'acquéreur (retirés à la validation, même tapés à la main). La validation date la relance de l'acquéreur, range la note sur sa fiche et dans l'historique du bien. Une notification une heure avant si le bon n'est pas signé. Pas encore : le point de commercialisation toutes les deux semaines (quand un bien aura eu cinq visites), le taux d'intérêt et l'alerte d'objection répétée, la signature électronique à distance.
- **27 oct. 2026, Jules : plus d'étape Analyse dans les biens du mandataire.** Six étapes : Visite (Pré-visite), Avis de valeur, Mandat, Commercialisation, Offres, Vente. Le dossier et le go de l'analyste restent le travail de l'équipe ; côté mandataire, un dossier ou une commercialisation font le Mandat, et le bien attend en Commercialisation (« Le bien part en commercialisation au go de l'analyste »). Une ancienne fiche validée à « analyse » compte comme Mandat ; un ancien lien `etape=analyse` ouvre la Commercialisation ; Haka ne propose plus cette étape.
- 27 oct. 2026 (Jules) : au téléphone, le mandataire n'a plus d'onglets en bas (Accueil, Prospection, Biens, Menu). En haut, le logo kp à gauche, la cloche puis un hamburger à droite ; le hamburger ouvre le même menu que l'ancien onglet Menu (Haka, Prospection, Biens, Clients, Projets, Simulateur, Paramètres). Le client garde sa barre du bas.
- 27 oct. 2026 (Jules) : **l'avis prêt s'envoie depuis sa barre.** Plus de bandeau « Prêt : relisez-le, puis envoyez-le au propriétaire » au-dessus de l'avis : « Envoyer » (menthe) se place à droite de « Télécharger le PDF », sur ordinateur comme au téléphone (dans « Voir l'avis »). Télécharger prend les couleurs de la barre de gauche : fond `rail`, contour `trait`, texte `encre`. Le bandeau reste pour les autres états (envoyée, prix d'accord, pause, perdu, à revoir).
- 27 oct. 2026 (Jules) : dans un bien, au téléphone, l'en-tête n'est plus qu'une flèche retour ; les étapes reviennent dans le menu de droite comme sur ordinateur (pastille au bord droit, à mi-hauteur, qui s'ouvre et se glisse), à la place du menu « Visite · 1/6 » du fil d'Ariane. Le menu « ... » de la Visite (décalé, annulé, pas vendeur) est retiré partout : on le dit à son assistant.
- 27 oct. 2026 (Jules) : dans l'Avis de valeur, l'onglet Rapport devient **Sources** (ordinateur et téléphone) : en une page, tout ce sur quoi repose la valeur, chaque partie avec sa source. Ce que le mandataire a dit (visite, bail, réponses), l'estimation Equimmox (méthodes, coefficients, comparables retenus et leur raison, capitalisation, environnement), les ventes DVF, les loyers de marché, le taux, la commune. Au téléphone, trois boutons sur une ligne : Présenter, Avis de valeur, Sources. À l'arrivée, la conversation de l'avis montre ce que Haka a repris de la visite et les questions qui restent, numérotées.
- 27 oct. 2026 (Jules) : **après l'envoi de l'avis, on reste sur l'Estimation et le chat suit la relation.** Plus de séquence fixe (J+2 appel, J+5 mail, J+10 rappel, En pause après dix jours) : l'envoi ne programme rien. Le mandataire raconte (« je l'ai appelé, rendez-vous lundi », « la présentation s'est bien passée, il réfléchit ») ; Haka relit le fil, note l'échange et pose la relance qui convient (`noter_echange`, une seule prochaine action : la nouvelle clôt l'ancienne). Une réponse qui tranche (accord, pause, perdu) se confirme d'un tap ; d'accord sur un prix, le prix va sur la fiche du bien et la page passe au Mandat. Le bandeau au-dessus de l'avis garde le statut et la prochaine action, sans le formulaire « Ce que dit le propriétaire ». Les documents (avis, présentation, sources) restent à côté.
- 27 oct. 2026 (Jules) : **le mandat, sans automatisme MyNotary.** Seul Klocka a un compte MyNotary : le mandataire envoie le mandat préparé dans le chat, Klocka le saisit à la main sur MyNotary, dépose le PDF rédigé, puis inscrit au registre le mandat signé que le mandataire dépose. Côté Klocka, la page **Mandats** (`/Mandats`, entrée « Mandats · n à traiter » en tête de Dossiers, pas dans le menu) : une liste en lignes, ce qui attend Klocka en tête (« À saisir sur MyNotary », « Signé : à inscrire au registre », en `ambre`) ; un mandat ouvert reprend l'écran scindé, le fil avec le mandataire et les gestes à gauche, le mandat tel qu'il l'a préparé à droite. Côté mandataire, une fois le mandat envoyé, l'étape Mandat du bien porte deux onglets en tête de l'aperçu, **Mandat · Klocka** (comme Avis · Présentation · Sources), le point menthe sur Klocka à un message non lu ; au téléphone, « Écrire à Klocka » à côté de « Voir le mandat ». Le fil reprend `FilDossier` (sans briefing, transfert ni note interne). Chaque étape s'y écrit en ligne grise, et seul celui qui doit agir est prévenu : Klocka à la demande et au mandat signé, le mandataire au mandat prêt et à chaque message.
- 27 oct. 2026 (Jules) : **l'onglet Suivi, à gauche de l'Avis, une fois l'avis envoyé.** Il s'ouvre en premier (l'avis vient de partir : il prend la place de l'Avis ; au téléphone, un bouton « Suivi » parmi les documents). Listes en lignes, quatre parties : Le bien (où en est-on, prix d'accord en menthe ou « Pas encore », l'avis et sa fourchette, la date d'envoi, ce que pensait le propriétaire, le mandat), À faire (les relances posées par Haka, la plus proche d'abord, en ambre si passée, « Fait » d'un tap ; les faites dessous, barrées), Historique (tout, le plus récent en tête, avec son genre : Échange, Réponse, Étape, Visite), puis La fiche du bien (sans son historique). Rien ne s'y saisit : tout vient du chat.
- 27 oct. 2026 (Jules) : **le mandat se prépare tout seul en arrivant à l'étape Mandat.** Un bien qui a son avis de valeur ouvre l'étape avec « Haka prépare le mandat avec l'avis de valeur et la fiche… », puis l'aperçu du mandat déjà rempli à droite et un premier message qui dit ce qui est repris (vendeur, adresse, désignation, prix d'accord, honoraires de l'avis) et la liste de ce qui manque. Rien d'inventé : le type de mandat, la durée, la charge des honoraires et l'adresse du mandant se demandent toujours. Un seul mandat par avis : rouvrir l'étape rouvre le même.
- 27 oct. 2026 (Jules) : **le mandat, côté mandataire, ne dit jamais « Klocka ».** L'onglet s'appelle **Conversation** (Mandat · Conversation), le bouton de l'aperçu « Envoyer le mandat », au téléphone « Conversation » avec son point. Le mandat rédigé sur MyNotary n'a plus de bouton de dépôt chez Klocka : on joint le PDF dans la conversation (le premier PDF d'un mandat à saisir devient le mandat prêt ; une seule notification, « Votre mandat est prêt »). Le mandataire le télécharge dans la conversation, puis **« Passer à l'étape suivante »** (pilule menthe, en haut à droite de la barre des onglets ; au téléphone, à côté de « Conversation ») le mène à la Commercialisation, sans redéposer de mandat signé. Klocka l'inscrit ensuite au registre.
- 27 oct. 2026 (Jules) : **le PDF joint par Klocka est le mandat signé.** Klocka saisit le mandat sur MyNotary et l'envoie en signature (le mandataire ou Klocka, et le vendeur, signent hors de la plateforme) ; dans la conversation, elle écrit simplement « je vous ai envoyé le mandat à signer ». Une fois signé, elle joint le PDF dans la conversation : c'est le mandat signé (« Votre mandat signé est arrivé »), et le mandataire clique sur « Passer à l'étape suivante ». La page Mandats ne montre plus de liens « Mandat rédigé » ni « Mandat signé » : le document vit dans la conversation.
- 27 oct. 2026 (Jules) : **après le mandat, le dossier de vente, sans analyste.** La Commercialisation d'un bien a deux temps. Avant la vente, **Le dossier** : en tête « Le dossier » et la phrase de ce qui manque en `ambre` (en menthe quand tout est prêt), à droite « Mettre en vente » (menthe, pleine largeur au téléphone), actif seulement quand les pièces obligatoires sont là, la lecture finie, chaque bloquant traité et le droit de préférence réglé. Puis les pièces en liste de lignes : rond menthe coché (ambre si un point de son onglet reste ouvert), le nom, « facultatif » en `brume`, le fichier, l'état en mot (Reçue, En lecture, À vérifier, Manquante ; au téléphone sous le nom), « Déposer » en lien menthe. « Déposer des pièces » range chaque fichier d'après son nom ; ce que rien ne reconnaît revient « À classer » avec un choix de pièce. « Demander au propriétaire » prépare le mail des manquantes. Les photos en vignettes. « Ce que les pièces montrent » : les points des grilles de l'analyse (sans le rendement sous 5 %, critère d'investisseur) et le terme du bail à moins de deux ans, chacun avec Traité, À expliquer à l'acheteur, À corriger avec le vendeur (un bloquant ne s'explique pas, il se corrige). **Droit de préférence du locataire** (art. L. 145-46-1) : la phrase d'état, « Préparer la notification » (le courrier à copier, que le propriétaire envoie en recommandé et que le notaire relit), « Notifiée le » (le mois du locataire court), puis Il refuse / Il achète ; ou « Ne s'applique pas… » avec son motif. Tout le dossier est posé sur un panneau `bg-rail` rayon 16 (la couleur de la barre de navigation, Jules le 27 oct.). Les visites restent dessous. Plus d'analyste ni de transfert côté mandataire : les pièces se lisent dans un dossier d'analyse que l'équipe ne voit pas avant la mise en vente ; à la mise en vente, il apparaît, le projet naît, Drive et Monday reçoivent le bien.
- 27 oct. 2026 (Jules : « le chat va piloter et gérer toute cette partie ») : **le dossier de vente se pilote avec Haka.** Avant la vente, la Commercialisation reprend l'écran scindé de la Visite : Haka à gauche (la conversation du bien quand il vient de la Prospection), « Le dossier de vente » à droite (le panneau seul ; les visites n'y sont plus depuis le 28 oct., elles viennent avec la vente). Avant le premier message, la colonne de Haka dit ce qui manque pour mettre en vente, si le vendeur a ouvert son espace, et propose au plus trois gestes en un tap (Écrire au vendeur ou Relancer le vendeur, Voir les points relevés, Notifier le locataire, ou Mettre en vente en tête quand c'est prêt) : chacun part dans la conversation comme s'il était tapé. Haka rédige le premier mail au vendeur avec le lien de son **espace de dépôt** (page publique `/DepotVendeur`, sans compte, 90 jours : le bien, la liste des pièces, « Déposer des documents » en menthe pleine largeur, chaque fichier rangé d'après son nom ou dans « Autres documents » ; le vendeur ne voit jamais les points relevés ; le mandataire est prévenu, une notification par heure), puis les relances ; les brouillons partent de la messagerie du mandataire. Il explique et tranche les points sur demande, note le droit de préférence, et propose la mise en vente en carte à confirmer. Dans le panneau, « Écrire au vendeur » passe par Haka, « Lien du vendeur » copie le lien. Au téléphone, comme la Visite : la proposition et le dossier défilent, la saisie reste en bas ; la conversation commencée prend la hauteur, le dossier s'ouvre par « Voir le dossier ». Le 28 oct. (Jules) : le droit de préférence se propose d'abord à gauche (« D'abord le locataire… Je la prépare ? », geste « Préparer la notification au locataire » en menthe, en tête) ; à droite, il ne garde que son état, sans boutons : la date de notification et la réponse se disent à Haka. Le 28 oct. (Jules, « l'assistant surveille la data room ») : en tête de la colonne de Haka, le mail qu'il a préparé (« Le mandat est signé : j'ai préparé le mail au vendeur… Envoyer ? », puis « Il manque encore les PV d'AG depuis 2 jours : j'ai préparé la relance. Envoyer ? ») dans un encadré `bg-surface` rayon 14 (À, objet, trois lignes ; un clic l'ouvre en champs), « Envoyer » en menthe, « Modifier », « Pas maintenant » en lien gris, et en `brume` d'où il part. Il part de la boîte Gmail du mandataire (« Boîte connectée : … » ou « Connecter ma boîte Gmail », sous les raccourcis du tableau de bord) ; sans elle, sa messagerie s'ouvre puis « C'est envoyé ». Le brouillon du chat suit la même règle (« Relisez : il part de … »). Une notification par mail préparé, aucune relance avant deux jours sans pièce reçue.
- 28 oct. 2026 (Jules, maquette Bureaux) : **le teaser, première chose de la Commercialisation une fois mis en vente.** Une page A4 (794 × 1123, `teaser.css`, couleurs de la charte) : photo en tête avec « Teaser · classe » et la référence KP-0000 en petites capitales, le titre et le sous-titre centrés, le chiffre clé en grand filigrane ; fond pervenche, carte noire (trois tuiles, l'importante en pervenche ; « Le bien », « Le fonds » ou « Le droit au bail » en tableau intitulé / détail ; trois points forts en pastilles) ; la mention de confidentialité (renforcée pour un fonds) ; la barre noire du mandataire. Sept classes (murs loués, murs libres, fonds, droit au bail, bureaux, local d'activité, entrepôt) changent les tuiles, les lignes, le filigrane et le libellé de la photo. Composé par le code depuis le mandat, l'avis et le dossier (aucun modèle) : le titre sans adresse ni nom, le sous-titre par la taille de la ville (API Géo) et la région, les points forts par règles ; ce qui manque reste « [à compléter] » en ambre. À l'écran (révisé le même jour, Jules : « comme le mandat ou l'avis ») : l'écran scindé, Haka à gauche (« Relis le teaser », « Complète les champs » ; il retouche par `modifier_teaser`), à droite le teaser en grand, chaque texte corrigé d'un clic (filet pointillé pervenche au survol, Entrée enregistre, Échap annule), la classe en liste et « Le PDF » en tête, puis la frise de la vente, les visites et le suivi. Révisé encore le 28 oct. : le teaser seul, sans fond ; dans la barre du haut « Le teaser », la classe, « PDF » et « Valider le teaser » (menthe) ; valider fait la Commercialisation et mène aux Offres, où vont la frise de la vente, les visites, le dossier investisseur, la vidéo, l'activité des clients et les offres. Puis (même jour) : plus de choix de classe d'actif dans la barre (Haka la lit dans le mandat et l'avis ; il la change sur demande) ; la pilule Édition / Lecture / Sources comme l'avis : en Édition, chaque texte se corrige d'un clic et « Importer une photo » / « Changer la photo » (pastille sombre en haut à droite de la photo) en dépose une ; en Sources, le survol d'un champ ouvre la fiche de sa source (mandat, avis, calcul, API Géo, règle Klocka, corrigé par le mandataire, retouché par Haka). Puis : un clic sur un texte du teaser ouvre à droite le panneau de mise en forme de l'avis (`Styles`, réutilisé tel quel : taille, police, style, alignement, couleur, surlignage, interligne, espacement, opacité, rotation, décalage, masquer, revenir au modèle) ; le teaser se décale à gauche ; Échap ou un clic à côté le ferme. La mise en forme se garde sur le teaser (styles, positions) et le PDF la reprend. Toute la photo est cliquable en Édition ; la photo choisie est remise en JPEG (2000 px au plus) dans le navigateur avant l'envoi.
- 28 oct. 2026 (Jules) : **après le teaser, deux voies.** L'étape Offres s'ouvre sur « Le teaser est prêt. Qui le commercialise ? », deux cartes : « L'envoyer à Klocka » (bord menthe : teaser, mandat, avis, photos et data room partent, un analyste le prend) et « Le commercialiser moi-même » (le suivi de la vente d'avant : visites, offres). Envoyé à Klocka, l'étape est la conversation du dossier (« Chez Klocka »), avec sous son en-tête l'avancement en cinq pastilles : Analyse, Présentation, Intéressé, Offre, Financement ; l'analyste les coche dans la même conversation côté Klocka (menthe une fois faite), le mandataire les lit, et chaque coche s'écrit en ligne grise dans le fil. Pas d'analyste attitré (même jour) : le mandataire parle à l'équipe (« l'équipe Klocka » dans l'en-tête ; côté Klocka « toute l'équipe peut répondre »), chacun de l'équipe est prévenu de l'envoi et des messages du mandataire, chaque réponse porte le nom de son auteur.
- 27 oct. 2026 (Jules) : **la conversation d'un mandat, la même des deux côtés.** La couleur d'une bulle suit son auteur, pas celui qui lit : le mandataire en `barre`, Klocka en surface bordée (`trait`, `surface-pleine`), la note interne en `ambre/10` ; la place suit celui qui lit (ses propres messages à droite). Vaut pour tout `FilDossier` (dossiers et mandats). Le cadre du fil s'affiche tout de suite, un petit « Un instant » à la place des messages pendant le chargement ; le fil se précharge (à l'ouverture de l'étape Mandat, au survol d'une ligne de /Mandats) sans rien marquer comme lu. Sur /Mandats, les barres du haut et le fond derrière le mandat prennent la couleur de la page, plus de noir.
- 28 oct. 2026 (Jules) : **le modèle de la page éditeur.** « Applique le modèle de la page éditeur » veut dire, partout : toute la page sur le fond du dashboard choisi par l'admin, aucune partie d'une autre couleur ; à gauche le chat (flèche de retour en haut, saisie avec « + » et Sources) ; la poignée verticale qui règle la largeur ; à droite la barre de même hauteur (le nom, puis Éditeur / Lecture / Sources, puis les actions) et le fichier dessous. En Éditeur, tout composant du fichier se clique, même les éléments fixes du modèle (logo, libellés, en-tête, pied, cadres de signature, numéros), et ouvre à droite le panneau de l'élément : ses informations et son texte s'il en a, puis **Design** (`ReglagesDesign` de `components/editeur/Editeur.jsx`, commun à tous les éditeurs : taille en pt, police, gras, italique, souligné, majuscules, alignement, couleur et fond dans la palette du document plus une couleur libre, interligne, espacement, marges haut et bas, opacité, masquer, revenir au modèle). Un élément masqué reste visible en pâle, en pointillé, dans l'Éditeur. Appliqué d'abord à l'Offre (page Offres et étape Offre du dossier) : le design se garde sur la lettre (`styles`).
- 28 oct. 2026 (Jules) : **K Partners et Klocka sont deux entreprises.** Dans l'espace mandataire (et en vue mandataire), rien ne nomme Klocka, sauf ce qui passe par Klocka : le mandat à saisir sur MyNotary, l'envoi d'un bien à Klocka et sa conversation, le compromis. Le titre de la fenêtre dit « … — K Partners ». La LOI y est toujours au modèle K Partners (une lettre ouverte en vue mandataire s'affiche et s'exporte en K Partners) : le conseil nommé est K Partners, avec la carte professionnelle et l'assurance, le pied dit « K Partners · Lettre d'intention d'achat », les honoraires sont « de notre conseil, K Partners ». Les « villes Klocka » deviennent les « villes prioritaires » ; un secteur se demande à K Partners.
- 28 oct. 2026 (Jules) : **les éditeurs alignés sur le modèle de la page éditeur.** Offre, Avis de valeur (Estimation), Teaser, Présentations (équipe et client), Projet et Mandat : même pilule `ModesEditeur` (« Éditeur / Lecture / Sources » ; le Mandat n'a qu'Éditeur / Lecture), même panneau de l'élément à droite (`PanneauEditeur`, en aside, plus de menus flottants) qui commence par le groupe **Design** commun (`ReglagesDesign`) puis les réglages propres à la page (bloc et position pour l'avis et le teaser, partie à masquer pour le deck), même fond que la page (plus de carte `bg-rail` autour du document). Chaque document pose sa palette en `--doc-*` ; les anciens styles enregistrés s'affichent toujours. Une diapositive accepte jusqu'à 150 pt.
- 28 oct. 2026 (Jules) : **l'animation de chargement de K Partners** (`components/ui/Loader.jsx`) : révisée le même jour sur la maquette de Jules : l'anneau principal et une particule en violet K Partners (`--kp-accent`), les anneaux secondaires dans la couleur du texte, un halo violet qui respire, le logo « kp_ » au centre dont le trait clignote comme un curseur, et une bande claire qui traverse le titre (en « md ») ; rien ne bouge quand le système réduit les animations. En vue mandataire, `Chargement` la prend d'office, toujours en grand au milieu de sa zone (au moins 60 % de la hauteur de l'écran ; md, lg pour une page), les lignes « … se charge » aussi (Jules, même jour : « on doit la voir en gros au milieu à chaque fois ») ; les lignes « … se charge » de l'espace mandataire et la page de dépôt du vendeur aussi. Les boutons gardent leur petite roue.
- 28 oct. 2026 (Jules) : **l'animation de chargement de Klocka**, la même que celle de K Partners avec sa marque : l'anneau principal, la particule et le jambage du K suivent la couleur d'accent choisie dans la personnalisation (`--k-menthe-rgb`, menthe par défaut) ; le K détouré au centre, son fût dans la couleur du texte, respire. `Chargement` prend celle de la marque de la vue (K Partners en vue mandataire, Klocka partout ailleurs), toujours en grand au milieu ; plus de mini-diapositives. `Loader` accepte `marque` (ou `brand`) : « kp » ou « klocka ».
- 29 oct. 2026 (Jules) : **le bien d'essai.** Dans Biens, en vue mandataire et pour l'équipe seule, « Scénarios » (pastille en bas à gauche) ouvre les scénarios par étape (Visite, Avis de valeur, Mandat, Commercialisation, Offres, Vente), cas de refus compris (réfléchit, prix trop bas, concurrent, ne vend plus). Un clic pose le « Bien d'essai » dans cet état et l'ouvre à la bonne étape ; « Effacer le bien d'essai ». Côté serveur (`server/bien-essai.js`) tout est posé directement : aucun modèle, aucun mail, aucune notification à l'équipe, rien vers Monday ni Drive ; la veille du dossier l'ignore.
- 29 oct. 2026 (Jules) : **changer de voie après coup.** Envoyé à Klocka, un lien discret « Le commercialiser moi-même » en haut à droite reprend la vente ; commercialisé soi-même, « L'envoyer à Klocka ». Une confirmation avant.

**Retour et Avant dans Offres et Dossiers** (Jules, 29 oct. 2026) : deux ronds de 32 px à contour `trait`, chevrons `ardoise` (`encre` au survol), comme les flèches d'un navigateur (`FlechesHistorique`, `src/components/ui/fleches-historique.jsx`) : ils suivent l'historique de l'application, et la flèche sans page de ce côté s'éteint (35 %). Dossiers : en haut à gauche de la liste. Dans un dossier ouvert, les mêmes ronds sont à gauche de Mode IA / Normal, avec les gestes de droite (d'abord à droite de « Tous les dossiers », déplacés le même jour), et changent de version au lieu de page (Jules, même jour) : ‹ défait le dernier geste sur une case (valeur saisie, état qui tourne), › le refait ; ⌘Z et ⇧⌘Z aussi, hors d'un champ. Les versions sont gardées sur le dossier, partagées par l'équipe (les 200 dernières) ; un geste nouveau efface ce qu'on pouvait refaire (`server/deal/analyse-pieces.js`, `changerDeVersion`). Offres : en haut à gauche de la page ; une conversation ouverte les porte dans sa barre, avant « Toutes les offres ».

**Les tableaux de l'Analyse en blanc** (Jules, 29 oct. 2026) : dans les grilles (Bail, Quittances, Copropriété, Diagnostics) et le tableau Bien, tout le texte est en `encre` : en-têtes de colonnes, libellés, valeurs, mots vides (Non trouvé, Pièce absente), pastilles de source, « Lu par l'IA », notes. Seuls gardent leur couleur les états qui en portent une (jaune, vert, `menthe`, `ambre`, `alerte`). L'en-tête de la première colonne ne dit plus « Ligne » : il est vide.

**Un onglet Data Room dans l'Analyse** (Jules, 29 oct. 2026) : le premier onglet, à gauche de Synthèse, montre les zones de dépôt de la Data Room telles quelles, pour y poser une pièce reçue après coup sans quitter l'Analyse. Sur cet onglet, « 1 Ranger dans le Drive » et « 2 Lancer l'analyse » reviennent en haut à droite ; lancer l'analyse ramène sur Synthèse. La Data Room n'est plus une étape du menu (Jules, même jour) : le menu des étapes (rail à droite, frise au téléphone) compte sept étapes, numérotées à la suite (Email, Pré-analyse, Analyse, Plateforme, Clients, Offre, Dossier bancaire) ; un dossier qui attend ses pièces s'ouvre sur l'Analyse, onglet Data Room. La frise de huit étapes reste derrière, pour les étapes validées et la liste des dossiers.

**L'Analyse sans Synthèse, le check des zones** (Jules, 29 oct. 2026) : l'onglet Synthèse est retiré ; l'Analyse s'ouvre sur la Data Room, et « Lancer l'analyse » mène au Bail. En haut à droite de chaque zone de dépôt : un check `menthe` dans un rond de 24 px (`menthe/15`) quand tout ce qu'on attend y est importé (une pièce suffit pour une zone sans nombre attendu) ; sinon le nombre, « 1 / 3 » en `brume` ; rien sur une zone vide sans nombre attendu.

**Pas d'onglet Historique dans l'Analyse** (Jules, 29 oct. 2026) : retiré ; les onglets vont de Data Room au Simulateur.

**Rentrer le projet, un geste et plus une étape** (Jules, 29 oct. 2026) : Email et Plateforme sortent du menu des étapes, qui compte cinq étapes (Pré-analyse, Analyse, Clients, Offre, Dossier bancaire), numérotées à la suite. En haut à droite de la Pré-analyse et de l'Analyse, premier des gestes : « Rentrer le projet » (pilule `h-9` bordée `menthe`, icône mallette ; crée le projet pré-rempli et l'ouvre dans Projets), ou « Voir le projet » (bordée `trait`) quand il existe. Un dossier qui s'ouvrait sur Email s'ouvre sur la Pré-analyse ; sur Plateforme, sur l'Analyse. La frise de huit étapes reste derrière, pour les étapes validées et la liste des dossiers.

**Le simulateur toujours là, enregistré seul** (Jules, 29 oct. 2026) : l'onglet Simulateur de l'Analyse montre toujours le simulateur, avec les chiffres du dossier s'il en a, à zéro sinon (plus de « lancez la pré-analyse d'abord »). Ce qu'on y tape s'enregistre seul une seconde après la dernière retouche, sans bouton : le dernier chiffre mis reste. À la place de « Enregistrer les chiffres », un petit « Enregistré » (check `menthe`, 11 px `ardoise`), « Enregistrement » pendant l'envoi. Ouvrir l'onglet n'écrit rien. Même comportement dans la Pré-analyse.

**Fermer d'un clic ailleurs, le menu des étapes, pas d'onglet Bien** (Jules, 29 oct. 2026) : le panneau d'une pièce (source d'une case) se ferme d'un clic n'importe où hors de lui, en plus d'Échap et de la croix ; un clic sur une autre source ferme l'une et ouvre l'autre. Le menu des étapes à droite se replie dès qu'on choisit une étape dans sa version ouverte. Replié, le survol d'un rond montre tout de suite le nom de l'étape à sa gauche (pilule `bg-rail`, filet `bord-doux`, 13 px `encre`), sans délai et sans ouvrir le menu. L'onglet Bien est retiré de l'Analyse : elle va de Data Room au Simulateur.

**Deux états par case, une seule police dans les étapes** (Jules, 29 oct. 2026) : une case n'a plus que deux états, grise « Lu par l'IA » et verte « OK » ; « Modifié par » disparaît. Modifier une valeur la met en OK (la valeur saisie reste de côté) ; un clic sur la case passe de l'un à l'autre, et revenir à OK remet la valeur saisie. Une case « corrigée » d'avant se lit OK. Toutes les étapes du dossier (Pré-analyse, Analyse et ses journaux, Data Room, Clients, Offre) parlent dans la police de l'application, celle de la barre de navigation (`--k-police`) : plus de Montserrat (`font-pill`, `alx-mont`), de mono ni de serif dans `src/components/preanalyse`. Les documents eux-mêmes (lettre d'intention, avis, teaser) gardent la leur.

**Les traits des grilles de l'Analyse** (Jules, 29 oct. 2026) : cadre, traits horizontaux et verticaux en `bord-doux` au lieu de `trait`, pour qu'ils se voient un peu plus.

**Les grilles de l'Analyse, angles ronds et titre centré** (Jules, 29 oct. 2026) : le cadre du tableau a des angles à 14 px (le rayon des cartes de la plateforme), traits `bord-doux` ; le nom de chaque grille (Bail, Kbis, Taxe foncière…) passe au centre au-dessus du tableau, au pas « intertitre » (20 px) au lieu de 15 px à gauche.

**Noms de lignes et de colonnes un peu moins blancs** (Jules, 29 oct. 2026) : dans les grilles de l'Analyse, les en-têtes de colonnes et les noms de lignes sont en `craie` (le blanc adouci), les valeurs restent en `encre` ; le nom d'une ligne passe en `encre` au survol.

**Le titre du dossier, sans halo** (Jules, 29 oct. 2026) : un halo très doux a été essayé sur le nom au centre de l'en-tête, puis retiré le même jour ; le titre ne s'illumine pas.

**La colonne Source, la vignette des pièces** (Jules, 29 oct. 2026) : à la place de la pilule « Bail p. 4 », la vraie vignette de la pièce (sa première page, dessinée par pdf.js une fois par pièce, 40 px de large, toujours la même taille, coin 3 px, fond blanc, ombre douce ; l'icône d'un document en attendant), et à sa droite le nom corrigé (le nom proposé pour le Drive, sinon le nom du fichier s'il se lit, sinon le type ; jamais un nom de scanner, jamais l'extension) suivi de « · page 4 » en `craie`, sur deux lignes au plus. Plusieurs sources s'empilent l'une derrière l'autre (12 px de décalage) ; survoler une vignette la met devant et montre son nom ; la source retenue est devant par défaut ; un cadre `ambre` dit une citation non retrouvée. Un clic ouvre la page et son passage surligné. La colonne garde sa largeur (1,2 part ; resserrée puis remise le même jour, Jules).

**La source montre toujours la pièce elle-même** (Jules, 29 oct. 2026, « même si c'est une photo je veux voir la photo ») : dans le panneau de la source, un PDF se dessine par pdf.js ; une photo ou une image s'affiche telle quelle sur toute la largeur, le passage surligné par l'OCR comme sur un scan ; un fichier Word est mis en page par mammoth sur une feuille blanche (texte noir, ombre douce, 720 px au plus), le paragraphe cité surligné en `ambre`. Le texte brut ne reste que pour ce qu'un navigateur ne sait pas montrer. Les vignettes de la colonne Source passent par le client authentifié ; une image y est sa propre vignette.

**Une pièce qui ne s'affiche pas : l'icône d'un document** (Jules, 29 oct. 2026) : quand une vignette ne se dessine pas (fichier illisible, photo HEIC, format sans aperçu), la colonne Source montre l'icône d'un document classique (`File`, page au coin plié, trait fin, `craie`, à la taille de la vignette) ; pendant le chargement, une feuille blanche vide. Le panneau de la source fait de même : l'icône en 64 px au centre et « Cette pièce ne s'affiche pas ici. » en `ardoise`, au lieu d'un message d'erreur rouge.

**Les notes, une colonne des grilles** (Jules, 29 oct. 2026 ; d'abord un onglet Notes, remplacé le même jour) : chaque grille de l'Analyse a une cinquième colonne « Notes » (1,2 part), une note libre par ligne pour l'équipe (`NoteCellule`, « Ajouter » au survol de la ligne, Entrée enregistre), gardée sous `pieces-<grille>.<ligne>`. Pas d'onglet Notes.

**Une étape Vidéo après l'Analyse** (Jules, 29 oct. 2026) : le menu des étapes compte six étapes (Pré-analyse, Analyse, Vidéo, Clients, Offre, Dossier bancaire). Vidéo sert à importer la vidéo du bien filmée au téléphone, pour l'envoyer aux clients : une par dossier (`video_filmee`), MP4 ou MOV, 500 Mo au plus. Vide : une grande zone en pointillés comme celles de la Data Room (rayon 14, `bord`, `menthe` au survol d'un glisser), « Importer la vidéo filmée », toute la zone se clique ou reçoit la vidéo glissée. Importée : le lecteur (rayon 14, fond noir, 70 % de l'écran au plus), dessous le nom, le poids, qui l'a mise et quand, « Remplacer » et « Retirer » en pilules bordées. Remplacer ou retirer supprime l'ancien fichier. Le teaser de vingt secondes (`BlocVideoPresentation`) n'y figure plus. Vidéo n'est pas une étape de la frise de huit : elle partage la porte de l'Analyse et se valide avec elle.

**Les vignettes dans la Data Room** (Jules, 29 oct. 2026) : chaque pièce importée d'une zone de dépôt a sa vignette (la première page, `MiniaturePiece`, 32 px, l'icône d'un document si elle ne se dessine pas) à la place de la coche `menthe` ; à sa droite, le nom, le poids et la croix de retrait, le contexte dessous.

**Ajouter au Drive les pièces reçues après coup** (Jules, 29 oct. 2026) : une fois le Drive du dossier créé, quand des pièces importées n'y sont pas encore, le premier geste devient « 1 Ajouter au Drive » avec leur nombre en pastille `ambre`. Sa fenêtre, « Les nouvelles pièces pour le Drive », ne montre que ces pièces, par zone, chacune avec une case à cocher (`menthe`, cochée d'office) devant son nom proposé ; une pièce décochée pâlit et ne part pas (ni renommée ni envoyée). Le bouton dit « Ajouter 2 pièces au Drive ». Les pièces déjà rangées ne sont jamais renvoyées ; le Doc « Contexte du dossier » reprend tout le dossier.

**Un seul nom par pièce, Data Room comprise** (Jules, 29 oct. 2026) : la Data Room montre le nom proposé (celui qui part au Drive, celui de la colonne Source) dès qu'il existe, le nom du fichier importé au survol ; un nom corrigé dans la fenêtre du Drive devient le nom de partout. Sur l'onglet Data Room de l'Analyse, ni Mode IA / Normal ni « ⋯ », comme à l'ancienne étape.

**On écrit directement dans la case** (Jules, 29 oct. 2026) : dans les grilles de l'Analyse, « Ce qu'on y lit » et « Notes » se modifient sur place (`TexteEnPlace`, `src/components/ui/texte-en-place.jsx`) : un clic dans la case y met le curseur, sans cadre, sans fond, sans bouton Enregistrer ni Annuler ; le texte garde sa taille et sa couleur, la case grandit avec lui. Entrée ou quitter la case enregistre (Maj+Entrée va à la ligne), Échap rend le texte d'avant. Une case Notes vide montre « Ajouter une note » en `brume` au survol de la ligne seulement.
Le même geste pour le contexte d'une pièce dans la Data Room (Jules, même jour, « partout sur les autres champs dans l'analyse ») : il s'écrit directement sous la pièce, « + Ajouter du contexte » en `brume` quand il est vide ; plus de champ qui s'ouvre après un import, plus de bouton Enregistrer. Restent des formulaires : les noms de la fenêtre du Drive et le « + Autre type de document ».

**Clients sort du menu des étapes** (Jules, 29 oct. 2026) : le menu compte cinq étapes (Pré-analyse, Analyse, Vidéo, Offre, Dossier bancaire), numérotées à la suite ; un dossier qui s'ouvrait sur Clients s'ouvre sur l'Analyse. La frise de huit étapes reste derrière, pour les étapes validées et la liste des dossiers.

**L'onglet Marché en grilles** (Jules, 29 oct. 2026, après avis : « mets ça en place », avec la vacance) : plus de sous-onglets par fournisseur (Bilan, Secteur, Equimmox, Le Figaro, DVF, BODACC, Vendeur, Sources) ni de cinq grandes cartes. Quatre tableaux comme ceux des pièces (Ligne / Ce qu'on y lit / Source / État / Notes, mêmes gestes : écrire dans la case, état qui tourne, notes, versions) : Loyer (loyer en place, loyer de marché, baux comparables, écart au marché), Prix (prix demandé, ventes réelles autour par DVF, résidentiel du quartier par Le Figaro), Emplacement (flux de passage, ouvertures et fermetures, cessions de fonds), Vacance (autour, sur la rue). La source se nomme par son fournisseur, soulignée ; un clic, sur elle ou sur le nom de la ligne, ouvre à droite sa vue détaillée (les baux Equimmox, les ventes DVF, les annonces BODACC, la démonstration d'un calcul), qui se ferme d'un clic ailleurs. Au-dessus des tableaux : « Marché lu le … » et « Mettre à jour » (choix des sources), ou « Lire le marché » ; pendant la lecture, une ligne « Lecture du marché en cours · Suivre », le fil en plein écran ne s'ouvre plus de lui-même. La Vacance se mesure à la demande par l'outil Vacance (« Mesurer la vacance » à droite du titre du tableau, `server/deal/marche-vacance.js`, gardée sur le lot) : la vérification Google Maps des locaux vides se paie. Le Vendeur passe dans l'onglet Bail, sous les grilles.

**Les gestes de l'en-tête du dossier, chacun à sa place** (Jules, 29 oct. 2026, après avis) : plus de numéros « 1 » et « 2 », plus de « Voir l'analyse » (les onglets y mènent). Sur l'onglet Data Room, seuls les gestes sur les pièces : l'icône du Drive, « Ranger dans le Drive » (ou « Ajouter au Drive » et sa pastille `ambre`), et « Lancer l'analyse » / « Analyser les 2 nouvelles pièces » seulement quand des pièces n'ont jamais été lues (il ouvre le Bail ensuite). Le projet créé devient une pilule « Projet ↗ » (`menthe/15`, texte `menthe`, 28 px) à côté du nom du dossier, qui l'ouvre dans Projets ; tant qu'il n'existe pas, « Rentrer le projet » reste un geste à droite, sur la Pré-analyse et l'Analyse hors de la Data Room.

**Plus de Mode IA / Normal** (Jules, 29 oct. 2026 : « juste enlève les modes ») : la pilule « Mode IA / Normal » disparaît de l'en-tête du dossier ; le dossier est toujours en vue normale, à toutes les étapes (la Pré-analyse comprise, qui s'ouvrait en mode IA). Seule l'Offre, éditeur de la lettre, garde son chat à gauche. Remplace « Le mode du dossier suit l'étape » (21 oct.) et le choix gardé dans le navigateur (`klocka.dossier.mode`, plus lu).

**Pastilles des onglets et décision de l'Analyse** (Jules, 29 oct. 2026) : seuls Bail, Quittances, Copropriété et Diagnostics portent une pastille `ambre` (leurs cases encore « Lu par l'IA ») ; Marché et Simulateur n'en ont plus (elles lisaient le compte de l'ancienne Synthèse). Le bloc de décision GO / NO-GO ne s'affiche plus sous chaque onglet : une seule fois, sous le dernier, Simulateur.

**Le nom du tableau dans sa case en haut à gauche** (Jules, 29 oct. 2026) : dans les grilles de l'Analyse (pièces et Marché), le nom du tableau (Bail, Kbis, Taxe foncière, Loyer…) n'est plus au-dessus, centré : il occupe la case vide en haut à gauche de la ligne d'en-tête, en 15 px, sur l'accent choisi dans Personnalisation à la même intensité que la case OK : fond `menthe/15`, texte `menthe`, qui remplit toute la case (Jules, même jour ; l'aplat plein était trop vif). Au téléphone, où la ligne d'en-tête n'existe pas, il reste au-dessus du tableau. « Mesurer la vacance » reste au-dessus du tableau Vacance, à droite.

**Une grille sans pièce, floutée** (Jules, 29 oct. 2026) : quand aucune pièce n'est déposée pour une grille, son tableau reste dessiné mais flouté (3 px, rien ne s'y clique), seule la case de son nom en haut à gauche reste nette ; « Aucune pièce : déposez-la dans la Data Room. » est posé au centre, sur le tableau, dans une pilule `fond/80` à filet `bord-doux`.

**Envoyer la vidéo au client** (Jules, 30 oct. 2026) : dans l'étape Vidéo, sous le lecteur, « Envoyer » en pilule `menthe` à gauche de Remplacer et Retirer ; il ouvre au-dessus un petit menu (`bg-rail`, rayon 14) : WhatsApp, Mail, puis « Copier le lien ». WhatsApp et Mail s'ouvrent avec « Bonjour, voici la vidéo du bien : <lien> » : la personne choisit le destinataire et relit dans son application ; rien ne part de Klocka. Le lien est public mais imprévisible (`/api/video-partagee/<jeton>`, un jeton par vidéo, qui change quand la vidéo est remplacée) et ne donne accès qu'à cette vidéo, lue dans le navigateur.

**Le projet à droite du titre, et sa mise à jour depuis le dossier** (Jules, 30 oct. 2026) : « Rentrer le projet » (pilule `h-7` bordée `menthe`, mallette) se place à droite du nom du dossier, à toutes les étapes, Pré-analyse comprise : un collègue qui ne fait pas l'analyse le rentre de là. Créé, il devient « Projet ↗ » (`menthe/15`) suivi d'une petite flèche circulaire `menthe` : « Mettre à jour le projet depuis le dossier », après confirmation. La mise à jour reprend les chiffres du lot (comme à la création) et les cases OK de l'Analyse qui ont leur place dans le projet (échéance et loyer du bail, ramené à l'année ; dénomination et activité du Kbis) ; une valeur vide du dossier n'efface jamais celle du projet ; photos, textes et réglages ne bougent pas (`mettreAJourProjetDepuisDeal`, `server/deal/projet.js`). Règle d'équipe : on analyse dans le dossier, le projet est ce qu'on publie.

**Marché : « Chercher » dans la case, pas de Notes** (Jules, 30 oct. 2026) : la colonne Notes sort des tableaux de Marché (quatre colonnes). Sous la valeur de chaque ligne, « Chercher » en `menthe` 12,5 px (loupe) relit les seules sources de cette ligne (Equimmox pour les baux, DVF pour les ventes, Le Figaro pour le résidentiel, Data-B ou l'étude Klocka pour les flux, BODACC pour la rue et les cessions) ; toujours visible sur une case vide, au survol de la ligne sinon ; une case OK revient à « Lu par l'IA » pour recevoir la nouvelle lecture. Les lignes Vacance gardent « Mesurer la vacance ».

**« Valeur » au lieu de « Ce qu'on y lit »** (Jules, 30 oct. 2026) : l'en-tête de la colonne des grilles de l'Analyse (pièces et Marché) dit « Valeur » : la case porte ce que l'IA a lu ou ce que l'analyste a mis, pas seulement une lecture.

**La vacance avec la lecture du marché** (Jules, 30 oct. 2026) : « Lire le marché » et « Mettre à jour » (lecture complète) mesurent aussi la vacance, en tâche de fond (`mesurerVacanceEnFond`) ; pendant ce temps le bouton du tableau Vacance dit « Mesure en cours… » et la grille se relit toutes les 15 s. « Chercher » sur une ligne ne la relance pas. La vacance lit l'adresse telle qu'elle a été donnée, même sans virgule ni code postal.

**L'en-tête du dossier sans « Tous les dossiers » ni « ⋯ »** (Jules, 30 oct. 2026) : à gauche, une petite maison (rond de 36 px, `ardoise`, `encre` et fond `rail-actif` au survol, « Tous les dossiers » au survol) remplace « ← Tous les dossiers » ; à droite, le « ⋯ » du dossier disparaît (abandonner et supprimer restent dans le « ⋯ » de chaque ligne de la liste des dossiers).

**L'état d'une ligne en bande, plus de colonne État** (Jules, 30 oct. 2026, choix 2 parmi six) : dans les grilles de l'Analyse (pièces et Marché), la colonne État disparaît. Chaque ligne porte au bord droit de sa case Valeur (contre la colonne Source ; d'abord au bord gauche de la ligne, déplacée le même jour) une bande verticale de 4 px sur toute sa hauteur : `brume` quand c'est lu par l'IA, `vert` quand c'est vérifié, rien quand la ligne n'a pas de valeur. La zone cliquable fait 16 px ; au survol la bande s'épaissit à 6 px et une étiquette (`bg-rail`, 12 px) dit « Lu par l'IA · cliquez quand c'est vérifié » ou « Vérifié par Nora » ; un clic fait passer de l'un à l'autre ; modifier la valeur la met en vert. Collée à la valeur qu'elle valide, alignée d'une ligne à l'autre. Au téléphone, elle borde à droite le bloc de la valeur.

**L'état dans la case du nom de la ligne** (Jules, 30 oct. 2026, remplace la bande du même jour) : dans les grilles de l'Analyse (pièces et Marché), la case du nom de chaque ligne (Loyer en place, Loyer de marché, Échéance du bail…) prend tout son fond : `rail-actif` (gris, texte `encre`) quand c'est lu par l'IA, `vert/15` quand c'est vérifié, le nom restant blanc (`encre` ; Jules, même jour : le vert sur vert n'était pas beau) ; un clic fait passer de l'un à l'autre, et modifier la valeur la met en vert. Sans valeur, la case reste neutre et ne se clique pas. Le nom n'ouvre plus la source : la vignette ou le nom de la source le font. Pas de colonne État, pas de bande.

**Marché sans date ni « Mettre à jour »** (Jules, 30 oct. 2026) : plus de « Marché lu le … » ni de « Mettre à jour » au-dessus des tableaux. Ne restent que « Le marché n'est pas encore lu. » et « Lire le marché » tant qu'il ne l'a jamais été, et la ligne d'avancement pendant une lecture ; une fois lu, « Chercher » relit une ligne et « Mesurer la vacance » la vacance.

**La case Valeur ne dit que la valeur ; la note de l'IA va dans Notes** (Jules, 30 oct. 2026) : plus de textes orange sous la valeur dans les grilles des pièces (alerte d'une règle, pièces qui se contredisent, relecture qui lit autre chose). Ils deviennent la note de l'IA dans la colonne Notes, en `craie` 13 px précédée de « IA » (11 px `brume`), tant que personne n'a écrit sa note ; modifier la valeur l'efface. Ce qui compte : la valeur, et si elle est conforme à sa source.

**Le tableau en gris et vert, l'accent pour les comptes** (Jules, 30 oct. 2026) : la case du nom du tableau en haut à gauche perd son fond d'accent ; le nom y est en 15 px, graisse moyenne, `encre`. Dans le tableau, seulement du gris (lu par l'IA) et du vert (vérifié). Les nombres des onglets de l'Analyse (Bail 4, Quittances 3…) passent de l'`ambre` à l'accent choisi dans Personnalisation (`menthe/15`, texte `menthe`).

**La note de l'IA, à la main de l'analyste** (Jules, 30 oct. 2026) : la note de l'IA s'écrit dans la case Notes comme une note ordinaire (« IA » au-dessus en 11 px `brume`, le texte en `craie`) : un clic et on la modifie (elle devient la note de la personne), on la vide et elle disparaît pour de bon (`ia_retiree` gardé sur le dossier). Rien de cela ne change l'état gris ou vert de la ligne.

**Le sable pour « lu par l'IA »** (Jules, 30 oct. 2026) : la case du nom d'une ligne lue par l'IA passe du gris (`rail-actif`) au sable #E0CEA9, nouveau jeton `lu-ia` (mêmes valeurs dans les deux thèmes), en fond `lu-ia/25` (`/35` au survol), le nom en `encre` ; vérifiée, elle reste `vert/15`.

**La colonne Notes, d'après la fiche de Jules** (30 oct. 2026) : en-têtes des grilles en 13,5 px `ardoise` (le plus proche de #A8A8A8), cellules à 14 px de marge intérieure, alignées en haut. Une note : texte sable `lu-ia` (#E0CEA9), 13,5 px, interligne 1,55, graisse normale, retour à la ligne normal. Une note de l'IA porte « IA » en exposant juste après son dernier caractère (9 px, interlettrage 0,04 em, 3 px à gauche, `encre`) ; plus de libellé au-dessus. Une note d'analyste n'a pas d'exposant (son auteur au survol). Une case sans note reste vide, sans tiret ni « Ajouter une note » ; un clic dedans permet d'écrire. La police reste celle de l'application (une seule police dans les étapes, 29 oct.).

**Noms des lignes et des colonnes, même gris clair** (Jules, 30 oct. 2026) : dans les grilles de l'Analyse, le nom de chaque ligne (sur son fond sable ou vert) et les en-têtes de colonnes sont en `craie`, un peu moins blancs que les valeurs (`encre`).

**La note de l'IA ne dépend pas de la ligne** (Jules, 30 oct. 2026, remplace « modifier la valeur l'efface ») : ni passer la ligne en vert ni modifier sa valeur n'effacent la note de l'IA ; elle ne part que si la personne la vide ou la réécrit dans la case Notes.

**Une pièce reçue après coup** (Jules, 30 oct. 2026) : « Analyser » ouvre l'onglet de la pièce lue (un PV d'AG mène à Copropriété, un avenant au Bail), plus le Bail d'office. La pièce la plus récente est retenue par défaut sur une ligne (un avenant reçu après le bail donne le chiffre affiché), tant qu'on n'en a pas retenu une autre. Une pièce jamais lue qui contredit une ligne vérifiée la repasse en sable, à revérifier (la valeur saisie et la note restent de côté) ; sur une grille empilée (quittances, PV), toute pièce nouvelle repasse la ligne en sable. La relecture d'une pièce déjà lue ne touche jamais une ligne vérifiée.

**Les deux gestes de la Data Room disent ce qu'ils font** (Jules, 30 oct. 2026 : « je ne sais pas quoi ranger, je ne sais pas ce que c'est ») : « Ranger le document dans le Drive », « Ranger les 3 nouveaux documents dans le Drive » (bordé `menthe`), et « Analyser le document », « Analyser les 2 nouveaux documents » (plein `menthe`) ; le verbe, le nombre, et « nouveaux » quand d'autres ont déjà été rangés ou lus. Chacun n'apparaît que s'il a quelque chose à faire : plus de « Ranger dans le Drive » quand tout y est, plus de pastille de nombre.

**La note de l'IA s'efface quand la ligne est verte** (Jules, 30 oct. 2026, remplace « ne dépend pas de la ligne ») : la note de l'IA ne se montre que sur une ligne lue par l'IA (sable). Dès qu'on clique la ligne en vert, ou qu'on modifie sa valeur, elle disparaît ; si la ligne repasse en sable, elle revient. La personne peut toujours la modifier ou la vider tant qu'elle se montre.

**Plus de section Vendeur dans l'Analyse** (Jules, 30 oct. 2026) : le bloc « Le vendeur · ALX » (propriétaire des murs, gérants, lots, pourquoi il vend, la vraie raison) est retiré de l'onglet Bail, où il avait été déplacé depuis Marché ; il n'apparaît plus nulle part dans le dossier.

**La Prospection du mandataire au dessin de l'Analyse** (Jules, 30 oct. 2026 : « prends exemple sur la page Analyse des dossiers ») : Mon secteur et Listes sont posés sur la carte d'un dossier ouvert (`bg-rail`, rayon 18, filet `trait`, `p-6`, `p-4` au téléphone). En tête de la carte, les onglets soulignés de l'Analyse (`Onglets` en taille page) : Mon secteur, Listes, Terrain, à la place de la pilule. Dans Listes, les listes sont une seconde rangée d'onglets soulignés, le compte dans une pastille `menthe/15` comme « Bail 18 » ; plus d'intercalaires ni de fond à points, et la suppression reste dans la barre de la liste. Les tableaux prennent le cadre de l'Analyse (rayon 14, `bord-doux`). Le contenu entre en fondu en montant, comme un changement d'onglet de l'Analyse.

**« Chercher » propose ses outils** (Jules, 30 oct. 2026) : dans Marché, « Chercher » sous une valeur ouvre un menu (`bg-rail`, rayon 14, 300 px) des outils qui savent répondre à cette ligne, chacun avec ce qu'il lit et sa durée ou son coût (Equimmox · baux signés autour, environ 1 min ; Data-B · valeur locative de la rue, quelques secondes ; DVF · ventes enregistrées, gratuit…). Un clic lance cet outil seul ; sa lecture arrive dans la case, l'outil en source. Pas encore de demande libre à Haka.

**Des raccourcis par personne dans la barre** (Jules, 30 oct. 2026) : `RACCOURCIS_PAR_PERSONNE` dans `src/lib/menu.js` ajoute des entrées en bas du menu principal pour une adresse donnée ; la page reste aussi dans son groupe, et le raccourci n'ouvre aucun accès de plus. Premier : Utilisateurs pour paul.dz@klocka.immo.

**La page publique « Notre offre »** (Jules, 30 oct. 2026) : `/NotreOffre`, ouverte sans compte (`PAGES_PUBLIQUES`). Fond `fond`, sections alternées sur `surface-pleine`, titres en capitales très grasses avec le mot clé en `menthe`, surtitres en capitales espacées `menthe`. Accroche (pastille, titre, « Préparer mon mandat », photo `public/img/offre/investisseurs-sereins.png`), méthode en cinq cartes à icône, honoraires (offre socle bordée `menthe`, rémunération variable bordée `jaune`, gestion locative neutre, deux encadrés), exemple chiffré, plateforme en cartes, dernier pas, et une barre fixe en bas. Tous les boutons mènent au questionnaire Typeform du mandat.

« Notre offre », suite (Jules, 30 oct. 2026) : le carrousel « Des deals sourcés pour nos clients » (une diapositive par ville : Paris, Nice, Metz, Grenoble ; flèches rondes de chaque côté, points dessous), les cinq captures de la plateforme en cartes (image 16/9 en haut, sans la bulle « Un problème ? »), le logo Klocka avec sa signature en haut à gauche (`logo-klocka-wordmark.svg`, 44 px de haut), et l'accent figé en vert sauge (environ #6BA69A, la couleur donnée par Jules ; d'abord #a9c5a0, l'accent « Sauge » de la palette) : la page ne suit pas la couleur choisie dans Personnalisation.
Le carrousel des deals avance seul toutes les 5 secondes, s'arrête sous la souris et repart d'un clic (Jules, même jour).
« Notre offre » sur fond noir complet (Jules, même jour) : la page, ses sections, ses cartes et la barre du bas sur `black`, sans alternance de fonds ; les cartes se détachent par leur filet `trait` et leur voile `surface`.
Le logo de « Notre offre » est le logo officiel (`logo-klocka-presentation.png`), sa signature « Développeur de revenus immobiliers » écrite dessous en sauge, étirée à la largeur du mot (Jules, même jour) ; plus la reconstruction en traits fins.
Le même jour, Jules revient en partie : les listes reprennent leur classeur (intercalaires, croix sur l'ouvert, zone à points), sans la carte de l'Analyse ; seuls les onglets Mon secteur, Listes, Terrain restent soulignés. Plus de compteur « Propriétaires au cadastre / Numéros des propriétaires : n restants » : la recherche tourne en fond. Dans le tableau d'une liste et sa barre, un seul corps de texte, 13,5 px : en-têtes de colonnes, commerce et ville, cellules, recherche, filtres, chiffres, boutons.

**Rentrer le projet : rempli au maximum, puis des questions** (Jules, 30 oct. 2026) : depuis la Pré-analyse ou l'Analyse, le projet prend les chiffres du lot et ce que les pièces ont lu (dénomination et activité du Kbis, échéance et loyer du bail, ramené à l'année) quand le lot ne les a pas. Son titre est « Nom du local - adresse » (« Restaurant Le Perroquet Bleu - 72 Bd des Dames, 13002 Marseille »), le nom venant du lot, sinon du Kbis. Ce qui reste vide parmi l'essentiel (adresse, locataire, activité, surface, prix, loyer, échéance, rendement) devient le premier message du chat du projet, à gauche : « Il me manque… », en liste, « donnez-les-moi ici, même en vrac » ; il ne s'affiche qu'une fois.
Le tableau des murs de Mon secteur prend le dessin du tableau d'une liste (Jules, 30 oct. 2026) : zone à points, barre au-dessus (recherche en pilule, « n murs sur N » avec le nombre en `menthe`, gestes bordés), tableau à traits continus, case et Commerce fixes à gauche, en-têtes en `encre`, un seul corps de 13,5 px. La raison de vendre s'écrit en texte, dans la couleur des notes de l'IA de l'Analyse (`lu-ia`), au lieu de pastilles grises.

**Le Mandataire sans jaune** (Jules, 30 oct. 2026) : dans la vue mandataire, plus de jaune ni d'ambre. La racine porte `data-vue="mandataire"` (Layout) et `index.css` y fait pointer `ambre` et `jaune` sur le sable des notes de l'IA de l'Analyse (`lu-ia`, #E0CEA9), fenêtres et menus compris. Les classes `ambre` restent écrites dans les composants : l'admin garde son ambre, le mandataire voit le sable.

**Chercher dans une autre source : un « + » à droite de la source** (Jules, 30 oct. 2026, remplace « Chercher » sous la valeur) : dans Marché, à droite du nom de la source, un petit rond « + » (20 px, filet `bord-doux`, `menthe` au survol) ouvre « Chercher la valeur dans » et les sources qui savent répondre à la ligne, avec leur durée ou leur coût ; un clic lance cette source seule, sa lecture arrive dans la case. Pendant une lecture, le « + » tourne.

**Mes acquéreurs** (Jules, 30 oct. 2026) : la page Clients du mandataire a deux onglets soulignés, Clients Klocka et Mes acquéreurs. Sans fichier, Mes acquéreurs s'ouvre sur l'import : une zone en pointillés (cliquer ou glisser un .xlsx ou un .csv), puis « Ou collez votre liste, telle quelle » et « Importer la liste » en menthe. Haka reconnaît les colonnes par leur titre (le modèle seulement pour des titres inconnus ou une liste sans colonnes), écarte les doublons (même e-mail, téléphone ou nom) et dit « n importés, m déjà là ». Ensuite, le tableau au dessin de celui d'une liste (zone à points, recherche en pilule, « Importer un fichier », traits continus, 13,5 px) : Acquéreur, Contact (téléphone qui appelle, e-mail), Ce qu'il cherche, Villes, Budget, Rendement, une croix au survol pour retirer. Les acquéreurs ne sont qu'au mandataire ; Haka les lit (outil `mes_acquereurs`) pour dire qui appeler pour un bien.

**Marché : une ligne par source** (Jules, 30 oct. 2026, remplace le « + » et « Chercher ») : chaque question de Marché (Loyer de marché, Ventes réelles, Flux…) montre une sous-ligne par source qui sait y répondre : la valeur seule à gauche, sous « Valeur », et à droite, sous « Source », une case à cocher (`menthe`) puis le nom de la source (`craie`, 13 px) ; le détail de la méthode au survol du nom, et un clic sur le nom ouvre le panneau de cette source à droite. Pour le loyer de marché : Equimmox · baux, Equimmox · secteur, Data-B. Une source sans réponse affiche « Demander » (`menthe`), qui l'interroge seule. Une source décochée reste visible, grisée, sa valeur barrée, et ne compte plus (gardée sur la case, `exclues`). Dernière sous-ligne : « Ma valeur », à écrire directement ; l'écrire la retient et passe la ligne en vert. « Baux comparables » disparaît (c'est Equimmox · baux du loyer de marché). Une nouvelle source (un outil Klocka) s'ajoute à la liste de la question, dans `lignesDu` de `GrilleMarche.jsx`.

**Projet : le titre sans l'adresse** (Jules, 30 oct. 2026, remplace « Nom du local - adresse ») : le titre d'un projet est le nom du local seul, l'adresse est écrite juste en dessous. Les projets rentrés avant l'affichent sans la partie après le tiret quand l'adresse du projet commence par elle (`src/lib/titre-projet.js`).

**Éditeur de projet : la mise en forme à la demande** (Jules, 30 oct. 2026) : un clic sur une valeur l'ouvre à la saisie, sans ouvrir le volet de design. Une pilule « Aa Mettre en forme » (filet `bord-doux`, `surface-pleine`) apparaît en bas à droite de l'aperçu et l'ouvre. Les onglets de la page (Marché, Bien, Locataire…) sont sous le bouton « Simulateur complet », plus au-dessus de la photo.

**Ajouter plutôt que renvoyer à la Data Room** (Jules, 30 oct. 2026) : une grille de l'Analyse sans pièce porte, sur le flou, un bouton plein « + Ajouter une pièce » ; la pièce se range dans l'emplacement de la grille et se lit. Une bande de chiffres du projet a en édition un « + Ajouter » en pointillés : remettre une case supprimée, ou un chiffre libre. La frise du bail se retouche en édition : sous elle, chaque point (date, nom, croix), « Ajouter un point », « Rétablir la frise calculée ».

**Les longues listes par pages** (Jules, 30 oct. 2026) : Dossiers et Projets montrent 20 cartes par page, la plus récente d'abord ; le tableau d'une liste de la Prospection, 50 commerces. Sous la liste, « ‹ Précédente » et « Suivante › » bordés (le motif de CasesProjet) et « Page n sur N · total » au milieu en 13 px `ardoise` (`src/components/ui/Pages.jsx`) ; rien quand tout tient sur une page. Dossiers et Projets ne reçoivent du serveur que leur page (recherche et archivés filtrés côté serveur) ; la Prospection reçoit la liste entière (carte, Terrain, tout cocher) et n'en dessine que 50.

**La Mémoire Klocka** (Jules, 30 oct. 2026) : les fiches des biens qu'on supprimait, gardées comme donnée de marché (faits + la fiche, jamais la Data Room ni le Drive). Page `/Memoire`, hors menu, atteinte par un bouton « Mémoire » à côté de « Mandats » sur Dossiers, avec son cadenas (`MemoireKlocka` dans les accès). En haut, la carte « Les boîtes » (`bg-rail`, rayon 14) : une ligne par boîte Gmail, l'avancement du lecteur, la dépense du jour (sans plafond), « Autoriser la lecture » (Jules seulement, bordé `menthe` une fois autorisée ; la boîte se lit aussitôt, en entier, de jour comme de nuit : Jules, même jour), Mettre en pause, Relancer. Dessous, la recherche en pilule et le tableau à traits continus, 50 lignes par page : Reçue, Adresse, Ville, Loyer / an, Prix (en k€), m², Locataire, Agent, Agence, Boîte, Origine, puis « Fiche » et « Dossier » en `menthe`. Sur la fiche d'un agent (Prospection), une ligne « Mémoire · n fiches · villes · loyers · prix · dernier envoi · retenues » sous les quatre chiffres. Dans Twenty, les biens vont dans « Propriétés » au statut « Mémoire », reliés à leur « Agent immobilier » par une vraie relation.

**Projet rentré depuis le dossier** (Jules, 30 oct. 2026) : le projet naît rempli. Il reprend les habitants (Insee, agglomération sinon commune) et le revenu médian de la ville, le loyer et la surface lus dans l'Analyse (donc le loyer au m² par an), l'activité, le profil d'après le Kbis (forme, année d'immatriculation, capital), le début et l'échéance du bail, chaque point du bail et de la copropriété (les grilles de l'Analyse passent devant l'ancienne fiche), et un simulateur réglé sur ces chiffres. Le nom du locataire, l'activité et les pastilles du profil ont une majuscule pour commencer, le reste en minuscules ; le titre garde l'écriture de l'enseigne. « Dernière vente » et « Détenu depuis » ne viennent que d'une vente de locaux commerciaux sur la parcelle (DVF) ; sans elle, la carte Dernière vente ne s'affiche pas, même en édition. Un bail échu dit « Tacite reconduction » comme durée restante. Le premier message du chat du projet commence par « Voici ce que j'ai mis dans le projet : », puis une ligne « - Libellé : valeur » par champ rempli, puis « À vérifier : » (ce qui manque, les alertes de l'Analyse pas encore au vert, le nombre de valeurs lues par l'IA non vérifiées).

**Images du projet dans la Data Room** (Jules, 30 oct. 2026) : un emplacement « Images du projet » dans la Data Room du dossier. Les images déposées passent dans les photos du projet, une fois chacune : retirée du projet, une image n'y revient pas. À la création du projet, l'image de la page Wikipédia de la ville est mise en première photo ; sans image trouvée, rien.

**Les résolutions des PV d'AG** (Jules, 30 oct. 2026) : dans l'onglet Copropriété, sous la grille « PV d'AG », un onglet par assemblée (`Onglets` taille « page » : « PV d'AG 2023 », « PV d'AG 2024 », la date quand deux assemblées tombent la même année ; la dernière s'ouvre). Un tableau au dessin des grilles, une ligne par résolution, quatre colonnes : Résolution (numéro et intitulé), Issue (« Votée » en `vert`, « Refusée » en `alerte`, « Ajournée » en `ambre`, « Sans vote » ; dessous en 12,5 px les tantièmes, le montant et la majorité), Source (vignette du PV et page, un clic ouvre le passage), Note. Le même jour, Jules retire la colonne Statut et ses quatre mots (Important, Pas important…) : la case de la résolution porte l'état comme le nom d'une ligne de grille, sable `lu-ia/25` à vérifier, vert `vert/15` vérifié, un clic passe de l'un à l'autre ; la colonne Note est celle des grilles. Au survol de la case d'une résolution, un petit œil barré la cache (la ligne disparaît) ; au survol de l'en-tête « Résolution », un œil réaffiche toutes les résolutions cachées du PV. Au téléphone, l'œil reste visible et une ligne « Réafficher » remplace l'en-tête. Un PV lu avant cette date propose « Relire le PV ».
