# Le Layer Klocka

La couche de connaissance qui fait de Claude AK : ce qui est dit, décidé ou
promis entre dans un journal brut, en ressort en faits, et seuls les faits
validés servent à AK pour répondre. Ancien nom : « le Cerveau » (spec MVP du
14 oct. 2026). Spec de la refonte : « Prompt — Layer Klocka (Claude Code) »,
14 oct. 2026 (sections 1 à 4 reçues ; 5 à 15 à recevoir).

Ce fichier est tenu à jour à chaque phase. Une session qui reprend le Layer le
lit d'abord, sans relire tout le code.

**Nom.** À l'écran : « l'Intelligence » (Intelligence de Klocka), décision de Jules du 15 oct. 2026. Le nom technique reste « le Layer » : outils d'AK `layer_*`, API `/api/layer`, fichiers `layer.*`. « Cerveau » est l'ancien nom (jusqu'au 15 oct.).

**État : phases 1 à 7 faites (16 oct. 2026)** : renommage, données et tâches de fond, recherche hybride, cycle de vie et validation sans goulot, synthèses vivantes, branchements, page Intelligence. Phase suivante : 8 (évaluation).

---

## 1. L'existant (chemins à jour après la phase 1)

### Fichiers

| Rôle | Fichier |
|---|---|
| Module (ingestion, extraction, rattachement, validation, recherche, questions, débriefs, appels) | `server/layer.js` (ex-`cerveau.js`) |
| Routes HTTP `/api/cerveau/*` (équipe seule) | `server/routes/layer.js` (`/api/layer`, alias `/api/cerveau`) |
| Tests (6) | `server/layer.test.js` |
| Page Intelligence (À valider, Savoir, Informations, Décisions, Engagements, Tout, Sources) | `src/pages/Intelligence.jsx` |
| Frise de faits, fenêtre de source, onglet Historique | `src/components/layer/FriseFaits.jsx` |
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

## 3. Décisions de Jules (15 oct. 2026)

- SQLite avec les équivalents (FTS5, vecteurs comparés en JavaScript). **Déclencheur du chantier Postgres** : une recherche qui dépasse 300 ms, ou plus de 50 000 faits. Les deux se mesurent dans le journal des recherches (phase 3) et se signalent ici.
- Embeddings Mistral ; modèle et dimension vérifiés dans la doc ; le nom du modèle est gardé avec chaque vecteur.
- Noms internes gardés (`CerveauFait`…) ; seuls l'interface, les routes et les outils d'AK changent.
- Matching investisseur = les demandes des clients (critères de chaque investisseur).
- Table de tâches reprise au démarrage, sur le modèle de la lecture des pièces.

## 4. Re-test de la consigne d'extraction (15 oct. 2026)

Sur « Comité 7 octobre » (13 536 signes, une seule tranche ; 25 faits en base), deux essais par consigne, sans rien écrire en base (`invokeLLM` direct) :

| Consigne | Essai 1 | Essai 2 |
|---|---|---|
| Originale (commit e750b8f) | 33 faits, 24/25 retrouvés | 35 faits, 25/25 |
| Actuelle (avec `NOTE_KLOCKA`) | 36 faits, 25/25 | 33 faits, 24/25 |

« Retrouvé » : même citation (l'une contient l'autre) ou résumé proche (≥ 45 % de mots communs). Le modèle ne rend jamais deux fois la même liste, même avec la consigne d'origine : « identiques » au sens strict n'est pas atteignable, l'équivalence l'est. La phrase des tranches ne s'applique pas à une source d'une tranche ; un saut de ligne qu'elle ajoutait a été retiré : hors `NOTE_KLOCKA`, la consigne est identique au signe près à l'originale.

## 4 bis. Phase 2 : les données (15 oct. 2026)

**Champs ajoutés aux enregistrements JSON** (aucune migration : lus avec défaut ; absents sur les anciens faits) :

| Entité | Champ | Valeurs |
|---|---|---|
| `CerveauFait` | `statut` | `a_valider`, `a_rattacher` (à valider, fiche à choisir), `valide`, `rejete`, `remplace`, `archive` (`STATUTS_FAIT`) |
| | `remplace_par` | id du fait qui le remplace (phase 4) |
| | `mode_validation` | `manuel` ou `auto` (posé à chaque validation, `auto` en phase 4) |
| | `motif_rejet` | `faux`, `doublon`, `hors_sujet`, `mal_rattache`, `autre` (`MOTIFS_REJET`) |
| | `confiance` | 0 à 1, rendu par l'extraction (champ ajouté au schéma de sortie) |
| | `statut_engagement`, `responsable` | engagements : `ouvert` à la naissance, puis `tenu` ou `echu` (phase 4) ; `responsable` = la personne qui promet |
| `CerveauSource` | `type` | + `mail`, `evenement` (Monday) |
| | `id_externe` | Message-ID, identifiant d'update Monday ; vaut clé de déduplication (`<type>:<id_externe>`) |
| | `cout` | `{ entree, sortie, usd }`, cumulé à chaque extraction (`mesurer`) |

**Tables** (`server/layer-schema.js`, créées si elles manquent, `defaire()` pour revenir en arrière) : `layer_fts`, `layer_vecteurs`, `layer_syntheses`, `layer_evaluations`, `layer_evaluations_runs`, `layer_requetes`, `layer_audit`, `layer_taches` ; index sur le statut des faits et sur la fiche des liens. Le journal du MVP (`CerveauRecherche`) est recopié une fois dans `layer_requetes` ; les nouvelles recherches n'écrivent plus que là. Testé à vide (`server/layer-schema.test.js`) et sur une copie de la base locale (63 319 enregistrements intacts après `defaire()`).

**Audit** : `trancher` (valider, corriger, rejeter) et `validerLot` écrivent qui, quand, l'état avant et après (`auditer`, `auditDe`).

**Tâches de fond** (`server/layer-taches.js`) : `enfiler(type, charge, { cle })`, une à la fois, trois essais (1 min puis 5 min), `reprendre()` au démarrage (`server/index.js`) remet en attente ce qui était en cours ; `reprendreExtractions()` remet en file les sources restées en attente d'extraction. Sous `node --test`, rien ne part seul : le test appelle `tourner()`. L'extraction des appels (`depuisAppel`) et des réunions passe par la file (`planifierExtraction`) ; un compte rendu collé reste extrait tout de suite (la personne attend le résultat).

**Seuils Postgres** : `alertePostgres()` mesure le p95 des recherches sur 7 jours (seuil 300 ms) et le nombre de faits (seuil 50 000).

**Re-test avec la confiance** (comité du 7 oct., deux essais) : 33 et 40 faits, 25/25 retrouvés les deux fois ; confiance rendue pour chaque fait (de 0,7 à 1 ; 26/33 et 35/40 à 0,9 ou plus : le modèle est confiant, la validation auto de la phase 4 exige aussi la citation mot pour mot, le rattachement sans ambiguïté et l'absence de contradiction). La description du champ impose le point décimal : avec « 0,5 » écrit, le modèle a une fois rendu un JSON illisible.

## 4 ter. Phase 3 : la recherche hybride (15 oct. 2026)

`server/layer-recherche.js`, appelée par `chercher()` (`server/layer.js`, désormais asynchrone) et l'outil `layer_chercher`.

1. **Filtres d'abord** (`candidats`) : statut `valide` (et `remplace` si `historique: true`), `type`, fiche (`type_entite` + `entite_id`), `ville` (lien de type ville, ou ville de l'agence, de l'agent, du dossier rattaché), `personne`, période `depuis` / `jusqua` (date de la source). AK les déduit de la question et les passe en paramètres de l'outil (schéma enrichi de `texte`, `ville`, `historique`).
2. **Plein texte** : `layer_fts` (FTS5, `unicode61 remove_diacritics 2`) sur résumé + citation ; la question devient `"mot"* OR …` (mots de 3 lettres et plus, `requeteFts`), classement bm25.
3. **Sens** : embedding de la question, cosinus avec `layer_vecteurs` (même modèle seulement).
4. **Fusion** : rang réciproque, k = 60 (`fusionRRF`), 10 premiers.
5. **Journal** : `layer_requetes` (question, texte, filtres, faits rendus, durée totale, durée locale).

**Embeddings** : Mistral `mistral-embed`, 1024 dimensions, norme 1, `POST https://api.mistral.ai/v1/embeddings` `{ model, input }` → `data[].embedding`, `usage.prompt_tokens` (vérifié dans la doc et par un appel réel le 15 oct. 2026). Le modèle rendu est gardé avec chaque vecteur ; un résumé corrigé ou un modèle changé relance l'embedding (`empreinte`). Calcul en tâche de fond (`embedder`, lots de 32) ; jetons comptés sur la source (`cout.embed_jetons`), dollars seulement si `LAYER_EMBED_USD_PAR_MILLION` est posé (tarif non trouvé dans les pages publiques lues).

**Indexation** : chaque fait créé (`rangerFaits`) ou dont le résumé change (`trancher`) est indexé ; au démarrage, `rattraper()` indexe en plein texte ce qui manque et met les embeddings manquants en file.

**Sans clé Mistral**, ou si l'appel tombe : plein texte seul (`pistes: { fts: true, sens: false }`). Les tests vident la clé et utilisent un faux fournisseur.

**Mesure réelle** (base locale, 25 faits) : la bonne réponse en tête pour trois questions ; durée totale 175 à 278 ms, dont 2 à 8 ms de calcul local (le reste : l'appel réseau d'embedding de la question). Le seuil Postgres (300 ms) surveille la durée locale (`duree_locale_ms`), pas le réseau.

## 4 quater. Phase 4 : cycle de vie et validation sans goulot (15 oct. 2026)

`server/layer-cycle.js`. Après chaque extraction, une tâche `controler` (file du Layer) passe sur les faits nouveaux de la source :

1. **Embeddings** des faits nouveaux (pour comparer le sens).
2. **Contradictions** : parmi les faits validés de même type qui partagent une fiche, ceux du même sujet (cosinus ≥ 0,82 ; sans vecteurs, ≥ 20 % de mots communs) ; les deux plus proches sont jugés par le modèle rapide (`claude-haiku-4-5`, sans réglage d'effort : il ne l'accepte pas). Consigne : une situation qui a changé rend l'ancien fait dépassé (= contradiction) ; un ajout, une action à venir ou une redite non. Vérifié en réel sur quatre cas (4/4). Le nouveau fait porte alors `contradiction: { fait_id, resume, raison }` : à l'écran, « Remplace le fait validé … ? », Remplacer l'ancien (`remplacer` : l'ancien passe `remplace` avec `remplace_par`) ou Garder les deux (`garderLesDeux`). Un lot ne tranche jamais une contradiction.
3. **Validation automatique** si : statut `a_valider` (pas `a_rattacher`), citation retrouvée mot pour mot, confiance ≥ 0,9, au moins une fiche, aucune contradiction (ni juge injoignable). → `valide`, `mode_validation: 'auto'`, `valide_par: 'auto'`, corrigeable.
4. **Sinon** : `validateur` = l'auteur de la source pour un appel ou un débrief, rien (= Jules) pour le reste ; `obstacles` dit pourquoi (affiché « Pas validé seul : … »). `peutValiderFait(user, fait)` : Jules toujours, sinon le validateur. La file À valider (`aValider(user)`) et le compteur « à valider » sont personnels ; Jules voit tout.

**Rejet** : un motif obligatoire à l'écran (faux, doublon, hors sujet, mal rattaché, autre).

**Engagements** : `ouvert` à la naissance ; `echu` à J+1 de l'échéance (tâche de nuit, 5 h Paris, Render ou `LAYER_NUIT=true`) ; `tenu` à la main (`POST /api/layer/engagements/:id { statut }`).

**Archivage** (même tâche de nuit) : un fait validé, hors savoir, dont toutes les fiches sont fermées (agent `archive` ou `ne_plus_appeler`, projet `vendu` ou `cede`) passe `archive`. Un dossier abandonné n'archive rien : ses faits disent souvent le pourquoi d'un refus. Les faits remplacés et archivés reviennent dans une recherche d'historique.

**Audit** de chaque bascule (`valider_auto`, `remplacer`, `garder_les_deux`, `engagement_*`, `archiver`). **Mesure** : `partManuelle()` (part des faits tranchés à la main sur 14 jours, objectif < 20 %), rendue par `/api/layer/etat` (`manuel`).

## 4 quinquies. Phase 5 : les synthèses vivantes (15 oct. 2026)

`server/layer-syntheses.js`, table `layer_syntheses` (une ligne par fiche : `lignes` JSON `[{ rubrique, texte, faits: [ids] }]`, `faits` inclus, `version`, `genere_le`, `perime`, `cout_usd` cumulé).

- **Fiches** : agent, agence, dossier, investisseur, ville. **Rubriques**, dans l'ordre : `qui_quoi`, `situation`, `decisions`, `engagements` (ouverts ou échus, jamais tenus), `vigilance`, `dernier_contact` ; 10 à 15 lignes, moins s'il y a peu de faits ; une rubrique sans fait n'a pas de ligne. Seuls les faits validés de la fiche entrent ; chaque ligne garde les identifiants des faits qui la portent (`ranger` écarte les identifiants inconnus).
- **Vivante** : `ficheChangee(faitId)` est appelée à chaque changement d'un fait validé (validation manuelle, auto ou par lot, correction, remplacement, garder les deux, engagement tenu ou échu, archivage, réponse à une question). La synthèse passe `perime` et sa régénération (tâche `synthese`) attend l'heure révolue depuis la dernière ; plusieurs faits dans l'heure ne font qu'une tâche (clé `synthese:<type>:<id>`). Sans fait validé, pas de synthèse.
- **Modèle rapide** (`claude-haiku-4-5`), coût sur la synthèse. Essai réel (ville de Nice, 3 faits) : cinq lignes conformes, chacune avec ses faits.
- **`ficheLayer(type, id)`** : la fonction unique des branchements (phase 6) : synthèse, engagements ouverts ou échus, derniers faits, total.
- **AK** : `layer_fiche` rend la synthèse d'abord, les engagements, les derniers faits ; `detail: true` ajoute la frise. **Routes** : `GET /api/layer/fiches/:type/:id`, `GET /api/layer/syntheses`, `POST /api/layer/syntheses/:type/:id/regenerer` (Jules).

## 4 sexies. Phase 6 : les branchements (15 oct. 2026)

Une seule fonction serveur, `ficheLayer(type, id)` (`server/layer-syntheses.js`), et des briques d'écran dans `src/components/layer/CeQueKlockaSait.jsx` :

| Où | Quoi | Brique | Route |
|---|---|---|---|
| Mode appel, colonne de gauche (`ModeAppel.jsx`, hors essai) | synthèse de l'agence, engagements ouverts (« Tenu » d'un clic) | `CeQueKlockaSait type="agence"` | `GET /api/layer/fiches/:type/:id` |
| Fiche agent (Prospection) | idem pour l'agent, la frise complète repliée dessous | `CeQueKlockaSait type="agent"` | idem |
| Dossier, onglet Historique (`WorkflowDeal.jsx`) | synthèse du dossier au-dessus de la frise | `CeQueKlockaSait type="dossier"` | idem |
| Pré-analyse, carte du lot (`CarteLot`, `DealResultat.jsx`) | « Ce que Klocka sait déjà » : recherche sur l'enseigne du locataire, sur la ville (avec l'enseigne), et faits de l'agent (`contact_agent_email`) ; faits du dossier lui-même écartés ; chacun dit pourquoi | `DejaSu` | `GET /api/layer/deja-su/:dealId?lot=` (`dejaSu`) |
| Matching (Mandataires > Demandes clients, équipe seulement) | faits d'information et de décision de l'investisseur, retrouvé par `client_email` | `InvestisseurLayer` | `GET /api/layer/investisseurs/:email` (`ficheInvestisseur`) |
| Ma journée (Prospection) et tableau de bord | engagements du jour ou en retard de la personne (de ses appels et débriefs, ou dont elle est responsable), faits à valider, questions « pourquoi ? » en attente | `JourneeLayer` | `GET /api/layer/journee` (`journee`) |

Une ligne de synthèse déplie ses faits ; un fait ouvre sa source (`FenetreSource`). Après validation d'un appel, l'extraction part en tâche de fond (phase 2). Le tableau de bord n'a plus la ligne « X éléments à valider » seule : `JourneeLayer` la remplace.

## 4 septies. Phase 7 : la page Intelligence (15-16 oct. 2026)

`src/pages/Intelligence.jsx`, reconstruite avec les briques de Suivi > Appels (`src/components/monitoring/GraphesAppels.jsx`). `Chiffre` y a été déplacé (il était local à `SuiviAppels.jsx`) ; ajoutés à la fin du module : `ChiffreCourbe` (un chiffre et sa courbe) et `Croissance` (courbes cumulées, une couleur par série dans l'ordre fixe de `jetons.graphique`). `FaitsParJour` accepte `titre` et `aide`.

- **En tête, quatre indicateurs** avec leur courbe sur 30 jours (`GET /api/layer/tableau`, `tableauDeBord` dans `server/layer-cycle.js`) : faits validés (7 jours), part validée sans correction (7 jours), engagements échus (en stock), questions posées (7 jours, journal des recherches).
- **La croissance** (Jules, 16 oct., transmis par une autre session) : « Ce qu'on lui donne » (sources en cumul : toutes, comptes rendus, réunions, appels, débriefs) et « Ce qu'elle sait » (faits extraits, validés, savoir validé), **comptés à partir du 13 oct. 2026** (`DEBUT_DONNEES` ; avant, c'était du test). La bande des critères du MVP a quitté l'en-tête (lecture de « enlève le truc », à confirmer avec Jules) : elle est dans l'onglet Évaluation.
- **Onglets** : À valider · n (personnel) ; Faits (type : Tout, Savoir, Informations, Décisions, Engagements, la demande du 14 oct. ; statut : validés, à valider, remplacés, archivés, rejetés ; période ; type de fiche et nom) ; Synthèses (une ligne par fiche, un clic déplie la synthèse) ; Sources ; Évaluation (critères du MVP, part de validation à la main, coût d'extraction du mois, recherche la plus lente et nombre de faits face aux seuils Postgres, répartitions types / statuts / sources ; le banc de questions vient en phase 8).
- **Vue par fiche** depuis la fiche elle-même : `CeQueKlockaSait` (phase 6).

## 5. Correspondance des noms

| Avant | Après |
|---|---|
| Interface « Cerveau » | « l'Intelligence » |
| Page `/Cerveau` | `/Intelligence` (et `/Cerveau` y mène) ; la clé de page reste `Cerveau` (menus personnalisés, accès ouverts) |
| API `/api/cerveau/*` | `/api/layer/*` (et `/api/cerveau/*` reste un alias) |
| `server/cerveau.js`, `routes/cerveau.js`, `cerveau.test.js` | `server/layer.js`, `routes/layer.js`, `layer.test.js` |
| `src/pages/Cerveau.jsx`, `components/cerveau/` | `src/pages/Intelligence.jsx`, `components/layer/` (`HistoriqueLayer`) |
| Outils AK `chercher_cerveau`, `historique`, `noter` | `layer_chercher`, `layer_fiche`, `layer_noter` (anciens noms acceptés, `server/ak/agent.js`) ; groupe v2 `layer` (`chercher`, `fiche`, `noter`) |
| Entités `CerveauSource`, `CerveauFait`, `CerveauLien`, `CerveauQuestion`, `CerveauRecherche` | **gardées** (décision de Jules) |
| Opération de coût `cerveau` (`mesurer`) | gardée : l'historique des coûts reste continu |
| Clé de notification `cerveau-question-<id>` | gardée (déduplication des questions déjà posées) ; le lien devient `?layer_question=`, l'ancien `?cerveau_question=` reste lu |

Ce qui reste du mot « cerveau » dans le code, et pourquoi : ces noms techniques, les alias des anciennes adresses (`/api/cerveau`, `chercher_cerveau`), et l'icône de la page.

## 6. Plan (validé par Jules le 15 oct. 2026)

Chaque phase : tests verts, lint, build, ce fichier mis à jour, commit. Rien
n'est supprimé ; tout ajout de données est rejouable et ignorable.

| Phase | Contenu | Fichiers principaux |
|---|---|---|
| 1. Renommage ✓ | « Cerveau » → « l'Intelligence » dans toute l'interface, routes `/Layer` et `/api/layer` avec redirections, outils AK `layer_*` (anciens noms acceptés), consigne et questions d'AK, fichiers renommés ; re-test de la consigne d'extraction sur le comité du 7 oct. ; recherche globale de « cerveau » rendue à Jules | ceux du tableau des branchements, `server/index.js`, `src/App.jsx`, `src/lib/adresses.js` |
| 2. Données ✓ | Champs nouveaux des faits (statut `remplace`, `remplace_par`, `mode_validation`, `motif_rejet`, `confiance`, `statut_engagement`, responsable) ; sources `mail` et `monday`, `id_externe`, coût d'extraction ; tables `layer_syntheses`, `layer_evaluations`, `layer_evaluations_runs`, `layer_requetes` (reprend `CerveauRecherche`), `layer_audit`, `layer_taches` ; index SQLite | `server/layer.js`, `server/layer-schema.js` (nouveau) |
| 3. Recherche hybride ✓ | FTS5 (accents ignorés) + embeddings + fusion des deux classements ; rattrapage des faits existants | `server/layer-recherche.js` (nouveau) |
| 4. Cycle de vie et validation ✓ | Remplacement d'un fait, engagements tenus / en retard, validation sans goulot (règles de la section 7 à recevoir), audit | `server/layer.js` |
| 5. Synthèses par fiche ✓ | Une synthèse vivante par dossier, agent, agence…, marquée périmée quand un fait change | `server/layer-syntheses.js` (nouveau) |
| 6. Branchements ✓ (sources : phase 9) | Usage proactif (mode appel, pré-analyse, matching, tableau de bord) ; sources mail et Monday | modules cités en section 1 et 2 |
| 7. Page Intelligence ✓ | Reconstruite sur Suivi > Appels : KPIs, graphiques, filtres, mêmes briques | `src/pages/Layer.jsx`, briques de Suivi > Appels |
| 8. Évaluation | Banc de questions, exécutions comparées par version | `server/layer-evaluation.js` (nouveau) |

### Spec des phases 3 à 9 (reçue le 15 oct. 2026, résumé)

- **Recherche hybride** : FTS5 (résumé + citation) et cosinus (embedding du résumé) sur les faits validés ; filtres déduits par AK (fiche, ville, type, période) appliqués avant ; fusion RRF (k = 60), 10 premiers ; « remplacés » exclus sauf question d'historique ; journal : question, filtres, faits rendus, fait cité.
- **Cycle de vie** : à valider → validé | rejeté ; validé → remplacé | archivé ; contradiction sur la même fiche et le même sujet → proposition « remplace le fait X ? » ; engagements ouvert | tenu | échu (échu à J+1, dans « Ma journée ») ; archivage quand la fiche est fermée.
- **Validation sans goulot** : auto si citation mot pour mot, confiance ≥ 0,9, rattachement sans ambiguïté, pas de contradiction (« validé auto », corrigeable) ; sinon au validateur auteur de la source (l'analyste pour ses appels, Jules pour les réunions), Jules voit tout ; objectif : < 20 % de validation manuelle après deux semaines ; audit avant / après.
- **Synthèses** : par fiche (agent, agence, dossier, investisseur, ville), 10 à 15 lignes, structure fixe (qui/quoi, situation, décisions, engagements ouverts, vigilance, dernier contact), chaque ligne référence ses faits ; au plus une régénération par heure et par fiche ; `layer_fiche` rend la synthèse d'abord.
- **Branchements** : mode appel (synthèse et engagements ouverts avant l'appel), pré-analyse (« Ce que Klocka sait déjà » sur la carte du lot), matching (faits rattachés à l'investisseur), tableau de bord / Ma journée ; une seule fonction réutilisable fiche → synthèse + faits.
- **Sources** : mails envoyés ou reçus par la plateforme (Resend, fiches commerciales), rattachés par l'adresse ; Monday (statuts et commentaires des boards agents et propriétés, par webhook), type « événement ».
- **Page** : 4 indicateurs avec courbe sur 30 jours (faits validés cette semaine, part sans correction, engagements échus, questions de la semaine) ; onglets À valider, Faits, Synthèses, Sources, Évaluation ; vue par fiche depuis la fiche.
- **Consignes d'AK** : `layer_fiche` puis `layer_chercher` pour le passé ; citer date, personne, source et statut ; zéro fait → « rien dans l'Intelligence » et proposer `layer_noter` ; ne rien inférer.
- **Évaluation** : banc de 30 questions en base, éditable ; rappel des faits attendus dans les 10 et taux de citation correcte ; une exécution par version, comparaison des deux dernières ; pas de mise en production si le rappel baisse.
- **Coûts** : par source (extraction, embeddings, synthèses), coût du mois dans l'onglet Évaluation ; prompt caching ; modèle rapide pour extraction et synthèses.

### Points ouverts

Aucun à ce stade.
