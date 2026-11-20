# État de la plateforme

Écrit le 20/11/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

5 personnes, 4 275 pages ouvertes, 0 demandes à l'assistant, 16 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 3 499 | 0 | 16 | 20/11/2026 |
| admin.stress@test.local (équipe) | 448 | 0 | 0 | 20/11/2026 |
| test.mandataire@kpartners.fr | 182 | 0 | 0 | 14/11/2026 |
| admin@klocka.local (équipe) | 141 | 0 | 0 | 18/11/2026 |
| jules.btmf@gmail.com (équipe) | 5 | 0 | 0 | 08/11/2026 |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **MandataireBiens** — 1 021 (24 %)
- **Analyse** — 789 (18 %)
- **CrmTwenty** — 408 (10 %)
- **Prospection** — 350 (8 %)
- **Dashboard** — 329 (8 %)
- **MandataireProspection** — 244 (6 %)
- **AdminProjets** — 191 (4 %)
- **Personnalisation** — 127 (3 %)
- **MandatsMandataires** — 66 (2 %)
- **SimulateurRentabilite** — 60 (1 %)
- **Home** — 60 (1 %)
- **Outils** — 41 (1 %)
- Le reste, sous 1 % : KVacance, AdminUtilisateurs, PlancheAnalyse, MandataireTableauDeBord, MandataireClients, KData, Monitoring, Cerveau, AdminModeles, Offres, KPatrimoine, MandataireDocuments, Emailing, PlancheVerre, ProjetDetail, SuiviActivite, MandataireDossier, KTransactions, KZoning, public, AdminSuggestions, KExpertise, SimulateurPublic, AdminClients, SuiviAppels, MandataireProjets, KProspective, Tokimo, KFoncier, MemoireKlocka, MandataireEstimation, AccesPages, PlancheMarche, KEstimation, AdminMandataires, AdminAccesCrm, tokimo, AdminPresentations, Semaine, MandataireMarche, MandataireOffMarket, PlancheVacance, PlancheLocataire, ValeurLocative, SuiviAudience, DepotVendeur, PlancheApresAppel, MandataireMandat, PlancheProjets, Agents, SuiviMandataires, Automatismes, AdminBanque, SuiviCorrections, SignerBon, klocka.immo, MesProjets, AdminEquipe, Feedback, NotreOffre

## Ce que l'IA coûte

459,84 € sur la période, 5 419 appels, 229 011 k jetons. 95 % part en tâche de fond, sans que personne clique. 4 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Non attribué (fond) | 0,09 € par appel | 2 428 | 429,09 € | — |
| Demander quelque chose à l'assistant (mandataire) | 0,03 € par demande | 372 | 12,91 € | 18 s |
| Lire le site d'une agence (et le trouver s'il manque) | 0,0061 € par agence | 894 | 6,23 € | 4 s |
| Trier ce qu’on colle dans la boîte | 0,12 € par dépôt | 19 | 2,22 € | 24 s |
| Lire une pièce rangée | 0,07 € par pièce | 19 | 1,34 € | 37 s |
| Ranger une note sur les fiches | 0,01 € par note | 41 | 0,54 € | 5 s |
| Extraire un document déposé | 0,02 € par document | 6 | 0,23 € | 17 s |
| Proposer le nom d'une pièce | 0,01 € par pièce | 7 | 0,22 € | 6 s |
| Résumer une agence avant l'appel | 0,0012 € par agence | 163 | 0,19 € | 2 s |
| Faire le point de marché (fond) | 0,09 € par ville | 2 | 0,17 € | 1 min |
| Parler à l'assistant après un appel | 0,0076 € par demande | 19 | 0,15 € | 2 s |
| Analyser une fiche commerciale | 0,0091 € par fiche | 14 | 0,14 € | 17 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : pages équipe (1,66 €) · POST /api/prospection/mode-appel/pre-lecture (1,20 €) · POST /api/prospection/mode-appel/issue (1,06 €) · GET /api/prospection/agents/:id/page (0,71 €) · lire le passage sur Street View (0,53 €) · fil dossier (0,39 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour l'Assistant Klocka** (une décision) — la veille et les tâches de l'Assistant Klocka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de l'Assistant Klocka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

19 demandes, 2.41 € en tout soit 0.127 € la demande.

16 actions : 10 réussies, 0 questions posées (il manquait une information), 0 doublons évités, 6 vraiment ratées.
Les ratées, à corriger : chercher_photos_projet ×2 · data_b ×1 · prix_murs_equimmox ×1 · loyers_equimmox ×1 · analyser_fiche ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 0 compliment, soit 5.3 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : chercher_photos_projet ×4 · noter_bien ×2 · donnees_commune ×2 · modifier_projet ×2 · noter_engagement ×1 · noter_appel ×1 · data_b ×1 · prix_murs_equimmox ×1.
Pour qui : Jules 16.

## Ce qu'il faut en retenir

- L'écran de travail, c'est **MandataireBiens** : 24 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à l'assistant (mandataire) » à 0,03 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 95 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

