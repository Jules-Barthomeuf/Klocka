# État de la plateforme

Écrit le 19/10/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

16 personnes, 2 696 pages ouvertes, 3 demandes à l'assistant, 138 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 2 228 | 3 | 48 | 19/10/2026 |
| admin.stress@test.local (équipe) | 140 | 0 | 0 | 11/10/2026 |
| jules.btmf@gmail.com (équipe) | 111 | 0 | 0 | 21/09/2026 |
| test.mandataire@kpartners.fr | 101 | 0 | 0 | 10/10/2026 |
| admin@klocka.local (équipe) | 59 | 0 | 0 | 11/10/2026 |
| alexis.p@klocka.immo (équipe) | 38 | 0 | 0 | 28/09/2026 |
| test.mandataire2@kpartners.fr | 16 | 0 | 0 | 03/10/2026 |
| maxime.p@klocka.immo | 2 | 0 | 0 | 25/09/2026 |
| client.demo@klocka.local | 1 | 0 | 0 | 28/09/2026 |
| sourcing@klocka.immo | 0 | 0 | 1 | — |
| jules.b@klocka.immo (AK dans l'application) | 0 | 0 | 36 | — |
| admin.stress@test.local (AK dans l'application) | 0 | 0 | 4 | — |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **Analyse** — 426 (16 %)
- **Dashboard** — 358 (13 %)
- **Prospection** — 208 (8 %)
- **AdminProjets** — 184 (7 %)
- **Personnalisation** — 165 (6 %)
- **Emailing** — 140 (5 %)
- **MandataireProspection** — 102 (4 %)
- **MandataireEstimation** — 77 (3 %)
- **Outils** — 71 (3 %)
- **ProjetDetail** — 69 (3 %)
- **MandataireDossier** — 68 (3 %)
- **AdminPresentations** — 57 (2 %)
- Le reste, sous 2 % : KData, ALX, MandataireMandat, Home, AdminMandataires, OffMarket, ConversationsMandataires, Cerveau, Monitoring, AdminClients, Relances, SimulateurRentabilite, MandataireOffMarket, MandataireClients, MesPresentations, Offres, KVacance, KZoning, FichesCommerciales, AdminSuggestions, Semaine, KFoncier, SuiviAppels, ALXAtelier, SimulateurPublic, KEstimation, Agents, AdminLeadMagnets, MesProjets, MonAssistant, KExpertise, AdminUtilisateurs, KProspective, Validations, MandataireMarche, Vision, FeuilleDeRoute, MandataireProjets, ALXCible, ValeurLocative, Automatismes, SuiviAudience, CoutsIA, AdminEquipe, SuiviMandataires, KTransactions, SuiviReunion, SuiviTesteur, Comparateur, SuiviChat, Ressources, Haka, SuiviHaka, AdminValidations, AdminModeleZone, VisionRetraite, QuizInvestisseur, Feedback, ImportProjets, Banque, MonCompte, AdminPortail, AdminRessources, analyse

## Ce que l'IA coûte

39,16 € sur la période, 1 505 appels, 9 346 k jetons. 38 % part en tâche de fond, sans que personne clique. 54 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Non attribué (fond) | 0,01 € par appel | 627 | 11,56 € | — |
| Trier ce qu’on colle dans la boîte | 0,07 € par dépôt | 86 | 10,18 € | 23 s |
| Demander quelque chose à AK | 0,06 € par demande | 42 | 4,27 € | 14 s |
| Demander quelque chose à l'assistant (mandataire) | 0,01 € par demande | 107 | 2,53 € | 22 s |
| Retrouver l’annonce en ligne (fond) | 0,18 € par bien | 8 | 2,40 € | 1 min |
| Faire le récap du matin | 0,17 € par récap | 14 | 2,38 € | 5 min |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Extraire un document déposé | 0,03 € par document | 12 | 0,88 € | 36 s |
| Lire une pièce du dossier | 0,05 € par document | 9 | 0,63 € | 44 s |
| Demander quelque chose à l'assistant | 0,11 € par demande | 3 | 0,38 € | 12 s |
| Analyser une fiche commerciale | 0,03 € par fiche | 9 | 0,32 € | 12 s |
| Éprouver AK | 0,01 € par essai | 13 | 0,29 € | 8 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/issue (0,64 €) · relecture de préz (0,48 €) · cerveau (0,19 €) · POST /api/prospection/mode-appel/pre-lecture (0,14 €) · fil dossier (0,04 €) · template depuis une capture (0,03 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **Postgres et un worker séparé pour Haka** (une décision) — la veille et les tâches de Haka hors du processus web. Un seul processus Render porte le web, la veille et les tâches de Haka ; chaque push le redémarre une minute (le disque /var/data est attaché à ce seul service). Le jour où le volume l'exige : Postgres et un worker à part, la file « À valider » reste la même. `Quand haka_taches dépasse ~200 tâches par jour, ou qu'un redémarrage interrompt des pas externes chaque semaine`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · la veille toutes les quinze minutes · des réponses courtes, une réflexion moyenne · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

118 demandes, 15.69 € en tout soit 0.133 € la demande.

136 actions : 118 réussies, 5 questions posées (il manquait une information), 0 doublons évités, 13 vraiment ratées.
Les ratées, à corriger : simuler_dossier ×3 · analyser_fiche ×2 · lire_presentation ×1 · loyers_equimmox ×1 · data_b ×1 · lancer_design ×1 · bloquer_rdv ×1 · modifier_dossier ×1 · annuler_derniere_action ×1 · creer_projet_depuis_dossier ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 1 compliment, soit 0.8 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : modifier_presentation ×18 · rediger_loi ×12 · data_b ×11 · donnees_commune ×10 · creer_dossier ×9 · loyers_equimmox ×6 · simuler_dossier ×6 · noter_engagement ×6.
Pour qui : Jules 126 · Admin 4 · Coralie 4 · Sourcing 1 · Nora 1.
Tâches de fond : 7 lancées, 7 finies, 0 ratées (loi 5, kdata 2).

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 16 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « trier ce qu’on colle dans la boîte » à 0,07 € par dépôt : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 38 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

