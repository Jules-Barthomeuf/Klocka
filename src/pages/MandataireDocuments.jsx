import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { depuis } from "@/components/ui/liste-documents";
import Chargement from "@/components/ui/Chargement";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";

// La Bibliothèque du mandataire, tous biens confondus (2 nov. 2026, Jules : « un onglet bibliothèque avec les documents,
// les mandats triés par date, les estimations, les decks, les comptes rendus de visite » ; puis « Bibliothèque plutôt
// que Documents, une grille de 3 colonnes, pas en ligne »). Une carte par document, la plus récente en tête, filtrée par
// type ; trois colonnes sur ordinateur, deux sur tablette, une au téléphone. Une carte ouvre le document dans son bien ;
// « PDF » le télécharge quand il existe. Le deck d'un avis est la même carte que l'avis.
// L'aperçu est le vrai document (2 nov. 2026, Jules) : la première page de l'avis et du teaser, photographiée par le
// serveur (server/vignette-document.js) ; celle du mandat, dessinée depuis son PDF ; le compte rendu et l'offre, qui
// n'ont pas de fichier, montrent leur propre texte sur une page.

const TYPES = [
  ["tous", "Tous"],
  ["mandat", "Mandats"],
  ["avis", "Avis de valeur"],
  ["compte_rendu", "Comptes rendus"],
  ["teaser", "Teasers"],
  ["offre", "Offres"],
];
const MOT = { mandat: "Mandat", avis: "Avis de valeur", compte_rendu: "Compte rendu de visite", teaser: "Teaser", offre: "Offre reçue" };
const LARGEUR_PAGE = 150;

/** L'aperçu d'une carte : la vraie première page quand le document en a une, sinon son texte sur une page. */
function Apercu({ d }) {
  const url = d.vignette || (d.type === "mandat" ? d.pdf : null);
  return (
    <span aria-hidden className="relative flex h-[176px] justify-center overflow-hidden border-b border-trait bg-surface pt-5">
      {url ? <MiniaturePiece url={url} largeur={LARGEUR_PAGE} className="rounded-b-none" /> : (
        // Le fond d'une page de papier, pas une couleur de l'interface (comme les documents imprimés).
        <span className="block flex-none overflow-hidden rounded-t-[3px] bg-white px-3 pt-3 text-left shadow-[0_2px_6px_rgb(0_0_0/0.25)]" style={{ width: LARGEUR_PAGE, height: Math.round(LARGEUR_PAGE * 1.3) }}>
          <span className="block text-[7px] uppercase tracking-[.12em] text-neutral-500">{MOT[d.type]}</span>
          <span className="mt-1 block text-[9px] font-medium leading-[1.25] text-neutral-900">{d.titre}</span>
          <span className="mt-1.5 block text-[7px] leading-[1.45] text-neutral-600">{d.detail}</span>
        </span>
      )}
    </span>
  );
}

export default function MandataireDocuments() {
  const naviguer = useNavigate();
  const [type, setType] = useState("tous");
  const { data, isLoading, isError } = useQuery({ queryKey: ["m-documents"], queryFn: () => base44.request("GET", "/api/mandataire/documents") });
  const docs = data?.documents || [];
  const compte = useMemo(() => Object.fromEntries(TYPES.map(([k]) => [k, k === "tous" ? docs.length : docs.filter((d) => d.type === k).length])), [docs]);
  const vus = type === "tous" ? docs : docs.filter((d) => d.type === type);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-8 sm:px-8">
      <div className="flex items-baseline gap-3 pb-4">
        <h1 className="m-0 text-[20px] font-normal tracking-[-0.01em] text-encre">Bibliothèque</h1>
        {docs.length > 0 && <span className="text-[13.5px] text-ardoise">{docs.length}</span>}
      </div>
      {/* Les types, comptés ; au téléphone, ils défilent sur une ligne. */}
      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Type de document">
        {TYPES.filter(([k]) => k === "tous" || compte[k] > 0).map(([k, mot]) => (
          <button key={k} type="button" role="tab" aria-selected={type === k} onClick={() => setType(k)}
            className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] ${type === k ? "border-transparent bg-relief text-encre" : "border-trait text-ardoise hover:text-craie"}`}
            style={type === k ? undefined : { background: "transparent" }}>
            {mot}<span className="tabular-nums text-brume">{compte[k]}</span>
          </button>
        ))}
      </div>
      {isLoading ? <Chargement taille="grand" />
        : isError ? <p className="py-16 text-center text-[14px] text-ardoise">Les documents ne se chargent pas.</p>
        : !vus.length ? <p className="py-16 text-center text-[14px] text-brume">Aucun document encore : ils arrivent ici à mesure que vos biens avancent.</p>
        : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vus.map((d) => (
              <div key={d.id} className="group relative flex min-w-0 flex-col overflow-hidden k-verre hover:border-bord-doux">
                <button type="button" onClick={() => naviguer(d.lien)} className="flex min-w-0 flex-1 flex-col text-left" style={{ background: "transparent" }}>
                  <Apercu d={d} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1 px-4 pb-4 pt-3">
                    <span className="text-[12px] uppercase tracking-[.12em] text-brume">{MOT[d.type]}</span>
                    <span className="truncate text-[16px] text-encre">{d.titre}</span>
                    {d.detail && <span className="line-clamp-2 text-[13.5px] text-ardoise">{d.detail}</span>}
                    <span className="mt-auto pt-2 text-[13px] text-brume">{depuis(d.le)}</span>
                  </span>
                </button>
                {d.pdf && (
                  <a href={d.pdf} target="_blank" rel="noreferrer" title="Télécharger le PDF"
                    className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:text-encre">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
