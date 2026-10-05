import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Les villes Klocka (Mandataires, onglet Villes Klocka) : où Klocka cherche
// pour ses investisseurs, partout en France. L'agent IA de chaque mandataire
// les lit toujours en premier dans son secteur, et le mandataire ne peut pas
// les décocher. Une commune se cherche par son nom (annuaire officiel des
// communes) et s'ajoute d'un clic.

const API = "/api/mandataire/admin";
const habitants = (n) => (n ? `${Math.round(n).toLocaleString("fr-FR")} hab.` : null);

export default function VillesKlocka() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [cherche, setCherche] = useState("");
  // La recherche part après une courte pause de frappe.
  useEffect(() => { const t = setTimeout(() => setCherche(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const { data, isLoading } = useQuery({ queryKey: ["villes-klocka"], queryFn: () => base44.request("GET", `${API}/villes-klocka`) });
  const resultats = useQuery({ queryKey: ["communes", cherche], queryFn: () => base44.request("GET", `${API}/communes?q=${encodeURIComponent(cherche)}`), enabled: cherche.length >= 2 });
  const poser = (r) => queryClient.setQueryData(["villes-klocka"], r);
  const ajouter = useMutation({
    mutationFn: (c) => base44.request("POST", `${API}/villes-klocka`, { body: c }),
    onSuccess: (r, c) => { poser(r); setQ(""); toast.success(`${c.nom} ajoutée aux villes Klocka`); },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });
  const retirer = useMutation({
    mutationFn: (code) => base44.request("DELETE", `${API}/villes-klocka/${code}`),
    onSuccess: poser,
    onError: (e) => toast.error(e?.message || "Retrait impossible"),
  });
  const villes = data?.villes || [];
  const codes = new Set(villes.map((v) => v.code));

  return (
    <div className="mt-6">
      <p className="m-0 max-w-[70ch] text-[14px] leading-[1.6] text-ardoise">
        Les villes où Klocka cherche pour ses investisseurs. L'agent IA de chaque mandataire les lit toujours en premier quand elles sont dans son secteur, et le mandataire ne peut pas les décocher. Il y ajoute, dans Compte, les autres communes de son secteur qu'il travaille pour son activité.
      </p>

      <div className="relative mt-5 max-w-[520px]">
        <div className="flex items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ajouter une ville : Lyon, Bordeaux, Annecy…"
            className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          {resultats.isFetching && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-ardoise" />}
        </div>
        {cherche.length >= 2 && q && (resultats.data?.communes || []).length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
            {resultats.data.communes.map((c) => (
              <button key={c.code} type="button" disabled={codes.has(c.code) || ajouter.isPending} onClick={() => ajouter.mutate(c)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] text-encre hover:bg-rail-actif disabled:cursor-default disabled:opacity-50" style={{ background: "transparent" }}>
                <span className="min-w-0 flex-1 truncate">{c.nom} <span className="text-ardoise">({c.departement})</span></span>
                <span className="flex-none text-[12.5px] tabular-nums text-brume">{codes.has(c.code) ? "déjà là" : habitants(c.population)}</span>
                {!codes.has(c.code) && <Plus className="h-3.5 w-3.5 flex-none text-menthe" />}
              </button>
            ))}
          </div>
        )}
        {resultats.isError && <p className="m-0 mt-2 text-[13px] text-alerte">{resultats.error?.message}</p>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
      ) : !villes.length ? (
        <p className="py-10 text-center text-[14px] text-brume">Aucune ville Klocka : l'agent de chaque mandataire ne lit que les communes qu'il coche.</p>
      ) : (
        <div className="mt-6 border-y border-trait">
          {villes.map((v) => (
            <div key={v.code} className="group flex items-center gap-4 border-t border-trait px-2 py-3.5 first:border-t-0">
              <span className="min-w-0 flex-1 truncate text-[15px] text-encre">{v.nom} <span className="text-ardoise">({v.departement})</span></span>
              <span className="flex-none text-[13px] tabular-nums text-brume">{habitants(v.population)}</span>
              <button type="button" onClick={() => { if (window.confirm(`Retirer ${v.nom} des villes Klocka ?`)) retirer.mutate(v.code); }}
                aria-label={`Retirer ${v.nom}`} title="Retirer"
                className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise opacity-0 transition-opacity hover:text-alerte focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
