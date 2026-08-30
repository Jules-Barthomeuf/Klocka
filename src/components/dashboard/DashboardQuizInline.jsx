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
      <h3 className="text-[#f2f3f5] text-sm md:text-base font-medium mb-5 leading-relaxed">
        {question.question}
      </h3>
      <div className="space-y-2">
        {question.options.map((option, index) => {
          const isSelected = selected === index;
          const isCorrect = index === question.correctIndex;
          const show = hasAnswered;

          let border = "border-[#1f2228] hover:border-[#f2f3f5]/[0.15]";
          let bg = "bg-[#f2f3f5]/[0.02] hover:bg-[#f2f3f5]/[0.04]";
          if (show) {
            if (isCorrect) { border = "border-[#96c0b8]/50"; bg = "bg-[#96c0b8]/10"; }
            else if (isSelected) { border = "border-red-500/50"; bg = "bg-red-500/10"; }
            else { border = "border-[#f2f3f5]/[0.03]"; bg = "bg-[#f2f3f5]/[0.01]"; }
          }

          return (
            <button
              key={index}
              onClick={() => handleClick(index)}
              disabled={hasAnswered}
              className={`w-full text-left p-3 rounded-md border ${border} ${bg} transition-all duration-300 flex items-center gap-3`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${
                show && isCorrect ? "bg-[#96c0b8]/20 text-[#96c0b8]" :
                show && isSelected && !isCorrect ? "bg-red-500/20 text-red-400" :
                "bg-[#f2f3f5]/[0.05] text-[#f2f3f5]/60"
              }`}>
                {show && isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                 show && isSelected && !isCorrect ? <XCircle className="w-3.5 h-3.5" /> :
                 String.fromCharCode(65 + index)}
              </div>
              <span className={`text-xs md:text-sm ${
                show && isCorrect ? "text-[#96c0b8]" :
                show && isSelected && !isCorrect ? "text-red-400" :
                hasAnswered ? "text-[#f2f3f5]/50" : "text-[#f2f3f5]"
              }`}>{option}</span>
            </button>
          );
        })}
      </div>
      {hasAnswered && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-[#f2f3f5]/80 text-[11px] leading-relaxed p-3 rounded-lg bg-[#f2f3f5]/[0.02] border border-[#15171b]"
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

  const color = percent >= 70 ? "#96c0b8" : percent >= 50 ? "#96c0b8" : "#e8746a";

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
          <p className="text-2xl font-light text-[#f2f3f5]">
            {score} <span className="text-[#9298a6] text-sm">/ {total}</span>
          </p>
          <p className="text-[#f2f3f5]/80 text-xs">{msg}</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="grid grid-cols-10 gap-1 mb-5">
        {answers.map((a, i) => (
          <div key={i} className={`h-1 rounded-full ${a.correct ? "bg-[#96c0b8]" : "bg-red-500/60"}`} />
        ))}
      </div>

      {/* Catégories à approfondir */}
      {wrongCategories.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#9298a6] mb-2">À approfondir</p>
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
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#9298a6] mb-2">
            {allCorrect ? "Pour aller plus loin" : "Vidéos recommandées"}
          </p>
          <div className="space-y-2">
            {displayResources.map(resource => (
              <a
                key={resource.id}
                href={resource.url_fichier}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-md bg-[#f2f3f5]/[0.02] border border-[#1f2228] hover:border-[#96c0b8]/30 hover:bg-[#96c0b8]/5 transition-all group"
              >
                {resource.image_miniature ? (
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                    <img src={resource.image_miniature} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-[#96c0b8]/10 flex items-center justify-center flex-shrink-0">
                    {resource.type === 'video' || resource.type === 'webinar'
                      ? <Play className="w-4 h-4 text-[#96c0b8]" />
                      : <BookOpen className="w-4 h-4 text-[#96c0b8]" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[#f2f3f5] text-xs truncate">{resource.titre}</p>
                  <p className="text-[#f2f3f5]/60 text-[9px] uppercase tracking-wider">
                    {categorieLabels[resource.categorie] || resource.categorie}
                  </p>
                </div>
                <ArrowRight className="w-3 h-3 text-[#6a7180] group-hover:text-[#96c0b8] transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onRestart}
        variant="outline"
        className="w-full border-[#1f2228] bg-[#f2f3f5]/[0.02] text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.05] text-xs"
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
        className="bg-[#0f1114] border border-[#f2f3f5]/[0.12] p-5 md:p-6"
      >
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-10 h-10 rounded-md bg-[#96c0b8]/[0.1] flex items-center justify-center">
            <Brain className="w-[18px] h-[18px] text-[#96c0b8]" />
          </div>
          <div>
            <h3 className="text-[#f2f3f5] text-sm font-medium mb-1">Quiz Immobilier Commercial</h3>
            <p className="text-[#f2f3f5]/70 text-xs leading-relaxed mb-4">
              10 questions pour tester vos connaissances. À la fin, des ressources personnalisées pour progresser.
            </p>
            <Button
              onClick={() => setStarted(true)}
              className="bg-[#96c0b8]/15 border border-[#96c0b8]/30 hover:bg-[#96c0b8]/25 text-[#f2f3f5] text-xs h-8 px-4"
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
    <div className="bg-[#0f1114] border border-[#f2f3f5]/[0.12] p-5 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#96c0b8]/[0.1] flex items-center justify-center flex-shrink-0">
          <Brain className="w-4 h-4 text-[#96c0b8]" />
        </div>
        <div className="flex-1">
          <h3 className="text-[#f2f3f5] text-xs font-medium">Quiz Immobilier Commercial</h3>
        </div>
        {!finished && (
          <span className="text-[#f2f3f5] text-[10px]">
            {currentIndex + 1} / {quizImmoCommercial.length}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!finished && (
        <div className="h-[2px] bg-[#f2f3f5]/[0.04] rounded-full overflow-hidden mb-5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#96c0b8] to-[#96c0b8]"
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