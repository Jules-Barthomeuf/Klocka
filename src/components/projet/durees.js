// Des dates aux durées, comme on les dit : « 6 ans et 3 mois », pas « 75 mois ».

const MOIS_PAR_AN = 12;

// Une date française (« 31/12/2030 ») se lit aussi (10 nov. 2026) : new Date la prenait pour une date invalide.
const lire = (v) => {
  if (v instanceof Date) return v;
  const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(v);
};

/** Le nombre de mois entiers entre deux dates, dans l'ordre. */
export function moisEntre(de, a) {
  const d = lire(de);
  const f = lire(a);
  if (Number.isNaN(d.getTime()) || Number.isNaN(f.getTime())) return null;
  let mois = (f.getFullYear() - d.getFullYear()) * MOIS_PAR_AN + (f.getMonth() - d.getMonth());
  if (f.getDate() < d.getDate()) mois -= 1;
  return mois;
}

/** « 6 ans et 3 mois », « 1 an », « 8 mois », ou null si rien à dire. */
export function dureeEnMots(mois) {
  if (mois == null || mois < 0) return null;
  const ans = Math.floor(mois / MOIS_PAR_AN);
  const reste = mois % MOIS_PAR_AN;
  const bouts = [];
  if (ans > 0) bouts.push(`${ans} an${ans > 1 ? "s" : ""}`);
  if (reste > 0) bouts.push(`${reste} mois`);
  if (!bouts.length) return "moins d'un mois";
  return bouts.join(" et ");
}

/** Depuis une date jusqu'à aujourd'hui. */
export function dureeDepuis(iso) {
  if (!iso) return null;
  return dureeEnMots(moisEntre(iso, new Date()));
}

/** D'aujourd'hui jusqu'à une date ; null si elle est passée. */
export function dureeJusque(iso, { court = false } = {}) {
  if (!iso) return null;
  const mois = moisEntre(new Date(), iso);
  if (mois == null || mois < 0) return null;
  const mots = dureeEnMots(mois);
  // Posé seul, en grand, le « et » alourdit : « 8 ans 6 mois ».
  return court && mots ? mots.replace(" et ", " ") : mots;
}

/** « 1er janvier 2038 ». */
export function dateLongue(iso) {
  if (!iso) return null;
  const d = lire(iso);
  if (Number.isNaN(d.getTime())) return null;
  const jour = d.getDate();
  return `${jour === 1 ? "1er" : jour} ${d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
}
