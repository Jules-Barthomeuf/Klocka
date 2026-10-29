import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Monitor, MoreHorizontal, Search, Send, Trash2, X } from "lucide-react";
import EnvoiClient from "@/components/presentations/EnvoiClient";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import { depuisCourt } from "@/components/ui/liste-documents";
import EditeurPresentation from "@/components/presentations/EditeurPresentation";
import ApercuPdf from "@/components/presentations/ApercuPdf";
import Chargement from "@/components/ui/Chargement";
import { PoigneeEditeur, useLargeurChat } from "@/components/editeur/Editeur";

// Présentations — les dossiers bancaires « Projet de Financement » (12 oct.
// 2026). Comme Offres et le Mandat : le chat à gauche, la présentation à
// droite. On nomme un projet (« fais la préz du projet de Dieppe ») ou on le
// choisit dans la liste : les seize diapositives se construisent depuis ses
// données, puis se retouchent sur place ou en parlant au chat. Elles partent
// en PPTX ou en Google Slides.

const API = "/api/admin/presentations-bancaires";
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function AdminPresentations() {
  const queryClient = useQueryClient();
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [courante, setCourante] = useState(null);
  const [travail, setTravail] = useState({ enCours: false, etapes: [] });
  const [choixProjet, setChoixProjet] = useState(false);
  const [pdfDe, setPdfDe] = useState(null);
  const pdfDeRef = useRef(null);
  pdfDeRef.current = pdfDe;
  const [toutes, setToutes] = useState(false);
  const large = useEcranLarge();
  const [ouverteTel, setOuverteTel] = useState(true);
  useEffect(() => { if (courante) setOuverteTel(true); }, [courante]);

  // Pendant un export, la liste se relit chaque seconde : « Génération 9/14 » avance.
  const { data, isLoading } = useQuery({
    queryKey: ["presentations-bancaires"], queryFn: () => base44.request("GET", API),
    refetchInterval: (q) => ((q.state.data?.presentations || []).some((p) => p.pdf_en_cours) || pdfDeRef.current ? 1000 : false),
  });
  const presentations = data?.presentations || [];
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] });

  // Une présentation ouverte : sa conversation reprend à gauche, elle à droite.
  const ouvrir = useCallback((p) => {
    setCourante(p.id);
    const reprise = { role: "assistant", reprise: true, contenu: `La présentation ${p.titre ? `« ${p.titre} »` : ""} est ouverte à droite. Retouchez-la directement, ou dites-moi ci-dessous ce qu'il faut changer.`.replace(/\s+/g, " ") };
    window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: p.conversation_id || null, api: "/api/assistant", qs: "", secours: [reprise] } }));
  }, []);

  // La présentation créée ou retouchée par le chat se relie à la conversation en cours.
  const [conversationId, setConversationId] = useState(null);
  const aLier = useRef(null);
  useEffect(() => {
    const id = aLier.current;
    if (!id || !conversationId || !data) return;
    const p = presentations.find((x) => x.id === id);
    if (!p) return;
    aLier.current = null;
    if (p.conversation_id) return;
    base44.request("PATCH", `${API}/${id}`, { body: { conversation_id: conversationId } }).then(rafraichir).catch(() => { /* elle reste ouvrable, sans sa conversation */ });
  }, [conversationId, data]);

  const surReponse = useCallback((r) => {
    const id = (r?.actions || []).map((a) => a?.resultat?.presentation_id).filter(Boolean).at(-1);
    if (id) {
      setCourante(id);
      aLier.current = id;
      queryClient.invalidateQueries({ queryKey: ["presentation-bancaire", id] });
    }
    rafraichir();
  }, [queryClient]);

  const ouverteAvant = useRef(false);
  const surConversation = useCallback((ouverte) => {
    if (!ouverte && ouverteAvant.current) setCourante(null);
    ouverteAvant.current = ouverte;
    setConversation(ouverte);
  }, []);

  // Depuis la liste des projets, sans passer par le chat.
  const creer = useMutation({
    mutationFn: (projet_id) => base44.request("POST", API, { body: { projet_id } }),
    onSuccess: (r) => { setChoixProjet(false); rafraichir(); ouvrir({ id: r.presentation_id }); },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `${API}/${id}`),
    onSuccess: (_, id) => { if (courante === id) setCourante(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  // La colonne de droite s'ouvre dès qu'une présentation se construit.
  const enConstruction = creer.isPending || (travail.enCours && !courante);
  const scinde = large && (conversation || !!courante || creer.isPending);
  useEffect(() => {
    if (!scinde) return undefined;
    // Une présentation ouverte : le fond choisi, uni ; ni halo, ni grain, ni points (12 oct. 2026, Jules).
    document.documentElement.classList.add("k-sans-barre", "k-sobre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre", "k-sobre");
  }, [scinde]);

  // La largeur du chat (12 oct. 2026, Jules) : la poignée commune des éditeurs se tire ; un double-clic la remet.
  // Gardée dans ce navigateur, c'est un confort de la personne.
  const poignee = useLargeurChat("klocka.presentations.largeur-chat");
  const { largeur: largeurChat, tire } = poignee;

  // La liste (maquette de Jules, 12 oct. 2026) : Nom, Modifié, PDF, et les quatre dernières tant qu'on n'a pas tout affiché.
  const LIMITE = 4;
  const affichees = toutes ? presentations : presentations.slice(0, LIMITE);
  const liste = (
    // Sur le fond de la page, comme Offres (28 oct. 2026, le modèle de la page éditeur : aucune partie d'une autre couleur).
    <div className={scinde ? "mt-8" : "mx-auto mt-[7vh] max-w-[790px]"}>
      <div className="flex items-center justify-between gap-3 pb-[14px]">
        <div className="flex items-baseline gap-[10px]">
          <h2 className="m-0 text-[19px] font-medium tracking-[-0.01em] text-encre">Vos présentations</h2>
          {presentations.length > 0 && <span className="text-[15px] text-ardoise tabular-nums">{presentations.length}</span>}
        </div>
        {presentations.length > LIMITE && (
          <button type="button" onClick={() => setToutes(!toutes)} className="text-[14px] text-craie hover:text-encre" style={{ background: "transparent" }}>{toutes ? "Réduire" : "Tout afficher"}</button>
        )}
      </div>
      {isLoading ? (
        <Chargement />
      ) : !presentations.length ? (
        <p className="py-12 text-center text-[14px] text-brume">
          Aucune présentation encore : nommez un projet au chat, ou{" "}
          <button type="button" onClick={() => setChoixProjet(true)} className="text-craie underline underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>partez de la liste des projets</button>.
        </p>
      ) : (
        <div className="border-t border-trait">
          <div className={`${COLONNES} h-[41px] border-b border-trait text-[12.5px] text-brume max-md:hidden`}>
            <span className="pl-3">Nom</span><span>Modifié</span><span>PDF</span><span />
          </div>
          {affichees.map((p) => (
            <LignePresentation key={p.id} p={p} active={p.id === courante} onOuvrir={() => ouvrir(p)} onPdf={() => setPdfDe(p)} onSupprimer={() => supprimer.mutate(p.id)} />
          ))}
        </div>
      )}
    </div>
  );

  const droite = courante ? (
    <EditeurPresentation key={courante} id={courante} travail={travail} onFermer={() => setCourante(null)} />
  ) : enConstruction ? (
    <div className="h-full"><MiseAJourDocument surtitre="Présentation bancaire" titre="La présentation se construit" etapes={travail.etapes?.length ? travail.etapes : ["Lecture du projet", "La ville et le quartier", "La carte et les enseignes", "Les seize diapositives"]} enCours /></div>
  ) : (
    <div className="grid h-full place-items-center px-10 text-center">
      <p className="m-0 max-w-[44ch] text-[14px] leading-[1.6] text-ardoise">La présentation se construit ici dès que le chat a le projet. Tout s'y retouche sur place : un texte au clic, une photo au clic, une diapositive se masque ou se déplace. Elle part en PDF.</p>
    </div>
  );

  return (
    <div className="k-page-presentation relative min-h-screen w-full max-w-full overflow-x-hidden text-encre">
      {/* Le chat garde sa place dans l'arbre d'un mode à l'autre, sinon il perdrait son fil. */}
      <div className={scinde ? `relative grid h-[100dvh] overflow-hidden ${tire ? "select-none" : ""}` : ""} style={scinde ? { gridTemplateColumns: `${largeurChat}px minmax(0,1fr)` } : undefined}>
        <div className={scinde ? (conversation ? "k-colonne-chat h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5" : "k-colonne-chat h-[100dvh] min-h-0 min-w-0 overflow-y-auto px-5 pb-8") : conversation ? "px-5 md:px-8" : "px-5 py-6 md:px-10 md:py-9"}>
          <div className={`mx-auto ${scinde ? "max-w-none" : conversation ? "max-w-[1100px]" : "max-w-[1400px]"}`}>
            <header className={conversation ? "flex flex-col" : `flex flex-col items-center text-center ${scinde ? "pt-10" : "pt-[6vh] max-md:pt-4"}`}>
              {!conversation && (
                <>
                  <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Quelle présentation préparez-vous ?</h1>
                  <p className="m-0 mt-2 max-w-[56ch] text-[14px] text-ardoise">Nommez le projet : la présentation bancaire se construit depuis ses données, puis se retouche sur place ou en parlant.</p>
                </>
              )}
              <div className={conversation ? "w-full" : `w-full ${scinde ? "mt-6" : "mt-8 max-w-[660px] max-md:mt-6"}`}>
                {/* « Toutes les présentations » (17 oct. 2026, Jules) : vide le chat, ferme la présentation et rend la page avec la liste. */}
                <ChatDashboard espace="presentation" libelleAccueil="Toutes les présentations" onConversation={surConversation} onHistorique={setHistorique} onReponse={surReponse}
                  barreApercu={scinde && conversation} onTravail={setTravail} contexte={courante ? { presentation_id: courante } : null} onConversationId={setConversationId} />
              </div>
            </header>
          </div>
          {!conversation && (historique ? (
            <div className="mx-auto mt-[6vh] max-w-[1400px]"><HistoriqueColonne espace="admin" /></div>
          ) : liste)}
        </div>
        {/* L'éditeur sur le fond de la page, comme le chat (28 oct. 2026, le modèle de la page éditeur) : plus de carte, la poignée sépare. */}
        {scinde && <div className="h-[100dvh] min-h-0 min-w-0 overflow-hidden">{droite}</div>}
        {/* La poignée entre le chat et l'éditeur. */}
        {scinde && <PoigneeEditeur {...poignee} />}
      </div>

      {pdfDe && <ApercuPdf id={pdfDe.id} titre={pdfDe.titre} onFermer={() => setPdfDe(null)} />}
      {/* Au téléphone : la présentation par-dessus tout, on la ferme pour revenir au chat. */}
      {!large && courante && ouverteTel && createPortal(
        <div className="k-presentation-tel fixed inset-0 z-[70]" style={{ background: "rgb(var(--k-fond-rgb))" }}>
          <EditeurPresentation key={courante} id={courante} travail={travail} onFermer={() => { if (conversation) setOuverteTel(false); else setCourante(null); }} />
        </div>,
        document.body,
      )}
      {!large && courante && !ouverteTel && conversation && (
        <button type="button" onClick={() => setOuverteTel(true)}
          className="fixed left-1/2 top-[calc(var(--k-haut-mobile,3.5rem)+3.75rem)] z-30 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border border-bord-vif bg-surface-pleine px-4 text-[13px] text-encre shadow-[0_18px_40px_rgb(0_0_0/0.18)] md:hidden">
          <FileText className="h-4 w-4 text-menthe" /> Voir la présentation
        </button>
      )}
      {choixProjet && <ChoixProjet enCours={creer.isPending} onChoisir={(id) => creer.mutate(id)} onFermer={() => { if (!creer.isPending) setChoixProjet(false); }} />}
    </div>
  );
}

/** L'état du PDF d'une présentation : en génération, à télécharger (avec sa date), ou pas encore exporté. */
function EtatPdf({ p }) {
  if (p.pdf_en_cours) {
    return <span className="text-[13px] text-bleu tabular-nums">Génération {Math.min(p.pdf_en_cours.fait + 1, p.pdf_en_cours.total)}/{p.pdf_en_cours.total}</span>;
  }
  if (p.pdf_url && p.pdf_le) {
    const date = new Date(p.pdf_le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return (
      <a href={p.pdf_url} download={`${p.titre || "presentation"}.pdf`} title={`Télécharger le PDF du ${quand(p.pdf_le)}`}
        className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-bord-doux bg-surface px-3 text-[13px] text-encre no-underline hover:border-bord-vif">
        <Download className="h-3.5 w-3.5" />{date}
      </a>
    );
  }
  return <span className="text-[13px] text-brume">Non exporté</span>;
}

/** Les colonnes de la liste (maquette de Jules, 12 oct. 2026) : Nom, Modifié, PDF, le menu. */
const COLONNES = "grid grid-cols-[minmax(0,1fr)_137px_170px_43px] items-center max-md:grid-cols-[minmax(0,1fr)_auto_43px]";

/** Une présentation de la liste : la couverture, le titre et son détail, la date, le PDF, le menu. */
function LignePresentation({ p, active, onOuvrir, onPdf, onSupprimer }) {
  const [menu, setMenu] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const envoyee = (p.envoye_a || []).length > 0;
  const zone = useFermerAuClicAilleurs(menu, () => setMenu(false));
  const detail = [p.adresse, `${p.diapos} diapositive${p.diapos > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
  // « Chocolaterie - 10 Place Abel Surchamp… » : l'adresse est dans le détail, le titre garde le nom.
  const titre = String(p.titre || "").split(/\s[-–]\s(?=\d)/)[0] || p.titre;
  const action = "flex w-full items-center gap-2.5 px-3.5 py-2 text-[12.5px]";
  return (
    <>
      <div role="button" tabIndex={0} onClick={onOuvrir} onKeyDown={(e) => { if (e.key === "Enter") onOuvrir(); }}
        className={`${COLONNES} relative min-h-[73px] cursor-pointer border-b border-trait py-[13px] last:border-b-0 hover:bg-encre/[0.02] ${active ? "bg-surface" : ""}`}>
        <span className="flex min-w-0 items-center gap-4 pl-3">
          <span aria-hidden className="relative grid h-[46px] w-[70px] flex-none place-items-center overflow-hidden rounded-[6px] border border-trait bg-surface">
            {p.photo ? <img src={p.photo} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" /> : <Monitor className="h-3.5 w-3.5 text-ardoise" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium text-encre">{titre}</span>
            <span className="mt-[3px] block truncate text-[13px] text-ardoise">{detail}</span>
          </span>
        </span>
        {/* La date, et à sa droite l'avion en papier : « Envoyer au client » (13 oct. 2026, Jules). Envoyée, il passe en menthe. */}
        <span className="flex items-center gap-1.5 max-md:hidden" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <span className="text-[14px] text-craie">{depuisCourt(p.maj_le)}</span>
          <button type="button" onClick={() => setEnvoi(true)} aria-label={envoyee ? `Envoyée à ${p.envoye_a.join(", ")} : modifier l'envoi` : "Envoyer au client"}
            title={envoyee ? `Envoyée à ${p.envoye_a.join(", ")}` : "Envoyer au client"}
            className={`grid h-8 w-8 flex-none place-items-center rounded-full transition-colors ${envoyee ? "text-menthe hover:bg-relief" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={{ background: "transparent" }}>
            <Send className="h-3.5 w-3.5" />
          </button>
        </span>
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation"><EtatPdf p={p} /></span>
        <span ref={zone} className="relative flex justify-center" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
          <button type="button" onClick={() => setMenu(!menu)} aria-label="Actions" title="Actions"
            className="grid h-8 w-8 place-items-center rounded-full text-ardoise transition-colors hover:text-encre max-md:h-10 max-md:w-10" style={{ background: "transparent" }}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <span className="absolute right-0 top-9 z-20 block min-w-[190px] rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
              <button type="button" onClick={() => { setMenu(false); onPdf(); }} className={`${action} text-encre hover:bg-encre/[0.04]`} style={{ background: "transparent" }}>
                <FileText className="h-3.5 w-3.5" /> {p.pdf_url ? "Aperçu du PDF" : "Exporter en PDF"}
              </button>
              <button type="button" onClick={() => { setMenu(false); setEnvoi(true); }} className={`${action} text-encre hover:bg-encre/[0.04]`} style={{ background: "transparent" }}>
                <Send className="h-3.5 w-3.5" /> {envoyee ? "Modifier l'envoi" : "Envoyer au client"}
              </button>
              <button type="button" onClick={() => { setMenu(false); setConfirmer(true); }} className={`${action} text-alerte hover:bg-alerte/[0.08]`} style={{ background: "transparent" }}>
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </span>
          )}
        </span>
      </div>
      {envoi && <EnvoiClient id={p.id} titre={titre} onFermer={() => setEnvoi(false)} />}
      <AlertDialog open={confirmer} onOpenChange={setConfirmer}>
        <AlertDialogContent className="border-bord-vif bg-surface-pleine sm:rounded-bloc">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-encre">Supprimer la présentation « {titre} » ?</AlertDialogTitle>
            <AlertDialogDescription className="text-ardoise">Ses diapositives et ses retouches disparaissent. Les PDF déjà téléchargés restent.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={onSupprimer} className="bg-alerte text-fond hover:bg-alerte/90">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Choisir le projet d'une nouvelle présentation : une recherche, des lignes. */
function ChoixProjet({ enCours, onChoisir, onFermer }) {
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState(null);
  const { data: projets = [], isLoading } = useQuery({ queryKey: ["all-projects-presentations"], queryFn: () => base44.entities.Project.list("-created_date") });
  const trouves = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return projets.filter((p) => !q || [p.titre, p.adresse_complete, p.nom_locataire, p.client_email].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 40);
  }, [projets, recherche]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/70 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3.5">
          <span className="text-[14.5px] text-encre">Nouvelle présentation</span>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 pt-4">
          <div className="flex items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux">
            <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
            <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Projet, adresse, locataire, client"
              className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <Chargement />
          ) : !trouves.length ? (
            <p className="py-10 text-center text-[13.5px] text-brume">Aucun projet ne correspond.</p>
          ) : (
            <div className="border-y border-trait">
              {trouves.map((p) => (
                <button key={p.id} type="button" disabled={enCours} onClick={() => { setChoisi(p.id); onChoisir(p.id); }}
                  className="flex w-full items-center gap-4 border-t border-trait px-2 py-3.5 text-left first:border-t-0 hover:bg-encre/[0.02] disabled:opacity-60" style={{ background: "transparent" }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-encre">{p.titre || "Sans titre"}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-ardoise">{[p.adresse_complete, p.nom_locataire].filter(Boolean).join(" · ")}</span>
                  </span>
                  {enCours && choisi === p.id && <Loader2 className="h-4 w-4 flex-none animate-spin text-ardoise" />}
                </button>
              ))}
            </div>
          )}
        </div>
        {enCours && <p className="m-0 border-t border-trait px-5 py-3 text-[12.5px] text-ardoise">La ville, le quartier, la carte et les enseignes se lisent : une quinzaine de secondes.</p>}
      </div>
    </div>,
    document.body,
  );
}

/** Un écran assez large pour le chat et la présentation côte à côte. */
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
