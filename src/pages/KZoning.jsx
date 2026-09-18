import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Plus, FolderPlus, Folder, ChevronRight, Eye, EyeOff, Trash2, X, PieChart, Store, Loader2,
  ChevronLeft, Phone, Globe, Mail, Accessibility, UtensilsCrossed, Armchair, Clock, ExternalLink,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { J, JL } from "@/design/jetons";

// K-Zoning : on pose une zone sur la carte, on lit ce qu'il y a dedans.
//
// Le geste est celui que Jules a décrit : une adresse, un rayon autour d'elle,
// et la zone existe. Elle se garde, se range dans un dossier, et s'ouvre pour
// être lue — la population d'un côté, la concurrence de l'autre.
//
// La carte est blanche (classe k-carte-zoning) : le module se lit comme un
// plan, et les seules couleurs y sont les zones et les commerces. Les panneaux
// restent en verre sombre, comme partout ailleurs dans Klocka — deux systèmes
// visuels dans une même application se paient à chaque écran suivant.

const CENTRE_FRANCE = [46.6, 2.4];
const ZOOM_FRANCE = 6;
const RAYON_DEFAUT = 300;

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace(".", ",")} km` : `${m} m`);

// Les fonds de carte à comparer, le temps que Jules choisisse. Six designs
// bien distincts, tous gratuits et sans clé — et vérifiés à l'image, pas
// seulement au code HTTP : CARTO (Positron, Voyager, Dark Matter) répondait
// 200 avec un vrai PNG, mais ce PNG portait « API KEY REQUIRED » en filigrane
// sur chaque tuile. Ce service anonyme est mort, y compris là où Klocka s'y
// appuyait déjà en repli (src/lib/tuiles.js, corrigé au passage). Stadia
// (Toner, Alidade) répond franchement 401 sans compte. Une fois le choix
// fait, ce sélecteur disparaît et le fond retenu devient le seul, câblé en dur.
const STYLES_CARTE = [
  { cle: "ign", nom: "Plan IGN", url: "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png", attribution: "© IGN — Géoplateforme", zoom_max: 19, classe: "" },
  { cle: "clair", nom: "Clair", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", attribution: "© Esri", zoom_max: 16, classe: "" },
  { cle: "routier", nom: "Routier", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", attribution: "© Esri, © OpenStreetMap", zoom_max: 19, classe: "" },
  { cle: "relief", nom: "Relief", url: "https://a.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap, © OpenTopoMap (CC-BY-SA)", zoom_max: 17, classe: "" },
  { cle: "sombre", nom: "Sombre", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", attribution: "© Esri", zoom_max: 16, classe: "k-carte-zoning-sombre" },
  { cle: "satellite", nom: "Satellite", url: "https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg", attribution: "© IGN — Géoplateforme", zoom_max: 19, classe: "k-carte-zoning-sombre" },
];

/** Le sélecteur de fond de carte, le temps de choisir un design. */
function SelecteurFond({ style, setStyle }) {
  return (
    <div className="absolute bottom-4 left-1/2 z-[500] -translate-x-1/2 rounded-full border border-bord bg-fond/80 p-1 backdrop-blur-xl">
      <div className="flex items-center gap-0.5">
        {STYLES_CARTE.map((s) => (
          <button
            key={s.cle}
            onClick={() => setStyle(s.cle)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] transition-colors ${s.cle === style ? "bg-encre/[0.09] text-encre" : "text-ardoise hover:text-encre"}`}
          >
            {s.nom}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Le point d'une zone, marqué franchement : un halo, un anneau clair, un
 * cœur plein — pour se voir sur n'importe quel fond, pas seulement sur du
 * noir. Le bord du cercle qui l'entoure est plein, pas pointillé : c'est lui
 * qui doit se remarquer, pas s'estomper.
 */
function PointCentre({ centre, teinte = JL["menthe-fonce"] }) {
  return (
    <>
      <CircleMarker center={centre} radius={11} pathOptions={{ stroke: false, fillColor: teinte, fillOpacity: 0.22 }} />
      <CircleMarker center={centre} radius={6} pathOptions={{ color: JL["encre"], weight: 2, fillColor: teinte, fillOpacity: 1 }} />
      <CircleMarker center={centre} radius={2} pathOptions={{ stroke: false, fillColor: JL["encre"], fillOpacity: 1 }} />
    </>
  );
}

/** Le cercle d'une zone : un remplissage discret, un bord plein et net. */
const cercleZone = (teinte, ouvert) => ({
  color: teinte, weight: 2.5, opacity: 1, fillColor: teinte, fillOpacity: ouvert ? 0.16 : 0.08,
});

/** Recentre la carte quand la zone regardée change. */
function Cadrage({ centre, rayon_m }) {
  const map = useMap();
  const fait = useRef(null);
  const signature = centre ? `${centre[0].toFixed(5)},${centre[1].toFixed(5)},${rayon_m}` : null;
  useEffect(() => {
    if (!centre || fait.current === signature) return;
    fait.current = signature;
    // Le zoom se déduit du rayon : une zone de 200 m et une de 5 km ne se
    // regardent pas de la même hauteur.
    const z = rayon_m > 4000 ? 12 : rayon_m > 2000 ? 13 : rayon_m > 800 ? 14 : rayon_m > 400 ? 15 : 16;
    map.setView(centre, z);
  }, [map, signature]);
  return null;
}

/** La recherche d'adresse : Base Adresse Nationale, gratuite et sans clé. */
function ChercheAdresse({ onChoisi }) {
  const [texte, setTexte] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    const q = texte.trim();
    if (q.length < 3) { setSuggestions([]); return; }
    // On attend que la frappe se pose : une requête par lettre serait à la
    // fois inutile et impolie envers un service public.
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=6&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => ({
          libelle: x.properties?.label,
          contexte: x.properties?.context,
          lat: x.geometry?.coordinates?.[1],
          lon: x.geometry?.coordinates?.[0],
        })).filter((x) => x.libelle && Number.isFinite(x.lat) && Number.isFinite(x.lon)));
        setOuvert(true);
      } catch { /* BAN injoignable : on ne propose rien, la frappe continue */ }
    }, 250);
    return () => clearTimeout(t);
  }, [texte]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3">
        <Search className="h-4 w-4 flex-shrink-0 text-brume" />
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onFocus={() => setOuvert(true)}
          placeholder="Rechercher un point de départ, une adresse ou un lieu"
          className="h-10 w-full bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume"
        />
        {texte && (
          <button onClick={() => { setTexte(""); setSuggestions([]); }} className="text-brume hover:text-encre" aria-label="Effacer">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {ouvert && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-[46px] z-[500] m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => { onChoisi(s); setTexte(s.libelle); setOuvert(false); }}
                className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre"
              >
                {s.libelle}
                {s.contexte && <span className="ml-2 text-[11px] text-brume">{s.contexte}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Le rayon, une fois le point choisi : on le règle et la zone se dessine. */
function ReglageRayon({ point, rayon_m, setRayon, onCreer, onAnnuler, enCours }) {
  return (
    <div className="mt-2 rounded-[10px] border border-menthe/30 bg-menthe/[0.06] p-3">
      <p className="m-0 truncate text-[12.5px] text-encre">{point.libelle}</p>
      <div className="mt-3 flex items-baseline justify-between">
        <span className="alx-mont text-[11px] uppercase tracking-[.14em] text-brume">Rayon</span>
        <span className="text-[15px] tabular-nums text-menthe">{km(rayon_m)}</span>
      </div>
      <input
        type="range" min={50} max={5000} step={50} value={rayon_m}
        onChange={(e) => setRayon(Number(e.target.value))}
        className="mt-2 w-full accent-menthe"
        aria-label="Rayon de la zone"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={onCreer}
          disabled={enCours}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full text-[12px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-60"
          style={{ background: J["menthe"] }}
        >
          {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Créer la zone
        </button>
        <button onClick={onAnnuler} className="h-9 rounded-full border border-bord px-4 text-[12px] uppercase tracking-[.12em] text-ardoise hover:text-encre">
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Une zone dans la liste de gauche. */
function LigneZone({ zone, actif, visible, onOuvrir, onBasculerVisible, onSupprimer }) {
  return (
    <div className={`group flex items-center gap-2 border-l-2 px-3 py-2.5 transition-colors ${actif ? "border-menthe bg-relief" : "border-transparent hover:bg-surface"}`}>
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: J["vert"] }} />
      <button onClick={onOuvrir} className="min-w-0 flex-1 text-left">
        <p className="alx-mont m-0 truncate text-[12px] font-medium uppercase tracking-[.08em] text-encre">{zone.nom}</p>
        <p className="m-0 mt-0.5 text-[11px] text-brume">Rayon de {km(zone.rayon_m)}</p>
      </button>
      <button onClick={onBasculerVisible} className="flex-shrink-0 text-brume hover:text-encre" title={visible ? "Masquer sur la carte" : "Montrer sur la carte"}>
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button onClick={onSupprimer} className="flex-shrink-0 text-brume opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100" title="Supprimer la zone">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Les sept onglets de lecture d'une zone. */
const ONGLETS_INFOS = [
  "Informations clés", "Population", "Ménages et familles",
  "Diplôme et éducation", "Revenus", "Logement", "Mobilité",
];

const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));
const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

/** Un chiffre-clé : la valeur, son libellé, une précision. */
function Cle({ valeur, label, detail = null }) {
  return (
    <div className="rounded-[12px] border border-trait bg-surface px-3.5 py-3">
      <p className="m-0 text-[20px] font-medium tabular-nums text-encre">{valeur}</p>
      <p className="alx-mont m-0 mt-1 text-[10.5px] uppercase tracking-[.12em] text-brume">{label}</p>
      {detail && <p className="m-0 mt-1 text-[11.5px] text-ardoise">{detail}</p>}
    </div>
  );
}

/** Une répartition en barres : des parts qui se comparent d'un coup d'œil. */
function Barres({ titre, parts }) {
  const lignes = Object.entries(parts || {}).filter(([, v]) => v != null);
  if (!lignes.length) return null;
  const max = Math.max(...lignes.map(([, v]) => v), 1);
  return (
    <div className="mt-5">
      <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">{titre}</p>
      <div className="space-y-1.5">
        {lignes.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-24 flex-shrink-0 text-[11.5px] text-ardoise">{k}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-relief">
              <span className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: J["menthe"] }} />
            </span>
            <span className="w-12 flex-shrink-0 text-right text-[11.5px] tabular-nums text-encre">{pct(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Une liste de comptes : des équipements, par famille. */
function Comptes({ lignes, vide }) {
  if (!lignes?.length) return <p className="mt-3 mb-0 text-[12.5px] text-brume">{vide}</p>;
  return (
    <ul className="m-0 mt-3 list-none space-y-px p-0">
      {lignes.map((l) => (
        <li key={l.nom} className="flex items-baseline justify-between border-b border-trait py-2">
          <span className="text-[13px] text-craie">{l.nom}</span>
          <span className="text-[13px] tabular-nums text-encre">{l.nombre}</span>
        </li>
      ))}
    </ul>
  );
}

function Source({ children }) {
  return <p className="mt-5 mb-0 text-[11px] leading-[1.6] text-brume">{children}</p>;
}

const SOURCE_INSEE = "Source : INSEE, Filosofi, carreaux de 200 m. Les carreaux dont le centre tombe dans la zone sont additionnés.";
const SOURCE_OSM = "Source : OpenStreetMap, ce qui est cartographié dans la zone.";

function ContenuOnglet({ onglet, zone, lecture }) {
  const i = lecture?.insee;
  const e = lecture?.equipements;
  const grille = "mt-3 grid grid-cols-2 gap-2";

  if (onglet === "Informations clés") {
    return (
      <>
        <div className={grille}>
          <Cle valeur={fmt(i?.population.habitants)} label="Habitants" detail={i?.population.densite_km2 ? `${fmt(i.population.densite_km2)} hab./km²` : null} />
          <Cle valeur={fmt(i?.menages.menages)} label="Ménages" detail={i?.menages.taille_moyenne ? `${String(i.menages.taille_moyenne).replace(".", ",")} pers. par ménage` : null} />
          <Cle valeur={euros(i?.revenus.niveau_de_vie_moyen)} label="Niveau de vie moyen" detail="par personne et par an" />
          <Cle valeur={pct(i?.revenus.taux_pauvrete)} label="Ménages pauvres" />
          <Cle valeur={fmt(e?.commerces)} label="Commerces" detail={e ? (e.vacants ? `dont ${e.vacants} ${e.vacants > 1 ? "locaux vacants" : "local vacant"}` : "aucun local vacant relevé") : null} />
          <Cle valeur={fmt(e?.restauration)} label="Restaurants, cafés, bars" />
        </div>
        {e && (
          <p className="mt-4 mb-0 text-[12.5px] leading-[1.7] text-ardoise">
            {[e.metro && "métro", e.tram && "tramway", e.gare && "gare"].filter(Boolean).length
              ? `Desservie par ${[e.metro && "le métro", e.tram && "le tramway", e.gare && "une gare"].filter(Boolean).join(", ")}.`
              : "Ni métro, ni tramway, ni gare dans la zone."}
            {i?.communes?.length ? ` Commune${i.communes.length > 1 ? "s" : ""} : ${i.communes.join(", ")}.` : ""}
          </p>
        )}
        <Source>{SOURCE_INSEE} {SOURCE_OSM}</Source>
      </>
    );
  }

  if (onglet === "Population") {
    return (
      <>
        <div className={grille}>
          <Cle valeur={fmt(i?.population.habitants)} label="Habitants" />
          <Cle valeur={fmt(i?.population.densite_km2)} label="Habitants au km²" />
          <Cle valeur={pct(i?.population.part_moins_18)} label="Moins de 18 ans" />
          <Cle valeur={pct(i?.population.part_65_plus)} label="65 ans et plus" />
        </div>
        <Barres titre="Par tranche d'âge" parts={i?.population.ages} />
        <Source>{SOURCE_INSEE}</Source>
      </>
    );
  }

  if (onglet === "Ménages et familles") {
    return (
      <>
        <div className={grille}>
          <Cle valeur={fmt(i?.menages.menages)} label="Ménages" />
          <Cle valeur={i?.menages.taille_moyenne ? String(i.menages.taille_moyenne).replace(".", ",") : "—"} label="Personnes par ménage" />
          <Cle valeur={pct(i?.menages.part_une_personne)} label="Personnes seules" />
          <Cle valeur={pct(i?.menages.part_cinq_et_plus)} label="Ménages de 5 et plus" />
          <Cle valeur={pct(i?.menages.part_monoparentales)} label="Familles monoparentales" />
          <Cle valeur={pct(i?.menages.part_proprietaires)} label="Propriétaires" />
        </div>
        <Source>{SOURCE_INSEE}</Source>
      </>
    );
  }

  if (onglet === "Diplôme et éducation") {
    return (
      <>
        <p className="mt-3 mb-0 text-[12.5px] leading-[1.7] text-ardoise">
          L&apos;INSEE ne publie pas le niveau de diplôme à cette échelle. Voici les lieux d&apos;enseignement de la zone.
        </p>
        <Comptes lignes={e?.enseignement} vide="Aucun lieu d'enseignement cartographié dans la zone." />
        {e?.ecoles?.length > 0 && (
          <ul className="m-0 mt-4 list-none space-y-1 p-0">
            {e.ecoles.map((x, k) => (
              <li key={k} className="text-[12.5px] text-craie">{x.nom} <span className="text-brume">· {x.genre}</span></li>
            ))}
          </ul>
        )}
        <Source>{SOURCE_OSM}</Source>
      </>
    );
  }

  if (onglet === "Revenus") {
    return (
      <>
        <div className={grille}>
          <Cle valeur={euros(i?.revenus.niveau_de_vie_moyen)} label="Niveau de vie moyen" detail="par personne et par an" />
          <Cle valeur={pct(i?.revenus.taux_pauvrete)} label="Taux de pauvreté" detail={i?.revenus.menages_pauvres != null ? `${fmt(i.revenus.menages_pauvres)} ménages` : null} />
        </div>
        <p className="mt-4 mb-0 text-[12.5px] leading-[1.7] text-ardoise">
          Le niveau de vie est le revenu disponible du ménage rapporté à sa taille : il se compare d&apos;une zone à l&apos;autre.
          Un ménage est pauvre sous 60 % du niveau de vie médian national.
        </p>
        <Source>{SOURCE_INSEE}</Source>
      </>
    );
  }

  if (onglet === "Logement") {
    return (
      <>
        <div className={grille}>
          <Cle valeur={pct(i?.logement.part_collectif)} label="En immeuble" />
          <Cle valeur={pct(i?.logement.part_maisons)} label="En maison" />
          <Cle valeur={pct(i?.logement.part_social)} label="Logement social" />
          <Cle valeur={i?.logement.surface_moyenne_m2 ? `${fmt(i.logement.surface_moyenne_m2)} m²` : "—"} label="Surface moyenne" />
        </div>
        <Barres titre="Période de construction" parts={i?.logement.construction} />
        <Source>{SOURCE_INSEE}</Source>
      </>
    );
  }

  if (onglet === "Mobilité") {
    return (
      <>
        <div className={grille}>
          <Cle valeur={e?.metro ? "Oui" : "Non"} label="Métro" />
          <Cle valeur={e?.tram ? "Oui" : "Non"} label="Tramway" />
        </div>
        <Comptes lignes={e?.mobilite} vide="Aucun transport ni stationnement cartographié dans la zone." />
        <Source>{SOURCE_OSM}</Source>
      </>
    );
  }
  return null;
}

function PanneauInformations({ zone }) {
  const [onglet, setOnglet] = useState(ONGLETS_INFOS[0]);
  // Deux sources, deux requêtes : l'INSEE répond en quelques secondes,
  // OpenStreetMap parfois en deux minutes à froid. Les onglets d'habitants
  // s'affichent dès que l'INSEE est là, les équipements se posent ensuite.
  const insee = useQuery({
    queryKey: ["kzoning-lecture", "insee", zone.id],
    queryFn: () => base44.request("GET", `/api/kzoning/zones/${zone.id}/lecture?source=insee`),
    staleTime: 10 * 60 * 1000,
  });
  const equipements = useQuery({
    queryKey: ["kzoning-lecture", "equipements", zone.id],
    queryFn: () => base44.request("GET", `/api/kzoning/zones/${zone.id}/lecture?source=equipements`),
    staleTime: 10 * 60 * 1000,
  });
  const isLoading = insee.isLoading;
  const error = insee.error;
  const lecture = insee.data ? { ...insee.data, ...(equipements.data || {}), equipements_en_attente: equipements.isLoading, equipements_echec: equipements.error?.message || null } : null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5 border-b border-trait px-4 pb-3 pt-3">
        {ONGLETS_INFOS.map((o) => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            className={`rounded-full px-3 py-1.5 text-[11.5px] transition-colors ${o === onglet ? "bg-encre/[0.07] text-encre" : "text-ardoise hover:text-encre"}`}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <p className="alx-mont m-0 text-[11px] uppercase tracking-[.16em] text-menthe">{onglet}</p>
          <span className="text-[11px] text-brume">rayon de {km(zone.rayon_m)}</span>
        </div>
        {isLoading && (
          <p className="mt-4 mb-0 flex items-center gap-2 text-[12.5px] text-brume">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> L&apos;INSEE répond…
          </p>
        )}
        {error && <p className="mt-4 mb-0 text-[12.5px] text-alerte">{error.message || "La lecture n'a pas abouti."}</p>}
        {lecture && (
          <>
            {lecture.insee_erreur && <p className="mt-3 mb-0 text-[12px] text-alerte">{lecture.insee_erreur}</p>}
            {(lecture.equipements_erreur || lecture.equipements_echec) && <p className="mt-3 mb-0 text-[12px] text-alerte">{lecture.equipements_erreur || lecture.equipements_echec}</p>}
            {lecture.equipements_en_attente && (
              <p className="mt-3 mb-0 flex items-center gap-2 text-[11.5px] text-brume">
                <Loader2 className="h-3 w-3 animate-spin" /> OpenStreetMap relève les commerces et les transports…
              </p>
            )}
            {lecture.insee && lecture.insee.carreaux === 0 && (
              <p className="mt-3 mb-0 text-[12px] text-ardoise">Aucun carreau INSEE habité dans la zone : personne n&apos;y réside, ou le rayon est trop petit.</p>
            )}
            <ContenuOnglet onglet={onglet} zone={zone} lecture={lecture} />
          </>
        )}
      </div>
    </>
  );
}

/** Une ligne d'information dans la fiche d'un commerce : une icône, un texte. */
function LigneFiche({ icone: Icone, children, lien = null }) {
  const corps = (
    <>
      <Icone className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
      <span className="min-w-0 flex-1 text-[13px] text-craie">{children}</span>
    </>
  );
  if (!lien) return <div className="flex items-center gap-2.5 py-1.5">{corps}</div>;
  return (
    <a href={lien} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 py-1.5 hover:text-encre">
      {corps}
    </a>
  );
}

const PMR = { yes: "Accessible aux personnes à mobilité réduite", limited: "Accès partiellement adapté", no: "Non accessible aux personnes à mobilité réduite" };

/**
 * La fiche d'un commerce, au clic sur une ligne ou sur la carte. Chaque champ
 * vient tel quel de sa fiche OpenStreetMap ; un champ absent ne s'affiche pas
 * — on ne comble jamais un trou par une supposition.
 */
function FicheCommerce({ commerce: c, labelGenre, onRetour }) {
  return (
    <div className="px-4 py-4">
      <button onClick={onRetour} className="mb-3 flex items-center gap-1.5 text-[11.5px] text-ardoise hover:text-encre">
        <ChevronLeft className="h-3.5 w-3.5" /> Retour à la liste
      </button>

      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.14em] text-menthe">
        {c.vacant ? "Local vacant" : labelGenre(c.genre)}
      </p>
      <h3 className="mt-1 mb-0 text-[18px] font-medium leading-tight text-encre">
        {c.nom || (c.vacant ? "Local sans enseigne" : "Sans nom relevé")}
      </h3>
      {c.adresse && <p className="mt-1 mb-0 text-[12.5px] text-brume">{c.adresse}</p>}
      <p className="mt-1 mb-0 text-[11px] text-brume">à {c.distance_m} m du centre de la zone</p>

      <div className="mt-4 border-t border-trait pt-1">
        {c.horaires && <LigneFiche icone={Clock}>Horaires : {c.horaires}</LigneFiche>}
        {c.telephone && <LigneFiche icone={Phone} lien={`tel:${c.telephone.replace(/\s+/g, "")}`}>{c.telephone}</LigneFiche>}
        {c.site && <LigneFiche icone={Globe} lien={c.site}>{c.site.replace(/^https?:\/\//, "")}</LigneFiche>}
        {c.email && <LigneFiche icone={Mail} lien={`mailto:${c.email}`}>{c.email}</LigneFiche>}
        {c.pmr && <LigneFiche icone={Accessibility}>{PMR[c.pmr] || c.pmr}</LigneFiche>}
        {c.cuisine && <LigneFiche icone={UtensilsCrossed}>Cuisine : {c.cuisine.replace(/_/g, " ")}</LigneFiche>}
        {c.terrasse != null && <LigneFiche icone={Armchair}>{c.terrasse ? "Avec terrasse" : "Sans terrasse"}</LigneFiche>}
      </div>

      {!(c.horaires || c.telephone || c.site || c.email || c.pmr || c.cuisine || c.terrasse != null) && (
        <p className="mt-4 mb-0 text-[12px] text-brume">OpenStreetMap ne porte pas d&apos;autre information sur ce local.</p>
      )}

      <div className="mt-5 flex gap-2 border-t border-trait pt-4">
        <a href={`https://www.openstreetmap.org/${c.id}`} target="_blank" rel="noreferrer"
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-bord text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
          OpenStreetMap <ExternalLink className="h-3 w-3" />
        </a>
        <a href={`https://www.google.com/maps?q=${c.lat},${c.lon}`} target="_blank" rel="noreferrer"
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-bord text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
          Google Maps <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/** La concurrence dans la zone : on choisit des métiers, on les relève. */
function PanneauConcurrence({ zone, onCommerces, commerceOuvert, setCommerceOuvert }) {
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState([]);
  const [releve, setReleve] = useState(null);

  const { data: referentiel } = useQuery({
    queryKey: ["kzoning-metiers"],
    queryFn: () => base44.request("GET", "/api/kzoning/metiers"),
    staleTime: Infinity,
  });
  const metiers = referentiel?.metiers || [];

  // Le référentiel des métiers dit déjà quelle étiquette OpenStreetMap
  // correspond à quel nom français ; on la relit pour l'afficher, plutôt que
  // de tenir un second dictionnaire qui finirait par diverger du premier.
  const labelGenre = useMemo(() => {
    const table = new Map();
    for (const m of metiers) for (const f of m.filtres || []) for (const v of f.valeurs || []) if (!table.has(v)) table.set(v, m.nom);
    return (genre) => table.get(genre) || genre || "Commerce";
  }, [metiers]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return metiers;
    return metiers.filter((m) => m.nom.toLowerCase().includes(q) || (m.categorie || "").toLowerCase().includes(q));
  }, [metiers, recherche]);

  const relever = useMutation({
    mutationFn: () => base44.request("POST", `/api/kzoning/zones/${zone.id}/commerces`, { body: { metiers: choisis } }),
    onSuccess: (r) => {
      setReleve(r);
      // Les commerces remontent à la page : la liste seule ne dit pas si la
      // concurrence est en face ou à l'autre bout de la zone.
      onCommerces?.(r.commerces || []);
      if (!r.commerces?.length) toast.info("Aucun commerce de ce type dans la zone");
    },
    onError: (e) => toast.error(e?.message || "Le relevé n'a pas abouti"),
  });

  const basculer = (nom) => setChoisis((c) => (c.includes(nom) ? c.filter((x) => x !== nom) : [...c, nom]));

  if (commerceOuvert) {
    return <FicheCommerce commerce={commerceOuvert} labelGenre={labelGenre} onRetour={() => setCommerceOuvert(null)} />;
  }

  if (releve) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="alx-mont m-0 text-[11px] uppercase tracking-[.16em] text-menthe">
            {releve.commerces.length} commerce{releve.commerces.length > 1 ? "s" : ""}
          </p>
          <button onClick={() => { setReleve(null); onCommerces?.([]); }} className="text-[11.5px] text-ardoise hover:text-encre">Changer de métier</button>
        </div>
        <p className="mt-1 mb-0 text-[11px] text-brume">
          {choisis.length ? choisis.join(", ") : "Tous les commerces"} · rayon de {km(zone.rayon_m)}
        </p>
        <ul className="mt-4 m-0 list-none space-y-px p-0">
          {releve.commerces.map((c) => (
            <li key={c.id}>
              <button onClick={() => setCommerceOuvert(c)} className="flex w-full items-baseline gap-3 border-b border-trait py-2.5 text-left hover:bg-surface">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-encre">
                    {c.nom || (c.vacant ? "Local vacant" : "Sans nom")}
                  </span>
                  {c.adresse && <span className="block truncate text-[11px] text-brume">{c.adresse}</span>}
                </span>
                <span className="flex-shrink-0 text-[11px] tabular-nums text-ardoise">{c.distance_m} m</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-trait px-4 pb-3 pt-3">
        <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3">
          <Search className="h-4 w-4 flex-shrink-0 text-brume" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un métier"
            className="h-9 w-full bg-transparent text-[13px] text-encre outline-none placeholder:text-brume"
          />
        </div>
      </div>
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto px-4 py-2">
        <button
          onClick={() => setChoisis([])}
          className={`mb-1 flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${choisis.length === 0 ? "border-menthe/40 bg-menthe/[0.08]" : "border-trait hover:bg-surface"}`}
        >
          <span className={`h-3.5 w-3.5 flex-shrink-0 rounded-full border ${choisis.length === 0 ? "border-menthe bg-menthe" : "border-bord-vif"}`} />
          <span className="text-[13px] text-encre">Tous les commerces</span>
        </button>
        {filtres.map((m) => {
          const actif = choisis.includes(m.nom);
          return (
            <button
              key={m.nom}
              onClick={() => basculer(m.nom)}
              className={`mb-1 flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${actif ? "border-menthe/40 bg-menthe/[0.08]" : "border-trait hover:bg-surface"}`}
            >
              <span className={`h-3.5 w-3.5 flex-shrink-0 rounded-full border ${actif ? "border-menthe bg-menthe" : "border-bord-vif"}`} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-encre">{m.nom}</span>
              <span className="flex-shrink-0 text-[11px] text-brume">{m.categorie}</span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-trait p-3">
        <button
          onClick={() => relever.mutate()}
          disabled={relever.isPending}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-full text-[12px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-60"
          style={{ background: J["menthe"] }}
        >
          {relever.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Valider ma sélection
        </button>
      </div>
    </>
  );
}

export default function KZoning() {
  const user = useUser();
  const qc = useQueryClient();
  // Cinq fonds à comparer, le temps que Jules choisisse : voir SelecteurFond.
  const [styleFond, setStyleFond] = useState(STYLES_CARTE[0].cle);
  const fond = STYLES_CARTE.find((s) => s.cle === styleFond) || STYLES_CARTE[0];

  const [point, setPoint] = useState(null);
  const [rayon, setRayon] = useState(RAYON_DEFAUT);
  // La zone créée, le champ d'adresse repart à vide. Sans cela il gardait son
  // texte, ses suggestions revenaient et se posaient par-dessus la liste des
  // zones : on ne voyait plus ce qu'on venait de créer.
  const [rechercheNeuve, setRechercheNeuve] = useState(0);
  const [zoneOuverte, setZoneOuverte] = useState(null);
  const [mode, setMode] = useState("infos");
  const [masquees, setMasquees] = useState(() => new Set());
  const [filtreZone, setFiltreZone] = useState("");
  const [commerces, setCommerces] = useState([]);
  const [commerceOuvert, setCommerceOuvert] = useState(null);

  const { data } = useQuery({
    queryKey: ["kzoning-zones"],
    queryFn: () => base44.request("GET", "/api/kzoning/zones"),
    enabled: user?.role === "admin",
  });
  const zones = data?.zones || [];
  const dossiers = data?.dossiers || [];
  const invalider = () => qc.invalidateQueries({ queryKey: ["kzoning-zones"] });

  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/kzoning/zones", {
      body: { adresse: point.libelle, lat: point.lat, lon: point.lon, rayon_m: rayon },
    }),
    onSuccess: (r) => {
      toast.success(`Zone créée : ${r.zone.nom}`);
      setPoint(null);
      setRayon(RAYON_DEFAUT);
      setRechercheNeuve((n) => n + 1);
      setZoneOuverte(r.zone);
      setMode("infos");
      invalider();
    },
    onError: (e) => toast.error(e?.message || "La zone n'a pas pu être créée"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kzoning/zones/${id}`),
    onSuccess: (_, id) => {
      if (zoneOuverte?.id === id) setZoneOuverte(null);
      invalider();
    },
  });

  const nouveauDossier = useMutation({
    mutationFn: (nom) => base44.request("POST", "/api/kzoning/dossiers", { body: { nom } }),
    onSuccess: invalider,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Les commerces relevés se posent aussi sur la carte : une liste sans les
  // points ne dit pas si la concurrence est en face ou à l'autre bout.
  useEffect(() => { setCommerces([]); setCommerceOuvert(null); }, [zoneOuverte?.id, mode]);

  if (!user || user.role !== "admin") return null;

  const visibles = zones.filter((z) => !masquees.has(z.id));
  const sansDossier = zones.filter((z) => !z.dossier_id);
  const cherchees = filtreZone.trim()
    ? zones.filter((z) => z.nom.toLowerCase().includes(filtreZone.trim().toLowerCase()))
    : null;
  const centreOuvert = zoneOuverte ? [Number(zoneOuverte.centre_lat), Number(zoneOuverte.centre_lon)] : null;

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full overflow-hidden">
      {/* La carte, en fond */}
      <div className={`k-carte-zoning absolute inset-0 ${fond.classe}`}>
        <MapContainer center={CENTRE_FRANCE} zoom={ZOOM_FRANCE} className="h-full w-full" zoomControl={false} attributionControl>
          {/* `key` : changer de fournisseur en cours de route laisse parfois
              des tuiles de l'ancien visibles par-dessus le nouveau tant que le
              panneau ne recharge pas la couche entière. */}
          <TileLayer key={fond.cle} url={fond.url} attribution={fond.attribution} maxZoom={fond.zoom_max} />
          {visibles.map((z) => (
            <Circle
              key={z.id}
              center={[Number(z.centre_lat), Number(z.centre_lon)]}
              radius={Number(z.rayon_m)}
              pathOptions={cercleZone(JL["menthe-fonce"], zoneOuverte?.id === z.id)}
              eventHandlers={{ click: () => { setZoneOuverte(z); setMode("infos"); } }}
            />
          ))}
          {zoneOuverte && !point && <PointCentre centre={centreOuvert} />}
          {/* L'aperçu avant validation : le point et son rayon, dans le même
              habillage qu'une zone posée — un bord plein et net, pas pointillé. */}
          {point && (
            <>
              <Circle center={[point.lat, point.lon]} radius={rayon} pathOptions={cercleZone(JL["menthe-fonce"], true)} />
              <PointCentre centre={[point.lat, point.lon]} />
            </>
          )}
          {commerces.map((c) => (
            <CircleMarker key={c.id} center={[c.lat, c.lon]} radius={4}
              eventHandlers={{ click: () => setCommerceOuvert(c) }}
              pathOptions={{ color: c.vacant ? JL["ambre"] : JL["alerte"], fillColor: c.vacant ? JL["ambre"] : JL["alerte"], fillOpacity: 0.9, weight: 1 }} />
          ))}
          <Cadrage centre={point ? [point.lat, point.lon] : centreOuvert} rayon_m={point ? rayon : zoneOuverte?.rayon_m || 0} />
        </MapContainer>
      </div>
      <SelecteurFond style={styleFond} setStyle={setStyleFond} />

      {/* Le panneau de gauche : chercher, créer, retrouver */}
      <div className="absolute left-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[16px] border border-bord bg-fond/70 backdrop-blur-xl">
        <div className="flex-shrink-0 p-3">
          <ChercheAdresse key={rechercheNeuve} onChoisi={(s) => { setPoint(s); setRayon(RAYON_DEFAUT); }} />
          {point && (
            <ReglageRayon
              point={point} rayon_m={rayon} setRayon={setRayon}
              onCreer={() => creer.mutate()} onAnnuler={() => setPoint(null)} enCours={creer.isPending}
            />
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-trait px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-bord bg-surface px-3">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
            <input
              value={filtreZone}
              onChange={(e) => setFiltreZone(e.target.value)}
              placeholder="Chercher une zone"
              className="h-8 w-full bg-transparent text-[12.5px] text-encre outline-none placeholder:text-brume"
            />
          </div>
          <button
            onClick={() => {
              const nom = window.prompt("Nom du dossier");
              if (nom?.trim()) nouveauDossier.mutate(nom.trim());
            }}
            className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border border-bord px-3 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre"
            title="Créer un dossier"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {cherchees ? (
            cherchees.length ? cherchees.map((z) => (
              <LigneZone
                key={z.id} zone={z} actif={zoneOuverte?.id === z.id} visible={!masquees.has(z.id)}
                onOuvrir={() => { setZoneOuverte(z); setMode("infos"); }}
                onBasculerVisible={() => setMasquees((s) => { const n = new Set(s); n.has(z.id) ? n.delete(z.id) : n.add(z.id); return n; })}
                onSupprimer={() => supprimer.mutate(z.id)}
              />
            )) : <p className="m-0 px-3 py-6 text-center text-[12.5px] text-brume">Aucune zone de ce nom.</p>
          ) : (
            <>
              {dossiers.map((d) => (
                <div key={d.id} className="border-b border-trait">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
                    <Folder className="h-3.5 w-3.5 flex-shrink-0 text-ardoise" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-encre">{d.nom}</span>
                    <span className="flex-shrink-0 text-[11px] tabular-nums text-brume">({d.zones})</span>
                  </div>
                  {zones.filter((z) => z.dossier_id === d.id).map((z) => (
                    <LigneZone
                      key={z.id} zone={z} actif={zoneOuverte?.id === z.id} visible={!masquees.has(z.id)}
                      onOuvrir={() => { setZoneOuverte(z); setMode("infos"); }}
                      onBasculerVisible={() => setMasquees((s) => { const n = new Set(s); n.has(z.id) ? n.delete(z.id) : n.add(z.id); return n; })}
                      onSupprimer={() => supprimer.mutate(z.id)}
                    />
                  ))}
                </div>
              ))}
              <p className="alx-mont m-0 px-3 pb-1 pt-3 text-[11px] uppercase tracking-[.16em] text-brume">Zones sans dossier</p>
              {sansDossier.length ? sansDossier.map((z) => (
                <LigneZone
                  key={z.id} zone={z} actif={zoneOuverte?.id === z.id} visible={!masquees.has(z.id)}
                  onOuvrir={() => { setZoneOuverte(z); setMode("infos"); }}
                  onBasculerVisible={() => setMasquees((s) => { const n = new Set(s); n.has(z.id) ? n.delete(z.id) : n.add(z.id); return n; })}
                  onSupprimer={() => supprimer.mutate(z.id)}
                />
              )) : (
                <p className="m-0 px-3 py-6 text-center text-[12.5px] leading-[1.6] text-brume">
                  Cherchez une adresse, réglez le rayon : votre première zone se pose en deux gestes.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Le panneau de droite : ce qu'on lit dans la zone ouverte */}
      {zoneOuverte && (
        <div className="absolute right-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[420px] max-w-[calc(100vw-2rem)]">
          {/* Le rail des modes, à gauche du panneau */}
          <div className="mr-2 flex flex-shrink-0 flex-col gap-2">
            {[
              { cle: "infos", icone: PieChart, titre: "Informations dans la zone" },
              { cle: "concurrence", icone: Store, titre: "Concurrence dans la zone" },
            ].map(({ cle, icone: Icone, titre }) => (
              <button
                key={cle}
                onClick={() => setMode(cle)}
                title={titre}
                className={`flex h-10 w-10 items-center justify-center rounded-[12px] border backdrop-blur-xl transition-colors ${
                  mode === cle ? "border-menthe/40 bg-relief text-encre" : "border-bord bg-fond/70 text-ardoise hover:text-encre"
                }`}
              >
                <Icone className="h-[18px] w-[18px]" />
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-bord bg-fond/70 backdrop-blur-xl">
            <div className="flex flex-shrink-0 items-start gap-3 border-b border-trait p-4">
              <div className="min-w-0 flex-1">
                <p className="alx-mont m-0 text-[11px] uppercase tracking-[.16em] text-menthe">
                  {mode === "infos" ? "Informations dans la zone" : "Concurrence dans la zone"}
                </p>
                <h2 className="mt-1 mb-0 truncate text-[17px] font-medium text-encre">{zoneOuverte.nom}</h2>
              </div>
              <button onClick={() => setZoneOuverte(null)} className="flex-shrink-0 text-brume hover:text-encre" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mode === "infos"
                ? <PanneauInformations zone={zoneOuverte} />
                : <PanneauConcurrence zone={zoneOuverte} onCommerces={setCommerces} commerceOuvert={commerceOuvert} setCommerceOuvert={setCommerceOuvert} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
