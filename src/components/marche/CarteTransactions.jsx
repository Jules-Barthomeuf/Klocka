import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import jetons from "@/design/jetons.json";
import { useFondDeCarte } from "@/lib/tuiles";

// La carte des transactions autour du commerce (17 nov. 2026, Jules) : le bien au centre, les cessions de fonds de
// commerce (BODACC) à 500 m ; les ventes de murs retirées le 24 nov. 2026 (Jules : « juste mets fonds de commerce »).
// Même fond que la carte de Klocka (Google, l'IGN en repli). Lue par l'Analyse (MarcheAffine) et le projet
// (MarcheProjet) ; données de server/carte-transactions.js.
// Les ventes de murs (DVF) reviennent pour l'équipe seulement (24 nov. 2026, Jules : « juste pas pour les clients ») :
// `avecMurs` les demande, le serveur ne les rend qu'à un compte de l'équipe.
// Les familles en pilules au-dessus de la carte, plus dessus (24 nov. 2026, Jules : « les pills en dehors de la carte ») ;
// un clic sur l'une la montre ou la cache.
// Le dessin de ce qui est posé sur la carte se règle par `dessin` (la planche /PlancheCarte le fait varier) ; sans
// lui, DESSIN_DEFAUT, celui choisi par Jules le 24 nov. 2026 : un point dans son halo, tous de la même taille, le prix
// en étiquette au-dessus, le bien en épingle noire, les 500 m en zone teintée.

const C = jetons.couleurs_clair;
const S = jetons.couleurs;
/** Le blanc pur du thème clair : le liseré des points et le texte posé sur une couleur. */
const BLANC = C["sur-menthe"];

/** Les couleurs qu'un point peut prendre, du thème clair des jetons (la carte claire) ; le nom pour la planche. */
export const COULEURS_POINTS = [
  ["systeme", "Système"], ["menthe", "Menthe"], ["emplacement-1", "Bleu"], ["emplacement-1bis", "Orange"], ["emplacement-2", "Corail"], ["ambre", "Ambre"], ["encre", "Encre"],
];

export const DESSIN_DEFAUT = {
  forme: "halo", // halo | pastille | anneau | goutte | prix (le prix est le point)
  couleurFonds: "systeme", // la couleur d'accent de l'application (24 nov. 2026, Jules : « en couleur système »)
  couleurMurs: "emplacement-1",
  taille: 7, // le rayon du point, en px (5 puis 7 le 24 nov. 2026, Jules : « plus gros »)
  etiquette: "toujours", // toujours | chers | aucune
  styleEtiquette: "pastille", // pastille | texte | couleur
  bien: "epingle", // epingle (couleur système) | blanche | rond | cible ; plus d'épingle noire (24 nov. 2026, Jules)
  cercle: "zone", // zone | pointilles | trait | aucun
  fond: "clair", // clair | sombre
};

const FAMILLES = [
  { cle: "fonds", nom: "Fonds de commerce", couleur: "couleurFonds" },
  { cle: "murs", nom: "Ventes de murs", couleur: "couleurMurs" },
];

/** Le prix court de l'étiquette : « 185 k€ », « 1,25 M€ » dès un million. */
const prixCourt = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const euros = (n) => (Number.isFinite(n) ? (n >= 1e6 ? `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n).toLocaleString("fr-FR")} €`) : null);
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" });
const date = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? FORMAT_DATE.format(d) : null; };
const POLICE = "var(--k-police,'Instrument Sans'),Inter,sans-serif";

/** Le prix au-dessus du point, au style choisi. `ecart` : la distance entre le centre du point et le bas de l'étiquette. */
function iconeEtiquette(texte, style, teinte, sombre, ecart) {
  const base = `position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - ${ecart}px));white-space:nowrap;font:600 11.5px/16px ${POLICE};font-variant-numeric:tabular-nums;`;
  const css = style === "texte"
    ? `${base}color:${teinte};text-shadow:0 0 2px ${sombre ? S.fond : BLANC},0 0 2px ${sombre ? S.fond : BLANC},0 0 3px ${sombre ? S.fond : BLANC};`
    : style === "couleur"
      ? `${base}padding:1px 7px;border-radius:999px;background:${teinte};color:${BLANC};box-shadow:0 1px 3px rgb(0 0 0/.18);`
      : `${base}padding:1px 7px;border-radius:999px;background:${sombre ? S["surface-pleine"] : C["surface-pleine"]};border:1px solid ${sombre ? S["bord-doux"] : C["bord-doux"]};color:${sombre ? S.encre : C.encre};box-shadow:0 1px 3px rgb(0 0 0/.12);`;
  return L.divIcon({ className: "", iconSize: [0, 0], iconAnchor: [0, 0], html: `<span style="${css}">${texte}</span>` });
}

/** Le point fait du prix lui-même (forme « prix ») : une pastille de couleur et sa pointe. */
const iconePrix = (texte, teinte) => L.divIcon({
  className: "", iconSize: [0, 0], iconAnchor: [0, 0],
  html: `<span style="position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 5px));white-space:nowrap;padding:2px 8px;border-radius:999px;background:${teinte};color:${BLANC};border:1.5px solid ${BLANC};font:600 11.5px/16px ${POLICE};font-variant-numeric:tabular-nums;box-shadow:0 1px 4px rgb(0 0 0/.22)">${texte}</span><span style="position:absolute;left:-4px;top:-6px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid ${teinte}"></span>`,
});

/** Une petite goutte de la couleur de la famille (forme « goutte »). */
const iconeGoutte = (teinte, petite) => {
  const l = petite ? 14 : 18, h = Math.round(l * 1.3);
  return L.divIcon({
    className: "", iconSize: [l, h], iconAnchor: [l / 2, h - 1],
    html: `<svg width="${l}" height="${h}" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 33C13 33 24 20.5 24 12.5C24 6.1 19.1 1 13 1C6.9 1 2 6.1 2 12.5C2 20.5 13 33 13 33Z" fill="${teinte}" stroke="${BLANC}" stroke-width="2"/><circle cx="13" cy="12.5" r="4.5" fill="${BLANC}"/></svg>`,
  });
};

/** Le bien, en couleur système : l'épingle (pleine, ou blanche à cœur de couleur) ou la cible. Une ombre douce la détache. */
const iconeBien = (forme, systeme) => {
  const ombre = "filter:drop-shadow(0 2px 3px rgb(0 0 0/.3))";
  if (forme === "cible") {
    return L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<svg width="28" height="28" viewBox="0 0 28 28" style="${ombre}" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="12" fill="${BLANC}" stroke="${systeme}" stroke-width="3"/><circle cx="14" cy="14" r="5.5" fill="${systeme}"/></svg>` });
  }
  const blanche = forme === "blanche";
  return L.divIcon({ className: "", iconSize: [32, 42], iconAnchor: [16, 40],
    html: `<svg width="32" height="42" viewBox="0 0 26 34" fill="none" style="${ombre}" xmlns="http://www.w3.org/2000/svg"><path d="M13 33C13 33 24 20.5 24 12.5C24 6.1 19.1 1 13 1C6.9 1 2 6.1 2 12.5C2 20.5 13 33 13 33Z" fill="${blanche ? BLANC : systeme}" stroke="${blanche ? systeme : BLANC}" stroke-width="1.6"/><circle cx="13" cy="12.5" r="4.8" fill="${blanche ? systeme : BLANC}"/></svg>` });
};

/** La couleur système : l'accent de l'application tel que la page l'affiche (Personnalisation, ou la pervenche de
 *  K Partners). Le dessin est en canvas, qui ne lit pas les variables CSS : on la relit sur la racine, et de nouveau
 *  quand le thème ou l'accent change. */
const lireSysteme = () => {
  const v = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--k-menthe-rgb").trim();
  const n = v.split(/[\s,]+/).filter(Boolean);
  return n.length === 3 ? `rgb(${n.join(",")})` : C.menthe;
};
function useCouleurSysteme() {
  const [c, setC] = useState(lireSysteme);
  useEffect(() => {
    const relire = () => setC(lireSysteme());
    const o = new MutationObserver(relire);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    relire();
    return () => o.disconnect();
  }, []);
  return c;
}

/** Le seuil des « plus chers » d'une famille : le quart du haut. */
const seuilChers = (points) => {
  const s = points.map((p) => p.prix).filter((x) => x > 0).sort((a, b) => b - a);
  return s.length ? s[Math.max(0, Math.ceil(s.length / 4) - 1)] : Infinity;
};

function Bulle({ f, p, decalage }) {
  return (
    <Tooltip direction="top" offset={[0, -decalage]} opacity={1}>
      <span className="block text-[13px] font-medium">{f.cle === "murs" ? "Vente de murs" : p.enseigne || "Cession de fonds"}{date(p.date) ? ` · ${date(p.date)}` : ""}</span>
      <span className="block text-[12.5px]">
        {euros(p.prix) || "Prix non publié"}
        {f.cle === "murs" && p.surface ? ` · ${p.surface} m² · ${euros(p.prix_m2)}/m²` : ""}
      </span>
      {p.activite && <span className="block max-w-[280px] truncate text-[12px] opacity-75">{p.activite}</span>}
      {p.adresse && <span className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{p.adresse}{p.distance_m != null ? ` · ${p.distance_m} m` : ""}</span>}
    </Tooltip>
  );
}

/** Un point posé sur la carte, au dessin choisi ; une cession sans prix publié reste un peu plus petite, sans étiquette. */
function Point({ f, p, ds, teinte, sombre, chers }) {
  const r = p.prix ? ds.taille : Math.max(3, ds.taille * 0.7);
  const pos = [p.lat, p.lon];
  if (ds.forme === "prix") {
    if (!p.prix) return <CircleMarker center={pos} radius={4} pathOptions={{ color: BLANC, weight: 1.5, fillColor: teinte, fillOpacity: 1 }}><Bulle f={f} p={p} decalage={6} /></CircleMarker>;
    return <Marker position={pos} icon={iconePrix(prixCourt(p.prix), teinte)}><Bulle f={f} p={p} decalage={28} /></Marker>;
  }
  let corps;
  let haut = r; // le haut du dessin, au-dessus du centre : l'étiquette se pose au-dessus
  if (ds.forme === "goutte") {
    haut = p.prix ? 23 : 18;
    corps = <Marker position={pos} icon={iconeGoutte(teinte, !p.prix)}><Bulle f={f} p={p} decalage={haut + 4} /></Marker>;
  } else if (ds.forme === "anneau") {
    haut = r + 2;
    corps = (
      <>
        <CircleMarker center={pos} radius={r + 2} pathOptions={{ color: teinte, weight: 2.5, opacity: 1, fillColor: teinte, fillOpacity: 0.2 }}><Bulle f={f} p={p} decalage={r + 4} /></CircleMarker>
        <CircleMarker center={pos} radius={1.8} interactive={false} pathOptions={{ stroke: false, fillColor: teinte, fillOpacity: 1 }} />
      </>
    );
  } else if (ds.forme === "pastille") {
    haut = r + 1;
    corps = <CircleMarker center={pos} radius={r + 1} pathOptions={{ color: BLANC, weight: 1.5, opacity: 1, fillColor: teinte, fillOpacity: 1 }}><Bulle f={f} p={p} decalage={r + 3} /></CircleMarker>;
  } else {
    // Le halo porte la bulle : une cible plus large que le point.
    const halo = r * 2.3;
    haut = halo * 0.75;
    corps = (
      <>
        <CircleMarker center={pos} radius={halo} pathOptions={{ stroke: false, fillColor: teinte, fillOpacity: 0.18 }}><Bulle f={f} p={p} decalage={halo - 2} /></CircleMarker>
        <CircleMarker center={pos} radius={r} interactive={false} pathOptions={{ color: BLANC, weight: 1.5, opacity: 1, fillColor: teinte, fillOpacity: 1 }} />
      </>
    );
  }
  const montrer = p.prix > 0 && (ds.etiquette === "toujours" || (ds.etiquette === "chers" && p.prix >= chers));
  return (
    <>
      {corps}
      {montrer && <Marker position={pos} icon={iconeEtiquette(prixCourt(p.prix), ds.styleEtiquette, teinte, sombre, haut + 4)} interactive={false} keyboard={false} />}
    </>
  );
}

export const cleCarteTransactions = (adresse, avecMurs = false) => ["carte-transactions", String(adresse || "").trim().toLowerCase(), avecMurs ? "murs" : "fonds"];

export default function CarteTransactions({ adresse, hauteur = 420, className = "", avecMurs = false, dessin = null }) {
  const ds = { ...DESSIN_DEFAUT, ...(dessin || {}) };
  const sombre = ds.fond === "sombre";
  const q = useQuery({
    queryKey: cleCarteTransactions(adresse, avecMurs),
    queryFn: () => base44.request("GET", `/api/carte-transactions?adresse=${encodeURIComponent(adresse)}${avecMurs ? "&murs=1" : ""}`),
    enabled: !!String(adresse || "").trim(),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const [visibles, setVisibles] = useState(() => new Set(FAMILLES.map((f) => f.cle)));
  const basculer = (cle) => setVisibles((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const { fond, surErreur } = useFondDeCarte({ google: true, sombre });
  const d = q.data;
  // Une famille se montre quand le serveur l'a rendue : les murs n'arrivent qu'à l'équipe.
  const familles = FAMILLES.filter((f) => Array.isArray(d?.[f.cle]));
  const systeme = useCouleurSysteme();
  const teinte = (f) => (ds[f.couleur] === "systeme" ? systeme : C[ds[f.couleur]] || systeme);

  if (!String(adresse || "").trim()) return <p className="m-0 p-5 text-[13.5px] text-brume">Ajoutez l'adresse du bien : la carte des transactions s'affichera.</p>;
  if (q.isError) return <p className="m-0 p-5 text-[13.5px] text-alerte">{q.error?.message || "La carte des transactions ne s'est pas chargée."}</p>;

  const centre = d?.bien ? [d.bien.lat, d.bien.lon] : null;
  const sources = [d?.sources?.fonds?.nom, d?.sources?.murs?.nom].filter(Boolean).join(" · ");
  const cercle = teinte(FAMILLES[0]);
  const trait = sombre ? S.encre : C.encre;
  const optionsCercle = {
    zone: { color: cercle, weight: 1, opacity: 0.45, fillColor: cercle, fillOpacity: 0.07 },
    pointilles: { color: trait, weight: 1, opacity: 0.35, dashArray: "4 5", fill: false },
    trait: { color: trait, weight: 1.2, opacity: 0.4, fill: false },
  }[ds.cercle];
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Les familles, au-dessus de la carte : un clic les montre ou les cache, le nombre à côté. */}
      {familles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {familles.map((f) => {
            const on = visibles.has(f.cle);
            return (
              <button key={f.cle} type="button" onClick={() => basculer(f.cle)} aria-pressed={on}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors ${on ? "border-bord-doux text-encre" : "border-trait text-brume"}`} style={{ background: "transparent" }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: teinte(f), opacity: on ? 1 : 0.35 }} />
                {f.nom}
                <span className="tabular-nums text-ardoise">{d[f.cle].length}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className={`k-carte-rues ${sombre ? "k-carte-sombre" : "k-carte-claire"} ${fond.google ? "k-carte-google" : ""} relative overflow-hidden rounded-[12px] border border-trait`} style={{ height: hauteur }}>
        {centre && (
          <MapContainer key={centre.join(",")} center={centre} zoom={16} minZoom={12} zoomControl className="h-full w-full" attributionControl={false} preferCanvas scrollWheelZoom={false}>
            <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max || 16} eventHandlers={{ tileerror: surErreur }} />
            {optionsCercle && <Circle center={centre} radius={d.rayon || 500} pathOptions={optionsCercle} interactive={false} />}
            {familles.filter((f) => visibles.has(f.cle)).map((f) => {
              const chers = seuilChers(d[f.cle]);
              return d[f.cle].map((p, i) => <Point key={`${f.cle}:${i}`} f={f} p={p} ds={ds} teinte={teinte(f)} sombre={sombre} chers={chers} />);
            })}
            {ds.bien === "rond" ? (
              <CircleMarker center={centre} radius={9} pathOptions={{ color: systeme, fillColor: BLANC, fillOpacity: 1, weight: 3.5 }}>
                <Tooltip direction="top" offset={[0, -8]} opacity={1}><span className="block text-[13px] font-medium">Le bien</span><span className="block text-[12px] opacity-75">{d.bien.adresse}</span></Tooltip>
              </CircleMarker>
            ) : (
              <Marker position={centre} icon={iconeBien(ds.bien, systeme)} zIndexOffset={1000}>
                <Tooltip direction="top" offset={[0, ds.bien === "cible" ? -14 : -38]} opacity={1}><span className="block text-[13px] font-medium">Le bien</span><span className="block text-[12px] opacity-75">{d.bien.adresse}</span></Tooltip>
              </Marker>
            )}
          </MapContainer>
        )}
        {q.isLoading && (
          <div className="absolute inset-0 z-[600] grid place-items-center bg-fond/40 backdrop-blur-[2px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-4 py-2 text-[13px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />{avecMurs ? "Je relève les ventes et les cessions autour" : "Je relève les cessions de fonds autour"} (la première fois, quelques secondes)</span>
          </div>
        )}
        {d?.erreurs?.length > 0 && <p className="absolute bottom-3 left-3 z-[600] m-0 max-w-[70%] rounded-[10px] bg-surface-pleine px-3 py-1.5 text-[12px] text-ambre">Incomplète : {d.erreurs.join(" · ")}</p>}
        <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution}{sources ? ` · ${sources}` : ""} · {d?.rayon || 500} m</span>
      </div>
    </div>
  );
}
