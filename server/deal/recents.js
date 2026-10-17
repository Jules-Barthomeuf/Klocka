// Les dossiers récemment ouverts par l'équipe (17 oct. 2026, Jules) : la barre latérale les montre
// sous « Projets ». Une liste partagée, la plus récente en tête, un dossier une seule fois.

import { Meta, Records } from '../db.js';

const CLE = 'dossiers.recents';
const MAX = 30;

/** Pure : la liste après l'ouverture d'un dossier (en tête, sans doublon, bornée). */
export function noterDans(liste = [], { deal_id, par = null, le = new Date().toISOString() }, max = MAX) {
  if (!deal_id) return liste;
  return [{ deal_id, par, le }, ...liste.filter((x) => x.deal_id !== deal_id)].slice(0, max);
}

const lire = () => { try { return JSON.parse(Meta.get(CLE) || '[]'); } catch { return []; } };

export function noterOuverture(dealId, user) {
  const liste = noterDans(lire(), { deal_id: String(dealId), par: String(user?.email || '').toLowerCase() || null });
  Meta.set(CLE, JSON.stringify(liste));
  return liste[0];
}

/** Les derniers dossiers ouverts qui existent encore (ni archivés, ni de test), avec leur titre. */
export function recents({ limite = 5 } = {}) {
  const out = [];
  for (const r of lire()) {
    const d = Records.findBy('Deal', 'deal_id', r.deal_id);
    if (!d || d.archived || d.test) continue;
    out.push({ deal_id: r.deal_id, titre: d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || r.deal_id, le: r.le, par: r.par });
    if (out.length >= limite) break;
  }
  return out;
}
