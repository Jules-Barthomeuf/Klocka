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
    mutationFn: ({ id, ...corps }) => base44.request("POST", `/api/monitoring/fiches-analystes/${encodeURIComponent(id)}`, { body: corps }),
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
  // Une ligne est un envoi (un mail, un dépôt) ; elle porte ses fiches (un PDF de quatre en porte quatre).
  const nbFiches = data.fiches.reduce((n, f) => n + (f.ecartee ? 0 : f.biens), 0);
  const equipe = data.analystes.map((a) => [a.email, a.prenom]);

  const pct = (n, sur) => (sur ? `${Math.round((n / sur) * 100)} %` : "—");
  const virgule = (x) => (x == null ? "—" : String(x).replace(".", ","));
  const ETAPES = [["fiches", "Reçues"], ["dossiers", "Ouvertes en dossier"], ["oui", "Oui (documents demandés)"], ["presente", "Présentées à un client"], ["abouti", "Abouties"]];
  const prenomDe = (e) => (e === "personne" ? "Sans analyste" : data.analystes.find((a) => a.email === e)?.prenom || e.split("@")[0]);
  const record = data.record?.semaine ? `${data.record.biens} bien${data.record.biens > 1 ? "s" : ""} la semaine du ${jourCourt(`${data.record.semaine}T12:00:00Z`)}` : null;
  const cette = data.semaines[data.semaines.length - 1];

  return (
    <div className="k-monte flex flex-col gap-4">
      {/* Les chiffres de tête et les semaines sont en haut de la page Statistiques (ApercuStatistiques, 20 nov. 2026). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Cadre titre="Ce que deviennent les fiches" aide="Chaque fiche de la période, à la dernière étape atteinte : une fiche présentée a eu son Oui.">
          <div className="flex flex-col gap-3">
            {ETAPES.map(([k, mot]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_44px_52px] items-center gap-3 text-[13px]">
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="truncate text-craie">{mot}</span>
                  <span className="block h-2 overflow-hidden rounded-full bg-trait"><span className="block h-full rounded-full bg-menthe" style={{ width: t.fiches ? `${(t[k] / t.fiches) * 100}%` : 0 }} /></span>
                </span>
                <span className="text-right tabular-nums text-encre">{t[k]}</span>
                <span className="text-right tabular-nums text-ardoise">{k === "fiches" ? "" : pct(t[k], t.fiches)}</span>
              </div>
            ))}
          </div>
          <p className="m-0 mt-3 text-[12px] text-brume">{t.sans_analyste ? `${t.sans_analyste} fiche${t.sans_analyste > 1 ? "s" : ""} sans analyste : spontanée${t.sans_analyste > 1 ? "s" : ""}, ni appel ni transfert.` : "Toutes les fiches reviennent à un analyste."}</p>
          {/* Un transfert à sourcing@ qui n'a rien rentré (20 nov. 2026, Jules) : compté quand même, et dit pour être repris. */}
          {t.non_rentrees > 0 && <p className="m-0 mt-1 text-[12px] text-ambre">{t.non_rentrees} fiche{t.non_rentrees > 1 ? "s" : ""} transférée{t.non_rentrees > 1 ? "s" : ""} à sourcing@ sans être rentrée{t.non_rentrees > 1 ? "s" : ""} (ni dossier, ni Mémoire) : marquée{t.non_rentrees > 1 ? "s" : ""} « Pas rentrée » dans la liste.</p>}
        </Cadre>

        <Cadre titre="Par analyste" aide="Un bien revient à qui a appelé son agent dans les 60 jours d'avant ; sinon à qui a transféré la fiche à sourcing@.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-bord text-[12px] text-brume">
                  <th className="py-2 pr-2 text-left font-normal">Analyste</th>
                  <th className="px-2 py-2 text-right font-normal">Appels</th>
                  <th className="px-2 py-2 text-right font-normal">Biens</th>
                  <th className="px-2 py-2 text-right font-normal">Dossiers</th>
                  <th className="px-2 py-2 text-right font-normal">Suite à un appel</th>
                  <th className="px-2 py-2 text-right font-normal">Pour 100 appels</th>
                  <th className="px-2 py-2 text-right font-normal" title="Fiches reçues suite à un appel, pour les appels passés">Fiches / appels</th>
                  <th className="px-2 py-2 text-right font-normal">Transférés</th>
                  <th className="px-2 py-2 text-right font-normal">Oui</th>
                  <th className="py-2 pl-2 text-right font-normal">Présentées</th>
                </tr>
              </thead>
              <tbody>
                {data.analystes.map((a) => (
                  <tr key={a.email} className="border-b border-trait">
                    <td className="py-2.5 pr-2 text-encre">{a.prenom}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.appels}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-encre">{a.biens}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie" title={a.fiches ? `${a.dossiers} dossiers pour ${a.fiches} fiches` : undefined}>{a.fiches ? `${a.dossiers} · ${Math.round((a.dossiers / a.fiches) * 100)} %` : "—"}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.biens_appel}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie">{virgule(a.pour_100_appels)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.fiches_par_appel == null ? "—" : `${virgule(a.fiches_par_appel)} %`}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.biens_transfert}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-craie">{a.fiches ? `${a.oui} · ${a.taux_oui} %` : "—"}</td>
                    <td className="py-2.5 pl-2 text-right tabular-nums text-craie">{a.presente}{a.abouti ? ` · ${a.abouti} aboutie${a.abouti > 1 ? "s" : ""}` : ""}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2.5 pr-2 text-ardoise">Sans analyste</td>
                  <td className="px-2 py-2.5" />
                  <td className="px-2 py-2.5 text-right tabular-nums text-ardoise">{t.biens_spontanes}</td>
                  <td colSpan={7} className="py-2.5 pl-2 text-right text-[12px] text-brume">fiches venues seules</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Cadre>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Classement titre="Les agents qui en envoient le plus" lignes={data.agents} vide="Aucun agent reconnu sur la période." />
        <Classement titre="Les villes" lignes={data.villes} vide="Aucune ville lue sur la période." />
      </div>

      <Cadre titre="Les fiches" aide="Corrigez ce que le compte automatique a mal vu : ce n'est pas une fiche, le nombre de biens, la personne." droite={<span className="text-[12px] text-brume">{nbFiches} fiche{nbFiches > 1 ? "s" : ""} en {data.fiches.length} envoi{data.fiches.length > 1 ? "s" : ""}</span>}>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_72px_150px_150px_110px] gap-3 border-b border-bord py-2 text-[12px] text-brume">
              <span>Reçue</span><span>Fiche</span><span>Agent</span><span>Biens</span><span>Revient à</span><span>Pourquoi</span><span />
            </div>
            {fiches.map((f) => (
              <div key={f.id} className={`grid grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_72px_150px_150px_110px] items-center gap-3 border-b border-trait py-2 text-[13px] ${f.ecartee ? "opacity-50" : ""}`}>
                <span className="tabular-nums text-ardoise">{jourCourt(f.le)}</span>
                <span className="min-w-0 truncate text-encre" title={f.rentree === "non" ? "Transférée à sourcing@, mais ni dossier ni Mémoire : à reprendre" : f.titre}>{f.rentree === "non" && <span className="mr-1.5 text-ambre">Pas rentrée ·</span>}{f.titre}{f.ville ? <span className="text-brume"> · {f.ville}</span> : null}</span>
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

/** Les agents ou les villes qui envoient le plus de biens, avec leurs Oui et l'analyste qui les suit le plus. */
function Classement({ titre, lignes = [], vide }) {
  return (
    <Cadre titre={titre}>
      {lignes.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {lignes.slice(0, 8).map((l) => (
            <li key={l.cle} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-trait py-2 text-[13px] last:border-b-0">
              <span className="min-w-0 truncate text-encre" title={l.nom}>{l.nom}{l.analyste ? <span className="text-brume"> · {l.analyste}</span> : null}</span>
              <span className="tabular-nums text-craie">{l.biens} bien{l.biens > 1 ? "s" : ""}{l.oui ? <span className="text-ardoise"> · {l.oui} Oui</span> : null}</span>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-[13px] text-brume">{vide}</p>}
    </Cadre>
  );
}
