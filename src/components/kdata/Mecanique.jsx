import React, { useState } from "react";
import { Waypoints, ChevronDown, ChevronRight, X } from "lucide-react";

// La mécanique d'un outil K-Data : dans quel ordre il interroge quoi, et ce
// que chaque source lui donne. Un outil qui rend un chiffre sans dire d'où il
// vient force à le croire sur parole ; ici, chaque étape se lit, dans l'ordre
// où elle a vraiment lieu.
//
// Deux habillages pour un même contenu. `MecaniqueEnLigne` se pose dans le
// flux d'un écran de résultat classique — repliée par défaut, comme le
// journal des sources d'un dossier. `BoutonMecanique` se pose sur un écran
// plein carte, qui n'a pas de bas de page : un bouton fixe, toujours au même
// endroit, ouvre le même contenu en panneau.
//
// Chaque étape : `{ source, quoi, credit }`. `credit` à vrai affiche un
// repère « Crédit » — une requête qui peut coûter, à distinguer de celles qui
// ne coûtent jamais rien.

const CARTE = "rounded-[18px] border border-trait bg-surface";

function Etape({ n, source, quoi, credit }) {
  return (
    <div className="flex gap-3 border-b border-trait py-2.5 last:border-b-0">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-menthe/50 text-[11px] text-menthe-texte">{n}</span>
      <div className="min-w-0">
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-encre">
          {source}
          {credit && <span className="rounded-full bg-ambre/15 px-2 py-0.5 text-[9.5px] font-normal uppercase tracking-[.08em] text-ambre">Crédit</span>}
        </p>
        <p className="m-0 mt-0.5 text-[12px] leading-[1.55] text-ardoise">{quoi}</p>
      </div>
    </div>
  );
}

function Contenu({ etapes, note }) {
  return (
    <>
      <div>{etapes.map((e, i) => <Etape key={e.source + i} n={i + 1} {...e} />)}</div>
      {note && <p className="m-0 mt-3 text-[11px] leading-[1.6] text-brume">{note}</p>}
    </>
  );
}

/** Un bloc repliable, dans le flux de la page. Pour un écran de résultat classique. */
export function MecaniqueEnLigne({ etapes, note, titre = "D'où viennent ces informations", className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className={`${CARTE} p-4 ${className}`}>
      <button type="button" onClick={() => setOuvert((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-[13px] font-medium text-encre">
          <Waypoints className="h-4 w-4 text-menthe" />{titre}
        </span>
        {ouvert ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-brume" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-brume" />}
      </button>
      {ouvert && <div className="mt-3">
        <Contenu etapes={etapes} note={note} />
      </div>}
    </div>
  );
}

/**
 * Un bouton fixe et son panneau. Pour un écran plein carte, sans bas de page
 * où poser un bloc — `KZoning`, `KFoncier`, `KProspective`, `ValeurLocative`.
 * Position fixe à l'écran : il reste au même endroit quelle que soit la mise
 * en page du panneau au-dessus, et disparaît de lui-même derrière une fiche
 * plein écran (z-index inférieur).
 */
export function BoutonMecanique({ etapes, note, titre = "D'où viennent ces informations", position = "bottom-4 right-4" }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className={`fixed ${position} z-[500] flex flex-col items-end`}>
      {ouvert && (
        <div className="mb-2 w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[16px] border border-bord bg-fond/90 p-4 backdrop-blur-xl">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-encre"><Waypoints className="h-4 w-4 text-menthe" />{titre}</span>
            <button onClick={() => setOuvert(false)} className="flex-shrink-0 text-brume hover:text-encre" aria-label="Fermer"><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            <Contenu etapes={etapes} note={note} />
          </div>
        </div>
      )}
      <button onClick={() => setOuvert((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-bord bg-fond/80 px-3.5 py-2 text-[11px] uppercase tracking-[.1em] text-ardoise backdrop-blur-xl hover:text-encre">
        <Waypoints className="h-3.5 w-3.5" />Mécanique
      </button>
    </div>
  );
}
