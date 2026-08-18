import React from "react";
import { motion } from "framer-motion";

export default function DashboardStrategyCard({ userStrategy }) {
  if (!userStrategy) return null;
  const hasBudget = userStrategy.budget_max > 0;
  const hasApport = userStrategy.apport > 0;
  const hasFields = userStrategy.fields && userStrategy.fields.length > 0;
  if (!hasBudget && !hasApport && !hasFields) return null;

  const fmt = (v) => Math.round(v).toLocaleString('fr-FR');

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-5 h-full"
    >
      <p className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] mb-4">Stratégie</p>

      <div style={{ fontVariantNumeric: "tabular-nums" }}>
        {hasBudget && (
          <div className="flex justify-between gap-4 py-2.5 text-sm border-t border-[#edeae5]/[0.12]">
            <span className="text-[#8b9391]">Budget max</span>
            <span className="text-[#edeae5]">{fmt(userStrategy.budget_max)} €</span>
          </div>
        )}
        {hasApport && (
          <div className="flex justify-between gap-4 py-2.5 text-sm border-t border-[#edeae5]/[0.12]">
            <span className="text-[#8b9391]">Apport</span>
            <span className="text-[#7fd3c9]">{fmt(userStrategy.apport)} €</span>
          </div>
        )}
        {hasFields && userStrategy.fields.map((field, i) => (
          <div key={i} className="flex justify-between gap-4 py-2.5 text-sm border-t border-[#edeae5]/[0.12]">
            <span className={field.is_nogo ? "text-red-400" : "text-[#8b9391]"}>
              {field.label}
              {field.is_nogo && <span className="ml-2 text-[9px] tracking-[0.14em] uppercase">No-go</span>}
            </span>
            {field.value && <span className="text-[#edeae5] text-right">{field.value}</span>}
          </div>
        ))}
      </div>
    </motion.div>
  );
}