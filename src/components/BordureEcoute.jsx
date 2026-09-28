import React from "react";

// Le bord de la barre de chat, en dégradé de couleurs qui glisse, pendant la
// dictée — pas le micro : c'est la barre qu'on regarde en parlant, et c'est
// elle qui doit dire qu'elle écoute.
//
// Une pilule est bien plus large que haute : un dégradé conique qui tourne
// s'y écrase en pointes difformes, faute d'être carré. Un dégradé linéaire
// qui glisse horizontalement n'a pas ce problème, quelle que soit la forme
// du cadre — la même technique de bord (un padding qui laisse voir le fond
// du cadre autour d'un contenu opaque) que le halo « lumiere » de
// BoiteSaisie, mais en dégradé qui coule plutôt qu'en highlight qui tourne.
// Le padding et le dégradé apparaissent tous deux en fondu : le bord grandit
// et se colore en douceur, jamais d'un coup. La boucle est continue (la
// même teinte ouvre et ferme le dégradé).
const ARC_EN_CIEL =
  "linear-gradient(90deg, #ff5f6d, #ffae42, #ffe66d, #6ee7b7, #38bdf8, #a78bfa, #f472b6, #ff5f6d)";

export default function BordureEcoute({ actif = false, epaisseur = 1.5, radius = "9999px", className = "", children }) {
  // Le dégradé vit sur sa propre couche, sous le contenu, arrondie comme le
  // cadre, et n'apparaît qu'en écoute. Pas d'overflow caché sur le cadre :
  // les menus qui descendent des vignettes de la barre (les modes du
  // dashboard, le répertoire du marché) en sortent, et un cadre qui les
  // coupait les rendait invisibles, le clic tombant sur le voile derrière.
  return (
    <div
      className={`relative transition-[padding] duration-500 ease-out ${className}`}
      style={{ borderRadius: radius, padding: actif ? epaisseur : 0 }}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-500 motion-reduce:!animate-none ${actif ? "anneau-ecoute-glisse" : ""}`}
        style={{ borderRadius: radius, backgroundImage: ARC_EN_CIEL, opacity: actif ? 1 : 0 }}
      />
      <div className="relative" style={{ borderRadius: radius }}>{children}</div>
    </div>
  );
}
