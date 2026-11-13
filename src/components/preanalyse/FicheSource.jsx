import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { VERRE_LG } from "@/lib/verre";

// La fiche commerciale telle qu'elle est arrivée : le texte lu, et le
// document lui-même quand il a été déposé.
const texteDe = (src) => src?.texte || src?.texte_source || "";
export function boutonFicheSource(dossier) {
  const src = dossier?.source;
  return !!(src && (texteDe(src) || src.url));
}

/**
 * Le mode Fiche de la Pré-analyse (5 nov. 2026, Jules : « un mode Fiche ou un mode Tableaux en haut à gauche, à la
 * place de Fiche commerciale ») : la fiche commerciale telle qu'elle est arrivée, dans la page, à la place du tableau.
 * Plus de volet à droite.
 */
export default function FicheSource({ dossier }) {
  const src = dossier?.source;
  const { data, isLoading } = useQuery({
    queryKey: ["fiche-originale", dossier?.deal_id],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/fiche-originale`),
    enabled: !!dossier?.deal_id && boutonFicheSource(dossier),
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
    <div className={`flex min-h-[70vh] flex-col overflow-hidden ${VERRE_LG}`}>
      <div className="flex items-center justify-between gap-4 border-b border-bord-doux px-5 py-3.5 max-md:px-3">
        <p className="m-0 min-w-0 truncate text-[15px] text-encre">{courant?.nom || nom}{src.pages && !courant ? <span className="text-brume"> · {src.pages} page{src.pages > 1 ? "s" : ""}</span> : null}</p>
        {courant?.url && courant.present !== false && (
          <a href={courant.url} target="_blank" rel="noopener noreferrer" className="flex-none text-[12.5px] text-ardoise hover:text-encre">Ouvrir ↗</a>
        )}
      </div>
      {ongletsVisibles && (
        <div className="flex flex-wrap gap-1.5 border-b border-bord-doux px-5 py-3">
          {originaux.map((o, i) => (
            <button key={o.url} type="button" onClick={() => setVue(i)} className={`max-w-[260px] truncate rounded-full px-3 py-1 text-[12.5px] transition-colors max-md:max-w-full ${vue === i ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={vue === i ? undefined : { background: "transparent" }}>{o.nom}</button>
          ))}
          {texteDe(src) && (
            <button type="button" onClick={() => setVue("texte")} className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${vue === "texte" ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={vue === "texte" ? undefined : { background: "transparent" }}>Texte lu</button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <p className="m-0 inline-flex items-center gap-2 px-6 py-5 text-[13px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Recherche du document d'origine…</p>
        ) : courant && courant.present === false ? (
          <>
            <p className="m-0 mx-6 mt-5 rounded-md border border-ambre/40 bg-ambre/10 px-4 py-3 text-[12.5px] text-ambre">
              Le fichier d'origine « {courant.nom} » n'est plus sur le serveur : voici le texte qui en avait été lu.
            </p>
            <pre className="m-0 whitespace-pre-wrap px-6 py-5 font-[inherit] text-[13.5px] leading-[1.7] text-craie">{texteDe(src) || "Texte indisponible."}</pre>
          </>
        ) : courant ? (
          /^image\//.test(courant.mime || "") || /\.(png|jpe?g|webp|gif)$/i.test(courant.url)
            ? <div className="p-4"><img src={courant.url} alt={courant.nom} className="h-auto w-full rounded-md" /></div>
            : (
              <>
                <iframe title={courant.nom} src={courant.url} className="h-[80vh] w-full bg-surface max-md:hidden" />
                {/* Au téléphone, un PDF dans un cadre ne se lit pas : on l'ouvre à part. */}
                <div className="hidden flex-col items-center gap-3 px-6 py-10 text-center max-md:flex">
                  <p className="m-0 text-[12.5px] text-ardoise">La fiche s'ouvre dans la visionneuse du téléphone.</p>
                  <a href={courant.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">Ouvrir la fiche</a>
                </div>
              </>
            )
        ) : (
          <>
            {data?.colle && vue !== "texte" && (
              <p className="m-0 mx-6 mt-5 rounded-md border border-bord-doux px-4 py-3 text-[12.5px] text-ardoise">
                Cette fiche a été collée en texte : il n'existe pas d'autre document que ce texte.
              </p>
            )}
            <pre className="m-0 whitespace-pre-wrap px-6 py-5 font-[inherit] text-[13.5px] leading-[1.7] text-craie">{texteDe(src) || "Texte indisponible."}</pre>
          </>
        )}
      </div>
    </div>
  );
}
