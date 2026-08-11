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
      className="bg-white/[0.04] rounded-2xl border border-white/[0.3] p-5 h-full"
    >
      <p className="text-white uppercase tracking-[0.2em] text-[9px] font-medium mb-5">Stratégie</p>
      
      <div className="space-y-4">
        {/* Budget */}
        {hasBudget && (
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-white text-xs font-medium mb-0.5">Budget max</p>
              <p className="text-white text-sm">{fmt(userStrategy.budget_max)}€</p>
            </div>
          </div>
        )}

        {/* Apport */}
        {hasApport && (
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-white text-xs font-medium mb-0.5">Apport</p>
              <p className="text-white text-sm">{fmt(userStrategy.apport)}€</p>
            </div>
          </div>
        )}

        {/* Custom fields */}
        {hasFields && userStrategy.fields.map((field, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
              field.is_nogo ? 'bg-red-400' : 'bg-[#2A9D8F]'
            }`} />
            <div>
              <p className={`text-xs font-medium mb-0.5 ${
                field.is_nogo ? 'text-red-400' : 'text-white'
              }`}>
                {field.label}
                {field.is_nogo && <span className="text-red-400 ml-1.5 text-[9px] font-normal">(No-go)</span>}
              </p>
              {field.value && (
                <span className="inline-block text-white text-xs bg-white/[0.04] px-2.5 py-1 rounded-md">
                  {field.value}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}