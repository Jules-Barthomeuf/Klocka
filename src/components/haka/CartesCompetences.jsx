import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { sourceDe } from "@/lib/sources";

// Les cartes de compétences (17 oct. 2026, Jules) : ce que Haka sait faire,
// et où il ira chercher. Sous chaque carte, ses sources en pastilles : un clic
// en éteint une pour ce lancement (le choix ne se garde pas), une source
// obligatoire ne s'éteint pas. Lancer remplit le chat, en disant ce qui est
// éteint ; la personne envoie.


function Carte({ c, contexte, onLancer }) {
  const [eteintes, setEteintes] = useState(() => new Set());
  // Trois sources se voient, les obligatoires d'abord ; « + n » montre les autres.
  const [toutes, setToutes] = useState(false);
  const outils = [...(c.outils || [])].sort((a, b) => Number(!!b.obligatoire) - Number(!!a.obligatoire));
  const visibles = toutes ? outils : outils.slice(0, 3);
  const basculer = (o) => { if (o.obligatoire) return; setEteintes((s) => { const n = new Set(s); if (n.has(o.cle)) n.delete(o.cle); else n.add(o.cle); return n; }); };
  const lancer = () => {
    const sans = (c.outils || []).filter((o) => eteintes.has(o.cle)).map((o) => sourceDe(o.cle).nom);
    const texte = `${c.nom}${contexte?.titre ? ` du dossier « ${contexte.titre} »` : ""}${sans.length ? ` (sans ${sans.join(", ")})` : ""}.`;
    onLancer(texte);
    setEteintes(new Set());
  };
  // La carte (17 oct. 2026, design de Jules) : la tâche en une phrase, puis les sources l'une sous l'autre, icône ronde et nom en gris.
  const phrase = (() => { const t = String(c.resume || c.nom || "").trim(); return /[.!?…]$/.test(t) ? t : `${t}.`; })();
  return (
    <article className="flex flex-col gap-4 rounded-[18px] border border-trait bg-surface-pleine p-5 shadow-[0_8px_24px_rgb(0_0_0/0.05)] transition-colors hover:border-bord-doux">
      <button type="button" onClick={lancer} title="Poser cette demande dans le chat" className="block w-full p-0 text-left" style={{ background: "transparent" }}>
        <p className="m-0 text-[17px] leading-[1.4] tracking-[-0.01em] text-encre">{phrase}</p>
      </button>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {visibles.map((o) => {
          const s = sourceDe(o.cle);
          const Icone = s.icone;
          const eteinte = eteintes.has(o.cle);
          return (
            <li key={o.cle}>
              <button type="button" onClick={() => basculer(o)} aria-pressed={!eteinte} disabled={o.obligatoire}
                title={o.obligatoire ? `${s.nom} : obligatoire pour cette compétence` : eteinte ? `${s.nom} : éteinte pour ce lancement` : `Éteindre ${s.nom} pour ce lancement`}
                className={`inline-flex items-center gap-2.5 p-0 text-[14.5px] transition-colors ${eteinte ? "text-brume line-through" : "text-ardoise hover:text-encre"} ${o.obligatoire ? "cursor-default" : ""}`}
                style={{ background: "transparent" }}>
                <span className={`grid h-7 w-7 flex-none place-items-center rounded-full ${eteinte ? "border border-trait" : "bg-rail-actif text-encre"}`}><Icone className="h-3.5 w-3.5" strokeWidth={1.8} /></span>
                {s.nom}
              </button>
            </li>
          );
        })}
        {outils.length > 3 && (
          <li>
            <button type="button" onClick={() => setToutes((t) => !t)} aria-expanded={toutes}
              className="inline-flex items-center gap-2.5 p-0 text-[13.5px] text-brume transition-colors hover:text-encre" style={{ background: "transparent" }}>
              <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-trait text-[12px]">{toutes ? "−" : `+${outils.length - 3}`}</span>
              {toutes ? "Moins de sources" : `${outils.length - 3} autre${outils.length - 3 > 1 ? "s" : ""} source${outils.length - 3 > 1 ? "s" : ""}`}
            </button>
          </li>
        )}
      </ul>
    </article>
  );
}

const D_ABORD = ["preanalyse", "data-room", "loi", "presentation-bancaire"];
const rang = (cle) => { const i = D_ABORD.indexOf(cle); return i < 0 ? D_ABORD.length : i; };

/**
 * `limite` (Accueil, 17 oct. 2026) : les plus demandées d'abord (l'ordre des raccourcis), pas plus de `limite`.
 * @param {{declencheur: 'chat'|'dossier', contexte?: {deal_id?: string, titre?: string}, limite?: number, className?: string}} props
 */

export default function CartesCompetences({ declencheur = "chat", contexte = null, limite = 0, className = "" }) {
  const q = useQuery({ queryKey: ["haka-competences", declencheur], queryFn: () => base44.request("GET", `/api/haka/competences?declencheur=${declencheur}`), staleTime: 5 * 60_000, retry: false });
  const toutes = q.data?.competences || [];
  const liste = limite ? [...toutes].sort((a, b) => rang(a.cle) - rang(b.cle)).slice(0, limite) : toutes;
  // Les recettes se lisent même Haka éteint (17 oct. 2026, Jules : « je ne peux pas les voir ») : la carte pose une demande dans le chat, rien de plus.
  if (!liste.length) return null;
  // Lancer : le chat de la page reçoit le texte et prend la main ; rien ne part avant l'envoi.
  const lancer = (texte) => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte, contexte } }));
  return (
    <section aria-label="Ce que Haka sait faire" className={className}>
      <p className="m-0 mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Ce que Haka sait faire</p>
      <div className={`grid gap-3 ${declencheur === "dossier" ? "grid-cols-1" : limite === 4 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
        {liste.map((c) => <Carte key={c.cle} c={c} contexte={contexte} onLancer={lancer} />)}
      </div>
    </section>
  );
}
