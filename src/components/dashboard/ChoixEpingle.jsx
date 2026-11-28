import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AnimatePresence } from "framer-motion";
import { Colonne, usePanneauEpingle } from "@/components/dashboard/CadreEpingle";
import ListeBrouillon from "@/components/dashboard/PastilleBrouillon";
import ListeFiches from "@/components/dashboard/PastilleFiches";
import ListeAFaire from "@/components/dashboard/PastilleAFaire";

// Le sélecteur du coin (28 nov. 2026, Jules : « comme dans la carte du profil, avec les trucs Auto, Sombre ; tu recopies
// le même style ») : le dessin d'Apparence de src/components/MenuProfil.jsx, carré (rayons 10 et 7 px), le choisi en
// petite carte pervenche (Jules : « plutôt que du gris ») ; le bord est celui des pilules sous le chat (border-trait, bord-vif au survol).

export function ChoixEpingle() {
  const [choisi, choisir] = usePanneauEpingle();
  const actions = useQuery({ queryKey: ["fiche-dossier-mes-actions"], queryFn: () => base44.request("GET", "/api/fiche-dossier/mes-actions"), staleTime: 20_000, refetchInterval: 120_000, retry: false });
  const brouillon = useQuery({ queryKey: ["brouillon"], queryFn: () => base44.request("GET", "/api/fiche-dossier/brouillon"), staleTime: 30_000, retry: false });
  const n = (actions.data?.actions || []).length;
  const plein = String(brouillon.data?.texte || "").trim().length > 0;
  const places = [
    ["brouillon", "Note", plein ? <span key="p" className="h-1.5 w-1.5 rounded-full bg-menthe" aria-label="pas vide" /> : null],
    ["fiches", "Fiches", null],
    ["afaire", "À faire", n ? <span key="n" className="tabular-nums text-menthe">{n}</span> : null],
  ];
  return (
    <div className="flex h-9 items-center gap-0.5 rounded-[10px] border border-trait bg-surface-pleine p-[3px] transition-colors duration-300 hover:border-bord-vif" role="group" aria-label="Panneau à droite">
      {places.map(([v, mot, marque]) => (
        <button key={v} type="button" onClick={() => choisir(choisi === v ? null : v)} aria-pressed={choisi === v}
          className={`inline-flex h-[28px] items-center gap-1.5 rounded-[7px] px-3 text-[13.5px] transition-colors duration-200 ${choisi === v ? "bg-pervenche/30 text-encre" : "text-craie hover:text-encre"}`} style={choisi === v ? undefined : { background: "transparent" }}>
          {mot}{marque}
        </button>
      ))}
    </div>
  );
}

/** La colonne et l'onglet choisi ; `choisi` null la fait repartir à droite. Changer d'onglet ne la referme pas. */
export function PanneauEpingle({ choisi }) {
  const contenu = choisi === "brouillon" ? <ListeBrouillon key="brouillon" />
    : choisi === "fiches" ? <ListeFiches key="fiches" />
      : choisi === "afaire" ? <ListeAFaire key="afaire" /> : null;
  return <AnimatePresence>{contenu && <Colonne key="colonne">{contenu}</Colonne>}</AnimatePresence>;
}
