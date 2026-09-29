// Les lectures de marché demandées une à une (un projet, K-Expertise, une
// route), hors de la chaîne de marché d'un dossier. Même règle qu'elle : Data-B
// d'abord, la source ouverte en secours. Les deux rendent la même forme
// ({ ok, resultat } ou { ok: false, error }) ; `resultat.source` dit laquelle
// a répondu et `resultat.repli` pourquoi Data-B ne l'a pas fait.
//
// L'étude d'implantation Data-B coûte un crédit ; elle est gardée trente jours
// par adresse et activité. ALX, qui passe des centaines de rues, reste sur
// l'étude interne (alx/index.js) : un crédit par rue ne tient pas.

import { dataBConfigure } from './data-b.js';

async function enRepli(nom, parDataB, parSecours) {
  let motif = "Data-B n'est pas configuré";
  if (dataBConfigure()) {
    try {
      const r = await parDataB();
      if (r?.ok) return r;
      motif = r?.error || `Data-B n'a rien rendu (${nom})`;
    } catch (e) {
      motif = `Data-B indisponible (${e?.message || e})`;
    }
  }
  const r = await parSecours();
  if (r?.ok && r.resultat) r.resultat = { ...r.resultat, repli: motif };
  else if (r && !r.ok) r.error = `${r.error} (Data-B : ${motif})`;
  return r;
}

/** Les cessions de fonds autour d'une adresse : Data-B, sinon le BODACC. */
export async function cessionsAutour(texteAdresse, options = {}) {
  return enRepli('cessions',
    async () => (await import('./data-b-transactions.js')).transactionsFonds(texteAdresse, options),
    async () => (await import('./cessions-fonds.js')).cessionsAutour(texteAdresse, options));
}

/** L'étude d'implantation d'une adresse : Data-B, sinon l'étude interne. */
export async function etudeImplantation(texteAdresse, options = {}) {
  return enRepli('implantation',
    async () => (await import('./data-b-implantation.js')).etudeImplantation(texteAdresse, options),
    async () => (await import('./implantation/etude.js')).etudeImplantation(texteAdresse, options));
}
