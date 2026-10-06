import React, { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from "react-leaflet";
import { motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import { useFondDeCarte } from "@/lib/tuiles";
import { J, JL } from "@/design/jetons";

// La carte de la page Vision : où les acquisitions de la stratégie simulée
// pourraient se situer. Les projets sont fictifs (c'est une projection) mais
// la carte est celle de l'application : fond IGN avec repli, points aux
// couleurs de la marque, fiche sobre — plus de tuiles Carto filigranées, de
// marqueur doré ni de photo de banque d'images.

// Des villes plausibles par taille de projet, avec le type de commerce qu'on
// y trouve à ce budget. Données d'illustration, comme les courbes de la page.
const projectDataBySize = {
  "200": { cities: ["Lyon", "Nantes", "Strasbourg"], commerceTypes: ["boulangerie", "pharmacie", "coiffeur"] },
  "300": { cities: ["Bordeaux", "Lille", "Toulouse"], commerceTypes: ["restaurant", "boutique", "café"] },
  "400": { cities: ["Marseille", "Nice", "Rennes"], commerceTypes: ["supermarché", "restaurant", "librairie"] },
  "500": { cities: ["Paris", "Montpellier", "Dijon"], commerceTypes: ["boutique", "restaurant", "pharmacie"] },
  "700": { cities: ["Grenoble", "Angers", "Nancy"], commerceTypes: ["supermarché", "librairie", "café"] },
  "1000": { cities: ["Paris", "Lyon", "Marseille"], commerceTypes: ["restaurant", "boutique", "supermarché"] },
  "1200": { cities: ["Paris", "Bordeaux", "Nice"], commerceTypes: ["restaurant", "boutique", "librairie"] },
};

const villesDisponibles = [
  { nom: "Paris", coords: [48.8566, 2.3522] },
  { nom: "Lyon", coords: [45.764, 4.8357] },
  { nom: "Marseille", coords: [43.2965, 5.3698] },
  { nom: "Toulouse", coords: [43.6047, 1.4442] },
  { nom: "Nice", coords: [43.7102, 7.262] },
  { nom: "Nantes", coords: [47.2184, -1.5536] },
  { nom: "Strasbourg", coords: [48.5734, 7.7521] },
  { nom: "Montpellier", coords: [43.6108, 3.8767] },
  { nom: "Bordeaux", coords: [44.8378, -0.5792] },
  { nom: "Lille", coords: [50.6292, 3.0573] },
  { nom: "Rennes", coords: [48.1173, -1.6778] },
  { nom: "Grenoble", coords: [45.1885, 5.7245] },
  { nom: "Dijon", coords: [47.322, 5.0419] },
  { nom: "Angers", coords: [47.4829, -0.5539] },
  { nom: "Nancy", coords: [48.6921, 6.1844] },
];

const formatValue = (value) => {
  if (!value) return "N/A";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)} M€`;
  return `${Math.round(value / 1000)} k€`;
};

export default function InteractiveFranceMap({ projets }) {
  const { fond, surErreur } = useFondDeCarte();

  // Déterministe : le même plan de projets redonne la même carte, sans
  // points qui sautent à chaque rendu.
  const projetsAvecCoords = useMemo(() => {
    return projets.map((projet, index) => {
      const tailleKey = String(projet.taille);
      const cityOptions = projectDataBySize[tailleKey]?.cities || ["Paris"];
      const commerceOptions = projectDataBySize[tailleKey]?.commerceTypes || ["boutique"];
      const ville = villesDisponibles.find((v) => v.nom === cityOptions[index % cityOptions.length]) || villesDisponibles[0];
      const rendementBase = parseFloat(projet.taille) >= 1000 ? 6.5 : parseFloat(projet.taille) >= 500 ? 7.0 : parseFloat(projet.taille) >= 300 ? 7.5 : 8.0;
      return {
        id: index,
        titre: `Projet n°${index + 1}`,
        ville: ville.nom,
        commerceType: commerceOptions[index % commerceOptions.length],
        prix_acquisition: parseInt(projet.taille, 10) * 1000,
        lat: ville.coords[0] + ((index % 5) - 2) * 0.04,
        lng: ville.coords[1] + ((index % 3) - 1) * 0.05,
        rendement_locatif: (rendementBase + ((index % 5) - 2) * 0.2).toFixed(1),
      };
    });
  }, [projets]);

  if (projetsAvecCoords.length === 0) {
    return (
      <div className="rounded-bloc border border-trait bg-surface p-8 text-center">
        <p className="m-0 text-[13.5px] text-ardoise">Aucun projet à situer pour l'instant.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative h-full w-full overflow-hidden rounded-[18px] border border-trait"
    >
      {/* Au téléphone, un doigt fait défiler la page, pas la carte : deux doigts la déplacent et la zooment. */}
      <MapContainer center={[46.603354, 1.888334]} zoom={5} style={{ height: "100%", width: "100%" }} className="z-0" scrollWheelZoom={false} dragging={typeof window === "undefined" || window.innerWidth >= 768}>
        <TileLayer url={fond.url} attribution={fond.attribution} maxZoom={18} eventHandlers={{ tileerror: surErreur }} />
        {projetsAvecCoords.map((projet) => (
          <CircleMarker
            key={projet.id}
            center={[projet.lat, projet.lng]}
            radius={10}
            pathOptions={{ color: JL["menthe"], weight: 2, fillColor: JL["menthe"], fillOpacity: 0.5 }}
          >
            <Tooltip>{projet.ville}</Tooltip>
            <Popup maxWidth={280} className="vision-popup">
              <div className="px-4 py-3">
                <p className="m-0 text-[11px] uppercase tracking-[.16em]" style={{ color: J["ardoise"] }}>{projet.titre}</p>
                <p className="m-0 mt-1 text-[16px] font-medium" style={{ color: J["encre"] }}>{projet.ville}</p>
                <p className="m-0 mt-0.5 text-[13px] capitalize" style={{ color: J["craie"] }}>Murs de {projet.commerceType}</p>
                <div className="mt-3 flex gap-6 border-t pt-2.5" style={{ borderColor: J["trait"] }}>
                  <div>
                    <p className="m-0 text-[11px]" style={{ color: J["ardoise"] }}>Acquisition</p>
                    <p className="m-0 mt-0.5 text-[14px] font-medium tabular-nums" style={{ color: J["encre"] }}>{formatValue(projet.prix_acquisition)}</p>
                  </div>
                  <div>
                    <p className="m-0 text-[11px]" style={{ color: J["ardoise"] }}>Rendement</p>
                    <p className="m-0 mt-0.5 text-[14px] font-medium tabular-nums" style={{ color: J["menthe"] }}>{projet.rendement_locatif} %</p>
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* styled-jsx n'est pas installé : une balise <style> nue est déjà globale. */}
      <style>{`
        .vision-popup .leaflet-popup-content-wrapper {
          background: ${J["surface-pleine"]};
          color: ${J["encre"]};
          border: 1px solid ${J["trait"]};
          border-radius: 14px;
          box-shadow: 0 16px 40px rgb(0 0 0 / 0.18);
          padding: 0;
          overflow: hidden;
        }
        .vision-popup .leaflet-popup-content { margin: 0; width: auto !important; min-width: 220px; }
        .vision-popup .leaflet-popup-tip { background: ${J["surface-pleine"]}; border: 1px solid ${J["trait"]}; }
        .vision-popup .leaflet-popup-close-button { color: ${J["ardoise"]}; }
      `}</style>
    </motion.div>
  );
}
