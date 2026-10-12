import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// L'aperçu du PDF de la présentation (12 oct. 2026) : le PDF est tiré du deck
// lui-même, chaque diapositive photographiée telle que l'écran la montre ;
// on le regarde ici avant de le télécharger ou de l'envoyer à la banque.
// Il n'est refait que si la présentation a changé depuis.

const API = "/api/admin/presentations-bancaires";

export default function ApercuPdf({ id, titre = "", onFermer }) {
  const [etat, setEtat] = useState({ charge: true, url: null, erreur: null });
  const preparer = async (forcer = false) => {
    setEtat({ charge: true, url: null, erreur: null });
    try {
      const r = await base44.request("POST", `${API}/${id}/pdf`, { body: { forcer } });
      setEtat({ charge: false, url: `${r.pdf_url}?v=${Date.now()}`, erreur: null });
    } catch (e) {
      setEtat({ charge: false, url: null, erreur: e?.message || "Le PDF n'a pas pu être préparé." });
    }
  };
  useEffect(() => { preparer(false); }, [id]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const nom = `Projet de financement ${titre}`.trim().replace(/[\\/:*?"<>|]/g, "-");
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm md:left-[var(--k-barre-largeur,0px)]" onMouseDown={onFermer} role="dialog" aria-modal="true" aria-label="Aperçu du PDF">
      <div className="flex h-[min(88vh,900px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-rail shadow-[0_18px_40px_rgb(0_0_0/0.22)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-14 flex-none items-center gap-3 border-b border-trait px-5">
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">Aperçu du PDF{titre ? <span className="text-ardoise"> · {titre}</span> : null}</span>
          <button type="button" onClick={() => preparer(true)} disabled={etat.charge} title="Refaire le PDF" aria-label="Refaire le PDF"
            className="grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}><RefreshCw className="h-4 w-4" /></button>
          <a href={etat.url || undefined} download={`${nom}.pdf`} aria-disabled={!etat.url}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol ${etat.url ? "" : "pointer-events-none opacity-50"}`}>
            <Download className="h-3.5 w-3.5" />Télécharger le PDF
          </a>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer (Échap)" className="grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 bg-fond">
          {etat.charge ? (
            <div className="grid h-full place-items-center text-center">
              <div><Loader2 className="mx-auto h-5 w-5 animate-spin text-menthe" /><p className="m-0 mt-3 text-[13.5px] text-ardoise">Je prépare le PDF, diapositive par diapositive…</p></div>
            </div>
          ) : etat.erreur ? (
            <p className="m-0 p-10 text-center text-[14px] text-alerte">{etat.erreur}</p>
          ) : (
            <iframe title="Aperçu du PDF" src={`${etat.url}#view=FitH`} className="h-full w-full border-0" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
