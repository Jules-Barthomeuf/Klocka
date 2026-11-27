import React, { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La photo d'une fiche, agent ou client (22 nov. 2026, Jules : « chaque agent doit avoir une image, on peut l'importer ou
// ça la met automatiquement ; tous les clients doivent avoir une image qu'on importe »). Un clic sur la tête choisit une
// photo ; sans photo, les initiales (ou le visage dessiné d'un client) et un appareil photo au survol. Le serveur :
// server/photos-fiches.js.

const CLES = [["photos-fiches"], ["photos-fiche"], ["meilleurs-agents"], ["fiche-dossier"]];
const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";

/** Toutes les photos posées, par clé de fiche : les listes les lisent d'un coup. */
export function usePhotosFiches({ enabled = true } = {}) {
  return useQuery({ queryKey: ["photos-fiches"], queryFn: () => base44.request("GET", "/api/fiche-dossier/photos"), staleTime: 60_000, retry: false, enabled });
}

/** Pose une photo sur la fiche : `id` en remplace une, `ajouter` en met une de plus. */
function useDeposer(cle) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fichier, id = null, ajouter = false }) => {
      const form = new FormData();
      form.append("cle", cle);
      if (id) form.append("id", id);
      if (ajouter) form.append("ajouter", "1");
      form.append("fichier", fichier);
      return base44.request("POST", "/api/fiche-dossier/photo", { body: form, isForm: true });
    },
    onSuccess: () => { for (const k of CLES) queryClient.invalidateQueries({ queryKey: k }); toast.success("Photo posée."); },
    onError: (e) => toast.error(e?.message || "La photo n'a pas été posée."),
  });
}

const peutPoser = (cle) => /^(agent|client|twenty):/.test(String(cle || ""));

/**
 * @param {{ cle: string, nom?: string, photo?: string|null, idPhoto?: string|null, taille?: number, recadrer?: boolean, defaut?: string|null, modifiable?: boolean, className?: string }} p
 *   recadrer : une photo prise sur une page équipe (souvent en pied) est resserrée sur le visage ; une photo importée non.
 *   defaut : l'image à montrer sans photo (le visage dessiné d'un client), à la place des initiales.
 *   idPhoto : la photo remplacée au clic, quand la fiche en a plusieurs.
 */
export default function PhotoFiche({ cle, nom = "", photo = null, idPhoto = null, taille = 40, recadrer = false, defaut = null, modifiable = true, className = "" }) {
  const fichier = useRef(null);
  const poser = useDeposer(cle);
  const peut = modifiable && peutPoser(cle);
  const rond = { width: taille, height: taille };
  const image = photo
    ? <img src={photo} alt="" className={`h-full w-full object-cover ${recadrer ? "origin-[50%_24%] scale-[1.9] object-[50%_24%]" : ""}`} referrerPolicy="no-referrer" />
    : defaut ? <img src={defaut} alt="" className="h-full w-full object-cover" />
      : <span style={{ fontSize: Math.max(11, Math.round(taille * 0.3)) }} className="tracking-[.02em] text-craie">{initiales(nom)}</span>;
  if (!peut) return <span aria-hidden className={`grid flex-none place-items-center overflow-hidden rounded-full border border-bord-doux bg-relief ${className}`} style={rond}>{image}</span>;
  return (
    <>
      <input ref={fichier} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onClick={(e) => e.stopPropagation()}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) poser.mutate({ fichier: f, id: idPhoto }); e.target.value = ""; }} />
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

/**
 * Les photos d'une fiche, une par personne (23 nov. 2026, Jules : « il y en a qui investissent à plusieurs ») : elles se
 * chevauchent un peu, comme les têtes des agences de la Prospection. Un clic sur l'une la change, la croix au survol la
 * retire, « + » ajoute une personne. Sans photo, une seule tête (initiales ou visage dessiné) : un clic en pose une.
 * `photo` : celle que la fiche montrait jusqu'ici (celle d'un agent trouvée par la Prospection), quand la fiche n'en a
 * pas encore de posée.
 */
export function PhotosFiche({ cle, nom = "", photo = null, taille = 40, defaut = null, recadrer = false, className = "", plusEnBadge = false }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["photos-fiche", cle], queryFn: () => base44.request("GET", `/api/fiche-dossier/photos?cle=${encodeURIComponent(cle)}`), enabled: peutPoser(cle), staleTime: 30_000, retry: false });
  const ajout = useRef(null);
  const poser = useDeposer(cle);
  const retirer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/fiche-dossier/photo/${encodeURIComponent(id)}?cle=${encodeURIComponent(cle)}`),
    onSuccess: () => { for (const k of CLES) queryClient.invalidateQueries({ queryKey: k }); },
    onError: (e) => toast.error(e?.message || "La photo n'a pas été retirée."),
  });
  const photos = data?.photos?.length ? data.photos : photo ? [{ id: null, url: photo, source: recadrer ? "auto" : "importee" }] : [];
  if (!photos.length) return <PhotoFiche cle={cle} nom={nom} taille={taille} defaut={defaut} className={className} />;
  const plus = Math.max(24, Math.round(taille * 0.46));
  return (
    <div className={`flex items-center justify-center ${className}`}>
      {/* Le « + » est posé à droite du groupe, hors du centrage : les têtes restent au-dessus du nom. */}
      <div className="relative flex items-center">
        {photos.map((p, i) => (
          <div key={p.id || i} className="group/photo relative rounded-full ring-2 ring-surface transition-transform hover:z-10" style={{ marginLeft: i ? -Math.round(taille * 0.24) : 0, zIndex: photos.length - i }}>
            <PhotoFiche cle={cle} nom={nom} photo={p.url} idPhoto={p.id} taille={taille} recadrer={p.source !== "importee"} />
            {photos.length > 1 && p.id && (
              <button type="button" onClick={(e) => { e.stopPropagation(); retirer.mutate(p.id); }} disabled={retirer.isPending} aria-label={`Retirer cette photo de ${nom}`} title="Retirer cette photo"
                className="absolute -right-0.5 -top-0.5 z-20 grid h-5 w-5 place-items-center rounded-full border border-bord-doux bg-surface-pleine text-ardoise opacity-0 hover:text-encre focus-visible:opacity-100 group-hover/photo:opacity-100 max-md:opacity-100">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      {photos.length < 6 && (
        <>
          <input ref={ajout} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) poser.mutate({ fichier: f, ajouter: true }); e.target.value = ""; }} />
          <button type="button" onClick={(e) => { e.stopPropagation(); ajout.current?.click(); }} disabled={poser.isPending} aria-label={`Ajouter une personne sur la fiche de ${nom}`} title="Ajouter une personne"
            // La photo à gauche du nom (27 nov. 2026, Jules : « le plus se chevauche avec le titre ») : le « + » se pose sur
            // le bord bas de la dernière tête, sans déborder sur le nom.
            className={plusEnBadge
              ? "absolute bottom-0 right-0 z-20 grid h-7 w-7 place-items-center rounded-full border border-bord-doux bg-surface-pleine text-ardoise shadow-sm hover:border-bord-vif hover:text-encre"
              : "absolute left-full top-1/2 ml-2 grid -translate-y-1/2 place-items-center rounded-full border border-dashed border-bord-doux text-brume hover:border-bord-vif hover:text-encre"}
            style={plusEnBadge ? undefined : { width: plus, height: plus, background: "transparent" }}>
            {poser.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
      </div>
    </div>
  );
}
