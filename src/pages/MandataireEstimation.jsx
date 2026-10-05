import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Loader2, MoreHorizontal, Pencil, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { dateCourte, euros } from "@/components/mandataire/kit";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import EditeurAvis from "@/components/mandataire/EditeurAvis";
import GenerationDocument, { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";

// Estimation — tout passe par le chat : le mandataire dit le bien, joint le
// bail, répond aux questions ; la valeur vient de Data-B et l'avis de valeur
// se rédige au format K Partners. L'avis s'ouvre par-dessus la conversation,
// se retouche, se télécharge en PDF, se referme : on reste dans le fil, où
// une correction (« j'ai oublié, la surface c'est 85 m² ») le rédige de
// nouveau. Une estimation de la liste rouvre sa conversation.

const API = "/api/mandataire/estimations";
const CHAT = { api: "/api/mandataire", qs: "?espace=estimation" };
// Les étapes d'une estimation, pour la barre de la liste.
const ETAPES_LISTE = [["brouillon", "En questions"], ["prete", "Avis prêt"], ["envoye", "Envoyé au propriétaire"]];
// Les anciens statuts, du temps de la validation Klocka, se lisent comme « prêt ».
const statutDe = (e) => (["en_validation", "valide"].includes(e.statut) ? "prete" : e.statut);
const majDe = (e) => e.envoye_le || e.prete_le || (e.historique || []).at(-1)?.le || e.cree_le;

export default function MandataireEstimation() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [recherche, setRecherche] = useState("");
  const [menuCarte, setMenuCarte] = useState(null);
  // Le chat de l'estimation : en conversation, il prend la page.
  const [conversation, setConversation] = useState(false);
  const [modeChat, setModeChat] = useState("document");
  const [historique, setHistorique] = useState(false);
  // L'avis ouvert par-dessus le chat (téléphone).
  const [avisOuvert, setAvisOuvert] = useState(null);
  // L'estimation de la conversation ouverte : son avis se construit à droite du chat.
  const [courante, setCourante] = useState(null);
  // Le premier message tapé au tableau de bord : à droite, la génération de
  // l'avis se joue en étapes avant de le montrer. Une estimation reprise ou
  // une conversation rouverte s'affichent tout de suite.
  const [generation, setGeneration] = useState(false);
  // Le travail du chat en cours (ses étapes), que l'aperçu rejoue à droite.
  const [travail, setTravail] = useState({ enCours: false, etapes: [] });
  const rouverte = useRef(false);
  const ouverteAvant = useRef(false);
  const surConversation = useCallback((ouverte) => {
    if (ouverte && !ouverteAvant.current && !rouverte.current) setGeneration(true);
    if (!ouverte) { rouverte.current = false; setGeneration(false); }
    ouverteAvant.current = ouverte;
    setConversation(ouverte);
  }, []);
  // L'élément cliqué dans l'avis à droite : le chat de gauche le reçoit.
  const [selectionAvis, setSelectionAvis] = useState(undefined);
  const large = useEcranLarge();

  const { data, isLoading } = useQuery({ queryKey: ["m-estimations"], queryFn: () => base44.request("GET", API) });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-estimations"] });
  const renommer = useMutation({
    mutationFn: ({ id, bien }) => base44.request("PATCH", `${API}/${id}`, { body: { bien } }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  const estimations = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return [...(data?.estimations || [])]
      .filter((e) => !t || `${e.bien || ""} ${e.adresse || ""}`.toLowerCase().includes(t))
      .sort((a, b) => String(majDe(b) || "").localeCompare(String(majDe(a) || "")));
  }, [data, recherche]);
  const avis = (data?.estimations || []).find((e) => e.id === avisOuvert) || null;
  // L'avis ouvert prend tout l'écran, navigation comprise : la page derrière ne défile plus.
  useEffect(() => {
    if (!avis?.avis) return undefined;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [avis?.avis]);

  // Reprendre une estimation : on arrive dans sa conversation, recréée au
  // besoin par le serveur avec ce qu'on sait déjà.
  const reprendre = async (e) => {
    rouverte.current = true;
    setCourante(e.id);
    try {
      const r = await base44.request("POST", `${API}/${e.id}/conversation`);
      if (r.cree) rafraichir();
      window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: r.conversation_id, ...CHAT } }));
    } catch (err) {
      toast.error(err?.message || "Impossible d'ouvrir cette estimation");
    }
  };
  // Une conversation rouverte depuis l'historique du chat : son estimation, si on la connaît.
  useEffect(() => {
    const ouverte = (ev) => {
      if (ev.detail?.qs !== CHAT.qs) return;
      rouverte.current = true;
      const e = (data?.estimations || []).find((x) => x.conversation_id === ev.detail.id);
      if (e) setCourante(e.id);
    };
    window.addEventListener("klocka:ouvrir-conversation", ouverte);
    return () => window.removeEventListener("klocka:ouvrir-conversation", ouverte);
  }, [data]);
  // Retour au tableau de bord : plus d'estimation courante.
  useEffect(() => { if (!conversation) setCourante(null); }, [conversation]);
  // Chaque réponse du chat : l'estimation qu'il remplit, et son aperçu à relire.
  const surReponse = (r) => {
    if (r?.estimation_id) setCourante(r.estimation_id);
    queryClient.invalidateQueries({ queryKey: ["m-apercu"] });
    rafraichir();
  };
  const scinde = conversation && large;
  // Le chat et l'avis prennent tout l'écran : la barre de navigation s'efface ;
  // « Dashboard » dans le chat ramène à la page, et la barre avec.
  useEffect(() => {
    if (!scinde) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [scinde]);

  // Une notification « avis prêt » ouvre l'estimation par l'adresse.
  const demandee = params.get("estimation");
  useEffect(() => {
    if (!demandee || !data) return;
    const e = (data.estimations || []).find((x) => x.id === demandee);
    if (e) reprendre(e);
    setParams((p) => { const n = new URLSearchParams(p); n.delete("estimation"); return n; }, { replace: true });
  }, [demandee, data, setParams]);

  // Le menu ⋯ d'une carte : renommer le bien.
  const MenuEstimation = ({ e, bouton, place }) => {
    const estOuvert = menuCarte === e.id;
    const zone = useFermerAuClicAilleurs(estOuvert, () => setMenuCarte(null));
    return (
      <div ref={zone} className="contents">
        <button onClick={(ev) => { ev.stopPropagation(); setMenuCarte(estOuvert ? null : e.id); }}
          className={`absolute ${bouton} text-ardoise transition-colors hover:text-encre`} aria-label="Actions" style={{ background: "transparent" }}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {estOuvert && (
          <div className={`absolute ${place} z-20 min-w-[180px] rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.14)]`}>
            <button
              onClick={() => {
                setMenuCarte(null);
                const bien = window.prompt("Nom du bien :", e.bien || "");
                if (bien?.trim()) renommer.mutate({ id: e.id, bien: bien.trim() });
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-craie transition-colors hover:bg-encre/[0.06]">
              <Pencil className="h-3.5 w-3.5" /> Renommer
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden text-encre">
      {/* En conversation, sur un écran large : le chat à gauche, l'avis qui se construit à droite.
          Le chat garde sa place dans l'arbre d'un mode à l'autre, sinon il perdrait son fil. */}
      {/* Chaque colonne défile pour elle-même : la page, elle, ne bouge pas. */}
      <div className={scinde ? "grid h-[100dvh] grid-cols-[minmax(360px,440px)_minmax(0,1fr)] overflow-hidden" : ""}>
      <div className={`animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out ${conversation ? (scinde ? "h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5" : "px-5 md:px-8") : "px-5 py-6 md:px-10 md:py-9"}`}>
        <div className={`mx-auto ${conversation ? (scinde ? "max-w-none" : "max-w-[1100px]") : "max-w-[1400px]"}`}>
          {/* Le chat : il pose les questions, puis rédige l'avis de valeur. */}
          <header className={conversation ? "flex flex-col" : "flex flex-col items-center pt-[6vh] text-center max-md:pt-4"}>
            {!conversation && (
              <>
                <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Quel bien estimez-vous ?</h1>
                <p className="m-0 mt-2 text-[14px] text-ardoise">{modeChat === "sans_document" ? "Dites ce que vous savez : seul ce qui manque sera demandé." : "Joignez le bail avec « + » : il est lu, seul ce qui manque est demandé."}</p>
              </>
            )}
            <div className={conversation ? "w-full" : "mt-8 w-full max-w-[660px] max-md:mt-6"}>
              <ChatDashboard espace="estimation" onConversation={surConversation} onHistorique={setHistorique} onMode={setModeChat} onReponse={surReponse} avisACote={large} barreApercu={scinde} onTravail={setTravail}
                selectionAvis={scinde ? selectionAvis : null} onEffacerSelection={() => setSelectionAvis(null)}
                onRecherche={(r) => {
                  if (!r?.avis_id) return;
                  rafraichir();
                  setCourante(r.avis_id);
                  // À côté du chat, l'avis est déjà là ; au téléphone, il s'ouvre par-dessus.
                  if (!large) setAvisOuvert(r.avis_id);
                }} />
            </div>
          </header>
        </div>
        {!conversation && (historique ? (
          <div className="mx-auto mt-[6vh] max-w-[1400px]"><HistoriqueColonne espace="estimation" /></div>
        ) : (
          <div className="mx-auto mt-[7vh] max-w-[1100px]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div className="flex items-baseline gap-3">
                <h2 className="m-0 text-[20px] font-normal tracking-[-0.01em] text-encre">Vos estimations</h2>
                {estimations.length > 0 && <span className="text-[13.5px] text-ardoise">{estimations.length}</span>}
              </div>
              {estimations.length > 4 && (
                <div className="flex min-w-[240px] max-w-[420px] items-center gap-3 rounded-full border border-trait bg-surface-pleine px-4 py-2.5 focus-within:border-bord-doux">
                  <Search className="h-3.5 w-3.5 flex-shrink-0 text-ardoise" />
                  <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un bien" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
                </div>
              )}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>
            ) : !estimations.length ? (
              <p className="py-16 text-center text-sm text-brume">Aucune estimation encore : dites au chat quel bien vous estimez.</p>
            ) : (
              // Des lignes, comme les mandats : le bien à gauche, son avancement à droite.
              <div className="border-y border-trait">
                {estimations.map((e) => {
                  const i = Math.max(0, ETAPES_LISTE.findIndex(([cle]) => cle === statutDe(e)));
                  const demandeur = e.avis?.demandeur || e.questionnaire?.demandeur;
                  const detail = [demandeur && !/compléter/.test(demandeur) ? demandeur : null, e.rapport?.prix_bas ? `${euros(e.rapport.prix_bas)} – ${euros(e.rapport.prix_haut)}` : null, dateCourte(majDe(e))].filter(Boolean).join(" · ");
                  return (
                    <div key={e.id} className="relative border-t border-trait px-2 py-5 pr-12 first:border-t-0">
                      <button onClick={() => reprendre(e)} className="flex w-full flex-wrap items-center gap-x-8 gap-y-3 text-left" style={{ background: "transparent" }}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[16px] text-encre">{e.bien}</span>
                          {detail && <span className="mt-1 block truncate text-[13.5px] text-ardoise">{detail}</span>}
                        </span>
                        <span className="block w-[260px] flex-none max-md:w-full" aria-label={`Étape ${i + 1} sur ${ETAPES_LISTE.length} : ${ETAPES_LISTE[i][1]}`}>
                          <span className="flex items-baseline justify-between text-[14px]">
                            <span className="text-encre">{ETAPES_LISTE[i][1]}</span>
                            <span className="tabular-nums text-ardoise">{i + 1}/{ETAPES_LISTE.length}</span>
                          </span>
                          <span className="mt-2 flex gap-1">
                            {ETAPES_LISTE.map(([cle], n) => (
                              <span key={cle} className={`h-[5px] flex-1 rounded-full ${n < i || (n === i && i === ETAPES_LISTE.length - 1) ? "bg-menthe" : n === i ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />
                            ))}
                          </span>
                        </span>
                      </button>
                      <MenuEstimation e={e} bouton="top-1/2 -translate-y-1/2 right-2" place="top-[calc(50%+14px)] right-1" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      {scinde && <ApercuAvis id={courante} selection={selectionAvis} onSelection={setSelectionAvis} generation={generation} onGenere={() => setGeneration(false)} travail={travail} />}
      </div>

      {/* L'avis, par-dessus tout (barre latérale comprise) : on le ferme et on reprend le fil.
          Un portail : la page est animée (transformée), un plein écran posé dedans s'y calerait. */}
      {avis?.avis && createPortal(
        <div className="avis-modale fixed inset-0 z-[70]" style={{ background: "rgb(var(--k-fond-rgb))" }}>
          <EditeurAvis estimation={avis} onRetour={() => { setAvisOuvert(null); rafraichir(); }} libelleRetour="Fermer" />
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Un écran assez large pour le chat et l'avis côte à côte. */
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

/**
 * La moitié droite : l'avis de valeur de la conversation, modifiable à tout
 * moment. Avant la rédaction, il se remplit à chaque réponse du chat.
 */
// Les étapes montrées pendant la génération du premier avis de valeur.
const ETAPES_GENERATION = [
  "Lecture de votre demande",
  "Localisation du bien",
  "Identification du demandeur",
  "Lecture du bail et des loyers",
  "Comparables du secteur",
  "Rendement et fourchette de valeur",
  "Mise en page de l'avis de valeur",
];

function ApercuAvis({ id, selection, onSelection, generation = false, onGenere = null, travail = null }) {
  // Après un message, l'avis s'efface le temps que le chat travaille : ses
  // étapes s'affichent à la place, au moins un instant, puis l'avis revient.
  const [maj, setMaj] = useState(false);
  const enCours = !!travail?.enCours;
  useEffect(() => {
    if (enCours) { setMaj(true); return undefined; }
    const t = setTimeout(() => setMaj(false), 900);
    return () => clearTimeout(t);
  }, [enCours]);
  const { data, isLoading } = useQuery({
    queryKey: ["m-apercu", id],
    queryFn: () => base44.request("GET", `${API}/${id}/apercu`),
    enabled: !!id,
  });
  const reste = data?.manquants?.length || 0;
  if (generation) {
    return (
      <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux bg-fond">
        <div className="h-14 flex-none border-b border-trait k-barre-apercu" />
        <div className="min-h-0 flex-1"><GenerationDocument surtitre="Génération de l'avis de valeur" titre="L'avis de valeur se prépare" etapes={ETAPES_GENERATION} pret={!!id && !!data} onFini={() => onGenere?.()} /></div>
      </div>
    );
  }
  if (maj && id && data) {
    return (
      <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux bg-fond">
        <div className="h-14 flex-none border-b border-trait k-barre-apercu" />
        <div className="min-h-0 flex-1"><MiseAJourDocument surtitre="Mise à jour de l'avis de valeur" titre="L'avis de valeur s'adapte" etapes={travail?.etapes || []} enCours={enCours} /></div>
      </div>
    );
  }
  if (!id || !data) {
    return (
      <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux bg-fond">
        <div className="grid h-full place-items-center px-10 text-center">
          {id && isLoading ? <Loader2 className="h-5 w-5 animate-spin text-ardoise" /> : (
            <p className="m-0 max-w-[42ch] text-[14px] leading-[1.6] text-ardoise">L'avis de valeur se construit ici à mesure de vos réponses : l'adresse, le demandeur, le bail, puis la valeur Data-B une fois rédigé. Vous pouvez le modifier à tout moment.</p>
          )}
        </div>
      </div>
    );
  }
  // Rédigé ou encore en questions, l'avis se modifie : avant la rédaction, les
  // retouches sont gardées à part et se reposent sur l'avis rédigé.
  return (
    <div className="flex h-[100dvh] min-h-0 min-w-0 flex-col overflow-hidden border-l border-bord-doux bg-fond">
      <div className="min-h-0 flex-1 animate-in fade-in slide-in-from-bottom-3 duration-700">
        <EditeurAvis key={data.estimation.id} estimation={data.provisoire ? { ...data.estimation, avis: data.avis } : data.estimation}
          provisoire={data.provisoire} integre onRetour={() => {}} onSelection={onSelection} selectionExterne={selection}
          statut={data.provisoire ? `${reste ? `${reste} information${reste > 1 ? "s" : ""} encore attendue${reste > 1 ? "s" : ""}` : "Prêt à rédiger"} · vos retouches sont gardées` : null} />
      </div>
    </div>
  );
}
