import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// La photo du commerce, en tête de sa fiche : celle de sa fiche Google, gardée par le serveur
// (server/photo-commerce.js), et un lien pour l'ouvrir dans Google Maps. Plus de panorama Street View
// intégré (31 oct. 2026, Jules : « juste une image du commerce, pas l'intégration Google Maps, qui coûte cher »).

export default function FacadeLocal({ adresse, ville, lat = null, lon = null, nom = null, placeId = null }) {
  const texte = [adresse, ville].filter(Boolean).join(", ");
  const params = new URLSearchParams({ nom: nom || "", adresse: texte });
  if (placeId) params.set("place_id", placeId);
  if (Number.isFinite(lat) && Number.isFinite(lon)) { params.set("lat", String(lat)); params.set("lon", String(lon)); }
  const { data, isFetched } = useQuery({
    queryKey: ["photo-commerce", params.toString()],
    queryFn: () => base44.request("GET", `/api/commerce/photo?${params}`),
    enabled: !!(placeId || (nom && texte)),
    staleTime: Infinity,
    retry: 1,
  });
  const lien = data?.maps || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([nom, texte].filter(Boolean).join(" "))}`;

  return (
    <div className="flex flex-col gap-2">
      {!isFetched && (placeId || (nom && texte)) ? (
        <div className="grid h-[200px] place-items-center rounded-[14px] border border-trait bg-fond"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
      ) : data?.url ? (
        <img src={data.url} alt={nom ? `Le commerce ${nom}` : "Le commerce"} className="h-[200px] w-full rounded-[14px] border border-trait bg-fond object-cover" loading="lazy" />
      ) : null}
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <a href={lien} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-craie hover:text-encre">
          <ExternalLink className="h-3.5 w-3.5" />Voir sur Google Maps
        </a>
        {data?.url && data.auteur && (
          data.auteur_lien
            ? <a href={data.auteur_lien} target="_blank" rel="noreferrer" className="text-[11.5px] text-brume hover:text-ardoise">Photo : {data.auteur}</a>
            : <span className="text-[11.5px] text-brume">Photo : {data.auteur}</span>
        )}
      </span>
    </div>
  );
}
