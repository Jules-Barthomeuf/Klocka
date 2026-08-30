import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ExternalLink, X, Loader2 } from "lucide-react";
import { RESSOURCES, resoudreRessource } from "@/data/ressources";

// Bloc « Aller plus loin ? » en bas de chaque onglet.
// Survol : le résumé se déplie sous le titre. Clic : fiche en deux colonnes —
// notre commentaire à gauche, la page de la source à droite.
//
// La page ne peut pas être affichée en iframe (X-Frame-Options sur tous ces
// sites) : elle est récupérée et nettoyée par /api/lecture, puis rendue avec la
// typographie de l'application.

function Carte({ ressource, onOpen }) {
  const [survol, setSurvol] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)}
      onBlur={() => setSurvol(false)}
      className="group text-left w-full border-t border-[#f2f3f5]/[0.12] pt-4 pb-4 transition-colors hover:border-[#8fa0f2]/60"
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[15px] max-md:text-[14px] text-[#f2f3f5] group-hover:text-[#aab6f5] transition-colors">{ressource.titre}</span>
        <span className="text-[10px] tracking-[0.14em] uppercase text-[#6a7180] whitespace-nowrap">{ressource.duree}</span>
      </div>
      <div className="text-[11px] tracking-[0.1em] uppercase text-[#9298a6] mt-1.5">{ressource.source}</div>
      <div className={`grid transition-all duration-300 ${survol ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}>
        <p className="overflow-hidden text-[13px] leading-[1.7] text-[#c9cdd6] mb-0">{ressource.resume}</p>
      </div>
    </button>
  );
}

// Récupère l'article via le lecteur du serveur (cache 24 h côté serveur).
function useArticle(url) {
  const [etat, setEtat] = useState({ chargement: false, html: null, erreur: null });

  useEffect(() => {
    if (!url) return;
    let annule = false;
    setEtat({ chargement: true, html: null, erreur: null });
    fetch(`/api/lecture?url=${encodeURIComponent(url)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || "Lecture indisponible.");
        return data;
      })
      .then((d) => {
        if (annule) return;
        setEtat({ chargement: false, html: d.html || "", erreur: d.html ? null : "La source n'a pas renvoyé de texte lisible." });
      })
      .catch((e) => {
        if (!annule) setEtat({ chargement: false, html: null, erreur: e.message });
      });
    return () => {
      annule = true;
    };
  }, [url]);

  return etat;
}

function Article({ url, source }) {
  const { chargement, html, erreur } = useArticle(url);

  if (chargement) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-[#9298a6]">
        <Loader2 className="w-5 h-5 animate-spin text-[#8fa0f2]" />
        <p className="text-[12px] mb-0">Lecture de la page {source}…</p>
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
        <p className="text-[13px] leading-[1.7] text-[#9298a6] mb-0">
          {source} ne permet pas la lecture intégrée ({erreur.toLowerCase()})
        </p>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase text-[#aab6f5] hover:text-[#f2f3f5] transition-colors">
          Ouvrir la page <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    );
  }

  return <div className="article-lu" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function AllerPlusLoin({ section, project }) {
  const [ouverte, setOuverte] = useState(null);
  const liste = (RESSOURCES[section] || []).map((r) => resoudreRessource(r, project));
  if (!liste.length) return null;

  return (
    <div className="mt-12 max-md:mt-8">
      <div className="text-[10px] tracking-[0.2em] uppercase text-[#aab6f5] mb-4">Aller plus loin ?</div>
      <div className="md:grid md:grid-cols-2 md:gap-x-10">
        {liste.map((r, i) => (
          <Carte key={i} ressource={r} onOpen={() => setOuverte(r)} />
        ))}
      </div>

      <Dialog open={!!ouverte} onOpenChange={(v) => !v && setOuverte(null)}>
        <DialogContent className="max-w-6xl w-[94vw] h-[86vh] bg-[#0f1114] border border-[#f2f3f5]/[0.13] text-[#f2f3f5] p-0 [&>button]:hidden overflow-hidden">
          {ouverte && (
            <div className="h-full grid md:grid-cols-[minmax(0,380px)_minmax(0,1fr)] max-md:grid-rows-[auto_1fr] min-h-0">
              {/* Colonne gauche — notre commentaire */}
              <div className="overflow-y-auto px-7 py-6 max-md:px-5 max-md:py-5 md:border-r border-[#f2f3f5]/[0.13]">
                <div className="text-[10px] tracking-[0.2em] uppercase text-[#9298a6] mb-2">{ouverte.source} · {ouverte.duree}</div>
                <h3 className="font-cormorant text-[26px] max-md:text-[21px] font-light leading-[1.15] text-[#f2f3f5] mb-4">{ouverte.titre}</h3>
                <p className="text-[13.5px] leading-[1.75] text-[#c9cdd6] border-t border-[#f2f3f5]/[0.35] pt-4 mb-6">{ouverte.resume}</p>

                {ouverte.points.length > 0 && (
                  <>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-[#aab6f5] mb-3">Ce qui compte pour ce dossier</div>
                    <ul className="list-none pl-0 space-y-3 mb-6">
                      {ouverte.points.map((p, i) => (
                        <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.7] text-[#c9cdd6]">
                          <span className="w-1 h-1 rounded-full bg-[#8fa0f2] flex-shrink-0 mt-[9px]" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <a href={ouverte.url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-[#9298a6] hover:text-[#f2f3f5] transition-colors border-t border-[#f2f3f5]/[0.12] pt-4 w-full">
                  Voir sur le site d'origine <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Colonne droite — la page elle-même */}
              <div className="relative min-h-0 bg-[#000000]">
                <button onClick={() => setOuverte(null)} aria-label="Fermer"
                  className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-[#000000]/80 text-[#9298a6] hover:text-[#f2f3f5] transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <div className="h-full overflow-y-auto px-9 py-8 max-md:px-5 max-md:py-6">
                  <Article url={ouverte.url} source={ouverte.source} />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
