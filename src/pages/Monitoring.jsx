import React, { useState } from "react";
import OngletsSuivi from "@/components/OngletsSuivi";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, Activity, Users, MessageSquare, Wrench, ChevronDown, Coins } from "lucide-react";
import SauvegardeBase from "@/components/monitoring/SauvegardeBase";
import JournalAudit from "@/components/monitoring/JournalAudit";

// Centre de suivi : qui utilise quoi, et tout ce qu'on a demandé à l'assistant.
//
// Trois flux se rejoignent ici. Les visites disent qui vient et où. Les requêtes
// disent ce qu'on demande à l'IA. Les actions disent ce qui a réellement été
// exécuté au-dehors — et cette dernière colonne est la seule qui engage.

const FENETRES = [
  // Une journée : ce qu'on regarde après avoir touché un réglage, pour voir
  // l'effet tout de suite au lieu de l'attendre noyé dans une semaine.
  { jours: 1, libelle: "1 jour" },
  { jours: 7, libelle: "7 jours" },
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "90 jours" },
];

// Sous le centime, une somme se lit mieux en millièmes qu'arrondie à zéro.
// Les tarifs du modèle sont en dollars ; on lit en euros, au taux indiqué en bas de carte.
const EUR_PAR_USD = 0.92;
const euros = (n) => {
  if (n == null) return "—";
  const e = n * EUR_PAR_USD;
  return e >= 0.01 ? `${e.toFixed(2).replace(".", ",")} €` : `${e.toFixed(4).replace(".", ",")} €`;
};

const duree = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`);
const horodatage = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
};
const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Chiffre({ icone: Icone, valeur, libelle }) {
  return (
    <div className="border border-trait rounded-md bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2 text-ardoise text-[11px] tracking-[.14em] uppercase">
        <Icone className="w-3.5 h-3.5" /> {libelle}
      </div>
      <p className="m-0 mt-2 text-[26px] font-light tabular-nums text-encre">{valeur}</p>
    </div>
  );
}

// Barre proportionnelle : la comparaison se lit sans chiffre à décoder.
function Barre({ part }) {
  return (
    <div className="h-1.5 rounded-full bg-encre/[0.06] overflow-hidden">
      <div className="h-full bg-menthe" style={{ width: `${Math.max(2, part * 100)}%` }} />
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

  const [parFiltre, setParFiltre] = useState(null);
  const [limiteCouts, setLimiteCouts] = useState(100);
  const [gesteOuvert, setGesteOuvert] = useState(null);
  const { data: couts } = useQuery({
    queryKey: ["monitoring-couts", jours, parFiltre, limiteCouts],
    queryFn: () => base44.request("GET", `/api/monitoring/couts?jours=${jours}&limite=${limiteCouts}${parFiltre ? `&par=${encodeURIComponent(parFiltre)}` : ""}`),
    placeholderData: (prev) => prev,
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

  const maxVisites = Math.max(1, ...(data?.pages || []).map((p) => p.visites));
  const maxOutils = Math.max(1, ...(data?.outils || []).map((o) => o.appels));

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
          <div>
            <OngletsSuivi className="mb-3.5" />
            <h1 className="m-0 text-[30px] max-md:text-[24px] font-light tracking-[-.02em]">Usage de la plateforme</h1>
            <p className="mt-2.5 mb-0 max-w-[62ch] text-[13.5px] leading-[1.65] text-ardoise">
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
                    ? "border-menthe text-menthe bg-menthe/[0.1]"
                    : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"
                }`}
              >
                {f.libelle}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-ardoise animate-spin" />
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
              <div className="border border-trait rounded-md p-4">
                <h2 className="m-0 mb-3 text-[10.5px] tracking-[.16em] uppercase text-menthe font-normal">
                  Par personne
                </h2>
                {data.personnes.length === 0 ? (
                  <p className="m-0 text-[12.5px] text-brume">Aucune activité sur la période.</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-bord">
                        {["Personne", "Pages", "IA", "Actions", "Vu le"].map((h, i) => (
                          <th
                            key={h}
                            className={`py-2 text-[10px] tracking-[.14em] uppercase text-brume font-normal ${i ? "text-right" : "text-left"}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.personnes.map((p) => (
                        <tr key={p.email} className="border-b border-relief">
                          <td className="py-2.5 text-[12.5px] text-encre truncate max-w-[190px]">
                            {p.email}
                            {p.role === "admin" && <span className="text-menthe text-[10px] ml-1.5">admin</span>}
                          </td>
                          <td className="py-2.5 text-right text-[12.5px] tabular-nums text-craie">{p.visites}</td>
                          <td className="py-2.5 text-right text-[12.5px] tabular-nums text-craie">{p.requetes}</td>
                          <td className="py-2.5 text-right text-[12.5px] tabular-nums text-craie">{p.actions}</td>
                          <td className="py-2.5 text-right text-[11.5px] text-brume whitespace-nowrap">
                            {quand(p.derniere)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Par page */}
              <div className="border border-trait rounded-md p-4">
                <h2 className="m-0 mb-3 text-[10.5px] tracking-[.16em] uppercase text-menthe font-normal">
                  Pages les plus consultées
                </h2>
                {data.pages.length === 0 ? (
                  <p className="m-0 text-[12.5px] text-brume">Aucune visite enregistrée.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.pages.slice(0, 12).map((p) => (
                      <div key={p.page}>
                        <div className="flex justify-between text-[12.5px] mb-1">
                          <span className="text-craie">{p.page}</span>
                          <span className="text-ardoise tabular-nums">{p.visites}</span>
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
              <div className="border border-trait rounded-md p-4 mb-8">
                <h2 className="m-0 mb-3 text-[10.5px] tracking-[.16em] uppercase text-menthe font-normal">
                  Outils de l'assistant les plus appelés
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5">
                  {data.outils.slice(0, 12).map((o) => (
                    <div key={o.outil}>
                      <div className="flex justify-between text-[12.5px] mb-1">
                        <span className="text-craie">{o.outil}</span>
                        <span className="text-ardoise tabular-nums">{o.appels}</span>
                      </div>
                      <Barre part={o.appels / maxOutils} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Ce que coûte l'IA : chaque requête, datée, chronométrée, attribuée */}
        {couts && (
          <div className="border border-trait rounded-md p-4 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="m-0 text-[10.5px] tracking-[.16em] uppercase text-menthe font-normal flex items-center gap-2">
                <Coins className="w-3.5 h-3.5" /> Ce que coûte l'IA
              </h2>
              <span className="text-[12.5px] text-encre tabular-nums">
                {euros(couts.total.cout)} · {couts.journal_total} requête(s) · {couts.total.appels} appel(s) ·{" "}
                {Math.round((couts.total.entree + couts.total.sortie) / 1000)} k jetons
              </span>
            </div>

            {couts.total.appels === 0 ? (
              <p className="m-0 text-[12.5px] text-brume">Aucun appel au modèle sur la période.</p>
            ) : (
              <>
                {/* Par utilisateur : clic pour ne voir que ses requêtes */}
                <p className="m-0 mb-2 text-[10px] tracking-[.14em] uppercase text-brume">Coût par utilisateur</p>
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-[12.5px] border-collapse">
                    <thead>
                      <tr className="text-[10px] tracking-[.12em] uppercase text-brume">
                        <th className="text-left font-normal py-1.5 pr-3">Utilisateur</th>
                        <th className="text-right font-normal py-1.5 px-3">Requêtes</th>
                        <th className="text-right font-normal py-1.5 px-3">Appels</th>
                        <th className="text-right font-normal py-1.5 px-3">Durée moy.</th>
                        <th className="text-right font-normal py-1.5 px-3">Jetons</th>
                        <th className="text-right font-normal py-1.5 pl-3">Coût</th>
                        <th className="w-[140px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {couts.personnes.map((p) => {
                        const actif = parFiltre === p.cle;
                        return (
                          <tr
                            key={p.cle}
                            onClick={() => { setParFiltre(actif ? null : p.cle); setLimiteCouts(100); }}
                            className={`border-t border-relief cursor-pointer transition-colors ${actif ? "bg-menthe/[0.08]" : "hover:bg-encre/[0.02]"}`}
                          >
                            <td className={`py-2 pr-3 truncate max-w-[260px] ${actif ? "text-menthe" : "text-encre"}`}>{p.cle}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-ardoise">{p.requetes}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-ardoise">{p.appels}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-ardoise">{p.duree_ms ? duree(p.duree_ms / p.requetes) : "—"}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-ardoise">{Math.round((p.entree + p.sortie) / 1000)} k</td>
                            <td className="py-2 pl-3 text-right tabular-nums text-encre">{euros(p.cout)}</td>
                            <td className="py-2 pl-3"><Barre part={couts.total.cout ? p.cout / couts.total.cout : 0} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="m-0 mb-2 text-[10px] tracking-[.14em] uppercase text-brume">Par opération</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 mb-6">
                  {couts.operations.slice(0, 10).map((o) => (
                    <div key={o.cle} className="flex justify-between text-[12.5px] py-1 border-b border-relief">
                      <span className="text-craie">{o.cle}</span>
                      <span className="text-ardoise tabular-nums">
                        {euros(o.cout)} <span className="text-bord-vif">· {o.requetes} req. · {o.duree_ms ? duree(o.duree_ms / o.requetes) : "—"}</span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* Le journal : une ligne par requête, la plus récente en haut */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <p className="m-0 text-[10px] tracking-[.14em] uppercase text-brume">
                    Journal{parFiltre ? ` · ${parFiltre}` : ""}
                  </p>
                  <span className="text-[11.5px] text-brume flex items-center gap-3">
                    {couts.journal.length} sur {couts.journal_total}
                    {parFiltre && (
                      <button onClick={() => setParFiltre(null)} className="text-menthe hover:text-menthe-survol">Tout le monde</button>
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px] border-collapse">
                    <thead>
                      <tr className="text-[10px] tracking-[.12em] uppercase text-brume">
                        <th className="text-left font-normal py-1.5 pr-3 whitespace-nowrap">Date · heure</th>
                        <th className="text-left font-normal py-1.5 px-3">Opération</th>
                        <th className="text-left font-normal py-1.5 px-3">Utilisateur</th>
                        <th className="text-right font-normal py-1.5 px-3">Durée</th>
                        <th className="text-right font-normal py-1.5 px-3">Appels</th>
                        <th className="text-right font-normal py-1.5 px-3">Jetons</th>
                        <th className="text-right font-normal py-1.5 pl-3">Coût</th>
                      </tr>
                    </thead>
                    <tbody>
                      {couts.journal.map((g) => {
                        const ouvert = gesteOuvert === g.id;
                        const serie = g.etapes > 1;
                        return (
                          <React.Fragment key={g.id}>
                            <tr onClick={() => serie && setGesteOuvert(ouvert ? null : g.id)} className={`border-t border-relief ${serie ? "cursor-pointer" : ""} ${ouvert ? "bg-encre/[0.03]" : "hover:bg-encre/[0.02]"}`}>
                              <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-ardoise">
                                <span className="inline-flex items-center gap-1.5">
                                  <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${serie ? "text-brume" : "text-transparent"} ${ouvert ? "" : "-rotate-90"}`} />
                                  {horodatage(g.debut)}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-encre">
                                {g.operation}
                                {serie ? <span className="text-brume"> · {g.etapes} étapes</span> : null}
                                {g.modele ? <span className="text-bord-vif"> · {g.modele}</span> : null}
                              </td>
                              <td className="py-2 px-3 text-craie truncate max-w-[220px]">{g.par || <span className="text-brume">tâche de fond</span>}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-ardoise">{g.duree_ms != null ? duree(g.duree_ms) : "—"}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-ardoise">{g.appels}</td>
                              <td className="py-2 px-3 text-right tabular-nums text-ardoise" title={`${g.entree} entrée · ${g.sortie} sortie · ${g.cache_lecture} cache`}>
                                {((g.entree + g.sortie) / 1000).toFixed(1)} k
                              </td>
                              <td className="py-2 pl-3 text-right tabular-nums text-encre">{euros(g.cout)}</td>
                            </tr>
                            {ouvert && g.lignes.map((l) => (
                              <tr key={l.id} className="bg-encre/[0.015]">
                                <td className="py-1.5 pr-3 pl-6 whitespace-nowrap tabular-nums text-[11.5px] text-brume">{horodatage(l.le).split(" · ")[1] || horodatage(l.le)}</td>
                                <td className="py-1.5 px-3 text-[11.5px] text-craie truncate max-w-[360px]" colSpan={2}>{l.libelle || l.sur || "—"}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-[11.5px] text-brume">{l.duree_ms != null ? duree(l.duree_ms) : "—"}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-[11.5px] text-brume">{l.appels}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-[11.5px] text-brume">{((l.entree + l.sortie) / 1000).toFixed(1)} k</td>
                                <td className="py-1.5 pl-3 text-right tabular-nums text-[11.5px] text-ardoise">{euros(l.cout)}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {couts.journal_total > couts.journal.length && (
                  <button onClick={() => setLimiteCouts((n) => n + 200)} className="mt-3 text-[12px] text-menthe hover:text-menthe-survol">
                    Voir 200 de plus
                  </button>
                )}
              </>
            )}
            <p className="m-0 mt-4 text-[11.5px] leading-[1.6] text-brume">
              Tarifs publics du modèle, lectures de cache comprises, convertis au taux de 1 $ = 0,92 €.
              Une analyse lancée d'un clic fait une ligne : sa durée va du premier au dernier appel, et
              elle s'ouvre pour voir chaque document. Chaque ligne porte la personne qui l'a demandée ; « tâche de fond » ne reste que pour ce qui tourne sans personne
              devant l'écran — veille des boîtes, tâches de fond.
            </p>
          </div>
        )}

        {/* Historique complet des demandes à l'assistant */}
        <div className="border border-trait rounded-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="m-0 text-[10.5px] tracking-[.16em] uppercase text-menthe font-normal">
              Toutes les demandes à l'assistant
            </h2>
            <span className="text-[11.5px] text-brume">
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
                        <p className="m-0 text-[13px] text-encre truncate">{r.question}</p>
                        <p className="m-0 mt-1 text-[11.5px] text-brume">
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
                          <p className="m-0 mb-1 text-[10px] tracking-[.14em] uppercase text-brume">Réponse</p>
                          <p className="m-0 text-[12.5px] leading-[1.65] text-craie whitespace-pre-wrap">
                            {r.reponse}
                          </p>
                        </div>
                        {r.outils?.length > 0 && (
                          <div>
                            <p className="m-0 mb-1.5 text-[10px] tracking-[.14em] uppercase text-brume">
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
                          <p className="m-0 text-[11.5px] text-brume">Sur : {r.sur}</p>
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

        <p className="mt-8 mb-0 text-[11.5px] leading-[1.7] text-brume border-t border-trait pt-5">
          Les demandes à l'assistant sont conservées avec leur réponse : c'est ce qui permet de
          comprendre après coup pourquoi une action a été prise. Une pastille verte signale un outil
          qui a <em>modifié</em> quelque chose ; les autres n'ont fait que lire.
        </p>

        <JournalAudit />

        <SauvegardeBase />
      </div>
    </div>
  );
}
