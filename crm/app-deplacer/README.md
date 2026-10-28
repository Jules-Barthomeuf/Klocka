# Klocka : bouton « Déplacer vers » dans Twenty

Une application Twenty privée (twenty-sdk 2.51.3) : un bouton épinglé « Déplacer vers », à côté de Supprimer et Exporter, dès qu'une ligne est cochée dans l'un des 21 tableaux venus de Monday. Il ouvre la liste des autres tableaux. Un clic sur l'un d'eux remplit le champ « Déplacer vers » des fiches cochées, puis Klocka reçoit la modification par webhook et fait le déplacement (`server/crm/deplacer.js`).

Le champ, le journal « Déplacements » et le webhook sont posés par `node scripts/crm/deplacer-twenty.mjs`.

## Publier (Node 24 exigé par le kit)

```bash
cd crm/app-deplacer
npx -p node@24 npm install
npx -p node@24 npx twenty remote:add --url https://twenty-server-3rvp.onrender.com --api-key "$TWENTY_API_KEY" --as klocka
npx -p node@24 npx twenty app:publish --private --remote klocka
npx -p node@24 npx twenty app:install --remote klocka
```

Une nouvelle publication demande un `version` plus haut dans `package.json`. `src/tableaux.ts` se régénère depuis `crm/schema.json` si un tableau change.
