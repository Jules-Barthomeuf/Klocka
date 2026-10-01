import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Mail, Mic, MoreHorizontal, Pencil, Plus, Search, Send, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee } from "@/lib/dictee";
import { J, alpha } from "@/design/jetons";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { BoutonFichier, LienFichier, dateCourte, euros, formDe } from "@/components/mandataire/kit";

// Estimation — le même geste que l'analyse d'un dossier côté admin, mais pour
// le mandataire, en autonomie : il sort d'un rendez-vous, dépose la photo du
// bail (ou dicte ce qu'il a entendu), la plateforme lit le bail puis le marché
// de la rue (Equimmox, Data-B, DVF) et rédige le rapport de valorisation. Il
// le relit, l'imprime sous la marque K Partners et l'envoie au propriétaire :
// c'est l'outil qui décroche le mandat. Pas de validation Klocka.
//
// La page suit la grammaire de la page Dossiers (vue admin) : une liste de
// cartes à anneau d'avancement, et un dossier ouvert en pleine page, avec les
// étapes de lecture visibles pendant que la machine travaille.

const API = "/api/mandataire/estimations";
const ETAPES = { brouillon: 1, prete: 2, envoye: 3 };
const MOTS = { brouillon: "Brouillon", prete: "Rapport prêt", envoye: "Envoyé au propriétaire" };
const SOLIDITE = { forte: "Solide", moyenne: "Correcte", fragile: "Fragile", inconnue: "À vérifier" };
// Les anciens statuts, du temps de la validation Klocka, se lisent comme « prêt ».
const statutDe = (e) => (["en_validation", "valide"].includes(e.statut) ? "prete" : e.statut);
const majDe = (e) => e.envoye_le || e.prete_le || (e.historique || []).at(-1)?.le || e.cree_le;

/** L'anneau d'avancement, comme sur la page Dossiers : l'étape sur trois. */
function Anneau({ etape, petit = false }) {
  const t = petit ? 30 : 56;
  const ep = petit ? 3 : 5;
  const r = (t - ep) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid flex-none place-items-center" style={{ width: t, height: t }}>
      <svg width={t} height={t} className="-rotate-90" aria-hidden>
        <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke="rgb(var(--k-encre-rgb) / 0.09)" strokeWidth={ep} />
        <circle cx={t / 2} cy={t / 2} r={r} fill="none" stroke={J["menthe"]} strokeWidth={ep} strokeDasharray={`${(c * etape) / 3} ${c}`} />
      </svg>
      <span className={`absolute tabular-nums ${petit ? "text-[10px] text-craie" : "text-[15px] font-medium text-menthe"}`}>{petit ? etape : `${etape}/3`}</span>
    </span>
  );
}

export default function MandataireEstimation() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const ouverteId = params.get("estimation");
  const [recherche, setRecherche] = useState("");
  const [menuCarte, setMenuCarte] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ["m-estimations"], queryFn: () => base44.request("GET", API) });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-estimations"] });
  const ouvrir = (id) => {
    const suivant = new URLSearchParams(params);
    if (id) suivant.set("estimation", id);
    else suivant.delete("estimation");
    setParams(suivant);
  };

  const creer = useMutation({
    mutationFn: () => base44.request("POST", API, { body: { bien: "Nouvelle estimation" } }),
    onSuccess: (r) => { rafraichir(); ouvrir(r.estimation.id); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
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
  const recentes = estimations.slice(0, 3);
  const autres = estimations.slice(3);
  const ouverte = estimations.find((e) => e.id === ouverteId) || null;

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
      {ouverteId && <div aria-hidden className="k-halo pointer-events-none absolute -left-[260px] -top-[260px] h-[680px] w-[900px]" style={{ background: "radial-gradient(closest-side,rgba(150,192,184,0.13),transparent)" }} />}
      <div key={ouverteId || "accueil"} className="animate-in fade-in slide-in-from-bottom-4 px-5 py-6 duration-700 ease-out md:px-10 md:py-9">
        {ouverteId ? (
          <div className="mx-auto max-w-5xl">
            <button onClick={() => ouvrir(null)} className="mb-4 flex items-center gap-1.5 text-xs text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Toutes les estimations
            </button>
            {ouverte ? (
              <Ouverte e={ouverte} rafraichir={rafraichir} renommer={(bien) => renommer.mutate({ id: ouverte.id, bien })} />
            ) : (
              <div className="rounded-md border border-trait bg-surface p-8 text-center">
                {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-ardoise" /> : <p className="m-0 text-sm text-ardoise">Estimation introuvable.</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-[1400px]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
              <div className="flex items-baseline gap-3">
                <h1 className="m-0 text-[30px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[24px]">Estimation</h1>
                {estimations.length > 0 && <span className="text-[13.5px] text-ardoise">{estimations.length} estimation{estimations.length > 1 ? "s" : ""}</span>}
              </div>
              <button onClick={() => creer.mutate()} disabled={creer.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-5 py-2.5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50">
                {creer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nouvelle estimation
              </button>
            </div>
            <p className="m-0 max-w-[72ch] pb-6 text-[14px] leading-[1.55] text-ardoise">
              La photo du bail, ou ce que vous avez entendu en rendez-vous : la plateforme lit le marché de la rue et rédige le rapport de valorisation.
              Ça marche aussi depuis le chat du dashboard : « Estime la boulangerie rue Carnot ».
            </p>

            {estimations.length > 4 && (
              <div className="flex min-w-[240px] max-w-[420px] items-center gap-3 rounded-full border border-trait bg-surface-pleine px-4 py-2.5 focus-within:border-bord-doux">
                <Search className="h-3.5 w-3.5 flex-shrink-0 text-ardoise" />
                <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un bien" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>
            ) : !estimations.length ? (
              <p className="py-16 text-center text-sm text-brume">Aucune estimation encore. La première commence par la photo d'un bail.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-3">
                  {recentes.map((e) => {
                    const st = statutDe(e);
                    return (
                      <div key={e.id} className="relative rounded-[20px] border border-trait bg-surface-pleine shadow-[0_1px_3px_rgb(0_0_0/0.03)] transition-colors hover:border-bord-doux">
                        <button onClick={() => ouvrir(e.id)} className="flex w-full items-center gap-5 px-6 py-6 pr-12 text-left" style={{ background: "transparent" }}>
                          <Anneau etape={ETAPES[st] || 1} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[17px] leading-[1.3] text-encre">{e.bien}</span>
                            <span className="mt-1 block text-[14.5px] tabular-nums text-menthe">
                              {e.rapport?.prix_bas ? `${euros(e.rapport.prix_bas)} – ${euros(e.rapport.prix_haut)}` : MOTS[st]}
                            </span>
                            <span className="mt-1 block truncate text-[13.5px] text-ardoise">{[e.adresse, dateCourte(majDe(e))].filter(Boolean).join(" · ")}</span>
                          </span>
                        </button>
                        <MenuEstimation e={e} bouton="top-1/2 -translate-y-1/2 right-6" place="top-[calc(50%+16px)] right-4" />
                      </div>
                    );
                  })}
                </div>
                {autres.length > 0 && (
                  <div className="mt-8">
                    <p className="m-0 mb-2 text-[13px] text-ardoise">Les autres estimations</p>
                    <ul className="m-0 list-none overflow-visible rounded-[16px] border border-trait bg-surface-pleine p-0">
                      {autres.map((e) => {
                        const st = statutDe(e);
                        return (
                          <li key={e.id} className="relative border-t border-trait first:border-t-0">
                            <button onClick={() => ouvrir(e.id)} className="flex w-full items-center gap-4 px-5 py-3 pr-12 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                              <Anneau etape={ETAPES[st] || 1} petit />
                              <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">{e.bien}</span>
                              <span className="hidden w-[170px] flex-none text-[13px] tabular-nums text-menthe sm:block">{e.rapport?.prix_bas ? `${euros(e.rapport.prix_bas)} – ${euros(e.rapport.prix_haut)}` : MOTS[st]}</span>
                              <span className="hidden w-[200px] flex-none truncate text-[13px] text-ardoise md:block">{e.adresse || ""}</span>
                              <span className="w-[84px] flex-none text-right text-[13px] tabular-nums text-ardoise">{majDe(e) ? new Date(majDe(e)).toLocaleDateString("fr-FR") : ""}</span>
                            </button>
                            <MenuEstimation e={e} bouton="top-1/2 -translate-y-1/2 right-4" place="top-[calc(50%+14px)] right-3" />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'estimation ouverte : la matière (bail, infos), les étapes de lecture
// pendant la rédaction, puis le rapport — l'échelle des loyers en tête.
// ---------------------------------------------------------------------------

// Ce que la machine fait, dans l'ordre réel : les libellés s'affichent un à un
// pendant que le serveur travaille, comme les étapes d'une analyse.
const LECTURES = [
  "Lecture du bail",
  "Marché de la rue — Equimmox",
  "Marché du quartier et de la ville — Data-B, DVF",
  "Le loyer en place face au marché",
  "Rédaction du rapport",
];

function Ouverte({ e, rafraichir, renommer }) {
  const st = statutDe(e);
  const modifiable = st !== "envoye";
  const [infos, setInfos] = useState(e.infos_rdv || "");
  const [adresse, setAdresse] = useState(e.adresse || "");
  const avant = useRef("");
  const { supporte, ecoute, demarrer, arreter, finalisation } = useDictee({ onTexte: (t) => setInfos([avant.current, t].filter(Boolean).join(" ")) });
  useEffect(() => { setInfos(e.infos_rdv || ""); setAdresse(e.adresse || ""); }, [e.id]);  

  // Les étapes de lecture, révélées une à une pendant la rédaction.
  const [etapeLecture, setEtapeLecture] = useState(null);
  useEffect(() => {
    if (etapeLecture == null || etapeLecture >= LECTURES.length - 1) return;
    const t = setTimeout(() => setEtapeLecture((n) => n + 1), [1800, 7000, 5000, 3500][etapeLecture] || 3000);
    return () => clearTimeout(t);
  }, [etapeLecture]);

  const onErr = (err) => toast.error(err?.message || "Impossible");
  const patcher = (corps) => base44.request("PATCH", `${API}/${e.id}`, { body: corps });
  const enregistrer = useMutation({ mutationFn: patcher, onSuccess: rafraichir, onError: onErr });
  const bail = useMutation({
    mutationFn: (f) => base44.request("POST", `${API}/${e.id}/bail`, { body: formDe(f), isForm: true }),
    onSuccess: (r) => {
      rafraichir();
      toast.success("Bail lu");
      // Un bail déposé sur « Nouvelle estimation » : le bien prend le nom du fichier en attendant mieux.
      if (/^Nouvelle estimation$/i.test(e.bien || "") && r?.estimation?.bail?.nom) renommer(r.estimation.bail.nom.replace(/\.[a-z0-9]+$/i, ""));
    },
    onError: onErr,
  });
  const generer = useMutation({
    mutationFn: async () => {
      const corps = {};
      if (infos !== (e.infos_rdv || "")) corps.infos_rdv = infos;
      if (adresse !== (e.adresse || "")) corps.adresse = adresse;
      if (Object.keys(corps).length) await patcher(corps);
      return base44.request("POST", `${API}/${e.id}/generer`);
    },
    onMutate: () => setEtapeLecture(0),
    onSuccess: rafraichir,
    onError: onErr,
    onSettled: () => setEtapeLecture(null),
  });
  const envoye = useMutation({ mutationFn: () => base44.request("POST", `${API}/${e.id}/envoyee`), onSuccess: rafraichir, onError: onErr });

  const r = e.rapport || null;
  const b = r?.bail || {};
  const loyerM2 = b.loyer_annuel_hc && b.surface_m2 ? Math.round(b.loyer_annuel_hc / b.surface_m2) : null;
  const marche = r?.marche || null;
  const lignesMarche = marche
    ? [
        { cle: "rue", libelle: marche.rue?.nom || "La rue", basse: marche.rue?.basse ?? null, haute: marche.rue?.haute ?? null, pointe: marche.rue?.moyenne ?? null, primaire: true },
        { cle: "quartier", libelle: marche.quartier?.nom || "Le quartier", basse: marche.quartier?.basse ?? null, haute: marche.quartier?.haute ?? null, pointe: marche.quartier?.moyenne ?? null },
        { cle: "ville", libelle: marche.ville?.nom || "La ville", basse: marche.ville?.basse ?? null, haute: marche.ville?.haute ?? null, pointe: marche.ville?.moyenne ?? null },
      ]
    : [];

  return (
    <div className="overflow-hidden rounded-md border border-trait bg-surface">
      {/* L'en-tête : le bien, l'adresse, où on en est. */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-trait px-6 py-4 max-md:px-4">
        <div className="min-w-0">
          <h2 className="m-0 flex items-center gap-2.5 text-[18px] font-semibold text-encre">
            <span className="truncate">{e.bien}</span>
            {modifiable && (
              <button onClick={() => { const bien = window.prompt("Nom du bien :", e.bien || ""); if (bien?.trim()) renommer(bien.trim()); }}
                className="text-ardoise hover:text-encre" aria-label="Renommer" style={{ background: "transparent" }}><Pencil className="h-3.5 w-3.5" /></button>
            )}
          </h2>
          <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{[e.adresse, `${MOTS[st]}${st === "envoye" && e.envoye_le ? ` le ${dateCourte(e.envoye_le)}` : ""}`].filter(Boolean).join(" · ")}</p>
        </div>
        {r && (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => ouvrirRapport(e)} className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-4 py-2 text-[13px] text-sur-menthe transition-colors hover:bg-menthe-survol">
              <FileText className="h-3.5 w-3.5" /> Rapport K Partners
            </button>
            <a href={`mailto:?subject=${encodeURIComponent(`Rapport de valorisation · ${e.bien}`)}&body=${encodeURIComponent("Bonjour,\n\nVous trouverez ci-joint le rapport de valorisation de vos murs, établi par K Partners.\n\nJe reste à votre disposition pour en parler.\n\nBien à vous,")}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-2 text-[12.5px] text-craie hover:border-menthe hover:text-menthe">
              <Mail className="h-3.5 w-3.5" /> Préparer le mail
            </a>
            {st === "prete" && (
              <button onClick={() => envoye.mutate()} disabled={envoye.isPending} className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-2 text-[12.5px] text-craie hover:border-menthe hover:text-menthe disabled:opacity-50" style={{ background: "transparent" }}>
                <Send className="h-3.5 w-3.5" /> Marquer envoyé
              </button>
            )}
          </div>
        )}
      </header>

      {/* La matière : le bail d'un côté, les infos du rendez-vous de l'autre. */}
      {modifiable && (
        <div className="grid gap-6 border-b border-trait px-6 py-5 max-md:px-4 md:grid-cols-2">
          <div>
            <p className="m-0 mb-2 font-mono text-[11px] uppercase tracking-[.18em] text-brume">1 · Le bail</p>
            {e.bail ? (
              <div className="flex flex-wrap items-center gap-3">
                <LienFichier f={e.bail} />
                <BoutonFichier onFichier={(f) => bail.mutate(f)} enCours={bail.isPending} mot="Remplacer" capture accept="image/*,.pdf" />
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <BoutonFichier onFichier={(f) => bail.mutate(f)} enCours={bail.isPending} mot="Photo ou PDF du bail" principal capture accept="image/*,.pdf" />
                <p className="m-0 text-[12.5px] leading-[1.5] text-brume">Le bail porte le loyer, la durée, l'indexation : c'est lui qui fait la valeur.</p>
              </div>
            )}
            {bail.isPending && <p className="m-0 mt-2 text-[12.5px] text-brume">Je lis le bail…</p>}
            <div className="mt-4">
              <p className="m-0 mb-1.5 font-mono text-[11px] uppercase tracking-[.18em] text-brume">L'adresse, pour le marché</p>
              <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} onBlur={() => adresse !== (e.adresse || "") && enregistrer.mutate({ adresse })}
                placeholder="12 rue Carnot, Mâcon"
                className="w-full rounded-champ border border-trait bg-surface-pleine px-3.5 py-2.5 text-[13.5px] text-encre outline-none transition-colors placeholder:text-brume focus:border-menthe" />
            </div>
          </div>
          <div className="relative">
            <p className="m-0 mb-2 font-mono text-[11px] uppercase tracking-[.18em] text-brume">2 · Ce que vous avez entendu</p>
            <textarea rows={6} value={infos} onChange={(ev) => setInfos(ev.target.value)} onBlur={() => infos !== (e.infos_rdv || "") && enregistrer.mutate({ infos_rdv: infos })}
              placeholder="Loyer, surface, travaux faits, état du local, projet du propriétaire, prix qu'il a en tête…"
              className="w-full resize-none rounded-champ border border-trait bg-surface-pleine px-3.5 py-2.5 text-[13.5px] leading-[1.6] text-encre outline-none transition-colors placeholder:text-brume focus:border-menthe" />
            {supporte && (
              <button type="button" onClick={() => (ecoute ? arreter() : (avant.current = infos.trim(), demarrer()))} disabled={finalisation}
                aria-label={ecoute ? "Arrêter la dictée" : "Dicter"} title={ecoute ? "Arrêter la dictée" : "Dicter"}
                className="absolute bottom-3 right-2 grid h-10 w-10 place-items-center rounded-full"
                style={{ background: ecoute || finalisation ? alpha("menthe", 0.2) : "transparent", color: ecoute || finalisation ? J["menthe"] : J["craie"] }}>
                {finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      )}

      {/* La rédaction : le bouton, puis les étapes de lecture, une à une. */}
      {modifiable && (
        <div className="border-b border-trait px-6 py-5 max-md:px-4">
          {etapeLecture == null ? (
            <>
              <button onClick={() => generer.mutate()} disabled={generer.isPending || (!e.bail && !infos.trim())}
                className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50">
                <Sparkles className="h-4 w-4" /> {r ? "Régénérer le rapport" : "Rédiger le rapport"}
              </button>
              {!e.bail && !infos.trim() && <p className="m-0 mt-2 text-[12.5px] text-brume">Le bail ou les infos du rendez-vous suffisent pour commencer.</p>}
            </>
          ) : (
            <div className="space-y-2.5">
              {LECTURES.slice(0, etapeLecture + 1).map((mot, i) => (
                <p key={mot} className="animate-in fade-in slide-in-from-bottom-1 m-0 flex items-center gap-2.5 text-[13.5px] duration-300">
                  {i === etapeLecture ? <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> : <span className="grid h-3.5 w-3.5 place-items-center text-menthe">·</span>}
                  <span className={i === etapeLecture ? "text-encre" : "text-ardoise"}>{mot}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Le rapport. */}
      {r && (
        <div className="px-6 py-6 max-md:px-4">
          {/* La valeur, en premier : c'est elle qu'on vient chercher. */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="m-0 font-mono text-[11px] uppercase tracking-[.18em] text-brume">Valeur estimée des murs</p>
              {r.prix_bas ? (
                <p className="m-0 mt-1.5 text-[36px] font-light leading-none tabular-nums text-encre max-md:text-[28px]">{euros(r.prix_bas)} <span className="text-bord-vif">–</span> {euros(r.prix_haut)}</p>
              ) : (
                <p className="m-0 mt-1.5 text-[15px] text-ambre">Pas de loyer lisible : la valeur ne se calcule pas encore. Ajoutez le loyer dans les infos et régénérez.</p>
              )}
              {r.rendement && <p className="m-0 mt-2 text-[13px] text-ardoise">Rendement de {r.rendement.bas} à {r.rendement.haut} %{r.justification_taux ? ` · ${r.justification_taux}` : ""}</p>}
            </div>
            {r.genere_le && <p className="m-0 text-[12px] text-brume">Rédigé le {dateCourte(r.genere_le)}</p>}
          </div>
          {r.synthese && <p className="m-0 mt-4 max-w-[68ch] text-[15px] leading-[1.65] text-craie">{r.synthese}</p>}

          {/* Le marché : les loyers de la rue, du quartier, de la ville sur une
              échelle commune, le loyer du bail en travers — la même lecture
              que dans l'analyse d'un dossier. */}
          {lignesMarche.some((l) => l.basse != null || l.haute != null) && (
            <section className="mt-8 border-t border-trait pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="m-0 text-[16px] font-semibold tracking-[-.01em] text-encre">Le loyer face au marché</h3>
                {marche?.source && <span className="text-[12px] text-ardoise">{marche.source}</span>}
              </div>
              <EchelleFourchettes
                lignes={lignesMarche}
                repere={loyerM2 != null ? { valeur: loyerM2 } : null}
                unite={marche?.unite || "€/m²/an"}
                legende={loyerM2 != null ? "Le trait : le loyer du bail" : null}
              />
              {r.loyer_marche && <p className="m-0 mt-4 max-w-[68ch] text-[13.5px] leading-[1.6] text-craie">{r.loyer_marche}</p>}
            </section>
          )}

          {/* Le bail lu : les faits, tels que la machine les a relevés. */}
          <section className="mt-8 border-t border-trait pt-6">
            <h3 className="m-0 text-[16px] font-semibold tracking-[-.01em] text-encre">Le bail, tel qu'il est lu</h3>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-4">
              {[["Locataire", b.locataire], ["Enseigne", b.enseigne], ["Activité", b.activite],
                ["Loyer annuel HC", b.loyer_annuel_hc ? euros(b.loyer_annuel_hc) : null],
                ["Surface", b.surface_m2 ? `${b.surface_m2} m²` : null], ["Prise d'effet", b.date_effet],
                ["Échéance", b.echeance], ["Durée", b.duree], ["Indexation", b.indexation], ["Charges", b.charges]]
                .filter(([, v]) => v)
                .map(([mot, v]) => (
                  <div key={mot}><dt className="text-[11.5px] text-brume">{mot}</dt><dd className="m-0 mt-0.5 text-[13.5px] leading-[1.5] text-encre">{v}</dd></div>
                ))}
            </dl>
          </section>

          {/* L'enseigne et l'emplacement : ce qui fait tenir, ou non, le taux. */}
          {(r.enseigne?.commentaire || r.emplacement) && (
            <section className="mt-8 grid gap-6 border-t border-trait pt-6 md:grid-cols-2">
              {r.enseigne?.commentaire && (
                <div>
                  <h3 className="m-0 text-[16px] font-semibold tracking-[-.01em] text-encre">L'enseigne <span className="ml-1 text-[12.5px] font-normal text-menthe">{SOLIDITE[r.enseigne.solidite] || ""}</span></h3>
                  <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-craie">{r.enseigne.commentaire}</p>
                </div>
              )}
              {r.emplacement && (
                <div>
                  <h3 className="m-0 text-[16px] font-semibold tracking-[-.01em] text-encre">L'emplacement</h3>
                  <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-craie">{r.emplacement}</p>
                </div>
              )}
            </section>
          )}

          {(r.vigilance || []).length > 0 && (
            <section className="mt-8 border-t border-trait pt-6">
              <h3 className="m-0 text-[16px] font-semibold tracking-[-.01em] text-alerte">Points de vigilance</h3>
              <ul className="m-0 mt-3 space-y-1.5 pl-4">{r.vigilance.map((v, i) => <li key={i} className="text-[13.5px] leading-[1.55] text-craie">{v}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le rapport imprimable sous la marque K Partners (PDF par l'impression).
// ---------------------------------------------------------------------------

export function ouvrirRapport(e) {
  const r = e.rapport || {};
  const b = r.bail || {};
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ligne = (mot, v) => (v ? `<tr><td>${esc(mot)}</td><td>${esc(v)}</td></tr>` : "");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de valorisation · ${esc(e.bien)}</title>
<style>
  body{font-family:Georgia,serif;color:#1c1e1d;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.55}
  .marque{font-family:Helvetica,Arial,sans-serif;letter-spacing:.3em;font-size:12px;color:#5f7f78;text-transform:uppercase}
  h1{font-weight:400;font-size:30px;margin:6px 0 4px} .sous{color:#6b6e6b;font-family:Helvetica,Arial,sans-serif;font-size:13px}
  .prix{margin:28px 0;padding:22px 24px;border:1px solid #cfdcd8;border-radius:14px;background:#f4f8f7}
  .prix b{font-size:30px;font-weight:400} h2{font-size:15px;font-family:Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:.14em;color:#5f7f78;margin-top:30px}
  table{border-collapse:collapse;width:100%;font-size:14px} td{padding:6px 0;border-bottom:1px solid #e4e6e3;vertical-align:top} td:first-child{color:#6b6e6b;width:42%}
  li{margin:4px 0} .pied{margin-top:40px;font-size:11px;color:#8a8d8a;font-family:Helvetica,Arial,sans-serif}
  @media print{body{margin:0}}
</style></head><body>
<div class="marque">K Partners</div>
<h1>Rapport de valorisation</h1>
<div class="sous">${esc(e.bien)}${e.adresse ? ` · ${esc(e.adresse)}` : ""} · ${esc(dateCourte(e.prete_le || r.genere_le || new Date().toISOString()))}</div>
${r.prix_bas ? `<div class="prix"><div class="sous">Valeur estimée des murs</div><b>${esc(euros(r.prix_bas))} – ${esc(euros(r.prix_haut))}</b>${r.rendement ? `<div class="sous">Rendement de ${esc(r.rendement.bas)} à ${esc(r.rendement.haut)} %</div>` : ""}</div>` : ""}
${r.synthese ? `<p>${esc(r.synthese)}</p>` : ""}
<h2>Le bail</h2><table>${ligne("Locataire", b.locataire)}${ligne("Enseigne", b.enseigne)}${ligne("Activité", b.activite)}${ligne("Loyer annuel HC", b.loyer_annuel_hc ? euros(b.loyer_annuel_hc) : null)}${ligne("Surface", b.surface_m2 ? `${b.surface_m2} m²` : null)}${ligne("Prise d’effet", b.date_effet)}${ligne("Échéance", b.echeance)}${ligne("Durée", b.duree)}${ligne("Indexation", b.indexation)}${ligne("Charges", b.charges)}</table>
${r.loyer_marche ? `<h2>Le loyer face au marché</h2><p>${esc(r.loyer_marche)}</p>` : ""}
${r.enseigne?.commentaire ? `<h2>L’enseigne</h2><p>${esc(r.enseigne.commentaire)}</p>` : ""}
${r.emplacement ? `<h2>L’emplacement</h2><p>${esc(r.emplacement)}</p>` : ""}
${(r.vigilance || []).length ? `<h2>Points de vigilance</h2><ul>${r.vigilance.map((v) => `<li>${esc(v)}</li>`).join("")}</ul>` : ""}
<div class="pied">Rapport établi par K Partners. Estimation indicative fondée sur le bail communiqué et les données de marché disponibles à la date du rapport ; elle ne constitue pas une expertise.</div>
<script>setTimeout(()=>window.print(),300)</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast.error("Autorisez les fenêtres pour ouvrir le rapport.");
  w.document.write(html);
  w.document.close();
}
