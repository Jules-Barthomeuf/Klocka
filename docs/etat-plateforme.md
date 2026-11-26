# État de la plateforme

Écrit le 26/11/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

5 personnes, 4 836 pages ouvertes, 0 demandes à l'assistant, 30 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 3 627 | 0 | 28 | 26/11/2026 |
| admin.stress@test.local (équipe) | 911 | 0 | 2 | 26/11/2026 |
| test.mandataire@kpartners.fr | 154 | 0 | 0 | 14/11/2026 |
| admin@klocka.local (équipe) | 139 | 0 | 0 | 18/11/2026 |
| jules.btmf@gmail.com (équipe) | 5 | 0 | 0 | 08/11/2026 |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **Analyse** — 1 032 (21 %)
- **MandataireBiens** — 775 (16 %)
- **Dashboard** — 532 (11 %)
- **CrmTwenty** — 459 (9 %)
- **AdminProjets** — 356 (7 %)
- **Prospection** — 350 (7 %)
- **ProjetDetail** — 159 (3 %)
- **Personnalisation** — 132 (3 %)
- **MandataireProspection** — 129 (3 %)
- **Home** — 87 (2 %)
- **Statistiques** — 67 (1 %)
- **SimulateurRentabilite** — 66 (1 %)
- Le reste, sous 1 % : MandatsMandataires, Outils, KVacance, Monitoring, PlancheAnalyse, MandataireTableauDeBord, AdminUtilisateurs, KData, MandataireClients, KPatrimoine, AdminModeles, MandataireDocuments, Emailing, PlancheVerre, Offres, AdminPresentations, AdminSuggestions, Cerveau, SuiviActivite, SuiviAppels, KTransactions, KZoning, public, PlancheVacance, MemoireKlocka, PlancheChronologie, KExpertise, SimulateurPublic, AdminBanque, KProspective, Tokimo, KFoncier, MandataireProjets, AccesPages, PlancheMarche, KEstimation, MandataireDossier, AdminClients, AdminMandataires, AdminAccesCrm, tokimo, Semaine, MandataireMarche, MandataireEstimation, PlancheLocataire, ValeurLocative, SuiviAudience, DepotVendeur, PlancheApresAppel, MandataireMandat, PlancheProjets, Agents, Automatismes, SuiviReunion, PlancheCarte, MandataireOffMarket, SuiviCorrections, SignerBon, klocka.immo, SuiviMandataires, MesProjets, AdminEquipe, Feedback, NotreOffre

## Ce que l'IA coûte

465,01 € sur la période, 5 498 appels, 231 049 k jetons. 94 % part en tâche de fond, sans que personne clique. 4 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Non attribué (fond) | 0,09 € par appel | 2 441 | 429,49 € | — |
| Demander quelque chose à l'assistant (mandataire) | 0,03 € par demande | 338 | 12,00 € | 16 s |
| Lire le site d'une agence (et le trouver s'il manque) | 0,0061 € par agence | 894 | 6,23 € | 4 s |
| Trier ce qu’on colle dans la boîte | 0,12 € par dépôt | 33 | 3,19 € | 17 s |
| Lire une pièce rangée | 0,06 € par pièce | 23 | 1,46 € | 33 s |
| Ranger une note sur les fiches | 0,02 € par note | 66 | 1,29 € | 6 s |
| Extraire un document déposé | 0,02 € par document | 6 | 0,23 € | 17 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Lire un enregistrement (rendez-vous, appel) | 0,02 € par lecture | 10 | 0,21 € | 5 s |
| Résumer une agence avant l'appel | 0,0012 € par agence | 165 | 0,20 € | 2 s |
| Faire le point de marché (fond) | 0,09 € par ville | 2 | 0,17 € | 1 min |
| Parler à l'assistant après un appel | 0,0076 € par demande | 19 | 0,15 € | 2 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : GET /api/prospection/agents/:id/page (4,14 €) · pages équipe (1,66 €) · POST /api/prospection/mode-appel/pre-lecture (1,17 €) · POST /api/prospection/mode-appel/issue (1,06 €) · lire le passage sur Street View (0,55 €) · fil dossier (0,32 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour l'Assistant Klocka** (une décision) — la veille et les tâches de l'Assistant Klocka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de l'Assistant Klocka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

33 demandes, 3.47 € en tout soit 0.105 € la demande.

30 actions : 19 réussies, 0 questions posées (il manquait une information), 0 doublons évités, 11 vraiment ratées.
Les ratées, à corriger : noter_appel ×5 · chercher_photos_projet ×2 · data_b ×1 · prix_murs_equimmox ×1 · loyers_equimmox ×1 · analyser_fiche ×1.
Repris par l'équipe : 2 corrections (« non, pas ça »), 0 compliment, soit 6.1 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : noter_appel ×9 · chercher_photos_projet ×4 · corriger_transfert ×3 · noter_bien ×2 · donnees_commune ×2 · modifier_projet ×2 · rediger_loi ×1 · ajouter_prospect ×1.
Pour qui : Jules 28 · Admin 2.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 21 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à l'assistant (mandataire) » à 0,03 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 94 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

