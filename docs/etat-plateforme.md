# État de la plateforme

Écrit le 12/10/2026 par `npm run etat`, sur les 30 derniers jours. Ne le modifiez pas à la main : il est réécrit.

Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.

## Qui travaille

15 personnes, 3 556 pages ouvertes, 3 demandes à l'assistant, 90 actions exécutées.

| Personne | Pages | IA | Actions | Vu le |
| --- | ---: | ---: | ---: | --- |
| jules.b@klocka.immo (équipe) | 2 470 | 3 | 2 | 12/10/2026 |
| admin@klocka.local (équipe) | 497 | 0 | 0 | 11/10/2026 |
| jules.btmf@gmail.com (équipe) | 281 | 0 | 0 | 21/09/2026 |
| admin.stress@test.local (équipe) | 140 | 0 | 0 | 11/10/2026 |
| test.mandataire@kpartners.fr | 101 | 0 | 0 | 10/10/2026 |
| alexis.p@klocka.immo (équipe) | 38 | 0 | 0 | 28/09/2026 |
| test.mandataire2@kpartners.fr | 16 | 0 | 0 | 03/10/2026 |
| client.demo@klocka.local | 11 | 0 | 0 | 28/09/2026 |
| maxime.p@klocka.immo | 2 | 0 | 0 | 25/09/2026 |
| jules.b@klocka.immo (AK dans l'application) | 0 | 0 | 35 | — |
| admin.stress@test.local (AK dans l'application) | 0 | 0 | 4 | — |
| coralie.g@klocka.immo (AK dans l'application) | 0 | 0 | 4 | — |

## Les pages qui comptent

L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.

- **Analyse** — 583 (16 %)
- **ALX** — 480 (13 %)
- **Dashboard** — 371 (10 %)
- **AdminProjets** — 283 (8 %)
- **Prospection** — 153 (4 %)
- **Emailing** — 137 (4 %)
- **Personnalisation** — 111 (3 %)
- **MandataireProspection** — 100 (3 %)
- **ProjetDetail** — 95 (3 %)
- **ALXCible** — 95 (3 %)
- **KZoning** — 82 (2 %)
- **KData** — 78 (2 %)
- Le reste, sous 2 % : MandataireEstimation, MandataireDossier, Monitoring, KExpertise, SimulateurRentabilite, MandataireMandat, AdminSuggestions, AdminMandataires, Home, AdminClients, OffMarket, ConversationsMandataires, SimulateurPublic, MandataireOffMarket, KEstimation, KFoncier, MandataireClients, MesProjets, AdminLeadMagnets, Relances, Offres, KVacance, FeuilleDeRoute, ALXVilles, ALXBilan, FichesCommerciales, ValeurLocative, ALXEntrainement, CoutsIA, ALXAtelier, KProspective, ApercuEchelle, MonAssistant, MandataireMarche, Feedback, Vision, MonCompte, KTransactions, Ressources, MandataireProjets, analyse, SuiviMandataires, AdminEquipe, SuiviAppels, Comparateur, AdminPresentations, AdminModeleZone, SuiviTesteur, VisionRetraite, QuizInvestisseur, ImportProjets, Banque, AdminPortail, AdminRessources

## Ce que l'IA coûte

28,16 € sur la période, 1 333 appels, 7 479 k jetons. 36 % part en tâche de fond, sans que personne clique. 44 % des jetons d'entrée sont servis par le cache, à un dixième du prix.

| Geste | Prix courant | Volume | Total | Durée |
| --- | ---: | ---: | ---: | ---: |
| Non attribué (fond) | 0,0089 € par appel | 547 | 7,34 € | — |
| Demander quelque chose à AK | 0,06 € par demande | 42 | 4,27 € | 14 s |
| Demander quelque chose à l'assistant (mandataire) | 0,01 € par demande | 107 | 2,53 € | 22 s |
| Retrouver l’annonce en ligne (fond) | 0,18 € par bien | 8 | 2,40 € | 1 min |
| Appel direct au modèle | 0,04 € par appel | 52 | 2,36 € | 28 s |
| Trier ce qu’on colle dans la boîte | 0,02 € par dépôt | 49 | 1,95 € | 12 s |
| Faire le récap du matin | 0,18 € par récap | 10 | 1,80 € | 7 min |
| Auditer une page avec l'agent testeur | 0,69 € par audit | 2 | 1,38 € | 8 min |
| Extraire un document déposé | 0,03 € par document | 11 | 0,83 € | 37 s |
| Lire une pièce du dossier | 0,05 € par document | 9 | 0,63 € | 44 s |
| Demander quelque chose à l'assistant | 0,11 € par demande | 3 | 0,38 € | 12 s |
| Analyser une fiche commerciale | 0,03 € par fiche | 8 | 0,31 € | 13 s |

Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu'on paie d'habitude.

Pas encore rangé dans un geste, à classer dans `server/llm-couts.js` : POST /api/prospection/mode-appel/issue (0,60 €) · template depuis une capture (0,03 €) · POST /api/prospection/rappels/:id/analyser (0,02 €) · fil dossier (0,01 €) · POST /api/prospection/mode-appel/pre-lecture (0,0098 €) · POST /api/prospection/mode-appel/morceau (0 €).

## Les leviers sur la dépense

Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.

- **L'espacement de la veille** (un réglage) — 0,00 € par mail douteux. Depuis que les mails écartés sont mémorisés, un passage sans nouveau mail ne coûte rien. Quinze minutes suffiraient probablement, et rien ne serait perdu : un mail reçu à 9 h 02 entrerait à 9 h 15. `Variable MAIL_VEILLE_MINUTES · 5 minutes aujourd'hui`
- **Le traitement différé** (une décision) — moitié prix sur tout. L'API propose un mode différé à moitié prix, cache compris. La contrepartie est un délai qui peut aller jusqu'à vingt-quatre heures au lieu d'une minute. La lecture des pièces tourne déjà en tâche de fond et vous prévient quand elle est finie : c'est le profil qui s'y prête. Le choix vous revient, il change un délai. `Concerne la lecture des pièces et la veille, jamais le chat`

Déjà en place, à ne pas défaire : le cache des pièces · le texte du pdf plutôt que ses images · ne pas relire une pièce inchangée · le prix annoncé avant de relire · un mail écarté n'est plus rejugé · sonnet à la place d'opus.

## AK, l'assistant dans le chat

81 demandes, 6.74 € en tout soit 0.083 € la demande.

88 actions : 73 réussies, 5 questions posées (il manquait une information), 0 doublons évités, 10 vraiment ratées.
Les ratées, à corriger : simuler_dossier ×3 · analyser_fiche ×2 · lancer_design ×1 · bloquer_rdv ×1 · modifier_dossier ×1 · annuler_derniere_action ×1 · creer_projet_depuis_dossier ×1.
Repris par l'équipe : 1 correction (« non, pas ça »), 0 compliment, soit 1.2 % des demandes corrigées. C'est le chiffre à faire baisser.

Ce qu'il a fait : rediger_loi ×12 · creer_dossier ×9 · donnees_commune ×6 · noter_engagement ×6 · modifier_dossier ×6 · boite_recue ×6 · simuler_dossier ×5 · analyser_fiche ×5.
Pour qui : Jules 79 · Admin 4 · Coralie 4 · Nora 1.
Tâches de fond : 7 lancées, 7 finies, 0 ratées (loi 5, kdata 2).

## Ce qu'il faut en retenir

- L'écran de travail, c'est **Analyse** : 16 % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.
- Le geste le plus cher est « demander quelque chose à ak » à 0,06 € par demande : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.
- 36 % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.

