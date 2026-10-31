// Les montants en clair, une seule règle pour le serveur et l'écran (31 oct. 2026, Jules : « si plus ou égal à
// 1 000 k€, mets en M ») : 450 k€, 1,3 M€ ; une fourchette garde l'unité des deux bornes : « 450 – 600 k€ »,
// « 850 k€ – 1,2 M€ », « 1,1 – 1,7 M€ ». Pure, sans dépendance : src/lib/clients-commerces.js l'importe aussi.

const enM = (n) => (Math.round(n / 1e5) / 10).toLocaleString('fr-FR');
const enK = (n) => Math.round(n / 1000).toLocaleString('fr-FR');

/** 450 000 → « 450 k€ », 1 300 000 → « 1,3 M€ », 0 ou vide → null. */
export function montant(v) {
  const n = Number(v);
  if (!n || !Number.isFinite(n)) return null;
  return Math.abs(n) >= 1e6 ? `${enM(n)} M€` : `${enK(n)} k€`;
}

/** Deux bornes : l'unité ne se répète que si elles diffèrent. Une seule borne : celle-là. */
export function fourchette(a, b, { sep = ' – ' } = {}) {
  const x = Number(a) || null;
  const y = Number(b) || null;
  if (!x || !y) return montant(x || y);
  if (x >= 1e6 && y >= 1e6) return `${enM(x)}${sep}${enM(y)} M€`;
  if (x < 1e6 && y < 1e6) return `${enK(x)}${sep}${enK(y)} k€`;
  return `${montant(x)}${sep}${montant(y)}`;
}
