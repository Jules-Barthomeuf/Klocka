import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// Le lecteur des ressources : la vidéo se lit dans la page au lieu d'ouvrir un
// onglet (qui ne s'ouvrait pas quand la ressource n'avait pas de lien, et le
// bouton lecture semblait alors cassé).

/** L'adresse lisible dans un cadre : Drive en aperçu, YouTube et Vimeo en intégré. */
export function urlIntegrable(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  const drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([-\w]{20,})/);
  if (drive) return { type: "cadre", src: `https://drive.google.com/file/d/${drive[1]}/preview` };
  const youtube = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([-\w]{11})/);
  if (youtube) return { type: "cadre", src: `https://www.youtube.com/embed/${youtube[1]}?autoplay=1&rel=0` };
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { type: "cadre", src: `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1` };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return { type: "video", src: u };
  return null;
}

export const estVideo = (r) => r?.type === "video" || r?.type === "webinar";

export default function LecteurRessource({ ressource, onFermer }) {
  const media = urlIntegrable(ressource?.url_fichier);
  return (
    <Dialog open={!!ressource} onOpenChange={(o) => { if (!o) onFermer(); }}>
      <DialogContent className="max-w-4xl w-[calc(100vw-32px)] p-0 bg-surface border border-bord rounded-xl overflow-hidden">
        <DialogTitle className="px-6 pt-5 pb-3 text-[18px] font-light text-encre">{ressource?.titre}</DialogTitle>
        {media?.type === "cadre" ? (
          <div className="relative w-full aspect-video bg-black">
            <iframe src={media.src} title={ressource?.titre} className="absolute inset-0 w-full h-full" style={{ border: 0 }}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        ) : media?.type === "video" ? (
          <video src={media.src} controls autoPlay className="w-full aspect-video bg-black" />
        ) : ressource?.url_fichier ? (
          <div className="px-6 pb-6">
            <a href={ressource.url_fichier} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-menthe text-fond text-[12.5px] font-semibold hover:bg-menthe-survol transition-colors">
              Ouvrir la ressource <span aria-hidden="true">→</span>
            </a>
          </div>
        ) : (
          <p className="px-6 pb-6 text-[13.5px] leading-[1.7] text-ardoise mb-0">
            Cette ressource n'est pas encore en ligne : son lien arrive bientôt.
          </p>
        )}
        {ressource?.description && <p className="px-6 pb-6 pt-3 text-[13.5px] leading-[1.7] text-craie mb-0">{ressource.description}</p>}
      </DialogContent>
    </Dialog>
  );
}
