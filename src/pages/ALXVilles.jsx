import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { X } from "lucide-react";
import { EnTeteAlx, Carte, Bouton, Champ, EMPLACEMENTS } from "@/components/alx/alx-commun";

// Les villes et leurs rues. On donne une ville ; ses rues se classent en
// emplacement 1 (solide, 700 000 à 1 000 000), 1 bis (la rue qui tient le 1
// sans en avoir le loyer) ou 2 (petit budget, 300 000 à 500 000), par ALX
// d'après le loyer de marché, à la main quand l'équipe sait mieux.

export default function ALXVilles() {
  const user = useUser();
  const qc = useQueryClient();
  // Ouverte depuis une ville, la page ne montre que ses rues.
  const [params] = useSearchParams();
  const seulement = params.get("ville");
  const [nom, setNom] = useState("");
  const [cp, setCp] = useState("");
  const [rue, setRue] = useState({});

  const { data: villes = [] } = useQuery({
    queryKey: ["alx-villes"],
    queryFn: () => base44.request("GET", "/api/alx/villes"),
    refetchInterval: (q) => ((q.state.data || []).some((v) => v.parcours?.etat === "en_cours") ? 4000 : false),
  });
  const invalider = () => qc.invalidateQueries({ queryKey: ["alx-villes"] });

  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/alx/villes", { body: { nom, code_postal: cp } }),
    onSuccess: (r) => { toast.success(r.deja ? "Cette ville existe déjà" : `${r.ville.nom} ajoutée`); setNom(""); setCp(""); invalider(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const classer = useMutation({
    mutationFn: ({ id, nom, classe }) => base44.request("POST", `/api/alx/villes/${id}/rues`, { body: { nom, classe } }),
    onSuccess: (_, v) => { setRue((r) => ({ ...r, [v.id]: "" })); invalider(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const retirer = useMutation({
    mutationFn: ({ id, nom }) => base44.request("DELETE", `/api/alx/villes/${id}/rues/${encodeURIComponent(nom)}`),
    onSuccess: invalider,
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/alx/villes/${id}`),
    onSuccess: () => { toast.success("Ville retirée, avec ses cibles"); invalider(); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
  });
  const lancer = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/alx/villes/${id}/lancer`, { body: {} }),
    onSuccess: () => { toast.success("ALX est parti"); invalider(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const parcourir = useMutation({
    mutationFn: ({ id, nom }) => base44.request("POST", `/api/alx/villes/${id}/rues/${encodeURIComponent(nom)}/parcourir`, { body: {} }),
    onSuccess: (_, v) => { toast.success(`ALX parcourt ${v.nom}`); invalider(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!user || user.role !== "admin") return null;

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-20">
        {seulement ? (
          <Link to={`/ALX?ville=${seulement}`} className="inline-block mb-5 text-[12.5px] text-menthe hover:text-menthe-clair">← Retour à la ville</Link>
        ) : (
          <EnTeteAlx titre="Rues" sous="Les rues de chaque ville, en emplacement 1, le solide, ou 2, pour les budgets plus petits. ALX propose, l'équipe corrige." />
        )}

        {!seulement && <form
          onSubmit={(e) => { e.preventDefault(); if (nom.trim()) creer.mutate(); }}
          className="flex flex-wrap items-end gap-4 mb-10 pb-8 border-b border-trait"
        >
          <Champ label="Ville" value={nom} onChange={setNom} placeholder="Antibes" className="flex-1 min-w-[200px]" />
          <Champ label="Code postal" value={cp} onChange={setCp} placeholder="06600" className="w-[140px]" />
          <Bouton type="submit" principal disabled={!nom.trim() || creer.isPending}>Ajouter</Bouton>
        </form>}

        {villes.length === 0 && <p className="m-0 text-[13.5px] text-brume">Aucune ville. Ajoutez-en une ci-dessus.</p>}

        <div className="flex flex-col gap-10">
          {villes.filter((v) => !seulement || v.id === seulement).map((v) => (
            <section key={v.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                <div>
                  <h2 className="m-0 text-[24px] font-semibold tracking-[-.02em] text-encre">
                    {v.nom} {v.code_postal && <span className="text-brume text-[13.5px] font-normal">· {v.code_postal}</span>}
                  </h2>
                  <p className="m-0 mt-1 text-[12.5px] text-ardoise">
                    {v.cibles?.total || 0} cible{(v.cibles?.total || 0) > 1 ? "s" : ""}
                    {v.cibles?.appeler > 0 && <span style={{ color: "#E8B278" }}> · {v.cibles.appeler} à appeler</span>}
                    {v.cibles?.ecrire > 0 && <span style={{ color: "#7896EB" }}> · {v.cibles.ecrire} à écrire</span>}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {v.parcours?.etat === "en_cours" ? (
                    <span className="inline-flex items-center gap-2 text-[12.5px] text-menthe"><span className="w-[7px] h-[7px] rounded-full bg-menthe animate-pulse" />ALX en cours{v.parcours.rue_en_cours ? ` · ${v.parcours.rue_en_cours}` : ""}</span>
                  ) : (
                    <Bouton onClick={() => lancer.mutate(v.id)} disabled={lancer.isPending}>{v.parcours?.etat ? "Relancer ALX" : "Lancer ALX"}</Bouton>
                  )}
                  <Link to={`/ALX?ville=${v.id}`} className="text-[12.5px] text-menthe hover:text-menthe-clair">Ouvrir dans Cibles →</Link>
                  <button
                    onClick={() => { if (window.confirm(`Retirer ${v.nom} et toutes ses cibles ?`)) supprimer.mutate(v.id); }}
                    className="text-[11px] tracking-[.14em] uppercase text-brume hover:text-alerte transition-colors"
                  >
                    Retirer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {EMPLACEMENTS.map((e) => {
                  const rues = (v.rues || []).filter((r) => r.classe === e.classe);
                  return (
                    <Carte key={e.classe} className="flex flex-col gap-[18px] !p-6 !rounded-[18px]">
                      <div className="flex items-baseline justify-between">
                        <div className="text-[11px] tracking-[.16em] uppercase font-semibold" style={{ color: e.teinte }}>Emplacement {e.mot}</div>
                        <div className="text-[12.5px] text-brume">{e.fourchette}</div>
                      </div>
                      <div className="flex flex-col">
                        {rues.map((r) => (
                          <div key={r.nom} className="group grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 items-center py-3 border-t border-trait first:border-t-0">
                            <div className="min-w-0">
                              <div className="text-[13.5px] text-craie truncate">
                                {r.nom}
                                {r.par === "alx" && <span className="ml-2 text-[11px] tracking-[.12em] uppercase text-brume">proposée par ALX</span>}
                              </div>
                              {r.motif && <div className="text-[12.5px] text-brume truncate">{r.motif}{r.parcourue_le ? ` · parcourue le ${new Date(r.parcourue_le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}` : ""}</div>}
                            </div>
                            <span className="text-[12.5px] text-ardoise text-right">{v.cibles_par_rue?.[r.nom] || 0} cible{(v.cibles_par_rue?.[r.nom] || 0) > 1 ? "s" : ""}</span>
                            {v.parcours?.etat !== "en_cours" && (
                              <button onClick={() => parcourir.mutate({ id: v.id, nom: r.nom })} disabled={parcourir.isPending} className="opacity-0 group-hover:opacity-100 text-[11px] text-menthe hover:text-menthe-clair transition-opacity whitespace-nowrap" aria-label="Parcourir cette rue seule" title="Parcourir cette rue seule">
                                {r.parcourue_le ? "Repasser" : "Parcourir"}
                              </button>
                            )}
                            <button onClick={() => retirer.mutate({ id: v.id, nom: r.nom })} className="opacity-0 group-hover:opacity-100 text-brume hover:text-alerte transition-opacity" aria-label="Retirer" title="Retirer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {rues.length === 0 && <p className="m-0 py-3 text-[12.5px] text-brume border-t border-trait">Aucune rue.</p>}
                      </div>
                      <form
                        onSubmit={(ev) => { ev.preventDefault(); const n = (rue[`${v.id}-${e.classe}`] || "").trim(); if (n) classer.mutate({ id: v.id, nom: n, classe: e.classe }); }}
                        className="flex gap-2.5"
                      >
                        <Champ value={rue[`${v.id}-${e.classe}`] || ""} onChange={(x) => setRue((r) => ({ ...r, [`${v.id}-${e.classe}`]: x }))} placeholder="Nom de la rue" className="flex-1" />
                        <Bouton type="submit" disabled={!(rue[`${v.id}-${e.classe}`] || "").trim()}>Classer</Bouton>
                      </form>
                    </Carte>
                  );
                })}
              </div>
              {(v.rues_ecartees || []).length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12.5px] text-ardoise hover:text-encre">
                    {v.rues_ecartees.length} rue{v.rues_ecartees.length > 1 ? "s" : ""} écartée{v.rues_ecartees.length > 1 ? "s" : ""} par ALX, avec leur motif
                  </summary>
                  <div className="mt-2 flex flex-col">
                    {v.rues_ecartees.map((r) => (
                      <div key={r.nom} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-2 border-t border-trait text-[12.5px]">
                        <div className="min-w-0 truncate"><span className="text-craie">{r.nom}</span><span className="text-brume"> · {r.motif}</span></div>
                        <button onClick={() => classer.mutate({ id: v.id, nom: r.nom, classe: 2 })} className="text-[11px] text-menthe hover:text-menthe-clair whitespace-nowrap">Classer en 2</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {(v.rues || []).length > 0 && (
                <p className="m-0 mt-3 text-[12.5px] text-brume">
                  {v.recensement?.le
                    ? `Proposé par ALX le ${new Date(v.recensement.le).toLocaleDateString("fr-FR")} : ${v.recensement.commerces_total} vitrines sur ${v.recensement.rayon_km || 1.5} km autour du centre. Corrigez, ALX suit.`
                    : "Classement à la main. Lancez ALX pour qu'il propose les rues du centre avec leur loyer de marché."}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
