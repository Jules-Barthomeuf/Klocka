import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Où cherche l'agent IA du mandataire : les villes Klocka de son secteur,
// toujours lues (on ne les décoche pas), puis les autres communes de son
// secteur, qu'il coche pour son activité. Au premier passage (l'accueil),
// le choix part avec « Valider » ; dans Compte, chaque case s'enregistre aussitôt.

const API = "/api/mandataire/agent/communes";
const habitants = (n) => (n ? `${Math.round(n).toLocaleString("fr-FR")} hab.` : null);

export default function CommunesAgent({ accueil = false, onValide = null, entete = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["m-agent-communes"], queryFn: () => base44.request("GET", API) });
  const [cochees, setCochees] = useState(null);
  useEffect(() => {
    if (data && cochees === null) setCochees(new Set(data.autres.filter((c) => c.choisie).map(cle)));
  }, [data, cochees]);

  const enregistrer = useMutation({
    mutationFn: (s) => base44.request("PUT", API, { body: { communes: [...s] } }),
    onSuccess: (r) => {
      queryClient.setQueryData(["m-agent-communes"], r);
      queryClient.invalidateQueries({ queryKey: ["m-agent"] });
      onValide?.(r);
    },
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });

  // À l'accueil, l'en-tête et la liste défilent ; « Valider » reste en bas à droite, toujours visible.
  const cadre = (corps, pied = null) => (accueil ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6 pt-7 max-md:px-5">{entete}{corps}</div>
      {pied && <div className="flex flex-none items-center justify-between gap-4 border-t border-trait px-7 py-4 max-md:px-5">{pied}</div>}
    </div>
  ) : corps);
  if (isLoading) return cadre(<p className="m-0 flex items-center gap-2 py-4 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Je lis les communes de votre secteur…</p>);
  if (error) return cadre(<p className="m-0 py-4 text-[13.5px] text-alerte">{error.message || "Les communes ne se lisent pas."}</p>);
  if (!data?.secteur) return cadre(<p className="m-0 py-4 text-[13.5px] text-brume">Aucun secteur ne vous est attribué : Klocka trace le vôtre, puis vous choisirez ici vos communes.</p>);
  const s = cochees || new Set();
  const basculer = (c) => {
    const n = new Set(s);
    if (n.has(cle(c))) n.delete(cle(c)); else n.add(cle(c));
    setCochees(n);
    if (!accueil) enregistrer.mutate(n);
  };

  const valider = (
    <>
      <p className="m-0 text-[12.5px] text-brume">Vous pourrez le changer à tout moment dans Compte.</p>
      <button type="button" onClick={() => enregistrer.mutate(s)} disabled={enregistrer.isPending}
        className="inline-flex h-10 flex-none items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
        {enregistrer.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Valider
      </button>
    </>
  );

  return cadre(
    <div className="w-full">
      <p className="m-0 text-[12px] uppercase tracking-[0.14em] text-brume">Villes Klocka · toujours lues</p>
      {data.klocka.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {data.klocka.map((c) => (
            <span key={cle(c)} title="Ville où Klocka cherche pour ses investisseurs : l'agent la lit toujours en premier."
              className="inline-flex items-center gap-1.5 rounded-full bg-menthe/[0.14] px-3 py-1.5 text-[13.5px] text-encre">
              <Lock className="h-3 w-3 text-menthe" />{c.nom}
            </span>
          ))}
        </div>
      ) : (
        <p className="m-0 mt-2 text-[13.5px] text-ardoise">Votre secteur ne compte aucune ville Klocka : l'agent lit seulement les communes que vous cochez.</p>
      )}

      <p className="m-0 mt-6 text-[12px] uppercase tracking-[0.14em] text-brume">Pour votre activité · {s.size} cochée{s.size > 1 ? "s" : ""} sur {data.autres.length}</p>
      {data.autres.length ? (
        <div className="mt-2.5 grid gap-x-6 sm:grid-cols-2">
          {data.autres.map((c) => {
            const oui = s.has(cle(c));
            return (
              <button key={cle(c)} type="button" onClick={() => basculer(c)} aria-pressed={oui}
                className="group flex items-center gap-3 py-2 text-left" style={{ background: "transparent" }}>
                <span className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border transition-colors ${oui ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif group-hover:border-menthe"}`}>
                  {oui && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-encre">{c.nom}</span>
                {habitants(c.population) && <span className="flex-none text-[12.5px] tabular-nums text-brume">{habitants(c.population)}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="m-0 mt-2 text-[13.5px] text-ardoise">Votre secteur ne compte pas d'autre commune.</p>
      )}

      {!accueil && (
        <p className="m-0 mt-3 text-[12.5px] text-brume">{enregistrer.isPending ? "Enregistrement…" : "Chaque case s'enregistre tout de suite ; l'agent en tient compte à son prochain tour."}</p>
      )}
    </div>,
    valider,
  );
}

const cle = (c) => c.code || c.nom;
