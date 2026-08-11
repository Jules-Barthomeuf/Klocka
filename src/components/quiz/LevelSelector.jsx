import React from "react";
import { motion } from "framer-motion";
import { ChevronRight, Lock, CheckCircle2 } from "lucide-react";

export default function LevelSelector({ levels, progress, onSelectLevel }) {
  return (
    <div className="space-y-3">
      {levels.map((level, idx) => {
        const lvlProgress = progress[level.id] || { correct: [], wrong: [], answered: [] };
        const totalQuestions = level.questionCount || 0;
        const correctCount = lvlProgress.correct.length;
        const answeredCount = lvlProgress.answered.length;
        const wrongCount = lvlProgress.wrong.length;
        const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const isComplete = totalQuestions > 0 && correctCount === totalQuestions;
        const hasQuestions = totalQuestions > 0;

        return (
          <motion.button
            key={level.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            onClick={() => hasQuestions && onSelectLevel(level.id)}
            disabled={!hasQuestions}
            className={`w-full text-left bg-gradient-to-r ${level.color} rounded-2xl border ${level.borderColor} p-5 transition-all duration-300 ${
              hasQuestions ? "hover:scale-[1.01] hover:shadow-lg cursor-pointer" : "opacity-40 cursor-not-allowed"
            } ${isComplete ? "ring-1 ring-emerald-500/30" : ""}`}
          >
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className={`w-14 h-14 rounded-xl bg-black/30 border ${level.borderColor} flex items-center justify-center flex-shrink-0`}>
                {isComplete ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                ) : !hasQuestions ? (
                  <Lock className="w-6 h-6 text-gray-600" />
                ) : (
                  <span className="text-2xl">{level.icon}</span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white text-sm font-medium">{level.label}</h3>
                  <span className={`text-xs ${level.textColor}`}>{level.subtitle}</span>
                </div>
                <p className="text-gray-500 text-xs mb-3">{level.description}</p>

                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-black/30 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${isComplete ? "bg-emerald-500" : "bg-white/30"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: idx * 0.08 + 0.2 }}
                    />
                  </div>
                  <span className="text-gray-400 text-[10px] font-medium flex-shrink-0 w-16 text-right">
                    {correctCount}/{totalQuestions}
                  </span>
                </div>

                {/* Stats row */}
                {answeredCount > 0 && (
                  <div className="flex items-center gap-3 mt-2">
                    {wrongCount > 0 && (
                      <span className="text-orange-400/80 text-[10px]">
                        {wrongCount} à réviser
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Arrow */}
              {hasQuestions && (
                <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}