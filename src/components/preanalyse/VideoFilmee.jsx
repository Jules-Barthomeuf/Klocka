import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Mail, MessageCircle, RefreshCw, Send, Trash2 } from "lucide-react";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { prenom } from "@/components/preanalyse/AnalysePieces";

// L'étape Vidéo (29 oct. 2026, Jules : « on peut importer la vidéo filmée directe pour l'envoyer aux clients ») :
// la vidéo du bien filmée au téléphone, une par dossier. Vide, une zone de dépôt comme celles de la Data Room ;
// importée, le lecteur, qui l'a mise et quand, « Remplacer » et « Retirer ».

const mo = (n) => `${Math.max(1, Math.round((n || 0) / (1024 * 1024)))} Mo`;

export default function VideoFilmee({ dealId, apercu = false }) {
  const queryClient = useQueryClient();
  const entree = useRef(null);
  const [survol, setSurvol] = useState(false);
  const cle = ["video-filmee", dealId];
  const { data, isLoading } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/video-filmee`), enabled: !!dealId && !apercu });
  const envoyer = useMutation({
    mutationFn: (fichier) => { const f = new FormData(); f.append("video", fichier); return base44.request("POST", `/api/preanalyse/dossiers/${dealId}/video-filmee`, { body: f, isForm: true }); },
    onSuccess: (r) => { queryClient.setQueryData(cle, r); toast.success("Vidéo importée"); },
    onError: (e) => toast.error(e?.message || "La vidéo n'a pas pu être importée"),
  });
  const retirer = useMutation({
    mutationFn: () => base44.request("DELETE", `/api/preanalyse/dossiers/${dealId}/video-filmee`),
    onSuccess: (r) => queryClient.setQueryData(cle, r),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const choisir = (fichiers) => {
    const f = [...(fichiers || [])].find((x) => /^video\//.test(x.type) || /\.(mp4|mov|m4v|webm)$/i.test(x.name));
    if (!f) { toast.error("Choisissez une vidéo (MP4, MOV)."); return; }
    if (f.size > 500 * 1024 * 1024) { toast.error("La vidéo dépasse 500 Mo."); return; }
    envoyer.mutate(f);
  };
  const ouvrir = () => { if (!envoyer.isPending && !apercu) entree.current?.click(); };
  const video = data?.video || null;
  // Le lien public de la vidéo, demandé dès qu'elle est là : au clic, WhatsApp ou le mail s'ouvrent sans attendre.
  const [lien, setLien] = useState(null);
  useEffect(() => {
    setLien(null);
    if (!video?.url || apercu) return;
    base44.request("POST", `/api/preanalyse/dossiers/${dealId}/video-filmee/lien`)
      .then((r) => setLien(`${window.location.origin}${r.chemin}`))
      .catch(() => setLien(null));
  }, [video?.url, dealId, apercu]);
  const champ = <input ref={entree} type="file" accept="video/*,.mov,.mp4,.m4v,.webm" className="hidden" onChange={(e) => { choisir(e.target.files); e.target.value = ""; }} />;

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-brume" /></div>;

  if (!video || envoyer.isPending) {
    return (
      <section role="button" tabIndex={0} aria-label="Importer la vidéo filmée" onClick={ouvrir}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrir(); } }}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); choisir(e.dataTransfer.files); }}
        className={`grid min-h-[320px] cursor-pointer place-items-center rounded-[14px] border border-dashed px-6 py-12 text-center transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : "border-bord hover:border-bord-doux"}`}>
        {champ}
        <div className="flex flex-col items-center gap-3">
          {envoyer.isPending ? <Loader2 className="h-7 w-7 animate-spin text-menthe" /> : <Film className="h-7 w-7 text-craie" strokeWidth={1.5} />}
          <p className="m-0 text-[15px] text-encre">{envoyer.isPending ? "Envoi de la vidéo…" : "Importer la vidéo filmée"}</p>
          <p className="m-0 text-[12.5px] text-brume">{envoyer.isPending ? "Gardez la page ouverte le temps de l'envoi." : "Cliquez ou glissez la vidéo · MP4 ou MOV, 500 Mo au plus"}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {champ}
      <video key={video.url} src={video.url} controls preload="metadata" playsInline className="block max-h-[70vh] w-full rounded-[14px] border border-bord-doux bg-black" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 min-w-0 truncate text-[13px] text-ardoise">
          <span className="text-encre">{video.nom}</span> · {mo(video.taille)} · importée le {new Date(video.le).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}{video.par ? ` par ${prenom(video.par)}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <Envoyer lien={lien} />
          <button type="button" onClick={ouvrir} className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <RefreshCw className="h-3.5 w-3.5" /> Remplacer
          </button>
          <button type="button" disabled={retirer.isPending} onClick={() => { if (window.confirm("Retirer la vidéo de ce dossier ? Le fichier sera supprimé.")) retirer.mutate(); }}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie transition-colors hover:border-alerte hover:text-alerte disabled:opacity-50" style={{ background: "transparent" }}>
            <Trash2 className="h-3.5 w-3.5" /> Retirer
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Envoyer la vidéo au client (29 oct. 2026, Jules) : WhatsApp ou mail, avec le lien public de la vidéo. Le message
 * part de l'application de la personne (WhatsApp, sa messagerie) : elle choisit le destinataire et relit avant d'envoyer.
 */
function Envoyer({ lien }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useFermerAuClicAilleurs(ouvert, () => setOuvert(false));
  const texte = lien ? `Bonjour, voici la vidéo du bien : ${lien}` : "";
  const choix = [
    { cle: "whatsapp", mot: "WhatsApp", Icone: MessageCircle, url: `https://wa.me/?text=${encodeURIComponent(texte)}` },
    { cle: "mail", mot: "Mail", Icone: Mail, url: `mailto:?subject=${encodeURIComponent("La vidéo du bien")}&body=${encodeURIComponent(texte)}` },
  ];
  return (
    <div ref={zone} className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} disabled={!lien} aria-expanded={ouvert}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50">
        {lien ? <Send className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />} Envoyer
      </button>
      {ouvert && lien && (
        <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-[200px] overflow-hidden rounded-[14px] border border-bord-doux bg-rail p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.3)]">
          {choix.map(({ cle, mot, Icone, url }) => (
            <a key={cle} href={url} target={cle === "whatsapp" ? "_blank" : undefined} rel="noopener noreferrer" onClick={() => setOuvert(false)}
              className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] text-encre transition-colors hover:bg-rail-actif">
              <Icone className="h-4 w-4 text-craie" /> {mot}
            </a>
          ))}
          <button type="button" onClick={() => { navigator.clipboard?.writeText(lien).then(() => toast.success("Lien copié")); setOuvert(false); }}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] text-craie transition-colors hover:bg-rail-actif hover:text-encre" style={{ background: "transparent" }}>
            Copier le lien
          </button>
        </div>
      )}
    </div>
  );
}
