import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne, cartesDe } from "@/components/dashboard/ChatDashboard";
import RaccourcisHaka from "@/components/haka/RaccourcisHaka";
import LivrableAccueil, { usePropositionsNees } from "@/components/haka/LivrableAccueil";
import { Depliant, PanneauSources, PastilleSource } from "@/components/haka/ReglagesDemande";
import { useCompteHaka } from "@/components/haka/useFileHaka";
import PastilleAFaire from "@/components/dashboard/PastilleAFaire";
import PastilleFiches from "@/components/dashboard/PastilleFiches";
import { useLocation } from "react-router-dom";
import { sourceDe } from "@/lib/sources";
import { base44 } from "@/api/base44Client";
import { PanneauFlottant, PanneauNote, usePanneau } from "@/components/fiche-dossier/FicheDossier";

// L'Accueil de l'équipe (17 oct. 2026, Jules : « comme l'accueil de Max ») :
// la page sert à donner du travail à Haka et à voir ce qu'il a préparé. De
// haut en bas : l'Agenda et les boîtes, le salut, la saisie (avec le dossier
// en contexte), les raccourcis, les cartes de compétences, puis « À valider »
// et « Fait par Haka ». Aucun chiffre de pilotage : ils ont leurs pages.
// Une demande envoyée (19 oct. 2026, Jules) : la barre de navigation reste, le fond Halo aussi, et le chat
// prend la mise en page du dossier en mode IA, au milieu. L'écran ne se scinde (Haka à gauche, le livrable à
// droite) que quand Haka a produit quelque chose : une carte qui s'ouvre, un dossier, une proposition.
// Les questions d'AK sur les appels et les objections à résoudre ont quitté la page (3 nov. 2026, Jules) ; leurs
// composants restent (QuestionsDAK, ObjectionsAResoudre).

const CLE_LARGEUR = "klocka.accueil.largeur-chat";
const LARGEUR_DEFAUT = 420;
// Avec une fiche ouverte, le chat prend 60 % de la page et la fiche le reste (19 nov. 2026, seconde capture de Jules :
// « voici le ratio que je veux » ; 42 % la première fois). Tirée à la poignée, la part se garde ; la clé a changé pour
// que la part gardée avant ne masque pas la nouvelle.
const CLE_RATIO_FICHE = "klocka.accueil.ratio-fiche-2";
const RATIO_FICHE = 0.6;
const ratioLu = () => { try { const v = Number(localStorage.getItem(CLE_RATIO_FICHE)); return v > 0.2 && v < 0.8 ? v : RATIO_FICHE; } catch { return RATIO_FICHE; } };
const borner = (l) => Math.round(Math.min(Math.max(l, 300), Math.max(320, (typeof window !== "undefined" ? window.innerWidth : 1600) - 560)));

/** Un écran assez large pour Haka et le livrable côte à côte. */
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

/** Ce qu'une réponse a produit et qui s'ouvre : les cartes du chat, le dossier né d'une fiche. */
function livrablesDe(r) {
  const cartes = cartesDe(r).filter((c) => c.lien && !/^(resultats|datab|avis|mandat):/.test(String(c.lien)));
  const dossiers = [
    ...(r?.type === "fiche" && r.deal_id ? [r.deal_id] : []),
    ...(r?.blocs || []).filter((b) => b.type === "fiche" && b.deal_id).map((b) => b.deal_id),
  ].map((id) => ({ titre: "Dossier créé et pré-analysé", lien: `/Dossiers?deal_id=${id}`, etat: "fait", action: "Ouvrir le dossier" }));
  return [...dossiers, ...cartes];
}

export default function AdminDashboardView() {
  const hakaActif = !!useCompteHaka().data?.actif;
  useEffect(() => {
    document.documentElement.classList.add("k-sans-ascenseur");
    return () => document.documentElement.classList.remove("k-sans-ascenseur");
  }, []);
  const large = useEcranLarge();
  const [conversation, setConversation] = useState(false);
  const [dossier, setDossier] = useState(null);
  const [travail, setTravail] = useState(false);
  const [livrables, setLivrables] = useState([]);
  const [depuis, setDepuis] = useState(null);
  // Les réglages d'une demande (17 oct. 2026, Jules) : sources « Auto » ou cochées, « Répondre » ou « Produire ».
  const [sources, setSources] = useState([]);
  const [sortie, setSortie] = useState("repondre");
  const [sourcesOuvert, setSourcesOuvert] = useState(false);
  const panneauSources = <PanneauSources sources={sources} onChange={setSources} />;
  // La compétence choisie (carte ou raccourci) : une pastille dans la saisie, « Produire », et ses sources dessous (17 oct. 2026).
  const [competence, setCompetence] = useState(null);
  const [eteintes, setEteintes] = useState([]);
  const choisirCompetence = useCallback((c, eteintesDepart = []) => {
    setCompetence(c || null);
    setEteintes(c ? eteintesDepart : []);
    if (c) setSortie("produire");
  }, []);
  // Plus de bascule Répondre / Produire dans la saisie (19 nov. 2026, Jules) : l'icône lien prend sa place ; une
  // compétence choisie passe toujours en « produire ».
  const reglages = useMemo(() => ({ sources, sortie, sourcesOuvert, onOuvrirSources: () => setSourcesOuvert((o) => !o), panneau: panneauSources, competence, eteintes, choisirCompetence }),
    // Le panneau se redessine avec les sources : elles suffisent à le suivre.
    [sources, sortie, sourcesOuvert, competence, eteintes, choisirCompetence]);
  // Une conversation qui commence repart d'un panneau vide ; qui se ferme, l'Accueil revient.
  const surConversation = useCallback((ouverte) => {
    setConversation(ouverte);
    if (ouverte) setDepuis((d) => d || new Date(Date.now() - 5000).toISOString());
    else { setDepuis(null); setLivrables([]); setSortie("repondre"); setCompetence(null); setEteintes([]); }
  }, []);
  const surReponse = useCallback((r) => {
    const nouveaux = livrablesDe(r);
    if (nouveaux.length) setLivrables((l) => [...l, ...nouveaux].filter((x, i, t) => t.findIndex((y) => y.titre === x.titre && y.lien === x.lien) === i));
  }, []);
  const surTravail = useCallback((t) => setTravail(!!t?.enCours), []);
  // Sur ordinateur, la pilule des boîtes rejoint le coin en haut à droite, à côté de « Rappel » (8 oct. 2026).
  const [coin, setCoin] = useState(null);
  useEffect(() => { setCoin(document.getElementById("k-haut-droite")); }, []);
  const [historique, setHistorique] = useState(false);
  // L'Intelligence (14 oct. 2026) : la question d'une décision sans motif, ouverte depuis sa notification, posée dans le chat.
  const { search } = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(search).get("layer_question") || new URLSearchParams(search).get("cerveau_question");
    if (!id) return;
    base44.request("GET", `/api/layer/questions/${id}`).then(({ question }) => {
      if (!question || question.etat === "repondue") return;
      window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: null, api: "/api/assistant", qs: "", secours: [{ role: "assistant", reprise: true, contenu: question.texte }] } }));
    }).catch(() => {});
  }, [search]);

  // En conversation, la page ne défile plus : le chat (et le livrable) défilent chacun dans sa colonne ; la barre
  // latérale reste. L'écran se scinde seulement quand quelque chose a été produit.
  const nees = usePropositionsNees(conversation ? depuis : null, null);
  const enConversation = large && conversation;
  // La fiche du dossier ou l'action d'une note (19 nov. 2026, Jules) : à droite du chat, comme un livrable ; hors
  // conversation ou sur un petit écran, par-dessus la page.
  const [panneau, setPanneau] = usePanneau();
  useEffect(() => {
    if (!panneau) return undefined;
    const echap = (e) => { if (e.key === "Escape") setPanneau(null); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [panneau, setPanneau]);
  const scinde = enConversation && (livrables.length > 0 || nees.length > 0 || !!panneau);
  // Une conversation fermée emporte son panneau.
  useEffect(() => { if (!conversation) setPanneau(null); }, [conversation, setPanneau]);
  useEffect(() => {
    if (!enConversation) return undefined;
    document.documentElement.classList.add("k-sans-defilement");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-defilement");
  }, [enConversation]);
  const [largeurChat, setLargeurChat] = useState(() => { try { const v = Number(localStorage.getItem(CLE_LARGEUR)); return v ? borner(v) : LARGEUR_DEFAUT; } catch { return LARGEUR_DEFAUT; } });
  const [tire, setTire] = useState(false);
  const derniere = useRef(largeurChat);
  const pageRef = useRef(null);
  const [largeurPage, setLargeurPage] = useState(0);
  useEffect(() => {
    const el = pageRef.current;
    if (!el || !enConversation || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setLargeurPage(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [enConversation]);
  const [ratioFiche, setRatioFiche] = useState(ratioLu);
  // Le bas de la colonne de droite (fiche, message, livrable) sur le bas de la barre de chat (19 nov. 2026, Jules) :
  // mesuré sur la saisie, qui ne bouge pas quand elle grandit (elle pousse vers le haut).
  const [basChat, setBasChat] = useState(20);
  useEffect(() => {
    if (!scinde) return undefined;
    const mesurer = () => {
      const saisie = pageRef.current?.querySelector(".k-colonne-chat .k-saisie-chat");
      const page = pageRef.current?.getBoundingClientRect();
      if (!saisie || !page) return;
      const ecart = Math.round(page.bottom - saisie.getBoundingClientRect().bottom);
      if (ecart >= 0 && ecart < 200) setBasChat(ecart);
    };
    const t = setTimeout(mesurer, 80);
    window.addEventListener("resize", mesurer);
    return () => { clearTimeout(t); window.removeEventListener("resize", mesurer); };
  }, [scinde, panneau]);
  const parRatio = !!panneau && largeurPage > 0;
  const bornerFiche = (l) => Math.round(Math.min(Math.max(l, 300), Math.max(320, largeurPage - 420)));
  const largeurVue = parRatio ? bornerFiche(ratioFiche * largeurPage) : largeurChat;
  const tirer = (e) => {
    e.preventDefault();
    setTire(true);
    const gauche = pageRef.current?.getBoundingClientRect().left || 0;
    const bouger = (ev) => {
      if (parRatio) { derniere.current = bornerFiche(ev.clientX - gauche) / largeurPage; setRatioFiche(derniere.current); return; }
      derniere.current = borner(ev.clientX); setLargeurChat(derniere.current);
    };
    const lacher = () => {
      setTire(false);
      try { localStorage.setItem(parRatio ? CLE_RATIO_FICHE : CLE_LARGEUR, String(derniere.current)); } catch { /* navigation privée */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const remettre = () => {
    if (parRatio) { setRatioFiche(RATIO_FICHE); try { localStorage.removeItem(CLE_RATIO_FICHE); } catch { /* rien */ } return; }
    setLargeurChat(LARGEUR_DEFAUT); try { localStorage.removeItem(CLE_LARGEUR); } catch { /* rien */ }
  };

  return (
    <div ref={pageRef} className={enConversation ? `k-page-presentation k-accueil-ia relative grid h-[100dvh] overflow-hidden ${tire ? "select-none" : ""}` : "relative min-h-screen md:h-[100dvh] md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"}
      style={enConversation ? { gridTemplateColumns: scinde ? `${largeurVue}px minmax(0,1fr)` : "minmax(0,1fr)" } : undefined}>
      {/* « Fiches », tout à gauche de la page, à la place de l'Agenda (19 nov. 2026, Jules) : les fiches récentes au
          survol. L'Agenda rejoint les boîtes, en haut à droite. */}
      {/* Le haut de la pilule à 16 px, sur celui des pilules de droite et du logo de la barre (19 nov. 2026, Jules). */}
      {/* 22 nov. 2026, Jules : « Fiches » rejoint « À faire », à sa gauche, en haut à droite ; plus rien en haut à gauche. */}
      {/* Le chat garde sa place dans l'arbre d'un mode à l'autre, sinon il perdrait son fil. */}
      <div className={scinde ? "k-colonne-chat h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5" : enConversation ? "k-colonne-chat mx-auto h-[100dvh] min-h-0 w-full max-w-[860px] overflow-hidden px-5" : `mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pt-4 max-md:pb-14"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Les boîtes d'envoi, en haut à droite : dans le coin sur ordinateur, à droite de l'Agenda au téléphone. */}
          {!conversation && (
            <>
              <div className="flex min-h-[38px] items-center justify-end gap-3">
                {/* « À faire » à la place de l'Agenda et des boîtes mail, passées dans les Paramètres (20 nov. 2026, Jules). */}
                <div className={`flex items-center gap-2 ${coin ? "md:hidden" : ""}`}>
                  <PastilleFiches droite />
                  <PastilleAFaire />
                </div>
              </div>
              {coin && createPortal(<><PastilleFiches droite /><PastilleAFaire /></>, coin)}
            </>
          )}
          <PlanDeTravail
            conversation={conversation}
            historique={historique ? <HistoriqueColonne /> : null}
            chat={<ChatDashboard onConversation={surConversation} onHistorique={setHistorique} onReponse={surReponse} onTravail={surTravail}
              barreApercu={enConversation} sansSkills choixDossier lienNote onDossier={setDossier} libelleAccueil="Assistant Klocka" reglages={reglages}
              placeholderAccueil={hakaActif ? "Ta note en vrac, liée à un bien, un agent ou un client, ou une demande à l'Assistant Klocka…" : "Ta note en vrac (lie-la à un bien, un agent ou un client), ou une question…"} />}
            apresChat={(
              <>
                {/* Les raccourcis remplacent « Connecter un skill » ; les cartes « Ce que Haka sait faire » sont retirées de la page (17 oct. 2026, Jules). */}
                <RaccourcisHaka choisie={competence?.cle || null} onChoisir={(c) => (competence?.cle === c.cle ? choisirCompetence(null) : choisirCompetence({ cle: c.cle, nom: c.nom, outils: c.outils || [] }))} sourcesOuvert={sourcesOuvert} onSources={() => setSourcesOuvert((o) => !o)} nbSources={sources.length} className="mx-auto mt-5 max-w-[820px]" />
                <Depliant ouvert={!!competence && (competence.outils || []).length > 0} className="mx-auto max-w-[900px]">
                  <div className="flex flex-col items-center gap-2.5 pt-5">
                    <div className="flex flex-wrap justify-center gap-2">
                      {[...competence?.outils || []].sort((a, b) => Number(!!b.obligatoire) - Number(!!a.obligatoire)).map((o) => (
                        <PastilleSource key={o.cle} cle={o.cle} fixe />
                      ))}
                    </div>
                  </div>
                </Depliant>
                <Depliant ouvert={sourcesOuvert} className="mx-auto max-w-[900px]"><div className="pt-6">{panneauSources}</div></Depliant>
                {/* Plus d'« Aujourd'hui » ni de « Dans les sept jours » sous l'assistant (20 nov. 2026, Jules : « ça dénature le
                    but du dashboard ») : les actions datées restent dans chaque fiche, onglet Prochaine action. */}
              </>
            )}
          />
        </motion.div>
      </div>
      {/* Le livrable, un écran dans l'écran : une carte posée sur le fond, comme la lettre à côté du chat. */}
      {scinde && (
        <motion.div className="h-[100dvh] min-h-0 min-w-0 pr-2 pt-2" style={{ paddingBottom: basChat }}
          initial={{ opacity: 0, x: 48, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}>
          {panneau ? (
            // La fiche prend toute la partie droite ; le chat et la navigation à gauche (19 nov. 2026, Jules). La carte
            // arrondie, sur le fond de la fiche d'appel du chat en sombre (le verre), celui de la saisie du chat en
            // clair (20 nov. 2026, Jules, après l'essai d'un panneau droit collé au bord).
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-trait k-fiche-fond">
              <PanneauNote vue={panneau} onVue={setPanneau} onFermer={() => setPanneau(null)} />
            </div>
          ) : (
            <div className="h-full min-h-0 overflow-hidden k-verre">
              <LivrableAccueil livrables={livrables} dossier={dossier} depuis={depuis} travail={travail} />
            </div>
          )}
        </motion.div>
      )}
      {!enConversation && <PanneauFlottant vue={panneau} setVue={setPanneau} />}
      {scinde && (
        <div role="separator" aria-orientation="vertical" aria-label="Largeur du chat" title="Tirer pour élargir ou réduire le chat ; double-clic pour revenir"
          onPointerDown={tirer} onDoubleClick={remettre}
          className="group absolute inset-y-0 z-20 flex w-3 cursor-col-resize justify-center" style={{ left: largeurVue - 6 }}>
          <span className={`my-auto h-10 w-[3px] rounded-full transition-colors ${tire ? "bg-menthe" : "bg-transparent group-hover:bg-bord-vif"}`} />
        </div>
      )}
    </div>
  );
}
