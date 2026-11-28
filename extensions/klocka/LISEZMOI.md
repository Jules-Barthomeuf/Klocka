# Klocka dans le navigateur

Un clic sur l'icône en haut à droite ouvre le chat de l'assistant Klocka, dessiné d'après la maquette de Jules
(28 nov. 2026) : fond noir, la roue des réglages à gauche (taille du texte, « Ouvrir dans une fenêtre à part » : une
fenêtre qu'on déplace et redimensionne, qui garde sa place), « Klocka » au centre et la croix ; le nom de la conversation, « Conversation WhatsApp lue »
et l'interrupteur pervenche ; l'assistant avec le portrait choisi dans Klocka ; la saisie et l'envoi. « Lier »,
l'historique, le crayon et les réglages ont été retirés le même jour ; l'adresse de Klocka est dans reglages.js
(https://app.klocka.immo ; localhost se pose dans le stockage pour essayer en local).

- dessous, la conversation ouverte (WhatsApp Web) ou la boîte (Gmail) et son interrupteur : une conversation non activée
  n'est jamais lue, pour les conversations personnelles ;
- l'assistant ouvre par une question (« Que veux-tu faire avec Paul Dz ? ») et des pilules : « Répondre à Paul »,
  « Ranger dans Klocka », « Copier la conversation » ;
- en bas, la saisie : c'est l'assistant de la plateforme (même moteur, mêmes outils : dossiers, projets, fiches,
  rappels, notes), avec la conversation ou le mail ouvert en contexte (POST /api/extension/assistant, en flux). Il a trois
  outils de plus, que le navigateur exécute à sa demande (server/ak/extension.js) : lire une autre conversation WhatsApp
  activée (l'extension l'ouvre, la lit, revient), poser un brouillon dans la case de réponse (rien n'est envoyé), ranger
  la conversation par « Ce que j'en retiens » (cocher, puis « Ranger » ou « Laisser »). Exemples : « écris à Paul pour
  lui demander des précisions sur la question de Christophe Lepas », « fais-moi un résumé du dossier KFC » ;
- un chat par conversation et par onglet, retrouvé à la réouverture.

Pas de pré-analyse ni de transfert ici (Jules, 28 nov. 2026) : une fiche reçue se transfère toujours à sourcing@.

Le travail se fait dans le fond (`fond.js`) : la fenêtre peut se fermer, elle retrouve où on en est. Côté serveur :
`POST /api/extension/repondre` (server/fiche-dossier/repondre.js) et les routes de la fiche du dossier.

Gmail et WhatsApp Web changent leur page de temps en temps : si la lecture ou l'écriture casse, c'est dans
`gmail.js` ou `whatsapp.js` (les sélecteurs), rien d'autre.
