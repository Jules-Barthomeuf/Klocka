import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Retour et Avant, comme les flèches d'un navigateur (29 oct. 2026, Jules : pages Offres et Dossiers).
// React Router note la place dans l'historique (`history.state.idx`) : la flèche sans page de ce côté s'éteint.
export default function FlechesHistorique({ className = "" }) {
  const navigate = useNavigate();
  useLocation();
  const idx = typeof window !== "undefined" ? window.history.state?.idx : null;
  const sansRetour = idx === 0;
  const sansAvant = typeof idx === "number" && idx >= window.history.length - 1;
  const rond = "grid h-8 w-8 place-items-center rounded-full border border-trait text-ardoise transition-colors hover:border-bord-doux hover:text-encre disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className={`flex flex-none items-center gap-1.5 ${className}`}>
      <button type="button" onClick={() => navigate(-1)} disabled={sansRetour} aria-label="Page précédente" title="Page précédente" className={rond} style={{ background: "transparent" }}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => navigate(1)} disabled={sansAvant} aria-label="Page suivante" title="Page suivante" className={rond} style={{ background: "transparent" }}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
