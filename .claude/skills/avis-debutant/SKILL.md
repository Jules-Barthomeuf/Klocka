---
name: avis-debutant
description: Avis d'un débutant sur une page ou un écran de Klocka. Quelqu'un qui découvre la page et ne connaît rien à l'immobilier commercial (ni bail, ni murs, ni rendement, ni Data Room) essaie de la comprendre à voix haute, pas à pas, et dit où il bloque. À utiliser quand Jules demande « l'avis d'un débutant », « est-ce que c'est clair », « un nouveau comprendrait ? », « teste la page comme quelqu'un qui n'y connaît rien », ou /avis-debutant. Rend le parcours de compréhension, les blocages classés et les corrections de mots ou d'ordre, sans rien coder avant le choix de Jules.
---

# Avis d'un débutant

Jules veut savoir si une page se comprend sans lui. Le débutant joue une personne
réelle : intelligente, de bonne volonté, à l'aise avec un ordinateur, mais qui ne
connaît **rien** à l'immobilier commercial ni à Klocka. Elle arrive sur la page sans
qu'on lui explique quoi que ce soit, et raconte ce qu'elle comprend, ce qu'elle
devine et où elle s'arrête.

Le but n'est pas de simplifier le métier pour tout le monde : c'est de trouver ce qui
bloque inutilement (un mot interne, un ordre illogique, un geste invisible), et de
séparer ce qui demande vraiment d'apprendre le métier de ce que l'écran rend obscur.

## 1. Situer la page

- La page vient de l'argument, du fichier ouvert dans l'éditeur, d'une capture ou de
  la conversation. Si rien ne la désigne, demander laquelle, en une question.
- Lire le composant de la page et ceux qu'il assemble, pour savoir **ce qui s'affiche
  vraiment** : les mots exacts des titres, boutons, colonnes, onglets, pastilles,
  messages vides. Ne juger que ce qu'un œil verrait, pas le code.
- Savoir pour qui est la page (équipe Klocka, mandataire K Partners, client) : le
  débutant prend la place d'un **nouveau venu de ce public-là**, son premier jour.
- Lire dans `docs/design-system.md` les décisions datées sur cette page : ne jamais
  reproposer ce que Jules a déjà tranché ; le dire si un blocage vient d'une décision
  prise (« c'est voulu, mais ça bloque ici »).

## 2. Jouer le débutant (dans cet ordre)

Le débutant pense à voix haute, à la première personne, en phrases courtes. Il ne
connaît que le français courant. Il ne triche pas : il n'utilise aucun savoir de
Klocka ni du métier.

1. **Le premier coup d'œil (cinq secondes).** « Je suis où ? Cette page sert à quoi ? »
   Ce qu'il croit, même faux. Ce qui attire son regard en premier.
2. **Ce qu'il croit devoir faire.** Le geste qu'il essaierait en premier, et pourquoi.
   S'il ne voit aucun geste évident, il le dit.
3. **La lecture, de haut en bas.** Pour chaque élément visible (titre, onglet, colonne,
   bouton, pastille, couleur, icône) : ce qu'il comprend, ce qu'il devine, ce qu'il
   ne comprend pas. Chaque mot du métier ou de Klocka qu'il ne connaît pas est noté
   tel quel, entre guillemets (« Data Room », « réversion », « Lu par l'IA », « FAI »).
4. **Les icônes et les couleurs.** Ce qu'il imagine qu'une icône seule fait, avant de
   cliquer. Ce qu'une couleur lui dit (vert = bien ? orange = danger ?), et si c'est
   juste.
5. **Un essai de tâche.** Lui donner la tâche la plus courante de la page, en mots
   simples (« vérifie le loyer du bail », « ajoute un document reçu »), et le laisser
   chercher comment faire. Noter chaque hésitation et chaque mauvais clic.
6. **Ce qu'il retient.** En une phrase, ce qu'il expliquerait à un ami sur cette page.
   Si la phrase est fausse, c'est le premier problème.

## 3. Trier les blocages

Chaque blocage va dans une seule de ces trois familles :

- **Le métier** : il faut apprendre une notion qui existe vraiment (un bail, un
  rendement, un dépôt de garantie). L'écran n'y peut rien, sauf peut-être une phrase
  d'aide au survol.
- **L'écran** : le mot est interne à Klocka ou au code, l'ordre ne suit pas le travail,
  un geste est caché, deux choses portent le même nom, ou une même chose deux noms.
  C'est ici qu'on gagne.
- **Le premier pas** : rien ne dit par où commencer, ou l'état vide ne dit pas quoi
  faire.

Classer les blocages de l'écran et du premier pas du plus coûteux au moins coûteux :
celui qui empêche de faire la tâche passe avant celui qui fait seulement hésiter.

## 4. Répondre

En français, très clair, sans jargon, sans emojis ni tirets cadratins, dans cet
ordre :

- **Ce que le débutant a compris**, en deux ou trois phrases à la première personne,
  ses mots à lui (même s'ils sont faux).
- **Son parcours**, court : premier coup d'œil, premier geste tenté, l'essai de tâche
  (réussi ou non, et où il a calé).
- **Les blocages**, classés : pour chacun, ce qu'il voit, ce qu'il a cru, la famille
  (métier, écran, premier pas).
- **Les mots qu'il ne connaît pas** : la liste, avec pour chacun « à garder (métier) »
  ou « à remplacer par … » (proposer le mot simple).
- **Ma recommandation** : les deux ou trois corrections qui lèveraient le plus de
  blocages, concrètes (quel mot, quel ordre, quel message vide), et ce qu'elles
  deviennent au téléphone.
- **Ce qui reste à trancher**, s'il y a lieu : une question, pas plus.

Ne rien coder avant que Jules ait choisi. Une fois le choix fait : appliquer, puis
ajouter la décision datée dans `docs/design-system.md` (règle du dépôt).

## Pièges

- Jouer un faux débutant qui devine tout grâce au code ou à la conversation.
- Confondre « je ne connais pas ce mot du métier » et « l'écran est mal fait » : le
  premier ne se corrige pas en changeant l'écran.
- Proposer d'ajouter des explications partout au lieu de corriger le mot ou l'ordre.
- Donner dix blocages de même poids : classer, et ne garder que ceux qui comptent.
- Juger un écran qu'on n'a pas lu : citer les mots exacts qui s'affichent.
- Oublier l'état vide (aucune pièce, rien de lu) : c'est souvent là que le débutant
  arrive en premier.
