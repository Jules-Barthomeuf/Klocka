# État de la plateforme

Écrit le 29/10/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

9 personnes, 2 887 pages ouvertes, 0 demandes à l'assistant, 98 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 2 552 | 0 | 53 | 29/10/2026 |
| admin.stress@test.local (équipe) | 159 | 0 | 0 | 27/10/2026 |
| test.mandataire@kpartners.fr | 150 | 0 | 0 | 27/10/2026 |
| test.mandataire2@kpartners.fr | 16 | 0 | 0 | 03/10/2026 |
| admin@klocka.local (équipe) | 10 | 0 | 0 | 26/10/2026 |
| sourcing@klocka.immo | 0 | 0 | 1 | — |
| jules.b@klocka.immo (AK dans l'application) | 0 | 0 | 36 | — |
| admin.stress@test.local (AK dans l'application) | 0 | 0 | 4 | — |
| coralie.g@klocka.immo (AK dans l'application) | 0 | 0 | 4 | — |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **Analyse** — 361 (13 %)
- **MandataireBiens** — 357 (12 %)
- **Dashboard** — 355 (12 %)
- **MandataireProspection** — 239 (8 %)
- **Personnalisation** — 207 (7 %)
- **Prospection** — 180 (6 %)
- **Emailing** — 140 (5 %)
- **AdminProjets** — 109 (4 %)
- **MandataireEstimation** — 79 (3 %)
- **MandataireDossier** — 76 (3 %)
- **Outils** — 71 (2 %)
- **AdminPresentations** — 60 (2 %)
- Le reste, sous 2 % : Cerveau, Offres, MandataireMandat, AdminMandataires, Home, Monitoring, OffMarket, ConversationsMandataires, Relances, MandataireClients, MandataireOffMarket, AdminClients, MesPresentations, MandatsMandataires, SuiviAppels, SimulateurRentabilite, AdminUtilisateurs, ProjetDetail, Semaine, ALXAtelier, MandataireProjets, Agents, KData, Validations, MandataireMarche, Vision, AdminModeles, SuiviMandataires, SuiviAudience, KZoning, MesProjets, SimulateurPublic, DepotVendeur, Automatismes, CoutsIA, AdminEquipe, ALX, AdminBanque, KProspective, SuiviReunion, SuiviTesteur, FeuilleDeRoute, KFoncier, SuiviChat, Ressources, Haka, SuiviHaka, AdminValidations, FichesCommerciales, AdminModeleZone, VisionRetraite, QuizInvestisseur, AdminSuggestions, Feedback

## Ce que l'IA coûte

33,65 € sur la période, 1 412 appels, 8 008 k jetons. 35 % part en tâche de fond, sans que personne clique. 57 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Trier ce qu’on colle dans la boîte | 0,07 € par dépôt | 88 | 10,69 € | 25 s |
| Non attribué (fond) | 0,01 € par appel | 602 | 10,04 € | — |
| Demander quelque chose à l'assistant (mandataire) | 0,02 € par demande | 148 | 3,63 € | 24 s |
| Faire le récap du matin | 0,17 € par récap | 14 | 2,38 € | 5 min |
| Lire une pièce du dossier | 0,06 € par document | 27 | 1,71 € | 37 s |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Retrouver l’annonce en ligne (fond) | 0,17 € par bien | 4 | 1,20 € | 1 min |
| Extraire un document déposé | 0,02 € par document | 7 | 0,28 € | 20 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Mettre en forme une grille | 0,0037 € par grille | 9 | 0,07 € | 4 s |
| Analyser une fiche commerciale | 0,0088 € par fiche | 7 | 0,05 € | 4 s |
| Écrire un résumé de retour ou de passation | 0,03 € par résumé | 1 | 0,03 € | 21 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/issue (0,70 €) · relecture de préz (0,48 €) · POST /api/prospection/mode-appel/pre-lecture (0,23 €) · cerveau (0,19 €) · fil dossier (0,11 €) · POST /api/prospection/rappels/:id/analyser (0,07 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour Haka** (une décision) — la veille et les tâches de Haka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de Haka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

79 demandes, 11.61 € en tout soit 0.147 € la demande.

98 actions : 85 réussies, 3 questions posées (il manquait une information), 0 doublons évités, 10 vraiment ratées.
Les ratées, à corriger : data_b ×2 · loyers_equimmox ×2 · prix_murs_equimmox ×1 · analyser_fiche ×1 · lire_presentation ×1 · lancer_design ×1 · bloquer_rdv ×1 · modifier_dossier ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 1 compliment, soit 1.3 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : modifier_presentation ×18 · data_b ×12 · donnees_commune ×11 · loyers_equimmox ×7 · modifier_dossier ×6 · rediger_loi ×5 · modifier_projet ×4 · prix_murs_equimmox ×3.
Pour qui : Jules 89 · Admin 4 · Coralie 4 · Sourcing 1.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 13 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « trier ce qu’on colle dans la boîte » à 0,07 € par dépôt : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 35 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

