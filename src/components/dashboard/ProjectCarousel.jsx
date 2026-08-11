import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClientProjectCard2 from "@/components/dashboard/ClientProjectCard2";

export default function ProjectCarousel({ projects }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (projects.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % projects.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [projects.length]);

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % projects.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + projects.length) % projects.length);
  };

  const currentProject = projects[currentIndex];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-1">Portfolio</p>
          <h2 className="text-xl font-light text-white">Mes projets</h2>
        </div>
        {projects.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-white/20 text-xs">{currentIndex + 1} / {projects.length}</span>
            <Button variant="ghost" size="icon" onClick={goToPrevious} className="text-white/40 hover:text-white hover:bg-white/5 h-7 w-7">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goToNext} className="text-white/40 hover:text-white hover:bg-white/5 h-7 w-7">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <ClientProjectCard2 project={currentProject} />

      {projects.length > 1 && (
        <div className="flex gap-1.5 justify-center mt-3">
          {projects.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-px rounded-full transition-all ${idx === currentIndex ? 'w-6 bg-[#2A9D8F]' : 'w-3 bg-white/10 hover:bg-white/20'}`}
            />
          ))}
        </div>
      )}
    </div>);

}