import React, { useEffect, useRef, useState } from "react";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";
import { JL } from "@/design/jetons";
import jetons from "@/design/jetons.json";

// La pervenche des jetons, littérale : Google dessine en SVG (le point « vous êtes ici », 24 oct. 2026).
const PERVENCHE = jetons.accents.pervenche.sombre;

// La carte des secteurs des mandataires : Google Maps, comme K-Zoning. Même
// chargeur, même clé, le rendu de Google tel quel. Un secteur s'y dessine
// comme une zone de K-Zoning : un bord noir franc, un remplissage coloré
// qui se voit d'un coup d'œil sur un plan clair.
//
// Couleurs en JL (littérales) : Google dessine en SVG, où une variable CSS
// ne se résout pas.
//
// Chaque secteur a sa couleur et son motif (9 oct. 2026, demande de Jules) :
// le premier en hachures, les suivants en points, quadrillage, croisillons…
// et aucun nom posé sur la carte. Google ne remplit pas un polygone d'un
// motif : les motifs se dessinent dans une couche SVG (OverlayView) posée sur
// la carte ; les polygones de Google gardent le contour et le clic.

const CLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
// Un secteur peut être fait de plusieurs morceaux (une région, des communes).
const anneauxDe = (s) => (s?.polygones?.length ? s.polygones : s?.points?.length >= 3 ? [s.points] : []);
const chemins = (anneaux) => anneaux.map((a) => a.map(([lat, lng]) => ({ lat, lng })));

/** Les motifs, un par secteur dans l'ordre : le contenu d'une tuile de 10 px, dans la couleur c. */
export const MOTIFS = [
  (c) => `<path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="${c}" stroke-width="2.1"/>`,
  (c) => `<circle cx="5" cy="5" r="2" fill="${c}"/>`,
  (c) => `<path d="M0,0.5 H10 M0.5,0 V10" stroke="${c}" stroke-width="1.5"/>`,
  (c) => `<path d="M-1,9 l2,2 M0,0 l10,10 M9,-1 l2,2" stroke="${c}" stroke-width="2.1"/>`,
  (c) => `<path d="M0,0 l10,10 M10,0 l-10,10" stroke="${c}" stroke-width="1.5"/>`,
  (c) => `<path d="M0,5 H10" stroke="${c}" stroke-width="2.2"/>`,
  (c) => `<path d="M5,0 V10" stroke="${c}" stroke-width="2.2"/>`,
  (c) => `<circle cx="5" cy="5" r="2.6" fill="none" stroke="${c}" stroke-width="1.5"/>`,
];
const motifDe = (i) => MOTIFS[((Number(i) || 0) % MOTIFS.length + MOTIFS.length) % MOTIFS.length];
const tuile = (id, c, motif, fond) => `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${c}" fill-opacity="${fond}"/>${motifDe(motif)(c)}</pattern>`;

/** La pastille d'un secteur dans une liste : sa couleur et son motif, comme sur la carte. */
export function MotifSecteur({ teinte, motif = 0, taille = 16, className = "" }) {
  const id = `pastille-${motif}-${String(teinte).replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={taille} height={taille} className={`flex-none rounded-[4px] ${className}`} aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<defs>${tuile(id, teinte, motif, 0.16)}</defs><rect width="100%" height="100%" fill="url(#${id})"/>` }} />
  );
}

/** La couche des motifs : un SVG dans le calque de la carte, redessiné à chaque zoom ou déplacement. */
function creerCalque(g) {
  class Calque extends g.OverlayView {
    constructor() {
      super();
      this.formes = [];
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      Object.assign(this.svg.style, { position: "absolute", left: "0", top: "0", width: "1px", height: "1px", overflow: "visible", pointerEvents: "none" });
    }
    onAdd() { this.getPanes().overlayLayer.appendChild(this.svg); }
    onRemove() { this.svg.remove(); }
    poser(formes) { this.formes = formes; this.draw(); }
    draw() {
      const p = this.getProjection();
      if (!p) return;
      const px = ([lat, lng]) => { const q = p.fromLatLngToDivPixel(new g.LatLng(lat, lng)); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; };
      const defs = [];
      const chemins = [];
      this.formes.forEach((f, i) => {
        const id = `motif-secteur-${i}`;
        defs.push(tuile(id, f.teinte, f.motif, f.actif ? 0.22 : 0.1));
        const d = f.anneaux.map((a) => `M${a.map(px).join("L")}Z`).join("");
        chemins.push(`<path d="${d}" fill="url(#${id})" fill-rule="evenodd" opacity="${f.actif ? 1 : 0.9}"/>`);
      });
      this.svg.innerHTML = `<defs>${defs.join("")}</defs>${chemins.join("")}`;
    }
  }
  return new Calque();
}

/**
 * @param {Array<{id, nom, points, teinte, motif}>} secteurs  à dessiner (motif : son rang dans MOTIFS)
 * @param {string|null} choisi   le secteur ouvert : remplissage plus franc
 * @param {boolean} trace        on pose les points d'un contour
 * @param {Array} points         le contour en cours
 * @param {string} type          roadmap | satellite | hybrid | terrain
 */
/**
 * @param marqueurs  des points posés sur la carte ({ id, lat, lon, couleur?, titre? }) : les murs d'un client dans la
 *                   Prospection du mandataire (24 oct. 2026). La carte les cadre quand ils changent.
 */
export default function CarteGoogleSecteurs({ secteurs = [], choisi = null, trace = false, points = [], apercu = [], villes = [], villeActive = null, type = "roadmap", marqueurs = [], marqueurActif = null, contourSeul = false, moi = null, suivreMoi = false, margesChoisi = { top: 80, bottom: 80, left: 380, right: 420 }, onMarqueur, onSecteur, onPoint, onVille, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const traces = useRef([]);
  const calque = useRef(null);
  const brouillon = useRef([]);
  const traceApercu = useRef([]);
  const tracesVilles = useRef([]);
  const tracesMarqueurs = useRef([]);
  const tracesMoi = useRef([]);
  const cadre = useRef(false);
  const [pret, setPret] = useState(false);
  // Les rappels changent à chaque rendu : les écouteurs Google lisent la dernière version.
  const rappels = useRef({ trace, onPoint, onSecteur, onVille, onMarqueur });
  rappels.current = { trace, onPoint, onSecteur, onVille, onMarqueur };

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
        calque.current = creerCalque(g);
        calque.current.setMap(carte.current);
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

  // Les secteurs enregistrés : le contour et le clic par Google, le motif dans la couche SVG.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of traces.current) t.setMap(null);
    const dessines = secteurs.filter((s) => anneauxDe(s).length);
    // `contourSeul` (Prospecter pour un client, 24 oct. 2026) : plus de motif dans le secteur, seulement ses limites.
    calque.current?.poser(contourSeul ? [] : dessines.map((s) => ({ anneaux: anneauxDe(s), teinte: s.teinte, motif: s.motif ?? 0, actif: s.id === choisi })));
    traces.current = dessines.map((s) => {
      const actif = s.id === choisi;
      const poly = new g.Polygon({
        map: carte.current,
        paths: chemins(anneauxDe(s)),
        // Pendant une prospection, la limite du secteur en noir (24 oct. 2026, Jules) : le jeton le plus sombre.
        strokeColor: JL.fond,
        strokeOpacity: 1,
        strokeWeight: contourSeul ? 2.5 : actif ? 3 : 2,
        // Presque transparent : le motif est dessous, le polygone ne garde que le clic.
        fillColor: s.teinte,
        fillOpacity: 0.01,
        zIndex: actif ? 20 : 10,
      });
      // Un clic sur un secteur pendant un tracé pose un point, comme ailleurs.
      poly.addListener("click", (e) => {
        if (rappels.current.trace) rappels.current.onPoint?.([Number(e.latLng.lat().toFixed(5)), Number(e.latLng.lng().toFixed(5))]);
        else rappels.current.onSecteur?.(s.id);
      });
      return poly;
    });
  }, [secteurs, choisi, contourSeul, pret]);

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

  // Les marqueurs (les murs d'un client) : un rond cerclé de blanc, plus gros quand il est ouvert ; la carte les cadre.
  const cleMarqueurs = marqueurs.map((m) => m.id).join("|");
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of tracesMarqueurs.current) t.setMap(null);
    tracesMarqueurs.current = marqueurs.filter((m) => m.lat != null && m.lon != null).map((m) => {
      const actif = m.id === marqueurActif;
      const mk = new g.Marker({
        map: carte.current, position: { lat: m.lat, lng: m.lon }, title: m.titre || "", zIndex: actif ? 90 : 80,
        icon: { path: g.SymbolPath.CIRCLE, scale: actif ? 10 : 7.5, fillColor: m.couleur || JL.menthe, fillOpacity: 1, strokeColor: JL.fond, strokeWeight: 2.5 },
      });
      mk.addListener("click", () => rappels.current.onMarqueur?.(m.id));
      return mk;
    });
  }, [cleMarqueurs, marqueurActif, pret]);
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current || !marqueurs.length) return;
    const bornes = new g.LatLngBounds();
    for (const m of marqueurs) if (m.lat != null) bornes.extend({ lat: m.lat, lng: m.lon });
    // Une marge à la mesure de la carte : une vignette de 150 px n'en supporte pas 70.
    carte.current.fitBounds(bornes, Math.min(70, Math.round((conteneur.current?.offsetWidth || 400) / 8)));
    if (marqueurs.length === 1) carte.current.setZoom(15);
    // Le cadrage suit le jeu de points, pas chaque rendu.
  }, [cleMarqueurs, pret]);

  // Où je suis (`moi` : { lat, lon, precision }), en temps réel : un point bleu cerclé, et sa marge d'erreur ; la carte
  // le suit quand `suivreMoi` (la liste en grand écran, 24 oct. 2026).
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const t of tracesMoi.current) t.setMap(null);
    tracesMoi.current = [];
    if (!moi || moi.lat == null) return;
    const centre = { lat: moi.lat, lng: moi.lon };
    if (moi.precision) tracesMoi.current.push(new g.Circle({ map: carte.current, center: centre, radius: moi.precision, strokeOpacity: 0, fillColor: PERVENCHE, fillOpacity: 0.15, clickable: false, zIndex: 95 }));
    tracesMoi.current.push(new g.Marker({ map: carte.current, position: centre, clickable: false, zIndex: 100, title: "Vous êtes ici",
      icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: PERVENCHE, fillOpacity: 1, strokeColor: JL.encre, strokeWeight: 3 } }));
    if (suivreMoi) carte.current.panTo(centre);
  }, [moi?.lat, moi?.lon, moi?.precision, suivreMoi, pret]);

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
    // Les marges laissent la place aux panneaux posés sur la carte (l'admin en a deux).
    carte.current.fitBounds(bornes, margesChoisi);
    // Le cadrage suit le choix, pas chaque relecture de la liste.
     
  }, [choisi, pret]);

  useEffect(() => () => {
    for (const lot of [traces, brouillon, traceApercu, tracesVilles, tracesMarqueurs, tracesMoi]) {
      for (const t of lot.current) t.setMap(null);
      lot.current = [];
    }
    calque.current?.setMap(null);
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
