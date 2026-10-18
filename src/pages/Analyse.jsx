import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Clock, MoreHorizontal, Pencil, Archive, RotateCcw, Trash2, X, UserRound, Folder, Search, SlidersHorizontal, ChevronDown, MessagesSquare, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/avis";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { Conversation, Resume } from "@/components/conversations/EspaceConversations";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import DecisionMandataire from "@/components/mandataire/DecisionMandataire";
import { useUser } from "@/components/providers/UserProvider";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import CartesCompetences from "@/components/haka/CartesCompetences";
import { FRISE, estEcarte, etapeFrise } from "@/lib/dossiers-architecture";

// Dossiers (architecture du 17 oct. 2026) : la liste en trois blocs de cartes,
// À traiter (à toi d'agir, en attente d'un tiers), Pipeline (Tri, Qualification,
// Commercialisation, Transaction) et Écartés par AK ; le dossier ouvert suit
// une frise de huit étapes. Les règles sont dans src/lib/dossiers-architecture.js.
// « Nouveau dossier » démarre à la réception ; ?deal_id= rouvre un dossier en cours.

// Les admins proposés à la création d'un dossier.
const ADMINS = ["Jules", "Maxime", "Paul", "Coralie", "Nora"];



export default function Analyse() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dealId = params.get("deal_id");
  const nouveau = params.get("nouveau") === "1";
  // La recherche et le filtre par étape, au-dessus des cartes.
  const [recherche, setRecherche] = useState("");
  // Une fiche glissée n'importe où sur la liste : elle est analysée, et le dossier s'ouvre.
  const [survol, setSurvol] = useState(false);
  const [large, setLarge] = useState(false);
  // Un dossier ouvert (17 oct. 2026, Jules) : la barre latérale s'efface, AK à gauche, le dossier à droite, à toutes les étapes.
  const ecranLarge = useEcranLarge();
  const [vueDossier, setVueDossier] = useState(null);
  const [chatOuvert, setChatOuvert] = useState(false);
  const analyserFiche = useMutation({
    mutationFn: (fichier) => { const form = new FormData(); form.append("fichier", fichier); return base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true }); },
    onSuccess: (d) => { toast.success("Fiche analysée"); rafraichirListes(); montrerDeal(d.deal_id); },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });
  const moi = useUser()?.email || "";
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

  // Un dossier ouvert entre dans « Dossiers récents », sous Projets dans la barre (17 oct. 2026).
  useEffect(() => {
    if (!dealId) return;
    base44.request("POST", `/api/preanalyse/dossiers/${dealId}/ouvert`, { body: {} }).then(() => queryClient.invalidateQueries({ queryKey: ["dossiers-recents"] })).catch(() => {});
  }, [dealId, queryClient]);

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

  const nbDossiers = (pipeline?.dossiers || []).filter((d) => !d.archived).length;
  // Tous les dossiers, en une seule liste, du plus récemment modifié au plus ancien (18 oct. 2026, Jules).
  const tous = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return (pipeline?.dossiers || [])
      .filter((d) => !d.archived && (!t || `${d.titre || ""} ${d.nom_fichier || ""} ${d.ville || ""} ${d.responsable || ""}`.toLowerCase().includes(t)))
      .sort((a, b) => String(b.maj_le || "").localeCompare(String(a.maj_le || "")));
  }, [pipeline, recherche]);
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
      className={`absolute ${bouton} text-ardoise hover:text-encre transition-colors max-md:-m-2.5 max-md:p-2.5`}
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

  // Mode IA ou mode normal (17 oct. 2026, Jules) : IA, la barre latérale s'efface et AK est à gauche ;
  // normal, la barre latérale reste et le dossier prend la page. Gardé dans ce navigateur.
  const [modeIA, setModeIABrut] = useState(() => { try { return localStorage.getItem("klocka.dossier.mode") !== "normal"; } catch { return true; } });
  const setModeIA = (v) => { setModeIABrut(v); try { localStorage.setItem("klocka.dossier.mode", v ? "ia" : "normal"); } catch { /* navigation privée */ } };
  const choixMode = ecranLarge ? (
    <div className="flex flex-none gap-1 rounded-full bg-rail-actif p-1" role="group" aria-label="Mode d'affichage du dossier">
      {[[true, "Mode IA"], [false, "Normal"]].map(([v, mot]) => (
        <button key={mot} type="button" onClick={() => setModeIA(v)} aria-pressed={modeIA === v}
          className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${modeIA === v ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={modeIA === v ? undefined : { background: "transparent" }}>{mot}</button>
      ))}
    </div>
  ) : null;
  const scinde = ecranLarge && !!dealId && !vueConversation && modeIA;
  // La largeur du chat, comme dans Présentations et Offres : la poignée se tire, un double-clic la remet.
  const CLE_LARGEUR = "klocka.dossiers.largeur-chat";
  const LARGEUR_DEFAUT = 420;
  const borner = (l) => Math.round(Math.min(Math.max(l, 300), Math.max(320, (typeof window !== "undefined" ? window.innerWidth : 1600) - 560)));
  const [largeurChat, setLargeurChat] = useState(() => { try { const v = Number(localStorage.getItem(CLE_LARGEUR)); return v ? borner(v) : LARGEUR_DEFAUT; } catch { return LARGEUR_DEFAUT; } });
  const [tire, setTire] = useState(false);
  const tirer = (e) => {
    e.preventDefault();
    setTire(true);
    let derniere = largeurChat;
    const bouger = (ev) => { derniere = borner(ev.clientX); setLargeurChat(derniere); };
    const lacher = () => {
      setTire(false);
      try { localStorage.setItem(CLE_LARGEUR, String(derniere)); } catch { /* navigation privée */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const remettre = () => { setLargeurChat(LARGEUR_DEFAUT); try { localStorage.removeItem(CLE_LARGEUR); } catch { /* rien */ } };
  useEffect(() => {
    if (!scinde) return undefined;
    // Sans « k-sobre » : le fond « Halo » reste, le même que sur Projets (18 oct. 2026, Jules).
    document.documentElement.classList.add("k-sans-barre", "k-sans-ak");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre", "k-sans-ak");
  }, [scinde]);

  // Le contenu d'un dossier ouvert : à droite du chat sur grand écran, seul au téléphone.
  const contenuDossier = (
    <div className={`mx-auto ${large ? "max-w-none" : "max-w-[1500px]"}`}>
      {/* md:pr-14 : la marge du bouton Rappel, fixé dans le coin. */}
      <div className="mb-4 flex items-center justify-between gap-3 md:pr-14">
        <button
          onClick={() => montrerDeal(null)}
          className="text-ardoise hover:text-encre text-xs flex flex-none items-center gap-1.5 transition-colors max-md:min-h-[36px]"
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
            className="inline-flex h-9 min-w-0 items-center gap-2.5 rounded-full border border-bord-doux px-4 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <MessagesSquare className="h-4 w-4 flex-none" /> <span className="truncate"><span className="max-md:hidden">Revenir à la conversation · </span>{conversationDuDeal.mandataire_nom}</span> <PointNouveau n={conversationDuDeal.non_lus} />
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
          onLargeur={setLarge}
          onVue={setVueDossier}
          actionsBarre={choixMode}
        />
        </>
      ) : (
        <div className="bg-surface border border-trait rounded-md p-8 text-center">
          <Loader2 className="w-6 h-6 text-ardoise animate-spin mx-auto mb-3" />
          <p className="text-ardoise text-sm">Ouverture du dossier…</p>
        </div>
      )}
    </div>
  );

  if (scinde) {
    return (
      <div className={`k-page-presentation relative grid h-[100dvh] overflow-hidden text-encre duration-500 ease-out animate-in fade-in-0 ${tire ? "select-none" : ""}`} style={{ gridTemplateColumns: `${largeurChat}px minmax(0,1fr)` }}>
        {/* À gauche, AK sur ce dossier, le design de Présentations : la question au centre, le chat en bas. */}
        <div className="k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5 duration-500 ease-out animate-in fade-in-0 slide-in-from-left-4">
          {!chatOuvert && (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto py-6">
              <h1 className="m-0 text-center font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>Une question sur ce dossier ?</h1>
              {/* Les compétences de Haka qui s'appliquent à un dossier (17 oct. 2026). */}
              <CartesCompetences declencheur="dossier" contexte={{ deal_id: dealId, titre: dossier?.titre || dossier?.nom || null }} />
            </div>
          )}
          <div className={chatOuvert ? "min-h-0 w-full flex-1" : "w-full flex-none pb-5"}>
            <ChatDashboard key={dealId} espace="dossier" onConversation={setChatOuvert} barreApercu={chatOuvert}
              retour={{ libelle: "Tous les dossiers", onClick: () => montrerDeal(null) }}
              contexte={{ deal_id: dealId, etape: vueDossier }}
              onReponse={() => { recharger(); rafraichirListes(); }} />
          </div>
        </div>
        {/* Le dossier, un écran dans l'écran : une carte posée sur le fond, comme la présentation à côté du chat (17 oct. 2026, Jules). */}
        <div className="h-[100dvh] min-h-0 min-w-0 py-2 pr-2 duration-500 ease-out animate-in fade-in-0 zoom-in-[0.98]">
          <div className="h-full min-h-0 overflow-y-auto rounded-[14px] border border-bord-doux bg-rail">
            {dossier?.deal_id === dealId ? (
              <WorkflowDeal dossier={dossier} enCours={majLot.isPending} onSaisie={(index, saisie) => majLot.mutate({ index, saisie })}
                onRefresh={recharger} onLargeur={setLarge} onVue={setVueDossier} etroit enCarte onFermer={() => montrerDeal(null)}
                actionsBarre={<>{choixMode}{conversationDuDeal ? (
                  <button type="button" onClick={() => changerVue(null)}
                    className="inline-flex h-9 min-w-0 items-center gap-2 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                    <MessagesSquare className="h-3.5 w-3.5 flex-none" /><span className="truncate">{conversationDuDeal.mandataire_nom}</span>
                  </button>
                ) : null}</>} />
            ) : (
              <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
            )}
          </div>
        </div>
        {/* La poignée entre le chat et le dossier. */}
        <div role="separator" aria-orientation="vertical" aria-label="Largeur du chat" title="Tirer pour élargir ou réduire le chat ; double-clic pour revenir"
          onPointerDown={tirer} onDoubleClick={remettre}
          className="group absolute inset-y-0 z-20 flex w-3 cursor-col-resize justify-center" style={{ left: largeurChat - 6 }}>
          <span className={`my-auto h-10 w-[3px] rounded-full transition-colors ${tire ? "bg-menthe" : "bg-transparent group-hover:bg-bord-vif"}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-encre w-full max-w-full overflow-x-hidden">
      {/* Plus de lumière propre dans le coin : le fond « Halo » commun suffit (18 oct. 2026). */}
      <div
        key={`${dealId || (nouveau ? "nouveau" : "accueil")}-${modeIA ? "ia" : "normal"}`}
        className="px-5 py-6 md:px-10 md:py-9 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        {enWorkflow ? (
          contenuDossier
        ) : (
          <div className="relative mx-auto max-w-[1400px]"
            onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false); }}
            onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer?.files?.[0]; if (f && !analyserFiche.isPending) analyserFiche.mutate(f); }}>
            {survol && (
              <div className="pointer-events-none fixed inset-4 z-40 grid place-items-center rounded-[24px] border-2 border-dashed border-menthe bg-fond/80 text-[18px] text-encre backdrop-blur-sm duration-200 animate-in fade-in-0 md:left-[calc(var(--k-barre-largeur,0px)+16px)]">
                Lâche la fiche pour l'ajouter
              </div>
            )}
            {/* Le titre au centre, les onglets en pilule dessous, comme la Prospection. */}
            <header className="relative mb-8 flex flex-col items-center gap-6 text-center">
              <div className="flex flex-wrap items-center justify-end gap-2.5 self-end md:absolute md:right-14 md:top-0 md:self-auto">
                <span className={`text-[14px] max-md:text-[13px] ${aRelancer ? "text-alerte" : "text-ardoise"}`}>{aRelancer} relance{aRelancer > 1 ? "s" : ""} en attente</span>
                <button onClick={() => setCreationOuverte(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] font-medium text-sur-menthe transition-colors hover:bg-menthe-survol">
                  <Plus className="w-4 h-4" /> Nouveau dossier
                </button>
              </div>
              <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Dossiers</h1>
              <nav className="inline-flex max-w-full gap-1 self-center overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Parties des dossiers">
                {/* Un seul onglet (18 oct. 2026, Jules) : « À traiter », « Pipeline » et « Écartés par AK » sont retirés. */}
                <span className="inline-flex h-9 flex-none items-center gap-2 rounded-full bg-encre px-4 text-[14px] text-fond">
                  Dossiers<span className="text-[12px] tabular-nums opacity-70">{tous.length}</span>
                </span>
              </nav>
            </header>

            {/* Recherche, et ce que fait la page toute seule. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pb-2">
              <div className="flex h-12 min-w-[240px] max-w-[460px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:max-w-none max-md:basis-full">
                <Search className="h-4 w-4 flex-shrink-0 text-ardoise" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Adresse, agent, ville" className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
              </div>
              <p className="m-0 flex-1 text-[14px] text-ardoise">
                {analyserFiche.isPending ? "AK analyse la fiche…" : "Les fiches reçues par mail sont triées par AK. Glisse une fiche n'importe où pour l'ajouter."}
              </p>
            </div>

            {/* Les cartes */}
            <QuestionsMandataires />
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 text-ardoise animate-spin" />
              </div>
            ) : nbDossiers === 0 ? (
              <p className="text-brume text-sm text-center py-16">
                Aucun dossier — créez le premier avec « Nouveau dossier ».
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 pt-6 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-1 sm:grid-cols-2 lg:grid-cols-3">
                {tous.map((d) => <CarteCompacte key={d.deal_id} d={d} qui={qui(d)} ecarte={estEcarte(d)} onOuvrir={() => montrerDeal(d.deal_id)} menu={<MenuDossier d={d} bouton="top-3.5 right-3" place="top-9 right-3" />} />)}
                {!tous.length && <p className="m-0 col-span-full py-12 text-center text-[14px] text-brume">Aucun dossier ne correspond.</p>}
              </div>
            )}
          </div>
        )}

        {/* Changer les responsables d'un dossier */}
        {proprio && (
          <div className="animate-in fade-in duration-200 fixed inset-0 z-[60] flex items-center justify-center bg-fond/60 px-4 backdrop-blur-sm" onClick={() => setProprio(null)}>
            <div className="w-full max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[18px] border border-trait bg-surface-pleine p-6 max-md:p-5 shadow-[0_24px_60px_rgb(0_0_0/0.18)]" onClick={(e) => e.stopPropagation()}>
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
            <div className="w-full max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto bg-surface border border-trait rounded-lg p-6 max-md:p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="m-0 text-[18px] font-medium">Nouveau dossier</h3>
                <button onClick={() => setCreationOuverte(false)} aria-label="Fermer" title="Fermer" className="text-ardoise hover:text-encre transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <label className="block text-[11px] tracking-[0.14em] uppercase text-ardoise mb-1.5">Nom du dossier</label>
              <input
                autoFocus
                value={nomDossier}
                onChange={(e) => setNomDossier(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nomDossier.trim()) creerDossier.mutate(); }}
                placeholder="Ex. : Boulangerie — Marseille République"
                className="w-full bg-surface border border-trait focus:border-menthe rounded-md px-3.5 py-2.5 text-[13.5px] text-encre outline-none placeholder:text-bord-vif transition-colors mb-4 max-md:text-[16px]"
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

/** La carte compacte d'un dossier dans les blocs de la liste : nom, étape de la frise, qui, ce qui attend. */
function CarteCompacte({ d, qui, onOuvrir, menu, ecarte = false }) {
  const n = etapeFrise(d);
  const verdict = d.lots?.[0]?.verdict;
  return (
    <article className="relative cursor-pointer rounded-[14px] border border-trait k-carte-rail p-3.5 pr-9 transition-colors hover:border-bord-doux" onClick={onOuvrir}>
      <p className="m-0 flex items-center gap-2 text-[15px] text-encre"><span className="truncate" title={d.titre}>{d.titre || d.nom_fichier || d.deal_id}</span><PointNouveau n={d.fil_non_lus || 0} /></p>
      <p className="m-0 mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ardoise">
        <span className="inline-flex items-center gap-1.5 text-craie"><span className="h-1.5 w-1.5 rounded-full bg-menthe" />{ecarte ? (d.statut === "abandonne" ? "Abandonné" : "NO-GO") : FRISE[n - 1].label}</span>
        <span className="truncate">{qui}</span>
        {!ecarte && verdict && <span className="flex-none text-brume">{verdict}</span>}
        {d.origine === "mandataire" && <span className="flex-none text-menthe">K Partners</span>}
      </p>
      {d.pourquoi && <p className="m-0 mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ambre">{d.a_relancer && <Clock className="h-3 w-3" />}{d.pourquoi}</p>}
      <span onClick={(e) => e.stopPropagation()}>{menu}</span>
    </article>
  );
}

/**
 * Les mandataires qui écrivent à propos d'un bien pas encore transféré : il
 * n'a pas d'analyse, seulement sa conversation. Repliées par défaut : un
 * libellé discret, avec le nombre de non-lus, les ouvre.
 */
function QuestionsMandataires() {
  const { data } = useQuery({ queryKey: ["k-conversations"], queryFn: () => base44.request("GET", "/api/mandataire/admin/conversations"), refetchInterval: 20_000 });
  const [ouvert, setOuvert] = useState(false);
  const sansDossier = (data?.conversations || []).filter((c) => !c.deal_id);
  if (!sansDossier.length) return null;
  const nonLus = sansDossier.reduce((s, c) => s + (c.non_lus || 0), 0);
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
      <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}
        className="inline-flex items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-ardoise transition-colors hover:text-encre">
        {ouvert ? "Masquer les dossiers mandataires" : `Voir les dossiers mandataires (${sansDossier.length})`}
        {!ouvert && nonLus > 0 && <PointNouveau n={nonLus} />}
      </button>
      {ouvert && (
      <div className="mt-3 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {sansDossier.map((c) => (
          <Link key={c.id} to={`/Conversations?dossier=${c.id}`}
            className="flex items-center gap-3.5 rounded-[16px] border border-trait k-carte-rail px-4 py-3.5 transition-colors hover:border-bord-doux">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-relief text-[12px] font-semibold text-craie">{initiales(c.mandataire_nom)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex justify-between gap-2"><span className="truncate text-[15px] font-medium text-encre">{String(c.bien).replace(/\s*\(.*?\)\s*/g, " ").trim()}</span><span className="flex-none text-[12px] text-brume">{quand(c.activite)}</span></span>
              <span className="truncate text-[13px] text-ardoise">{c.mandataire_nom}{c.dernier?.texte ? ` · ${c.dernier.texte}` : ""}</span>
            </span>
            {c.non_lus > 0 ? <PointNouveau n={c.non_lus} /> : <span className="h-2 w-2 flex-none" />}
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}


/** Un écran assez large pour le chat et le dossier côte à côte. */
function useEcranLarge() {
  const requete = "(min-width: 1024px)";
  const [large, setLarge] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const changer = () => setLarge(m.matches);
    m.addEventListener("change", changer);
    return () => m.removeEventListener("change", changer);
  }, []);
  return large;
}
