import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";
import { createPageUrl } from "@/utils";
import { MODULES_KDATA } from "@/lib/kdata-modules";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, themeEffectif } from "@/lib/personnalisation";

// Le cadre des Outils (10 nov. 2026, Jules : « je veux que toutes les pages aient la barre de gauche qui monte
// jusqu'en haut comme sur le tableau de bord ») : le cadre de /CRM et d'Emailing autour de chaque page des Outils.
// La barre de Klocka et la bande de 48 px ne font qu'un bloc (index.css, .k-cadre-crm), le logo « outils_ » en haut
// à gauche, le panneau de 236 px range les outils par usage. Posé par Layout, sur toutes les pages des Outils.
// La recherche de la bande cherche dans la file des analyses (page principale, vue Analyses).

const MODULES = Object.fromEntries(MODULES_KDATA.map((m) => [m.cle, m]));
// Les outils hors dossier (11 nov. 2026, Jules) : Rue, Marché, Locataire et l'historique des lancements, en tête. Les
// outils K restent dessous (Jules, le même jour : « réaffiche les autres outils quand même »).
const ANALYSER = [["rue", "Rue"], ["marche", "Marché"], ["locataire", "Locataire"], ["historique", "Historique"]]
  .map(([cle, mot]) => ({ cle: `outil:${cle}`, mot, to: `/Outils?outil=${cle}`, outil: cle }));
const GROUPES = [
  ["Analyser un bien", ANALYSER],
  ["Autres outils", ["kexpertise", "kzoning", "valeur-locative", "ktransactions", "kfoncier", "kpatrimoine", "kestimation", "kprospective", "kvacance"]],
];
// Le panneau se replie (17 nov. 2026, Jules : « fais en sorte qu'on puisse fermer, ouvrir ») : un bouton en haut le
// ferme en une bande de 48 px, le même le rouvre. Le choix se garde d'une page à l'autre, dans ce navigateur.
const CLE_REPLIE = "outils.panneau-replie";
// Les pages qui ont besoin de toute la largeur (le graphe de K-Patrimoine, 18 nov. 2026) s'ouvrent panneau replié, tant
// que personne ne l'a rouvert ou fermé à la main : un choix posé l'emporte partout.
const PAGES_LARGES = new Set(["KPatrimoine"]);
const lireReplie = (page) => {
  try {
    const v = localStorage.getItem(CLE_REPLIE);
    return v == null ? PAGES_LARGES.has(page) : v === "1";
  } catch { return PAGES_LARGES.has(page); }
};
const BOUTON_PANNEAU = "grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre";
const LIEN = "flex h-9 w-full items-center justify-between gap-2 rounded-[8px] px-2.5 text-left text-[14px] transition-colors max-md:w-auto max-md:flex-none max-md:whitespace-nowrap";

export default function CadreOutils({ page, children }) {
  const { prefs, changer } = usePersonnalisation();
  const clair = themeEffectif(prefs) === CLAIR;
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const vueBord = page === "KData" ? (params.get("p") === "analyses" ? "analyses" : "bord") : null;
  const [recherche, setRecherche] = useState(page === "KData" ? params.get("q") || "" : "");
  const [replie, setReplie] = useState(() => lireReplie(page));
  useEffect(() => { setReplie(lireReplie(page)); }, [page]);
  const basculer = () => setReplie((r) => { try { localStorage.setItem(CLE_REPLIE, r ? "0" : "1"); } catch { /* sans stockage */ } return !r; });

  // Le fond et la barre en verre comme le reste (16 nov. 2026, Jules) : plus le cadre neutre du CRM (k-cadre-crm, fond
  // uni, personnalisation d'origine) mais celui du dossier ouvert (k-cadre-outils, index.css) : la personnalisation de
  // chacun, et le halo du Layout qui passe derrière la barre, la bande et la page.
  useEffect(() => {
    document.documentElement.classList.add("k-cadre-outils");
    return () => document.documentElement.classList.remove("k-cadre-outils");
  }, []);

  const chercher = (q) => {
    setRecherche(q);
    // L'historique des lancements remplace la page Analyses (11 nov. 2026) ; une adresse tapée part dans le formulaire.
    navigate(q ? `/Outils?${new URLSearchParams({ outil: "rue", adresse: q })}` : "/Outils?outil=historique", { replace: page === "Outils" });
  };

  return (
    <div className="k-cadre-l flex h-[100dvh] min-h-0 flex-col text-encre max-md:h-auto">
      {createPortal(<span className="pointer-events-none fixed left-[15px] top-0 z-[45] flex h-12 items-center max-md:hidden"><span className="logo-kp logo-kp-theme text-[24px] tracking-[-0.03em]" role="img" aria-label="Outils">outils<span className="logo-kp-trait" style={{ width: "0.4em", marginLeft: "0.17em" }} aria-hidden="true" /></span></span>, document.body)}
      <header className="k-verre-barre relative flex h-12 flex-none items-center gap-4 px-4 max-md:hidden">
        <form onSubmit={(e) => { e.preventDefault(); chercher(recherche.trim()); }} className="mx-auto flex h-8 w-full max-w-[480px] items-center gap-2.5 rounded-full bg-relief px-4 focus-within:ring-1 focus-within:ring-bord-doux">
          <Search className="h-4 w-4 flex-none text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Une adresse à lire…" aria-label="Une adresse à lire" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
        </form>
        <button type="button" onClick={() => changer({ mode: clair ? "sombre" : "clair" })} aria-label={clair ? "Passer en mode sombre" : "Passer en mode clair"} className="absolute right-4 grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
          {clair ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </header>
      <div className="k-crm-contenu flex min-h-0 flex-1 overflow-hidden rounded-tl-[16px] max-md:flex-col max-md:overflow-visible max-md:rounded-none">
        {replie && (
          <div className="flex w-12 flex-none flex-col items-center border-r border-trait pt-3 max-md:hidden">
            <button type="button" onClick={basculer} aria-label="Ouvrir le panneau des outils" title="Ouvrir le panneau des outils" aria-expanded="false" className={BOUTON_PANNEAU} style={{ background: "transparent" }}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}
        <nav aria-label="Pages des outils" className={`${replie ? "hidden max-md:flex" : "flex"} w-[236px] flex-none flex-col overflow-y-auto border-r border-trait px-3 pb-6 pt-3 max-md:w-auto max-md:flex-row max-md:gap-1.5 max-md:overflow-x-auto max-md:border-b max-md:border-r-0 max-md:pb-3`}>
          <button type="button" onClick={basculer} aria-label="Fermer le panneau des outils" title="Fermer le panneau des outils" aria-expanded="true" className={`${BOUTON_PANNEAU} relative z-10 -mb-8 self-end max-md:hidden`} style={{ background: "transparent" }}>
            <PanelLeftClose className="h-4 w-4" />
          </button>
          {GROUPES.map(([g, liste]) => (
            <React.Fragment key={g}>
              <p className="m-0 px-2.5 pb-1 pt-3 text-[12px] uppercase tracking-[.04em] text-brume max-md:hidden">{g}</p>
              {liste.map((x) => {
                const [cle, mot, to, ici] = x?.outil
                  ? [x.cle, x.mot, x.to, page === "Outils" && (params.get("outil") || "rue") === x.outil]
                  : Array.isArray(x)
                    ? [x[0], x[1], `${createPageUrl("KData")}${x[0] === "analyses" ? "?p=analyses" : ""}`, vueBord === x[0]]
                    : [x, MODULES[x]?.nom, MODULES[x]?.chemin, page === MODULES[x]?.pageName];
                if (!to) return null;
                return (
                  <Link key={cle} to={to} aria-current={ici ? "page" : undefined}
                    className={`${LIEN} ${ici ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`}>
                    <span className="truncate">{mot}</span>
                  </Link>
                );
              })}
            </React.Fragment>
          ))}
        </nav>
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
