import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "sonner";
import { X } from "lucide-react";
import { EnTeteAlx, Carte, Bouton, Champ } from "@/components/alx/alx-commun";

// Les villes et leurs rues. On donne une ville ; ses rues se classent en
// emplacement 1 (solide, 700 000 à 1 000 000) ou 2 (petit budget, 300 000 à
// 500 000), par ALX quand Street View sera branché, à la main en attendant.

const EMPLACEMENTS = [
  { classe: 1, teinte: "var(--k-menthe)", fourchette: "700 000 – 1 000 000 €" },
  { classe: 2, teinte: "#7896EB", fourchette: "300 000 – 500 000 €" },
];

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
      <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-20">
        <EnTeteAlx titre="Villes" sous="Une ville en entrée. Ses rues se classent en emplacement 1, le solide, ou 2, pour les budgets plus petits." />

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
                  <h2 className="m-0 text-[20px] font-semibold tracking-[-.01em] text-encre">
                    {v.nom} {v.code_postal && <span className="text-brume text-[14px] font-normal">· {v.code_postal}</span>}
                  </h2>
                  <p className="m-0 mt-1 text-[12.5px] text-ardoise">
                    {v.cibles?.total || 0} cible{(v.cibles?.total || 0) > 1 ? "s" : ""}
                    {v.cibles?.appeler > 0 && <span style={{ color: "#E8B278" }}> · {v.cibles.appeler} à appeler</span>}
                    {v.cibles?.ecrire > 0 && <span style={{ color: "#7896EB" }}> · {v.cibles.ecrire} à écrire</span>}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <Link to={`/ALX?ville=${v.id}`} className="text-[13px] text-menthe hover:text-menthe-clair">Ouvrir dans Cibles →</Link>
                  <button
                    onClick={() => { if (window.confirm(`Retirer ${v.nom} et toutes ses cibles ?`)) supprimer.mutate(v.id); }}
                    className="text-[11px] tracking-[.14em] uppercase text-brume hover:text-alerte transition-colors"
                  >
                    Retirer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EMPLACEMENTS.map((e) => {
                  const rues = (v.rues || []).filter((r) => r.classe === e.classe);
                  return (
                    <Carte key={e.classe} className="flex flex-col gap-[18px] !p-6">
                      <div className="flex items-baseline justify-between">
                        <div className="text-[10px] tracking-[.16em] uppercase font-semibold" style={{ color: e.teinte }}>Emplacement {e.classe}</div>
                        <div className="text-[12px] text-brume">{e.fourchette}</div>
                      </div>
                      <div className="flex flex-col">
                        {rues.map((r) => (
                          <div key={r.nom} className="group grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center py-3 border-t border-white/[0.05] first:border-t-0">
                            <div className="min-w-0">
                              <div className="text-[14px] text-craie truncate">{r.nom}</div>
                              {r.motif && <div className="text-[12px] text-brume truncate">{r.motif}</div>}
                            </div>
                            <span className="text-[12px] text-ardoise text-right">{v.cibles_par_rue?.[r.nom] || 0} cible{(v.cibles_par_rue?.[r.nom] || 0) > 1 ? "s" : ""}</span>
                            <button onClick={() => retirer.mutate({ id: v.id, nom: r.nom })} className="opacity-0 group-hover:opacity-100 text-brume hover:text-alerte transition-opacity" title="Retirer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {rues.length === 0 && <p className="m-0 py-3 text-[12.5px] text-brume border-t border-white/[0.05]">Aucune rue.</p>}
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
              {(v.rues || []).length > 0 && (
                <p className="m-0 mt-3 text-[12px] text-brume">Classement proposé par ALX quand Street View est branché, corrigé à la main en attendant.</p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
