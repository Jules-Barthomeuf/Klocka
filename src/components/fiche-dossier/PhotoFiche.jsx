import React, { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La photo d'une fiche, agent ou client (22 nov. 2026, Jules : « chaque agent doit avoir une image, on peut l'importer ou
// ça la met automatiquement ; tous les clients doivent avoir une image qu'on importe »). Un clic sur la tête choisit une
// photo ; sans photo, les initiales (ou le visage dessiné d'un client) et un appareil photo au survol. Le serveur :
// server/photos-fiches.js.

const CLES = [["photos-fiches"], ["meilleurs-agents"], ["fiche-dossier"]];
const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";

/** Toutes les photos posées, par clé de fiche : les listes les lisent d'un coup. */
export function usePhotosFiches({ enabled = true } = {}) {
  return useQuery({ queryKey: ["photos-fiches"], queryFn: () => base44.request("GET", "/api/fiche-dossier/photos"), staleTime: 60_000, retry: false, enabled });
}

/**
 * @param {{ cle: string, nom?: string, photo?: string|null, taille?: number, recadrer?: boolean, defaut?: string|null, modifiable?: boolean, className?: string }} p
 *   recadrer : une photo prise sur une page équipe (souvent en pied) est resserrée sur le visage ; une photo importée non.
 *   defaut : l'image à montrer sans photo (le visage dessiné d'un client), à la place des initiales.
 */
export default function PhotoFiche({ cle, nom = "", photo = null, taille = 40, recadrer = false, defaut = null, modifiable = true, className = "" }) {
  const queryClient = useQueryClient();
  const fichier = useRef(null);
  const poser = useMutation({
    mutationFn: (f) => {
      const form = new FormData();
      form.append("cle", cle);
      form.append("fichier", f);
      return base44.request("POST", "/api/fiche-dossier/photo", { body: form, isForm: true });
    },
    onSuccess: () => { for (const k of CLES) queryClient.invalidateQueries({ queryKey: k }); toast.success("Photo posée."); },
    onError: (e) => toast.error(e?.message || "La photo n'a pas été posée."),
  });
  const peut = modifiable && /^(agent|client|twenty):/.test(String(cle || ""));
  const rond = { width: taille, height: taille };
  const image = photo
    ? <img src={photo} alt="" className={`h-full w-full object-cover ${recadrer ? "origin-[50%_24%] scale-[1.9] object-[50%_24%]" : ""}`} referrerPolicy="no-referrer" />
    : defaut ? <img src={defaut} alt="" className="h-full w-full object-cover" />
      : <span style={{ fontSize: Math.max(11, Math.round(taille * 0.3)) }} className="tracking-[.02em] text-craie">{initiales(nom)}</span>;
  if (!peut) return <span aria-hidden className={`grid flex-none place-items-center overflow-hidden rounded-full border border-bord-doux bg-relief ${className}`} style={rond}>{image}</span>;
  return (
    <>
      <input ref={fichier} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) poser.mutate(f); e.target.value = ""; }} />
      <button type="button" onClick={(e) => { e.stopPropagation(); fichier.current?.click(); }} disabled={poser.isPending}
        aria-label={photo ? `Changer la photo de ${nom}` : `Ajouter une photo pour ${nom}`} title={photo ? "Changer la photo" : "Ajouter une photo"}
        className={`group relative grid flex-none place-items-center overflow-hidden rounded-full border border-bord-doux bg-relief ${className}`} style={rond}>
        {image}
        <span aria-hidden className={`absolute inset-0 grid place-items-center bg-fond/60 transition-opacity ${poser.isPending ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
          {poser.isPending ? <Loader2 className="h-4 w-4 animate-spin text-encre" /> : <Camera className="text-encre" style={{ width: Math.max(12, taille * 0.32), height: Math.max(12, taille * 0.32) }} />}
        </span>
      </button>
    </>
  );
}
