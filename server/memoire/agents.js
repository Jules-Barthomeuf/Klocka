// La fiche agent chiffrée (30 oct. 2026, Jules) : ce que la Mémoire sait d'un agent ou d'une agence. Pur.

const nombres = (xs) => xs.map(Number).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
const fourchette = (xs) => {
  const v = nombres(xs);
  if (!v.length) return null;
  const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { min: v[0], mediane: m, max: v[v.length - 1], n: v.length };
};

/**
 * Pure : les chiffres d'un agent à partir de ses biens en Mémoire.
 * @param {object[]} biens les BienMemoire de cet agent (ou de cette agence)
 * @returns {{ nb_fiches: number, villes: string[], loyers: object|null, prix: object|null, dernier_envoi: string|null, premier_envoi: string|null, retenus: number, taux_retenu: number|null }}
 */
export function chiffresAgent(biens = []) {
  const dates = biens.map((b) => b.recu_le).filter(Boolean).sort();
  const villes = [...new Set(biens.map((b) => b.ville).filter(Boolean))];
  const retenus = biens.filter((b) => b.deal_id).length;
  return {
    nb_fiches: biens.length,
    villes: villes.slice(0, 12),
    loyers: fourchette(biens.map((b) => b.loyer_annuel)),
    prix: fourchette(biens.map((b) => b.prix)),
    dernier_envoi: dates.at(-1) || null,
    premier_envoi: dates[0] || null,
    retenus,
    taux_retenu: biens.length ? retenus / biens.length : null,
  };
}

/** Pure : les biens d'un agent, par ses adresses mail (toutes en minuscules). */
export const biensDe = (biens, emails = []) => {
  const set = new Set((emails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean));
  return set.size ? (biens || []).filter((b) => set.has(String(b.agent_email || '').toLowerCase())) : [];
};

/** Pure : une ligne pour l'écran : « 14 fiches · Nice, Antibes · loyers 18 à 42 k€ · dernier envoi le 3 oct. · 2 retenues ». */
export function ligneAgent(c) {
  if (!c?.nb_fiches) return null;
  const k = (n) => `${Math.round(n / 1000)} k€`;
  const d = c.dernier_envoi ? new Date(c.dernier_envoi).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return [
    `${c.nb_fiches} fiche${c.nb_fiches > 1 ? 's' : ''}`,
    c.villes.length ? c.villes.slice(0, 4).join(', ') : null,
    c.loyers ? `loyers ${k(c.loyers.min)} à ${k(c.loyers.max)}` : null,
    c.prix ? `prix ${k(c.prix.min)} à ${k(c.prix.max)}` : null,
    d ? `dernier envoi le ${d}` : null,
    `${c.retenus} retenue${c.retenus > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');
}
