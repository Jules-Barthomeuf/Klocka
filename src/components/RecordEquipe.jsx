import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Volume2, VolumeX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { jouerRecord } from "@/lib/son-record";

// La pop-up « Record de l'équipe » (22 nov. 2026, Jules, maquette « or satiné cousu ») : elle fête qui tient le record
// de fiches reçues en une semaine. Aux admins seuls, une fois par semaine à la première ouverture (server/record-equipe.js).
// Environ 3,5 s : le fond s'assombrit, la carte monte, la photo, la banderole se déroule, le nom, le compteur, le 25 qui
// brille, un reflet ; la musique (src/lib/son-record.js) suit le même déroulé. Sans animations sur l'appareil : la carte
// s'affiche directement, sans mouvement ni confettis.

const or = (a = 1) => `rgb(var(--k-ambre-rgb) / ${a})`;
const orClair = (a = 1) => `rgb(var(--k-lu-ia-rgb) / ${a})`;
const orVif = (a = 1) => `rgb(var(--k-jaune-rgb) / ${a})`;
// Le brun des coutures et du mot « Record » : l'ambre assombri.
const brun = (a = 1) => `color-mix(in srgb, rgb(var(--k-ambre-rgb)) 28%, rgb(0 0 0 / ${a}))`;
const CLE_SON = "klocka:record-son";
const sonVoulu = () => { try { return localStorage.getItem(CLE_SON) !== "non"; } catch { return true; } };
const garderSon = (oui) => { try { localStorage.setItem(CLE_SON, oui ? "oui" : "non"); } catch { /* rien */ } };
const sansMouvement = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const semaineCourte = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

const STYLE = `
@keyframes krec-monte { 0% { transform: translateY(70px); opacity: 0 } 60% { transform: translateY(-8px); opacity: 1 } 80% { transform: translateY(3px) } 100% { transform: translateY(0); opacity: 1 } }
@keyframes krec-zoom { 0% { transform: scale(.55); opacity: 0 } 70% { transform: scale(1.04); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes krec-deroule { 0% { transform: scaleX(0) } 100% { transform: scaleX(1) } }
@keyframes krec-bout-g { 0% { transform: translateX(26px); opacity: 0 } 100% { transform: translateX(0); opacity: 1 } }
@keyframes krec-bout-d { 0% { transform: translateX(-26px); opacity: 0 } 100% { transform: translateX(0); opacity: 1 } }
@keyframes krec-parait { 0% { transform: translateY(6px); opacity: 0 } 100% { transform: translateY(0); opacity: 1 } }
@keyframes krec-voile { 0% { opacity: 0 } 100% { opacity: 1 } }
@keyframes krec-pulse { 0%, 100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.12); opacity: .95 } }
@keyframes krec-tourne { to { transform: rotate(360deg) } }
@keyframes krec-brille { 0%, 100% { text-shadow: 0 0 0 transparent; transform: scale(1) } 25%, 75% { text-shadow: 0 0 22px ${orVif(0.9)}, 0 0 4px ${orClair(1)}; transform: scale(1.08) } 50% { text-shadow: 0 0 0 transparent; transform: scale(1) } }
@keyframes krec-reflet { 0% { transform: translateX(-130%) skewX(-18deg) } 100% { transform: translateX(260%) skewX(-18deg) } }
@keyframes krec-scintille { 0%, 100% { transform: scale(.4) rotate(0); opacity: .15 } 50% { transform: scale(1) rotate(45deg); opacity: 1 } }
.krec-a { animation-fill-mode: both; animation-timing-function: cubic-bezier(.2,.8,.2,1) }
.krec-calme .krec-a, .krec-calme .krec-anim { animation: none !important; opacity: 1 !important; transform: none !important }
.krec-calme .krec-reflet { display: none !important }
`;

/** Les confettis : des rectangles et des ronds or, quelques-uns pervenche, qui tombent sans fin. */
function Confettis() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;
    const lire = (nom) => getComputedStyle(document.documentElement).getPropertyValue(`--k-${nom}-rgb`).trim().replace(/\s+/g, ", ");
    const teintes = [lire("ambre"), lire("lu-ia"), lire("jaune"), lire("ambre"), lire("lu-ia"), lire("pervenche")].filter(Boolean).map((t) => `rgb(${t})`);
    let w = 0;
    let h = 0;
    const taille = () => { w = canvas.width = window.innerWidth * devicePixelRatio; h = canvas.height = window.innerHeight * devicePixelRatio; };
    taille();
    window.addEventListener("resize", taille);
    const neuf = (haut) => ({
      x: Math.random() * w, y: haut ? -20 * devicePixelRatio : Math.random() * h,
      v: (0.6 + Math.random() * 1.4) * devicePixelRatio, d: (Math.random() - 0.5) * 0.6 * devicePixelRatio,
      a: Math.random() * Math.PI * 2, va: (Math.random() - 0.5) * 0.12, rond: Math.random() < 0.35,
      t: (3 + Math.random() * 4) * devicePixelRatio, c: teintes[Math.floor(Math.random() * teintes.length)] || "rgb(224, 164, 94)",
    });
    const morceaux = Array.from({ length: 90 }, () => neuf(false));
    let id = 0;
    const tour = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of morceaux) {
        m.y += m.v; m.x += m.d + Math.sin(m.y / 60) * 0.3; m.a += m.va;
        if (m.y > h + 20) Object.assign(m, neuf(true));
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.a);
        ctx.fillStyle = m.c;
        ctx.globalAlpha = 0.85;
        if (m.rond) { ctx.beginPath(); ctx.arc(0, 0, m.t / 2, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-m.t / 2, -m.t, m.t, m.t * 2);
        ctx.restore();
      }
      id = requestAnimationFrame(tour);
    };
    id = requestAnimationFrame(tour);
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", taille); };
  }, []);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />;
}

/** Une étoile à quatre branches qui scintille. */
function Etoile({ style, delai }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="krec-anim pointer-events-none absolute h-4 w-4" style={{ ...style, animation: `krec-scintille 2.4s ease-in-out ${delai}s infinite` }}>
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0 Z" fill={orClair(0.95)} />
    </svg>
  );
}

/** Le compteur qui monte de 0 à `n` entre 1,4 s et 2,7 s, en ralentissant. */
function Compteur({ n, calme }) {
  const [v, setV] = useState(calme ? n : 0);
  useEffect(() => {
    if (calme) { setV(n); return undefined; }
    let id = 0;
    const debut = performance.now() + 1400;
    const duree = 1300;
    const tour = (t) => {
      const x = Math.min(1, Math.max(0, (t - debut) / duree));
      setV(Math.round(n * (1 - (1 - x) ** 3)));
      if (x < 1) id = requestAnimationFrame(tour);
    };
    id = requestAnimationFrame(tour);
    return () => cancelAnimationFrame(id);
  }, [n, calme]);
  return (
    <span className="krec-anim inline-block text-[52px] font-medium leading-none tabular-nums" style={{ color: orClair(1), animation: "krec-brille 0.9s ease-in-out 2.7s both" }}>{v}</span>
  );
}

/**
 * Le portrait du record : halo, double bague, anneau d'or satiné, et la banderole « Record » en travers du bas. Dans la
 * pop-up, `a` donne à chaque pièce son animation ; sur la page Statistiques, il est posé, sans mouvement.
 */
export function PortraitRecord({ r, a = () => ({}), taille = 208, className = "" }) {
  const k = taille / 208;
  const px = (n) => `${Math.round(n * k)}px`;
  const initiale = (r.prenom || "?").charAt(0).toUpperCase();
  return (
    <div className={`relative mx-auto ${className}`} style={{ width: px(208), height: px(208) }}>
      <span aria-hidden className="krec-anim absolute rounded-full" style={{ inset: px(-24), background: `radial-gradient(circle, ${or(0.45)} 0%, transparent 65%)`, filter: "blur(6px)", animation: "krec-pulse 2.6s ease-in-out infinite" }} />
      <div className="krec-a relative h-full w-full" style={a("krec-zoom", 0.45, 0.6)}>
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ border: `1px solid ${or(0.55)}` }} />
        <span aria-hidden className="absolute overflow-hidden rounded-full" style={{ inset: px(6), background: `conic-gradient(from 210deg, ${or(1)}, ${orClair(1)}, ${or(0.8)}, ${orVif(0.9)}, ${or(1)}, ${orClair(1)}, ${or(1)})` }}>
          <span className="krec-anim absolute inset-0" style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${orClair(0.9)} 25deg, transparent 60deg)`, animation: "krec-tourne 3.2s linear infinite", mixBlendMode: "screen" }} />
        </span>
        <span className="absolute grid place-items-center overflow-hidden rounded-full bg-surface-pleine" style={{ inset: px(16), boxShadow: `0 0 0 2px ${or(0.4)}` }}>
          {r.photo ? <img src={r.photo} alt={r.prenom} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="font-medium" style={{ fontSize: px(56), color: orClair(1) }}>{initiale}</span>}
        </span>
      </div>

      {/* La banderole, en travers du bas de la photo : les bouts en queue d'aronde, puis le ruban qui se déroule du centre. */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: px(-12), height: px(42), width: px(280) }}>
        <span aria-hidden className="krec-a absolute left-0" style={{ ...a("krec-bout-g", 1.2, 0.35), top: px(10), height: px(32), width: px(58), background: or(0.75), clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 22% 50%)", filter: "brightness(.62)" }} />
        <span aria-hidden className="krec-a absolute right-0" style={{ ...a("krec-bout-d", 1.2, 0.35), top: px(10), height: px(32), width: px(58), background: or(0.75), clipPath: "polygon(0 0, 100% 0, 78% 50%, 100% 100%, 0 100%)", filter: "brightness(.62)" }} />
        <div className="krec-a absolute top-0 flex items-center justify-center gap-2 rounded-[3px]"
          style={{ ...a("krec-deroule", 0.9, 0.35), left: px(34), right: px(34), height: px(36), transformOrigin: "center", background: `linear-gradient(180deg, ${orClair(1)} 0%, ${or(1)} 55%, ${or(0.85)} 100%)`, boxShadow: "0 6px 14px -4px rgb(0 0 0 / .6)" }}>
          <span aria-hidden className="absolute inset-[3px] rounded-[2px]" style={{ border: `1px dashed ${brun(0.45)}` }} />
          <Trophy className="relative h-4 w-4" style={{ color: brun(0.9) }} strokeWidth={2} />
          <span className="relative font-semibold uppercase tracking-[0.3em]" style={{ fontSize: px(15), color: brun(0.9) }}>Record</span>
        </div>
      </div>
    </div>
  );
}

/** La carte du record en tête de la page Statistiques (22 nov. 2026, maquette de Jules) : le portrait posé, le nom, le chiffre et la semaine. */
export function CarteRecordPage({ r }) {
  if (!r) return null;
  return (
    <section aria-label="Record de fiches reçues" className="k-verre overflow-hidden px-5 pb-5 pt-6 text-center"
      style={{ background: `linear-gradient(180deg, ${or(0.14)} 0%, ${or(0.03)} 40%, transparent 65%)` }}>
      <PortraitRecord r={r} taille={176} />
      <p className="m-0 mt-8 text-[20px] font-medium text-encre">{r.prenom}</p>
      <div className="mt-4 grid grid-cols-2 border-t border-bord">
        <div className="flex flex-col items-center gap-1.5 border-r border-bord px-2 pt-4">
          <span className="text-[30px] font-medium leading-none tabular-nums text-encre">{r.fiches}</span>
          <span className="text-[12.5px] text-ardoise">{r.fiches > 1 ? "fiches reçues" : "fiche reçue"}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5 px-2 pt-4">
          <span className="text-[30px] font-medium leading-none text-encre">{semaineCourte(r.semaine)}</span>
          <span className="text-[12.5px] text-ardoise">semaine du record</span>
        </div>
      </div>
    </section>
  );
}

function Carte({ r, calme, son, sonBloque, onSon, onActiverSon, onRejouer, onFermer }) {
  const a = (nom, delai, duree = 0.6) => ({ animation: `${nom} ${duree}s cubic-bezier(.2,.8,.2,1) ${delai}s both` });
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="krec-titre" className="krec-a relative w-[400px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[24px] px-7 pb-7 pt-6 text-center"
      style={{ ...a("krec-monte", 0.15, 0.7), background: `linear-gradient(180deg, ${or(0.16)} 0%, ${or(0.04)} 38%, transparent 60%), rgb(var(--k-surface-pleine-rgb))`, border: `1px solid ${or(0.45)}`, boxShadow: `0 30px 80px -10px rgb(0 0 0 / .7), 0 0 0 1px ${orClair(0.06)} inset` }}>
      {/* Le reflet qui traverse la carte à 2,9 s. */}
      <span aria-hidden className="krec-reflet pointer-events-none absolute inset-y-0 left-0 w-1/3" style={{ background: `linear-gradient(90deg, transparent, ${orClair(0.16)}, transparent)`, animation: "krec-reflet 1.1s ease-in-out 2.9s both", transform: "translateX(-130%)" }} />

      {sonBloque && (
        <button type="button" onClick={onActiverSon} className="absolute left-4 top-4 inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] text-encre" style={{ borderColor: or(0.5), background: or(0.12) }}>
          <Volume2 className="h-3.5 w-3.5" />Activer le son
        </button>
      )}
      <button type="button" onClick={onSon} aria-label={son ? "Couper le son" : "Remettre le son"} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-encre" style={{ background: "rgb(0 0 0 / .35)", border: `1px solid ${or(0.25)}` }}>
        {son ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>

      <p id="krec-titre" className="m-0 mt-2 text-[12px] font-medium uppercase tracking-[0.2em]" style={{ color: orClair(1) }}>Record de l'équipe</p>

      <PortraitRecord r={r} a={a} className="mt-5" />

      <p className="krec-a m-0 mt-8 text-[24px] font-medium text-encre" style={a("krec-parait", 1.2, 0.4)}>{r.prenom}</p>

      <div className="mt-4 grid grid-cols-2" style={{ borderTop: `1px solid ${or(0.25)}` }}>
        <div className="flex flex-col items-center gap-2 px-2 pt-4" style={{ borderRight: `1px solid ${or(0.3)}` }}>
          <Compteur n={r.fiches} calme={calme} />
          <span className="text-[13px] text-ardoise">{r.fiches > 1 ? "fiches reçues" : "fiche reçue"}</span>
        </div>
        <div className="krec-a flex flex-col items-center gap-2 px-2 pt-4" style={a("krec-parait", 1.3, 0.4)}>
          <span className="text-[44px] font-medium leading-none text-encre">{semaineCourte(r.semaine)}</span>
          <span className="text-[13px] text-ardoise">semaine du record</span>
        </div>
      </div>

      <p className="m-0 mt-5 text-[13.5px] text-craie">Le record de fiches reçues en une semaine.<br />À qui le tour{"\u00a0"}?</p>

      <div className="mt-5 grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] gap-2.5">
        <button type="button" onClick={onRejouer} className="h-12 rounded-full border border-bord-vif text-[14px] text-encre hover:bg-encre/[0.05]" style={{ background: "transparent" }}>Rejouer</button>
        <button type="button" onClick={onFermer} className="h-12 rounded-full bg-pervenche text-[14px] font-medium text-sur-pervenche outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-pervenche/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-pleine">Voir les statistiques</button>
      </div>
    </div>
  );
}

/** Monte la pop-up quand le serveur dit qu'elle est à montrer ; la marque vue dès qu'elle s'ouvre. */
export default function RecordEquipe() {
  const navigate = useNavigate();
  // Un instant après l'arrivée : la page se charge d'abord, et sa mesure de chargement ne l'attend pas.
  const [pret, setPret] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPret(true), 1500); return () => clearTimeout(t); }, []);
  const { data } = useQuery({ queryKey: ["record-equipe"], queryFn: () => base44.request("GET", "/api/record-equipe"), enabled: pret, staleTime: Infinity, refetchOnWindowFocus: false, retry: false });
  const [record, setRecord] = useState(null);
  const [tour, setTour] = useState(0);
  const [son, setSon] = useState(sonVoulu);
  const [sonBloque, setSonBloque] = useState(false);
  const musique = useRef(null);
  const calme = sansMouvement();

  useEffect(() => {
    if (!data?.montrer || record) return;
    setRecord(data.record);
    base44.request("POST", "/api/record-equipe/vu").catch(() => {});
  }, [data, record]);

  // La musique, à chaque tour (ouverture, Rejouer, Activer le son).
  useEffect(() => {
    if (!record) return undefined;
    const m = jouerRecord({ muet: !son, surDeblocage: () => setSonBloque(false) });
    musique.current = m;
    setSonBloque(m.bloque);
    return () => m.arreter();
  }, [record, tour]);

  useEffect(() => {
    if (!record) return undefined;
    const clavier = (e) => { if (e.key === "Escape") setRecord(null); };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [record]);

  if (!record) return null;
  const basculerSon = () => {
    const oui = !son;
    setSon(oui);
    garderSon(oui);
    musique.current?.muet(!oui);
  };
  const fermer = () => { setRecord(null); navigate(createPageUrl("Statistiques")); };

  return createPortal(
    <div className={`fixed inset-0 z-[200] grid place-items-center p-4 ${calme ? "krec-calme" : ""}`}>
      <style>{STYLE}</style>
      <div aria-hidden className="krec-a absolute inset-0" onClick={() => setRecord(null)}
        style={{ animation: "krec-voile .5s ease-out both", backdropFilter: "blur(10px) brightness(.55)", WebkitBackdropFilter: "blur(10px) brightness(.55)", background: `radial-gradient(circle at 50% 45%, ${or(0.22)} 0%, rgb(0 0 0 / .55) 55%, rgb(0 0 0 / .7) 100%)` }} />
      {!calme && <Confettis />}
      <div key={tour} className="relative">
        <Etoile style={{ left: -26, top: 40 }} delai={0} />
        <Etoile style={{ right: -22, top: -8 }} delai={0.8} />
        <Etoile style={{ left: -14, bottom: 120 }} delai={1.5} />
        <Etoile style={{ right: -28, bottom: 200 }} delai={0.4} />
        <Carte r={record} calme={calme} son={son} sonBloque={sonBloque}
          onSon={basculerSon}
          onActiverSon={() => { setSon(true); garderSon(true); setTour((t) => t + 1); }}
          onRejouer={() => setTour((t) => t + 1)}
          onFermer={fermer} />
      </div>
    </div>,
    document.body,
  );
}
