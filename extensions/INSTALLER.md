# Installer les extensions Klocka

Deux extensions, un même code pour Firefox, Chrome (et Arc, Brave, Edge) et Safari :

- `klocka` : écrire la réponse au message ouvert dans Gmail ou WhatsApp Web, et ranger une conversation WhatsApp sur
  les fiches de Klocka. Rien ne part sans vous : le brouillon est posé dans la case, vous l'envoyez.
- `bloqueur-productivite` : ferme les sites choisis dans la page Productivité pendant les temps de travail.

Il faut être connecté à Klocka dans le même navigateur, avec un compte de l'équipe.

## Ouvrir l'assistant

L'icône Klocka est dans la barre (Firefox l'y pose ; dans Chrome, l'épingler depuis la pièce de puzzle), et
**Option + K** (Alt + K sur PC) ouvre l'assistant depuis n'importe quelle page. Le raccourci se change dans Firefox :
`about:addons`, la roue, « Gérer les raccourcis des extensions ».

## Firefox

- Pour essayer : `about:debugging#/runtime/this-firefox`, « Charger un module complémentaire temporaire », puis le
  fichier `manifest.json` du dossier. Il reste jusqu'à la fermeture de Firefox.
- Pour de bon : Firefox n'installe que des extensions signées par Mozilla. La signature est gratuite et ne publie
  rien (« non listée ») : un compte sur addons.mozilla.org, ses clés d'API, puis `web-ext sign` donne un fichier
  `.xpi` que chacun installe d'un double-clic.
- Firefox demande l'accès aux sites à part : dans `about:addons`, l'extension, onglet « Permissions », autoriser
  l'accès à WhatsApp, Gmail et Klocka (pour le bloqueur : à tous les sites, sinon il ne peut pas fermer YouTube).

## Chrome, Arc, Brave, Edge

`chrome://extensions` (ou `arc://extensions`…), « Mode développeur », « Charger l'extension non empaquetée », puis le
dossier. Elle reste installée.

## Safari

Safari demande une petite application qui porte l'extension, faite avec Xcode (gratuit, sur l'App Store) :
`xcrun safari-web-extension-converter extensions/klocka`, puis « Run » dans Xcode, puis Safari > Réglages >
Extensions. Sans compte développeur Apple (99 € par an), il faut cocher « Autoriser les extensions non signées »
dans le menu Développement, à chaque lancement de Safari ; avec le compte, l'application se signe et s'installe une
fois pour toute l'équipe.

## Où pointe l'extension

L'extension parle à Klocka en ligne (`https://app.klocka.immo`), avec la session du navigateur : il faut y être connecté.
Pour essayer contre le serveur local, poser `base: "http://localhost:5173"` dans son stockage (`extensions/klocka/reglages.js`).
