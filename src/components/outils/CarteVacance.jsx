import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useFondDeCarte } from "@/lib/tuiles";
import { JL } from "@/design/jetons";
import { estRecent, motCategorie, motType } from "@/lib/vacance-signaux";

// La carte des signaux de vacance : le fond de carte de l'application (IGN,
// passé en sombre par le filtre de `.k-carte-rues`), le cercle du rayon, une
// épingle sur l'adresse, un rond par local. Les couleurs passent par JL : la
// palette littérale, parce que Leaflet écrit ses tracés en SVG, où une
// variable CSS ne se résout pas.

const FRANCE = { centre: [46.6, 2.4], zoom: 5 };
// Au-delà, les ronds se regroupent en grappes jusqu'à ce qu'on zoome.
const SEUIL_GRAPPES = 200;
const CELLULE_PX = 56;

const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);

/** Les limites du cercle, avec dix pour cent de marge. */
function limites(point, rayonM) {
  const marge = rayonM * 1.1;
  const dLat = marge / 111320;
  const dLon = marge / (111320 * Math.max(0.1, Math.cos((point.lat * Math.PI) / 180)));
  return [[point.lat - dLat, point.lon - dLon], [point.lat + dLat, point.lon + dLon]];
}

/** Vole vers l'adresse quand elle change ; recadre quand le rayon change. */
function Cadrage({ point, rayonM }) {
  const map = useMap();
  const cle = point ? `${point.lat.toFixed(5)},${point.lon.toFixed(5)}` : "";
  useEffect(() => {
    if (!point) { map.flyTo(FRANCE.centre, FRANCE.zoom, { duration: 0.8 }); return; }
    map.flyToBounds(limites(point, rayonM), { duration: 1 });
  }, [map, cle]);
  useEffect(() => {
    if (point) map.fitBounds(limites(point, rayonM), { animate: true, duration: 0.5 });
  }, [map, rayonM]);
  return null;
}

/** Centre la carte sur un local choisi depuis la liste. */
function AllerVers({ cible }) {
  const map = useMap();
  useEffect(() => {
    if (!cible) return;
    const z = Math.max(map.getZoom(), 16);
    map.flyTo([cible.lat, cible.lon], z, { duration: 0.6 });
  }, [map, cible?.cle]);
  return null;
}

const pin = L.divIcon({
  className: "k-vacance-epingle",
  iconSize: [26, 34],
  iconAnchor: [13, 32],
  html: `<svg width="26" height="34" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 33C13 33 24 20.5 24 12.5C24 6.1 19.1 1 13 1C6.9 1 2 6.1 2 12.5C2 20.5 13 33 13 33Z" fill="${JL.encre}" stroke="${JL.fond}" stroke-width="1.5"/><circle cx="13" cy="12.5" r="4.5" fill="${JL.fond}"/></svg>`,
});

const grappeIcone = (n) => L.divIcon({
  className: "k-vacance-grappe",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `<div style="width:40px;height:40px;border-radius:9999px;display:grid;place-items:center;background:${JL["menthe-fonce"]};color:${JL["sur-menthe"]};border:2px solid ${JL.encre};font-size:13px;font-weight:500;font-variant-numeric:tabular-nums">${n}</div>`,
});

/**
 * Les ronds, ou les grappes au-delà de deux cents. Le regroupement est une
 * grille en pixels de l'écran : simple, sans dépendance, recalculé à chaque
 * mouvement de la carte.
 */
function Locaux({ locaux, choisi, survol, onChoisir, onSurvol }) {
  const map = useMap();
  const [vue, setVue] = useState(0);
  useMapEvents({ zoomend: () => setVue((v) => v + 1), moveend: () => setVue((v) => v + 1) });

  const grappes = useMemo(() => {
    if (locaux.length <= SEUIL_GRAPPES) return null;
    const cellules = new Map();
    for (const l of locaux) {
      const p = map.project([l.lat, l.lon], map.getZoom());
      const k = `${Math.floor(p.x / CELLULE_PX)}:${Math.floor(p.y / CELLULE_PX)}`;
      const g = cellules.get(k) || { lat: 0, lon: 0, n: 0, items: [] };
      g.lat += l.lat; g.lon += l.lon; g.n++; g.items.push(l);
      cellules.set(k, g);
    }
    return [...cellules.values()].map((g) => ({ ...g, lat: g.lat / g.n, lon: g.lon / g.n }));
  }, [locaux, vue, map]);

  if (grappes) {
    return grappes.map((g, i) => (g.n === 1
      ? <Rond key={g.items[0].cle} l={g.items[0]} choisi={choisi} survol={survol} onChoisir={onChoisir} onSurvol={onSurvol} />
      : (
        <Marker
          key={`g${i}`}
          position={[g.lat, g.lon]}
          icon={grappeIcone(g.n)}
          eventHandlers={{ click: () => map.flyTo([g.lat, g.lon], Math.min(19, map.getZoom() + 2), { duration: 0.5 }) }}
        />
      )));
  }
  return locaux.map((l) => <Rond key={l.cle} l={l} choisi={choisi} survol={survol} onChoisir={onChoisir} onSurvol={onSurvol} />);
}

function Rond({ l, choisi, survol, onChoisir, onSurvol }) {
  const recent = estRecent(l.signal_principal?.date);
  const actif = choisi?.cle === l.cle || survol === l.cle;
  return (
    <CircleMarker
      center={[l.lat, l.lon]}
      radius={actif ? 9 : 7}
      pathOptions={{ color: actif ? JL.menthe : JL.encre, weight: 1.5, fillColor: recent ? JL["menthe-fonce"] : JL["menthe-clair"], fillOpacity: 0.95 }}
      eventHandlers={{ click: () => onChoisir(l), mouseover: () => onSurvol?.(l.cle), mouseout: () => onSurvol?.(null) }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={1}>{l.enseigne || l.denomination || l.adresse}</Tooltip>
    </CircleMarker>
  );
}

/** La fiche d'un local : nom, adresse, type, distance, puis la chronologie et les liens. */
function Fiche({ l }) {
  const principal = l.signaux?.[0];
  return (
    <div className="k-vacance-fiche">
      <p className="m-0 text-[15px] text-encre">{l.enseigne || l.denomination || "Établissement"}</p>
      {l.enseigne && l.denomination && l.enseigne !== l.denomination && <p className="m-0 text-[12.5px] text-ardoise">{l.denomination}</p>}
      <p className="m-0 mt-1 text-[13.5px] text-ardoise">{l.adresse || "Adresse non publiée"}</p>
      <p className="m-0 mt-1 text-[12.5px] text-brume">{motCategorie(l.categorie_bien)}{l.activite ? ` · ${l.activite}` : l.code_naf ? ` · NAF ${l.code_naf}` : ""} · à {metres(l.distance_m)}</p>
      {(l.multi_sites || l.demenagement) && (
        <p className="m-0 mt-1 text-[12.5px] text-ambre">{[l.multi_sites && "Entreprise multi-sites : seul le siège est placé", l.demenagement && "Déménagement : l'entreprise a rouvert ailleurs"].filter(Boolean).join(" · ")}</p>
      )}
      {principal && (
        <p className="m-0 mt-3 text-[13.5px] text-encre">
          {motType(principal.type)} <span className="text-ardoise">· {date(principal.date)}</span>
          {principal.tribunal && <span className="block text-[12.5px] text-brume">{principal.tribunal}</span>}
        </p>
      )}
      {l.signaux?.length > 1 && (
        <ul className="m-0 mt-2 list-none border-t border-trait p-0">
          {l.signaux.slice(1).map((s, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 border-t border-trait py-1.5 text-[12.5px] first:border-t-0">
              <span className="text-craie">{motType(s.type)}</span>
              <span className="tabular-nums text-brume">{date(s.date)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
        {l.signaux?.filter((s) => s.source === "bodacc" && s.url).slice(0, 1).map((s, i) => (
          <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-menthe underline underline-offset-2">Annonce BODACC</a>
        ))}
        {l.url_annuaire && <a href={l.url_annuaire} target="_blank" rel="noreferrer" className="text-menthe underline underline-offset-2">Annuaire des entreprises</a>}
      </div>
    </div>
  );
}

/**
 * @param {{point: {lat:number, lon:number, label?:string}|null, rayonM: number, locaux: object[],
 *   choisi: object|null, onChoisir: Function, survol: string|null, onSurvol: Function, cible: object|null}} p
 */
export default function CarteVacance({ point, rayonM, locaux = [], choisi, onChoisir, survol, onSurvol, cible }) {
  // Le plan Google Maps en clair (13 oct. 2026, Jules), l'IGN en repli s'il ne répond pas.
  const { fond, surErreur } = useFondDeCarte({ google: true });
  return (
    <div className={`k-carte-rues k-vacance absolute inset-0 ${fond.google ? "k-carte-google" : ""}`}>
      <MapContainer center={FRANCE.centre} zoom={FRANCE.zoom} zoomControl className="h-full w-full" attributionControl={false} preferCanvas>
        <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max} eventHandlers={{ tileerror: surErreur }} />
        <Cadrage point={point} rayonM={rayonM} />
        <AllerVers cible={cible} />
        {point && (
          <>
            <Circle center={[point.lat, point.lon]} radius={rayonM} pathOptions={{ color: JL.menthe, weight: 1.5, fillColor: JL.menthe, fillOpacity: 0.1 }} interactive={false} />
            <Marker position={[point.lat, point.lon]} icon={pin} title={point.label || ""} zIndexOffset={1000} />
          </>
        )}
        <Locaux locaux={locaux} choisi={choisi} survol={survol} onChoisir={onChoisir} onSurvol={onSurvol} />
        {choisi && (
          <Popup position={[choisi.lat, choisi.lon]} offset={[0, -6]} maxWidth={320} eventHandlers={{ remove: () => onChoisir(null) }}>
            <Fiche l={choisi} />
          </Popup>
        )}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-[10px] border border-bord bg-surface px-3 py-2 text-[11px] text-craie backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JL["menthe-fonce"] }} />Moins de 12 mois</span>
        <span className="ml-3 inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JL["menthe-clair"] }} />Plus ancien</span>
        <span className="ml-3 text-brume">{fond.attribution}</span>
      </div>
    </div>
  );
}
