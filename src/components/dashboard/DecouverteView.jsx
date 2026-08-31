import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { PARCOURS_RENDEZ_VOUS_URL } from "@/lib/rendezVous";
import DashboardProjectCard from "./DashboardProjectCard";
import { ArrowRight, Calculator, Calendar } from "lucide-react";

// L'espace découverte : ce qu'on voit avant d'être client.
//
// Une seule porte — le rendez-vous stratégique — et de quoi donner envie de
// la pousser : des projets accompagnés par Klocka, avec leurs chiffres, et le
// simulateur. Pas de fenêtre qui s'impose : l'invitation est sur la page.

const OR = "#d9b46a";

export default function DecouverteView({ user }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prenom = (user?.full_name || "").split(" ")[0];

  // Les projets vitrine : le serveur ne rend que ceux-là à un compte découverte.
  const { data: projets = [] } = useQuery({
    queryKey: ["projets-vitrine"],
    queryFn: () => base44.entities.Project.filter({ vitrine: true }),
    initialData: [],
  });

  // Le questionnaire d'abord, qui mène au créneau. La demande est notée pour
  // l'équipe ; l'écran, lui, ne change pas.
  const prendreRendezVous = async () => {
    window.open(PARCOURS_RENDEZ_VOUS_URL, "_blank", "noopener");
    const le = new Date().toISOString();
    try {
      await base44.auth.updateMe({ rdv_strategique_le: le });
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
    } catch {
      /* la date reste locale ; l'équipe la verra au prochain passage */
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5]">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-10 md:py-14">
        {/* --- En-tête --------------------------------------------------- */}
        <header>
          <p className="m-0 text-[11px] tracking-[.16em] uppercase text-[#9298a6]">Espace découverte</p>
          <h1 className="m-0 mt-2.5 text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5]">
            {prenom ? `Bonjour, ${prenom}` : "Bienvenue"}
          </h1>
          <p className="m-0 mt-3 max-w-[56ch] text-[14.5px] leading-[1.7] text-[#9298a6]">
            Un aperçu de ce que Klocka construit avec ses clients : des murs commerciaux choisis, chiffrés, financés.
            Tout commence par un rendez-vous.
          </p>
        </header>

        {/* --- Le rendez-vous, en or ---------------------------------------- */}
        <section className="mt-8 border rounded-xl px-6 py-6 md:px-8 md:py-7" style={{ borderColor: `${OR}66`, background: "#0f1114" }}>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0 max-w-[60ch]">
              <p className="m-0 text-[10.5px] tracking-[.18em] uppercase" style={{ color: OR }}>
                <Calendar className="w-3.5 h-3.5 inline mr-2 align-[-2px]" />Première étape
              </p>
              <h2 className="m-0 mt-2 text-[22px] max-md:text-[19px] font-light tracking-[-.015em] leading-[1.2] text-[#f2f3f5]">
                Prenez rendez-vous avec un co-fondateur
              </h2>
              <p className="m-0 mt-2.5 text-[14px] leading-[1.7] text-[#c9cdd6]">
                Quarante-cinq minutes pour parler de votre situation, de vos objectifs et de ce qu'on peut viser ensemble.
                C'est après cet appel que votre espace complet s'ouvre.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2">
              <button
                onClick={prendreRendezVous}
                className="inline-flex items-center gap-2 px-6 py-3 text-[11px] tracking-[.16em] uppercase font-semibold text-[#000000] transition-opacity hover:opacity-90"
                style={{ background: OR, borderRadius: 9999 }}
              >
                Prendre rendez-vous <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11.5px] text-[#6a7180]">Deux minutes de questionnaire, puis le choix de votre créneau.</span>
            </div>
          </div>
        </section>

        {/* --- Les projets vitrine ------------------------------------------ */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <div>
              <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Ce que vous verrez</p>
              <h2 className="m-0 mt-1.5 text-[20px] font-light tracking-[-.015em] text-[#f2f3f5]">Des projets accompagnés par Klocka</h2>
            </div>
          </div>
          {projets.length > 0 ? (
            <DashboardProjectCard projects={projets} />
          ) : (
            <div className="border border-[#1f2228] rounded-xl bg-[#0f1114] px-6 py-8 text-[13.5px] text-[#9298a6]">
              Les projets vitrine arrivent. Le simulateur, lui, est déjà ouvert.
            </div>
          )}
        </section>

        {/* --- Le simulateur ------------------------------------------------ */}
        <section className="mt-10 border border-[#1f2228] rounded-xl bg-[#0f1114] px-6 py-6 md:px-8 flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 max-w-[60ch]">
            <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#96c0b8]">
              <Calculator className="w-3.5 h-3.5 inline mr-2 align-[-2px]" />Le simulateur
            </p>
            <h2 className="m-0 mt-2 text-[20px] font-light tracking-[-.015em] text-[#f2f3f5]">Testez un projet, tout de suite</h2>
            <p className="m-0 mt-2 text-[14px] leading-[1.7] text-[#c9cdd6]">
              Prix, loyer, financement : les indicateurs et le graphique sont ouverts. Le détail année par année, la revente et
              la négociation s'ouvrent après votre rendez-vous.
            </p>
          </div>
          <button
            onClick={() => navigate("/SimulateurRentabilite")}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#96c0b8] text-[#000000] text-[11px] tracking-[.16em] uppercase font-semibold hover:bg-[#abd0c8]"
          >
            Ouvrir le simulateur <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>

        <p className="m-0 mt-10 text-[12px] text-[#6a7180]">
          Déjà client ? Connectez-vous avec l'adresse de votre invitation, ou dites-le à votre conseiller : il ouvre votre espace.
        </p>
      </div>
    </div>
  );
}
