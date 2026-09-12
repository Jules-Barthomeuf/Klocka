import React from "react";
import { ton } from "@/components/preanalyse/journal-tons";

// La barre de résultat, une fois la lecture finie : les quatre chiffres qu'on
// retient, posés en bas de la zone de contenu.
//
// Le fil reste consultable au-dessus — c'est tout l'intérêt : on relit
// l'enchaînement sans perdre la conclusion de vue. Les deux verdicts de
// valorisation sont bordés d'ambre : ce sont eux qui font dire non à un
// dossier, ils ne doivent pas se confondre avec les constats de marché.

export default function JournalResultat({ cartes, onOuvrir }) {
  return (
    <div className="flex-shrink-0 border-t border-[#1f2228] bg-[#0f1114]">
      <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6 py-3 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        {cartes.map((c) => {
          const couleur = ton(c.ton);
          return (
            <button
              key={c.cle}
              type="button"
              onClick={() => onOuvrir(c)}
              className="text-left rounded-[10px] bg-[#15181c] border border-l-[3px] px-3 py-2.5 hover:bg-[#191d22] transition-colors"
              style={{
                borderTopColor: "#23272d",
                borderRightColor: "#23272d",
                borderBottomColor: "#23272d",
                borderLeftColor: couleur.pastille,
              }}
            >
              <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-[#6a7180] truncate">
                {c.libelle.toUpperCase()}
              </span>
              <span className="block mt-1 font-mono text-[17px] leading-tight text-[#f2f3f5] truncate">
                {c.valeur}
              </span>
              <span className="block mt-0.5 text-[11px] truncate" style={{ color: couleur.etiquette }}>
                {c.mention}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
