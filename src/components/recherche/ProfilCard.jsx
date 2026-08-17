import React from "react";
import { Info } from "lucide-react";

function SectionBlock({ section, color }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4 font-medium">{section.titre}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {section.items.map((item, idx) => (
          <div key={idx} className="p-3 rounded-md bg-white/[0.03] border border-[#16201f]">
            <p className="text-sm font-medium text-white mb-1">{item.label}</p>
            <p className="text-xs text-white/50 whitespace-pre-line leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
      {section.tags && section.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {section.tags.map((tag, idx) => (
            <span key={idx} className="text-xs px-3 py-1 rounded-full border" style={{ borderColor: `${color}50`, color: color }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfilCard({ profil }) {
  const { color, titre, sections, typesCommerce, rendements, note } = profil;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: `${color}20`, color: color, border: `1px solid ${color}40` }}>
          {profil.label} €
        </span>
        <h2 className="text-lg md:text-xl font-light text-white">{titre}</h2>
      </div>

      {/* Sections */}
      {sections.map((section, idx) => (
        <SectionBlock key={idx} section={section} color={color} />
      ))}

      {/* Types de commerce exclus */}
      {profil.typesCommerceExclus && profil.typesCommerceExclus.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 font-medium">TYPES DE COMMERCE EXCLUS</p>
          <div className="flex flex-wrap gap-2">
            {profil.typesCommerceExclus.map((type, idx) => (
              <span key={idx} className="text-xs px-3 py-1.5 rounded-full border border-red-500/40 text-red-400">
                ✗ {type}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}