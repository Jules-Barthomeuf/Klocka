import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Check, Mail, Phone, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";

// Le tableau de bord des lead magnets : les pages ouvertes qu'on a publiées,
// le lien à copier, et les gens qui les ont remplies.
//
// Un lead porte un nom, des revenus et une adresse e-mail : cette page est
// réservée à l'équipe, et la route qui la sert l'est aussi.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

export default function AdminLeadMagnets() {
  const user = useUser();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(null);
  const [copie, setCopie] = useState(null);

  const { data } = useQuery({ queryKey: ["leadmagnets"], queryFn: () => base44.request("GET", "/api/leadmagnets"), enabled: user?.role === "admin" });
  const magnets = data?.lead_magnets || [];
  const leads = data?.leads || [];
  // L'origine du navigateur, jamais celle du serveur : en développement l'API
  // répond sur un autre port, et le lien partagé serait injoignable.
  const base = window.location.origin;

  const traiter = useMutation({
    mutationFn: ({ id, traite }) => base44.request("PATCH", `/api/leadmagnets/leads/${id}`, { body: { traite } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leadmagnets"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!user || user.role !== "admin") return null;

  const lienDe = (slug) => `${base}/${slug === "feuille-de-route" ? "FeuilleDeRoute" : slug}`;
  const copier = async (slug) => {
    try {
      await navigator.clipboard.writeText(lienDe(slug));
      setCopie(slug);
      setTimeout(() => setCopie(null), 2000);
    } catch { toast.error("Copie impossible"); }
  };

  const visibles = leads.filter((l) => !ouvert || l.slug === ouvert);

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Acquisition</p>
      <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">Lead magnets</h1>
      <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
        Les pages ouvertes à tous, sans compte, qui ramènent des contacts. Copiez le lien pour le partager.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {!magnets.length && <p className="m-0 text-[13px] text-brume">Aucun lead magnet pour l&apos;instant.</p>}
        {magnets.map((m) => (
          <div key={m.slug} className={`${CARTE} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[16px] font-medium text-encre">{m.titre}</p>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.6] text-ardoise">{m.accroche}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] uppercase tracking-[.1em] ${m.actif ? "border-menthe/40 text-menthe-texte" : "border-bord text-brume"}`}>
                {m.actif ? "En ligne" : "Hors ligne"}
              </span>
            </div>
            <p className="m-0 mt-3 truncate text-[11.5px] text-brume">{lienDe(m.slug)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button onClick={() => copier(m.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                {copie === m.slug ? <><Check className="h-3.5 w-3.5 text-vert" />Copié</> : <><Copy className="h-3.5 w-3.5" />Copier le lien</>}
              </button>
              <a href={lienDe(m.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                <ExternalLink className="h-3.5 w-3.5" />Voir la page
              </a>
              <button onClick={() => setOuvert(ouvert === m.slug ? null : m.slug)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[.1em] ${ouvert === m.slug ? "border-menthe/40 text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                {m.leads} lead{m.leads > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">
        Les contacts reçus{ouvert ? " · filtrés" : ""} <span className="text-[13px] font-normal text-brume">{visibles.length}</span>
      </h2>
      {!visibles.length ? <p className="m-0 text-[13px] text-brume">Aucun contact pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {visibles.map((l) => (
            <li key={l.id} className={`${CARTE} mb-2 p-4 ${l.traite ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[15px] font-medium text-encre">{l.nom}</p>
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ardoise">
                    <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1.5 text-menthe-texte"><Mail className="h-3 w-3" />{l.email}</a>
                    {l.telephone && <a href={`tel:${l.telephone}`} className="inline-flex items-center gap-1.5 text-menthe-texte"><Phone className="h-3 w-3" />{l.telephone}</a>}
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" />{l.quartier}</span>
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="text-[11.5px] text-brume">{quand(l.le)}</span>
                  <button onClick={() => traiter.mutate({ id: l.id, traite: !l.traite })}
                    className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[.1em] ${l.traite ? "border-vert/40 text-vert" : "border-bord text-ardoise hover:text-encre"}`}>
                    {l.traite ? "Traité" : "À rappeler"}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] text-ardoise">
                {[
                  ["Objectif", `${euros(l.objectif_mensuel)} / mois`],
                  ["Fonds propres", euros(l.fonds_propres)],
                  ["Revenus", `${euros(l.revenus_annuels)} / an`],
                  ["Horizon", `${l.horizon_ans} ans`],
                  ["Plan", `${l.roadmap?.nombre_acquisitions || "—"} acquisitions · ${euros(l.roadmap?.patrimoine_vise)}`],
                ].map(([k, v]) => (
                  <span key={k} className="rounded-full border border-trait bg-relief px-2.5 py-1"><span className="text-brume">{k} :</span> {v}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
