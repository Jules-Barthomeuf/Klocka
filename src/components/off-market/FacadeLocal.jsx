import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// La façade d'un local, en tête de sa fiche (10 oct. 2026) : on voit d'abord
// la vitrine, puis le reste. Le panorama est choisi par le serveur dans la rue
// de l'adresse et tourné vers le local, comme sur la page projet ; une adresse
// introuvable le dit, sans montrer un autre endroit.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function FacadeLocal({ adresse, ville, lat = null, lon = null, nom = null }) {
  const texte = [adresse, ville].filter(Boolean).join(", ");
  const pres = Number.isFinite(lat) && Number.isFinite(lon) ? `&lat=${lat}&lon=${lon}` : "";
  const { data, isFetched } = useQuery({
    queryKey: ["panorama-adresse", texte, pres],
    queryFn: () => base44.request("GET", `/api/streetview/panorama?adresse=${encodeURIComponent(texte)}${pres}`),
    enabled: !!texte,
    staleTime: Infinity,
    retry: 1,
  });
  const pano = data?.panorama;
  const point = data?.point || (pres ? { lat, lon } : null);
  const src = !MAPS_KEY ? null
    : pano?.pano ? `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&pano=${encodeURIComponent(pano.pano)}&heading=${pano.cap ?? 0}&pitch=0&fov=90`
    : point ? `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&location=${point.lat},${point.lon}&fov=90`
    : null;
  // Google Maps s'ouvre sur le même panorama quand on l'a, sinon sur l'adresse.
  const lien = pano?.pano
    ? `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(pano.pano)}&heading=${pano.cap ?? 0}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([nom, texte].filter(Boolean).join(" "))}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[240px] overflow-hidden rounded-[14px] border border-trait bg-fond max-md:h-[200px]">
        {texte && !isFetched ? (
          <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        ) : src ? (
          <iframe key={src} src={src} title={`Façade · ${texte}`} className="absolute inset-0 h-full w-full border-0" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        ) : (
          <p className="m-0 grid h-full place-items-center px-6 text-center text-[13px] text-brume">
            {!MAPS_KEY ? "Clé Google Maps absente : la façade ne s'affiche pas." : texte ? `Façade introuvable pour « ${texte} ».` : "Adresse inconnue."}
          </p>
        )}
      </div>
      <a href={lien} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-craie hover:text-encre">
        <ExternalLink className="h-3.5 w-3.5" />Voir dans Google Maps
      </a>
    </div>
  );
}
