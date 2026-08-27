import React, { useState } from "react";

// La page secrète. Aucun lien n'y mène : on la trouve parce qu'on sait.
//
// Les photos vivent dans public/alexis/ — 1.jpg et 2.jpg — hors du dépôt
// des composants, pour qu'on puisse en changer sans toucher au code. Une
// photo absente ne casse rien : la case le dit, et la page tient debout.

const PHOTOS = [
  { src: "/alexis/1.jpg", legende: "L'Araignée de Klocka", detail: "Un grand pouvoir implique de grands rendements." },
  { src: "/alexis/2.jpg", legende: "Los Klockos", detail: "Chop n'a jamais été aussi bien coiffé." },
];

function Photo({ src, legende, detail }) {
  const [absente, setAbsente] = useState(false);
  return (
    <figure className="m-0">
      <div className="border border-[#e0c9a0]/30 bg-[#0e100f] overflow-hidden">
        {absente ? (
          <div className="aspect-[4/5] flex items-center justify-center p-8 text-center">
            <p className="m-0 text-[13px] leading-[1.7] text-[#6b7270]">
              Photo à déposer dans <code className="text-[#e0c9a0]">public{src}</code>
            </p>
          </div>
        ) : (
          <img
            src={src}
            alt={legende}
            onError={() => setAbsente(true)}
            className="block w-full h-auto"
          />
        )}
      </div>
      <figcaption className="mt-4">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#e0c9a0]">{legende}</p>
        <p className="m-0 mt-1.5 text-[14px] leading-[1.6] text-[#9aa19e]">{detail}</p>
      </figcaption>
    </figure>
  );
}

export default function Alexis() {
  return (
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5]">
      <div className="max-w-[1100px] mx-auto px-5 md:px-12 py-12 md:py-20">
        <header>
          <div className="w-10 h-0.5 bg-[#e0c9a0] mb-8" />
          <p className="m-0 text-[11px] tracking-[.18em] uppercase text-[#8b8880]">Page secrète — vous n'êtes jamais venu ici</p>
          <h1 className="m-0 mt-4 text-[46px] max-lg:text-[36px] max-md:text-[28px] font-semibold tracking-[-.025em] leading-[1.05] text-[#f0ece5]">
            Alexis
          </h1>
        </header>

        <div className="h-px bg-[#232120] my-12 max-md:my-9" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-14 items-start">
          {PHOTOS.map((p) => (
            <Photo key={p.src} {...p} />
          ))}
        </div>

        <p className="mt-16 text-[12px] text-[#5c5a55]">
          Cette page n'apparaît nulle part. Si vous la lisez, gardez le secret.
        </p>
      </div>
    </div>
  );
}
