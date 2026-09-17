import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import PenseeIA from "@/components/PenseeIA";

// La remarque part du menu, sans rien ouvrir.
//
// La souris passe sur « Feedback » : un panneau s'ouvre à côté, on écrit, on
// envoie. Le clic, lui, ouvre la page entière comme avant. C'est la même
// entité que la page Feedback : ce qui est écrit ici s'y retrouve, et Jules
// change les états à la main.

export default function FeedbackSurvol({ children }) {
  const user = useUser();
  const qc = useQueryClient();
  const ancre = useRef(null);
  const fermeture = useRef(null);
  const [place, setPlace] = useState(null);
  const [texte, setTexte] = useState("");

  const ouvrir = () => {
    clearTimeout(fermeture.current);
    const r = ancre.current?.getBoundingClientRect();
    // Posé sur l'écran, pas dans la barre : la barre défile et découpe.
    if (r) setPlace({ top: Math.min(r.top, window.innerHeight - 260), left: r.right + 10 });
  };
  // Un délai de grâce : le trajet de la souris entre le menu et le panneau
  // passe par le vide, et sans lui le panneau se referme en chemin.
  const fermer = () => { fermeture.current = setTimeout(() => { setPlace(null); setTexte(""); }, 260); };

  const envoyer = useMutation({
    mutationFn: () => base44.entities.Suggestion.create({
      contenu: texte.trim(),
      urgence: 3,
      statut: "nouveau",
      page: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      client_email: user?.email || "admin@klocka.fr",
      client_name: user?.full_name || user?.email || "Admin Klocka",
    }),
    onSuccess: () => {
      setTexte("");
      setPlace(null);
      qc.invalidateQueries({ queryKey: ["all-suggestions"] });
      toast.success("Remarque envoyée");
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });

  return (
    <div ref={ancre} onMouseEnter={ouvrir} onMouseLeave={fermer}>
      {children}
      {place && (
        <div
          onMouseEnter={ouvrir}
          onMouseLeave={fermer}
          className="fixed z-[70] w-[330px] rounded-[16px] border border-bord bg-[#0a0a0bf5] p-3.5 shadow-[0_24px_60px_rgba(0,0,0,.6)] backdrop-blur-xl animate-in fade-in slide-in-from-left-2 duration-150"
          style={{ top: place.top, left: place.left }}
        >
          <p className="m-0 mb-2 text-[12.5px] text-ardoise">Une remarque, un bug, une idée.</p>
          <textarea
            autoFocus
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setPlace(null); setTexte(""); }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && texte.trim()) envoyer.mutate();
            }}
            rows={3}
            placeholder="Ce que vous voulez dire…"
            className="w-full resize-none rounded-[10px] border border-bord bg-surface px-3 py-2.5 text-[13.5px] text-encre outline-none transition-colors placeholder:text-brume focus:border-menthe"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-brume">Entrée + Cmd pour envoyer</span>
            <button
              type="button"
              onClick={() => envoyer.mutate()}
              disabled={!texte.trim() || envoyer.isPending}
              className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[12.5px] font-medium text-sur-menthe transition-colors hover:bg-menthe-clair disabled:opacity-40"
            >
              {envoyer.isPending ? <PenseeIA etat="working" taille={20} clair /> : "Envoyer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
