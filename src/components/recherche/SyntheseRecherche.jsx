import React from "react";
import { PROFILS } from "./profilsData";
import { MapPin, TrendingUp, Ban, Building2 } from "lucide-react";

function BudgetColumn({ profil }) {
  const { color, label, titre, sections, typesCommerceExclus, rendements } = profil;

  return (
    <div className="bg-[#0f1114] border border-[#f2f3f5]/[0.12] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1f2228]" style={{ backgroundColor: `${color}10` }}>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full inline-block mb-2"
          style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}40` }}
        >
          {label} €
        </span>
        <p className="text-[#f2f3f5] text-sm font-medium leading-snug">{titre}</p>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Géographie / Critères */}
        {sections.map((section, sIdx) => (
          <div key={sIdx}>
            <div className="flex items-center gap-2 mb-2.5">
              <MapPin className="w-3.5 h-3.5" style={{ color }} />
              <p className="text-[9px] uppercase tracking-[0.15em] text-[#f2f3f5]/40 font-medium">{section.titre}</p>
            </div>
            <div className="space-y-2">
              {section.items.map((item, idx) => (
                <div key={idx} className="pl-3 border-l-2 border-[#1f2228]">
                  <p className="text-xs font-medium text-[#f2f3f5]/80">{item.label}</p>
                  <p className="text-[11px] text-[#f2f3f5]/35 leading-relaxed whitespace-pre-line">{item.desc}</p>
                </div>
              ))}
            </div>
            {section.tags && section.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {section.tags.map((tag, idx) => (
                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: `${color}40`, color: `${color}CC` }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Rendements */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <TrendingUp className="w-3.5 h-3.5" style={{ color }} />
            <p className="text-[9px] uppercase tracking-[0.15em] text-[#f2f3f5]/40 font-medium">Rendements cibles</p>
          </div>
          <div className="space-y-2">
            {rendements.map((r, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <span className="text-xs text-[#f2f3f5]/50">{r.label}</span>
                <span className="text-xs font-medium" style={{ color }}>{r.range}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exclusions */}
        {typesCommerceExclus && typesCommerceExclus.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Ban className="w-3.5 h-3.5 text-red-400/60" />
              <p className="text-[9px] uppercase tracking-[0.15em] text-[#f2f3f5]/40 font-medium">Exclusions</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {typesCommerceExclus.map((type, idx) => (
                <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/30 text-red-400/70">
                  ✗ {type}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SyntheseRecherche() {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-[#0f1114] border border-[#f2f3f5]/[0.12] p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-md bg-[#96c0b8]/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-[#96c0b8]" />
          </div>
          <div>
            <h3 className="text-[#f2f3f5] text-sm font-medium">Vue synthétique</h3>
            <p className="text-[#f2f3f5]/30 text-xs">Critères de recherche par tranche de budget — toutes catégories</p>
          </div>
        </div>
      </div>

      {/* Grid de toutes les tranches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROFILS.map((profil) => (
          <BudgetColumn key={profil.id} profil={profil} />
        ))}
      </div>
    </div>
  );
}