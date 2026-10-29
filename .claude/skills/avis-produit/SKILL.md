---
name: avis-produit
description: Avis de product designer sur une page ou un écran de Klocka. À utiliser quand Jules dit « aide-moi sur cette page », « ton avis sur … », « je ne sais pas comment organiser … », « comment tu ferais … » ou hésite sur une mise en page, une navigation ou un parcours. Rend une recommandation argumentée et une alternative, sans rien coder avant son choix.
---

# Avis produit

Jules veut un regard de product designer, pas une liste d'idées. Le travail se fait
avant de dessiner : comprendre la tâche, compter ce que l'écran impose, aligner la
structure sur la façon dont la personne pense. Une bonne réponse enlève plus qu'elle
n'ajoute.

## 1. Situer la page

- La page vient de l'argument, du fichier ouvert dans l'éditeur, d'une capture ou de
  la conversation. Si rien ne la désigne, demander laquelle, en une question.
- Lire le composant de la page et ceux qu'il assemble (barres, panneaux, fiches).
- Lire dans `docs/design-system.md` les motifs qui s'appliquent et les décisions
  datées sur cette page : ne jamais reproposer ce que Jules a déjà tranché.
- Lire `docs/etat-plateforme.md` : qui utilise la page, et à quel point.
- Savoir pour qui est la page : équipe Klocka, mandataire K Partners, client.

## 2. Raisonner (dans cet ordre)

1. **La question de la personne.** Ce qu'elle vient chercher en ouvrant la page, en
   une phrase (« qui j'appelle ? »). Tout ce qui n'y répond pas est du bruit ou va
   ailleurs.
2. **Ce que l'écran impose.** Compter les notions à comprendre avant d'agir :
   niveaux d'onglets, bascules, pastilles, mots. Repérer les doublons (la même
   information à deux endroits) et les séparations qui viennent du code ou de
   l'ordre de construction, pas de la tête de l'utilisateur.
3. **Le modèle mental.** Comment la personne décrit son travail avec ses mots.
   Des choses qu'elle met au même niveau doivent être au même niveau à l'écran.
4. **Retirer d'abord.** Pour chaque élément : si je l'enlève, qu'est-ce qui manque
   vraiment ? Un mot que toute la page dit déjà (« Prospecter » sur une page de
   prospection) est vide.
5. **L'ordre du travail.** Ordonner les choix comme le parcours réel (chercher,
   élargir, appeler), pour que l'ordre raconte l'histoire.
6. **Chaque outil à sa place.** Un outil n'apparaît que là où il sert, sur une même
   ligne de commandes dont le contenu change avec la vue.
7. **Le motif existant.** Reprendre un motif du design system plutôt qu'en inventer
   un ; le nommer.

## 3. Répondre

En français, court, sans emojis ni tirets cadratins, dans cet ordre :

- **Le problème**, en deux ou trois phrases : ce qui coûte à la personne, et pourquoi.
- **Ma recommandation** : une seule, concrète (où va quoi, quels mots, ce qui
  disparaît). Un petit schéma en texte si la disposition compte.
- **Ce qu'on enlève** : la liste courte de ce qui disparaît ou fusionne.
- **L'alternative** : une autre voie crédible, et son prix.
- **Ce qui reste à trancher**, s'il y a lieu : une question, pas plus.

Ne rien coder avant que Jules ait choisi. Une fois le choix fait : appliquer, puis
ajouter la décision datée dans `docs/design-system.md` (règle du dépôt).

## Pièges

- Proposer un ajout (menu, bouton, titre) quand le vrai problème est une hiérarchie
  fausse.
- Donner cinq idées au lieu d'une recommandation.
- Juger sur le code seul sans regarder ce que la page affiche (capture, rendu).
- Oublier le téléphone : chaque recommandation dit ce qu'elle devient à 390 px.
