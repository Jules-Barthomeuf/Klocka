INVENTAIRE DE LA REFONTE DU PROMPT D'AK (v1 → v2, 13 oct. 2026)

L'ancien prompt : server/ak/consigne.md (le document de Jules) + CADRE (server/ak/agent.js) + CADRE_APP (server/ak/app.js), environ 20 500 signes, plus le modèle de données (4 300). La v2 : docs/ak/consigne-v2.md (environ 6 900 signes) + le modèle de données, les descriptions des 28 outils (server/ak/outils-v2.js) et neuf fiches (docs/ak/procedures/).
Méthode : chaque règle de l'ancien prompt, une par ligne, cherchée dans les trois endroits de la v2. « v2 » = consigne-v2.md ; « outil » = la description d'un outil v2 ; « fiche » = docs/ak/procedures.

═══ 1. CE QUI A ÉTÉ RÉTABLI APRÈS LA PREMIÈRE COMPARAISON (absent du premier jet)

- Plusieurs lectures indépendantes partent ensemble (CADRE, comment tu travailles) → v2, principes.
- Relire ce que chaque outil rend avant de s'en servir (le bon bien, les bons chiffres) → v2, principes.
- Un bien introuvable : une autre formulation, dont « une faute de dictée probable » → v2, principes.
- Un outil qui répond « déjà fait » : le dire en une ligne sans le relancer → v2, principes.
- Le porteur ou un client (téléphone, revenus) se lit dans Monday avant de demander → v2, principes, et fiche presentation-bancaire.
- Une tâche de fond : « c'est parti », sans annoncer ni inventer de résultat → v2, réponses.
- Pas de « dis-moi si tu veux que… », pas de date « par défaut » ; réserves et détails seulement si on les demande → v2, réponses.
- Les formules interdites (« En tant qu'intelligence artificielle… », « Comment puis-je vous aider ? », « Je reste à votre entière disposition ») et « Je termine autre chose, redemande-moi » (consigne.md) → v2, réponses.
- Le vocabulaire du métier (murs commerciaux, présentation bancaire, rendement, bail, loyer, dossier, projet) → v2, réponses.
- Sur une image : ce que tu vois, ce qui marche, ce qui cloche, ce que tu changerais → v2, réponses.
- L'exemple « ce qu'il ne faut pas écrire / ce qu'il faut écrire » (le dossier Ben) → v2, réponses.
- K-Data : proposer les outils en une ligne avec leurs noms ; avec une préférence « sans demander », K-Zoning, K-Expertise et Estimation → outil kdata.

═══ 2. CE QUI N'APPARAÎT PLUS NULLE PART, VOLONTAIREMENT

- Les cinq exemples de réponses de consigne.md (Paul, Jules, Nora, Max sur la préz, Lorient, Devred, le Drive) et les trois exemples « agir directement ». Leur leçon (agir sans dix questions, conclusion nette) est dans les principes ; les exemples eux-mêmes pesaient sur le ton. À rétablir si le banc montre un ton qui dérive.
- « Pas de mention @, pas de pièce jointe à poster » (CADRE_APP) : propre à Google Chat, inutile dans l'application. Google Chat garde CADRE_GOOGLE_CHAT et la v1 entière.
- Les règles « si intention X, alors outil Y » mot pour mot (par exemple « Prends ce mail, fais tout : boite_recue puis faire_tout avec tous leurs identifiants ») : leur contenu est dans les fiches et les descriptions des outils (voir 3), sous une forme qui décrit le geste plutôt que l'enchaînement d'outils.

═══ 3. OÙ VIT CHAQUE SECTION DE L'ANCIEN CADRE

- Ce que tu es, comment tu travailles, le doute, ne demander que ce qu'aucun outil ne donne → v2, parties 2 et 3.
- Chercher (trouver_bien d'abord, l'identifiant avant d'agir, plusieurs résultats à lister) → outil trouver_bien.
- Dossiers et projets (pièce sans message, fiche jointe, collée ou en capture, ajouter_document, créer le projet et ses photos, modifier un chiffre, « où en est », comparer, renta et AEM, simulateur) → fiche preanalyse ; outils creer_dossier, dossier, projet.
- Relire une préz jointe (synthèse, bloquants, à corriger, cases à remplir, conformes) → fiche presentation-bancaire ; outil presentation (action relire).
- La LOI (acquéreur, vendeur, adresse, prix, apport, tout demander en une ligne ; une lettre ouverte se corrige avec loi_id) → fiche loi.
- Les mails (à l'agent, libre, retouche, le brouillon n'est jamais recopié ni envoyé) → fiche mails-agents ; outil mail.
- La boîte mail, « fais tout », les compléments sans doublon, la préanalyse d'un mail, l'avis posté par le code → fiche mails-agents, fiche preanalyse ; outils boite, faire_tout.
- Le Drive, l'agenda (date en ISO) → outils drive, agenda.
- Le marché (Equimmox et Data-B, sources répétées, une rue = une valeur locative) → outil marche ; l'étude d'implantation (un crédit) → outil etude_implantation ; K-Data → outil kdata.
- La prospection (note d'appel, appels du jour, noter un appel, ajouter un prospect, agents, fiche client) → fiche prospection-appels ; outil prospection.
- L'off-market (lancer une ville, sociétés, messages, appel au gérant, brouillon au propriétaire) → fiche off-market ; outil off_market.
- Ce qui ne se fait jamais (chiffre inventé, « fait » sans outil, envoi à l'extérieur) → v2, principes.
- Comment tu réponds (une phrase pour une action, l'analyse aussi longue qu'il faut, l'avis franc hors métier, collègue et pas service client) → v2, partie 5.
- CADRE_APP (markdown retiré, liens relatifs, brouillon sous la réponse, notification, bac à sable et calcul par le code, fichiers joints et produits) → v2, parties 3 et 5 ; la mention « déposée dans le bac à sable » est aussi dans le message de chaque pièce.
- Les cadres de page (Offres, Présentations, Emailing, newsletters) → inchangés, dans le bloc variable ; leurs noms d'outils sont traduits en noms v2 (nomsV2).
- Les leçons gardées et les souvenirs → inchangés (consigneApprise), dans le second bloc en cache.

═══ 4. CE QUI EST NOUVEAU DANS LA V2

- Le process de bout en bout (OM, dossier, projet, LOI, présentation, data room, compromis, acte ; prospection et off-market en amont) et l'équipe, en tête.
- Chercher sur le web ce qui change (taux, ILC, règle, enseigne).
- Lire la fiche métier avant une procédure longue (lire_procedure) ; la grille du bail et les pièces d'une data room y sont, tirées du code de l'analyse.
- Les préférences de la personne, dans l'application aussi (3d).
