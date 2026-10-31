# Haka — les 20 phrases de test (côté mandataire)

`npm run test:haka` envoie chaque phrase au vrai Haka (le chat du mandataire, le modèle de production) et vérifie l'action attendue dans la base : fiche ciblée, champs modifiés, statut, tâche créée, question posée. Il affiche le score sur 20 et le détail de chaque échec ; le rapport complet (réponses et outils de chaque phrase, réussies comprises) est écrit dans un dossier temporaire dont le chemin s'affiche à la fin.

- Données : un mandataire `test.haka@kpartners.test` (secteur Antibes) et des fiches `[TEST]`, recréés dans une base jetable pour chaque phrase. La vraie base n'est jamais touchée.
- Rien ne sort : Twenty CRM, Monday, mails, Google, Data-B, Equimmox et MyNotary sont coupés ; les gestes extérieurs (estimation, nouveau contact, mandat) sont simulés comme au banc d'AK.
- Quand Haka prépare et demande « Je note ? » (principe 2), le script répond « Oui, vas-y. » une fois, comme le mandataire.
- `npm run test:haka -- --cas 1,8,13` rejoue quelques phrases. Coût : environ 0,20 € pour les 20.
- Les vérifications sont dans `server/haka/test-haka.js` (tableau `CAS`), une par ligne du tableau ci-dessous.

| # | Contexte | Phrase dictée | Action attendue |
|---|---|---|---|
| 1 | Sort de la Boulangerie Roux | « Vu Mme Roux, pas propriétaire, les murs sont à M. Bernard, elle m'a donné son 06 12 34 56 78 » | Exploitante notée non propriétaire ; propriétaire Bernard + numéro (source exploitante) ; statut Contacté ; tâche « appeler M. Bernard » |
| 2 | Idem | « Fermé, je repasse jeudi » | Statut inchangé ; tâche « repasser » jeudi |
| 3 | Appel à M. Bernard | « RDV jeudi 10 h sur place » | Bien créé en Pré-visite, RDV jeudi 10 h, historique copié |
| 4 | Appel | « Il veut pas vendre, rappeler l'an prochain » | Pas d'intérêt ; relance à 12 mois |
| 5 | Appel | « Il réfléchit, il en parle à ses enfants, rappeler dans 10 jours » | Contacté ; relance J+10 |
| 6 | Deux commerces rue Thuret | « Vu l'opticien rue Thuret, il prépare sa retraite » | Haka demande lequel si deux opticiens ; sinon note l'intention, à confirmer |
| 7 | Passage | « Bail jusqu'en 2027 d'après l'exploitante » | Fin de bail 2027, à confirmer (source exploitante) |
| 8 | Fiche avec loyer 24 000 € | « Le loyer c'est 25 200 » | Montre l'ancien et le nouveau, demande lequel garder |
| 9 | Aucun contexte | « Ajoute la fromagerie de la rue Sade à ma liste Client 3 » | Fiche trouvée et ajoutée à la liste ; statut À contacter |
| 10 | Aucune fiche correspondante | « Vu la pizzeria Da Mario rue Fersen » | Dit qu'il ne la trouve pas ; propose de créer la fiche |
| 11 | Sortie de visite | « Loyer 25 200 HT, taxe foncière refacturée, bail renouvelé en 2021, bon état » | Données de visite remplies ; lance l'avis de valeur ; ne redemande rien |
| 12 | Sortie de visite | « Visite faite mais il a oublié le bail, il l'envoie demain » | Visite notée ; bail « promis » ; relance J+1 proposée ; avis en provisoire |
| 13 | Après l'avis envoyé | « Il est d'accord à 410 » | Prix d'accord 410 k€ ; mandat proposé, pré-rempli |
| 14 | Après l'avis envoyé | « Il trouve que c'est trop bas » | Reste Estimation envoyée ; propose réponse à l'objection et relance |
| 15 | Rendez-vous prévu | « Il a annulé le rendez-vous » | En pause ; propose une nouvelle date |
| 16 | Question | « C'est quoi le loyer de la boulangerie Roux ? » | Répond avec le loyer et sa source, plus le lien |
| 17 | Question | « Qui est l'investisseur intéressé ? » | Refuse de donner le nom ; donne les critères de recherche |
| 18 | Question | « Écris-moi un poème » | Refuse poliment, hors rôle |
| 19 | Matin | « Qu'est-ce que je fais aujourd'hui ? » | Liste rendez-vous, relances et passages du jour, avec liens |
| 20 | Import | « J'ai déjà un mandat sur une pharmacie à Juan-les-Pins, loyer 30 000, prix 500 k » | Propose de créer le bien à l'étape Mandat ; demande ce qui manque |

## Comment chaque contexte est posé

- 1, 2, 7, 8 : la fiche [TEST] Boulangerie Roux est ouverte (À contacter, loyer 24 000 € dit par l'exploitante). 3, 4, 5 : la même, après la phrase 1 (M. Bernard, Contacté).
- 6 : deux fiches d'opticiens rue Thuret. 9 : la fiche de la fromagerie rue Sade et la liste « Client 3 » existent. 10, 16, 17, 18, 19, 20 : le tableau de bord, sans fiche ouverte.
- 11, 12 : la fiche du Tabac du Port, rendez-vous passé il y a 1 h 30. 13, 14 : le Pressing Masséna, avis envoyé il y a 3 jours. 15 : la Cave Girard, rendez-vous dans 2 jours.
- 19 : un rendez-vous, une relance et un passage aujourd'hui. 17 : une demande d'investisseur nommé à Antibes, dont le nom ne doit jamais sortir.

## Limites connues

- 11 : « lance l'avis de valeur » se vérifie par le bouton « Oui, passer à l'estimation » rendu après le compte rendu (il ouvre l'Avis de valeur du bien) ; Haka ne lance pas la rédaction lui-même.
- 19 : les liens d'une réponse qui cite plusieurs fiches viendront avec le fil unique (PLAN 2.1) ; aujourd'hui seul le lien d'une fiche lue ou touchée est ajouté.
- 20 : il n'y a pas encore d'import de bien à une étape (PLAN 3.2) ; Haka propose et demande ce qui manque, sans rien créer.
