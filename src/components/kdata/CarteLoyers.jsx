import React, { useEffect, useRef, useState } from "react";
import { JL } from "@/design/jetons";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";

// La carte des loyers : Google Maps, les IRIS de la commune colorés par leur
// fourchette, et un repère sur l'adresse. Le secteur de la recherche se
// distingue par un bord noir franc, pas par une couleur à part : la couleur
// dit le niveau de loyer, et elle doit le dire partout de la même façon.
//
// Les couleurs passent par JL, la palette littérale : Google écrit ses
// polygones en SVG, où une variable CSS ne se résout pas.

const versRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const melanger = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c.join(",")})`;

const BAS = versRgb(JL.vert);
const MILIEU = versRgb(JL.ambre);
const HAUT = versRgb(JL.alerte);

/** Du vert (loyers bas) à l'ambre puis au rouge (loyers hauts). */
export function couleurDe(t) {
  if (t == null) return null;
  return t < 0.5 ? rgb(melanger(BAS, MILIEU, t * 2)) : rgb(melanger(MILIEU, HAUT, (t - 0.5) * 2));
}

/** La position de chaque secteur sur l'échelle, d'après le milieu de sa fourchette. */
export function echelle(secteurs) {
  const milieux = secteurs.filter((s) => s.basse != null || s.haute != null).map((s) => ((s.basse ?? s.haute) + (s.haute ?? s.basse)) / 2);
  if (!milieux.length) return { min: null, max: null, position: () => null };
  const min = Math.min(...milieux), max = Math.max(...milieux);
  return {
    min, max,
    position: (s) => {
      if (s.basse == null && s.haute == null) return null;
      const m = ((s.basse ?? s.haute) + (s.haute ?? s.basse)) / 2;
      return max === min ? 0.5 : (m - min) / (max - min);
    },
  };
}

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
          zoom: point ? 14 : 6,
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

  // Le repère et le cadrage suivent l'adresse.
  useEffect(() => {
    const m = carte.current;
    if (!m || !point) return;
    m.panTo({ lat: point.lat, lng: point.lon });
    if (repere.current) repere.current.setMap(null);
    repere.current = new window.google.maps.Marker({ map: m, position: { lat: point.lat, lng: point.lon }, title: point.label || "" });
  }, [prete, point?.lat, point?.lon]);

  // Les secteurs : un polygone par IRIS, coloré par sa place sur l'échelle.
  useEffect(() => {
    const m = carte.current;
    if (!m) return;
    for (const t of traces.current) t.setMap(null);
    traces.current = [];
    const e = echelle(secteurs);
    for (const s of secteurs) {
      const g = s.geometry;
      if (!g) continue;
      const polys = g.type === "MultiPolygon" ? g.coordinates : g.type === "Polygon" ? [g.coordinates] : [];
      const couleur = couleurDe(e.position(s));
      for (const anneaux of polys) {
        const chemins = anneaux.map((a) => a.map(([lon, lat]) => ({ lat, lng: lon })));
        const p = new window.google.maps.Polygon({
          map: m, paths: chemins,
          strokeColor: s.ici ? JL.fond : JL.encre,
          strokeOpacity: s.ici ? 1 : 0.35,
          strokeWeight: s.ici ? 3 : 0.8,
          fillColor: couleur || JL.encre,
          fillOpacity: couleur ? (s.ici ? 0.55 : 0.3) : 0.04,
          zIndex: s.ici ? 3 : 1,
        });
        p.addListener("click", () => onSecteur?.(s));
        traces.current.push(p);
      }
    }
  }, [prete, secteurs, onSecteur]);

  return <div ref={conteneur} className="absolute inset-0" />;
}
