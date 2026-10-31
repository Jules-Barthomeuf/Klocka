import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { iconeEtape } from "@/lib/icone-etape";

// La chaîne de raisonnement d'AK quand il lit un appel (8 oct. 2026), comme
// dans le chat : chaque étape arrive au moment où le serveur la fait (« Je lis
// l'appel », « Je prépare les champs pour Monday », « Je mets la relance au
// jeudi 22 octobre dans le calendrier »…). Faite : une coche menthe ; en
// cours : un point qui pulse. Une fois prêt, elle se replie en une ligne.

/** Les étapes reçues, révélées une à une : jamais plus d'une toutes les 0,45 s, pour qu'on les lise. */
export function useEtapesVives() {
  const [etapes, setEtapes] = useState([]);
  const file = useRef([]);
  const vues = useRef([]);
  useEffect(() => {
    const t = setInterval(() => {
      if (!file.current.length) return;
      vues.current = [...vues.current, file.current.shift()];
      setEtapes(vues.current);
    }, 450);
    return () => clearInterval(t);
  }, []);
  const pousser = (texte) => { if (texte) file.current.push(texte); };
  const reinitialiser = () => { file.current = []; vues.current = []; setEtapes([]); };
  // Attend que les étapes reçues soient toutes à l'écran (au plus trois secondes).
  const vider = () => new Promise((fini) => {
    const t0 = Date.now();
    const t = setInterval(() => { if (!file.current.length || Date.now() - t0 > 3000) { clearInterval(t); fini(); } }, 80);
  });
  return { etapes, pousser, reinitialiser, vider, lire: () => vues.current };
}

/**
 * La chaîne pendant la lecture : le titre au-dessus, les étapes dessous, à la frise du chat (21 oct. 2026, Jules :
 * « la même animation que quand Haka réfléchit ») : faite, une coche dans un rond plein ; en cours, l'icône de ce que
 * Haka fait et son texte balayé d'un reflet (`.k-raisonne`) ; un trait relie les étapes. `centre` : la carte seule au
 * milieu de l'écran.
 */
export function ChaineEtapes({ etapes, titre = "L'Assistant KPartners lit l'appel", attente = "Je lis l'appel", centre = false }) {
  const liste = etapes.length ? etapes : [attente];
  const carte = (
    <div className={`flex flex-col gap-6 rounded-[24px] border border-bord-doux bg-transparent px-8 py-8 max-md:px-5 ${centre ? "w-full max-w-[560px]" : ""}`}>
      <p className="m-0 text-[20px] leading-[1.3] tracking-[-0.01em] text-encre">{titre}</p>
      <div className="flex flex-col">
        {liste.map((e, i) => {
          const ici = i === liste.length - 1;
          const Icone = iconeEtape(e);
          return (
            <motion.div key={`${i}-${e}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex items-stretch gap-3.5 text-[15px]">
              <span className="flex w-5 flex-none flex-col items-center">
                <span className="grid h-5 w-5 flex-none place-items-center">
                  {ici ? <Icone className="h-[18px] w-[18px] text-craie" strokeWidth={1.7} /> : (
                    <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22 }}
                      className="grid h-5 w-5 place-items-center rounded-full bg-encre text-fond"><Check className="h-3 w-3" strokeWidth={3} /></motion.span>
                  )}
                </span>
                <motion.span initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.3, ease: "easeOut" }} className="my-1 w-px flex-1 origin-top bg-bord-vif" style={{ minHeight: 14 }} />
              </span>
              <span className={`min-w-0 break-words pb-3 leading-[20px] ${ici ? "k-raisonne" : "text-encre"}`}>{e}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
  if (!centre) return carte;
  return <div className="grid min-h-[min(62vh,560px)] w-full place-items-center py-6">{carte}</div>;
}

/** Une fois prêt : « Analyse terminée · n étapes », qui se déplie. */
export function ChaineRepliee({ etapes }) {
  const [ouvert, setOuvert] = useState(false);
  if (!etapes?.length) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} className="inline-flex items-center gap-1.5 self-start p-0 text-[14px] text-brume hover:text-craie" style={{ background: "transparent" }}>
        Analyse terminée · {etapes.length} étape{etapes.length > 1 ? "s" : ""} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && etapes.map((e, i) => (
        <span key={`${i}-${e}`} className="flex items-center gap-3 text-[14px] text-craie">
          <Check className="h-3.5 w-3.5 flex-none text-menthe" strokeWidth={2} />{e}
        </span>
      ))}
    </div>
  );
}
