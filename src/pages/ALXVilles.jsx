import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "sonner";
import { X } from "lucide-react";
import { EnTeteAlx, Bouton, Champ } from "@/components/alx/alx-commun";

// Les villes et leurs rues. On donne une ville ; les rues se classent en
// emplacement 1 (solide, 700 000 à 1 000 000) ou 2 (petit budget, 300 000 à
// 500 000), par ALX quand Street View sera branché, à la main en attendant.

export default function ALXVilles() {
  const user = useUser();
  const qc = useQueryClient();
  const [nom, setNom] = useState("");
  const [cp, setCp] = useState("");
  const [rue, setRue] = useState({});

  const { data: villes = [] } = useQuery({ queryKey: ["alx-villes"], queryFn: () => base44.request("GET", "/api/alx/villes") });
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

  if (!user || user.role !== "admin") return null;

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1180px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <EnTeteAlx titre="Villes" sous="Une ville en entrée. Ses rues se classent en emplacement 1, le solide, ou 2, pour les budgets plus petits. Chaque rue porte un mot qui dit pourquoi." />

        <form
          onSubmit={(e) => { e.preventDefault(); if (nom.trim()) creer.mutate(); }}
          className="flex flex-wrap items-end gap-4 mb-10 pb-8 border-b border-trait"
        >
          <Champ label="Ville" value={nom} onChange={setNom} placeholder="Antibes" className="flex-1 min-w-[200px]" />
          <Champ label="Code postal" value={cp} onChange={setCp} placeholder="06600" className="w-[140px]" />
          <Bouton type="submit" principal disabled={!nom.trim() || creer.isPending}>Ajouter</Bouton>
        </form>

        {villes.length === 0 && <p className="m-0 text-[13.5px] text-brume">Aucune ville. Ajoutez-en une ci-dessus.</p>}

        <div className="flex flex-col gap-10">
          {villes.map((v) => (
            <section key={v.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                <div>
                  <h2 className="m-0 text-[20px] font-light text-encre">
                    {v.nom} {v.code_postal && <span className="text-brume text-[14px]">· {v.code_postal}</span>}
                  </h2>
                  <p className="m-0 mt-1 text-[12.5px] text-ardoise">
                    {v.cibles?.total || 0} cible{(v.cibles?.total || 0) > 1 ? "s" : ""}
                    {v.cibles?.appeler > 0 && <span className="text-alerte"> · {v.cibles.appeler} à appeler</span>}
                    {v.cibles?.ecrire > 0 && <span className="text-ambre"> · {v.cibles.ecrire} à écrire</span>}
                    {" · "}
                    <Link to={`/ALX`} className="text-menthe hover:underline">voir les cibles</Link>
                  </p>
                </div>
                <button
                  onClick={() => { if (window.confirm(`Retirer ${v.nom} et toutes ses cibles ?`)) supprimer.mutate(v.id); }}
                  className="text-[11px] tracking-[.14em] uppercase text-brume hover:text-alerte transition-colors"
                >
                  Retirer
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
                {[1, 2].map((classe) => {
                  const rues = (v.rues || []).filter((r) => r.classe === classe);
                  return (
                    <div key={classe}>
                      <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase text-brume">
                        Emplacement {classe} <span className="text-bord-vif">· {classe === 1 ? "700 000 à 1 000 000" : "300 000 à 500 000"}</span>
                      </p>
                      <div className="flex flex-col">
                        {rues.map((r) => (
                          <div key={r.nom} className="group flex items-baseline gap-3 py-2 border-t border-trait">
                            <span className="text-[14px] text-craie flex-1 min-w-0 truncate">{r.nom}</span>
                            {r.motif && <span className="text-[12px] text-brume truncate max-w-[40%]">{r.motif}</span>}
                            <button onClick={() => retirer.mutate({ id: v.id, nom: r.nom })} className="opacity-0 group-hover:opacity-100 text-brume hover:text-alerte transition-opacity" title="Retirer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {rues.length === 0 && <p className="m-0 py-2 text-[12.5px] text-brume border-t border-trait">Aucune rue.</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); const n = (rue[v.id] || "").trim(); if (n) classer.mutate({ id: v.id, nom: n, classe: Number(rue[`${v.id}-classe`] || 1) }); }}
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <Champ label="Ajouter une rue" value={rue[v.id] || ""} onChange={(x) => setRue((r) => ({ ...r, [v.id]: x }))} placeholder="Avenue Marceau" className="flex-1 min-w-[220px]" />
                <label className="block w-[150px]">
                  <span className="block text-[10.5px] tracking-[.18em] uppercase text-brume mb-1.5">Emplacement</span>
                  <select value={rue[`${v.id}-classe`] || 1} onChange={(e) => setRue((r) => ({ ...r, [`${v.id}-classe`]: e.target.value }))} className="w-full bg-transparent border-b border-bord py-2 text-[14px] text-encre outline-none focus:border-menthe">
                    <option value={1}>1 · solide</option>
                    <option value={2}>2 · petit budget</option>
                  </select>
                </label>
                <Bouton type="submit" disabled={!(rue[v.id] || "").trim()}>Classer</Bouton>
              </form>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
