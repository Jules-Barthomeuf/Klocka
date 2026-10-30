import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import Pages from "@/components/ui/Pages";

// La Mémoire Klocka (30 oct. 2026, Jules : « les fiches des biens qu'on supprime normalement ; tous ces biens vont
// nous servir à avoir de la data »). Une ligne par bien : la date, l'adresse, le loyer, le prix, la surface, l'agent et
// son agence, d'où il vient. Dessus, les boîtes : Jules autorise une boîte et le lecteur la relit aussitôt, d'un bout
// à l'autre (pas la nuit, pas de plafond : Jules, 30 oct. 2026) ; il voit où il en est, ce que la lecture a coûté
// aujourd'hui, et peut la mettre en pause.

const API = "/api/memoire";
const PAR_PAGE = 50;
const euros = (n) => (n == null ? "" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const kEuros = (n) => (n == null ? "" : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");
const ORIGINES = { suppression: "dossier supprimé", abandon: "dossier abandonné", dossier: "dossier en cours", veille: "veille des boîtes", scraper: "lecture des boîtes" };

export default function MemoireKlocka() {
  const [recherche, setRecherche] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(recherche.trim()); setPage(1); }, 250); return () => clearTimeout(t); }, [recherche]);
  const { data, isLoading } = useQuery({ queryKey: ["memoire", q], queryFn: () => base44.request("GET", `${API}?q=${encodeURIComponent(q)}&limite=500`), placeholderData: (a) => a });
  const biens = data?.biens || [];
  const affiches = biens.slice((page - 1) * PAR_PAGE, page * PAR_PAGE);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 md:px-6 max-md:py-6">
      <header className="mb-6 flex flex-col items-center gap-2 text-center">
        <Link to="/Dossiers" className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre"><ArrowLeft className="h-3.5 w-3.5" />Tous les dossiers</Link>
        <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Mémoire</h1>
        <p className="m-0 max-w-[64ch] text-[14px] text-ardoise">Les fiches des biens vus : celles des dossiers supprimés ou abandonnés, et celles que le lecteur retrouve dans les boîtes. Elles nourrissent les comparables, les fiches des agents et Twenty CRM.</p>
      </header>

      <Boites />

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex h-11 min-w-[240px] max-w-[460px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:max-w-none max-md:basis-full">
          <Search className="h-4 w-4 flex-shrink-0 text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Adresse, ville, agent, agence, locataire" className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {data && (
          <p className="m-0 text-[13.5px] text-ardoise">
            <span className="text-encre tabular-nums">{data.total}</span> bien{data.total > 1 ? "s" : ""} · <span className="tabular-nums">{data.en_memoire}</span> en mémoire · <span className="tabular-nums">{data.en_dossier}</span> en dossier · <span className="tabular-nums">{data.agents}</span> agent{data.agents > 1 ? "s" : ""}
          </p>
        )}
      </div>

      {isLoading ? <Chargement taille="grand" /> : !biens.length ? (
        <p className="py-16 text-center text-sm text-brume">{q ? "Rien ne correspond." : "Rien encore : la Mémoire se remplit quand un dossier est supprimé ou abandonné, et dès qu'une boîte est autorisée."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-bord-doux bg-rail">
          <table className="w-full min-w-[980px] border-collapse text-[13.5px]">
            <thead>
              <tr className="text-left text-encre">
                {["Reçue", "Adresse", "Ville", "Loyer / an", "Prix", "m²", "Locataire", "Agent", "Agence", "Boîte", "Origine", ""].map((t, i) => (
                  <th key={i} className="border-b border-trait px-3 py-2.5 font-normal">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {affiches.map((b) => (
                <tr key={b.id} className="border-b border-trait last:border-b-0 hover:bg-relief">
                  <td className="px-3 py-2 tabular-nums text-ardoise">{dateCourte(b.recu_le)}</td>
                  <td className="px-3 py-2 text-encre">{b.adresse?.rue || <span className="text-brume">adresse inconnue</span>}</td>
                  <td className="px-3 py-2 text-craie">{[b.code_postal, b.ville].filter(Boolean).join(" ")}</td>
                  <td className="px-3 py-2 tabular-nums text-craie">{euros(b.loyer_annuel)}</td>
                  <td className="px-3 py-2 tabular-nums text-craie">{kEuros(b.prix)}</td>
                  <td className="px-3 py-2 tabular-nums text-craie">{b.surface_m2 || ""}</td>
                  <td className="px-3 py-2 text-craie">{[b.locataire_nom, b.locataire_activite].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2 text-craie" title={b.agent_email || ""}>{b.agent?.nom || b.agent_email || ""}</td>
                  <td className="px-3 py-2 text-craie">{b.agent?.agence || ""}</td>
                  <td className="px-3 py-2 text-ardoise">{(b.compte || "").split("@")[0]}</td>
                  <td className="px-3 py-2 text-ardoise">{b.statut === "dossier" ? "dossier en cours" : ORIGINES[b.origine] || b.origine}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {b.fiche?.url && <a href={b.fiche.url} target="_blank" rel="noreferrer" className="text-[13px] text-menthe hover:text-menthe-survol">Fiche</a>}
                    {b.deal_id && b.statut === "dossier" && <Link to={`/Dossiers?dossier=${encodeURIComponent(b.deal_id)}`} className="ml-3 text-[13px] text-menthe hover:text-menthe-survol">Dossier</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pages page={page} total={biens.length} parPage={PAR_PAGE} onPage={setPage} />
    </div>
  );
}

/** Les boîtes et le lecteur : autorisation par boîte (Jules), avancement, dépense du jour, pause. */
function Boites() {
  const queryClient = useQueryClient();
  const { data: e } = useQuery({ queryKey: ["memoire-scraper"], queryFn: () => base44.request("GET", `${API}/scraper`), refetchInterval: 30_000 });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["memoire-scraper"] });
  const onErr = (x) => toast.error(x?.message || "Impossible");
  const autoriser = useMutation({ mutationFn: ({ email, autoriser: a }) => base44.request("POST", `${API}/boites/${encodeURIComponent(email)}/autoriser`, { body: { autoriser: a } }), onSuccess: rafraichir, onError: onErr });
  const pause = useMutation({ mutationFn: (p) => base44.request("POST", `${API}/scraper/pause`, { body: { pause: p } }), onSuccess: rafraichir, onError: onErr });
  const tour = useMutation({ mutationFn: () => base44.request("POST", `${API}/scraper/tour`), onSuccess: (r) => { rafraichir(); queryClient.invalidateQueries({ queryKey: ["memoire"] }); toast.success(r?.ignore ? `Rien fait : ${r.ignore}` : r?.lancees?.length ? `Lecture relancée : ${r.lancees.length} boîte${r.lancees.length > 1 ? "s" : ""}` : "Rien à relancer"); }, onError: onErr });
  if (!e) return null;
  const boites = e.boites || [];
  const enCours = boites.some((b) => b.en_cours);
  return (
    <section className="rounded-[14px] border border-bord-doux bg-rail px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[15px] font-normal text-encre">Les boîtes</h2>
        <p className="m-0 text-[13px] text-ardoise">
          Une boîte autorisée se lit aussitôt, en entier · dépensé aujourd'hui <span className="tabular-nums text-encre">{(e.depense_jour || 0).toFixed(2).replace(".", ",")} €</span>
          {e.pause && <span className="text-alerte"> · en pause</span>}
          {enCours && <span className="text-menthe"> · lecture en cours</span>}
        </p>
      </div>
      <ul className="m-0 mt-3 list-none p-0">
        {boites.map((b) => {
          const total = b.lus || 0;
          const avancement = b.termine_le ? `lue en entier · ${b.fiches || 0} fiche${(b.fiches || 0) > 1 ? "s" : ""}` : b.commence_le ? `${b.en_cours ? "en cours · " : ""}${total} message${total > 1 ? "s" : ""} lus · ${b.fiches || 0} fiche${(b.fiches || 0) > 1 ? "s" : ""}` : b.autorisee_le ? (b.en_cours ? "lecture en cours" : "en attente") : "";
          return (
            <li key={b.email} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-trait py-2.5 first:border-t-0">
              <span className="min-w-[220px] text-[14px] text-encre">{b.email}</span>
              {!b.peut_lire ? <span className="text-[13px] text-ardoise">sans droit de lecture : à reconnecter</span> : (
                <>
                  <span className="text-[13px] text-ardoise">{avancement}{b.erreurs ? ` · ${b.erreurs} erreur${b.erreurs > 1 ? "s" : ""}` : ""}</span>
                  <span className="flex-1" />
                  {b.autorisee_le && <span className="text-[12.5px] text-brume">autorisée le {dateCourte(b.autorisee_le)}{b.autorisee_par ? ` par ${b.autorisee_par.split("@")[0]}` : ""}</span>}
                  {e.super_admin && (
                    <button type="button" onClick={() => autoriser.mutate({ email: b.email, autoriser: !b.autorisee_le })} disabled={autoriser.isPending}
                      className={`h-8 rounded-full border px-3.5 text-[13px] transition-colors ${b.autorisee_le ? "border-menthe/50 text-menthe hover:border-menthe" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
                      {b.autorisee_le ? "Autorisée" : "Autoriser la lecture"}
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
        {!boites.length && <li className="py-2 text-[13.5px] text-brume">Aucune boîte connectée.</li>}
      </ul>
      {e.super_admin && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => pause.mutate(!e.pause)} disabled={pause.isPending} className="h-8 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>{e.pause ? "Reprendre" : "Mettre en pause"}</button>
          <button type="button" onClick={() => tour.mutate()} disabled={tour.isPending || e.pause} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>{tour.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Relancer</button>
          <span className="text-[12.5px] text-brume">Relance les boîtes autorisées qui ne sont pas finies.</span>
        </div>
      )}
    </section>
  );
}
