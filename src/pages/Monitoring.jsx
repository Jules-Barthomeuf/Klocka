import React, { useState } from "react";
import OngletsSuivi from "@/components/OngletsSuivi";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown } from "lucide-react";
import SauvegardeBase from "@/components/monitoring/SauvegardeBase";
import JournalAudit from "@/components/monitoring/JournalAudit";
import Incidents from "@/components/monitoring/Incidents";
import QualiteEtRegles from "@/components/monitoring/QualiteEtRegles";
import { useCouleurs } from "@/components/monitoring/GraphesAppels";
import { TableauPersonnes, VueEnsemble } from "@/components/monitoring/UsagePlateforme";
import Chargement from "@/components/ui/Chargement";

// Centre de suivi : qui utilise la plateforme, combien de temps, et sur quoi.
//
// Depuis le 19 oct. 2026 (Jules) : en tête, cinq chiffres et leur courbe, un
// grand graphique par jour, le temps par page et l'heure de la semaine ; puis
// le tableau par personne, dont chaque ligne s'ouvre sur ses sessions, page
// par page. Les colonnes IA et Actions, les outils de l'assistant et ce que
// coûte l'IA sont partis de cet écran (la page Coûts IA garde les coûts).

const FENETRES = [
  { jours: 1, libelle: "1 jour" },
  { jours: 7, libelle: "7 jours" },
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "90 jours" },
];

const EUR_PAR_USD = 0.92;
const euros = (n) => {
  if (n == null) return "—";
  const e = n * EUR_PAR_USD;
  return e >= 0.01 ? `${e.toFixed(2).replace(".", ",")} €` : `${e.toFixed(4).replace(".", ",")} €`;
};
const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function Monitoring() {
  const [jours, setJours] = useState(30);
  const [ouverte, setOuverte] = useState(null);
  const [limite, setLimite] = useState(50);
  const c = useCouleurs();

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring-usage", jours],
    queryFn: () => base44.request("GET", `/api/monitoring/usage?jours=${jours}`),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });

  const { data: historique } = useQuery({
    queryKey: ["monitoring-requetes", limite],
    queryFn: () => base44.request("GET", `/api/monitoring/requetes?limite=${limite}`),
  });

  if (error) {
    return (
      <div className="bg-fond min-h-screen text-encre p-8">
        <p className="text-[13.5px] text-menthe">{error.message || "Accès refusé."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-encre">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div className="min-w-0 max-w-full">
            <OngletsSuivi className="mb-3.5 overflow-x-auto" />
            <h1 className="m-0 text-[34px] max-md:text-[24px] font-light tracking-[-.02em]">Usage de la plateforme</h1>
            <p className="m-0 mt-1.5 max-w-[70ch] text-[13.5px] text-ardoise">Toute l'équipe, admins compris, les mandataires et les clients connectés. Un clic sur un chiffre le met dans le grand graphique.</p>
          </div>
          <div className="flex gap-1 rounded-full bg-rail-actif p-1">
            {FENETRES.map((f) => (
              <button key={f.jours} type="button" onClick={() => setJours(f.jours)} aria-pressed={jours === f.jours}
                className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${jours === f.jours ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={jours === f.jours ? undefined : { background: "transparent" }}>
                {f.libelle}
              </button>
            ))}
          </div>
        </div>

        {isLoading || !data ? (
          <Chargement taille="grand" />
        ) : (
          <div className="flex flex-col gap-5 mb-8">
            <VueEnsemble data={data} c={c} />
            <TableauPersonnes personnes={data.personnes} jours={jours} c={c} />
            <p className="m-0 text-[12px] leading-[1.6] text-brume">
              Une connexion : des pages ouvertes sans pause de plus de 30 minutes. Le temps sur une page va jusqu'à la page suivante ;
              sur la dernière, jusqu'au dernier signe du navigateur (il en envoie un toutes les 30 s tant que la page est visible, 30 minutes au plus),
              ou une minute quand il n'y en a pas (marqué « ~ » et en gris). Les battements existent depuis le 14 octobre 2026.
            </p>
          </div>
        )}

        {/* La prospection : la qualité d'AK (9 oct. 2026). */}
        <QualiteEtRegles />

        {/* Historique complet des demandes à l'assistant */}
        <div className="border border-trait rounded-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="m-0 text-[11px] tracking-[.16em] uppercase text-menthe font-normal">
              Toutes les demandes à l'assistant
            </h2>
            <span className="text-[11px] text-brume">
              {historique?.requetes?.length || 0} affichée(s) sur {historique?.total ?? "—"}
            </span>
          </div>

          {!historique?.requetes?.length ? (
            <p className="m-0 text-[12.5px] text-brume py-6 text-center">
              Aucune demande enregistrée pour l'instant.
            </p>
          ) : (
            <div className="divide-y divide-relief">
              {historique.requetes.map((r) => {
                const estOuverte = ouverte === r.id;
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => setOuverte(estOuverte ? null : r.id)}
                      className="w-full text-left py-3 flex items-start gap-3 hover:bg-encre/[0.02] transition-colors"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-brume mt-1 flex-shrink-0 transition-transform ${estOuverte ? "" : "-rotate-90"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[12.5px] text-encre truncate">{r.question}</p>
                        <p className="m-0 mt-1 text-[11px] text-brume">
                          {[
                            r.par,
                            quand(r.le),
                            r.duree_ms != null ? `${(r.duree_ms / 1000).toFixed(1)} s` : null,
                            r.outils?.length ? `${r.outils.length} outil(s)` : "sans outil",
                            r.actions?.length ? `${r.actions.length} action(s)` : null,
                            r.cout != null ? euros(r.cout) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </button>

                    {estOuverte && (
                      <div className="pb-4 pl-7 pr-1 space-y-3">
                        <div>
                          <p className="m-0 mb-1 text-[11px] tracking-[.14em] uppercase text-brume">Réponse</p>
                          <p className="m-0 text-[12.5px] leading-[1.65] text-craie whitespace-pre-wrap">
                            {r.reponse}
                          </p>
                        </div>
                        {r.outils?.length > 0 && (
                          <div>
                            <p className="m-0 mb-1.5 text-[11px] tracking-[.14em] uppercase text-brume">
                              Outils appelés
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.outils.map((o, i) => (
                                <span
                                  key={`${o}-${i}`}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                    r.actions?.includes(o)
                                      ? "border-menthe/40 text-menthe bg-menthe/[0.1]"
                                      : "border-bord text-ardoise"
                                  }`}
                                  title={r.actions?.includes(o) ? "A modifié quelque chose" : "Lecture seule"}
                                >
                                  {o}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {r.sur && (
                          <p className="m-0 text-[11px] text-brume">Sur : {r.sur}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {historique?.total > (historique?.requetes?.length || 0) && (
            <button
              onClick={() => setLimite((l) => l + 50)}
              className="mt-4 w-full py-2 rounded-md border border-bord text-[12.5px] text-ardoise hover:text-encre hover:border-bord-vif transition-colors"
            >
              Afficher 50 de plus
            </button>
          )}
        </div>

        <p className="mt-8 mb-0 text-[11px] leading-[1.7] text-brume border-t border-trait pt-5">
          Les demandes à l'assistant sont conservées avec leur réponse : c'est ce qui permet de
          comprendre après coup pourquoi une action a été prise. Une pastille verte signale un outil
          qui a <em>modifié</em> quelque chose ; les autres n'ont fait que lire.
        </p>

        <JournalAudit />

        <Incidents />

        <SauvegardeBase />
      </div>
    </div>
  );
}
