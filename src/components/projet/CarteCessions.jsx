import React, { useEffect, useMemo, useRef, useState } from "react";

// La carte du projet, avec les cessions de fonds de commerce posées dessus.
//
// Data-B donne le point exact de chaque cession : on les montre autour du bien
// plutôt qu'en liste. La taille de la pastille dit le prix, sa couleur dit ce
// qui touche le bien — la rue en or, le numéro même en menthe. On lit d'un coup
// d'œil si la rue vit, et à quel niveau de prix.
//
// Carte Google : c'est le fond que l'équipe a sous les yeux chez Data-B, et la
// clé est déjà celle de l'application.

const CLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const MENTHE = "#96c0b8";
const OR = "#d9b46a";
const GRIS = "#8d918f";

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Le rayon suit le prix, en racine : un fonds dix fois plus cher n'occupe pas
// dix fois la place, sinon la carte n'est plus lisible.
function rayonDe(prix, median) {
  if (!prix || !median) return 6;
  return Math.max(4, Math.min(18, 7 * Math.sqrt(prix / median)));
}

// Le fond sombre, pour ne pas trouer la page.
const STYLE_SOMBRE = [
  { elementType: "geometry", stylers: [{ color: "#1d2126" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#12151a" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8d918f" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2b3038" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa0a6" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a414b" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1418" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3a414b" }] },
];

let chargement = null;
function chargerGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!CLE) return Promise.reject(new Error("clé Google Maps absente"));
  if (!chargement) {
    chargement = new Promise((resoudre, rejeter) => {
      window.__klockaCarteCessionsPrete = () => resoudre();
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${CLE}&loading=async&callback=__klockaCarteCessionsPrete`;
      s.async = true;
      s.onerror = () => rejeter(new Error("script Google Maps inaccessible"));
      document.head.appendChild(s);
    });
    chargement.catch(() => { chargement = null; });
  }
  return chargement;
}

// `resultat` est ce que Data-B a rendu : il vit sur un lot pendant l'analyse,
// puis sur le projet. La carte se moque de savoir lequel des deux l'appelle.
export default function CarteCessions({ resultat: t, titre, adresse, lat, lon, hauteur = 420 }) {
  const [filtre, setFiltre] = useState("toutes");
  const [erreur, setErreur] = useState(null);
  const conteneur = useRef(null);
  const carte = useRef(null);
  const reperes = useRef([]);
  const bulle = useRef(null);

  const centre = useMemo(() => {
    const y = Number(t?.lat ?? lat);
    const x = Number(t?.lon ?? lon);
    return Number.isFinite(y) && Number.isFinite(x) ? { lat: y, lng: x } : null;
  }, [t, lat, lon]);

  const cessions = useMemo(
    () => (t?.transactions || []).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon)),
    [t]
  );
  const visibles = useMemo(
    () => (filtre === "rue" ? cessions.filter((x) => x.dans_la_rue) : cessions),
    [cessions, filtre]
  );
  const median = t?.marche?.prix_median || null;

  // La carte, une fois. Les pastilles se refont à chaque changement de filtre.
  useEffect(() => {
    if (!centre || !conteneur.current) return;
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current) return;
        const g = window.google.maps;
        if (!carte.current) {
          carte.current = new g.Map(conteneur.current, {
            center: centre,
            zoom: 16,
            styles: STYLE_SOMBRE,
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: "cooperative",
            backgroundColor: "#0f1114",
          });
          bulle.current = new g.InfoWindow();
        } else {
          carte.current.setCenter(centre);
        }

        for (const r of reperes.current) r.setMap(null);
        reperes.current = [];

        for (const c of visibles) {
          const teinte = c.sur_place ? MENTHE : c.dans_la_rue ? OR : GRIS;
          const repere = new g.Marker({
            position: { lat: c.lat, lng: c.lon },
            map: carte.current,
            title: `${c.enseigne} — ${euros(c.prix)}`,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: rayonDe(c.prix, median),
              fillColor: teinte,
              fillOpacity: c.dans_la_rue ? 0.5 : 0.28,
              strokeColor: teinte,
              strokeWeight: 1,
            },
            zIndex: c.sur_place ? 30 : c.dans_la_rue ? 20 : 10,
          });
          repere.addListener("click", () => {
            bulle.current.setContent(
              `<div style="font:600 13px/1.3 system-ui;color:#14181c">${c.enseigne || ""}</div>` +
              `<div style="font:12px/1.5 system-ui;color:#5a5f66">${[c.activite, jour(c.date)].filter(Boolean).join(" · ")}</div>` +
              `<div style="font:12px/1.5 system-ui;color:#5a5f66">${c.adresse || ""}</div>` +
              `<div style="font:14px/1.5 system-ui;color:#14181c;margin-top:4px">${euros(c.prix)}</div>`
            );
            bulle.current.open({ map: carte.current, anchor: repere });
          });
          reperes.current.push(repere);
        }

        // Le bien, par-dessus les cessions.
        const bien = new g.Marker({
          position: centre,
          map: carte.current,
          title: titre || "Le bien",
          zIndex: 100,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: MENTHE,
            fillOpacity: 1,
            strokeColor: "#04140c",
            strokeWeight: 3,
          },
        });
        bien.addListener("click", () => {
          bulle.current.setContent(
            `<div style="font:600 13px/1.3 system-ui;color:#14181c">${titre || "Le bien"}</div>` +
            `<div style="font:12px/1.5 system-ui;color:#5a5f66">${adresse || t?.adresse || ""}</div>`
          );
          bulle.current.open({ map: carte.current, anchor: bien });
        });
        reperes.current.push(bien);
      })
      .catch((e) => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [centre, visibles, median, titre, adresse, t]);

  useEffect(() => () => { for (const r of reperes.current) r.setMap(null); reperes.current = []; }, []);

  if (!centre) return null;

  return (
    <div>
      <div className="relative overflow-hidden bg-[#0f1114]" style={{ height: hauteur }}>
        <div ref={conteneur} className="w-full h-full" />
        {erreur && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <p className="m-0 text-[13px] text-[#9298a6]">
              Carte indisponible ({erreur}). Renseignez <code className="text-[#c9cdd6]">VITE_GOOGLE_MAPS_API_KEY</code>.
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#f2f3f5]/[0.13]" />
      </div>

      {/* Ce que la carte montre, et de quoi on parle. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[#9298a6]">
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: MENTHE }} /> Le bien, et les cessions à son numéro</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: OR }} /> Dans la rue</span>
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: GRIS }} /> Autour</span>
        <span className="text-[#6a7180]">La taille de la pastille suit le prix.</span>

        <span className="ml-auto inline-flex gap-1.5">
          {[["toutes", `Tout · ${cessions.length}`], ["rue", `La rue · ${cessions.filter((x) => x.dans_la_rue).length}`]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltre(v)}
              className={`px-3 py-1 rounded-full text-[12px] border transition-colors ${filtre === v ? "bg-[#96c0b8] text-[#04140c] border-[#96c0b8]" : "bg-transparent text-[#b8b8b8] border-[#262626] hover:border-[#3a3f4a]"}`}
            >
              {l}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
