import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, ArrowRight } from "lucide-react";

// Onglet « Données extraites » : ce que l'extraction sait poser directement
// dans la fiche projet, et où. Une ligne sans destination reste affichée — elle
// est relevée, simplement pas encore rangeable automatiquement.

// Les lignes sourcées ouvrent le document à la bonne page.
const lienSource = (url, page) => (!url ? null : page && /\.pdf($|\?)/i.test(url) ? `${url}#page=${page}` : url);

export default function DonneesExtraites({ dossier, apercu = false }) {
  const { data, isLoading } = useQuery({
    queryKey: ["donnees-projet", dossier?.deal_id, (dossier?.extractions || []).length],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/donnees-projet`),
    enabled: !apercu && !!dossier?.deal_id,
  });

  const lignes = data?.lignes || [];
  // Les lignes rangeables d'abord, groupées par section de la fiche projet.
  const groupes = useMemo(() => {
    const parSection = new Map();
    for (const l of lignes) {
      const cle = l.section || "Sans destination";
      if (!parSection.has(cle)) parSection.set(cle, []);
      parSection.get(cle).push(l);
    }
    return [...parSection.entries()].sort((a, b) =>
      a[0] === "Sans destination" ? 1 : b[0] === "Sans destination" ? -1 : a[0].localeCompare(b[0])
    );
  }, [lignes]);

  const rangeables = lignes.filter((l) => l.section).length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 text-[#8b9391] animate-spin" />
      </div>
    );
  }

  if (!lignes.length) {
    return (
      <p className="border-t border-[#2e3230] py-10 text-center text-[13px] text-[#6b7270] m-0">
        Rien d'extrait pour l'instant — extraitz des documents depuis l'onglet Documents.
      </p>
    );
  }

  return (
    <div>
      <p className="m-0 mb-4 text-[12.5px] text-[#9aa19e] leading-[1.6]">
        {rangeables} donnée{rangeables > 1 ? "s" : ""} sur {lignes.length} iront directement dans la
        fiche projet à sa création (étape Plateforme). Les valeurs déjà renseignées par la
        pré-analyse ne sont pas écrasées.
      </p>

      {groupes.map(([section, lignesSection]) => (
        <div key={section} className="mb-6">
          <h4 className="m-0 mb-2 text-[10.5px] tracking-[0.16em] uppercase text-[#7fd3c9] font-normal">
            {section === "Sans destination" ? "Relevé, sans case dédiée" : `Projet › ${section}`}
          </h4>
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse min-w-[820px]
                [&_th]:border-r [&_td]:border-r [&_th]:border-[#2e3230] [&_td]:border-[#2e3230]
                [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0
                [&_th]:pl-3 [&_td]:pl-3"
            >
              <thead>
                <tr className="border-y border-[#3a3e3c]">
                  {[["Élément relevé", "w-[24%]"], ["Valeur", "w-[40%]"], ["Champ du projet", "w-[24%]"], ["Source", "w-[12%]"]].map(([h, cls]) => (
                    <th key={h} className={`py-2.5 text-[10.5px] tracking-[0.16em] uppercase text-[#edeae5] font-normal text-left ${cls}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignesSection.map((l, i) => {
                  const lien = lienSource(l.document_url, l.page);
                  return (
                    <tr key={`${l.extraction_id}-${i}`} className="border-b border-[#2e3230] align-top hover:bg-[#edeae5]/[0.02] transition-colors">
                      <td className="py-3 pr-4 text-[13px] text-[#edeae5]">{l.element}</td>
                      <td className="py-3 pr-4 text-[13px] text-[#d3d8d6]">
                        {l.constat}
                        {l.commentaire && (
                          <span className="block mt-1 text-[11.5px] text-[#6b7270] italic">{l.commentaire}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-[12.5px]">
                        {l.champ ? (
                          <span className="inline-flex items-center gap-1.5 text-[#7fd3c9]">
                            <ArrowRight className="w-3 h-3 flex-shrink-0" /> {l.champ}
                          </span>
                        ) : (
                          <span className="text-[#5a615f]">à saisir à la main</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-[12.5px] whitespace-nowrap">
                        {lien ? (
                          <a href={lien} target="_blank" rel="noopener noreferrer" className="text-[#7fd3c9] hover:text-[#edeae5] transition-colors" title={l.document_nom}>
                            {l.page ? `page ${l.page}` : "voir"}
                          </a>
                        ) : (
                          <span className="text-[#3f4644]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
