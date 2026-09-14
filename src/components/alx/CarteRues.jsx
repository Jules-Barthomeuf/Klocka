import React, { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
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
  // On ne recadre que si les points ont vraiment bougé. Reclasser une rue,
  // la cocher ou relire la ville rend un nouveau tableau aux mêmes
  // coordonnées : le zoom de l'équipe reste où elle l'a mis.
  const signature = points.map(([a, b]) => `${a.toFixed(4)},${b.toFixed(4)}`).join(";");
  const cadree = useRef(null);
  useEffect(() => {
    if (cadree.current === signature) return;
    cadree.current = signature;
    if (points.length >= 3) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 });
    else if (points.length) map.setView(points[0], 15);
  }, [map, signature]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const CLE_THEME = "alx-carte-sombre";
const lireTheme = () => {
  try {
    return localStorage.getItem(CLE_THEME) !== "0";
  } catch {
    return true;
  }
};

/** Sombre ou clair : le fond de carte, au choix, retenu d'une fois sur l'autre. */
function useThemeCarte() {
  const [sombre, setSombre] = useState(lireTheme);
  const basculer = () => {
    setSombre((x) => {
      try {
        localStorage.setItem(CLE_THEME, x ? "0" : "1");
      } catch {
        // Un navigateur qui bloque le stockage garde le choix pour la page seulement.
      }
      return !x;
    });
  };
  return [sombre, basculer];
}

function BoutonTheme({ sombre, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={sombre ? "Fond de carte clair" : "Fond de carte sombre"}
      className="absolute right-3 top-3 z-[400] grid h-9 w-9 place-items-center rounded-full border border-white/[0.12] backdrop-blur transition-colors hover:text-[#F3F7F5]"
      // Le style est posé ici : la règle globale « .alx button » rend les boutons transparents.
      style={{ background: "rgba(15,17,20,0.9)", color: "#E8EFEB" }}
    >
      {sombre ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
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
 * Le tracé dans le sens de la balade : ALX parcourt une rue le long de son
 * axe principal, dans le sens des coordonnées croissantes (server/alx/places.js,
 * pasDeMarche). On ordonne donc les tronçons de la même façon, et on retourne
 * ceux qui vont à rebours, pour que la couleur avance du même côté que lui.
 */
function orienterTrace(trace) {
  const pts = trace.flat();
  if (pts.length < 2) return trace;
  const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
  const axe = (Math.max(...lats) - Math.min(...lats)) * 111000 >= (Math.max(...lons) - Math.min(...lons)) * 111000 * Math.cos((lats[0] * Math.PI) / 180) ? 0 : 1;
  return trace
    .map((t) => (t.length > 1 && t[0][axe] > t[t.length - 1][axe] ? [...t].reverse() : t))
    .sort((a, b) => a[0][axe] - b[0][axe]);
}

/** Le début d'un tracé : la fraction demandée de ses points, dans le sens de la balade. */
function debutDuTrace(traceBrut, fraction) {
  const trace = orienterTrace(traceBrut);
  const total = trace.reduce((a, t) => a + t.length, 0);
  let reste = Math.max(2, Math.round(total * Math.max(0, Math.min(1, fraction || 0))));
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
  const [sombre, basculerTheme] = useThemeCarte();
  const visibles = useMemo(() => (direct ? rues.filter((r) => direct.retenues.includes(r.nom)) : rues), [rues, direct]);
  // Le cadrage vise le centre commerçant : les vingt rues les plus garnies,
  // à moins de 4 km du centre de la ville. Une rue mal géolocalisée ou un
  // chemin de Sophia Antipolis ne doit pas dézoomer Antibes jusqu'à Cannes.
  // En direct, toutes les rues retenues comptent.
  const points = useMemo(() => {
    const proches = visibles
      .filter((r) => r.centre && (!centre || metres([r.centre.lat, r.centre.lon], [centre.lat, centre.lon]) <= 4000));
    const cadre = direct ? proches : [...proches].sort((a, b) => (b.commerces || 0) - (a.commerces || 0)).slice(0, 20);
    return cadre.map((r) => [r.centre.lat, r.centre.lon]);
  }, [visibles, centre, direct]);
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
    <div className={`k-carte-rues ${sombre ? "" : "k-carte-claire"} relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-fond ${className}`}>
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
        {direct?.position && <CircleMarker center={[direct.position.lat, direct.position.lon]} radius={7} pathOptions={{ color: "#F3F7F5", weight: 2, fillColor: "#96c0b8", fillOpacity: 1 }} />}
        {direct
          ? visibles.map((r) => {
            const e = emplacementDe(r.classe);
            const faite = direct.faites.includes(r.nom);
            const enCours = direct.enCours === r.nom;
            const trace = r.trace || [];
            return [
              // Le fond gris : la rue qu'ALX doit encore parcourir.
              ...trace.map((troncon, i) => <Polyline key={`g-${r.nom}-${i}`} positions={troncon} pathOptions={{ color: "#3a3f47", weight: 4, opacity: 0.9, lineCap: "round" }} />),
              // La couleur : entière quand c'est fait. En cours : pendant la balade,
              // un pointillé fin qui suit les pas ; pendant la lecture, un trait plein
              // qui avance d'un cran à chaque commerce lu.
              ...(faite ? trace.map((troncon, i) => <Polyline key={`c-${r.nom}-${i}`} positions={troncon} pathOptions={{ color: e.teinte, weight: 6, opacity: 1, lineCap: "round" }} />)
                : enCours && direct.fraction != null
                  ? (typeof direct.fraction === "object"
                    ? debutDuTrace(trace, direct.fraction.balade).map((troncon, i) => <Polyline key={`s-${r.nom}-${i}`} positions={troncon} pathOptions={{ color: e.teinte, weight: 4, opacity: 0.8, dashArray: "2 8", lineCap: "round" }} />)
                    : debutDuTrace(trace, direct.fraction).map((troncon, i) => <Polyline key={`c-${r.nom}-${i}`} positions={troncon} pathOptions={{ color: e.teinte, weight: 8, opacity: 1, lineCap: "round" }} />))
                  : []),
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
      <BoutonTheme sombre={sombre} onClick={basculerTheme} />
      {!direct && <Legende />}
      {avecTrace === 0 && (
        <div className="absolute inset-0 z-[400] grid place-items-center bg-fond/70 px-6 text-center text-[13px] text-ardoise">
          Les tracés arrivent avec le prochain relevé : cliquez « Refaire les rues ».
        </div>
      )}
    </div>
  );
}
