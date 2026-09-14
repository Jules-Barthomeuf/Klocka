import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, GitBranch, Loader2, Square, Wand2 } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";

// Le chantier sous une remarque : ce que Claude Code en a fait.
//
// Une remarque déposée par l'équipe ouvre un chantier tout seul (server/
// atelier.js). Ici on le regarde travailler — les fichiers qu'il lit, les
// commandes qu'il lance — puis on lit le résumé et on ouvre la pull request.
// Rien n'est fusionné depuis cet écran : la relecture reste humaine.

const ETATS = {
  attente: { mot: "En file", teinte: J["brume"], vif: true },
  en_cours: { mot: "Correction en cours", teinte: J["ambre"], vif: true },
  pousse: { mot: "Publication", teinte: J["ambre"], vif: true },
  reussi: { mot: "Pull request ouverte", teinte: J["menthe"] },
  local: { mot: "Branche locale", teinte: J["ambre"] },
  sans_objet: { mot: "Rien à corriger", teinte: J["brume"] },
  echec: { mot: "En échec", teinte: J["alerte"] },
  arrete: { mot: "Arrêté", teinte: J["brume"] },
  interrompu: { mot: "Interrompu", teinte: J["brume"] },
};
const etatDe = (s) => ETATS[s] || ETATS.attente;

/** Les dernières lignes du journal : ce que quelqu'un verrait par-dessus l'épaule. */
function Journal({ entrees, tout }) {
  const lignes = tout ? entrees : entrees.slice(-6);
  if (!lignes.length) return null;
  return (
    <div className={`mt-2 space-y-1 ${tout ? "max-h-[320px] overflow-y-auto pr-1" : ""}`}>
      {lignes.map((e, i) => (
        <p key={`${e.h}-${i}`} className="m-0 text-[12px] leading-[1.5] text-brume truncate">
          <span className="text-bord-vif">{e.quoi === "outil" ? "·" : "›"} </span>
          <span className={e.quoi === "outil" ? "font-pill" : ""}>{e.texte}</span>
        </p>
      ))}
    </div>
  );
}

export default function ChantierRemarque({ remarque }) {
  const queryClient = useQueryClient();
  const [deplie, setDeplie] = useState(false);

  const { data: atelier } = useQuery({
    queryKey: ["atelier-etat"],
    queryFn: () => base44.request("GET", "/api/atelier/etat"),
    staleTime: 60 * 1000,
  });

  const id = remarque.chantier_id || null;
  const { data: chantier } = useQuery({
    queryKey: ["chantier", id],
    queryFn: () => base44.request("GET", `/api/atelier/chantiers/${id}`),
    enabled: !!id,
    // Tant qu'il travaille, on regarde ; une fois fini, on le laisse tranquille.
    refetchInterval: (q) => (["attente", "en_cours", "pousse"].includes(q.state.data?.statut) ? 2500 : false),
  });

  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["chantier", id] });
    queryClient.invalidateQueries({ queryKey: ["all-suggestions"] });
  };

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/atelier/remarques/${remarque.id}`),
    onSuccess: () => { toast.success("Chantier ouvert"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible d'ouvrir le chantier"),
  });

  const arreter = useMutation({
    mutationFn: () => base44.request("POST", `/api/atelier/chantiers/${id}/arreter`),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible d'arrêter"),
  });

  // Sans chantier : le bouton qui en ouvre un, quand la machine sait le faire.
  if (!chantier) {
    if (!atelier?.disponible) return null;
    return (
      <button
        onClick={() => lancer.mutate()}
        disabled={lancer.isPending}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3 py-1 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-40"
      >
        {lancer.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
        Corriger avec Claude
      </button>
    );
  }

  const etat = etatDe(chantier.statut);
  const journal = chantier.journal || [];

  return (
    <div className="mt-3 rounded-xl border border-bord bg-fond px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="m-0 inline-flex items-center gap-2 text-[11px] uppercase tracking-[.18em]" style={{ color: etat.teinte }}>
          {etat.vif && <Loader2 className="h-3 w-3 animate-spin" />}
          {etat.mot}
        </p>
        <div className="flex items-center gap-3">
          {chantier.cout_usd != null && (
            <span className="text-[12px] tabular-nums text-brume">{chantier.cout_usd.toFixed(2)} $</span>
          )}
          {["attente", "en_cours"].includes(chantier.statut) ? (
            <button onClick={() => arreter.mutate()} className="inline-flex items-center gap-1.5 text-[12.5px] text-brume hover:text-alerte">
              <Square className="h-3 w-3" /> Arrêter
            </button>
          ) : (
            <button onClick={() => lancer.mutate()} disabled={lancer.isPending} className="inline-flex items-center gap-1.5 text-[12.5px] text-brume hover:text-encre disabled:opacity-40">
              <Wand2 className="h-3 w-3" /> Relancer
            </button>
          )}
        </div>
      </div>

      {chantier.resume && (
        <p className="m-0 mt-2 text-[12.5px] leading-[1.6] text-craie whitespace-pre-wrap">{chantier.resume}</p>
      )}
      {chantier.erreur && (
        <p className="m-0 mt-2 text-[12.5px] leading-[1.6] text-ambre whitespace-pre-wrap">{chantier.erreur}</p>
      )}

      <p className="m-0 mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-brume">
        <span className="inline-flex items-center gap-1.5"><GitBranch className="h-3 w-3" />{chantier.branche}</span>
        {chantier.diff_stat && <><span className="text-bord-vif">·</span><span className="tabular-nums">{chantier.diff_stat}</span></>}
        {chantier.pr_url && (
          <>
            <span className="text-bord-vif">·</span>
            <a href={chantier.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-menthe underline decoration-bord underline-offset-2 hover:text-menthe-survol">
              Pull request <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </p>

      <Journal entrees={journal} tout={deplie} />
      {journal.length > 6 && (
        <button onClick={() => setDeplie((o) => !o)} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-brume hover:text-craie">
          <ChevronDown className={`h-3 w-3 transition-transform ${deplie ? "rotate-180" : ""}`} />
          {deplie ? "Replier le journal" : `Voir les ${journal.length} étapes`}
        </button>
      )}
    </div>
  );
}
