import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { FenetreSource, TYPES, TEINTES, quand } from "@/components/layer/FriseFaits";

// Ce que l'Intelligence sait (le Layer, phase 6, 15 oct. 2026) : les briques
// d'écran des branchements. Toutes lisent les mêmes routes, qui appellent la
// même fonction serveur (`ficheLayer`, server/layer-syntheses.js).
//
//   CeQueKlockaSait   une fiche (agent, agence, dossier, investisseur, ville) :
//                     sa synthèse (chaque ligne déplie ses faits, un fait ouvre
//                     sa source), ses engagements ouverts ou échus
//   DejaSu            un lot de pré-analyse : ce qu'on sait déjà de l'enseigne,
//                     de la ville, de l'agent
//   InvestisseurLayer le matching : les faits d'un investisseur (par son adresse)
//   JourneeLayer      Ma journée : engagements du jour, faits à valider, questions

const RUBRIQUES = { qui_quoi: "Qui / quoi", situation: "Situation", decisions: "Décisions", engagements: "Engagements", vigilance: "Vigilance", dernier_contact: "Dernier contact" };
const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";

function LigneSynthese({ l, faits, onSource }) {
  const [ouverte, setOuverte] = useState(false);
  const siens = l.faits.map((id) => faits.find((f) => f.id === id)).filter(Boolean);
  return (
    <li className="border-t border-trait py-2 first:border-t-0">
      <button type="button" onClick={() => setOuverte((v) => !v)} aria-expanded={ouverte} className="grid w-full grid-cols-[110px_minmax(0,1fr)_14px] items-baseline gap-3 p-0 text-left text-[13.5px]" style={{ background: "transparent" }} title="Voir les faits de cette ligne">
        <span className="text-[11.5px] text-brume">{RUBRIQUES[l.rubrique] || l.rubrique}</span>
        <span className="text-craie">{l.texte}</span>
        <ChevronDown className={`h-3.5 w-3.5 self-center text-brume transition-transform ${ouverte ? "rotate-180" : ""}`} />
      </button>
      {ouverte && (
        <ul className="m-0 mt-1.5 list-none pl-[122px] max-md:pl-0">
          {siens.length ? siens.map((f) => (
            <li key={f.id} className="py-0.5 text-[12.5px] text-ardoise">
              <span className={`mr-1.5 text-[10.5px] uppercase tracking-[.12em] ${TEINTES[f.type] || "text-craie"}`}>{TYPES[f.type] || f.type}</span>
              {f.resume} · {quand(f.date)}
              {f.source_id && <button type="button" onClick={() => onSource(f.source_id)} className="ml-1.5 p-0 text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>source</button>}
            </li>
          )) : <li className="text-[12.5px] text-brume">Faits plus anciens que les derniers affichés : voir la frise.</li>}
        </ul>
      )}
    </li>
  );
}

function Engagements({ engagements }) {
  const qc = useQueryClient();
  const tenir = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/layer/engagements/${id}`, { body: { statut: "tenu" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["layer"] }),
  });
  if (!engagements?.length) return null;
  return (
    <ul className="m-0 mt-1 list-none p-0">
      {engagements.map((e) => {
        const retard = e.statut_engagement === "echu";
        return (
          <li key={e.id} className="flex items-baseline justify-between gap-3 border-t border-trait py-1.5 text-[13px] first:border-t-0">
            <span className={retard ? "text-ambre" : "text-craie"}>{e.resume}{e.echeance ? <span className="text-brume"> · {retard ? "échu le" : "pour le"} {quand(e.echeance)}</span> : null}</span>
            <button type="button" onClick={() => tenir.mutate(e.id)} disabled={tenir.isPending} title="Marquer tenu" aria-label="Marquer l'engagement tenu"
              className="inline-flex h-6 flex-none items-center gap-1 rounded-full border border-trait px-2 text-[11.5px] text-ardoise hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>
              <Check className="h-3 w-3" />Tenu
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Une fiche : synthèse et engagements. `vide` : la phrase quand l'Intelligence ne sait rien (null : ne rien montrer). */
export default function CeQueKlockaSait({ type, id, titre = "Dans l'Intelligence", vide = null, className = "" }) {
  const [source, setSource] = useState(null);
  const q = useQuery({ queryKey: ["layer", "fiche", type, id], queryFn: () => base44.request("GET", `/api/layer/fiches/${type}/${encodeURIComponent(id)}`), enabled: !!id, staleTime: 60000 });
  if (!id) return null;
  if (q.isLoading) return <div className={className}><Loader2 className="h-4 w-4 animate-spin text-ardoise" /></div>;
  const f = q.data;
  if (!f || (!f.total && !f.synthese)) return vide ? <div className={className}><p className={etiq}>{titre}</p><p className="m-0 mt-1 text-[13px] text-brume">{vide}</p></div> : null;
  const faits = f.faits || [];
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={etiq}>{titre}</p>
        {f.synthese && <span className="text-[11.5px] text-brume">synthèse du {quand(f.synthese.genere_le)}{f.synthese.perime ? " · à jour sous une heure" : ""}</span>}
      </div>
      {f.synthese?.lignes?.length ? (
        <ul className="m-0 mt-1.5 list-none p-0">{f.synthese.lignes.map((l, k) => <LigneSynthese key={k} l={l} faits={faits} onSource={setSource} />)}</ul>
      ) : (
        <ul className="m-0 mt-1.5 list-none p-0">
          {faits.map((x) => <li key={x.id} className="border-t border-trait py-1.5 text-[13px] text-craie first:border-t-0"><span className={`mr-1.5 text-[10.5px] uppercase tracking-[.12em] ${TEINTES[x.type] || "text-craie"}`}>{TYPES[x.type] || x.type}</span>{x.resume} <span className="text-brume">· {quand(x.date)}</span></li>)}
        </ul>
      )}
      {f.engagements?.length > 0 && (
        <div className="mt-3">
          <p className={etiq}>Engagements ouverts</p>
          <Engagements engagements={f.engagements} />
        </div>
      )}
      {source && <FenetreSource id={source} onFermer={() => setSource(null)} />}
    </div>
  );
}

/** Pré-analyse : ce que Klocka sait déjà, sur l'enseigne, la ville et l'agent du lot. */
export function DejaSu({ dealId, lot = 0, className = "" }) {
  const [source, setSource] = useState(null);
  const q = useQuery({ queryKey: ["layer", "deja-su", dealId, lot], queryFn: () => base44.request("GET", `/api/layer/deja-su/${encodeURIComponent(dealId)}?lot=${lot}`), enabled: !!dealId, staleTime: 5 * 60000 });
  const faits = q.data?.faits || [];
  if (!dealId || q.isLoading || !faits.length) return null;
  return (
    <section className={`rounded-[14px] border border-trait bg-rail px-4 py-3 ${className}`}>
      <p className={etiq}>Ce que Klocka sait déjà</p>
      <ul className="m-0 mt-1.5 list-none p-0">
        {faits.map((f) => (
          <li key={f.id} className="border-t border-trait py-1.5 text-[13px] first:border-t-0">
            <span className={`mr-1.5 text-[10.5px] uppercase tracking-[.12em] ${TEINTES[f.type] || "text-craie"}`}>{TYPES[f.type] || f.type}</span>
            <span className="text-craie">{f.resume}</span>
            <span className="text-brume"> · {quand(f.date)} · par {f.pourquoi}</span>
            {f.source && <button type="button" onClick={() => setSource(f.source.id)} className="ml-1.5 p-0 text-[12.5px] text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>source</button>}
          </li>
        ))}
      </ul>
      {source && <FenetreSource id={source} onFermer={() => setSource(null)} />}
    </section>
  );
}

/** Matching : les faits d'information et de décision rattachés à un investisseur (jamais montrés aux mandataires). */
export function InvestisseurLayer({ email, className = "" }) {
  const q = useQuery({ queryKey: ["layer", "investisseur", email], queryFn: () => base44.request("GET", `/api/layer/investisseurs/${encodeURIComponent(email)}`), enabled: !!email, staleTime: 5 * 60000 });
  const faits = q.data?.faits || [];
  if (!email || !faits.length) return null;
  return (
    <div className={className}>
      <p className={etiq}>Dans l'Intelligence</p>
      <ul className="m-0 mt-1 list-none p-0">
        {faits.map((f) => <li key={f.id} className="py-0.5 text-[13px] text-craie"><span className={`mr-1.5 text-[10.5px] uppercase tracking-[.12em] ${TEINTES[f.type] || "text-craie"}`}>{TYPES[f.type] || f.type}</span>{f.resume} <span className="text-brume">· {quand(f.date)}</span></li>)}
      </ul>
    </div>
  );
}

/** Ma journée : les engagements du jour et en retard, les faits à valider, les questions « pourquoi ? ». */
export function JourneeLayer({ className = "" }) {
  const q = useQuery({ queryKey: ["layer", "journee"], queryFn: () => base44.request("GET", "/api/layer/journee"), staleTime: 60000 });
  const j = q.data;
  if (!j || (!j.engagements.length && !j.a_valider && !j.questions.length)) return null;
  return (
    <section className={`rounded-[14px] border border-trait bg-rail px-4 py-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={etiq}>L'Intelligence, aujourd'hui</p>
        <Link to="/Intelligence" className="text-[12.5px] text-craie underline decoration-trait underline-offset-2 hover:text-encre">
          {[j.a_valider ? `${j.a_valider} fait${j.a_valider > 1 ? "s" : ""} à valider` : null, j.questions.length ? `${j.questions.length} question${j.questions.length > 1 ? "s" : ""} en attente` : null].filter(Boolean).join(" · ") || "Ouvrir"}
        </Link>
      </div>
      {j.engagements.length > 0 && <Engagements engagements={j.engagements} />}
    </section>
  );
}
