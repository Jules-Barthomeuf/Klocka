# Boîte à outils d'analyse de Haka

## Contrat Data-B

| Champ | Valeur |
| --- | --- |
| Date d'échéance | _à compléter (JJ/MM/AAAA)_ |
| Durée du préavis | _à compléter (en mois ou en jours)_ |
| Reconduction tacite | _à compléter (oui / non)_ |
| **Résilier au plus tard le** | **échéance − préavis = _à calculer dès que les deux champs sont remplis_** |

Ne pas résilier avant que tous les usages listés plus bas aient basculé ; avec une reconduction tacite, laisser passer la date ci-dessus engage une période de plus.

Plan de Jules du 18 oct. 2026 : remplacer Data-B par neuf outils internes que Haka appelle comme les autres, au contrat commun (entrée, valeur en fourchette, confiance, sources datées, détail vérifiable, date). Le code calcule, l'IA explique ; pas de chiffre sans détail ; les données Klocka priment.

Ce fichier garde le plan, l'état des lieux de la phase 0 et les décisions prises. Le texte complet du plan est dans la conversation du 18 oct. ; ce qui suit en est la version de travail.

## Décisions

- 18 oct. 2026 : premier département chargé, **Alpes-Maritimes (06)**.

## Questions encore ouvertes

- Combien de baux et de dossiers signés exploitables dans les archives (la base de Render, pas la locale) ?
- Les études clients de K-Expertise : à la marque Klocka, comme les études en marque blanche de Data-B ?
- SQLite par département, ou une base géographique dès la phase 1 ?
- Un avis juridique (annonces, RGPD, conditions de Google) avant la phase 4 ?

## Phase 0 : état des lieux (18 oct. 2026, lu dans le code)

Sept outils sur neuf tournent déjà sans Data-B, sur des données ouvertes et Equimmox. Aucun des neuf n'appelle un modèle.

| Outil | Ce qui l'alimente aujourd'hui | Data-B |
| --- | --- | --- |
| K-Zoning | OSM (Overpass), carroyage INSEE (IGN WFS), recherche-entreprises et ratios INPI | non |
| K-Expertise | **Data-B d'abord** (navigateur sur expertise.data-b.com), repli : étude interne `implantation/etude.js` (SIRENE), OSM, INSEE | **oui** |
| Estimation | DVF, OSM, INSEE, Equimmox | non (`data-b-murs.js` ne sert qu'à l'avis de valeur des mandataires) |
| K-Prospective | OSM, recherche-entreprises, cadastre et MAJIC via K-Foncier | non (la version Data-B est celle des mandataires, `mandataire-prospective.js`) |
| K-Vacance | OSM, SIRENE | non |
| K-Foncier | Cadastre IGN WFS, MAJIC (opendatasoft), société | non |
| Valeur locative | **Data-B d'abord** (valeurlocative.data-b.com), puis Equimmox ; IRIS, OSM, carreaux INSEE pour la carte | **oui** |
| K-Transactions | BODACC, DVF, OSM | non |
| Signaux de vacance | BODACC, SIRENE, géocodage IGN, OSM, Google Places (tables SQLite `vacance_*`) | non |

Data-B sert aussi hors des neuf outils : transactions (`data-b-transactions.js`), avis de valeur des mandataires (`data-b-murs.js`), prospective des mandataires (`mandataire-prospective.js`), bâtiments et occupants (`alx/foncier.js`, `off-market/occupants.js`), l'assistant (`data-b-assistant.js`), le secteur d'un projet (`projet-secteur.js`), l'off-market (`off-market/simple.js`) et les connecteurs de marché (`marche/connecteurs/data-b-*.js`). Accès par formulaire de connexion et lecture de pages, une session par compte (`server/data-b.js`).

Usage mesurable : pas de journal dédié. Les résultats sont gardés avec `par` et `le` (DataBRecherche, DataBImplantation, DataBTransactions, DataBMurs, ProspectiveDataB), mais un résultat servi du cache ne compte pas et la plupart des recherches de valeur locative sont automatiques (`par` vide). La table `audit` (180 jours) compte les appels aux outils par personne et par route : à lire sur Render.

Fondations déjà là, à réunir plutôt qu'à créer :
- F1 : BAN (`server/adresse-ban.js`, `deal/geocodage.js`), normalisation et concordance d'adresse (`server/adresse.js`), cadastre IGN (`kfoncier.js`), IRIS (`kvaleurlocative.js`), carroyage INSEE (`kzoning-insee.js`). Il manque l'identifiant de local partagé : chaque outil garde ses caches par adresse.
- F2 : SIRENE, BODACC, OSM et Google Places déjà chargés par commune pour les Signaux de vacance (`outils/vacance*.js`) ; K-Vacance et K-Zoning lisent OSM et SIRENE chacun de leur côté.
- F3 : des caches par outil, datés, sans registre commun des jeux de données ni des résultats.
- Données Klocka : loyers, prix et surfaces dans `deal.lots[].lot`, au format `{valeur, citation, confiance}`. Pas d'entité « bail », pas de statut « signé » sur un dossier ; les projets portent l'aboutissement.

## Usages de Data-B hors des neuf outils, à basculer un par un avant la résiliation

| Usage | Où | Produit Data-B | Bascule prévue |
| --- | --- | --- | --- |
| Avis de valeur des mandataires (murs) | `server/data-b-murs.js`, appelé par `mandataire-avis.js` | expertise.data-b.com (navigateur) | Estimation interne |
| Prospective des mandataires | `server/mandataire-prospective.js` | prospective.data-b.com (5 routes) | K-Prospective |
| Off-market : bâtiments et occupants | `server/alx/foncier.js`, `server/off-market/occupants.js`, `off-market/simple.js` | data-b.com/api/batimentV2, /company/foncier, /company/occupant | K-Foncier, SIRENE |
| Outil `data_b` de Haka | `server/data-b-assistant.js` | valeurs locatives, transactions | Valeur locative, K-Transactions |
| Transactions | `server/data-b-transactions.js` | transaction.data-b.com | K-Transactions (DVF, BODACC) |
| Connecteurs de marché | `server/marche/connecteurs/data-b-*.js` | selon le connecteur | les outils correspondants |
| Secteur d'un projet | `server/projet-secteur.js` | valeurs locatives | Valeur locative |

## Palier 1 livré : Valeur locative sans Data-B (18 oct. 2026)

- Une seule liste de comparables, chacun avec sa source et son poids : bail Klocka 3, loyer saisi ou fiche d'agent 1,5, Equimmox 1 (`server/valeur-locative-comparables.js`, `POIDS`).
- L'origine du loyer sur chaque lot (`origine_loyer` : `annonce` à l'analyse de la fiche, `saisi` à la main, `reel` quand la matrice lit un loyer dans un bail, un avenant ou une quittance) ; `server/loyers-klocka.js` la déduit pour les dossiers d'avant.
- La recherche en cercles : tronçon (même rue, 80 m), rue, quartier (500 m, en attendant l'IRIS de F1), commune ; on s'arrête au premier qui réunit `MIN_PAR_CERCLE` (5) loyers Klocka.
- La fourchette par quartiles pondérés ; la confiance par le code (nombre de loyers Klocka, âge médian, dispersion), seuils dans `SEUILS`. Sous « moyenne », Equimmox est affiché et Klocka sert de contrôle.
- Data-B appelé en parallèle, jamais affiché : l'écart est gardé avec la recherche (`ecart_data_b`, `data_b_lu` sur ValeurLocativeRecherche).
- L'actualisation à l'ILC (18 oct. 2026) : chaque loyer Klocka est ramené au dernier indice publié depuis le trimestre de son dossier (INSEE, série 001532540, service SDMX public, gardé 30 jours ; `server/ilc.js`). Le loyer d'origine reste à côté (`loyer_m2_brut`). Equimmox, actuel, n'est pas actualisé. Limite : la date retenue est celle du dossier, pas celle du bail.
- Pas encore : l'ajustement par surface et par classement d'emplacement.
- Comptage en lecture seule pour Render : `npm run comptage-loyers` (option `--ban` pour vérifier les adresses, `--json`). Quand il sera connu, on règle `POIDS`, `MIN_PAR_CERCLE` et `SEUILS`, sans rien changer d'autre.

## Ordre de construction recalé

L'état des lieux raccourcit le plan : la sortie de Data-B tient d'abord à deux outils, le reste est de la consolidation.

1. **Valeur locative sans Data-B.** Les loyers des dossiers Klocka (lots, valeurs locatives déjà lues) comme première source, en cercles (rue, IRIS, commune), actualisés à l'ILC ; Equimmox en témoin ; Data-B appelé en parallèle et gardé à côté pour comparer, sans être affiché. Test « on retire un loyer et on le prédit ».
2. **K-Expertise sans Data-B.** L'étude interne existe déjà en repli : en faire la référence, Data-B en parallèle le temps de comparer.
3. **F1 commun** : un identifiant de local (BAN, parcelle, IRIS, carreau) que tous les outils reçoivent, à partir du code existant.
4. **Contrat commun** : chaque outil renvoie valeur, fourchette, confiance, sources datées, détail ; Haka les reçoit ainsi.
5. Les autres usages de Data-B (transactions, mandataires, off-market, assistant), un par un, puis la résiliation à l'échéance du contrat.
