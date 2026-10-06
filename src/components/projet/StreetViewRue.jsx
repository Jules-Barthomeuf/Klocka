import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { geolocaliser } from "./PlongeeCarte";

// Street View plein hero : on se déplace dans la rue depuis la fiche projet.
// Embed API Google (gratuite, même clé que la carte embarquée) — le panorama
// est interactif : glisser pour regarder autour, flèches pour avancer.
//
// Sur un simple point, l'Embed se cale sur le panorama le plus proche, parfois
// dans la rue d'à côté. Le serveur choisit donc le panorama Google de la rue de
// l'adresse, et le cap vers le local ; à défaut, on revient au point.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function StreetViewRue({ project }) {
  const { data: cible, isError } = useQuery({
    queryKey: ["geoloc-projet", project.id, project.adresse_complete], // même cache que la plongée
    queryFn: () => geolocaliser(project),
    staleTime: Infinity,
  });
  const { data: vue, isFetched } = useQuery({
    queryKey: ["panorama-projet", cible?.lat, cible?.lon, cible?.rue],
    queryFn: () => base44.request("GET", `/api/streetview/panorama?lat=${cible.lat}&lon=${cible.lon}${cible.rue ? `&rue=${encodeURIComponent(cible.rue)}` : ""}`),
    enabled: !!cible,
    staleTime: Infinity,
    retry: false,
  });

  if ((cible === undefined && !isError) || (cible && !isFetched)) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-menthe/30 border-t-menthe rounded-full animate-spin" />
      </div>
    );
  }
  if (cible === null || isError) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <p className="text-ardoise text-sm">Adresse non localisable — Street View indisponible.</p>
      </div>
    );
  }

  const pano = vue?.panorama;
  const src = pano?.pano
    ? `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&pano=${encodeURIComponent(pano.pano)}&heading=${pano.cap ?? 0}&pitch=0&fov=90`
    : `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&location=${cible.lat},${cible.lon}&fov=90`;

  return (
    <iframe
      src={src}
      title="Street View du secteur"
      className="absolute inset-0 w-full h-full border-0"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
