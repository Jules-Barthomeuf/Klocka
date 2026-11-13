# État de la plateforme

Écrit le 13/11/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

5 personnes, 3 816 pages ouvertes, 0 demandes à l'assistant, 20 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 3 378 | 0 | 20 | 12/11/2026 |
| admin.stress@test.local (équipe) | 301 | 0 | 0 | 12/11/2026 |
| test.mandataire@kpartners.fr | 130 | 0 | 0 | 12/11/2026 |
| jules.btmf@gmail.com (équipe) | 5 | 0 | 0 | 08/11/2026 |
| admin@klocka.local (équipe) | 2 | 0 | 0 | 26/10/2026 |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **MandataireBiens** — 1 011 (26 %)
- **Analyse** — 646 (17 %)
- **Dashboard** — 345 (9 %)
- **CrmTwenty** — 275 (7 %)
- **MandataireProspection** — 243 (6 %)
- **Personnalisation** — 166 (4 %)
- **Prospection** — 142 (4 %)
- **AdminProjets** — 129 (3 %)
- **Outils** — 72 (2 %)
- **MandatsMandataires** — 66 (2 %)
- **Cerveau** — 60 (2 %)
- **AdminUtilisateurs** — 46 (1 %)
- Le reste, sous 1 % : Monitoring, KVacance, SimulateurRentabilite, PlancheAnalyse, KData, MandataireClients, Home, MandataireTableauDeBord, Offres, AdminClients, AdminPresentations, PlancheVerre, AdminModeles, SuiviAppels, Emailing, MandataireDocuments, KZoning, SuiviActivite, Semaine, KTransactions, Agents, public, MandataireDossier, SimulateurPublic, KProspective, SuiviAudience, MesPresentations, KExpertise, Tokimo, PlancheMarche, KEstimation, KFoncier, Automatismes, AdminSuggestions, Validations, ProjetDetail, AdminMandataires, AdminAccesCrm, tokimo, MesProjets, MandataireProjets, Relances, PlancheLocataire, ValeurLocative, DepotVendeur, MandataireOffMarket, SuiviMandataires, AdminEquipe, AdminBanque, MandataireEstimation, SuiviReunion, CoutsIA, SignerBon, klocka.immo, MemoireKlocka, Feedback, NotreOffre, SuiviChat, Ressources, Haka, SuiviHaka, SuiviTesteur, AdminValidations, FichesCommerciales

## Ce que l'IA coûte

22,21 € sur la période, 1 284 appels, 4 777 k jetons. 12 % part en tâche de fond, sans que personne clique. 71 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Demander quelque chose à l'assistant (mandataire) | 0,03 € par demande | 372 | 12,91 € | 18 s |
| Trier ce qu’on colle dans la boîte | 0,11 € par dépôt | 20 | 2,25 € | 28 s |
| Non attribué (fond) | 0,0091 € par appel | 85 | 2,13 € | — |
| Lire une pièce rangée | 0,07 € par pièce | 19 | 1,34 € | 37 s |
| Faire le récap du matin | 0,14 € par récap | 3 | 0,42 € | 28 s |
| Extraire un document déposé | 0,02 € par document | 7 | 0,28 € | 20 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Faire le point de marché (fond) | 0,09 € par ville | 2 | 0,17 € | 1 min |
| Analyser une fiche commerciale | 0,0090 € par fiche | 13 | 0,12 € | 11 s |
| Parler à l'assistant après un appel | 0,0075 € par demande | 14 | 0,11 € | 2 s |
| Trouver les zones commerçantes d'une ville | 0,0079 € par ville | 12 | 0,09 € | 7 s |
| Lire une fiche pour la Mémoire (fond) | 0,01 € par fiche | 4 | 0,07 € | 8 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/pre-lecture (0,51 €) · POST /api/prospection/mode-appel/issue (0,50 €) · fil dossier (0,41 €) · cerveau (0,37 €) · note de l'IA d'un outil (0,07 €) · POST /api/prospection/rappels/:id/analyser (0,06 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour l'Assistant Klocka** (une décision) — la veille et les tâches de l'Assistant Klocka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de l'Assistant Klocka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

20 demandes, 2.45 € en tout soit 0.123 € la demande.

20 actions : 14 réussies, 0 questions posées (il manquait une information), 0 doublons évités, 6 vraiment ratées.
Les ratées, à corriger : loyers_equimmox ×2 · data_b ×1 · prix_murs_equimmox ×1 · analyser_fiche ×1 · lire_presentation ×1.
Repris par l'équipe : 0 correction (« non, pas ça »), 1 compliment, soit 0 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : data_b ×6 · modifier_projet ×4 · donnees_commune ×2 · prix_murs_equimmox ×2 · loyers_equimmox ×2 · lire_presentation ×2 · analyser_fiche ×1 · modifier_presentation ×1.
Pour qui : Jules 20.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **MandataireBiens** : 26 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à l'assistant (mandataire) » à 0,03 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 12 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

