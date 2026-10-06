import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ENTREES_ADMIN, ENTREES_AUTRE } from "@/lib/menu";

// Les accès de l'équipe, page par page (6 oct. 2026) : Jules seul les voit et
// les change. Tout est fermé par défaut ; un clic sur une page l'ouvre à la
// personne, un autre la referme. Une page fermée reste dans son menu avec un
// cadenas, et s'ouvre sur « Accès réservé ».

export default function AccesAdmins() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["acces-pages"], queryFn: () => base44.request("GET", "/api/admin/acces-pages") });
  const poser = useMutation({
    mutationFn: ({ email, pages_ouvertes }) => base44.request("POST", "/api/admin/acces-pages", { body: { email, pages_ouvertes } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["acces-pages"] }),
    onError: (e) => toast.error(e?.message || "Accès non modifiés"),
  });
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (isError || !data) return null;
  const toujours = new Set(data.toujours_ouvertes || []);
  const pages = [...ENTREES_ADMIN, ...ENTREES_AUTRE].filter((e) => !toujours.has(e.cle));
  return (
    <section className="rounded-bloc border border-trait bg-surface p-5 md:p-6">
      <p className="m-0 text-[17px] text-encre">Accès de l'équipe</p>
      <p className="m-0 mt-1 text-[13px] text-ardoise">Vous seul voyez ce réglage. Tout est fermé par défaut : cliquez sur une page pour l'ouvrir à la personne. Une page fermée reste dans son menu, avec un cadenas, et s'ouvre sur « Accès réservé ». Prospection, Emailing et ALX se ferment aussi côté serveur. Le Dashboard et le Compte restent toujours ouverts.</p>
      <div className="mt-5 flex flex-col gap-5">
        {(data.admins || []).map((a) => {
          const ouvertes = new Set(a.pages_ouvertes || []);
          const fermees = new Set(pages.map((e) => e.cle).filter((c) => !ouvertes.has(c)));
          const basculer = (cle) => {
            const n = new Set(ouvertes);
            if (n.has(cle)) n.delete(cle); else n.add(cle);
            poser.mutate({ email: a.email, pages_ouvertes: [...n] });
          };
          return (
            <div key={a.email} className="border-t border-trait pt-4 first:border-t-0 first:pt-0">
              <p className="m-0 text-[15px] text-encre">{a.nom}</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[12.5px] text-ardoise">{a.email} · {ouvertes.size ? `${ouvertes.size} page${ouvertes.size > 1 ? "s" : ""} ouverte${ouvertes.size > 1 ? "s" : ""}` : "tout est fermé"}</p>
                <span className="flex gap-1.5">
                  <button type="button" onClick={() => poser.mutate({ email: a.email, pages_ouvertes: pages.map((e) => e.cle) })} disabled={poser.isPending || !fermees.size} className="h-7 rounded-full border border-trait px-2.5 text-[12px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Tout ouvrir</button>
                  <button type="button" onClick={() => poser.mutate({ email: a.email, pages_ouvertes: [] })} disabled={poser.isPending || !ouvertes.size} className="h-7 rounded-full border border-trait px-2.5 text-[12px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Tout fermer</button>
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {pages.map((e) => {
                  const ferme = fermees.has(e.cle);
                  return (
                    <button key={e.cle} type="button" onClick={() => basculer(e.cle)} disabled={poser.isPending}
                      aria-pressed={!ferme} title={ferme ? `Ouvrir ${e.label} à ${a.nom}` : `Fermer ${e.label} à ${a.nom}`}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors disabled:opacity-60 ${ferme ? "border-trait text-brume" : "border-menthe/50 bg-menthe/10 text-encre"}`}
                      style={ferme ? { background: "transparent" } : undefined}>
                      {ferme && <Lock className="h-3 w-3" strokeWidth={2} />}{e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!(data.admins || []).length && <p className="m-0 text-[13.5px] text-brume">Aucun autre admin pour l'instant.</p>}
      </div>
    </section>
  );
}
