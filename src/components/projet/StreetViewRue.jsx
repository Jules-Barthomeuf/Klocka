import React from "react";
import { useQuery } from "@tanstack/react-query";
import { geolocaliser } from "./PlongeeCarte";

// Street View plein hero : on se déplace dans la rue depuis la fiche projet.
// Embed API Google (gratuite, même clé que la carte embarquée) — le panorama
// est interactif : glisser pour regarder autour, flèches pour avancer.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function StreetViewRue({ project }) {
  const { data: cible, isError } = useQuery({
    queryKey: ["geoloc-projet", project.id], // même cache que la plongée 3D
    queryFn: () => geolocaliser(project),
    staleTime: Infinity,
  });

  if (cible === undefined && !isError) {
    return (
      <div className="absolute inset-0 bg-[#000000] flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-[#96c0b8]/30 border-t-[#96c0b8] rounded-full animate-spin" />
      </div>
    );
  }
  if (cible === null || isError) {
    return (
      <div className="absolute inset-0 bg-[#000000] flex items-center justify-center">
        <p className="text-[#9298a6] text-sm">Adresse non localisable — Street View indisponible.</p>
      </div>
    );
  }

  const src =
    `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}` +
    `&location=${cible.lat},${cible.lon}&fov=90`;

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
