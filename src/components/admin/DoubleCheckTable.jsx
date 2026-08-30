import React from "react";
import { Input } from "@/components/ui/input";

const SECTIONS = [
{
  title: "INFORMATIONS GÉNÉRALES",
  fields: [
  { key: "adresse", label: "Adresse" },
  { key: "lien_annonce", label: "Lien de l'annonce" },
  { key: "prix_vente_fai", label: "Prix de vente FAI" },
  { key: "cause_vente", label: "Cause de vente" },
  { key: "offre_deja_soumise", label: "Offre déjà soumise" },
  { key: "vendeur_indivision", label: "Vendeur en indivision" },
  { key: "marchand_biens_vendus", label: "Si marchand de bien, est-ce que les autres biens sont vendus ?" }]

},
{
  title: "CONTACT AGENT IMMOBILIER",
  fields: [
  { key: "agent_nom", label: "Nom de l'agent" },
  { key: "agent_email", label: "Email de l'agent" },
  { key: "agent_telephone", label: "Téléphone de l'agent" }]

},
{
  title: "DONNÉES LOCATIVES",
  fields: [
  { key: "bail", label: "Bail" },
  { key: "tva", label: "TVA" },
  { key: "anciennete_locataire", label: "Ancienneté du locataire" },
  { key: "activite_locataire", label: "Activité locataire" },
  { key: "loyer_ht_hc", label: "Loyer HT HC" },
  { key: "charges", label: "Charges" },
  { key: "taxe_fonciere", label: "Taxe Foncière" },
  { key: "quittance_loyer", label: "Quittance de loyer" },
  { key: "depot_garantie", label: "Dépôt de garantie" },
  { key: "caution_cession", label: "Caution en cas de cession" },
  { key: "droit_entree", label: "Droit d'entrée" },
  { key: "vente_fonds_commerce", label: "Vente fonds de commerce" }]

},
{
  title: "COPRO",
  fields: [
  { key: "copro_travaux", label: "Travaux" },
  { key: "copro_problemes", label: "Problèmes" }]

},
{
  title: "DONNÉES TECHNIQUES",
  fields: [
  { key: "surface_ponderee", label: "Surface Pondérée" }]

}];

const TOGGLE_FIELDS = [
  { key: "toggle_quittance", label: "Quittance" },
  { key: "toggle_rcp", label: "RCP" },
  { key: "toggle_pv_ag", label: "PV AG" },
  { key: "toggle_bail", label: "Bail" },
  { key: "toggle_diags", label: "Diags" },
];


export default function DoubleCheckTable({ checkData, onChange }) {
  const updateField = (key, column, value) => {
    const updated = { ...checkData };
    if (!updated[key]) updated[key] = { ia: "", human: "" };
    updated[key] = { ...updated[key], [column]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="grid grid-cols-12 gap-2 px-1">
        <div className="col-span-4" />
        <div className="col-span-4">
          <p className="text-purple-400 text-xs uppercase tracking-[0.15em] font-semibold text-center">Check 1</p>
        </div>
        <div className="col-span-4">
          <p className="text-[#96c0b8] text-xs uppercase tracking-[0.15em] font-semibold text-center">Check 2</p>
        </div>
      </div>

      {/* Toggle section */}
      <div className="rounded-md border border-[#1f2228] overflow-hidden">
        <div className="bg-[#f2f3f5]/[0.03] px-4 py-2.5 border-b border-[#1f2228]">
          <p className="text-[#f2f3f5]/60 text-[11px] uppercase tracking-[0.15em] font-medium">DOCUMENTS REÇUS</p>
        </div>
        {/* Toggle header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-[#1f2228]">
          <div className="col-span-4" />
          <div className="col-span-4">
            <p className="text-purple-400 text-xs uppercase tracking-[0.15em] font-semibold text-center">Check 1</p>
          </div>
          <div className="col-span-4">
            <p className="text-[#96c0b8] text-xs uppercase tracking-[0.15em] font-semibold text-center">Check 2</p>
          </div>
        </div>
        <div className="divide-y divide-[#15171b]">
          {TOGGLE_FIELDS.map((field) => {
            const val = checkData[field.key] || { ia: null, human: null };
            return (
              <div key={field.key} className="grid grid-cols-12 gap-2 items-center px-3 py-2 hover:bg-[#f2f3f5]/[0.015] transition-colors">
                <div className="col-span-4">
                  <p className="text-[#f2f3f5]/80 text-xs font-medium">{field.label}</p>
                </div>
                <div className="col-span-4 flex justify-center gap-1.5">
                  <button type="button" onClick={() => updateField(field.key, "ia", val.ia === "oui" ? "" : "oui")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${val.ia === "oui" ? "bg-[#96c0b8]/20 text-[#c3ddd6] border border-[#96c0b8]/30" : "bg-[#f2f3f5]/[0.03] text-[#9298a6] border border-[#1f2228] hover:bg-[#f2f3f5]/[0.06]"}`}>Oui</button>
                  <button type="button" onClick={() => updateField(field.key, "ia", val.ia === "non" ? "" : "non")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${val.ia === "non" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-[#f2f3f5]/[0.03] text-[#9298a6] border border-[#1f2228] hover:bg-[#f2f3f5]/[0.06]"}`}>Non</button>
                </div>
                <div className="col-span-4 flex justify-center gap-1.5">
                  <button type="button" onClick={() => updateField(field.key, "human", val.human === "oui" ? "" : "oui")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${val.human === "oui" ? "bg-[#96c0b8]/20 text-[#c3ddd6] border border-[#96c0b8]/30" : "bg-[#f2f3f5]/[0.03] text-[#9298a6] border border-[#1f2228] hover:bg-[#f2f3f5]/[0.06]"}`}>Oui</button>
                  <button type="button" onClick={() => updateField(field.key, "human", val.human === "non" ? "" : "non")}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${val.human === "non" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-[#f2f3f5]/[0.03] text-[#9298a6] border border-[#1f2228] hover:bg-[#f2f3f5]/[0.06]"}`}>Non</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {SECTIONS.map((section) =>
      <div key={section.title} className="rounded-md border border-[#1f2228] overflow-hidden">
          {/* Section header */}
          <div className="bg-[#f2f3f5]/[0.03] px-4 py-2.5 border-b border-[#1f2228]">
            <p className="text-[#f2f3f5]/60 text-[11px] uppercase tracking-[0.15em] font-medium">{section.title}</p>
          </div>
          {/* Rows */}
          <div className="divide-y divide-[#15171b]">
            {section.fields.map((field) => {
            const val = checkData[field.key] || { ia: "", human: "" };
            return (
              <div key={field.key} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5 hover:bg-[#f2f3f5]/[0.015] transition-colors">
                  <div className="col-span-4">
                    <p className="text-[#f2f3f5]/80 text-xs font-medium leading-tight">{field.label}</p>
                  </div>
                  <div className="col-span-4">
                    <Input
                    value={val.ia}
                    onChange={(e) => updateField(field.key, "ia", e.target.value)} className="bg-slate-800 text-[#f2f3f5] px-3 py-1 text-xs rounded-md flex w-full border shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm border-purple-500/10 focus:border-purple-500/30 h-8 placeholder:text-[#3a3f4a]"

                    placeholder="—" />
                  
                  </div>
                  <div className="col-span-4">
                    <Input
                    value={val.human}
                    onChange={(e) => updateField(field.key, "human", e.target.value)} className="bg-slate-800 text-[#f2f3f5] px-3 py-1 text-xs rounded-md flex w-full border shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm border-[#96c0b8]/10 focus:border-[#96c0b8]/30 h-8 placeholder:text-[#3a3f4a]"

                    placeholder="—" />
                  
                  </div>
                </div>);

          })}
          </div>
        </div>
      )}
    </div>);

}