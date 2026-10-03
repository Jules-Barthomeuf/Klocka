import React from "react";

/**
 * Le fond des panneaux secondaires : la grille de points de `.k-grid`
 * (src/index.css). `pas` et `marge` en pixels, 14 par défaut. La grille ne
 * défile pas avec le contenu et ne capte aucun clic : on peut donner à la
 * surface son propre défilement (`overflow-y-auto`).
 */
const GridSurface = React.forwardRef(function GridSurface({ as: Balise = "div", pas, marge, className = "", style, ...props }, ref) {
  const vars = {
    ...(pas != null ? { "--k-grid-pas": `${pas}px` } : {}),
    ...(marge != null ? { "--k-grid-marge": `${marge}px` } : {}),
  };
  return <Balise ref={ref} className={`k-grid ${className}`} style={{ ...vars, ...style }} {...props} />;
});

export default GridSurface;
