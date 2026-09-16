// Des dates aux durées, comme on les dit : « 6 ans et 3 mois », pas « 75 mois ».

const MOIS_PAR_AN = 12;

/** Le nombre de mois entiers entre deux dates, dans l'ordre. */
function moisEntre(de, a) {
  const d = new Date(de);
  const f = new Date(a);
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
export function dureeJusque(iso) {
  if (!iso) return null;
  const mois = moisEntre(new Date(), iso);
  return mois == null || mois < 0 ? null : dureeEnMots(mois);
}

/** « 1er janvier 2038 ». */
export function dateLongue(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const jour = d.getDate();
  return `${jour === 1 ? "1er" : jour} ${d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
}
