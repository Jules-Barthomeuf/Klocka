import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { adresseAChercher } from "@/lib/adresse-projet";
import { geolocaliser } from "./PlongeeCarte";

// Street View plein hero : on se déplace dans la rue depuis la fiche projet.
// Embed API Google (gratuite, même clé que la carte embarquée) — le panorama
// est interactif : glisser pour regarder autour, flèches pour avancer.
//
// Le serveur résout le texte de l'adresse (Base Adresse Nationale et recherche
// de lieux de Google, croisées) et choisit le panorama Google de la rue, tourné
// vers le local. Les coordonnées enregistrées sur le dossier ne servent qu'à
// orienter cette recherche : elles sont souvent le centre de la commune, et
// Street View s'y ouvrait à des kilomètres de l'adresse. Une adresse écrite
// qu'on ne retrouve pas donne un message, jamais un autre endroit. Sans
// adresse du tout, on retombe sur la géolocalisation de la plongée.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const embed = (params) => `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&${params}&fov=90`;

export default function StreetViewRue({ project }) {
  const adresse = adresseAChercher(project);
  const pres = project.latitude && project.longitude ? `&lat=${Number(project.latitude)}&lon=${Number(project.longitude)}` : "";
  const { data: vue, isFetched: vueLue } = useQuery({
    queryKey: ["panorama-adresse", adresse, pres],
    queryFn: () => base44.request("GET", `/api/streetview/panorama?adresse=${encodeURIComponent(adresse)}${pres}`),
    enabled: !!adresse,
    staleTime: Infinity,
    retry: 1,
  });
  // Sans adresse écrite seulement : la plongée sait au moins où est la commune.
  const { data: cible, isFetched: cibleLue } = useQuery({
    queryKey: ["geoloc-projet", project.id, project.adresse_complete], // même cache que la plongée
    queryFn: () => geolocaliser(project),
    enabled: !adresse,
    staleTime: Infinity,
  });

  if ((adresse && !vueLue) || (!adresse && !cibleLue)) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-menthe/30 border-t-menthe rounded-full animate-spin" />
      </div>
    );
  }

  const pano = vue?.panorama;
  const point = adresse ? vue?.point : cible;
  if (!pano?.pano && !point) {
    return (
      <div className="absolute inset-0 bg-fond flex items-center justify-center px-6 text-center">
        <p className="text-ardoise text-sm">
          {adresse ? `Adresse introuvable sur la carte (« ${adresse} ») — Street View indisponible. Vérifiez la rue et la ville du projet.` : "Adresse non renseignée — Street View indisponible."}
        </p>
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
