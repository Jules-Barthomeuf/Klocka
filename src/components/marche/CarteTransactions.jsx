import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J, JL } from "@/design/jetons";
import { useFondDeCarte } from "@/lib/tuiles";

// La carte des transactions autour du commerce (17 nov. 2026, Jules) : le bien au centre, les ventes de murs de
// commerce (DVF) et les cessions de fonds (BODACC) à 500 m. La taille d'une pastille suit le prix, en racine ; une
// cession sans prix publié reste petite. Un clic sur une famille dans la légende la montre ou la cache. Même fond que
// la carte de Klocka (Google, l'IGN en repli), mêmes pastilles cerclées. Lue par l'Analyse (MarcheAffine) et le projet
// (MarcheProjet) ; données de server/carte-transactions.js.

const FAMILLES = [
  { cle: "murs", nom: "Ventes de murs", couleur: J["emplacement-1"], trait: JL["emplacement-1"] },
  { cle: "fonds", nom: "Cessions de fonds", couleur: J["emplacement-1bis"], trait: JL["emplacement-1bis"] },
];

const euros = (n) => (Number.isFinite(n) ? (n >= 1e6 ? `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n).toLocaleString("fr-FR")} €`) : null);
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });
const date = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? FORMAT_DATE.format(d) : null; };

const mediane = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
/** Le rayon d'une pastille : 5 px sans prix, puis la racine du prix rapporté à la médiane de sa famille. */
const rayonDe = (prix, med) => (!prix || !med ? 5 : Math.max(4.5, Math.min(16, 7 * Math.sqrt(prix / med))));

export const cleCarteTransactions = (adresse) => ["carte-transactions", String(adresse || "").trim().toLowerCase()];

export default function CarteTransactions({ adresse, hauteur = 420, className = "" }) {
  const q = useQuery({
    queryKey: cleCarteTransactions(adresse),
    queryFn: () => base44.request("GET", `/api/carte-transactions?adresse=${encodeURIComponent(adresse)}`),
    enabled: !!String(adresse || "").trim(),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const [visibles, setVisibles] = useState(() => new Set(FAMILLES.map((f) => f.cle)));
  const basculer = (cle) => setVisibles((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const { fond, surErreur } = useFondDeCarte({ google: true });
  const d = q.data;
  const medianes = useMemo(() => ({ murs: mediane((d?.murs || []).map((p) => p.prix)), fonds: mediane((d?.fonds || []).map((p) => p.prix)) }), [d]);

  if (!String(adresse || "").trim()) return <p className="m-0 p-5 text-[13.5px] text-brume">Ajoutez l'adresse du bien : la carte des transactions s'affichera.</p>;
  if (q.isError) return <p className="m-0 p-5 text-[13.5px] text-alerte">{q.error?.message || "La carte des transactions ne s'est pas chargée."}</p>;

  const centre = d?.bien ? [d.bien.lat, d.bien.lon] : null;
  const sources = [d?.sources?.murs?.nom, d?.sources?.fonds?.nom].filter(Boolean).join(" · ");
  return (
    <div className={`k-carte-rues k-carte-claire ${fond.google ? "k-carte-google" : ""} relative overflow-hidden rounded-[12px] border border-trait ${className}`} style={{ height: hauteur }}>
      {centre && (
        <MapContainer key={centre.join(",")} center={centre} zoom={16} minZoom={12} zoomControl className="h-full w-full" attributionControl={false} preferCanvas scrollWheelZoom={false}>
          <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max || 16} eventHandlers={{ tileerror: surErreur }} />
          <Circle center={centre} radius={d.rayon || 500} pathOptions={{ color: JL.encre, weight: 1, opacity: 0.35, dashArray: "4 5", fill: false }} interactive={false} />
          {FAMILLES.filter((f) => visibles.has(f.cle)).map((f) => (d?.[f.cle] || []).map((p, i) => (
            <CircleMarker key={`${f.cle}:${i}`} center={[p.lat, p.lon]} radius={rayonDe(p.prix, medianes[f.cle])}
              pathOptions={{ color: JL.encre, fillColor: f.trait, fillOpacity: 0.85, weight: 1.5, opacity: 0.95 }}>
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <span className="block text-[13px] font-medium">{f.cle === "murs" ? "Vente de murs" : p.enseigne || "Cession de fonds"}{date(p.date) ? ` · ${date(p.date)}` : ""}</span>
                <span className="block text-[12.5px]">
                  {euros(p.prix) || "Prix non publié"}
                  {f.cle === "murs" && p.surface ? ` · ${p.surface} m² · ${euros(p.prix_m2)}/m²` : ""}
                </span>
                {f.cle === "fonds" && p.activite && <span className="block max-w-[280px] truncate text-[12px] opacity-75">{p.activite}</span>}
                {p.adresse && <span className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{p.adresse}{p.distance_m != null ? ` · ${p.distance_m} m` : ""}</span>}
              </Tooltip>
            </CircleMarker>
          )))}
          <CircleMarker center={centre} radius={8} pathOptions={{ color: JL.encre, fillColor: JL.fond, fillOpacity: 1, weight: 3 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={1}><span className="block text-[13px] font-medium">Le bien</span><span className="block text-[12px] opacity-75">{d.bien.adresse}</span></Tooltip>
          </CircleMarker>
        </MapContainer>
      )}

      {/* Les familles, en haut à gauche : un clic les montre ou les cache, le nombre à côté. */}
      {d && (
        <div className="absolute left-14 top-3 z-[500] flex flex-wrap gap-1.5">
          {FAMILLES.map((f) => {
            const on = visibles.has(f.cle);
            return (
              <button key={f.cle} type="button" onClick={() => basculer(f.cle)} aria-pressed={on}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] shadow-sm backdrop-blur-md transition-colors ${on ? "border-bord-doux bg-surface-pleine/90 text-encre" : "border-trait bg-surface-pleine/60 text-brume"}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.couleur, opacity: on ? 1 : 0.35 }} />
                {f.nom}
                <span className="tabular-nums text-ardoise">{(d[f.cle] || []).length}</span>
              </button>
            );
          })}
        </div>
      )}

      {q.isLoading && (
        <div className="absolute inset-0 z-[600] grid place-items-center bg-fond/40 backdrop-blur-[2px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-4 py-2 text-[13px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />Je relève les ventes autour (la première fois, quelques secondes)</span>
        </div>
      )}
      {d?.erreurs?.length > 0 && <p className="absolute bottom-3 left-3 z-[600] m-0 max-w-[70%] rounded-[10px] bg-surface-pleine px-3 py-1.5 text-[12px] text-ambre">Incomplète : {d.erreurs.join(" · ")}</p>}
      <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution}{sources ? ` · ${sources}` : ""} · {d?.rayon || 500} m</span>
    </div>
  );
}
