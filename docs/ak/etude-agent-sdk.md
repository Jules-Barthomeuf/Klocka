# Étude : faut-il passer AK sur le Claude Agent SDK ?

13 oct. 2026. Rapport seul : aucun code changé, aucun appel payant.

Quatre choses à ne pas confondre :

- **Notre boucle** : `runAgent` dans `server/llm.js`, qui parle directement à l'API Messages.
- **Le Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) : Claude Code en bibliothèque. Il lance un processus `claude` à côté du nôtre, avec ses outils (Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch), ses sessions sur disque, ses hooks, ses sous-agents et ses skills ([vue d'ensemble](https://code.claude.com/docs/en/agent-sdk/overview)).
- **La Tool Runner** du SDK API (`client.beta.messages.toolRunner`) : une boucle d'outils toute faite, dans notre processus, en bêta ([doc](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner)). Elle ferait moins que notre boucle (ni reprise sur `max_tokens`, ni journal, ni dernier tour sans outil).
- **Managed Agents** : la boucle et le bac à sable hébergés chez Anthropic, en bêta (en-tête `managed-agents-2026-04-01`) ([vue d'ensemble](https://platform.claude.com/docs/en/managed-agents/overview)). C'est la troisième option.

Le SDK est déjà dans le dépôt : `package.json:25` (`^0.3.278`), utilisé par `server/ak/design.js:33` pour « redesign la page X » (worktree, Bash, `acceptEdits`, jusqu'à 60 tours, `server/ak/design.js:19` et `:48-56`). Le chat, lui, n'y passe pas.

## 1. Où en est notre boucle

Ce qu'elle fait déjà, après les phases 0 et 1 et les parties 0 à 2 :

| Sujet | Ce qui est en place | Où |
| --- | --- | --- |
| Tours | 20 tours, puis un dernier tour sans outil qui dit ce qui reste | `server/llm.js:641`, `:924-939` |
| Reprises | `pause_turn` renvoyé tel quel ; `max_tokens` repris deux fois, appels inachevés refusés proprement | `server/llm.js:874-889` |
| Streaming | `messages.stream`, le texte part morceau par morceau vers l'écran | `server/llm.js:853-855`, route `server/routes/assistant.js:241-252` |
| Stop | `AbortController` : plus d'outil, requête coupée | `server/llm.js:840`, `server/routes/assistant.js:244-246`, `server/ak/app.js:227` |
| Cache | quatre points : outils, consigne stable, leçons, la demande elle-même | `server/llm.js:808-831`, `server/ak/app.js:219` |
| Réflexion | adaptative, affichée en résumé, 32 000 jetons | `server/llm.js:745-746` |
| Erreurs d'outil | dites au modèle avec `is_error` ; une exception devient un refus | `server/llm.js:906`, `server/ak/agent.js:677-688` |
| Exécution de code | `code_execution_20260521` chez Anthropic, même bac d'un tour à l'autre | `server/llm.js:753`, `:833-836` |
| Fichiers | produits rapatriés dans `uploads/ak` ; Excel, CSV, Word déposés dans le bac | `server/llm.js:756-801`, `server/ak/app.js:109-116` |
| Pièces natives | images (5 Mo) et PDF (20 Mo) lus directement | `server/ak/app.js:54-75` |
| Mémoire | les outils d'une réponse reviennent avec elle (8 000 signes, 4 dernières) | `server/ak/app.js:78-95`, `:118-123` |
| Journal | chaque tour, outil, réflexion, coût, durée, lu dans Suivi > Chat | `server/llm.js:666-697` |
| Outils | 82 outils métier, un seul point d'entrée `executerOutil` | `server/ak/agent.js:612`, `:677` |
| Droits | lecture générique bornée par rôle, dans le code | `server/ak/lecture-generique.js:26-41`, `:71`, `:101` |
| Banc | 30 cas réels rejoués sur une copie, sorties simulées | `server/ak/banc/rejouer.js`, `server/ak/banc/cas.json`, `server/ak/banc/garde.js` |

La même boucle sert sept chats : AK dans l'application (`server/ak/app.js:213`), AK dans Google Chat (`server/ak/agent.js:1592`), le chat mandataire (`server/mandataire.js:810`), l'estimation (`server/mandataire-avis.js:541`), la prospection (`server/mandataire-prospective.js:447`), le mandat (`server/mandataire-mandat-chat.js:265`), plus le récap du matin et d'autres (`server/ak/matin.js:59`, `server/ak/oreille.js:81`, `server/marche/question.js:217`).

La partie 3 (`docs/ak/plan-partie3.md`) prévoit 26 outils, le chargement à la demande par l'outil de recherche de l'API (`tool_search_tool_bm25_20251119`, `defer_loading`), des fiches métier lues par `lire_procedure`, et la consigne v2. Elle se fait dans notre boucle, sans changer de socle.

## 2. Ce que la migration apporterait de plus

Point par point, après les parties 1 à 3.

| Apport du SDK | Ce qu'on a déjà | Vraiment nouveau ? |
| --- | --- | --- |
| La boucle elle-même ([agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop)) | La nôtre, plus fine sur les reprises et la fin | Non |
| `maxTurns`, `maxBudgetUsd` (arrêt au budget) | 20 tours ; pas de plafond en euros par demande | Le plafond en euros, oui ; il s'ajoute en dix lignes chez nous |
| Exécution : Bash, Read, Write sur **notre** serveur | Le bac Python d'Anthropic, hors de chez nous | Non, et c'est moins sûr (partie 4) |
| Fichiers produits | Rapatriés depuis le bac | Non |
| Skills (fichiers `SKILL.md` lus à la demande) ([skills](https://code.claude.com/docs/en/agent-sdk/skills)) | `lire_procedure` prévu en 3c ; l'API Messages accepte aussi des skills dans le conteneur d'exécution de code ([guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide)) | Non : même idée, déjà prévue |
| Recherche d'outils, active par défaut sur les outils MCP ([custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools)) | Prévue en 3a par l'outil de l'API | Non |
| Sous-agents (outil `Agent`, contexte neuf, seul le résumé revient) ([subagents](https://code.claude.com/docs/en/agent-sdk/subagents)) | Les tâches de fond (LOI, K-Data, préz) partent hors du chat (`server/ak/app.js:248-252`) | Oui, en partie : un sous-agent qui raisonne. Utile pour une data room, pas pour le chat |
| Hooks (`PreToolUse`, `PostToolUse`, `PreCompact`…) | `tracer`, `onTool`, le journal, la garde du banc | Non : ce sont nos fonctions autour de `executerOutil` |
| Sessions reprises sur disque (`resume`, `SessionStore`) ([hosting](https://code.claude.com/docs/en/agent-sdk/hosting)) | L'historique (20 messages) et la mémoire des outils, en base | Non, et le disque de Render ne survit pas à un redéploiement sans `SessionStore` |
| Compaction automatique du contexte | Inutile aujourd'hui : historique borné à 20 messages, mémoire à 8 000 signes. Si un jour il le faut, l'API Messages a sa compaction côté serveur (`compact_20260112`, bêta) ([doc](https://platform.claude.com/docs/en/build-with-claude/compaction)) | Non |
| Parallélisme des lectures (`readOnlyHint`) | Nos outils tournent l'un après l'autre (`server/llm.js:892-909`) | Oui, mais un gain de secondes ; faisable chez nous |
| Coût estimé par demande (`total_cost_usd`, « une estimation ») | `coutDe` et le journal, au centime | Non |

En clair : après la partie 3, le seul apport réel pour le chat serait les sous-agents et le parallélisme des lectures. Les deux se font dans notre boucle si le besoin se montre.

## 3. Ce qu'elle casserait ou obligerait à réécrire

| Chantier | Pourquoi | Effort |
| --- | --- | --- |
| 82 outils (26 après la partie 3) en serveur MCP | Chaque outil passe par `tool()` avec un schéma Zod et rend `{ content, isError }` ; les noms deviennent `mcp__klocka__…` (consigne, banc, journal, `LECTURES` de `server/ak/app.js:32` à reprendre) | 2 à 3 j |
| Droits | Restent dans `executerOutil` et `lecture-generique.js`, mais l'utilisateur doit être passé à chaque outil par fermeture, une session par personne | 0,5 j |
| Streaming et Stop | Remplacer `surTexte` par les `StreamEvent` (`includePartialMessages`) et le Stop par `abortController` / `interrupt()` (vus dans `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1454`, `:2685`) | 1,5 j |
| Pièces jointes natives et bac de code | Images et PDF à faire passer en messages du SDK ; l'exécution de code d'Anthropic n'est pas un outil du SDK que j'aie vu documenté, l'équivalent serait Bash chez nous | 1 à 2 j |
| Journal et coûts | Le journal lit nos `notes.tours` ; il faudrait le refaire à partir des messages du SDK | 1 j |
| Cache | Le SDK cache tout seul ; une consigne maison se coupe en deux blocs au plus (`SYSTEM_PROMPT_DYNAMIC_BOUNDARY`) ([system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)). Nous en avons trois, plus la demande : à re-mesurer | 0,5 j + banc |
| Consigne | Sans `systemPrompt`, le SDK met une consigne minimale sans les règles de sécurité de Claude Code ; il ajoute ses propres rappels (CLAUDE.md, git, skills) qu'il faut couper un par un | 0,5 j |
| Banc | `rejouer.js` appelle `repondreApp` ; il suit, mais toutes les passes avant/après sont à refaire | 1 j |
| Google Chat et cinq chats mandataires | Même travail pour chacun, ou deux socles à maintenir | 2 à 3 j |
| Render | Binaire natif Linux à vérifier au build (dépendances optionnelles), sous-processus par session, tests de mémoire | 1 à 2 j |

**Total : 11 à 16 jours**, sans compter les régressions que le banc trouvera.

**Le coût par demande** ne baisse pas. Les jetons sont facturés au même tarif API (Opus 5.5 : 4 $ / 20 $ le million en entrée / sortie, lecture du cache à 0,20 $ ([tarifs](https://platform.claude.com/docs/en/about-claude/pricing))). Aujourd'hui : 0,06 € la demande en médiane, 0,135 € en moyenne, 14,62 € pour 108 demandes sur 30 jours (`docs/etat-plateforme.md`, « Ce que l'IA coûte » et « AK ») ; au banc, 2,98 € pour 30 cas, soit 0,10 € le cas (`server/data/banc/partie2.md`). Avec le SDK, on paierait en plus les schémas des outils intégrés s'ils restent actifs, et un tour `ToolSearch` chaque fois qu'un outil différé est chargé. Estimation, à mesurer : de 0 à +20 % par demande. Sur 15 € par mois, l'enjeu est de quelques euros dans un sens ou dans l'autre. Il n'y a pas d'économie à aller chercher là.

## 4. Les risques

- **Sécurité.** Un agent avec Bash et Write sur le serveur de production lit `.env`, la base sur disque et `uploads/`. La documentation le dit : la commande Bash filtrée par permissions « is a permission gate, not a sandbox », et l'isolement recommandé passe par un conteneur, gVisor ou une VM, avec un proxy pour les clés ([secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment)). Render ne donne pas ça pour un sous-processus. Un mail ou un PDF piégé déposé dans le chat deviendrait une injection avec un shell derrière. Aujourd'hui le code tourne chez Anthropic, sans internet, sans nos secrets.
- **Déjà présent.** `server/ak/design.js:43` copie `.env` dans le worktree, et l'agent y a Bash (`:53`). Si `AK_DESIGN` est actif sur Render, ce risque existe déjà. À vérifier dans les variables de Render.
- **Mémoire.** Une session = un sous-processus `claude`. La documentation conseille « 1 GiB RAM, 5 GiB disk, and 1 CPU per agent » au départ, et prévient que la mémoire grossit avec la session ([hosting](https://code.claude.com/docs/en/agent-sdk/hosting)). Le binaire macOS pèse 208 Mo sur disque (`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64`, mesuré ; le Linux non mesuré). Sur 2 Go, avec un tas Node qui a déjà atteint 1 Go le 13 oct. à 9 h 10 pendant l'off-market de Lyon (`docs/retour-arriere.md`), deux chats ouverts en même temps suffiraient à faire tomber le serveur.
- **Dépendance.** Le SDK suit le rythme de Claude Code : version 0.3.278, binaire épinglé à la version, « review the changelog before taking a minor ». Son comportement (consigne, rappels, recherche d'outils) change sans que nous l'écrivions. Notre boucle ne dépend que de l'API Messages, stable.
- **Managed Agents.** Pas de rétention zéro des données (« not currently eligible for Zero Data Retention ») ; les sessions et fichiers restent chez Anthropic jusqu'à suppression. Les outils métier restent chez nous : la session émet un appel, notre serveur répond ([tools](https://platform.claude.com/docs/en/managed-agents/tools)). Coût : les jetons au tarif API, plus 0,08 $ par heure de session active ([tarifs](https://platform.claude.com/docs/en/about-claude/pricing)).

## 5. Recommandation

**Rester sur notre boucle pour tous les chats. Ne pas migrer.**

- Elle fait déjà ce que le SDK apporterait au chat : reprises, streaming, Stop, cache fin, réflexion, exécution de code isolée, fichiers, journal, banc.
- Ce qui reste à gagner (moins d'outils, chargement à la demande, fiches métier, consigne v2) est la partie 3, prévue dans notre boucle avec les outils de l'API.
- La migration coûte 11 à 16 jours, n'économise rien sur 15 € par mois, et met un shell et un sous-processus de 1 Go sur un serveur de 2 Go qui a déjà manqué de mémoire.

**Hybride, plus tard et seulement sur une tâche de fond longue.** Si un jour on veut qu'un agent raisonne sur une data room de 40 documents pendant vingt minutes (et pas seulement croiser les extractions, ce que `server/deal/dossier-lecture.js` fait déjà sans modèle), le bon outil est **Managed Agents**, pas l'Agent SDK sur Render : le bac à sable et la mémoire sont chez Anthropic, nos outils métier restent chez nous et gardent leurs droits, le coût est celui des jetons plus 0,08 $ l'heure. À tester sur un cas, derrière une variable, avec le banc. Avant cela, le traitement différé à moitié prix (levier déjà mesuré dans `docs/etat-plateforme.md`) est plus rentable pour la lecture des pièces.

**Deux petites choses à faire, sans migration :**

1. Vérifier si `AK_DESIGN` est actif sur Render. S'il l'est, le couper en production ou le garder sur le Mac de Jules, et ne plus copier `.env` dans le worktree (`server/ak/design.js:43`).
2. Si un plafond en euros par demande est voulu, l'ajouter dans `runAgentAnthropic` à partir de `notes.usage` : c'est le seul réglage du SDK qui nous manque.

## Sources

- Agent SDK : [overview](https://code.claude.com/docs/en/agent-sdk/overview), [agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop), [hosting](https://code.claude.com/docs/en/agent-sdk/hosting), [custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools), [system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts), [secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment), [subagents](https://code.claude.com/docs/en/agent-sdk/subagents), [skills](https://code.claude.com/docs/en/agent-sdk/skills).
- API : [tool runner](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner), [compaction](https://platform.claude.com/docs/en/build-with-claude/compaction), [skills dans l'API](https://platform.claude.com/docs/en/build-with-claude/skills-guide), [tarifs](https://platform.claude.com/docs/en/about-claude/pricing).
- Managed Agents : [overview](https://platform.claude.com/docs/en/managed-agents/overview), [tools](https://platform.claude.com/docs/en/managed-agents/tools).
- Types du SDK installé : `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` (version 0.3.278).
