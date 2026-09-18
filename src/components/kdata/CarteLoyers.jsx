import React, { useEffect, useRef, useState } from "react";
import { JL } from "@/design/jetons";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";

// La carte des loyers : Google Maps, les IRIS de la commune colorés par leur
// classe, et un repère sur l'adresse. Quatre classes, quatre couleurs : rouge
// pour très élevée, ambre pour élevée, jaune pour moyenne, vert pour très
// faible. Le secteur de la recherche se distingue par un bord noir franc, pas
// par une couleur à part : la couleur dit la classe, partout de la même façon.
//
// Les couleurs passent par JL, la palette littérale : Google écrit ses
// polygones en SVG, où une variable CSS ne se résout pas.

export const COULEURS_NIVEAU = {
  tres_elevee: JL.alerte,
  elevee: JL.ambre,
  moyenne: JL.jaune,
  tres_faible: JL.vert,
};

export default function CarteLoyers({ point, secteurs = [], onSecteur, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const repere = useRef(null);
  const traces = useRef([]);
  // La carte arrive après le premier rendu : les effets qui dessinent dessus
  // attendent ce signal, sans quoi ils tournent à vide et ne repassent jamais.
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        carte.current = new window.google.maps.Map(conteneur.current, {
          center: { lat: point?.lat ?? 46.6, lng: point?.lon ?? 2.4 },
          zoom: point ? 13 : 6,
          mapTypeId: "roadmap",
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        });
        setPrete(true);
      })
      .catch((e) => onErreur?.(e?.message || String(e)));
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    const m = carte.current;
    if (!m || !point) return;
    m.panTo({ lat: point.lat, lng: point.lon });
    if (repere.current) repere.current.setMap(null);
    repere.current = new window.google.maps.Marker({ map: m, position: { lat: point.lat, lng: point.lon }, title: point.label || "", zIndex: 10 });
  }, [prete, point?.lat, point?.lon]);

  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    for (const t of traces.current) t.setMap(null);
    traces.current = [];
    for (const s of secteurs) {
      const g = s.geometry;
      if (!g) continue;
      const polys = g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : [];
      const couleur = COULEURS_NIVEAU[s.niveau] || null;
      for (const anneaux of polys) {
        const p = new window.google.maps.Polygon({
          map: m,
          paths: anneaux.map((a) => a.map(([lon, lat]) => ({ lat, lng: lon }))),
          strokeColor: s.ici ? JL.fond : JL.encre,
          strokeOpacity: s.ici ? 1 : 0.4,
          strokeWeight: s.ici ? 3 : 0.8,
          fillColor: couleur || JL.encre,
          fillOpacity: couleur ? (s.ici ? 0.6 : 0.38) : 0.04,
          zIndex: s.ici ? 3 : 1,
        });
        p.addListener("click", () => onSecteur?.(s));
        traces.current.push(p);
      }
    }
  }, [prete, secteurs, onSecteur]);

  return <div ref={conteneur} className="absolute inset-0" />;
}
