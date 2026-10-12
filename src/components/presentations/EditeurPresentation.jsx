import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, ExternalLink, Loader2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import Diapo, { poser } from "./Diapos";
import { NOMS } from "@/lib/presentation-modele";

// La présentation bancaire ouverte, à droite du chat de la page Présentations
// (12 oct. 2026) : les seize diapositives telles qu'elles partiront, l'une
// sous l'autre. Tout se modifie sur place : un texte au clic, une photo au
// clic, une liste par + et ×, une diapositive se masque ou se déplace. Le
// chat retouche la même présentation. PPTX et Google Slides sortent du serveur.

const API = "/api/admin/presentations-bancaires";

export default function EditeurPresentation({ id, onFermer, travail = null }) {
  const queryClient = useQueryClient();
  const cle = ["presentation-bancaire", id];
  const { data, isLoading, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${API}/${id}`), enabled: !!id });
  const modifier = useMutation({
    mutationFn: (corps) => base44.request("PATCH", `${API}/${id}`, { body: corps }),
    // La retouche s'affiche tout de suite ; le serveur confirme derrière.
    onMutate: (corps) => {
      const avant = queryClient.getQueryData(cle);
      if (avant && corps.diapo) queryClient.setQueryData(cle, { ...avant, diapos: avant.diapos.map((d) => (d.id === corps.diapo.id ? corps.diapo : d)) });
      if (avant && corps.ordre) { const par = new Map(avant.diapos.map((d) => [d.id, d])); queryClient.setQueryData(cle, { ...avant, diapos: corps.ordre.map((x) => par.get(x)) }); }
      return { avant };
    },
    onSuccess: (d) => { queryClient.setQueryData(cle, d); queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] }); },
    onError: (e, _c, ctx) => { if (ctx?.avant) queryClient.setQueryData(cle, ctx.avant); toast.error(e?.message || "La retouche n'a pas été gardée"); },
  });
  const changer = (diapo) => modifier.mutate({ diapo });
  const reconstruire = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${id}/reconstruire`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: cle }); queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] }); },
    onError: (e) => toast.error(e?.message || "Reconstruction impossible"),
  });
  const deplacer = (i, sens) => {
    const ids = data.diapos.map((d) => d.id);
    const j = i + sens;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    modifier.mutate({ ordre: ids });
  };

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
    // Les deux photos du local gardent leurs deux cases : en retirer une la vide.
    const rang = photoDe.chemin.match(/^photos\.(\d)$/);
    if (d && rang) { const photos = [...(d.photos || [null, null])]; photos[Number(rang[1])] = url; changer({ ...d, photos }); }
    else if (d) changer(poser(d, photoDe.chemin, url));
    setPhotoDe(null);
  };

  // Pendant que le chat travaille, ses étapes à la place des diapositives, puis elles reviennent.
  const [maj, setMaj] = useState(false);
  const enCours = !!travail?.enCours;
  useEffect(() => {
    if (enCours) { setMaj(true); return undefined; }
    queryClient.invalidateQueries({ queryKey: cle });
    const t = setTimeout(() => setMaj(false), 700);
    return () => clearTimeout(t);
  }, [enCours]);

  const visibles = (data?.diapos || []).filter((d) => !d.masquee).length;
  const statut = modifier.isPending ? "Enregistrement…" : data ? `${visibles} diapositive${visibles > 1 ? "s" : ""} · vos retouches sont gardées` : "";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-fond">
      <div className="k-barre-apercu flex h-14 flex-none items-center justify-between gap-3 border-b border-trait px-5 md:pr-[120px] max-md:gap-2 max-md:px-3">
        <div className="flex min-w-0 items-baseline gap-3 max-md:flex-col max-md:gap-0">
          <span className="truncate text-[14.5px] text-encre max-md:max-w-full">{data?.titre || "Présentation bancaire"}</span>
          <span className="truncate text-[12.5px] text-ardoise max-md:max-w-full">{statut}</span>
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
      <div className="min-h-0 flex-1 overflow-y-auto">
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
          <div className="mx-auto flex max-w-[1100px] flex-col gap-9 px-8 py-8 animate-in fade-in duration-500 max-md:gap-6 max-md:px-3 max-md:py-4">
            {data.diapos.map((d, i) => {
              // Le numéro sur la diapositive : son rang parmi celles qui partiront.
              const rang = d.masquee ? null : data.diapos.slice(0, i + 1).filter((x) => !x.masquee).length;
              return (
              <section key={d.id} className={d.masquee ? "pb-masquee" : ""} aria-label={NOMS[d.id] || d.id}>
                <div className="group mb-2 flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-ardoise">
                    <span className="tabular-nums text-brume">{i + 1}</span>
                    <span className="ml-2">{NOMS[d.id] || d.id}</span>
                    {d.masquee && <span className="ml-2 text-ambre">masquée, ne partira pas</span>}
                  </span>
                  <span className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                    <Geste titre="Monter" onClick={() => deplacer(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Geste>
                    <Geste titre="Descendre" onClick={() => deplacer(i, 1)} disabled={i === data.diapos.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Geste>
                    <Geste titre={d.masquee ? "Afficher" : "Masquer"} onClick={() => changer({ ...d, masquee: !d.masquee })}>
                      {d.masquee ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Geste>
                  </span>
                </div>
                <Diapo d={d} rang={rang} total={visibles} onChange={changer} onPhoto={(chemin) => setPhotoDe({ diapo: d.id, chemin })} />
              </section>
              );
            })}
          </div>
        )}
      </div>
      {photoDe && data && <ChoixPhoto photos={data.photos_projet || []} onChoisir={poserPhoto} onFermer={() => setPhotoDe(null)} />}
    </div>
  );
}

function Geste({ titre, onClick, disabled = false, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={titre} title={titre}
      className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>
      {children}
    </button>
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
