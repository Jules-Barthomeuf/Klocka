import { useState } from "react";
import { Play } from "lucide-react";
import { IMG } from "@/lib/format";

const THUMB = IMG + "2ae483295_Screenshot2026-08-31at092137.png";
const EMBED = "https://www.youtube-nocookie.com/embed/0rkUHoLInQc?autoplay=1&rel=0";

export default function InterviewSection() {
  const [playing, setPlaying] = useState(false);

  return (
    <section className="k-wrap k-section text-center">
      <h2 className="k-h2 max-w-[22ch] mx-auto">Ils parlent de nous et d’investissement en <span className="k-serif">immobilier commercial.</span></h2>
      <div className="mt-14 mx-auto max-w-[824px] grid sm:grid-cols-2 gap-6">
      <div className="aspect-video rounded-[26px] overflow-hidden bg-k-card relative">
        {playing ? (
          <iframe
            src={EMBED}
            title="Interview Klocka"
            className="absolute inset-0 w-full h-full"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button onClick={() => setPlaying(true)} className="group absolute inset-0 w-full h-full" aria-label="Lire la vidéo">
            <img src={THUMB} alt="Interview Klocka" loading="eager" className="w-full h-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                <Play className="w-6 h-6 text-white fill-white ml-1" />
              </span>
            </span>
            <span className="absolute bottom-4 right-4 rounded-md bg-black/70 px-2 py-1 text-[12px] text-white">1:03:10</span>
          </button>
        )}
      </div>
      <a href="https://www.lefigaro.fr/economie/immobilier-commercial-la-classe-d-actifs-que-les-particuliers-redecouvrent-20260930" target="_blank" rel="noopener noreferrer" className="group aspect-video rounded-[26px] overflow-hidden relative block">
        <img src={IMG + "d5e304209_Screenshot2026-09-30at153709.png"} alt="Le Figaro — Regards de dirigeants" className="w-full h-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
            <Play className="w-6 h-6 text-white fill-white ml-1" />
          </span>
        </span>
      </a>
      </div>
    </section>
  );
}
