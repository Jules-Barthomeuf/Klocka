import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J, JL } from "@/design/jetons";
import { useFondDeCarte } from "@/lib/tuiles";

// La carte du tableau de bord du CRM (6 nov. 2026, Jules : « déconnectée de Monday, connectée aux clients dans Twenty ») :
// un point par client de Twenty, à sa Localisation (server/crm/klocka.js). Un clic ouvre sa fiche : celle de Klocka
// quand il en a une, sa ligne de Twenty sinon. La carte de la Prospection s'y fond (9 nov. 2026, Jules) : projets,
// prospection et deals viennent de la carte de Klocka (server/carte.js) ; ses clients à elle restent de côté, ceux de
// Twenty font foi. Chaque couche se montre ou se cache d'un clic.
const COUCHES = [
  { cle: "projets", nom: "Projets", couleur: J["menthe-fonce"], trait: JL["menthe-fonce"] },
  { cle: "prospection", nom: "Prospection", couleur: J["emplacement-1"], trait: JL["emplacement-1"] },
  { cle: "deals", nom: "Deals", couleur: J["emplacement-2"], trait: JL["emplacement-2"] },
  { cle: "clients", nom: "Clients", couleur: J["emplacement-1bis"], trait: JL["emplacement-1bis"] },
];
const FRANCE = { centre: [46.6, 2.5], zoom: 6 };

export default function CarteClientsTwenty({ onClient, hauteur = 600, className = "" }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["crm-carte-clients"], queryFn: () => base44.request("GET", "/api/crm/klocka/carte"), staleTime: 5 * 60_000, retry: 1 });
  const klocka = useQuery({ queryKey: ["carte-klocka"], queryFn: () => base44.request("GET", "/api/carte"), staleTime: 5 * 60_000, retry: 1 });
  const { fond, surErreur } = useFondDeCarte({ google: true });
  const [visibles, setVisibles] = useState(() => new Set(COUCHES.map((c) => c.cle)));
  const basculer = (cle) => setVisibles((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const points = useMemo(() => ({ ...klocka.data, clients: q.data?.clients || [] }), [klocka.data, q.data]);
  const ouvrir = (p, couche) => {
    if (couche === "clients") return onClient?.(p);
    if (!p.lien) return undefined;
    if (/^https?:/.test(p.lien)) window.open(p.lien, "_blank", "noopener"); else navigate(p.lien);
    return undefined;
  };
  const rayon = (c, p) => (c === "prospection" ? Math.min(22, Math.max(5, Math.sqrt(p.poids || 1) * 2.4)) : c === "clients" ? 7 : 5.5);
  return (
    <div className={`k-carte-rues k-carte-claire ${fond.google ? "k-carte-google" : ""} relative overflow-hidden rounded-[16px] border border-trait ${className}`} style={{ height: hauteur }}>
      <MapContainer center={FRANCE.centre} zoom={FRANCE.zoom} minZoom={2} worldCopyJump zoomControl className="h-full w-full" attributionControl={false} preferCanvas>
        <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max || 16} eventHandlers={{ tileerror: surErreur }} />
        {COUCHES.filter((c) => visibles.has(c.cle)).map((c) => (points[c.cle] || []).map((p) => (
          <CircleMarker key={`${c.cle}:${p.id}`} center={[p.lat, p.lon]} radius={rayon(c.cle, p)}
            pathOptions={{ color: JL.encre, fillColor: c.trait, fillOpacity: c.cle === "clients" ? 0.92 : 0.75, weight: 1.5, opacity: 0.95 }}
            eventHandlers={{ click: () => ouvrir(p, c.cle) }}>
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="block text-[13px] font-medium">{p.titre}</span>
              {p.sous && <span className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{p.sous}</span>}
            </Tooltip>
          </CircleMarker>
        )))}
      </MapContainer>
      <div className="absolute left-14 top-3 z-[500] flex flex-wrap gap-1.5">
        {[...COUCHES].reverse().map((c) => {
          const on = visibles.has(c.cle);
          const n = (c.cle === "clients" ? q.data : klocka.data) ? (points[c.cle] || []).length : null;
          return (
            <button key={c.cle} type="button" onClick={() => basculer(c.cle)} aria-pressed={on}
              className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] shadow-sm backdrop-blur-md transition-colors ${on ? "border-bord-doux bg-surface-pleine/90 text-encre" : "border-trait bg-surface-pleine/60 text-brume"}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.couleur, opacity: on ? 1 : 0.35 }} />
              {c.nom}
              {n != null && <span className="tabular-nums text-ardoise">{n}</span>}
            </button>
          );
        })}
      </div>
      {q.isLoading && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-fond/40 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-4 py-2 text-[13px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />Je place les clients</span>
        </div>
      )}
      <div className="absolute bottom-3 left-3 z-[600] flex max-w-[70%] flex-col items-start gap-1.5">
        {klocka.isLoading && <p className="m-0 inline-flex items-center gap-2 rounded-full bg-surface-pleine px-3 py-1.5 text-[12px] text-ardoise"><Loader2 className="h-3 w-3 animate-spin" />Je place les autres points (la première fois, une bonne minute)</p>}
        {klocka.isError && <p className="m-0 rounded-full bg-surface-pleine px-3 py-1.5 text-[12.5px] text-alerte">Projets, prospection et deals n'ont pas pu se charger : {klocka.error?.message || "réessayez"}</p>}
        {klocka.data?.erreurs?.length > 0 && <p className="m-0 rounded-[10px] bg-surface-pleine px-3 py-1.5 text-[12px] text-ambre">Incomplète : {klocka.data.erreurs.join(" · ")}</p>}
        {q.isError && <p className="m-0 rounded-full bg-surface-pleine px-3 py-1.5 text-[12.5px] text-alerte">Les clients n'ont pas pu se charger : {q.error?.message || "réessayez"}</p>}
        {q.data?.sans_lieu > 0 && <p className="m-0 rounded-full bg-surface-pleine px-3 py-1.5 text-[12px] text-ardoise">{q.data.sans_lieu} client{q.data.sans_lieu > 1 ? "s" : ""} sans localisation</p>}
      </div>
      <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution} · Twenty CRM · Klocka</span>
    </div>
  );
}
