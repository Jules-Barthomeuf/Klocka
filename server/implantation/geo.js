// La géométrie de l'étude d'implantation : juste ce qu'il faut, et pur.
//
// Les zones de chalandise sont des isochrones, des polygones irréguliers ;
// les IRIS de l'INSEE et les carreaux Filosofi en sont d'autres. Il faut
// savoir quelle part d'un IRIS tombe dans l'isochrone, sans bibliothèque de
// découpage. On sème une grille de points dans la boîte du polygone et l'on
// compte : ce qui tombe dans les deux, sur ce qui tombe dans l'un. À trente
// mètres de pas, l'erreur est de quelques pour cent, bien moins que celle
// des données qu'on pondère.
//
// Toutes les coordonnées sont GeoJSON : [longitude, latitude].

/** Un point est-il dans un anneau ? Lancer de rayon, sommets [lon, lat]. */
export function dansAnneau(lon, lat, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]; const [xj, yj] = anneau[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Un point est-il dans un Polygon (trous compris) ou un MultiPolygon ? */
export function contient(geometrie, lon, lat) {
  if (!geometrie) return false;
  const polygones = geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.type === 'MultiPolygon' ? geometrie.coordinates : [];
  for (const p of polygones) {
    if (!p?.[0] || !dansAnneau(lon, lat, p[0])) continue;
    if (p.slice(1).some((trou) => dansAnneau(lon, lat, trou))) continue;
    return true;
  }
  return false;
}

/** La boîte d'une géométrie : [ouest, sud, est, nord]. */
export function boiteDe(geometrie) {
  let o = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity;
  const voir = (c) => { if (c[0] < o) o = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; };
  const polygones = geometrie?.type === 'Polygon' ? [geometrie.coordinates] : geometrie?.type === 'MultiPolygon' ? geometrie.coordinates : [];
  for (const p of polygones) for (const anneau of p) for (const c of anneau) voir(c);
  return Number.isFinite(o) ? [o, s, e, n] : null;
}

/** Le pas d'une grille en degrés, pour un pas en mètres à cette latitude. */
export function pasEnDegres(metres, lat) {
  return { dLat: metres / 110540, dLon: metres / (111320 * Math.cos((lat * Math.PI) / 180)) };
}

/**
 * La part d'une géométrie qui tombe dans une autre, par échantillonnage.
 * @returns {number} entre 0 et 1 ; 0 si la première est vide
 */
export function partDans(geometrie, dans, pasMetres = 30) {
  const b = boiteDe(geometrie);
  if (!b) return 0;
  const { dLat, dLon } = pasEnDegres(pasMetres, (b[1] + b[3]) / 2);
  let total = 0; let commun = 0;
  for (let lat = b[1] + dLat / 2; lat <= b[3]; lat += dLat) {
    for (let lon = b[0] + dLon / 2; lon <= b[2]; lon += dLon) {
      if (!contient(geometrie, lon, lat)) continue;
      total += 1;
      if (contient(dans, lon, lat)) commun += 1;
    }
  }
  return total ? commun / total : 0;
}

/** L'aire d'une géométrie en m², par la formule du lacet, anneaux extérieurs moins trous. */
export function aireM2(geometrie) {
  const polygones = geometrie?.type === 'Polygon' ? [geometrie.coordinates] : geometrie?.type === 'MultiPolygon' ? geometrie.coordinates : [];
  let total = 0;
  for (const p of polygones) {
    p.forEach((anneau, i) => {
      const lat0 = (anneau[0]?.[1] || 0) * Math.PI / 180;
      const kx = 111320 * Math.cos(lat0); const ky = 110540;
      let s = 0;
      for (let a = 0, b = anneau.length - 1; a < anneau.length; b = a++) {
        const [ax, ay] = anneau[a]; const [bx, by] = anneau[b];
        s += (bx * kx) * (ay * ky) - (ax * kx) * (by * ky);
      }
      total += (i === 0 ? 1 : -1) * Math.abs(s) / 2;
    });
  }
  return Math.round(Math.max(0, total));
}

/** Les deux boîtes se touchent-elles ? */
export const boitesSeCroisent = (a, b) => !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** La distance en mètres entre deux points {lat, lon}. */
export function metres(a, b) {
  const R = 6371000; const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad; const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
