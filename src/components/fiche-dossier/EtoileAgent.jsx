import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Les agents préférés (20 nov. 2026, Jules : « à droite de son nom, une petite étoile : c'est un très bon agent ; on la
// retrouve dans le CRM ; chacun de l'équipe peut en avoir cinq »). L'étoile pleine (ambre) : c'est un des miens ; son
// contour ambre : un collègue l'a mis en préféré ; grise : personne. Le survol dit qui.

const CLE = ["agents-preferes"];
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Les étoiles de l'équipe, lues une fois pour la page. */
export function useEtoiles({ enabled = true } = {}) {
  return useQuery({ queryKey: CLE, queryFn: () => base44.request("GET", "/api/fiche-dossier/agents-preferes"), staleTime: 60_000, retry: false, enabled });
}

const titre = (e) => (!e ? "Mettre en agent préféré" : `${e.moi ? "Un de tes agents préférés" : "Agent préféré"}${e.par?.length ? ` de ${e.par.join(", ")}` : ""}${e.moi ? " · un clic pour retirer l'étoile" : " · un clic pour l'ajouter aux tiens"}`);

/** L'étoile cliquable, à droite du nom d'un agent dans sa fiche. */
export function EtoileAgent({ cle, className = "" }) {
  const queryClient = useQueryClient();
  const { data } = useEtoiles();
  const e = (data?.agents || []).find((x) => x.cle === cle) || null;
  const basculer = useMutation({
    mutationFn: () => base44.request("POST", "/api/fiche-dossier/agents-preferes", { body: { cle } }),
    // L'étoile change au clic, sans attendre le serveur (24 nov. 2026, Jules : « on clique sur l'étoile, elle ne se
    // modifie pas ») ; refusée, elle revient comme avant.
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: CLE });
      const avant = queryClient.getQueryData(CLE);
      if (avant) {
        const deja = (avant.agents || []).find((x) => x.cle === cle);
        const agents = deja?.moi
          ? (avant.agents || []).map((x) => (x.cle === cle ? { ...x, moi: false, par: (x.par || []).slice(0, -1) } : x)).filter((x) => x.cle !== cle || x.par.length)
          : deja ? avant.agents.map((x) => (x.cle === cle ? { ...x, moi: true } : x)) : [...(avant.agents || []), { cle, nom: null, par: [], moi: true }];
        queryClient.setQueryData(CLE, { ...avant, agents });
      }
      return { avant };
    },
    // Les préférés montent en tête de la liste Agent immobilier du CRM (23 nov. 2026) : elle se relit.
    onSuccess: (r) => { queryClient.setQueryData(CLE, { agents: r.agents, miens: r.miens, max: r.max }); queryClient.invalidateQueries({ queryKey: ["crm-page", "agentImmobilier"] }); queryClient.invalidateQueries({ queryKey: ["agents-favoris"] }); },
    onError: (x, _v, ctx) => { if (ctx?.avant) queryClient.setQueryData(CLE, ctx.avant); toast.error(x?.message || "L'étoile n'a pas été posée."); },
  });
  const plein = !!e?.moi;
  return (
    <button type="button" onClick={() => basculer.mutate()} disabled={basculer.isPending} aria-pressed={plein} title={titre(e)} aria-label={titre(e)}
      className={`grid h-8 w-8 flex-none place-items-center rounded-full transition-colors hover:bg-relief disabled:opacity-60 ${className}`} style={{ background: "transparent" }}>
      <Star className={`h-[18px] w-[18px] transition-transform duration-200 ${plein ? "scale-110 fill-ambre text-ambre" : e ? "text-ambre" : "text-brume"}`} strokeWidth={1.8} />
    </button>
  );
}

/**
 * L'étoile d'un agent du CRM, trouvé par son nom (Twenty et Klocka n'ont pas les mêmes identifiants) ; rien si personne
 * ne l'a mis en préféré.
 */
export function EtoileCrm({ nom, etoiles }) {
  const n = sansAccent(nom);
  if (!n) return null;
  const e = (etoiles || []).find((x) => { const m = sansAccent(x.nom); return m && (m === n || (m.length > 5 && n.length > 5 && (m.includes(n) || n.includes(m)))); });
  if (!e) return null;
  return (
    <Star aria-label={titre(e)} className={`h-3.5 w-3.5 flex-none ${e.moi ? "fill-ambre text-ambre" : "text-ambre"}`} strokeWidth={1.8}>
      <title>{titre(e).split(" · ")[0]}</title>
    </Star>
  );
}
