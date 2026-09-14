import React from "react";
import { ExternalLink } from "lucide-react";
import { DUREE_FRAICHE, chrono, ton } from "@/components/preanalyse/journal-tons";
import { J } from "@/design/jetons";

// Le fil chronologique : une entrée par ligne, trois colonnes fixes —
// chrono, rail à pastille, contenu.
//
// La fraîcheur se mesure en temps du scénario, pas en temps réel : à ×4, une
// entrée reste fraîche quatre fois moins longtemps à la montre, ce qui est
// exactement ce qu'on veut — l'animation accélère avec la lecture.

/** Une ligne du journal : heure, rail et pastille, puis ce que l'agent dit. */
export function Entree({ entree, temps, onEncart, actif }) {
  const c = ton(entree.ton);
  const fraiche = temps - entree.t < DUREE_FRAICHE;

  return (
    <li className="ja-entree relative flex gap-3 sm:gap-4">
      <time className="flex-shrink-0 w-[52px] sm:w-[60px] pt-[3px] font-mono text-[11px] leading-5 text-brume tabular-nums">
        {chrono(entree.t)}
      </time>

      {/* Le rail court d'une entrée à l'autre : c'est lui qui fait le fil. */}
      <div className="flex-shrink-0 relative w-[9px] self-stretch">
        <span className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-bord" aria-hidden />
        <span
          className={`absolute left-1/2 -translate-x-1/2 top-[7px] w-[7px] h-[7px] rounded-full ${fraiche ? "ja-pastille-fraiche" : ""}`}
          style={{ background: c.pastille }}
          aria-hidden
        />
      </div>

      <div className="min-w-0 flex-1 pb-3">
        {/* Un seul bloc de texte, pas deux boîtes côte à côte : une phrase
            longue doit couler après l'étiquette, pas la laisser seule sur sa
            ligne. */}
        <p className="m-0 text-[13.5px] leading-6" style={{ color: c.texte }}>
          <span
            className="font-pill text-[11px] font-semibold uppercase tracking-[.08em] px-1.5 py-[2px] mr-2 rounded-[3px] border leading-[14px] inline-block align-[2px] whitespace-nowrap"
            style={{ color: c.etiquette, borderColor: c.bord }}
          >
            {entree.source}
          </span>
          {entree.texte}
        </p>

        {entree.encart && (
          <EncartDonnee encart={entree.encart} couleur={c} souligne={fraiche || actif} onClick={onEncart} />
        )}
      </div>
    </li>
  );
}

/** La donnée, cliquable : c'est la porte d'entrée vers sa traçabilité. */
export function EncartDonnee({ encart, couleur, souligne, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full sm:w-auto sm:min-w-[280px] text-left rounded-[8px] bg-surface border border-l-[3px] px-3 py-2 hover:bg-relief transition-colors group"
      // Les quatre bords sont écrits un par un : mêler `borderColor` et
      // `borderLeftColor` fait râler React, et le bord gauche l'emportait ou
      // non selon l'ordre des rendus.
      style={{
        borderTopColor: souligne ? "rgba(150,192,184,.55)" : J["bord"],
        borderRightColor: souligne ? "rgba(150,192,184,.55)" : J["bord"],
        borderBottomColor: souligne ? "rgba(150,192,184,.55)" : J["bord"],
        borderLeftColor: couleur.pastille,
      }}
    >
      <span className="block font-pill text-[11px] font-semibold uppercase tracking-[.08em] text-brume">{encart.libelle}</span>
      <span className="mt-1 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[18px] leading-tight text-encre">{encart.valeur}</span>
        <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-brume group-hover:text-menthe transition-colors">
          source <ExternalLink className="w-3 h-3" />
        </span>
      </span>
    </button>
  );
}
