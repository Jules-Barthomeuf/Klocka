import { useEffect } from "react";

export default function AnimatedBackground({ color = "#8fa0f2", tintOpacity = 0.6 }) {
  useEffect(() => {
    // Load Unicorn Studio script
    if (!window.UnicornStudio) {
      window.UnicornStudio = { isInitialized: false };
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.29/dist/unicornStudio.umd.js";
      script.onload = function() {
        if (!window.UnicornStudio.isInitialized) {
          window.UnicornStudio.init();
          window.UnicornStudio.isInitialized = true;
        }
      };
      (document.head || document.body).appendChild(script);
    }
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full -z-10 pointer-events-none">
      {/* Unicorn Studio Aura */}
      <div data-us-project="ILgOO23w4wEyPQOKyLO4" className="absolute w-full h-full left-0 top-0" />
      
      {/* Color Tint Overlay */}
      <div 
        className="absolute inset-0 mix-blend-color opacity-0 transition-opacity duration-1000"
        style={{ 
          backgroundColor: color,
        }} 
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#000000]/80 via-transparent to-[#000000]/90" />
    </div>
  );
}