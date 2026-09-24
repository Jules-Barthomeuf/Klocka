import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

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
  // Les originaux : lus à l'ouverture du volet seulement — extraire les
  // pièces d'un mail archivé n'a de sens que si l'on veut les voir.
  const { data, isLoading } = useQuery({
    queryKey: ["fiche-originale", dossier?.deal_id],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/fiche-originale`),
    enabled: ouvert && !!dossier?.deal_id,
    staleTime: Infinity,
  });
  const originaux = data?.originaux || [];
  // Le document d'abord, toujours : le texte n'est qu'une lecture de lui.
  const [vue, setVue] = useState(0); // un rang d'original, ou "texte"
  if (!boutonFicheSource(dossier)) return null;
  const nom = src.nom_fichier || (src.type === "email" ? "Email de l'agent" : "Texte collé");
  const courant = vue === "texte" ? null : originaux[Math.min(Number(vue) || 0, Math.max(0, originaux.length - 1))] || null;
  const ongletsVisibles = originaux.length > 1 || (originaux.length > 0 && texteDe(src));
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={`inline-flex items-center gap-2 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie hover:text-encre hover:border-bord-vif transition-colors ${className}`}
        aria-label="Consulter la fiche commerciale importée" title="Consulter la fiche commerciale importée"
      >
        <FileText className="w-3.5 h-3.5" /> Fiche commerciale importée
      </button>
      {ouvert && (
        <div className="panneau-source fixed inset-y-0 right-0 z-[60] w-full sm:w-[760px] bg-fond border-l border-bord shadow-[-24px_0_60px_rgba(0,0,0,.6)] flex flex-col">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-trait">
            <div className="min-w-0">
              <p className="m-0 text-[11px] tracking-[.18em] uppercase text-brume">Fiche commerciale importée</p>
              <p className="m-0 mt-1 text-[15px] text-encre truncate">{courant?.nom || nom}{src.pages && !courant ? <span className="text-brume"> · {src.pages} page{src.pages > 1 ? "s" : ""}</span> : null}</p>
            </div>
            <div className="flex items-center gap-2 flex-none">
              {courant?.url && courant.present !== false && (
                <a href={courant.url} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-menthe-clair hover:text-encre">Ouvrir ↗</a>
              )}
              <button onClick={() => setOuvert(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-ardoise hover:text-encre hover:bg-encre/5" aria-label="Fermer"><X className="w-4 h-4" /></button>
            </div>
          </div>
          {ongletsVisibles && (
            <div className="flex flex-wrap gap-1.5 px-5 py-3 border-b border-trait">
              {originaux.map((o, i) => (
                <button key={o.url} onClick={() => setVue(i)} className={`max-w-[260px] truncate px-3 py-1 rounded-full text-[12.5px] transition-colors ${vue === i ? "bg-menthe text-sur-menthe font-semibold" : "border border-bord-doux text-ardoise hover:text-encre"}`}>{o.nom}</button>
              ))}
              {texteDe(src) && (
                <button onClick={() => setVue("texte")} className={`px-3 py-1 rounded-full text-[12.5px] transition-colors ${vue === "texte" ? "bg-menthe text-sur-menthe font-semibold" : "border border-bord-doux text-ardoise hover:text-encre"}`}>Texte lu</button>
              )}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {isLoading ? (
              <p className="m-0 px-6 py-5 inline-flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="w-4 h-4 animate-spin" /> Recherche du document d'origine…</p>
            ) : courant && courant.present === false ? (
              <>
                <p className="m-0 mx-6 mt-5 rounded-md border border-ambre/40 bg-ambre/10 px-4 py-3 text-[12.5px] text-ambre">
                  Le fichier d'origine « {courant.nom} » n'est plus sur le serveur : voici le texte qui en avait été lu.
                </p>
                <pre className="m-0 px-6 py-5 whitespace-pre-wrap font-[inherit] text-[13.5px] leading-[1.7] text-craie">{texteDe(src) || "Texte indisponible."}</pre>
              </>
            ) : courant ? (
              /^image\//.test(courant.mime || "") || /\.(png|jpe?g|webp|gif)$/i.test(courant.url)
                ? <div className="p-4"><img src={courant.url} alt={courant.nom} className="w-full h-auto rounded-md" /></div>
                : <iframe title={courant.nom} src={courant.url} className="w-full h-full min-h-[80vh] bg-surface" />
            ) : (
              <>
                {data?.colle && vue !== "texte" && (
                  <p className="m-0 mx-6 mt-5 rounded-md border border-bord-doux px-4 py-3 text-[12.5px] text-ardoise">
                    Cette fiche a été collée en texte : il n'existe pas d'autre document que ce texte.
                  </p>
                )}
                <pre className="m-0 px-6 py-5 whitespace-pre-wrap font-[inherit] text-[13.5px] leading-[1.7] text-craie">{texteDe(src) || "Texte indisponible."}</pre>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
