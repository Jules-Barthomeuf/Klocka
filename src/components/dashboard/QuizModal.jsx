import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import quizImmoCommercial from "@/data/quizImmoCommercial";
import QuizQuestion from "./QuizQuestionStep";
import QuizResults from "./QuizResults";

export default function QuizModal({ resources, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]); // array of { questionId, selectedIndex, correct }
  const [finished, setFinished] = useState(false);

  const handleAnswer = (selectedIndex) => {
    const question = quizImmoCommercial[currentIndex];
    const correct = selectedIndex === question.correctIndex;
    const newAnswers = [...answers, { questionId: question.id, selectedIndex, correct, categorie: question.categorie }];
    setAnswers(newAnswers);

    setTimeout(() => {
      if (currentIndex + 1 < quizImmoCommercial.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setFinished(true);
      }
    }, 1200);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setFinished(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#0A0A0A] border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>

        {/* Progress bar */}
        {!finished && (
          <div className="px-6 pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/30 text-[10px] uppercase tracking-[0.2em]">
                Question {currentIndex + 1} / {quizImmoCommercial.length}
              </span>
              <span className="text-[#2A9D8F] text-xs">
                {answers.filter(a => a.correct).length} bonne{answers.filter(a => a.correct).length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="h-[2px] bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#2A9D8F] to-[#F59E0B]"
                animate={{ width: `${((currentIndex + (answers.length > currentIndex ? 1 : 0)) / quizImmoCommercial.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {finished ? (
              <QuizResults
                key="results"
                answers={answers}
                questions={quizImmoCommercial}
                resources={resources}
                onRestart={handleRestart}
                onClose={onClose}
              />
            ) : (
              <QuizQuestion
                key={currentIndex}
                question={quizImmoCommercial[currentIndex]}
                onAnswer={handleAnswer}
                answered={answers.length > currentIndex}
                selectedIndex={answers[currentIndex]?.selectedIndex}
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}