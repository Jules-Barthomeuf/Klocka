# Le Layer Klocka

La couche de connaissance qui fait de Claude AK : ce qui est dit, décidé ou
promis entre dans un journal brut, en ressort en faits, et seuls les faits
validés servent à AK pour répondre. Ancien nom : « le Cerveau » (spec MVP du
14 oct. 2026). Spec de la refonte : « Prompt — Layer Klocka (Claude Code) »,
14 oct. 2026 (sections 1 à 4 reçues ; 5 à 15 à recevoir).

Ce fichier est tenu à jour à chaque phase. Une session qui reprend le Layer le
lit d'abord, sans relire tout le code.

**État : phase 0 (exploration et plan), en attente de la validation de Jules.
Aucun code du Layer n'a encore été modifié pour la refonte.**

---

## 1. L'existant (au 14 oct. 2026, avant refonte)

### Fichiers

| Rôle | Fichier |
|---|---|
| Module (ingestion, extraction, rattachement, validation, recherche, questions, débriefs, appels) | `server/cerveau.js` (517 l.) |
| Routes HTTP `/api/cerveau/*` (équipe seule) | `server/routes/cerveau.js` |
| Tests (6) | `server/cerveau.test.js` |
| Page Cerveau (À valider, Savoir, Informations, Décisions, Engagements, Tout, Sources) | `src/pages/Cerveau.jsx` |
| Frise de faits, fenêtre de source, onglet Historique | `src/components/cerveau/FriseFaits.jsx` |
| Correction des noms écorchés (« Cloaca » → Klocka, « de Zulveta » → de Zulueta) et note des consignes | `server/klocka-nom.js` |
| Réunions enregistrées (Suivi > Réunion), envoyées comme compte rendu | `server/reunions.js`, `server/routes/reunions.js`, `src/pages/SuiviReunion.jsx` |

### Données

Pas de tables dédiées : tout vit dans la table générique `records` de SQLite
(`server/db.js`), une ligne JSON par enregistrement, colonne `entity`.

| Entité (`records.entity`) | Contenu |
|---|---|
| `CerveauSource` | type (`compte_rendu`, `appel`, `debrief`, `decision`), auteur, date, titre, contenu (≤ 120 000 signes, jamais modifié), lien_original, liens d'office, `cle` (déduplication : `appel-<id>`, `reunion-<id>-<partie>`, `question-<id>`), statut_extraction, faits, doublons |
| `CerveauFait` | source_id, type (`decision`, `information`, `engagement`, `savoir`), resume, citation, citation_verifiee, personne, echeance, candidats, statut (`a_valider`, `a_rattacher`, `valide`, `rejete`), corrige, valide_par, valide_le |
| `CerveauLien` | fait_id, type_entite (`dossier`, `projet`, `agent`, `agence`, `investisseur`, `ville`), entite_id |
| `CerveauQuestion` | pour, deal_id, statut_vise, texte, etat (`en_attente`, `posee`, `repondue`, `abandonnee`), fait_id |
| `CerveauRecherche` | par, question, trouves, le (le journal des recherches, embryon de `layer_requetes`) |
| `Reunion` | réunions de Suivi > Réunion (morceaux de texte, sources envoyées) |

### Circuit

1. **Entrées** : `ajouterSource` (corrige les noms, déduplique par `cle`). Sources : compte rendu collé ou déposé (texte, PDF, Word) ; appel validé avec transcription (`depuisAppel`, appelé par `server/prospection/mode-appel.js`) et reprise des appels gardés (`importerAppelsGardes`) ; réunion (`server/reunions.js`) ; débrief du chat « retiens que / note que » (`debriefDe`, `noter`, branché dans `server/ak/app.js`) ; réponse à une question de décision (`repondre`).
2. **Extraction** : `extraire` → `consigne(source, texte, tranche)` → `invokeLLM` avec schéma JSON, par tranches de 14 000 signes (`tranches`), coût mesuré (`mesurer`, opération `cerveau`). Puis `rangerFaits` : citation vérifiée (`citationDans`), doublons écartés (`doublonDe` : même citation ou même résumé), rattachement par `candidatsPour` (la ville départage).
3. **Validation** : `trancher` (valider, corriger résumé/type/fiches, rejeter), `validerLot` ; seul un super-admin valide (`peutValider`).
4. **Restitution** : `chercher` (mots communs, faits validés seulement, journal `CerveauRecherche`), `historique` (frise d'une fiche), `tousLesFaits`, `savoir`, `mesures` (critères du MVP).
5. **Questions** : `surDecision` (branché dans `server/deal/lifecycle.js` : dossier accepté ou refusé sans motif), une à la fois, trois par jour (`poserLaSuivante`), réponse → décision validée d'office.

### Consigne d'extraction

`consigne()` dans `server/cerveau.js`. Validée sur le compte rendu « Comité
7 octobre » (5 faits justes). **Depuis cette validation, deux ajouts du
14 oct. 2026, non re-testés sur ce comité** : la note sur le nom de Klocka
(`NOTE_KLOCKA`) et la phrase des tranches (« extrais tout ce qui compte dans
CETTE tranche ») pour les sources longues. À re-tester en phase 1.

### Branchements

| Où | Quoi | Fichier |
|---|---|---|
| Menu | entrée Cerveau et pastille du nombre à valider | `src/Layout.jsx`, `src/lib/menu.js` |
| Tableau de bord | ligne « X éléments à valider », question de décision ouverte | `src/components/dashboard/AdminDashboardView.jsx` |
| Dossier (Analyse) | onglet Historique | `src/components/preanalyse/WorkflowDeal.jsx` |
| Fiche agent (Prospection) | « Au Cerveau » | `src/pages/Prospection.jsx` |
| Suivi > Appels > Contexte | ce que les appels apportent | `server/prospection/suivi-appels.js`, `src/pages/SuiviAppels.jsx` |
| AK | outils `chercher_cerveau`, `historique`, `noter` ; consigne `cadreCerveau` | `server/ak/agent.js`, `server/ak/app.js`, `server/ak/outils-v2.js` (v2), `server/etapes-libelles.js` |
| Accès | API fermée avec la page | `server/acces-pages.js` |

## 2. La pile

| Sujet | Ce qui est en place | Conséquence pour la spec |
|---|---|---|
| Base | SQLite (better-sqlite3 11, SQLite 3.49), un fichier, table `records` en JSON ; disque Render (`KLOCKA_DATA_DIR`) | Pas de Postgres : ni pgvector/HNSW, ni tsvector/GIN/unaccent. Équivalents SQLite ci-dessous. |
| ORM, migrations | Aucun : `Records` (CRUD JSON) et `CREATE TABLE IF NOT EXISTS` au chargement d'un module | Une « migration » = champs ajoutés au JSON (lus avec défaut) ou tables nouvelles ; réversible en les ignorant ou les supprimant. Testée sur une copie (`copierBase`, `server/testeur/bac-a-sable.js`). |
| Plein texte | FTS5 disponible (testé : `unicode61 remove_diacritics 2`) | Remplace tsvector + unaccent + GIN. |
| Vecteurs | Aucune extension | Vecteurs en BLOB Float32 dans une table dédiée, similarité cosinus en JavaScript (quelques milliers de faits : quelques ms). `sqlite-vec` seulement si le volume l'exige. |
| Embeddings | Anthropic n'en propose pas. Clés présentes : `MISTRAL_API_KEY` (déjà utilisée pour Voxtral), `GEMINI_API_KEY` | Fournisseur à choisir (Mistral recommandé) ; nom et dimension du modèle à vérifier dans sa doc avant d'écrire le code. |
| Tâches de fond | Pas de file : promesses en mémoire et `setInterval` (`planifier`), perdues au redémarrage | Une table de tâches persistantes, reprise au démarrage (modèle : `reprendreEnAttente` de `server/deal/file-extraction.js`). |
| LLM | `invokeLLM` (`server/llm.js`), coût par opération (`server/llm-couts.js`) | Le coût d'extraction par source se range dans le même journal. |
| Monday | `server/monday.js` (lireElement, commenter, lireTableau…) | Source `monday` possible (updates d'un élément). |
| Mails | `server/gmail-inbox.js`, `server/deal/veille-mails.js` (entité `MailRecu`) | Source `mail` possible, dédupliquée par Message-ID. |
| Interface | React + Vite + Tailwind (jetons `src/design/jetons.json`), recharts | Page Layer avec les briques de Suivi > Appels. |

### Les briques de Suivi > Appels (à réutiliser telles quelles)

- `src/components/monitoring/GraphesAppels.jsx` : `Cadre`, `Legende`, `useCouleurs`, `couleursAnalystes`, `BarresHorizontales`, `AppelsParJour`, `TauxJoints`, `CourbesAnalystes`, `Cumul`, `ParHeure`, `CarteSemaine`, `Durees`, `DureeParJour`, `PetitsMultiples`, `ClassementAnalystes`, `FaitsParJour`.
- `src/pages/SuiviAppels.jsx` : `Chiffre` (carte de KPI), `PERIODES`, `MODES`, `filtre`, structure en vues (Vue d'ensemble, Par analyste, Contexte, Journal). `Chiffre` et les filtres sont locaux à la page : à déplacer dans un module partagé (pas à réécrire).
- Palette des séries : `jetons.graphique` (sombre et clair, validée daltonisme). Règles : `docs/design-system.md`, « Les graphiques ».

## 3. Correspondance des noms (proposition, à valider)

| Avant | Après |
|---|---|
| Interface « Cerveau » | « le Layer » |
| Page `/Cerveau` | `/Layer` (et `/Cerveau` redirige) |
| API `/api/cerveau/*` | `/api/layer/*` (et `/api/cerveau/*` reste un alias) |
| `server/cerveau.js`, `routes/cerveau.js`, `cerveau.test.js` | `server/layer.js`, `routes/layer.js`, `layer.test.js` |
| `src/pages/Cerveau.jsx`, `components/cerveau/` | `src/pages/Layer.jsx`, `components/layer/` |
| Outils AK `chercher_cerveau`, `historique`, `noter` | `layer_chercher`, `layer_fiche`, `layer_noter` (anciens noms acceptés un temps) |
| Entités `CerveauSource`, `CerveauFait`, `CerveauLien`, `CerveauQuestion`, `CerveauRecherche` | **gardées** (noms techniques), sauf décision contraire de Jules |

## 4. Plan (proposé le 14 oct. 2026, en attente de validation)

Chaque phase : tests verts, lint, build, ce fichier mis à jour, commit. Rien
n'est supprimé ; tout ajout de données est rejouable et ignorable.

| Phase | Contenu | Fichiers principaux |
|---|---|---|
| 1. Renommage | « Cerveau » → « le Layer » dans toute l'interface, routes `/Layer` et `/api/layer` avec redirections, outils AK `layer_*` (anciens noms acceptés), consigne et questions d'AK, fichiers renommés ; re-test de la consigne d'extraction sur le comité du 7 oct. ; recherche globale de « cerveau » rendue à Jules | ceux du tableau des branchements, `server/index.js`, `src/App.jsx`, `src/lib/adresses.js` |
| 2. Données | Champs nouveaux des faits (statut `remplace`, `remplace_par`, `mode_validation`, `motif_rejet`, `confiance`, `statut_engagement`, responsable) ; sources `mail` et `monday`, `id_externe`, coût d'extraction ; tables `layer_syntheses`, `layer_evaluations`, `layer_evaluations_runs`, `layer_requetes` (reprend `CerveauRecherche`), `layer_audit`, `layer_taches` ; index SQLite | `server/layer.js`, `server/layer-schema.js` (nouveau) |
| 3. Recherche hybride | FTS5 (accents ignorés) + embeddings + fusion des deux classements ; rattrapage des faits existants | `server/layer-recherche.js` (nouveau) |
| 4. Cycle de vie et validation | Remplacement d'un fait, engagements tenus / en retard, validation sans goulot (règles de la section 7 à recevoir), audit | `server/layer.js` |
| 5. Synthèses par fiche | Une synthèse vivante par dossier, agent, agence…, marquée périmée quand un fait change | `server/layer-syntheses.js` (nouveau) |
| 6. Branchements et sources | Usage proactif (mode appel, pré-analyse, matching, tableau de bord) ; sources mail et Monday | modules cités en section 1 et 2 |
| 7. Page Layer | Reconstruite sur Suivi > Appels : KPIs, graphiques, filtres, mêmes briques | `src/pages/Layer.jsx`, briques de Suivi > Appels |
| 8. Évaluation | Banc de questions, exécutions comparées par version | `server/layer-evaluation.js` (nouveau) |

### Points ouverts

1. Sections 5 à 15 de la spec non reçues (recherche, cycle de vie, validation, synthèses, workflows, sources, page, évaluation, coûts, phases).
2. Postgres demandé, SQLite en place : équivalents proposés (FTS5, vecteurs en BLOB, tables `CREATE IF NOT EXISTS`). Passer à Postgres serait un autre chantier.
3. Fournisseur d'embeddings : Mistral recommandé (clé déjà là), Gemini possible ; à confirmer.
4. Renommer les entités `Cerveau*` en `Layer*` : une mise à jour SQL triviale et réversible, mais elle touche la base de production pendant que d'autres sessions travaillent. Proposition : garder les noms techniques.
5. « Matching investisseur » : module non identifié avec certitude (`server/deal/propositions.js` ? les demandes des clients ?).
