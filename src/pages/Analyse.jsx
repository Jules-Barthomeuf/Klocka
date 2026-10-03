import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Clock, MoreHorizontal, Pencil, Archive, RotateCcw, Trash2, X, UserRound, Folder, Search, SlidersHorizontal, ChevronDown, MessagesSquare, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/avis";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { J } from "@/design/jetons";
import { Conversation, Resume } from "@/components/conversations/EspaceConversations";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import DecisionMandataire from "@/components/mandataire/DecisionMandataire";

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
  // Changer les responsables d'un dossier : le dossier visé et la sélection en cours.
  const [proprio, setProprio] = useState(null); // { deal_id, titre, choix: [] }

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

  const changerResponsables = useMutation({
    mutationFn: ({ id, responsables }) => base44.request("POST", `/api/preanalyse/dossiers/${id}/responsables`, { body: { responsables } }),
    onSuccess: (r) => { rafraichirListes(); setProprio(null); toast.success(`Responsable${r.responsables.length > 1 ? "s" : ""} : ${r.responsables.join(", ")}`); },
    onError: (e) => toast.error(e?.message || "Changement impossible"),
  });

  const abandonner = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/preanalyse/dossiers/${id}/abandonner`),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier abandonné"); },
    onError: (e) => toast.error(e?.message || "Abandon impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${id}`),
    onSuccess: () => {
      rafraichirListes();
      queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["fiches-commerciales"] });
      queryClient.invalidateQueries({ queryKey: ["k-conversations"] });
      toast.success("Dossier supprimé");
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
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
  // Un dossier venu d'un mandataire s'ouvre sur sa conversation ; l'analyse est
  // une autre page (`vue=analyse`), d'où l'on revient à la conversation.
  const { data: conversationsK } = useQuery({ queryKey: ["k-conversations"], queryFn: () => base44.request("GET", "/api/mandataire/admin/conversations"), refetchInterval: 20_000 });
  const conversationDuDeal = dealId ? (conversationsK?.conversations || []).find((x) => x.deal_id === dealId) || null : null;
  const vueConversation = !!conversationDuDeal && params.get("vue") !== "analyse";
  const changerVue = (v) => { const suivant = new URLSearchParams(params); if (v === "analyse") suivant.set("vue", "analyse"); else suivant.delete("vue"); setParams(suivant); };
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
  // Les trois derniers ouverts (modifiés) en cartes, les autres en lignes dans l'ordre choisi.
  const ouvrirResponsables = (d) => {
    const actuels = (d.responsables?.length ? d.responsables : [String(d.responsable || "").split("@")[0]]).map((x) => ADMINS.find((a) => a.toLowerCase() === String(x).split(/[.\s]/)[0].toLowerCase()) || x).filter(Boolean);
    setProprio({ deal_id: d.deal_id, titre: d.titre, choix: actuels });
  };
  const qui = (d) => (d.responsables?.length ? d.responsables.join(", ") : (d.responsable || "—").split("@")[0]);
  // Le menu ⋯ d'un dossier : renommer, revenir à l'étape 1, abandonner. Un
  // clic ailleurs (ou Échap) le referme, comme les autres menus de la page.
  const MenuDossier = ({ d, bouton, place }) => {
    const ouvert = menuCarte === d.deal_id;
    const zone = useFermerAuClicAilleurs(ouvert, () => setMenuCarte(null));
    return (
    <div ref={zone} className="contents">
    <button
      onClick={(e) => { e.stopPropagation(); setMenuCarte(ouvert ? null : d.deal_id); }}
      className={`absolute ${bouton} text-ardoise hover:text-encre transition-colors`}
      aria-label="Actions" title="Actions" style={{ background: "transparent" }}
    >
      <MoreHorizontal className="w-4 h-4" />
    </button>
    {ouvert && (
      <div className={`absolute ${place} z-20 rounded-[14px] border border-trait bg-surface-pleine py-1.5 min-w-[190px] shadow-[0_18px_40px_rgb(0_0_0/0.14)]`}>
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
        <button
          onClick={() => {
            setMenuCarte(null);
            ouvrirResponsables(d);
          }}
          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06] transition-colors"
        >
          <UserRound className="w-3.5 h-3.5" /> Changer le responsable
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
        {d.statut !== "projet_cree" && (
          <button
            onClick={() => {
              setMenuCarte(null);
              if (window.confirm(d.origine === "mandataire" ? `Supprimer définitivement « ${d.titre} » ? Il disparaît avec ses pièces, le dossier du mandataire et toute sa conversation. Le mandataire ne le verra plus.` : `Supprimer définitivement « ${d.titre} » ? Il disparaît avec ses pièces, et sa fiche ne compte plus comme importée.`)) supprimer.mutate(d.deal_id);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-alerte hover:bg-alerte/[0.08] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        )}
      </div>
    )}
    </div>
    );
  };

  return (
    <div className="relative min-h-screen text-encre w-full max-w-full overflow-x-hidden">
      {/* Une lumière dans le coin, en haut à gauche, sur le dossier ouvert. */}
      {enWorkflow && <div aria-hidden className="k-halo pointer-events-none absolute -left-[260px] -top-[260px] h-[680px] w-[900px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.13),transparent)" }} />}
      <div
        key={dealId || (nouveau ? "nouveau" : "accueil")}
        className="px-5 py-6 md:px-10 md:py-9 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        {enWorkflow ? (
          <div className={`mx-auto ${vueConversation ? "max-w-[1500px]" : "max-w-6xl"}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                onClick={() => montrerDeal(null)}
                className="text-ardoise hover:text-encre text-xs flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Tous les dossiers
              </button>
              {conversationDuDeal && (vueConversation ? (
                <button type="button" onClick={() => changerVue("analyse")}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">
                  Voir l'analyse <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button type="button" onClick={() => changerVue(null)}
                  className="inline-flex h-9 items-center gap-2.5 rounded-full border border-bord-doux px-4 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                  <MessagesSquare className="h-4 w-4" /> Revenir à la conversation · {conversationDuDeal.mandataire_nom} <PointNouveau n={conversationDuDeal.non_lus} />
                </button>
              ))}
            </div>
            {vueConversation ? (
              <div className="flex h-[calc(100dvh-150px)] min-h-[560px] overflow-hidden rounded-[16px] border border-bord-doux bg-rail max-lg:h-auto max-lg:flex-col">
                <Conversation key={conversationDuDeal.id} c={conversationDuDeal} cote="klocka" />
                <Resume c={conversationDuDeal} cote="klocka" onAnalyse={() => changerVue("analyse")} />
              </div>
            ) : nouveau && !dealId ? (
              <WorkflowDeal
                dossier={null}
                onAnalyse={(d) => {
                  setDossier(d);
                  montrerDeal(d.deal_id);
                  rafraichirListes();
                }}
              />
            ) : dossier?.deal_id === dealId ? (
              <>
              <WorkflowDeal
                dossier={dossier}
                enCours={majLot.isPending}
                onSaisie={(index, saisie) => majLot.mutate({ index, saisie })}
                onRefresh={recharger}
              />
              </>
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
            <div className="flex flex-wrap items-center justify-between gap-3 pb-7">
              <div className="flex items-baseline gap-3">
                <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-0.01em] text-encre max-md:text-[26px]">Dossiers</h1>
                <span className="text-[15px] text-ardoise">{nbDossiers} dossier{nbDossiers > 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`mr-1 text-[15px] ${aRelancer ? "text-alerte" : "text-ardoise"}`}>
                  {aRelancer} relance{aRelancer > 1 ? "s" : ""} en attente
                </span>
                <label className="relative inline-flex h-[46px] items-center gap-2.5 rounded-full border border-bord-doux bg-surface px-[18px] text-[15px] text-encre hover:border-bord-vif">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-ardoise" />
                  <span>{TRIS.find((t) => t.id === tri)?.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-ardoise" />
                  <select aria-label="Trier" value={tri} onChange={(e) => setTri(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
                    {TRIS.map((t) => <option key={t.id} value={t.id}>Trier : {t.label}</option>)}
                  </select>
                </label>
                <button
                  onClick={() => setCreationOuverte(true)}
                  className="inline-flex h-[46px] items-center gap-2 rounded-full bg-menthe px-[22px] text-[15px] font-medium text-sur-menthe transition-colors hover:bg-menthe-survol"
                >
                  <Plus className="w-4 h-4" /> Nouveau dossier
                </button>
              </div>
            </div>

            {/* Recherche et étapes, sur une ligne. */}
            <div className="flex flex-wrap items-center gap-3 pb-2">
              <div className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:basis-full">
                <Search className="h-4 w-4 flex-shrink-0 text-ardoise" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un dossier" className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
              </div>
              {[[0, "Toutes"], [2, "Pré-analyse"], [3, "Analyse"], [4, "Vidéo"], [5, "Plateforme"]].map(([v, mot]) => (
                <button key={v} type="button" onClick={() => setEtapeFiltre(v)}
                  className={`h-12 rounded-full border px-5 text-[15px] transition-colors ${etapeFiltre === v ? "border-encre bg-encre text-fond" : "border-trait bg-surface text-craie hover:border-bord-doux hover:text-encre"}`}>
                  {mot}
                </button>
              ))}
            </div>

            {/* Les cartes */}
            <QuestionsMandataires />
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 text-ardoise animate-spin" />
              </div>
            ) : dossiers.length === 0 ? (
              <p className="text-brume text-sm text-center py-16">
                Aucun dossier — créez le premier avec « Nouveau dossier ».
              </p>
            ) : (
              <>
                {/* Tous les dossiers, en cartes. */}
                <p className="m-0 mb-2.5 pt-6 text-[14px] text-ardoise">Tous les dossiers</p>
                <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
                  {dossiers.map((d) => (
                    <CarteDossierAdmin key={d.deal_id} d={d} qui={(d.responsable || "").split("@")[0] || "—"} onOuvrir={() => montrerDeal(d.deal_id)}
                      menu={<MenuDossier d={d} bouton="top-[74px] right-2.5" place="top-[106px] right-4" />} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Changer les responsables d'un dossier */}
        {proprio && (
          <div className="animate-in fade-in duration-200 fixed inset-0 z-[60] flex items-center justify-center bg-fond/60 px-4 backdrop-blur-sm" onClick={() => setProprio(null)}>
            <div className="w-full max-w-md rounded-[18px] border border-trait bg-surface-pleine p-6 shadow-[0_24px_60px_rgb(0_0_0/0.18)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="m-0 text-[17px] font-medium text-encre">Qui s'occupe du dossier ?</h3>
                <button onClick={() => setProprio(null)} className="text-ardoise hover:text-encre" aria-label="Fermer" style={{ background: "transparent" }}><X className="h-5 w-5" /></button>
              </div>
              <p className="m-0 mb-4 truncate text-[13px] text-ardoise">{proprio.titre}</p>
              <div className="mb-5 flex flex-wrap gap-2">
                {[...new Set([...ADMINS, ...proprio.choix])].map((a) => {
                  const actif = proprio.choix.includes(a);
                  return (
                    <button key={a} type="button"
                      onClick={() => setProprio((p) => ({ ...p, choix: actif ? p.choix.filter((x) => x !== a) : [...p.choix, a] }))}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/[0.12] text-encre" : "border-bord text-ardoise hover:border-bord-vif hover:text-encre"}`}
                      style={actif ? undefined : { background: "transparent" }}>
                      {a}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2.5">
                <button onClick={() => setProprio(null)} className="rounded-full border border-bord px-4 py-2 text-[13.5px] text-craie hover:border-bord-vif" style={{ background: "transparent" }}>Annuler</button>
                <button onClick={() => changerResponsables.mutate({ id: proprio.deal_id, responsables: proprio.choix })} disabled={!proprio.choix.length || changerResponsables.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                  {changerResponsables.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nouveau dossier : nom + responsables */}
        {creationOuverte && (
          <div className="animate-in fade-in duration-200 fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setCreationOuverte(false)}>
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

const TEINTES_ETAPE = { 1: "brume", 2: "ambre", 3: "menthe", 4: "bleu", 5: "vert", 6: "vert" };

/** La carte d'un dossier : la grille de points et l'étape en haut, le bien, l'avancement. */
function CarteDossierAdmin({ d, qui, onOuvrir, menu }) {
  const etape = Math.min(d.etape_max || 1, 5);
  const abandonne = d.statut === "abandonne";
  const teinte = abandonne ? J["brume"] : J[TEINTES_ETAPE[etape]];
  return (
    <article className="relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-trait bg-rail transition-colors hover:border-bord-doux" onClick={onOuvrir}>
      <div className="k-grid k-grid-toujours relative h-[112px] flex-none border-b border-trait">
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: teinte }} />{abandonne ? "Abandonné" : ETAPES_LIBELLES[etape - 1]}
          {d.a_relancer && <Clock className="h-3 w-3 text-alerte" aria-label="À relancer" />}
        </span>
        <span className="absolute right-4 top-[18px] inline-flex items-center gap-2 text-[12px] tabular-nums text-brume">
          <PointNouveau n={d.fil_non_lus || 0} />{d.maj_le ? new Date(d.maj_le).toLocaleDateString("fr-FR") : ""}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-[18px]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 truncate text-[17px] font-medium text-encre" title={d.titre}>{d.titre || d.nom_fichier || d.deal_id}</p>
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
            {d.origine === "mandataire" && <span className="flex-none rounded-full border border-menthe/40 px-2.5 py-[3px] text-[12px] text-menthe">K Partners{d.mandataire_nom ? ` · ${d.mandataire_nom}` : ""}</span>}
            <span className="truncate text-[13px] text-ardoise">{qui}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[12px] text-ardoise"><span>Étape</span><span className="tabular-nums">{etape} / 5</span></div>
          <div className="grid grid-cols-5 gap-1">
            {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`h-1 rounded-full ${n <= etape ? "" : "bg-encre/[0.12]"}`} style={n <= etape ? { background: abandonne ? J["brume"] : J["menthe"] } : undefined} />)}
          </div>
        </div>
      </div>
      <span onClick={(e) => e.stopPropagation()}>{menu}</span>
    </article>
  );
}



/**
 * Les mandataires qui écrivent à propos d'un bien pas encore transféré : il
 * n'a pas d'analyse, seulement sa conversation.
 */
function QuestionsMandataires() {
  const { data } = useQuery({ queryKey: ["k-conversations"], queryFn: () => base44.request("GET", "/api/mandataire/admin/conversations"), refetchInterval: 20_000 });
  const sansDossier = (data?.conversations || []).filter((c) => !c.deal_id);
  if (!sansDossier.length) return null;
  const quand = (iso) => {
    if (!iso) return "";
    const t = new Date(iso);
    const hier = new Date(Date.now() - 86400000);
    if (t.toDateString() === new Date().toDateString()) return t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (t.toDateString() === hier.toDateString()) return "hier";
    return t.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };
  const initiales = (n = "") => String(n).split(/[\s.@]+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div className="pt-6">
      <p className="m-0 mb-2.5 text-[14px] text-ardoise">Questions de mandataires, sur des biens pas encore transférés</p>
      <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {sansDossier.map((c) => (
          <Link key={c.id} to={`/Conversations?dossier=${c.id}`}
            className="flex items-center gap-3.5 rounded-[16px] border border-trait bg-rail px-4 py-3.5 transition-colors hover:border-bord-doux">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-relief text-[12px] font-semibold text-craie">{initiales(c.mandataire_nom)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex justify-between gap-2"><span className="truncate text-[15px] font-medium text-encre">{String(c.bien).replace(/\s*\(.*?\)\s*/g, " ").trim()}</span><span className="flex-none text-[12px] text-brume">{quand(c.activite)}</span></span>
              <span className="truncate text-[13px] text-ardoise">{c.mandataire_nom}{c.dernier?.texte ? ` · ${c.dernier.texte}` : ""}</span>
            </span>
            {c.non_lus > 0 ? <PointNouveau n={c.non_lus} /> : <span className="h-2 w-2 flex-none" />}
          </Link>
        ))}
      </div>
    </div>
  );
}

