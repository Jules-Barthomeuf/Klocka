import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Le lien public du projet, dans la barre de l'éditeur (25 nov. 2026, Jules : « rajoute un truc dans le projet pour qu'on
// puisse créer un lien accessible sans connexion »). Un clic ouvre la petite carte : créer le lien, le copier, le couper.
// Le lien porte une clé (server/lien-public.js) : coupé, il ne rouvre plus rien ; recréé, il a une autre clé.

/** L'adresse que l'on envoie, d'après la clé. */
export const adresseDuLien = (cle) => `${window.location.origin}/ProjetPublic?cle=${encodeURIComponent(cle)}`;

/** Le lien du projet (le lire, le créer à la demande) ; `creer()` rend l'adresse. */
export function useLienPublic(projectId, { actif = true } = {}) {
  const queryClient = useQueryClient();
  const cle = ["lien-public", projectId];
  const q = useQuery({ queryKey: cle, enabled: !!projectId && actif, queryFn: () => base44.request("GET", `/api/projets/${projectId}/lien-public`) });
  const creer = useMutation({
    mutationFn: () => base44.request("POST", `/api/projets/${projectId}/lien-public`),
    onSuccess: (r) => queryClient.setQueryData(cle, r),
  });
  const couper = useMutation({
    mutationFn: () => base44.request("DELETE", `/api/projets/${projectId}/lien-public`),
    onSuccess: (r) => queryClient.setQueryData(cle, r),
  });
  return { lien: q.data?.lien || null, chargement: q.isLoading, creer, couper };
}

/** Copie l'adresse ; sans presse-papiers, la montre pour la copier à la main. */
export async function copierLien(url) {
  try { await navigator.clipboard.writeText(url); toast.success("Lien public copié", { description: "Il s'ouvre sans connexion." }); return true; }
  catch { window.prompt("Copiez le lien public :", url); return false; }
}

export default function LienPublic({ projectId, className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const zone = useRef(null);
  const { lien, chargement, creer, couper } = useLienPublic(projectId, { actif: ouvert });
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (!zone.current?.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("mousedown", fermer); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  const url = lien ? adresseDuLien(lien.cle) : null;
  const copier = async (adresse) => { if (await copierLien(adresse)) { setCopie(true); setTimeout(() => setCopie(false), 2000); } };
  const creerEtCopier = () => creer.mutate(undefined, {
    onSuccess: (r) => { if (r?.lien?.cle) copier(adresseDuLien(r.lien.cle)); },
    onError: (e) => toast.error(e?.message || "Le lien n'a pas été créé."),
  });
  const bouton = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors disabled:opacity-50";

  return (
    <div ref={zone} className={`relative ${className}`}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-label="Lien public" title="Un lien qui s'ouvre sans connexion"
        className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
        <Link2 className="h-4 w-4" />
      </button>
      {ouvert && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[340px] max-w-[calc(100vw-2rem)] rounded-[14px] border border-trait bg-surface-pleine p-4 shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
          <p className="m-0 text-[15px] font-medium text-encre">Lien public</p>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-ardoise">
            {lien ? "Toute personne qui a ce lien voit la page du projet, sans compte." : "Un lien qui ouvre la page du projet sans connexion, à envoyer à qui vous voulez."}
          </p>
          {chargement ? (
            <p className="m-0 mt-4 flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lecture du lien…</p>
          ) : lien ? (
            <>
              <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-trait px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-craie" title={url}>{url}</span>
                <button type="button" onClick={() => copier(url)} aria-label="Copier le lien" title="Copier le lien"
                  className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                  {copie ? <Check className="h-3.5 w-3.5 text-menthe" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-ardoise hover:text-encre">Ouvrir</a>
                <button type="button" disabled={couper.isPending}
                  onClick={() => couper.mutate(undefined, { onSuccess: () => toast.success("Lien coupé", { description: "Il n'ouvre plus rien." }), onError: (e) => toast.error(e?.message || "Le lien n'a pas été coupé.") })}
                  className={`${bouton} text-alerte hover:bg-alerte/10`} style={{ background: "transparent" }}>
                  {couper.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Couper le lien
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={creerEtCopier} disabled={creer.isPending}
              className={`${bouton} mt-4 bg-menthe text-sur-menthe hover:bg-menthe-survol`}>
              {creer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}Créer le lien et le copier
            </button>
          )}
        </div>
      )}
    </div>
  );
}
