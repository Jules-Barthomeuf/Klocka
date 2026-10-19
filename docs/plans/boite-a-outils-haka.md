# Boîte à outils d'analyse de Haka

Plan de Jules du 18 oct. 2026 : remplacer Data-B par neuf outils internes que Haka appelle comme les autres, au contrat commun (entrée, valeur en fourchette, confiance, sources datées, détail vérifiable, date). Le code calcule, l'IA explique ; pas de chiffre sans détail ; les données Klocka priment.

Ce fichier garde le plan, l'état des lieux de la phase 0 et les décisions prises. Le texte complet du plan est dans la conversation du 18 oct. ; ce qui suit en est la version de travail.

## Plan validé (18 oct. 2026)

Le plan validé de Jules (section 0 de son document) fait foi : décisions, sources débranchables, dix lots, validation par comparaison avec Data-B.

- **Zone** : Alpes-Maritimes d'abord ; les autres départements au fil des dossiers.
- **Sources payantes** : Google Places et Equimmox. Pas de Pappers (dirigeants et comptes par le Registre national des entreprises, API INPI), pas de Mytraffic (le flux reste un indice estimé).
- **Annonces** : collecte automatique (lot 3), risque juridique assumé par Klocka : des faits seulement, rythme lent, robots.txt, un interrupteur par site, usage interne.
- **Data-B** : reste utilisable comme une source parmi les autres, mais doit pouvoir être débranché sans aucun impact ; tout passe par un adaptateur unique avec un interrupteur (lot 2).
- **Contrat Data-B** : hors du plan.
- **Validation** : comparaison avec Data-B seulement, toujours sur le résultat calculé **Data-B coupé** ; 30 adresses des Alpes-Maritimes par outil ; seuils du plan (§ 0.4).
- **Poids de départ des loyers** : bail Klocka 3, fiche ou saisie 1,5, Equimmox 1, Data-B 1, annonce 1 ; réglables dans Paramètres › Sources.
- **Ordre des lots** : 1 socle, 2 Data-B débranchable, 3 collecte d'annonces, 4 Valeur locative (finition), 5 Estimation, 6 K-Transactions et K-Foncier, 7 inventaire et vacance, 8 K-Zoning et K-Expertise, 9 K-Prospective, 10 intégration dans Haka. Si le comptage des loyers sur Render est faible dans le 06, la collecte d'annonces passe juste après le lot 1 (Jules le dira).

## Lot 1, socle commun : compte rendu (18 oct. 2026)

Livré derrière l'interrupteur de la boîte à outils (`BOITE_OUTILS=1` ou Paramètres › Sources, éteint par défaut).

- **Registre des sources** (`server/socle/registre-sources.js`) : chaque source avec son interrupteur et son poids, réglables sans redéployer (Paramètres › Sources, Jules seul) ; `viaSource` : une source coupée ou en panne rend « rien », jamais une erreur. `SOURCES_COUPEES` coupe au démarrage.
- **Identifiant de local** (`server/socle/local.js`) : `L-<identifiant BAN>`, rattaché à la parcelle (cadastre IGN), au tronçon (BD TOPO, noms abrégés reconnus), à l'IRIS et au carreau de 200 m ; gardé 90 jours (LocalKlocka). `GET /api/socle/local`.
- **Format commun** (`server/socle/format-commun.js`) : un adaptateur par outil, les neuf.
- **Entrepôt** (`server/socle/entrepot.js`) : jeux datés (source, millésime, date d'import, licence) ; imports de la nuit sur le 06, de 1 h à 6 h, sur Render : communes, ventes de locaux DVF, contours IRIS, SIRENE et BODACC ; un import raté notifie l'équipe. Cadastre, tronçons, carreaux, personnes morales et ILC se lisent à la demande.
- **Valeur locative** : poids lus dans le registre ; Equimmox et Data-B passent par leurs interrupteurs.
- **Critère de fin** : `npm run socle:verifier -- --data-b-coupe` (toutes les adresses des dossiers du 06 en identifiant de local) ; `npm run socle:format -- --data-b-coupe` (le format commun sur les vrais résultats).
- **Test « Data-B coupé »** : dans `npm test` (une source coupée ne lève rien ; aucun module du socle n'importe Data-B). Le test complet des neuf outils sur dix adresses vient avec le lot 2 (l'adaptateur Data-B).

Reste du lot 1 :
- Les caches par adresse des outils ne sont pas encore remplacés par l'identifiant de local : chaque outil le recevra en passant à son lot (4 à 9).
- Imports en masse non faits : cadastre, personnes morales, carreaux Filosofi, équipements INSEE, horaires de transport, Géorisques, DVF+ (lus à la demande ou avec leur lot).
- SIRENE et BODACC demandent `INSEE_SIRENE_CLE` : absente en local, à vérifier sur Render.
- K-Vacance, K-Foncier, K-Transactions et K-Zoning ne gardent pas leur résultat : le format commun se vérifie sur un appel en direct, pas sur la base.

## Lot 3, cadrage des sources d'annonces (18 oct. 2026, avant toute construction)

Comptage Render : 8 loyers Klocka dans le 06 (7 Nice, 1 Beaulieu), dont 1 bail lu. Décision de Jules : le lot 3 passe avant le lot 2.

Conditions d'utilisation et robots.txt relevés le 18 oct. 2026 (pages gardées dans le scratchpad de la session) :

| Source | Verdict |
| --- | --- |
| SeLoger Bureaux & Commerces, Logic-Immo | Collecte interdite (CGU art. 8.3, base protégée ; recherche bloquée au robots.txt ; Jinka condamnée en 2025) |
| Leboncoin | Collecte interdite (CGU art. 11.1.2, robots interdits ; jurisprudence Entreparticuliers, CA Paris 2021, Cass. 2022) |
| BureauxLocaux (CoStar) | Rien sur les robots, mais recherche bloquée et usage commercial interdit |
| Geolocaux | robots.txt ouvert (plans du site des annonces nouvelles et retirées), mais base protégée par les mentions légales |
| Bpifrance Transmission | Interdit sans accord ; programme de partenaires |
| Fusacq, ParuVendu, Michel Simond | Interdit par les CGU |
| CessionPME | CGU illisibles (403), piège à robots : seulement par accord |
| Agences du 06 (ex. Locopro) | Reproduction interdite par les mentions ; demander directement |

Voies sûres : Equimmox en mode « Offre » (les annonces, déjà sous notre abonnement), les fiches reçues des agents, un flux sous licence (Melo, Yanport), des accords directs (Bpifrance, CessionPME, agences).

## Lot 3, sites des agences du 06 : vérification (18 oct. 2026)

Décision de Jules : collecte directe sur les sites des agences du 06, pas les portails. On ne collecte que là où rien ne l'interdit ; une mention « reproduction interdite » sans parler d'extraction est « douteuse » et Jules tranche sur la phrase exacte. Vérification gardée par site (SiteAgence : date, phrase, page lue), refaite tous les mois ; un site devenu interdit sort de la collecte de lui-même (`server/annonces/verification.js`, `npm run annonces:verifier -- 06`).

507 sites (carnet des agences de la Prospection, 06) : **227 autorisés, 135 douteux, 68 interdits, 77 injoignables**. Liste complète, avec la phrase lue et la page, dans `docs/plans/lot3-sites-agences-06.csv`.

- Un hébergeur commun (212.83.187.x, 126 sites, très probablement Apimo) a fermé sa porte après la rafale du second passage : pour ces sites, le verdict du premier passage est repris et à revérifier au calme. La vérification va désormais au rythme d'un serveur (une requête à la fois par adresse IP, 4 s entre deux sites) ; la collecte fera de même.
- Logiciels vus au premier passage (avant le blocage) : Apimo en tête (96 sites autorisés), puis Hektor, WordPress, Netty, Adapt Immo, Twimmo, Immo-Facile, Ubiflow.
- Les douteux tiennent surtout en une phrase, celle du gabarit Hektor (61 sites) : « Par conséquent, leur exploitation offline ou online, à titre gratuit ou onéreux, de tout ou partie de ces données sans le consentement exprès de l'Éditeur est interdite. » Puis celle de Netty (11 sites) : « La reproduction ou représentation, intégrale ou partielle, de ce site sur un support électronique ou tout autre support quel qu'il soit est formellement interdite sauf autorisation expresse de la société Netty. »

### Décisions de Jules sur les douteux (18 oct. 2026)

- Gabarit Hektor (« exploitation offline ou online ... de ces données ») : **interdit**, colonne « accord à demander ».
- Netty et variantes « toute reproduction interdite » : **autorisé, faits seulement** (adresse, surface, loyer, date, lien).
- Les autres : la phrase parle de l'exploitation des données → interdit ; d'autre chose → autorisé ; sinon, montrée à Jules. Codé dans `trancherDouteux` ; appliqué par `npm run annonces:trancher`.

Nouveaux totaux : **295 autorisés, 130 interdits (dont 62 « accord à demander »), 77 injoignables, 5 douteux** (quatre phrases qui nomment les données sans parler de leur exploitation : Palais Immobilier, Century 21 Lafage, Locopro, Foncia ; un site à relire).

### Le blocage Apimo (18 oct. 2026)

Le serveur d'Apimo (`web2.apimo.pro`, 212.83.171.8, et 212.83.187.122, chez Scaleway) a fermé sa porte à l'adresse de la machine de Jules (81.65.160.211), d'où tournait la vérification ; Render n'a rien lu. Aucun contournement (ni autre adresse, ni proxy, ni Render). Le lecteur Apimo attend la levée du blocage pour qu'on voie la structure des pages ; la Wayback Machine nous limite aussi pour l'instant.

### Le cadre de collecte (18 oct. 2026)

`server/annonces/collecte.js`, derrière BOITE_OUTILS, la source « annonces » (Paramètres › Sources) et `ANNONCES_COLLECTE=1` ; sur Render seulement. Budget par serveur (`ANNONCES_BUDGET_SERVEUR`, 120 requêtes par jour par défaut, une toutes les 12 minutes au plus), une lecture par jour par site, un 403 ou un 429 coupe le serveur 7 jours et prévient Jules, revérification mensuelle au même rythme. Faits seulement, loyer annuel, identifiant de local, dédoublonnage (même local, surface à 2 m² près, loyer à 3 % près). Lecteurs par logiciel : aucun encore (Apimo d'abord).

## À ranger dans le lot 4 (Valeur locative), à ne pas traiter avant

1. Vérifier que le loyer de chaque lot est le loyer en cours à la date du dossier ; si c'est un loyer de signature de bail, actualiser depuis la date du bail.
2. Trouver ce que Data-B mesure à la rue et au quartier : loyers demandés ou signés, surface pondérée ou utile, HT/HC, nombre de références. Le dire à Jules avant de changer quoi que ce soit. D'ici là, comparer Valeur locative et Data-B à l'échelle de la ville seulement.
3. Afficher le nombre de comparables réels derrière chaque fourchette.

## Décisions antérieures

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

## Usages de Data-B hors des neuf outils (à faire passer par l'adaptateur au lot 2)

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
- Test réel du 18 oct. 2026 (base locale, Equimmox et Data-B actifs) : 45 rue d'Antibes à Cannes, 20 avenue Jean Médecin à Nice, 10 rue de la République à Antibes. Partout Equimmox affiché (confiance faible : 0 ou 1 loyer Klocka dans le 06). Data-B lit 47 à 54 % plus haut à la rue, 71 à 73 % plus haut au quartier, et tombe à 1 à 17 % de la valeur à la ville : ses échelles fines ne sont pas comparables aux baux constatés d'Equimmox. Correction le même jour : Equimmox affiché l'est à son échelle la plus fine (la rue), plus à celle du cercle Klocka.
- Comptage en lecture seule pour Render : `npm run comptage-loyers` (option `--ban` pour vérifier les adresses, `--json`). Quand il sera connu, on règle `POIDS`, `MIN_PAR_CERCLE` et `SEUILS`, sans rien changer d'autre.

## Ordre de construction recalé

L'état des lieux raccourcit le plan : la sortie de Data-B tient d'abord à deux outils, le reste est de la consolidation.

1. **Valeur locative sans Data-B.** Les loyers des dossiers Klocka (lots, valeurs locatives déjà lues) comme première source, en cercles (rue, IRIS, commune), actualisés à l'ILC ; Equimmox en témoin ; Data-B appelé en parallèle et gardé à côté pour comparer, sans être affiché. Test « on retire un loyer et on le prédit ».
2. **K-Expertise sans Data-B.** L'étude interne existe déjà en repli : en faire la référence, Data-B en parallèle le temps de comparer.
3. **F1 commun** : un identifiant de local (BAN, parcelle, IRIS, carreau) que tous les outils reçoivent, à partir du code existant.
4. **Contrat commun** : chaque outil renvoie valeur, fourchette, confiance, sources datées, détail ; Haka les reçoit ainsi.
5. Les autres usages de Data-B (transactions, mandataires, off-market, assistant), un par un, puis la résiliation à l'échéance du contrat.

## Lot 6, K-Transactions : compte rendu (18 oct. 2026)

Derrière `BOITE_OUTILS` ; éteint, l'outil garde son rayon de 500 m. `server/ktransactions-murs.js`, branché dans `ktransactions.analyser`.

- Fait : identifiant de local (`resoudreLocal`) ; les ventes « Local industriel, commercial ou assimilé » (dvf.js écarte déjà les actes mêlés à d'autres biens) ; prix au m² hors du 5e–95e centile de la commune écartés ; recherche par cercles parcelle → rue → IRIS → commune jusqu'à 5 ventes ; quartiles, nombre, période, médiane par année ; ventes de la rue ; dernière mutation de la parcelle (DVF entier, tous biens) ; ventes Klocka des projets signés (source `klocka_transactions`) ; `entrepot_dvf` et `entrepot_iris` quand la commune y est, sinon les fichiers DVF ; tout par `viaSource`.
- Essais réels : 45 rue d'Antibes à Cannes (entrepôt) : 24 ventes dans la rue, 7 915 € / m² (5 756 à 8 631) ; 20 avenue Jean Médecin à Nice (fichiers) : 18 ventes dans la rue, 4 095 € / m² ; 1 place Masséna : dernière mutation de la parcelle le 12/10/2023, 1 210 000 €.
- Reste : l'actualisation des prix (aucun indice public des prix des murs commerciaux : prix nominaux, médiane par année affichée, à trancher par Jules) ; DVF+ (Cerema) pour regrouper les mutations à plusieurs lots ; la comparaison avec Data-B sur 30 adresses (attend l'adaptateur du lot 2).

## Lot 6, K-Foncier : compte rendu (18 oct. 2026)

Derrière `BOITE_OUTILS`. `server/kfoncier-local.js`, branché dans `kfoncier.analyser` (champ `local`), bloc « Les murs de l'adresse » dans la page.

- Fait : parcelle du local ; propriétaires personnes morales de la parcelle (miroir du fichier DGFiP) ; société par SIREN, sinon par nom et commune dans l'annuaire des entreprises avec un score (seuil 0,6, montré) ; dirigeants (RNE via l'annuaire) ; alertes BODACC (procédures collectives, cessions, radiations, décès) ; dernière mutation DVF de la parcelle ; sans personne morale : « Personne physique, non identifiable ».
- Essais réels : 20 avenue Jean Médecin (Groupe GT par SIREN, deux dirigeants ; SCI NICIM sans SIREN, introuvable à l'annuaire, dit comme tel) ; 45 rue d'Antibes (société par SIREN) ; place Masséna (personne physique).
- Fichier DGFiP récent (18 oct. 2026) : `server/socle/imports/personnes-morales.js` lit le répertoire du zip national de data.gouv.fr (situation 2025, 200 Mo) puis seulement le fichier du département par une requête de plage (5 Mo pour le 06) ; table `entrepot_pm`, jeu `personnes_morales_dgfip` (180 jours). K-Foncier le lit avant le miroir de 2021. Import réel du 06 : 455 933 locaux en 10 s. Au 20 avenue Jean Médecin, la SCI sans SIREN en 2021 devient « Société civile NICIM », SIREN 402313944, trois dirigeants.
- Reste : l'API RNE de l'INPI en direct (compte gratuit à créer) ; la comparaison avec Data-B.

## Lot 5, Estimation : compte rendu (18 oct. 2026)

Derrière `BOITE_OUTILS`. `server/kestimation-boite.js`, appelé par `kestimation.js` (`estimer` devient asynchrone).

- Trois valeurs calculées par le code : comparaison (murs de K-Transactions par cercles, ajustée à la taille : ventes de la moitié au double de la surface s'il y en a 5) ; capitalisation (loyer en place, sinon loyer Equimmox × surface pondérée ; taux des projets Klocka signés de la commune, au moins 3, sinon rendement implicite loyer Equimmox ÷ prix DVF, sinon la grille de l'outil, dit) ; Equimmox prix des murs (offres).
- Valeur retenue : médiane des méthodes (moyenne à deux) ; confiance par l'écart (≤ 15 % haute, ≤ 30 % moyenne) ; ce qui manque est listé ; l'ancien calcul reste à côté (`valeurs_grille`) pour comparer.
- Constat de méthode : local vacant, loyer de marché au rendement implicite = prix DVF × surface, c'est-à-dire la comparaison elle-même. Cette capitalisation est montrée mais ne compte ni dans la médiane ni dans la confiance.
- Essai réel : 45 rue d'Antibes, Cannes, vacant, 80 m², Equimmox en direct : comparaison 657 000 € (18 ventes de surface proche, 8 212 € / m²), Equimmox 328 000 € (79 offres, 4 094 € / m²), retenu 493 000 €, confiance faible (écart 67 %). L'écart entre ventes de la rue et offres Equimmox est le premier point à regarder avec Jules.
- Reste : la comparaison avec Data-B (écart médian < 15 % sur 30 adresses) ; peu de projets Klocka signés : le taux vient surtout du rendement implicite.

## K-Vacance, le stock SIRENE (18 oct. 2026)

- `server/socle/imports/sirene-stock.js` : le fichier StockEtablissement mensuel de data.gouv.fr (licence ouverte, sans clé, 2,9 Go zippé, coordonnées Lambert 93 comprises) lu en flux, jamais posé sur le disque ; on garde le département (06), actifs et fermés depuis moins de 8 ans, diffusion publique ; seconde passe sur StockUniteLegale (1 Go) pour le nom et la catégorie juridique des entreprises gardées. Table `entrepot_sirene`. Jeu `sirene_stock` de l'entrepôt, par département, tous les 30 jours.
- `outils/vacance-sources.js` lit ce stock d'abord (vitrines, fermetures, établissements par SIREN) quand la commune y est et que la source est active ; sinon l'API comme avant. Plus besoin de `INSEE_SIRENE_CLE` pour le 06.
- Import réel du 06 (base locale, 18 oct. 2026) : 2 minutes, 44 282 364 lignes lues, 555 243 établissements gardés sur 163 communes (356 854 actifs, 198 389 fermés depuis moins de 8 ans), 461 714 entreprises toutes nommées, 88 % géolocalisés ; la base locale passe à 521 Mo. Cannes sans clé : 8 255 établissements à vitrine, 6 545 fermetures depuis 2024, lus en 1,4 s.
- Sur Render : lire en flux comme ici, vérifier la place sur /var/data avant le premier passage de nuit, garder le rythme de 30 jours.
- K-Vacance lit aussi son registre dans ce stock (champ `registre_origine` : stock ou api) et garde son résultat avec la recherche, avec l'identifiant de local (`derniereAnalyse`). Tout derrière `BOITE_OUTILS`. Essai sans clé, 45 rue d'Antibes à Cannes : 1 935 établissements dans la zone, 8 383 dans la commune, taux au registre de 5,7 %.
- Reste : BPE.



## Lot 8, K-Expertise et K-Zoning : compte rendu (18 oct. 2026)

Derrière BOITE_OUTILS ; chaque source passe par son interrupteur (registre : georisques, gpu, isochrones_ign, sncf_gares, osm).

- **Sources ouvertes** (`server/outils-kd/sources-ouvertes.js`), vérifiées sur Cannes : Géorisques (risques de la commune), Géoportail de l'urbanisme (zone du PLU, prescriptions, linéaire commercial protégé), SNCF (2 792 gares et leur fréquentation 2024, rapprochées par le code UIC), arrêts de transport (OpenStreetMap). Gardées 14 à 90 jours.
- **Indice de flux** (`emplacement.js`) : 0 à 100, six composantes notées chacune contre un plafond et pondérées (habitants et entreprises à 5 minutes, gares pondérées par leurs voyageurs et la distance, arrêts à 300 m, générateurs, commerces du tronçon) ; une composante sans donnée est retirée et l'indice dit sur combien il repose. Estimation relative, à étalonner.
- **K-Expertise** : étape « Emplacement » (classement n°1, n°1 bis, n°2, secondaire ; note de chaque critère ; réserves PLU, risques ; activités adaptées et déconseillées ; dernier loyer déjà lu). L'étude interne devient la référence quand la boîte est allumée ; Data-B ne passe plus qu'à travers son interrupteur (`sources-marche.js`). Essai réel Data-B coupé, 45 rue d'Antibes à Cannes : emplacement n°1, indice 77 sur 6 composantes.
- **K-Zoning** : `POST /api/kzoning/chalandise` et un panneau sur la page : trois zones à pied (isochrones IGN, Filosofi, recensement), commerces et concurrence d'une activité dans la zone primaire, gares, arrêts, indice. Essai réel : 1 086 / 5 393 / 13 971 habitants, 484 commerces dont 10 boulangeries, indice 72 sur 4 composantes.
- Format commun : K-Expertise rend le classement et l'indice ; K-Zoning la chalandise.

Reste : l'étalonnage du classement (8 cas sur 10 face à Data-B, Data-B coupé, 30 adresses), les horaires GTFS (fréquence des passages), la BPE, les comptages piétons municipaux ; le rapport d'une page pour l'étude client.

## Lot 9, K-Prospective : compte rendu (18 oct. 2026)

- **Savoir à qui l'on parle** (`server/outils-kd/prospective.js`), étape « contacts » derrière BOITE_OUTILS : téléphone, site et statut sur Google Places (retenus seulement, quarante au plus), signaux de vacance déjà relevés (vacance_signal), historique avec Klocka (cible ALX), score d'intérêt sur 100 ; les retenus sont classés par intérêt. Essai réel, boulangeries à 500 m du 45 rue d'Antibes : 11 trouvées, 11 joignables.
- Page : intérêt, signaux, coordonnées, « déjà chez Klocka ».

- Recherche par **commune entière** (choix sur la page) : la commune vient de l'entrepôt (pas de la BAN, qui prenait « Antibes » pour la rue d'Antibes), le rayon couvre son emprise (8 km au plus) et seuls les commerces dans l'emprise restent. Essai réel : 31 opticiens à Antibes, 31 joignables.

Reste : la recherche par rue, l'export vers la page Appels, la phrase d'accroche de Haka (lot 10), et le remplacement de la Prospective Data-B des mandataires (quatre écrans, contacts et solvabilité).


## K-Foncier : vérification (19 oct. 2026, Jules : « vérifie que ça marche bien »)

Méthode : 60 adresses du 06 (15 par ville : Nice, Cannes, Antibes, Menton) prises parmi les cibles d'ALX dont le propriétaire vient de Data-B Foncier (stocké le 13 sept.), une par parcelle, tirage régulier. Chaque adresse passe par K-Foncier (boîte allumée) ; on compare le SIREN du propriétaire et la parcelle. Data-B n'est pas rappelé : la référence est ce qu'il avait déjà rendu.

- Premier passage : **40 propriétaires retrouvés sur 58** personnes morales de la référence (2 des 60 sont des personnes physiques, que le fichier de l'administration ne contient pas par construction), 69 %, sous le seuil de 90 % du plan.
- Défaut trouvé : la parcelle de l'adresse était prise au point de la BAN, qui tombe souvent sur la parcelle voisine (16 écarts sur 18 : le bon propriétaire était sur la bonne parcelle dans nos données). Corrigé dans `socle/local.js` : la parcelle vient d'abord du fichier de l'administration (entrepot_pm, par numéro et nom de voie), le point en repli ; K-Foncier rend aussi les propriétaires des autres parcelles qui portent la même adresse, et ne dit « personne physique » que si la section a été lue (sinon « propriétaire non lu »).
- Deuxième défaut, plus large : `adresse.js` résolvait « 5 rue de France, Nice » en « 5 rue de Nice, Drancy » (« france » était un mot vide). Corrigé et testé ; touchait tous les outils.
- Après correction : **45 sur 58 (78 %)**. Les 13 écarts : 8 portent sur une parcelle dont le fichier donne un autre numéro de rue que celui demandé (de 2 à 49 numéros d'écart : la référence décrit un immeuble voisin), 3 n'ont pas de numéro dans la référence, 1 est un restaurant, 1 est un vrai écart (7 promenade des Anglais). Sur les adresses où la référence et nous parlons du même numéro, **45 sur 47**. Ce second chiffre est une lecture de nos écarts, pas une preuve indépendante : la preuve passe par un contrôle à la main de quelques cas (cadastre.gouv.fr, Street View).
- Ce que K-Foncier ne donne pas, par choix légal : le nom des personnes physiques, que Data-B donne parfois (« Monsieur … »).
