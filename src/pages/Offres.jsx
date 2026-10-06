import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FileText, Loader2, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import EditeurLoi from "@/components/offres/EditeurLoi";

// Offres — les lettres d'intention d'achat (LOI) de l'équipe. Comme
// l'Estimation des mandataires : le chat à gauche, la lettre à droite. On
// décrit la situation (« fais l'offre d'Olivier Luccioni sur le dossier du
// 1 avenue Mirabeau, 200 000 € ») : AK la rédige sur le modèle de la maison,
// une notification « Votre LOI est prête » mène à la relire. Sous le chat,
// l'historique des offres faites. Le chat corrige la lettre ouverte.

const euros = (n) => (typeof n === "number" ? `${Math.round(n).toLocaleString("fr-FR")} €` : null);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function Offres() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [courante, setCourante] = useState(null);
  const [travail, setTravail] = useState({ enCours: false, etapes: [] });
  const [recherche, setRecherche] = useState("");
  const large = useEcranLarge();
  // Au téléphone, la lettre s'ouvre par-dessus le chat ; fermée, elle reste la
  // lettre de la conversation (le chat la corrige) et se rouvre d'une pastille.
  const [lettreTel, setLettreTel] = useState(true);
  useEffect(() => { if (courante) setLettreTel(true); }, [courante]);

  const { data, isLoading } = useQuery({ queryKey: ["offres"], queryFn: () => base44.request("GET", "/api/offres") });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["offres"] });
  const offres = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return (data?.offres || []).filter((o) => !t || [o.adresse, o.acquereur, o.vendeur].filter(Boolean).join(" ").toLowerCase().includes(t));
  }, [data, recherche]);

  // Une offre ouverte : sa conversation reprend à gauche (le fil, le chat
  // dessous), la lettre à droite. Une offre sans conversation gardée (d'avant,
  // ou d'un collègue) part d'un message de reprise ; elle se relie à la
  // conversation au premier échange.
  const ouvrirOffre = useCallback((o) => {
    setCourante(o.id);
    const reprise = { role: "assistant", reprise: true, contenu: `La LOI ${o.adresse ? `du ${o.adresse}` : ""} est ouverte à droite. Éditez-la directement, ou dites-moi ci-dessous ce qu'il faut changer.`.replace(/\s+/g, " ") };
    window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: o.conversation_id || null, api: "/api/assistant", qs: "", secours: [reprise] } }));
  }, []);

  // La notification « Relire » arrive par l'adresse : la lettre et sa conversation s'ouvrent.
  // Le chat repart à zéro quand l'adresse change : on ouvre une fois l'adresse nettoyée.
  const demandee = params.get("loi");
  const [aOuvrir, setAOuvrir] = useState(null);
  useEffect(() => {
    if (!demandee) return;
    setAOuvrir(demandee);
    setParams((p) => { const n = new URLSearchParams(p); n.delete("loi"); return n; }, { replace: true });
  }, [demandee, setParams]);
  useEffect(() => {
    if (!aOuvrir || demandee || !data) return;
    ouvrirOffre((data.offres || []).find((o) => o.id === aOuvrir) || { id: aOuvrir });
    setAOuvrir(null);
  }, [aOuvrir, demandee, data, ouvrirOffre]);

  // La lettre rédigée ou corrigée par le chat se relie à la conversation en cours.
  const [conversationId, setConversationId] = useState(null);
  const aLier = useRef(null);
  useEffect(() => {
    const id = aLier.current;
    if (!id || !conversationId || !data) return;
    const o = (data.offres || []).find((x) => x.id === id);
    if (!o) return;
    aLier.current = null;
    if (o.conversation_id) return;
    base44.request("PATCH", `/api/offres/${id}`, { body: { conversation_id: conversationId } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["offres"] }))
      .catch(() => { /* la lettre reste ouvrable, sans sa conversation */ });
  }, [conversationId, data, queryClient]);

  // Chaque réponse du chat : la lettre qu'il vient de rédiger ou de corriger s'ouvre à droite.
  const surReponse = useCallback((r) => {
    const loi = (r?.actions || []).map((a) => a?.resultat?.loi_id).filter(Boolean).at(-1);
    if (loi) {
      setCourante(loi);
      aLier.current = loi;
      queryClient.invalidateQueries({ queryKey: ["offre", loi] });
    }
    queryClient.invalidateQueries({ queryKey: ["offres"] });
  }, [queryClient]);

  // « Dashboard » dans le chat : retour à l'accueil d'Offres, sans la lettre à droite.
  // Seulement au vrai retour (une conversation ouverte qui se ferme) : au
  // chargement, la lettre demandée par « Relire » reste ouverte.
  const ouverteAvant = useRef(false);
  const surConversation = useCallback((ouverte) => {
    if (!ouverte && ouverteAvant.current) setCourante(null);
    ouverteAvant.current = ouverte;
    setConversation(ouverte);
  }, []);

  const scinde = large && (conversation || !!courante);
  useEffect(() => {
    if (!scinde) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [scinde]);

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/offres/${id}`),
    onSuccess: (_, id) => { if (courante === id) setCourante(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const liste = (
    <div className={scinde ? "mt-8" : "mx-auto mt-[7vh] max-w-[1100px]"}>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 text-[20px] font-normal tracking-[-0.01em] text-encre">Vos offres</h2>
          {offres.length > 0 && <span className="text-[13.5px] text-ardoise">{offres.length}</span>}
        </div>
        {(data?.offres || []).length > 4 && (
          <div className="flex min-w-[220px] max-w-[420px] flex-1 items-center max-md:min-w-0 max-md:basis-full max-md:max-w-none gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux">
            <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Bien, acquéreur, vendeur"
              className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
      ) : !offres.length ? (
        <p className="py-12 text-center text-[14px] text-brume">{recherche ? "Aucune offre ne correspond." : "Aucune offre encore : décrivez la situation au chat, il rédige la lettre."}</p>
      ) : (
        <div className="border-y border-trait">
          {offres.map((o) => (
            <LigneOffre key={o.id} o={o} active={o.id === courante} onOuvrir={() => ouvrirOffre(o)}
              onSupprimer={() => { if (window.confirm(`Supprimer la LOI « ${o.adresse || "sans adresse"} » ?`)) supprimer.mutate(o.id); }} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden text-encre">
      {/* Le chat garde sa place dans l'arbre d'un mode à l'autre, sinon il perdrait son fil. */}
      <div className={scinde ? "grid h-[100dvh] grid-cols-[minmax(360px,440px)_minmax(0,1fr)] overflow-hidden" : ""}>
        <div className={scinde ? (conversation ? "h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5" : "h-[100dvh] min-h-0 min-w-0 overflow-y-auto px-5 pb-8") : conversation ? "px-5 md:px-8" : "px-5 py-6 md:px-10 md:py-9"}>
          <div className={`mx-auto ${scinde ? "max-w-none" : conversation ? "max-w-[1100px]" : "max-w-[1400px]"}`}>
            <header className={conversation ? "flex flex-col" : `flex flex-col items-center text-center ${scinde ? "pt-10" : "pt-[6vh] max-md:pt-4"}`}>
              {!conversation && (
                <>
                  <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Quelle offre préparez-vous ?</h1>
                  <p className="m-0 mt-2 max-w-[56ch] text-[14px] text-ardoise">Décrivez la situation : l'acquéreur, le bien ou son dossier, le vendeur, le prix et l'apport. Ce qui manque vous est demandé.</p>
                </>
              )}
              <div className={conversation ? "w-full" : `w-full ${scinde ? "mt-6" : "mt-8 max-w-[660px] max-md:mt-6"}`}>
                <ChatDashboard espace="offre" onConversation={surConversation} onHistorique={setHistorique} onReponse={surReponse}
                  barreApercu={scinde && conversation} onTravail={setTravail} contexte={courante ? { loi_id: courante } : null} onConversationId={setConversationId} />
              </div>
            </header>
          </div>
          {!conversation && (historique ? (
            <div className="mx-auto mt-[6vh] max-w-[1400px]"><HistoriqueColonne espace="admin" /></div>
          ) : liste)}
        </div>
        {scinde && (
          <div className="h-[100dvh] min-h-0 min-w-0 border-l border-bord-doux">
            {courante ? (
              <EditeurLoi key={courante} id={courante} travail={travail} onFermer={() => setCourante(null)} />
            ) : (
              <div className="grid h-full place-items-center bg-fond px-10 text-center">
                <p className="m-0 max-w-[44ch] text-[14px] leading-[1.6] text-ardoise">La lettre d'intention se rédige ici dès que le chat a l'acquéreur, le bien, le vendeur, le prix et l'apport. Elle se relit et se retouche sur place, puis part en Word ou en PDF.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Au téléphone : la lettre par-dessus tout, on la ferme pour revenir au chat. */}
      {!large && courante && lettreTel && createPortal(
        <div className="fixed inset-0 z-[70]" style={{ background: "rgb(var(--k-fond-rgb))" }}>
          <EditeurLoi key={courante} id={courante} travail={travail} onFermer={() => { if (conversation && window.matchMedia("(max-width: 767px)").matches) setLettreTel(false); else setCourante(null); }} />
        </div>,
        document.body,
      )}
      {!large && courante && !lettreTel && conversation && (
        <button type="button" onClick={() => setLettreTel(true)}
          className="fixed left-1/2 top-[calc(var(--k-haut-mobile,3.5rem)+3.75rem)] z-30 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-bord-vif bg-surface-pleine px-4 text-[13px] text-encre shadow-[0_18px_40px_rgb(0_0_0/0.18)] md:hidden">
          <FileText className="h-4 w-4 text-menthe" /> Voir la lettre
        </button>
      )}
    </div>
  );
}

/** Une offre de l'historique : le bien, l'acquéreur, le prix, la date. */
function LigneOffre({ o, active, onOuvrir, onSupprimer }) {
  const [menu, setMenu] = useState(false);
  const zone = useFermerAuClicAilleurs(menu, () => setMenu(false));
  const detail = [o.acquereur, euros(o.prix), o.vendeur ? `à ${o.vendeur}` : null].filter(Boolean).join(" · ");
  return (
    <div className={`relative border-t border-trait px-2 py-4 pr-12 first:border-t-0 ${active ? "bg-surface" : ""}`}>
      <button type="button" onClick={onOuvrir} className="flex w-full items-center gap-6 text-left" style={{ background: "transparent" }}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] text-encre">{o.adresse || "Sans adresse"}</span>
          {detail && <span className="mt-1 block truncate text-[13.5px] text-ardoise">{detail}</span>}
        </span>
        <span className="flex-none text-[13px] tabular-nums text-brume">{quand(o.maj_le)}</span>
      </button>
      <div ref={zone} className="contents">
        <button type="button" onClick={() => setMenu(!menu)} aria-label="Actions" title="Actions"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ardoise transition-colors hover:text-encre max-md:grid max-md:h-10 max-md:w-10 max-md:place-items-center" style={{ background: "transparent" }}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menu && (
          <div className="absolute right-1 top-[calc(50%+14px)] z-20 min-w-[170px] rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
            <button type="button" onClick={() => { setMenu(false); onSupprimer(); }} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-alerte hover:bg-alerte/[0.08]" style={{ background: "transparent" }}>
              <Trash2 className="h-3.5 w-3.5" /> Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Un écran assez large pour le chat et la lettre côte à côte. */
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
