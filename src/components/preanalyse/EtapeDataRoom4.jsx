import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Mono, Section } from "./CadreEtapes";

// Étape 4 — Présentation et closing. La présentation adaptée au profil ciblé
// en trois formats, la timeline de la négociation, les compléments reçus avec
// leur impact, et la conclusion qui range le dossier et nourrit la base marché.

const Titre = ({ children, droite }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <Mono>{children}</Mono>
    {droite ? <span className="text-[12px] text-[#9298a6]">{droite}</span> : null}
  </div>
);
const ACTEUR = { automatique: ["#8fb6e8", "automatique"], analyste: ["#96c0b8", "analyste"], systeme: ["#6a7180", "système"] };
const quand = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

export default function EtapeDataRoom4({ dossier, e, onPreuve, onRefresh, apercu = false, dialog, setDialog }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const [profil, setProfil] = useState(e.presentations[1]?.id || e.presentations[0]?.id);
  const [format, setFormat] = useState("fiche");
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState("");
  const [motif, setMotif] = useState("");
  const conclure = useMutation({
    mutationFn: (etat) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/conclusion`, { body: { etat, motif } }),
    onSuccess: (r) => { toast.success(r.destination); onRefresh?.(); ["etape4", "carte"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] })); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const copier = async (t, quoi) => { try { await navigator.clipboard.writeText(t); toast.success(`${quoi} copié`); } catch { window.prompt("Copiez :", t); } };
  const p = e.presentations.find((x) => x.id === profil) || e.presentations[0];
  const texte = format === "pitch" ? p.pitch.join("\n") : format === "mail" ? p.mail : p.fiche;
  React.useEffect(() => { setBrouillon(texte); }, [texte]);

  return (
    <>
      <p className="m-0 px-6 max-md:px-4 py-4 text-[14px] leading-[1.65] text-[#c9cdd6] border-b border-[#1f2228] max-w-[900px]">Entre la décision de proposer et la signature, le deal évolue : questions de l'investisseur, contre-offres, compléments reçus. Cette étape trace tout et recalcule le prix à chaque nouveau fait.</p>
      <Section id="presentation" titre="1 · Présentation investisseur" droite="Même fiche de deal, présentée selon le profil ciblé">
        <div className="flex gap-6 border-b border-[#1f2228] mb-5">
          {e.presentations.map((x) => <button key={x.id} onClick={() => setProfil(x.id)} className={`relative pb-2.5 text-[14px] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#f2f3f5] after:origin-left after:scale-x-0 after:transition-transform ${profil === x.id ? "text-[#f2f3f5] font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3]"}`}>{x.titre}</button>)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          <div>
            <Mono>Mis en avant pour <span className="normal-case tracking-normal text-[#c9cdd6]">{p.titre}</span></Mono>
            <ul className="m-0 mt-2 p-0 list-none">
              {p.pitch.slice(1).map((l, i) => <li key={i} className="py-3 border-b border-[#15171b] text-[14.5px] text-[#f2f3f5] flex items-start gap-3"><span className="text-[#6a7180] text-[10px] mt-[7px]">▸</span>{l}</li>)}
            </ul>
            <p className="m-0 mt-4 text-[13px] text-[#9298a6]">Ce qui compte : {p.accent} Les risques sont présentés avec leur chiffrage, sans les minorer.</p>
          </div>
          <div>
            <Mono>Format · <span className="normal-case tracking-normal text-[#c9cdd6]">{{ fiche: "Fiche de deal mise en page", mail: "Message court", pitch: "Support de call" }[format]}</span></Mono>
            <div className="mt-2 space-y-2">
              {[["fiche", "PDF", "Fiche de deal mise en page", "Une à deux pages prêtes à joindre à un mail : résumé du bien, risques retenus, prix recommandé, conditions, pour et contre."], ["mail", "Mail", "Message court", "Les points clés dans le corps du mail, la fiche en pièce jointe. Personnalisé avec les critères de l'investisseur."], ["pitch", "Présentation", "Support de call", "Support pour un call ou une réunion : chiffres clés, risques, prix, pour et contre."]].map(([id, tag, t, d]) => (
                <button key={id} onClick={() => setFormat(id)} className={`w-full text-left px-4 py-3 border transition-colors ${format === id ? "border-[#96c0b8]/60" : "border-[#1f2228] hover:border-[#2c3139]"}`}>
                  <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]"><Mono className="mr-2">{tag}</Mono>{t}</p>
                  <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-[#9298a6]">{d}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={() => setEdition((o) => !o)} className="px-4 py-2.5 bg-[#96c0b8] text-[#000000] text-[13.5px] font-semibold hover:bg-[#abd0c8]">{edition ? "Fermer l'édition" : "Générer et ouvrir en édition"}</button>
              <span className="text-[13px] text-[#9298a6]">Le système pré-rédige, l'analyste ajuste et envoie.</span>
            </div>
          </div>
        </div>
        {edition && (
          <div className="mt-5 border border-[#1f2228]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#1f2228]"><Mono>{{ fiche: "Fiche de deal", mail: "Mail", pitch: "Support de call" }[format]} · {p.titre}</Mono><button onClick={() => copier(brouillon, "Le texte")} className="inline-flex items-center gap-1.5 text-[12px] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Copier</button></div>
            <textarea value={brouillon} onChange={(x) => setBrouillon(x.target.value)} rows={Math.min(28, Math.max(8, brouillon.split("\n").length + 1))} className="w-full bg-transparent border-0 outline-none resize-y px-4 py-3 text-[13.5px] leading-[1.7] text-[#f2f3f5] font-[inherit]" />
          </div>
        )}
      </Section>

      {/* La timeline */}
      <div className="px-6 max-md:px-4 py-5 border-b border-[#1f2228]">
        <Titre droite={e.timeline.length ? `du ${quand(e.timeline[0].date)} au ${quand(e.timeline[e.timeline.length - 1].date)}` : null}>2 · Timeline de la négociation</Titre>
        {e.timeline.length ? (
          <ul className="m-0 p-0 list-none relative pl-5">
            <span className="absolute left-[5px] top-1 bottom-1 w-px bg-[#2c3139]" />
            {e.timeline.map((t, i) => { const [c, l] = ACTEUR[t.acteur] || ACTEUR.systeme; return (
              <li key={i} className="relative py-1.5 flex items-baseline gap-3 text-[13px]">
                <span className="absolute -left-5 top-[11px] w-[11px] h-[11px] rounded-full border-2 border-[#000000]" style={{ background: c }} />
                <span className="text-[#9298a6] tabular-nums w-[44px] flex-none">{quand(t.date)}</span>
                <span className="text-[#f2f3f5] min-w-0">{t.libelle}</span>
                <span className="text-[10.5px] tracking-[.12em] uppercase flex-none" style={{ color: c }}>{l}</span>
              </li>
            ); })}
          </ul>
        ) : <p className="m-0 text-[13px] text-[#9298a6]">Rien encore.</p>}
      </div>

      {/* Les compléments reçus */}
      <div className="px-6 max-md:px-4 py-5 border-b border-[#1f2228]">
        <Titre droite={e.complements.depuis ? `depuis le ${quand(e.complements.depuis)} · ${e.complements.pieces.length} pièce${e.complements.pieces.length > 1 ? "s" : ""}` : null}>3 · Compléments reçus</Titre>
        {!e.complements.depuis ? <p className="m-0 text-[13px] text-[#9298a6]">La fiche sera photographiée au passage à l'étape 3 ; les compléments se mesurent contre elle.</p>
          : !e.complements.lignes.length ? <p className="m-0 text-[13px] text-[#9298a6]">{e.complements.pieces.length ? `${e.complements.pieces.join(", ")} — sans changement sur la fiche.` : "Aucun complément depuis l'étape 3."}</p>
          : (
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-[10px] tracking-[.14em] uppercase text-[#6a7180]"><th className="text-left font-normal py-1.5 pr-3">Champ</th><th className="text-left font-normal py-1.5 px-3">Ancienne valeur</th><th className="text-left font-normal py-1.5 px-3">Nouvelle valeur</th><th className="text-left font-normal py-1.5 pl-3">Source</th></tr></thead>
              <tbody>{e.complements.lignes.map((l) => (
                <tr key={l.champ} className="border-t border-[#15171b]">
                  <td className="py-2 pr-3 text-[#c9cdd6]">{l.libelle}</td>
                  <td className="py-2 px-3 text-[#6a7180] line-through">{l.avant || "—"}</td>
                  <td className="py-2 px-3 text-[#f2f3f5]">{l.apres || "—"}</td>
                  <td className="py-2 pl-3 text-[12px] text-[#6a7180]">{l.source || ""}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
      </div>

      {/* La conclusion */}
      <div className="px-6 max-md:px-4 py-5">
        <Titre>4 · Conclusion</Titre>
        {e.conclusion ? (
          <p className="m-0 text-[14px] text-[#f2f3f5]">{{ signe: "Signé", perdu: "Perdu", abandonne: "Abandonné" }[e.conclusion.etat]}{e.conclusion.motif ? ` — ${e.conclusion.motif}` : ""} <span className="text-[#6a7180] text-[12px]">· {new Date(e.conclusion.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}{e.conclusion.par ? ` · ${e.conclusion.par}` : ""}</span></p>
        ) : (
          <>
            <input value={motif} onChange={(x) => setMotif(x.target.value)} placeholder="Le motif, en une phrase — il alimente la base marché" className="w-full max-w-[720px] bg-transparent border border-[#22262d] rounded-lg px-3 py-2 text-[13.5px] text-[#f2f3f5] outline-none focus:border-[#96c0b8]/60 mb-3" />
            <div className="grid sm:grid-cols-3 gap-4 max-w-[860px]">
              {[["signe", "Signé", "Le dossier part dans les dossiers signés ; le projet vit sur la plateforme.", "border-[#96c0b8]/50"], ["perdu", "Perdu", "Archives ; le prix et le loyer alimentent la base marché.", "border-[#e8b04c]/50"], ["abandonne", "Abandonné", "Archives ; le motif alimente la base marché.", "border-[#e8746a]/50"]].map(([etat, l, d, b]) => (
                <button key={etat} onClick={() => !apercu && conclure.mutate(etat)} disabled={apercu || conclure.isPending} className={`text-left rounded-md p-4 border ${b} hover:bg-[#f2f3f5]/[0.03] disabled:opacity-50`}>
                  <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">{l}</p>
                  <p className="m-0 mt-1 text-[12px] leading-[1.5] text-[#9298a6]">{d}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
