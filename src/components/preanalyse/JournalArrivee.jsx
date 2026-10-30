import React from "react";
import { Loader2 } from "lucide-react";
import GrilleMarche from "@/components/preanalyse/GrilleMarche";

// L'onglet Marché du dossier (29 oct. 2026, Jules, après avis) : plus de sous-onglets par fournisseur (Bilan,
// Secteur, Equimmox, Le Figaro, DVF, BODACC, Vendeur, Sources) ; les grilles Loyer, Prix, Emplacement et Vacance,
// comme les autres onglets de l'Analyse (GrilleMarche.jsx). Au-dessus, « Lire le marché » tant qu'il n'a jamais été lu ;
// pendant la lecture, une ligne dit qu'elle avance ; « Suivre » ouvre le fil.
export default function JournalArrivee({ analyse, dossier, lot, onRefresh, onLancer, apercu, enCours = false, onSuivre = null }) {
  const pilule = "inline-flex h-9 items-center gap-2 rounded-full border border-menthe px-4 text-[13px] text-encre transition-colors hover:bg-menthe/[0.08] disabled:opacity-40";
  return (
    <div className="pb-9 pt-[6px]">
      {/* Au-dessus des tableaux, seulement ce qui sert (30 oct. 2026, Jules) : « Lire le marché » tant qu'il ne l'a jamais
          été, la ligne d'avancement pendant une lecture ; plus de date ni de « Mettre à jour », « Chercher » relit une ligne. */}
      {(enCours || !analyse) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px] text-craie">
            {enCours ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> Lecture du marché en cours
                {onSuivre && <button type="button" onClick={onSuivre} className="text-menthe hover:underline" style={{ background: "transparent" }}>Suivre</button>}
              </>
            ) : "Le marché n'est pas encore lu."}
          </span>
          {!enCours && <button type="button" onClick={() => onLancer(null)} disabled={apercu} className={pilule} style={{ background: "transparent" }}>Lire le marché</button>}
        </div>
      )}
      <GrilleMarche dossier={dossier} lot={lot} analyse={analyse} onRefresh={onRefresh} apercu={apercu} onChercher={(sources) => onLancer(sources)} enCours={enCours} />
    </div>
  );
}
