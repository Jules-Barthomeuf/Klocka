# Klocka — recréation locale

Recréation **100 % locale** de l'application Klocka, à l'origine construite sur la
plateforme cloud **Base44**. Le frontend React/Vite d'origine est conservé
tel quel ; la dépendance au SDK `@base44/sdk` (base de données, authentification,
IA, fonctions backend, upload de fichiers) est remplacée par un **backend local
Node + Express + SQLite**.

## Architecture

```
Frontend (React + Vite)                 Backend local (Express + SQLite)
────────────────────────                ────────────────────────────────
src/                                     server/
  api/base44Client.js  ─┐                 index.js      routes /api/*
  lib/local-sdk/        │  alias Vite      db.js         SQLite (server/data)
    index.js         ◄──┘  @base44/sdk     seed.js       données de démo + admin
    axios-client.js                        llm.js        API Claude (Anthropic)
                          fetch /api ──►    functions.js  fonctions backend portées
                                            agents.js     agents conversationnels
                                            import.js     import d'exports Base44
```

Le SDK Base44 est remplacé par un **shim local** (`src/lib/local-sdk/`) branché
via un alias Vite : le code applicatif continue d'importer `@base44/sdk` sans
modification. Toutes les entités, l'auth, les intégrations, les fonctions et les
agents passent par le backend local sur `/api`.

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. (Optionnel) configurer l'IA et les variables d'environnement
cp .env.example .env
#   puis renseignez ANTHROPIC_API_KEY pour activer les fonctionnalités IA

# 3. Lancer le backend + le frontend ensemble
npm start
```

- Frontend : http://localhost:5173
- Backend  : http://localhost:3001

Au premier lancement, la base est **initialisée avec un compte admin et des
données de démonstration** (projets, ressources, clients CRM). Vous êtes
automatiquement connecté en tant qu'administrateur.

### Lancer séparément

```bash
npm run server   # backend seul (port 3001)
npm run dev      # frontend seul (port 5173, proxy /api vers le backend)
```

## Fonctionnalités IA (Claude)

Les appels IA (`InvokeLLM`, agent **KlockAI**, extraction de documents,
génération d'images) utilisent l'**API Anthropic** :

- Renseignez `ANTHROPIC_API_KEY` dans `.env` → l'IA fonctionne réellement.
- Sans clé → les appels renvoient des réponses factices (l'app tourne quand même).

Le modèle est configurable via `ANTHROPIC_MODEL` (défaut : `claude-sonnet-4-5` ;
ex. `claude-opus-5`, `claude-haiku-4-5`).

## Importer vos vraies données Base44

Les données du zip d'origine ne contenaient que le **code et les schémas**, pas
vos enregistrements (ils sont dans le cloud Base44). Exportez vos données depuis
Base44 (JSON), puis :

```bash
# Un dossier contenant Project.json, ClientCRM.json, ... (un tableau par fichier)
npm run import ./chemin/vers/export

# Un seul fichier multi-entités : { "Project": [...], "ClientCRM": [...] }
npm run import ./export.json

# Un tableau JSON d'une seule entité
npm run import ./projets.json -- --entity Project
```

Les enregistrements existants (même `id`) sont mis à jour, les nouveaux insérés.

## Base de données

SQLite dans `server/data/klocka.db` (ignoré par git). Les 22 entités Base44 sont
stockées dans une table générique `records` (blob JSON par enregistrement), ce
qui préserve la souplesse de schéma de Base44. Les fichiers uploadés vont dans
`server/uploads/` (servis sur `/uploads`).

Pour repartir de zéro : supprimez `server/data/` et relancez.

## Ce qui n'est pas répliqué

Les intégrations qui nécessitent une authentification OAuth externe renvoient un
message explicatif plutôt que d'échouer :

- Import / recherche **Google Drive**
- Synchronisation **GitHub**

L'envoi d'e-mails / SMS est **journalisé** (console + entité `EmailLog`) plutôt
qu'envoyé ; branchez un fournisseur SMTP dans `server/email.js` si besoin.

## Structure des scripts

| Script            | Rôle                                             |
|-------------------|--------------------------------------------------|
| `npm start`       | Backend + frontend en parallèle                  |
| `npm run dev`     | Frontend (Vite) seul                             |
| `npm run server`  | Backend (Express) seul                           |
| `npm run build`   | Build de production du frontend                  |
| `npm run import`  | Import d'exports Base44 dans la base locale      |
