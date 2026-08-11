import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import InfoTooltip from "./InfoTooltip";
import { MapPin, Loader2 } from "lucide-react";

const MARKER_COLORS = ["#991B1B", "#34D399", "#EAB308", "#C084FC"];

function createColoredIcon(color) {
  if (typeof window === "undefined" || !window.L) return null;
  return window.L.divIcon({
    className: "",
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

async function geocodeAddress(address) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`);
  const data = await res.json();
  if (data.length > 0) {
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }
  return null;
}

export default function CompareMap({ metrics }) {
  const [resolvedCoords, setResolvedCoords] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const toGeocode = metrics.filter(m => !m.latitude && !m.longitude && m.adresse && !resolvedCoords[m.id]);

    if (toGeocode.length === 0) return;

    setLoading(true);
    Promise.all(
      toGeocode.map(async (m) => {
        const coords = await geocodeAddress(m.adresse);
        return { id: m.id, coords };
      })
    ).then((results) => {
      if (cancelled) return;
      const newCoords = { ...resolvedCoords };
      results.forEach(({ id, coords }) => {
        if (coords) newCoords[id] = coords;
      });
      setResolvedCoords(newCoords);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [metrics.map(m => m.id).join(",")]);

  const projectsWithCoords = metrics
    .map((m, i) => {
      const lat = m.latitude || resolvedCoords[m.id]?.lat;
      const lng = m.longitude || resolvedCoords[m.id]?.lng;
      if (!lat || !lng) return null;
      return { ...m, lat, lng, globalIdx: i };
    })
    .filter(Boolean);

  if (projectsWithCoords.length === 0 && !loading) {
    return (
      <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-5">
        <div className="flex items-center mb-4">
          <p className="text-white/40 text-xs uppercase tracking-[0.15em]">
            Localisation des projets
          </p>
          <InfoTooltip text="Carte montrant la position géographique de chaque projet comparé. La distance entre les projets peut influencer la diversification de votre portefeuille immobilier." />
        </div>
        <div className="flex flex-col items-center justify-center h-48 text-white/20">
          <MapPin className="w-8 h-8 mb-2" />
          <p className="text-sm">Aucune localisation disponible pour ces projets.</p>
        </div>
      </div>
    );
  }

  if (loading && projectsWithCoords.length === 0) {
    return (
      <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-5">
        <div className="flex items-center mb-4">
          <p className="text-white/40 text-xs uppercase tracking-[0.15em]">Localisation des projets</p>
        </div>
        <div className="flex items-center justify-center h-48 text-white/30">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <p className="text-sm">Géolocalisation des adresses...</p>
        </div>
      </div>
    );
  }

  const centerLat = projectsWithCoords.reduce((s, m) => s + m.lat, 0) / projectsWithCoords.length;
  const centerLng = projectsWithCoords.reduce((s, m) => s + m.lng, 0) / projectsWithCoords.length;

  return (
    <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-5">
      <div className="flex items-center mb-4">
        <p className="text-white/40 text-xs uppercase tracking-[0.15em]">
          Localisation des projets
        </p>
        <InfoTooltip text="Carte montrant la position géographique de chaque projet comparé. La distance entre les projets peut influencer la diversification de votre portefeuille immobilier." />
      </div>
      <div className="h-[500px] rounded-xl overflow-hidden">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          />
          {projectsWithCoords.map((m) => {
            const icon = createColoredIcon(MARKER_COLORS[m.globalIdx]);
            return (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={icon}>
                <Popup>
                  <div className="text-sm font-medium">{m.titre}</div>
                  <div className="text-xs text-gray-500">{m.adresse || ""}</div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}