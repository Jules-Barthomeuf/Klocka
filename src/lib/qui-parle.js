// Qui parle pendant l'appel (16 nov. 2026, Jules : « les interlocuteurs, pas juste une transcription »). Un seul micro,
// celui de l'ordinateur, et une seule piste transcrite : l'analyste parle près du micro, l'agent sort du haut-parleur du
// téléphone, sa voix arrive plus faible. On garde le niveau de chaque instant de parole, on sépare ces niveaux en deux
// groupes (le plus fort est « Vous »), et chaque phrase prend la voix entendue pendant qu'elle arrivait. C'est une
// estimation : un clic sur le nom la corrige. Tant que les deux voix ne se séparent pas, la phrase n'a pas de nom.
//
// Pur : testé sans navigateur (server/qui-parle.test.js).

export const ECART_MIN = 1.6; // rapport minimal entre les deux voix ; en dessous, on ne sait pas les séparer
export const PAROLE_MIN = 40; // instants de parole (50 ms chacun) avant de tenter la séparation

/** Pure : le seuil de niveau entre les deux voix (deux groupes, en échelle log), ou null si elles ne se séparent pas. */
export function seuilDeuxVoix(niveaux) {
  const l = niveaux.filter((n) => n > 0).map(Math.log).sort((a, b) => a - b);
  if (l.length < PAROLE_MIN) return null;
  let bas = l[Math.floor(l.length * 0.2)];
  let haut = l[Math.floor(l.length * 0.8)];
  for (let k = 0; k < 12; k += 1) {
    const milieu = (bas + haut) / 2;
    let sb = 0, nb = 0, sh = 0, nh = 0;
    for (const v of l) { if (v < milieu) { sb += v; nb += 1; } else { sh += v; nh += 1; } }
    if (!nb || !nh) return null;
    bas = sb / nb; haut = sh / nh;
  }
  // Chaque voix doit peser : un groupe de quelques éclats ne fait pas une seconde personne.
  const milieu = (bas + haut) / 2;
  const petit = Math.min(l.filter((v) => v < milieu).length, l.filter((v) => v >= milieu).length);
  if (Math.exp(haut - bas) < ECART_MIN || petit < l.length * 0.1) return null;
  return Math.exp(milieu);
}

/** Pure : le premier instant de l'historique (trié) à partir de t. */
function premierDes(historique, t) {
  let a = 0, b = historique.length;
  while (a < b) { const m = (a + b) >> 1; if (historique[m].t < t) a = m + 1; else b = m; }
  return a;
}

/** Pure : le niveau médian de la parole entre deux instants (ms), ou null s'il n'y a pas eu de parole. */
export function niveauEntre(historique, debut, fin) {
  const v = [];
  for (let k = premierDes(historique, debut); k < historique.length && historique[k].t <= fin; k += 1) v.push(historique[k].n);
  if (!v.length) return null;
  v.sort((x, y) => x - y);
  return v[Math.floor(v.length / 2)];
}

/** Pure : « vous », « autre », ou null quand on ne sait pas. */
export function voixDe(niveau, seuil) {
  if (niveau == null || !seuil) return null;
  return niveau >= seuil ? "vous" : "autre";
}

/** Pure : le texte tel que le découpe enPhrases (transcription-directe.js) : espaces réduits, rien devant. */
export const texteNormal = (texte) => String(texte || "").replace(/\s+/g, " ").trimStart();

/** Pure : les phrases finies avec leur place dans le texte normalisé, et le bout en cours. */
export function phrasesAvecPlages(texte) {
  const t = texteNormal(texte);
  const phrases = [];
  const re = /[^.!?…]*[.!?…]+["»”)]?\s*/g;
  let x;
  let fin = 0;
  while ((x = re.exec(t))) {
    if (!x[0]) break;
    const p = x[0].trim();
    if (p) phrases.push({ texte: p, debut: x.index, fin: re.lastIndex });
    fin = re.lastIndex;
  }
  return { phrases, enCours: { texte: t.slice(fin).trim(), debut: fin, fin: t.length } };
}

/**
 * Pure : les phrases finies et le bout en cours, coupés aussi aux silences (16 nov. 2026 : la transcription en direct ne
 * met pas toujours de point quand la parole change de bouche ; un blanc de plus de `silenceMs` entre deux mots reçus
 * coupe la phrase). `arrivees` : [{ fin, t }] (longueur du texte normalisé et heure à chaque mot reçu). La clé d'une
 * phrase est sa position dans le texte : une correction plus loin ne la déplace pas.
 */
export function phrasesEtTours(texte, arrivees = [], { silenceMs = 1100, maintenant = Date.now() } = {}) {
  const t = texteNormal(texte);
  const coupes = new Set();
  for (let i = 0; i + 1 < arrivees.length; i += 1) {
    if (arrivees[i + 1].t - arrivees[i].t > silenceMs && arrivees[i].fin > 0 && arrivees[i].fin < t.length) coupes.add(arrivees[i].fin);
  }
  // Le dernier mot reçu il y a plus d'un silence : le bout en cours est fini lui aussi.
  const der = arrivees[arrivees.length - 1];
  if (der && maintenant - der.t > silenceMs && der.fin >= t.length) coupes.add(t.length);
  const bornes = new Set([...coupes]);
  const re = /[^.!?…]*[.!?…]+["»”)]?\s*/g;
  let x;
  while ((x = re.exec(t))) { if (!x[0]) break; bornes.add(re.lastIndex); }
  const triees = [...bornes].filter((b) => b > 0 && b <= t.length).sort((a, b) => a - b);
  const phrases = [];
  let debut = 0;
  for (const b of triees) {
    const brut = t.slice(debut, b);
    const texteP = brut.trim();
    if (texteP) {
      const decal = brut.length - brut.trimStart().length;
      phrases.push({ texte: texteP, debut: debut + decal, fin: b, cle: `r${debut + decal}` });
    }
    debut = b;
  }
  return { phrases, enCours: { texte: t.slice(debut).trim(), debut, fin: t.length } };
}

/**
 * Pure : le niveau d'une plage du texte en temps réel. `arrivees` : [{ fin, t }], la longueur du texte normalisé à
 * chaque mot reçu et l'heure. La voix d'une phrase est celle entendue un peu avant ses premiers mots reçus (le temps
 * que la transcription les rende) jusqu'à un peu avant les derniers.
 */
export function niveauDePlage(arrivees, historique, debut, fin, { avant = 1500, apres = 200 } = {}) {
  const premier = arrivees.find((x) => x.fin > debut);
  if (!premier) return null;
  const dernier = arrivees.find((x) => x.fin >= fin) || arrivees[arrivees.length - 1];
  return niveauEntre(historique, premier.t - avant, Math.max(premier.t, dernier.t) - apres);
}

// En essai, pas de son : la voix se devine aux mots (ce que dit Klocka, et ce que répond l'agence).
const MOTS_DE_KLOCKA = /klocka|nos (clients|investisseurs|recherches|acqu[ée]reurs)|nous (achetons|cherchons|avons des)|je vous (rappelle|envoie|propose|appelle)|je suis (jules|coralie|nora|maxime)|c'est (jules|coralie|nora|maxime)/i;

/** Pure : la voix d'une phrase d'essai, d'après ses mots. */
export const voixParLesMots = (texte) => (MOTS_DE_KLOCKA.test(String(texte || "")) ? "vous" : "autre");

// L'analyste qui se présente (16 nov. 2026, Jules : « quand Maxime ou les autres se présentent, ça doit mettre Vous ») :
// « Klocka », « je suis Maxime », « c'est Coralie », « Nora de Klocka », nos clients, nos investisseurs.
const SE_PRESENTE = /\bklocka\b|\b(?:je suis|c['’]est|ici)\s+(?:jules|coralie|nora|maxime|paul)\b|\b(?:jules|coralie|nora|maxime|paul)\s+de\s+klocka\b|\bnos (?:clients|investisseurs|acqu[ée]reurs)\b|\bnous achetons\b/i;

/** Pure : la phrase est-elle dite par l'analyste, d'après ses mots ? (sa présentation, Klocka, nos clients) */
export const ditParVous = (texte) => SE_PRESENTE.test(String(texte || ""));

/**
 * Pure : la voix d'une phrase. Ses mots d'abord (une présentation est toujours « vous ») ; puis le niveau face au seuil ;
 * sans seuil (voix pas encore séparées), le niveau face à celui des phrases reconnues comme « vous » : proche, c'est
 * vous ; nettement plus faible, c'est l'autre.
 */
export function voixDeLaPhrase(texte, niveau, seuil, ancre = null) {
  if (ditParVous(texte)) return "vous";
  const v = voixDe(niveau, seuil);
  if (v) return v;
  if (niveau == null || !ancre) return null;
  return niveau >= ancre * 0.6 ? "vous" : "autre";
}

/** Pure : les phrases à la suite d'une même voix en un seul bloc, avec leurs clés (pour corriger le bloc d'un clic). */
export function enBlocs(lignes) {
  const blocs = [];
  for (const l of lignes) {
    const dernier = blocs[blocs.length - 1];
    if (dernier && dernier.qui === l.qui) { dernier.textes.push(l.texte); dernier.cles.push(l.cle); } else blocs.push({ qui: l.qui, textes: [l.texte], cles: [l.cle] });
  }
  return blocs;
}

/** Pure : un niveau de voix (RMS) ramené entre 0 et 1, pour les rubans. */
export function niveauVisible(rms) {
  if (!(rms > 0)) return 0;
  return Math.max(0, Math.min(1, (Math.log(rms) - Math.log(0.006)) / (Math.log(0.25) - Math.log(0.006))));
}
