import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { Cadre, Chiffre } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";

// Les fiches reçues par analyste (15 nov. 2026, Jules : « on ne sait pas combien on reçoit de fiches, donc on ne peut pas
// savoir ce qu'une modification de la prospection change ; dans le Suivi, pas dans la Prospection »). Le calcul :
// server/prospection/fiches-par-analyste.js. Une fiche se corrige ici d'un geste : pas une fiche, le nombre de biens,
// la personne à qui elle revient.

const VIA = { appel: "Suite à son appel", transfert: "Transférée", boite: "Reçue dans sa boîte", corrige: "Corrigé à la main", spontanee: "Spontanée" };
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");
const champ = "h-8 rounded-[8px] border border-bord bg-transparent px-2 text-[12.5px] text-encre outline-none focus:border-bord-vif";

export default function FichesParAnalyste({ jours }) {
  const queryClient = useQueryClient();
  const cle = ["fiches-analystes", jours];
  const { data, isLoading, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `/api/monitoring/fiches-analystes?jours=${jours}`), placeholderData: (prev) => prev, staleTime: 30_000 });
  const corriger = useMutation({
    mutationFn: ({ id, ...corps }) => base44.request("POST", `/api/monitoring/fiches-analystes/${encodeURIComponent(id)}`, corps),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fiches-analystes"] }),
    onError: (e) => toast.error(e?.message || "Correction refusée"),
  });
  const [toutes, setToutes] = useState(false);
  if (error) return <p className="m-0 py-8 text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p>;
  if (isLoading || !data) return <Chargement />;
  const t = data.total;
  const taux = t.appels ? Math.round((t.biens_appel / t.appels) * 1000) / 10 : null;
  const max = Math.max(1, ...data.semaines.map((s) => s.biens));
  const fiches = toutes ? data.fiches : data.fiches.slice(0, 30);
  const equipe = data.analystes.map((a) => [a.email, a.prenom]);

  return (
    <div className="k-monte flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Chiffre valeur={t.biens} libelle="Biens reçus" note={t.ecartees ? `${t.ecartees} écartée${t.ecartees > 1 ? "s" : ""} à la main` : null} />
        <Chiffre valeur={t.biens_appel} libelle="Suite à un appel" note={`dans les ${data.fenetre_jours} jours après l'appel`} />
        <Chiffre valeur={taux == null ? "—" : `${String(taux).replace(".", ",")}`} libelle="Pour 100 appels" note={`${t.appels} appel${t.appels > 1 ? "s" : ""} sur la période`} />
        <Chiffre valeur={t.biens_spontanes} libelle="Spontanés" note={t.biens_transfert ? `${t.biens_transfert} transféré${t.biens_transfert > 1 ? "s" : ""} sans appel` : "sans appel ni transfert"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Cadre titre="Par analyste" aide="Un bien revient à qui a appelé son agent dans les 60 jours d'avant ; sinon à qui a transféré la fiche à sourcing@.">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-bord text-[12px] text-brume">
                <th className="py-2 pr-2 text-left font-normal">Analyste</th>
                <th className="px-2 py-2 text-right font-normal">Appels</th>
                <th className="px-2 py-2 text-right font-normal">Suite à un appel</th>
                <th className="px-2 py-2 text-right font-normal">Pour 100 appels</th>
                <th className="py-2 pl-2 text-right font-normal">Transférés</th>
              </tr>
            </thead>
            <tbody>
              {data.analystes.map((a) => (
                <tr key={a.email} className="border-b border-trait">
                  <td className="py-2.5 pr-2 text-encre">{a.prenom}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.appels}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-encre">{a.biens_appel}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.pour_100_appels == null ? "—" : String(a.pour_100_appels).replace(".", ",")}</td>
                  <td className="py-2.5 pl-2 text-right tabular-nums text-craie">{a.biens_transfert}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cadre>

        <Cadre titre="Semaine par semaine" aide="Un changement de l'écran d'appel se juge sur quatre semaines : une seule ne prouve rien.">
          <div className="flex flex-col gap-2">
            {data.semaines.map((s) => (
              <div key={s.semaine} className="grid grid-cols-[64px_minmax(0,1fr)_120px] items-center gap-3 text-[12.5px]">
                <span className="tabular-nums text-ardoise">{jourCourt(`${s.semaine}T12:00:00Z`)}</span>
                <span className="block h-2 overflow-hidden rounded-full bg-trait">
                  <span className="block h-full rounded-full bg-menthe/40" style={{ width: `${(s.biens / max) * 100}%` }}>
                    <span className="block h-full rounded-full bg-menthe" style={{ width: s.biens ? `${(s.biens_appel / s.biens) * 100}%` : 0 }} />
                  </span>
                </span>
                <span className="text-right tabular-nums text-craie">{s.biens_appel}/{s.biens} · {s.appels} appels</span>
              </div>
            ))}
          </div>
          <p className="m-0 mt-3 text-[12px] text-brume">Plein : biens suite à un appel. Clair : tous les biens reçus.</p>
        </Cadre>
      </div>

      <Cadre titre="Les fiches" aide="Corrigez ce que le compte automatique a mal vu : ce n'est pas une fiche, le nombre de biens, la personne." droite={<span className="text-[12px] text-brume">{data.fiches.length} fiche{data.fiches.length > 1 ? "s" : ""}</span>}>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_72px_150px_150px_110px] gap-3 border-b border-bord py-2 text-[12px] text-brume">
              <span>Reçue</span><span>Fiche</span><span>Agent</span><span>Biens</span><span>Revient à</span><span>Pourquoi</span><span />
            </div>
            {fiches.map((f) => (
              <div key={f.id} className={`grid grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_72px_150px_150px_110px] items-center gap-3 border-b border-trait py-2 text-[13px] ${f.ecartee ? "opacity-50" : ""}`}>
                <span className="tabular-nums text-ardoise">{jourCourt(f.le)}</span>
                <span className="min-w-0 truncate text-encre" title={f.titre}>{f.titre}{f.ville ? <span className="text-brume"> · {f.ville}</span> : null}</span>
                <span className="min-w-0 truncate text-craie" title={f.agent_email || ""}>{f.agent || f.agent_email || "Agent inconnu"}</span>
                <select aria-label="Nombre de biens" value={f.biens} disabled={f.ecartee || corriger.isPending} onChange={(e) => corriger.mutate({ id: f.id, biens: Number(e.target.value) })} className={champ}>
                  {Array.from({ length: Math.max(11, f.biens + 1) }, (_, n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <select aria-label="Revient à" value={f.analyste || "personne"} disabled={f.ecartee || corriger.isPending} onChange={(e) => corriger.mutate({ id: f.id, analyste: e.target.value })} className={champ}>
                  <option value="personne">Personne</option>
                  {equipe.map(([email, prenom]) => <option key={email} value={email}>{prenom}</option>)}
                </select>
                <span className="min-w-0 truncate text-ardoise" title={f.appel_le ? `Appel du ${jourCourt(f.appel_le)}` : ""}>{VIA[f.via] || f.via}{f.appel_le ? ` · ${jourCourt(f.appel_le)}` : ""}</span>
                <button type="button" disabled={corriger.isPending} onClick={() => corriger.mutate({ id: f.id, pas_fiche: !f.ecartee })}
                  className="h-8 rounded-full border border-bord-doux px-3 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
                  {f.ecartee ? "Remettre" : "Pas une fiche"}
                </button>
              </div>
            ))}
            {!data.fiches.length && <p className="m-0 py-8 text-center text-[13px] text-brume">Aucune fiche reçue sur la période.</p>}
          </div>
        </div>
        {data.fiches.length > 30 && <button type="button" onClick={() => setToutes(!toutes)} className="mt-3 p-0 text-[13px] text-menthe underline-offset-4 hover:underline" style={{ background: "transparent" }}>{toutes ? "Voir moins" : `Voir les ${data.fiches.length}`}</button>}
      </Cadre>
    </div>
  );
}
