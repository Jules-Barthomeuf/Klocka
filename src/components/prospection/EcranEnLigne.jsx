import React, { useEffect, useMemo, useRef, useState } from "react";
import { Mic, PhoneOff } from "lucide-react";
import { chiffresEntendus, calculer } from "@/lib/chiffres-entendus";
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

export function EnteteEnLigne({ etat, secondes, essai = false, nom, sousTitre, ecoute = true, onRaccrocher, occupe = false, raccrocher = "Raccrocher", action = null, detail = null, secondaires = null }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie">
        <span className={`h-1.5 w-1.5 rounded-full bg-alerte ${ecoute ? "animate-pulse" : ""}`} />
        {etat}<span className="text-brume">·</span><span className="tabular-nums">{chrono(secondes)}</span>
        {essai && <span className="rounded-full bg-ambre/15 px-2 py-0.5 text-[11.5px] text-ambre">Essai</span>}
      </span>
      <h2 className="m-0 text-[34px] font-normal leading-[1.15] tracking-[-0.02em] text-encre max-md:text-[28px]">{nom}</h2>
      {sousTitre && <p className="m-0 text-[14px] text-ardoise">{sousTitre}{action}</p>}
      {detail}
      <div className="mt-1 flex items-center gap-3">
        {/* Le micro, en simple contour à la couleur choisie : il dit qu'on écoute, il ne remplit rien. */}
        <span role="img" aria-label={ecoute ? "Micro actif" : "Micro coupé"} className={`grid h-11 w-11 place-items-center rounded-full border ${ecoute ? "k-anneau border-menthe text-menthe" : "border-bord-doux text-brume"}`}>
          <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <button type="button" onClick={onRaccrocher} disabled={occupe} className="inline-flex h-11 items-center gap-2 rounded-full bg-alerte px-5 text-[14.5px] text-fond transition-opacity hover:opacity-90 disabled:opacity-50">
          <PhoneOff className="h-4 w-4" strokeWidth={2} />{raccrocher}
        </button>
      </div>
      {/* Les gestes propres à un écran (Mode appel : rappeler, message laissé, annuler), en petites pilules sous la rangée. */}
      {secondaires && <div className="flex flex-wrap items-center justify-center gap-2 [&>button]:whitespace-nowrap">{secondaires}</div>}
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
      <span className={ETIQUETTE}>TRANSCRIPTION EN DIRECT</span>
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

function ChampEuros({ libelle, valeur, onChange, vide }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12.5px] text-ardoise">{libelle}</span>
      <span className="flex h-12 items-center gap-2 rounded-[12px] border border-bord-doux px-3.5 focus-within:border-menthe">
        <input inputMode="decimal" value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={vide}
          className="w-full min-w-0 bg-transparent text-[16px] tabular-nums text-encre outline-none placeholder:text-brume" />
        <span className="flex-none text-[13px] text-brume">€</span>
      </span>
    </label>
  );
}

/** La calculatrice, en carte : le loyer et le prix entendus (corrigeables), le rendement brut, le prix pour viser 5, 6, 7 %. */
export function CalculatriceEnLigne({ textes }) {
  const lu = useMemo(() => chiffresEntendus(textes), [textes.join("\n")]);
  const [saisi, setSaisi] = useState({});
  const loyer = saisi.loyer_an != null ? lireNombre(saisi.loyer_an) : lu.loyer_an;
  const prix = saisi.prix != null ? lireNombre(saisi.prix) : lu.prix;
  const r = calculer({ prix, loyer_an: loyer, surface: null }, seuils);
  const repris = saisi.loyer_an == null && lu.loyer_an != null;
  return (
    <div className={`flex flex-col gap-4 p-5 ${CARTE}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={ETIQUETTE}>CALCULATRICE</span>
        {repris && <span className="text-[12px] text-menthe">Loyer repris de l'appel</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ChampEuros libelle="Loyer annuel HT" valeur={saisi.loyer_an ?? ecrire(lu.loyer_an)} onChange={(v) => setSaisi((s) => ({ ...s, loyer_an: v }))} vide="À demander" />
        <ChampEuros libelle="Prix FAI" valeur={saisi.prix ?? ecrire(lu.prix)} onChange={(v) => setSaisi((s) => ({ ...s, prix: v }))} vide="À demander" />
      </div>
      <div className="flex items-center justify-between rounded-[14px] bg-relief px-4 py-4">
        <span className="text-[14px] text-encre">Rendement brut</span>
        <span className="text-[16px] tabular-nums text-encre">{r.rendement_brut != null ? pct(r.rendement_brut) : "—"}</span>
      </div>
      <div className="flex flex-col">
        <span className="pb-1 text-[12.5px] text-ardoise">Prix maximum pour viser</span>
        {[5, 6, 7].map((t) => (
          <div key={t} className="flex items-baseline justify-between border-t border-trait py-2.5 text-[14px] first-of-type:border-t-0">
            <span className="text-craie">{t} %</span>
            <span className="tabular-nums text-encre">{loyer ? euros((loyer / t) * 100) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Les notes de l'appel, en carte. */
export function NotesEnLigne({ valeur, onChange, placeholder = "Ce que le micro capte mal : email, numéro, orthographe d'un nom…" }) {
  return (
    <label className={`flex flex-col gap-2 p-5 ${CARTE}`}>
      <span className={ETIQUETTE}>NOTES</span>
      <textarea value={valeur} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder}
        className="w-full resize-y bg-transparent text-[14.5px] leading-[1.55] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
    </label>
  );
}
