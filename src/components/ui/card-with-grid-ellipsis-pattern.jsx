import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Une carte à grille : un carré de 30 px, un point à chaque intersection, sous
// un dégradé de la couleur de la carte qui l'estompe vers le bas à gauche.
// Le fond est celui d'un onglet au repos (--k-carte-grille-rgb) ; le motif
// passe au gris bleuté en thème clair (index.css). Les trois couches sont des
// colonnes flex : un pied poussé en bas (mt-auto) le reste jusqu'au bord.

export function GridPatternCard({ children, className, patternClassName, gradientClassName }) {
  return (
    <motion.div
      className={cn("flex w-full flex-col overflow-hidden rounded-md border border-trait bg-carte-grille p-3", className)}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <div className={cn("flex size-full flex-1 flex-col bg-grid-pattern bg-[length:30px_30px] bg-repeat", patternClassName)}>
        <div className={cn("flex size-full flex-1 flex-col bg-gradient-to-tr from-carte-grille/90 via-carte-grille/40 to-carte-grille/10", gradientClassName)}>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

export function GridPatternCardBody({ className, ...props }) {
  return <div className={cn("flex flex-1 flex-col p-4 text-left md:p-6", className)} {...props} />;
}
