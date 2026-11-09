# État de la plateforme

Écrit le 09/11/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

7 personnes, 3 323 pages ouvertes, 0 demandes à l'assistant, 56 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 3 094 | 0 | 54 | 09/11/2026 |
| test.mandataire@kpartners.fr | 136 | 0 | 0 | 09/11/2026 |
| admin.stress@test.local (équipe) | 78 | 0 | 0 | 09/11/2026 |
| admin@klocka.local (équipe) | 10 | 0 | 0 | 26/10/2026 |
| jules.btmf@gmail.com (équipe) | 5 | 0 | 0 | 08/11/2026 |
| sourcing@klocka.immo | 0 | 0 | 1 | — |
| jules.b@klocka.immo (AK dans l'application) | 0 | 0 | 1 | — |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **MandataireBiens** — 988 (30 %)
- **Analyse** — 381 (11 %)
- **Dashboard** — 330 (10 %)
- **MandataireProspection** — 237 (7 %)
- **CrmTwenty** — 200 (6 %)
- **Personnalisation** — 168 (5 %)
- **Prospection** — 138 (4 %)
- **AdminProjets** — 110 (3 %)
- **Outils** — 71 (2 %)
- **MandatsMandataires** — 66 (2 %)
- **Cerveau** — 60 (2 %)
- **AdminPresentations** — 60 (2 %)
- Le reste, sous 1 % : AdminUtilisateurs, Monitoring, OffMarket, MandataireOffMarket, Offres, AdminClients, MesPresentations, MandataireClients, MandataireTableauDeBord, SuiviAppels, SimulateurRentabilite, Home, Emailing, MandataireDocuments, SuiviActivite, Semaine, Agents, AdminModeles, Relances, public, MandataireDossier, ProjetDetail, KData, SuiviAudience, Tokimo, AdminMandataires, Automatismes, AdminSuggestions, Validations, AdminAccesCrm, tokimo, MesProjets, AdminEquipe, MandataireProjets, KZoning, DepotVendeur, CoutsIA, SuiviMandataires, AdminBanque, MandataireEstimation, SuiviReunion, SuiviTesteur, SignerBon, klocka.immo, MemoireKlocka, Feedback, NotreOffre, KProspective, KFoncier, SuiviChat, Ressources, Haka, SuiviHaka, AdminValidations, FichesCommerciales, AdminModeleZone, ALX

## Ce que l'IA coûte

33,67 € sur la période, 1 373 appels, 6 610 k jetons. 17 % part en tâche de fond, sans que personne clique. 69 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Demander quelque chose à l'assistant (mandataire) | 0,03 € par demande | 366 | 12,26 € | 18 s |
| Trier ce qu’on colle dans la boîte | 0,20 € par dépôt | 47 | 9,50 € | 38 s |
| Non attribué (fond) | 0,01 € par appel | 148 | 4,95 € | — |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Lire une pièce rangée | 0,07 € par pièce | 19 | 1,34 € | 37 s |
| Faire le récap du matin | 0,14 € par récap | 6 | 0,85 € | 10 min |
| Extraire un document déposé | 0,02 € par document | 7 | 0,28 € | 20 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Faire le point de marché (fond) | 0,09 € par ville | 2 | 0,17 € | 1 min |
| Parler à l'assistant après un appel | 0,0075 € par demande | 14 | 0,11 € | 2 s |
| Trouver les zones commerçantes d'une ville | 0,0066 € par ville | 11 | 0,08 € | 6 s |
| Analyser une fiche commerciale | 0,0089 € par fiche | 8 | 0,08 € | 6 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/pre-lecture (0,56 €) · POST /api/prospection/mode-appel/issue (0,52 €) · relecture de préz (0,48 €) · cerveau (0,37 €) · fil dossier (0,18 €) · POST /api/prospection/rappels/:id/analyser (0,06 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour l'Assistant KPartners** (une décision) — la veille et les tâches de l'Assistant KPartners hors du processus web. Un seul processus Render porte le web, la veille et les tâches de l'Assistant KPartners ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

47 demandes, 10.33 € en tout soit 0.22 € la demande.

56 actions : 49 réussies, 0 questions posées (il manquait une information), 0 doublons évités, 7 vraiment ratées.
Les ratées, à corriger : data_b ×2 · loyers_equimmox ×2 · prix_murs_equimmox ×1 · analyser_fiche ×1 · lire_presentation ×1.
Repris par l'équipe : 0 correction (« non, pas ça »), 1 compliment, soit 0 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : modifier_presentation ×18 · data_b ×11 · loyers_equimmox ×7 · donnees_commune ×6 · modifier_projet ×4 · prix_murs_equimmox ×3 · lire_presentation ×3 · analyser_fiche ×1.
Pour qui : Jules 55 · Sourcing 1.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **MandataireBiens** : 30 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à l'assistant (mandataire) » à 0,03 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 17 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

