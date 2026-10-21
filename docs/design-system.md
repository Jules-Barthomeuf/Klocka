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
