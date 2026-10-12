// La trace d'un échange (12 oct. 2026) : chaque outil appelé par le modèle,
// avec ses arguments, ce qu'il a rendu, le temps pris. Elle sert au banc
// d'essai et au journal des échanges.

const LONGUEUR_RESULTAT = 4000;

/** Pure : un résultat d'outil réduit pour être gardé (texte JSON tronqué). */
export function resultatGarde(r) {
  let t;
  try { t = typeof r === 'string' ? r : JSON.stringify(r); } catch { t = String(r); }
  return t && t.length > LONGUEUR_RESULTAT ? `${t.slice(0, LONGUEUR_RESULTAT)}… (${t.length} caractères)` : t;
}

/** Pure : un résultat d'outil est-il un échec ? */
export const enEchec = (r) => !!(r && typeof r === 'object' && (r.ok === false || r.error || r.erreur));

/** Enveloppe un `onTool` pour noter chaque appel dans `trace`. */
export function tracer(onTool, trace) {
  return async (appel) => {
    const debut = Date.now();
    try {
      const r = await onTool(appel);
      trace.push({ outil: appel.name, arguments: appel.input || {}, resultat: resultatGarde(r), echec: enEchec(r), duree_ms: Date.now() - debut });
      return r;
    } catch (e) {
      trace.push({ outil: appel.name, arguments: appel.input || {}, resultat: null, echec: true, erreur: String(e?.message || e).slice(0, 500), duree_ms: Date.now() - debut });
      throw e;
    }
  };
}
