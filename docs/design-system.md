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

**Plein écran** (éditeur ouvert sur téléphone) : rendu par
`createPortal(…, document.body)`, `fixed inset-0 z-[70]`, fond opaque, la page
derrière ne défile plus. Jamais dans un conteneur animé : il s'y calerait.

**Notifications** : `poser(ton, titre, opts)` de `src/components/ui/avis.jsx`
(ou `toast.success`…). Toutes ont la même forme (décision du 3 oct. 2026) :
une pilule sombre, un point coloré pour le ton (vert succès, accent
information, ambre, alerte), la phrase sur une ligne, une précision
éventuelle dessous, et « Voir » à droite quand il y a quelque chose à ouvrir.
Pas de croix : un clic sur la pilule la referme. Phrases courtes :
« Dossier transféré à Nora ».

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
- **Écran scindé** (Estimation, Mandat), à partir de 1024 px :
  - grille `grid-cols-[minmax(360px,440px)_minmax(0,1fr)]`, `h-[100dvh]` ;
  - la barre latérale s'efface (`html.k-sans-barre`), la page ne défile plus,
    **chaque colonne défile seule** ;
  - séparation `border-l border-bord-doux` ;
  - fond de l'aperçu = `J.barre` (comme la barre de saisie et les bulles) ;
  - **les deux barres du haut sont identiques** : `h-14`, `.k-barre-apercu`,
    bordure basse `border-trait` ; une seule barre de chaque côté ;
  - le chat garde sa place dans l'arbre d'un mode à l'autre (sinon il perd son
    fil) ;
  - un seul chat : il répond aux questions **et** modifie le document à droite ;
    un clic sur un élément du document le désigne au chat (« ça ») ;
  - le document se modifie à tout moment, flèches annuler / rétablir comprises ;
  - au téléphone : le chat seul, le document en plein écran.
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
