import React from "react";
import { MapPin } from "lucide-react";

// Un projet sans photo montre sa rue plutôt qu'un cadre vide : la carte Google
// (API Embed, même clé que la page projet), sans interaction pour que le clic
// ouvre toujours le projet.

const CLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function CarteDuProjet({ project }) {
  const lieu = project.adresse_complete
    || (project.latitude && project.longitude ? `${project.latitude},${project.longitude}` : "");
  if (!CLE || !lieu) {
    return (
      <div className="w-full h-full bg-fond flex items-center justify-center">
        <MapPin className="w-10 h-10 text-encre/[0.06]" />
      </div>
    );
  }
  return (
    <iframe
      title={`Carte : ${project.titre || lieu}`}
      src={`https://www.google.com/maps/embed/v1/place?key=${CLE}&q=${encodeURIComponent(lieu)}&zoom=16`}
      className="w-full h-full pointer-events-none"
      style={{ border: 0 }}
      loading="lazy"
      tabIndex={-1}
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
