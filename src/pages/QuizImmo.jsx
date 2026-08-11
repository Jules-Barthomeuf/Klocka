import React, { useState, useEffect, useMemo } from "react";
import { QUESTIONS, LEVELS } from "@/data/quizQuestions";
import QuizProgressBar from "@/components/quiz/QuizProgressBar";
import QuizQuestion from "@/components/quiz/QuizQuestion";
import QuizComplete from "@/components/quiz/QuizComplete";
import LevelMap from "@/components/quiz/LevelMap";
import FeedbackWidget from "@/components/FeedbackWidget";
import { motion, AnimatePresence } from "framer-motion";
import { Gamepad2, ArrowLeft, Zap, RotateCcw } from "lucide-react";

const STORAGE_KEY = "klocka_quiz_progress";

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  return JSON.parse(raw);
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export default function QuizImmo() {
  const [gameState, setGameState] = useState("menu"); // menu | playing | complete
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [progress, setProgress] = useState(loadProgress);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [queue, setQueue] = useState([]);
  const [isReviewMode, setIsReviewMode] = useState(false);

  // Save progress to localStorage whenever it changes
  useEffect(() => { saveProgress(progress); }, [progress]);

  // Get questions for a level
  const getQuestionsForLevel = (levelId) => QUESTIONS.filter((q) => q.level === levelId);

  // Enrich levels with question counts
  const enrichedLevels = useMemo(() =>
    LEVELS.map((l) => ({ ...l, questionCount: getQuestionsForLevel(l.id).length })),
    []
  );

  // Build the queue of questions for a level session
  const startLevel = (levelId) => {
    const lvlProgress = progress[levelId] || { correct: [], wrong: [], answered: [] };
    const allQuestions = getQuestionsForLevel(levelId);
    
    // Get unanswered questions first
    const unanswered = allQuestions.filter((q) => !lvlProgress.answered.includes(q.id));
    
    if (unanswered.length > 0) {
      // Play unanswered questions (shuffled)
      const shuffled = [...unanswered].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      setIsReviewMode(false);
    } else if (lvlProgress.wrong.length > 0) {
      // All answered → play wrong ones for review
      const wrongQuestions = allQuestions.filter((q) => lvlProgress.wrong.includes(q.id));
      const shuffled = [...wrongQuestions].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      setIsReviewMode(true);
    } else {
      // All correct → replay all shuffled
      const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
      setQueue(shuffled);
      setIsReviewMode(false);
    }

    setSelectedLevel(levelId);
    setCurrentIndex(0);
    setSessionCorrect(0);
    setSessionTotal(0);
    setStreak(0);
    setBestStreak(0);
    setGameState("playing");
  };

  const handleAnswer = (isCorrect) => {
    const question = queue[currentIndex];
    const levelId = selectedLevel;

    setSessionTotal((t) => t + 1);

    // Update progress
    setProgress((prev) => {
      const lvl = prev[levelId] || { correct: [], wrong: [], answered: [] };
      const newCorrect = [...lvl.correct];
      const newWrong = [...lvl.wrong];
      const newAnswered = [...lvl.answered];

      if (!newAnswered.includes(question.id)) newAnswered.push(question.id);

      if (isCorrect) {
        if (!newCorrect.includes(question.id)) newCorrect.push(question.id);
        // Remove from wrong if was there
        const wrongIdx = newWrong.indexOf(question.id);
        if (wrongIdx !== -1) newWrong.splice(wrongIdx, 1);
      } else {
        if (!newWrong.includes(question.id)) newWrong.push(question.id);
        // Remove from correct if was there
        const correctIdx = newCorrect.indexOf(question.id);
        if (correctIdx !== -1) newCorrect.splice(correctIdx, 1);
      }

      return { ...prev, [levelId]: { correct: newCorrect, wrong: newWrong, answered: newAnswered } };
    });

    if (isCorrect) {
      setSessionCorrect((s) => s + 1);
      setStreak((s) => {
        const n = s + 1;
        setBestStreak((b) => Math.max(b, n));
        return n;
      });
    } else {
      setStreak(0);
    }

    if (currentIndex + 1 >= queue.length) {
      setTimeout(() => setGameState("complete"), 300);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleBackToMenu = () => {
    setGameState("menu");
    setSelectedLevel(null);
  };

  const handleResetAll = () => {
    if (window.confirm("Remettre toute la progression à zéro ?")) {
      setProgress({});
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const currentQuestion = queue[currentIndex];
  const currentLevelMeta = LEVELS.find((l) => l.id === selectedLevel);

  // Overall stats
  const totalCorrect = Object.values(progress).reduce((sum, l) => sum + l.correct.length, 0);
  const totalQuestions = QUESTIONS.length;
  const overallPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="min-h-screen bg-black text-white">
      <FeedbackWidget />

      <div className="max-w-2xl mx-auto px-4 md:px-8 pt-8 pb-20">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-3">Quiz</p>
          <div className="flex items-center justify-between">
            <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight">Klocka Challenge</h1>
            {gameState === "menu" && (
              <button onClick={handleResetAll} className="text-gray-600 hover:text-gray-400 transition-colors" title="Réinitialiser">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="h-px w-16 bg-[#2A9D8F] mt-3" />
        </div>

        <AnimatePresence mode="wait">
          {/* ===== MENU ===== */}
          {gameState === "menu" && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Overall progress */}
              <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-[#2A9D8F]/10 border border-[#2A9D8F]/20 flex items-center justify-center">
                    <Gamepad2 className="w-6 h-6 text-[#2A9D8F]" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Progression globale</p>
                    <p className="text-gray-500 text-xs">{totalCorrect}/{totalQuestions} questions maîtrisées</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[#2A9D8F] text-2xl font-light">{overallPct}%</p>
                  </div>
                </div>
                <div className="h-3 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#2A9D8F] to-[#71CCBA]"
                    initial={{ width: 0 }}
                    animate={{ width: `${overallPct}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
              </div>

              {/* Level map */}
              <div>
                <p className="text-gray-500 text-xs uppercase tracking-[0.2em] mb-4">Choisissez un niveau</p>
                <LevelMap
                  levels={enrichedLevels}
                  progress={progress}
                  onSelectLevel={startLevel}
                />
              </div>
            </motion.div>
          )}

          {/* ===== PLAYING ===== */}
          {gameState === "playing" && currentQuestion && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Back + Level info */}
              <div className="flex items-center justify-between">
                <button onClick={handleBackToMenu} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm">
                  <ArrowLeft className="w-4 h-4" />
                  Retour
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{currentLevelMeta?.icon}</span>
                  <span className={`text-xs font-medium ${currentLevelMeta?.textColor}`}>
                    {currentLevelMeta?.label}
                    {isReviewMode && " • Révision"}
                  </span>
                </div>
              </div>

              {/* Progress */}
              <QuizProgressBar
                current={currentIndex + 1}
                total={queue.length}
                correctCount={sessionCorrect}
              />

              {/* Streak */}
              {streak >= 3 && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 mx-auto w-fit"
                >
                  <Zap className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-orange-400 text-xs font-medium">{streak} de suite !</span>
                </motion.div>
              )}

              {/* Question */}
              <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-6 md:p-8">
                <QuizQuestion
                  question={currentQuestion}
                  questionIndex={currentIndex}
                  total={queue.length}
                  onAnswer={handleAnswer}
                />
              </div>

              {/* Score footer */}
              <div className="flex items-center justify-center gap-6 text-center">
                <div>
                  <p className="text-white text-lg font-light">{sessionCorrect}</p>
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider">Correctes</p>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div>
                  <p className="text-orange-400 text-lg font-light">{streak}</p>
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider">Série</p>
                </div>
                <div className="w-px h-8 bg-white/[0.06]" />
                <div>
                  <p className="text-gray-400 text-lg font-light">{sessionTotal - sessionCorrect}</p>
                  <p className="text-gray-600 text-[10px] uppercase tracking-wider">Erreurs</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===== COMPLETE ===== */}
          {gameState === "complete" && (
            <motion.div
              key="complete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <button onClick={handleBackToMenu} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm">
                <ArrowLeft className="w-4 h-4" />
                Retour aux niveaux
              </button>

              <QuizComplete
                score={sessionCorrect}
                total={queue.length}
                onRestart={() => startLevel(selectedLevel)}
              />

              {/* Level stats after completion */}
              {selectedLevel && (() => {
                const lvl = progress[selectedLevel] || { correct: [], wrong: [] };
                const totalQ = getQuestionsForLevel(selectedLevel).length;
                return (
                  <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                    <div className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-4 text-center">
                      <p className="text-emerald-400 text-xl font-light">{lvl.correct.length}</p>
                      <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-1">Maîtrisées</p>
                    </div>
                    <div className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-4 text-center">
                      <p className="text-orange-400 text-xl font-light">{lvl.wrong.length}</p>
                      <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-1">À réviser</p>
                    </div>
                    <div className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-4 text-center">
                      <p className="text-[#2A9D8F] text-xl font-light">{totalQ - lvl.correct.length - lvl.wrong.length}</p>
                      <p className="text-gray-600 text-[10px] uppercase tracking-wider mt-1">Restantes</p>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}