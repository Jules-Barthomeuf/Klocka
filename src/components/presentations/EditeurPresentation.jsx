import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Eye, Loader2, Maximize2, Redo2, Send, Undo2, Upload, X, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import Deck, { poser } from "./Deck";
import { PanneauElement, afficherPartie, nomDePartie } from "./PanneauDeck";
import { BarreEditeur } from "@/components/editeur/Editeur";
import ApercuPdf from "./ApercuPdf";
import FicheSource from "./FicheSource";
import { ordreDuModele } from "@/lib/presentation-modele";
import EnvoiClient from "./EnvoiClient";
import QuestionClient from "./QuestionClient";
import VisitePresentation, { visiteVue } from "./VisitePresentation";

// La présentation bancaire ouverte, à droite du chat de la page Présentations
// (12 oct. 2026) : un seul deck de seize diapositives, qu'on feuillette ; en
// Éditeur, l'élément cliqué ouvre son panneau à droite de la scène (28 oct.
// 2026, le modèle de la page éditeur). Trois modes : édition (un clic
// sur un élément le choisit, le texte se retape sur place) et lecture
// (navigation, cascade, 3D à la souris, plein écran). Le chat retouche la même
// présentation. Annuler et rétablir reviennent sur chaque geste. Elle sort en
// PDF seulement (12 oct. 2026 : plus de PPTX ni de panneau des diapositives).

const API = "/api/admin/presentations-bancaires";

// `client` (13 oct. 2026) : la même présentation ouverte par le client à qui
// l'équipe l'a envoyée (page Présentations de l'espace client) : sans le chat,
// les trois modes, le plein écran, « Une question ? » ; ni PDF, ni envoi.
export default function EditeurPresentation({ id, onFermer, travail = null, client = false }) {
  const api = client ? "/api/client/presentations" : API;
  const queryClient = useQueryClient();
  const cle = ["presentation-bancaire", id, client ? "client" : "equipe"];
  const { data, isLoading, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${api}/${id}`), enabled: !!id });
  const [envoi, setEnvoi] = useState(false);
  const [question, setQuestion] = useState(false);
  // La première visite d'un client : l'explication des modes, une fois.
  const [visite, setVisite] = useState(() => client && !visiteVue());
  const [mode, setMode] = useState("edition");
  const [courante, setCourante] = useState(null);
  const [selection, setSelection] = useState(null);
  const scene = useRef(null);
  // Les gestes faits, pour annuler : chacun garde l'état d'avant (une diapositive, ou l'ordre).
  const passe = useRef([]);
  const futur = useRef([]);
  const [, forcer] = useState(0);

  const modifier = useMutation({
    mutationFn: (corps) => base44.request("PATCH", `${api}/${id}`, { body: corps }),
    // La retouche s'affiche tout de suite ; le serveur confirme derrière.
    onMutate: (corps) => {
      const avant = queryClient.getQueryData(cle);
      if (avant && corps.tout) queryClient.setQueryData(cle, { ...avant, diapos: corps.tout });
      if (avant && corps.diapo) queryClient.setQueryData(cle, { ...avant, diapos: avant.diapos.map((d) => (d.id === corps.diapo.id ? corps.diapo : d)) });
      if (avant && corps.ordre === "modele") queryClient.setQueryData(cle, { ...avant, diapos: ordreDuModele(avant.diapos) });
      else if (avant && corps.ordre) { const par = new Map(avant.diapos.map((d) => [d.id, d])); queryClient.setQueryData(cle, { ...avant, diapos: corps.ordre.map((x) => par.get(x)) }); }
      return { avant };
    },
    onSuccess: (d) => { queryClient.setQueryData(cle, d); queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] }); queryClient.invalidateQueries({ queryKey: ["presentations-client"] }); },
    onError: (e, _c, ctx) => { if (ctx?.avant) queryClient.setQueryData(cle, ctx.avant); toast.error(e?.message || "La retouche n'a pas été gardée"); },
  });
  const changer = (diapo, { memoriser = true } = {}) => {
    if (memoriser) {
      const avant = data?.diapos.find((d) => d.id === diapo.id);
      if (avant) { passe.current = [...passe.current.slice(-60), { diapo: avant }]; futur.current = []; forcer((n) => n + 1); }
    }
    modifier.mutate({ diapo });
  };
  const rejouer = (geste) => {
    if (geste.diapo) { const actuelle = data?.diapos.find((d) => d.id === geste.diapo.id); modifier.mutate({ diapo: geste.diapo }); return actuelle ? { diapo: actuelle } : null; }
    // Une retouche d'AK : toute la présentation d'avant, remise d'un coup.
    if (geste.tout) { const actuelles = data?.diapos; modifier.mutate({ tout: geste.tout }); return actuelles ? { tout: actuelles } : null; }
    if (geste.ordre) { const actuel = data?.diapos.map((d) => d.id); modifier.mutate({ ordre: geste.ordre }); return actuel ? { ordre: actuel } : null; }
    return null;
  };
  const annuler = () => { const g = passe.current.pop(); if (!g) return; if (g.tout) toast.success("La retouche d'AK est annulée."); const inverse = rejouer(g); if (inverse) futur.current.push(inverse); forcer((n) => n + 1); };
  const retablir = () => { const g = futur.current.pop(); if (!g) return; const inverse = rejouer(g); if (inverse) passe.current.push(inverse); forcer((n) => n + 1); };
  useEffect(() => {
    const clavier = (e) => {
      if (document.activeElement?.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) retablir(); else annuler();
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  });
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") { setSelection(null); document.activeElement?.blur?.(); } };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, []);

  const reconstruire = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${id}/reconstruire`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: cle }); queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] }); },
    onError: (e) => toast.error(e?.message || "Reconstruction impossible"),
  });

  const [pdf, setPdf] = useState(false);
  // Une photo à changer : la diapositive et le chemin de la photo.
  const [photoDe, setPhotoDe] = useState(null);
  const poserPhoto = (url) => {
    const d = data.diapos.find((x) => x.id === photoDe.diapo);
    if (d) changer(poser(d, photoDe.chemin, url));
    setPhotoDe(null);
  };

  // Le plein écran, en lecture : la scène du deck prend l'écran.
  const pleinEcran = () => {
    setMode("lecture");
    setSelection(null);
    scene.current?.requestFullscreen?.().catch(() => {});
  };

  // Pendant que le chat travaille, ses étapes à la place du deck, puis il revient.
  const [maj, setMaj] = useState(false);
  const enCours = !!travail?.enCours;
  // La présentation telle qu'AK l'a trouvée : s'il la change, Annuler (⌘Z) y revient (13 oct. 2026, Jules).
  const avantAK = useRef(null);
  useEffect(() => {
    if (enCours) { setMaj(true); avantAK.current = queryClient.getQueryData(cle)?.diapos || null; return undefined; }
    queryClient.refetchQueries({ queryKey: cle }).then(() => {
      const avant = avantAK.current;
      avantAK.current = null;
      const apres = queryClient.getQueryData(cle)?.diapos;
      if (avant && apres && JSON.stringify(avant) !== JSON.stringify(apres)) { passe.current = [...passe.current.slice(-60), { tout: avant }]; futur.current = []; forcer((n) => n + 1); }
    });
    const t = setTimeout(() => setMaj(false), 700);
    return () => clearTimeout(t);
  }, [enCours]);

  const diapos = data?.diapos || [];
  const courantId = diapos.some((d) => d.id === courante) ? courante : diapos.find((d) => !d.masquee)?.id || diapos[0]?.id || null;
  const visibles = diapos.filter((d) => !d.masquee).length;
  // Rien sous le titre, sauf pendant un enregistrement (12 oct. 2026, Jules : plus de « 16 diapositives · vos retouches sont gardées »).
  const statut = modifier.isPending ? "Enregistrement…" : client ? "Enregistré automatiquement" : "";
  const edition = mode === "edition";
  // Le mode Sources (13 oct. 2026) : le deck en lecture, sans inclinaison ; le survol d'un champ ouvre la fiche de sa source.
  const modeSources = mode === "sources";
  const [survol, setSurvol] = useState(null);
  const zoneDeck = useRef(null);
  const actif = useRef(null);
  // Un court délai avant de changer de fiche : la souris qui va du champ à sa fiche (pour un lien) ne la remplace pas en chemin.
  const attente = useRef(null);
  const surSource = (s) => {
    clearTimeout(attente.current);
    attente.current = setTimeout(() => {
      actif.current?.classList.remove("pb-source-active");
      s.el.classList.add("pb-source-active");
      actif.current = s.el;
      setSurvol({ ...s, ancre: s.el.getBoundingClientRect(), cadre: zoneDeck.current?.getBoundingClientRect() });
    }, actif.current ? 160 : 0);
  };
  useEffect(() => {
    clearTimeout(attente.current);
    actif.current?.classList.remove("pb-source-active");
    actif.current = null;
    setSurvol(null);
  }, [modeSources, courantId]);
  const sourceSurvolee = survol && data?.sources_champs ? (() => {
    const s = data.sources_champs[survol.diapo] || {};
    return s[survol.chemin] || s[String(survol.chemin).replace(/\.(label|titre|page)$/, ".valeur")] || null;
  })() : null;

  return (
    // Pas de fond propre (28 oct. 2026, le modèle de la page éditeur) : celui de la page passe dessous.
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <BarreEditeur titre={data?.titre || "Présentation bancaire"} statut={statut} mode={mode}
        onMode={(k) => { setMode(k); if (k !== "edition") setSelection(null); }}
        actions={(
          <>
            <span className="flex flex-none items-center gap-0.5 max-md:hidden">
              <button type="button" onClick={annuler} disabled={!passe.current.length} aria-label="Annuler" title="Annuler (⌘Z), une retouche d'AK comprise" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Undo2 className="h-4 w-4" /></button>
              <button type="button" onClick={retablir} disabled={!futur.current.length} aria-label="Rétablir" title="Rétablir (⇧⌘Z)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Redo2 className="h-4 w-4" /></button>
              <button type="button" onClick={pleinEcran} aria-label="Plein écran" title="Plein écran (lecture)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><Maximize2 className="h-4 w-4" /></button>
            </span>
            {/* Côté client : l'explication des modes, et une question à l'équipe (dans son Feedback). */}
            {client && (
              <>
                <button type="button" onClick={() => setVisite(true)} aria-label="Comment ça marche" title="Comment ça marche" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><CircleHelp className="h-4 w-4" /></button>
                <button type="button" onClick={() => setQuestion(true)} disabled={!data}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40 max-md:px-3">
                  <CircleHelp className="h-3.5 w-3.5" />Une question
                </button>
                {/* Le PDF, à droite de « Une question » (16 oct. 2026, Jules) : le même que celui de l'équipe. */}
                <button type="button" onClick={() => setPdf(true)} disabled={!data || data.ancienne}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40 max-md:px-3" style={{ background: "transparent" }}>
                  <FileText className="h-3.5 w-3.5" />PDF
                </button>
              </>
            )}
            {/* L'équipe l'envoie à un ou plusieurs clients : elle apparaît dans leur page Présentations. */}
            {!client && (
              <button type="button" onClick={() => setEnvoi(true)} disabled={!data || data.ancienne} title={data?.envoye_a?.length ? `Envoyée à ${data.envoye_a.join(", ")}` : "Envoyer au client"}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40 max-md:px-3" style={{ background: "transparent" }}>
                <Send className="h-3.5 w-3.5" /><span className="max-md:hidden">{data?.envoye_a?.length ? `Envoyée (${data.envoye_a.length})` : "Envoyer au client"}</span>
              </button>
            )}
            {/* Le PDF, tiré du deck lui-même : l'aperçu, puis le téléchargement (12 oct. 2026 ; Google Slides retiré, il déformait tout). */}
            {!client && (
              <button type="button" onClick={() => setPdf(true)} disabled={!data || data.ancienne}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40 max-md:px-3">
                <FileText className="h-3.5 w-3.5" />PDF
              </button>
            )}
            {onFermer && (
              <button type="button" onClick={onFermer} aria-label="Fermer la présentation" title="Fermer"
                className="ml-1 grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:ml-0" style={{ background: "transparent" }}>
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        )} />
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {maj && data ? (
            <MiseAJourDocument surtitre="Mise à jour de la présentation"
              // Le titre dit ce qu'AK fait vraiment : « rassemble les chiffres » seulement s'il lit une source chiffrée (13 oct. 2026, Jules).
              titre={titreTravail(travail?.etapes)}
              etapes={travail?.etapes || []} enCours={enCours} />
          ) : isLoading ? (
            <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
          ) : error || !data ? (
            <p className="m-0 p-10 text-center text-[14px] text-brume">{error?.message || "Présentation introuvable."}</p>
          ) : data.ancienne ? (
            <div className="grid h-full place-items-center px-10 text-center">
              <div className="max-w-[46ch]">
                <p className="m-0 text-[15px] text-encre">Cette présentation est sur l'ancien modèle.</p>
                <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-ardoise">{client ? "L'équipe Klocka la met à jour : elle revient ici dès qu'elle est prête." : "Le modèle a changé le 12 octobre. Reconstruisez-la depuis son projet : ses retouches à la main ne seront pas reprises."}</p>
                {!client && <button type="button" onClick={() => reconstruire.mutate()} disabled={reconstruire.isPending}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
                  {reconstruire.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Reconstruire sur le nouveau modèle
                </button>}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div ref={zoneDeck} className="relative min-h-0 flex-1 p-5 max-md:p-3">
                <Deck diapos={diapos} courante={courantId} onCourante={(x) => { setCourante(x); setSelection(null); }} mode={modeSources ? "lecture" : mode}
                  relief={modeSources ? 0 : 6} sources={modeSources ? data.sources_champs || {} : null} onSource={surSource}
                  selection={selection} onSelection={setSelection} onChange={changer} onPhoto={(diapo, chemin) => setPhotoDe({ diapo, chemin })} sceneRef={scene} />
                {modeSources && sourceSurvolee && <FicheSource source={sourceSurvolee} ancre={survol.ancre} cadre={survol.cadre} onEntrer={() => clearTimeout(attente.current)} />}
                {/* En édition, ce qui est masqué sur cette diapositive, pour le réafficher d'un clic. */}
                {edition && (() => {
                  const d = diapos.find((x) => x.id === courantId);
                  const masques = Object.entries(d?.styles || {}).filter(([, st]) => st?.masque).map(([c]) => c);
                  if (!masques.length) return null;
                  return (
                    <div className="absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-full border border-trait bg-rail px-3 py-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.18)]">
                      <span className="text-[12px] text-brume">Masqué :</span>
                      {masques.map((c) => (
                        <button key={c} type="button" onClick={() => changer(afficherPartie(d, c))} title="Réafficher"
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
                          <Eye className="h-3 w-3" />{nomDePartie(d.type, c)}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
        {/* L'élément cliqué : son panneau à droite de la scène, Design d'abord, comme dans tous les éditeurs. */}
        {edition && selection && data && !data.ancienne && !maj && <PanneauElement diapos={diapos} selection={selection} onChange={changer} onSelection={setSelection} />}
      </div>
      {pdf && data && <ApercuPdf id={id} titre={data.titre} onFermer={() => setPdf(false)} {...(client ? { api: "/api/client/presentations" } : {})} />}
      {envoi && data && <EnvoiClient id={id} titre={data.titre} onFermer={() => setEnvoi(false)} />}
      {question && data && <QuestionClient id={id} titre={data.titre} onFermer={() => setQuestion(false)} />}
      {visite && <VisitePresentation onFermer={() => setVisite(false)} />}
      {photoDe && data && <ChoixPhoto photos={data.photos_projet || []} onChoisir={poserPhoto} onFermer={() => setPhotoDe(null)} />}
    </div>
  );
}

/** Pure : le titre de l'écran d'attente, d'après les étapes d'AK. */
function titreTravail(etapes = []) {
  if (etapes.some((e) => /^(Retouche|Construction) de la présentation/i.test(e))) return "La présentation s'adapte";
  if (etapes.some((e) => /Equimmox|Data-B|chiffres de la commune|INSEE|Figaro|DVF|loyer|prix/i.test(e))) return "Haka rassemble les chiffres";
  return "Haka lit votre demande";
}

/** Changer une photo : celles du projet, une à importer, ou aucune. */
function ChoixPhoto({ photos, onChoisir, onFermer }) {
  const fichier = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const importer = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnvoi(true);
    try {
      const r = await base44.integrations.Core.UploadFile({ file: f });
      if (r?.file_url) onChoisir(r.file_url);
    } catch (err) {
      toast.error(err?.message || "Import impossible");
    } finally {
      setEnvoi(false);
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/70 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3.5">
          <span className="text-[14.5px] text-encre">Changer la photo</span>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {photos.length ? (
            <div className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-2">
              {photos.map((u) => (
                <button key={u} type="button" onClick={() => onChoisir(u)} className="aspect-video overflow-hidden rounded-[10px] border border-trait hover:border-menthe" style={{ background: "transparent" }}>
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[13.5px] text-ardoise">Ce projet n'a pas de photo : importez-en une.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-trait px-5 py-3.5">
          <button type="button" onClick={() => onChoisir(null)} className="text-[13px] text-ardoise hover:text-alerte" style={{ background: "transparent" }}>Retirer la photo</button>
          <button type="button" onClick={() => fichier.current?.click()} disabled={envoi}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
            {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Importer une image
          </button>
          <input ref={fichier} type="file" accept="image/*" className="hidden" onChange={importer} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
