/* eslint-disable no-restricted-syntax -- palette de données.
   Les teintes des activités sont une échelle catégorielle qui porte un sens
   sur la carte (un type de commerce, une couleur) : elles ne suivent pas la
   marque. */
import React, { useEffect, useMemo, useRef } from "react";
import jetons from "@/design/jetons.json";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";

// La carte d'une prospection, sur le modèle de Data Zoning : un plan clair,
// les rues commerçantes tracées dans la teinte de leur emplacement, et un
// point par commerce, coloré par activité. Google Maps (la clé et le
// chargeur sont ceux de K-Zoning), sans style : le plan tel quel.
//
// Google dessine en SVG, où une variable CSS ne se résout pas : les teintes
// sont lues en clair dans jetons.json.

const C = jetons.couleurs_clair;
export const TEINTE_RUE = { 1: C["emplacement-1"], 1.5: C["emplacement-1bis"], 2: C["emplacement-2"] };
export const ACTIVITES_TEINTES = ["#2f6fdf", "#1f9d74", "#c23b7a", "#7a5af5", "#0e8fa3", "#e377c2", "#8c564b", "#6b6e6b"];
const SANS_ACTIVITE = "#3a3f47";

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** L'activité cherchée à laquelle répond un commerce (son rang dans la liste), ou -1. */
export function rangActivite(commerce, activites) {
  const texte = norm(`${commerce.activite || ""} ${commerce.categorie_activite || ""} ${commerce.enseigne || ""}`);
  // La même lecture que le serveur : une racine par mot, les mots courts en mot isolé.
  return activites.findIndex((a) => {
    const mots = norm(a).split(/[\s,'-]+/).filter((m) => m.length > 2);
    return mots.length > 0 && mots.every((m) => {
    if (m.length <= 3) return new RegExp(`(^|[^a-z])${m}([^a-z]|$)`).test(texte);
    const racine = m.replace(/(eries?|iere|iens?|ance|ence|ment|tions?|sions?|ants?|ents?|eurs?|euse|ures?|iers?|ique|ie|s)$/, "");
      return texte.includes(racine.length >= 4 ? racine : m.replace(/s$/, ""));
    });
  });
}
export const teinteActivite = (commerce, activites) => {
  const i = rangActivite(commerce, activites);
  return i < 0 ? SANS_ACTIVITE : ACTIVITES_TEINTES[i % ACTIVITES_TEINTES.length];
};

/**
 * @param {Array} rues        {nom, classe, trace: [[[lat, lon]…]…], centre}
 * @param {Array} commerces   {cible_id, lat, lon, enseigne, activite}
 * @param {Array} activites   les activités cherchées, dans l'ordre (pour les teintes)
 * @param {Set} coches        les commerces cochés : point plus gros, bord franc
 * @param {string|null} enCours la rue qu'ALX lit en ce moment
 */
export default function CarteProspection({ rues = [], commerces = [], activites = [], coches = new Set(), choisi = null, enCours = null, centre = null, type = "roadmap", onCommerce, onErreur }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const traits = useRef(new Map()); // nom de rue → [Polyline]
  const points = useRef([]);
  const cadree = useRef(false);
  const enCoursAvant = useRef(null);
  const [prete, setPrete] = React.useState(false);

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        carte.current = new window.google.maps.Map(conteneur.current, {
          center: centre ? { lat: centre.lat, lng: centre.lon } : { lat: 46.6, lng: 2.4 },
          zoom: centre ? 14 : 6,
          mapTypeId: type,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        setPrete(true);
      })
      .catch((e) => onErreur?.(e?.message || "Carte indisponible"));
    return () => { vivant = false; };
  }, []);

  useEffect(() => { carte.current?.setMapTypeId(type); }, [type]);

  // Les rues : un trait par tronçon, rangé par nom. Elles ne se redessinent
  // que si la liste change ; la rue en cours s'épaissit dans l'effet suivant,
  // sans toucher aux 900 autres.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const lot of traits.current.values()) for (const t of lot) t.setMap(null);
    traits.current = new Map();
    enCoursAvant.current = null;
    for (const r of rues) {
      if (r.classe == null) continue;
      traits.current.set(r.nom, (r.trace || []).map((troncon) => new g.Polyline({
        map: carte.current,
        path: troncon.map(([lat, lon]) => ({ lat, lng: lon })),
        strokeColor: TEINTE_RUE[r.classe] || SANS_ACTIVITE,
        strokeOpacity: 0.75,
        strokeWeight: 4,
        zIndex: 5,
        clickable: false,
      })));
    }
  }, [prete, rues]);
  useEffect(() => {
    if (!carte.current) return;
    const poser = (nom, epaisse) => { for (const t of traits.current.get(nom) || []) t.setOptions({ strokeOpacity: epaisse ? 1 : 0.75, strokeWeight: epaisse ? 7 : 4, zIndex: epaisse ? 8 : 5 }); };
    if (enCoursAvant.current && enCoursAvant.current !== enCours) poser(enCoursAvant.current, false);
    if (enCours) poser(enCours, true);
    enCoursAvant.current = enCours;
  }, [prete, enCours, rues]);

  // Les commerces.
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current) return;
    for (const p of points.current) p.setMap(null);
    points.current = commerces.filter((c) => c.lat != null && c.lon != null).map((c) => {
      const oui = coches.has(c.cible_id) || choisi === c.cible_id;
      const m = new g.Marker({
        position: { lat: c.lat, lng: c.lon },
        map: carte.current,
        title: [c.enseigne || c.activite, c.adresse].filter(Boolean).join(" · "),
        zIndex: oui ? 60 : 50,
        icon: { path: g.SymbolPath.CIRCLE, scale: oui ? 9 : 6.5, fillColor: teinteActivite(c, activites), fillOpacity: 0.95, strokeColor: oui ? "#111" : "#fff", strokeWeight: oui ? 2.5 : 1.5 },
      });
      m.addListener("click", () => onCommerce?.(c));
      return m;
    });
  }, [prete, commerces, activites, coches, choisi]);

  // Le cadrage : une seule fois, sur les commerces s'il y en a, sinon sur les
  // rues. Jamais ensuite : pendant un parcours, chaque relecture ajoutait des
  // points et recadrait la carte sous la main de l'utilisateur.
  const cadre = useMemo(() => {
    const pts = commerces.filter((c) => c.lat != null && c.lon != null).map((c) => [c.lat, c.lon]);
    if (pts.length >= 2) return pts;
    return rues.filter((r) => r.classe != null && r.centre?.lat != null || (Array.isArray(r.centre) && r.classe != null)).map((r) => (Array.isArray(r.centre) ? r.centre : [r.centre.lat, r.centre.lon ?? r.centre.lng])).filter(([a, b]) => a != null && b != null);
  }, [commerces, rues]);
  useEffect(() => {
    const g = window.google?.maps;
    if (!g || !carte.current || cadree.current || !cadre.length) return;
    cadree.current = true;
    const b = new g.LatLngBounds();
    for (const [lat, lon] of cadre) b.extend({ lat, lng: lon });
    carte.current.fitBounds(b, 48);
    if (cadre.length === 1) carte.current.setZoom(16);
  }, [prete, cadre]);

  useEffect(() => () => {
    for (const lot of traits.current.values()) for (const t of lot) t.setMap(null);
    traits.current = new Map();
    for (const t of points.current) t.setMap(null);
    points.current = [];
  }, []);

  return <div ref={conteneur} className="h-full w-full" />;
}
