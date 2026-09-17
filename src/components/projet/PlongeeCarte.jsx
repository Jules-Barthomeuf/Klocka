import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { J } from "@/design/jetons";

// Plongée « drone » du détail projet : la France vue du ciel, vol continu
// jusqu'à l'adresse, puis lente orbite autour du local.
//
// Deux moteurs, tous deux Google :
//  1. Google Maps 3D photoréaliste (Map3DElement) — le rendu Google Earth :
//     bâtiments maillés en vraie 3D. Utilisé si le projet Google Cloud a activé
//     l'API Map Tiles.
//  2. Repli : la carte satellite Google Maps, descente continue puis ronde
//     lente autour du local. Même clé que Street View, sans WebGL. La
//     descente avance à chaque image, en zoom fractionnaire : elle montait
//     autrefois d'un cran entier toutes les huit dixièmes de seconde, treize
//     fois de suite, ce qui donnait une succession de sauts au lieu d'un vol.
//     Les orthophotos IGN sous MapLibre qui tenaient ce rôle restaient noires
//     quand le navigateur n'offrait pas de WebGL.
//  En dernier recours, la vue satellite de l'API Embed, fixe.

const CLE_GOOGLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const FRANCE = { lat: 46.4, lon: 2.6 };
const ZOOM_DEPART = 6;
const ZOOM_ARRIVEE = 19;
// Le vol de la France jusqu'à la rue, puis un tour complet autour du local.
const DUREE_DESCENTE_MS = 12000;
const DUREE_TOUR_MS = 30000;

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

// Géolocalise le projet : l'adresse d'abord (API Adresse, BAN), puis les
// coordonnées enregistrées. Des coordonnées posées au centre de la commune
// envoyaient le vol à l'Hôtel de Ville au lieu du local.
// Partagé avec le Street View de la page projet (même clé de cache).
export async function geolocaliser(project) {
  const q = project.adresse_complete;
  if (q) {
    try {
      const r = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q));
      const f = r.ok ? (await r.json()).features?.[0] : null;
      const precise = f && (f.properties?.score ?? 0) >= 0.5 && ["housenumber", "street"].includes(f.properties?.type);
      if (precise) return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
    } catch {
      /* BAN injoignable : les coordonnées enregistrées prennent le relais */
    }
  }
  if (project.latitude && project.longitude) {
    return { lat: Number(project.latitude), lon: Number(project.longitude) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Chargement de l'API Google Maps (une seule fois pour toute l'application)
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

// ---------------------------------------------------------------------------
// Moteur 1 — Google Maps 3D photoréaliste (rendu Google Earth)
// ---------------------------------------------------------------------------

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
    <div className="absolute inset-0 bg-fond">
      <div ref={conteneur} className="absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Moteur 2 — carte satellite Google : descente puis ronde autour du local
// ---------------------------------------------------------------------------

function PlongeeSatellite({ cible }) {
  const conteneur = useRef(null);
  const [repli, setRepli] = useState(false);

  useEffect(() => {
    let abandonne = false;
    let ronde;
    const minuteurs = [];
    const plusTard = (fn, ms) => minuteurs.push(setTimeout(fn, ms));
    const echec = () => { if (!abandonne) setRepli(true); };
    window.gm_authFailure = echec;

    (async () => {
      try {
        if (!CLE_GOOGLE) throw new Error("clé Google Maps absente");
        await chargerGoogleMaps();
        const { Map } = await window.google.maps.importLibrary("maps");
        if (abandonne || !conteneur.current) return;

        const centre = { lat: cible.lat, lng: cible.lon };
        const carte = new Map(conteneur.current, {
          center: centre,
          zoom: ZOOM_DEPART,
          mapTypeId: "satellite",
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          clickableIcons: false,
          backgroundColor: J["fond"],
          // Sans cela, Google arrondit chaque zoom à l'entier : l'interpolation
          // ci-dessous retomberait sur les mêmes treize sauts.
          isFractionalZoomEnabled: true,
        });

        const etirement = 1 / Math.cos((cible.lat * Math.PI) / 180);

        // L'orbite : l'angle avance à chaque image, la caméra glisse sans
        // reprise. setCenter, pas panTo — panTo anime de son côté et se
        // battrait avec la boucle.
        const tourner = () => {
          if (abandonne) return;
          const rayon = 0.00035;
          const depart = performance.now();
          const tour = () => {
            if (abandonne) return;
            const angle = ((performance.now() - depart) / DUREE_TOUR_MS) * 2 * Math.PI;
            carte.setCenter({
              lat: cible.lat + rayon * Math.sin(angle),
              lng: cible.lon + rayon * etirement * Math.cos(angle),
            });
            ronde = requestAnimationFrame(tour);
          };
          ronde = requestAnimationFrame(tour);
        };

        // La descente : un vol d'un seul tenant. Le zoom avance à chaque image
        // sur une courbe qui part doucement, prend de la vitesse au-dessus du
        // département, puis freine à l'approche de la rue.
        const descendre = () => {
          if (abandonne) return;
          const depart = performance.now();
          const vol = () => {
            if (abandonne) return;
            const part = Math.min(1, (performance.now() - depart) / DUREE_DESCENTE_MS);
            // Accélère puis freine (cosinus adouci) : un avion, pas un ascenseur.
            const adouci = 0.5 - Math.cos(part * Math.PI) / 2;
            carte.setZoom(ZOOM_DEPART + (ZOOM_ARRIVEE - ZOOM_DEPART) * adouci);
            if (part < 1) requestAnimationFrame(vol);
            else tourner();
          };
          requestAnimationFrame(vol);
        };
        plusTard(descendre, 900);
      } catch (e) {
        console.warn("[plongée satellite]", e?.message || e);
        echec();
      }
    })();

    return () => {
      abandonne = true;
      minuteurs.forEach(clearTimeout);
      cancelAnimationFrame(ronde);
      delete window.gm_authFailure;
    };
  }, [cible]);

  if (repli) {
    if (!CLE_GOOGLE) {
      return (
        <div className="absolute inset-0 bg-fond flex items-center justify-center">
          <p className="text-ardoise text-sm">Carte indisponible : la clé Google Maps n'est pas configurée.</p>
        </div>
      );
    }
    return (
      <iframe
        title="Vue satellite du secteur"
        className="absolute inset-0 w-full h-full"
        style={{ border: 0 }}
        src={`https://www.google.com/maps/embed/v1/view?key=${CLE_GOOGLE}&center=${cible.lat},${cible.lon}&zoom=18&maptype=satellite`}
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-fond">
      <div ref={conteneur} className="absolute inset-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function PlongeeCarte({ project, onClose }) {
  const [repli, setRepli] = useState(false);

  const { data: cible, isError } = useQuery({
    queryKey: ["geoloc-projet", project.id, project.adresse_complete],
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
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <p className="text-ardoise text-sm">Adresse non localisable, retour à la photo.</p>
      </div>
    );
  }
  if (cible === undefined || google3D === undefined) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-menthe/30 border-t-menthe rounded-full animate-spin" />
      </div>
    );
  }

  return google3D && !repli ? (
    <PlongeeGoogle3D cible={cible} onEchec={() => setRepli(true)} />
  ) : (
    <PlongeeSatellite cible={cible} />
  );
}
