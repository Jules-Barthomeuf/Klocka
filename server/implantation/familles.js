// Les onze familles de commerces de l'étude d'implantation, et les codes NAF
// qui y mènent. Ce sont les familles que le métier lit dans un rapport
// (« 8 en Restauration, 7 en Auto / Moto ») : elles regroupent des
// sous-classes de la NAF rév. 2 par ce que la vitrine vend, pas par ce que
// la nomenclature sépare.
//
// Le préfixe le plus long gagne : « 4778A » (optique) va en Beauté / Santé,
// le reste de « 4778 » (autres commerces de détail spécialisés) en Maison /
// Décoration.

export const FAMILLES = ['Mode', 'Beauté / Santé', 'Restauration', 'Commerce de Bouche', 'Distribution', 'Maison / Décoration', 'Loisirs', 'Service', 'Finance', 'Auto / Moto', 'Hébergement touristique'];

/** Ces familles font une vitrine ; Service et Finance font une enseigne, pas un commerce de détail. */
export const FAMILLES_COMMERCE = new Set(['Mode', 'Beauté / Santé', 'Restauration', 'Commerce de Bouche', 'Distribution', 'Maison / Décoration', 'Loisirs', 'Auto / Moto', 'Hébergement touristique']);

const TABLE = {
  4771: 'Mode', 4772: 'Mode', 4751: 'Mode', 4777: 'Mode', 4782: 'Mode',
  9602: 'Beauté / Santé', 9604: 'Beauté / Santé', 4773: 'Beauté / Santé', 4774: 'Beauté / Santé', 4775: 'Beauté / Santé', '4778A': 'Beauté / Santé',
  5610: 'Restauration', 5621: 'Restauration', 5629: 'Restauration', 5630: 'Restauration',
  1071: 'Commerce de Bouche', '1013B': 'Commerce de Bouche', 4721: 'Commerce de Bouche', 4722: 'Commerce de Bouche', 4723: 'Commerce de Bouche', 4724: 'Commerce de Bouche', 4725: 'Commerce de Bouche', 4726: 'Commerce de Bouche', 4729: 'Commerce de Bouche', 4781: 'Commerce de Bouche',
  4711: 'Distribution', 4719: 'Distribution', 4791: 'Distribution', 4799: 'Distribution', 4789: 'Distribution',
  4741: 'Maison / Décoration', 4742: 'Maison / Décoration', 4743: 'Maison / Décoration', 4752: 'Maison / Décoration', 4753: 'Maison / Décoration', 4754: 'Maison / Décoration', 4759: 'Maison / Décoration', 4776: 'Maison / Décoration', 4778: 'Maison / Décoration', 4779: 'Maison / Décoration',
  4761: 'Loisirs', 4762: 'Loisirs', 4763: 'Loisirs', 4764: 'Loisirs', 4765: 'Loisirs', 5914: 'Loisirs', 9004: 'Loisirs', 9200: 'Loisirs', 9311: 'Loisirs', 9313: 'Loisirs', 9329: 'Loisirs', 7721: 'Loisirs',
  9601: 'Service', 9603: 'Service', 9609: 'Service', 95: 'Service', 7911: 'Service', 7912: 'Service', 6831: 'Service', 6832: 'Service', 69: 'Service', 7420: 'Service', 8553: 'Service', 5310: 'Service', 5320: 'Service', 8219: 'Service', 8121: 'Service',
  6419: 'Finance', 6492: 'Finance', 6512: 'Finance', 6612: 'Finance', 6619: 'Finance', 6622: 'Finance', 6630: 'Finance',
  4511: 'Auto / Moto', 4519: 'Auto / Moto', 4520: 'Auto / Moto', 4532: 'Auto / Moto', 4540: 'Auto / Moto', 4730: 'Auto / Moto', 7711: 'Auto / Moto',
  5510: 'Hébergement touristique', 5520: 'Hébergement touristique', 5530: 'Hébergement touristique', 5590: 'Hébergement touristique',
};

/** Les préfixes à demander au registre : tout ce qui mène à une famille. */
export const PREFIXES = [...new Set(Object.keys(TABLE).map((k) => k.slice(0, 4)))].sort();

/** La famille d'un code NAF (« 47.71Z », « 4771Z »), ou null. Pure. */
export function familleDe(code) {
  const c = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!c) return null;
  for (let n = Math.min(5, c.length); n >= 2; n--) {
    const f = TABLE[c.slice(0, n)];
    if (f) return f;
  }
  return null;
}

/** Compte par famille, les plus nombreuses d'abord : « 8 en Restauration ». Pure. */
export function parFamille(etablissements) {
  const c = new Map();
  for (const e of etablissements || []) {
    const f = e.famille || familleDe(e.activite);
    if (f) c.set(f, (c.get(f) || 0) + 1);
  }
  return [...c.entries()].map(([famille, n]) => ({ n, famille })).sort((a, b) => b.n - a.n);
}
