import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Map as CarteGL, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre analyse ses tuiles dans un Web Worker dont il déduit l'URL de
// import.meta.url — cassé une fois le code inliné par le bundler. On fait
// donc empaqueter le worker par Vite et on impose son URL.
import urlWorkerMapLibre from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(urlWorkerMapLibre);

// Plongée « drone » du détail projet : la France vue du ciel, vol continu
// jusqu'à l'adresse, puis lente orbite autour du local.
//
// Deux moteurs :
//  1. Google Maps 3D photoréaliste (Map3DElement) — le rendu Google Earth :
//     bâtiments maillés en vraie 3D. Utilisé si VITE_GOOGLE_MAPS_API_KEY est
//     renseignée et que le projet Google Cloud a activé les cartes 3D.
//  2. Repli MapLibre GL : orthophotos IGN en orbite inclinée, sans clé.
//     Bascule automatique si la clé manque ou est refusée.

const CLE_GOOGLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const FRANCE = { lat: 46.4, lon: 2.6 };

// La 3D photoréaliste exige une clé avec facturation et l'API Map Tiles
// activées. Une requête à la racine des tuiles 3D le dit tout de suite —
// bien avant que le viewer Google n'affiche son panneau d'erreur.
// 403 = accès refusé (API coupée ou facturation absente). Le 404, lui,
// signifie que la barrière est passée — cette racine répond parfois 404
// alors que le viewer Maps JS fonctionne ; les chiens de garde du viewer
// couvrent le reste.
async function google3DDisponible() {
  if (!CLE_GOOGLE) return false;
  try {
    const r = await fetch(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${CLE_GOOGLE}`);
    return r.ok || r.status === 404;
  } catch {
    return false;
  }
}

// Géolocalise le projet : coordonnées enregistrées, sinon API Adresse (BAN).
// Partagé avec le Street View de la page projet (même clé de cache).
export async function geolocaliser(project) {
  if (project.latitude && project.longitude) {
    return { lat: Number(project.latitude), lon: Number(project.longitude) };
  }
  const q = project.adresse_complete;
  if (!q) return null;
  const r = await fetch(
    "https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q)
  );
  if (!r.ok) return null;
  const f = (await r.json()).features?.[0];
  if (!f || (f.properties?.score ?? 0) < 0.3) return null;
  return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
}

// ---------------------------------------------------------------------------
// Moteur 1 — Google Maps 3D photoréaliste (rendu Google Earth)
// ---------------------------------------------------------------------------

let chargementGoogle = null;
function chargerGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (!chargementGoogle) {
    chargementGoogle = new Promise((resoudre, rejeter) => {
      window.__klockaMapsPrete = () => resoudre();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${CLE_GOOGLE}&v=beta&libraries=maps3d&loading=async&callback=__klockaMapsPrete`;
      s.async = true;
      s.onerror = () => rejeter(new Error("script Google Maps inaccessible"));
      document.head.appendChild(s);
    });
    chargementGoogle.catch(() => { chargementGoogle = null; });
  }
  return chargementGoogle;
}

function PlongeeGoogle3D({ cible, onEchec }) {
  const conteneur = useRef(null);

  useEffect(() => {
    let carte;
    let abandonne = false;
    let watchdog;
    let watchdog2;

    // Clé invalide ou API non activée : Google appelle ce crochet global.
    window.gm_authFailure = () => { if (!abandonne) onEchec(); };

    (async () => {
      try {
        await chargerGoogleMaps();
        const { Map3DElement, MapMode } = await window.google.maps.importLibrary("maps3d");
        if (abandonne || !conteneur.current) return;

        carte = new Map3DElement({
          center: { lat: FRANCE.lat, lng: FRANCE.lon, altitude: 0 },
          range: 2_400_000, // toute la France
          tilt: 0,
          heading: 0,
          mode: MapMode.SATELLITE,
        });
        carte.defaultUIDisabled = true; // pas de boussole ni de zoom : cinématique
        carte.style.width = "100%";
        carte.style.height = "100%";
        conteneur.current.appendChild(carte);

        const camera = {
          center: { lat: cible.lat, lng: cible.lon, altitude: 0 },
          tilt: 66,
          range: 340,
        };

        // Si rien ne bouge dans les 12 s (3D refusée, réseau...), on replie.
        let aBouge = false;
        carte.addEventListener("gmp-centerchange", () => { aBouge = true; });
        watchdog = setTimeout(() => { if (!aBouge && !abandonne) onEchec(); }, 12000);

        // Une seconde posée sur la France, puis le vol, puis l'orbite sans fin.
        setTimeout(() => {
          if (abandonne) return;
          carte.flyCameraTo({
            endCamera: { ...camera, heading: -25 },
            durationMillis: 14000,
          });
          let volTermine = false;
          carte.addEventListener("gmp-animationend", function orbite() {
            if (abandonne) return;
            volTermine = true;
            carte.flyCameraAround({ camera, durationMillis: 90000, rounds: 2 });
            // gmp-animationend refire à la fin de chaque tour : on enchaîne.
          });
          // Second filet : si le vol n'aboutit jamais, on replie.
          watchdog2 = setTimeout(() => { if (!volTermine && !abandonne) onEchec(); }, 22000);
        }, 1100);
      } catch (e) {
        console.warn("[plongée 3D]", e?.message || e);
        if (!abandonne) onEchec();
      }
    })();

    return () => {
      abandonne = true;
      clearTimeout(watchdog);
      clearTimeout(watchdog2);
      delete window.gm_authFailure;
      if (carte) carte.remove();
    };
  }, [cible, onEchec]);

  return (
    <div className="absolute inset-0 bg-[#04070a]">
      <div ref={conteneur} className="absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Moteur 2 — repli MapLibre : orthophotos IGN, orbite inclinée, sans clé.
// ---------------------------------------------------------------------------

const STYLE_ORTHO = {
  version: 8,
  sources: {
    ortho: {
      type: "raster",
      tiles: [
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
          "&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg" +
          "&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© IGN",
    },
  },
  layers: [
    { id: "fond", type: "background", paint: { "background-color": "#0a0c0c" } },
    { id: "ortho", type: "raster", source: "ortho" },
  ],
};

function PlongeeMapLibre({ cible }) {
  const conteneur = useRef(null);
  const [erreurCarte, setErreurCarte] = useState(false);

  useEffect(() => {
    if (!conteneur.current) return;
    let map;
    let raf;
    try {
      map = new CarteGL({
        container: conteneur.current,
        style: STYLE_ORTHO,
        center: [FRANCE.lon, FRANCE.lat],
        zoom: 5.1,
        pitch: 0,
        bearing: 0,
        interactive: false,
        attributionControl: { compact: true },
        fadeDuration: 300,
        maxPitch: 72,
      });
    } catch {
      setErreurCarte(true); // WebGL indisponible
      return;
    }

    map.on("load", () => {
      setTimeout(() => {
        map.flyTo({
          center: [cible.lon, cible.lat],
          zoom: 17.4,
          pitch: 63,
          bearing: -25,
          duration: 15000,
          curve: 1.4,
          essential: true,
        });
        map.once("moveend", () => {
          const tourner = () => {
            map.setBearing(map.getBearing() + 0.05);
            raf = requestAnimationFrame(tourner);
          };
          tourner();
        });
      }, 900);
    });
    map.on("error", () => {
      /* tuile manquante ou source lente : MapLibre continue sans casser */
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      map.remove();
    };
  }, [cible]);

  if (erreurCarte) {
    return (
      <div className="absolute inset-0 bg-[#0a0c0c] flex items-center justify-center">
        <p className="text-[#8b9391] text-sm">Affichage 3D indisponible sur cet appareil.</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-[#04070a]">
      <div ref={conteneur} className="absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function PlongeeCarte({ project, onClose }) {
  const [repli, setRepli] = useState(false);

  const { data: cible, isError } = useQuery({
    queryKey: ["geoloc-projet", project.id],
    queryFn: () => geolocaliser(project),
    staleTime: Infinity,
  });

  const { data: google3D } = useQuery({
    queryKey: ["google-3d-disponible"],
    queryFn: google3DDisponible,
    staleTime: Infinity,
  });

  // Adresse introuvable : on prévient, puis on referme.
  useEffect(() => {
    if (cible === null || isError) {
      const t = setTimeout(onClose, 2200);
      return () => clearTimeout(t);
    }
  }, [cible, isError, onClose]);

  if (cible === null || isError) {
    return (
      <div className="absolute inset-0 bg-[#0a0c0c] flex items-center justify-center">
        <p className="text-[#8b9391] text-sm">Adresse non localisable — retour à la photo.</p>
      </div>
    );
  }
  if (cible === undefined || google3D === undefined) {
    return (
      <div className="absolute inset-0 bg-[#0a0c0c] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-[#35a79b]/30 border-t-[#35a79b] rounded-full animate-spin" />
      </div>
    );
  }

  return google3D && !repli ? (
    <PlongeeGoogle3D cible={cible} onEchec={() => setRepli(true)} />
  ) : (
    <PlongeeMapLibre cible={cible} />
  );
}
