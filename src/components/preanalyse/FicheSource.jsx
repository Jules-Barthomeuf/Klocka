import React, { useState } from "react";
import { FileText, X } from "lucide-react";

// La fiche commerciale telle qu'elle est arrivée : le texte lu, et le
// document lui-même quand il a été déposé. On la consulte dans un volet, la
// page ne bouge pas.
const texteDe = (src) => src?.texte || src?.texte_source || "";
export function boutonFicheSource(dossier) {
  const src = dossier?.source;
  return !!(src && (texteDe(src) || src.url));
}

export default function FicheSource({ dossier, className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  const src = dossier?.source;
  const pdf = !!(src?.url && /\.pdf(\?|$)/i.test(src.url));
  const [vue, setVue] = useState(pdf ? "document" : "texte");
  if (!boutonFicheSource(dossier)) return null;
  const nom = src.nom_fichier || (src.type === "email" ? "Email de l'agent" : "Texte collé");
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={`inline-flex items-center gap-2 rounded-full border border-[#2c3139] px-3.5 py-1.5 text-[13px] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors ${className}`}
        title="Consulter la fiche commerciale importée"
      >
        <FileText className="w-3.5 h-3.5" /> Fiche commerciale importée
      </button>
      {ouvert && (
        <div className="panneau-source fixed inset-y-0 right-0 z-[60] w-full sm:w-[720px] bg-[#000000] border-l border-[#22262d] shadow-[-24px_0_60px_rgba(0,0,0,.6)] flex flex-col">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[#1f2228]">
            <div className="min-w-0">
              <p className="m-0 text-[10px] tracking-[.18em] uppercase text-[#6a7180]">Fiche commerciale importée</p>
              <p className="m-0 mt-1 text-[15px] text-[#f2f3f5] truncate">{nom}{src.pages ? <span className="text-[#6a7180]"> · {src.pages} page{src.pages > 1 ? "s" : ""}</span> : null}</p>
            </div>
            <div className="flex items-center gap-2 flex-none">
              {pdf && texteDe(src) && (
                <div className="inline-flex rounded-full border border-[#2c3139] p-0.5">
                  {[["document", "Document"], ["texte", "Texte"]].map(([id, mot]) => (
                    <button key={id} onClick={() => setVue(id)} className={`px-3 py-1 rounded-full text-[12px] transition-colors ${vue === id ? "bg-[#f2f3f5] text-[#0b0c0e] font-semibold" : "text-[#9298a6] hover:text-[#f2f3f5]"}`}>{mot}</button>
                  ))}
                </div>
              )}
              <button onClick={() => setOuvert(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#9298a6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5" aria-label="Fermer"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {vue === "document" && pdf ? (
              <iframe title={nom} src={src.url} className="w-full h-full min-h-[70vh] bg-[#0f1114]" />
            ) : (
              <pre className="m-0 px-6 py-5 whitespace-pre-wrap font-[inherit] text-[13.5px] leading-[1.7] text-[#c9cdd6]">{texteDe(src) || "Texte indisponible."}</pre>
            )}
          </div>
        </div>
      )}
    </>
  );
}
