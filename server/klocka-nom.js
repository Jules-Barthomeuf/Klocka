// Le nom de Klocka, tel que la transcription l'écorche (14 oct. 2026, Jules :
// « ça dicte Cloaca au lieu de Klocka ; je veux tout le temps Klocka »).
//
// Les modèles de transcription ne connaissent pas la startup : ils entendent
// « Cloaca », « Cloaka », « Kloka »… On corrige APRÈS coup, sans IA, sur un
// mot entier, à chaque transcription (llm.js, transcrireAudio), à la dictée
// (index.js) et à l'entrée du Cerveau (cerveau.js, ajouterSource). Les
// consignes de lecture et d'extraction le rappellent aussi (NOTE_KLOCKA).

// Les formes entendues : C ou K, un ou deux o / a, c, k, ck, cc ou q au milieu, a ou ah à la fin ; et « cloaque », le mot français le plus proche.
const FORMES = /(?<![\p{L}\p{N}])(?:[ck]l+o+a?(?:ck|cc|kk|c|k|q|qu)a+h?|[ck]lo+a+[ck]a+|cloaques?|clo+ c?ka)(?![\p{L}\p{N}])/giu;

// Les noms de l'équipe que la transcription écorche aussi (14 oct. 2026) : « Paul de Zulveta », « de Silueta ».
const NOMS = [[/(?<![\p{L}\p{N}])(?:de\s+)?(?:zulueta|zulv[ée]ta|silu[ée]ta|silv[ée]ta|zuluetta)(?![\p{L}\p{N}])/giu, (m) => (/^de\s/i.test(m) ? 'de Zulueta' : 'Zulueta')]];

/** Pure : toute forme écorchée du nom devient « Klocka » ; les noms de l'équipe aussi. */
export function corrigerKlocka(texte) {
  if (texte == null) return texte;
  let t = String(texte).replace(FORMES, 'Klocka');
  for (const [re, par] of NOMS) t = t.replace(re, par);
  return t;
}

/** À glisser dans une consigne qui lit une transcription. */
export const NOTE_KLOCKA = "Klocka est notre startup (investissement en murs commerciaux) : la transcription écorche parfois son nom (« Cloaca », « Cloaka », « Kloka », « cloaque ») ; c'est toujours Klocka, ne t'y arrête pas et n'en tire rien.";
