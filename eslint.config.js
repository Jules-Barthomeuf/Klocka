import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";

// Ce qui n'est pas à nous, ou pas du code.
const IGNORES = ["dist/**", "node_modules/**", "server/data/**", "server/marche/fixtures/**", "base44/**"];

// Tout le front : les pages, les composants, et ce qui les tient debout.
// `src/App.jsx`, `src/lib` et `src/main.jsx` en étaient exclus — c'est-à-dire
// le routage, l'authentification et le point d'entrée.
const FRONT = ["src/**/*.{js,mjs,cjs,jsx}"];
// Le serveur n'avait aucune couverture : quinze mille lignes, dont toute la
// logique d'accès aux données, que personne ne relisait automatiquement.
const SERVEUR = ["server/**/*.js", "scripts/**/*.{js,mjs}", "*.config.js"];

export default [
  { ignores: IGNORES },
  {
    files: FRONT,
    languageOptions: { globals: globals.browser },
    ...pluginJs.configs.recommended,
  },
  {
    files: FRONT,
    ...pluginReact.configs.flat.recommended,
    settings: { react: { version: "detect" } },
    plugins: { react: pluginReact, "react-hooks": pluginReactHooks },
    rules: {
      "no-unused-vars": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": ["error", { ignore: ["cmdk-input-wrapper", "toast-close"] }],
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    // Les modules pilotant un navigateur sans écran : le code passé à
    // `page.evaluate()` s'exécute dans la page, pas dans Node. `document` y est
    // légitime. Le déclarer ici plutôt que partout dans le serveur garde
    // l'avertissement utile dans les fichiers qui, eux, n'ont pas de DOM.
    files: ["server/data-b-implantation.js", "server/equimmox.js", "server/marche/navigateur.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Deux modules tournent des deux côtés : le serveur les importe, le front
    // aussi. Ils testent `typeof process` avant de l'utiliser.
    files: ["src/lib/echelles.js", "src/lib/ponderation.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // `\u0000` sert de marqueur interne pour découper une citation : c'est
      // un choix, pas un caractère de contrôle échappé par accident.
      "no-control-regex": "off",
    },
  },
  {
    files: SERVEUR,
    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    ...pluginJs.configs.recommended,
    rules: {
      ...pluginJs.configs.recommended.rules,
      // Une variable oubliée après un remaniement est le signal utile ; un
      // argument qu'on ne lit pas (req, next) est une signature imposée.
      // `ignoreRestSiblings` couvre l'idiome qui retire un champ d'un objet :
      // `const { mot_de_passe, ...reste } = user` — le champ nommé n'est pas
      // oublié, il est délibérément laissé de côté.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      // `catch {}` est un choix explicite fréquent ici : on ignore une source
      // qui tombe. Le bloc vide ailleurs reste une erreur.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
