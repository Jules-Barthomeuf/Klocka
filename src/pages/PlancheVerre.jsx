// Planche « La barre en verre » (12 nov. 2026, Jules : « créer une planche avec la navbar en mode glass-morphisme ;
// toute la navbar qui remonte ») : le vrai dossier, dans le cadre du 12 nov. (la barre de navigation soudée à la bande
// du haut), mais en verre. La barre, la bande et la colonne des étapes prennent la teinte de la barre à 42 % sous le
// voile `surface` (60 % en clair), floutée à 12 px et ravivée : le fond et le dossier qui défile dessous s'y devinent.
// À 24 px, essayé d'abord, le texte fin et les traits du dossier disparaissaient : on ne voyait pas le verre. Ouvertes
// par-dessus la page (barre au survol, menu des étapes), elles s'épaississent à 80 % pour garder leurs noms nets. Le dossier et le
// chat montent sous la bande ; le panneau des parties colle juste sous elle (un `sticky` compte le padding du conteneur
// qui défile : son `top-0` tombe sous la bande sans rien changer). Le coin rond de 16 px et son filet `trait`
// restent. Au téléphone, la barre du haut prend la même matière. L'écran réel (/Dossiers) ne bouge pas : « Aujourd'hui |
// Verre », en bas, compare les deux sur le même dossier. Planche à retirer une fois le choix fait.
// La planche s'ouvre sur la liste des dossiers (13 nov. 2026, mise en ligne pour essai) : le dossier choisi s'y ouvre
// en verre, sans quitter la planche (Analyse change seulement ?deal_id=). Pas de dossier imposé : la base de production
// n'a pas les mêmes que la base locale.
import { useEffect, useState } from "react";
import Analyse from "@/pages/Analyse";

// Tout est écrit sous html.k-cadre-verre : « Aujourd'hui » retire la classe et rend l'écran tel qu'il est.
const CSS = `
html.k-planche-verre {
  --k-verre-fond: linear-gradient(var(--k-surface), var(--k-surface)), rgb(var(--k-rail-rgb) / .42);
  --k-verre-epais: linear-gradient(var(--k-surface), var(--k-surface)), rgb(var(--k-rail-rgb) / .8);
  --k-verre-flou: blur(12px) saturate(1.8);
}
html.k-planche-verre[data-theme="clair"] {
  --k-verre-fond: rgb(var(--k-rail-rgb) / .6);
  --k-verre-epais: rgb(var(--k-rail-rgb) / .86);
}
.k-planche-bascule,
html.k-cadre-verre .k-barre-laterale,
html.k-cadre-verre .z-50.bg-fond\\/80.backdrop-blur-xl,
html.k-cadre-verre.k-cadre-dossier header:has(> #bande-dossier-titre),
html.k-cadre-verre.k-cadre-dossier .k-crm-contenu .fixed.z-40 > .bg-rail {
  background: var(--k-verre-fond);
  -webkit-backdrop-filter: var(--k-verre-flou);
  backdrop-filter: var(--k-verre-flou);
}
html.k-cadre-verre .k-barre-laterale.w-\\[228px\\],
html.k-cadre-verre.k-cadre-dossier .k-crm-contenu .fixed.z-40 > .bg-rail.w-\\[220px\\] { background: var(--k-verre-epais); }

/* La bande passe par-dessus le dossier, qui monte dessous. */
html.k-cadre-verre.k-cadre-dossier div:has(> header > #bande-dossier-titre) { position: relative; background: transparent; }
html.k-cadre-verre.k-cadre-dossier header:has(> #bande-dossier-titre) { position: absolute; inset: 0 0 auto 0; z-index: 30; }
html.k-cadre-verre.k-cadre-dossier .k-crm-contenu { border: 0; border-radius: 0; }
html.k-cadre-verre.k-cadre-dossier .k-crm-contenu > .z-10.h-full:not(.k-colonne-chat) { padding-top: 48px; }
html.k-cadre-verre.k-cadre-dossier .k-crm-contenu > .z-10.h-full.py-8:not(.lg\\:pt-0) { padding-top: 80px; }
html.k-cadre-verre.k-cadre-dossier .k-colonne-chat { padding-top: 48px; }

/* Le coin : le verre remplit le quart de rond, le filet le suit, sous la bande et le long de la barre. */
html.k-cadre-verre.k-cadre-dossier div:has(> header > #bande-dossier-titre)::before {
  content: ""; position: absolute; top: 48px; left: 0; z-index: 30; width: 16px; height: 16px; pointer-events: none;
  background: var(--k-verre-fond); -webkit-backdrop-filter: var(--k-verre-flou); backdrop-filter: var(--k-verre-flou);
  clip-path: path("M0 0H16A16 16 0 0 0 0 16Z");
}
html.k-cadre-verre.k-cadre-dossier div:has(> header > #bande-dossier-titre)::after {
  content: ""; position: absolute; inset: 48px 0 0 0; z-index: 31; pointer-events: none;
  border-top: 1px solid var(--k-trait); border-left: 1px solid var(--k-trait); border-top-left-radius: 16px;
}

/* La page réelle n'a pas la bulle de l'assistant : la planche non plus. */
html.k-planche-verre .assistant-flottant { display: none !important; }
`;

export default function PlancheVerre() {
  const [verre, setVerre] = useState(true);
  useEffect(() => {
    document.documentElement.classList.add("k-planche-verre");
    return () => document.documentElement.classList.remove("k-planche-verre", "k-cadre-verre");
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("k-cadre-verre", verre); }, [verre]);

  return (
    <>
      <style>{CSS}</style>
      <Analyse />
      <div role="group" aria-label="Planche : la barre de navigation"
        className="k-planche-bascule fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border border-bord-doux p-1 shadow-[0_16px_40px_rgb(0_0_0/0.3)] max-md:bottom-[92px]">
        {[["Aujourd'hui", false], ["Verre", true]].map(([libelle, v]) => (
          <button key={libelle} type="button" aria-pressed={verre === v} onClick={() => setVerre(v)}
            className={`h-8 rounded-full px-4 text-[12.5px] transition-colors max-md:h-10 ${verre === v ? "bg-rail-actif text-encre" : "text-ardoise hover:text-encre"}`}
            style={verre === v ? undefined : { background: "transparent" }}>
            {libelle}
          </button>
        ))}
      </div>
    </>
  );
}
