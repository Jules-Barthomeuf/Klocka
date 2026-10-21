import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { useDictee } from "@/lib/dictee";

// La note vocale d'après l'appel, avant toute action (21 oct. 2026, Jules) : quelques secondes, facultatives, et ça
// passe tout seul. Une bande compacte, pas un grand cadre au milieu (Jules, même jour) : le micro s'ouvre seul au
// raccrochage, la question, une barre qui se vide ; rien dit, la suite part d'elle-même. Une phrase dite s'écrit
// sous la question et rejoint les notes, qui font foi ; on l'écrit plutôt dans la carte des notes, à côté.

export default function NoteApresAppel({ onFin, duree = 5, titre = "Une précision ?", aide = "Facultatif : « il me rappelle dans dix minutes », « c'était son associé »." }) {
  const [texte, setTexte] = useState("");
  const [restant, setRestant] = useState(duree);
  const fini = useRef(false);
  const voulu = useRef(false);
  const dictee = useDictee({ onTexte: (t) => setTexte(t), onFin: (t) => setTexte(t) });
  const finir = (note) => { if (fini.current) return; fini.current = true; onFin(String(note || "").trim() || null); };

  // Le micro s'ouvre seul (l'autorisation a été donnée pour l'appel).
  useEffect(() => { if (dictee.supporte) dictee.demarrer(); return () => { if (dictee.ecoute) dictee.arreter(); }; }, []);
  // La barre se vide : rien dit, on passe ; une phrase commencée, on la laisse finir (Continuer, ou la fin de la dictée).
  useEffect(() => {
    if (texte.trim()) return undefined;
    if (restant <= 0) { if (dictee.ecoute) dictee.arreter(); finir(null); return undefined; }
    const t = setTimeout(() => setRestant((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restant, texte]);
  useEffect(() => { if (voulu.current && !dictee.ecoute && !dictee.finalisation) finir(texte); }, [dictee.ecoute, dictee.finalisation, texte]);
  const continuer = () => { if (dictee.ecoute || dictee.finalisation) { voulu.current = true; dictee.arreter(); } else finir(texte); };
  const passer = () => { if (dictee.ecoute) dictee.arreter(); finir(null); };

  return (
    <div className="flex flex-col items-center gap-3 text-center duration-300 animate-in fade-in-0">
      <p className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal leading-[1.15] tracking-[-0.02em] text-encre">{titre}</p>
      <p className="m-0 max-w-[520px] text-[13.5px] leading-[1.5] text-ardoise">{aide}</p>
      <div className="mt-1 flex items-center gap-3">
        <button type="button" onClick={() => (dictee.ecoute ? dictee.arreter() : dictee.demarrer())} aria-label={dictee.ecoute ? "Arrêter la note" : "Dicter la note"}
          className={`grid h-11 w-11 place-items-center rounded-full border ${dictee.ecoute ? "k-anneau border-menthe text-menthe" : "border-bord-doux text-ardoise"}`} style={{ background: "transparent" }}>
          {dictee.finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />}
        </button>
        {texte.trim()
          ? <button type="button" onClick={continuer} className="inline-flex h-11 items-center rounded-full bg-menthe px-5 text-[14.5px] text-sur-menthe transition-colors hover:bg-menthe-survol">Continuer</button>
          : <button type="button" onClick={passer} className="inline-flex h-11 items-center rounded-full border border-bord-doux px-5 text-[14.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Passer</button>}
      </div>
      {texte.trim()
        ? <p className="m-0 max-w-[560px] text-[14.5px] leading-[1.5] text-craie">« {texte.trim()} »</p>
        : (
          <div className="flex w-full max-w-[240px] flex-col items-center gap-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-relief"><div className="h-1 rounded-full bg-menthe transition-[width] duration-1000 ease-linear" style={{ width: `${(Math.max(0, restant) / duree) * 100}%` }} /></div>
            <span className="text-[12.5px] tabular-nums text-brume">Haka continue dans {Math.max(0, restant)} s</span>
          </div>
        )}
    </div>
  );
}
