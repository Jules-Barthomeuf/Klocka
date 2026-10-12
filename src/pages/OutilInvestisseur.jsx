import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import FondHalo from "@/components/projet/FondHalo";
import RendezVousFondateur, { useVisiteSimulateur } from "@/components/simulator/RendezVousFondateur";
import { LEAD_MAGNETS, valeursParDefaut } from "@/lib/lead-magnets";

// Les dix lead magnets des newsletters (9 oct. 2026), une seule page publique :
// /OutilInvestisseur?o=rendement-net (le jeton k du lien en plus). Sans « o »,
// la liste des outils. Le calcul se fait dans le navigateur (lead-magnets.js),
// les hypothèses sous le résultat. Avec le jeton, l'outil et son résultat se
// rangent dans la fiche du contact ; sans jeton, rien n'est noté.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const pastille = (actif) => `inline-flex min-h-9 items-center rounded-full px-4 py-1.5 text-left text-[13.5px] transition-colors ${actif ? "bg-menthe text-sur-menthe" : "border border-trait text-craie hover:border-menthe hover:text-encre"}`;

function Nombre({ valeur, onChange, unite }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input inputMode="decimal" value={valeur ?? ""} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
        className="h-11 w-full bg-transparent text-[15px] tabular-nums text-encre outline-none max-md:text-[16px]" />
      {unite && <span className="flex-none text-[13.5px] text-ardoise">{unite}</span>}
    </div>
  );
}

/** Un champ : un nombre, un choix parmi plusieurs, ou une question oui / non. */
function Champ({ c, valeur, onChange }) {
  return (
    <div className="mb-5">
      <span className="mb-2 block text-[14px] leading-[1.45] text-encre">{c.label}</span>
      {c.type === "oui_non" ? (
        <div className="flex gap-2">
          {[[true, "Oui"], [false, "Non"]].map(([v, mot]) => (
            <button key={mot} type="button" onClick={() => onChange(v)} aria-pressed={valeur === v} className={pastille(valeur === v)} style={valeur === v ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      ) : c.type === "choix" ? (
        <div className="flex flex-wrap gap-2">
          {c.choix.map((mot, i) => (
            <button key={mot} type="button" onClick={() => onChange(i)} aria-pressed={valeur === i} className={pastille(valeur === i)} style={valeur === i ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      ) : <Nombre valeur={valeur} onChange={onChange} unite={c.unite} />}
      {c.aide && <p className="m-0 mt-1.5 text-[12.5px] leading-[1.5] text-brume">{c.aide}</p>}
    </div>
  );
}

function Outil({ outil }) {
  const [v, setV] = useState(() => valeursParDefaut(outil));
  const [vu, setVu] = useState(false);
  const complet = outil.champs.every((c) => v[c.cle] != null && v[c.cle] !== "");
  const r = useMemo(() => (complet ? outil.calcul(v) : null), [complet, outil, v]);
  const { visite, qui } = useVisiteSimulateur(vu && r ? { outil: outil.cle, resultat: r.resultat } : null, "outil");
  const k = visite?.k ? `?k=${encodeURIComponent(visite.k)}` : "";

  return (
    <>
      <div className="mb-8 text-center">
        <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
        <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal leading-[1.2] tracking-[-0.02em] text-encre">{outil.titre}</h1>
        <p className="mx-auto m-0 mt-3 max-w-[520px] text-[15px] leading-[1.6] text-ardoise">{outil.accroche}</p>
      </div>

      <div className={`${CARTE} p-6 max-md:p-4`}>
        {outil.champs.map((c) => <Champ key={c.cle} c={c} valeur={v[c.cle]} onChange={(x) => setV((a) => ({ ...a, [c.cle]: x }))} />)}
        {!vu && (
          <button type="button" disabled={!complet} onClick={() => setVu(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
            Voir le résultat<ArrowRight className="h-4 w-4" />
          </button>
        )}
        {!vu && !complet && <p className="m-0 mt-2 text-[12.5px] text-brume">Répondez à chaque question pour voir le résultat.</p>}
      </div>

      {vu && r && (
        <div className={`${CARTE} mt-4 p-6 duration-300 animate-in fade-in-0 slide-in-from-bottom-2 max-md:p-4`}>
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">{r.fort.label}</p>
          <p className="m-0 mt-1 text-[34px] leading-[1.1] tabular-nums tracking-[-0.02em] text-encre">{r.fort.valeur}</p>
          {r.titre && <p className="m-0 mt-2 text-[17px] text-menthe">{r.titre}</p>}
          <p className="m-0 mt-3 text-[15px] leading-[1.65] text-craie">{r.phrase}</p>
          {r.lignes.length > 0 && (
            <div className="mt-5 border-y border-trait">
              {r.lignes.map(([mot, val]) => (
                <div key={mot} className="flex items-center justify-between gap-3 border-t border-trait px-1 py-3 first:border-t-0">
                  <span className="text-[14px] text-ardoise">{mot}</span>
                  <span className="text-right text-[14px] tabular-nums text-encre">{val}</span>
                </div>
              ))}
            </div>
          )}
          {r.conseils.length > 0 && (
            <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
              {r.conseils.map((x) => <li key={x} className="rounded-[10px] border border-trait bg-relief px-4 py-3 text-[14px] leading-[1.55] text-craie">{x}</li>)}
            </ul>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <RendezVousFondateur visite={visite} qui={qui} libelle="En parler au fondateur" />
            <a href={`/SimulateurPublic${k}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3.5 text-xs text-craie hover:border-menthe hover:text-encre">Le simulateur complet<ArrowRight className="h-3.5 w-3.5" /></a>
            <button type="button" onClick={() => { setV(valeursParDefaut(outil)); setVu(false); }} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-ardoise hover:text-encre" style={{ background: "transparent" }}><RotateCcw className="h-3.5 w-3.5" />Recommencer</button>
          </div>
          <p className="m-0 mt-6 text-[12.5px] leading-[1.6] text-brume">Hypothèses et limites : {outil.hypotheses}</p>
        </div>
      )}
    </>
  );
}

export default function OutilInvestisseur() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const outil = LEAD_MAGNETS.find((x) => x.cle === params.get("o"));
  const k = params.get("k") ? `&k=${encodeURIComponent(params.get("k"))}` : "";
  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10 mx-auto max-w-[680px] px-4 pb-24 pt-14 max-md:pt-8">
        {outil ? (
          <>
            <a href={`/OutilInvestisseur${k ? `?${k.slice(1)}` : ""}`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre"><ArrowLeft className="h-3.5 w-3.5" />Tous les outils</a>
            <Outil key={outil.cle} outil={outil} />
          </>
        ) : (
          <>
            <div className="mb-8 text-center">
              <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
              <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal leading-[1.2] tracking-[-0.02em] text-encre">Les outils de l'investisseur en murs</h1>
              <p className="mx-auto m-0 mt-3 max-w-[500px] text-[15px] leading-[1.6] text-ardoise">Dix questions qu'on se pose avant d'acheter des murs de commerce, et la réponse chiffrée.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {LEAD_MAGNETS.map((x) => (
                <a key={x.cle} href={`/OutilInvestisseur?o=${x.cle}${k}`} className={`${CARTE} group flex flex-col gap-1 p-5 transition-colors hover:border-menthe`}>
                  <span className="text-[15px] text-encre">{x.nom}</span>
                  <span className="text-[13px] leading-[1.5] text-ardoise">{x.titre}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-menthe">Commencer<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
