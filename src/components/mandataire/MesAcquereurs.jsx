import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Loader from "@/components/ui/Loader";
import { kEuros, fourchetteEuros } from "@/lib/clients-commerces";
import { STATUTS_CANDIDAT } from "@/lib/location";

// Le fichier acquéreurs du mandataire (30 oct. 2026, Jules) : il l'importe s'il en a un (Excel, CSV, ou une liste
// collée), Haka reconnaît les colonnes, et chaque acquéreur reste à lui seul. Ils servent au rapprochement avec ses
// biens (Haka : « qui je peux appeler pour ce bien ? »). Le tableau a le dessin de celui d'une liste.

const API = "/api/mandataire/acquereurs";
const STATUT_TOUCHE = { contact: "Contact", visite: "Visite faite", offre: "Offre", perdu: "Perdu" };
const TRAIT = "border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)]";
// Un candidat locataire (6 nov. 2026, Jules : la location) : une touche d'un bien à louer ; ses statuts sont ceux d'un
// candidat, son budget est le loyer qu'il accepte, et il n'a pas de rendement.
const estCandidat = (a) => a.role === "locataire" || !!a.bien?.location;
const budgetDe = (a) => (a.budget_min && a.budget_max ? fourchetteEuros(a.budget_min, a.budget_max) : kEuros(a.budget_max) || (a.budget_min ? `dès ${kEuros(a.budget_min)}` : null));

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

  const candidats = lignes.filter(estCandidat).length;

  if (isLoading) return <Loader titre="Vos acquéreurs" />;
  if (!tous.length || importer) return <Import vide={!tous.length} onFermer={tous.length ? () => setImporter(false) : null} onFait={() => setImporter(false)} />;
  return (
    <section data-zone="acquereurs">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-[320px] items-center gap-2 rounded-full bg-relief px-3.5 focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10 max-md:w-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, ville, ce qu'il cherche…"
            className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        <span className="ml-auto text-[13.5px] text-ardoise max-md:ml-0"><span className="tabular-nums text-menthe">{lignes.length - candidats}</span> acquéreur{lignes.length - candidats > 1 ? "s" : ""}{candidats ? <>, <span className="tabular-nums text-menthe">{candidats}</span> candidat{candidats > 1 ? "s" : ""}</> : null}{lignes.length !== tous.length ? <> sur <span className="tabular-nums text-encre">{tous.length}</span></> : null}</span>
        <button type="button" onClick={() => setImporter(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
          <FileUp className="h-3.5 w-3.5" /> Importer un fichier
        </button>
      </div>
      <div className="mt-4 overflow-x-auto k-verre">
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13.5px] [&_tr>*:last-child]:border-r-0">
          <thead>
            <tr>
              {[candidats ? "Acquéreur ou candidat" : "Acquéreur", "Contact", "Bien suivi", "Ce qu'il cherche", "Villes", "Budget", ""].map((h, i, l) => (
                <th key={h || i} className={`border-b border-r ${TRAIT} bg-rail h-[35px] px-3 py-0 text-[12.5px] font-normal text-ardoise ${i === 0 ? "sticky left-0 z-20 min-w-[200px]" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((a) => (
              <tr key={a.id} className="group transition-colors hover:bg-relief/30">
                <td className={`sticky left-0 z-10 border-b border-r ${TRAIT} bg-rail h-11 px-3 py-1 align-middle`}>
                  <span className="block max-w-[260px] truncate text-encre">{a.nom}</span>
                  {estCandidat(a) && <span className="block text-ardoise">Candidat locataire</span>}
                  {a.remarque && <span className="block max-w-[260px] truncate text-ardoise" title={a.remarque}>{a.remarque}</span>}
                </td>
                <td className={`border-b border-r ${TRAIT} h-11 px-3 py-1 align-middle`}>
                  {a.telephone ? <a href={`tel:${String(a.telephone).replace(/[^\d+]/g, "")}`} className="block whitespace-nowrap text-encre hover:text-menthe" style={{ fontVariantNumeric: "tabular-nums" }}>{a.telephone}</a> : null}
                  {a.email ? <a href={`mailto:${a.email}`} className="block max-w-[240px] truncate text-ardoise hover:text-encre">{a.email}</a> : null}
                  {!a.telephone && !a.email && <span className="text-brume">—</span>}
                </td>
                {/* Une touche notée par l'assistant (4 nov. 2026) : le bien qui l'intéresse et où il en est. */}
                <td className={`border-b border-r ${TRAIT} max-w-[240px] h-11 px-3 py-1 align-middle`}>
                  {a.bien ? <a href={`/MandataireBiens?bien=proprietaire:${a.bien.id}&etape=ensemble`} className="block truncate text-encre hover:text-menthe">{a.bien.titre}</a> : <span className="text-brume">—</span>}
                  {a.bien && <span className="block text-ardoise">{estCandidat(a) ? STATUTS_CANDIDAT[a.statut_touche] || "Contact" : <>{STATUT_TOUCHE[a.statut_touche] || "Contact"}{a.offre_montant ? ` · ${Number(a.offre_montant).toLocaleString("fr-FR")} €` : ""}</>}</span>}
                </td>
                <td className={`border-b border-r ${TRAIT} max-w-[260px] h-11 px-3 py-1 align-middle`}><span className="line-clamp-2 text-encre">{a.recherche || <span className="text-brume">—</span>}</span></td>
                <td className={`border-b border-r ${TRAIT} max-w-[220px] h-11 px-3 py-1 align-middle`}><span className="line-clamp-2 text-encre">{(a.villes || []).join(", ") || <span className="text-brume">—</span>}</span></td>
                <td className={`border-b border-r ${TRAIT} whitespace-nowrap h-11 px-3 py-1 align-middle tabular-nums text-encre`}>{budgetDe(a) || a.rendement_min ? <>{budgetDe(a)}{estCandidat(a) && <span className="block text-ardoise">loyer accepté par an</span>}{a.rendement_min && !estCandidat(a) && <span className="block text-ardoise">{String(a.rendement_min).replace(".", ",")} % minimum</span>}</> : <span className="text-brume">—</span>}</td>
                <td className={`border-b border-r ${TRAIT} w-12 px-2 py-1 text-center align-middle`}>
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

/** L'import : un fichier (glissé ou choisi) ou une liste collée ; l'assistant reconnaît les colonnes, les doublons sont écartés. */
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
      <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-ardoise">Excel ou CSV, avec une ligne de titres : nom, téléphone, e-mail, ce qu'il cherche, villes, budget… Assistant KPartners reconnaît les colonnes. Vos acquéreurs ne sont visibles que de vous ; Assistant KPartners s'en sert pour vous dire qui appeler pour un bien.</p>
      <button type="button" onClick={() => ref.current?.click()} disabled={envoyer.isPending}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); fichier(e.dataTransfer.files?.[0]); }}
        className={`mt-4 flex min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed p-6 text-center transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : "border-bord hover:border-bord-vif"}`} style={survol ? undefined : { background: "transparent" }}>
        {envoyer.isPending ? <Loader2 className="h-5 w-5 animate-spin text-menthe" /> : <FileUp className="h-5 w-5 text-ardoise" />}
        <span className="text-[13.5px] text-encre">{envoyer.isPending ? "L'Assistant KPartners lit votre fichier…" : "Cliquez ou glissez votre fichier"}</span>
        <span className="text-[12.5px] text-brume">.xlsx ou .csv</span>
      </button>
      <input ref={ref} type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; fichier(f); }} />
      <p className="m-0 mt-5 text-[13.5px] text-ardoise">Ou collez votre liste, telle quelle :</p>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} placeholder={"Dupont SCI, 06 12 34 56 78, cherche des murs de pharmacie à Lyon, 300 à 500 k€\nMartin, martin@exemple.fr, commerce de bouche, Nice, 1 M€"}
        className="mt-2 w-full resize-y rounded-[12px] border border-trait bg-surface px-4 py-3 text-[13.5px] leading-[1.55] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
      <button type="button" onClick={() => envoyer.mutate({ colle: texte.trim() })} disabled={!texte.trim() || envoyer.isPending}
        className="mt-3 inline-flex h-8 max-md:h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
        {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Importer la liste
      </button>
    </section>
  );
}
