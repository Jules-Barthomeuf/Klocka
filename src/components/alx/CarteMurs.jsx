import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useFondDeCarte } from "@/lib/tuiles";
import { joliNom } from "./alx-commun";
import { J } from "@/design/jetons";

// Les murs d'une société sur la carte de la ville : un point par commerce, un
// clic ouvre sa fiche dans le panneau. Même fond que la carte des rues de
// l'atelier (IGN passé en sombre par la classe k-carte-rues).

function Cadrage({ points }) {
  const map = useMap();
  const signature = points.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(";");
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 17 });
    else if (points.length) map.setView(points[0], 17);
   }, [map, signature]);
  return null;
}

export default function CarteMurs({ murs, onOuvrir, className = "" }) {
  const { fond, surErreur } = useFondDeCarte();
  const places = murs.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon));
  const points = places.map((m) => [m.lat, m.lon]);
  if (!places.length) return <div className={`grid place-items-center rounded-[16px] border border-trait px-6 text-center text-[12.5px] text-ardoise ${className}`}>Ces murs n'ont pas encore de position sur la carte.</div>;
  return (
    <div className={`k-carte-rues relative isolate overflow-hidden rounded-[16px] border border-trait ${className}`}>
      <MapContainer center={points[0]} zoom={16} scrollWheelZoom className="h-full w-full" attributionControl={false}>
        <TileLayer key={fond.cle} url={fond.url} attribution={fond.attribution} maxZoom={fond.zoom_max} eventHandlers={{ tileerror: surErreur }} />
        <Cadrage points={points} />
        {places.map((m) => (
          <CircleMarker key={m.cible_id} center={[m.lat, m.lon]} radius={8} pathOptions={{ color: J["fond"], weight: 2, fillColor: J["menthe"], fillOpacity: 0.95 }} eventHandlers={{ click: () => onOuvrir(m) }}>
            <Tooltip direction="top" offset={[0, -6]}>{joliNom(m.enseigne) || m.adresse}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <span className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-[8px] bg-fond/70 px-2 py-0.5 text-[10.5px] text-brume">{fond.attribution}</span>
    </div>
  );
}
