import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import LecteurEcran from "@/components/monitoring/LecteurEcran";

// Suivi > Appels > Retours (16 oct. 2026, Jules) : ce que les analystes
// répondent aux questions d'AK. AK surveille le journal des appels : un appel
// corrigé, pas validé, validé sans appel ou validé trop lentement (au-delà de
// 2 minutes) donne une question, posée dans le Dashboard de l'analyste avec son
// écran rejoué. Ici, Jules lit les réponses, voit ce qui revient, et fait
// la synthèse de ce qu'il faut améliorer dans le module. Réservé à Jules.

const etiq = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const prenom = (email) => { const p = String(email || "").split("@")[0].split(".")[0]; return p ? p.charAt(0).toUpperCase() + p.slice(1) : "?"; };
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const ETATS = { ouverte: ["Sans réponse", "text-ambre"], repondue: ["Répondue", "text-menthe"], obsolete: ["Plus d'actualité", "text-brume"] };
const filtre = (actif) => `px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${actif ? "border-menthe text-menthe bg-menthe/[0.1]" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`;

function Ligne({ q }) {
  const [ouvert, setOuvert] = useState(false);
  const [ecran, setEcran] = useState(false);
  const [mot, ton] = ETATS[q.etat] || [q.etat, "text-brume"];
  const reponses = q.questions.filter((x) => x.reponse).length;
  return (
    <div className="border-t border-trait first:border-t-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="grid w-full grid-cols-[110px_90px_minmax(0,1fr)_minmax(0,1.2fr)_110px_16px] items-center gap-3 px-1 py-3 text-left text-[13px] max-md:grid-cols-[minmax(0,1fr)_16px] max-md:gap-y-1" style={{ background: "transparent" }}>
        <span className="tabular-nums text-ardoise max-md:order-2 max-md:col-span-2">{quand(q.le_appel)}</span>
        <span className="text-encre max-md:hidden">{prenom(q.par)}</span>
        <span className="truncate text-craie max-md:order-1"><span className="md:hidden">{prenom(q.par)} · </span>{q.agence || q.agent || "Appel"}</span>
        <span className="flex flex-wrap gap-1.5 max-md:order-3 max-md:col-span-2">{q.motifs_libelles.map((m) => <span key={m} className="rounded-full border border-trait px-2 py-0.5 text-[11.5px] text-craie">{m}</span>)}</span>
        <span className={`${ton} max-md:order-4 max-md:col-span-2`}>{mot}{q.etat === "ouverte" && reponses ? ` · ${reponses}/${q.questions.length}` : ""}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform max-md:order-1 ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 px-1 pb-5 max-md:grid-cols-1">
          <div>
            {q.resume && <p className="m-0 mb-3 text-[14px] leading-[1.55] text-encre">{q.resume}</p>}
            <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Ce que l'analyste a fait</p>
            <ul className="m-0 mt-1.5 list-none p-0">
              {q.chronologie.map((e, k) => <li key={k} className="border-t border-trait py-1.5 text-[13px] leading-[1.45] first:border-t-0"><span className="text-encre">{e.quoi}</span>{e.detail ? <span className="text-ardoise"> · {e.detail}</span> : null}</li>)}
            </ul>
            {q.ecran?.present
              ? <button type="button" onClick={() => setEcran(true)} className="mt-3 inline-flex h-9 items-center rounded-full border border-bord-doux px-4 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Voir son écran{q.ecran.duree_s ? ` (${Math.max(1, Math.round(q.ecran.duree_s / 60))} min)` : ""}</button>
              : <p className="m-0 mt-3 text-[12.5px] text-brume">{q.ecran ? "L'enregistrement de cet appel n'est plus sur le serveur." : "Pas d'enregistrement d'écran (il part avec la validation, et il s'efface après 30 jours)."}</p>}
            {ecran && <LecteurEcran url={`/api/questions-appels/${q.id}/ecran`} titre={`Écran de ${prenom(q.par)} · ${q.agence || q.agent || "appel"}`} onFermer={() => setEcran(false)} />}
          </div>
          <div>
            <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Questions et réponses</p>
            {q.questions.map((x) => (
              <div key={x.id} className="mt-2.5">
                <p className="m-0 text-[13.5px] leading-[1.5] text-ardoise">{x.texte}</p>
                {x.reponse
                  ? <p className="m-0 mt-1 whitespace-pre-line text-[14px] leading-[1.55] text-encre"><span className="text-menthe">{prenom(q.par)} · </span>{x.reponse}<span className="text-brume"> · {quand(x.repondue_le)}</span></p>
                  : <p className="m-0 mt-1 text-[13px] text-ambre">Pas encore de réponse.</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Synthese({ s, peut }) {
  const qc = useQueryClient();
  const faire = useMutation({
    mutationFn: () => base44.request("POST", "/api/monitoring/questions-appels/synthese", { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retours-analystes"] }),
    onError: (e) => toast.error(e?.message || "La synthèse n'a pas pris."),
  });
  return (
    <div className="mb-6 rounded-md border border-trait p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className={`${etiq} !mb-0`}>Ce qui revient, et ce qu'il faut améliorer</p>
        <button type="button" onClick={() => faire.mutate()} disabled={!peut || faire.isPending} className="inline-flex h-8 items-center gap-2 rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {faire.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{s ? "Refaire la synthèse" : "Faire la synthèse"}
        </button>
      </div>
      {!s ? <p className="m-0 text-[13px] text-brume">{peut ? "AK lit toutes les réponses et en tire ce qui revient et ce qu'il faut changer dans le module d'appel." : "Aucune réponse à lire encore : la synthèse viendra avec les premières réponses."}</p> : (
        <>
          <p className="m-0 mb-3 text-[12px] text-brume">Faite le {quand(s.genere_le)} sur {s.n_reponses} réponse{s.n_reponses > 1 ? "s" : ""}{s.a_jour ? "" : " · de nouvelles réponses sont arrivées depuis"}.</p>
          <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
            <div>
              <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Ce qui revient</p>
              <ul className="m-0 mt-1.5 list-none p-0">
                {s.themes.map((t, k) => (
                  <li key={k} className="border-t border-trait py-2 first:border-t-0">
                    <div className="flex items-baseline justify-between gap-3"><span className="text-[14px] text-encre">{t.theme}</span><span className="flex-none rounded-full bg-relief px-2 py-0.5 text-[11.5px] tabular-nums text-craie">{t.fois} fois</span></div>
                    {(t.exemples || []).map((e, i) => <p key={i} className="m-0 mt-0.5 text-[12.5px] text-ardoise">« {e} »</p>)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">À améliorer dans le module</p>
              <ol className="m-0 mt-1.5 list-none p-0">
                {s.ameliorations.map((a, k) => (
                  <li key={k} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 border-t border-trait py-2 first:border-t-0">
                    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-menthe/[0.14] text-[11px] tabular-nums text-menthe">{k + 1}</span>
                    <span><span className="block text-[14px] text-encre">{a.quoi}</span><span className="block text-[12.5px] text-ardoise">{a.pourquoi}</span></span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function RetoursAnalystes({ jours = 30 }) {
  const [motif, setMotif] = useState("tous");
  const [etat, setEtat] = useState("tous");
  const { data, isLoading, error } = useQuery({ queryKey: ["retours-analystes", jours], queryFn: () => base44.request("GET", `/api/monitoring/questions-appels?jours=${Math.min(jours, 90)}`), refetchOnWindowFocus: true });
  if (error) return <p className="m-0 text-[13.5px] text-ardoise">{error.message || "Réservé à Jules."}</p>;
  if (isLoading || !data) return <Chargement taille="grand" />;
  const taux = data.par_motif.reduce((t, m) => t + m.questions, 0);
  const faites = data.par_motif.reduce((t, m) => t + m.repondues, 0);
  const liste = data.questions.filter((q) => (motif === "tous" || q.motifs.includes(motif)) && (etat === "tous" || q.etat === etat));
  return (
    <div>
      <p className="m-0 mb-5 max-w-[760px] text-[13.5px] leading-[1.6] text-ardoise">
        AK surveille le journal des appels. Un appel corrigé, pas validé au bout d'une heure, validé sans appel (moins de 15 secondes, ni enregistrement ni notes) ou validé plus de {Math.round(data.seuil_validation_s / 60)} minutes après le raccrochage donne une question, posée à l'analyste sur sa page Haka avec son écran rejoué. Ses réponses arrivent ici.
      </p>

      <div className="mb-6 grid grid-cols-5 gap-3 max-md:grid-cols-2">
        {data.par_motif.map((m) => (
          <button key={m.motif} type="button" onClick={() => setMotif(motif === m.motif ? "tous" : m.motif)} className={`rounded-md border px-4 py-3.5 text-left transition-colors ${motif === m.motif ? "border-menthe bg-menthe/[0.06]" : "border-trait bg-surface hover:border-bord-vif"}`}>
            <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{m.libelle}</p>
            <p className="m-0 mt-2 text-[24px] font-light tabular-nums text-encre">{m.appels}<span className="ml-1.5 text-[13px] text-brume">appel{m.appels > 1 ? "s" : ""}</span></p>
            <p className="m-0 mt-0.5 text-[12px] text-brume">{m.repondues} réponse{m.repondues > 1 ? "s" : ""} sur {m.questions}</p>
          </button>
        ))}
        <div className="rounded-md border border-trait bg-surface px-4 py-3.5">
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">Réponses</p>
          <p className="m-0 mt-2 text-[24px] font-light tabular-nums text-encre">{taux ? `${Math.round((faites / taux) * 100)} %` : "—"}</p>
          <p className="m-0 mt-0.5 text-[12px] text-brume">{faites} sur {taux} questions</p>
        </div>
      </div>

      <Synthese s={data.synthese} peut={faites > 0} />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[["tous", "Toutes"], ["ouverte", "Sans réponse"], ["repondue", "Répondues"]].map(([k, mot]) => <button key={k} type="button" onClick={() => setEtat(k)} className={filtre(etat === k)}>{mot}</button>)}
        {motif !== "tous" && <button type="button" onClick={() => setMotif("tous")} className={filtre(true)}>{data.par_motif.find((m) => m.motif === motif)?.libelle} ×</button>}
        <span className="ml-auto text-[12.5px] text-brume">{liste.length} appel{liste.length > 1 ? "s" : ""}</span>
      </div>
      <div className="rounded-md border border-trait px-3">
        {liste.map((q) => <Ligne key={q.id} q={q} />)}
        {!liste.length && <p className="m-0 py-8 text-center text-[13px] text-brume">{data.total ? "Aucune question ne correspond." : "Aucune question pour l'instant : AK n'a rien relevé dans le journal des appels."}</p>}
      </div>
    </div>
  );
}
