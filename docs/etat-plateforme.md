# État de la plateforme

Écrit le 25/10/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

12 personnes, 2 705 pages ouvertes, 0 demandes à l'assistant, 91 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 2 399 | 0 | 46 | 25/10/2026 |
| admin.stress@test.local (équipe) | 140 | 0 | 0 | 11/10/2026 |
| test.mandataire@kpartners.fr | 101 | 0 | 0 | 10/10/2026 |
| alexis.p@klocka.immo (équipe) | 38 | 0 | 0 | 28/09/2026 |
| test.mandataire2@kpartners.fr | 16 | 0 | 0 | 03/10/2026 |
| admin@klocka.local (équipe) | 8 | 0 | 0 | 11/10/2026 |
| maxime.p@klocka.immo | 2 | 0 | 0 | 25/09/2026 |
| client.demo@klocka.local | 1 | 0 | 0 | 28/09/2026 |
| sourcing@klocka.immo | 0 | 0 | 1 | — |
| jules.b@klocka.immo (AK dans l'application) | 0 | 0 | 36 | — |
| admin.stress@test.local (AK dans l'application) | 0 | 0 | 4 | — |
| coralie.g@klocka.immo (AK dans l'application) | 0 | 0 | 4 | — |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **Dashboard** — 366 (14 %)
- **Analyse** — 334 (12 %)
- **Prospection** — 247 (9 %)
- **Personnalisation** — 196 (7 %)
- **AdminProjets** — 174 (6 %)
- **MandataireProspection** — 152 (6 %)
- **Emailing** — 140 (5 %)
- **MandataireEstimation** — 79 (3 %)
- **MandataireDossier** — 76 (3 %)
- **MandataireBiens** — 73 (3 %)
- **Outils** — 71 (3 %)
- **AdminPresentations** — 57 (2 %)
- Le reste, sous 2 % : ProjetDetail, Cerveau, ALX, MandataireMandat, Monitoring, Home, AdminMandataires, OffMarket, ConversationsMandataires, AdminClients, Relances, MandataireOffMarket, SimulateurRentabilite, MandataireClients, MesPresentations, Offres, SuiviAppels, AdminUtilisateurs, FichesCommerciales, Semaine, ALXAtelier, KData, Agents, MesProjets, SimulateurPublic, AdminSuggestions, MonAssistant, KZoning, Validations, MandataireMarche, Vision, SuiviMandataires, SuiviAudience, MandataireProjets, ALXCible, Automatismes, CoutsIA, AdminEquipe, KProspective, SuiviReunion, SuiviTesteur, FeuilleDeRoute, Comparateur, KFoncier, SuiviChat, Ressources, Haka, SuiviHaka, AdminValidations, AdminModeleZone, VisionRetraite, QuizInvestisseur, Feedback, ImportProjets, Banque, MonCompte, KEstimation, AdminPortail, AdminRessources, AdminLeadMagnets

## Ce que l'IA coûte

31,58 € sur la période, 1 311 appels, 8 067 k jetons. 42 % part en tâche de fond, sans que personne clique. 54 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Non attribué (fond) | 0,01 € par appel | 623 | 11,17 € | — |
| Trier ce qu’on colle dans la boîte | 0,07 € par dépôt | 86 | 10,13 € | 23 s |
| Demander quelque chose à l'assistant (mandataire) | 0,01 € par demande | 107 | 2,53 € | 22 s |
| Faire le récap du matin | 0,17 € par récap | 14 | 2,38 € | 5 min |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Retrouver l’annonce en ligne (fond) | 0,17 € par bien | 4 | 1,20 € | 1 min |
| Lire une pièce du dossier | 0,05 € par document | 9 | 0,63 € | 44 s |
| Extraire un document déposé | 0,05 € par document | 1 | 0,05 € | 33 s |
| Mettre en forme une grille | 0,01 € par grille | 4 | 0,05 € | 6 s |
| Analyser un appel de prospection | 0,01 € par appel | 3 | 0,04 € | 16 s |
| Écrire un résumé de retour ou de passation | 0,03 € par résumé | 1 | 0,03 € | 21 s |
| Trouver les zones commerçantes d'une ville | 0,0057 € par ville | 5 | 0,03 € | 6 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/issue (0,70 €) · relecture de préz (0,48 €) · POST /api/prospection/mode-appel/pre-lecture (0,23 €) · cerveau (0,19 €) · fil dossier (0,11 €) · POST /api/prospection/rappels/:id/analyser (0,07 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour Haka** (une décision) — la veille et les tâches de Haka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de Haka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

76 demandes, 10.99 € en tout soit 0.145 € la demande.

91 actions : 82 réussies, 3 questions posées (il manquait une information), 0 doublons évités, 6 vraiment ratées.
Les ratées, à corriger : lire_presentation ×1 · loyers_equimmox ×1 · data_b ×1 · lancer_design ×1 · bloquer_rdv ×1 · modifier_dossier ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 1 compliment, soit 1.3 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : modifier_presentation ×18 · data_b ×11 · donnees_commune ×10 · loyers_equimmox ×6 · modifier_dossier ×6 · rediger_loi ×5 · lire_presentation ×3 · rediger_newsletter ×3.
Pour qui : Jules 82 · Admin 4 · Coralie 4 · Sourcing 1.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Dashboard** : 14 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « trier ce qu’on colle dans la boîte » à 0,07 € par dépôt : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 42 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

