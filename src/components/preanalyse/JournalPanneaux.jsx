import React, { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { chrono, ton } from "@/components/preanalyse/journal-tons";

// Les deux panneaux de droite : d'où sort un chiffre, et le brut de la lecture.

function Coquille({ titre, enTete, onFermer, children, large = false }) {
  useEffect(() => {
    const auClavier = (e) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [onFermer]);

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/45" onClick={onFermer} aria-hidden />
      <aside
        className={`ja-panneau fixed z-[80] top-0 right-0 bottom-0 w-full bg-[#0f1114] border-l border-[#2c3139] overflow-y-auto ${large ? "sm:w-[460px]" : "sm:w-[400px]"}`}
        role="dialog"
        aria-label={titre}
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 px-5 py-4 bg-[#0f1114] border-b border-[#1f2228]">
          {enTete}
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="flex-shrink-0 p-1.5 rounded-full text-[#6a7180] hover:text-[#f2f3f5] hover:bg-[#1f2228] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        {children}
      </aside>
    </>
  );
}

function Champ({ libelle, children }) {
  return (
    <div>
      <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e] mb-1">{libelle}</span>
      <div className="text-[13px] leading-6 text-[#c6ccd3]">{children}</div>
    </div>
  );
}

/** D'où sort ce chiffre, exactement. */
export function PanneauTracabilite({ entree, onFermer }) {
  const { encart } = entree;
  const c = ton(entree.ton);

  return (
    <Coquille
      titre="Traçabilité de la donnée"
      onFermer={onFermer}
      enTete={
        <div className="min-w-0">
          <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-[#6a7180]">{encart.libelle}</span>
          <span className="block mt-1 font-mono text-[24px] leading-tight text-[#f2f3f5]">{encart.valeur}</span>
        </div>
      }
    >
      <div className="px-5 py-4 flex flex-col gap-4">
        <Champ libelle="SOURCE">
          <span className="inline-flex items-center gap-2">
            <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: c.pastille }} />
            {encart.source}
          </span>
        </Champ>

        <Champ libelle="RELEVÉ À">
          <span className="font-mono tabular-nums">{chrono(entree.t)} après le lancement</span>
        </Champ>

        {encart.url && (
          <Champ libelle="PAGE LUE">
            <a
              href={encart.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-start gap-1.5 text-[#96c0b8] hover:underline break-all"
            >
              {encart.url}
              <ExternalLink className="w-3 h-3 mt-[3px] flex-shrink-0" />
            </a>
          </Champ>
        )}

        {encart.capture && (
          <Champ libelle="CAPTURE D'ÉCRAN">
            <code className="font-mono text-[11.5px] text-[#9298a6] break-all">{encart.capture}</code>
          </Champ>
        )}

        {encart.calcul && (
          <Champ libelle="CALCUL">
            <code className="font-mono text-[11.5px] text-[#9298a6] break-all">{encart.calcul}</code>
          </Champ>
        )}

        <Champ libelle="NOTE">{encart.note}</Champ>
      </div>
    </Coquille>
  );
}

/**
 * Le brut de la lecture : les mêmes événements, sans mise en forme, du plus
 * récent au plus ancien. C'est ce qu'on relit quand le fil raconte bien mais
 * qu'on cherche une ligne précise.
 */
export function PanneauJournalDetaille({ entrees, onFermer }) {
  const alEnvers = [...entrees].reverse();

  return (
    <Coquille
      titre="Journal détaillé"
      onFermer={onFermer}
      large
      enTete={
        <div className="min-w-0">
          <span className="block text-[14px] font-semibold text-[#f2f3f5]">Journal détaillé</span>
          <span className="block mt-0.5 text-[11.5px] text-[#6a7180]">
            {entrees.length} événement{entrees.length > 1 ? "s" : ""}, du plus récent au plus ancien
          </span>
        </div>
      }
    >
      <ol className="m-0 px-5 py-4 list-none flex flex-col gap-2.5">
        {alEnvers.map((e, i) => {
          const c = ton(e.ton);
          return (
            <li key={`${e.t}-${i}`} className="font-mono text-[11px] leading-5 break-words">
              <span className="text-[#4e545e] tabular-nums">{e.quand || chrono(e.t)}</span>{" "}
              <span style={{ color: c.etiquette }}>[{e.source}]</span>{" "}
              <span className="text-[#9298a6]">{e.texte}</span>
              {e.encart && (
                <span className="block pl-[72px] text-[#6a7180]">
                  → {e.encart.libelle} = {e.encart.valeur}
                  {e.encart.url ? ` · ${e.encart.url}` : ""}
                </span>
              )}
            </li>
          );
        })}
        {!alEnvers.length && <li className="text-[12px] text-[#4e545e]">Rien encore.</li>}
      </ol>
    </Coquille>
  );
}
