import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Loader2, Maximize2, PanelRight, Redo2, Undo2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import Deck, { poser } from "./Deck";
import PanneauDeck, { StylesElement } from "./PanneauDeck";
import { ordreDuModele } from "@/lib/presentation-modele";

// La présentation bancaire ouverte, à droite du chat de la page Présentations
// (12 oct. 2026) : un seul deck de seize diapositives, qu'on feuillette, et à
// sa droite le panneau de l'atelier, comme pour l'avis de valeur. Deux
// modes : édition (un clic sur un élément le choisit, le texte se retape sur
// place, le panneau règle sa mise en forme) et lecture (navigation, cascade,
// 3D à la souris, plein écran). Le chat retouche la même présentation.
// Annuler et rétablir reviennent sur chaque geste. PPTX et Google Slides
// sortent du serveur, mises en forme comprises.

const API = "/api/admin/presentations-bancaires";

export default function EditeurPresentation({ id, onFermer, travail = null }) {
  const queryClient = useQueryClient();
  const cle = ["presentation-bancaire", id];
  const { data, isLoading, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${API}/${id}`), enabled: !!id });
  const [mode, setMode] = useState("edition");
  const [courante, setCourante] = useState(null);
  const [selection, setSelection] = useState(null);
  // Le panneau des diapositives est fermé par défaut : la diapositive prend la place, on l'ouvre si on veut (12 oct. 2026).
  const [panneau, setPanneau] = useState(false);
  const scene = useRef(null);
  // Les gestes faits, pour annuler : chacun garde l'état d'avant (une diapositive, ou l'ordre).
  const passe = useRef([]);
  const futur = useRef([]);
  const [, forcer] = useState(0);

  const modifier = useMutation({
    mutationFn: (corps) => base44.request("PATCH", `${API}/${id}`, { body: corps }),
    // La retouche s'affiche tout de suite ; le serveur confirme derrière.
    onMutate: (corps) => {
      const avant = queryClient.getQueryData(cle);
      if (avant && corps.diapo) queryClient.setQueryData(cle, { ...avant, diapos: avant.diapos.map((d) => (d.id === corps.diapo.id ? corps.diapo : d)) });
      if (avant && corps.ordre === "modele") queryClient.setQueryData(cle, { ...avant, diapos: ordreDuModele(avant.diapos) });
      else if (avant && corps.ordre) { const par = new Map(avant.diapos.map((d) => [d.id, d])); queryClient.setQueryData(cle, { ...avant, diapos: corps.ordre.map((x) => par.get(x)) }); }
      return { avant };
    },
    onSuccess: (d) => { queryClient.setQueryData(cle, d); queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] }); },
    onError: (e, _c, ctx) => { if (ctx?.avant) queryClient.setQueryData(cle, ctx.avant); toast.error(e?.message || "La retouche n'a pas été gardée"); },
  });
  const changer = (diapo, { memoriser = true } = {}) => {
    if (memoriser) {
      const avant = data?.diapos.find((d) => d.id === diapo.id);
      if (avant) { passe.current = [...passe.current.slice(-60), { diapo: avant }]; futur.current = []; forcer((n) => n + 1); }
    }
    modifier.mutate({ diapo });
  };
  const ordonner = (ordre, { memoriser = true } = {}) => {
    if (memoriser && data) { passe.current = [...passe.current.slice(-60), { ordre: data.diapos.map((d) => d.id) }]; futur.current = []; forcer((n) => n + 1); }
    modifier.mutate({ ordre });
  };
  const rejouer = (geste) => {
    if (geste.diapo) { const actuelle = data?.diapos.find((d) => d.id === geste.diapo.id); modifier.mutate({ diapo: geste.diapo }); return actuelle ? { diapo: actuelle } : null; }
    if (geste.ordre) { const actuel = data?.diapos.map((d) => d.id); modifier.mutate({ ordre: geste.ordre }); return actuel ? { ordre: actuel } : null; }
    return null;
  };
  const annuler = () => { const g = passe.current.pop(); if (!g) return; const inverse = rejouer(g); if (inverse) futur.current.push(inverse); forcer((n) => n + 1); };
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

  // Google Slides : le premier compte Google qui a le Drive.
  const { data: statutMail } = useQuery({ queryKey: ["mail-status"], queryFn: () => base44.functions.invoke("getMailStatus", {}) });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;
  const [export_, setExport] = useState(null);
  const exporter = async (format) => {
    if (format === "slides" && !compteDrive) {
      window.location.href = "/api/auth/google/login?returnTo=" + encodeURIComponent("/Presentations");
      return;
    }
    setExport(format);
    try {
      const r = await base44.request("POST", `${API}/${id}/export`, { body: { compte: format === "slides" ? compteDrive : null } });
      queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] });
      if (format === "slides") {
        if (r.slides_url) window.open(r.slides_url, "_blank", "noopener");
        else toast.error(`Conversion Slides impossible${r.erreur_slides ? ` : ${r.erreur_slides}` : ""}`);
      } else {
        const a = document.createElement("a");
        a.href = r.pptx_url;
        a.download = `Projet de financement ${data?.titre || ""}.pptx`.trim();
        a.click();
      }
    } catch (e) {
      toast.error(e?.message || "Export impossible");
    } finally {
      setExport(null);
    }
  };

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
  useEffect(() => {
    if (enCours) { setMaj(true); return undefined; }
    queryClient.invalidateQueries({ queryKey: cle });
    const t = setTimeout(() => setMaj(false), 700);
    return () => clearTimeout(t);
  }, [enCours]);

  const diapos = data?.diapos || [];
  const courantId = diapos.some((d) => d.id === courante) ? courante : diapos.find((d) => !d.masquee)?.id || diapos[0]?.id || null;
  const visibles = diapos.filter((d) => !d.masquee).length;
  const statut = modifier.isPending ? "Enregistrement…" : data ? `${visibles} diapositive${visibles > 1 ? "s" : ""} · vos retouches sont gardées` : "";
  const edition = mode === "edition";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-fond">
      <div className="k-barre-apercu flex h-14 flex-none items-center gap-3 border-b border-trait px-5 md:pr-[120px] max-md:gap-2 max-md:px-3">
        <div className="flex min-w-0 flex-1 items-baseline gap-3 max-md:flex-col max-md:gap-0">
          <span className="truncate text-[14.5px] text-encre max-md:max-w-full">{data?.titre || "Présentation bancaire"}</span>
          <span className="truncate text-[12.5px] text-ardoise max-md:max-w-full">{statut}</span>
        </div>
        {/* Édition ou lecture : la pilule, comme les onglets de la plateforme. */}
        <div className="flex flex-none gap-1 rounded-full bg-rail-actif p-1">
          {[["edition", "Édition"], ["lecture", "Lecture"]].map(([k, mot]) => (
            <button key={k} type="button" onClick={() => { setMode(k); if (k === "lecture") setSelection(null); }} aria-pressed={mode === k}
              className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${mode === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={mode === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <div className="flex flex-none items-center gap-0.5 max-md:hidden">
          <button type="button" onClick={annuler} disabled={!passe.current.length} aria-label="Annuler" title="Annuler (⌘Z)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={retablir} disabled={!futur.current.length} aria-label="Rétablir" title="Rétablir (⇧⌘Z)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Redo2 className="h-4 w-4" /></button>
          <button type="button" onClick={pleinEcran} aria-label="Plein écran" title="Plein écran (lecture)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><Maximize2 className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPanneau((v) => !v)} aria-pressed={panneau} aria-label="Diapositives" title="Diapositives" className={`grid h-8 w-8 place-items-center rounded-full ${panneau ? "bg-encre/[0.08] text-encre" : "text-ardoise hover:text-encre"}`} style={panneau ? undefined : { background: "transparent" }}><PanelRight className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-none items-center gap-1.5 max-md:gap-1">
          <button type="button" onClick={() => exporter("pptx")} disabled={!data || !!export_}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40 max-md:px-3" style={{ background: "transparent" }}>
            {export_ === "pptx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PPTX
          </button>
          <button type="button" onClick={() => exporter("slides")} disabled={!data || !!export_} title={compteDrive ? "Ouvrir dans Google Slides" : "Connecter Google pour ouvrir dans Slides"}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40 max-md:px-3" style={{ background: "transparent" }}>
            {export_ === "slides" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}<span className="max-md:hidden">Google Slides</span><span className="md:hidden">Slides</span>
          </button>
          {onFermer && (
            <button type="button" onClick={onFermer} aria-label="Fermer la présentation" title="Fermer"
              className="ml-1 grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:ml-0" style={{ background: "transparent" }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          {maj && data ? (
            <MiseAJourDocument surtitre="Mise à jour de la présentation" titre="La présentation s'adapte" etapes={travail?.etapes || []} enCours={enCours} />
          ) : isLoading ? (
            <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
          ) : error || !data ? (
            <p className="m-0 p-10 text-center text-[14px] text-brume">{error?.message || "Présentation introuvable."}</p>
          ) : data.ancienne ? (
            <div className="grid h-full place-items-center px-10 text-center">
              <div className="max-w-[46ch]">
                <p className="m-0 text-[15px] text-encre">Cette présentation est sur l'ancien modèle.</p>
                <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-ardoise">Le modèle a changé le 12 octobre. Reconstruisez-la depuis son projet : ses retouches à la main ne seront pas reprises.</p>
                <button type="button" onClick={() => reconstruire.mutate()} disabled={reconstruire.isPending}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
                  {reconstruire.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Reconstruire sur le nouveau modèle
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="relative min-h-0 flex-1 p-5 max-md:p-3">
                <Deck diapos={diapos} courante={courantId} onCourante={(x) => { setCourante(x); setSelection(null); }} mode={mode}
                  selection={selection} onSelection={setSelection} onChange={changer} onPhoto={(diapo, chemin) => setPhotoDe({ diapo, chemin })} sceneRef={scene} />
                {/* L'élément cliqué : son menu « Styles » flotte en haut à droite, comme dans l'avis de valeur. */}
                {edition && selection && <StylesElement diapos={diapos} selection={selection} onChange={changer} onSelection={setSelection} />}
              </div>
            </div>
          )}
        </div>
        {panneau && data && !data.ancienne && (
          <PanneauDeck diapos={diapos} courante={courantId} onAller={(x) => { setCourante(x); setSelection(null); }} onChange={changer} onOrdre={ordonner} onFermer={() => setPanneau(false)} />
        )}
      </div>
      {photoDe && data && <ChoixPhoto photos={data.photos_projet || []} onChoisir={poserPhoto} onFermer={() => setPhotoDe(null)} />}
    </div>
  );
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
