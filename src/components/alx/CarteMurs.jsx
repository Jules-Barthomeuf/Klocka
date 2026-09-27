import React, { useEffect, useMemo, useRef, useState } from "react";
import { chargerGoogleMaps, TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import { joliNom } from "./alx-commun";
import { JL } from "@/design/jetons";

// Les murs d'une société sur la carte : Google Maps tel quel, comme K-Zoning.
// Un point par commerce, tous visibles : plusieurs commerces à la même adresse
// (une galerie, un immeuble à trois vitrines) sont écartés en petite couronne
// autour de leur adresse, sinon ils ne font qu'un point. Un clic ouvre la
// fiche du commerce dans le panneau.
//
// La carte part de la ville ouverte ; « En France » recadre sur tous les murs
// de la société, dans toutes les villes parcourues.

/** Pure : les points, ceux qui se superposent écartés de quelques mètres. */
export function ecarter(murs, rayon_m = 7) {
  const groupes = new Map();
  for (const m of murs) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lon)) continue;
    const cle = `${m.lat.toFixed(4)},${m.lon.toFixed(4)}`;
    groupes.set(cle, [...(groupes.get(cle) || []), m]);
  }
  const out = [];
  for (const g of groupes.values()) {
    const lat0 = g.reduce((a, m) => a + m.lat, 0) / g.length;
    const lon0 = g.reduce((a, m) => a + m.lon, 0) / g.length;
    g.forEach((m, i) => {
      if (g.length === 1) { out.push({ ...m, plat: m.lat, plon: m.lon }); return; }
      const angle = (2 * Math.PI * i) / g.length;
      const r = rayon_m * Math.max(1, g.length / 5);
      out.push({ ...m, plat: lat0 + (r * Math.sin(angle)) / 111320, plon: lon0 + (r * Math.cos(angle)) / (111320 * Math.cos((lat0 * Math.PI) / 180)) });
    });
  }
  return out;
}

export default function CarteMurs({ murs, ailleurs = [], villeId = null, onOuvrir, className = "" }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const reperes = useRef([]);
  const [prete, setPrete] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [type, setType] = useState("roadmap");
  const [cadre, setCadre] = useState("ville");
  // Le clic passe par une référence : un nouveau rappel à chaque rendu du
  // panneau ne doit pas redessiner tous les points.
  const ouvrir = useRef(onOuvrir);
  ouvrir.current = onOuvrir;

  const tous = useMemo(() => {
    const ici = new Set(murs.map((m) => m.cible_id));
    return ecarter([...murs.map((m) => ({ ...m, ville_id: m.ville_id || villeId })), ...ailleurs.filter((m) => !ici.has(m.cible_id))]);
  }, [murs, ailleurs, villeId]);
  const autresVilles = [...new Set(ailleurs.filter((m) => m.ville_id !== villeId).map((m) => m.ville).filter(Boolean))];

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        carte.current = new window.google.maps.Map(conteneur.current, {
          center: { lat: 46.6, lng: 2.4 }, zoom: 6, mapTypeId: "roadmap",
          disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false,
        });
        setPrete(true);
      })
      .catch((e) => setErreur(e?.message || "Carte indisponible"));
    return () => { vivant = false; for (const r of reperes.current) r.setMap(null); reperes.current = []; };
  }, []);

  useEffect(() => { carte.current?.setMapTypeId(type); }, [type]);

  // Les points.
  useEffect(() => {
    const g = window.google?.maps;
    if (!prete || !g) return;
    for (const r of reperes.current) r.setMap(null);
    reperes.current = tous.map((m) => {
      const ici = !villeId || m.ville_id === villeId;
      const r = new g.Marker({
        position: { lat: m.plat, lng: m.plon }, map: carte.current, zIndex: ici ? 50 : 40,
        title: `${joliNom(m.enseigne) || "Local commercial"} · ${m.adresse}${m.ville && !ici ? `, ${m.ville}` : ""}`,
        icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: ici ? JL.menthe : JL.ambre, fillOpacity: 0.95, strokeColor: JL.fond, strokeWeight: 1.5 },
      });
      r.addListener("click", () => ouvrir.current(m));
      return r;
    });
  }, [prete, tous, villeId]);

  // Le cadrage : la ville ouverte, ou toute la France de la société.
  useEffect(() => {
    const g = window.google?.maps;
    if (!prete || !g) return;
    const vus = cadre === "france" ? tous : tous.filter((m) => !villeId || m.ville_id === villeId);
    if (!vus.length) { carte.current.setCenter({ lat: 46.6, lng: 2.4 }); carte.current.setZoom(5); return; }
    const b = new g.LatLngBounds();
    for (const m of vus) b.extend({ lat: m.plat, lng: m.plon });
    carte.current.fitBounds(b, 48);
    g.event.addListenerOnce(carte.current, "idle", () => { if (carte.current.getZoom() > 18) carte.current.setZoom(18); });
  }, [prete, cadre, tous, villeId]);

  const pastille = (actif) => `rounded-full border px-2.5 py-0.5 text-[11.5px] backdrop-blur transition-colors ${actif ? "border-menthe text-encre" : "border-bord text-brume hover:text-encre"}`;
  if (erreur) return <div className={`grid place-items-center rounded-[16px] border border-trait px-6 text-center text-[12.5px] text-ardoise ${className}`}>Carte indisponible : {erreur}.</div>;
  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex flex-wrap gap-1">
          <button type="button" onClick={() => setCadre("ville")} className={pastille(cadre === "ville")} style={{ background: "transparent" }}>Dans la ville</button>
          <button type="button" onClick={() => setCadre("france")} className={pastille(cadre === "france")} style={{ background: "transparent" }}>En France{tous.length ? ` · ${tous.length}` : ""}</button>
        </div>
        <div className="inline-flex gap-1">
          {TYPES_CARTE.slice(0, 2).map((t) => <button key={t.cle} type="button" onClick={() => setType(t.cle)} className={pastille(type === t.cle)} style={{ background: "transparent" }}>{t.nom}</button>)}
        </div>
      </div>
      <div className="relative h-72 overflow-hidden rounded-[16px] border border-trait">
        <div ref={conteneur} className="h-full w-full" />
      </div>
      {autresVilles.length > 0 && <p className="m-0 mt-2 text-[11.5px] text-brume"><span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: JL.ambre }} /> aussi à {autresVilles.join(", ")}</p>}
    </div>
  );
}
