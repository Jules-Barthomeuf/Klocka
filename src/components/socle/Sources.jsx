import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Switch } from "@/components/ui/switch";
import Chargement from "@/components/ui/Chargement";

// Paramètres › Sources (18 oct. 2026, lot 1 de la boîte à outils de Haka) : l'interrupteur de la boîte,
// chaque source avec son interrupteur et son poids, réglables sans redéployer, et l'état de l'entrepôt
// (jeux importés, communes à jour, échecs). Jules seul règle ; l'équipe lit.

const FAMILLES = [["interne", "Klocka"], ["payante", "Payantes"], ["collecte", "Collecte"], ["publique", "Publiques"]];
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "jamais");

export default function Sources({ peutRegler = false }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["socle-sources"], queryFn: () => base44.request("GET", "/api/socle/sources") });
  const fini = () => qc.invalidateQueries({ queryKey: ["socle-sources"] });
  const regler = useMutation({
    mutationFn: ({ cle, ...corps }) => base44.request("POST", `/api/socle/sources/${cle}`, { body: corps }),
    onSuccess: fini, onError: (e) => toast.error(e?.message || "Réglage impossible"),
  });
  const interrupteur = useMutation({
    mutationFn: (actif) => base44.request("POST", "/api/socle/interrupteur", { body: { actif } }),
    onSuccess: fini, onError: (e) => toast.error(e?.message || "Réglage impossible"),
  });
  if (q.isLoading) return <Chargement taille="petit" />;
  if (q.isError) return <p className="m-0 text-[14px] text-alerte">{q.error?.message || "Sources illisibles."}</p>;
  const { boite_outils: active, sources = [], entrepot = [] } = q.data || {};

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-center justify-between gap-4 rounded-[16px] border border-trait bg-rail px-5 py-4">
        <div>
          <p className="m-0 text-[15px] text-encre">Boîte à outils de l'Assistant KPartners</p>
          <p className="m-0 mt-1 text-[13px] text-ardoise">Allumée, le socle tourne : identifiant de local, imports de la nuit sur les Alpes-Maritimes. Éteinte, les outils restent tels qu'avant.</p>
        </div>
        <Switch checked={!!active} disabled={!peutRegler || interrupteur.isPending} onCheckedChange={(v) => interrupteur.mutate(v)} aria-label="Allumer la boîte à outils" />
      </section>

      {FAMILLES.map(([famille, titre]) => {
        const liste = sources.filter((s) => s.famille === famille);
        if (!liste.length) return null;
        return (
          <section key={famille} className="rounded-[16px] border border-trait bg-rail">
            <p className="m-0 px-5 pt-4 pb-2 text-[13px] text-ardoise">{titre}</p>
            {liste.map((s) => (
              <div key={s.cle} className="grid grid-cols-[minmax(0,1fr)_110px_44px] items-center gap-4 border-t border-trait px-5 py-3 max-md:grid-cols-[minmax(0,1fr)_44px]">
                <div className="min-w-0">
                  <p className={`m-0 text-[14.5px] ${s.actif ? "text-encre" : "text-brume line-through"}`}>{s.nom}</p>
                  <p className="m-0 mt-0.5 text-[12px] text-brume">{s.licence} · {s.rythme}{s.regle_par ? ` · réglé par ${s.regle_par.split("@")[0]} le ${jour(s.regle_le)}` : ""}</p>
                </div>
                <label className="flex items-center gap-2 text-[12.5px] text-ardoise max-md:hidden">
                  {s.poids != null ? (
                    <>Poids
                      <input type="number" min="0" step="0.5" defaultValue={s.poids} disabled={!peutRegler}
                        onBlur={(e) => { const v = Number(e.target.value); if (v !== s.poids) regler.mutate({ cle: s.cle, poids: v }); }}
                        className="w-[56px] rounded-[8px] border border-bord-doux bg-transparent px-2 py-1 text-[13px] tabular-nums text-encre outline-none focus:border-menthe" />
                    </>
                  ) : <span className="text-brume">—</span>}
                </label>
                <Switch checked={!!s.actif} disabled={!peutRegler || regler.isPending} onCheckedChange={(v) => regler.mutate({ cle: s.cle, actif: v })} aria-label={`${s.actif ? "Couper" : "Activer"} ${s.nom}`} />
              </div>
            ))}
          </section>
        );
      })}

      <section className="rounded-[16px] border border-trait bg-rail">
        <p className="m-0 px-5 pt-4 pb-2 text-[13px] text-ardoise">Entrepôt de données (Alpes-Maritimes)</p>
        {entrepot.map((j) => (
          <div key={j.cle} className="flex items-baseline justify-between gap-4 border-t border-trait px-5 py-3">
            <div className="min-w-0">
              <p className="m-0 text-[14.5px] text-encre">{j.nom}</p>
              <p className="m-0 mt-0.5 text-[12px] text-brume">{j.mode === "import" ? `importé la nuit, tous les ${j.rythme_jours} jours` : "lu à la demande, par local"} · {j.licence}</p>
              {j.echecs?.length > 0 && <p className="m-0 mt-0.5 text-[12px] text-alerte">{j.echecs.length} échec{j.echecs.length > 1 ? "s" : ""}, dernier : {j.echecs[j.echecs.length - 1].erreur}</p>}
            </div>
            <span className="flex-none text-right text-[12.5px] tabular-nums text-ardoise">
              {j.mode === "import" ? `${j.a_jour} / ${j.attendu ?? "—"} à jour` : "à la demande"}
              <span className="block text-[11.5px] text-brume">{j.lignes ? `${j.lignes.toLocaleString("fr-FR")} lignes · ` : ""}{jour(j.dernier_import)}</span>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
