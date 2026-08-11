import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";

export default function QuizQuestionStep({ question, onAnswer, answered, selectedIndex }) {
  const [localSelected, setLocalSelected] = useState(null);
  const hasAnswered = localSelected !== null;

  const handleClick = (index) => {
    if (hasAnswered) return;
    setLocalSelected(index);
    onAnswer(index);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
    >
      <h3 className="text-white text-base md:text-lg font-medium mb-6 leading-relaxed pr-6">
        {question.question}
      </h3>

      <div className="space-y-2.5">
        {question.options.map((option, index) => {
          const isSelected = localSelected === index;
          const isCorrect = index === question.correctIndex;
          const showResult = hasAnswered;

          let borderClass = "border-white/[0.06] hover:border-white/[0.15]";
          let bgClass = "bg-white/[0.02] hover:bg-white/[0.04]";

          if (showResult) {
            if (isCorrect) {
              borderClass = "border-[#2A9D8F]/50";
              bgClass = "bg-[#2A9D8F]/10";
            } else if (isSelected && !isCorrect) {
              borderClass = "border-red-500/50";
              bgClass = "bg-red-500/10";
            } else {
              borderClass = "border-white/[0.03]";
              bgClass = "bg-white/[0.01]";
            }
          }

          return (
            <button
              key={index}
              onClick={() => handleClick(index)}
              disabled={hasAnswered}
              className={`w-full text-left p-3.5 rounded-xl border ${borderClass} ${bgClass} transition-all duration-300 flex items-center gap-3`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                showResult && isCorrect ? "bg-[#2A9D8F]/20 text-[#2A9D8F]" :
                showResult && isSelected && !isCorrect ? "bg-red-500/20 text-red-400" :
                "bg-white/[0.05] text-gray-400"
              }`}>
                {showResult && isCorrect ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : showResult && isSelected && !isCorrect ? (
                  <XCircle className="w-4 h-4" />
                ) : (
                  String.fromCharCode(65 + index)
                )}
              </div>
              <span className={`text-sm ${
                showResult && isCorrect ? "text-[#2A9D8F]" :
                showResult && isSelected && !isCorrect ? "text-red-400" :
                hasAnswered ? "text-gray-500" : "text-gray-300"
              }`}>
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* Explanation after answer */}
      {hasAnswered && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]"
        >
          <p className="text-gray-400 text-xs leading-relaxed">
            {question.explanation}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}