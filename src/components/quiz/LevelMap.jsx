import React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Lock, Play, RotateCcw } from "lucide-react";

function LevelNode({ level, progress, index, total, onSelect }) {
  const lvlProgress = progress[level.id] || { correct: [], wrong: [], answered: [] };
  const totalQ = level.questionCount || 0;
  const correctCount = lvlProgress.correct.length;
  const wrongCount = lvlProgress.wrong.length;
  const pct = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;
  const isComplete = totalQ > 0 && correctCount === totalQ;
  const hasStarted = lvlProgress.answered.length > 0;
  const hasQuestions = totalQ > 0;

  // Zigzag positioning — alternate left/right
  const isLeft = index % 2 === 0;

  return (
    <div className="relative flex items-center" style={{ justifyContent: isLeft ? "flex-start" : "flex-end" }}>
      {/* Connector line to next */}
      {index < total - 1 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-px h-10 z-0">
          <div
            className={`w-full h-full ${isComplete ? "bg-gradient-to-b from-emerald-500/40 to-emerald-500/10" : "bg-gradient-to-b from-white/10 to-white/[0.03]"}`}
            style={{ width: "2px", marginLeft: "-1px" }}
          />
        </div>
      )}

      <motion.button
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: index * 0.12, type: "spring", stiffness: 200, damping: 20 }}
        onClick={() => hasQuestions && onSelect(level.id)}
        disabled={!hasQuestions}
        className={`relative flex items-center gap-4 w-full max-w-[380px] px-5 py-4 rounded-2xl border backdrop-blur-sm transition-all duration-300 ${
          isComplete
            ? "bg-emerald-500/[0.07] border-emerald-500/30 hover:border-emerald-500/50"
            : hasStarted
              ? `bg-gradient-to-r ${level.color} ${level.borderColor} hover:scale-[1.02]`
              : `bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.04] hover:border-white/[0.15]`
        } ${hasQuestions ? "cursor-pointer" : "opacity-30 cursor-not-allowed"}`}
      >
        {/* Level circle */}
        <div className="relative flex-shrink-0">
          {/* Outer ring (progress) */}
          <svg width="64" height="64" className="transform -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
            {pct > 0 && (
              <motion.circle
                cx="32" cy="32" r="28"
                fill="none"
                stroke={isComplete ? "#10b981" : level.accentHex}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 28}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - pct / 100) }}
                transition={{ duration: 0.8, delay: index * 0.12 + 0.3 }}
              />
            )}
          </svg>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            {isComplete ? (
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            ) : !hasQuestions ? (
              <Lock className="w-5 h-5 text-gray-600" />
            ) : (
              <span className="text-2xl">{level.icon}</span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-semibold tracking-wide ${isComplete ? "text-emerald-400" : level.textColor}`}>
              {level.label}
            </span>
            <span className="text-gray-600 text-[10px]">•</span>
            <span className="text-gray-500 text-[10px]">{level.subtitle}</span>
          </div>
          <p className="text-gray-500 text-[11px] mb-2 truncate">{level.description}</p>

          {/* Mini progress bar */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isComplete ? "bg-emerald-500" : "bg-white/20"}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: index * 0.12 + 0.4 }}
              />
            </div>
            <span className="text-gray-500 text-[10px] font-mono w-12 text-right">{correctCount}/{totalQ}</span>
          </div>

          {/* Wrong count badge */}
          {wrongCount > 0 && !isComplete && (
            <div className="flex items-center gap-1 mt-1.5">
              <RotateCcw className="w-3 h-3 text-orange-400/70" />
              <span className="text-orange-400/70 text-[10px]">{wrongCount} à réviser</span>
            </div>
          )}
        </div>

        {/* Play indicator */}
        {hasQuestions && (
          <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
            isComplete
              ? "bg-emerald-500/10"
              : hasStarted ? "bg-white/[0.06]" : "bg-white/[0.04]"
          }`}>
            {isComplete ? (
              <RotateCcw className="w-4 h-4 text-emerald-400" />
            ) : (
              <Play className="w-4 h-4 text-gray-400 ml-0.5" />
            )}
          </div>
        )}
      </motion.button>
    </div>
  );
}

export default function LevelMap({ levels, progress, onSelectLevel }) {
  return (
    <div className="relative space-y-10 py-4">
      {/* Vertical line through the center */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2">
        <div className="w-[2px] h-full bg-gradient-to-b from-white/[0.08] via-white/[0.04] to-transparent" />
      </div>

      {levels.map((level, idx) => (
        <LevelNode
          key={level.id}
          level={level}
          progress={progress}
          index={idx}
          total={levels.length}
          onSelect={onSelectLevel}
        />
      ))}

      {/* End marker */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: levels.length * 0.12 + 0.3 }}
        className="flex justify-center"
      >
        <div className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
          <span className="text-gray-600 text-lg">🏆</span>
        </div>
      </motion.div>
    </div>
  );
}