import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { createPageUrl } from "@/utils";
import { journeesAVoir } from "@/lib/nouveautes";

// « Quoi de neuf » (16 oct. 2026, Jules) : le briefing du jour, ce qui a été
// ajouté à la plateforme. Une fois par jour et par navigateur, sur le
// Dashboard ; après l'annonce d'AK si elle est ouverte. Même registre que
// « Tout préparé » : reflet sur le titre, lignes cochées une à une.

const CLE = "klocka.quoi-de-neuf.vu";
const CLE_AK = "klocka.ak-nouveau-look.v1";
const lire = (cle) => { try { return localStorage.getItem(cle); } catch { return "stockage indisponible"; } };
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (x) => x.toUpperCase());

export default function QuoiDeNeuf() {
  const [journees] = useState(() => journeesAVoir(lire(CLE)));
  // L'annonce d'AK passe d'abord : on attend qu'elle soit fermée.
  const [akVue, setAkVue] = useState(() => !!lire(CLE_AK));
  const [ferme, setFerme] = useState(false);
  useEffect(() => {
    if (akVue) return undefined;
    const t = setInterval(() => { if (lire(CLE_AK)) setAkVue(true); }, 500);
    return () => clearInterval(t);
  }, [akVue]);
  const ouverte = !ferme && akVue && journees.length > 0;
  const fermer = () => { try { localStorage.setItem(CLE, journees[0].jour); } catch { /* elle reviendra */ } setFerme(true); };
  useEffect(() => {
    if (!ouverte) return undefined;
    const f = (e) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [ouverte]);
  if (!ouverte) return null;
  const items = journees.flatMap((j) => j.items);
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-fond/70 p-6 backdrop-blur-xl duration-300 animate-in fade-in-0 md:left-[var(--k-barre-largeur,0px)] max-md:p-3" role="dialog" aria-modal="true" aria-label="Quoi de neuf">
      <div className="flex max-h-[92dvh] w-full max-w-[660px] flex-col items-center overflow-y-auto rounded-[28px] border border-trait bg-fond px-10 pb-9 pt-11 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:px-5">
        <span className="k-monte text-[11px] tracking-[.16em] text-brume" style={{ animationDelay: ".1s" }}>{journees.length > 1 ? "DEPUIS VOTRE DERNIÈRE VISITE" : jourLong(journees[0].jour).toUpperCase()}</span>
        <p className="k-reflet m-0 mt-3 text-center text-[36px] font-normal leading-[1.12] tracking-[-0.02em] max-md:text-[28px]">Quoi de neuf</p>
        <p className="k-monte m-0 mt-3 text-center text-[16px] text-ardoise" style={{ animationDelay: "1.3s" }}>{items.length} nouveauté{items.length > 1 ? "s" : ""} sur Klocka.</p>
        <div className="k-monte mt-8 w-full border-t border-trait" style={{ animationDelay: "1.5s" }}>
          {items.map((x, i) => (
            <div key={x.titre} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-3 border-b border-trait py-4">
              <span className="relative mt-0.5 grid h-6 w-6 place-items-center rounded-full border border-encre/25">
                <span className="k-coche absolute inset-[-1px] grid place-items-center rounded-full bg-encre text-fond" style={{ animationDelay: `${1.8 + i * 0.3}s` }}><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="k-blanchit text-[16px]" style={{ animationDelay: `${1.8 + i * 0.3}s` }}>{x.titre}</span>
                <span className="text-[14.5px] leading-[1.5] text-ardoise">{x.texte}</span>
              </span>
              {x.page && <Link to={`${createPageUrl(x.page)}${x.requete || ""}`} onClick={fermer} className="mt-0.5 whitespace-nowrap text-[13.5px] text-craie underline-offset-4 hover:text-encre hover:underline">Voir →</Link>}
            </div>
          ))}
        </div>
        <button type="button" onClick={fermer} autoFocus className="k-monte mt-9 h-14 rounded-full bg-encre px-9 text-[17px] text-fond hover:opacity-90" style={{ animationDelay: `${2.1 + items.length * 0.3}s` }}>C'est parti →</button>
      </div>
    </div>,
    document.body,
  );
}
