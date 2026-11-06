import React from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import { useFondDeCarte } from "@/lib/tuiles";

// La carte des clients du tableau de bord du CRM (6 nov. 2026, Jules : « déconnectée de Monday, connectée aux clients
// dans Twenty ») : un point par client de Twenty, à sa Localisation (server/crm/klocka.js). Le fond et les points
// comme la carte de Klocka (CarteKlocka). Un clic ouvre sa fiche : celle de Klocka quand il en a une, sa ligne de
// Twenty sinon.
const FRANCE = { centre: [46.6, 2.5], zoom: 6 };

export default function CarteClientsTwenty({ onClient, hauteur = 600, className = "" }) {
  const q = useQuery({ queryKey: ["crm-carte-clients"], queryFn: () => base44.request("GET", "/api/crm/klocka/carte"), staleTime: 5 * 60_000, retry: 1 });
  const { fond, surErreur } = useFondDeCarte({ google: true });
  const points = q.data?.clients || [];
  return (
    <div className={`k-carte-rues k-carte-claire ${fond.google ? "k-carte-google" : ""} relative overflow-hidden rounded-[16px] border border-trait ${className}`} style={{ height: hauteur }}>
      <MapContainer center={FRANCE.centre} zoom={FRANCE.zoom} minZoom={2} worldCopyJump zoomControl className="h-full w-full" attributionControl={false} preferCanvas>
        <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max || 16} eventHandlers={{ tileerror: surErreur }} />
        {points.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lon]} radius={7}
            pathOptions={{ color: JL.encre, fillColor: JL["emplacement-1bis"], fillOpacity: 0.92, weight: 1.5, opacity: 0.95 }}
            eventHandlers={{ click: () => onClient?.(p) }}>
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="block text-[13px] font-medium">{p.titre}</span>
              {p.sous && <span className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{p.sous}</span>}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <span className="absolute left-14 top-3 z-[500] inline-flex h-8 items-center gap-2 rounded-full border border-bord-doux bg-surface-pleine/90 px-3 text-[13px] text-encre shadow-sm backdrop-blur-md">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: JL["emplacement-1bis"] }} />
        Clients
        {q.data && <span className="tabular-nums text-ardoise">{points.length}</span>}
      </span>
      {q.isLoading && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-fond/40 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-4 py-2 text-[13px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />Je place les clients</span>
        </div>
      )}
      {q.isError && <p className="absolute bottom-3 left-3 z-[600] m-0 rounded-full bg-surface-pleine px-3 py-1.5 text-[12.5px] text-alerte">La carte n'a pas pu se charger : {q.error?.message || "réessayez"}</p>}
      {q.data?.sans_lieu > 0 && <p className="absolute bottom-3 left-3 z-[600] m-0 rounded-full bg-surface-pleine px-3 py-1.5 text-[12px] text-ardoise">{q.data.sans_lieu} client{q.data.sans_lieu > 1 ? "s" : ""} sans localisation</p>}
      <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution} · Twenty CRM</span>
    </div>
  );
}
