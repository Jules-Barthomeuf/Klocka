import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import QuizModal from "./QuizModal";

export default function QuizImmoCard({ resources }) {
  const [showQuiz, setShowQuiz] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
        onClick={() => setShowQuiz(true)}
        className="group cursor-pointer bg-white/[0.02] rounded-2xl border border-white/[0.05] p-5 md:p-6 hover:border-[#F59E0B]/20 hover:bg-white/[0.025] transition-all duration-500"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/[0.1] flex items-center justify-center flex-shrink-0 group-hover:bg-[#F59E0B]/[0.15] transition-colors">
            <Brain className="w-[18px] h-[18px] text-[#F59E0B]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white text-sm font-medium mb-1">Quiz Immobilier Commercial</h3>
            <p className="text-white/20 text-xs leading-relaxed mb-4">
              Testez vos connaissances en 10 questions et découvrez vos points à approfondir.
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[#F59E0B] text-[11px] font-medium">Commencer le quiz</span>
              <ArrowRight className="w-3 h-3 text-[#F59E0B]/50 group-hover:text-[#F59E0B] group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showQuiz && (
          <QuizModal
            resources={resources}
            onClose={() => setShowQuiz(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}