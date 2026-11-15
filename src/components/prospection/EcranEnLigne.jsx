import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calculator, GripHorizontal, Mic, PhoneOff, X } from "lucide-react";
import { chiffresEntendus } from "@/lib/chiffres-entendus";
import { calculatrice } from "@/lib/calculatrice";
import seuils from "../../../server/ak/seuils.json";
import { CARTE, ETIQUETTE } from "@/components/prospection/StyleAppel";

// L'écran d'un appel en cours, rappel ou appel rapide (maquette de Jules, 21 oct. 2026) : tout est centré dès
// l'appel. En tête, l'état (pastille, chrono, Essai), le nom et l'agence, le micro en simple contour à la couleur
// choisie, « Raccrocher ». Dessous, la transcription en direct à gauche (qui parle, les chiffres et les lieux
// surlignés), la calculatrice et les notes à droite.

const chrono = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const pct = (n) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

/** Pure : le nom et l'agence que la personne a donnés en se présentant, ou null. */
export function presentation(texte) {
  const t = String(texte || "");
  const nom = "(\\p{Lu}[\\p{L}'-]+(?:\\s+\\p{Lu}[\\p{L}'-]+)?)";
  const agence = "((?:\\p{Lu}[\\p{L}'&-]*)(?:\\s+(?:\\p{Lu}[\\p{L}'&-]*|de|du|des|la))*(?:\\s+\\p{Lu}[\\p{L}'&-]*)?)";
  const a = t.match(new RegExp(`${nom},?\\s+(?:de\\s+l'agence|de\\s+chez|de\\s+l'|chez)\\s*${agence}`, "u"));
  if (a) return { nom: a[1], agence: a[2].trim() };
  const b = t.match(new RegExp(`(?:Bonjour|Allô)[,.]?\\s+${nom},\\s+${agence}`, "u"));
  if (b && /\s/.test(b[1])) return { nom: b[1], agence: b[2].trim() };
  return null;
}

// Ce qui compte dans une phrase : les montants, les voies, le bail, le bien.
const MARQUES = [
  /\b\d[\d\s .]*(?:,\d+)?\s*(?:euros?|€)(?:\s+(?:par an|par mois|HT|hors taxes|l'an))?/giu,
  /\b(?:[\p{L}-]+\s+){0,4}(?:mille|cents?)\s+euros(?:\s+(?:par an|par mois))?/giu,
  /\b(?:rue|avenue|boulevard|place|cours|quai|allée)\s+(?:de la\s+|de l'|du\s+|des\s+|de\s+)?\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?/gu,
  /\bbail\s+[^,.;?!]{3,40}/giu,
  /\b(?:murs|locaux?)\s+d['e]\s*(?:une?\s+)?[^,.;?!]{3,28}/giu,
];

/** Pure : le texte coupé en morceaux, ceux qui comptent marqués. */
export function surligner(texte) {
  const t = String(texte || "");
  const zones = [];
  for (const re of MARQUES) for (const m of t.matchAll(re)) zones.push([m.index, m.index + m[0].trimEnd().length]);
  zones.sort((x, y) => x[0] - y[0]);
  const fusion = [];
  for (const z of zones) { const d = fusion[fusion.length - 1]; if (d && z[0] <= d[1]) d[1] = Math.max(d[1], z[1]); else fusion.push([...z]); }
  const out = [];
  let i = 0;
  for (const [a, b] of fusion) { if (a > i) out.push({ t: t.slice(i, a) }); out.push({ t: t.slice(a, b), marque: true }); i = b; }
  if (i < t.length) out.push({ t: t.slice(i) });
  return out;
}

export function EnteteEnLigne({ etat, secondes, essai = false, nom, sousTitre, ecoute = true, onRaccrocher, occupe = false, raccrocher = "Raccrocher", action = null, onAbandonner = null }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie">
        <span className={`h-1.5 w-1.5 rounded-full bg-alerte ${ecoute ? "animate-pulse" : ""}`} />
        {etat}<span className="text-brume">·</span><span className="tabular-nums">{chrono(secondes)}</span>
        {essai && <span className="rounded-full bg-ambre/15 px-2 py-0.5 text-[11.5px] text-ambre">Essai</span>}
      </span>
      <h2 className="m-0 text-[34px] font-normal leading-[1.15] tracking-[-0.02em] text-encre max-md:text-[28px]">{nom}</h2>
      {sousTitre && <p className="m-0 text-[14px] text-ardoise">{sousTitre}{action}</p>}
      <div className="mt-1 flex items-center gap-3">
        {/* Le micro, en simple contour à la couleur choisie : il dit qu'on écoute, il ne remplit rien. */}
        <span role="img" aria-label={ecoute ? "Micro actif" : "Micro coupé"} className={`grid h-11 w-11 place-items-center rounded-full border ${ecoute ? "k-anneau border-menthe text-menthe" : "border-bord-doux text-brume"}`}>
          <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <button type="button" onClick={onRaccrocher} disabled={occupe} className="inline-flex h-11 items-center gap-2 rounded-full bg-alerte px-5 text-[14.5px] text-fond transition-opacity hover:opacity-90 disabled:opacity-50">
          <PhoneOff className="h-4 w-4" strokeWidth={2} />{raccrocher}
        </button>
        {/* Abandonner (22 oct. 2026, Jules) : la croix, comme au Mode appel ; rien n'est fait, la transcription s'efface. */}
        {onAbandonner && (
          <button type="button" onClick={onAbandonner} disabled={occupe} aria-label="Abandonner l'appel" title="Abandonner : rien n'est fait, la transcription s'efface"
            className="grid h-11 w-11 place-items-center rounded-full border border-bord-doux text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        )}
      </div>
    </div>
  );
}

/** La transcription en direct : qui parle (quand on le sait), le texte, ce qui compte surligné. */
export function TranscriptionEnLigne({ morceaux, interlocuteur = "Agent", attend = false }) {
  const fin = useRef(null);
  const textes = morceaux.filter((x) => x.texte);
  useEffect(() => { fin.current?.scrollIntoView({ block: "nearest" }); }, [textes.length]);
  const enCours = attend || morceaux.some((x) => x.etat === "envoi");
  return (
    <div className={`flex min-h-[380px] flex-col gap-4 p-6 max-md:p-5 ${CARTE}`}>
      <span className={ETIQUETTE}>Transcription en direct</span>
      <div className="flex max-h-[520px] flex-col gap-4 overflow-y-auto pr-1">
        {!textes.length && <p className="m-0 text-[14px] text-brume">La transcription apparaît ici, quelques secondes après chaque phrase.</p>}
        {textes.map((x) => {
          const vous = x.qui === "vous";
          return (
            <div key={x.i} className={x.qui ? "grid grid-cols-[66px_minmax(0,1fr)] gap-3" : ""}>
              {x.qui && <span className={`pt-0.5 text-[12.5px] ${vous ? "text-ardoise" : "text-menthe"}`}>{vous ? "Vous" : interlocuteur}</span>}
              <p className={`m-0 text-[15px] leading-[1.6] [text-wrap:pretty] ${vous ? "text-craie" : "text-encre"}`}>
                {surligner(x.texte).map((p, k) => (p.marque ? <span key={k} className="rounded-[6px] bg-relief px-1 py-0.5">{p.t}</span> : <React.Fragment key={k}>{p.t}</React.Fragment>))}
              </p>
            </div>
          );
        })}
        {enCours && <span className="flex gap-1 pl-[78px] max-md:pl-0" aria-label="Transcription en cours">{[0, 1, 2].map((k) => <span key={k} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ardoise" style={{ animationDelay: `${k * 0.2}s` }} />)}</span>}
        <span ref={fin} />
      </div>
    </div>
  );
}

const lireNombre = (s) => { const n = Number(String(s).replace(/[\s  €]/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
const ecrire = (n) => (n == null ? "" : Math.round(n).toLocaleString("fr-FR"));

function ChampEuros({ libelle, valeur, onChange, vide, unite = "€" }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12.5px] text-ardoise">{libelle}</span>
      <span className="flex h-12 items-center gap-2 rounded-[12px] border border-bord-doux px-3.5 focus-within:border-menthe">
        <input inputMode="decimal" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={vide}
          className="w-full min-w-0 bg-transparent text-[16px] tabular-nums text-encre outline-none placeholder:text-brume" />
        <span className="flex-none text-[13px] text-brume">{unite}</span>
      </span>
    </label>
  );
}

// La calculatrice en fenêtre de verre (15 nov. 2026, Jules : « un truc glace, pas dedans ; on peut la déplacer,
// l'agrandir, la mettre tout autour ; plus simple, enlève prix maximum pour viser ») : posée au-dessus de la page, on
// la tire par sa barre, on l'agrandit par son coin ; sa place et sa taille sont retenues dans le navigateur.
// Cachée tant qu'aucun chiffre n'est entendu (14 nov. 2026) : l'icône l'ouvre ; un loyer ou un prix dit pendant l'appel
// l'ouvre d'office, déjà remplie, le rendement calculé. Fermée à la main, elle se rouvre au chiffre suivant.
const CLE_CADRE = "klocka.calculatrice.cadre.2";
const MIN_L = 260;
const MIN_H = 200;
const borner = (c) => {
  const L = Math.max(MIN_L, Math.min(c.l, window.innerWidth - 16));
  const H = Math.max(MIN_H, Math.min(c.h, window.innerHeight - 16));
  return { l: L, h: H, x: Math.max(8, Math.min(c.x, window.innerWidth - L - 8)), y: Math.max(8, Math.min(c.y, window.innerHeight - H - 8)) };
};
const cadreDepart = () => {
  try { const c = JSON.parse(localStorage.getItem(CLE_CADRE) || "null"); if (c && Number.isFinite(c.x)) return borner(c); } catch { /* place par défaut */ }
  // Par défaut en bas à droite, au-dessus de la bulle de l'assistant : jamais sur Raccrocher, en haut de la carte.
  // Sur un écran moins haut, elle raccourcit pour rester sous l'en-tête de la carte d'appel (Raccrocher), jamais dessus.
  const h = Math.max(MIN_H, Math.min(600, window.innerHeight - 104 - 260));
  return borner({ l: 380, h, x: window.innerWidth - 380 - 32, y: window.innerHeight - h - 104 });
};

function FenetreCalculatrice({ lu, saisi, setSaisi, onFermer }) {
  const [cadre, setCadre] = useState(cadreDepart);
  const ref = useRef(null);
  const tire = useRef(null);
  useEffect(() => { try { localStorage.setItem(CLE_CADRE, JSON.stringify(cadre)); } catch { /* navigation privée */ } }, [cadre]);
  // L'agrandissement par le coin (resize CSS) : la taille lue et retenue.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(() => setCadre((c) => (Math.abs(c.l - el.offsetWidth) > 1 || Math.abs(c.h - el.offsetHeight) > 1 ? { ...c, l: el.offsetWidth, h: el.offsetHeight } : c)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    const recaler = () => setCadre((c) => borner(c));
    window.addEventListener("resize", recaler);
    return () => window.removeEventListener("resize", recaler);
  }, []);
  const prendre = (e) => {
    if (e.target.closest("button")) return;
    tire.current = { dx: e.clientX - cadre.x, dy: e.clientY - cadre.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const tirer = (e) => { if (tire.current) setCadre((c) => borner({ ...c, x: e.clientX - tire.current.dx, y: e.clientY - tire.current.dy })); };
  const lacher = () => { tire.current = null; };

  const loyer = saisi.loyer_an != null ? lireNombre(saisi.loyer_an) : lu.loyer_an;
  const prixFai = saisi.prix != null ? lireNombre(saisi.prix) : lu.prix;
  const netVendeur = saisi.net_vendeur != null ? lireNombre(saisi.net_vendeur) : null;
  const nego = saisi.nego != null ? Math.min(90, Math.max(0, Number(String(saisi.nego).replace(",", ".")) || 0)) : 0;
  const c = calculatrice({ loyer, prixFai, netVendeur, nego }, seuils.frais_acquisition_pct);
  const pctCourt = (n) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  return createPortal(
    <div ref={ref} role="dialog" aria-label="Calculatrice"
      className="k-verre fixed z-[60] flex flex-col overflow-hidden !rounded-[20px] shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-200 animate-in fade-in-0 zoom-in-95"
      style={{ left: cadre.x, top: cadre.y, width: cadre.l, height: cadre.h, minWidth: MIN_L, minHeight: MIN_H, resize: "both" }}>
      {/* La barre : la poignée à gauche, « Calculatrice » au milieu dans la fonte des titres de page, la croix à droite. */}
      <div onPointerDown={prendre} onPointerMove={tirer} onPointerUp={lacher} onPointerCancel={lacher}
        className="grid flex-none cursor-grab touch-none select-none grid-cols-[28px_1fr_28px] items-center px-3 pb-2 pt-3 active:cursor-grabbing">
        <GripHorizontal className="h-4 w-4 text-brume" aria-hidden />
        <span className="text-center text-[20px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">Calculatrice</span>
        <button type="button" onClick={onFermer} aria-label="Fermer la calculatrice" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <ChampEuros libelle="Loyer annuel HT" valeur={saisi.loyer_an ?? ecrire(lu.loyer_an)} onChange={(v) => setSaisi((x) => ({ ...x, loyer_an: v }))} vide="À demander" />
          <ChampEuros libelle="Prix FAI" valeur={saisi.prix ?? ecrire(lu.prix)} onChange={(v) => setSaisi((x) => ({ ...x, prix: v }))} vide="À demander" />
          <ChampEuros libelle="Prix net vendeur" valeur={saisi.net_vendeur ?? ""} onChange={(v) => setSaisi((x) => ({ ...x, net_vendeur: v }))} vide="Facultatif" />
          <ChampEuros libelle="Négociation" valeur={saisi.nego ?? ""} onChange={(v) => setSaisi((x) => ({ ...x, nego: v }))} vide="0" unite="%" />
        </div>
        {c.prixNegocie != null && <p className="m-0 px-1 text-right text-[12.5px] text-ardoise">Prix négocié : <span className="tabular-nums text-craie">{euros(c.prixNegocie)}</span></p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center justify-center gap-1 rounded-[14px] border border-bord-doux px-3 py-3">
            <span className="text-[12.5px] text-ardoise">Rendement brut</span>
            <span className="text-[26px] font-normal leading-none tabular-nums text-encre">{c.brut != null ? pct(c.brut) : "—"}</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-1 rounded-[14px] border border-bord-doux px-3 py-3" title={`Acte en main : le prix majoré de ${String(seuils.frais_acquisition_pct).replace(".", ",")} % de frais d'acquisition`}>
            <span className="text-[12.5px] text-ardoise">Rendement net</span>
            <span className="text-[26px] font-normal leading-none tabular-nums text-encre">{c.net != null ? pct(c.net) : "—"}</span>
          </div>
        </div>
        {/* Les quatre demi-points au-dessus du rendement brut : le prix FAI qui les donne, et la négociation à obtenir. */}
        <div className="flex flex-col">
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2 px-1 pb-1 text-[12px] text-brume">
            <span>Rendement brut</span><span className="text-right">Prix FAI</span><span className="text-right">Négociation</span>
          </div>
          {c.paliers.map((x) => (
            <div key={x.taux} className="grid grid-cols-[1fr_1.4fr_1fr] items-baseline gap-2 border-t border-trait px-1 py-2 text-[14px]">
              <span className="tabular-nums text-craie">{pctCourt(x.taux)}</span>
              <span className="text-right tabular-nums text-encre">{x.prix != null ? euros(x.prix) : "—"}</span>
              <span className={`text-right tabular-nums ${x.nego == null ? "text-brume" : "text-encre"}`}>{x.nego == null ? "—" : `−${pctCourt(x.nego)}`}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function CalculatriceEnLigne({ textes }) {
  const lu = useMemo(() => chiffresEntendus(textes), [textes.join("\n")]);
  const [saisi, setSaisi] = useState({});
  const [choix, setChoix] = useState(null);
  const entendu = lu.loyer_an != null || lu.prix != null;
  const cle = `${lu.loyer_an ?? ""}|${lu.prix ?? ""}`;
  useEffect(() => { if (entendu) setChoix(null); }, [cle]);
  const ouverte = choix ?? entendu;
  return (
    <div className="flex justify-end">
      <button type="button" onClick={() => setChoix(!ouverte)} aria-pressed={ouverte} aria-label={ouverte ? "Fermer la calculatrice" : "Ouvrir la calculatrice"} title="Calculatrice : elle s'ouvre seule dès qu'un loyer ou un prix est dit"
        className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${ouverte ? "border-menthe/60 text-menthe" : "border-bord-doux text-ardoise hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
        <Calculator className="h-4 w-4" />
      </button>
      {ouverte && <FenetreCalculatrice lu={lu} saisi={saisi} setSaisi={setSaisi} onFermer={() => setChoix(false)} />}
    </div>
  );
}

/** Les notes de l'appel, en carte. */
export function NotesEnLigne({ valeur, onChange, placeholder = "Ce que le micro capte mal : email, numéro, orthographe d'un nom…" }) {
  return (
    <label className={`flex flex-col gap-2 p-5 ${CARTE}`}>
      <span className={ETIQUETTE}>Notes</span>
      <textarea value={valeur} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder}
        className="w-full resize-y bg-transparent text-[14.5px] leading-[1.55] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
    </label>
  );
}
