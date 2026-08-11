import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";

const OPTION_LETTERS = ["A", "B", "C"];

export default function QuizQuestion({ question, questionIndex, total, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const handleSelect = (idx) => {
    if (showResult) return;
    setSelected(idx);
    setShowResult(true);

    const isCorrect = idx === question.answer;

    // Auto-advance after delay
    setTimeout(() => {
      onAnswer(isCorrect);
      setSelected(null);
      setShowResult(false);
    }, 1500);
  };

  const getOptionClass = (idx) => {
    const base = "w-full text-left p-4 rounded-xl border transition-all duration-300 flex items-start gap-3";

    if (!showResult) {
      return `${base} bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-[#2A9D8F]/30 cursor-pointer group`;
    }

    if (idx === question.answer) {
      return `${base} bg-emerald-500/10 border-emerald-500/30 text-emerald-400`;
    }

    if (idx === selected && idx !== question.answer) {
      return `${base} bg-red-500/10 border-red-500/30 text-red-400`;
    }

    return `${base} bg-white/[0.01] border-white/[0.04] opacity-40`;
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -40 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        {/* Question number & text */}
        <div>
          <p className="text-[#2A9D8F] text-xs uppercase tracking-[0.2em] mb-3">
            Question {questionIndex + 1} / {total}
          </p>
          <h2 className="text-white text-lg md:text-xl font-light leading-relaxed">
            {question.question}
          </h2>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {question.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={showResult}
              className={getOptionClass(idx)}
            >
              {/* Letter badge */}
              <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                showResult && idx === question.answer
                  ? "bg-emerald-500/20 text-emerald-400"
                  : showResult && idx === selected
                    ? "bg-red-500/20 text-red-400"
                    : "bg-white/[0.04] text-gray-500 group-hover:bg-[#2A9D8F]/20 group-hover:text-[#2A9D8F]"
              }`}>
                {OPTION_LETTERS[idx]}
              </span>

              {/* Text */}
              <span className={`flex-1 text-sm leading-relaxed pt-1 ${
                showResult && idx === question.answer
                  ? "text-emerald-300"
                  : showResult && idx === selected
                    ? "text-red-300"
                    : "text-white/70 group-hover:text-white"
              }`}>
                {option}
              </span>

              {/* Result icon */}
              {showResult && idx === question.answer && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-1" />
              )}
              {showResult && idx === selected && idx !== question.answer && (
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-1" />
              )}
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}