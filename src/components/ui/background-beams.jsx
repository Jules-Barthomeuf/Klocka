"use client";
import { cn } from "@/lib/utils";
import React, { useEffect, useRef } from "react";

export const BackgroundBeams = React.memo(() => {
  const beamsRef = useRef([]);
  const containerRef = useRef(null);

  useEffect(() => {
    const beams = beamsRef.current;
    if (!beams.length) return;

    const animateBeam = (beam, delay) => {
      setTimeout(() => {
        beam.style.animation = `beamAnimation 8s linear infinite`;
        beam.style.animationDelay = `${delay}s`;
      }, delay * 1000);
    };

    beams.forEach((beam, index) => {
      if (beam) {
        animateBeam(beam, index * 0.5);
      }
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      <style jsx>{`
        @keyframes beamAnimation {
          0% {
            transform: translateY(-100%) translateX(-50%);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) translateX(-50%);
            opacity: 0;
          }
        }
      `}</style>
      
      {[...Array(6)].map((_, index) => (
        <div
          key={index}
          ref={(el) => (beamsRef.current[index] = el)}
          className="absolute top-0 h-full w-px"
          style={{
            left: `${15 + index * 15}%`,
            background: `linear-gradient(to bottom, transparent, rgba(255, 255, 255, ${0.1 + index * 0.05}), transparent)`,
          }}
        />
      ))}
    </div>
  );
});

BackgroundBeams.displayName = "BackgroundBeams";