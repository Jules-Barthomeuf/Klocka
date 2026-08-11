import React from "react";
import { motion } from "framer-motion";
import { User, Landmark, FileText, Building2, Leaf, GraduationCap, Users, Award, MapPin, Flag } from "lucide-react";

// Maps category to which info cards to show
const CATEGORY_CARDS = {
  forces: [
    { field: "maire", label: "Maire", Icon: User },
    { field: "parti_politique", label: "Parti politique", Icon: Flag },
    { field: "score_global", label: "Score global", Icon: Award, suffix: "/100" },
    { field: "programmes_nationaux", label: "Programmes nationaux", Icon: Landmark },
  ],
  faiblesses: [
    { field: "taux_pauvrete", label: "Taux de pauvreté", Icon: Users, suffix: "%" },
    { field: "risques_environnement", label: "Risques environnementaux", Icon: Leaf },
    { field: "taux_etudiants", label: "Taux d'étudiants", Icon: GraduationCap, suffix: "%" },
  ],
  opportunites: [
    { field: "projets_ville", label: "Projets de la ville", Icon: Building2 },
    { field: "programmes_nationaux", label: "Programmes nationaux", Icon: Landmark },
    { field: "politiques_cles", label: "Politiques clés", Icon: FileText },
  ],
  menaces: [
    { field: "risques_environnement", label: "Risques environnementaux", Icon: Leaf },
    { field: "taux_pauvrete", label: "Taux de pauvreté", Icon: Users, suffix: "%" },
    { field: "politiques_cles", label: "Politiques clés", Icon: FileText },
  ],
};

export default function SwotInfoCards({ categoryKey, swotData, color, hex, border }) {
  if (!swotData) return null;

  const cardsConfig = CATEGORY_CARDS[categoryKey] || [];
  const visibleCards = cardsConfig.filter(c => {
    const val = swotData[c.field];
    return val !== undefined && val !== null && val !== "";
  });

  if (visibleCards.length === 0) return null;

  return (
    <div className="pt-4">
      <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-3 px-1">Indicateurs clés</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleCards.map((card, idx) => {
          const value = swotData[card.field];
          const isNumeric = typeof value === "number";
          const displayValue = isNumeric ? `${value}${card.suffix || ""}` : value;
          const isLong = typeof displayValue === "string" && displayValue.length > 40;

          return (
            <motion.div
              key={card.field + idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
              className={`p-4 rounded-xl bg-black/40 border ${border} backdrop-blur-sm ${isLong ? "col-span-2 lg:col-span-3" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${hex}15` }}>
                  <card.Icon className="w-4 h-4" style={{ color: hex }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">{card.label}</p>
                  {isNumeric ? (
                    <p className={`text-xl font-bold mt-0.5 ${color}`}>{displayValue}</p>
                  ) : (
                    <p className="text-white text-sm mt-0.5 leading-relaxed">{displayValue}</p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}