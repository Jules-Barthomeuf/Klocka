# Boîte à outils d'analyse de Haka

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

## Ordre de construction recalé

L'état des lieux raccourcit le plan : la sortie de Data-B tient d'abord à deux outils, le reste est de la consolidation.

1. **Valeur locative sans Data-B.** Les loyers des dossiers Klocka (lots, valeurs locatives déjà lues) comme première source, en cercles (rue, IRIS, commune), actualisés à l'ILC ; Equimmox en témoin ; Data-B appelé en parallèle et gardé à côté pour comparer, sans être affiché. Test « on retire un loyer et on le prédit ».
2. **K-Expertise sans Data-B.** L'étude interne existe déjà en repli : en faire la référence, Data-B en parallèle le temps de comparer.
3. **F1 commun** : un identifiant de local (BAN, parcelle, IRIS, carreau) que tous les outils reçoivent, à partir du code existant.
4. **Contrat commun** : chaque outil renvoie valeur, fourchette, confiance, sources datées, détail ; Haka les reçoit ainsi.
5. Les autres usages de Data-B (transactions, mandataires, off-market, assistant), un par un, puis la résiliation à l'échéance du contrat.
