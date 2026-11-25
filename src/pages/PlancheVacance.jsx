import React, { useState } from "react";
import { useUser } from "@/components/providers/UserProvider";
import { ClassementVacance } from "@/components/outils/visuels";
import { REPERES_VACANCE, lignesVacance, phraseVacance } from "@/lib/vacance-reperes";
import { VERRE } from "@/lib/verre";

// La planche du Signal de vacance (25 nov. 2026, Jules : « une planche pour bien voir que les trucs du bas, c'est les
// moyennes françaises »). Quatre dessins de la même case, avec trois taux de rue à essayer : sous la moyenne, autour,
// au-dessus de 20 %. Réservée à l'équipe, hors menu. B choisi le 25 nov. 2026 (Jules : « B oui »), en place dans
// BlocEmplacement (MarcheAffine).

const TAUX = [["4,7 %", 4.7], ["12,5 %", 12.5], ["23 %", 23]];
const v = (x) => String(x).replace(".", ",");
const echelle = (t) => Math.max(30, Math.ceil(t / 10) * 10);
const pos = (x, haut) => `${Math.max(0, Math.min(100, (x / haut) * 100))}%`;
const phrase = (t) => { const p = phraseVacance(t); return p ? p.charAt(0).toUpperCase() + p.slice(1) : null; };

/** L'en-tête commun : le libellé, le taux en 20 px, la phrase des locaux vides. */
function Tete({ t }) {
  return (
    <>
      <p className="m-0 flex items-center gap-2.5 text-[12.5px] text-brume"><span className="h-1.5 w-1.5 rounded-full bg-menthe" />Signal de vacance</p>
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[20px] leading-[1.4] tabular-nums text-encre">{v(t)} %</p>
        <p className="m-0 text-[13px] text-ardoise">{Math.round(t * 0.43)} locaux vides sur 43 dans la rue</p>
      </div>
    </>
  );
}

/** A : la rue et sa phrase, un filet, puis « Moyennes en France · Codata » et les quatre barres (le dessin en place). */
function DessinA({ t }) {
  const haut = echelle(t);
  return (
    <div className="mt-auto flex flex-col gap-4 pt-4">
      <div className="flex flex-col gap-2">
        <ClassementVacance lignes={[{ nom: "La rue", taux: t, rue: true }]} max={haut} axe={false} />
        <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">{phrase(t)} · source Codata</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-trait pt-4">
        <p className="m-0 text-[12.5px] text-brume">Moyennes en France · Codata</p>
        <ClassementVacance lignes={lignesVacance(null)} max={haut} />
      </div>
    </div>
  );
}

/** B : les moyennes dans un encadré à part, un trait pointillé y reporte la rue. */
function DessinB({ t }) {
  const haut = echelle(t);
  return (
    <div className="mt-auto flex flex-col gap-3 pt-4">
      <ClassementVacance lignes={[{ nom: "La rue", taux: t, rue: true }]} max={haut} axe={false} />
      <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">{phrase(t)}</p>
      <div className="rounded-champ bg-relief p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="m-0 text-[12.5px] text-encre">En France, en moyenne</p>
          <p className="m-0 text-[11.5px] text-brume">Codata, 2025</p>
        </div>
        <div className="relative">
          <ClassementVacance lignes={lignesVacance(null)} max={haut} />
          {/* La rue reportée sur les moyennes : la colonne des barres commence après les 170 px du nom. */}
          <div className="pointer-events-none absolute inset-y-0 left-[182px] right-[64px] max-md:left-[132px] max-md:right-[60px]">
            <span className="absolute -top-1 bottom-5 border-l border-dashed border-menthe" style={{ left: pos(t, haut) }} />
            <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap text-[11px] text-menthe" style={{ left: pos(t, haut) }}>la rue</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** C : une seule règle ; la rue en marque au-dessus, les moyennes en repères sous l'axe, nommées. */
function DessinC({ t }) {
  const haut = echelle(t);
  // Le plus haut au plus près de l'axe : un trait ne traverse pas le nom d'un autre repère.
  const reperes = [...REPERES_VACANCE].sort((a, b) => b.taux - a.taux);
  return (
    <div className="mt-auto flex flex-col gap-3 pt-6">
      <div className="relative mx-1 h-[150px]">
        <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-full bg-menthe px-2 py-0.5 text-[12px] tabular-nums text-sur-menthe" style={{ left: pos(t, haut) }}>La rue · {v(t)} %</span>
        <span className="absolute top-[22px] h-[14px] w-px bg-menthe" style={{ left: pos(t, haut) }} />
        <div className="absolute inset-x-0 top-[36px] h-2 rounded-full bg-encre/[0.06]" />
        <div className="absolute left-0 top-[36px] h-2 rounded-full bg-menthe" style={{ width: pos(t, haut) }} />
        {reperes.map((r, i) => (
          <React.Fragment key={r.nom}>
            <span className="absolute top-[46px] w-px bg-ardoise/60" style={{ left: pos(r.taux, haut), height: 10 + i * 22 }} />
            <span className={`absolute whitespace-nowrap text-[11.5px] text-ardoise ${r.taux / haut > 0.6 ? "-translate-x-full pr-1.5" : "pl-1.5"}`} style={{ left: pos(r.taux, haut), top: 46 + i * 22 }}>
              {r.nom} {v(r.taux)} %
            </span>
          </React.Fragment>
        ))}
      </div>
      <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">{phrase(t)}. Sous l'axe : les moyennes françaises (Codata, 2025).</p>
    </div>
  );
}

/** D : pas de barres pour les moyennes ; l'écart de la rue à chacune, en points. */
function DessinD({ t }) {
  const haut = echelle(t);
  return (
    <div className="mt-auto flex flex-col gap-3 pt-4">
      <ClassementVacance lignes={[{ nom: "La rue", taux: t, rue: true }]} max={haut} />
      <div className="flex flex-col">
        <p className="m-0 pb-2 text-[12.5px] text-brume">La rue face aux moyennes françaises · Codata</p>
        {[...REPERES_VACANCE].sort((a, b) => a.taux - b.taux).map((r) => {
          const e = Math.round((t - r.taux) * 10) / 10;
          return (
            <div key={r.nom} className="flex items-baseline justify-between gap-3 border-t border-trait py-2">
              <span className="min-w-0 truncate text-[13px] text-craie">{r.nom} <span className="tabular-nums text-ardoise">{v(r.taux)} %</span></span>
              <span className={`whitespace-nowrap text-[13px] tabular-nums ${e <= 0 ? "text-menthe" : "text-alerte"}`}>{e > 0 ? "+" : ""}{v(e)} pt{Math.abs(e) >= 2 ? "s" : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DESSINS = [
  ["A", "Deux blocs", "La rue et sa phrase, un filet, puis un titre « Moyennes en France · Codata » sur les quatre barres. Le dessin en place.", DessinA],
  ["B", "Encadré à part", "Les moyennes dans un encadré teinté, titré « En France, en moyenne » ; un pointillé y reporte la rue.", DessinB],
  ["C", "Une seule règle", "Un axe : la rue en marque au-dessus, les moyennes nommées en repères dessous.", DessinC],
  ["D", "L'écart en points", "La rue en barre ; les moyennes en lignes de texte, avec l'écart de la rue à chacune.", DessinD],
];

export default function PlancheVacance() {
  const user = useUser();
  const [t, setT] = useState(4.7);
  if (user && user.role !== "admin") return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe Klocka.</p>;
  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-6 px-6 py-8 max-md:px-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-[24px] font-normal text-encre">Signal de vacance</h1>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">Quatre dessins de la case, pour que les moyennes françaises ne se lisent pas comme la zone de la rue.</p>
        </div>
        <div role="group" aria-label="Taux de la rue" className="flex items-center gap-1 rounded-full border border-trait p-1">
          {TAUX.map(([nom, x]) => (
            <button key={nom} type="button" onClick={() => setT(x)} aria-pressed={t === x}
              className={`h-8 rounded-full px-3.5 text-[13px] tabular-nums transition-colors ${t === x ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={t === x ? undefined : { background: "transparent" }}>
              {nom}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {DESSINS.map(([lettre, nom, note, Dessin]) => (
          <div key={lettre} className="flex min-w-0 flex-col gap-2.5">
            <div className="px-1">
              <p className="m-0 text-[15px] text-encre">{lettre} · {nom}</p>
              <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-ardoise">{note}</p>
            </div>
            <div className={`${VERRE} flex min-h-[420px] flex-col gap-3 p-5`}>
              <Tete t={t} />
              <Dessin t={t} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
