// La justesse du compte des fiches reçues (23 nov. 2026, Jules : « je vais pouvoir dire : ce mail c'était deux fiches,
// ça corrige, et on pourra mesurer l'amélioration au fil du temps ; ça permet déjà que les chiffres soient vrais »).
// Chaque envoi se vérifie d'un geste dans Statistiques : « Juste », un nombre corrigé, « Pas une fiche ». Le compte de
// la machine au moment du geste est gardé (`auto`) ; la mesure le compare au chiffre retenu, semaine par semaine.
//
// Pur : sans base, testé seul.

/** Pure : le lundi (UTC) de la semaine d'une date, en AAAA-MM-JJ. */
const semaineDe = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10);
};

/**
 * Pure : la correction d'un envoi (23 nov. 2026, Jules : « je vais pouvoir dire : ce mail c'était deux fiches, et on
 * pourra mesurer l'amélioration au fil du temps »). `valide` dit que le compte automatique est juste ; `biens` le
 * corrige ; `pas_fiche` l'écarte. `auto`, ce que la machine avait compté, est noté au premier geste et ne bouge plus :
 * c'est lui que la mesure compare au chiffre retenu. Un envoi corrigé avant le 23 nov. n'a pas d'`auto` (inconnu).
 */
export function corrigerCompte(avant = {}, b = {}, { auto = null, par = null, le = new Date().toISOString() } = {}) {
  const compte = { ...avant };
  const dejaTouche = 'biens' in avant || 'pas_fiche' in avant || avant.valide;
  if (!('auto' in compte)) compte.auto = dejaTouche ? null : auto;
  if ('pas_fiche' in b) compte.pas_fiche = !!b.pas_fiche;
  if (b.valide) { compte.valide = true; compte.pas_fiche = false; if (compte.auto != null) compte.biens = compte.auto; }
  if ('biens' in b) { const n = Number(b.biens); if (b.biens == null || b.biens === '') delete compte.biens; else if (Number.isInteger(n) && n >= 0 && n <= 50) { compte.biens = n; compte.valide = true; } }
  if ('analyste' in b) { if (b.analyste) compte.analyste = String(b.analyste).toLowerCase().slice(0, 120); else delete compte.analyste; }
  compte.par = par;
  compte.le = le;
  return compte;
}

/**
 * Pure : la justesse du compte automatique, semaine par semaine, sur les envois vérifiés (validés, corrigés ou écartés)
 * dont on connaît le compte de la machine. Une fiche ajoutée à la main est une fiche que la machine n'avait pas vue (0).
 */
export function justesseDuCompte(lignes = []) {
  const par = new Map();
  const tout = { verifies: 0, justes: 0, fiches_auto: 0, fiches_vraies: 0 };
  for (const l of lignes) {
    const c = l.compte || {};
    const verifie = l.canal === 'main' || c.valide || 'biens' in c || c.pas_fiche;
    const auto = l.canal === 'main' ? 0 : c.auto;
    if (!verifie || auto == null) continue;
    const vrai = c.pas_fiche ? 0 : Number(l.biens) || 0;
    const s = semaineDe(l.le);
    if (!s) continue;
    if (!par.has(s)) par.set(s, { semaine: s, verifies: 0, justes: 0, fiches_auto: 0, fiches_vraies: 0 });
    for (const x of [par.get(s), tout]) { x.verifies += 1; x.justes += auto === vrai ? 1 : 0; x.fiches_auto += auto; x.fiches_vraies += vrai; }
  }
  const taux = (x) => (x.verifies ? Math.round((x.justes / x.verifies) * 100) : null);
  return { ...tout, taux: taux(tout), semaines: [...par.values()].sort((a, b) => a.semaine.localeCompare(b.semaine)).map((x) => ({ ...x, taux: taux(x) })) };
}
