import React, { useEffect, useRef, useState } from "react";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";
import { JL } from "@/design/jetons";

// La carte des secteurs des mandataires : Google Maps, comme K-Zoning. Même
// chargeur, même clé, le rendu de Google tel quel. Un secteur s'y dessine
// comme une zone de K-Zoning : un bord noir franc, un remplissage coloré
// qui se voit d'un coup d'œil sur un plan clair.
//
// Couleurs en JL (littérales) : Google dessine en SVG, où une variable CSS
// ne se résout pas.

const CLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const centreDe = (pts) => ({ lat: pts.reduce((s, p) => s + p[0], 0) / pts.length, lng: pts.reduce((s, p) => s + p[1], 0) / pts.length });
// Un secteur peut être fait de plusieurs morceaux (une région, des communes).
const anneauxDe = (s) => (s?.polygones?.length ? s.polygones : s?.points?.length >= 3 ? [s.points] : []);
const plusGrand = (anneaux) => anneaux.reduce((a, b) => (b.length > a.length ? b : a), []);
const chemins = (anneaux) => anneaux.map((a) => a.map(([lat, lng]) => ({ lat, lng })));

/**
 * @param {Array<{id, nom, points, teinte}>} secteurs  à dessiner
 * @param {string|null} choisi   le secteur ouvert : remplissage plus franc
 * @param {boolean} trace        on pose les points d'un contour
 * @param {Array} points         le contour en cours
 * @param {string} type          roadmap | satellite | hybrid | terrain
 * @param {boolean} etiquettes   le nom du secteur au centre (non : la zone seule, côté mandataire)
 */
export default function CarteGoogleSecteurs({ secteurs = [], choisi = null, trace = false, points = [], apercu = [], villes = [], villeActive = null, type = "roadmap", etiquettes = true, onSecteur, onPoint, onVille, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const traces = useRef([]);
  const brouillon = useRef([]);
  const traceApercu = useRef([]);
  const tracesVilles = useRef([]);
  const cadre = useRef(false);
  const [pret, setPret] = useState(false);
  // Les rappels changent à chaque rendu : les écouteurs Google lisent la dernière version.
  const rappels = useRef({ trace, onPoint, onSecteur, onVille });
  rappels.current = { trace, onPoint, onSecteur, onVille };

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
        carte.current.addListener("click", (e) => {
          if (rappels.current.trace) rappels.current.onPoint?.([Number(e.latLng.lat().toFixed(5)), Number(e.latLng.lng().toFixed(5))]);
        });
        setPret(true);
      })
      .catch((e) => onErreur?.(e?.message || "Carte indisponible"));
    return () => { vivant = false; };
    // La carte ne se refait pas : le type et les tracés ont leurs propres effets.
     
  }, []);

  useEffect(() => { carte.current?.setMapTypeId(type); }, [type, pret]);
  useEffect(() => { carte.current?.setOptions({ draggableCursor: trace ? "crosshair" : null }); }, [trace, pret]);

  // Les secteurs enregistrés, et leur nom posé au centre.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of traces.current) t.setMap(null);
    traces.current = secteurs.filter((s) => anneauxDe(s).length).flatMap((s) => {
      const actif = s.id === choisi;
      const poly = new g.Polygon({
        map: carte.current,
        paths: chemins(anneauxDe(s)),
        strokeColor: JL.fond,
        strokeOpacity: 1,
        strokeWeight: actif ? 3 : 2,
        fillColor: s.teinte,
        fillOpacity: actif ? 0.38 : 0.22,
        zIndex: actif ? 20 : 10,
      });
      // Un clic sur un secteur pendant un tracé pose un point, comme ailleurs.
      poly.addListener("click", (e) => {
        if (rappels.current.trace) rappels.current.onPoint?.([Number(e.latLng.lat().toFixed(5)), Number(e.latLng.lng().toFixed(5))]);
        else rappels.current.onSecteur?.(s.id);
      });
      if (!etiquettes) return [poly];
      const etiquette = new g.Marker({
        map: carte.current,
        position: centreDe(plusGrand(anneauxDe(s))),
        clickable: false,
        zIndex: 30,
        icon: { path: g.SymbolPath.CIRCLE, scale: 0 },
        label: { text: s.nom, color: JL.fond, fontSize: "12px", fontWeight: "600" },
      });
      return [poly, etiquette];
    });
  }, [secteurs, choisi, pret, etiquettes]);

  // Le contour en cours : le trait, et ses points.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of brouillon.current) t.setMap(null);
    brouillon.current = [];
    if (!points.length) return;
    const chemin = points.map(([lat, lng]) => ({ lat, lng }));
    brouillon.current.push(
      points.length >= 3
        ? new g.Polygon({ map: carte.current, paths: chemin, strokeColor: JL.fond, strokeWeight: 2.5, fillColor: JL.vert, fillOpacity: 0.3, zIndex: 40, clickable: false })
        : new g.Polyline({ map: carte.current, path: chemin, strokeColor: JL.fond, strokeWeight: 2.5, zIndex: 40, clickable: false })
    );
    points.forEach(([lat, lng], i) => {
      brouillon.current.push(new g.Marker({
        map: carte.current, position: { lat, lng }, clickable: false, zIndex: 50,
        icon: { path: g.SymbolPath.CIRCLE, scale: i === 0 ? 7 : 5, fillColor: JL.fond, fillOpacity: 1, strokeColor: JL.encre, strokeWeight: 2 },
      }));
    });
  }, [points, pret]);

  // Les villes où la recherche sait chercher : un point qui se touche, son nom dessous.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of tracesVilles.current) t.setMap(null);
    tracesVilles.current = villes.filter((v) => v.centre?.lat != null).map((v) => {
      const actif = v.nom === villeActive;
      const m = new g.Marker({
        map: carte.current,
        position: { lat: v.centre.lat, lng: v.centre.lon },
        title: v.nom,
        zIndex: actif ? 70 : 60,
        icon: { path: g.SymbolPath.CIRCLE, scale: actif ? 9 : 7, fillColor: actif ? JL.vert : JL.encre, fillOpacity: 1, strokeColor: JL.fond, strokeWeight: 2.5, labelOrigin: new g.Point(0, 3.2) },
        label: { text: v.nom, color: JL.fond, fontSize: "12px", fontWeight: actif ? "700" : "600" },
      });
      m.addListener("click", () => rappels.current.onVille?.(v));
      return m;
    });
  }, [villes, villeActive, pret]);

  // L'aperçu des communes, départements ou régions choisis, avant l'enregistrement.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of traceApercu.current) t.setMap(null);
    traceApercu.current = [];
    if (!apercu.length) return;
    traceApercu.current.push(new g.Polygon({ map: carte.current, paths: chemins(apercu), strokeColor: JL.fond, strokeWeight: 2.5, fillColor: JL.vert, fillOpacity: 0.3, zIndex: 35, clickable: false }));
    const bornes = new g.LatLngBounds();
    for (const a of apercu) for (const [lat, lng] of a) bornes.extend({ lat, lng });
    carte.current.fitBounds(bornes, { top: 60, bottom: 60, left: 360, right: 400 });
  }, [apercu, pret]);

  // Le cadrage : une fois, sur l'ensemble des secteurs. Monté dans un bloc
  // caché (onglet, section repliée), le conteneur n'a pas de taille et
  // fitBounds n'aurait rien à cadrer : on attend qu'il en ait une.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current || cadre.current) return undefined;
    const tous = secteurs.flatMap((s) => anneauxDe(s).flat());
    if (tous.length < 3) return undefined;
    const cadrer = () => {
      if (cadre.current || !conteneur.current?.offsetWidth) return;
      const bornes = new g.LatLngBounds();
      for (const [lat, lng] of tous) bornes.extend({ lat, lng });
      carte.current.fitBounds(bornes, 60);
      cadre.current = true;
    };
    cadrer();
    if (cadre.current || typeof ResizeObserver === "undefined") return undefined;
    const guetteur = new ResizeObserver(() => { cadrer(); if (cadre.current) guetteur.disconnect(); });
    guetteur.observe(conteneur.current);
    return () => guetteur.disconnect();
  }, [secteurs, pret]);

  // Le secteur ouvert vient au centre.
  useEffect(() => {
    const g = window.google?.maps;
    const s = secteurs.find((x) => x.id === choisi);
    if (!g || !carte.current || !anneauxDe(s).length) return;
    const bornes = new g.LatLngBounds();
    for (const [lat, lng] of anneauxDe(s).flat()) bornes.extend({ lat, lng });
    carte.current.fitBounds(bornes, { top: 80, bottom: 80, left: 380, right: 420 });
    // Le cadrage suit le choix, pas chaque relecture de la liste.
     
  }, [choisi, pret]);

  useEffect(() => () => {
    for (const lot of [traces, brouillon, traceApercu, tracesVilles]) {
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
