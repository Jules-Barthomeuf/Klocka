import React from "react";
import { ExternalLink, MapPin } from "lucide-react";

// Carte Google Maps embarquée (Embed API). La clé vit dans
// VITE_GOOGLE_MAPS_API_KEY ; sans clé, on propose le lien externe — même
// comportement que l'ancien lien « Voir sur la carte ».

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/**
 * @param adresse  adresse texte (prioritaire)
 * @param lat,lon  coordonnées de repli (ex. centre de la commune)
 * @param zoom     défaut 15 (17 si adresse précise)
 * @param hauteur  classe CSS de hauteur, défaut h-72
 */
export default function CarteGoogle({ adresse, lat, lon, zoom, hauteur = "h-72" }) {
  const query = adresse || (lat != null && lon != null ? `${lat},${lon}` : null);
  if (!query) {
    return (
      <p className="text-[#7f9995] text-sm py-6 text-center">
        Localisation inconnue : ni adresse ni commune résolue.
      </p>
    );
  }

  const lienExterne = adresse
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`
    : `https://www.google.com/maps?q=${lat},${lon}`;

  if (!MAPS_KEY) {
    return (
      <div className={`${hauteur} rounded-md border border-[#16201f] bg-[#0a0f0e] flex flex-col items-center justify-center gap-3 text-center px-6`}>
        <MapPin className="w-6 h-6 text-[#33d6c0]/50" />
        <p className="text-[#7f9995] text-xs max-w-sm">
          Carte intégrée indisponible : renseignez <code className="text-[#c4d5d1]">VITE_GOOGLE_MAPS_API_KEY</code>{" "}
          dans <code className="text-[#c4d5d1]">.env</code> (clé Maps Embed API).
        </p>
        <a
          href={lienExterne}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#5ee7d4] hover:text-white text-xs flex items-center gap-1.5 transition-colors"
        >
          Ouvrir dans Google Maps <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  const src = `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(query)}&zoom=${zoom || (adresse ? 17 : 13)}`;

  return (
    <div className="space-y-2">
      <iframe
        src={src}
        title={`Carte — ${query}`}
        className={`w-full ${hauteur} rounded-md border-0 bg-[#0a0f0e]`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <a
        href={lienExterne}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#7f9995] hover:text-white text-[11px] flex items-center gap-1 transition-colors"
      >
        Ouvrir dans Google Maps <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}
