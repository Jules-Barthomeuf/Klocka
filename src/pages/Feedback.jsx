import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Image as ImageIcon, Loader2, Mic, Square, X } from "lucide-react";
import { useDictee } from "@/lib/dictee";
import { toast } from "@/components/ui/avis";
import BoiteSaisie, { BoutonBarre } from "@/components/BoiteSaisie";
import BordureEcoute from "@/components/BordureEcoute";
import AdminSuggestions from "@/pages/AdminSuggestions";

// Le Feedback des mandataires et des clients (30 oct. 2026, Jules : « la page feedback a changé ») : la même boîte que
// la page de l'équipe (texte, capture, dictée) et ses remarques en lignes, avec leur état. L'état se lit ici et se
// change seulement dans la page de l'équipe. La remarque est enregistrée, rien de plus : plus de mail à l'envoi.

const STATUTS = {
  nouveau: { label: "À faire", classe: "border border-bord text-brume" },
  en_cours: { label: "En cours", classe: "bg-ambre/15 text-ambre" },
  accepte: { label: "En cours", classe: "bg-ambre/15 text-ambre" },
  termine: { label: "Fait", classe: "bg-menthe/15 text-menthe" },
  refuse: { label: "Refusé", classe: "bg-alerte/15 text-alerte" },
};

const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function Feedback() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [texte, setTexte] = useState("");
  const [capture, setCapture] = useState(null); // File
  const [apercu, setApercu] = useState(null); // URL locale
  const [zoom, setZoom] = useState(null);
  const fichierRef = useRef(null);
  const { supporte: dicteeOk, ecoute, demarrer, arreter } = useDictee({ onTexte: (t) => setTexte(t) });

  const { data: remarques = [], isLoading } = useQuery({
    queryKey: ["suggestions", user?.email],
    queryFn: () => base44.entities.Suggestion.filter({ client_email: user.email }, "-created_date"),
    enabled: !!user?.email,
    initialData: [],
  });

  const choisirCapture = (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setCapture(f);
    setApercu(URL.createObjectURL(f));
  };
  const retirerCapture = () => { setCapture(null); if (apercu) URL.revokeObjectURL(apercu); setApercu(null); };

  const envoyer = useMutation({
    mutationFn: async () => {
      let capture_url = null;
      if (capture) {
        const r = await base44.integrations.Core.UploadFile({ file: capture });
        capture_url = r?.file_url || null;
      }
      return base44.entities.Suggestion.create({
        contenu: texte.trim(),
        capture_url,
        statut: "nouveau",
        client_email: user.email,
        client_name: user.full_name || user.email,
      });
    },
    onSuccess: () => {
      setTexte(""); retirerCapture();
      queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      toast.success("Merci, c'est noté");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  if (!user) return null;
  // Un admin, même en vue mandataire ou client, voit les remarques de tout le monde (30 oct. 2026, Jules : « une
  // collègue a envoyé des feedbacks aujourd'hui, je ne les vois plus »).
  if (user.role === "admin") return <AdminSuggestions />;

  return (
    <div className="min-h-screen bg-fond text-encre px-5 md:px-10 py-8 md:py-12">
      <div className="max-w-[1100px] mx-auto">
        <h1 className="m-0 mb-8 max-md:mb-5 text-[34px] max-md:text-[24px] font-light tracking-[-0.02em] leading-[1.05]">Feedback</h1>

        <BordureEcoute actif={ecoute} radius="20px">
        <BoiteSaisie
          conteneur={{
            onPaste: (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); choisirCapture(f); } },
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => { e.preventDefault(); choisirCapture(e.dataTransfer?.files?.[0]); },
          }}
          valeur={texte}
          onChange={setTexte}
          rows={2}
          maxLignes={5}
          placeholder="Une remarque, un bug, une idée… Collez une capture d'écran directement ici."
          onEnvoyer={() => envoyer.mutate()}
          peutEnvoyer={!!texte.trim() || !!capture}
          enCours={envoyer.isPending}
          libelle="Envoyer"
          sous={apercu && (
            <div className="relative inline-block mb-3">
              <img src={apercu} alt="Capture" className="max-h-[160px] rounded-lg border border-bord" />
              <button onClick={retirerCapture} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface border border-bord-doux text-ardoise hover:text-encre flex items-center justify-center" aria-label="Retirer la capture"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          gauche={
            <>
              <input ref={fichierRef} type="file" accept="image/*" className="hidden" onChange={(e) => { choisirCapture(e.target.files?.[0]); e.target.value = ""; }} />
              <BoutonBarre onClick={() => fichierRef.current?.click()} actif={!!capture} title="Joindre une capture d'écran"><ImageIcon className="w-4 h-4" /></BoutonBarre>
              <BoutonBarre onClick={() => (dicteeOk ? (ecoute ? arreter() : demarrer()) : toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." }))} alerte={ecoute} title={ecoute ? "Arrêter la dictée" : "Dicter votre remarque"}>{ecoute ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</BoutonBarre>
              <span className="text-[11px] text-brume ml-1 max-md:hidden">{ecoute ? "Je vous écoute…" : "Ctrl+V colle une capture"}</span>
            </>
          }
        />
        </BordureEcoute>

        <h2 className="m-0 mt-10 pb-3 border-b border-trait text-[13.5px] font-semibold text-encre">
          Mes remarques<span className="ml-1.5 text-brume font-normal tabular-nums">{remarques.length}</span>
        </h2>

        {isLoading ? (
          <p className="m-0 py-8 text-[12.5px] text-ardoise inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</p>
        ) : remarques.length === 0 ? (
          <p className="m-0 py-8 text-[13.5px] text-brume">Rien ici pour l'instant.</p>
        ) : (
          <div>
            {remarques.map((r) => {
              const statut = STATUTS[r.statut] || STATUTS.nouveau;
              return (
                <div key={r.id} className="flex gap-5 py-5 border-b border-relief max-md:flex-wrap max-md:gap-3">
                  {r.capture_url && (
                    <button onClick={() => setZoom(r.capture_url)} className="flex-none w-[120px] h-[80px] rounded-lg border border-bord overflow-hidden bg-fond max-md:w-[88px] max-md:h-[60px]" aria-label="Agrandir" title="Agrandir">
                      <img src={r.capture_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[15px] leading-[1.65] text-encre whitespace-pre-wrap break-words">{r.contenu}</p>
                    {r.created_date && <p className="m-0 mt-1.5 text-[12.5px] text-brume">{quand(r.created_date)}</p>}
                  </div>
                  <span className={`flex-none self-start px-2.5 py-1 rounded-full text-[11px] font-medium ${statut.classe}`}>{statut.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {zoom && (
          <div onClick={() => setZoom(null)} className="animate-in fade-in duration-200 fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-8 cursor-zoom-out max-md:p-3">
            <img src={zoom} alt="Capture" className="max-w-full max-h-full rounded-lg border border-bord" />
          </div>
        )}
      </div>
    </div>
  );
}
