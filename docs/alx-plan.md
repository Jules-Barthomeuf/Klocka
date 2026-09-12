# ALX, la prospection off-market : plan

ALX est une nouvelle partie de Klocka, avec son entrée dans le menu et sa tuile sur le tableau de bord. Son objet : partir d'une rue, remonter jusqu'au propriétaire d'un local commercial, décider s'il vaut un contact, le contacter, suivre sa réponse, et faire entrer le dossier dans le pipeline d'analyse existant le jour où le bail arrive. Le but final est de décrocher des appels avec des vendeurs qui n'ont rien mis sur le marché, pour des biens conformes aux profils d'acquéreur de l'équipe.

Le plan ci-dessous répond à un descriptif de process en 21 étapes. Il commence par dire ce que ce descriptif a de juste et ce qu'il sous-estime, parce que c'est ce qui décide de l'architecture. Il s'appuie ensuite sur ce que le serveur sait déjà faire : géocoder par la Base Adresse Nationale, lire DVF et le BODACC, piloter Data-B et Equimmox dans un navigateur sans écran, pondérer une surface, calculer un prix acte en main, envoyer et relever des mails Gmail, tenir des engagements et des relances. La frontière avec l'existant est nette : ALX, c'est tout ce qui se passe avant qu'un dossier existe.

## Lecture critique du descriptif

Le descriptif est solide sur trois points, et ce sont les bons. La priorisation en trois classes d'action plutôt qu'une note sur 100 : c'est exactement comme ça qu'il faut faire, et c'est comme ça que le moteur de verdict de la préanalyse est déjà construit. Les quatre familles de signaux (professionnel, démographique, événementiel, actif), classées par puissance. Et l'archivage daté des refus, qui est la moitié de la valeur du canal : la plupart des conversions viendront de contacts pris un à trois ans plus tôt.

Il sous-estime quatre choses, et chacune change une décision de conception.

**Les propriétaires personnes physiques ne sont dans aucune donnée ouverte.** Le fichier DGFiP « locaux et parcelles des personnes morales » ne couvre que les sociétés (SCI comprises, ce qui est déjà beaucoup). Un particulier qui détient ses murs en direct n'y figure pas, et il n'est nulle part ailleurs qu'au service de publicité foncière, par demande 3233-SD, à 12 euros la pièce, par courrier, avec des semaines de délai. Le descriptif le traite en « trous » à l'étape 8. En centre-ville, ce n'est pas un trou, c'est une part importante des cibles. Conséquence : ALX doit gérer des cibles « propriétaire inconnu » comme un état normal et durable, avec la demande 3233-SD suivie comme une tâche, et la question au commerçant comme un geste enregistré.

**DVF ne dit pas qui achète.** Les mutations sont anonymisées. « Marchand de biens dans la fenêtre 18-48 mois après son acquisition » ne se lit dans aucune source directement : on relève une mutation sur la parcelle à une date (DVF), on relève que le propriétaire actuel est une société en 6810Z (fichier DGFiP), et on infère qu'il a acheté à cette date. C'est une inférence raisonnable, pas une donnée. Elle doit être affichée comme telle, avec sa source des deux côtés, et vérifiée à l'appel.

**Le screening vitrine est un travail humain, mais le modèle peut le préparer.** Remonter une rue en Street View pour noter enseigne, activité, état, largeur de vitrine et terrasse, c'est ce que le descriptif demande à une personne. L'image Street View est récupérable par l'API statique de Google avec sa date de prise de vue, et Claude lit une devanture : enseigne, type d'activité, état apparent, présence d'une terrasse. Ce qu'on peut donc construire : une lecture automatique de chaque façade, présentée à l'équipe pour validation en un clic, jamais pour décision. Le linéaire de façade reste une mesure humaine.

**Il manque la boucle d'apprentissage.** Le brief demande d'« améliorer le processus ». Le descriptif s'arrête à l'archivage des refus. Ce qui manque, c'est la mesure : quels signaux ont mené à un appel, quelles rues ont produit, quels messages ont reçu une réponse, à quel délai. Sans cette mesure, le score de l'étape 11 restera celui qu'on aura écrit le premier jour. Avec elle, il se recale tous les trimestres sur ce qui a réellement converti. C'est un lot à part entière, et c'est celui qui fait que le module vaut plus au bout d'un an qu'au premier jour.

Deux remarques de moindre portée. L'âge des gérants est une donnée personnelle sur des personnes physiques : on ne stockera qu'une tranche (moins de 50, 50-70, plus de 70), jamais une date de naissance, et le journal d'audit existant tracera chaque lecture. Et le taux d'effort (loyer rapporté au chiffre d'affaires du locataire) suppose des comptes déposés ; une grande partie des commerces indépendants ne les publient pas. C'est un signal quand il est disponible, pas une étape.

## Ce que fait ALX

Le parcours, d'une rue jusqu'au dossier :

1. L'équipe définit un secteur : une ville, puis des rues, et pour les rues longues un tronçon avec ses deux extrémités. Chaque secteur porte ses critères d'entrée, repris de `rules.json` (plafond, profils, activités exclues) et complétés de deux règles propres au off-market : surface minimale en dessous de laquelle le ticket ne justifie pas le travail, et règle sur le nombre de lots.

2. ALX remonte le tronçon : géocodage des numéros par la Base Adresse Nationale, image Street View de chaque façade avec sa date, lecture de la devanture par le modèle. Sortie : une liste de locaux, chacun avec enseigne, activité, état, terrasse, et une photo datée. L'équipe valide ou corrige chaque lecture. Un local écarté ici ne va pas plus loin : il ne sert à rien de savoir qui possède ce qu'on ne veut pas.

3. Pour chaque local retenu, ALX trouve la parcelle : point dans polygone sur le cadastre par l'API Carto de l'IGN, sortie l'identifiant de parcelle. Puis le propriétaire : fichier DGFiP des personnes morales, avec dénomination, SIREN, forme juridique et code du droit exercé. Ce dernier est éliminatoire : un usufruitier seul ne vend pas la pleine propriété. Si la parcelle n'a pas de personne morale, la cible passe en « propriétaire à établir » avec une demande 3233-SD à faire.

4. La société est enrichie : Sirene pour le code APE, la date de création, l'effectif, le siège ; le registre national des entreprises pour les dirigeants (tranche d'âge, nombre, homonymie de nom de famille) et les comptes déposés. Le recoupement se fait toujours par la commune, parce que les SCI homonymes sont fréquentes.

5. Les signaux sont calculés et les drapeaux techniques posés. Signaux : code 6810Z et mutation DVF récente sur la parcelle (professionnel) ; ancienneté de détention, âge et nombre des gérants (démographique) ; événement BODACC sur le SIREN dans les six derniers mois (événementiel) ; échéance triennale ou fin de bail proche, loyer très sous le marché, bien isolé loin du siège (actif). Drapeaux : vente en bloc, droit de préférence du locataire, démembrement ou indivision.

6. Le moteur range la cible dans une classe : P1 « appeler cette semaine », P2 « courrier ce mois », P3 « veille », ou écartée avec un motif écrit. Les règles sont dans un fichier `alx-signaux.json` à côté de `rules.json`, évaluées par un module pur, testé, exactement comme le verdict de la préanalyse.

7. Pour les P1 et P2, ALX construit une valorisation avant contact, chaque valeur portant sa source et sa confiance : surface (DVF, puis emprise du bâti, contrôlée par le format connu de l'enseigne), pondérée par niveau et par zone ; loyer (valeur locative Data-B et loyers observés Equimmox, les connecteurs existants, sur la rue et non la commune) ; prix en fourchette, du loyer divisé par un taux cible ajusté, croisé avec le prix de la dernière mutation DVF. Un prix haut proche d'un prix payé récemment signale un dossier probablement mort.

8. Le contact. Le canal se choisit par nature du propriétaire : courrier papier signé pour un patrimonial, mail plus appel à J+4 pour un professionnel. ALX rédige le message à partir des faits de la cible (adresse exacte, enseigne, date d'acquisition quand elle est connue), dans la voix des modèles de mail existants, et l'équipe le relit. Le mail part par la connexion Gmail existante ; le courrier est imprimé et son envoi est coché. Chaque approche ouvre un engagement avec sa relance.

9. Les réponses reviennent par la veille des boîtes existante, rattachées à la cible. Un refus s'archive avec son motif et une date de relance (six mois pour un patrimonial, un an pour une succession en préparation). Un accord de principe fait passer la cible en « appel », avec le seul objectif de l'appel : obtenir le bail et les quittances.

10. À réception du bail, des quittances et du Kbis du preneur, la cible devient un dossier à l'étape 1 du pipeline existant. Les valeurs estimées y sont remplacées par les valeurs extraites ; la confiance passe de « estimé » à « extrait ». ALX garde le lien vers le dossier et cesse de suivre la cible.

11. En veille permanente, ALX interroge le BODACC et DVF sur les SIREN et parcelles des P3 : un changement de gérant, une radiation, une mutation voisine, et la cible remonte en P2. Ce qui a été écarté reste consultable avec son motif.

12. Le tableau d'apprentissage lit tout ce qui précède : conversions par signal, par rue, par canal, par variante de message, délais de réponse, motifs de refus. C'est là que l'équipe décide de reculer un seuil, d'abandonner un tronçon, ou de réécrire un message.

## Architecture

ALX est un second pipeline, parallèle à celui des dossiers et en amont. Il a ses entités, ses routes, son module de règles et ses écrans, et il réutilise les connecteurs, le modèle, le courrier et les relances de l'application. Il ne modifie pas le pipeline existant : il y verse à la fin.

### Entités

Cinq entités nouvelles, toutes réservées à l'équipe. Elles sont fermées par défaut par le contrôle d'accès existant (`server/acces-entites.js`, liste blanche) et n'ont pas à y être déclarées : un client ne les verra jamais.

- `Secteur` : ville, rue, tronçon (deux adresses ou deux numéros), critères propres, état (actif, en pause, épuisé), date du dernier passage.
- `Cible` : l'objet central. Adresse normalisée, coordonnées, identifiant de parcelle, enseigne et activité lues, photo Street View et sa date, validation humaine du screening, propriétaire (lien), signaux calculés avec leur source, drapeaux, classe et motif, valorisation (surface, loyer, fourchette de prix, chacun avec source et confiance), état du contact, lien vers le dossier une fois créé.
- `Proprietaire` : SIREN, dénomination, forme juridique, code APE, date de création, effectif, siège, dirigeants (nombre, tranches d'âge, homonymie familiale, date du dernier changement), comptes déposés, événements BODACC datés, liste des parcelles détenues connues. Une même société peut porter plusieurs cibles ; on ne la relit pas deux fois.
- `Approche` : une tentative de contact. Cible, canal, date, message envoyé, destinataire, réponse reçue et sa date, motif de refus, prochaine relance, personne de l'équipe. C'est l'historique qui vaut de l'or à trois ans.
- `DemandeFonciere` : une demande 3233-SD, avec ses parcelles, sa date d'envoi, son coût, sa réponse. Suivie comme une tâche pour que rien ne se perde entre l'envoi et la réponse.

Deux extensions d'entités existantes : `Deal` reçoit un `cible_id` et une provenance `alx`, pour que la boucle d'apprentissage sache d'où vient un dossier. `Engagement` reçoit un `cible_id` optionnel, pour que les relances d'ALX vivent dans le registre existant plutôt que dans un second.

### Connecteurs

Le motif est celui de `server/marche/connecteurs/` : un adaptateur mince par source, une classification d'erreur commune, des tentatives avec temporisation, un cache par clé. Les connecteurs existants sont réutilisés tels quels ou étendus ; les nouveaux suivent le même gabarit.

Réutilisés sans changement :
- `server/deal/geocodage.js` : la Base Adresse Nationale, pour l'adresse vers coordonnées et code INSEE.
- `server/data-b.js` (valeur locative) et `server/equimmox.js` (loyers observés) : le loyer de marché, sur la rue.
- `server/marche/navigateur.js` : le navigateur sans écran partagé.
- `src/lib/ponderation.js` : les coefficients par niveau, à étendre d'une pondération par zone de profondeur (zone A, B, C).
- `server/deal/aem.js` : le prix acte en main, inversé pour passer d'un loyer et d'un taux à un prix, puis en retirer les frais.

Étendus :
- `server/dvf.js` : conserver `id_parcelle`, `date_mutation`, `nature_mutation`, `valeur_fonciere`, `nombre_lots` par vente ; ajouter une recherche par identifiant de parcelle et non plus seulement par rayon. Le loader lit déjà les CSV géolocalisés d'Etalab, il suffit de garder plus de colonnes.
- `server/bodacc.js` : ajouter une recherche par SIREN (l'API Opendatasoft de la DILA porte le champ `registre`), avec les familles « modification » (changement de gérance, transfert de siège) qui sont du bruit à l'échelle d'une rue mais un signal à l'échelle d'une société.

Nouveaux :
- `cadastre.js` : API Carto de l'IGN, point dans polygone, sortie l'identifiant de parcelle et l'emprise du bâti. Gratuit, sans clé.
- `dgfip-locaux-pm.js` : le fichier annuel des locaux et parcelles des personnes morales, publié sur data.gouv.fr par département. Téléchargé une fois par département actif, chargé dans une table SQLite indexée par parcelle. C'est la seule source ouverte pour « qui possède », et elle ne couvre que les sociétés.
- `sirene.js` : l'API Sirene de l'INSEE, SIREN vers unité légale et établissements. Gratuit sur inscription, clé dans `.env`.
- `rne.js` : le registre national des entreprises de l'INPI, dirigeants et dépôt des comptes. Gratuit sur inscription. Pappers reste une option payante si le RNE s'avère trop pauvre ou trop lent ; la décision se prend sur la première ville.
- `street-view.js` : l'API statique de Google Street View et ses métadonnées (date de prise de vue). La clé existe déjà dans `.env.example` sous `VITE_GOOGLE_MAPS_API_KEY`, il faudra une clé côté serveur. Le modèle lit l'image via `server/llm.js`, qui sait déjà passer des images.

### Le moteur de classement

`server/alx/signaux.js` calcule les signaux et les drapeaux à partir d'une cible et de son propriétaire, et `server/alx/classement.js` range en P1, P2, P3 ou écarté à partir de `server/alx/data/alx-signaux.json`. Comme pour `rules.js` : aucun appel au modèle, tout se lit dans le fichier de règles, chaque décision porte une trace (quel signal, quelle valeur, quelle règle) et un motif lisible. Le fichier de règles est versionné ; chaque recalage issu du tableau d'apprentissage est un commit.

Les tests, dans `server/alx/*.test.js`, couvrent chaque famille de signal, chaque drapeau, les quatre classes et l'ordre d'évaluation (un drapeau bloquant l'emporte sur un signal fort ; l'indivision successorale est une exception explicite, pas un oubli).

### Routes

Une famille `/api/alx/`, dans `server/routes/alx.js`, montée comme les autres et couverte par la garde d'équipe existante (préfixe à ajouter à `PREFIXES_EQUIPE`). Les actions longues (remonter un tronçon, enrichir un propriétaire, valoriser) répondent tout de suite avec un état et se consultent ensuite, sur le modèle des recherches Equimmox : chez l'hébergeur, une requête HTTP ne survit pas à une minute de traitement.

### Écrans

Une entrée « ALX » dans le menu latéral, réservée à l'équipe. Une tuile sur le tableau de bord : combien de P1 à appeler cette semaine, combien de courriers à envoyer, combien de réponses reçues, combien de relances dues. Puis cinq pages :

- `/ALX` : le tableau. Quatre colonnes, P1, P2, P3, écartées, chaque carte portant l'adresse, l'enseigne, le signal dominant, la prochaine action et sa date. C'est un tableau par étape, ce que la page Dossiers n'a pas encore et devrait avoir.
- `/ALX/Secteurs` : les secteurs et leurs tronçons sur une carte (MapLibre est déjà là), avec les critères, l'état du passage, et le nombre de cibles par classe.
- `/ALX/Cible/:id` : la fiche. La photo datée et la lecture de la devanture à valider ; la parcelle et le propriétaire ; les signaux et drapeaux avec leur source ; la valorisation, chaque chiffre avec sa confiance ; l'historique des approches ; la prochaine action. Les fourchettes de valorisation utilisent `EchelleFourchettes`, le composant des cartes marché.
- `/ALX/Approches` : ce qui part cette semaine (messages à relire, courriers à imprimer), ce qui est revenu (réponses rattachées, à qualifier), ce qui est dû (relances, appels à J+4).
- `/ALX/Apprentissage` : conversions par signal, par rue, par canal, par message ; délais ; motifs de refus. Les graphiques suivent les règles de la palette.

## Ce que le serveur doit ajouter

Par ordre de dépendance :

1. Les cinq entités et leurs index (`json_extract` sur `parcelle`, `siren`, `cible_id`, comme pour les sessions et les dossiers).
2. Les connecteurs cadastre, DGFiP, Sirene, RNE, Street View, et les extensions DVF et BODACC.
3. Le chargeur du fichier DGFiP par département, avec son état (département, millésime, date de chargement) dans `Meta`.
4. Le moteur de signaux et de classement, son fichier de règles, ses tests.
5. La valorisation : surface pondérée (extension de `ponderation.js`), loyer de marché (connecteurs existants), fourchette de prix (inverse de `calculerAEM`).
6. La rédaction de messages : deux consignes dans `server/llm.js`, courrier patrimonial et mail professionnel, dans la voix des modèles existants (`MailTemplate`), avec les mêmes garde-fous que le chat des dossiers : texte brut, aucun chiffre inventé, aucune mention explicite d'un événement BODACC.
7. Le rattachement des réponses : `server/deal/veille-mails.js` sait déjà rattacher un mail à un dossier par expéditeur et objet ; il rattachera de même à une cible.
8. La veille : une tâche périodique qui interroge BODACC et DVF sur les SIREN et parcelles en P3, remonte en P2 sur événement, et note l'événement sur le propriétaire.
9. Le passage en dossier : `server/deal/index.js` reçoit une cible et crée le dossier à l'étape 1 avec les valeurs estimées marquées comme telles.
10. Le tableau d'apprentissage : des requêtes d'agrégation sur `Approche`, `Cible` et `Deal`, sans nouvelle entité.

## Découpage en lots

Chaque lot livre quelque chose d'utilisable seul. L'ordre est celui de la valeur, pas de la logique : on veut une liste de cibles réelles avant un moteur de score parfait.

**Lot 0, une semaine : le cadre.** Le rendez-vous juridique (Hoguet, données personnelles) est pris avant le premier courrier, pas après. Les entités, le menu, la tuile, les pages vides, la saisie manuelle d'un secteur et d'une cible. Valeur : l'équipe commence à consigner ses cibles connues dès le premier jour, à la main.

**Lot 1, deux semaines : identifier.** Géocodage du tronçon, Street View avec date, lecture des devantures par le modèle, validation en un clic. Parcelle par l'API Carto. Propriétaire par le fichier DGFiP sur le premier département. Sirene. La demande 3233-SD suivie comme tâche. Valeur : d'une rue, une liste de locaux avec leur propriétaire quand il est une société, et la mesure exacte de la part de cibles sans propriétaire connu. C'est cette mesure qui dira si le 3233-SD est un complément ou un goulot.

**Lot 2, deux semaines : classer.** RNE pour les dirigeants et les comptes. BODACC par SIREN, DVF par parcelle. Le moteur de signaux, de drapeaux et de classement, son fichier de règles, ses tests. Le tableau P1, P2, P3, écartées. Valeur : la liste priorisée, avec la trace de chaque décision.

**Lot 3, une à deux semaines : valoriser.** Surface pondérée par niveau et par zone, contrôlée par l'enseigne. Loyer par les connecteurs existants sur la rue. Fourchette de prix par le taux cible, croisée avec DVF. La fiche de cible complète. Valeur : une fourchette sérieuse avant tout contact, avec la confiance de chaque chiffre.

**Lot 4, deux semaines : contacter.** Rédaction des messages par canal, relecture, envoi Gmail, courrier imprimable, engagements et relances dans le registre existant, rattachement des réponses par la veille des boîtes, archivage des refus avec motif et date. La page Approches. Valeur : la boucle de contact, de l'envoi à la réponse.

**Lot 5, une semaine : boucler.** Le passage d'une cible en dossier à l'étape 1. La veille BODACC et DVF sur les P3. Le tableau d'apprentissage. Valeur : ce qui fait que le module vaut plus au bout d'un an.

Neuf à dix semaines de travail concentré. Les lots 1 et 2 sont ceux qui apprennent le plus : la première rue dira combien de propriétaires sont trouvables, et la première centaine de cibles dira si les seuils du fichier de règles sont les bons.

## Outils, et ce qu'ils coûtent

| Besoin | Outil | Coût | Clé |
|---|---|---|---|
| Adresse vers coordonnées | Base Adresse Nationale | gratuit | aucune |
| Coordonnées vers parcelle, emprise du bâti | API Carto de l'IGN | gratuit | aucune |
| Parcelle vers propriétaire (sociétés) | Fichier DGFiP des locaux des personnes morales, data.gouv.fr | gratuit, annuel | aucune |
| Parcelle vers propriétaire (particuliers) | Demande 3233-SD au service de publicité foncière | 12 euros la pièce, courrier | aucune |
| SIREN vers société | API Sirene, INSEE | gratuit | inscription |
| Dirigeants, comptes déposés | Registre national des entreprises, INPI | gratuit | inscription |
| Idem, plus riche et plus rapide | Pappers | payant | à décider sur la première ville |
| Événements sur une société | BODACC, API Opendatasoft de la DILA | gratuit | aucune, déjà branché |
| Mutations d'une parcelle | DVF, Etalab | gratuit | aucune, déjà branché |
| Photo de façade et sa date | Street View Static API, Google | quelques euros pour mille images | clé serveur |
| Lecture de la devanture | Claude, via `server/llm.js` | centimes par image | déjà branché |
| Loyer de marché sur la rue | Data-B, Equimmox | comptes existants | déjà branché |
| Envoi et relève des mails | Gmail, via la connexion existante | gratuit | déjà branché |
| Courrier papier | impression locale, envoi coché à la main | timbre | aucune |
| Courrier papier automatisé | service d'affranchissement en ligne | à l'unité | hors champ, à décider plus tard |

Tout ce qui est marqué « déjà branché » a un connecteur, une classification d'erreur, un cache et une trace de coût dans la page Suivi.

## Risques et parades

**La part de propriétaires introuvables.** Les particuliers ne sont dans aucune donnée ouverte. Parade : le lot 1 mesure la part exacte sur la première rue avant qu'on décide quoi que ce soit du 3233-SD ; la demande est suivie comme une tâche, jamais laissée dans un tiroir ; la question au commerçant est un geste enregistré sur la cible, avec le nom obtenu.

**Les données personnelles des dirigeants.** Tranches d'âge, jamais de date de naissance. Chaque lecture d'un `Proprietaire` passe par le journal d'audit existant. Une procédure de suppression sur demande : effacer la personne, garder la parcelle. Mention d'information et base légale validées avec le conseil au lot 0.

**La loi Hoguet.** Les modèles de mail existants disent « achat direct, sans mandat, sans commission ». C'est ce positionnement qui doit être confirmé par le conseil, au lot 0, avant le premier courrier. Le plan ne tranche pas cette question ; il la place en premier.

**Les conditions d'usage de Data-B.** ALX utilise Data-B pour la valeur locative, comme aujourd'hui, et rien d'autre. Si Data-B propose un module propriétaires, son usage automatisé se vérifie dans leurs conditions avant de l'ajouter.

**Street View périmé.** Une image de 2019 montre une enseigne disparue. Parade : la date est affichée sur chaque photo, une lecture datée de plus de deux ans demande une confirmation, et le passage à pied reste possible en cochant la cible.

**L'inférence d'acquisition.** « Marchand dans la fenêtre » est déduit d'une mutation DVF et d'un code APE, jamais lu. Parade : le signal s'affiche avec ses deux sources et sa nature d'inférence, et la vérification à l'appel (« depuis combien de temps détenez-vous ? ») est la première question du script.

**La tentation du volume.** Les volumes attendus sont de quelques P1 et quelques dizaines de P2 par ville. Parade : ALX n'a pas de fonction d'envoi groupé. Chaque message se relit, chaque courrier se coche. L'automatisation porte sur la recherche, pas sur la relation.

**Un moteur de règles figé.** Sans mesure, les seuils du premier jour restent. Parade : le lot 5 n'est pas optionnel, et le fichier de règles est versionné pour que chaque recalage ait une date et un motif.

## Hors champ pour l'instant

- L'affranchissement automatisé du courrier papier. On imprime et on coche.
- Les propriétaires hors France métropolitaine (DVF exclut l'Alsace-Moselle et Mayotte).
- La synchronisation des cibles vers Monday. Le propriétaire n'est pas un client ; il n'entre dans Monday que s'il devient vendeur, c'est-à-dire quand la cible devient un dossier, et ce chemin existe déjà.
- Le taux d'effort du locataire. Signal utile quand les comptes sont déposés, calculé au lot 3 si les comptes sont là, sans en faire une étape.
- L'appel téléphonique lui-même. ALX donne le script et enregistre le compte rendu ; il ne compose pas le numéro.

## Décisions à prendre

1. **Le premier secteur.** Une ville et trois rues où l'équipe a déjà acheté ou failli acheter. C'est ce qui rend crédible le premier contact, et c'est sur ces rues que les lots 1 et 2 se calent.
2. **Le rendez-vous juridique.** Avant le lot 4. Deux questions : Hoguet, et données personnelles.
3. **RNE ou Pappers.** Le RNE est gratuit et suffit sur le papier ; Pappers est payant et plus confortable. La première ville tranche.
4. **La clé Street View côté serveur.** Un projet Google Cloud, une clé restreinte à l'API statique, quelques euros par mois.
5. **Les seuils de départ du fichier de règles.** Fenêtre 18-48 mois, détention de plus de vingt ans, gérant de plus de 70 ans, échéance à moins de 24 mois : ce sont ceux du descriptif. Ils s'écrivent dans `alx-signaux.json` avec un commentaire disant qu'ils sont à caler, comme `typologie_ville` dans `rules.json`.
6. **Le nom des classes à l'écran.** « Appeler cette semaine », « Courrier ce mois », « Veille », « Écartée ». Ou plus court. À voir sur la première maquette.
