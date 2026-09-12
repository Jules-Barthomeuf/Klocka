import React, { useEffect } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { chrono, ton } from "@/components/preanalyse/journal-tons";

// Le détail d'un verdict, en pleine largeur.
//
// Un panneau glissé à droite convenait pour la source d'UN chiffre ; pas pour
// une démonstration entière — quatorze comparables, huit lignes de calcul, les
// pages lues et les réserves, tout cela lu en se tordant le cou dans quatre
// cents pixels. Ici la démonstration prend la place du contenu qu'elle
// explique. Les cartes restent en haut et servent de sélecteur : on passe du
// loyer au prix sans revenir en arrière, et « Retour » ramène à la vue
// d'ensemble.

export default function JournalDetail({ cartes, details, cle, onChoisir, onRetour, titre = null }) {
  const detail = details?.[cle];

  // Échap ramène à la vue d'ensemble — sauf si un autre panneau est ouvert
  // par-dessus, qui gère sa propre touche.
  useEffect(() => {
    const auClavier = (e) => {
      if (e.key === "Escape" && !document.querySelector('aside[role="dialog"]')) onRetour();
    };
    window.addEventListener("keydown", auClavier);
    return () => window.removeEventListener("keydown", auClavier);
  }, [onRetour]);

  if (!detail) return null;
  const c = ton(detail.ton);

  return (
    <div className="px-4 sm:px-5 py-5 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={onRetour}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {titre || "Retour"}
        </button>
      </div>

      {/* Les cartes, en sélecteur : celle qu'on lit est bordée de sa couleur. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cartes.map((k) => {
          const couleur = ton(k.ton);
          const active = k.cle === cle;
          return (
            <button
              key={k.cle}
              type="button"
              onClick={() => onChoisir(k.cle)}
              aria-pressed={active}
              className={`text-left rounded-[12px] border px-4 py-3 transition-colors ${
                active ? "bg-[#191d22]" : "bg-[#15181c] hover:bg-[#191d22]"
              }`}
              style={{ borderColor: active ? couleur.pastille : "#23272d" }}
            >
              <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-brume truncate">
                {k.libelle}
              </span>
              <span
                className="block mt-1.5 text-[17px] leading-tight font-medium truncate"
                style={{ color: active ? couleur.texte : "#c6ccd3" }}
              >
                {k.valeur}
              </span>
            </button>
          );
        })}
      </div>

      {/* L'en-tête du verdict lu */}
      <div className="border-t border-trait pt-5">
        <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-brume">{detail.libelle}</span>
        <span className="block mt-1 text-[28px] leading-tight font-medium" style={{ color: c.texte }}>
          {detail.valeur}
        </span>
        <p className="m-0 mt-3 max-w-[72ch] text-[13.5px] leading-6 text-[#c6ccd3]">{detail.resume}</p>
      </div>

      {/* Deux colonnes : la démonstration à gauche, les pièces à droite. */}
      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-6">
        <div className="flex flex-col gap-6 min-w-0">
          <section>
            <h4 className="m-0 mb-2 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
              Le calcul, pas à pas
            </h4>
            <ol className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
              {detail.calcul.map((l, i) => (
                <li key={`${l.libelle}-${i}`} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] text-[#c6ccd3]">{l.libelle}</span>
                    <span className="flex-shrink-0 text-[13px] font-medium text-encre">{l.valeur}</span>
                  </div>
                  {l.note && <p className="m-0 mt-0.5 text-[11.5px] leading-5 text-brume">{l.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h4 className="m-0 mb-2 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
              Ce qui affaiblit la conclusion
            </h4>
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {detail.reserves.map((r, i) => (
                <li key={`${r}-${i}`} className="flex gap-2 text-[12px] leading-5 text-ardoise">
                  <span className="flex-shrink-0 text-[#d9a441]">—</span>
                  {r}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex flex-col gap-6 min-w-0">
          <section>
            <h4 className="m-0 mb-2 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
              Les {detail.comparables.length} comparables
            </h4>
            <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
              {detail.comparables.map((x, i) => {
                const ecarte = x.sort === "écarté";
                return (
                  <li key={`${x.adresse}-${i}`} className="py-2">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="flex-shrink-0 w-[6px] h-[6px] rounded-full self-center"
                        style={{ background: ecarte ? "#d9a441" : "#96c0b8" }}
                        aria-hidden
                      />
                      <span className={`min-w-0 flex-1 text-[12.5px] truncate ${ecarte ? "text-brume line-through" : "text-[#dfe3e8]"}`}>
                        {x.adresse}
                      </span>
                      <span className="flex-shrink-0 text-[11.5px] text-brume">{x.surface}</span>
                      <span className={`flex-shrink-0 text-[12.5px] font-medium ${ecarte ? "text-brume" : "text-encre"}`}>
                        {x.prix}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 pl-[14px] text-[11px] leading-5 text-brume">
                      {x.src}
                      {x.motif ? ` · écarté : ${x.motif}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h4 className="m-0 mb-2 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
              Les pages lues
            </h4>
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {detail.sources.map((src, i) => (
                <li key={`${src.nom}-${i}`}>
                  <span className="block text-[12.5px] text-[#dfe3e8]">
                    {src.nom} <span className="text-[11.5px] text-[#4e545e]">· {src.quand || chrono(src.t)}</span>
                  </span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-start gap-1.5 text-[11.5px] text-menthe hover:underline break-all"
                  >
                    {src.url}
                    <ExternalLink className="w-3 h-3 mt-[3px] flex-shrink-0" />
                  </a>
                  {src.capture && (
                    <code className="block mt-0.5 font-mono text-[10.5px] text-[#4e545e] break-all">{src.capture}</code>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
