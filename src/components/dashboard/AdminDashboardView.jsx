import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne, cartesDe } from "@/components/dashboard/ChatDashboard";
import BoiteMail from "@/components/dashboard/BoiteMail";
import ObjectionsAResoudre from "@/components/dashboard/ObjectionsAResoudre";
import QuestionsDAK from "@/components/dashboard/QuestionsDAK";
import CartesCompetences from "@/components/haka/CartesCompetences";
import RaccourcisHaka from "@/components/haka/RaccourcisHaka";
import ColonnesAccueil from "@/components/haka/ColonnesAccueil";
import LivrableAccueil from "@/components/haka/LivrableAccueil";
import { Depliant, PanneauSources } from "@/components/haka/ReglagesDemande";
import { useCompteHaka } from "@/components/haka/useFileHaka";
import PastilleAgenda from "@/components/dashboard/PastilleAgenda";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";

// L'Accueil de l'équipe (17 oct. 2026, Jules : « comme l'accueil de Max ») :
// la page sert à donner du travail à Haka et à voir ce qu'il a préparé. De
// haut en bas : l'Agenda et les boîtes, le salut, la saisie (avec le dossier
// en contexte), les raccourcis, les cartes de compétences, puis « À valider »
// et « Fait par Haka ». Aucun chiffre de pilotage : ils ont leurs pages.
// Une demande envoyée, l'écran se scinde : Haka à gauche, le livrable à
// droite, comme Offres et Présentations.

const CLE_LARGEUR = "klocka.accueil.largeur-chat";
const LARGEUR_DEFAUT = 420;
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
  const reglages = useMemo(() => ({ sources, sortie, setSortie, sourcesOuvert, onOuvrirSources: () => setSourcesOuvert((o) => !o), panneau: panneauSources }),
    // Le panneau se redessine avec les sources : elles suffisent à le suivre.
    [sources, sortie, sourcesOuvert]);
  // Une conversation qui commence repart d'un panneau vide ; qui se ferme, l'Accueil revient.
  const surConversation = useCallback((ouverte) => {
    setConversation(ouverte);
    if (ouverte) setDepuis((d) => d || new Date(Date.now() - 5000).toISOString());
    else { setDepuis(null); setLivrables([]); setSortie("repondre"); }
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

  // L'écran scindé : la barre latérale s'efface, chaque colonne défile seule.
  const scinde = large && conversation;
  useEffect(() => {
    if (!scinde) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [scinde]);
  const [largeurChat, setLargeurChat] = useState(() => { try { const v = Number(localStorage.getItem(CLE_LARGEUR)); return v ? borner(v) : LARGEUR_DEFAUT; } catch { return LARGEUR_DEFAUT; } });
  const [tire, setTire] = useState(false);
  const derniere = useRef(largeurChat);
  const tirer = (e) => {
    e.preventDefault();
    setTire(true);
    const bouger = (ev) => { derniere.current = borner(ev.clientX); setLargeurChat(derniere.current); };
    const lacher = () => {
      setTire(false);
      try { localStorage.setItem(CLE_LARGEUR, String(derniere.current)); } catch { /* navigation privée */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const remettre = () => { setLargeurChat(LARGEUR_DEFAUT); try { localStorage.removeItem(CLE_LARGEUR); } catch { /* rien */ } };

  return (
    <div className={scinde ? `k-page-presentation relative grid h-[100dvh] overflow-hidden ${tire ? "select-none" : ""}` : "relative min-h-screen"}
      style={scinde ? { gridTemplateColumns: `${largeurChat}px minmax(0,1fr)` } : undefined}>
      {/* L'Agenda, tout à gauche de la page (17 oct. 2026, Jules : « plus à gauche »), hors de la colonne centrée. */}
      {!conversation && <div className="absolute left-5 top-4 z-10 md:left-6"><PastilleAgenda /></div>}
      {/* Le chat garde sa place dans l'arbre d'un mode à l'autre, sinon il perdrait son fil. */}
      <div className={scinde ? "h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5" : `mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pb-14 pt-4"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Les boîtes d'envoi, en haut à droite : dans le coin sur ordinateur, à droite de l'Agenda au téléphone. */}
          {!conversation && (
            <>
              <div className="flex min-h-[38px] items-center justify-end gap-3">
                <div className={coin ? "md:hidden" : ""}>
                  <BoiteMail />
                </div>
              </div>
              {coin && createPortal(<BoiteMail />, coin)}
            </>
          )}
          <PlanDeTravail
            conversation={conversation}
            historique={historique ? <HistoriqueColonne /> : null}
            chat={<ChatDashboard onConversation={surConversation} onHistorique={setHistorique} onReponse={surReponse} onTravail={surTravail}
              barreApercu={scinde} sansSkills choixDossier onDossier={setDossier} libelleAccueil="Haka" reglages={reglages}
              placeholderAccueil={hakaActif ? "Collez une note, déposez une fiche, ou demandez à Haka…" : null} />}
            apresChat={(
              <>
                {/* Les raccourcis et les cartes de compétences remplacent « Connecter un skill » (17 oct. 2026). */}
                <RaccourcisHaka dossier={dossier} sourcesOuvert={sourcesOuvert} onSources={() => setSourcesOuvert((o) => !o)} nbSources={sources.length} className="mx-auto mt-5 max-w-[760px]" />
                <Depliant ouvert={sourcesOuvert} className="mx-auto max-w-[900px]"><div className="pt-6">{panneauSources}</div></Depliant>
                <CartesCompetences declencheur="chat" limite={4} contexte={dossier} className="mx-auto mt-12 max-w-[1000px] text-left" />
              </>
            )}
            bas={(
              <div className="flex flex-col gap-10">
                <ColonnesAccueil />
                {/* Les questions d'AK sur les appels et les objections : ce qui attend la personne, sous les deux colonnes, seulement quand il y en a. */}
                <QuestionsDAK />
                <ObjectionsAResoudre />
              </div>
            )}
          />
        </motion.div>
      </div>
      {/* Le livrable, un écran dans l'écran : une carte posée sur le fond, comme la lettre à côté du chat. */}
      {scinde && (
        <motion.div className="h-[100dvh] min-h-0 min-w-0 py-2 pr-2"
          initial={{ opacity: 0, x: 48, scale: 0.985 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}>
          <div className="h-full min-h-0 overflow-hidden rounded-[14px] border border-bord-doux bg-rail">
            <LivrableAccueil livrables={livrables} dossier={dossier} depuis={depuis} travail={travail} />
          </div>
        </motion.div>
      )}
      {scinde && (
        <div role="separator" aria-orientation="vertical" aria-label="Largeur du chat" title="Tirer pour élargir ou réduire le chat ; double-clic pour revenir"
          onPointerDown={tirer} onDoubleClick={remettre}
          className="group absolute inset-y-0 z-20 flex w-3 cursor-col-resize justify-center" style={{ left: largeurChat - 6 }}>
          <span className={`my-auto h-10 w-[3px] rounded-full transition-colors ${tire ? "bg-menthe" : "bg-transparent group-hover:bg-bord-vif"}`} />
        </div>
      )}
    </div>
  );
}
