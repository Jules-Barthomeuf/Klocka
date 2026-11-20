// Une date dite avec ses mots (19 nov. 2026, Jules : « pas de boutons aujourd'hui, demain, lundi, ni de calendrier :
// on te dit ce qu'on veut ») : « lundi », « demain matin », « dans deux semaines », « le 28 », « 3 décembre », « fin du
// mois ». Rend la date ISO (AAAA-MM-JJ) ou null si rien n'y ressemble. Sans dépendance : l'écran et les tests du
// serveur la lisent.

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30 };

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const simple = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, " ").replace(/\s+/g, " ").trim();

/**
 * @param {string} texte  ce que la personne a répondu
 * @param {Date} [maintenant]
 * @returns {string|null}
 */
export function dateDite(texte, maintenant = new Date()) {
  const t = ` ${simple(texte)} `;
  const auj = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  if (!t.trim()) return null;

  // Une date écrite : « 28/11 », « 28/11/2026 », « 28-11 ».
  let m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m) {
    const an = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : auj.getFullYear();
    let d = new Date(an, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && d < auj) d = new Date(an + 1, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : iso(d);
  }
  // « 3 décembre », « le 1er décembre 2026 ».
  m = t.match(/\b(\d{1,2})(?:er)? (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?: (\d{4}))?\b/);
  if (m) {
    const mois = MOIS.indexOf(m[2]);
    const an = m[3] ? Number(m[3]) : auj.getFullYear();
    let d = new Date(an, mois, Number(m[1]));
    if (!m[3] && d < auj) d = new Date(an + 1, mois, Number(m[1]));
    return iso(d);
  }

  if (/\b(aujourd hui|ce soir|ce matin|cet apres midi|tout de suite|maintenant|dans la journee|tout a l heure)\b/.test(t)) return iso(auj);
  if (/\bapres[ -]demain\b/.test(t)) return iso(plus(auj, 2));
  if (/\bdemain\b/.test(t)) return iso(plus(auj, 1));

  // « Dans quinze jours » se dit pour deux semaines.
  if (/\bdans (une|1) quinzaine\b|\bdans (quinze|15) jours\b/.test(t)) return iso(plus(auj, 14));
  // « dans 3 jours », « dans deux semaines », « dans un mois ».
  m = t.match(/\bdans (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente) (jours?|semaines?|mois)\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NOMBRES[m[1]];
    if (m[2].startsWith("jour")) return iso(plus(auj, n));
    if (m[2].startsWith("semaine")) return iso(plus(auj, 7 * n));
    return iso(new Date(auj.getFullYear(), auj.getMonth() + n, auj.getDate()));
  }

  // Un jour de la semaine : le prochain, jamais aujourd'hui (« lundi » dit un lundi, c'est le suivant) ; « jeudi 27 »
  // prend le 27.
  m = t.match(/\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?: (\d{1,2})\b)?/);
  if (m) {
    if (m[2]) {
      let d = new Date(auj.getFullYear(), auj.getMonth(), Number(m[2]));
      if (d < auj) d = new Date(auj.getFullYear(), auj.getMonth() + 1, Number(m[2]));
      return iso(d);
    }
    const cible = JOURS.indexOf(m[1]);
    let ecart = (cible - auj.getDay() + 7) % 7 || 7;
    if (/\ben huit\b/.test(t)) ecart += 7;
    return iso(plus(auj, ecart));
  }

  if (/\b(semaine prochaine|la semaine d apres)\b/.test(t)) return iso(plus(auj, ((8 - auj.getDay()) % 7) || 7));
  if (/\b(fin de (la )?semaine|cette semaine|d ici vendredi|avant vendredi)\b/.test(t)) {
    const ecart = (5 - auj.getDay() + 7) % 7;
    return iso(plus(auj, auj.getDay() === 6 || auj.getDay() === 0 ? ecart || 7 : ecart));
  }
  if (/\b(fin du mois|fin de mois|en fin de mois)\b/.test(t)) return iso(new Date(auj.getFullYear(), auj.getMonth() + 1, 0));
  if (/\b(mois prochain|debut du mois prochain|debut de mois prochain)\b/.test(t)) return iso(new Date(auj.getFullYear(), auj.getMonth() + 1, 1));

  // « le 28 » : ce mois-ci, ou le suivant s'il est passé.
  m = t.match(/\b(?:le )?(\d{1,2})(?:er)?\b/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31 && /\ble \d/.test(t)) {
    let d = new Date(auj.getFullYear(), auj.getMonth(), Number(m[1]));
    if (d < auj) d = new Date(auj.getFullYear(), auj.getMonth() + 1, Number(m[1]));
    return iso(d);
  }
  return null;
}
