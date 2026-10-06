import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { adresseAChercher } from "@/lib/adresse-projet";
import { geolocaliser } from "./PlongeeCarte";

// Street View plein hero : on se déplace dans la rue depuis la fiche projet.
// Embed API Google (gratuite, même clé que la carte embarquée) — le panorama
// est interactif : glisser pour regarder autour, flèches pour avancer.
//
// La vue part du même texte que la carte de la page, résolu par le même moteur
// (la recherche de lieux de Google, côté serveur) : la carte et Street View
// montrent le même endroit. Le serveur choisit le panorama Google de la rue
// et le cap vers le local. Sans lui (page publique, adresse introuvable), on
// retombe sur la géolocalisation de la plongée.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const embed = (params) => `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&${params}&fov=90`;

export default function StreetViewRue({ project }) {
  const adresse = adresseAChercher(project);
  const { data: vue, isFetched: vueLue } = useQuery({
    queryKey: ["panorama-adresse", adresse],
    queryFn: () => base44.request("GET", `/api/streetview/panorama?adresse=${encodeURIComponent(adresse)}`),
    enabled: !!adresse,
    staleTime: Infinity,
    retry: false,
  });
  const serveur = vue?.panorama?.pano || vue?.point;
  // Le repli : seulement si le serveur n'a rien trouvé.
  const { data: cible, isFetched: cibleLue } = useQuery({
    queryKey: ["geoloc-projet", project.id, project.adresse_complete], // même cache que la plongée
    queryFn: () => geolocaliser(project),
    enabled: !adresse || (vueLue && !serveur),
    staleTime: Infinity,
  });

  const enAttente = (adresse && !vueLue) || (!serveur && !cibleLue);
  if (enAttente) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-menthe/30 border-t-menthe rounded-full animate-spin" />
      </div>
    );
  }

  const pano = vue?.panorama;
  const point = vue?.point || cible;
  if (!pano?.pano && !point) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <p className="text-ardoise text-sm">Adresse non localisable — Street View indisponible.</p>
      </div>
    );
  }

  const src = pano?.pano
    ? embed(`pano=${encodeURIComponent(pano.pano)}&heading=${pano.cap ?? 0}&pitch=0`)
    : embed(`location=${point.lat},${point.lon}`);

  return (
    <iframe
      key={src}
      src={src}
      title="Street View du secteur"
      className="absolute inset-0 w-full h-full border-0"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
