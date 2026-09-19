import React, { useEffect, useRef, useState } from "react";
import { JL } from "@/design/jetons";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";

// Une carte de points, sans autre ambition : un centre, un cercle de zone, et
// des pastilles de couleur. K-Vacance s'en sert pour poser les rideaux baissés
// et les fermetures ; toute page qui a des points peut la reprendre.
//
// Les couleurs passent par JL, la palette littérale : Google écrit ses cercles
// en SVG, où une variable CSS ne se résout pas.

export default function CartePoints({ point, rayon_m = 0, couches = [], onPoint, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const traces = useRef([]);
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        carte.current = new window.google.maps.Map(conteneur.current, {
          center: { lat: point?.lat ?? 46.6, lng: point?.lon ?? 2.4 },
          zoom: point ? (rayon_m > 1200 ? 14 : rayon_m > 600 ? 15 : 16) : 6,
          mapTypeId: "roadmap", disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy",
        });
        setPrete(true);
      })
      .catch((e) => onErreur?.(e?.message || String(e)));
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    for (const t of traces.current) t.setMap(null);
    traces.current = [];
    if (point) {
      m.panTo({ lat: point.lat, lng: point.lon });
      if (rayon_m) {
        traces.current.push(new window.google.maps.Circle({
          map: m, center: { lat: point.lat, lng: point.lon }, radius: rayon_m,
          strokeColor: JL.encre, strokeOpacity: 0.35, strokeWeight: 1.5, fillColor: JL.encre, fillOpacity: 0.04, clickable: false,
        }));
      }
      traces.current.push(new window.google.maps.Marker({ map: m, position: { lat: point.lat, lng: point.lon }, title: point.label || "", zIndex: 50 }));
    }
    for (const c of couches) {
      for (const p of c.points || []) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
        const cercle = new window.google.maps.Circle({
          map: m, center: { lat: p.lat, lng: p.lon }, radius: c.taille || 12,
          strokeColor: JL.encre, strokeOpacity: 0.55, strokeWeight: 1,
          fillColor: c.couleur, fillOpacity: 0.85, zIndex: c.zIndex || 10,
          clickable: !!onPoint,
        });
        if (onPoint) cercle.addListener("click", () => onPoint({ ...p, couche: c.cle }));
        traces.current.push(cercle);
      }
    }
  }, [prete, point?.lat, point?.lon, rayon_m, couches, onPoint]);

  return <div ref={conteneur} className="absolute inset-0" />;
}
