// Le nom de Klocka, tel que la transcription l'écorche (14 oct. 2026, Jules :
// « ça dicte Cloaca au lieu de Klocka ; je veux tout le temps Klocka »).
//
// Les modèles de transcription ne connaissent pas la startup : ils entendent
// « Cloaca », « Cloaka », « Kloka »… On corrige APRÈS coup, sans IA, sur un
// mot entier, à chaque transcription (llm.js, transcrireAudio), à la dictée
// (index.js) et à l'entrée de l'Intelligence (layer.js, ajouterSource). Les
// consignes de lecture et d'extraction le rappellent aussi (NOTE_KLOCKA).

// Les formes entendues : C ou K, un ou deux o / a, c, k, ck, cc ou q au milieu, a ou ah à la fin ; et « cloaque », le mot français le plus proche.
const FORMES = /(?<![\p{L}\p{N}])(?:[ck]l+o+a?(?:ck|cc|kk|c|k|q|qu)a+h?|[ck]lo+a+[ck]a+|cloaques?|clo+ c?ka)(?![\p{L}\p{N}])/giu;

// Les noms de l'équipe (16 oct. 2026, Jules : « Madame Guillaume, la transcription doit savoir que c'est
// Guillaud »). Deux sortes de règles :
//   - une forme rare, qui n'existe que pour ce nom, se corrige partout (« Lorinquet », « Barthomieu ») ;
//   - un mot courant (« Guillaume », « Palma », « Guillot ») ne se corrige qu'après le prénom de la personne
//     ou « Madame », « Monsieur » : « Guillaume » seul peut être quelqu'un d'autre.
const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';
const re = (corps) => new RegExp(`${L}${corps}${R}`, 'giu');
const CIVILITE = '(?:Madame|Mme\\.?|Monsieur|M\\.)';
export const EQUIPE = [
  { prenom: 'Jules', nom: 'Barthomeuf', civilite: 'Monsieur' },
  { prenom: 'Paul', nom: 'de Zulueta', civilite: 'Monsieur' },
  { prenom: 'Maxime', nom: 'Pama', civilite: 'Monsieur' },
  { prenom: 'Coralie', nom: 'Guillaud', civilite: 'Madame' },
  { prenom: 'Nora', nom: 'Lorinquer', civilite: 'Madame' },
];
const NOMS = [
  // Paul de Zulueta : « de Zulveta », « de Silueta », « Zuluta », « Zoulouéta ».
  [re('(?:de\\s+)?(?:zulueta|zul?v[ée]ta|silu[ée]ta|silv[ée]ta|zuluetta|zuluta|zoulou[ée]t+a|soulou[ée]t+a|zulu\\s+[ée]t+a)'), (m) => (/^de\s/i.test(m) ? 'de Zulueta' : 'Zulueta')],
  // Jules Barthomeuf : les formes rares partout ; après « Jules », tout « Bart… ».
  [re('bart+h?o+l?o?m[eéè]+u+(?:f|ff|ph|s|x)?|barth?au?m[eéè]u+(?:f|ph)?|bartho\\s+meuf'), () => 'Barthomeuf'],
  [re('(Jules)\\s+Bart\\p{L}*'), (_, avant) => `${avant} Barthomeuf`],
  // Nora Lorinquer : « Lorinquet », « Laurinquer », « Lorinker », « Lorin quer ».
  [re('l(?:o|au)r[ie]n\\s?(?:qu|k)(?:er|et|é|ée|è?re|ai)s?'), () => 'Lorinquer'],
  [re('(Nora|Norah)\\s+L(?:o|au)r\\p{L}*'), () => 'Nora Lorinquer'],
  [re('Norah(?=\\s+Lorinquer)'), () => 'Nora'],
  // Coralie Guillaud : seulement après « Coralie » ou « Madame » (« Guillaume » seul reste Guillaume).
  [re(`(Coralie|Coraly|Corali|${CIVILITE})\\s+Gu?(?:i|y)(?:ll?|y)?(?:aume|aud|ault|aut|ot|ott|o|au|aux|eau)s?`), (_, avant) => `${/^Cora/i.test(avant) ? 'Coralie' : avant} Guillaud`],
  // Maxime Pama : seulement après « Maxime » ou « Monsieur ».
  [re('(Maxime)\\s+(?:Pamma|Pammas|Pamas|Pâma|Palma|Parma|Panama|Paname|Bama|Pamat|Pamah)'), (_, avant) => `${avant} Pama`],
  [re(`(${CIVILITE})\\s+(?:Pamma|Pammas|Pamas|Pâma|Pamat|Pamah)`), (_, avant) => `${avant} Pama`],
];

/** Les noms à faire reconnaître dès la transcription (Voxtral, `context_bias`) : un mot chacun, sans espace. */
export const VOCABULAIRE = ['Klocka', 'Barthomeuf', 'Zulueta', 'Pama', 'Guillaud', 'Lorinquer'];

/** Pure : toute forme écorchée du nom devient « Klocka » ; les noms de l'équipe aussi. */
export function corrigerKlocka(texte) {
  if (texte == null) return texte;
  let t = String(texte).replace(FORMES, 'Klocka');
  for (const [re, par] of NOMS) t = t.replace(re, par);
  return t;
}

/** À glisser dans une consigne qui lit une transcription. */
export const NOTE_KLOCKA = "Klocka est notre startup (investissement en murs commerciaux) : la transcription écorche parfois son nom (« Cloaca », « Cloaka », « Kloka », « cloaque ») ; c'est toujours Klocka, ne t'y arrête pas et n'en tire rien. L'équipe de Klocka : Jules Barthomeuf, Paul de Zulueta, Maxime Pama, Coralie Guillaud (Madame Guillaud), Nora Lorinquer ; un nom proche dans la transcription (« Guillot », « Lorinquet », « de Zulveta ») est l'un d'eux, écris-le correctement.";
