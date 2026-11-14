# État de la plateforme

Écrit le 14/11/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

5 personnes, 3 963 pages ouvertes, 0 demandes à l'assistant, 20 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 3 503 | 0 | 20 | 14/11/2026 |
| admin.stress@test.local (équipe) | 323 | 0 | 0 | 14/11/2026 |
| test.mandataire@kpartners.fr | 130 | 0 | 0 | 12/11/2026 |
| jules.btmf@gmail.com (équipe) | 5 | 0 | 0 | 08/11/2026 |
| admin@klocka.local (équipe) | 2 | 0 | 0 | 26/10/2026 |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **MandataireBiens** — 1 011 (26 %)
- **Analyse** — 747 (19 %)
- **Dashboard** — 352 (9 %)
- **CrmTwenty** — 286 (7 %)
- **MandataireProspection** — 243 (6 %)
- **AdminProjets** — 179 (5 %)
- **Personnalisation** — 174 (4 %)
- **Prospection** — 141 (4 %)
- **MandatsMandataires** — 66 (2 %)
- **Cerveau** — 47 (1 %)
- **SimulateurRentabilite** — 46 (1 %)
- **Monitoring** — 46 (1 %)
- Le reste, sous 1 % : AdminUtilisateurs, KVacance, PlancheAnalyse, KData, Outils, Home, MandataireClients, MandataireTableauDeBord, AdminModeles, Offres, AdminClients, ProjetDetail, Emailing, PlancheVerre, SuiviAppels, MandataireDocuments, KZoning, SuiviActivite, Semaine, KTransactions, Agents, public, MandataireDossier, SimulateurPublic, KProspective, SuiviAudience, MesPresentations, KExpertise, Tokimo, AccesPages, PlancheMarche, KEstimation, KFoncier, Automatismes, AdminSuggestions, AdminPresentations, AdminMandataires, AdminAccesCrm, tokimo, MesProjets, MandataireProjets, Relances, PlancheVacance, PlancheLocataire, ValeurLocative, DepotVendeur, MandataireOffMarket, PlancheProjets, SuiviMandataires, AdminEquipe, AdminBanque, MandataireEstimation, SuiviReunion, CoutsIA, SuiviCorrections, SignerBon, klocka.immo, MemoireKlocka, Feedback, NotreOffre, SuiviChat, Ressources, Haka, SuiviHaka, SuiviTesteur

## Ce que l'IA coûte

25,32 € sur la période, 1 383 appels, 6 176 k jetons. 24 % part en tâche de fond, sans que personne clique. 64 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Demander quelque chose à l'assistant (mandataire) | 0,03 € par demande | 372 | 12,91 € | 18 s |
| Non attribué (fond) | 0,0088 € par appel | 139 | 5,13 € | — |
| Trier ce qu’on colle dans la boîte | 0,11 € par dépôt | 20 | 2,20 € | 28 s |
| Lire une pièce rangée | 0,07 € par pièce | 19 | 1,34 € | 37 s |
| Extraire un document déposé | 0,02 € par document | 7 | 0,28 € | 20 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Faire le point de marché (fond) | 0,09 € par ville | 2 | 0,17 € | 1 min |
| Faire le récap du matin | 0,13 € par récap | 1 | 0,13 € | 24 s |
| Analyser une fiche commerciale | 0,0090 € par fiche | 13 | 0,12 € | 11 s |
| Parler à l'assistant après un appel | 0,0075 € par demande | 14 | 0,11 € | 2 s |
| Trouver les zones commerçantes d'une ville | 0,0080 € par ville | 13 | 0,10 € | 7 s |
| Lire une fiche pour la Mémoire (fond) | 0,01 € par fiche | 4 | 0,07 € | 8 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : lire le passage sur Street View (0,53 €) · POST /api/prospection/mode-appel/pre-lecture (0,50 €) · POST /api/prospection/mode-appel/issue (0,49 €) · fil dossier (0,41 €) · cerveau (0,29 €) · note de l'IA d'un outil (0,07 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour l'Assistant Klocka** (une décision) — la veille et les tâches de l'Assistant Klocka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de l'Assistant Klocka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

20 demandes, 2.39 € en tout soit 0.12 € la demande.

20 actions : 12 réussies, 0 questions posées (il manquait une information), 0 doublons évités, 8 vraiment ratées.
Les ratées, à corriger : chercher_photos_projet ×2 · loyers_equimmox ×2 · data_b ×1 · prix_murs_equimmox ×1 · analyser_fiche ×1 · lire_presentation ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 1 compliment, soit 5 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : data_b ×6 · chercher_photos_projet ×4 · donnees_commune ×2 · modifier_projet ×2 · prix_murs_equimmox ×2 · loyers_equimmox ×2 · analyser_fiche ×1 · lire_presentation ×1.
Pour qui : Jules 20.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **MandataireBiens** : 26 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à l'assistant (mandataire) » à 0,03 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 24 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

