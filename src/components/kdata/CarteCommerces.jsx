import React, { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShoppingBasket, Utensils, Shirt, Sparkles, HeartPulse, Sofa, Gamepad2, Wrench, Landmark, Car, Building2, Hammer, Store, MapPin,
} from "lucide-react";
import { JL } from "@/design/jetons";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";

// La carte d'une prospection : la zone en cercle, et un repère par commerce,
// une pastille de couleur avec l'icône de sa famille. La couleur dit la
// famille, l'icône la redit : on lit la carte sans légende.
//
// Les pastilles sont des SVG dessinés ici et donnés à Google en data URI —
// Google ne prend pas de composant React, mais prend une image. Les couleurs
// passent par JL, la palette littérale : un SVG ne résout pas une variable CSS.

const FAMILLES = {
  Alimentaire: { icone: ShoppingBasket, couleur: JL.vert },
  Restauration: { icone: Utensils, couleur: JL.alerte },
  Mode: { icone: Shirt, couleur: JL.bleu },
  "Beauté": { icone: Sparkles, couleur: JL.ambre },
  "Santé": { icone: HeartPulse, couleur: JL.vert },
  Maison: { icone: Sofa, couleur: JL.bleu },
  Loisirs: { icone: Gamepad2, couleur: JL.ambre },
  Service: { icone: Wrench, couleur: JL.ardoise },
  Finance: { icone: Landmark, couleur: JL.ardoise },
  "Auto / Moto": { icone: Car, couleur: JL.craie },
  Immobilier: { icone: Building2, couleur: JL.menthe },
  Artisanat: { icone: Hammer, couleur: JL.craie },
};
const DEFAUT = { icone: Store, couleur: JL.menthe };

export function familleDe(categorie) { return FAMILLES[categorie] || DEFAUT; }

const pastilles = new Map();
function pastille(categorie, active) {
  const cle = `${categorie}|${active ? 1 : 0}`;
  if (pastilles.has(cle)) return pastilles.get(cle);
  const { icone: Icone, couleur } = familleDe(categorie);
  const t = active ? 22 : 17;
  const svg = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={t * 2 + 4} height={t * 2 + 4} viewBox={`0 0 ${t * 2 + 4} ${t * 2 + 4}`}>
      <circle cx={t + 2} cy={t + 2} r={t} fill={couleur} fillOpacity="0.92" stroke={JL.encre} strokeOpacity="0.9" strokeWidth={active ? 3 : 1.5} />
      <g transform={`translate(${t + 2 - t * 0.5}, ${t + 2 - t * 0.5}) scale(${t / 24})`}>
        <Icone color={JL.fond} strokeWidth={2.4} />
      </g>
    </svg>,
  );
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  pastilles.set(cle, url);
  return url;
}

export default function CarteCommerces({ point, rayon_m, commerces = [], actif = null, onCommerce, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const traces = useRef([]);
  const [prete, setPrete] = useState(false);
  const zoom = useMemo(() => (rayon_m > 1500 ? 14 : rayon_m > 700 ? 15 : 16), [rayon_m]);

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        carte.current = new window.google.maps.Map(conteneur.current, {
          center: { lat: point?.lat ?? 46.6, lng: point?.lon ?? 2.4 },
          zoom: point ? zoom : 6,
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
      traces.current.push(new window.google.maps.Circle({
        map: m, center: { lat: point.lat, lng: point.lon }, radius: rayon_m,
        strokeColor: JL.ambre, strokeOpacity: 0.9, strokeWeight: 2, fillColor: JL.ambre, fillOpacity: 0.12, clickable: false,
      }));
      traces.current.push(new window.google.maps.Marker({ map: m, position: { lat: point.lat, lng: point.lon }, title: point.label || "", zIndex: 50 }));
    }
    for (const c of commerces) {
      const estActif = actif && c.id === actif;
      const t = estActif ? 22 : 17;
      const mk = new window.google.maps.Marker({
        map: m, position: { lat: c.lat, lng: c.lon }, title: c.nom || c.metier || "",
        icon: { url: pastille(c.categorie, estActif), scaledSize: new window.google.maps.Size(t * 2 + 4, t * 2 + 4), anchor: new window.google.maps.Point(t + 2, t + 2) },
        zIndex: estActif ? 40 : 10,
      });
      mk.addListener("click", () => onCommerce?.(c));
      traces.current.push(mk);
    }
  }, [prete, point?.lat, point?.lon, rayon_m, commerces, actif, onCommerce]);

  useEffect(() => {
    const m = carte.current;
    if (!m || !actif) return;
    const c = commerces.find((x) => x.id === actif);
    if (c) m.panTo({ lat: c.lat, lng: c.lon });
  }, [prete, actif]);

  return <div ref={conteneur} className="absolute inset-0" />;
}

export { MapPin };
