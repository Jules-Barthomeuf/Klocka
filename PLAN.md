# PLAN — Espace mandataire K Partners (MVP)

## Périmètre
- Commerces uniquement (pas de bureaux ni d'entrepôts).
- Parcours : Prospection → Fiche → Bien → Pré-visite → Avis de valeur → Mandat signé.
- Hors périmètre aujourd'hui : Commercialisation, Offres, Vente, WhatsApp, bureaux/entrepôts.

## Règles pour chaque session
1. Une seule tâche à la fois. Ne pas toucher aux fichiers d'un autre lot.
2. Travailler sur la branche du lot (ex. `l1-prospection`).
3. Avant de dire « terminé » : lancer le test du parcours (`npm run test:parcours`) et le faire passer.
4. Mettre à jour sa ligne ci-dessous (statut + date + commit).
5. Répondre en 3 lignes : fait / reste / ce que Jules doit tester.

## Statuts
À faire · En cours · À tester (Jules) · Terminé · Bloqué

## Suivi

| # | Lot | Tâche | Terminé quand… | Session | Statut |
|---|---|---|---|---|---|
| 0.1 | L0 | Mode test (clients et biens test) | Un admin crée un client/bien « test » ; un compte mandataire ne le voit jamais | L0-fondations | À tester (Jules) · 31 oct. · 303619d |
| 0.2 | L0 | Droits mandataire | En mandataire : aucun client Klocka ni nom d'investisseur visible ; seulement ses fiches, ses biens, propriétés et transactions | L0-fondations | À tester (Jules) · 31 oct. · 303619d, 54ed110 (« Client n°12 » + critères) |
| 0.3 | L0 | Menu de gauche | Onglet Projet retiré ; restent Prospection, Biens, Haka | L0-fondations | À tester (Jules) · 31 oct. · 303619d |
| 0.4 | L0 | Commerces uniquement | Aucune mention bureaux/entrepôts côté mandataire | L0-fondations | À tester (Jules) · 31 oct. · 303619d |
| T.1 | Test | Test Playwright du parcours complet | `npm run test:parcours` va de la carte au mandat signé avec des données test et passe | Test-parcours | À faire |
| 1.1 | L1 | Flux secteur → client → villes | Clic sur un client = ses villes appliquées automatiquement | L1-prospection | À faire |
| 1.2 | L1 | Points affichés | Seulement signal + propriétaire + exploitant connus ; quelques dizaines max | L1-prospection | À faire |
| 1.3 | L1 | Vitesse | Clic sur un commerce < 2 s (mesuré avant/après) | L1-prospection | À faire |
| 1.4 | L1 | Fiche commerce minimale | Signal, exploitant, propriétaire, contact, accroche, statut, micro, lien Itinéraire ; rien d'autre | L1-prospection | À faire |
| 1.5 | L1 | Listes | Création en 2 clics ; une fiche qui change de statut se met à jour dans toutes ses listes | L1-prospection | À faire |
| 2.1 | L2 | Fil Haka unique | Un fil par mandataire, historique conservé, réponse avec lien vers la fiche/le bien | L2-haka | À faire |
| 2.2 | L2 | Manuel du mandataire | Principes écrits dans le prompt de Haka (voir docs/haka-principes.md) | L2-haka | À faire |
| 2.3 | L2 | 20 phrases de test | ≥ 18/20 donnent la bonne action (docs/haka-tests.md) | L2-haka | À faire |
| 2.4 | L2 | Test terrain Antibes | Une vraie liste parcourue sans ouvrir une fiche à la main | Jules | À faire |
| 3.1 | L3 | Arbre de décision | Statuts et passages conformes à l'arbre ci-dessous | L3-bien | À faire |
| 3.2 | L3 | Import de biens existants | Dictée, photo ou PDF → bien créé à la bonne étape | L3-bien | À faire |
| 3.3 | L3 | Pré-visite → Avis de valeur → Mandat | Un bien test va de « À contacter » à « Mandat signé » sans bug, ordi et téléphone | L3-bien | À faire |
| 4.1 | L4 | Transfert de mails sourcing | Mail transféré → fiche du bien créée en base (loyer, adresse, activité) | L4-donnees | À faire |

## Arbre de décision (référence pour 3.1)
- Point sur la carte → ajouté à une liste ou action → FICHE « À contacter » (appartient au mandataire)
- À contacter → contact obtenu → « Contacté »
  - RDV fixé → BIEN créé, étape Pré-visite
  - À rappeler → « Contacté » + relance datée
  - Pas intéressé → « Pas d'intérêt », relance à 6 mois
- Pré-visite → visite dictée → Avis de valeur ; RDV annulé → En pause
- Avis de valeur envoyé → accord → Mandat ; hésite → relances J+2/J+5/J+10 ; refus → En pause ou Perdu (motif)
- Mandat → signé (MyNotary) → fin du périmètre
- Bien importé → créé directement à l'étape correspondante

## À faire plus tard
- Bureaux, entrepôts
- Commercialisation, Offres, Vente
- WhatsApp
