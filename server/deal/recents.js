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

/** Les derniers dossiers ouverts qui existent encore (ni archivés, ni de test), avec leur titre ; complétés par les plus récents de la plateforme. */
export function recents({ limite = 5 } = {}) {
  const out = [];
  for (const r of lire()) {
    const d = Records.findBy('Deal', 'deal_id', r.deal_id);
    if (!d || d.archived || d.test || d.cache_equipe) continue;
    out.push({ deal_id: r.deal_id, titre: d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || r.deal_id, le: r.le, par: r.par });
    if (out.length >= limite) break;
  }
  // Par défaut (Jules, 17 oct. 2026) : tant que l'équipe n'a pas ouvert assez de dossiers, les plus récents mis dans la plateforme complètent la liste.
  if (out.length < limite) {
    const vus = new Set(out.map((x) => x.deal_id));
    for (const d of Records.list('Deal', { sort: '-created_date', limit: 60 })) {
      if (out.length >= limite) break;
      if (!d.deal_id || vus.has(d.deal_id) || d.archived || d.test || d.cache_equipe) continue;
      out.push({ deal_id: d.deal_id, titre: d.nom || d.lots?.[0]?.synthese?.titre || d.source?.nom_fichier || d.deal_id, le: d.created_date || d.cree_le || null, par: null, recent_plateforme: true });
    }
  }
  return out;
}
