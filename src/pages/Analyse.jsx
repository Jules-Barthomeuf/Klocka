import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Clock, MoreHorizontal, Pencil, Archive, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";

// Dossiers — chaque dossier suit six étapes : Mail → Pré-analyse → Analyse →
// Vidéo → Plateforme → Présentation. La liste présente des cartes simples
// (nom, étape atteinte, responsable), triables ; « Nouveau dossier » démarre
// à l'étape 1 ; ?deal_id= rouvre un dossier en cours.

const ETAPES_LIBELLES = ["Mail", "Pré-analyse", "Analyse", "Vidéo", "Plateforme", "Présentation"];

// Les admins proposés à la création d'un dossier.
const ADMINS = ["Jules", "Maxime", "Paul", "Coralie", "Nora"];

const TRIS = [
  { id: "maj", label: "Dernière modification" },
  { id: "etape", label: "Étape" },
  { id: "admin", label: "Admin" },
];

export default function Analyse() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dealId = params.get("deal_id");
  const nouveau = params.get("nouveau") === "1";
  const [tri, setTri] = useState("maj");
  // Création d'un dossier nommé : nom + responsables, avant toute analyse.
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [nomDossier, setNomDossier] = useState("");
  const [adminsChoisis, setAdminsChoisis] = useState([]);
  const [menuCarte, setMenuCarte] = useState(null); // deal_id du menu ⋯ ouvert

  const [dossier, setDossier] = useState(null);

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ["preanalyse-pipeline"],
    queryFn: () => base44.request("GET", "/api/preanalyse/pipeline"),
    refetchOnWindowFocus: true,
  });

  const montrerDeal = (id) => {
    const suivant = new URLSearchParams(params);
    suivant.delete("nouveau");
    if (id) suivant.set("deal_id", id);
    else suivant.delete("deal_id");
    setParams(suivant);
  };

  const creerDossier = useMutation({
    mutationFn: () =>
      base44.request("POST", "/api/preanalyse/dossiers", {
        body: { nom: nomDossier.trim(), responsables: adminsChoisis },
      }),
    onSuccess: (d) => {
      setCreationOuverte(false);
      setNomDossier("");
      setAdminsChoisis([]);
      rafraichirListes();
      montrerDeal(d.deal_id);
    },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });

  const renommer = useMutation({
    mutationFn: ({ id, nom }) => base44.request("POST", `/api/preanalyse/dossiers/${id}/renommer`, { body: { nom } }),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier renommé"); },
    onError: (e) => toast.error(e?.message || "Renommage impossible"),
  });

  const revenirEtape1 = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/preanalyse/dossiers/${id}/revenir`, { body: { etape: 1 } }),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier ramené à l'étape 1"); },
    onError: (e) => toast.error(e?.message || "Retour impossible"),
  });

  const abandonner = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/preanalyse/dossiers/${id}/abandonner`),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier abandonné"); },
    onError: (e) => toast.error(e?.message || "Abandon impossible"),
  });

  const rafraichirListes = () => {
    queryClient.invalidateQueries({ queryKey: ["preanalyse-pipeline"] });
  };

  const ouvrirDossier = useMutation({
    mutationFn: (id) => base44.request("GET", `/api/preanalyse/dossiers/${id}`),
    onSuccess: (d) => setDossier(d),
    onError: (e) => toast.error(e?.message || "Dossier introuvable"),
  });

  // Charge le dossier désigné par l'URL (liste, boîte de réception, lien).
  useEffect(() => {
    if (dealId && dossier?.deal_id !== dealId && !ouvrirDossier.isPending) {
      ouvrirDossier.mutate(dealId);
    }
    if (!dealId && !nouveau && dossier) setDossier(null);
  }, [dealId, nouveau]);

  const recharger = () => {
    if (dealId) ouvrirDossier.mutate(dealId);
    rafraichirListes();
  };

  const majLot = useMutation({
    mutationFn: ({ index, saisie }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${index}`, { body: saisie }),
    onSuccess: (r) => {
      setDossier((d) => {
        if (!d) return d;
        const lots = [...d.lots];
        lots[r.lot.index] = r.lot;
        return { ...d, lots };
      });
      toast.success("Verdict recalculé");
    },
    onError: (e) => toast.error(e?.message || "Recalcul impossible"),
  });

  const enWorkflow = dealId || nouveau;
  const aRelancer = pipeline?.a_relancer || 0;

  // Cartes triées : par modification (récent d'abord), par étape (avancé
  // d'abord), ou groupées par admin (alphabétique puis récent).
  const dossiers = useMemo(() => {
    const liste = (pipeline?.dossiers || []).filter((d) => !d.archived);
    const parMaj = (a, b) => String(b.maj_le || "").localeCompare(String(a.maj_le || ""));
    if (tri === "etape") return [...liste].sort((a, b) => (a.etape_max || 0) - (b.etape_max || 0) || parMaj(a, b));
    if (tri === "admin") {
      return [...liste].sort((a, b) =>
        String(a.responsable || "zzz").localeCompare(String(b.responsable || "zzz")) || parMaj(a, b));
    }
    return [...liste].sort(parMaj);
  }, [pipeline, tri]);

  return (
    <div className="bg-[#000000] min-h-screen text-[#f2f3f5] w-full max-w-full overflow-x-hidden">
      <div
        key={dealId || (nouveau ? "nouveau" : "accueil")}
        className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        {enWorkflow ? (
          <div className="max-w-6xl mx-auto">
            <button
              onClick={() => montrerDeal(null)}
              className="text-[#9298a6] hover:text-[#f2f3f5] text-xs flex items-center gap-1.5 mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Tous les dossiers
            </button>
            {nouveau && !dealId ? (
              <WorkflowDeal
                dossier={null}
                onAnalyse={(d) => {
                  setDossier(d);
                  montrerDeal(d.deal_id);
                  rafraichirListes();
                }}
              />
            ) : dossier?.deal_id === dealId ? (
              <WorkflowDeal
                dossier={dossier}
                enCours={majLot.isPending}
                onSaisie={(index, saisie) => majLot.mutate({ index, saisie })}
                onRefresh={recharger}
              />
            ) : (
              <div className="bg-[#000000] border border-[#1f2228] rounded-md p-8 text-center">
                <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin mx-auto mb-3" />
                <p className="text-[#9298a6] text-sm">Ouverture du dossier…</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[1120px] mx-auto">
            {/* Bandeau : titre, tri, relances, nouveau dossier. */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-5 border-b border-[#1f2228]">
              <div>
                <div className="text-[11px] tracking-[.16em] uppercase text-[#9298a6] mb-2.5">Pipeline</div>
                <h1 className="m-0 text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5]">Dossiers</h1>
                <p className="mt-2.5 mb-0 max-w-[52ch] text-[13.5px] leading-[1.65] text-[#9298a6]">
                  Du premier mail à l'agent jusqu'au dossier de présentation banque, en six étapes.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-none flex-wrap">
                <span className={`text-xs ${aRelancer ? "text-[#e8746a]" : "text-[#6a7180]"}`}>
                  {aRelancer} relance(s) en attente
                </span>
                <select
                  value={tri}
                  onChange={(e) => setTri(e.target.value)}
                  className="bg-[#0f1114] border border-[#22262d] rounded px-3 py-[8px] text-[13px] text-[#9298a6] outline-none hover:border-[#3a3f4a] transition-colors"
                >
                  {TRIS.map((t) => (
                    <option key={t.id} value={t.id}>Trier : {t.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setCreationOuverte(true)}
                  className="inline-flex items-center gap-2 px-4 py-[9px] text-[13px] text-[#0f1114] bg-[#f2f3f5] border border-[#f2f3f5] rounded hover:bg-[#c9cdd6] transition-colors"
                >
                  <Plus className="w-4 h-4" /> Nouveau dossier
                </button>
              </div>
            </div>

            {/* Les cartes */}
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin" />
              </div>
            ) : dossiers.length === 0 ? (
              <p className="text-[#6a7180] text-sm text-center py-16">
                Aucun dossier — créez le premier avec « Nouveau dossier ».
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
                {dossiers.map((d) => (
                  <div
                    key={d.deal_id}
                    className="relative text-left bg-[#0f1114] border border-[#1f2228] rounded-md hover:border-[#8fa0f2]/60 hover:bg-[#f2f3f5]/[0.03] transition-all"
                  >
                    <button onClick={() => montrerDeal(d.deal_id)} className="block w-full text-left px-4 py-4">
                      <div className="flex items-start justify-between gap-2 pr-6">
                        <p className="m-0 text-[14.5px] font-medium text-[#f2f3f5] leading-snug line-clamp-2">
                          {d.titre || d.nom_fichier || d.deal_id}
                        </p>
                        {d.a_relancer && (
                          <span title="À relancer" className="flex-shrink-0 mt-0.5 text-red-400"><Clock className="w-3.5 h-3.5" /></span>
                        )}
                      </div>
                      <p className="m-0 mt-2 text-[12px] text-[#aab6f5]">
                        Étape {d.etape_max || 1} · {ETAPES_LIBELLES[(d.etape_max || 1) - 1]}
                        {d.statut === "abandonne" ? " · Abandonné" : ""}
                      </p>
                      <p className="m-0 mt-1 text-[11.5px] text-[#6a7180] truncate">
                        {(d.responsables?.length ? d.responsables.join(", ") : (d.responsable || "—").split("@")[0])}
                        {d.maj_le ? ` · ${new Date(d.maj_le).toLocaleDateString("fr-FR")}` : ""}
                      </p>
                    </button>

                    {/* Renommer / abandonner */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuCarte(menuCarte === d.deal_id ? null : d.deal_id); }}
                      className="absolute top-3 right-2.5 text-[#6a7180] hover:text-[#f2f3f5] transition-colors"
                      title="Actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuCarte === d.deal_id && (
                      <div className="absolute top-9 right-2.5 z-20 bg-[#0f1114] border border-[#22262d] rounded-md py-1 min-w-[170px] shadow-xl">
                        <button
                          onClick={() => {
                            setMenuCarte(null);
                            const nom = window.prompt("Nouveau nom du dossier :", d.titre || "");
                            if (nom?.trim()) renommer.mutate({ id: d.deal_id, nom: nom.trim() });
                          }}
                          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-[#c9cdd6] hover:bg-[#f2f3f5]/[0.06] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Renommer
                        </button>
                        {(d.etape_max || 1) > 1 && (
                          <button
                            onClick={() => {
                              setMenuCarte(null);
                              if (window.confirm(`Ramener « ${d.titre} » à l'étape 1 ? Les documents et analyses sont conservés.`)) revenirEtape1.mutate(d.deal_id);
                            }}
                            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-[#c9cdd6] hover:bg-[#f2f3f5]/[0.06] transition-colors"
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Revenir à l'étape 1
                          </button>
                        )}
                        {d.statut !== "abandonne" && d.statut !== "projet_cree" && (
                          <button
                            onClick={() => {
                              setMenuCarte(null);
                              if (window.confirm(`Abandonner « ${d.titre} » ? Le dossier restera consultable.`)) abandonner.mutate(d.deal_id);
                            }}
                            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-red-300 hover:bg-red-500/[0.08] transition-colors"
                          >
                            <Archive className="w-3.5 h-3.5" /> Abandonner
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nouveau dossier : nom + responsables */}
        {creationOuverte && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setCreationOuverte(false)}>
            <div className="w-full max-w-md bg-[#0f1114] border border-[#1f2228] rounded-lg p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="m-0 text-[17px] font-medium">Nouveau dossier</h3>
                <button onClick={() => setCreationOuverte(false)} className="text-[#9298a6] hover:text-[#f2f3f5] transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <label className="block text-[11px] tracking-[0.14em] uppercase text-[#9298a6] mb-1.5">Nom du dossier</label>
              <input
                autoFocus
                value={nomDossier}
                onChange={(e) => setNomDossier(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nomDossier.trim()) creerDossier.mutate(); }}
                placeholder="Ex. : Boulangerie — Marseille République"
                className="w-full bg-[#000000] border border-[#1f2228] focus:border-[#8fa0f2] rounded-md px-3.5 py-2.5 text-[14px] text-[#f2f3f5] outline-none placeholder:text-[#3a3f4a] transition-colors mb-4"
              />

              <label className="block text-[11px] tracking-[0.14em] uppercase text-[#9298a6] mb-1.5">Admins responsables</label>
              <div className="flex flex-wrap gap-2 mb-5">
                {ADMINS.map((a) => {
                  const actif = adminsChoisis.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => setAdminsChoisis((l) => (actif ? l.filter((x) => x !== a) : [...l, a]))}
                      className={`px-3.5 py-1.5 rounded-full text-[13px] border transition-colors
                        ${actif ? "bg-[#8fa0f2]/[0.15] border-[#8fa0f2] text-[#aab6f5]" : "border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"}`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2.5">
                <button onClick={() => setCreationOuverte(false)}
                  className="bg-transparent border border-[#f2f3f5]/[0.14] text-[#c9cdd6] rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-[#f2f3f5]/[0.06] transition-colors">
                  Annuler
                </button>
                <button
                  onClick={() => creerDossier.mutate()}
                  disabled={!nomDossier.trim() || creerDossier.isPending}
                  className="inline-flex items-center gap-2 text-[#0f1114] rounded-md px-5 py-2.5 text-[13.5px] font-bold disabled:opacity-50 hover:brightness-95 transition-all"
                  style={{ background: "#f2f3f5" }}
                >
                  {creerDossier.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Création…</> : "Créer le dossier"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
