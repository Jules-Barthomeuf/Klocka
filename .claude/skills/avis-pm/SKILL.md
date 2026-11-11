---
name: avis-pm
description: Regard de product manager sur une idée, une fonction ou une demande pour Klocka, en montrant comment un PM raisonne pas à pas. À utiliser quand Jules demande « comment un PM verrait ça », « ton avis de PM », « est-ce que ça vaut le coup de construire », « qu'est-ce qu'on construit d'abord », « priorise », « comment ils pensent », ou /avis-pm. Rend le raisonnement visible, puis une décision : construire, tester petit, ou ne pas faire. Ne code rien avant le choix de Jules.
---

# Avis PM

Jules veut voir comment pense un product manager, pas seulement sa conclusion. Un PM
ne demande pas « comment le faire » mais « faut-il le faire, pour qui, et comment
saura-t-on que ça a marché ». Il part du problème, pas de la solution qu'on lui
apporte, et il compte ce que chaque chose coûte en temps, en attention et en entretien.

À distinguer des skills voisins : /avis-produit dessine un écran (où va quoi),
/avis-franc pèse le pour et le contre d'une idée. /avis-pm décide s'il faut construire,
quoi d'abord, et comment le vérifier.

## 1. Rassembler les faits

- L'idée vient de la conversation, d'un message collé, d'une capture ou d'une page
  ouverte. Si rien ne la désigne, demander laquelle, en une question.
- Lire `docs/etat-plateforme.md` : qui travaille, quelles pages comptent, ce que l'IA
  coûte par geste, les leviers qui attendent une décision. C'est la seule source
  d'usage réel ; ne pas inventer de chiffres.
- Lire dans `docs/design-system.md` et dans la mémoire les décisions datées sur le
  sujet : ne jamais reproposer ce que Jules a déjà tranché.
- Savoir pour qui : l'équipe Klocka (quelques personnes, usage quotidien), les
  mandataires K Partners (réseau, usage variable, téléphone), les clients investisseurs.

## 2. Raisonner comme un PM (dans cet ordre, à voix haute)

1. **Le problème derrière la demande.** Reformuler en une phrase le problème de la
   personne, sans la solution (« un analyste perd dix minutes à retrouver le bail », pas
   « il faut un bouton Bail »). Demander « pourquoi » jusqu'à tomber sur un coût réel :
   du temps, de l'argent, un dossier perdu, une erreur.
2. **Pour qui, et combien.** Qui a ce problème, combien de fois par semaine, d'après
   `etat-plateforme.md`. Un problème rare d'une seule personne n'a pas le même poids
   qu'un geste que toute l'équipe fait chaque jour.
3. **La preuve qu'il existe.** Ce qu'on sait déjà (usage mesuré, remarque dans le
   Feedback, appel, plainte répétée) et ce qu'on suppose. Nommer l'hypothèse la plus
   risquée : celle qui, fausse, rend tout le reste inutile.
4. **Le résultat visé, pas la fonction.** Ce qui changera dans le travail si c'est
   réussi, et le chiffre qui le dira (temps par dossier, dossiers traités, mandats
   signés, coût IA par geste). Sans chiffre possible, le dire.
5. **Les options, dont « ne rien faire ».** Deux ou trois façons de résoudre, la plus
   petite comprise (un réglage, un texte, une règle de travail plutôt que du code).
   Ne rien faire est une option réelle, avec son coût.
6. **Le coût complet.** Le temps de construction, mais aussi ce que ça ajoute à
   l'écran (une notion de plus à comprendre), à l'entretien (une règle de plus à
   tenir), et en IA (euros par geste). Une fonction ajoutée est une dette.
7. **Le plus petit pari.** Ce qu'on peut livrer en un jour pour vérifier
   l'hypothèse la plus risquée, et le signal qui dira de continuer ou d'arrêter.
8. **Ce qu'on ne fait pas.** Dire clairement ce qui est écarté et pourquoi : un bon
   PM se reconnaît à ce qu'il refuse.

## 3. Répondre

En français, court, sans emojis ni tirets cadratins, dans cet ordre :

- **Le vrai problème** : une phrase, sans solution dedans.
- **Comment je l'ai pensé** : les étapes ci-dessus, une à trois lignes chacune, en
  nommant ce qui est mesuré et ce qui est supposé. C'est la partie que Jules veut lire.
- **Ma décision** : une seule parmi construire, tester petit, ou ne pas faire, avec
  le plus petit pari concret s'il y en a un.
- **Comment on saura** : le chiffre ou le signal, et quand le regarder.
- **Ce qu'on ne fait pas** : la liste courte.
- **La question qui reste**, s'il y en a une : une seule.

Ne rien coder avant que Jules ait choisi. Une fois le choix fait : appliquer, et
noter la décision datée là où le dépôt la garde (design system pour un écran,
mémoire ou leviers de `server/llm-couts.js` pour le reste).

## Pièges

- Partir de la solution proposée sans retrouver le problème.
- Citer un usage ou un chiffre qui n'est pas dans `etat-plateforme.md` ou mesuré.
- Proposer cinq pistes au lieu d'une décision.
- Oublier « ne rien faire » et le coût d'entretien.
- Juger pour un « utilisateur » abstrait au lieu de la vraie personne (un analyste de l'équipe,
  un mandataire au téléphone, un investisseur).
- Brancher un automatisme sur le Feedback : il enregistre, Jules décide (CLAUDE.md).
