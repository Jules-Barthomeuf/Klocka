import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { EnTeteAlx, PILES, Pastille, quand } from "@/components/alx/alx-commun";

// Les cibles, en quatre piles. C'est le tableau par étape : ce qu'on fait
// cette semaine à gauche, ce qu'on écarte à droite, et pourquoi.

export default function ALX() {
  const user = useUser();
  const [ville, setVille] = useState("");

  const { data: etat } = useQuery({ queryKey: ["alx-etat"], queryFn: () => base44.request("GET", "/api/alx/etat"), staleTime: 30000 });
  const { data: villes = [] } = useQuery({ queryKey: ["alx-villes"], queryFn: () => base44.request("GET", "/api/alx/villes") });
  const { data: cibles = [], isLoading } = useQuery({
    queryKey: ["alx-cibles", ville],
    queryFn: () => base44.request("GET", `/api/alx/cibles${ville ? `?ville=${ville}` : ""}`),
  });

  if (!user || user.role !== "admin") return null;

  const a = etat?.a_faire || {};

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1180px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <EnTeteAlx
          titre="Cibles"
          sous={
            a.a_appeler || a.a_ecrire
              ? `${a.a_appeler} à appeler cette semaine, ${a.a_ecrire} à écrire, ${a.relances_dues} relance${a.relances_dues > 1 ? "s" : ""} due${a.relances_dues > 1 ? "s" : ""}.`
              : "Une ville, ses rues, ses commerces, leurs propriétaires. Chaque cible est rangée dans une pile avec la phrase qui dit pourquoi."
          }
          droite={
            villes.length > 0 && (
              <select
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                className="bg-transparent border border-bord text-[13px] text-craie px-3 py-2 outline-none focus:border-menthe"
              >
                <option value="">Toutes les villes</option>
                {villes.map((v) => (
                  <option key={v.id} value={v.id}>{v.nom} · {v.cibles?.total || 0}</option>
                ))}
              </select>
            )
          }
        />

        {villes.length === 0 && !isLoading && (
          <p className="m-0 text-[13.5px] text-brume">
            Aucune ville encore. <Link to="/ALXVilles" className="text-menthe hover:underline">Commencez par en ajouter une.</Link>
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {PILES.map((p) => {
            const dedans = cibles.filter((c) => (c.pile || "surveiller") === p.cle);
            return (
              <section key={p.cle} className="min-w-0">
                <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-trait">
                  <div>
                    <p className="m-0 text-[10.5px] tracking-[.18em] uppercase" style={{ color: p.teinte }}>{p.mot}</p>
                    <p className="m-0 mt-0.5 text-[11.5px] text-brume">{p.detail}</p>
                  </div>
                  <span className="text-[15px] tabular-nums font-light text-craie">{dedans.length}</span>
                </div>
                <div className="flex flex-col">
                  {dedans.map((c) => (
                    <Link
                      key={c.id}
                      to={`/ALXCible?id=${c.id}`}
                      className="group block py-3 border-b border-trait hover:bg-surface/60 transition-colors -mx-2 px-2"
                    >
                      <p className="m-0 text-[14px] leading-[1.4] text-craie group-hover:text-encre">
                        {c.enseigne || <span className="text-brume">Sans enseigne</span>}
                        {c.emplacement && <span className="ml-2 text-[10.5px] tracking-[.12em] text-brume">EMPL. {c.emplacement}</span>}
                      </p>
                      <p className="m-0 mt-0.5 text-[12px] text-ardoise truncate">{c.adresse}</p>
                      <p className="m-0 mt-1 text-[12px] text-brume leading-[1.5]">{c.motif || "Pas encore classée."}</p>
                      {c.prochaine_action && !c.deal_id && (
                        <p className="m-0 mt-1 text-[11.5px]" style={{ color: p.teinte }}>
                          {c.prochaine_action}{c.prochaine_action_le ? ` · ${quand(c.prochaine_action_le)}` : ""}
                        </p>
                      )}
                      {c.deal_id && <p className="m-0 mt-1 text-[11.5px] text-menthe">Dossier créé</p>}
                    </Link>
                  ))}
                  {dedans.length === 0 && <p className="m-0 py-3 text-[12.5px] text-brume">Rien ici.</p>}
                </div>
              </section>
            );
          })}
        </div>

        {etat?.outils && (
          <p className="mt-10 mb-0 text-[11.5px] leading-[1.7] text-brume border-t border-trait pt-5">
            Outils branchés : Data-B {etat.outils.data_b ? "oui" : "non"} · Pappers {etat.outils.pappers ? "oui" : "non, clé PAPPERS_API_KEY à poser"} ·
            Street View {etat.outils.street_view ? "oui" : "non, clé GOOGLE_MAPS_SERVEUR à poser"} · Monday {etat.outils.monday ? "oui" : "non"} · modèle {etat.outils.modele ? "oui" : "non"}.
          </p>
        )}
        <span className="hidden"><Pastille pile="appeler" /></span>
      </div>
    </div>
  );
}
