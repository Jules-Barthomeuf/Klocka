import React, { useEffect, useRef, useState } from "react";
import { Loader2, Mic } from "lucide-react";
import { useDictee } from "@/lib/dictee";
import { CHAMP_CARTE, GROS_BOUTON } from "@/components/prospection/StyleAppel";

// La note vocale d'après l'appel, avant toute action (21 oct. 2026, Jules) : cinq secondes, facultatives. Le micro
// s'ouvre seul au raccrochage ; on dit « il me rappelle dans dix minutes », « c'était son associé », ou rien. Sans
// rien dire, l'écran passe seul et l'analyse suit comme avant ; une phrase dite rejoint les notes, qui font foi, et
// Haka la lit avec la transcription, l'historique de l'agent et l'heure.

export default function NoteApresAppel({ onFin, duree = 5 }) {
  const [texte, setTexte] = useState("");
  const [restant, setRestant] = useState(duree);
  const [tape, setTape] = useState(false);
  const fini = useRef(false);
  const voulu = useRef(null); // la note à rendre une fois la dictée finalisée
  const dictee = useDictee({ onTexte: (t) => setTexte(t), onFin: (t) => setTexte(t) });
  const finir = (note) => { if (fini.current) return; fini.current = true; onFin(String(note || "").trim() || null); };

  // Le micro s'ouvre seul (l'autorisation a été donnée pour l'appel).
  useEffect(() => { if (dictee.supporte) dictee.demarrer(); return () => { if (dictee.ecoute) dictee.arreter(); }; }, []);
  // Cinq secondes : rien dit, rien tapé, on passe ; une phrase commencée, on laisse finir.
  useEffect(() => {
    if (tape || texte.trim()) return undefined;
    if (restant <= 0) { if (dictee.ecoute) dictee.arreter(); finir(null); return undefined; }
    const t = setTimeout(() => setRestant((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [restant, texte, tape]);
  // Valider pendant la dictée : on attend le texte final.
  useEffect(() => { if (voulu.current && !dictee.ecoute && !dictee.finalisation) finir(texte); }, [dictee.ecoute, dictee.finalisation, texte]);
  const valider = () => { if (dictee.ecoute || dictee.finalisation) { voulu.current = true; dictee.arreter(); } else finir(texte); };

  const attend = !texte.trim() && !tape;
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-5 py-6 text-center duration-300 animate-in fade-in-0">
      <p className="m-0 text-[24px] font-normal tracking-[-0.01em] text-encre">Une précision ?</p>
      <p className="m-0 max-w-[460px] text-[14px] leading-[1.55] text-ardoise">Facultatif : « il me rappelle dans dix minutes », « c'était son associé ». Rien à dire ? Haka continue tout seul.</p>
      <button type="button" onClick={() => (dictee.ecoute ? dictee.arreter() : dictee.demarrer())} aria-label={dictee.ecoute ? "Arrêter la note" : "Dicter la note"} className="rounded-full" style={{ background: "transparent" }}>
        <span className={`grid h-[96px] w-[96px] place-items-center rounded-full border-2 ${dictee.ecoute ? "k-anneau border-menthe text-menthe" : "border-bord-doux text-ardoise"}`}>
          {dictee.finalisation ? <Loader2 className="h-7 w-7 animate-spin" /> : <Mic className="h-8 w-8" strokeWidth={1.8} />}
        </span>
      </button>
      {attend && (
        <div className="flex w-full max-w-[260px] flex-col items-center gap-1.5">
          <div className="h-1 w-full overflow-hidden rounded-full bg-relief"><div className="h-1 rounded-full bg-menthe transition-[width] duration-1000 ease-linear" style={{ width: `${(restant / duree) * 100}%` }} /></div>
          <span className="text-[12.5px] tabular-nums text-brume">Haka continue dans {Math.max(0, restant)} s</span>
        </div>
      )}
      <textarea value={texte} onChange={(e) => { setTape(true); setTexte(e.target.value); }} onFocus={() => setTape(true)} rows={2}
        placeholder="Ou écrivez-la ici" className={`${CHAMP_CARTE} text-left`} />
      <div className="flex w-full max-w-[420px] flex-col items-center gap-2.5">
        <button type="button" onClick={valider} disabled={!texte.trim() && !dictee.ecoute} className={`${GROS_BOUTON} bg-encre text-fond`}>Continuer avec cette note</button>
        <button type="button" onClick={() => { if (dictee.ecoute) dictee.arreter(); finir(null); }} className="p-0 text-[13.5px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Passer</button>
      </div>
    </div>
  );
}
