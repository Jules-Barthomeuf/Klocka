# État de la plateforme

Écrit le 15/09/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

0 personnes, 0 pages ouvertes, 0 demandes à l'assistant, 0 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.


## Ce que l'IA coûte

0 € sur la période, 0 appels, 0 k jetons. 0 % part en tâche de fond, sans que personne clique. 0 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **L'espacement de la veille** (un réglage) — quelques centimes par passage. Depuis que les mails écartés sont mémorisés, un passage sans nouveau mail ne coûte rien. Quinze minutes suffiraient probablement, et rien ne serait perdu : un mail reçu à 9 h 02 entrerait à 9 h 15. `Variable MAIL_VEILLE_MINUTES · 5 minutes aujourd'hui`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`
- **Un modèle moins cher sur les gestes mécaniques** (une décision) — à mesurer sur vos dossiers. Mettre en forme une valeur déjà lue, trier un mail, ranger un texte dicté : ces gestes partent déjà à effort minimal. Descendre d'un modèle est le levier suivant, mais un modèle moins cher au jeton n'est pas toujours moins cher par dossier abouti. Cela demande un jeu de dossiers de référence, pas une intuition. `Variable ANTHROPIC_MODEL · claude-opus-5 aujourd'hui`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 0 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- 0 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

