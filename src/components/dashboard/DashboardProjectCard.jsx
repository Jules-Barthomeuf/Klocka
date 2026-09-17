import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CarteProjet from "@/components/projet/CarteProjet";

// Le carrousel des projets du client, au tableau de bord.
//
// La carte elle-même est celle de CarteProjet : elle était réécrite ici, avec
// son propre calcul du prix de revient qui ne tombait pas toujours sur le même
// chiffre que la page Mes projets. Il ne reste ici que le défilement.

function ProjectCard({ project }) {
  const navigate = useNavigate();
  return <CarteProjet project={project} onOuvrir={() => navigate(`/ProjetDetail?id=${project.id}`)} fleche />;
}

const AUTO_INTERVAL = 5000;

export default function DashboardProjectCard({ projects }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef(null);

  const goTo = useCallback((next) => {
    setDirection(next > current ? 1 : -1);
    setCurrent(next);
  }, [current]);

  const goNext = useCallback(() => {
    const next = (current + 1) % projects.length;
    setDirection(1);
    setCurrent(next);
  }, [current, projects.length]);

  // Auto-play
  useEffect(() => {
    if (projects.length <= 1) return;
    timerRef.current = setInterval(goNext, AUTO_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [goNext, projects.length]);

  // Reset timer on manual nav
  const manualNav = (next) => {
    clearInterval(timerRef.current);
    goTo(next);
    timerRef.current = setInterval(goNext, AUTO_INTERVAL);
  };

  if (projects.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] tracking-[0.2em] uppercase text-menthe-clair">
          {projects.length === 1 ? 'Mon projet' : 'Mes projets'}
        </p>
        {projects.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => manualNav((current - 1 + projects.length) % projects.length)}
              className="w-6 h-6 rounded-full border border-encre/[0.14] flex items-center justify-center text-ardoise hover:text-encre hover:border-menthe transition-colors"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-encre text-[11px] tabular-nums min-w-[24px] text-center">
              {current + 1}/{projects.length}
            </span>
            <button
              onClick={() => manualNav((current + 1) % projects.length)}
              className="w-6 h-6 rounded-full border border-encre/[0.14] flex items-center justify-center text-ardoise hover:text-encre hover:border-menthe transition-colors"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.25 }}
        >
          <ProjectCard project={projects[current]} />
        </motion.div>
      </AnimatePresence>

      {/* Dots indicator */}
      {projects.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {projects.map((_, i) => (
            <button
              key={i}
              onClick={() => manualNav(i)}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === current ? 'w-5 bg-menthe' : 'w-1.5 bg-encre/15 hover:bg-encre/30'
              }`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
