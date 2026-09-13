import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { EMPLACEMENTS, ECARTEE, emplacementDe } from "./alx-commun";

// La carte des rues d'une ville. Chaque rue est dessinée sur son tracé
// OpenStreetMap, dans la teinte de son emplacement : bleu pour le 1, ambre
// foncé pour le 1 bis, rouge pour le 2, gris fin pour les écartées. On clique une
// rue pour la voir dans le panneau à côté et la cocher ; une rue cochée se
// dessine plus épaisse.

// Les tuiles d'OpenStreetMap, passées en sombre par un filtre (index.css) :
// pas de clé à gérer, et le fond reste celui de l'application.
const TUILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Cadre la carte sur les rues, une fois. Sur leurs centres, pas sur leurs
 * bouts : un boulevard de trois kilomètres ne doit pas reléguer le centre-ville
 * à un timbre-poste.
 */
function Cadrage({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 3) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length) map.setView(points[0], 15);
  }, [map, points]);
  return null;
}

function Legende() {
  return (
    <div className="absolute bottom-3 left-3 z-[400] flex flex-wrap gap-x-3.5 gap-y-1 rounded-[10px] border border-white/[0.1] bg-[#0f1114]/90 px-3 py-2 text-[11px] text-craie backdrop-blur">
      {[...EMPLACEMENTS, ECARTEE].map((e) => (
        <span key={String(e.classe)} className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded" style={{ background: e.teinte }} />
          {e.classe ? `Emplacement ${e.mot}` : "Écartée"}
        </span>
      ))}
      <span className="text-brume">© OpenStreetMap</span>
    </div>
  );
}

const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * @param {{rues: object[], ecartees?: object[], coches: Set<string>, choisie?: string|null,
 *   onChoisir: Function, centre?: {lat:number, lon:number}|null, className?: string,
 *   streetView?: {lat:number, lon:number, nom?:string}|null}} p
 */
const metres = (a, b) => Math.hypot((b[0] - a[0]) * 111000, (b[1] - a[1]) * 111000 * Math.cos((a[0] * Math.PI) / 180));

/**
 * Le début d'un tracé : jusqu'à une fraction de ses points, ou jusqu'au point
 * le plus proche d'une position (le commerce qu'ALX lit), tronçon après tronçon.
 */
function debutDuTrace(trace, fraction) {
  const total = trace.reduce((a, t) => a + t.length, 0);
  let part = typeof fraction === "number" ? fraction : 0;
  if (fraction && typeof fraction === "object") {
    let k = 0, meilleur = 0, min = Infinity;
    for (const t of trace) for (const pt of t) { const d = metres(pt, [fraction.lat, fraction.lon]); if (d < min) { min = d; meilleur = k; } k += 1; }
    part = total ? (meilleur + 1) / total : 0;
  }
  let reste = Math.max(2, Math.round(total * Math.max(0, Math.min(1, part))));
  const out = [];
  for (const t of trace) {
    if (reste <= 0) break;
    out.push(t.slice(0, reste));
    reste -= t.length;
  }
  return out;
}

/**
 * @param {{rues: object[], ecartees?: object[], coches: Set<string>, choisie?: string|null,
 *   onChoisir: Function, centre?: {lat:number, lon:number}|null, className?: string,
 *   streetView?: {lat:number, lon:number, nom?:string}|null,
 *   direct?: {retenues: string[], faites: string[], enCours?: string|null, fraction?: number}|null}} p
 *
 * `direct` : la carte du parcours en cours. Seules les rues retenues sont
 * dessinées : en gris tant qu'ALX n'y est pas passé, dans leur teinte une fois
 * faites, et celle en cours se colore au fur et à mesure des pas.
 */
export default function CarteRues({ rues, ecartees = [], coches, choisie = null, onChoisir, centre = null, className = "", streetView = null, direct = null }) {
  const visibles = useMemo(() => (direct ? rues.filter((r) => direct.retenues.includes(r.nom)) : rues), [rues, direct]);
  // Le cadrage ne suit que les rues à moins de 4 km du centre de la ville :
  // une rue mal géolocalisée ou un chemin de périphérie ne doit pas montrer Lyon
  // quand on regarde Antibes.
  const points = useMemo(() => visibles
    .map((r) => r.centre).filter(Boolean)
    .filter((c) => !centre || metres([c.lat, c.lon], [centre.lat, centre.lon]) <= 4000)
    .map((c) => [c.lat, c.lon]), [visibles, centre]);
  const centreCarte = centre ? [centre.lat, centre.lon] : points[0] || [46.6, 2.4];
  const avecTrace = rues.filter((r) => r.trace?.length).length;

  // Street View à la place de la carte : on est dans la rue choisie.
  if (streetView) {
    return (
      <div className={`k-carte-rues relative isolate overflow-hidden rounded-[18px] border border-white/[0.08] bg-fond ${className}`}>
        {CLE_EMBED ? (
          <iframe
            title={`Street View ${streetView.nom || ""}`}
            src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_EMBED}&location=${streetView.lat},${streetView.lon}&heading=0&pitch=0&fov=90`}
            className="h-full w-full rounded-[18px] border-0"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-[13px] text-ardoise">Street View demande la clé VITE_GOOGLE_MAPS_API_KEY dans le .env.</div>
        )}
      </div>
    );
  }

  return (
    <div className={`k-carte-rues relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-fond ${className}`}>
      <MapContainer center={centreCarte} zoom={14} minZoom={11} scrollWheelZoom className="h-full w-full" attributionControl={false} zoomControl={false}>
        <TileLayer url={TUILES} attribution="&copy; OpenStreetMap" maxZoom={19} />
        <Cadrage points={points} />
        {!direct && ecartees.map((r) =>
          (r.trace || []).map((troncon, i) => (
            <Polyline
              key={`e-${r.nom}-${i}`}
              positions={troncon}
              pathOptions={{ color: ECARTEE.teinte, weight: 2.5, opacity: 0.8, dashArray: "4 6" }}
              eventHandlers={{ click: () => onChoisir(r.nom) }}
            />
          )),
        )}
        {direct
          ? visibles.map((r) => {
            const e = emplacementDe(r.classe);
            const faite = direct.faites.includes(r.nom);
            const enCours = direct.enCours === r.nom;
            const trace = r.trace || [];
            return [
              // Le fond gris : la rue qu'ALX doit encore parcourir.
              ...trace.map((troncon, i) => <Polyline key={`g-${r.nom}-${i}`} positions={troncon} pathOptions={{ color: "#3a3f47", weight: 4, opacity: 0.9, lineCap: "round" }} />),
              // La couleur : entière quand c'est fait ; jusqu'au pas en cours pendant
              // la balade ; entière mais voilée quand ALX lit les commerces trouvés.
              ...(faite || enCours ? (faite || direct.fraction == null ? trace : debutDuTrace(trace, direct.fraction)).map((troncon, i) => (
                <Polyline key={`c-${r.nom}-${i}`} positions={troncon} pathOptions={{ color: e.teinte, weight: enCours ? 8 : 6, opacity: enCours && direct.fraction == null ? 0.55 : 1, lineCap: "round" }} />
              )) : []),
            ];
          })
          : rues.map((r) => {
            const e = emplacementDe(r.classe);
            const cochee = coches.has(r.nom);
            const choisieIci = choisie === r.nom;
            return (r.trace || []).map((troncon, i) => (
              <Polyline
                key={`${r.nom}-${i}`}
                positions={troncon}
                pathOptions={{ color: e.teinte, weight: choisieIci ? 9 : cochee ? 7 : 4.5, opacity: choisieIci || cochee ? 1 : 0.75, lineCap: "round" }}
                eventHandlers={{ click: () => onChoisir(r.nom) }}
              />
            ));
          })}
      </MapContainer>
      {!direct && <Legende />}
      {avecTrace === 0 && (
        <div className="absolute inset-0 z-[400] grid place-items-center bg-fond/70 px-6 text-center text-[13px] text-ardoise">
          Les tracés arrivent avec le prochain relevé : cliquez « Refaire les rues ».
        </div>
      )}
    </div>
  );
}
