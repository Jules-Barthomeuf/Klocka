import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Les pages du CRM d'une personne (11 nov. 2026, Jules : « cliquer sur un utilisateur et sélectionner quelle page il
// peut voir ») : dans le détail de sa ligne d'Utilisateurs, pour Jules seul. Les pages que son rôle de Twenty lui
// ouvre ; un clic cache la page (elle disparaît de son CRM et ne s'ouvre plus), un autre la remontre. Les données
// restent dans Twenty.

export default function PagesCrm({ email }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["crm-pages-chacun"], queryFn: () => base44.request("GET", "/api/admin/crm/pages"), staleTime: 60_000 });
  const poser = useMutation({
    mutationFn: ({ cachees }) => base44.request("POST", "/api/admin/crm/pages", { body: { email: p.email, cachees } }),
    onMutate: ({ cachees }) => queryClient.setQueryData(["crm-pages-chacun"], (d) => (d ? { ...d, personnes: d.personnes.map((x) => (x.email === p.email ? { ...x, cachees } : x)) } : d)),
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ["crm-pages-chacun"] }); queryClient.invalidateQueries({ queryKey: ["crm-barre"] }); },
    onError: (e) => toast.error(e?.message || "Pages non modifiées"),
  });
  const p = data?.personnes?.find((x) => x.email === String(email || "").toLowerCase());
  const titre = <div className="mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Pages du CRM</div>;
  if (isLoading) return <div>{titre}<p className="m-0 text-[13px] text-ardoise">Lecture des droits de Twenty…</p></div>;
  if (isError) return <div>{titre}<p className="m-0 text-[13px] text-ardoise">{error?.message || "Twenty CRM ne répond pas."}</p></div>;
  if (!p) return null;
  if (p.sans_acces) return <div>{titre}<p className="m-0 text-[13px] text-ardoise">Pas d'accès au CRM : son rôle se donne dans Twenty.</p></div>;
  const cachees = new Set(p.cachees || []);
  const vues = p.pages.filter((o) => !cachees.has(o.singulier)).length;
  const basculer = (s) => {
    const n = new Set(cachees);
    if (n.has(s)) n.delete(s); else n.add(s);
    poser.mutate({ cachees: [...n] });
  };
  return (
    <div>
      {titre}
      <div className="mb-2.5 flex flex-wrap items-center gap-3">
        <p className="m-0 text-[13px] text-ardoise">Voit {vues} page{vues > 1 ? "s" : ""} sur {p.pages.length}. Un clic cache ou montre une page.</p>
        <button type="button" onClick={() => poser.mutate({ cachees: [...cachees].filter((s) => !p.pages.some((o) => o.singulier === s)) })} disabled={vues === p.pages.length} className="h-7 rounded-full border border-trait px-2.5 text-[12px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Tout montrer</button>
        <button type="button" onClick={() => poser.mutate({ cachees: [...new Set([...cachees, ...p.pages.map((o) => o.singulier)])] })} disabled={!vues} className="h-7 rounded-full border border-trait px-2.5 text-[12px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Tout cacher</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {p.pages.map((o) => {
          const cachee = cachees.has(o.singulier);
          return (
            <button key={o.singulier} type="button" onClick={() => basculer(o.singulier)}
              aria-pressed={!cachee} title={`${o.espace} · ${cachee ? "Cachée : cliquer pour la montrer" : "Visible : cliquer pour la cacher"}`}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors ${cachee ? "border-trait text-brume line-through" : "border-menthe/50 bg-menthe/10 text-encre"}`}
              style={cachee ? { background: "transparent" } : undefined}>
              {o.nom}
            </button>
          );
        })}
      </div>
    </div>
  );
}
