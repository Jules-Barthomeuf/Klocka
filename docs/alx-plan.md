# ALX, la prospection off-market : plan

ALX est une nouvelle partie de Klocka, avec son entrée dans le menu et sa tuile sur le tableau de bord. On lui donne une ville. Il trouve les bonnes rues, repère les commerces qui correspondent à ce que l'équipe achète, retrouve le propriétaire, prépare le contact, suit les réponses, et le jour où le bail arrive, le dossier entre dans le pipeline d'analyse existant.

Ce qu'ALX cherche est toujours la même chose : des murs commerciaux entre 200 000 et 1 000 000 d'euros, hors activités exclues (bars de nuit, professions libérales, restauration rapide, la liste qui est déjà dans la plateforme), et qui correspondent au budget d'un client réel de Monday.

## Les outils

Ceux qu'on a déjà, dans l'ordre où ALX s'en sert.

| Étape | Outil | État |
|---|---|---|
| Les rues d'une ville, leur tracé et leurs vitrines | OpenStreetMap (Overpass, gratuit, sans clé) : rues nommées et commerces à 1,5 km du centre | branché : 340 rues et 900 vitrines en une seconde sur Cannes ; l'annuaire de l'État mettait treize minutes pour Antibes |
| Qualifier un emplacement (1 ou 2) | le loyer déduit des ventes DVF à l'échelle de la rue | branché : le milieu de la fourchette de loyer fait la classe, seuils dans `signaux.json` |
| Les commerces d'une rue, enseigne et activité | Annuaire des entreprises, code APE traduit en mots | branché ; Street View viendra lire la devanture quand la clé sera posée |
| Adresse vers propriétaire (parcelle, société, lots, gérants) | les fichiers DGFiP des locaux des personnes morales | branché : bâtiments autour de l'adresse, fiche du bâtiment, propriétaire du rez-de-chaussée retenu |
| Société vers gérants, date de création, code APE | Annuaire des entreprises (État, gratuit, sans clé), puis recherche web | branché |
| Loyer de marché dans la rue | Equimmox et le loyer déduit des ventes | connecteurs existants |
| Mutations, ce qui s'est vendu et quand | DVF | connecteur existant |
| Événements sur la société (changement de gérant, radiation, procédure) | BODACC | connecteur existant |
| Critères et budgets des clients | Monday, tableau Investisseurs | connecteur existant |
| Lire une devanture, rédiger un message, résumer une société | Claude | déjà branché |
| Envoyer et recevoir les mails | Gmail | déjà branché |
| Relances et rappels | le registre existant | déjà branché |

Rien de nouveau à installer côté données publiques, et rien de payant : OpenStreetMap donne les rues et leurs vitrines, l'annuaire de l'État donne les commerces et les sociétés ; DVF donne le loyer déduit des rues et les fichiers DGFiP le propriétaire des adresses quand c'est une société.

## Ce que fait ALX, en sept étapes

**1. La ville.** L'équipe donne une ville, rien d'autre. ALX lit aussi les clients actifs de Monday, leur budget et leurs critères, pour savoir ce qu'il cherche pour qui.

**2. Les rues.** ALX lit le centre sur OpenStreetMap : toutes les rues nommées à 1,5 km du centre, avec leur tracé, et toutes les vitrines que les contributeurs y ont posées (boutiques, restaurants, pharmacies, banques). Il les compte par rue, garde les trente rues les plus vivantes, et déduit des ventes DVF le loyer de marché de chacune : une quinzaine de secondes en tout. Il en sort trois classes, dessinées sur une carte : les emplacements numéro 1 en vert, les rues les plus solides, où les biens valent 700 000 à 1 000 000 ; les 1 bis en ambre, qui tiennent le 1 sans en avoir le loyer ; et les emplacements numéro 2 en bleu, un cran en dessous, autour de 300 000 à 500 000, pour les clients à budget plus petit. On clique une rue sur la carte pour la voir et la cocher ; les rues cochées partent en prospection. À Antibes, il y a beaucoup de numéros 1 mais ils sont chers ; les numéros 2 sont ceux qu'on cherche pour un client à 300 000. Chaque rue porte son classement et un mot d'explication. L'équipe peut le corriger.

**3. Les commerces.** Dans chaque rue retenue, ALX prend les commerces lus dans l'annuaire, avec leur enseigne, leur activité (le code APE traduit en mots) et leur exploitant. Il écarte tout de suite les activités exclues, avec le motif. Quand la clé Street View sera posée, il lira aussi la devanture : la photo, sa date, l'état du local, une surface estimée.

**4. Le propriétaire.** Pour chaque commerce retenu, ALX interroge les fichiers DGFiP avec l'adresse : les bâtiments autour, la fiche du bon numéro, ses propriétaires lot par lot avec leur société et leurs gérants. Il retient le propriétaire du rez-de-chaussée (ou le seul propriétaire de l'immeuble), puis complète la société par l'annuaire de l'État et reclasse. Quand plusieurs se partagent le bas, ou qu'aucun lot du bas n'est publié, la liste est montrée et l'équipe retient en un clic. Les gérants ne sont gardés qu'avec une tranche d'âge, jamais l'âge exact.

**5. La société et les gens.** ALX cherche la société dans l'annuaire des entreprises de l'État : date de création, gérants et leurs âges, autres sociétés des mêmes personnes, comptes déposés, événements récents. Il complète par une recherche web et LinkedIn pour mettre un visage et un parcours sur les noms. Il vérifie sur le BODACC s'il s'est passé quelque chose récemment (changement de gérant, transfert de siège, procédure). Il regarde sur DVF quand la parcelle a changé de mains pour la dernière fois et à quel prix.

**6. Le classement.** ALX range chaque cible dans une des trois piles, avec une phrase qui dit pourquoi :

- **À appeler** : un signal fort. Marchand de biens qui détient depuis 18 à 48 mois ; société qui vient de changer de gérant ; échéance de bail proche. Quelques-uns par ville.
- **À écrire** : un signal patient. SCI familiale qui détient depuis plus de vingt ans, gérant âgé, plusieurs gérants du même nom. Ils vendront un jour ; le premier nom qu'ils sortiront sera celui qui leur écrit depuis trois ans. Quelques dizaines par ville.
- **À surveiller** : bon emplacement, bon commerce, mais aucun signal chez le propriétaire. ALX relit le BODACC et DVF tous les mois sur ces sociétés et remonte la cible le jour où quelque chose bouge.

Ce qui ne rentre dans aucune pile est écarté avec son motif, et reste consultable.

Pour les cibles à appeler et à écrire, ALX pose une fourchette de prix : le loyer de marché de la rue (déduit des ventes, Equimmox) pour la surface estimée, divisé par le rendement visé pour ce type de bien, croisé avec le prix de la dernière vente sur DVF. Une fourchette, jamais un chiffre.

**7. Le contact et la suite.** Pour chaque cible à appeler ou à écrire, ALX rédige un brouillon pendant le parcours (mail pour un professionnel, courrier pour un patrimonial), qu'on retrouve sur la fiche. Le message est dans la voix des mails de Klocka : l'adresse exacte, l'enseigne, qui nous sommes en deux lignes, achat direct sans mandat ni commission, une seule question, est-ce qu'il serait ouvert à en parler. Mail pour un professionnel, avec relance téléphonique quatre jours plus tard ; courrier papier pour un patrimonial, imprimé et coché à la main. L'équipe relit avant envoi ; rien ne part seul. Les réponses reviennent par la boîte Gmail et se rattachent à la cible. Un oui devient un appel, dont le seul but est d'obtenir le bail et les quittances. Un non s'archive avec sa raison et une date de relance, six mois ou un an. Un bail reçu crée le dossier dans le pipeline d'analyse, à l'étape 1.

## Les écrans

Une entrée **ALX** dans le menu, réservée à l'équipe. Une tuile sur le tableau de bord : combien de cibles à appeler cette semaine, combien de courriers à envoyer, combien de réponses reçues.

Quatre pages :

- **Villes** : la ville en cours, ses rues classées 1 et 2 sur une carte, le nombre de cibles par pile.
- **Cibles** : les trois piles côte à côte, chaque carte avec l'adresse, l'enseigne, le propriétaire, le signal, la prochaine action.
- **Une cible** : la photo de la devanture, le propriétaire et ses gérants, ce que l'annuaire et LinkedIn en disent, les événements, la fourchette de prix, l'historique des contacts, ce qu'il reste à faire.
- **Bilan** : ce qui a marché. Réponses par rue, par type de signal, par canal ; motifs de refus ; délais. C'est là qu'on ajuste les seuils.

## Ce qu'il faut construire

- Trois entités : `Ville` (avec ses rues classées), `Cible`, `Approche` (chaque tentative, chaque réponse, chaque refus daté). Réservées à l'équipe par construction.
- Le propriétaire par les fichiers DGFiP : fait (server/alx/foncier-ouvert.js).
- Le connecteur de l'annuaire des entreprises : fait (sociétés, et commerces d'une ville par le mode géographique).
- Le parcours automatique d'une ville : fait (server/alx/parcours.js). Rues lues sur OpenStreetMap et classées par le loyer déduit des ventes, commerces créés, propriétaire, société, BODACC, DVF, classement, brouillon ; journal et arrêt ; relancer reprend où il en était.
- La lecture des devantures par Claude à partir de Street View (photo, état, surface estimée) : le connecteur existe, il attend la clé. C'est elle qui donnera la surface, donc la fourchette de prix, sans saisie.
- Un petit moteur de classement en trois piles, avec ses seuils dans un fichier lisible et ses tests : fait.
- La rédaction des messages, l'envoi Gmail, le rattachement des réponses et les relances : tout existe, il s'agit de le brancher sur une cible plutôt qu'un dossier.
- La création d'un dossier depuis une cible.
- La veille mensuelle BODACC et DVF sur les cibles à surveiller.

## Dans quel ordre

1. **Une ville, à la main.** Fait.
2. **De la ville aux cibles.** Fait, sans Street View : rues par OpenStreetMap et le loyer déduit des ventes, commerces par Google Maps et l'annuaire, propriétaires par les fichiers DGFiP, sociétés par l'annuaire. La première ville dira combien de propriétaires on trouve vraiment.
3. **Le classement et le prix.** Les trois piles : fait. La fourchette attend une surface : saisie sur la fiche aujourd'hui, lue sur la devanture quand la clé Street View sera là.
4. **Le contact.** Brouillons rédigés par le parcours et enregistrement des approches : fait. Reste l'envoi par Gmail depuis la fiche et le rattachement automatique des réponses.
5. **Le bilan et la veille.** Le bilan est là. La veille mensuelle BODACC et DVF sur la pile à surveiller reste à écrire.

Ce qui reste : Street View, l'envoi Gmail et les réponses, la veille mensuelle.

## À décider

- La clé Google Maps côté serveur (Street View Static API) : devantures et surfaces.
- Un rendez-vous avec le conseil avant le premier courrier : on approche des vendeurs pour le compte d'investisseurs (loi Hoguet), et on garde des noms et des âges de gérants (données personnelles). Les mails de Klocka disent déjà « achat direct, sans mandat, sans commission » : c'est ce point qu'il faut confirmer.
- Les seuils de départ des trois piles. Ceux ci-dessus sont un point de départ, à caler sur la première ville.
