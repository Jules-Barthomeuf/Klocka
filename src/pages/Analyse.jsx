import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Clock, MoreHorizontal, Pencil, Archive, RotateCcw, X, Folder, Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/avis";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";
import { J } from "@/design/jetons";

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
  // La recherche et le filtre par étape, au-dessus des cartes.
  const [recherche, setRecherche] = useState("");
  const [etapeFiltre, setEtapeFiltre] = useState(0); // 0 : toutes
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
    // Le recalcul se voit tout de suite : un toast qui attend, puis le verdict.
    onMutate: () => { toast.loading("Recalcul en cours…", { id: "recalcul", description: "Verdict, rendements et simulateur se mettent à jour." }); },
    onSuccess: (r, vars) => {
      const idx = r?.lot?.index ?? vars.index;
      setDossier((d) => {
        if (!d) return d;
        const lots = [...d.lots];
        lots[idx] = { ...lots[idx], ...r.lot, index: idx };
        return { ...d, lots, ...(r?.nom ? { nom: r.nom, titre: r.nom } : {}) };
      });
      const relance = r?.lot?.marche_relance && Date.now() - Date.parse(r.lot.marche_relance.le) < 60000;
      toast.success(`Verdict recalculé : ${r?.lot?.evaluation?.verdict || "—"}`, { id: "recalcul", description: relance ? "Nouvelle adresse : la lecture de marché (valeur locative, loyers, ventes…) se refait, quelques minutes." : undefined });
    },
    onError: (e) => toast.error(e?.message || "Recalcul impossible", { id: "recalcul", description: undefined }),
  });

  const enWorkflow = dealId || nouveau;
  const aRelancer = pipeline?.a_relancer || 0;

  // Cartes triées : par modification (récent d'abord), par étape (avancé
  // d'abord), ou groupées par admin (alphabétique puis récent).
  const dossiers = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    const liste = (pipeline?.dossiers || []).filter((d) => !d.archived)
      .filter((d) => !etapeFiltre || (d.etape_max || 1) === etapeFiltre)
      .filter((d) => !t || `${d.titre || ""} ${d.nom_fichier || ""} ${d.ville || ""} ${d.responsable || ""}`.toLowerCase().includes(t));
    const parMaj = (a, b) => String(b.maj_le || "").localeCompare(String(a.maj_le || ""));
    if (tri === "etape") return [...liste].sort((a, b) => (a.etape_max || 0) - (b.etape_max || 0) || parMaj(a, b));
    if (tri === "admin") {
      return [...liste].sort((a, b) =>
        String(a.responsable || "zzz").localeCompare(String(b.responsable || "zzz")) || parMaj(a, b));
    }
    return [...liste].sort(parMaj);
  }, [pipeline, tri, recherche, etapeFiltre]);
  const nbDossiers = (pipeline?.dossiers || []).filter((d) => !d.archived).length;

  return (
    <div className="relative min-h-screen text-encre w-full max-w-full overflow-x-hidden">
      {/* Une lumière dans le coin, en haut à gauche, sur le dossier ouvert. */}
      {enWorkflow && <div aria-hidden className="k-halo pointer-events-none absolute -left-[260px] -top-[260px] h-[680px] w-[900px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.13),transparent)" }} />}
      <div
        key={dealId || (nouveau ? "nouveau" : "accueil")}
        className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        {enWorkflow ? (
          <div className="max-w-6xl mx-auto">
            <button
              onClick={() => montrerDeal(null)}
              className="text-ardoise hover:text-encre text-xs flex items-center gap-1.5 mb-4 transition-colors"
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
              <div className="bg-surface border border-trait rounded-md p-8 text-center">
                <Loader2 className="w-6 h-6 text-ardoise animate-spin mx-auto mb-3" />
                <p className="text-ardoise text-sm">Ouverture du dossier…</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[1400px] mx-auto">
            {/* Bandeau : titre, relances, tri, nouveau dossier. */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div className="flex items-baseline gap-3">
                <h1 className="m-0 text-[26px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[22px]">Dossiers</h1>
                <span className="text-[13px] text-ardoise">{nbDossiers} dossier{nbDossiers > 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`text-[12.5px] ${aRelancer ? "text-alerte" : "text-ardoise"}`}>
                  {aRelancer} relance{aRelancer > 1 ? "s" : ""} en attente
                </span>
                <label className="relative inline-flex items-center gap-1.5 rounded-full border border-trait bg-surface-pleine px-3 py-1.5 text-[12.5px] text-craie">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-ardoise" />
                  <span>{TRIS.find((t) => t.id === tri)?.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-ardoise" />
                  <select aria-label="Trier" value={tri} onChange={(e) => setTri(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
                    {TRIS.map((t) => <option key={t.id} value={t.id}>Trier : {t.label}</option>)}
                  </select>
                </label>
                <button
                  onClick={() => setCreationOuverte(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[13px] text-sur-menthe transition-colors hover:bg-menthe-survol"
                >
                  <Plus className="w-3.5 h-3.5" /> Nouveau dossier
                </button>
              </div>
            </div>

            {/* Recherche et étapes, sur une ligne. */}
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-1.5 focus-within:border-bord-doux max-md:basis-full">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-ardoise" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un dossier" className="w-full border-none bg-transparent text-[13px] text-encre outline-none placeholder:text-brume" />
              </div>
              {[[0, "Toutes"], [2, "Pré-analyse"], [3, "Analyse"], [4, "Vidéo"], [5, "Plateforme"]].map(([v, mot]) => (
                <button key={v} type="button" onClick={() => setEtapeFiltre(v)}
                  className={`rounded-full px-3 py-[5px] text-[13px] transition-colors ${etapeFiltre === v ? "bg-encre text-fond" : "border border-trait bg-surface-pleine text-craie hover:border-bord-doux hover:text-encre"}`}>
                  {mot}
                </button>
              ))}
            </div>

            {/* Les cartes */}
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 text-ardoise animate-spin" />
              </div>
            ) : dossiers.length === 0 ? (
              <p className="text-brume text-sm text-center py-16">
                Aucun dossier — créez le premier avec « Nouveau dossier ».
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 pt-4">
                {dossiers.map((d) => (
                  <div
                    key={d.deal_id}
                    className="relative rounded-[14px] border border-trait bg-surface-pleine text-left transition-colors hover:border-bord-doux"
                  >
                    <button onClick={() => montrerDeal(d.deal_id)} className="block w-full px-4 py-3.5 text-left" style={{ background: "transparent" }}>
                      <div className="flex items-start gap-2 pr-6">
                        <Folder className="mt-[3px] h-[15px] w-[15px] flex-shrink-0 text-menthe" strokeWidth={1.7} />
                        <p className="m-0 line-clamp-2 text-[15.5px] font-medium leading-[1.3] tracking-[-0.01em] text-encre max-md:text-[15px]">
                          {d.titre || d.nom_fichier || d.deal_id}
                        </p>
                        {d.a_relancer && (
                          <span title="À relancer" className="mt-2 flex-shrink-0 text-alerte"><Clock className="w-4 h-4" /></span>
                        )}
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="flex items-center gap-1" aria-hidden>
                          {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-[3px] w-3 rounded-full ${n <= (d.etape_max || 1) ? "bg-menthe" : "bg-encre/[0.12]"}`} />)}
                        </span>
                        <span className="text-[12.5px]" style={{ color: d.statut === "abandonne" ? J["ardoise"] : J["menthe"] }}>
                          Étape {d.etape_max || 1} · {ETAPES_LIBELLES[(d.etape_max || 1) - 1]}
                          {d.statut === "abandonne" ? " · Abandonné" : ""}
                        </span>
                      </div>
                      <p className="m-0 mt-1.5 truncate text-[12.5px] text-ardoise">
                        {(d.responsables?.length ? d.responsables.join(", ") : (d.responsable || "—").split("@")[0])}
                        {d.maj_le ? ` · ${new Date(d.maj_le).toLocaleDateString("fr-FR")}` : ""}
                      </p>
                    </button>

                    {/* Renommer / abandonner */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuCarte(menuCarte === d.deal_id ? null : d.deal_id); }}
                      className="absolute top-3.5 right-3.5 text-ardoise hover:text-encre transition-colors"
                      aria-label="Actions" title="Actions" style={{ background: "transparent" }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {menuCarte === d.deal_id && (
                      <div className="absolute top-12 right-5 z-20 rounded-[14px] border border-trait bg-surface-pleine py-1.5 min-w-[190px] shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
                        <button
                          onClick={() => {
                            setMenuCarte(null);
                            const nom = window.prompt("Nouveau nom du dossier :", d.titre || "");
                            if (nom?.trim()) renommer.mutate({ id: d.deal_id, nom: nom.trim() });
                          }}
                          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06] transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Renommer
                        </button>
                        {(d.etape_max || 1) > 1 && (
                          <button
                            onClick={() => {
                              setMenuCarte(null);
                              if (window.confirm(`Ramener « ${d.titre} » à l'étape 1 ? Les documents et analyses sont conservés.`)) revenirEtape1.mutate(d.deal_id);
                            }}
                            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06] transition-colors"
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
                            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-alerte hover:bg-alerte/[0.08] transition-colors"
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
            <div className="w-full max-w-md bg-surface border border-trait rounded-lg p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="m-0 text-[18px] font-medium">Nouveau dossier</h3>
                <button onClick={() => setCreationOuverte(false)} className="text-ardoise hover:text-encre transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <label className="block text-[11px] tracking-[0.14em] uppercase text-ardoise mb-1.5">Nom du dossier</label>
              <input
                autoFocus
                value={nomDossier}
                onChange={(e) => setNomDossier(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nomDossier.trim()) creerDossier.mutate(); }}
                placeholder="Ex. : Boulangerie — Marseille République"
                className="w-full bg-surface border border-trait focus:border-menthe rounded-md px-3.5 py-2.5 text-[13.5px] text-encre outline-none placeholder:text-bord-vif transition-colors mb-4"
              />

              <label className="block text-[11px] tracking-[0.14em] uppercase text-ardoise mb-1.5">Admins responsables</label>
              <div className="flex flex-wrap gap-2 mb-5">
                {ADMINS.map((a) => {
                  const actif = adminsChoisis.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => setAdminsChoisis((l) => (actif ? l.filter((x) => x !== a) : [...l, a]))}
                      className={`px-3.5 py-1.5 rounded-full text-[12.5px] border transition-colors
                        ${actif ? "bg-menthe/[0.15] border-menthe text-menthe-clair" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2.5">
                <button onClick={() => setCreationOuverte(false)}
                  className="bg-transparent border border-encre/[0.14] text-craie rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-encre/[0.06] transition-colors">
                  Annuler
                </button>
                <button
                  onClick={() => creerDossier.mutate()}
                  disabled={!nomDossier.trim() || creerDossier.isPending}
                  className="inline-flex items-center gap-2 bg-menthe text-sur-menthe rounded-full px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50 hover:bg-menthe-survol transition-colors"
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
