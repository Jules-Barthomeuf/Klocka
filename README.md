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

# 2. Configurer l'environnement
cp .env.example .env
#   ANTHROPIC_API_KEY  -> fonctionnalités IA
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET -> envoi de mails

# 3. Lancer l'application
npm start
```

**Une seule adresse : http://localhost:3001** — l'interface et l'API sont servies
par le même serveur. `npm start` construit le frontend puis démarre le serveur ;
relancez-le après une modification du code.

Au premier lancement, la base est **initialisée avec un compte admin et des
données de démonstration** (projets, ressources, clients CRM). Vous êtes
automatiquement connecté en tant qu'administrateur.

### Mode développement

Pour travailler sur le code avec rechargement à chaud, deux serveurs tournent en
parallèle — c'est le seul cas où un second port apparaît :

```bash
npm run dev      # interface sur http://localhost:5173 (proxy /api vers 3001)
                 # + API sur http://localhost:3001
npm run server   # API seule
```

## Fonctionnalités IA

Les appels IA (rédaction des mails, `InvokeLLM`, agent **KlockAI**, extraction de
documents) passent au choix par **Gemini** ou **Claude**.

### Gemini (par défaut)

Créez une clé sur <https://aistudio.google.com/apikey>, puis dans `.env` :

```bash
GEMINI_API_KEY=xxxxx
GEMINI_MODEL=gemini-3.6-flash   # optionnel
```

### Claude

```bash
ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-5   # optionnel
```

Si les deux clés sont présentes, **Gemini l'emporte**. Forcez le choix avec
`LLM_PROVIDER=gemini` ou `LLM_PROVIDER=anthropic`.

Sans aucune clé, l'app tourne quand même : les appels renvoient des réponses de
repli et le prompt de la page Mails bascule sur un matching par mots-clés. Le
fournisseur actif est affiché au démarrage du serveur.

## Envoi de mails (page Mails)

La page **Mails** permet d'écrire une instruction en langage naturel
(« envoie le template présentation à Marc Dupont »), de relire le brouillon
généré, puis de l'envoyer en un clic.

- L'IA choisit le template, résout le destinataire dans les entités `Contact` et
  `ClientCRM`, et personnalise le corps. Sans `ANTHROPIC_API_KEY`, un matching
  par mots-clés prend le relais et insère le template sans le reformuler.
- Les templates sont stockés dans l'entité `MailTemplate` et éditables depuis
  l'onglet **Templates** (variables `{{signature}}`, `{{nom}}`, `{{adresse}}`…).
  Ils sont initialisés au premier démarrage à partir des 5 modèles d'origine.
- Chaque envoi est tracé dans `EmailLog` (onglet **Historique**) avec son statut :
  `envoye`, `simule` ou `erreur`.

### Connexion par email + mot de passe

C'est le mode par défaut, sans dépendance externe.

1. L'utilisateur saisit son adresse sur la page d'accueil.
2. L'app la reconnaît en base et affiche son prénom (et « Administrateur » le cas
   échéant).
3. **Première connexion** : il choisit son mot de passe, qui est enregistré.
   **Ensuite** : il le saisit, et tout est déjà en place.

Seules les adresses **déjà présentes** dans l'entité `User` peuvent entrer :
personne ne crée de compte librement. Une adresse inconnue reçoit un message
l'invitant à se rapprocher de Klocka. Les comptes s'ajoutent par
`npm run import` ou depuis l'administration.

Les mots de passe sont stockés sous forme d'empreinte **scrypt** avec sel
aléatoire par utilisateur — jamais en clair, et l'empreinte ne sort jamais de
l'API. Après 8 tentatives échouées, l'adresse est bloquée 15 minutes depuis
cette IP.

> **Point de vigilance.** Tant qu'un compte n'a pas de mot de passe, la première
> personne qui saisit cette adresse le définit et prend la main dessus. C'est le
> revers du parcours sans invitation. Sur un serveur exposé au public, prévoyez
> un jeton d'invitation ou un mot de passe initial communiqué par vos soins.

### Connexion Google (optionnelle)

Laissez `GOOGLE_CLIENT_ID` vide pour ne pas l'utiliser. Si vous la configurez,
**se connecter à l'application et obtenir le droit d'envoyer des mails sont la
même action** : un seul consentement couvre les deux.

L'autorisation demandée est `gmail.send` **uniquement** : l'app peut envoyer en
votre nom, mais ne peut ni lire ni supprimer vos mails.

Chacun ne voit et n'utilise que **sa propre** boîte : les adresses connectées
sont rattachées à leur propriétaire, y compris sur une installation partagée. Un
menu **Envoyer depuis** apparaît si vous rattachez une boîte supplémentaire ;
l'adresse choisie détermine la signature du mail et le `Reply-To`.

La session dure 30 jours et survit à un redémarrage du serveur.

Il faut un client OAuth, à créer une seule fois pour toute l'équipe
sur <https://console.cloud.google.com> :

1. Créez un projet (ou réutilisez-en un).
2. *APIs & Services > Library* : activez **Gmail API**.
3. *APIs & Services > Google Auth Platform* (l'ancien « OAuth consent screen ») :
   - onglet **Branding** : nom de l'app et adresse de contact ;
   - onglet **Audience** : type **Internal** si vous êtes sur Google Workspace
     (recommandé — aucune validation à passer, aucun plafond d'utilisateurs),
     sinon **External** en ajoutant chaque analyste dans *Test users* ;
   - onglet **Data Access** : ajoutez la portée `.../auth/gmail.send`.
4. Onglet **Clients** > *Create client*, type **Application Web**. Dans
   *Authorized redirect URIs*, collez exactement :

   ```
   http://localhost:3001/api/auth/google/callback
   ```

5. Reportez l'ID et le secret obtenus dans `.env` :

   ```bash
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxx
   APP_URL=http://localhost:3001
   ALLOWED_EMAIL_DOMAIN=klocka.immo   # optionnel, seconde barrière
   ```

`APP_URL` doit correspondre à l'adresse tapée dans le navigateur — c'est elle qui
construit l'URI de redirection. Si vous ouvrez l'app autrement (Codespaces,
serveur distant), mettez cette URL dans `APP_URL` **et** déclarez le
`<APP_URL>/api/auth/google/callback` correspondant côté Google.

Le premier compte à se connecter devient **administrateur**, ainsi que l'adresse
indiquée dans `KLOCKA_ADMIN_EMAIL`. Les suivants sont créés en utilisateurs
simples.

Tant que `GOOGLE_CLIENT_ID` est vide, l'application **ne demande pas
d'authentification** et vous connecte automatiquement au compte admin : pratique
pour développer, à ne pas laisser tel quel sur un serveur accessible.

Les jetons restent côté serveur : l'API n'expose jamais que
`{id, nom, adresse}`. Sans compte connecté, les envois sont **simulés** : ils
apparaissent dans l'historique mais ne partent pas.

### Alternative : mot de passe d'application

Si vous ne voulez pas créer de client OAuth, déclarez les comptes dans `.env`
avec un mot de passe d'application Google
(<https://myaccount.google.com/apppasswords>, validation en deux étapes requise —
le mot de passe habituel du compte sera refusé) :

```bash
SMTP_1_NAME=Alexis Petit
SMTP_1_USER=alexis@klocka.fr
SMTP_1_PASS=xxxx xxxx xxxx xxxx
```

Ces comptes apparaissent dans le même menu **Envoyer depuis**.

## Préanalyse de fiches commerciales

Page **Préanalyse** : on dépose une fiche (PDF natif ou scanné, image, `.eml`, ou
texte collé) et on obtient un verdict **GO / GO SOUS RÉSERVE / INSUFFISANT /
NO-GO**, le rendement AEM réel, un simulateur pré-rempli, et — si des
informations manquent — un mail de relance prêt à envoyer à l'agent.

### Trois blocs strictement séparés

| Bloc | Fichier | Rôle | LLM ? |
|------|---------|------|-------|
| 1. Ingestion | `server/deal/ingest.js` | PDF/image/.eml → texte. Un scan est transcrit avant tout le reste, pour qu'il existe un texte contre lequel vérifier les citations. | uniquement pour transcrire |
| 1. Extraction | `server/deal/extract.js` | Remplit un schéma imposé. Ne calcule rien, ne décide rien. | oui |
| 2. Enrichissement | `server/deal/enrich.js` | Ville (API geo.api.gouv.fr), typologie, signature, activité. | repli enseigne inconnue uniquement |
| 2. Calculs | `server/deal/aem.js` | Prix AEM et rendement réel. | non |
| 2. **Règles** | `server/deal/rules.js` | **Produit le verdict. Ici et nulle part ailleurs.** | **non** |
| 3. Rédaction | `server/deal/redact.js` | Met en mots. **N'a pas accès aux documents sources.** | oui |

Cette privation d'accès du rédacteur est la protection anti-hallucination
centrale : il ne peut pas inventer un chiffre qu'il n'a jamais vu, ni contredire
un verdict qu'il n'a pas les moyens de recalculer.

### Garde-fou de citation

Chaque valeur extraite doit être adossée à une citation **littérale** du texte
source. Après l'appel, le code vérifie en sous-chaîne (casse, accents et espaces
insécables normalisés) que la citation existe vraiment. Sinon la valeur est
rejetée, le champ repasse en `absent`, et l'incident est journalisé puis affiché
dans l'interface. Une valeur plausible mais non citée ne franchit jamais cette
barrière.

### Fichiers à faire vivre

Tous dans `server/deal/data/`, éditables sans toucher au code :

- **`rules.json`** — seuils, knock-outs, profils, réserves. **Les profils 01/02/03
  sont vides** : tant qu'aucun n'est actif, le moteur applique les knock-outs et
  contrôle les données clés, mais ne peut pas conclure à un GO ferme et le dit.
  La syntaxe des critères est documentée dans le fichier (`exemple_non_actif`).
- **`enseignes.json`** — référentiel de signature, consulté **avant** tout appel
  LLM. Chaque enseigne validée depuis l'interface y est ajoutée : le verdict
  devient reproductible et un appel est économisé.
- **`activites.json`** — taxonomie fermée et catégories exclues.
- **`revenus-communes.json`** — revenu médian INSEE par code commune. **Vide au
  départ** : aucune valeur n'a été inventée. Une commune absente laisse le flag
  `ville_riche` à `null`, ce qui pose une réserve au lieu de conclure « non ».

### Emplacement

Jamais automatisé, par conception. Le champ sort toujours en `a_qualifier` et
c'est un humain qui tranche en un clic (n°1 / n°1 bis / intermédiaire /
secondaire), ce qui rejoue les blocs déterministes. Aucune règle ne produit de
NO-GO sur ce seul critère.

### Prix AEM

La fiche annonce un prix FAI et un rendement calculé dessus. Nous raisonnons en
**acte en main** : prix négocié + droits d'enregistrement + honoraires Klocka +
incentive + frais divers. L'écart est structurel — sur un dossier à 620 000 €
FAI annoncé à 6,77 %, le rendement AEM ressort à 5,84 %. Les taux viennent de
`rules.json` et reprennent les valeurs par défaut du simulateur, et le
simulateur pré-rempli utilise le **même moteur** (`calculerTableauAnnuel`) que la
page Simulateur : un chiffre vu en préanalyse ne peut pas diverger de la
simulation complète.

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

L'envoi de **SMS** est journalisé en console plutôt qu'envoyé. Les e-mails, eux,
partent réellement dès qu'une adresse est connectée (voir plus haut).

## Structure des scripts

| Script            | Rôle                                                     |
|-------------------|----------------------------------------------------------|
| `npm start`       | Build + application complète sur un seul port (3001)      |
| `npm run dev`     | Mode développement : Vite (5173) + API (3001)             |
| `npm run server`  | API seule, sans reconstruire le frontend                  |
| `npm run build`   | Build de production du frontend                           |
| `npm run import`  | Import d'exports Base44 dans la base locale               |
