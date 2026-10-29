import React, { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Loader2, Maximize2, Minimize2, Pencil, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { TEINTE_RUE } from "@/components/mandataire/CarteProspection";
import { chargerGoogleMaps, TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import { JL } from "@/design/jetons";

// Off-market : la carte d'un territoire. Un point par local ; la couleur dit
// la motivation (l'accent quand elle compte, le gris sinon), la taille le fit.
// Les locaux de la page courante portent leur numéro, le même que leur carte
// dans la liste. Un clic ouvre la fiche. Le crayon trace une zone, qui devient
// un filtre. Les points qui se superposent sont écartés de quelques mètres.
//
// Un territoire fait jusqu'à quelques milliers de locaux : un repère Google
// par local bloquerait l'écran à chaque filtre. Les points sont dessinés d'un
// trait sur un seul canevas posé sur la carte, et le clic cherche le point le
// plus proche.

/** Pure : les points, ceux qui se superposent écartés en petite couronne. */
export function ecarter(locaux, rayon_m = 7) {
  const groupes = new Map();
  for (const l of locaux) {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lon)) continue;
    const cle = `${l.lat.toFixed(4)},${l.lon.toFixed(4)}`;
    groupes.set(cle, [...(groupes.get(cle) || []), l]);
  }
  const out = [];
  for (const g of groupes.values()) {
    const lat0 = g.reduce((a, l) => a + l.lat, 0) / g.length;
    const lon0 = g.reduce((a, l) => a + l.lon, 0) / g.length;
    g.forEach((l, i) => {
      if (g.length === 1) { out.push({ ...l, plat: l.lat, plon: l.lon }); return; }
      const angle = (2 * Math.PI * i) / g.length;
      const r = rayon_m * Math.max(1, g.length / 5);
      out.push({ ...l, plat: lat0 + (r * Math.sin(angle)) / 111320, plon: lon0 + (r * Math.cos(angle)) / (111320 * Math.cos((lat0 * Math.PI) / 180)) });
    });
  }
  return out;
}

/** Pure : la couleur et la taille d'un point. */
export const dessinDe = (l) => ({
  couleur: l.exclu ? JL.brume : l.motivation >= 50 ? JL.menthe : l.motivation >= 25 ? JL["menthe-clair"] || JL.menthe : l.motivation > 0 ? JL.craie : JL.ardoise,
  opacite: l.exclu ? 0.35 : l.motivation > 0 ? 0.95 : 0.55,
  taille: 4 + Math.round((Math.max(0, Math.min(100, l.fit || 0)) / 100) * 5),
});

/** Pure : le point le plus proche d'un pixel, à moins de `rayon` pixels. */
export function plusProche(ecran, x, y, rayon = 10) {
  let meilleur = null;
  let dmin = Infinity;
  for (const p of ecran) {
    const r = Math.max(rayon, p.r || 0);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= r * r && d < dmin) { dmin = d; meilleur = p; }
  }
  return meilleur;
}

/** La couche de points : un canevas dans le calque des superpositions, redessiné à chaque déplacement. */
export function creerCouche(g) {
  class Couche extends g.OverlayView {
    constructor() {
      super();
      this.canevas = document.createElement("canvas");
      this.canevas.style.position = "absolute";
      this.canevas.style.pointerEvents = "none";
      this.points = [];
      this.ouvertId = null;
      this.numeros = new Map();
      this.ecran = [];
      this.coin = { x: 0, y: 0 };
    }
    onAdd() { this.getPanes().overlayLayer.appendChild(this.canevas); }
    onRemove() { this.canevas.remove(); }
    poser(points, ouvertId, numeros, dessin = null) { this.points = points; this.ouvertId = ouvertId; this.numeros = numeros || new Map(); this.dessin = dessin; this.draw(); }
    draw() {
      const proj = this.getProjection();
      const carte = this.getMap();
      if (!proj || !carte) return;
      const bornes = carte.getBounds();
      if (!bornes) return;
      const so = proj.fromLatLngToDivPixel(bornes.getSouthWest());
      const ne = proj.fromLatLngToDivPixel(bornes.getNorthEast());
      const largeur = Math.max(1, Math.round(ne.x - so.x));
      const hauteur = Math.max(1, Math.round(so.y - ne.y));
      const echelle = window.devicePixelRatio || 1;
      const c = this.canevas;
      c.style.left = `${so.x}px`; c.style.top = `${ne.y}px`;
      c.style.width = `${largeur}px`; c.style.height = `${hauteur}px`;
      if (c.width !== largeur * echelle || c.height !== hauteur * echelle) { c.width = largeur * echelle; c.height = hauteur * echelle; }
      this.coin = { x: so.x, y: ne.y };
      const ctx = c.getContext("2d");
      ctx.setTransform(echelle, 0, 0, echelle, 0, 0);
      ctx.clearRect(0, 0, largeur, hauteur);
      const ecran = [];
      const numerotes = [];
      let ouvert = null;
      for (const l of this.points) {
        const p = proj.fromLatLngToDivPixel(new g.LatLng(l.plat, l.plon));
        const x = p.x - so.x;
        const y = p.y - ne.y;
        if (x < -16 || y < -16 || x > largeur + 16 || y > hauteur + 16) continue;
        const d = this.dessin ? this.dessin(l) : dessinDe(l);
        const n = this.numeros.get(l.id);
        ecran.push({ x, y, l, r: n ? 12 : d.taille });
        if (n) { numerotes.push({ x, y, d, n, ouvert: l.id === this.ouvertId }); continue; }
        if (l.id === this.ouvertId) { ouvert = { x, y, d }; continue; }
        ctx.beginPath();
        ctx.arc(x, y, d.taille, 0, Math.PI * 2);
        ctx.globalAlpha = d.opacite;
        ctx.fillStyle = d.couleur;
        ctx.fill();
        ctx.globalAlpha = 1;
        // Un contour au choix du dessin (le point jugé du score Zone, 11 oct. 2026) ; sinon le liseré du fond.
        ctx.lineWidth = d.contour ? 2 : 1;
        ctx.strokeStyle = d.contour || JL.fond;
        ctx.stroke();
      }
      if (ouvert) {
        ctx.beginPath();
        ctx.arc(ouvert.x, ouvert.y, ouvert.d.taille + 3, 0, Math.PI * 2);
        ctx.fillStyle = ouvert.d.couleur;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = JL.encre;
        ctx.stroke();
      }
      // Les numéros de la page, par-dessus tout le reste : un disque et le chiffre.
      ctx.font = "600 11px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const q of numerotes) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.ouvert ? 14 : 11, 0, Math.PI * 2);
        ctx.fillStyle = q.ouvert ? JL.encre : JL.menthe;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = JL.fond;
        ctx.stroke();
        ctx.fillStyle = q.ouvert ? JL.fond : JL["sur-menthe"] || JL.encre;
        ctx.fillText(String(q.n), q.x, q.y + 0.5);
      }
      this.ecran = ecran;
    }
    /** Le point sous un lieu de la carte, s'il y en a un à portée. */
    sous(latLng) {
      const proj = this.getProjection();
      if (!proj) return null;
      const p = proj.fromLatLngToDivPixel(latLng);
      return plusProche(this.ecran, p.x - this.coin.x, p.y - this.coin.y)?.l || null;
    }
  }
  return new Couche();
}

/** Pure : les chiffres d'un ensemble de locaux, pour le menu Analyse. */
export function analyser(locaux) {
  const n = locaux.length;
  const resolus = locaux.filter((l) => l.proprietaire).length;
  const exacts = locaux.filter((l) => l.confiance === "exacte").length;
  const profils = {};
  for (const l of locaux) if (l.proprietaire) profils[l.profil?.cle] = (profils[l.profil?.cle] || 0) + 1;
  const proprietaires = new Set(locaux.map((l) => l.proprietaire?.cle).filter(Boolean)).size;
  return {
    n, resolus, exacts, proprietaires,
    motivation_50: locaux.filter((l) => l.motivation >= 50).length,
    motivation_25: locaux.filter((l) => l.motivation >= 25).length,
    familles_3: locaux.filter((l) => l.familles >= 3).length,
    vacants: locaux.filter((l) => l.occupe === false).length,
    contactes: locaux.filter((l) => l.suivi && l.suivi.statut !== "a_contacter").length,
    profils: Object.entries(profils).sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

/** Les rues d'un territoire, lues une fois par ville et gardées le temps de la page. */
const RUES = new Map();
const ruesDe = (villeId) => {
  if (!RUES.has(villeId)) RUES.set(villeId, base44.request("GET", `/api/off-market/rues?ville=${encodeURIComponent(villeId)}`).then((r) => r.rues || []).catch((e) => { RUES.delete(villeId); throw e; }));
  return RUES.get(villeId);
};

export default function CarteOffMarket({ villeId = null, locaux, centre = null, ouvertId = null, onOuvrir, numerotes = null, polygone = null, onPolygone, libellesProfils = {}, dessinPoint = null, legende = null, bulle: texteBulle = null, outils = true, className = "" }) {
  const conteneur = useRef(null);
  const carte = useRef(null);
  const couche = useRef(null);
  const bulle = useRef(null);
  const trace = useRef(null); // le polygone en cours ou posé
  const [prete, setPrete] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [type, setType] = useState("roadmap");
  const [plein, setPlein] = useState(false);
  const [analyse, setAnalyse] = useState(false);
  // Les rues colorées (23 oct. 2026) : un bouton à gauche du plein écran ; le choix est gardé.
  const [voirRues, setVoirRues] = useState(() => { try { return localStorage.getItem("off-market.rues") === "1"; } catch { return false; } });
  const basculerRues = () => setVoirRues((v) => { try { localStorage.setItem("off-market.rues", v ? "0" : "1"); } catch { /* sans stockage */ } return !v; });
  const [rues, setRues] = useState({ etat: "repos", liste: [] });
  const traitsRues = useRef([]);
  const [dessinBrut, setDessin] = useState(false);
  // Sans les outils (mode Simple), jamais de tracé : ni viseur, ni clics qui posent des sommets.
  const dessin = outils && dessinBrut;
  const [sommets, setSommets] = useState([]);
  const dessinRef = useRef(false);
  dessinRef.current = dessin;
  const ouvrir = useRef(onOuvrir);
  ouvrir.current = onOuvrir;
  const bulleRef = useRef(texteBulle);
  bulleRef.current = texteBulle;
  const points = useMemo(() => ecarter(locaux), [locaux]);
  const cadre = useRef(null);

  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps()
      .then(() => {
        if (!vivant || !conteneur.current || carte.current) return;
        const g = window.google.maps;
        carte.current = new g.Map(conteneur.current, {
          center: centre ? { lat: centre.lat, lng: centre.lon } : { lat: 46.6, lng: 2.4 }, zoom: centre ? 14 : 6, mapTypeId: "roadmap",
          disableDefaultUI: true, zoomControl: true, clickableIcons: false,
          gestureHandling: window.matchMedia("(max-width: 767px)").matches ? "cooperative" : "greedy",
        });
        couche.current = creerCouche(g);
        couche.current.setMap(carte.current);
        carte.current.addListener("click", (e) => {
          if (dessinRef.current) { setSommets((s) => [...s, [e.latLng.lat(), e.latLng.lng()]]); return; }
          const l = couche.current?.sous(e.latLng);
          if (l) ouvrir.current(l);
        });
        let survol = null;
        carte.current.addListener("mousemove", (e) => {
          if (dessinRef.current) return;
          const l = couche.current?.sous(e.latLng);
          if ((l?.id || null) === (survol?.id || null)) return;
          survol = l;
          carte.current.setOptions({ draggableCursor: l ? "pointer" : dessinRef.current ? "crosshair" : "grab" });
          if (!bulle.current) return;
          if (!l) { bulle.current.style.display = "none"; return; }
          bulle.current.textContent = `${l.enseigne || "Murs commerciaux"} · ${l.adresse} · Motivation ${l.motivation} · Fit ${l.fit}`;
          bulle.current.style.display = "block";
        });
        carte.current.addListener("mouseout", () => { survol = null; if (bulle.current) bulle.current.style.display = "none"; });
        setPrete(true);
      })
      .catch((e) => setErreur(e?.message || "Carte indisponible"));
    return () => { vivant = false; couche.current?.setMap(null); couche.current = null; trace.current?.setMap(null); };
  }, []);

  useEffect(() => { carte.current?.setMapTypeId(type); }, [type]);
  // Les rues : lues quand on les demande, dessinées sous les points, effacées quand on les cache.
  useEffect(() => {
    if (!voirRues || !villeId) { setRues({ etat: "repos", liste: [] }); return undefined; }
    let vivant = true;
    setRues((r) => ({ ...r, etat: "lecture" }));
    ruesDe(villeId).then((liste) => { if (vivant) setRues({ etat: "pret", liste }); }).catch(() => { if (vivant) setRues({ etat: "erreur", liste: [] }); });
    return () => { vivant = false; };
  }, [voirRues, villeId]);
  useEffect(() => {
    for (const t of traitsRues.current) t.setMap(null);
    traitsRues.current = [];
    const g = window.google?.maps;
    if (!prete || !g || !carte.current || !voirRues) return;
    for (const r of rues.liste) {
      for (const troncon of r.trace || []) {
        traitsRues.current.push(new g.Polyline({ map: carte.current, path: troncon.map(([lat, lon]) => ({ lat, lng: lon })), strokeColor: TEINTE_RUE[r.classe], strokeOpacity: 0.8, strokeWeight: 4, zIndex: 2, clickable: false }));
      }
    }
  }, [prete, voirRues, rues.liste]);
  // La main pour naviguer ; le viseur seulement pendant un tracé.
  useEffect(() => { carte.current?.setOptions({ draggableCursor: dessin ? "crosshair" : "grab", draggingCursor: "grabbing" }); }, [dessin, prete]);

  // Les points : redessinés quand la liste, la page ou le point ouvert change, d'un seul trait.
  useEffect(() => { if (prete) couche.current?.poser(points, ouvertId, numerotes, dessinPoint); }, [prete, points, ouvertId, numerotes, dessinPoint]);

  // Le cadrage : une fois par territoire, pas à chaque filtre.
  useEffect(() => {
    const g = window.google?.maps;
    if (!prete || !g || !points.length) return;
    const cle = points[0]?.ville_id || "x";
    if (cadre.current === cle) return;
    cadre.current = cle;
    const b = new g.LatLngBounds();
    for (const l of points) b.extend({ lat: l.plat, lng: l.plon });
    carte.current.fitBounds(b, 40);
    g.event.addListenerOnce(carte.current, "idle", () => { if (carte.current.getZoom() > 17) carte.current.setZoom(17); });
  }, [prete, points]);

  // La zone : le tracé en cours (pointillé) ou la zone posée (pleine).
  useEffect(() => {
    const g = window.google?.maps;
    if (!prete || !g) return;
    trace.current?.setMap(null);
    trace.current = null;
    const chemin = dessin ? sommets : polygone || [];
    if (chemin.length < 2) return;
    trace.current = new g.Polygon({ paths: chemin.map(([lat, lng]) => ({ lat, lng })), map: carte.current, strokeColor: JL.menthe, strokeWeight: 2, strokeOpacity: 1, fillColor: JL.menthe, fillOpacity: dessin ? 0.06 : 0.12, clickable: false });
  }, [prete, dessin, sommets, polygone]);

  // Plein écran : la carte doit reprendre ses mesures.
  useEffect(() => { const g = window.google?.maps; if (prete && g && carte.current) { const c = carte.current.getCenter(); setTimeout(() => { g.event.trigger(carte.current, "resize"); carte.current.setCenter(c); }, 60); } }, [plein, prete]);
  useEffect(() => {
    if (!plein) return undefined;
    const k = (e) => { if (e.key === "Escape") setPlein(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [plein]);

  const terminer = () => { if (sommets.length >= 3) onPolygone?.(sommets); setDessin(false); setSommets([]); };
  const stats = useMemo(() => (analyse ? analyser(locaux) : null), [analyse, locaux]);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");

  const pastille = (actif) => `rounded-full border px-2.5 py-1 text-[11.5px] backdrop-blur transition-colors ${actif ? "border-menthe text-encre" : "border-bord-vif text-brume hover:text-encre"}`;
  const voile = { background: "rgb(var(--k-fond-rgb) / 0.78)" };
  const rond = (actif) => `grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition-colors ${actif ? "border-menthe text-encre" : "border-bord-vif text-craie hover:text-encre"}`;
  if (erreur) return <div className={`grid place-items-center rounded-bloc border border-trait px-6 text-center text-[12.5px] text-ardoise ${className}`}>Carte indisponible : {erreur}.</div>;
  return (
    <div className={plein ? "fixed inset-0 z-[85] bg-fond p-3 md:left-[var(--k-barre-largeur,0px)]" : `relative ${className}`}>
      <div className={`relative h-full w-full ${plein ? "" : ""}`}>
        <div ref={conteneur} className="h-full w-full rounded-bloc" />
        {outils && <div className="absolute left-3 top-3 flex flex-col gap-2">
          <button type="button" onClick={() => { if (dessin) terminer(); else { setDessin(true); setSommets([]); } }} aria-pressed={dessin} title={dessin ? "Terminer la zone" : "Tracer une zone"} className={rond(dessin)} style={voile}><Pencil className="h-4 w-4" /></button>
          {(polygone?.length > 0 || dessin) && <button type="button" onClick={() => { setDessin(false); setSommets([]); onPolygone?.(null); }} title="Effacer la zone" className={rond(false)} style={voile}><X className="h-4 w-4" /></button>}
        </div>}
        {/* Au-dessus du voile « Les commerces de … » : les rues et le plein écran restent à portée pendant le chargement. */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          <div ref={bulle} className="pointer-events-none hidden max-w-[320px] truncate rounded-full px-3 py-1.5 text-[12px] text-encre backdrop-blur" style={voile} />
          {outils && <div className="relative">
            <button type="button" onClick={() => setAnalyse((a) => !a)} aria-expanded={analyse} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] backdrop-blur ${analyse ? "border-menthe text-encre" : "border-bord-vif text-craie hover:text-encre"}`} style={voile}><BarChart3 className="h-4 w-4" />Analyse</button>
            {analyse && stats && (
              <div className="absolute right-0 top-11 z-10 w-[300px] rounded-bloc border border-bord-doux bg-surface-pleine p-4 text-[12.5px] shadow-xl">
                <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Ce qui est affiché</p>
                <div className="mt-2 flex flex-col gap-1 text-craie">
                  {[["Murs commerciaux", stats.n], ["Propriétaires distincts", stats.proprietaires], ["Propriétaire résolu", `${stats.resolus} · ${pct(stats.resolus, stats.n)}`], ["Exacts (campagne possible)", `${stats.exacts} · ${pct(stats.exacts, stats.n)}`], ["Motivation 50 et plus", stats.motivation_50], ["Motivation 25 et plus", stats.motivation_25], ["Trois familles de signaux", stats.familles_3], ["Vacants", stats.vacants], ["Déjà contactés", stats.contactes]].map(([mot, v]) => <span key={mot} className="flex justify-between gap-3"><span className="text-ardoise">{mot}</span><span className="tabular-nums text-encre">{v}</span></span>)}
                </div>
                {stats.profils.length > 0 && <><p className="m-0 mt-3 text-[11px] uppercase tracking-[.14em] text-brume">Profils résolus</p><div className="mt-1.5 flex flex-col gap-1">{stats.profils.map(([p, n]) => <span key={p} className="flex justify-between gap-3"><span className="text-ardoise">{libellesProfils[p] || p}</span><span className="tabular-nums text-encre">{n}</span></span>)}</div></>}
              </div>
            )}
          </div>}
          {villeId && (
            <button type="button" onClick={basculerRues} aria-pressed={voirRues} title={voirRues ? "Cacher les rues" : "Voir les rues, dans la teinte de leur emplacement"}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] backdrop-blur transition-colors ${voirRues ? "border-menthe text-encre" : "border-bord-vif text-craie hover:text-encre"}`} style={voile}>
              {rues.etat === "lecture" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Rues
            </button>
          )}
          <button type="button" onClick={() => setPlein((p) => !p)} title={plein ? "Quitter le plein écran" : "Plein écran"} className={rond(plein)} style={voile}>{plein ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
          <div className="pointer-events-auto flex items-center gap-1.5">{TYPES_CARTE.slice(0, 2).map((t) => <button key={t.cle} type="button" onClick={() => setType(t.cle)} className={pastille(type === t.cle)} style={voile}>{t.nom}</button>)}</div>
          {voirRues && (
            <div className="flex items-center gap-3 rounded-full px-3 py-1.5 text-[11.5px] text-craie backdrop-blur" style={voile}>
              {rues.etat === "pret" && !rues.liste.length ? <span>Aucune rue classée pour cette ville</span> : rues.etat === "erreur" ? <span>Rues indisponibles</span> : [[1, "N°1"], [1.5, "N°1 bis"], [2, "N°2"]].map(([c, mot]) => (
                <span key={c} className="inline-flex items-center gap-1.5"><span className="inline-block h-[3px] w-4 rounded-full" style={{ background: TEINTE_RUE[c] }} />{mot}</span>
              ))}
            </div>
          )}
          {legende || (<div className="flex items-center gap-3 rounded-full px-3 py-1.5 text-[11.5px] text-craie backdrop-blur" style={voile}>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-menthe" />motivation forte</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-craie" />faible</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-ardoise/60" />aucune</span>
            <span className="text-brume">· la taille dit le fit · les numéros sont ceux de la liste</span>
          </div>)}
        </div>
      </div>
    </div>
  );
}
