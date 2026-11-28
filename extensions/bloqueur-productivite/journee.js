// Le calcul du bloqueur, recopié en court de src/lib/productivite.js (28 nov. 2026) : une extension ne lit pas les
// fichiers du projet. Même règle : travail entre le début et la fin de la journée, hors des pauses.

const minutes = (h) => {
  const m = /^(\d\d):(\d\d)$/.exec(String(h || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const ici = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

/** Vrai pendant un temps de travail, quand le blocage est allumé. */
export function enTravail(p, d = new Date()) {
  if (!p || p.blocage === false) return false;
  const t = ici(d);
  const debut = minutes(p.debut);
  const fin = minutes(p.fin);
  if (debut == null || fin == null || t < debut || t >= fin) return false;
  return !(p.pauses || []).some((x) => {
    const h = minutes(x.heure);
    return h != null && t >= h && t < h + Number(x.duree || 0);
  });
}

/** La prochaine pause à venir (« 16:00 ») et les minutes qui la séparent de maintenant ; null s'il n'y en a plus. */
export function prochainePause(p, d = new Date()) {
  const t = ici(d);
  const fin = minutes(p?.fin);
  const h = (p?.pauses || []).map((x) => ({ heure: x.heure, de: minutes(x.heure) }))
    .filter((x) => x.de != null && x.de > t && (fin == null || x.de < fin))
    .sort((a, b) => a.de - b.de)[0];
  return h ? { heure: h.heure, dans: Math.ceil(h.de - t) } : null;
}

/** Vrai si l'adresse est l'un des sites (ou l'un de ses sous-domaines). */
export function estBloque(url, sites = []) {
  let hote = "";
  try { hote = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return sites.some((s) => hote === s || hote.endsWith(`.${s}`));
}
