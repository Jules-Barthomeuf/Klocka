import React, { useEffect, useRef, useState } from "react";
import { JL } from "@/design/jetons";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";

// La carte des parcelles : Google Maps, un polygone par parcelle avec sa
// contenance écrite au centre. En vert, une parcelle dont on connaît au moins
// une personne morale propriétaire : elle se clique. En gris, aucune
// personne morale connue : elle ne se clique pas. En orange, la parcelle
// qu'on regarde.
//
// Les couleurs passent par JL, la palette littérale : Google écrit ses
// polygones en SVG, où une variable CSS ne se résout pas.

/** Le centre d'un anneau : la moyenne de ses sommets. */
function centreDe(g) {
  const anneau = g?.type === "MultiPolygon" ? g.coordinates?.[0]?.[0] : g?.coordinates?.[0];
  if (!anneau?.length) return null;
  const pts = anneau.length > 3 ? anneau.slice(0, -1) : anneau;
  return { lng: pts.reduce((s, p) => s + p[0], 0) / pts.length, lat: pts.reduce((s, p) => s + p[1], 0) / pts.length };
}

// `centre` cadre la carte sans poser de repère : le repère marque une adresse,
// et la petite carte d'une fiche n'en a pas, elle a une parcelle en orange.
export default function CarteParcelles({ point, centre = null, parcelles = [], misesEnAvant = [], zoom = 18, etiquettes = true, interactif = true, onParcelle, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const repere = useRef(null);
  const traces = useRef([]);
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        carte.current = new window.google.maps.Map(conteneur.current, {
          center: { lat: (centre || point)?.lat ?? 46.6, lng: (centre || point)?.lon ?? 2.4 },
          zoom: centre || point ? zoom : 6,
          mapTypeId: "roadmap",
          disableDefaultUI: true,
          zoomControl: interactif,
          gestureHandling: interactif ? "greedy" : "none",
          clickableIcons: false,
        });
        setPrete(true);
      })
      .catch((e) => onErreur?.(e?.message || String(e)));
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    const m = carte.current;
    const c = centre || point;
    if (!m || !c) return;
    m.panTo({ lat: c.lat, lng: c.lon });
    m.setZoom(zoom);
    if (repere.current) { repere.current.setMap(null); repere.current = null; }
    if (point) repere.current = new window.google.maps.Marker({ map: m, position: { lat: point.lat, lng: point.lon }, title: point.label || "", zIndex: 10 });
  }, [prete, point?.lat, point?.lon, centre?.lat, centre?.lon, zoom]);

  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    for (const t of traces.current) t.setMap(null);
    traces.current = [];
    const avant = new Set(misesEnAvant);
    for (const p of parcelles) {
      const g = p.geometry;
      if (!g) continue;
      const connue = (p.proprietaires?.length || 0) > 0;
      const ici = avant.has(p.idu);
      const polys = g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : [];
      for (const anneaux of polys) {
        const poly = new window.google.maps.Polygon({
          map: m,
          paths: anneaux.map((a) => a.map(([lon, lat]) => ({ lat, lng: lon }))),
          strokeColor: ici ? JL.ambre : connue ? JL.vert : JL.ardoise,
          strokeOpacity: ici ? 1 : 0.8,
          strokeWeight: ici ? 3 : 1,
          fillColor: ici ? JL.ambre : connue ? JL.vert : JL.ardoise,
          fillOpacity: ici ? 0.45 : connue ? 0.32 : 0.22,
          clickable: interactif && connue,
          zIndex: ici ? 3 : connue ? 2 : 1,
        });
        if (interactif && connue) poly.addListener("click", () => onParcelle?.(p));
        traces.current.push(poly);
      }
      if (etiquettes && p.contenance != null) {
        const c = centreDe(g);
        if (c) {
          traces.current.push(new window.google.maps.Marker({
            map: m, position: c, clickable: false, zIndex: 5,
            icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 0 },
            label: { text: `${p.contenance} m²`, fontSize: "11px", fontWeight: "500", color: JL.fond },
          }));
        }
      }
    }
  }, [prete, parcelles, misesEnAvant, etiquettes, interactif, onParcelle]);

  return <div ref={conteneur} className="absolute inset-0" />;
}
