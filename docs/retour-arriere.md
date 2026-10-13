# Retour arrière

À mettre à jour à chaque déploiement : ce qui est en ligne, ce qu'il y avait avant, et comment y revenir.

## Comment revenir en arrière

- **Sur Render, le plus rapide.** Service « Klocka » → Events → le déploiement voulu → « Rollback ». Le code revient ; les variables d'environnement et la base restent telles quelles.
- **Par git**, si le retour doit durer : `git revert` des commits fautifs sur la branche, puis pousser sur `main` (avance rapide, jamais de push forcé). Render redéploie seul.
- **Le modèle seul**, sans toucher au code : les variables `AK_MODELE` (le chat) et `ANTHROPIC_MODEL` (le reste) dans Render → Environment, puis « Save and deploy ». Les noms s'écrivent avec des tirets (`claude-opus-5-5`, `claude-sonnet-5-5`) : un point (`claude-opus-5.5`) rend une erreur 404 et coupe l'IA (vu le 13 oct. 2026 au matin).
- **La base** n'a pas de schéma à migrer : les fiches sont du JSON (table `records`). Un retour du code laisse les nouvelles entités en place (EchangeChat, EquimmoxPrix…), l'ancien code les ignore.

## 13 oct. 2026, 9 h 18 : `7523e3a` (puis `1245388`)

- **Avant :** `efef92f` (12 oct., prospection, listes de l'équipe).
- **Variables :** `AK_MODELE=claude-opus-5-5`, `ANTHROPIC_MODEL=claude-sonnet-5-5` (corrigées le 13 oct. à 7 h 22, elles portaient un point).
- **Ce qui est entré, pour le chat d'AK :**
  - phase 0 : journal des échanges (Suivi > Chat), Stop qui coupe vraiment, garde contre les doublons, erreurs d'IA lisibles, HEIC ;
  - phase 1 : réflexion visible à effort `high`, 20 tours avec reprise sur `max_tokens` et `pause_turn`, streaming, consigne en blocs mis en cache, plus de tri avant AK ;
  - partie 0 : AK se souvient des outils d'un message à l'autre (bloc 3), images et PDF joints lus directement (bloc 4) ;
  - partie 1 : bac à sable Python d'Anthropic (calculs, Excel et CSV lus et produits, fichiers à télécharger) ;
  - partie 2 : lecture générique (`lire_entite`, `chercher_entites`) et modèle de données dans la consigne.
- **Ailleurs :** présentations bancaires (PDF, mode Sources, espace client), prix des murs par Equimmox, Data-B une session à la fois, prospection et rappels.
- **Vu en production :** `/api/health` répond (`7523e3a`, base sur disque, IA Claude) ; aucune erreur d'application depuis 9 h 20. À 9 h 10, pendant le premier démarrage (`7523e3a`, 9 h 01), un manque de mémoire (tas à 1 Go) pendant le traitement off-market de Lyon (8 970 vitrines) : Render a redémarré seul, puis le déploiement a été refait à 9 h 18. À surveiller ; ça ne vient pas du chat.
- **Revenir :** Rollback vers le déploiement de `efef92f` (12 oct., 12 h 39). Le chat retrouve l'ancien AK ; les conversations gardées restent lisibles.
