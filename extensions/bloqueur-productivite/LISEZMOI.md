# Bloqueur du temps de travail

Une extension pour Firefox, Chrome (Arc, Brave, Edge) et Safari qui ferme les sites choisis dans la page Productivité
de Klocka pendant les temps de travail, et les rouvre aux pauses et après la fin de la journée.

## Installer

Voir `extensions/INSTALLER.md` (Firefox, Chrome, Safari). Puis ouvrir la page Productivité de Klocka une fois : elle
envoie la journée à l'extension et affiche « Bloqueur actif dans ce navigateur ».

## Comment ça marche

- La page Productivité envoie la journée (début, fin, pauses, sites) à chaque changement ; l'extension la garde.
  Une journée changée sur un autre appareil arrive à la prochaine ouverture de la page dans ce navigateur.
- Toutes les 30 secondes, l'extension regarde l'heure : pendant le travail, les sites renvoient vers une page
  « Ce site attend la pause » qui dit quand vient la prochaine ; les onglets déjà ouverts y passent aussi.
- Le calcul (`journee.js`) est une copie courte de `src/lib/productivite.js` : à changer des deux côtés.
