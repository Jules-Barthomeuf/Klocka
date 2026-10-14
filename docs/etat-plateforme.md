# État de la plateforme

Écrit le 14/10/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

16 personnes, 3 270 pages ouvertes, 3 demandes à l'assistant, 130 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 2 194 | 3 | 40 | 14/10/2026 |
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

- **Analyse** — 472 (14 %)
- **Dashboard** — 341 (10 %)
- **ALX** — 272 (8 %)
- **AdminProjets** — 267 (8 %)
- **Prospection** — 177 (5 %)
- **Emailing** — 139 (4 %)
- **Personnalisation** — 124 (4 %)
- **MandataireProspection** — 100 (3 %)
- **ProjetDetail** — 97 (3 %)
- **KZoning** — 82 (3 %)
- **KData** — 78 (2 %)
- **MandataireEstimation** — 77 (2 %)
- Le reste, sous 2 % : Outils, MandataireDossier, AdminPresentations, KExpertise, Monitoring, SimulateurRentabilite, MandataireMandat, AdminMandataires, Home, ALXCible, OffMarket, AdminClients, ConversationsMandataires, SimulateurPublic, Relances, MandataireOffMarket, AdminSuggestions, KEstimation, KFoncier, MandataireClients, AdminLeadMagnets, Offres, MesProjets, KVacance, FeuilleDeRoute, MesPresentations, FichesCommerciales, Cerveau, ValeurLocative, ALXEntrainement, ALXAtelier, KProspective, ALXBilan, SuiviAppels, MonAssistant, Validations, MandataireMarche, Vision, KTransactions, Ressources, CoutsIA, MandataireProjets, analyse, SuiviMandataires, ALXVilles, AdminEquipe, Comparateur, AdminValidations, AdminModeleZone, SuiviTesteur, VisionRetraite, QuizInvestisseur, Feedback, ImportProjets, Banque, MonCompte, AdminPortail, AdminRessources

## Ce que l'IA coûte

39,19 € sur la période, 1 459 appels, 9 061 k jetons. 34 % part en tâche de fond, sans que personne clique. 53 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Non attribué (fond) | 0,01 € par appel | 614 | 10,33 € | — |
| Trier ce qu’on colle dans la boîte | 0,07 € par dépôt | 79 | 9,62 € | 23 s |
| Demander quelque chose à AK | 0,06 € par demande | 42 | 4,27 € | 14 s |
| Demander quelque chose à l'assistant (mandataire) | 0,01 € par demande | 107 | 2,53 € | 22 s |
| Retrouver l’annonce en ligne (fond) | 0,18 € par bien | 8 | 2,40 € | 1 min |
| Faire le récap du matin | 0,17 € par récap | 12 | 2,11 € | 6 min |
| Appel direct au modèle | 0,04 € par appel | 46 | 2,08 € | 28 s |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Extraire un document déposé | 0,03 € par document | 11 | 0,83 € | 37 s |
| Lire une pièce du dossier | 0,05 € par document | 9 | 0,63 € | 44 s |
| Demander quelque chose à l'assistant | 0,11 € par demande | 3 | 0,38 € | 12 s |
| Analyser une fiche commerciale | 0,03 € par fiche | 8 | 0,31 € | 13 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/issue (0,64 €) · relecture de préz (0,48 €) · POST /api/prospection/mode-appel/pre-lecture (0,08 €) · cerveau (0,08 €) · template depuis une capture (0,03 €) · POST /api/prospection/rappels/:id/analyser (0,02 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **L'espacement de la veille** (un réglage) — 0,00 € par mail douteux. Depuis que les mails écartés sont mémorisés, un passage sans nouveau mail ne coûte rien. Quinze minutes suffiraient probablement, et rien ne serait perdu : un mail reçu à 9 h 02 entrerait à 9 h 15. `Variable MAIL_VEILLE_MINUTES · 5 minutes aujourd'hui`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · sonnet partout, le chat compris.

## AK, l'assistant dans le chat

111 demandes, 15.08 € en tout soit 0.136 € la demande.

128 actions : 112 réussies, 5 questions posées (il manquait une information), 0 doublons évités, 11 vraiment ratées.
Les ratées, à corriger : simuler_dossier ×3 · analyser_fiche ×2 · data_b ×1 · lancer_design ×1 · bloquer_rdv ×1 · modifier_dossier ×1 · annuler_derniere_action ×1 · creer_projet_depuis_dossier ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 0 compliment, soit 0.9 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : modifier_presentation ×18 · rediger_loi ×12 · donnees_commune ×10 · creer_dossier ×9 · data_b ×6 · simuler_dossier ×6 · noter_engagement ×6 · modifier_dossier ×6.
Pour qui : Jules 118 · Admin 4 · Coralie 4 · Sourcing 1 · Nora 1.
Tâches de fond : 7 lancées, 7 finies, 0 ratées (loi 5, kdata 2).

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 14 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « trier ce qu’on colle dans la boîte » à 0,07 € par dépôt : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 34 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

