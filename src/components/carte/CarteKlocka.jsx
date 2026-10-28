import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J, JL } from "@/design/jetons";
import { useFondDeCarte } from "@/lib/tuiles";

// La carte de Klocka (22 oct. 2026, Jules : « une carte de France interactive avec tous les points : nos projets, ce
// qu'on a prospecté, nos clients, nos deals ») : la même carte dans la Prospection, les Projets et les Clients ; la page
// met sa couche devant (`focus`), les autres restent à un clic. Les points viennent de la plateforme et de Monday
// (server/carte.js). Le fond est le plan Google Maps (Jules, 22 oct. : « utilise Maps »), comme l'outil Vacance, l'IGN
// en repli : il couvre le monde, un client à New York ou à Londres y a sa place. Fond clair : des teintes franches,
// cerclées de blanc comme les repères de Google.

const COUCHES = [
  { cle: "projets", nom: "Projets", couleur: J["menthe-fonce"], trait: JL["menthe-fonce"] },
  { cle: "prospection", nom: "Prospection", couleur: J["emplacement-1"], trait: JL["emplacement-1"] },
  { cle: "clients", nom: "Clients", couleur: J["emplacement-1bis"], trait: JL["emplacement-1bis"] },
  { cle: "deals", nom: "Deals", couleur: J["emplacement-2"], trait: JL["emplacement-2"] },
];
const FRANCE = { centre: [46.6, 2.5], zoom: 6 };

export default function CarteKlocka({ focus = null, hauteur = 600, className = "" }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["carte-klocka"], queryFn: () => base44.request("GET", "/api/carte"), staleTime: 5 * 60_000, retry: 1 });
  const [visibles, setVisibles] = useState(() => new Set(COUCHES.map((c) => c.cle)));
  const basculer = (cle) => setVisibles((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  // La couche de la page se dessine en dernier : ses points passent devant.
  const ordre = useMemo(() => [...COUCHES].sort((a, b) => (a.cle === focus) - (b.cle === focus)), [focus]);
  const { fond, surErreur } = useFondDeCarte({ google: true });
  const ouvrir = (lien) => { if (!lien) return; if (/^https?:/.test(lien)) window.open(lien, "_blank", "noopener"); else navigate(lien); };
  const rayon = (c, p) => (c === "prospection" ? Math.min(22, Math.max(5, Math.sqrt(p.poids || 1) * 2.4)) : c === focus ? 7 : 5.5);

  return (
    <div className={`k-carte-rues k-carte-claire ${fond.google ? "k-carte-google" : ""} relative overflow-hidden rounded-[16px] border border-trait ${className}`} style={{ height: hauteur }}>
      <MapContainer center={FRANCE.centre} zoom={FRANCE.zoom} minZoom={2} worldCopyJump zoomControl className="h-full w-full" attributionControl={false} preferCanvas>
        <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max || 16} eventHandlers={{ tileerror: surErreur }} />
        {ordre.filter((c) => visibles.has(c.cle)).map((c) => (q.data?.[c.cle] || []).map((p) => (
          <CircleMarker key={`${c.cle}:${p.id}`} center={[p.lat, p.lon]} radius={rayon(c.cle, p)}
            pathOptions={{ color: JL.encre, fillColor: c.trait, fillOpacity: c.cle === focus ? 0.92 : 0.75, weight: 1.5, opacity: 0.95 }}
            eventHandlers={{ click: () => ouvrir(p.lien) }}>
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <span className="block text-[13px] font-medium">{p.titre}</span>
              {p.sous && <span className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{p.sous}</span>}
            </Tooltip>
          </CircleMarker>
        )))}
      </MapContainer>

      {/* Les couches, en haut à gauche : un clic les montre ou les cache. */}
      <div className="absolute left-14 top-3 z-[500] flex flex-wrap gap-1.5">
        {ordre.slice().reverse().map((c) => {
          const on = visibles.has(c.cle);
          const n = q.data?.[c.cle]?.length;
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
          <span className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-4 py-2 text-[13px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />Je place les points (la première fois, une bonne minute)</span>
        </div>
      )}
      {q.isError && <p className="absolute bottom-3 left-3 z-[600] m-0 rounded-full bg-surface-pleine px-3 py-1.5 text-[12.5px] text-alerte">La carte n'a pas pu se charger : {q.error?.message || "réessayez"}</p>}
      {q.data?.erreurs?.length > 0 && <p className="absolute bottom-3 left-3 z-[600] m-0 max-w-[60%] rounded-[10px] bg-surface-pleine px-3 py-1.5 text-[12px] text-ambre">Incomplète : {q.data.erreurs.join(" · ")}</p>}
      <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution} · Sunday CRM · Klocka</span>
    </div>
  );
}
