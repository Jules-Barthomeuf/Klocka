import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, Activity, Users, MessageSquare, Wrench, ChevronDown, Coins } from "lucide-react";

// Centre de suivi : qui utilise quoi, et tout ce qu'on a demandé à l'assistant.
//
// Trois flux se rejoignent ici. Les visites disent qui vient et où. Les requêtes
// disent ce qu'on demande à l'IA. Les actions disent ce qui a réellement été
// exécuté au-dehors — et cette dernière colonne est la seule qui engage.

const FENETRES = [
  { jours: 7, libelle: "7 jours" },
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "90 jours" },
];

// Sous le centime, une somme se lit mieux en millièmes qu'arrondie à zéro.
const dollars = (n) =>
  n == null ? "—" : n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;

const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Chiffre({ icone: Icone, valeur, libelle }) {
  return (
    <div className="border border-[#1f2228] rounded-md bg-[#0f1114] px-4 py-3.5">
      <div className="flex items-center gap-2 text-[#9298a6] text-[11px] tracking-[.14em] uppercase">
        <Icone className="w-3.5 h-3.5" /> {libelle}
      </div>
      <p className="m-0 mt-2 text-[26px] font-light tabular-nums text-[#f2f3f5]">{valeur}</p>
    </div>
  );
}

// Barre proportionnelle : la comparaison se lit sans chiffre à décoder.
function Barre({ part }) {
  return (
    <div className="h-1.5 rounded-full bg-[#f2f3f5]/[0.06] overflow-hidden">
      <div className="h-full bg-[#96c0b8]" style={{ width: `${Math.max(2, part * 100)}%` }} />
    </div>
  );
}

export default function Monitoring() {
  const [jours, setJours] = useState(30);
  const [ouverte, setOuverte] = useState(null);
  const [limite, setLimite] = useState(50);

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring", jours],
    queryFn: () => base44.request("GET", `/api/monitoring?jours=${jours}`),
    refetchOnWindowFocus: true,
  });

  const { data: couts } = useQuery({
    queryKey: ["monitoring-couts", jours],
    queryFn: () => base44.request("GET", `/api/monitoring/couts?jours=${jours}`),
  });

  const { data: historique } = useQuery({
    queryKey: ["monitoring-requetes", limite],
    queryFn: () => base44.request("GET", `/api/monitoring/requetes?limite=${limite}`),
  });

  if (error) {
    return (
      <div className="bg-[#000000] min-h-screen text-[#f2f3f5] p-8">
        <p className="text-[13.5px] text-[#96c0b8]">{error.message || "Accès refusé."}</p>
      </div>
    );
  }

  const maxVisites = Math.max(1, ...(data?.pages || []).map((p) => p.visites));
  const maxOutils = Math.max(1, ...(data?.outils || []).map((o) => o.appels));

  return (
    <div className="bg-[#000000] min-h-screen text-[#f2f3f5]">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
          <div>
            <div className="text-[11px] tracking-[.16em] uppercase text-[#9298a6] mb-2.5">Suivi</div>
            <h1 className="m-0 text-[30px] max-md:text-[24px] font-light tracking-[-.02em]">Usage de la plateforme</h1>
            <p className="mt-2.5 mb-0 max-w-[62ch] text-[13.5px] leading-[1.65] text-[#9298a6]">
              Les pages consultées, les demandes faites à l'assistant, et ce qui a réellement été
              exécuté au-dehors.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {FENETRES.map((f) => (
              <button
                key={f.jours}
                onClick={() => setJours(f.jours)}
                className={`px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${
                  jours === f.jours
                    ? "border-[#96c0b8] text-[#96c0b8] bg-[#96c0b8]/[0.1]"
                    : "border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"
                }`}
              >
                {f.libelle}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
              <Chiffre icone={Users} valeur={data.totaux.personnes} libelle="Personnes" />
              <Chiffre icone={Activity} valeur={data.totaux.visites} libelle="Pages ouvertes" />
              <Chiffre icone={MessageSquare} valeur={data.totaux.requetes} libelle="Demandes à l'IA" />
              <Chiffre icone={Wrench} valeur={data.totaux.actions} libelle="Actions exécutées" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
              {/* Par personne */}
              <div className="border border-[#1f2228] rounded-md p-4">
                <h2 className="m-0 mb-3 text-[10.5px] tracking-[.16em] uppercase text-[#96c0b8] font-normal">
                  Par personne
                </h2>
                {data.personnes.length === 0 ? (
                  <p className="m-0 text-[12.5px] text-[#6a7180]">Aucune activité sur la période.</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#22262d]">
                        {["Personne", "Pages", "IA", "Actions", "Vu le"].map((h, i) => (
                          <th
                            key={h}
                            className={`py-2 text-[10px] tracking-[.14em] uppercase text-[#6a7180] font-normal ${i ? "text-right" : "text-left"}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.personnes.map((p) => (
                        <tr key={p.email} className="border-b border-[#15171b]">
                          <td className="py-2.5 text-[12.5px] text-[#f2f3f5] truncate max-w-[190px]">
                            {p.email}
                            {p.role === "admin" && <span className="text-[#96c0b8] text-[10px] ml-1.5">admin</span>}
                          </td>
                          <td className="py-2.5 text-right text-[12.5px] tabular-nums text-[#c9cdd6]">{p.visites}</td>
                          <td className="py-2.5 text-right text-[12.5px] tabular-nums text-[#c9cdd6]">{p.requetes}</td>
                          <td className="py-2.5 text-right text-[12.5px] tabular-nums text-[#c9cdd6]">{p.actions}</td>
                          <td className="py-2.5 text-right text-[11.5px] text-[#6a7180] whitespace-nowrap">
                            {quand(p.derniere)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Par page */}
              <div className="border border-[#1f2228] rounded-md p-4">
                <h2 className="m-0 mb-3 text-[10.5px] tracking-[.16em] uppercase text-[#96c0b8] font-normal">
                  Pages les plus consultées
                </h2>
                {data.pages.length === 0 ? (
                  <p className="m-0 text-[12.5px] text-[#6a7180]">Aucune visite enregistrée.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.pages.slice(0, 12).map((p) => (
                      <div key={p.page}>
                        <div className="flex justify-between text-[12.5px] mb-1">
                          <span className="text-[#c9cdd6]">{p.page}</span>
                          <span className="text-[#9298a6] tabular-nums">{p.visites}</span>
                        </div>
                        <Barre part={p.visites / maxVisites} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Outils de l'assistant */}
            {data.outils.length > 0 && (
              <div className="border border-[#1f2228] rounded-md p-4 mb-8">
                <h2 className="m-0 mb-3 text-[10.5px] tracking-[.16em] uppercase text-[#96c0b8] font-normal">
                  Outils de l'assistant les plus appelés
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
                  {data.outils.slice(0, 12).map((o) => (
                    <div key={o.outil}>
                      <div className="flex justify-between text-[12.5px] mb-1">
                        <span className="text-[#c9cdd6]">{o.outil}</span>
                        <span className="text-[#9298a6] tabular-nums">{o.appels}</span>
                      </div>
                      <Barre part={o.appels / maxOutils} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Ce que coûte l'IA */}
        {couts && (
          <div className="border border-[#1f2228] rounded-md p-4 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="m-0 text-[10.5px] tracking-[.16em] uppercase text-[#96c0b8] font-normal flex items-center gap-2">
                <Coins className="w-3.5 h-3.5" /> Ce que coûte l'IA
              </h2>
              <span className="text-[12.5px] text-[#f2f3f5] tabular-nums">
                {dollars(couts.total.cout)} · {couts.total.appels} appel(s) ·{" "}
                {Math.round((couts.total.entree + couts.total.sortie) / 1000)} k jetons
              </span>
            </div>

            {couts.total.appels === 0 ? (
              <p className="m-0 text-[12.5px] text-[#6a7180]">Aucun appel au modèle sur la période.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                <div>
                  <p className="m-0 mb-2 text-[10px] tracking-[.14em] uppercase text-[#6a7180]">Par opération</p>
                  {couts.operations.slice(0, 8).map((o) => (
                    <div key={o.cle} className="flex justify-between text-[12.5px] py-1 border-b border-[#15171b]">
                      <span className="text-[#c9cdd6]">{o.cle}</span>
                      <span className="text-[#9298a6] tabular-nums">
                        {dollars(o.cout)} <span className="text-[#3a3f4a]">· {o.appels}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="m-0 mb-2 text-[10px] tracking-[.14em] uppercase text-[#6a7180]">Par personne</p>
                  {couts.personnes.slice(0, 8).map((p) => (
                    <div key={p.cle} className="flex justify-between text-[12.5px] py-1 border-b border-[#15171b]">
                      <span className="text-[#c9cdd6] truncate max-w-[200px]">{p.cle}</span>
                      <span className="text-[#9298a6] tabular-nums">{dollars(p.cout)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="m-0 mt-4 text-[11.5px] leading-[1.6] text-[#6a7180]">
              Tarifs publics du modèle, lectures de cache comprises. « automatique » regroupe ce qui
              tourne sans personne devant l'écran — extraction des documents, veille des boîtes.
            </p>
          </div>
        )}

        {/* Historique complet des demandes à l'assistant */}
        <div className="border border-[#1f2228] rounded-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="m-0 text-[10.5px] tracking-[.16em] uppercase text-[#96c0b8] font-normal">
              Toutes les demandes à l'assistant
            </h2>
            <span className="text-[11.5px] text-[#6a7180]">
              {historique?.requetes?.length || 0} affichée(s) sur {historique?.total ?? "—"}
            </span>
          </div>

          {!historique?.requetes?.length ? (
            <p className="m-0 text-[12.5px] text-[#6a7180] py-6 text-center">
              Aucune demande enregistrée pour l'instant.
            </p>
          ) : (
            <div className="divide-y divide-[#15171b]">
              {historique.requetes.map((r) => {
                const estOuverte = ouverte === r.id;
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => setOuverte(estOuverte ? null : r.id)}
                      className="w-full text-left py-3 flex items-start gap-3 hover:bg-[#f2f3f5]/[0.02] transition-colors"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[#6a7180] mt-1 flex-shrink-0 transition-transform ${estOuverte ? "" : "-rotate-90"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[13px] text-[#f2f3f5] truncate">{r.question}</p>
                        <p className="m-0 mt-1 text-[11.5px] text-[#6a7180]">
                          {[
                            r.par,
                            quand(r.le),
                            r.duree_ms != null ? `${(r.duree_ms / 1000).toFixed(1)} s` : null,
                            r.outils?.length ? `${r.outils.length} outil(s)` : "sans outil",
                            r.actions?.length ? `${r.actions.length} action(s)` : null,
                            r.cout != null ? dollars(r.cout) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </button>

                    {estOuverte && (
                      <div className="pb-4 pl-7 pr-1 space-y-3">
                        <div>
                          <p className="m-0 mb-1 text-[10px] tracking-[.14em] uppercase text-[#6a7180]">Réponse</p>
                          <p className="m-0 text-[12.5px] leading-[1.65] text-[#c9cdd6] whitespace-pre-wrap">
                            {r.reponse}
                          </p>
                        </div>
                        {r.outils?.length > 0 && (
                          <div>
                            <p className="m-0 mb-1.5 text-[10px] tracking-[.14em] uppercase text-[#6a7180]">
                              Outils appelés
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {r.outils.map((o, i) => (
                                <span
                                  key={`${o}-${i}`}
                                  className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                    r.actions?.includes(o)
                                      ? "border-[#96c0b8]/40 text-[#96c0b8] bg-[#96c0b8]/[0.1]"
                                      : "border-[#22262d] text-[#9298a6]"
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
                          <p className="m-0 text-[11.5px] text-[#6a7180]">Sur : {r.sur}</p>
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
              className="mt-4 w-full py-2 rounded-md border border-[#22262d] text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors"
            >
              Afficher 50 de plus
            </button>
          )}
        </div>

        <p className="mt-8 mb-0 text-[11.5px] leading-[1.7] text-[#6a7180] border-t border-[#1f2228] pt-5">
          Les demandes à l'assistant sont conservées avec leur réponse : c'est ce qui permet de
          comprendre après coup pourquoi une action a été prise. Une pastille verte signale un outil
          qui a <em>modifié</em> quelque chose ; les autres n'ont fait que lire.
        </p>
      </div>
    </div>
  );
}
