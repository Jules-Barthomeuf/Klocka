import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Loader from "@/components/ui/Loader";

// Le fichier acquéreurs du mandataire (30 oct. 2026, Jules) : il l'importe s'il en a un (Excel, CSV, ou une liste
// collée), Haka reconnaît les colonnes, et chaque acquéreur reste à lui seul. Ils servent au rapprochement avec ses
// biens (Haka : « qui je peux appeler pour ce bien ? »). Le tableau a le dessin de celui d'une liste.

const API = "/api/mandataire/acquereurs";
const TRAIT = "border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)]";
const kEuros = (n) => (n ? `${Math.round(n / 1000).toLocaleString("fr-FR")} k€` : null);
const budgetDe = (a) => (a.budget_min && a.budget_max ? `${kEuros(a.budget_min)} – ${kEuros(a.budget_max)}` : kEuros(a.budget_max) || (a.budget_min ? `dès ${kEuros(a.budget_min)}` : null));

export default function MesAcquereurs() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-acquereurs"], queryFn: () => base44.request("GET", API) });
  const [importer, setImporter] = useState(false);
  const [q, setQ] = useState("");
  const retirer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `${API}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["m-acquereurs"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const tous = data?.acquereurs || [];
  const t = q.trim().toLowerCase();
  const lignes = t ? tous.filter((a) => [a.nom, a.telephone, a.email, a.recherche, (a.villes || []).join(" "), a.remarque].filter(Boolean).join(" ").toLowerCase().includes(t)) : tous;

  if (isLoading) return <Loader titre="Vos acquéreurs" />;
  if (!tous.length || importer) return <Import vide={!tous.length} onFermer={tous.length ? () => setImporter(false) : null} onFait={() => setImporter(false)} />;
  return (
    <section data-zone="acquereurs" className="k-points relative rounded-[12px] bg-rail px-5 pb-5 pt-4 max-md:px-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux max-md:min-w-0 max-md:max-w-none max-md:basis-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ville, ce qu'il cherche…"
            className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        <span className="ml-auto text-[13.5px] text-ardoise max-md:ml-0"><span className="tabular-nums text-menthe">{lignes.length}</span> acquéreur{lignes.length > 1 ? "s" : ""}{lignes.length !== tous.length ? <> sur <span className="tabular-nums text-encre">{tous.length}</span></> : null}</span>
        <button type="button" onClick={() => setImporter(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
          <FileUp className="h-3.5 w-3.5" /> Importer un fichier
        </button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-[14px] border border-bord-doux bg-rail">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13.5px]">
          <thead>
            <tr>
              {["Acquéreur", "Contact", "Ce qu'il cherche", "Villes", "Budget", "Rendement", ""].map((h, i, l) => (
                <th key={h || i} className={`border-b ${i < l.length - 1 ? "border-r" : ""} ${TRAIT} bg-rail px-4 py-3.5 font-normal text-encre ${i === 0 ? "sticky left-0 z-20 min-w-[200px]" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((a) => (
              <tr key={a.id} className="group transition-colors hover:bg-relief/30">
                <td className={`sticky left-0 z-10 border-b border-r ${TRAIT} bg-rail px-4 py-4 align-middle`}>
                  <span className="block max-w-[260px] truncate text-encre">{a.nom}</span>
                  {a.remarque && <span className="block max-w-[260px] truncate text-ardoise" title={a.remarque}>{a.remarque}</span>}
                </td>
                <td className={`border-b border-r ${TRAIT} px-4 py-4 align-middle`}>
                  {a.telephone ? <a href={`tel:${String(a.telephone).replace(/[^\d+]/g, "")}`} className="block whitespace-nowrap text-encre hover:text-menthe" style={{ fontVariantNumeric: "tabular-nums" }}>{a.telephone}</a> : null}
                  {a.email ? <a href={`mailto:${a.email}`} className="block max-w-[240px] truncate text-ardoise hover:text-encre">{a.email}</a> : null}
                  {!a.telephone && !a.email && <span className="text-brume">—</span>}
                </td>
                <td className={`border-b border-r ${TRAIT} max-w-[260px] px-4 py-4 align-middle`}><span className="line-clamp-2 text-encre">{a.recherche || <span className="text-brume">—</span>}</span></td>
                <td className={`border-b border-r ${TRAIT} max-w-[220px] px-4 py-4 align-middle`}><span className="line-clamp-2 text-encre">{(a.villes || []).join(", ") || <span className="text-brume">—</span>}</span></td>
                <td className={`border-b border-r ${TRAIT} whitespace-nowrap px-4 py-4 align-middle tabular-nums text-encre`}>{budgetDe(a) || <span className="text-brume">—</span>}</td>
                <td className={`border-b border-r ${TRAIT} whitespace-nowrap px-4 py-4 align-middle tabular-nums text-encre`}>{a.rendement_min ? `${String(a.rendement_min).replace(".", ",")} %` : <span className="text-brume">—</span>}</td>
                <td className={`border-b ${TRAIT} w-12 px-2 py-4 text-center align-middle`}>
                  <button type="button" onClick={() => { if (window.confirm(`Retirer ${a.nom} de vos acquéreurs ?`)) retirer.mutate(a.id); }} aria-label={`Retirer ${a.nom}`} title="Retirer"
                    className="grid h-7 w-7 place-items-center rounded-full text-ardoise opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100 focus:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!lignes.length && <p className="m-0 py-10 text-center text-[13.5px] text-brume">Aucun acquéreur ne correspond.</p>}
      </div>
    </section>
  );
}

/** L'import : un fichier (glissé ou choisi) ou une liste collée ; Haka reconnaît les colonnes, les doublons sont écartés. */
function Import({ vide, onFermer, onFait }) {
  const qc = useQueryClient();
  const ref = useRef(null);
  const [texte, setTexte] = useState("");
  const [survol, setSurvol] = useState(false);
  const envoyer = useMutation({
    mutationFn: ({ fichier = null, colle = "" }) => {
      const corps = new FormData();
      if (fichier) corps.append("fichier", fichier);
      if (colle) corps.append("texte", colle);
      return base44.request("POST", `${API}/import`, { body: corps });
    },
    onSuccess: (r) => {
      toast.success(`${r.ajoutes} acquéreur${r.ajoutes > 1 ? "s" : ""} importé${r.ajoutes > 1 ? "s" : ""}${r.doublons ? `, ${r.doublons} déjà là` : ""}`);
      setTexte("");
      qc.invalidateQueries({ queryKey: ["m-acquereurs"] });
      onFait?.();
    },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });
  const fichier = (f) => f && envoyer.mutate({ fichier: f });
  return (
    <section className="mx-auto w-full max-w-[720px]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">{vide ? "Importez votre fichier acquéreurs" : "Importer d'autres acquéreurs"}</p>
        {onFermer && <button type="button" onClick={onFermer} className="text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>}
      </div>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-ardoise">Excel ou CSV, avec une ligne de titres : nom, téléphone, e-mail, ce qu'il cherche, villes, budget… Haka reconnaît les colonnes. Vos acquéreurs ne sont visibles que de vous ; Haka s'en sert pour vous dire qui appeler pour un bien.</p>
      <button type="button" onClick={() => ref.current?.click()} disabled={envoyer.isPending}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); fichier(e.dataTransfer.files?.[0]); }}
        className={`mt-4 flex min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed p-6 text-center transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : "border-bord hover:border-bord-vif"}`} style={survol ? undefined : { background: "transparent" }}>
        {envoyer.isPending ? <Loader2 className="h-5 w-5 animate-spin text-menthe" /> : <FileUp className="h-5 w-5 text-ardoise" />}
        <span className="text-[13.5px] text-encre">{envoyer.isPending ? "Haka lit votre fichier…" : "Cliquez ou glissez votre fichier"}</span>
        <span className="text-[12.5px] text-brume">.xlsx ou .csv</span>
      </button>
      <input ref={ref} type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; fichier(f); }} />
      <p className="m-0 mt-5 text-[13.5px] text-ardoise">Ou collez votre liste, telle quelle :</p>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} placeholder={"Dupont SCI, 06 12 34 56 78, cherche des murs de pharmacie à Lyon, 300 à 500 k€\nMartin, martin@exemple.fr, commerce de bouche, Nice, 1 M€"}
        className="mt-2 w-full resize-y rounded-[14px] border border-trait bg-surface px-4 py-3 text-[13.5px] leading-[1.55] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
      <button type="button" onClick={() => envoyer.mutate({ colle: texte.trim() })} disabled={!texte.trim() || envoyer.isPending}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
        {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Importer la liste
      </button>
    </section>
  );
}
