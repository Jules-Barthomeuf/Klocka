# Klocka dans l'écran de Twenty

Notre version de l'écran de Twenty (28 oct. 2026, Jules) : l'image officielle `twentycrm/twenty:v2.51.0` est gardée telle quelle, et sa page d'accueil vient d'ici.

- `index.html` : la page d'accueil de Twenty 2.51.0, prise sur le serveur, sans la config du client (le serveur la remet lui-même), avec `klocka.js` en plus.
- `klocka.js` : les vues en onglets à droite du choix de vue, et le bandeau au-dessus des lignes cochées (Déplacer, Dupliquer, Supprimer, croix).

Servis par le site statique Render `klocka-twenty-front` (srv-dbgs93gu01pc73avl6hg, https://klocka-twenty-front.onrender.com), séparé de Klocka : Twenty relit la page à chaque chargement, une panne de Klocka ne doit pas couper le CRM. Twenty la prend par `FRONTEND_INDEX_URL=https://klocka-twenty-front.onrender.com/index.html` (service twenty-server).

## Revenir à l'écran d'origine

Retirer `FRONTEND_INDEX_URL` du service twenty-server sur Render et redéployer : Twenty reprend sa propre page.

## Mettre Twenty à jour

`index.html` désigne les fichiers de l'interface de la version 2.51.0 (`/assets/index-<empreinte>.js`). Avant de changer d'image :
1. retirer `FRONTEND_INDEX_URL` et déployer la nouvelle image ;
2. reprendre la page servie par Twenty, enlever le bloc `<script id="twenty-client-config" …>…</script>`, remettre la ligne de `klocka.js` avant `</head>` ;
3. revérifier les repères de `klocka.js` (en tête du fichier) dans la nouvelle version, puis remettre `FRONTEND_INDEX_URL`.

Le site statique ne se déploie pas tout seul : déclencher son déploiement après un changement ici.
