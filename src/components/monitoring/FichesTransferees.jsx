import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Filtres } from "@/components/mandataire/elements";
import Chargement from "@/components/ui/Chargement";

// Les fiches transférées à sourcing@, une par une (23 nov. 2026, Jules : « fais d'abord un module avec les fiches en
// mémoire qu'on t'a transférées, je peux juste te dire en dessous ce que j'en pense à chaque fois »). Pour chaque
// transfert : le mail d'origine, ses pièces, ce que la machine a rentré (Mémoire ou dossier) et le nombre de fiches
// compté ; dessous, l'avis libre de l'équipe. « Copier pour Claude » donne tout en texte, pour régler le repérage.
// Le calcul : server/deal/fiches-transferees.js.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const k = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const nFiches = (n) => `${n} fiche${n > 1 ? "s" : ""}`;
const bouton = "inline-flex h-9 items-center gap-2 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50";

/** Un bien rentré : son adresse et ses chiffres, la fiche d'où il vient. */
function LigneBien({ b }) {
  const chiffres = [b.prix ? `prix ${k(b.prix)}` : null, b.loyer ? `loyer ${k(b.loyer)}` : null, b.surface ? `${Math.round(b.surface)} m²` : null, b.activite].filter(Boolean).join(" · ");
  return (
    <li className="flex items-baseline gap-2 py-1 text-[13.5px] leading-[1.5]">
      <span className="text-brume">·</span>
      <span className="min-w-0 flex-1">
        <span className="text-encre">{b.adresse || "Adresse non lue"}</span>
        {chiffres && <span className="text-ardoise"> · {chiffres}</span>}
        {b.piece && <span className="text-brume"> · {b.piece}</span>}
      </span>
      {b.fiche_url && <a href={b.fiche_url} target="_blank" rel="noreferrer" className="shrink-0 text-[12.5px] text-menthe underline-offset-4 hover:underline">Voir la fiche</a>}
    </li>
  );
}

function Transfert({ t }) {
  const queryClient = useQueryClient();
  const [texte, setTexte] = useState("");
  const [mail, setMail] = useState(false);
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", `/api/fiches-transferees/${encodeURIComponent(t.id)}/avis`, { body: { texte } }),
    onSuccess: () => { setTexte(""); queryClient.invalidateQueries({ queryKey: ["fiches-transferees"] }); },
    onError: (e) => toast.error(e?.message || "Avis non enregistré"),
  });
  const rien = !t.biens.length && !t.dossiers.length && !t.deja.length;
  return (
    <li className="flex flex-col gap-3 border-t border-trait py-5 first:border-t-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <p className="m-0 min-w-0 truncate text-[16px] text-encre" title={t.objet}>{t.objet}</p>
        <span className="shrink-0 text-[12.5px] tabular-nums text-brume">{jour(t.le)}</span>
      </div>
      <p className="m-0 -mt-2 text-[13.5px] leading-[1.5] text-ardoise">
        Transférée par {t.par}{t.agent ? ` · agent : ${t.agent}` : ""} · {t.intention_libelle} · <span className="text-encre">{nFiches(t.compte)} comptée{t.compte > 1 ? "s" : ""}</span>
      </p>
      {t.consigne && <p className="m-0 text-[13.5px] leading-[1.5] text-craie">Son message : « {t.consigne} »</p>}

      {t.pieces.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {t.pieces.map((p, i) => (
            <span key={`${p.nom}-${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-trait px-3 py-1 text-[12.5px] text-craie">
              <FileText className="h-3.5 w-3.5 shrink-0 text-brume" />
              <span className="truncate">{p.nom}</span>
              {p.lue && <span className="shrink-0 text-ardoise">· lue : {p.lue.biens} bien{p.lue.biens > 1 ? "s" : ""}{p.lue.annonce ? `, en annonce ${p.lue.annonce}` : ""}</span>}
            </span>
          ))}
        </div>
      )}

      <div>
        <p className="m-0 text-[12.5px] text-brume">Ce que la machine a rentré</p>
        {rien ? <p className="m-0 mt-1 text-[13.5px] text-ardoise">Rien.</p> : (
          <ul className="m-0 mt-0.5 list-none p-0">
            {t.biens.map((b) => <LigneBien key={b.id} b={b} />)}
            {t.dossiers.map((d) => (
              <li key={d.deal_id} className="py-1 text-[13.5px] leading-[1.5]">
                <Link to={`/Dossiers?deal_id=${d.deal_id}`} className="text-encre underline-offset-4 hover:underline">Dossier « {d.nom} »</Link>
                <span className="text-ardoise"> · {d.lots.length} lot{d.lots.length > 1 ? "s" : ""}{d.lots.length ? ` : ${d.lots.map((l) => l.adresse || "adresse ?").join(" ; ")}` : ""}</span>
              </li>
            ))}
            {t.deja.map((b) => <li key={`deja-${b.id}`} className="py-1 text-[13.5px] text-ardoise">Déjà en Mémoire : {b.adresse || "adresse ?"}</li>)}
          </ul>
        )}
      </div>

      <button type="button" onClick={() => setMail(!mail)} className="inline-flex w-fit items-center gap-1 p-0 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mail ? "rotate-180" : ""}`} />{mail ? "Cacher le mail" : "Voir le mail"}
      </button>
      {mail && <pre className="m-0 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-relief px-3.5 py-3 font-sans text-[13px] leading-[1.55] text-craie">{t.texte || "(mail vide)"}</pre>}

      <div className="flex flex-col gap-2">
        {t.avis.map((a, i) => (
          <p key={i} className="m-0 rounded-[10px] bg-relief px-3.5 py-2.5 text-[14px] leading-[1.55] text-encre">
            {a.texte}<span className="ml-2 text-[12.5px] text-brume">{String(a.par || "").split("@")[0]} · {jour(a.le)}</span>
          </p>
        ))}
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} placeholder="Ce que vous en pensez (« il y en a 4 dedans »…)"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && texte.trim()) enregistrer.mutate(); }}
          className="w-full resize-y rounded-[10px] border border-trait bg-transparent px-3.5 py-2.5 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
        {texte.trim() && (
          <button type="button" disabled={enregistrer.isPending} onClick={() => enregistrer.mutate()} className={`${bouton} w-fit`} style={{ background: "transparent" }}>Enregistrer</button>
        )}
      </div>
    </li>
  );
}

export default function FichesTransferees({ jours }) {
  const [filtre, setFiltre] = useState("tous");
  const { data, error } = useQuery({ queryKey: ["fiches-transferees", jours], queryFn: () => base44.request("GET", `/api/fiches-transferees?jours=${jours}`), placeholderData: (prev) => prev, staleTime: 15_000 });
  if (error) return <p className="m-0 py-8 text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p>;
  if (!data) return <Chargement />;
  const avecAvis = data.lignes.filter((t) => t.avis.length).length;
  const lignes = filtre === "sans" ? data.lignes.filter((t) => !t.avis.length) : data.lignes;
  const copier = async () => {
    try { await navigator.clipboard.writeText(data.texte); toast.success("Copié : collez-le à Claude."); } catch { toast.error("La copie a échoué."); }
  };
  return (
    <section className="k-verre p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[15px] font-normal text-encre">Les fiches transférées à sourcing@</h2>
          <p className="m-0 mt-0.5 text-[13.5px] leading-[1.5] text-ardoise">
            {data.lignes.length} transfert{data.lignes.length > 1 ? "s" : ""} sur la période, {avecAvis} avec un avis. Dites sous chacun ce que vous en pensez : c'est ce qui règle le repérage des fiches.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Filtres label="Lesquels" valeur={filtre} onChange={setFiltre} options={[["tous", "Tous", data.lignes.length], ["sans", "Sans avis", data.lignes.length - avecAvis]]} />
          <button type="button" onClick={copier} className={bouton} style={{ background: "transparent" }}><Copy className="h-4 w-4" />Copier pour Claude</button>
        </div>
      </div>
      {lignes.length ? (
        <ul className="m-0 mt-2 list-none p-0">{lignes.map((t) => <Transfert key={t.id} t={t} />)}</ul>
      ) : (
        <p className="m-0 py-8 text-center text-[13.5px] text-brume">{filtre === "sans" ? "Chaque transfert de la période a son avis." : "Aucun transfert à sourcing@ sur la période."}</p>
      )}
    </section>
  );
}
