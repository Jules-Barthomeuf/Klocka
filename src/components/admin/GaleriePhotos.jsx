import React from "react";

// Les photos du projet, telles qu'on les importe : la colonne de gauche les
// montre au fur et à mesure quand l'onglet Images est ouvert à droite.

export default function GaleriePhotos({ photos = [] }) {
  if (!photos.length) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center px-6 text-center">
        <p className="m-0 max-w-sm text-[13.5px] text-ardoise">Aucune photo encore. Importez-les à droite : elles apparaissent ici dans l&apos;ordre où le client les verra.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-6 md:px-6">
      <div className="mb-4 text-[11px] uppercase tracking-[0.2em] text-ardoise">{photos.length} photo{photos.length > 1 ? "s" : ""}, dans l&apos;ordre de la page</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {photos.map((url, i) => (
          <figure key={`${url}-${i}`} className={`relative m-0 overflow-hidden rounded-[14px] border border-trait bg-surface ${i === 0 ? "col-span-2 row-span-2 max-md:col-span-1 max-md:row-span-1" : ""}`}>
            <img src={url} alt="" className="block h-full w-full object-cover" style={{ aspectRatio: i === 0 ? "16 / 10" : "4 / 3" }} loading="lazy" />
            <figcaption className="absolute left-3 top-3 rounded-full bg-fond/70 px-2.5 py-1 text-[11px] text-craie backdrop-blur-sm">
              {i === 0 ? "En couverture" : i + 1}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
