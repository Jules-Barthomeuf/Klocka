import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import CarteProposition from "@/components/haka/CarteProposition";
import { useCompteHaka, useGestesHaka, usePropositions } from "@/components/haka/useFileHaka";
import { useUser } from "@/components/providers/UserProvider";

// À valider (17 oct. 2026, Jules) : la seule file de ce que Haka propose. Pour
// moi, le Commun (sans propriétaire, n'importe qui le prend), et Tout pour
// Jules. Chaque élément : ce qu'il propose, pourquoi, Valider / Modifier /
// Rejeter. Rien ne part sans un clic ici.

export default function AValider() {
  const user = useUser();
  const [params] = useSearchParams();
  const compte = useCompteHaka();
  const vues = [["moi", "Pour moi", compte.data?.moi], ["commun", "Commun", compte.data?.commun], ...(compte.data?.peut_tout ? [["tout", "Tout", compte.data?.tout]] : [])];
  const [vue, setVueBrute] = useState(() => { try { return localStorage.getItem("avalider.vue") || "moi"; } catch { return "moi"; } });
  const setVue = (v) => { setVueBrute(v); try { localStorage.setItem("avalider.vue", v); } catch { /* navigation privée */ } };
  const vueEffective = vues.some(([k]) => k === vue) ? vue : "moi";
  const q = usePropositions(vueEffective);
  const gestes = useGestesHaka();
  // ?id= : la notification mène à l'élément, qu'on met en vue.
  const cible = params.get("id");
  useEffect(() => {
    if (!cible || !q.data) return;
    const t = setTimeout(() => document.getElementById(`proposition-${cible}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
    return () => clearTimeout(t);
  }, [cible, q.data]);

  if (compte.data && compte.data.actif === false) return <p className="p-8 text-[14px] text-ardoise">L'Assistant KPartners n'est pas encore allumé sur ce serveur.</p>;
  if (q.isError && /403|réservé/i.test(q.error?.message || "")) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;
  const liste = q.data?.propositions || [];
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-6 max-md:py-6">
      <header className="mb-8 flex flex-col items-center gap-6 text-center">
        <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">À valider</h1>
        <nav className="inline-flex max-w-full gap-1 self-center overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Les vues de la file">
          {vues.map(([k, mot, n]) => (
            <button key={k} type="button" onClick={() => setVue(k)} aria-pressed={vueEffective === k}
              className={`inline-flex h-9 flex-none items-center gap-2 rounded-full border-0 px-4 text-[14px] transition-colors ${vueEffective === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
              style={vueEffective === k ? undefined : { background: "transparent" }}>
              {mot}{n > 0 && <span className={`text-[12px] tabular-nums ${vueEffective === k ? "opacity-70" : "text-menthe"}`}>{n}</span>}
            </button>
          ))}
        </nav>
        <p className="-mt-2 m-0 max-w-[56ch] text-[14px] text-ardoise">Ce que l'Assistant KPartners a préparé. Rien ne part sans votre clic : un mail, une ligne Twenty CRM, un dossier rattaché.</p>
      </header>

      {q.isLoading ? <Chargement taille="grand" /> : liste.length ? (
        <div key={vueEffective} className="flex flex-col gap-4 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-1">
          {liste.map((p) => (
            <div key={p.id} id={`proposition-${p.id}`} className={cible === p.id ? "rounded-[18px] ring-1 ring-menthe/60" : ""}>
              <CarteProposition proposition={p} moi={String(user?.email || "").toLowerCase()} enCours={gestes.enCours(p.id)}
                onValider={({ charge = null, choix = null, motif = null, categorie = null } = {}) => gestes.valider.mutate({ id: p.id, charge, choix, motif, categorie })}
                onRejeter={(motif) => gestes.rejeter.mutate({ id: p.id, motif })}
                onPrendre={!p.pour ? () => gestes.prendre.mutate({ id: p.id }) : null} />
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 py-16 text-center text-[14px] text-brume">
          {vueEffective === "moi" ? "Rien à valider pour vous : Assistant KPartners vous préviendra." : vueEffective === "commun" ? "Rien dans le Commun." : "Rien à valider."}
        </p>
      )}

      {compte.data?.peut_tout && <TachesEnPause />}
    </div>
  );
}

/** Jules seul : les tâches en pause après une coupure pendant une action, à vérifier à la main. */
function TachesEnPause() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["haka-suivi", 7], queryFn: () => base44.request("GET", "/api/monitoring/haka?jours=7"), refetchInterval: 120_000, retry: false });
  const lever = useMutation({
    mutationFn: ({ id, relancer }) => base44.request("POST", `/api/haka/taches/${id}/lever-pause`, { body: { relancer } }),
    onSuccess: () => { toast.success("Pause levée"); qc.invalidateQueries({ queryKey: ["haka-suivi"] }); qc.invalidateQueries({ queryKey: ["haka"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const enPause = (q.data?.recentes || []).filter((t) => t.etat === "en_pause");
  if (!enPause.length) return null;
  return (
    <section className="mt-10 rounded-[16px] border border-ambre/40 px-5 py-4">
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-ambre">Actions incertaines</p>
      <p className="m-0 mt-1 text-[13.5px] text-craie">Le serveur a redémarré pendant ces actions. Vérifiez dans les Envoyés si elles sont parties, puis dites-le.</p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {enPause.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 text-[13.5px]">
            <span className="text-encre">{t.type} · {t.etape}{t.dossier ? ` · dossier ${t.dossier.slice(0, 8)}` : ""}</span>
            <span className="flex gap-2">
              <button type="button" disabled={lever.isPending} onClick={() => lever.mutate({ id: t.id, relancer: true })} className="h-8 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>{lever.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pas partie : à revalider"}</button>
              <button type="button" disabled={lever.isPending} onClick={() => lever.mutate({ id: t.id, relancer: false })} className="h-8 rounded-full bg-menthe px-3 text-[12.5px] text-sur-menthe hover:bg-menthe-survol">Partie : continuer</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
