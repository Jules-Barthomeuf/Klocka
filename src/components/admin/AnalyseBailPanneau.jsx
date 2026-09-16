import React from "react";
import { useCasesProjet, SECTIONS_BAIL } from "@/components/projet/CasesProjet";
import { FTextarea } from "./FormField";

// Les quatorze points de l'analyse du bail, en face de ceux de la page.
//
// Chacun montre ce que le serveur a lu dans le bail ; écrire dessous le
// remplace, et la correction vit dans le projet (bail_analyse). Vider un point
// revient à la lecture.

export default function AnalyseBailPanneau({ formData, setFormData, projetId = null }) {
  const cases = useCasesProjet({ id: projetId }, !projetId);
  const lues = new Map((cases?.analyse || []).map((l) => [l.id, l.texte]));
  const corrections = formData.bail_analyse || {};
  const ecrire = (id, texte) => {
    const suite = { ...corrections };
    if (texte.trim()) suite[id] = texte; else delete suite[id];
    setFormData({ ...formData, bail_analyse: suite });
  };

  return (
    <div className="mt-5">
      <div className="mb-3 text-[11px] uppercase tracking-[.16em] text-ardoise">L&apos;analyse, point par point</div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {SECTIONS_BAIL.map(([id, titre], i) => {
          const lu = lues.get(id) || "";
          const texte = corrections[id] ?? "";
          return (
            <li key={id} className="rounded-[12px] border border-trait bg-surface p-3.5">
              <div className="mb-2 flex items-baseline gap-2.5">
                <span className="alx-mont text-[12px] tabular-nums text-menthe">{i + 1}.</span>
                <span className="text-[11px] uppercase tracking-[.16em] text-ardoise">{titre}</span>
              </div>
              <FTextarea
                rows={2}
                value={texte}
                placeholder={lu || "rien lu dans le bail"}
                onChange={(e) => ecrire(id, e.target.value)}
                className="!text-[13.5px]"
              />
              <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-brume">
                <span>{lu ? "lu dans le bail" : "rien lu dans le bail"}</span>
                {texte && <button type="button" onClick={() => ecrire(id, "")} className="text-menthe hover:underline" style={{ background: "transparent" }}>Revenir à la lecture</button>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
