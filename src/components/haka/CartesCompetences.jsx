import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { sourceDe } from "@/lib/sources";
import { useCompteHaka } from "@/components/haka/useFileHaka";

// Les cartes de compétences (17 oct. 2026, Jules) : ce que Haka sait faire,
// et où il ira chercher. Sous chaque carte, ses sources en pastilles : un clic
// en éteint une pour ce lancement (le choix ne se garde pas), une source
// obligatoire ne s'éteint pas. Lancer remplit le chat, en disant ce qui est
// éteint ; la personne envoie.

const PASTILLE = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors";

function Carte({ c, contexte, onLancer }) {
  const [eteintes, setEteintes] = useState(() => new Set());
  const basculer = (o) => { if (o.obligatoire) return; setEteintes((s) => { const n = new Set(s); if (n.has(o.cle)) n.delete(o.cle); else n.add(o.cle); return n; }); };
  const lancer = () => {
    const sans = (c.outils || []).filter((o) => eteintes.has(o.cle)).map((o) => sourceDe(o.cle).nom);
    const texte = `${c.nom}${contexte?.titre ? ` du dossier « ${contexte.titre} »` : ""}${sans.length ? ` (sans ${sans.join(", ")})` : ""}.`;
    onLancer(texte);
    setEteintes(new Set());
  };
  return (
    <article className="flex flex-col gap-3 rounded-[16px] border border-trait bg-rail p-4">
      <button type="button" onClick={lancer} className="block w-full p-0 text-left" style={{ background: "transparent" }}>
        <p className="m-0 text-[15px] text-encre">{c.nom}</p>
        {c.resume && <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ardoise">{c.resume}</p>}
      </button>
      <div className="flex flex-wrap gap-1.5">
        {(c.outils || []).map((o) => {
          const s = sourceDe(o.cle);
          const Icone = s.icone;
          const eteinte = eteintes.has(o.cle);
          return (
            <button key={o.cle} type="button" onClick={() => basculer(o)} aria-pressed={!eteinte} disabled={o.obligatoire}
              title={o.obligatoire ? `${s.nom} : obligatoire pour cette compétence` : eteinte ? `${s.nom} : éteinte pour ce lancement` : `Éteindre ${s.nom} pour ce lancement`}
              className={`${PASTILLE} ${eteinte ? "border-trait text-brume line-through" : "border-bord-doux bg-surface-pleine text-encre hover:border-bord-vif"} ${o.obligatoire ? "cursor-default" : ""}`}
              style={eteinte ? { background: "transparent" } : undefined}>
              <span className={`grid h-5 w-5 place-items-center rounded-full ${eteinte ? "bg-transparent" : "bg-rail-actif"}`}><Icone className="h-3 w-3" strokeWidth={1.8} /></span>
              {s.nom}
            </button>
          );
        })}
      </div>
    </article>
  );
}

/**
 * @param {{declencheur: 'chat'|'dossier', contexte?: {deal_id?: string, titre?: string}, className?: string}} props
 */
export default function CartesCompetences({ declencheur = "chat", contexte = null, className = "" }) {
  const compte = useCompteHaka();
  const q = useQuery({ queryKey: ["haka-competences", declencheur], queryFn: () => base44.request("GET", `/api/haka/competences?declencheur=${declencheur}`), enabled: !!compte.data?.actif, staleTime: 5 * 60_000, retry: false });
  const liste = q.data?.competences || [];
  if (!compte.data?.actif || !liste.length) return null;
  // Lancer : le chat de la page reçoit le texte et prend la main ; rien ne part avant l'envoi.
  const lancer = (texte) => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte, contexte } }));
  return (
    <section aria-label="Ce que Haka sait faire" className={className}>
      <p className="m-0 mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Ce que Haka sait faire</p>
      <div className={`grid gap-3 ${declencheur === "dossier" ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
        {liste.map((c) => <Carte key={c.cle} c={c} contexte={contexte} onLancer={lancer} />)}
      </div>
    </section>
  );
}
