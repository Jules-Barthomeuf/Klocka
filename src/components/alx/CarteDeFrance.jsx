import React from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useFondDeCarte } from "@/lib/tuiles";
import { J, JL } from "@/design/jetons";

// Où chercher, vu de haut.
//
// Un point par ville que le tableau de marché retient pour ces critères. Le
// point grossit avec ce qu'ALX y a déjà relevé, et passe au menthe dès que la
// ville est prospectée pour cette carte. Cliquer coche la ville, comme dans
// la liste dessous : c'est la même sélection, vue autrement.

const teinteDe = (v, cochee) => {
  if (cochee) return JL["menthe"];
  if (v.ville_id) return JL["menthe-fonce"];
  return JL["ambre"];
};

/** Les bornes qui contiennent tous les points, avec une marge d'un demi-degré. */
function bornesDe(points) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return [
    [Math.min(...lats) - 0.4, Math.min(...lons) - 0.4],
    [Math.max(...lats) + 0.4, Math.max(...lons) + 0.4],
  ];
}

export default function CarteDeFrance({ villes = [], cochees, onBasculer, hauteur = 330 }) {
  const { fond, surErreur } = useFondDeCarte();
  const avecPoint = villes.filter((v) => v.lat && v.lon);

  const cadre = "relative overflow-hidden rounded-[18px] border border-trait";
  if (!avecPoint.length) {
    return (
      <div className={`${cadre} flex items-center justify-center`} style={{ height: hauteur, background: J["fond"] }}>
        <span className="text-[13px] text-ardoise">Aucune ville à ce rendement.</span>
      </div>
    );
  }

  return (
    <div className={cadre} style={{ height: hauteur }}>
      {/* Les fonds de carte sont clairs : on les retourne pour qu'ils tiennent
          sur le noir d'ALX, sans toucher aux points, dessinés par-dessus. */}
      <style>{`.carte-fr-tuiles { filter: invert(1) hue-rotate(180deg) brightness(.78) contrast(.82) saturate(.3); }`}</style>
      <MapContainer
        // Le cadrage est donné au montage, par les bornes des points : posé
        // après coup, Leaflet cadre sur une taille de conteneur qu'il croit
        // nulle et garde son zoom de départ, qui montrait toute l'Europe.
        // La clé remonte la carte quand la sélection de villes change de taille.
        key={avecPoint.length}
        bounds={bornesDe(avecPoint)}
        boundsOptions={{ padding: [30, 30], maxZoom: 8 }}
        minZoom={4}
        maxZoom={10}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: "100%", width: "100%", background: J["fond"] }}
      >
        <TileLayer url={fond.url} className="carte-fr-tuiles" eventHandlers={{ tileerror: surErreur }} />
        {avecPoint.map((v) => {
          const cochee = cochees?.has(v.insee);
          const teinte = teinteDe(v, cochee);
          return (
            <CircleMarker
              key={v.insee}
              center={[v.lat, v.lon]}
              radius={cochee ? 9 : v.cibles ? 7 : 5}
              pathOptions={{ color: teinte, weight: cochee ? 2.5 : 1.5, fillColor: teinte, fillOpacity: cochee ? 0.75 : 0.35 }}
              eventHandlers={{ click: () => onBasculer?.(v.insee) }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <span style={{ fontSize: 12 }}>
                  {v.ville} · {String(v.taux[0]).replace(".", ",")} %
                  {v.cibles ? ` · ${v.cibles} commerces` : ""}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 right-3 text-[10.5px] text-brume">{fond.attribution}</div>
    </div>
  );
}
