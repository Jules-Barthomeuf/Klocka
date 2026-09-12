# ALX, la prospection off-market : plan

ALX est une nouvelle partie de Klocka, avec son entrée dans le menu et sa tuile sur le tableau de bord. On lui donne une ville. Il trouve les bonnes rues, repère les commerces qui correspondent à ce que l'équipe achète, retrouve le propriétaire, prépare le contact, suit les réponses, et le jour où le bail arrive, le dossier entre dans le pipeline d'analyse existant.

Ce qu'ALX cherche est toujours la même chose : des murs commerciaux entre 200 000 et 1 000 000 d'euros, hors activités exclues (bars de nuit, professions libérales, restauration rapide, la liste qui est déjà dans la plateforme), et qui correspondent au budget d'un client réel de Monday.

## Les outils

Ceux qu'on a déjà, dans l'ordre où ALX s'en sert.

| Étape | Outil | État |
|---|---|---|
| Se balader dans la ville, repérer les commerces, qualifier un emplacement | Google Maps et Street View | clé à créer côté serveur, la variable existe dans `.env.example` |
| Adresse vers propriétaire (parcelle, société, nom) | Data-B | connecteur existant, à étendre au module propriétaires |
| Société vers gérants, date de création, autres biens, LinkedIn | Pappers, puis recherche web | compte Pappers à ouvrir |
| Loyer de marché dans la rue | Data-B et Equimmox | connecteurs existants |
| Mutations, ce qui s'est vendu et quand | DVF | connecteur existant |
| Événements sur la société (changement de gérant, radiation, procédure) | BODACC | connecteur existant |
| Critères et budgets des clients | Monday, tableau Investisseurs | connecteur existant |
| Lire une devanture, rédiger un message, résumer une société | Claude | déjà branché |
| Envoyer et recevoir les mails | Gmail | déjà branché |
| Relances et rappels | le registre existant | déjà branché |

Rien de nouveau à installer côté données publiques. Pas de cadastre, pas de Sirene : Data-B donne déjà la parcelle et le nom de la société.

## Ce que fait ALX, en sept étapes

**1. La ville.** L'équipe donne une ville, rien d'autre. ALX lit aussi les clients actifs de Monday, leur budget et leurs critères, pour savoir ce qu'il cherche pour qui.

**2. Les rues.** ALX parcourt la ville sur Google Maps et Street View, rue par rue dans le centre commerçant. Il note pour chaque rue la densité de commerces, les enseignes présentes, l'aspect des façades, la présence de terrasses. Il en sort deux listes : les emplacements numéro 1, les rues les plus solides, où les biens valent 700 000 à 1 000 000 ; et les emplacements numéro 2, un cran en dessous, autour de 300 000 à 500 000, pour les clients à budget plus petit. À Antibes, il y a beaucoup de numéros 1 mais ils sont chers ; les numéros 2 sont ceux qu'on cherche pour un client à 300 000. Chaque rue porte son classement et un mot d'explication. L'équipe peut le corriger.

**3. Les commerces.** Dans chaque rue retenue, ALX liste les locaux avec leur enseigne et leur activité, lus sur Street View, avec la date de la photo. Il écarte tout de suite les activités exclues et ce qui ne ressemble pas à un local achetable (surface manifestement trop petite, local vide, immeuble entier). L'équipe valide la liste en un coup d'œil.

**4. Le propriétaire.** Pour chaque commerce retenu, ALX ouvre Data-B, tape l'adresse, et lit le propriétaire : nom de la société (par exemple SCI Tarte à Champion), parcelle, ce qui est affiché. Si le propriétaire est un particulier et que Data-B ne le donne pas, la cible reste en « propriétaire à trouver » et l'équipe décide si elle va demander au commerçant.

**5. La société et les gens.** ALX cherche la société sur Pappers : date de création, gérants et leurs âges, autres sociétés des mêmes personnes, comptes déposés, événements récents. Il complète par une recherche web et LinkedIn pour mettre un visage et un parcours sur les noms. Il vérifie sur le BODACC s'il s'est passé quelque chose récemment (changement de gérant, transfert de siège, procédure). Il regarde sur DVF quand la parcelle a changé de mains pour la dernière fois et à quel prix.

**6. Le classement.** ALX range chaque cible dans une des trois piles, avec une phrase qui dit pourquoi :

- **À appeler** : un signal fort. Marchand de biens qui détient depuis 18 à 48 mois ; société qui vient de changer de gérant ; échéance de bail proche. Quelques-uns par ville.
- **À écrire** : un signal patient. SCI familiale qui détient depuis plus de vingt ans, gérant âgé, plusieurs gérants du même nom. Ils vendront un jour ; le premier nom qu'ils sortiront sera celui qui leur écrit depuis trois ans. Quelques dizaines par ville.
- **À surveiller** : bon emplacement, bon commerce, mais aucun signal chez le propriétaire. ALX relit le BODACC et DVF tous les mois sur ces sociétés et remonte la cible le jour où quelque chose bouge.

Ce qui ne rentre dans aucune pile est écarté avec son motif, et reste consultable.

Pour les cibles à appeler et à écrire, ALX pose une fourchette de prix : le loyer de marché de la rue (Data-B, Equimmox) pour la surface estimée, divisé par le rendement visé pour ce type de bien, croisé avec le prix de la dernière vente sur DVF. Une fourchette, jamais un chiffre.

**7. Le contact et la suite.** ALX rédige le message, dans la voix des mails de Klocka : l'adresse exacte, l'enseigne, qui nous sommes en deux lignes, achat direct sans mandat ni commission, une seule question, est-ce qu'il serait ouvert à en parler. Mail pour un professionnel, avec relance téléphonique quatre jours plus tard ; courrier papier pour un patrimonial, imprimé et coché à la main. L'équipe relit avant envoi ; rien ne part seul. Les réponses reviennent par la boîte Gmail et se rattachent à la cible. Un oui devient un appel, dont le seul but est d'obtenir le bail et les quittances. Un non s'archive avec sa raison et une date de relance, six mois ou un an. Un bail reçu crée le dossier dans le pipeline d'analyse, à l'étape 1.

## Les écrans

Une entrée **ALX** dans le menu, réservée à l'équipe. Une tuile sur le tableau de bord : combien de cibles à appeler cette semaine, combien de courriers à envoyer, combien de réponses reçues.

Quatre pages :

- **Villes** : la ville en cours, ses rues classées 1 et 2 sur une carte, le nombre de cibles par pile.
- **Cibles** : les trois piles côte à côte, chaque carte avec l'adresse, l'enseigne, le propriétaire, le signal, la prochaine action.
- **Une cible** : la photo de la devanture, le propriétaire et ses gérants, ce que Pappers et LinkedIn en disent, les événements, la fourchette de prix, l'historique des contacts, ce qu'il reste à faire.
- **Bilan** : ce qui a marché. Réponses par rue, par type de signal, par canal ; motifs de refus ; délais. C'est là qu'on ajuste les seuils.

## Ce qu'il faut construire

- Trois entités : `Ville` (avec ses rues classées), `Cible`, `Approche` (chaque tentative, chaque réponse, chaque refus daté). Réservées à l'équipe par construction.
- Le module propriétaires de Data-B dans le connecteur existant.
- Un connecteur Pappers, et la recherche web par Claude.
- La lecture des devantures et le classement des rues, par Claude, à partir de Street View.
- Un petit moteur de classement en trois piles, avec ses seuils dans un fichier lisible et ses tests, comme le verdict de la préanalyse.
- La rédaction des messages, l'envoi Gmail, le rattachement des réponses et les relances : tout existe, il s'agit de le brancher sur une cible plutôt qu'un dossier.
- La création d'un dossier depuis une cible.
- La veille mensuelle BODACC et DVF sur les cibles à surveiller.

## Dans quel ordre

1. **Une ville, à la main.** Les entités, le menu, les pages, et l'équipe saisit ses premières cibles connues. Une semaine.
2. **De la ville aux cibles.** Rues classées, devantures lues, propriétaires par Data-B, sociétés par Pappers. Deux à trois semaines. C'est ce lot qui dira combien de propriétaires on trouve vraiment.
3. **Le classement et le prix.** Les trois piles, la fourchette. Deux semaines.
4. **Le contact.** Messages, envoi, réponses, relances, refus datés, création du dossier. Deux semaines.
5. **Le bilan et la veille.** Une semaine.

Huit à neuf semaines. Chaque lot s'utilise seul.

## À décider

- La première ville.
- Le compte Pappers et la clé Google Maps côté serveur.
- Un rendez-vous avec le conseil avant le premier courrier : on approche des vendeurs pour le compte d'investisseurs (loi Hoguet), et on garde des noms et des âges de gérants (données personnelles). Les mails de Klocka disent déjà « achat direct, sans mandat, sans commission » : c'est ce point qu'il faut confirmer.
- Les seuils de départ des trois piles. Ceux ci-dessus sont un point de départ, à caler sur la première ville.
