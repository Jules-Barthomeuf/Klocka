import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Loader from "@/components/ui/Loader";
import { Statut } from "@/components/mandataire/elements";
import { ETAPES_BIEN, etapesVisibles, rangValide, rangVisible } from "@/lib/biens-mandataire";

// Les propriétaires vendeurs du mandataire (4 nov. 2026, Jules : « un onglet Mes vendeurs ») : chaque propriétaire d'un
// bien de Mes biens, avec son bien, son contact et l'étape où en est le bien. Le même tableau que Mes acquéreurs.
const TRAIT = "border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)]";
const EN_COURS = new Set(["rdv_pris", "mandat_signe"]);

/** Pure : les vendeurs, depuis les fiches (un bien en cours, ni retiré, ni de test, avec un propriétaire). */
export function vendeursDe(proprietaires = []) {
  return proprietaires
    .filter((p) => EN_COURS.has(p.statut) && !p.retire_le && !p.test && !p.essai_bien && (p.nom || p.telephone || p.email))
    .map((p) => ({
      id: p.id, nom: p.nom || "Propriétaire", telephone: p.telephone || null, email: p.email || null,
      bien: p.nom_bien || [p.adresse, p.ville].filter(Boolean).join(", ") || p.commerce || "Bien",
      // L'étape visible (7 nov. 2026) : la Data room et la Commercialisation se disent « Mise en vente ».
      etape: etapesVisibles(p)[rangVisible(Math.min(ETAPES_BIEN.length, rangValide(p.biens?.validee) + 2)) - 1]?.label || "",
    }));
}

export default function MesVendeurs() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["m-proprietaires"], queryFn: () => base44.request("GET", "/api/mandataire/proprietaires") });
  const tous = vendeursDe(data?.proprietaires || []);
  const t = q.trim().toLowerCase();
  const lignes = t ? tous.filter((v) => [v.nom, v.telephone, v.email, v.bien].filter(Boolean).join(" ").toLowerCase().includes(t)) : tous;
  if (isLoading) return <Loader titre="Vos vendeurs" />;
  return (
    <section data-zone="vendeurs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-[320px] items-center gap-2 rounded-full bg-relief px-3.5 focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10 max-md:w-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, bien, téléphone…"
            className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        <span className="ml-auto text-[13.5px] text-ardoise max-md:ml-0"><span className="tabular-nums text-menthe">{lignes.length}</span> vendeur{lignes.length > 1 ? "s" : ""}</span>
      </div>
      <div className="mt-4 overflow-x-auto k-verre">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13.5px] [&_tr>*:last-child]:border-r-0">
          <thead>
            <tr>
              {["Vendeur", "Contact", "Bien", "Étape"].map((h, i, l) => (
                <th key={h} className={`border-b border-r ${TRAIT} bg-rail h-[35px] px-3 py-0 text-[12.5px] font-normal text-ardoise ${i === 0 ? "sticky left-0 z-20 min-w-[200px]" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((v) => (
              <tr key={v.id} className="transition-colors hover:bg-relief/30">
                <td className={`sticky left-0 z-10 border-b border-r ${TRAIT} bg-rail h-11 px-3 py-1 align-middle`}><span className="block max-w-[260px] truncate text-encre">{v.nom}</span></td>
                <td className={`border-b border-r ${TRAIT} h-11 px-3 py-1 align-middle`}>
                  {v.telephone ? <a href={`tel:${String(v.telephone).replace(/[^\d+]/g, "")}`} className="block whitespace-nowrap text-encre hover:text-menthe" style={{ fontVariantNumeric: "tabular-nums" }}>{v.telephone}</a> : null}
                  {v.email ? <a href={`mailto:${v.email}`} className="block max-w-[240px] truncate text-ardoise hover:text-encre">{v.email}</a> : null}
                  {!v.telephone && !v.email && <span className="text-brume">—</span>}
                </td>
                <td className={`border-b border-r ${TRAIT} max-w-[300px] h-11 px-3 py-1 align-middle`}>
                  <Link to={`/MandataireBiens?bien=proprietaire:${v.id}&etape=ensemble`} className="block truncate text-encre hover:text-menthe">{v.bien}</Link>
                </td>
                <td className={`border-b border-r ${TRAIT} whitespace-nowrap h-11 px-3 py-1 align-middle`}>{v.etape && <Statut>{v.etape}</Statut>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lignes.length && <p className="m-0 py-10 text-center text-[13.5px] text-brume">{tous.length ? "Aucun vendeur ne correspond." : "Vos vendeurs arrivent ici avec vos biens."}</p>}
      </div>
    </section>
  );
}
