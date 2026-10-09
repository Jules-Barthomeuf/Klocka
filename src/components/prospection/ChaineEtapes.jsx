import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

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

/** La chaîne pendant la lecture : le titre au-dessus, les étapes dessous. */
export function ChaineEtapes({ etapes, titre = "AK lit l'appel", attente = "Je lis l'appel" }) {
  const liste = etapes.length ? etapes : [attente];
  return (
    <div className="flex flex-col gap-5 rounded-[20px] border border-bord-doux bg-transparent px-7 py-8 max-md:px-5">
      <p className="m-0 text-[20px] text-encre">{titre}</p>
      <div className="flex flex-col gap-3">
        {liste.map((e, i) => {
          const ici = i === liste.length - 1;
          return (
            <motion.div key={`${i}-${e}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}
              className={`flex items-center gap-3.5 text-[15px] ${ici ? "text-encre" : "text-craie"}`}>
              <span className="grid h-4 w-4 flex-none place-items-center">
                {ici ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-menthe-pale" /> : <Check className="h-4 w-4 text-menthe" strokeWidth={2} />}
              </span>
              <span className="min-w-0 break-words">{e}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
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
