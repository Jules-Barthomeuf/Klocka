import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useFondDeCarte } from "@/lib/tuiles";
import { JL } from "@/design/jetons";
import { adresseLisible, estRecent, motCategorie, motType } from "@/lib/vacance-signaux";

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
function Cadrage({ point, rayonM, cadre = null }) {
  const map = useMap();
  const cle = point ? `${point.lat.toFixed(5)},${point.lon.toFixed(5)}` : "";
  // Une rue entière (16 oct. 2026) : la carte se cadre sur ses locaux, avec une marge.
  const cleCadre = cadre ? cadre.flat().map((x) => x.toFixed(4)).join(",") : "";
  useEffect(() => {
    if (cadre) return;
    if (!point) { map.flyTo(FRANCE.centre, FRANCE.zoom, { duration: 0.8 }); return; }
    map.flyToBounds(limites(point, rayonM), { duration: 1 });
  }, [map, cle, cleCadre]);
  useEffect(() => {
    if (cadre) return;
    if (point) map.fitBounds(limites(point, rayonM), { animate: true, duration: 0.5 });
  }, [map, rayonM, cleCadre]);
  useEffect(() => {
    if (cadre) map.flyToBounds(cadre, { duration: 0.9, padding: [48, 48], maxZoom: 18 });
  }, [map, cleCadre]);
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
      <Tooltip direction="top" offset={[0, -8]} opacity={1}>{l.enseigne || l.denomination || adresseLisible(l.adresse)}</Tooltip>
    </CircleMarker>
  );
}

// --- Une rue entière (16 oct. 2026) : chaque local selon son état, les tronçons numérotés ---------
// vacant : ambre (l'attention) ; incertain : anneau creux ; occupé : menthe discrète. Le tronçon choisi est
// tracé en menthe, le plus vacant en ambre, les autres en ardoise.
const COULEUR_ETAT = { vacant: JL.ambre, incertain: JL.brume, occupe: JL["menthe-fonce"] };
export const MOT_ETAT = { vacant: "Vacant", incertain: "Incertain", occupe: "Occupé" };

function LocauxRue({ locaux, choisi, onChoisir, troncons, tronconChoisi }) {
  const dansTroncon = useMemo(() => {
    const t = troncons?.find((x) => x.rang === tronconChoisi);
    return t ? new Set(t.cles) : null;
  }, [troncons, tronconChoisi]);
  return locaux.map((l) => {
    const actif = choisi?.cle === l.cle;
    const estompe = dansTroncon && !dansTroncon.has(l.cle);
    return (
      <CircleMarker
        key={l.cle}
        center={[l.lat, l.lon]}
        radius={actif ? 10 : l.etat === "vacant" ? 8 : 6}
        pathOptions={{ color: actif ? JL.menthe : JL.encre, weight: actif ? 2.5 : 1.5, fillColor: l.etat === "incertain" ? JL.surface : COULEUR_ETAT[l.etat], fillOpacity: estompe ? 0.25 : l.etat === "incertain" ? 0.9 : 0.95, opacity: estompe ? 0.35 : 1 }}
        eventHandlers={{ click: () => onChoisir(l) }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>{`${MOT_ETAT[l.etat]} · ${adresseLisible(l.adresse)}`}</Tooltip>
      </CircleMarker>
    );
  });
}

const numeroIcone = (rang, actif, plusVacant) => L.divIcon({
  className: "k-vacance-troncon",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: `<div style="width:28px;height:28px;border-radius:9999px;display:grid;place-items:center;background:${actif ? JL.menthe : plusVacant ? JL.ambre : JL["surface-pleine"]};color:${actif || plusVacant ? JL["sur-menthe"] : JL.encre};border:2px solid ${JL.encre};font-size:12.5px;font-weight:500">${rang}</div>`,
});

/**
 * Le tracé d'un tronçon : les locaux rangés le long de l'axe de la rue (et non par numéro, qui zigzague d'un
 * côté à l'autre), sans ceux que le géocodage a posés loin de la rue.
 */
export function traceDuTroncon(pts) {
  if (pts.length < 3) return pts;
  const k = 111320;
  const mLat = pts.reduce((t, p) => t + p[0], 0) / pts.length;
  const mLon = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const c = Math.cos((mLat * Math.PI) / 180);
  const xy = pts.map((p) => [(p[1] - mLon) * c * k, (p[0] - mLat) * k]);
  // L'axe principal : la direction où les points s'étalent le plus (covariance, angle de l'axe).
  const sxx = xy.reduce((t, q) => t + q[0] * q[0], 0); const syy = xy.reduce((t, q) => t + q[1] * q[1], 0); const sxy = xy.reduce((t, q) => t + q[0] * q[1], 0);
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle); const uy = Math.sin(angle);
  const mesures = xy.map((q, i) => ({ i, t: q[0] * ux + q[1] * uy, d: Math.abs(-q[0] * uy + q[1] * ux) }));
  const ds = mesures.map((m) => m.d).sort((a, b) => a - b);
  const seuil = Math.max(45, 2.5 * ds[Math.floor(ds.length / 2)]);
  const gardes = mesures.filter((m) => m.d <= seuil).sort((a, b) => a.t - b.t);
  return (gardes.length >= 2 ? gardes : mesures.sort((a, b) => a.t - b.t)).map((m) => pts[m.i]);
}

/** Les tronçons : un tracé par tronçon à travers ses locaux, et son numéro au milieu ; un clic le choisit. */
function Troncons({ troncons, locaux, tronconChoisi, onTroncon }) {
  const parCle = useMemo(() => new Map(locaux.map((l) => [l.cle, l])), [locaux]);
  const fiables = troncons.filter((t) => t.fiable);
  const plusVacant = fiables.length > 1 ? fiables.reduce((m, t) => (t.taux > m.taux ? t : m), fiables[0]) : null;
  return troncons.map((t) => {
    const pts = traceDuTroncon(t.cles.map((c) => parCle.get(c)).filter(Boolean).map((l) => [l.lat, l.lon]));
    const actif = tronconChoisi === t.rang;
    const pv = plusVacant && plusVacant.rang === t.rang && plusVacant.taux > 0;
    return (
      <React.Fragment key={t.rang}>
        {pts.length > 1 && (
          <Polyline positions={pts} pathOptions={{ color: actif ? JL.menthe : pv ? JL.ambre : JL.ardoise, weight: actif ? 8 : 5, opacity: actif ? 0.55 : 0.35, lineCap: "round", lineJoin: "round" }}
            eventHandlers={{ click: () => onTroncon?.(actif ? null : t.rang) }} />
        )}
        <Marker position={[t.centre.lat, t.centre.lon]} icon={numeroIcone(t.rang, actif, pv)} zIndexOffset={500} title={`Tronçon ${t.rang} : n° ${t.du} à ${t.au}`}
          eventHandlers={{ click: () => onTroncon?.(actif ? null : t.rang) }} />
      </React.Fragment>
    );
  });
}

/** La fiche d'un local de la rue : son état et la raison, avec les sources. */
function FicheLocalRue({ l }) {
  const jour = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
  return (
    <div className="k-vacance-fiche">
      <p className="m-0 text-[15px] text-encre">{adresseLisible(l.adresse)}</p>
      <p className="m-0 mt-1 text-[13px]" style={{ color: l.etat === "vacant" ? JL.ambre : undefined }}>{MOT_ETAT[l.etat]}{l.confiance ? ` · confiance ${l.confiance}` : ""}</p>
      <p className="m-0 mt-2 text-[13px] leading-[1.5] text-ardoise">{l.raison}</p>
      {l.occupants?.length > 0 && <p className="m-0 mt-2 text-[12.5px] text-craie">Ouvert : {l.occupants.map((o) => o.nom).join(", ")}</p>}
      {l.dernier && <p className="m-0 mt-1 text-[12.5px] text-brume">Dernier occupant : {l.dernier.nom}, fermé le {jour(l.dernier.ferme_le)}</p>}
      {l.google?.length > 0 && <p className="m-0 mt-1 text-[12.5px] text-brume">Google Maps : {l.google.join(", ")}</p>}
    </div>
  );
}

/** La fiche d'un local : nom, adresse, type, distance, puis la chronologie et les liens. */
function Fiche({ l }) {
  const principal = l.signaux?.[0];
  return (
    <div className="k-vacance-fiche">
      <p className="m-0 text-[15px] text-encre">{l.enseigne || l.denomination || "Établissement"}</p>
      {l.enseigne && l.denomination && l.enseigne !== l.denomination && <p className="m-0 text-[12.5px] text-ardoise">{l.denomination}</p>}
      <p className="m-0 mt-1 text-[13.5px] text-ardoise">{adresseLisible(l.adresse) || "Adresse non publiée"}</p>
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
export default function CarteVacance({ point, rayonM, locaux = [], choisi, onChoisir, survol, onSurvol, cible, rue = null }) {
  // `rue` : { locaux, troncons, tronconChoisi, onTroncon, choisi, onChoisir, cadre } : une rue entière, mesurée (16 oct. 2026).
  const enRue = !!rue;
  // Le plan Google Maps en clair (13 oct. 2026, Jules), l'IGN en repli s'il ne répond pas.
  // Toujours en clair (14 oct. 2026, Jules : « la carte Google Maps, pas l'autre design en sombre ») : le repli aussi.
  const { fond, surErreur, raison } = useFondDeCarte({ google: true });
  return (
    <div className={`k-carte-rues k-vacance k-carte-claire absolute inset-0 ${fond.google ? "k-carte-google" : ""}`}>
      <MapContainer center={FRANCE.centre} zoom={FRANCE.zoom} zoomControl className="h-full w-full" attributionControl={false} preferCanvas>
        <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max} eventHandlers={{ tileerror: surErreur }} />
        <Cadrage point={point} rayonM={rayonM} cadre={rue?.cadre || null} />
        <AllerVers cible={cible} />
        {point && (
          <>
            {!enRue && <Circle center={[point.lat, point.lon]} radius={rayonM} pathOptions={{ color: JL.menthe, weight: 1.5, fillColor: JL.menthe, fillOpacity: 0.1 }} interactive={false} />}
            <Marker position={[point.lat, point.lon]} icon={pin} title={point.label || ""} zIndexOffset={1000} />
          </>
        )}
        {enRue ? (
          <>
            <Troncons troncons={rue.troncons || []} locaux={rue.locaux || []} tronconChoisi={rue.tronconChoisi} onTroncon={rue.onTroncon} />
            <LocauxRue locaux={rue.locaux || []} choisi={rue.choisi} onChoisir={rue.onChoisir} troncons={rue.troncons} tronconChoisi={rue.tronconChoisi} />
            {rue.choisi && (
              <Popup position={[rue.choisi.lat, rue.choisi.lon]} offset={[0, -6]} maxWidth={320} eventHandlers={{ remove: () => rue.onChoisir(null) }}>
                <FicheLocalRue l={rue.choisi} />
              </Popup>
            )}
          </>
        ) : <Locaux locaux={locaux} choisi={choisi} survol={survol} onChoisir={onChoisir} onSurvol={onSurvol} />}
        {!enRue && choisi && (
          <Popup position={[choisi.lat, choisi.lon]} offset={[0, -6]} maxWidth={320} eventHandlers={{ remove: () => onChoisir(null) }}>
            <Fiche l={choisi} />
          </Popup>
        )}
      </MapContainer>
      {raison && !fond.google && (
        <p className="pointer-events-none absolute right-3 top-3 z-[400] m-0 max-w-[420px] rounded-[10px] border border-bord bg-surface-pleine px-3 py-2 text-[12px] text-ambre">
          Fond Google Maps indisponible, plan {fond.nom} à la place. {raison}
        </p>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-[10px] border border-bord bg-surface px-3 py-2 text-[11px] text-craie backdrop-blur">
        {enRue ? (
          <>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JL.ambre }} />Vacant</span>
            <span className="ml-3 inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full border" style={{ background: JL.surface, borderColor: JL.brume }} />Incertain</span>
            <span className="ml-3 inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JL["menthe-fonce"] }} />Occupé</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JL["menthe-fonce"] }} />Moins de 12 mois</span>
            <span className="ml-3 inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: JL["menthe-clair"] }} />Plus ancien</span>
          </>
        )}
        <span className="ml-3 text-brume">{fond.attribution}</span>
      </div>
    </div>
  );
}
