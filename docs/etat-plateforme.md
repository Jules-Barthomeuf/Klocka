# État de la plateforme

Écrit le 16/11/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

5 personnes, 4 156 pages ouvertes, 0 demandes à l'assistant, 18 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 3 530 | 0 | 18 | 16/11/2026 |
| admin.stress@test.local (équipe) | 372 | 0 | 0 | 15/11/2026 |
| test.mandataire@kpartners.fr | 182 | 0 | 0 | 14/11/2026 |
| admin@klocka.local (équipe) | 67 | 0 | 0 | 16/11/2026 |
| jules.btmf@gmail.com (équipe) | 5 | 0 | 0 | 08/11/2026 |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **MandataireBiens** — 1 019 (25 %)
- **Analyse** — 809 (19 %)
- **Dashboard** — 348 (8 %)
- **CrmTwenty** — 300 (7 %)
- **Prospection** — 251 (6 %)
- **MandataireProspection** — 246 (6 %)
- **AdminProjets** — 197 (5 %)
- **Personnalisation** — 172 (4 %)
- **MandatsMandataires** — 66 (2 %)
- **SimulateurRentabilite** — 51 (1 %)
- **AdminUtilisateurs** — 46 (1 %)
- **Monitoring** — 40 (1 %)
- Le reste, sous 1 % : KVacance, Cerveau, PlancheAnalyse, MandataireClients, MandataireTableauDeBord, KData, Outils, Home, AdminModeles, Offres, MandataireDocuments, Emailing, ProjetDetail, PlancheVerre, AdminClients, SuiviAppels, KZoning, SuiviActivite, MandataireDossier, KTransactions, public, SimulateurPublic, KProspective, AdminSuggestions, MandataireProjets, KExpertise, Tokimo, Semaine, MandataireEstimation, AccesPages, PlancheMarche, KEstimation, KFoncier, SuiviAudience, Automatismes, AdminPresentations, MandataireOffMarket, AdminMandataires, AdminAccesCrm, tokimo, MandataireMarche, PlancheVacance, PlancheLocataire, ValeurLocative, Agents, DepotVendeur, PlancheApresAppel, MandataireMandat, PlancheProjets, SuiviMandataires, MesProjets, AdminBanque, SuiviReunion, SuiviCorrections, SignerBon, klocka.immo, AdminEquipe, MemoireKlocka, Feedback, NotreOffre, SuiviChat, Ressources, MesPresentations, Haka, SuiviHaka

## Ce que l'IA coûte

26,88 € sur la période, 1 815 appels, 7 775 k jetons. 21 % part en tâche de fond, sans que personne clique. 58 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Demander quelque chose à l'assistant (mandataire) | 0,03 € par demande | 372 | 12,91 € | 18 s |
| Non attribué (fond) | 0,0075 € par appel | 135 | 4,42 € | — |
| Trier ce qu’on colle dans la boîte | 0,11 € par dépôt | 19 | 2,08 € | 29 s |
| Lire une pièce rangée | 0,07 € par pièce | 19 | 1,34 € | 37 s |
| Extraire un document déposé | 0,02 € par document | 7 | 0,28 € | 20 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Faire le point de marché (fond) | 0,09 € par ville | 2 | 0,17 € | 1 min |
| Analyser une fiche commerciale | 0,0090 € par fiche | 13 | 0,12 € | 11 s |
| Parler à l'assistant après un appel | 0,0075 € par demande | 14 | 0,11 € | 2 s |
| Trouver les zones commerçantes d'une ville | 0,0080 € par ville | 13 | 0,10 € | 7 s |
| Lire une fiche pour la Mémoire (fond) | 0,01 € par fiche | 4 | 0,07 € | 8 s |
| Le retour d'AK sur un appel | 0,0094 € par demande | 6 | 0,06 € | 11 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : pages équipe (1,66 €) · POST /api/prospection/mode-appel/pre-lecture (1,04 €) · POST /api/prospection/mode-appel/issue (0,91 €) · lire le passage sur Street View (0,53 €) · fil dossier (0,39 €) · cerveau (0,19 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour l'Assistant Klocka** (une décision) — la veille et les tâches de l'Assistant Klocka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de l'Assistant Klocka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

19 demandes, 2.26 € en tout soit 0.119 € la demande.

18 actions : 10 réussies, 0 questions posées (il manquait une information), 0 doublons évités, 8 vraiment ratées.
Les ratées, à corriger : chercher_photos_projet ×2 · loyers_equimmox ×2 · data_b ×1 · prix_murs_equimmox ×1 · analyser_fiche ×1 · lire_presentation ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 1 compliment, soit 5.3 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : chercher_photos_projet ×4 · data_b ×4 · donnees_commune ×2 · modifier_projet ×2 · prix_murs_equimmox ×2 · loyers_equimmox ×2 · analyser_fiche ×1 · lire_presentation ×1.
Pour qui : Jules 18.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **MandataireBiens** : 25 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à l'assistant (mandataire) » à 0,03 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 21 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

