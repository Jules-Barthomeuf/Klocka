import React from "react";
import { motion } from "framer-motion";

export default function QuizProgressBar({ current, total, correctCount }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-xs">Question {current}/{total}</span>
        <span className="text-[#2A9D8F] text-xs font-medium">{correctCount} bonnes réponses</span>
      </div>
      <div className="relative h-2.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#2A9D8F] to-[#71CCBA]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}