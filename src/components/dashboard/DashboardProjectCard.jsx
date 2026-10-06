import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CarteProjet from "../projet/CarteProjet";

function ProjectCard({ project }) {
  const navigate = useNavigate();
  return <CarteProjet project={project} onOuvrir={() => navigate(`/Projet?id=${project.id}`)} />;
}

export default function DashboardProjectCard({ projects }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  // On passe d'un projet à l'autre à la main, jamais tout seul.
  const manualNav = (next) => {
    setDirection(next > current ? 1 : -1);
    setCurrent(next);
  };

  if (projects.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div className="flex items-center justify-between mb-3">
        <p className="m-0 text-[16px] font-medium text-encre">
          {projects.length === 1 ? 'Mon projet' : 'Mes projets'}
        </p>
        {projects.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => manualNav((current - 1 + projects.length) % projects.length)}
              className="w-7 h-7 rounded-full border border-trait flex items-center justify-center text-craie hover:text-encre hover:border-bord-vif transition-colors max-md:w-9 max-md:h-9"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-craie text-[13px] tabular-nums min-w-[28px] text-center">
              {current + 1}/{projects.length}
            </span>
            <button
              onClick={() => manualNav((current + 1) % projects.length)}
              className="w-7 h-7 rounded-full border border-trait flex items-center justify-center text-craie hover:text-encre hover:border-bord-vif transition-colors max-md:w-9 max-md:h-9"
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