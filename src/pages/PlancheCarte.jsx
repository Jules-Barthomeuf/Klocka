import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Filtres, TitrePage } from "@/components/mandataire/elements";
import { useUser } from "@/components/providers/UserProvider";
import CarteTransactions, { COULEURS_POINTS, DESSIN_DEFAUT } from "@/components/marche/CarteTransactions";
import { J } from "@/design/jetons";

// La planche de la carte des transactions (24 nov. 2026, Jules : « j'aime bien Google Maps mais pas les trucs dessus,
// une vraie carte Maps et les trucs dessus »). La vraie carte de l'onglet Marché, sur le fond Google et les vraies
// cessions d'un projet ; à droite, tout ce qui est posé dessus se règle et la carte suit. Un artifact ne pouvait pas
// la montrer : il ne charge rien d'un autre site, et les tuiles Google ne se stockent pas. Réservée à l'équipe, hors menu.
// « Copier le réglage » donne le dessin à transmettre ; il devient DESSIN_DEFAUT dans CarteTransactions.jsx.

const DEPARTS = {
  choisi: { nom: "Choisi le 24 nov.", d: DESSIN_DEFAUT },
  sobre: { nom: "Sobre", d: { ...DESSIN_DEFAUT, forme: "pastille", taille: 5, etiquette: "chers", styleEtiquette: "texte", bien: "epingle", cercle: "pointilles" } },
  prix: { nom: "Le prix comme point", d: { ...DESSIN_DEFAUT, forme: "prix", bien: "epingle", cercle: "trait" } },
  gouttes: { nom: "Gouttes", d: { ...DESSIN_DEFAUT, forme: "goutte", etiquette: "aucune", bien: "cible", cercle: "zone" } },
  discret: { nom: "Discret", d: { ...DESSIN_DEFAUT, forme: "anneau", taille: 4, etiquette: "chers", styleEtiquette: "pastille", bien: "rond", cercle: "pointilles" } },
};

const CHOIX = [
  ["forme", "Forme du point", [["halo", "Halo"], ["pastille", "Pastille"], ["anneau", "Anneau"], ["goutte", "Goutte"], ["prix", "Le prix"]]],
  ["etiquette", "Prix au-dessus", [["toujours", "Toujours"], ["chers", "Les plus chers"], ["aucune", "Au survol"]]],
  ["styleEtiquette", "Style du prix", [["pastille", "Pastille blanche"], ["texte", "Texte seul"], ["couleur", "Pastille de couleur"]]],
  ["bien", "Le bien", [["epingle", "Épingle"], ["blanche", "Épingle blanche"], ["rond", "Rond"], ["cible", "Cible"]]],
  ["cercle", "Les 500 m", [["zone", "Zone teintée"], ["pointilles", "Pointillés"], ["trait", "Trait"], ["aucun", "Aucun"]]],
  ["fond", "Fond Google", [["clair", "Clair"], ["sombre", "Sombre"]]],
];

function Couleurs({ valeur, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {COULEURS_POINTS.map(([v, nom]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={valeur === v} title={nom} aria-label={nom}
          className={`grid h-7 w-7 place-items-center rounded-full border transition-colors ${valeur === v ? "border-encre" : "border-trait hover:border-bord-vif"}`} style={{ background: "transparent" }}>
          <span className="h-4 w-4 rounded-full" style={{ background: v === "systeme" ? J.menthe : J[v] }} />
        </button>
      ))}
    </div>
  );
}

function Ligne({ titre, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] text-ardoise">{titre}</span>
      {children}
    </div>
  );
}

export default function PlancheCarte() {
  const user = useUser();
  const equipe = user?.role === "admin";
  const { data: projets = [] } = useQuery({
    queryKey: ["planche-carte-projets"],
    queryFn: () => base44.entities.Project.list(),
    enabled: equipe,
    staleTime: 5 * 60_000,
  });
  const avecAdresse = useMemo(() => projets.filter((p) => String(p.adresse_complete || "").trim()), [projets]);
  const [projetId, setProjetId] = useState(null);
  const projet = avecAdresse.find((p) => p.id === projetId) || avecAdresse[0] || null;
  const [dessin, setDessin] = useState(DESSIN_DEFAUT);
  const poser = (cle, v) => setDessin((d) => ({ ...d, [cle]: v }));
  const depart = Object.entries(DEPARTS).find(([, x]) => Object.keys(DESSIN_DEFAUT).every((k) => x.d[k] === dessin[k]))?.[0] || null;
  const texte = JSON.stringify(dessin, null, 2);

  if (user && !equipe) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe Klocka.</p>;

  const copier = async () => {
    try { await navigator.clipboard.writeText(texte); toast.success("Réglage copié : collez-le à Claude"); }
    catch { toast.error("La copie n'a pas marché : sélectionnez le réglage à la main"); }
  };

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1500px] px-5 py-[22px] md:px-8">
        <TitrePage titre="Planche de la carte" className="mb-2" />
        <p className="m-0 mb-5 max-w-[760px] text-[13.5px] leading-[1.55] text-ardoise">La carte des transactions de l'onglet Marché, sur le fond Google et les vraies cessions du projet choisi. Réglez ce qui est posé dessus à droite : la carte suit.</p>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-3">
            <label className="flex flex-wrap items-center gap-2 text-[13px] text-ardoise">
              Projet
              <select value={projet?.id || ""} onChange={(e) => setProjetId(e.target.value)}
                className="h-9 max-w-full rounded-full border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none focus:border-menthe max-md:text-[16px]">
                {avecAdresse.map((p) => <option key={p.id} value={p.id}>{p.titre || p.adresse_complete}</option>)}
              </select>
            </label>
            {projet
              ? <CarteTransactions key={projet.id} adresse={projet.adresse_complete} hauteur={600} avecMurs dessin={dessin} />
              : <p className="m-0 py-10 text-center text-[13.5px] text-brume">{projets.length ? "Aucun projet n'a d'adresse." : "Chargement des projets…"}</p>}
          </div>

          <aside className="k-verre flex flex-col gap-4 p-4 lg:sticky lg:top-6" aria-label="Réglages de la carte">
            <Ligne titre="Départ">
              <Filtres label="Départ" valeur={depart} onChange={(v) => setDessin(DEPARTS[v].d)} options={Object.entries(DEPARTS).map(([k, x]) => [k, x.nom])} />
            </Ligne>
            <div className="border-t border-trait" />
            {CHOIX.slice(0, 1).map(([cle, titre, options]) => (
              <Ligne key={cle} titre={titre}><Filtres label={titre} valeur={dessin[cle]} onChange={(v) => poser(cle, v)} options={options} /></Ligne>
            ))}
            <Ligne titre={`Taille du point · ${dessin.taille} px`}>
              <input type="range" min={4} max={11} step={0.5} value={dessin.taille} onChange={(e) => poser("taille", Number(e.target.value))} aria-label="Taille du point" className="w-full accent-[rgb(var(--k-menthe-rgb))]" />
            </Ligne>
            <Ligne titre="Couleur des fonds de commerce"><Couleurs label="Couleur des fonds de commerce" valeur={dessin.couleurFonds} onChange={(v) => poser("couleurFonds", v)} /></Ligne>
            <Ligne titre="Couleur des ventes de murs"><Couleurs label="Couleur des ventes de murs" valeur={dessin.couleurMurs} onChange={(v) => poser("couleurMurs", v)} /></Ligne>
            {CHOIX.slice(1).map(([cle, titre, options]) => (
              <Ligne key={cle} titre={titre}><Filtres label={titre} valeur={dessin[cle]} onChange={(v) => poser(cle, v)} options={options} /></Ligne>
            ))}
            <div className="border-t border-trait" />
            <div className="flex items-center gap-2">
              <button type="button" onClick={copier} className="inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol">Copier le réglage</button>
              <button type="button" onClick={() => setDessin(DESSIN_DEFAUT)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Revenir au choix du 24 nov.</button>
            </div>
            <pre className="m-0 max-h-[220px] overflow-auto rounded-[10px] border border-trait bg-surface-pleine p-3 text-[12px] leading-[1.5] text-craie">{texte}</pre>
          </aside>
        </div>
      </div>
    </div>
  );
}
