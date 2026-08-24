import React, { useState } from "react";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";

// Le simulateur de l'étape Analyse : présent dès l'arrivée sur l'étape, à droite
// des onglets Documents / analyses. Il part des chiffres du lot pré-analysé et
// reste manipulable même quand le dossier est incomplet — c'est là qu'on
// dégrossit pendant qu'on dépouille les documents.

export default function SimulateurAnalyse({ dossier }) {
  const lots = dossier?.lots || [];
  const [index, setIndex] = useState(0);
  const lot = lots[index] || lots[0] || null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <h3 className="m-0 text-[16px] font-medium text-[#edeae5]">Simulateur</h3>
        {lots.length > 1 && (
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="bg-[#101413] border border-[#242726] rounded-md px-2.5 py-1.5 text-[12px] text-[#9aa19e] outline-none hover:border-[#565b59] transition-colors max-w-[240px]"
          >
            {lots.map((l, i) => (
              <option key={i} value={i}>{l.synthese?.titre || l.intitule || `Lot ${i + 1}`}</option>
            ))}
          </select>
        )}
      </div>

      {!lot && (
        <p className="m-0 mb-2.5 text-[11.5px] text-[#6b7270] leading-[1.5]">
          Aucun lot pré-analysé : les curseurs partent des hypothèses par défaut. Posez le prix et le
          loyer à la main pour voir si le projet tient.
        </p>
      )}

      <SimulateurDossier parametres={lot?.simulateur || {}} />
    </section>
  );
}
