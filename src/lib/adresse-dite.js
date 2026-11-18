// L'adresse dite pendant l'appel (17 nov. 2026, Jules : « une intégration maps qui nous montre exactement la rue, le local,
// la copro, qui s'affiche lorsqu'on a l'adresse pendant l'appel »). Lue dans la transcription et les notes, sans IA :
// un numéro (en chiffres ou en lettres), un type de voie, un nom ; la ville quand elle suit (« à Lyon », « 69002 Lyon »).
// La dernière dite l'emporte (« non pardon, au 14 »). Le serveur la passe ensuite à la Base Adresse Nationale.

import { motsEnChiffres } from "./chiffres-entendus.js";

const TYPES = "rues?|avenue|av|boulevard|bd|place|cours|quai|all[ée]es?|chemin|route|impasse|passage|promenade|square|faubourg|esplanade|galerie|parvis|rond-point|traverse|mont[ée]e|voie|zone|za|zac|centre commercial";
// Les mots qui arrêtent le nom de la voie : la phrase continue au-delà.
const ARRET = new Set(["à", "a", "au", "aux", "sur", "dans", "qui", "que", "qu", "c'est", "cest", "et", "il", "elle", "on", "vous", "nous", "je", "avec", "pour", "en", "près", "pres", "juste", "côté", "cote", "donc", "voilà", "voila", "alors", "mais", "ou", "où", "est", "sont", "il y a", "y", "ça", "ca", "ce", "cette", "un", "une", "local", "loué", "loue", "numéro", "numero", "oui", "non", "bah", "ben", "euh", "hein", "là", "la-bas"]);
const LIAISON = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "saint", "sainte", "st", "ste"]);

const majuscule = (m) => (m.length > 2 && !LIAISON.has(m.toLowerCase()) ? m[0].toUpperCase() + m.slice(1) : m.toLowerCase());

/** Pure : la ville qui suit l'adresse (« à Lyon », « 69002 Lyon », « , Nice »), ou null. */
function villeApres(suite) {
  const cp = suite.match(/^\s*,?\s*(?:à\s+|a\s+)?(\d{5})\s+([\p{Lu}][\p{L}'’-]+(?:[\s-][\p{Lu}][\p{L}'’-]+){0,3})/u);
  if (cp) return { code_postal: cp[1], ville: cp[2] };
  const v = suite.match(/^\s*(?:,\s*|\s+(?:à|a|sur)\s+)([\p{Lu}][\p{L}'’-]+(?:[\s-](?:(?:sur|en|le|la|les|de|du|des)[\s-])?[\p{Lu}][\p{L}'’-]+){0,3})/u);
  return v ? { code_postal: null, ville: v[1] } : null;
}

/**
 * Pure : la dernière adresse dite dans les textes, ou null.
 * @param {string[]|string} textes
 * @returns {{ texte: string, numero: string|null, voie: string, ville: string|null, code_postal: string|null, suite: string|null, cle: string } | null}
 */
export function adresseDite(textes) {
  const toutes = adressesDites(textes);
  return toutes.length ? toutes[toutes.length - 1] : null;
}

/**
 * Pure : toutes les adresses dites, dans l'ordre des textes, chacune avec sa clé (17 nov. 2026 : une autre adresse dite
 * plus tard dans l'appel doit déplacer la rue, même si la première est dans les notes).
 */
export function adressesDites(textes) {
  const liste = (Array.isArray(textes) ? textes : [textes]).map((t) => motsEnChiffres(String(t || "")));
  const toutes = [];
  let derniere = null;
  for (const t of liste) {
    const re = new RegExp(`(?:(\\d{1,4})(?:\\s?(bis|ter|b))?\\s*,?\\s+)?\\b(${TYPES})\\.?\\s+((?:[\\p{L}'’-]+\\s?){1,7})`, "giu");
    let m;
    while ((m = re.exec(t))) {
      const mots = [];
      for (const brut of m[4].trim().split(/\s+/)) {
        const mot = brut.replace(/[’]/g, "'");
        const bas = mot.toLowerCase();
        if (ARRET.has(bas) || (mots.length && /^\p{Lu}/u.test(mot) === false && !LIAISON.has(bas) && !/^[ld]'/.test(bas) && mots.length >= 3)) break;
        mots.push(mot);
      }
      while (mots.length && LIAISON.has(mots[mots.length - 1].toLowerCase().replace(/'$/, ""))) mots.pop();
      // Un nom fait d'au moins un vrai mot : « la rue » seule, « rue de la » ne disent rien.
      if (!mots.some((x) => !LIAISON.has(x.toLowerCase().replace(/'.*$/, "")) && x.length > 2)) continue;
      if (!m[1] && mots.length < 2 && !/^\p{Lu}/u.test(mots[0])) continue;
      const fin = m.index + m[0].trimEnd().length;
      const consomme = m[4].trim().split(/\s+/).slice(0, mots.length).join(" ");
      const apres = t.slice(m.index + m[0].indexOf(m[4]) + consomme.length, fin + 60);
      const lieu = villeApres(apres);
      const type = m[3].toLowerCase().replace(/^rues$/, "rue");
      const voie = `${type === "av" ? "avenue" : type === "bd" ? "boulevard" : type} ${mots.map(majuscule).join(" ").replace(/\b([ld]) '/gi, "$1'")}`;
      // Le numéro dit après la voie : « rue Paradis, au numéro 40 ».
      const apresNum = !m[1] ? apres.match(/^\s*,?\s*(?:au\s+)?(?:num[ée]ro\s+)?(\d{1,4})(?!\d)(?:\s?(bis|ter))?/i) : null;
      if (apresNum) { m[1] = apresNum[1]; m[2] = apresNum[2]; }
      const numero = m[1] ? `${m[1]}${m[2] ? ` ${m[2].toLowerCase() === "b" ? "bis" : m[2].toLowerCase()}` : ""}` : null;
      const texte = [numero, voie].filter(Boolean).join(" ");
      // Les mots qui suivent, jusqu'à la fin de la phrase : la ville s'y vérifie au serveur, même tapée en minuscules.
      const suite = apres.replace(/^\s*,?\s*(?:au\s+)?(?:num[ée]ro\s+)?\d{1,4}(?:\s?(?:bis|ter))?/i, "").split(/[.!?;\n]/)[0].trim().slice(0, 50) || null;
      derniere = { texte, numero, voie, ville: lieu?.ville || null, code_postal: lieu?.code_postal || null, suite };
      toutes.push({ ...derniere, cle: [derniere.texte, derniere.code_postal, derniere.ville || derniere.suite].filter(Boolean).join(" ").toLowerCase() });
    }
  }
  return toutes;
}

/**
 * Pure : l'adresse à montrer après une mise à jour des textes. `avant` : les mentions comptées la fois d'avant (Map clé →
 * nombre) ; `cle` : celle montrée. L'adresse dont le compte vient de monter l'emporte (dite pour la première fois ou
 * redite) ; sinon on garde la même, tant qu'elle est encore dans les textes.
 * @returns {{ cle: string|null, comptes: Map<string, number> }}
 */
export function adresseRetenue(toutes, avant = new Map(), cle = null) {
  const comptes = new Map();
  toutes.forEach((x) => comptes.set(x.cle, (comptes.get(x.cle) || 0) + 1));
  const montees = toutes.filter((x, i) => comptes.get(x.cle) > (avant.get(x.cle) || 0) && toutes.findLastIndex((y) => y.cle === x.cle) === i);
  if (montees.length) return { cle: montees[montees.length - 1].cle, comptes };
  if (cle && comptes.has(cle)) return { cle, comptes };
  return { cle: toutes.length ? toutes[toutes.length - 1].cle : null, comptes };
}
