import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { adresseDe, analyseDe, avancementDe, criteresDe, filDe, reperesDe } from "@/components/preanalyse/marche-reel";
import JournalArrivee from "@/components/preanalyse/JournalArrivee";
import JournalControles from "@/components/preanalyse/JournalControles";
import JournalResultat from "@/components/preanalyse/JournalResultat";
import JournalDetail from "@/components/preanalyse/JournalDetail";
import { Entree } from "@/components/preanalyse/JournalFil";
import { PanneauJournalDetaille, PanneauTracabilite } from "@/components/preanalyse/JournalPanneaux";

// Le journal d'analyste : ce qu'Alex fait pendant l'analyse de marché, écrit
// ligne à ligne pendant qu'il le fait — pour de vrai.
//
// « Mettre à jour » lance server/alex.js sur le lot : Equimmox, Data-B
// (valeurs locatives, cessions de fonds, étude d'implantation), Le Figaro.
// L'écran interroge l'état toutes les deux secondes et demi et écrit une
// ligne par tentative et par résultat posé — heure, source, issue, chiffre.
// Rien ici n'est écrit à l'avance : marche-reel.js traduit l'état du serveur,
// et c'est tout.
//
// À l'arrivée, si une lecture existe déjà (le journal de marché, gardé en
// base), c'est elle qu'on voit : les verdicts calculés sur le lot, les
// sources avec leur heure, l'emplacement, la trace des tentatives.

const INTENTION =
  "Je consulte Equimmox ET Data-B pour la valeur locative — les deux, pour les recouper —, puis les cessions de fonds, le résidentiel du Figaro et l’étude d’implantation : flux, tronçon, démographie, revenus. Chaque chiffre garde sa source et son heure, et un écart entre deux sources est signalé plutôt qu’absorbé. Je termine par les deux sources publiques — DVF pour ce qui s’est vendu pour de vrai, le BODACC pour ce qui ouvre et ce qui ferme dans la rue.";

const SOURCES = [
  { cle: "equimmox", nom: "Equimmox", ton: "menthe", acces: "compte de service · baux comparables à 500 m" },
  { cle: "data-b", nom: "Data-B", ton: "menthe", acces: "compte de service · valeurs locatives (3 secteurs), cessions à 250 m, étude d’implantation (1 crédit)" },
  { cle: "figaro", nom: "Le Figaro Immobilier", ton: "menthe", acces: "accès public · prix, loyers et évolution du résidentiel" },
  { cle: "dvf", nom: "DVF", ton: "menthe", acces: "donnée publique · ventes de locaux commerciaux réellement conclues, 5 ans" },
  { cle: "bodacc", nom: "BODACC", ton: "menthe", acces: "donnée publique · créations, cessions, liquidations et radiations de la rue" },
];

const PROMPT = "Lance l’analyse de marché";
const INTERVALLE_MS = 2500;

export default function JournalAnalyste({ dossier, lot, apercu = false, onRefresh }) {
  const dealId = dossier?.deal_id;
  const lotIndex = 0;
  const queryClient = useQueryClient();

  const [etat, setEtat] = useState(null); // ce que rend /api/marche/alex/etat
  const [phase, setPhase] = useState("repos"); // repos · joue · fini
  const [temps, setTemps] = useState(0); // secondes écoulées depuis le lancement
  const [tracabilite, setTracabilite] = useState(null);
  const [journalOuvert, setJournalOuvert] = useState(false);
  const [detailCle, setDetailCle] = useState(null);

  const fil = useRef(null);
  const colleEnBas = useRef(true);
  const minuteur = useRef(null);

  // La dernière lecture gardée en base : c'est l'analyse qu'on montre à l'arrivée.
  const { data: journal } = useQuery({
    queryKey: ["marche-journal", dealId, lotIndex],
    queryFn: () => base44.request("GET", `/api/marche/journal?deal_id=${encodeURIComponent(dealId)}&index=${lotIndex}`),
    enabled: !!dealId,
  });
  const analyse = useMemo(() => analyseDe(lot, journal?.dernier), [lot, journal]);
  const criteres = useMemo(() => criteresDe(lot), [lot]);

  // ── Le fil, tiré de l'état du serveur ─────────────────────────────────────
  const entrees = useMemo(() => filDe(etat, adresseDe(lot)), [etat, lot]);
  const visibles = useMemo(() => entrees.filter((e) => e.t <= temps), [entrees, temps]);
  const reperes = useMemo(() => reperesDe(etat), [etat]);
  const avancement = useMemo(() => avancementDe(etat), [etat]);

  const arreterSuivi = useCallback(() => {
    clearInterval(minuteur.current);
    minuteur.current = null;
  }, []);
  useEffect(() => arreterSuivi, [arreterSuivi]);

  // ── L'horloge : le temps réel depuis le lancement ─────────────────────────
  useEffect(() => {
    if (phase !== "joue") return undefined;
    const t0 = etat?.depuis ? Date.parse(etat.depuis) : Date.now();
    const id = setInterval(() => setTemps((Date.now() - t0) / 1000), 250);
    return () => clearInterval(id);
  }, [phase, etat?.depuis]);

  // Le fil suit la dernière entrée, sauf si on est remonté lire plus haut. À
  // la fin, la barre de résultat apparaît sous le fil et le raccourcit.
  useEffect(() => {
    const el = fil.current;
    if (el && colleEnBas.current) el.scrollTop = el.scrollHeight;
  }, [visibles.length, phase]);

  // ── Le suivi : interroger le serveur tant que ça tourne ───────────────────
  const finir = useCallback(
    (dernier) => {
      arreterSuivi();
      setEtat(dernier);
      // Le chrono s'arrête à la fin réelle : les dernières lignes s'affichent.
      setTemps(dernier?.fin && dernier?.depuis ? (Date.parse(dernier.fin) - Date.parse(dernier.depuis)) / 1000 + 1 : Number.MAX_SAFE_INTEGER);
      setPhase("fini");
      // Le lot a reçu les résultats, le journal a une entrée de plus.
      queryClient.invalidateQueries({ queryKey: ["marche-journal", dealId, lotIndex] });
      onRefresh?.();
      if (dernier?.etat === "erreur") toast.error(dernier.erreur || "La recherche de marché a échoué.");
      else if (dernier?.complet) toast.success("Lecture de marché complète.");
      else toast.warning(`Lecture partielle : ${(dernier?.indicateurs_manquants || []).length} indicateur(s) manquant(s).`);
    },
    [arreterSuivi, queryClient, dealId, onRefresh]
  );

  const suivre = useCallback(
    (cle) => {
      arreterSuivi();
      minuteur.current = setInterval(async () => {
        try {
          const t = await base44.request("GET", `/api/marche/alex/etat?cle=${encodeURIComponent(cle)}`);
          if (t.etat === "en_cours") setEtat(t);
          else finir(t);
        } catch (e) {
          arreterSuivi();
          setPhase("fini");
          toast.error(e?.message || "Impossible de suivre la recherche.");
        }
      }, INTERVALLE_MS);
    },
    [arreterSuivi, finir]
  );

  /**
   * Lance la lecture. `sources` restreint aux connecteurs choisis dans
   * « Mettre à jour » ; null veut dire tout, comme avant.
   */
  const lancer = useCallback(async (sources = null) => {
    if (apercu || !dealId) return;
    if (!adresseDe(lot)) {
      toast.error("Aucune adresse sur ce lot : renseignez-la avant de lancer l’analyse.");
      return;
    }
    try {
      setTracabilite(null);
      setDetailCle(null);
      setTemps(0);
      colleEnBas.current = true;
      // `forcer` : une mise à jour relit tout, cache compris — c'est le sens du bouton.
      const t = await base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${lotIndex}/marche/alex`, {
        body: { forcer: !!analyse, sources: Array.isArray(sources) && sources.length ? sources : undefined },
      });
      setEtat(t);
      setPhase("joue");
      if (t.etat === "en_cours") suivre(t.cle);
      else finir(t);
    } catch (e) {
      toast.error(e?.message || "Alex n’a pas pu partir.");
    }
  }, [apercu, dealId, lot, analyse, suivre, finir]);

  /** La croix, en haut : on quitte l'écran ; la recherche continue côté serveur. */
  const fermer = useCallback(() => {
    arreterSuivi();
    setPhase("repos");
    setTracabilite(null);
    setDetailCle(null);
    setJournalOuvert(false);
    queryClient.invalidateQueries({ queryKey: ["marche-journal", dealId, lotIndex] });
    onRefresh?.();
  }, [arreterSuivi, queryClient, dealId, onRefresh]);

  // Le plein écran prend la main : ni défilement derrière, ni Échap perdu.
  useEffect(() => {
    if (phase === "repos") return undefined;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const auClavier = (e) => {
      if (e.key === "Escape" && !tracabilite && !journalOuvert && !detailCle) fermer();
    };
    window.addEventListener("keydown", auClavier);
    return () => {
      document.body.style.overflow = avant;
      window.removeEventListener("keydown", auClavier);
    };
  }, [phase, tracabilite, journalOuvert, detailCle, fermer]);

  // Les cartes de la barre de résultat : l'analyse relue depuis le lot, une
  // fois les résultats posés.
  const cartesResultat = useMemo(
    () => (phase === "fini" && analyse ? analyse.cartes.map((c) => ({ ...c, mention: c.detail })) : []),
    [phase, analyse]
  );
  const ouvrirCarte = useCallback((carte) => setDetailCle(carte?.cle || null), []);

  return (
    <>
      <style>{`
        @keyframes ja-apparition { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes ja-pouls { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.55); opacity: .55; } }
        @keyframes ja-clignote { 0%, 100% { opacity: .25; } 50% { opacity: .9; } }
        @keyframes ja-panneau { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: none; } }
        @keyframes ja-plein { from { opacity: 0; } to { opacity: 1; } }
        .ja-entree { animation: ja-apparition .35s cubic-bezier(.22,.68,.36,1) both; }
        .ja-pastille-fraiche { animation: ja-pouls 1.1s ease-in-out infinite; }
        .ja-points { animation: ja-clignote 1.2s ease-in-out infinite; }
        .ja-panneau { animation: ja-panneau .28s cubic-bezier(.22,.68,.36,1) both; }
        .ja-plein { animation: ja-plein .3s ease-out both; }
        .ja-etape { animation: ja-apparition .4s cubic-bezier(.22,.68,.36,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .ja-entree, .ja-pastille-fraiche, .ja-points, .ja-panneau, .ja-plein, .ja-etape { animation: none !important; }
        }
      `}</style>

      {/* Dans le dossier : l'écran d'arrivée. Le fil ne s'y déroule jamais. */}
      <section className="overflow-hidden">
        <JournalArrivee
          intention={INTENTION}
          criteres={criteres}
          sources={SOURCES}
          analyse={analyse}
          dureeEstimee="3 à 4 min"
          onLancer={lancer}
          onCarte={ouvrirCarte}
          dossier={dossier}
          lot={lot}
          onRefresh={onRefresh}
          detailCle={detailCle}
          onRetourDetail={() => setDetailCle(null)}
          apercu={apercu}
        />
        <JournalControles phase="repos" temps={0} duree={0} reperes={[]} />
      </section>

      {phase !== "repos" &&
        createPortal(
          <div className="ja-plein fixed inset-0 z-[60] bg-[#08090b] flex flex-col">
            <header className="flex-shrink-0 border-b border-trait">
              <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6 py-3.5 flex items-center gap-3">
                <div className="min-w-0 flex-1 flex items-center gap-2.5">
                  <span className="flex-shrink-0 px-2 h-[22px] rounded-full bg-trait text-ardoise text-[9.5px] font-semibold tracking-[.06em] inline-flex items-center">
                    VOUS
                  </span>
                  <span className="truncate text-[14px] text-encre">
                    {PROMPT}
                    {adresseDe(lot) ? <span className="text-brume"> · {adresseDe(lot)}</span> : null}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={fermer}
                  aria-label="Fermer"
                  title={phase === "joue" ? "Fermer — la recherche continue côté serveur" : "Fermer"}
                  className="flex-shrink-0 p-1.5 rounded-full text-brume hover:text-encre hover:bg-trait transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {detailCle && analyse?.details?.[detailCle] ? (
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-[980px]">
                  <JournalDetail
                    cartes={analyse.cartes}
                    details={analyse.details}
                    cle={detailCle}
                    onChoisir={setDetailCle}
                    onRetour={() => setDetailCle(null)}
                    titre="Retour au fil"
                  />
                </div>
              </div>
            ) : (
              <div
                ref={fil}
                onScroll={() => {
                  const el = fil.current;
                  if (el) colleEnBas.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
                }}
                className="flex-1 overflow-y-auto"
              >
                <div className="mx-auto w-full max-w-[780px] px-4 sm:px-6 py-5">
                  <ol className="m-0 p-0 list-none">
                    {visibles.map((e) => (
                      <Entree key={e.rang} entree={e} temps={temps} onEncart={() => setTracabilite(e)} actif={tracabilite?.rang === e.rang} />
                    ))}
                  </ol>
                  {phase === "joue" && (
                    <div className="pl-[64px] sm:pl-[76px]">
                      <span className="ja-points text-brume text-[15px] leading-none tracking-[3px]">…</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase === "fini" && cartesResultat.length > 0 && <JournalResultat cartes={cartesResultat} onOuvrir={ouvrirCarte} />}

            <JournalControles
              phase={phase}
              temps={temps}
              reperes={reperes}
              avancement={avancement}
              onJournal={() => setJournalOuvert((o) => !o)}
              journalOuvert={journalOuvert}
              onVoirAnalyse={fermer}
            />

            {tracabilite && <PanneauTracabilite entree={tracabilite} onFermer={() => setTracabilite(null)} />}
            {journalOuvert && <PanneauJournalDetaille entrees={visibles} onFermer={() => setJournalOuvert(false)} />}
          </div>,
          document.body
        )}
    </>
  );
}
