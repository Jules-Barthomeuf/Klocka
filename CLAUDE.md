## Approach
- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

## Continuité
- `docs/etat-plateforme.md` dit l'usage réel : qui travaille, quelles pages comptent, ce que l'IA coûte par geste, et les leviers qui attendent une décision. Lisez-le avant de proposer une amélioration, une refonte ou une économie : ce fichier évite de reproposer ce qui est déjà mesuré ou déjà en place.
- Il est écrit par le serveur au démarrage puis une fois par jour, et à la main par `npm run etat` (`npm run etat -- 90` pour 90 jours). Écrit, jamais édité : une correction se fait dans `server/etat-plateforme.js` ou dans les leviers de `server/llm-couts.js`.
- Le Feedback (page Feedback et bulle en haut à droite) enregistre une remarque, rien de plus : Jules la lit et change son état à la main. Rien ne s'y déclenche tout seul, et rien ne doit s'y brancher.

## Vérifications
- `npm run lint`, `npm test` et `npm run build` doivent passer avant un commit.
- Le serveur ne se recharge pas tout seul : `kill $(pgrep -f "node server/index.js")`, le superviseur le relance en une dizaine de secondes.
