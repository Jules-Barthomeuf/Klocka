import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

// La page secrète. Aucun lien n'y mène : on la trouve parce qu'on sait.
//
// Les photos vivent dans public/alexis/ — 1.jpg et 2.jpg — hors du dépôt
// des composants, pour qu'on puisse en changer sans toucher au code. Une
// photo absente ne casse rien : la case le dit, et la page tient debout.
//
// Le thème (public/alexis/theme.mp3) part à l'arrivée. Les navigateurs
// refusent le son sans geste préalable : si on arrive par un clic dans
// l'application, ça joue ; si on tape l'adresse, un bouton prend le relais.

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

const THEME = "/alexis/theme.mp3";

function Theme() {
  const audio = useRef(null);
  const [etat, setEtat] = useState("silence"); // silence | joue | bloque | absent

  useEffect(() => {
    const a = audio.current;
    if (!a) return undefined;
    a.volume = 0.6;
    a.play()
      .then(() => setEtat("joue"))
      .catch(() => setEtat((e) => (e === "absent" ? e : "bloque")));
    return () => a.pause();
  }, []);

  const basculer = () => {
    const a = audio.current;
    if (!a) return;
    if (etat === "joue") {
      a.pause();
      setEtat("silence");
    } else {
      a.play().then(() => setEtat("joue")).catch(() => setEtat("bloque"));
    }
  };

  return (
    <>
      <audio ref={audio} src={THEME} preload="auto" onError={() => setEtat("absent")} />
      {etat === "absent" ? (
        <p className="m-0 text-[12px] text-[#5c5a55]">
          Thème à déposer dans <code className="text-[#e0c9a0]">public{THEME}</code>
        </p>
      ) : (
        <button
          onClick={basculer}
          className={`inline-flex items-center gap-2 px-4 py-2 border text-[10.5px] tracking-[.16em] uppercase transition-colors ${
            etat === "joue"
              ? "border-[#e0c9a0] text-[#e0c9a0]"
              : "border-[#e0c9a0]/50 text-[#e0c9a0] hover:bg-[#e0c9a0]/[0.08]"
          }`}
        >
          {etat === "joue" ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          {etat === "joue" ? "Thème en cours" : etat === "bloque" ? "Lancer le thème" : "Thème"}
        </button>
      )}
    </>
  );
}

export default function Alexis() {
  return (
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5]">
      <div className="max-w-[1100px] mx-auto px-5 md:px-12 py-12 md:py-20">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="w-10 h-0.5 bg-[#e0c9a0] mb-8" />
            <p className="m-0 text-[11px] tracking-[.18em] uppercase text-[#8b8880]">Page secrète — vous n'êtes jamais venu ici</p>
            <h1 className="m-0 mt-4 text-[46px] max-lg:text-[36px] max-md:text-[28px] font-semibold tracking-[-.025em] leading-[1.05] text-[#f0ece5]">
              Alexis
            </h1>
          </div>
          <Theme />
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
