import React, { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

// Un projet sans photo montre sa rue plutôt qu'un cadre vide : la carte Google
// (API Embed, même clé que la page projet), sans interaction pour que le clic
// ouvre toujours le projet.
//
// La carte ne se monte qu'une fois la vignette entrée dans l'écran. Deux cent
// vingt-huit projets sans photo, c'étaient deux cent vingt-huit iframes Google
// montées d'un coup : la page de gestion mettait une demi-minute à répondre, et
// un clic dans le menu ne faisait rien pendant ce temps-là. `loading="lazy"` ne
// suffisait pas, le navigateur les tenant toutes pour visibles dans une grille
// haute.

const CLE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export default function CarteDuProjet({ project }) {
  const lieu = project.adresse_complete
    || (project.latitude && project.longitude ? `${project.latitude},${project.longitude}` : "");
  const cadre = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cadre.current;
    if (!el || visible || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  if (!CLE || !lieu) {
    return (
      <div className="w-full h-full bg-fond flex items-center justify-center">
        <MapPin className="w-10 h-10 text-encre/[0.06]" />
      </div>
    );
  }
  return (
    <div ref={cadre} className="w-full h-full bg-fond">
      {visible ? (
        <iframe
          title={`Carte : ${project.titre || lieu}`}
          src={`https://www.google.com/maps/embed/v1/place?key=${CLE}&q=${encodeURIComponent(lieu)}&zoom=16`}
          className="w-full h-full pointer-events-none"
          style={{ border: 0 }}
          loading="lazy"
          tabIndex={-1}
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <MapPin className="w-10 h-10 text-encre/[0.06]" />
        </div>
      )}
    </div>
  );
}
