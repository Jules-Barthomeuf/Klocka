import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";
import Chargement from "@/components/ui/Chargement";

// Suivi > Haka (17 oct. 2026, Jules : « mesure le coût réel par dossier et
// affiche-le dans le Suivi ») : ce que Haka a coûté par tâche, ce qui a été
// validé, modifié, rejeté, et pourquoi.

const PERIODES = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"]];
const euros = (usd) => (usd == null ? "—" : `${(usd * 0.92).toFixed(usd < 1 ? 3 : 2).replace(".", ",")} €`);
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ETATS = { en_attente: "en attente", en_cours: "en cours", en_attente_validation: "à valider", faite: "faite", differee: "différée", echec: "échec", annulee: "annulée", en_pause: "en pause" };
const filtre = (actif) => `px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${actif ? "border-menthe text-menthe bg-menthe/[0.1]" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`;

export default function SuiviHaka() {
  const [jours, setJours] = useState(30);
  const q = useQuery({ queryKey: ["haka-suivi", jours], queryFn: () => base44.request("GET", `/api/monitoring/haka?jours=${jours}`), refetchOnWindowFocus: true, retry: false });
  const d = q.data;
  const b = d?.bilan;
  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <OngletsSuivi className="mb-3.5" />
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">L'Assistant KPartners</h1>
          </div>
          <div className="flex flex-wrap gap-1.5 md:pr-14">{PERIODES.map(([j, mot]) => <button key={j} type="button" onClick={() => setJours(j)} className={filtre(jours === j)}>{mot}</button>)}</div>
        </div>
        {q.isLoading || !d ? <Chargement taille="grand" /> : (
          <>
            {!d.file && <p className="m-0 mb-6 rounded-[14px] border border-trait px-4 py-3 text-[13.5px] text-ardoise">L'Assistant KPartners n'est pas allumé ici (HAKA_FILE). {d.fiches ? "" : "La compétence « fiche reçue » non plus (HAKA_FICHES)."}</p>}
            <div className="mb-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[
                [b.taches, "tâches lancées"], [euros(b.cout_median_usd), "coût médian par tâche"], [euros(b.cout_total_usd), "coût total"],
                [b.taux_rejet == null ? "—" : `${b.taux_rejet} %`, "rejetées, sur les décisions"],
              ].map(([n, mot]) => (
                <div key={mot} className="rounded-[16px] border border-trait bg-surface px-4 py-3">
                  <p className="m-0 text-[24px] leading-none tabular-nums text-encre">{n}</p>
                  <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">{mot}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <section className="rounded-[16px] border border-trait p-4">
                <p className="m-0 mb-3 text-[11px] uppercase tracking-[.16em] text-menthe">Propositions</p>
                <ul className="m-0 list-none p-0 text-[13.5px]">
                  {Object.entries(b.par_etat || {}).map(([k, n]) => <li key={k} className="flex justify-between border-t border-trait py-1.5 first:border-t-0"><span className="text-craie">{k}</span><span className="tabular-nums text-encre">{n}</span></li>)}
                  {!Object.keys(b.par_etat || {}).length && <li className="py-2 text-brume">Aucune proposition sur la période.</li>}
                </ul>
                {b.taux_modification != null && <p className="m-0 mt-3 text-[12.5px] text-ardoise">{b.taux_modification} % des validations retouchées avant d'être envoyées.</p>}
              </section>
              <section className="rounded-[16px] border border-trait p-4">
                <p className="m-0 mb-3 text-[11px] uppercase tracking-[.16em] text-menthe">Motifs de rejet</p>
                <ul className="m-0 list-none p-0 text-[13.5px]">
                  {(b.motifs || []).map((m) => <li key={m.motif} className="flex justify-between gap-3 border-t border-trait py-1.5 first:border-t-0"><span className="min-w-0 truncate text-craie">{m.motif}</span><span className="tabular-nums text-encre">{m.n}</span></li>)}
                  {!(b.motifs || []).length && <li className="py-2 text-brume">Aucun rejet.</li>}
                </ul>
              </section>
            </div>
            <section className="mt-6 overflow-x-auto rounded-[16px] border border-trait">
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                <thead><tr className="text-[11px] uppercase tracking-[.14em] text-brume">
                  {["Quand", "Compétence", "Pas", "État", "Pour", "Coût"].map((h) => <th key={h} className="border-b border-trait px-4 py-3 font-normal">{h}</th>)}
                </tr></thead>
                <tbody>
                  {(d.recentes || []).map((t) => (
                    <tr key={t.id} className="border-b border-trait last:border-b-0">
                      <td className="px-4 py-2.5 text-ardoise">{quand(t.cree_le)}</td>
                      <td className="px-4 py-2.5 text-encre">{t.competence} <span className="text-brume">v{t.version}</span></td>
                      <td className="px-4 py-2.5 text-craie">{t.etape || "—"}</td>
                      <td className={`px-4 py-2.5 ${t.etat === "echec" || t.etat === "en_pause" ? "text-alerte" : t.etat === "faite" ? "text-menthe" : "text-craie"}`}>{ETATS[t.etat] || t.etat}</td>
                      <td className="px-4 py-2.5 text-ardoise">{t.pour ? t.pour.split("@")[0] : "commun"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-encre">{euros(t.cout_usd)}</td>
                    </tr>
                  ))}
                  {!(d.recentes || []).length && <tr><td colSpan={6} className="px-4 py-6 text-center text-brume">Aucune tâche encore.</td></tr>}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
