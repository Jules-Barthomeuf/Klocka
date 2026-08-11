import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import ClientProjectCard from "./ClientProjectCard";

export default function ClientProjectCarousel({ projects }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (projects.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % projects.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [projects.length]);

  if (!projects.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-white/30 uppercase tracking-[0.2em] text-[10px] font-medium">
          {projects.length === 1 ? 'Mon projet' : 'Mes projets'}
        </p>
        {projects.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-white/20 text-xs">{currentIndex + 1} / {projects.length}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentIndex((prev) => (prev - 1 + projects.length) % projects.length)}
              className="text-white/40 hover:text-white hover:bg-white/5 h-7 w-7"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % projects.length)}
              className="text-white/40 hover:text-white hover:bg-white/5 h-7 w-7"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.3 }}
        >
          <ClientProjectCard project={projects[currentIndex]} index={0} />
        </motion.div>
      </AnimatePresence>

      {/* Dots */}
      {projects.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-5">
          {projects.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-6 bg-[#2A9D8F]' : 'w-1.5 bg-white/10 hover:bg-white/20'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}