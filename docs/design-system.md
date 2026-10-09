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
Les listes de prospection (mandataire, onglet Listes) : la liste ouverte et
son intercalaire prennent le fond du sélecteur Prospecter / Agent IA / Listes
(`bg-rail-actif`), les autres intercalaires le voile `bg-surface` ; plus clair
qu'avant, jugé trop sombre. Décision du 5 oct. 2026.

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

**État vide** : une phrase `text-brume` centrée qui dit quoi faire
(« Aucun mandat encore : dites au chat quel mandat vous préparez. »).

**Fenêtres (pop-up)** : centrées sur la zone de contenu, pas sur l'écran
(`md:left-[var(--k-barre-largeur)]`) ; voile sombre flouté ; Échap et clic
dehors ferment. Bordure franche (`border-bord-vif`).

**Accueil du mandataire** (`mandataire/AccueilMandataire.jsx`) : à son
arrivée, une fenêtre par étape (« Bienvenue · étape 1 sur n »), un seul
bouton « Valider », pas de fermeture tant que ce n'est pas réglé ; chaque
réglage se retrouve ensuite dans Compte, où chaque case s'enregistre aussitôt.
Première étape : « Où cherche votre agent » (villes Klocka verrouillées en
pastilles menthe, les autres communes du secteur en cases). 5 oct. 2026.

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
partagée par toute l'équipe, sans onglets. Titre centré, puis le tableau de
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

## 6. Le chat et l'écran scindé

Le chat est `ChatDashboard` ; une page en crée un espace (`ESPACES`), elle ne
le recopie pas.

- **Accueil d'une page de travail** : la question en titre, une phrase d'aide
  (une seule, celle du mode choisi), le chat, puis la liste des objets.
- **Modes** (« Avec le bail », « Sans document ») : pilule à gauche de la
  barre, masquée une fois la conversation lancée. Les skills : un simple lien
  « Connecter un skill » sous le chat, qui ouvre la fenêtre des skills.
- **Fil** : bulles envoyées en `J.barre`, réponses avec la pastille K, les
  étapes de raisonnement affichées, la dictée disponible partout.
- **Écran scindé** (Estimation, Mandat, Offres), à partir de 1024 px :
  - grille `grid-cols-[minmax(360px,440px)_minmax(0,1fr)]`, `h-[100dvh]` ;
  - la barre latérale s'efface (`html.k-sans-barre`), la page ne défile plus,
    **chaque colonne défile seule** ;
  - séparation `border-l border-bord-doux` ;
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
