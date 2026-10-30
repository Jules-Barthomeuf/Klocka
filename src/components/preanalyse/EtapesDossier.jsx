import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { FRISE } from "@/lib/dossiers-architecture";

// Les étapes d'un dossier ouvert : le menu de droite (grand écran) et la frise
// du haut (téléphone). Sortis de WorkflowDeal le 24 oct. 2026 pour servir aussi
// aux biens des mandataires, au même dessin que les dossiers de l'équipe.

/**
 * La frise (maquette de Jules, 17 oct. 2026) : un rond par étape (huit pour un dossier de l'équipe, `etapes` pour un autre suivi) reliés par un trait,
 * le numéro ou la coche dans le rond, le nom de l'étape
 * dessous (les sous-titres retirés le 17 oct. 2026) ; l'étape ouverte est pleine (sans soulignement), les étapes faites sont
 * cochées et leur trait est vert.
 */
export function FriseDossier({ vue, atteinte = 1, onAller, occupe = false, etapes = FRISE, estFaite = null, label = "Étapes du dossier" }) {
  return (
    <nav aria-label={label} className="overflow-x-auto py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol className="m-0 grid list-none gap-0 p-0" style={{ minWidth: etapes.length * 108, gridTemplateColumns: `repeat(${etapes.length}, minmax(0, 1fr))` }}>
        {etapes.map((e, i) => {
          const ouverte = vue === e.id;
          const faite = estFaite ? estFaite(e) : e.n < atteinte;
          const derniere = i === etapes.length - 1;
          return (
            <li key={e.id} className="min-w-0">
              <button type="button" onClick={() => onAller(e.id)} disabled={occupe} aria-current={ouverte ? "step" : undefined}
                className="group block w-full text-left" style={{ background: "transparent" }}>
                <span className="flex items-center">
                  <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full border text-[11px] tabular-nums transition-colors duration-300 ${ouverte ? "border-encre bg-encre text-fond" : faite ? "border-menthe/60 bg-menthe/25 text-menthe" : "border-bord-doux text-transparent group-hover:border-bord-vif"}`}>
                    {faite ? <Check className="h-3 w-3" /> : ouverte ? e.n : null}
                  </span>
                  {!derniere && <span className={`mx-2.5 h-px flex-1 transition-colors duration-500 ${faite ? "bg-menthe/50" : "bg-encre/[0.14]"}`} />}
                </span>
                <span className={`mt-3 block truncate pr-3 text-[14px] transition-colors ${ouverte ? "text-encre" : faite ? "text-craie" : "text-brume group-hover:text-craie"}`}>{e.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Les étapes du dossier, à droite (18 oct. 2026, Jules, maquette) : par-dessus la page, jamais dans sa mise en page.
 * Fermé : une fine pilule collée au bord droit, un chevron, un point par étape (faite en couleur d'accent, ouverte
 * en blanc et plus grande, à venir en gris) et « 4/8 » ; un point mène à son étape. Ouvert : le menu, en surimpression,
 * avec une ombre. À la souris, il s'ouvre au survol ; au doigt, le choix ouvert / fermé est gardé dans le navigateur.
 */
// `telephone` : il sert aussi au téléphone, à la place de la frise, collé au bord (25 oct. 2026, Jules, pour les biens).
// `intitule`, `numeros`, `memoire` : le même menu pour des onglets (la Prospection, 25 oct. 2026, Jules) : son titre, pas de
// numéro dans les ronds, et sa propre mémoire ouvert / fermé et position.
export function MenuEtapesDroite({ items, valeur, onChange, occupe = false, onValider = null, telephone = false, intitule = "Étapes", numeros = true, memoire = "klocka.dossier.etapes" }) {
  const [petitEcran] = useState(() => telephone && typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches);
  // Au téléphone, l'état ouvert / fermé est gardé à part, et fermé par défaut (26 oct. 2026).
  const cleOuvert = petitEcran ? `${memoire}.tel` : memoire;
  // À la souris, le menu s'ouvre au survol et se referme quand elle s'en va (30 oct. 2026, Jules) : il part fermé et le
  // choix n'est plus gardé. Au doigt, rien ne survole : le chevron ouvre et ferme, comme avant.
  const [survol] = useState(() => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  const [ouvert, setOuvert] = useState(() => { if (survol) return false; try { return localStorage.getItem(cleOuvert) === "ouvert"; } catch { return false; } });
  const minuterie = useRef(null);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  // Un léger délai dans les deux sens : la souris qui passe sans s'arrêter n'ouvre rien, celle qui sort un instant ne ferme rien.
  const entrer = () => { if (!survol) return; clearTimeout(minuterie.current); minuterie.current = setTimeout(() => setOuvert(true), 120); };
  const sortir = () => { if (!survol) return; clearTimeout(minuterie.current); minuterie.current = setTimeout(() => setOuvert(false), 300); };
  const basculer = () => setOuvert((o) => { try { localStorage.setItem(cleOuvert, o ? "ferme" : "ouvert"); } catch { /* navigation privée */ } return !o; });
  // Une page choisie dans le menu ouvert : on y arrive menu fermé (29 oct. 2026, Jules).
  const fermer = () => { setOuvert(false); try { localStorage.setItem(cleOuvert, "ferme"); } catch { /* navigation privée */ } };
  const ici = Math.max(0, items.findIndex((o) => o.cle === valeur));
  // Au téléphone, le menu part du haut de l'écran, sous le titre, et non du milieu (26 oct. 2026) : au milieu, il couvrait
  // le bouton Envoyer du chat. Il se glisse plus bas s'il gêne ; sa position est gardée à part.
  const cleY = petitEcran ? `${memoire}.y.tel` : `${memoire}.y`;
  // Tenir le haut et glisser : le menu monte ou descend le long du bord droit ; la position est gardée.
  const [decalage, setDecalage] = useState(() => { try { return Number(localStorage.getItem(cleY)) || 0; } catch { return 0; } });
  const glisse = useRef(false);
  const attraper = (e) => {
    if (e.button !== 0) return;
    const depart = e.clientY; const base = decalage; glisse.current = false;
    const limite = Math.max(0, window.innerHeight / 2 - 120);
    const bouger = (ev) => {
      const dy = ev.clientY - depart;
      if (Math.abs(dy) > 4) glisse.current = true;
      if (glisse.current) setDecalage(Math.max(-limite, Math.min(limite, base + dy)));
    };
    const lacher = () => {
      window.removeEventListener("pointermove", bouger); window.removeEventListener("pointerup", lacher);
      setDecalage((d) => { try { localStorage.setItem(cleY, String(Math.round(d))); } catch { /* navigation privée */ } return d; });
    };
    window.addEventListener("pointermove", bouger); window.addEventListener("pointerup", lacher);
  };
  // Un clic qui suit un glissement n'ouvre ni ne ferme rien.
  const cliquer = () => { if (glisse.current) { glisse.current = false; return; } basculer(); };
  // Au téléphone, le menu revient à droite comme sur ordinateur (27 oct. 2026, Jules : « un truc à droite qu'on ouvre ») ;
  // il remplace le menu du fil d'Ariane. Fermé, une pastille étroite au bord droit, à mi-hauteur, qui se glisse.
  return (
    <div onMouseEnter={entrer} onMouseLeave={sortir} className={`fixed z-40 ${petitEcran ? "right-1.5 top-1/2" : telephone ? "right-4 top-1/2 max-md:right-2" : "right-4 top-1/2 max-md:hidden"}`}
      style={{ transform: `translateY(calc(-50% + ${decalage}px))` }}>
      <AnimatePresence mode="wait" initial={false}>
        {ouvert ? (
          <motion.div key="ouvert" initial={{ opacity: 0, x: 16, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 16, scale: 0.98 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-[220px] overflow-hidden rounded-[18px] border border-bord-doux bg-rail shadow-[0_24px_60px_rgb(0_0_0/0.35)]">
            <div onPointerDown={attraper} title="Tenir et glisser pour déplacer" className="flex cursor-grab touch-none select-none items-center justify-between border-b border-trait px-4 py-2.5 active:cursor-grabbing">
              <span className="text-[11px] uppercase tracking-[.16em] text-brume">{intitule}{numeros ? ` · ${ici + 1}/${items.length}` : ""}</span>
              <button type="button" onClick={cliquer} aria-label={`Fermer le menu : ${intitule}`} title="Fermer" className="grid h-7 w-7 place-items-center rounded-full text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}><ChevronRight className="h-4 w-4" /></button>
            </div>
            <nav className="flex flex-col p-1.5">
              {items.map((o) => {
                const actif = valeur === o.cle;
                return (
                  <div key={o.cle} className="flex items-center gap-1">
                  <button type="button" onClick={() => { onChange(o.cle); fermer(); }} disabled={occupe} aria-current={actif ? "step" : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[14px] transition-colors ${actif ? "bg-rail-actif text-encre" : o.faite ? "text-craie hover:bg-rail-actif hover:text-encre" : "text-brume hover:bg-rail-actif hover:text-craie"}`} style={actif ? undefined : { background: "transparent" }}>
                    <span className={`grid h-[20px] w-[20px] flex-none place-items-center rounded-full border text-[10.5px] tabular-nums transition-colors duration-300 ${o.faite ? "border-menthe bg-menthe text-sur-menthe" : actif ? "border-encre bg-encre text-fond" : "border-encre/[0.18] text-brume"}`}>
                      {o.faite ? <Check className="h-3 w-3" /> : numeros ? o.n : null}
                    </span>
                    <span className="min-w-0 truncate">{o.titre}</span>
                  </button>
                    {/* Le check à droite : valider cette étape, et celles d'avant (21 oct. 2026, Jules). */}
                    {onValider && !o.faite && (
                      <button type="button" onClick={() => onValider(o.n)} aria-label={`Valider l'étape ${o.n} : ${o.titre}`} title={`Valider « ${o.titre} »${o.n > 1 ? " et les étapes d'avant" : ""}`}
                        className="grid h-7 w-7 flex-none place-items-center rounded-full border border-bord-doux text-brume transition-colors hover:border-menthe hover:text-menthe" style={{ background: "transparent" }}>
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </nav>
          </motion.div>
        ) : (
          <motion.div key="ferme" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }}
            className={`flex flex-col items-center rounded-[16px] border border-bord-doux bg-rail shadow-[0_16px_40px_rgb(0_0_0/0.3)] ${petitEcran ? "w-[40px] gap-1 py-2" : "w-[44px] gap-3 py-3"}`}>
            <button type="button" onPointerDown={attraper} onClick={cliquer} aria-label={`Ouvrir le menu : ${intitule}`} title="Cliquer pour ouvrir · tenir et glisser pour déplacer" className="grid h-6 w-6 cursor-grab touch-none place-items-center rounded-full text-ardoise transition-colors hover:text-encre active:cursor-grabbing" style={{ background: "transparent" }}><ChevronLeft className="h-4 w-4" /></button>
            {items.map((o) => {
              const actif = valeur === o.cle;
              return (
                <button key={o.cle} type="button" onClick={() => onChange(o.cle)} disabled={occupe} aria-label={o.titre}
                  className="group/point relative grid h-4 w-4 place-items-center" style={{ background: "transparent" }}>
                  {/* Le nom au survol, à gauche, tout de suite (29 oct. 2026, Jules) : pas besoin d'ouvrir le menu. */}
                  <span className="pointer-events-none absolute right-full top-1/2 mr-4 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-bord-doux bg-rail px-3 py-1 text-[13px] text-encre shadow-[0_8px_24px_rgb(0_0_0/0.25)] group-hover/point:block">{o.titre}</span>
                  {/* Un simple span : avec `layout`, le déplacement de la barre (transform du parent) était pris pour un changement de place des points, qui la rattrapaient en différé (18 oct. 2026, Jules). */}
                  <span className={`block rounded-full transition-[width,height,background-color] duration-200 ${actif ? "h-3 w-3 bg-encre" : o.faite ? "h-2 w-2 bg-menthe" : "h-2 w-2 bg-encre/[0.18]"}`} />
                </button>
              );
            })}
            {numeros && <span className="text-[11.5px] tabular-nums text-ardoise">{ici + 1}/{items.length}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

