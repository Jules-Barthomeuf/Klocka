import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { RENDEZ_VOUS_URL } from "@/lib/rendezVous";
import { ArrowRight, Calendar } from "lucide-react";

// La première chose qu'un client voit en entrant : prendre rendez-vous.
//
// Le parcours commençait par l'acculturation, comme un préalable. Ce n'en est
// pas un : c'est le rendez-vous stratégique qui lance la relation, et les
// ressources viennent ensuite, à son rythme. La fenêtre le dit dans cet ordre.
//
// Un seul écran. Tant que le rendez-vous n'est pas pris, on invite à le
// prendre — « plus tard » ferme pour la session, pas pour de bon. Une fois
// pris, on se tait : les ressources sont dans le menu, à son rythme.

const CLE_SESSION = "rdv-strategique-plus-tard";

export default function RendezVousStrategique({ user }) {
  const [rdvPris, setRdvPris] = useState(!!user?.rdv_strategique_le);
  const [ferme, setFerme] = useState(() => {
    try {
      return sessionStorage.getItem(CLE_SESSION) === "1";
    } catch {
      return false;
    }
  });

  if (ferme || rdvPris) return null;

  const noter = (champs) => base44.auth.updateMe(champs).catch(() => {});

  const prendreRendezVous = () => {
    window.open(RENDEZ_VOUS_URL, "_blank", "noopener");
    setRdvPris(true);
    noter({ rdv_strategique_le: new Date().toISOString() });
  };

  const plusTard = () => {
    try {
      sessionStorage.setItem(CLE_SESSION, "1");
    } catch {
      /* stockage indisponible : la fenêtre reviendra, ce n'est pas grave */
    }
    setFerme(true);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4">
      <div className="w-full max-w-lg bg-[#0f1114] border border-[#96c0b8]/40 p-9 max-md:p-7">
            <div className="w-11 h-11 border border-[#96c0b8]/40 flex items-center justify-center mb-6">
              <Calendar className="w-5 h-5 text-[#96c0b8]" />
            </div>
            <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#96c0b8]">Première étape</p>
            <h2 className="m-0 mt-3 text-[28px] max-md:text-[23px] font-light tracking-[-.02em] leading-[1.1] text-[#f2f3f5]">
              Prenez rendez-vous pour définir votre stratégie
            </h2>
            <p className="m-0 mt-4 text-[14px] leading-[1.7] text-[#9298a6]">
              Quarante-cinq minutes en visioconférence avec votre conseiller : votre situation, vos objectifs,
              et la stratégie d'investissement qui en découle. Tout le reste part de là.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={prendreRendezVous}
                className="inline-flex items-center gap-2 px-5 py-3 bg-[#96c0b8] text-[#000000] text-[11px] tracking-[.16em] uppercase font-medium hover:bg-[#abd0c8] transition-colors"
              >
                Prendre rendez-vous <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={plusTard} className="text-[12.5px] text-[#6a7180] hover:text-[#f2f3f5] transition-colors">
                Plus tard
              </button>
            </div>
      </div>
    </div>
  );
}
