# K-Vacance : comment savoir si c'est fiable

K-Vacance (depuis le 19 oct. 2026) est la carte des signaux de vacance et le taux de vacance de la zone, de la rue et de la commune. Ce document dit ce qu'on mesure, comment, avec quels seuils, et ce qui a déjà été mesuré.

Il y a deux choses distinctes à contrôler :

- **Les signaux** (liquidation, redressement, radiation, cession, fermeture) : annoncent-ils vraiment un local qui se libère ?
- **Le taux de vacance** : un local classé « vacant » l'est-il, et un local classé « occupé » l'est-il ?

## 1. Les signaux : le rétro-test

`npm run vacance:verifier -- retro` (lecture seule). Pour chaque signal vieux d'au moins 180 ou 365 jours, le local est-il aujourd'hui fermé au registre SIRENE ?

Mesure du 19 oct. 2026, 17 157 signaux BODACC sur Cannes, Nice, Antibes et Menton :

| Signal | Signaux | Suivis d'une fermeture au registre |
| --- | ---: | ---: |
| Radiation | 8 231 | 91 % (90 à 92 %) |
| Liquidation | 706 | 13 % (11 à 16 %) |
| Redressement | 416 | 13 % (10 à 17 %) |
| Sauvegarde | 48 | 2 % |

**À ne pas mal lire.** Le registre SIRENE retarde : une liquidation y marque rarement le local fermé, et la fermeture précède souvent l'annonce (délai médian de moins quatre à cinq mois). Ce rétro-test sous-estime donc les fermetures réelles. Pour la liquidation et le redressement, la vraie mesure est la suivante.

### Contrôle indépendant par Google Maps

41 commerces du 06 annoncés en liquidation ou en redressement depuis au moins six mois, un sur douze, cherchés sur Google Maps par leur nom et leur adresse :

| Ce que montre Google Maps | Part |
| --- | ---: |
| Toujours ouvert sous le même nom | 56 % (41 à 70 %) |
| Fermé définitivement | 20 % (10 à 34 %) |
| Introuvable | 17 % |
| Un autre commerce y est ouvert | 7 % |
| **Local libéré (fermé, repris, introuvable)** | **44 % (30 à 59 %)** |

**Conclusion : un signal de liquidation ou de redressement n'est pas une certitude.** Il dit où regarder. Une radiation, elle, est fiable. L'écran le dit en bas du tableau des signaux.

Limites du contrôle : deux rapprochements de noms douteux dans l'échantillon (« Planète Rock » et « Planète Jeux »), et un échantillon de 41 qui laisse un intervalle large.

## 2. Le taux de vacance : l'échantillon de terrain

C'est la mesure qui fait foi, parce qu'elle ne dépend d'aucune des sources de l'outil.

1. **Générer la feuille** d'une zone : `npm run vacance:verifier -- echantillon "45 rue d'Antibes 06400 Cannes" 400`. Elle écrit `docs/validation/k-vacance-<ville>-<date>.csv` : 25 locaux que l'outil dit vacants, 25 qu'il dit occupés, et les incertains. Les locaux sont tirés à intervalle régulier sur toute la zone, pas seulement les plus proches. Chaque ligne porte la raison de l'outil et un lien Street View.
2. **Remplir la colonne « constat »** : `vide`, `occupe`, `travaux` ou `autre`, d'après la rue ou Street View. Compter une quinzaine de minutes pour cinquante lignes. Faire deux personnes sur une même zone pour les cas douteux.
3. **Évaluer** : `npm run vacance:verifier -- evaluer docs/validation/<feuille>.csv`.

L'évaluation rend trois chiffres, chacun avec son intervalle de Wilson à 95 % :

- la **précision des « vacants »** : sur les locaux que l'outil dit vacants, la part réellement vide ;
- les **« occupés » en réalité vides** : ce que l'outil rate ;
- le **taux de vacance corrigé** : le taux de l'outil repondéré par ces deux mesures.

### Seuils proposés pour dire que K-Vacance est bon

| Mesure | Seuil |
| --- | --- |
| Précision des « vacants » | au moins 80 % |
| « Occupés » en réalité vides | au plus 5 % |
| Écart entre le taux de l'outil et le taux corrigé | au plus 3 points |

Ce sont des points de départ à ajuster après la première feuille remplie. Quatre feuilles sont déjà générées : Cannes, Nice et Antibes (Menton à refaire, voir plus bas).

### Premier contrôle, sans terrain : Google Maps

Sans attendre les feuilles, on a cherché sur Google Maps les commerces ouverts autour du point de chacun de 75 « vacants » (25 par ville) :

| Zone | « Vacants » où Google montre un commerce ouvert au même numéro |
| --- | ---: |
| Cannes | 7 sur 25 |
| Nice | 12 sur 25 |
| Antibes | 4 sur 25 |
| Total | 23 sur 75 (31 %, de 22 à 42 %) |

Pour mémoire, sur 25 « occupés » de Cannes, Google en confirme 17 (68 %) : ce contrôle est lui-même bruyant, il ne remplace pas la feuille. Lecture :

- **Au moins 4 sur 75 (5,3 %, de 2 à 13 %) sont de vraies fausses vacances** : le commerce que le registre dit fermé est le même que Google montre ouvert (« Elyxir Vintage », « La Cave Wilson », « Mikvé Nice », une agence bancaire). Probablement un changement de SIRET ou d'écriture de l'adresse.
- **Les autres cas sont ambigus** : un voisin au même numéro (un numéro porte souvent plusieurs locaux), un cabinet ou une agence que l'outil ne compte pas comme commerce, ou une ouverture trop récente pour figurer au registre.
- **La vraie précision des « vacants » se situe donc entre 69 % et 95 %.** Seule la feuille de terrain la resserre.

## 3. Les repères publiés : un contrôle de vraisemblance

Taux de vacance commerciale publiés (aucun n'est donné pour Cannes, Nice, Antibes ou Menton) :

| Repère | Taux |
| --- | ---: |
| France, tous commerces, 2025 (Codata) | 11,6 % |
| France, commerces en pied d'immeuble, 2025 (Codata) | 11,7 % |
| France, tous commerces, 2024 (comptage Procos) | 10,64 % |
| Paris, 2024 (Codata) | 7,9 % |

Taux de l'outil, rayon de 400 m, 19 oct. 2026 :

| Zone | Locaux | Vacants | Taux |
| --- | ---: | ---: | ---: |
| Cannes, rue d'Antibes | 695 | 50 | 7,2 % |
| Nice, avenue Jean Médecin | 453 | 35 | 7,7 % |
| Antibes, rue de la République | 735 | 66 | 9,0 % |

C'est plus bas que la moyenne nationale, ce qui est plausible pour des centres-villes touristiques et commerçants. Ce n'est pas une preuve : les comptages nationaux n'ont ni le même périmètre ni la même méthode (Procos compte tout local inexploité, quelle qu'en soit la raison).

## 4. Fragilités connues

- **Le taux dépend d'OpenStreetMap en direct** : quand le service répond une erreur, le taux ne se calcule pas (Menton a échoué pendant la préparation des feuilles). Les signaux, eux, restent disponibles.
- **Le registre SIRENE retarde** : un local rouvert récemment peut apparaître vacant, une cessation récente peut apparaître occupée.
- **Un numéro porte plusieurs locaux** : le taux le traite à l'adresse, pas au lot.
- **Les signaux ne disent pas qui reprend le local** : une liquidation suivie d'une reprise par un franchisé reste un signal.

## 5. Quand refaire la mesure

À chaque changement de méthode, de source ou de paramètre (le taux porte sa version : « v1.4 du 16 oct. 2026 »), et une fois par trimestre sur une zone différente.
