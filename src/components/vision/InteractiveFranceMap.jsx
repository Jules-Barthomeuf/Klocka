import React, { useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from "react-leaflet";
import { motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Mapping des types de commerces vers des images
const commerceImages = {
  "restaurant": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop",
  "boulangerie": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&h=300&fit=crop",
  "pharmacie": "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=400&h=300&fit=crop",
  "boutique": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop",
  "coiffeur": "https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400&h=300&fit=crop",
  "supermarché": "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400&h=300&fit=crop",
  "café": "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=300&fit=crop",
  "librairie": "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&h=300&fit=crop"
};

// Données par taille de projet
const projectDataBySize = {
  "200": { cities: ["Lyon", "Nantes", "Strasbourg"], commerceTypes: ["boulangerie", "pharmacie", "coiffeur"] },
  "300": { cities: ["Bordeaux", "Lille", "Toulouse"], commerceTypes: ["restaurant", "boutique", "café"] },
  "400": { cities: ["Marseille", "Nice", "Rennes"], commerceTypes: ["supermarché", "restaurant", "librairie"] },
  "500": { cities: ["Paris", "Montpellier", "Dijon"], commerceTypes: ["boutique", "restaurant", "pharmacie"] },
  "700": { cities: ["Grenoble", "Angers", "Nancy"], commerceTypes: ["supermarché", "librairie", "café"] },
  "1000": { cities: ["Paris", "Lyon", "Marseille"], commerceTypes: ["restaurant", "boutique", "supermarché"] },
  "1200": { cities: ["Paris", "Bordeaux", "Nice"], commerceTypes: ["restaurant", "boutique", "librairie"] }
};

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// Base de données de coordonnées pour les villes françaises
const villeCoords = {
  "paris": [48.8566, 2.3522],
  "lyon": [45.7640, 4.8357],
  "marseille": [43.2965, 5.3698],
  "toulouse": [43.6047, 1.4442],
  "nice": [43.7102, 7.2620],
  "nantes": [47.2184, -1.5536],
  "strasbourg": [48.5734, 7.7521],
  "montpellier": [43.6108, 3.8767],
  "bordeaux": [44.8378, -0.5792],
  "lille": [50.6292, 3.0573],
  "rennes": [48.1173, -1.6778],
  "reims": [49.2583, 4.0347],
  "le havre": [49.4944, 0.1079],
  "saint-étienne": [45.4398, 4.3890],
  "toulon": [43.1242, 5.9280],
  "grenoble": [45.1885, 5.7245],
  "dijon": [47.3220, 5.0419],
  "angers": [47.4829, -0.5539],
  "nîmes": [43.8345, 4.3160],
  "villeurbanne": [45.7671, 4.8785],
};

// Icône personnalisée dorée
const goldIcon = new L.Icon({
  iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cdefs%3E%3CradialGradient id='grad' cx='50%25' cy='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23f4be7e;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23d4a05e;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='20' cy='20' r='14' fill='url(%23grad)' stroke='%23fff' stroke-width='2'/%3E%3Ccircle cx='20' cy='20' r='7' fill='%23fff' opacity='0.9'/%3E%3C/svg%3E",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

// Villes avec leurs coordonnées
const villesDisponibles = [
  { nom: "Paris", coords: [48.8566, 2.3522] },
  { nom: "Lyon", coords: [45.7640, 4.8357] },
  { nom: "Marseille", coords: [43.2965, 5.3698] },
  { nom: "Toulouse", coords: [43.6047, 1.4442] },
  { nom: "Nice", coords: [43.7102, 7.2620] },
  { nom: "Nantes", coords: [47.2184, -1.5536] },
  { nom: "Strasbourg", coords: [48.5734, 7.7521] },
  { nom: "Montpellier", coords: [43.6108, 3.8767] },
  { nom: "Bordeaux", coords: [44.8378, -0.5792] },
  { nom: "Lille", coords: [50.6292, 3.0573] },
  { nom: "Rennes", coords: [48.1173, -1.6778] },
  { nom: "Grenoble", coords: [45.1885, 5.7245] },
  { nom: "Dijon", coords: [47.3220, 5.0419] },
  { nom: "Angers", coords: [47.4829, -0.5539] }
];

export default function InteractiveFranceMap({ projets }) {
  const [selectedProject, setSelectedProject] = useState(null);

  // Centre de la France
  const centerFrance = [46.603354, 1.888334];

  const formatValue = (value) => {
    if (!value) return "N/A";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M€`;
    return `${Math.round(value / 1000)}K€`;
  };

  // Générer des projets avec coordonnées, images et types de commerce
  const projetsAvecCoords = useMemo(() => {
    return projets.map((projet, index) => {
      const tailleKey = projet.taille.toString();
      const cityOptions = projectDataBySize[tailleKey]?.cities || ["Paris"];
      const commerceOptions = projectDataBySize[tailleKey]?.commerceTypes || ["boutique"];
      
      // Sélectionner ville et commerce
      const cityName = cityOptions[index % cityOptions.length];
      const commerceType = commerceOptions[index % commerceOptions.length];
      const ville = villesDisponibles.find(v => v.nom === cityName) || villesDisponibles[0];
      
      // Calculer rendement
      const rendementBase = parseFloat(projet.taille) >= 1000 ? 6.5 : 
                           parseFloat(projet.taille) >= 500 ? 7.0 :
                           parseFloat(projet.taille) >= 300 ? 7.5 : 8.0;
      const variation = (Math.random() - 0.5) * 1.0;
      const rendement = (rendementBase + variation).toFixed(1);
      
      return {
        id: index,
        titre: `Projet #${index + 1}`,
        ville: ville.nom,
        commerceType: commerceType,
        imageUrl: commerceImages[commerceType] || commerceImages["boutique"],
        prix_acquisition: parseInt(projet.taille) * 1000,
        lat: ville.coords[0] + (Math.random() - 0.5) * 0.2,
        lng: ville.coords[1] + (Math.random() - 0.5) * 0.2,
        rendement_locatif: parseFloat(rendement)
      };
    });
  }, [projets]);

  if (projetsAvecCoords.length === 0) {
    return (
      <div className="rounded-md bg-[#0a0f0e]/50 border border-[#101715] p-8 text-center">
        <p className="text-[#93aca7]">Aucun projet avec localisation disponible</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-md overflow-hidden border border-[#101715] shadow-2xl w-full h-full"
    >
      <div className="relative w-full h-full bg-[#aad3df]">
        <MapContainer
          center={centerFrance}
          zoom={5}
          style={{ height: "100%", width: "100%" }}
          className="z-0"
        >
          {/* Remplacement par la variante "Voyager" qui affiche l'eau en bleu */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            maxZoom={18}
          />

          {projetsAvecCoords.map((projet, idx) => (
            <Marker
              key={idx}
              position={[projet.lat, projet.lng]}
              icon={goldIcon}
            >
              <Popup maxWidth={300} className="custom-popup">
                <div className="p-2">
                  <img 
                    src={projet.imageUrl} 
                    alt={projet.commerceType}
                    className="w-full h-32 object-cover rounded-lg mb-3"
                  />
                  <div className="font-bold text-base mb-1">{projet.ville}</div>
                  <div className="text-[#5e7672] mb-3 capitalize text-sm">{projet.commerceType}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-xs text-[#7f9995] mb-1">Prix d'acquisition</div>
                      <div className="font-bold text-sm">{formatValue(projet.prix_acquisition)}</div>
                    </div>
                    <div className="bg-[#33d6c0]/10 rounded-lg p-2">
                      <div className="text-xs text-[#7f9995] mb-1">Rendement annuel</div>
                      <div className="font-bold text-sm text-[#2bb8a5]">{projet.rendement_locatif}%</div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <style jsx global>{`
        /* Suppression des filtres qui rendaient la carte grise ou décolorée */
        .leaflet-container {
          background-color: #aad3df !important; /* Couleur de l'eau standard */
        }

        .custom-popup .leaflet-popup-content-wrapper {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          border: 2px solid #f4be7e;
          overflow: visible;
        }

        .custom-popup .leaflet-popup-content {
          margin: 0;
          width: auto !important;
          font-family: 'Geist', sans-serif;
          min-width: 280px;
        }
        
        .custom-popup .leaflet-popup-content-wrapper {
          padding: 0;
          border-radius: 12px;
          overflow: hidden;
        }

        .custom-popup .leaflet-popup-tip {
          background: white;
          border: 2px solid #f4be7e;
        }

        .leaflet-popup-close-button {
          color: #666;
        }
      `}</style>
    </motion.div>
  );
}