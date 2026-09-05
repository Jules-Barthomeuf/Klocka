import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, RotateCcw } from "lucide-react";

// Architecture B — la fiche. Un seul objet, le bien : une fiche par blocs,
// une valeur retenue par champ, une pastille, un nombre de preuves. Le clic
// déplie les preuves ; la frise place les faits datés sur le temps ; le
// bandeau dit ce qui coince. On lit la fiche comme un dossier d'instruction.

const TEINTE = { coherent: "#7fd1a8", contradictoire: "#e8927c", manquant: "#e8b04c", hors_critere: "#c39bd3", a_verifier: "#8fb6e8" };
const LIBELLE = { coherent: "Cohérent", contradictoire: "Contradictoire", manquant: "Manquant", hors_critere: "Hors critère", a_verifier: "À vérifier" };

function Pastille({ statut, titre }) {
  return <span title={titre || LIBELLE[statut]} className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: TEINTE[statut] || "#3a3f4a" }} />;
}

// --- Le bandeau d'alertes ----------------------------------------------------------
function Bandeau({ fiche, onAller }) {
  const a = fiche.alertes;
  const items = [
    ["contradictoire", a.contradictoires, "contradictoire"],
    ["manquant", a.manquants, "manquant"],
    ["hors_critere", a.hors_critere, "hors critère"],
    ["a_verifier", a.a_verifier, "à vérifier"],
  ].filter(([, ids]) => ids.length);
  const champs = new Map(fiche.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  if (!items.length) return <p className="m-0 mb-5 text-[13px] text-[#7fd1a8]">Aucune alerte : les pièces concordent sur tous les champs de la fiche.</p>;
  return (
    <div className="mb-6 rounded-xl border border-[#22262d] bg-[#0f1114] px-5 py-4">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {items.map(([statut, ids, mot]) => (
          <div key={statut} className="min-w-0">
            <p className="m-0 text-[11px] tracking-[.14em] uppercase font-semibold flex items-center gap-2" style={{ color: TEINTE[statut] }}>
              <Pastille statut={statut} /> {ids.length} {mot}{ids.length > 1 && mot !== "hors critère" ? "s" : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ids.map((id) => (
                <button key={id} onClick={() => onAller(id)} className="text-[12px] px-2.5 py-0.5 rounded-full border border-[#2c3139] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]">
                  {champs.get(id)?.libelle || id}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {fiche.tensions.length > 0 && (
        <p className="m-0 mt-3 text-[12.5px] text-[#e8927c]">
          Dates en tension : {fiche.tensions.map((t) => `${t.libelle} (${t.annees.join(" / ")})`).join(" · ")} — voir la frise.
        </p>
      )}
    </div>
  );
}

// --- Un champ de la fiche -------------------------------------------------------------
function Champ({ champ, dealId, ouvert, onOuvrir, onPreuve }) {
  const queryClient = useQueryClient();
  const [libre, setLibre] = useState("");
  const forcer = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/forcer/${champ.id}`, { body: corps }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fiche", dealId] }); setLibre(""); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const n = champ.preuves.length;
  return (
    <div id={`champ-${champ.id}`} className={`border-b border-[#1e1e22] last:border-b-0 ${ouvert ? "bg-[#f2f3f5]/[0.02]" : ""}`}>
      <button onClick={onOuvrir} className="w-full text-left grid grid-cols-[180px_1fr_auto] max-md:grid-cols-1 gap-x-5 gap-y-1 items-start px-4 py-3 hover:bg-[#f2f3f5]/[0.02]">
        <span className="text-[12.5px] text-[#9298a6] pt-px flex items-center gap-2.5">
          <Pastille statut={champ.statut} titre={`${LIBELLE[champ.statut]} — ${champ.detail}`} />
          {champ.libelle}
        </span>
        <span className={`text-[14px] leading-[1.55] ${champ.valeur ? "text-[#f2f3f5]" : "text-[#4d545d] italic"} ${ouvert ? "" : "line-clamp-2"}`}>
          {champ.valeur || (champ.statut === "hors_critere" ? "Non fourni — hors critère" : "Aucune pièce ne le dit")}
        </span>
        <span className="text-[11.5px] text-[#6a7180] whitespace-nowrap flex items-center gap-2 justify-end">
          {champ.forcage ? <span className="text-[#d9b46a]">retenu à la main</span> : champ.source === "annonce" ? <span className="text-[#8fb6e8]">annonce seule</span> : null}
          {n ? `${n} source${n > 1 ? "s" : ""}` : "0 source"}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${ouvert ? "" : "-rotate-90"}`} />
        </span>
      </button>
      {ouvert && (
        <div className="px-4 pb-4 md:pl-[220px] space-y-3">
          <p className="m-0 text-[12px] text-[#6a7180]">{champ.question} · <span style={{ color: TEINTE[champ.statut] }}>{LIBELLE[champ.statut]}</span> — {champ.detail}</p>
          {champ.preuves.map((p) => {
            const retenue = champ.forcage?.document_id ? champ.forcage.document_id === p.document_id : !champ.forcage?.valeur && champ.source === p.document_nom;
            return (
              <div key={p.document_id} className={`rounded-lg border px-3.5 py-2.5 ${retenue ? "border-[#96c0b8]/50" : "border-[#22262d]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button onClick={() => onPreuve(p)} className="text-left text-[12px] text-[#9298a6] hover:text-[#f2f3f5]">
                    <span className="text-[#c9cdd6]">{p.document_nom}</span> · {p.categorie}{p.page ? ` · p.${p.page}` : ""} — voir la page
                  </button>
                  <button onClick={() => forcer.mutate(retenue && champ.forcage ? {} : { document_id: p.document_id })} className={`text-[11.5px] px-2.5 py-0.5 rounded-full border ${retenue ? "border-[#96c0b8] text-[#96c0b8]" : "border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5]"}`}>
                    {retenue ? "Valeur retenue" : "Retenir celle-ci"}
                  </button>
                </div>
                <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-[#e6e7ea]">{p.reponse}</p>
                {p.citation && <p className="m-0 mt-1 text-[12px] italic text-[#6a7180]">« {p.citation} »</p>}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="Ou forcer une valeur à la main…" className="flex-1 min-w-[220px] bg-transparent border border-[#22262d] rounded-lg px-3 py-1.5 text-[13px] text-[#f2f3f5] outline-none focus:border-[#96c0b8]/60" />
            <button onClick={() => forcer.mutate({ valeur: libre })} disabled={!libre.trim() || forcer.isPending} className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full bg-[#f2f3f5] text-[#0b0c0e] font-semibold disabled:opacity-40"><Check className="w-3.5 h-3.5" /> Retenir</button>
            {champ.forcage && <button onClick={() => forcer.mutate({})} className="inline-flex items-center gap-1.5 text-[12px] text-[#9298a6] hover:text-[#f2f3f5] px-2"><RotateCcw className="w-3.5 h-3.5" /> Revenir à la règle</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// --- La frise ------------------------------------------------------------------------------
export function Frise({ fiche, onPreuve }) {
  if (!fiche.frise.length) return <p className="m-0 text-[13.5px] text-[#9298a6]">Aucune date relevée dans les pièces pour l'instant.</p>;
  const tendus = new Set(fiche.tensions.map((t) => t.champ));
  const parAnnee = [];
  for (const e of fiche.frise) {
    const an = e.iso.slice(0, 4);
    let g = parAnnee[parAnnee.length - 1];
    if (!g || g.an !== an) { g = { an, evts: [] }; parAnnee.push(g); }
    g.evts.push(e);
  }
  const auj = new Date().toISOString().slice(0, 10);
  return (
    <div className="relative pl-6">
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-[#2c3139]" />
      {parAnnee.map((g) => (
        <div key={g.an} className="mb-6">
          <p className={`m-0 mb-2 -ml-6 text-[11px] tracking-[.16em] uppercase font-semibold flex items-center gap-3 ${g.an > auj.slice(0, 4) ? "text-[#8fb6e8]" : "text-[#9298a6]"}`}>
            <span className="w-[15px] h-[15px] rounded-full border-2 border-[#0f0f11] flex-none" style={{ background: g.an > auj.slice(0, 4) ? "#8fb6e8" : "#6a7180" }} /> {g.an}{g.an === auj.slice(0, 4) ? " · cette année" : ""}
          </p>
          <div className="space-y-2">
            {g.evts.map((e, i) => (
              <button key={i} onClick={() => onPreuve(e)} className={`block w-full text-left rounded-lg border px-4 py-2.5 hover:border-[#3a3f4a] ${tendus.has(e.champ) ? "border-[#e8927c]/50" : "border-[#1e1e22]"}`}>
                <span className="text-[12px] tabular-nums text-[#9298a6]">{e.iso.split("-").reverse().join("/")}</span>
                <span className="text-[13.5px] text-[#f2f3f5] ml-3">{e.libelle}</span>
                <span className="text-[12px] text-[#6a7180] ml-2">· {e.document_nom}{e.page ? ` · p.${e.page}` : ""}</span>
                <span className="block mt-0.5 text-[12.5px] text-[#9298a6] line-clamp-1">{e.reponse}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- La fiche -------------------------------------------------------------------------------
export default function FicheDossier({ dealId, onPreuve, questionsLibres }) {
  const [ouvert, setOuvert] = useState(null);
  const { data: fiche, isLoading } = useQuery({
    queryKey: ["fiche", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice/fiche`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  });
  const aller = (id) => { setOuvert(id); requestAnimationFrame(() => document.getElementById(`champ-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); };
  const nbChamps = useMemo(() => fiche?.blocs.reduce((n, b) => n + b.champs.length, 0) || 0, [fiche]);
  if (isLoading || !fiche) return <Loader2 className="w-5 h-5 animate-spin text-[#9298a6]" />;
  if (!fiche.nb_documents) return <p className="m-0 text-[13.5px] text-[#9298a6]">Importez les documents puis « Remplir la grille » : la fiche se remplit à partir des pièces.</p>;
  return (
    <div>
      <Bandeau fiche={fiche} onAller={aller} />
      <p className="m-0 mb-3 text-[12.5px] text-[#77777e]">{nbChamps} champs · {fiche.nb_documents} pièce{fiche.nb_documents > 1 ? "s" : ""} · la valeur retenue vient de la pièce la plus autoritaire (l'acte prime sur le bail, le bail sur le PV) sauf choix contraire.</p>
      <div className="space-y-5">
        {fiche.blocs.map((b) => (
          <section key={b.nom} className="border border-[#1e1e22] rounded-xl overflow-hidden">
            <p className="m-0 px-4 py-2 text-[10.5px] tracking-[.16em] uppercase text-[#77777e] bg-[#0f0f11] border-b border-[#1e1e22]">{b.nom}</p>
            {b.champs.map((c) => (
              <Champ key={c.id} champ={c} dealId={dealId} ouvert={ouvert === c.id} onOuvrir={() => setOuvert(ouvert === c.id ? null : c.id)} onPreuve={onPreuve} />
            ))}
          </section>
        ))}
        {questionsLibres}
      </div>
    </div>
  );
}
