import React, { useEffect, useMemo, useRef } from "react";
import { JL } from "@/design/jetons";

// La carte de K-Zoning : Google Maps, pas Leaflet.
//
// Jules a demandé « la carte comme sur Google Maps ». On ne l'imite donc pas
// avec des tuiles d'un autre fournisseur : on prend Google, dont la clé et le
// chargeur vivent déjà dans l'application (composant des cessions). Sans style
// personnalisé : le rendu voulu est précisément celui de Google, tel quel.
//
// Les couleurs des tracés passent par JL, la palette littérale : Google écrit
// ses cercles en SVG, où une variable CSS ne se résout pas.

const CLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/** Les fonds proposés : ceux de Google, pas d'un autre moteur. */
export const TYPES_CARTE = [
  { cle: "roadmap", nom: "Plan" },
  { cle: "satellite", nom: "Satellite" },
  { cle: "hybrid", nom: "Hybride" },
  { cle: "terrain", nom: "Relief" },
];

let chargement = null;
export function chargerGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!CLE) return Promise.reject(new Error("clé Google Maps absente"));
  if (!chargement) {
    chargement = new Promise((resoudre, rejeter) => {
      window.__klockaZonesPret = () => resoudre();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${CLE}&loading=async&callback=__klockaZonesPret`;
      s.async = true;
      s.onerror = () => rejeter(new Error("script Google Maps inaccessible"));
      document.head.appendChild(s);
    });
    chargement.catch(() => { chargement = null; });
  }
  return chargement;
}

// Le cercle d'une zone : un bord noir franc, un vert nourri à l'intérieur.
// C'est ce qui fait qu'une zone se voit d'un coup d'œil sur un plan clair.
const TRAIT_ZONE = { strokeColor: JL.fond, strokeOpacity: 1, strokeWeight: 2.5, fillColor: JL.vert };
const REMPLISSAGE_OUVERTE = 0.38;
const REMPLISSAGE_FERMEE = 0.22;

// Le point d'un commerce, assez gros pour se cliquer sans viser.
const RAYON_COMMERCE = 7;

const zoomPourRayon = (m) => (m > 4000 ? 12 : m > 2000 ? 13 : m > 800 ? 14 : m > 400 ? 15 : 16);

/**
 * @param {Array} zones            les zones à dessiner
 * @param {object|null} zoneOuverte celle qu'on regarde : remplissage plus franc
 * @param {object|null} apercu     {lat, lon, rayon_m} avant validation
 * @param {Array} commerces        les points relevés
 * @param {string} type            roadmap | satellite | hybrid | terrain
 */
export default function CarteGoogleZones({
  zones = [], zoneOuverte = null, apercu = null, commerces = [], type = "roadmap",
  onZone, onCommerce, onErreur,
}) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const tracesZones = useRef([]);
  const tracesApercu = useRef([]);
  const tracesCommerces = useRef([]);

  const cadre = useMemo(() => {
    if (apercu) return { centre: { lat: apercu.lat, lng: apercu.lon }, rayon: apercu.rayon_m };
    if (zoneOuverte) return { centre: { lat: Number(zoneOuverte.centre_lat), lng: Number(zoneOuverte.centre_lon) }, rayon: Number(zoneOuverte.rayon_m) };
    return null;
  }, [apercu, zoneOuverte]);

  // La carte, une fois.
  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        const g = window.google.maps;
        carte.current = new g.Map(conteneur.current, {
          center: { lat: 46.6, lng: 2.4 },
          zoom: 6,
          mapTypeId: type,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
      })
      .catch((e) => onErreur?.(e?.message || "Carte indisponible"));
    return () => { vivant = false; };
  }, []);

  useEffect(() => { carte.current?.setMapTypeId(type); }, [type]);

  // Les zones enregistrées.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of tracesZones.current) t.setMap(null);
    tracesZones.current = zones.map((z) => {
      const cercle = new g.Circle({
        ...TRAIT_ZONE,
        fillOpacity: zoneOuverte?.id === z.id ? REMPLISSAGE_OUVERTE : REMPLISSAGE_FERMEE,
        map: carte.current,
        center: { lat: Number(z.centre_lat), lng: Number(z.centre_lon) },
        radius: Number(z.rayon_m),
        zIndex: 10,
      });
      cercle.addListener("click", () => onZone?.(z));
      const point = new g.Marker({
        position: { lat: Number(z.centre_lat), lng: Number(z.centre_lon) },
        map: carte.current,
        zIndex: 20,
        icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: JL.fond, fillOpacity: 1, strokeColor: JL.encre, strokeWeight: 2 },
      });
      point.addListener("click", () => onZone?.(z));
      return { setMap: (v) => { cercle.setMap(v); point.setMap(v); } };
    });
  }, [zones, zoneOuverte]);

  // L'aperçu, avant que la zone existe.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of tracesApercu.current) t.setMap(null);
    tracesApercu.current = [];
    if (!apercu) return;
    const centre = { lat: apercu.lat, lng: apercu.lon };
    tracesApercu.current = [
      new g.Circle({ ...TRAIT_ZONE, fillOpacity: REMPLISSAGE_OUVERTE, map: carte.current, center: centre, radius: apercu.rayon_m, zIndex: 30 }),
      new g.Marker({
        position: centre, map: carte.current, zIndex: 40,
        icon: { path: g.SymbolPath.CIRCLE, scale: 6, fillColor: JL.fond, fillOpacity: 1, strokeColor: JL.encre, strokeWeight: 2 },
      }),
    ];
  }, [apercu]);

  // Les commerces relevés.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of tracesCommerces.current) t.setMap(null);
    tracesCommerces.current = commerces.map((c) => {
      const teinte = c.vacant ? JL.ambre : JL.alerte;
      const repere = new g.Marker({
        position: { lat: c.lat, lng: c.lon },
        map: carte.current,
        title: c.nom || (c.vacant ? "Local vacant" : "Sans nom"),
        zIndex: 50,
        icon: { path: g.SymbolPath.CIRCLE, scale: RAYON_COMMERCE, fillColor: teinte, fillOpacity: 0.95, strokeColor: JL.fond, strokeWeight: 1.5 },
      });
      repere.addListener("click", () => onCommerce?.(c));
      return repere;
    });
  }, [commerces]);

  // Le cadrage suit la zone regardée.
  useEffect(() => {
    if (!carte.current || !cadre) return;
    carte.current.setCenter(cadre.centre);
    carte.current.setZoom(zoomPourRayon(cadre.rayon));
  }, [cadre?.centre?.lat, cadre?.centre?.lng, cadre?.rayon]);

  useEffect(() => () => {
    for (const lot of [tracesZones, tracesApercu, tracesCommerces]) {
      for (const t of lot.current) t.setMap(null);
      lot.current = [];
    }
  }, []);

  if (!CLE) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-[12.5px] text-ardoise">
        Carte indisponible : renseignez VITE_GOOGLE_MAPS_API_KEY dans .env.
      </div>
    );
  }
  return <div ref={conteneur} className="h-full w-full" />;
}