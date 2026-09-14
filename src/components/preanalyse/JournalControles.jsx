import React from "react";
import { ArrowRight, FileText } from "lucide-react";
import { chrono } from "@/components/preanalyse/journal-tons";
import { J } from "@/design/jetons";

// La barre du bas : où en est la recherche, et ce que l'agent vient de faire.
//
// Volontairement pauvre en boutons. Une recherche de trois minutes se regarde ;
// elle ne se pilote pas comme un lecteur vidéo. La barre ne se clique pas non
// plus : elle dit seulement où l'on en est.
//
// Les repères sont placés par RANG, pas sur une horloge. Les placer dans le
// temps ne pouvait pas marcher : au lancement, la durée observée vaut zéro et
// les cinq points s'empilaient à gauche. Le rang, lui, est connu d'avance —
// le serveur annonce ses questions avant de partir.

export default function JournalControles({ phase, temps, reperes, avancement = 0, onJournal, journalOuvert, onVoirAnalyse }) {
  if (phase === "repos") {
    return (
      <div className="border-t border-trait bg-surface">
        <div className="mx-auto w-full max-w-[780px] px-4 sm:px-6 py-2.5">
          <span className="text-[12.5px] text-brume">Aucune recherche en cours</span>
        </div>
      </div>
    );
  }

  // L'étape franchie la plus récente : c'est elle qui commente.
  const franchies = reperes.filter((r) => r.franchi || r.encours);
  const courante = franchies[franchies.length - 1] || reperes[0] || null;

  return (
    <div className="border-t border-trait bg-surface">
      <div className="mx-auto w-full max-w-[780px] px-4 sm:px-6 pt-3.5">
        <div className="relative h-[3px] rounded-full bg-trait">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-menthe transition-[width] duration-500"
            style={{ width: `${Math.max(0, Math.min(1, avancement)) * 100}%` }}
          />
          {reperes.map((r) => (
            <span
              key={r.cle}
              title={r.libelle}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[9px] h-[9px] rounded-full border-2 border-surface transition-colors duration-300 ${r.encours ? "ja-pastille-fraiche" : ""}`}
              style={{
                left: `${r.position * 100}%`,
                background: r.echoue ? J["alerte"] : r.franchi ? J["menthe"] : r.encours ? J["ambre"] : J["brume"],
              }}
              aria-hidden
            />
          ))}
        </div>

        {/* Les noms d'étape. Sous 640 px, ils se chevauchent : seuls les
            points restent, et la phrase en dessous suffit à se situer. */}
        <div className="relative h-[16px] mt-1.5 hidden sm:block" aria-hidden>
          {reperes.map((r) => (
            <span
              key={r.cle}
              className={`absolute top-0 text-[11px] whitespace-nowrap transition-colors duration-300 ${
                r.franchi || r.encours ? "text-ardoise" : "text-brume"
              } ${r.position === 0 ? "left-0" : r.position === 1 ? "right-0" : "-translate-x-1/2"}`}
              style={r.position === 0 || r.position === 1 ? undefined : { left: `${r.position * 100}%` }}
            >
              {r.libelle}
            </span>
          ))}
        </div>

        {courante && (
          <p key={courante.cle} className="ja-etape m-0 mt-2.5 text-[12.5px] leading-5 text-ardoise min-h-[40px]" role="status">
            <span style={{ color: courante.echoue ? J["alerte"] : courante.encours ? J["ambre"] : J["menthe"] }}>{courante.libelle}</span>
            <span className="text-brume"> · </span>
            {courante.explication}
          </p>
        )}
      </div>

      <div className="mx-auto w-full max-w-[780px] px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onJournal}
          aria-label="Journal détaillé" title="Journal détaillé"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors ${
            journalOuvert ? "bg-trait text-encre" : "text-brume hover:text-craie hover:bg-relief"
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> Journal détaillé
        </button>
        {/* À la fin, le geste évident : retourner voir le résultat. */}
        {phase === "fini" && onVoirAnalyse && (
          <button
            type="button"
            onClick={onVoirAnalyse}
            className="inline-flex items-center gap-1.5 rounded-full bg-menthe-clair text-sur-menthe text-[12.5px] font-semibold px-4 py-1.5 hover:bg-menthe-clair transition-colors"
          >
            Voir l’analyse <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="ml-auto font-mono text-[11px] text-brume tabular-nums">{chrono(temps)}</span>
      </div>
    </div>
  );
}
