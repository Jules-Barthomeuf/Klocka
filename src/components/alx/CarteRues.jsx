import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { EMPLACEMENTS, ECARTEE, emplacementDe } from "./alx-commun";

// La carte des rues d'une ville. Chaque rue est dessinée sur son tracé
// OpenStreetMap, dans la teinte de son emplacement : vert pour le 1, ambre
// pour le 1 bis, bleu pour le 2, gris fin pour les écartées. On clique une
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
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
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

/**
 * @param {{rues: object[], ecartees?: object[], coches: Set<string>, choisie?: string|null,
 *   onChoisir: Function, centre?: {lat:number, lon:number}|null, className?: string}} p
 */
export default function CarteRues({ rues, ecartees = [], coches, choisie = null, onChoisir, centre = null, className = "" }) {
  const points = useMemo(() => rues.map((r) => r.centre).filter(Boolean).map((c) => [c.lat, c.lon]), [rues]);
  const centreCarte = centre ? [centre.lat, centre.lon] : points[0] || [46.6, 2.4];
  const avecTrace = rues.filter((r) => r.trace?.length).length;

  return (
    <div className={`k-carte-rues relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-fond ${className}`}>
      <MapContainer center={centreCarte} zoom={15} scrollWheelZoom className="h-full w-full" attributionControl={false} zoomControl={false}>
        <TileLayer url={TUILES} attribution="&copy; OpenStreetMap" maxZoom={19} />
        <Cadrage points={points} />
        {ecartees.map((r) =>
          (r.trace || []).map((troncon, i) => (
            <Polyline
              key={`e-${r.nom}-${i}`}
              positions={troncon}
              pathOptions={{ color: ECARTEE.teinte, weight: 2.5, opacity: 0.8, dashArray: "4 6" }}
              eventHandlers={{ click: () => onChoisir(r.nom) }}
            />
          )),
        )}
        {rues.map((r) => {
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
      <Legende />
      {avecTrace === 0 && (
        <div className="absolute inset-0 z-[400] grid place-items-center bg-fond/70 px-6 text-center text-[13px] text-ardoise">
          Les tracés arrivent avec le prochain relevé : cliquez « Refaire les rues ».
        </div>
      )}
    </div>
  );
}
