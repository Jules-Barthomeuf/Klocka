# Extension Klocka — plan

L'extension Klocka est un panneau qui s'ouvre à côté de Gmail, dans le navigateur de l'équipe. On y voit le mail d'agent ouvert et ses pièces jointes, on y dépose d'autres fichiers si besoin, on écrit une consigne — « crée un nouveau dossier et analyse ces documents » — et la plateforme crée le dossier, y dépose les pièces et lance l'analyse. Le dossier apparaît ensuite dans Klocka, prêt à être lu, avec son verdict. Ce qui change au quotidien : plus de téléchargement des pièces jointes puis de dépôt à la main, plus d'aller-retour entre la boîte mail et la plateforme pour ouvrir un dossier.

Le plan ci-dessous s'appuie sur ce que le serveur sait déjà faire — analyser une fiche depuis un mail complet, lire une boîte Gmail rattachée, déposer des pièces avec extraction en tâche de fond, ouvrir une session sans cookie pour une fenêtre étrangère. L'extension ajoute peu de choses au serveur ; elle en ordonne l'usage.

## Ce que fait l'extension

Le parcours, depuis un mail ouvert jusqu'au dossier analysé :

1. Dans Gmail, un clic sur l'icône Klocka ouvre le panneau latéral à droite, ou une fenêtre détachée selon le réglage choisi. La première fois, le panneau demande de se connecter avec le compte Klocka habituel ; les comptes restent sur invitation, une adresse inconnue est refusée.
2. Un mail d'agent est ouvert. Le panneau reconnaît le message affiché et montre la carte « Mail ouvert » : expéditeur, objet, date, liste des pièces jointes avec leur taille.
3. Si la boîte est rattachée à Klocka en lecture (c'est déjà le cas pour la veille), les pièces sont marquées « récupérables directement » et cochées par défaut. Sinon, le panneau l'explique et propose de glisser les fichiers depuis l'ordinateur.
4. On peut ajouter d'autres fichiers par glisser-déposer, quel que soit le cas.
5. On écrit la consigne dans la boîte du bas. Le panneau la traduit en proposition lisible avant d'agir : « Nouveau dossier "Local commercial, rue Victor Hugo, Lyon" — 3 pièces — analyse de la fiche ». Une consigne du type « ajoute ça au dossier Monoprix Lyon » vise un dossier existant, choisi dans la liste.
6. Un clic sur « Créer le dossier ». Rien n'est parti avant ce clic.
7. La progression s'affiche par étapes : dossier créé, mail récupéré, pièces déposées 2 sur 3, analyse de la fiche en cours, extraction des pièces lancée. L'analyse prend de quelques dizaines de secondes à quelques minutes.
8. À la fin : le titre du dossier, le verdict par lot et le bouton « Ouvrir dans Klocka », qui ouvre le dossier dans un nouvel onglet. L'agent expéditeur est rattaché au dossier.
9. Le chat du panneau reste ouvert sur ce dossier : « quelle est l'échéance du bail ? » interroge les pièces comme dans l'application.
10. « Préparer un mail à l'agent » propose un brouillon à partir des mails types ; l'envoi reste un geste humain, dans Gmail.
11. Serveur injoignable : bandeau « Klocka injoignable », consigne et fichiers gardés en brouillon local, bouton « Réessayer ».
12. Révocation : dans l'application, la session de l'extension est listée avec sa date ; « Déconnecter » la supprime et le panneau redemande une connexion.

## Architecture

Quatre composants, dont un seul touche Gmail :

- **Le panneau** (page d'extension, React) : tout ce que l'utilisateur voit et tout ce qui parle à l'API Klocka. Il réutilise la boîte de saisie et les mails types de l'application.
- **Le content script Gmail** : le seul code injecté dans mail.google.com. Il lit l'identifiant du message affiché et trois en-têtes pour l'affichage, rien d'autre, et les transmet au panneau. Il n'appelle jamais l'API Klocka : un script dans la page Gmail est soumis au CORS de Gmail, et le cookie de session ne partirait pas.
- **Le service worker** : sans état, il ouvre le panneau ou la fenêtre détachée et relaie les messages. Aucun appel long n'y vit : Chrome l'arrête après quelques dizaines de secondes d'inactivité.
- **Le serveur Klocka** : il télécharge le mail et les pièces via l'API Gmail avec la boîte d'équipe déjà rattachée, crée le dossier, dépose les pièces, lance l'analyse et suit la progression.

Le flux, dans l'ordre :

```
Gmail (mail ouvert)
   │  identifiant du message + en-têtes
   ▼
Content script ──message──▶ Panneau ──HTTPS + jeton──▶ Serveur Klocka
                                                          │ API Gmail (boîte rattachée)
                                                          │ crée le dossier, dépose les pièces
                                                          │ analyse la fiche, extrait les pièces
                             Panneau ◀──progression──────┘
                                │
                                ▼
                     « Ouvrir dans Klocka » → /Analyse?deal_id=…
```

Deux choix structurants ont été comparés :

- **Lire Gmail par l'API serveur plutôt que par la page.** La lecture du DOM de Gmail est fragile (classes obscurcies, structure qui change) et donnerait à l'extension un accès aux pièces qu'il faudrait ensuite réexpédier. Le serveur sait déjà télécharger un message complet et ses pièces jointes pour les boîtes rattachées ; l'extension ne transmet qu'un identifiant. Le mode « fichiers depuis l'ordinateur » reste comme repli et complément.
- **Ne pas embarquer l'application dans le panneau.** L'application interdit son affichage dans une iframe d'un autre site. Le panneau parle à l'API et renvoie vers l'application par lien.

## Authentification et sécurité

Aucun secret dans le code de l'extension : ni clé d'API, ni identifiant Google.

- **Un jeton propre à l'extension.** Le serveur accepte déjà une session sans cookie, prévue pour une fenêtre étrangère : un en-tête `Authorization: Bearer` et un en-tête `X-Klocka-Fenetre: 1` qui fait ignorer le cookie. Le jeton s'obtient par la connexion habituelle (mot de passe, ou Google en mode fenêtre) et se range dans le stockage de l'extension, isolé des pages web. Il ne part que vers l'adresse de l'application.
- **Révocable à distance.** Chaque session d'extension est marquée comme telle (origine, libellé de poste, date). L'application en donne la liste et permet d'en supprimer une : poste perdu, changement de machine.
- **Un point à corriger avant tout.** La connexion Google en mode fenêtre renvoie le jeton dans l'adresse de retour, et cette adresse n'est pas vérifiée aujourd'hui. Le lot 0 la restreint à un chemin de l'application ou à l'adresse de retour de l'extension déclarée en configuration.
- **CORS.** En production, le serveur ne répond qu'à l'origine de l'application. Les pages d'extension échappent à cette règle si le manifest déclare l'hôte de l'application ; le content script, lui, n'appelle rien.
- **Rien ne part par mail.** L'extension ne déclenche jamais d'envoi : elle prépare des brouillons, l'envoi reste un geste dans Gmail ou dans l'application. La consigne interprétée ne fait que proposer une action ; c'est le clic qui l'exécute, et cette action ne passe pas par les outils de l'assistant qui ont des effets de bord (CRM, Monday).
- **Équipe seulement.** Les routes utilisées répondent 403 à un compte client.

## Ce que le serveur doit ajouter

| Méthode | Chemin | État | Rôle |
|---|---|---|---|
| POST | /api/auth/connexion | existant, à enrichir | Avec `fenetre: true`, rend un jeton sans cookie. Ajouter `client: 'extension'` et un libellé de poste pour marquer la session. |
| GET | /api/auth/google/login | existant, à corriger | Valider l'adresse de retour (chemin relatif ou adresse de retour de l'extension). |
| GET | /api/auth/sessions | nouveau | Lister les sessions de l'utilisateur, avec origine et date. |
| DELETE | /api/auth/sessions/:id | nouveau | Révoquer une session d'extension. |
| GET | /api/mails/gmail/message | nouveau | À partir de l'identifiant Gmail : en-têtes et pièces jointes, si une boîte lisible de l'utilisateur porte ce message. |
| GET | /api/mails/gmail/recherche | nouveau | Repli quand l'identifiant n'est pas lu : recherche par objet et expéditeur. |
| POST | /api/preanalyse/depuis-mail | nouveau | Orchestration en tâche de fond : dossier, mail brut, pièces choisies, analyse, extraction. Répond 202 avec un identifiant de tâche. Refuse en 409 un mail déjà traité, en renvoyant le dossier existant. |
| POST | /api/preanalyse/taches | nouveau | Même orchestration en mode fichiers, à partir de pièces déjà déposées. |
| GET | /api/preanalyse/taches/:id | nouveau | Progression par étapes, lien vers le dossier à la fin. |
| POST | /api/assistant/intention | nouveau | Interprète la consigne en action structurée, sans effet de bord : créer un dossier, ajouter à un dossier, analyser. |
| POST | /api/preanalyse/dossiers | existant | Crée le dossier nommé vide (mode fichiers). |
| POST | /api/preanalyse/dossiers/:dealId/espace/documents | existant | Dépose une pièce ; l'extraction part toute seule. |
| POST | /api/preanalyse/analyser | existant | Analyse la fiche dans le dossier (mode fichiers). |
| GET | /api/preanalyse/dossiers | existant | Liste des dossiers, pour viser un dossier existant. |
| POST | /api/preanalyse/dossiers/:dealId/espace/chat | existant | Le chat sur les pièces depuis le panneau. |
| GET | /api/health | existant, à enrichir | Version minimale d'extension acceptée. |

## Découpage en lots

Le lot 1 est utilisable seul : sans lecture Gmail, l'extension fait déjà gagner le dépôt et la création du dossier depuis n'importe quelle page.

| Lot | Livrable | Effort | Dépend de |
|---|---|---|---|
| 0 — Socle serveur | Validation de l'adresse de retour Google ; sessions marquées « extension » avec libellé ; liste et révocation des sessions ; page Paramètres « Extension Gmail ». | 1 à 2 jours | — |
| 1 — Extension en mode fichiers | Dossier `extension/` dans le dépôt, build Vite séparé, Manifest V3 (clé fixée pour un identifiant stable, panneau latéral, stockage, hôte de l'application). Connexion, dépôt de fichiers, choix « nouveau dossier » ou dossier existant, création, analyse, progression, lien vers Klocka. | 3 à 5 jours | Lot 0 |
| 2 — Intégration Gmail par l'API serveur | Content script minimal (identifiant du message, trois en-têtes) avec instantanés HTML de test ; routes message, recherche et orchestration `depuis-mail` ; dédoublonnage par identifiant Gmail. | 4 à 6 jours | Lot 1 |
| 3 — Consigne interprétée et chat | Route `intention` (schéma strict, aucun outil d'envoi) ; proposition lisible avant le clic ; chat sur les pièces et mails types dans le panneau. | 3 à 4 jours | Lot 2 |
| 4 — Distribution et robustesse | Publication non listée sur le Chrome Web Store et Edge Add-ons ; mode hors connexion (brouillon local, réessai) ; vérification de version au démarrage. | 2 à 4 jours | Lot 2 |

## Risques et parades

- **Gmail change sa page** et le content script ne lit plus l'identifiant. Parade : dépendance réduite à un identifiant et trois en-têtes, sélecteurs dans un seul fichier testé contre des instantanés, repli par recherche objet et expéditeur, et toujours le mode fichiers.
- **La boîte du mail ouvert n'est pas rattachée** à Klocka, ou la lecture Gmail n'est pas activée. Parade : le serveur essaie toutes les boîtes lisibles de l'utilisateur ; sinon message clair et mode fichiers.
- **L'analyse dépasse le délai d'une réponse HTTP.** Parade : orchestration en tâche de fond, le panneau interroge la progression ; rien ne s'exécute dans le service worker.
- **Jeton d'extension volé** (poste partagé, perdu). Parade : stockage isolé, envoi vers la seule adresse de l'application, session marquée et révocable depuis l'application.
- **Un même mail traité deux fois** crée deux dossiers. Parade : l'identifiant Gmail est gardé sur le dossier ; un second traitement répond avec le dossier existant et propose d'y ajouter les pièces.
- **La consigne déclenche un effet non voulu** (mail, Monday). Parade : l'interprétation ne fait que proposer ; la création passe par la création simple de dossier, jamais par les outils de l'assistant.
- **Pièces volumineuses en mode fichiers.** Parade : voie principale par le serveur (la pièce ne transite pas par l'extension) ; en mode fichiers, une pièce par requête et un plafond de taille annoncé.
- **Identifiant d'extension instable** entre postes en chargement non empaqueté. Parade : clé publique fixée dans le manifest, puis publication non listée.

## Hors champ pour l'instant

- Envoi de mails depuis l'extension.
- Accès des clients : réservée à l'équipe.
- Autres messageries (Outlook web, Apple Mail, Gmail mobile) et autres navigateurs (Firefox, Safari).
- Lecture Gmail côté client ou OAuth Google depuis l'extension.
- Traitement en lot de toute la boîte : c'est le rôle de la veille serveur.
- Modification des dossiers depuis le panneau (statut, abandon, simulateur) : cela se fait dans l'application.

## Décisions à prendre

1. **Panneau latéral ou fenêtre détachée par défaut ?** Recommandation : panneau latéral, avec la fenêtre détachée en réglage ; le panneau reste collé à Gmail sans gêner.
2. **Lecture Gmail par le serveur, ou fichiers seulement ?** Recommandation : le serveur, dès le lot 2 ; la boîte est déjà rattachée pour la veille, et c'est ce qui supprime le téléchargement des pièces à la main.
3. **Chrome Web Store non listé, ou chargement manuel ?** Recommandation : le magasin, non listé, dès que le lot 2 est stable ; le chargement manuel affiche un avertissement à chaque démarrage et complique les mises à jour.
4. **Qui peut installer l'extension ?** Recommandation : les comptes admin seulement, ce que les routes imposent déjà ; la liste des sessions dans l'application permet de voir qui l'a installée.
5. **Que faire d'un mail dont la boîte n'est pas rattachée ?** Recommandation : proposer de rattacher la boîte depuis l'application, et en attendant le mode fichiers.
