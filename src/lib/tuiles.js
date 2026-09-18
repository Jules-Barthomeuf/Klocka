import { useCallback, useMemo, useState } from "react";

// Le fond de carte, et pourquoi ce n'est plus OpenStreetMap.
//
// Les tuiles venaient de tile.openstreetmap.org, servi par des bénévoles.
// Leur politique d'usage réserve ces serveurs aux petites applications ; la
// nôtre en a demandé trop, et ils l'ont bloquée : chaque tuile est revenue en
// 403 « Access blocked », affiché en clair sur la carte devant l'équipe.
//
// La Géoplateforme de l'IGN prend le relais. C'est le service public français
// de la donnée géographique : gratuit, sans clé depuis 2023, prévu pour être
// réutilisé, et la France y est mieux dessinée qu'ailleurs — ce qui est tout
// ce qui nous intéresse, puisqu'ALX ne prospecte pas au-delà. L'attribution
// « © IGN » est obligatoire, elle est dans la légende.
//
// Un fond peut tomber à son tour : la liste est ordonnée, et `useFondDeCarte`
// passe au suivant quand les tuiles refusent de venir.
//
// Le repli Carto (basemaps.cartocdn.com) a cessé d'être gratuit sans y rien
// annoncer : il répond toujours 200 avec un vrai PNG, mais ce PNG porte
// désormais « API KEY REQUIRED » en filigrane sur chaque tuile — invisible à
// une vérification qui ne regarde que le code HTTP, trouvé en ouvrant l'image.
// Esri sert un plan clair équivalent, gratuit et sans clé, sans ce piège.

/**
 * Les fonds de carte, du meilleur au dernier recours.
 * `sombre: true` dit qu'un fond est déjà sombre et n'a pas besoin du filtre.
 */
export const FONDS = [
  {
    cle: "ign",
    nom: "IGN",
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png",
    attribution: "© IGN — Géoplateforme",
    zoom_max: 19,
  },
  {
    cle: "esri",
    nom: "Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
    zoom_max: 16,
  },
  {
    cle: "osm",
    nom: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    zoom_max: 19,
  },
];

// Une tuile manquante arrive : un trou au bord de la zone, un réseau qui
// hoquette. C'est la rafale qui dit qu'un fond est tombé, pas l'unité.
const ERREURS_AVANT_BASCULE = 6;

/**
 * Le fond de carte courant, et de quoi signaler une tuile qui n'arrive pas.
 * Au-delà de quelques refus, on passe au fond suivant sans rien demander :
 * mieux vaut une carte d'un autre fournisseur qu'une grille de 403.
 *
 * @returns {{fond: object, surErreur: Function, replis: number}}
 */
export function useFondDeCarte() {
  const [rang, setRang] = useState(0);
  const [erreurs, setErreurs] = useState(0);

  const surErreur = useCallback(() => {
    setErreurs((n) => {
      if (n + 1 < ERREURS_AVANT_BASCULE) return n + 1;
      setRang((r) => Math.min(FONDS.length - 1, r + 1));
      return 0;
    });
  }, []);

  const fond = useMemo(() => FONDS[Math.min(rang, FONDS.length - 1)], [rang]);
  return { fond, surErreur, replis: rang };
}
