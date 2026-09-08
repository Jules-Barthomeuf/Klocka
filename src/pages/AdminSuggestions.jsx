import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Image as ImageIcon, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import BoiteSaisie, { BoutonBarre } from "@/components/BoiteSaisie";

// Le feedback : un chat, une capture d'écran si on veut, rien d'autre. Chaque
// remarque a un état qu'on change d'un clic : à faire, en cours, fait, refusé.

const STATUTS = [
  { id: "nouveau", label: "À faire", fond: "#2c3139" },
  { id: "en_cours", label: "En cours", fond: "#a8752a" },
  { id: "termine", label: "Fait", fond: "#2f7a5a" },
  { id: "refuse", label: "Refusé", fond: "#9b3b32" },
];
// Les anciens états « accepté » se lisent comme « en cours ».
const normaliser = (s) => (STATUTS.some((x) => x.id === s) ? s : s === "accepte" ? "en_cours" : "nouveau");

const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function AdminSuggestions() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [texte, setTexte] = useState("");
  const [capture, setCapture] = useState(null); // File
  const [apercu, setApercu] = useState(null); // URL locale
  const [filtre, setFiltre] = useState("tous");
  const [zoom, setZoom] = useState(null);
  const fichierRef = useRef(null);

  const { data: remarques = [], isLoading } = useQuery({
    queryKey: ["all-suggestions"],
    queryFn: () => base44.entities.Suggestion.list("-created_date"),
    initialData: [],
  });
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["all-suggestions"] });

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
        client_email: user?.email || "admin@klocka.fr",
        client_name: user?.full_name || user?.email || "Admin Klocka",
      });
    },
    onSuccess: () => { setTexte(""); retirerCapture(); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const changerStatut = useMutation({
    mutationFn: ({ id, statut }) => base44.entities.Suggestion.update(id, { statut }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Changement impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.entities.Suggestion.delete(id),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const compte = (id) => remarques.filter((r) => normaliser(r.statut) === id).length;
  const visibles = remarques.filter((r) => filtre === "tous" || normaliser(r.statut) === filtre);

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] px-5 md:px-10 py-8 md:py-12">
      <div className="max-w-[1100px] mx-auto">
        <h1 className="m-0 mb-8 text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05]">Feedback</h1>

        <BoiteSaisie
          conteneur={{
            onPaste: (e) => { const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); choisirCapture(f); } },
            onDragOver: (e) => e.preventDefault(),
            onDrop: (e) => { e.preventDefault(); choisirCapture(e.dataTransfer?.files?.[0]); },
          }}
          valeur={texte}
          onChange={setTexte}
          placeholder="Une remarque, un bug, une idée… Collez une capture d'écran directement ici."
          onEnvoyer={() => envoyer.mutate()}
          peutEnvoyer={!!texte.trim() || !!capture}
          enCours={envoyer.isPending}
          libelle="Envoyer"
          sous={apercu ? (
            <div className="relative inline-block mb-3">
              <img src={apercu} alt="Capture" className="max-h-[160px] rounded-lg border border-[#22262d]" />
              <button onClick={retirerCapture} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#0a0a0b] border border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5] flex items-center justify-center" aria-label="Retirer la capture"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : null}
          gauche={
            <>
              <input ref={fichierRef} type="file" accept="image/*" className="hidden" onChange={(e) => { choisirCapture(e.target.files?.[0]); e.target.value = ""; }} />
              <BoutonBarre onClick={() => fichierRef.current?.click()} actif={!!capture} title="Joindre une capture d'écran"><ImageIcon className="w-4 h-4" /></BoutonBarre>
              <span className="text-[11.5px] text-[#4d545d] ml-1 max-md:hidden">Ctrl+V colle une capture</span>
            </>
          }
        />

        {/* Filtres par état */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-10 mb-4 border-b border-[#1f2228]">
          {[{ id: "tous", label: "Tout" }, ...STATUTS].map((s) => (
            <button key={s.id} onClick={() => setFiltre(s.id)} className={`relative pb-3 text-[14px] transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#f2f3f5] after:origin-left after:scale-x-0 after:transition-transform after:duration-300 ${filtre === s.id ? "text-[#f2f3f5] font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3]"}`}>
              {s.label}<span className="ml-1.5 text-[#6a7180] font-normal tabular-nums">{s.id === "tous" ? remarques.length : compte(s.id)}</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="m-0 py-8 text-[13px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</p>
        ) : visibles.length === 0 ? (
          <p className="m-0 py-8 text-[13.5px] text-[#6a7180]">Rien ici pour l'instant.</p>
        ) : (
          <div>
            {visibles.map((r) => {
              const statut = normaliser(r.statut);
              return (
                <div key={r.id} className="flex gap-5 py-5 border-b border-[#15171b] group">
                  {r.capture_url && (
                    <button onClick={() => setZoom(r.capture_url)} className="flex-none w-[120px] h-[80px] rounded-lg border border-[#22262d] overflow-hidden bg-[#0a0a0b]" title="Agrandir">
                      <img src={r.capture_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[14.5px] leading-[1.65] text-[#f2f3f5] whitespace-pre-wrap">{r.contenu}</p>
                    <p className="m-0 mt-1.5 text-[12px] text-[#6a7180]">{r.client_name || r.client_email}{r.created_date ? ` · ${quand(r.created_date)}` : ""}</p>
                  </div>
                  <div className="flex-none flex items-start gap-1.5">
                    {STATUTS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => statut !== s.id && changerStatut.mutate({ id: r.id, statut: s.id })}
                        className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors ${statut === s.id ? "text-white" : "text-[#6a7180] hover:text-[#c9cdd6] border border-[#22262d]"}`}
                        style={statut === s.id ? { background: s.fond } : undefined}
                      >
                        {s.label}
                      </button>
                    ))}
                    <button onClick={() => window.confirm("Supprimer cette remarque ?") && supprimer.mutate(r.id)} className="ml-2 text-[#3f4644] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {zoom && (
          <div onClick={() => setZoom(null)} className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-8 cursor-zoom-out">
            <img src={zoom} alt="Capture" className="max-w-full max-h-full rounded-lg border border-[#22262d]" />
          </div>
        )}
      </div>
    </div>
  );
}
