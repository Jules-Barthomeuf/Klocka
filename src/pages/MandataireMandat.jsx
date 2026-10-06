import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FileText, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { BoutonFichier, LienFichier, dateCourte, euros, formDe } from "@/components/mandataire/kit";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import ApercuMandat, { FenetreMandatPret } from "@/components/mandataire/ApercuMandat";
import { DocumentTelephone } from "@/components/mandataire/GenerationDocument";

// Mandat — comme l'Estimation, tout passe par le chat : il pose les questions
// du mandat de vente, le mandat se construit à droite, et quand tout est bon
// il part dans le vrai MyNotary. Le PDF revient dans une fenêtre : on le
// vérifie, puis « Compléter sur MyNotary » ouvre le mandat déjà rempli, prêt
// à envoyer au client. Le mandat signé se dépose ensuite ici, et Klocka
// l'inscrit au registre des mandats.

const API = "/api/mandataire/mandats";
const CHAT = { api: "/api/mandataire", qs: "?espace=mandat" };
const ETAPES = [["brouillon", "En préparation"], ["demande_envoyee", "Envoyé à MyNotary"], ["pret", "Prêt"], ["signe", "Signé"], ["enregistre", "Enregistré"]];

export default function MandataireMandat() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [courant, setCourant] = useState(null);
  const [fenetre, setFenetre] = useState(null);
  // Le premier message tapé au tableau de bord : à droite, la génération du
  // mandat se joue en étapes avant de le montrer. Un mandat repris ou une
  // conversation rouverte s'affichent tout de suite.
  const [generation, setGeneration] = useState(false);
  const rouverte = useRef(false);
  const large = useEcranLarge();

  const { data, isLoading } = useQuery({ queryKey: ["m-mandats"], queryFn: () => base44.request("GET", API) });
  const mandats = [...(data?.mandats || [])].sort((a, b) => String(b.cree_le || "").localeCompare(String(a.cree_le || "")));
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: ["m-mandats"] });
    queryClient.invalidateQueries({ queryKey: ["m-apercu-mandat"] });
  };
  const signe = useMutation({
    mutationFn: ({ id, f }) => base44.request("POST", `${API}/${id}/signe`, { body: formDe(f), isForm: true }),
    onSuccess: () => { rafraichir(); toast.success("Mandat signé reçu : Klocka l'inscrit au registre"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Reprendre un mandat : on arrive dans sa conversation.
  const reprendre = async (m) => {
    rouverte.current = true;
    setCourant(m.id);
    try {
      const r = await base44.request("POST", `${API}/${m.id}/conversation`);
      if (r.cree) rafraichir();
      window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: r.conversation_id, ...CHAT } }));
    } catch (err) {
      toast.error(err?.message || "Impossible d'ouvrir ce mandat");
    }
  };
  // Une conversation rouverte depuis l'historique : son mandat, si on le connaît.
  useEffect(() => {
    const ouverte = (ev) => {
      if (ev.detail?.qs !== CHAT.qs) return;
      rouverte.current = true;
      const m = (data?.mandats || []).find((x) => x.conversation_id === ev.detail.id);
      if (m) setCourant(m.id);
    };
    window.addEventListener("klocka:ouvrir-conversation", ouverte);
    return () => window.removeEventListener("klocka:ouvrir-conversation", ouverte);
  }, [data]);
  useEffect(() => { if (!conversation) setCourant(null); }, [conversation]);
  const ouverteAvant = useRef(false);
  const surConversation = useCallback((ouverte) => {
    if (ouverte && !ouverteAvant.current && !rouverte.current) setGeneration(true);
    if (!ouverte) { rouverte.current = false; setGeneration(false); }
    ouverteAvant.current = ouverte;
    setConversation(ouverte);
  }, []);
  // Chaque réponse du chat : le mandat qu'il remplit, et son aperçu à jour.
  const surReponse = (r) => {
    if (r?.mandat_id) setCourant(r.mandat_id);
    rafraichir();
  };

  const scinde = conversation && large;
  useEffect(() => {
    if (!scinde) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [scinde]);

  // Une notification « mandat prêt » ouvre le mandat par l'adresse.
  const demande = params.get("mandat");
  useEffect(() => {
    if (!demande || !data) return;
    const m = (data.mandats || []).find((x) => x.id === demande);
    if (m) { reprendre(m); if (m.document || m.mynotary_url) setFenetre(m.id); }
    setParams((p) => { const n = new URLSearchParams(p); n.delete("mandat"); return n; }, { replace: true });
  }, [demande, data, setParams]);

  const mandatFenetre = (data?.mandats || []).find((x) => x.id === fenetre) || null;

  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden text-encre">
      {/* En conversation, sur un écran large : le chat à gauche, le mandat à droite.
          Le chat garde sa place dans l'arbre d'un mode à l'autre, sinon il perdrait son fil. */}
      <div className={scinde ? "grid h-[100dvh] grid-cols-[minmax(360px,440px)_minmax(0,1fr)] overflow-hidden" : ""}>
        <div className={`animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out ${conversation ? (scinde ? "h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5" : "px-5 md:px-8") : "px-5 py-6 md:px-10 md:py-9"}`}>
          <div className={`mx-auto ${conversation ? (scinde ? "max-w-none" : "max-w-[1100px]") : "max-w-[1400px]"}`}>
            <header className={conversation ? "flex flex-col" : "flex flex-col items-center pt-[6vh] text-center max-md:pt-4"}>
              {!conversation && (
                <>
                  <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Quel mandat préparez-vous ?</h1>
                  <p className="m-0 mt-2 text-[14px] text-ardoise">Dites le bien, le vendeur et le prix : seul ce qui manque est demandé, puis le mandat part dans MyNotary.</p>
                </>
              )}
              <div className={conversation ? "w-full" : "mt-8 w-full max-w-[660px] max-md:mt-6"}>
                <ChatDashboard espace="mandat" onConversation={surConversation} onHistorique={setHistorique} onReponse={surReponse} barreApercu={scinde}
                  onRecherche={(r) => {
                    if (!r?.mandat_id) return;
                    rafraichir();
                    setCourant(r.mandat_id);
                    setFenetre(r.mandat_id);
                  }} />
              </div>
            </header>
          </div>
          {!conversation && (historique ? (
            <div className="mx-auto mt-[6vh] max-w-[1400px]"><HistoriqueColonne espace="mandat" /></div>
          ) : (
            <div className="mx-auto mt-[7vh] max-w-[1100px]">
              <div className="flex items-baseline gap-3 pb-4">
                <h2 className="m-0 text-[20px] font-normal tracking-[-0.01em] text-encre">Vos mandats</h2>
                {mandats.length > 0 && <span className="text-[13.5px] text-ardoise">{mandats.length}</span>}
              </div>
              {isLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>
              ) : !mandats.length ? (
                <p className="py-16 text-center text-sm text-brume">Aucun mandat encore : dites au chat quel mandat vous préparez.</p>
              ) : (
                // Des lignes, pas des cartes : le mandat à gauche, son avancement à droite.
                <div className="border-y border-trait">
                  {mandats.map((m) => {
                    const i = Math.max(0, ETAPES.findIndex(([cle]) => cle === m.statut));
                    return (
                      <div key={m.id} className="border-t border-trait px-2 py-5 first:border-t-0">
                        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                          <button onClick={() => reprendre(m)} className="min-w-0 flex-1 text-left" style={{ background: "transparent" }}>
                            <p className="m-0 truncate text-[16px] text-encre">{m.bien}{m.numero_registre && <span className="ml-2 text-[12.5px] tabular-nums text-menthe">Registre n° {m.numero_registre}</span>}</p>
                            <p className="m-0 mt-1 truncate text-[13.5px] text-ardoise">
                              {[m.vendeur, m.prix ? euros(m.prix) : null, m.honoraires != null ? `honoraires ${m.honoraires}${m.honoraires <= 100 ? " %" : " €"}` : null, m.type, m.duree_mois ? `${m.duree_mois} mois` : null, dateCourte(m.cree_le)].filter(Boolean).join(" · ")}
                            </p>
                          </button>
                          <button onClick={() => reprendre(m)} className="w-[260px] flex-none text-left max-md:w-full" style={{ background: "transparent" }} aria-label={`Étape ${i + 1} sur ${ETAPES.length} : ${ETAPES[i][1]}`}>
                            <span className="flex items-baseline justify-between text-[14px]">
                              <span className="text-encre">{ETAPES[i][1]}</span>
                              <span className="tabular-nums text-ardoise">{i + 1}/{ETAPES.length}</span>
                            </span>
                            <span className="mt-2 flex gap-1">
                              {ETAPES.map(([cle], n) => (
                                <span key={cle} className={`h-[5px] flex-1 rounded-full ${n < i || (n === i && i === ETAPES.length - 1) ? "bg-menthe" : n === i ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />
                              ))}
                            </span>
                          </button>
                        </div>
                        {((m.document || m.mynotary_url) || m.statut === "pret" || m.document_signe) && (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            {(m.document || m.mynotary_url) && (
                              <button onClick={() => setFenetre(m.id)} className="flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] text-sur-menthe transition-colors hover:bg-menthe-survol">
                                <FileText className="h-3.5 w-3.5" /> Le mandat MyNotary
                              </button>
                            )}
                            {m.statut === "pret" && <BoutonFichier principal mot="Déposer le mandat signé" onFichier={(f) => signe.mutate({ id: m.id, f })} enCours={signe.isPending} accept=".pdf,image/*" />}
                            {m.document_signe && <LienFichier f={{ ...m.document_signe, nom: "Mandat signé" }} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        {scinde && <ApercuMandat id={courant} onOuvrirPret={setFenetre} generation={generation} onGenere={() => setGeneration(false)} />}
        {/* Au téléphone : le chat seul, le mandat en plein écran à la demande. */}
        {conversation && !large && courant && <DocumentTelephone libelle="Voir le mandat"><ApercuMandat id={courant} onOuvrirPret={setFenetre} /></DocumentTelephone>}
      </div>
      <FenetreMandatPret mandat={mandatFenetre} onFermer={() => setFenetre(null)} />
    </div>
  );
}

/** Un écran assez large pour le chat et le mandat côte à côte. */
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
