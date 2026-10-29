import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import LogoKlocka from "@/components/marque/LogoKlocka";

// L'animation de chargement de K Partners (28 oct. 2026, Jules : « à utiliser partout dans K Partners »). L'anneau
// principal et la particule en violet K Partners (--kp-accent), les anneaux secondaires dans la couleur du texte du
// thème, un halo violet qui respire, le logo « kp_ » au centre (son trait clignote comme un curseur), et une bande
// claire qui traverse le titre. Sans animation quand le système la réduit. Tailles : « ligne » (dans une phrase),
// « sm », « md », « lg ».

// Deux marques (28 oct. 2026, Jules) : K Partners (violet, « kp_ ») et Klocka (menthe, le logo de Klocka OS).
const MARQUES = {
  kp: { accent: "var(--kp-accent)", ombre: "var(--kp-accent-ombre)" },
  klocka: { accent: "rgb(var(--k-menthe-rgb))", ombre: "rgb(var(--k-menthe-rgb) / 0.6)" },
};
const EASE = [0.4, 0, 0.6, 1];
const INFINI = Number.POSITIVE_INFINITY;

const anneau = (interieur, exterieur) => {
  const m = `radial-gradient(circle at 50% 50%, transparent ${interieur}%, black ${interieur + 2}%, black ${exterieur - 2}%, transparent ${exterieur}%)`;
  return { mask: m, WebkitMask: m };
};

const TAILLES = {
  ligne: { cercle: "size-6", logo: null, titre: "text-[13.5px]", sous: "", ecart: "", largeur: "" },
  sm: { cercle: "size-20", logo: "text-lg", trait: "h-[3px] w-[7px]", titre: "text-sm/tight font-medium", sous: "text-xs/relaxed", ecart: "space-y-1.5", largeur: "max-w-48" },
  md: { cercle: "size-32", logo: "text-2xl", trait: "h-1 w-[10px]", titre: "text-base/snug font-medium", sous: "text-sm/relaxed", ecart: "space-y-2", largeur: "max-w-60" },
  lg: { cercle: "size-40", logo: "text-3xl", trait: "h-[5px] w-3", titre: "text-lg/tight font-medium", sous: "text-base/relaxed", ecart: "space-y-3", largeur: "max-w-72" },
};

/** Les anneaux (et le logo), à la taille donnée. */
export function Anneaux({ taille = "md", logo = true, marque = "kp" }) {
  const reduire = useReducedMotion();
  const { accent: ACCENT, ombre } = MARQUES[marque] || MARQUES.kp;
  const t = TAILLES[taille] || TAILLES.md;
  const tourne = (duree, sens = 1, ease = "linear") => (reduire ? {} : { animate: { rotate: [0, 360 * sens] }, transition: { duration: duree, repeat: INFINI, ease } });
  return (
    <motion.div className={`relative flex-none ${t.cercle}`} aria-hidden
      {...(reduire ? {} : { animate: { scale: [1, 1.02, 1] }, transition: { duration: 4, repeat: INFINI, ease: EASE } })}>
      {/* le halo violet */}
      <motion.div className="absolute inset-[18%] rounded-full blur-2xl" style={{ background: ACCENT, opacity: 0.25 }}
        {...(reduire ? {} : { animate: { opacity: [0.15, 0.35, 0.15] }, transition: { duration: 3, repeat: INFINI, ease: EASE } })} />
      {/* l'anneau intérieur fin, couleur du texte */}
      <motion.div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, transparent 0deg, currentColor 90deg, transparent 180deg)", ...anneau(35, 41), opacity: 0.55 }} {...tourne(3)} />
      {/* l'anneau principal, violet K Partners */}
      <motion.div className="absolute inset-0 rounded-full"
        style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${ACCENT} 120deg, color-mix(in srgb, ${ACCENT} 45%, transparent) 240deg, transparent 360deg)`, ...anneau(42, 50), filter: `drop-shadow(0 0 6px ${ombre})` }}
        {...tourne(2.5, 1, EASE)} />
      {/* l'anneau secondaire, en sens contraire */}
      <motion.div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 180deg, transparent 0deg, currentColor 45deg, transparent 90deg)", ...anneau(52, 58), opacity: 0.3 }} {...tourne(4, -1, EASE)} />
      {/* la particule violette */}
      <motion.div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 270deg, transparent 0deg, ${ACCENT} 20deg, transparent 40deg)`, ...anneau(61, 64), opacity: 0.8 }} {...tourne(3.5)} />
      {logo && t.logo && marque === "klocka" && (
        <motion.div className="absolute inset-0 flex items-center justify-center"
          {...(reduire ? {} : { animate: { opacity: [1, 0.75, 1] }, transition: { duration: 2, repeat: INFINI, ease: "easeInOut" } })}>
          {/* Le K détouré, sans fond (28 oct. 2026, Jules) : le fût dans la couleur du texte, le jambage en menthe. */}
          <LogoKlocka className="loader-logo-k h-[36%] w-[36%]" />
        </motion.div>
      )}
      {logo && t.logo && marque !== "klocka" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`flex items-end font-medium leading-none tracking-tight ${t.logo}`}>
            kp
            <motion.span className={`mb-[0.12em] ml-[2px] rounded-[1px] ${t.trait}`} style={{ background: ACCENT }}
              {...(reduire ? {} : { animate: { opacity: [1, 0.2, 1] }, transition: { duration: 1, repeat: INFINI, ease: "easeInOut" } })} />
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Le titre, traversé d'une bande claire (un passage, une pause courte, un passage plus lent, une pause plus longue). */
function Titre({ texte, balayage }) {
  const reduire = useReducedMotion();
  if (!balayage || reduire) {
    return <motion.span {...(reduire ? {} : { animate: { opacity: [0.95, 0.7, 0.95] }, transition: { duration: 3, repeat: INFINI, ease: EASE } })}>{texte}</motion.span>;
  }
  // Le texte devient transparent pour laisser voir le dégradé : sa couleur se prend donc au thème, pas à currentColor.
  const pale = "rgb(var(--k-encre-rgb) / 0.45)";
  const vif = "rgb(var(--k-encre-rgb))";
  return (
    <motion.span className="inline-block bg-clip-text text-transparent"
      style={{ backgroundImage: `linear-gradient(100deg, ${pale} 0%, ${pale} 40%, ${vif} 50%, ${pale} 60%, ${pale} 100%)`, backgroundSize: "250% 100%", WebkitBackgroundClip: "text" }}
      animate={{ backgroundPosition: ["100% 0%", "0% 0%", "100% 0%", "100% 0%", "0% 0%", "0% 0%"] }}
      transition={{ duration: 4, times: [0, 0.33, 0.331, 0.46, 0.9, 1], ease: [[0.45, 0, 0.25, 1], "linear", "linear", [0.6, 0, 0.35, 1], "linear"], repeat: INFINI }}>
      {texte}
    </motion.span>
  );
}

/**
 * Le chargement K Partners. `taille` « ligne » : de petits anneaux à côté d'une phrase ; sinon les anneaux et le logo
 * au centre, le titre (balayé en « md », ou si `balayage`) et la phrase dessous.
 */
/** `marque` : « kp » (K Partners, par défaut) ou « klocka ». */
export default function Loader({ titre = "Un instant", sousTitre = "", taille: tailleDemandee = "md", logo = true, balayage, marque = "kp", brand = null, className = "" }) {
  const m = brand || marque;
  let taille = tailleDemandee;
  // En gros, au milieu, à chaque fois (28 oct. 2026, Jules) : « ligne » ne sert plus qu'aux petits anneaux d'un bouton.
  if (taille === "ligne" && !className.includes("en-ligne")) taille = "md";
  const t = TAILLES[taille] || TAILLES.md;
  if (taille === "ligne") {
    return (
      <span role="status" aria-live="polite" className={`inline-flex items-center gap-2.5 text-ardoise ${t.titre} ${className}`}>
        <Anneaux taille="ligne" logo={false} marque={m} />
        <Titre texte={titre} balayage={false} />
      </span>
    );
  }
  return (
    <div role="status" aria-live="polite" aria-label={titre} className={`flex min-h-[60dvh] w-full flex-col items-center justify-center gap-7 p-8 text-encre ${className}`}>
      <Anneaux taille={taille} logo={logo} marque={m} />
      {(titre || sousTitre) && (
        <motion.div className={`text-center ${t.ecart} ${t.largeur}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}>
          {titre && <p className={`m-0 tracking-[-0.02em] antialiased ${t.titre}`}><Titre texte={titre} balayage={balayage ?? taille === "md"} /></p>}
          {sousTitre && <p className={`m-0 tracking-[-0.01em] opacity-60 antialiased ${t.sous}`}>{sousTitre}</p>}
        </motion.div>
      )}
    </div>
  );
}
