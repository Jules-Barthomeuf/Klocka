import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// La carte du projet, avec les cessions de fonds de commerce posées dessus.
//
// Data-B donne le point exact de chaque cession : on les montre autour du bien
// plutôt qu'en liste. La taille du disque dit le prix, sa couleur dit ce qui
// touche le bien — la rue en or, le numéro même en menthe. On lit d'un coup
// d'œil si la rue vit, et à quel niveau de prix.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

const MENTHE = "#96c0b8";
const OR = "#d9b46a";
const GRIS = "#8d918f";

// Le rayon du disque suit le prix, en racine : un fonds dix fois plus cher
// n'occupe pas dix fois la place, sinon la carte n'est plus lisible.
function rayonDe(prix, median) {
  if (!prix || !median) return 6;
  const r = 7 * Math.sqrt(prix / median);
  return Math.max(4, Math.min(20, r));
}

function icôneBien() {
  if (typeof window === "undefined" || !window.L) return undefined;
  return window.L.divIcon({
    className: "",
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${MENTHE};box-shadow:0 0 0 4px rgba(150,192,184,.28),0 0 0 1px #04140c"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function CarteCessions({ project, hauteur = 420 }) {
  const t = project?.transactions_fonds || null;
  const [filtre, setFiltre] = useState("toutes");

  const centre = useMemo(() => {
    const lat = Number(t?.lat ?? project?.latitude);
    const lon = Number(t?.lon ?? project?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }, [t, project]);

  const cessions = useMemo(
    () => (t?.transactions || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)),
    [t]
  );
  const visibles = useMemo(
    () => (filtre === "rue" ? cessions.filter((x) => x.dans_la_rue) : cessions),
    [cessions, filtre]
  );
  const median = t?.marche?.prix_median || null;

  if (!centre) return null;

  return (
    <div>
      <div className="klocka-carte relative overflow-hidden bg-[#0f1114]" style={{ height: hauteur }}>
        <MapContainer
          center={centre}
          zoom={16}
          style={{ height: "100%", width: "100%", background: "#0f1114" }}
          scrollWheelZoom={false}
          attributionControl={false}
        >
          {/* Les fonds sombres de CARTO réclament désormais une clé et
              impriment « API KEY REQUIRED » sur les tuiles. OpenStreetMap est
              libre : on l'assombrit au filtre, sur le calque des tuiles seul,
              pour que les disques gardent leur couleur. */}
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {visibles.map((c, i) => {
            const teinte = c.sur_place ? MENTHE : c.dans_la_rue ? OR : GRIS;
            return (
              <CircleMarker
                key={`${c.date}-${c.enseigne}-${i}`}
                center={[c.lat, c.lon]}
                radius={rayonDe(c.prix, median)}
                pathOptions={{ color: teinte, weight: 1, fillColor: teinte, fillOpacity: c.dans_la_rue ? 0.42 : 0.22 }}
              >
                <Tooltip direction="top" offset={[0, -4]}>
                  <span style={{ fontSize: 12 }}>{c.enseigne} — {euros(c.prix)}</span>
                </Tooltip>
                <Popup>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.enseigne}</div>
                  <div style={{ fontSize: 12, color: "#5a5f66" }}>{[c.activite, jour(c.date)].filter(Boolean).join(" · ")}</div>
                  <div style={{ fontSize: 12, color: "#5a5f66" }}>{c.adresse}</div>
                  <div style={{ fontSize: 14, marginTop: 6 }}>{euros(c.prix)}</div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Le bien, par-dessus les cessions. */}
          <Marker position={centre} icon={icôneBien()}>
            <Popup>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{project?.titre || "Le bien"}</div>
              <div style={{ fontSize: 12, color: "#5a5f66" }}>{project?.adresse_complete || t?.adresse}</div>
            </Popup>
          </Marker>
        </MapContainer>

        <style>{`.klocka-carte .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.88) contrast(.92) saturate(.55)}`}</style>
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#f2f3f5]/[0.13] z-[500]" />
      </div>

      {/* Ce que la carte montre, et de quoi on parle. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#9298a6]">
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: MENTHE }} /> Le bien, et les cessions à son numéro</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: OR }} /> Dans la rue</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: GRIS }} /> Autour</span>
        <span className="text-[#6a7180]">La taille du disque suit le prix.</span>

        <span className="ml-auto inline-flex gap-1.5">
          {[["toutes", `Tout · ${cessions.length}`], ["rue", `La rue · ${cessions.filter((x) => x.dans_la_rue).length}`]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltre(v)}
              className={`px-3 py-1 rounded-full text-[12px] border transition-colors ${filtre === v ? "bg-[#96c0b8] text-[#04140c] border-[#96c0b8]" : "bg-transparent text-[#b8b8b8] border-[#262626] hover:border-[#3a3f4a]"}`}
            >
              {l}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
