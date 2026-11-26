import React, { useMemo } from "react";
import { FONDS } from "@/lib/tuiles";

// La parcelle du bien sur le plan IGN (25 nov. 2026, Jules : « une capture DVF de la parcelle ») : les tuiles du Plan IGN
// (Géoplateforme, sans clé, src/lib/tuiles.js), qui porte déjà le trait des parcelles, et par-dessus la parcelle du bien
// en ambre. Tout est dessiné dans un seul SVG, en Web Mercator : la même image à l'écran, dans le
// lien public et à l'impression, sans carte interactive.

const TUILE = 256;
const L = 800;
const H = 460;
const URL_IGN = FONDS.find((f) => f.cle === "ign")?.url;

/** Pure : un point en pixels du monde, au zoom `z`. */
export function versPixels(lon, lat, z) {
  const n = TUILE * 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n];
}

const anneaux = (g) => (g?.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : g?.type === "Polygon" ? [g.coordinates[0]] : []);

/** Pure : le zoom qui fait tenir la parcelle dans la moitié du cadre (19 au plus près, 16 au plus loin). */
export function zoomPour(geometry) {
  const pts = anneaux(geometry).flat();
  if (!pts.length) return 19;
  for (let z = 19; z > 16; z--) {
    const px = pts.map(([lon, lat]) => versPixels(lon, lat, z));
    const l = Math.max(...px.map((p) => p[0])) - Math.min(...px.map((p) => p[0]));
    const h = Math.max(...px.map((p) => p[1])) - Math.min(...px.map((p) => p[1]));
    if (l <= L * 0.5 && h <= H * 0.5) return z;
  }
  return 16;
}

export default function PlanCadastral({ plan }) {
  const dessin = useMemo(() => {
    if (!plan?.point || !URL_IGN) return null;
    const bien = plan.parcelles?.find((p) => p.idu === plan.parcelle?.idu) || null;
    const z = zoomPour(bien?.geometry);
    // Le cadre se centre sur la parcelle du bien (le centre de ses sommets), sinon sur le point de l'adresse.
    const sommets = anneaux(bien?.geometry).flat();
    const [cx, cy] = sommets.length
      ? sommets.map(([lon, lat]) => versPixels(lon, lat, z)).reduce((s, p) => [s[0] + p[0] / sommets.length, s[1] + p[1] / sommets.length], [0, 0])
      : versPixels(plan.point.lon, plan.point.lat, z);
    const x0 = cx - L / 2;
    const y0 = cy - H / 2;
    const tuiles = [];
    for (let tx = Math.floor(x0 / TUILE); tx <= Math.floor((x0 + L) / TUILE); tx++) {
      for (let ty = Math.floor(y0 / TUILE); ty <= Math.floor((y0 + H) / TUILE); ty++) {
        tuiles.push({ cle: `${tx}-${ty}`, x: tx * TUILE - x0, y: ty * TUILE - y0, url: URL_IGN.replace("{z}", z).replace("{x}", tx).replace("{y}", ty) });
      }
    }
    const chemin = (g) => anneaux(g).map((a) => `M${a.map(([lon, lat]) => { const [x, y] = versPixels(lon, lat, z); return `${(x - x0).toFixed(1)} ${(y - y0).toFixed(1)}`; }).join("L")}Z`).join("");
    return { tuiles, bien: bien ? chemin(bien.geometry) : null, repere: bien ? null : [versPixels(plan.point.lon, plan.point.lat, z)[0] - x0, versPixels(plan.point.lon, plan.point.lat, z)[1] - y0] };
  }, [plan]);
  if (!dessin) return null;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Plan de la parcelle du bien"
      className="block h-[360px] w-full rounded-[12px] border border-trait bg-relief max-md:h-[260px]">
      {/* Le plan en gris, la parcelle du bien en ambre plein (25 nov. 2026, Jules : « je ne la vois pas ») : en menthe pâle
          sur le beige du Plan IGN, elle ne se détachait pas. */}
      <g style={{ filter: "grayscale(1)", opacity: 0.75 }}>
        {dessin.tuiles.map((t) => <image key={t.cle} href={t.url} x={t.x} y={t.y} width={TUILE} height={TUILE} />)}
      </g>
      {dessin.bien && <path d={dessin.bien} className="fill-ambre/55 stroke-ambre" strokeWidth="3.5" strokeLinejoin="round" />}
      {dessin.repere && <circle cx={dessin.repere[0]} cy={dessin.repere[1]} r="8" className="fill-ambre stroke-fond" strokeWidth="2.5" />}
    </svg>
  );
}
