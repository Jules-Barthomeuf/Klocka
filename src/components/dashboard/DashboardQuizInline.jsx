import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, CheckCircle2, XCircle, Trophy, RotateCcw, BookOpen, ArrowRight, Play, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import quizImmoCommercial from "@/data/quizImmoCommercial";

const categorieLabels = {
  acculturation: "Acculturation",
  strategie: "Stratégie",
  analyse: "Analyse",
  financement: "Financement",
  juridique: "Juridique",
  fiscalite: "Fiscalité"
};

function QuestionView({ question, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const hasAnswered = selected !== null;

  const handleClick = (index) => {
    if (hasAnswered) return;
    setSelected(index);
    setTimeout(() => onAnswer(index), 1100);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
    >
      <h3 className="text-white text-sm md:text-base font-medium mb-5 leading-relaxed">
        {question.question}
      </h3>
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = selected === index;
          const isCorrect = index === question.correctIndex;
          const show = hasAnswered;

          let border = "border-white/[0.06] hover:border-white/[0.15]";
          let bg = "bg-white/[0.02] hover:bg-white/[0.04]";
          if (show) {
            if (isCorrect) { border = "border-[#2A9D8F]/50"; bg = "bg-[#2A9D8F]/10"; }
            else if (isSelected) { border = "border-red-500/50"; bg = "bg-red-500/10"; }
            else { border = "border-white/[0.03]"; bg = "bg-white/[0.01]"; }
          }

          return (
            <button
              key={index}
              onClick={() => handleClick(index)}
              disabled={hasAnswered}
              className={`w-full text-left p-3 rounded-xl border ${border} ${bg} transition-all duration-300 flex items-center gap-3`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${
                show && isCorrect ? "bg-[#2A9D8F]/20 text-[#2A9D8F]" :
                show && isSelected && !isCorrect ? "bg-red-500/20 text-red-400" :
                "bg-white/[0.05] text-white/60"
              }`}>
                {show && isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                 show && isSelected && !isCorrect ? <XCircle className="w-3.5 h-3.5" /> :
                 String.fromCharCode(65 + index)}
              </div>
              <span className={`text-xs md:text-sm ${
                show && isCorrect ? "text-[#2A9D8F]" :
                show && isSelected && !isCorrect ? "text-red-400" :
                hasAnswered ? "text-white/50" : "text-white"
              }`}>{option}</span>
            </button>
          );
        })}
      </div>
      {hasAnswered && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-white/80 text-[11px] leading-relaxed p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
        >
          {question.explanation}
        </motion.p>
      )}
    </motion.div>
  );
}

function ResultsView({ answers, questions, resources, onRestart }) {
  const score = answers.filter(a => a.correct).length;
  const total = questions.length;
  const percent = Math.round((score / total) * 100);

  const wrongCategories = [...new Set(answers.filter(a => !a.correct).map(a => a.categorie))];
  const recommendedResources = resources
    .filter(r => r.visible !== false && wrongCategories.includes(r.categorie))
    .slice(0, 3);

  const allCorrect = wrongCategories.length === 0;
  // Si tout est bon, recommander les premières ressources vidéo
  const fallbackResources = allCorrect
    ? resources.filter(r => r.visible !== false && (r.type === 'video' || r.type === 'webinar')).slice(0, 2)
    : [];

  const displayResources = recommendedResources.length > 0 ? recommendedResources : fallbackResources;

  const msg = percent >= 90 ? "Excellent ! Vous maîtrisez le sujet." :
              percent >= 70 ? "Bien joué ! Quelques points à consolider." :
              percent >= 50 ? "Pas mal ! Continuez à vous former." :
              "C'est un début ! Les vidéos ci-dessous vous aideront.";

  const color = percent >= 70 ? "#2A9D8F" : percent >= 50 ? "#F59E0B" : "#EF4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Score */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, border: `2px solid ${color}40` }}>
          <Trophy className="w-6 h-6" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-light text-white">
            {score} <span className="text-gray-500 text-sm">/ {total}</span>
          </p>
          <p className="text-white/80 text-xs">{msg}</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="grid grid-cols-10 gap-1 mb-5">
        {answers.map((a, i) => (
          <div key={i} className={`h-1 rounded-full ${a.correct ? "bg-[#2A9D8F]" : "bg-red-500/60"}`} />
        ))}
      </div>

      {/* Catégories à approfondir */}
      {wrongCategories.length > 0 && (
        <div className="mb-5">
          <p className="text-white text-[9px] uppercase tracking-[0.2em] mb-2">À approfondir</p>
          <div className="flex flex-wrap gap-1.5">
            {wrongCategories.map(cat => (
              <span key={cat} className="text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                {categorieLabels[cat] || cat}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Vidéos recommandées */}
      {displayResources.length > 0 && (
        <div className="mb-5">
          <p className="text-white text-[9px] uppercase tracking-[0.2em] mb-2">
            {allCorrect ? "Pour aller plus loin" : "Vidéos recommandées"}
          </p>
          <div className="space-y-2">
            {displayResources.map(resource => (
              <a
                key={resource.id}
                href={resource.url_fichier}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-[#2A9D8F]/30 hover:bg-[#2A9D8F]/5 transition-all group"
              >
                {resource.image_miniature ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img src={resource.image_miniature} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#2A9D8F]/10 flex items-center justify-center flex-shrink-0">
                    {resource.type === 'video' || resource.type === 'webinar'
                      ? <Play className="w-4 h-4 text-[#2A9D8F]" />
                      : <BookOpen className="w-4 h-4 text-[#2A9D8F]" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs truncate">{resource.titre}</p>
                  <p className="text-white/60 text-[9px] uppercase tracking-wider">
                    {categorieLabels[resource.categorie] || resource.categorie}
                  </p>
                </div>
                <ArrowRight className="w-3 h-3 text-gray-600 group-hover:text-[#2A9D8F] transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onRestart}
        variant="outline"
        className="w-full border-white/[0.08] bg-white/[0.02] text-white hover:bg-white/[0.05] text-xs"
      >
        <RotateCcw className="w-3.5 h-3.5 mr-2" />
        Recommencer le quiz
      </Button>
    </motion.div>
  );
}

export default function DashboardQuizInline({ resources }) {
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [finished, setFinished] = useState(false);

  const handleAnswer = (selectedIndex) => {
    const question = quizImmoCommercial[currentIndex];
    const correct = selectedIndex === question.correctIndex;
    const newAnswers = [...answers, { questionId: question.id, selectedIndex, correct, categorie: question.categorie }];
    setAnswers(newAnswers);

    if (currentIndex + 1 < quizImmoCommercial.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setFinished(false);
    setStarted(true);
  };

  if (!started) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="bg-white/[0.04] rounded-2xl border border-white/[0.3] p-5 md:p-6"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/[0.1] flex items-center justify-center">
            <Brain className="w-[18px] h-[18px] text-[#F59E0B]" />
          </div>
          <div>
            <h3 className="text-white text-sm font-medium mb-1">Quiz Immobilier Commercial</h3>
            <p className="text-white/70 text-xs leading-relaxed mb-4">
              10 questions pour tester vos connaissances. À la fin, des ressources personnalisées pour progresser.
            </p>
            <Button
              onClick={() => setStarted(true)}
              className="bg-[#F59E0B]/15 border border-[#F59E0B]/30 hover:bg-[#F59E0B]/25 text-white text-xs h-8 px-4"
            >
              Commencer le quiz
              <ArrowRight className="w-3.5 h-3.5 ml-2" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="bg-white/[0.04] rounded-2xl border border-white/[0.3] p-5 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#F59E0B]/[0.1] flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-[#F59E0B]" />
        </div>
        <div className="flex-1">
          <h3 className="text-white text-xs font-medium">Quiz Immobilier Commercial</h3>
        </div>
        {!finished && (
          <span className="text-white text-[10px]">
            {currentIndex + 1} / {quizImmoCommercial.length}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!finished && (
        <div className="h-[2px] bg-white/[0.04] rounded-full overflow-hidden mb-5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#2A9D8F] to-[#F59E0B]"
            animate={{ width: `${((currentIndex + (answers.length > currentIndex ? 1 : 0)) / quizImmoCommercial.length) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {finished ? (
          <ResultsView
            key="results"
            answers={answers}
            questions={quizImmoCommercial}
            resources={resources}
            onRestart={handleRestart}
          />
        ) : (
          <QuestionView
            key={currentIndex}
            question={quizImmoCommercial[currentIndex]}
            onAnswer={handleAnswer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}