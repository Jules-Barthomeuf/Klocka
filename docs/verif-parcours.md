# Vérification du parcours mandataire : de la Prospection à l'Avis de valeur

31 octobre 2026, sur `main` à jour (09e973c). Rien n'a été corrigé, tout est constaté.

## Conditions

- **Tests automatiques.** `npm run test:parcours` et `npm run test:haka` n'existent pas sur `main`. Le premier est sur la branche `test-parcours` (PLAN T.1), le second sur `l2-haka`, non fusionnée. Les deux ont été copiés dans un dossier de `main`, sans commit, et lancés contre le code de `main`.
  - `test:parcours` tourne sur une base vierge avec un faux modèle.
  - `test:haka` tourne sur une base jetable avec le vrai modèle.
- **Parcours à la main.** Fait avec Playwright, sur le serveur de `main` lancé sur une **copie** de la base locale. Toutes les clés extérieures étaient vidées : Monday, Twenty, mails, MyNotary, Data-B, Equimmox. Restaient le modèle et la carte Google. La vraie base n'a pas été touchée.
  - Compte : `test.mandataire@kpartners.fr`. Sur la copie seulement, il a reçu un mot de passe et un secteur Antibes (il n'en avait pas).
  - Commerces : Ba & Co sur ordinateur (1440 × 900), Pizza Fifi sur téléphone (390 × 844).
- **Temps.** L'écran est servi par Vite en mode développement. Le premier chargement de l'écran, environ 35 s, est un coût de développement et ne compte pas. Les temps donnés sont ceux d'un second chargement.

## 1. Tests automatiques

### `test:parcours` (étapes 1 à 10) : 4 passent, 2 cassent, 8 non lancées

| Étape | Ordinateur | Téléphone |
|---|---|---|
| Préparation des données test | Passe | |
| 1 · Connexion, Prospection s'affiche | Passe | |
| 2 · Client test dans le carrousel, ses villes appliquées | **Casse** : aucun client test proposé | |
| 3 · Clic sur le commerce, fiche en moins de 2 s | Non lancée | Passe (0,76 s) |
| 4 · Ajout à une liste, « À contacter » | Non lancée | |
| 5 · Dictée « Vu l'exploitante… », « Contacté » | Non lancée | Passe |
| 6 · Dictée du rendez-vous, bien en Pré-visite | Non lancée | |
| 7 · Pré-visite : préparation affichée | Non lancée | **Casse** : pas de bouton « Voir la fiche » |
| 8 · Dictée de visite, l'avis démarre | Non lancée | |
| 9-10 · Mandat | Non lancées | |

Les deux échecs viennent surtout de l'écart entre le test, écrit sur d143844, et `main` :
- le client test est désormais caché aux mandataires (L0, ligne 0.1) ;
- l'écran Visite du téléphone a changé.

Captures : `verif-parcours/auto-etape2-ordinateur.png`, `verif-parcours/auto-etape7-telephone.png`.

### `test:haka` (20 phrases + 2 du terrain) : **8/20**, terrain 1/2

- **Échouent :** 1, 6, 8, 10, 11, 12, 14, 15, 16, 17, 19, 20, et le cas terrain 22.
- **Raison :** l'assistant de `main` n'a pas encore le manuel des principes ni les outils `ma_fiche` et `mettre_en_pause` (PLAN 2.2 et 2.3, branche l2-haka, où le même banc donne 20/20).
- **Erreurs typiques :**
  - il ne montre pas l'ancien et le nouveau loyer ;
  - il ne dit pas qu'une fiche est introuvable ;
  - il ne met pas en pause un rendez-vous annulé ;
  - il ne donne ni le loyer ni sa source ;
  - il crée une fiche sans accord (cas 20).

Détail : `verif-parcours/test-haka-main-rapport.md`.

## 2. Parcours à la main

| Étape | Ordinateur | Téléphone | Temps | Résultat | Détail |
|---|---|---|---|---|---|
| a · Le client test apparaît | Non | Non | | **Bloquant** | Le client test (n°32, Alimentaire, Alpes-Maritimes, 300–500 k€) n'est jamais proposé : 15 clients, aucun alimentaire. C'est la règle L0 0.1, qui contredit ce point de la demande. |
| a · « Prospecter » applique ses villes (Client n°3) | Oui | Oui | 3 s | Gênant | Antibes est appliquée, mais il faut toujours un second clic sur « Prospecter » (PLAN 1.1). Le choix du client est perdu au rechargement. |
| a · Points affichés complets | 50/50 | 50/50 | | OK avec un client, gênant sans | Avec le Client n°3 : 50 murs, tous avec signal, exploitant et propriétaire. Sans client : 3 524 points (PLAN 1.2, quelques dizaines attendues). |
| a · Chargement de la carte | 2,3 s | 1,5 s | | OK | Au premier passage, une fenêtre « Mission du jour » couvre la page. Sur téléphone, un bandeau « Propriétaires : 3590 à chercher » s'affiche. |
| a · Clic sur un commerce | 0,98 s | 0,99 s | < 2 s | OK | |
| b · Ajout à une liste | Oui | Oui | 0,1 s | OK, gênant | La fiche passe « À contacter » et la liste apparaît avec 1 fiche. Le bouton propose « Ajouter à ma liste « Lyon · exemple » » pour un commerce d'Antibes. |
| c · « Vu l'exploitante… M. Bernard, 06… » | Contacté | **Reste À contacter** | 4,6 s | **Bloquant** | Ordinateur : statut et numéro notés, mais la source dit « dit à l'Assistant KPartners », sans « à confirmer ». L'ancien propriétaire « Tara » est écrasé sans être montré, puis noté comme exploitant. La ligne Murs affiche encore « TARA · Société civile ». La liste à côté reste « À contacter » jusqu'au rechargement. Téléphone : source « d'un tiers, à confirmer » correcte, mais le statut n'avance pas et l'historique est écrit deux fois. Relance proposée sur les deux. |
| c · « RDV jeudi 10 h avec M. Bernard » | Oui | Oui | 5,6 s | OK | Rendez-vous le jeudi 5 novembre à 10 h, bien dans Biens en Pré-visite, historique gardé. |
| d · Préparation de la Pré-visite | Partielle | Partielle | 2,5 s (ordi), 43 s (tél., premier calcul) | Gênant | Questions et documents affichés. **Ni pré-estimation interne ni clients compatibles** : sans prix Data-B, ces parties sont omises sans le dire. Sur téléphone, seuls les documents sont visibles. La fiche dit « Murs : L'exploitant lui-même » alors que M. Bernard est noté propriétaire. Photo d'un autre commerce sur Ba & Co. |
| e · Dictée de visite, l'avis démarre | Oui | Oui | 0,3 à 0,5 s | OK | Le loyer de 25 200 € HT HC est repris, pas redemandé. Le compte rendu affiche « 25 k€ par an ». Le panneau de l'assistant se rouvre vide. |
| f · Calcul de l'avis | Oui | Oui | environ 40 s en 3 échanges | OK, gênant | Voir le détail ci-dessous. Après le « oui », l'assistant pose 8 à 10 questions : les charges en double, la taxe foncière redemandée alors qu'elle a été dite. |
| g · PDF = calcul | **Non** | | | **Bloquant (à confirmer par un vrai Cmd+P)** | « Télécharger le PDF » lance `window.print()`. L'impression par Chrome de la page Biens donne **1 page blanche** (`verif-parcours/g-avis-imprime-vide.pdf`). |
| g · Deck = calcul | Oui | Oui | | OK, gênant | Mêmes chiffres : 25 200 €, 6,5 %, 373 000–403 000 €, 388 000 €, 315 €/m². Défauts : « 80 m² Surface pondérée » pour une surface utile, « Refacturée au locataire · refacturées au locataire », « La ville de Antibes ». |
| 3 · Aucun client test ni nom d'investisseur | Oui | Oui | | OK | 53 noms cherchés dans 286 réponses lues (serveur, écrans, carrousel, avis, deck, 3 questions piégées à l'assistant) : aucun trouvé. Incohérence : l'assistant dit « aucune demande d'investisseur à Antibes » alors que la Prospection montre 14 clients. |

### Le calcul de l'avis (f), recalculé à la main

| | Affiché | Recalcul |
|---|---|---|
| Loyer | 25 200 € HT HC par an | dicté |
| Taux | 6,5 % (taux de base proposé pour Antibes, sans ajustement) | Data-B coupé, aucun taux de secteur |
| Valeur | 388 000 € | 25 200 ÷ 0,065 = 387 692 € ✓ |
| Rendement | 6,5 % | dans la plage 4–10 % ✓ |
| Fourchette | 373 000 – 403 000 € | soit 6,76 % à 6,25 % |
| Sensibilité | 6,35 % → 396 900 €, 6,7 % → 376 100 € | 396 850 et 376 119 ✓ |
| Prix honoraires inclus | 407 400 € (6,2 %) | 388 000 × 1,05 ✓ ; 25 200 ÷ 407 400 = 6,19 % ✓ |
| Coût total acquéreur | 438 000 € (5,8 %) | 407 400 × 1,075 = 437 955 ✓ |

Aucun rendement hors de la plage, et aucune erreur de loyer mensuel ou annuel, de charges, de TVA ou de prix. Le calcul est identique sur ordinateur et sur téléphone, et le deck reprend les mêmes chiffres.

Deux réserves :
- l'avis montre deux fourchettes différentes, 373–403 k€ et 376,1–396,9 k€ ;
- deux numéros de carte CPI différents apparaissent dans l'avis (« 7101 2026 000 123 » en page 2, « 7501 2024 000 000 529 » en conclusion).

## 3. Les 5 problèmes les plus graves

1. **Le PDF de l'avis sort vide** (g, bloquant, à confirmer par un vrai Cmd+P).
   - *Ce qui se passe :* l'impression de la page Biens donne une page blanche.
   - *Attendu :* les 8 pages de l'avis, avec les chiffres du calcul.
   - *Fichiers probables :* `src/components/mandataire/avis-valeur.css`, bloc `@media print`. Il place `.avis` en position absolue en haut du document et ne déplie que les conteneurs `.avis-*`. Le cadre de l'écran Biens, scindé et à hauteur fixe, n'est pas déplié. Le bouton est dans `src/components/mandataire/EditeurAvis.jsx:1222`.

2. **Le client test est invisible au mandataire, donc le parcours de test ne peut pas démarrer** (a, et test:parcours étape 2, bloquant).
   - *Ce qui se passe :* le client « Alpes-Maritimes, 300–500 k€, ≥ 6 %, alimentaire » n'est jamais proposé.
   - *Attendu, selon ta demande :* qu'il apparaisse. *Selon PLAN 0.1 :* qu'un mandataire ne le voie jamais. Il faut trancher : un compte de test qui voit les clients test, ou un client de démonstration non marqué test.
   - *Fichiers probables :* le filtre `estTest` de `server/mandataire-espace.js`, et `tests/parcours/donnees.mjs` (branche `test-parcours`).

3. **L'assistant de `main` ne tient pas ses règles** (c, et test:haka 8/20, bloquant).
   - *Ce qui se passe :* le même message fait avancer le statut sur ordinateur, pas sur téléphone. Un propriétaire connu est remplacé sans montrer l'ancien. Un numéro donné par l'exploitante est noté comme dit par le mandataire. Une fiche est créée sans accord.
   - *Attendu :* les 9 principes de `docs/haka-principes.md`.
   - *Fichiers probables :* `server/mandataire.js` (consigne et `modifier_fiche`). Les corrections existent sur `l2-haka` (20/20), non fusionnée.

4. **Une fiche dit deux choses différentes après la dictée** (c et d, gênant).
   - *Ce qui se passe :* l'historique et le chat disent « propriétaire M. Bernard », mais la ligne Murs garde « TARA · Société civile », ou « L'exploitant lui-même » sur Pizza Fifi. La liste ne change de statut qu'au rechargement. La photo est celle d'un autre commerce.
   - *Attendu :* une seule vérité sur la fiche, la liste à jour tout de suite (PLAN 1.5).
   - *Fichiers probables :* `server/fiche-mandataire.js` (rangées Murs et Exploitant lues depuis le commerce, pas depuis `nom` ni `corrections`), et le rafraîchissement de la liste dans l'écran Listes de la Prospection.

5. **La Pré-visite est incomplète sans le dire** (d, gênant).
   - *Ce qui se passe :* ni pré-estimation interne ni clients compatibles quand Data-B ne donne pas de prix. Sur téléphone, seuls les documents se voient, et le premier calcul prend 43 s.
   - *Attendu :* les quatre parties, ou une ligne qui dit pourquoi l'une manque.
   - *Fichiers probables :* `server/preparation-rdv.js:203` (`estimation: prix ? … : null`) et `:211` (clients compatibles), et l'écran Visite du téléphone.

Également relevés :
- 3 524 points sans client (PLAN 1.2) ;
- le second clic « Prospecter » (PLAN 1.1) ;
- des questions redondantes au début de l'avis ;
- deux fourchettes et deux numéros CPI dans l'avis ;
- la pastille « 1/6 » qui masque le loyer sur téléphone ;
- une ligne d'historique en double ;
- l'assistant qui dit « aucune demande à Antibes » quand la carte en montre 14.

## Captures (dossier `verif-parcours/`)

- `auto-etape2-ordinateur.png`, `auto-etape7-telephone.png` : échecs de `test:parcours`.
- `a-clients-sans-client-test.png` : la liste des clients, sans le client test.
- `a-fenetre-mission-du-jour.png` : la fenêtre qui couvre la Prospection au premier passage.
- `c-fiche-murs-incoherents.png` : Murs « TARA » après « les murs sont à M. Bernard », et photo d'un autre commerce.
- `c-telephone-statut-non-avance.png` : la réponse sur téléphone, statut resté « À contacter ».
- `d-previsite-sans-preestimation.png`, `d-telephone-previsite.png` : la Pré-visite.
- `f-questions-redondantes.png`, `f-avis-calcule.png`, `f-telephone-pastille-masque.png` : l'avis.
- `g-avis-imprime-vide.pdf`, `g-deck.png` : le PDF vide et le deck.

## Corrections (31 oct. 2026, branche `verif-corrections`, partie de `main` 09e973c)

| Capture | Problème | Correction | Commit |
|---|---|---|---|
| `g-avis-imprime-vide.pdf` | Le PDF de l'avis sort en page blanche depuis Biens | Les pages sont recopiées à la racine du document pour l'impression ; les photos et les aplats s'impriment. Vérifié : 8 pages, mêmes chiffres que le calcul (`g-avis-imprime-corrige.pdf`) | ab7b809 |
| `a-clients-sans-client-test.png`, `auto-etape2-ordinateur.png` | Le client test n'est jamais proposé | Deux causes. 1) `Records.champs` rendait les objets en texte JSON : aucun client cherchant par département ou par région n'avait de ville, vrais clients compris. 2) Le compte d'essai (`test.…@`) voit maintenant les clients test ; un vrai mandataire jamais. Vérifié : « Client n°32 · Alimentaire · 300–500 k€ », 22 murs à Antibes | cd45662 |
| `c-fiche-murs-incoherents.png` | La ligne Murs garde « TARA » ou « L'exploitant lui-même » quand la fiche dit M. Bernard | Le propriétaire donné par le mandataire passe devant le registre | 47e09cd |
| `f-questions-redondantes.png` | Les charges demandées deux fois, la taxe foncière redemandée | Les questions en double ne se posent plus ; « taxe foncière refacturée » compte comme une réponse | a3353e4 |
| `g-deck.png` | « Surface pondérée » pour une surface utile, « Refacturée · refacturées », « de Antibes » | Surface utile quand la pondérée est égale ; taxe et charges en une phrase ; « d'Antibes », « du Havre » | bb54cdc |
| `f-telephone-pastille-masque.png` | La pastille « 1/6 » masque le loyer sur téléphone | Fermée, elle devient « ‹ 2/6 » dans la ligne du titre | 147c834 |
| `c-telephone-statut-non-avance.png` (liste figée) | La liste reste « À contacter » après la dictée, jusqu'au rechargement | Le chat du mandataire prévient l'écran à chaque réponse ; vérifié en direct | 072848f |

Pas des erreurs, laissés tels quels :
- **La Pré-visite sans pré-estimation ni clients compatibles** (`d-previsite-sans-preestimation.png`) : c'est la décision du 31 oct. (« trois parties, rien d'autre », `PreVisite.jsx`).
- **La préparation sur téléphone** (`d-telephone-previsite.png`, `auto-etape7-telephone.png`) : elle est sous la fiche, en défilant, par la décision du 31 oct. C'est le test `test:parcours` qui cherche encore « Voir la fiche ».
- **Les deux numéros de carte** (K Partners SAS pour le mandataire, KLOCKA pour l'agence) et **les deux fourchettes** (valeur, sensibilité au taux).

Restent ailleurs :
- **Les erreurs de l'assistant** (statut qui n'avance pas, source sans « à confirmer », ancien propriétaire écrasé) : corrigées sur `l2-haka` (20/20), pas encore fusionnée.
- **Le test `test:parcours`** à mettre à jour sur la branche `test-parcours` : compte en `test.…@`, client marqué `test`, Pré-visite téléphone sans « Voir la fiche ».
- **Non touchés :**
  - la photo d'un autre commerce sur Ba & Co (donnée Google du commerce) ;
  - la fenêtre « Mission du jour » au premier passage ;
  - la ligne d'historique en double (vue une fois, sur téléphone).
