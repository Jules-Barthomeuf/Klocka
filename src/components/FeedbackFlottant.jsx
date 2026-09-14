import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";
import { Image as ImageIcon, MessageSquarePlus, Mic, Square, X } from "lucide-react";
import { useDictee } from "@/lib/dictee";
import { toast } from "@/components/ui/avis";
import BoiteSaisie, { BoutonBarre } from "@/components/BoiteSaisie";
import { J } from "@/design/jetons";

// Le signalement, sans quitter la page : une icône en haut à droite, un
// panneau qui s'ouvre dessous, la remarque part de là. Les dernières remarques
// s'affichent au-dessus avec leur état, pour voir ce qu'on a déjà dit.
//
// Même entité que la page Feedback : une remarque écrite ici s'y retrouve.

const URGENCES = [
  { n: 1, mot: "Quand vous pouvez", teinte: J["brume"] },
  { n: 2, mot: "Peu pressé", teinte: J["brume"] },
  { n: 3, mot: "Normal", teinte: J["menthe"] },
  { n: 4, mot: "Pressé", teinte: J["ambre"] },
  { n: 5, mot: "Urgent", teinte: J["alerte"] },
];
const urgenceDe = (n) => URGENCES[Math.min(5, Math.max(1, Number(n) || 3)) - 1];

const ETATS = {
  nouveau: { mot: "À faire", fond: J["bord-doux"] },
  en_cours: { mot: "En cours", fond: "#a8752a" },
  accepte: { mot: "En cours", fond: "#a8752a" },
  termine: { mot: "Fait", fond: "#2f7a5a" },
  refuse: { mot: "Refusé", fond: "#9b3b32" },
};
const etatDe = (s) => ETATS[s] || ETATS.nouveau;

export default function FeedbackFlottant() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState("");
  const [capture, setCapture] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [urgence, setUrgence] = useState(3);
  const fichierRef = useRef(null);
  const panneauRef = useRef(null);
  const { supporte: dicteeOk, ecoute, demarrer, arreter } = useDictee({ onTexte: (t) => setTexte(t) });

  // Les dernières remarques : de quoi se rappeler ce qu'on a déjà signalé.
  // Chargées seulement quand le panneau s'ouvre.
  const { data: remarques = [] } = useQuery({
    queryKey: ["feedback-flottant"],
    queryFn: () => base44.entities.Suggestion.list("-created_date"),
    enabled: ouvert,
    staleTime: 60 * 1000,
    initialData: [],
  });

  // Échap referme, un clic dehors aussi : le panneau ne retient personne.
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e) => { if (e.key === "Escape") setOuvert(false); };
    const dehors = (e) => { if (panneauRef.current && !panneauRef.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("keydown", touche);
    document.addEventListener("mousedown", dehors);
    return () => { document.removeEventListener("keydown", touche); document.removeEventListener("mousedown", dehors); };
  }, [ouvert]);

  const choisirCapture = (f) => {
    if (!f || !f.type?.startsWith("image/")) return;
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
        urgence,
        statut: "nouveau",
        // La page d'où part la remarque : sans elle, « ça ne marche pas » ne
        // dit pas où. L'adresse suffit à retrouver l'écran.
        page: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
        client_email: user?.email || "admin@klocka.fr",
        client_name: user?.full_name || user?.email || "Admin Klocka",
      });
    },
    onSuccess: () => {
      setTexte("");
      retirerCapture();
      setUrgence(3);
      queryClient.invalidateQueries({ queryKey: ["feedback-flottant"] });
      queryClient.invalidateQueries({ queryKey: ["all-suggestions"] });
      toast.success("Remarque envoyée");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  const dernieres = remarques.slice(0, 4);

  return (
    <div ref={panneauRef} className="fixed top-3 right-4 max-md:top-2.5 max-md:right-16 z-[60]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        title="Signaler quelque chose"
        aria-label="Signaler quelque chose"
        aria-expanded={ouvert}
        // Même taille que la pilule de l'assistant, en bas à droite : 48 px.
        className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors ${
          ouvert
            ? "bg-menthe border-menthe text-fond"
            : "bg-[#0a0a0bcc] backdrop-blur-md border-menthe/30 text-ardoise hover:text-encre hover:border-menthe/60"
        }`}
      >
        {ouvert ? <X className="w-[18px] h-[18px]" /> : <MessageSquarePlus className="w-[18px] h-[18px]" />}
      </button>

      {ouvert && (
        <div className="absolute right-0 top-[58px] w-[420px] max-md:w-[calc(100vw-2rem)] max-md:right-[-3rem] rounded-[18px] border border-bord bg-[#0a0a0bf5] backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,.6)] p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <p className="m-0 text-[15px] font-medium text-encre">Signaler quelque chose</p>
            <Link to={createPageUrl("AdminSuggestions")} onClick={() => setOuvert(false)} className="text-[12px] text-brume hover:text-craie">
              Tout voir
            </Link>
          </div>

          {dernieres.length > 0 && (
            <div className="mb-3 space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
              {dernieres.map((r) => (
                <div key={r.id} className="flex items-start gap-2.5 rounded-lg border border-trait px-3 py-2">
                  <span className="mt-[3px] w-1.5 h-1.5 rounded-full flex-none" style={{ background: urgenceDe(r.urgence).teinte }} />
                  <p className="m-0 flex-1 min-w-0 text-[12.5px] leading-[1.5] text-craie line-clamp-2">{r.contenu}</p>
                  <span className="flex-none text-[10.5px] px-2 py-0.5 rounded-full text-white/90" style={{ background: etatDe(r.statut).fond }}>
                    {etatDe(r.statut).mot}
                  </span>
                </div>
              ))}
            </div>
          )}

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
            placeholder="Une remarque, un bug, une idée… Ctrl+V colle une capture."
            onEnvoyer={() => envoyer.mutate()}
            peutEnvoyer={!!texte.trim() || !!capture}
            enCours={envoyer.isPending}
            libelle="Envoyer"
            compact
            sous={
              <>
                {apercu && (
                  <div className="relative inline-block mb-2.5">
                    <img src={apercu} alt="Capture" className="max-h-[120px] rounded-lg border border-bord" />
                    <button onClick={retirerCapture} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-fond border border-bord-doux text-ardoise hover:text-encre flex items-center justify-center" aria-label="Retirer la capture">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2.5 mb-2">
                  <span className="text-[10.5px] tracking-[.14em] uppercase text-brume">Urgence</span>
                  <span className="inline-flex items-end gap-1" role="group" aria-label="Urgence">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setUrgence(n)}
                        aria-pressed={urgence === n}
                        title={URGENCES[n - 1].mot}
                        className="w-3 rounded-[2px] transition-all"
                        style={{ height: 7 + n * 2.5, background: n <= urgence ? urgenceDe(urgence).teinte : J["bord"] }}
                      />
                    ))}
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: urgenceDe(urgence).teinte }}>{urgenceDe(urgence).mot}</span>
                </div>
              </>
            }
            gauche={
              <>
                <input ref={fichierRef} type="file" accept="image/*" className="hidden" onChange={(e) => { choisirCapture(e.target.files?.[0]); e.target.value = ""; }} />
                <BoutonBarre onClick={() => fichierRef.current?.click()} actif={!!capture} title="Joindre une capture d'écran"><ImageIcon className="w-4 h-4" /></BoutonBarre>
                <BoutonBarre
                  onClick={() => (dicteeOk ? (ecoute ? arreter() : demarrer()) : toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." }))}
                  alerte={ecoute}
                  title={ecoute ? "Arrêter la dictée" : "Dicter votre remarque"}
                >
                  {ecoute ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </BoutonBarre>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
