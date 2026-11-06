import { useState } from "react";

import { IMG as M } from "@/lib/format";
const YT = { href: "https://www.youtube.com/watch?v=0rkUHoLInQc", preview: M + "141085865_Screenshot2026-09-30at152747.png" };
const POD = { href: "https://open.spotify.com/episode/0gKKnSG9NY3yHymL06CknR", preview: M + "08b44e101_Screenshot2026-09-30at152904.png" };
const FIG = { href: "https://www.lefigaro.fr/economie/immobilier-commercial-la-classe-d-actifs-que-les-particuliers-redecouvrent-20260930", preview: M + "d5e304209_Screenshot2026-09-30at153709.png" };

// Black backgrounds are blended away; "mono" turns transparent logos white.
const LOGOS = [
  { src: M + "5be34da25_youtube.png", alt: "YouTube", ...YT },
  { src: M + "4b38f29df_lm-noir-blanc.png", alt: "La Martingale", ...POD },
  { src: M + "18e6e43bc_lf-noir-blanc-gris.png", alt: "Le Figaro", ...FIG },
  { src: M + "9abf5c749_spotify-white-icon.webp", alt: "Spotify", mono: true, ...POD },
  { src: M + "a6c20c327_Apple_Music_logo.png", alt: "Apple Podcasts", mono: true, ...POD, href: "https://podcasts.apple.com/fr/podcast/327-fin-du-r%C3%A9sidentiel-voici-o%C3%B9-investissent-ceux-qui/id1457342478?i=1000777880288" },
  { src: M + "8d8cab947_DEEZRPA_BIGD-84ce66f5.png", alt: "Deezer", mono: true, wide: true, ...POD },
];

const CRUSH = "grayscale(1) contrast(3)";
const WHITE = "brightness(0) invert(1)";

export default function LogoMarquee() {
  const [hover, setHover] = useState(null);

  return (
    <>
    <h2 className="k-wrap k-h2 !text-[clamp(26px,3vw,44px)] text-center pt-20">Des médias de référence ont choisi de nous donner la parole</h2>
    <section aria-label="Ils parlent de nous" className="group k-mask-x overflow-hidden h-[140px] flex items-center">
      <div className="flex w-max items-center k-marquee group-hover:[animation-play-state:paused]">
        {[...LOGOS, ...LOGOS, ...LOGOS, ...LOGOS].map((l, i) => (
          <a
            key={i}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 mr-[96px]"
            onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover({ src: l.preview, x: r.left + r.width / 2, y: r.top }); }}
            onMouseLeave={() => setHover(null)}
          >
            <img
              src={l.src}
              alt={i < LOGOS.length ? l.alt : ""}
              loading="eager"
              className={`object-contain ${l.wide ? "h-[40px] w-auto" : "h-[72px] w-[72px]"}`}
              style={{ filter: l.mono ? WHITE : CRUSH, opacity: 0.8, mixBlendMode: "screen", transform: l.mono ? "scale(0.7)" : undefined }}
            />
          </a>
        ))}
      </div>
    </section>
    {hover && (
      <img
        src={hover.src}
        alt=""
        className="fixed z-50 w-[260px] rounded-[18px] border border-white/10 shadow-2xl pointer-events-none -translate-x-1/2 -translate-y-full"
        style={{ left: hover.x, top: hover.y - 12 }}
      />
    )}
    </>
  );
}
