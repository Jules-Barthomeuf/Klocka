import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { adresseDite } from "@/lib/adresse-dite";
import { FenetreFlottante } from "@/components/prospection/EcranEnLigne";

// La rue de l'appel (17 nov. 2026, Jules : « je dis 20 rue de la République à Antibes, ça va directement en Street View
// dans la rue ; au-dessus, l'adresse ; il n'y a pas d'autres trucs ») : dès qu'une adresse est dite ou notée, une
// fenêtre de verre s'ouvre, comme la calculatrice, avec l'adresse retenue en titre et la rue en Street View, la caméra
// sur la chaussée tournée vers le local (server/prospection/lieu-appel.js). Rien d'autre.

const departLieu = () => {
  // À gauche de la calculatrice, à la même hauteur : les deux tiennent côte à côte.
  const l = 520;
  const h = Math.max(300, Math.min(400, window.innerHeight - 104 - 200));
  return { l, h, x: window.innerWidth - 380 - 32 - l - 16, y: window.innerHeight - h - 104 };
};

/**
 * Le bouton de la rue, à côté de la calculatrice, et sa fenêtre. `textes` : la transcription et les notes ; `ville` : celle
 * de l'agence, quand l'adresse dite n'en dit pas.
 */
export default function LieuEnLigne({ textes, ville = null }) {
  const dite = useMemo(() => adresseDite(textes), [textes.join("\n")]);
  const params = dite ? Object.fromEntries(Object.entries({
    adresse: [dite.texte, dite.code_postal].filter(Boolean).join(" "), ville: dite.ville, suite: dite.suite, agence: ville,
  }).filter(([, v]) => v)) : null;
  const { data: lieu, isFetching } = useQuery({
    queryKey: ["lieu-appel", params],
    queryFn: () => base44.request("GET", `/api/prospection/mode-appel/lieu?${new URLSearchParams(params)}`),
    enabled: !!params, staleTime: Infinity, retry: false,
  });
  const [choix, setChoix] = useState(null);
  // Une nouvelle adresse dite rouvre la fenêtre, même fermée à la main.
  useEffect(() => { if (dite?.cle) setChoix(null); }, [dite?.cle]);
  const ouverte = choix ?? !!dite;
  const titre = lieu?.ok ? lieu.adresse.label : dite ? dite.texte : "La rue";
  return (
    <>
      <button type="button" onClick={() => setChoix(!ouverte)} aria-pressed={ouverte} aria-label={ouverte ? "Fermer la rue" : "Ouvrir la rue"} title="La rue en Street View : elle s'ouvre seule dès qu'une adresse est dite ou notée"
        className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${ouverte ? "border-menthe/60 text-menthe" : "border-bord-doux text-ardoise hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
        <MapPin className="h-4 w-4" />
      </button>
      {ouverte && (
        <FenetreFlottante titre={titre} cle="klocka.rue-appel.cadre" depart={departLieu} onFermer={() => setChoix(false)}>
          <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
            {lieu?.ok ? (
              <iframe key={lieu.url} src={lieu.url} title={`Street View : ${lieu.adresse.label}`} className="min-h-0 w-full flex-1 rounded-[14px] border-0 bg-fond" allowFullScreen loading="eager" referrerPolicy="no-referrer-when-downgrade" />
            ) : (
              <p className="m-0 flex items-center gap-2 px-2 pb-2 text-[14px] text-ardoise">
                {!dite ? "La rue s'affiche dès qu'une adresse est dite ou tapée dans les notes (« 20 rue de la République à Antibes »)."
                  : isFetching ? <><Loader2 className="h-4 w-4 animate-spin" />Je cherche {dite.texte}…</>
                    : lieu?.error || `Je ne trouve pas ${dite.texte}.`}
              </p>
            )}
          </div>
        </FenetreFlottante>
      )}
    </>
  );
}
