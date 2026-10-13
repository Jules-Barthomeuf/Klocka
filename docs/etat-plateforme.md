# État de la plateforme

Écrit le 13/10/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

16 personnes, 3 513 pages ouvertes, 3 demandes à l'assistant, 123 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 2 437 | 3 | 33 | 13/10/2026 |
| admin@klocka.local (équipe) | 487 | 0 | 0 | 11/10/2026 |
| jules.btmf@gmail.com (équipe) | 281 | 0 | 0 | 21/09/2026 |
| admin.stress@test.local (équipe) | 140 | 0 | 0 | 11/10/2026 |
| test.mandataire@kpartners.fr | 101 | 0 | 0 | 10/10/2026 |
| alexis.p@klocka.immo (équipe) | 38 | 0 | 0 | 28/09/2026 |
| test.mandataire2@kpartners.fr | 16 | 0 | 0 | 03/10/2026 |
| client.demo@klocka.local | 11 | 0 | 0 | 28/09/2026 |
| maxime.p@klocka.immo | 2 | 0 | 0 | 25/09/2026 |
| sourcing@klocka.immo | 0 | 0 | 1 | — |
| jules.b@klocka.immo (AK dans l'application) | 0 | 0 | 36 | — |
| admin.stress@test.local (AK dans l'application) | 0 | 0 | 4 | — |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **Analyse** — 560 (16 %)
- **ALX** — 449 (13 %)
- **Dashboard** — 370 (11 %)
- **AdminProjets** — 280 (8 %)
- **Prospection** — 162 (5 %)
- **Emailing** — 139 (4 %)
- **Personnalisation** — 120 (3 %)
- **MandataireProspection** — 100 (3 %)
- **ProjetDetail** — 99 (3 %)
- **ALXCible** — 86 (2 %)
- **KZoning** — 82 (2 %)
- **KData** — 78 (2 %)
- Le reste, sous 2 % : MandataireEstimation, MandataireDossier, Monitoring, KExpertise, SimulateurRentabilite, MandataireMandat, AdminMandataires, AdminPresentations, Home, OffMarket, AdminClients, ConversationsMandataires, SimulateurPublic, AdminSuggestions, Relances, MandataireOffMarket, KEstimation, KFoncier, MandataireClients, AdminLeadMagnets, Offres, MesProjets, KVacance, FeuilleDeRoute, FichesCommerciales, ValeurLocative, ALXEntrainement, CoutsIA, ALXAtelier, KProspective, ALXBilan, MonAssistant, MandataireMarche, Vision, MonCompte, KTransactions, Ressources, MesPresentations, MandataireProjets, Feedback, analyse, SuiviMandataires, ALXVilles, AdminEquipe, SuiviAppels, Comparateur, AdminModeleZone, SuiviTesteur, VisionRetraite, QuizInvestisseur, ImportProjets, Banque, AdminPortail, AdminRessources

## Ce que l'IA coûte

36,14 € sur la période, 1 422 appels, 8 648 k jetons. 31 % part en tâche de fond, sans que personne clique. 47 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Trier ce qu’on colle dans la boîte | 0,06 € par dépôt | 73 | 8,41 € | 24 s |
| Non attribué (fond) | 0,0090 € par appel | 569 | 8,22 € | — |
| Demander quelque chose à AK | 0,06 € par demande | 42 | 4,27 € | 14 s |
| Demander quelque chose à l'assistant (mandataire) | 0,01 € par demande | 107 | 2,53 € | 22 s |
| Retrouver l’annonce en ligne (fond) | 0,18 € par bien | 8 | 2,40 € | 1 min |
| Appel direct au modèle | 0,04 € par appel | 52 | 2,36 € | 28 s |
| Faire le récap du matin | 0,17 € par récap | 11 | 1,97 € | 7 min |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Extraire un document déposé | 0,03 € par document | 11 | 0,83 € | 37 s |
| Lire une pièce du dossier | 0,05 € par document | 9 | 0,63 € | 44 s |
| Demander quelque chose à l'assistant | 0,11 € par demande | 3 | 0,38 € | 12 s |
| Analyser une fiche commerciale | 0,03 € par fiche | 8 | 0,31 € | 13 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/issue (0,62 €) · relecture de préz (0,42 €) · POST /api/prospection/mode-appel/pre-lecture (0,07 €) · template depuis une capture (0,03 €) · POST /api/prospection/rappels/:id/analyser (0,02 €) · POST /api/admin/presentations-bancaires/:id/reconstruire (0,01 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **L'espacement de la veille** (un réglage) — 0,00 € par mail douteux. Depuis que les mails écartés sont mémorisés, un passage sans nouveau mail ne coûte rien. Quinze minutes suffiraient probablement, et rien ne serait perdu : un mail reçu à 9 h 02 entrerait à 9 h 15. `Variable MAIL_VEILLE_MINUTES · 5 minutes aujourd'hui`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · sonnet partout, opus pour le chat.

## AK, l'assistant dans le chat

105 demandes, 13.76 € en tout soit 0.131 € la demande.

121 actions : 105 réussies, 5 questions posées (il manquait une information), 0 doublons évités, 11 vraiment ratées.
Les ratées, à corriger : simuler_dossier ×3 · analyser_fiche ×2 · data_b ×1 · lancer_design ×1 · bloquer_rdv ×1 · modifier_dossier ×1 · annuler_derniere_action ×1 · creer_projet_depuis_dossier ×1.
Repris par l'équipe : 3 corrections (« non, pas ça »), 0 compliment, soit 2.9 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : modifier_presentation ×16 · rediger_loi ×12 · donnees_commune ×9 · creer_dossier ×9 · data_b ×6 · simuler_dossier ×6 · noter_engagement ×6 · modifier_dossier ×6.
Pour qui : Jules 111 · Admin 4 · Coralie 4 · Sourcing 1 · Nora 1.
Tâches de fond : 7 lancées, 7 finies, 0 ratées (loi 5, kdata 2).

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 16 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « trier ce qu’on colle dans la boîte » à 0,06 € par dépôt : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 31 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

