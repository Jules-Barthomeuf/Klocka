import React from "react";
import { motion } from "framer-motion";
import { Trophy, RotateCcw, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QuizComplete({ score, total, onRestart }) {
  const pct = Math.round((score / total) * 100);

  const getMessage = () => {
    if (pct === 100) return { title: "Parfait ! 🏆", sub: "Vous êtes un expert absolu de l'immobilier commercial !" };
    if (pct >= 80) return { title: "Excellent ! 🌟", sub: "Vous maîtrisez parfaitement les fondamentaux." };
    if (pct >= 60) return { title: "Bien joué ! 💪", sub: "De solides connaissances, continuez comme ça." };
    if (pct >= 40) return { title: "Pas mal ! 📚", sub: "Quelques notions à revoir, mais vous êtes sur la bonne voie." };
    return { title: "À améliorer 🎯", sub: "Relisez les ressources Klocka et retentez votre chance !" };
  };

  const msg = getMessage();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="text-center max-w-md mx-auto py-12"
    >
      {/* Trophy */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-[#2A9D8F]/10 border border-[#2A9D8F]/20 flex items-center justify-center mx-auto">
          <Trophy className="w-12 h-12 text-[#2A9D8F]" />
        </div>
        {/* Stars */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.15 }}
            className="absolute"
            style={{
              top: `${10 + i * 15}%`,
              left: i === 1 ? "68%" : i === 0 ? "25%" : "72%",
            }}
          >
            <Star
              className={`w-4 h-4 ${
                pct >= (i + 1) * 30 ? "text-yellow-400 fill-yellow-400" : "text-gray-700"
              }`}
            />
          </motion.div>
        ))}
      </div>

      {/* Score circle */}
      <div className="mb-6">
        <p className="text-5xl font-light text-white mb-1">
          {score}<span className="text-gray-500 text-2xl">/{total}</span>
        </p>
        <p className="text-[#2A9D8F] text-sm font-medium">{pct}% de bonnes réponses</p>
      </div>

      {/* Message */}
      <h2 className="text-2xl font-light text-white mb-2">{msg.title}</h2>
      <p className="text-gray-500 text-sm mb-8 leading-relaxed">{msg.sub}</p>

      {/* Actions */}
      <Button
        onClick={onRestart}
        className="bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white px-8 py-3 rounded-xl"
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        Recommencer
      </Button>
    </motion.div>
  );
}