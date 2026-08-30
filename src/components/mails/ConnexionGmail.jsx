import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Connexion d'une boîte Gmail sans quitter la page en cours : le parcours
// Google se déroule dans une fenêtre surgissante, qui prévient la page
// appelante puis se referme. Le brouillon de mail en cours de rédaction n'est
// donc jamais perdu.

const CANAL = "klocka-google";

/**
 * @param {(email: string) => void} [onConnecte] - rappel après connexion réussie
 * @returns {{ connecter: () => void, enCours: boolean }}
 */
export function useConnexionGmail(onConnecte) {
  const queryClient = useQueryClient();
  const [enCours, setEnCours] = useState(false);
  const fenetre = useRef(null);
  // Gardé dans une ref : le gestionnaire de message n'est monté qu'une fois.
  const rappel = useRef(onConnecte);
  rappel.current = onConnecte;

  useEffect(() => {
    const surMessage = (e) => {
      if (e.origin !== window.location.origin || e.data?.type !== CANAL) return;
      setEnCours(false);
      if (e.data.ok) {
        queryClient.invalidateQueries({ queryKey: ["mail-status"] });
        toast.success(`${e.data.email} est connectée`);
        rappel.current?.(e.data.email);
      } else {
        toast.error(e.data.error || "Connexion Google impossible");
      }
    };
    window.addEventListener("message", surMessage);
    return () => window.removeEventListener("message", surMessage);
  }, [queryClient]);

  // Filet de sécurité : fenêtre fermée à la main, sans message reçu.
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => {
      if (fenetre.current?.closed) {
        setEnCours(false);
        queryClient.invalidateQueries({ queryKey: ["mail-status"] });
      }
    }, 700);
    return () => clearInterval(t);
  }, [enCours, queryClient]);

  const connecter = useCallback(() => {
    const l = 520;
    const h = 660;
    const x = window.screenX + Math.max(0, (window.outerWidth - l) / 2);
    const y = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    fenetre.current = window.open(
      "/api/mail/google/connect-popup",
      CANAL,
      `width=${l},height=${h},left=${x},top=${y}`
    );
    if (!fenetre.current) {
      toast.error("La fenêtre de connexion a été bloquée : autorisez les fenêtres surgissantes.");
      return;
    }
    fenetre.current.focus?.();
    setEnCours(true);
  }, []);

  return { connecter, enCours };
}

export const LogoGoogle = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
  </svg>
);

/** Bouton « Se connecter avec Google », version fenêtre surgissante. */
export function BoutonConnecterGmail({ onConnecte, libelle = "Connecter Gmail", className = "" }) {
  const { connecter, enCours } = useConnexionGmail(onConnecte);
  return (
    <button
      type="button"
      onClick={connecter}
      disabled={enCours}
      className={`inline-flex items-center gap-2.5 bg-[#f2f3f5] text-[#3c4043] font-medium text-sm rounded-lg pl-3 pr-4 py-2 hover:bg-[#f2f3f5]/10 transition-colors disabled:opacity-60 ${className}`}
    >
      {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogoGoogle />}
      {enCours ? "Connexion en cours…" : libelle}
    </button>
  );
}

/**
 * Encart affiché quand aucune boîte d'envoi n'est connectée : explique et
 * propose la connexion sur place.
 */
export function EncartConnexionGmail({ onConnecte, googleConfigure = true }) {
  if (!googleConfigure) {
    return (
      <div className="rounded-md border border-[#96c0b8]/25 bg-[#96c0b8]/[0.07] px-4 py-3">
        <p className="text-amber-200/90 text-xs leading-relaxed">
          La connexion Google n'est pas configurée : ajoutez <code>GOOGLE_CLIENT_ID</code> et{" "}
          <code>GOOGLE_CLIENT_SECRET</code> dans <code>.env</code>, puis redémarrez. En attendant,
          l'envoi est simulé (le suivi du deal avance quand même).
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-[#1f2228] bg-[#f2f3f5]/[0.02] px-4 py-3 flex flex-wrap items-center gap-3">
      <p className="text-[#9298a6] text-xs flex-1 min-w-48 leading-relaxed">
        Aucune boîte d'envoi connectée. Connectez votre adresse Gmail pour envoyer réellement ce mail —
        votre brouillon est conservé.
      </p>
      <BoutonConnecterGmail onConnecte={onConnecte} />
    </div>
  );
}
