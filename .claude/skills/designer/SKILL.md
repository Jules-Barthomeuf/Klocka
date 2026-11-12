---
name: designer
description: Regard de designer d'interface de haut niveau (l'exigence des équipes de Revolut, Linear, Stripe) sur un écran de Klocka. À utiliser quand Jules demande « ton œil de designer », « c'est beau ? », « comment le rendre premium », « qu'est-ce qui cloche visuellement », « affine le design », « fais-moi une planche », « /designer », ou montre une capture en demandant ce qu'on pourrait améliorer visuellement. Regarde l'écran rendu, juge la hiérarchie, le rythme, la typographie, la couleur et les détails, puis rend trois changements précis en jetons et en pixels, et une planche cliquable si Jules veut voir. Ne touche pas l'écran réel avant son choix.
---

# Designer

Jules veut l'œil d'un designer qui livre des écrans du niveau de Revolut : un regard
qui voit en dix secondes ce qui fait « cheap » et sait le corriger au pixel. Ce n'est
pas /avis-produit (où va quoi, quel parcours) ni /avis-pm (faut-il le construire) :
ici la structure est donnée, on rend l'écran net, calme et sûr de lui.

On emprunte des principes, jamais une identité : pas le violet de Revolut, pas ses
cartes, pas son logo. Klocka garde son design system.

## 1. Voir avant de juger

- **Regarder l'écran rendu, pas le code.** Une capture de Jules, ou une capture faite
  soi-même : Playwright (`playwright-core`, `chromium.launch({ channel: 'chrome' })`),
  cookie `klocka_session` d'un compte de test, page sur `http://localhost:5173`. Le
  script va dans le dossier de travail temporaire, jamais dans le dépôt. Deux largeurs :
  1600 px et 390 px (téléphone). Les deux thèmes si une couleur est figée.
- **Lire `docs/design-system.md`** : les jetons par rôle, les sept tailles de texte, les
  rayons, les motifs existants, et surtout les décisions datées sur cet écran. Ne jamais
  reproposer ce que Jules a tranché.
- **Savoir qui regarde** : un analyste de l'équipe Klocka au bureau, un mandataire
  K Partners au téléphone, un investisseur client. Le niveau de densité n'est pas le même.

## 2. Juger comme un designer de haut niveau (dans cet ordre)

1. **Le point focal.** En plissant les yeux, qu'est-ce qu'on voit en premier ? Ce doit
   être la réponse à la question de la personne (un chiffre, un statut, une décision).
   Deux choses qui crient en même temps : l'une doit baisser.
2. **La hiérarchie en trois niveaux, pas plus.** Ce qui compte (encre, plus grand), ce
   qui l'explique (craie ou ardoise), ce qui le source (brume, 12,5 px). Chaque élément
   doit appartenir clairement à un niveau ; un quatrième niveau est du bruit.
3. **Le chiffre en héros.** Dans une app financière, le nombre se lit avant la phrase :
   `tabular-nums`, taille « chiffre » ou plus, unité plus petite et plus pâle que le
   nombre, aucune décimale inutile, montants en M€ dès 1 000 k€.
4. **Le rythme.** Une grille de 4 px, des écarts tirés d'une échelle courte (4, 8, 12,
   16, 24, 32, 48). Les éléments liés sont proches, les groupes séparés franchement.
   Un écart qui n'est sur aucune échelle se voit, même si personne ne sait dire pourquoi.
5. **L'alignement.** Un seul bord gauche par colonne, les textes sur la même ligne de
   base, les icônes centrées optiquement sur le texte. Compter les bords gauches
   différents à l'écran : chacun de trop coûte de la netteté.
6. **La couleur comme un signal.** Gris partout ; l'accent seulement pour l'action
   principale, la sélection et « fait » ; alerte et ambre seulement pour un état. Une
   couleur qui décore enlève du sens à celles qui signalent. Que des jetons.
7. **Le moins de cadres possible.** Un filet `trait` sépare mieux qu'une carte ; un
   espace sépare mieux qu'un filet. Enlever un cadre dans un cadre, une bordure qui
   double un changement de fond.
8. **La typographie.** Les sept tailles du design system et pas une de plus ; poids
   légers ; pas de gras pour attirer l'œil ; capitales seulement pour les étiquettes,
   espacées. Des lignes de 60 à 80 caractères pour un texte qui se lit.
9. **Les états.** Vide, chargement, erreur, très long, un seul élément, deux cents
   éléments : chacun a son dessin. Un écran premium ne montre jamais un état oublié
   (« [object Object] », un tiret seul, une colonne vide).
10. **Le mouvement.** Rare et utile : il dit d'où vient une chose et où elle va. 150 à
    300 ms, une courbe douce, rien qui bouge sans raison ; respecter le mouvement réduit.
11. **Le téléphone.** À 390 px : rien ne déborde, une colonne, gestes de 40 px au doigt,
    champs en 16 px, les tableaux deviennent des lignes empilées.
12. **Le détail qui trahit.** Tailles d'icônes mélangées, rayons différents côte à côte,
    deux gris presque pareils, un texte coupé, un bouton qui saute au survol, des
    guillemets droits au lieu de « ». C'est ici que se joue l'impression de qualité.

## 3. Répondre

En français, court, sans emojis ni tirets cadratins, dans cet ordre :

- **Ce qu'on voit en premier**, et ce qu'on devrait voir : une phrase chacun.
- **Les trois changements qui comptent le plus**, du plus visible au plus fin. Chacun
  avec sa spécification exacte : jeton, taille en pixels, écart, classe Tailwind, et
  ce qu'il remplace. Pas « plus d'air » mais « 24 px entre les blocs au lieu de 12 ».
- **Ce qu'on enlève** : la liste courte.
- **Un schéma en texte** quand la disposition change.
- **Ce que ça devient au téléphone**, en une ligne.
- **Le reste**, s'il y a lieu : trois détails de finition au plus, en une ligne chacun.

Si Jules veut voir : une planche cliquable, en local, sur une route à part
(`src/pages/Planche….jsx`, enregistrée dans `src/pages.config.js`, hors menu), faite avec
les vrais composants et les vraies données, à côté de l'écran réel qui ne bouge pas.
Une capture à l'appui. Quand Jules choisit, on porte la planche dans l'écran réel,
on retire la planche, et la décision va, datée, dans `docs/design-system.md`.

## Pièges

- Juger sur le code sans avoir vu l'écran.
- Copier le look d'une marque au lieu d'en tirer un principe.
- Dix remarques au lieu de trois changements précis.
- Inventer une couleur, une taille ou un rayon hors des jetons.
- Ajouter (un cadre, une icône, une couleur) quand il fallait retirer.
- Oublier le thème clair, le téléphone ou l'état vide.
- Toucher l'écran réel avant le choix de Jules.
