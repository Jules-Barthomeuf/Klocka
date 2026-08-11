import React from "react";
import { motion } from "framer-motion";
import { Trophy, RotateCcw, BookOpen, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const categorieLabels = {
  acculturation: "Acculturation",
  strategie: "Stratégie",
  analyse: "Analyse",
  financement: "Financement",
  juridique: "Juridique",
  fiscalite: "Fiscalité"
};

export default function QuizResults({ answers, questions, resources, onRestart, onClose }) {
  const score = answers.filter(a => a.correct).length;
  const total = questions.length;
  const percent = Math.round((score / total) * 100);

  // Catégories avec erreurs
  const wrongCategories = [...new Set(
    answers
      .filter(a => !a.correct)
      .map(a => a.categorie)
  )];

  // Ressources recommandées basées sur les catégories d'erreurs
  const recommendedResources = resources.filter(r =>
    r.visible !== false && wrongCategories.includes(r.categorie)
  ).slice(0, 3);

  const getScoreMessage = () => {
    if (percent >= 90) return "Excellent ! Vous maîtrisez l'immobilier commercial.";
    if (percent >= 70) return "Bien joué ! Quelques points à consolider.";
    if (percent >= 50) return "Pas mal ! Continuez à vous former.";
    return "C'est un début ! Les ressources ci-dessous vous aideront.";
  };

  const getScoreColor = () => {
    if (percent >= 70) return "#2A9D8F";
    if (percent >= 50) return "#F59E0B";
    return "#EF4444";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* Score */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `${getScoreColor()}15`, border: `2px solid ${getScoreColor()}40` }}>
          <Trophy className="w-8 h-8" style={{ color: getScoreColor() }} />
        </div>
        <p className="text-3xl font-light text-white mb-1">
          {score} <span className="text-gray-500 text-lg">/ {total}</span>
        </p>
        <p className="text-gray-400 text-sm">{getScoreMessage()}</p>
      </div>

      {/* Résumé des réponses */}
      <div className="grid grid-cols-5 gap-1.5 mb-6">
        {answers.map((a, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full ${a.correct ? "bg-[#2A9D8F]" : "bg-red-500/60"}`}
          />
        ))}
      </div>

      {/* Détail des erreurs */}
      {wrongCategories.length > 0 && (
        <div className="mb-6">
          <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] mb-3">Points à approfondir</p>
          <div className="flex flex-wrap gap-2">
            {wrongCategories.map(cat => (
              <span key={cat} className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                {categorieLabels[cat] || cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ressources recommandées */}
      {recommendedResources.length > 0 && (
        <div className="mb-6">
          <p className="text-white/30 text-[10px] uppercase tracking-[0.2em] mb-3">Ressources recommandées</p>
          <div className="space-y-2">
            {recommendedResources.map(resource => (
              <a
                key={resource.id}
                href={resource.url_fichier}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/5 transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-[#2A9D8F]/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-4 h-4 text-[#2A9D8F]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{resource.titre}</p>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">
                    {categorieLabels[resource.categorie] || resource.categorie}
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-[#2A9D8F] transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={onRestart}
          variant="outline"
          className="flex-1 border-white/[0.08] bg-white/[0.02] text-gray-300 hover:bg-white/[0.05] hover:text-white"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Recommencer
        </Button>
        <Button
          onClick={onClose}
          className="flex-1 bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/25 text-white"
        >
          Fermer
        </Button>
      </div>
    </motion.div>
  );
}