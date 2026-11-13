import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Search, Plus, Eye, EyeOff, Trash2, X, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { createPageUrl } from "@/utils";
import CarteGoogleZones, { TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import FicheSociete from "@/components/kzoning/FicheSociete";
import { BoutonMecanique } from "@/components/kdata/Mecanique";
import { BoutonPrincipal, BoutonOutil, CLASSE_CARTE, Filtres, Recherche, TRANSPARENT } from "@/components/mandataire/elements";

// K-Zoning : on pose une zone sur la carte, on lit ce qu'il y a dedans.
//
// Le geste est celui que Jules a décrit : une adresse, un rayon autour d'elle,
// et la zone existe. Elle se garde, se range dans un dossier, et s'ouvre pour
// être lue — la population d'un côté, la concurrence de l'autre.
//
// La carte est blanche (classe k-carte-zoning) : le module se lit comme un
// plan, et les seules couleurs y sont les zones et les commerces.
//
// 10 nov. 2026, Jules : planche Outils. La page est une page de Klocka (barre
// de navigation à gauche, plus de barre du haut) : la carte la remplit, les
// panneaux s'y posent en cartes (rayon 12, filet, fond `rail`, sans flou), avec
// les éléments du CRM (boutons et recherche de 32 px, filtres de 28 px, lignes).
// En haut à droite, la cloche de Layout : le panneau de droite commence dessous.

// Les panneaux posés sur la carte (10 nov. 2026, Jules : planche Outils).
const PANNEAU = `${CLASSE_CARTE} absolute flex flex-col gap-3 overflow-hidden p-4`;
const TITRE_GROUPE = "m-0 text-[12px] uppercase tracking-[.04em] text-brume";

const CENTRE_FRANCE = [46.6, 2.4];
const ZOOM_FRANCE = 6;
const RAYON_DEFAUT = 300;

// La mécanique : dans quel ordre K-Zoning interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée : latitude, longitude, commune." },
  { source: "OpenStreetMap (Overpass)", quoi: "Les commerces et les équipements de la zone : devanture, nom, métier, local vacant compris. Une même zone n'est réinterrogée qu'une fois par demi-journée." },
  { source: "INSEE Filosofi", quoi: "Population, ménages, revenus et logement, par carreaux de 200 m dont le centre tombe dans la zone." },
  { source: "Annuaire des entreprises", quoi: "La société derrière une devanture cliquée, par SIRET ou par proximité." },
  { source: "Google Maps", quoi: "Le fond de carte et ses trois habillages." },
];

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace(".", ",")} km` : `${m} m`);


/** Le fond de carte : les types de Google, puisque la carte est la sienne. */
function SelecteurFond({ type, setType, cacheMobile = false }) {
  // Au téléphone, la fiche d'une zone s'ouvre en bas : le sélecteur lui cède la place.
  // 10 nov. 2026, Jules : planche Outils. Une pilule de boutons ronds en bas au centre, sur `rail`.
  return (
    <div role="group" aria-label="Fond de carte" className={`absolute bottom-6 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-trait bg-rail p-[3px] ${cacheMobile ? "max-md:hidden" : ""} max-md:bottom-[calc(env(safe-area-inset-bottom)+12px)] max-md:left-3 max-md:translate-x-0`}>
      {TYPES_CARTE.map((t) => (
        <button
          key={t.cle}
          type="button"
          onClick={() => setType(t.cle)}
          aria-pressed={t.cle === type}
          className={`rounded-full px-3 py-1 text-[13px] transition-colors max-md:h-9 ${t.cle === type ? "bg-rail-actif text-encre" : "text-ardoise hover:text-encre"}`}
          style={t.cle === type ? undefined : TRANSPARENT}
        >
          {t.nom}
        </button>
      ))}
    </div>
  );
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
        const r = await fetch(`https://data.geopf.fr/geocodage/search/?autocomplete=1&limit=6&q=${encodeURIComponent(q)}`);
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
      {/* 10 nov. 2026, Jules : planche Outils. La recherche ronde du CRM (32 px, `relief`). */}
      <label className="flex h-8 items-center gap-2 rounded-full bg-relief px-3.5 text-ardoise focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10">
        <Search className="h-3.5 w-3.5 flex-none" />
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onFocus={() => setOuvert(true)}
          placeholder="Une adresse ou un lieu"
          aria-label="Rechercher une adresse ou un lieu"
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]"
        />
        {texte && (
          <button type="button" onClick={() => { setTexte(""); setSuggestions([]); }} className="text-brume hover:text-encre max-md:-mr-2 max-md:p-2" style={TRANSPARENT} aria-label="Effacer">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </label>
      {ouvert && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-[38px] z-[500] m-0 list-none overflow-hidden rounded-[14px] border border-trait bg-rail p-0 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:top-[46px]">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => { onChoisi(s); setTexte(s.libelle); setOuvert(false); }}
                className="block w-full px-3.5 py-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre"
                style={TRANSPARENT}
              >
                {s.libelle}
                {s.contexte && <span className="ml-2 text-[12.5px] text-brume">{s.contexte}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Le rayon, une fois le point choisi : on le règle et la zone se dessine. */
// 10 nov. 2026, Jules : planche Outils. Une carte bordée : l'adresse, « Rayon » et sa valeur, le curseur, puis
// « Créer la zone » (principal) et « Zone de chalandise » (outil) ; la croix annule le point.
function ReglageRayon({ point, rayon_m, setRayon, onCreer, onAnnuler, onChalandise, enCours }) {
  return (
    <div className="flex flex-none flex-col gap-2.5 rounded-[12px] border border-trait p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-[13.5px] text-encre" title={point.libelle}>{point.libelle}</span>
        <button type="button" onClick={onAnnuler} aria-label="Annuler" title="Annuler" className="-m-1 flex-none p-1 text-brume hover:text-encre" style={TRANSPARENT}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">
        <span className="flex justify-between">Rayon <span className="tabular-nums text-encre">{km(rayon_m)}</span></span>
        <input
          type="range" min={50} max={5000} step={50} value={rayon_m}
          onChange={(e) => setRayon(Number(e.target.value))}
          className="w-full accent-menthe"
          aria-label="Rayon de la zone"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <BoutonPrincipal onClick={onCreer} disabled={enCours}>
          {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Créer la zone
        </BoutonPrincipal>
        <BoutonOutil onClick={onChalandise}>Zone de chalandise</BoutonOutil>
      </div>
    </div>
  );
}

/** Une zone dans la liste de gauche : une ligne, son état à droite (10 nov. 2026, Jules : planche Outils). */
function LigneZone({ zone, actif, visible, onOuvrir, onBasculerVisible, onSupprimer }) {
  return (
    <div className={`group flex min-h-[42px] items-center gap-2 border-b border-trait py-1 ${actif ? "bg-relief" : "hover:bg-relief"}`}>
      <button type="button" onClick={onOuvrir} className="min-w-0 flex-1 text-left" style={TRANSPARENT}>
        <span className="block truncate text-[14px] text-encre">{zone.nom}</span>
        <span className="block text-[12.5px] text-ardoise">Rayon de {km(zone.rayon_m)}</span>
      </button>
      {actif ? <span className="flex-none text-[12.5px] text-menthe-texte">Ouverte</span>
        : !visible ? <span className="flex-none text-[12.5px] text-brume">Masquée</span> : null}
      <button type="button" onClick={onBasculerVisible} className="flex-none p-1 text-brume hover:text-encre max-md:p-2" style={TRANSPARENT} title={visible ? "Masquer sur la carte" : "Montrer sur la carte"} aria-label={visible ? "Masquer sur la carte" : "Montrer sur la carte"}>
        {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={onSupprimer} className="flex-none p-1 text-brume opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100 focus-visible:opacity-100 max-md:p-2 max-md:opacity-100" style={TRANSPARENT} title="Supprimer la zone" aria-label="Supprimer la zone">
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

/**
 * Un chiffre-clé : la valeur, son libellé, une précision. 10 nov. 2026, Jules : planche Outils. Le dessin des
 * `Cases` (18 px, libellé dessous), avec la précision en plus, que `Cases` ne porte pas.
 */
function Cle({ valeur, label, detail = null }) {
  return (
    <div className="min-w-0 k-verre px-3.5 py-2.5">
      <p className="m-0 truncate text-[18px] font-medium tabular-nums text-encre">{valeur}</p>
      <p className="m-0 truncate text-[12.5px] text-ardoise">{label}</p>
      {detail && <p className="m-0 mt-0.5 text-[12.5px] text-brume">{detail}</p>}
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
      <p className={`${TITRE_GROUPE} mb-2`}>{titre}</p>
      <div className="space-y-1.5">
        {lignes.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-24 flex-shrink-0 text-[12.5px] text-ardoise">{k}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-relief">
              <span className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: J["menthe"] }} />
            </span>
            <span className="w-12 flex-shrink-0 text-right text-[12.5px] tabular-nums text-encre">{pct(v)}</span>
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
    <ul className="m-0 mt-3 list-none p-0">
      {lignes.map((l) => (
        <li key={l.nom} className="flex min-h-[42px] items-center justify-between gap-3.5 border-b border-trait py-1 text-[14px]">
          <span className="min-w-0 truncate text-craie">{l.nom}</span>
          <span className="flex-none tabular-nums text-encre">{l.nombre}</span>
        </li>
      ))}
    </ul>
  );
}

function Source({ children }) {
  return <p className="mt-5 mb-0 text-[12.5px] leading-[1.6] text-brume">{children}</p>;
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
  // 10 nov. 2026, Jules : planche Outils. Les thèmes en petits onglets sur une rangée, soulignée d'un filet ;
  // le rayon est déjà dit en tête du panneau.
  return (
    <>
      <div role="group" aria-label="Thème" className="flex flex-wrap gap-1 border-b border-trait pb-2.5">
        {ONGLETS_INFOS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOnglet(o)}
            aria-pressed={o === onglet}
            className={`rounded-[6px] px-2 py-0.5 text-[13px] transition-colors max-md:py-1.5 ${o === onglet ? "bg-relief text-encre" : "text-ardoise hover:text-encre"}`}
            style={o === onglet ? undefined : TRANSPARENT}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="pb-1">
        {isLoading && (
          <p className="mt-4 mb-0 flex items-center gap-2 text-[12.5px] text-brume">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> L&apos;INSEE répond…
          </p>
        )}
        {error && <p className="mt-4 mb-0 text-[12.5px] text-alerte">{error.message || "La lecture n'a pas abouti."}</p>}
        {lecture && (
          <>
            {lecture.insee_erreur && <p className="mt-3 mb-0 text-[12.5px] text-alerte">{lecture.insee_erreur}</p>}
            {(lecture.equipements_erreur || lecture.equipements_echec) && <p className="mt-3 mb-0 text-[12.5px] text-alerte">{lecture.equipements_erreur || lecture.equipements_echec}</p>}
            {lecture.equipements_en_attente && (
              <p className="mt-3 mb-0 flex items-center gap-2 text-[12.5px] text-brume">
                <Loader2 className="h-3 w-3 animate-spin" /> OpenStreetMap relève les commerces et les transports…
              </p>
            )}
            {lecture.insee && lecture.insee.carreaux === 0 && (
              <p className="mt-3 mb-0 text-[12.5px] text-ardoise">Aucun carreau INSEE habité dans la zone : personne n&apos;y réside, ou le rayon est trop petit.</p>
            )}
            <ContenuOnglet onglet={onglet} zone={zone} lecture={lecture} />
          </>
        )}
      </div>
    </>
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

  // 10 nov. 2026, Jules : planche Outils. Le relevé en lignes ; le choix des métiers en lignes à rond coché, la
  // recherche ronde au-dessus, « Valider ma sélection » en bouton principal collé au bas du panneau.
  if (releve) {
    return (
      <div className="pb-1">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[15px] font-medium text-encre">
            {releve.commerces.length} commerce{releve.commerces.length > 1 ? "s" : ""}
          </p>
          <BoutonOutil onClick={() => { setReleve(null); onCommerces?.([]); }}>Changer de métier</BoutonOutil>
        </div>
        <p className="mt-1 mb-0 text-[12.5px] text-ardoise">
          {choisis.length ? choisis.join(", ") : "Tous les commerces"} · rayon de {km(zone.rayon_m)}
        </p>
        <ul className="mt-3 m-0 list-none p-0">
          {releve.commerces.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setCommerceOuvert(c)} className="flex min-h-[42px] w-full items-center gap-3.5 border-b border-trait py-1 text-left hover:bg-relief" style={TRANSPARENT}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-encre">
                    {c.nom || (c.vacant ? "Local vacant" : "Sans nom")}
                  </span>
                  {c.adresse && <span className="block truncate text-[12.5px] text-ardoise">{c.adresse}</span>}
                </span>
                <span className="flex-none text-[12.5px] tabular-nums text-ardoise">{c.distance_m} m</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const ligneMetier = (actif) => `flex min-h-[40px] w-full items-center gap-2.5 border-b border-trait py-1 text-left transition-colors hover:bg-relief ${actif ? "bg-relief" : ""}`;
  const rond = (actif) => `h-3.5 w-3.5 flex-none rounded-full border ${actif ? "border-menthe bg-menthe" : "border-bord-vif"}`;
  return (
    <>
      <Recherche value={recherche} onChange={setRecherche} placeholder="Chercher un métier" className="w-full flex-none" />
      <div className="mt-2">
        <button type="button" onClick={() => setChoisis([])} className={ligneMetier(choisis.length === 0)} style={choisis.length === 0 ? undefined : TRANSPARENT}>
          <span className={rond(choisis.length === 0)} />
          <span className="text-[14px] text-encre">Tous les commerces</span>
        </button>
        {filtres.map((m) => {
          const actif = choisis.includes(m.nom);
          return (
            <button key={m.nom} type="button" onClick={() => basculer(m.nom)} className={ligneMetier(actif)} style={actif ? undefined : TRANSPARENT}>
              <span className={rond(actif)} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-encre">{m.nom}</span>
              <span className="flex-none text-[12.5px] text-brume">{m.categorie}</span>
            </button>
          );
        })}
      </div>
      <div className="sticky bottom-0 -mx-4 mt-2 border-t border-trait bg-rail px-4 pt-3">
        <BoutonPrincipal onClick={() => relever.mutate()} disabled={relever.isPending} className="w-full">
          {relever.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Valider ma sélection
        </BoutonPrincipal>
      </div>
    </>
  );
}

/**
 * La zone de chalandise d'une adresse (lot 8, 18 oct. 2026, boîte à outils allumée) : trois zones à pied,
 * concurrence de l'activité choisie, gares et arrêts, indice de flux. Un panneau à droite de la carte.
 */
function PanneauChalandise({ point, onFermer }) {
  const [activite, setActivite] = useState("");
  const q = useMutation({
    mutationFn: () => base44.request("POST", "/api/kzoning/chalandise", { body: { adresse: point.libelle, activite: activite || null } }),
    onError: (e) => toast.error(e?.message || "Zone de chalandise impossible"),
  });
  const r = q.data?.resultat;
  const nombre = (n) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));
  return (
    // 10 nov. 2026, Jules : planche Outils. Une carte posée à droite, sous la cloche, comme la zone ouverte.
    <div className={`${PANNEAU} right-6 top-6 z-[510] max-h-[calc(100%-48px)] w-[380px] max-w-[calc(100vw-2rem)] max-md:left-3 max-md:right-3 max-md:top-3 max-md:max-h-[calc(100%-24px)] max-md:w-auto`}>
      <div className="flex flex-none items-start justify-between gap-2.5">
        <div className="min-w-0">
          <span className="block truncate text-[12.5px] text-ardoise">{point.libelle}</span>
          <h2 className="m-0 mt-0.5 text-[18px] font-medium text-encre">Zone de chalandise</h2>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer la zone de chalandise" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={TRANSPARENT}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-none items-center gap-2">
        <input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Activité (ex. Boulangerie), facultatif" aria-label="Activité, facultatif"
          className="h-8 min-w-0 flex-1 rounded-full border-0 bg-relief px-3.5 text-[14px] text-encre outline-none placeholder:text-brume focus:ring-1 focus:ring-bord-doux max-md:h-10 max-md:text-[16px]" />
        <BoutonPrincipal onClick={() => q.mutate()} disabled={q.isPending}>
          {q.isPending ? "Lecture…" : "Lire"}
        </BoutonPrincipal>
      </div>
      {r && (
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-t border-trait px-4 pt-3 text-[13.5px]">
          <p className="m-0 text-[18px] font-medium tabular-nums text-encre">{r.flux?.indice ?? "—"} <span className="text-[13.5px] font-normal text-ardoise">/ 100, indice de flux</span></p>
          <p className="m-0 text-[12.5px] text-brume">{r.flux?.nature} ; {r.flux?.sur}</p>
          {(r.zones || []).map((z) => (
            <div key={z.cle} className="mt-3 border-t border-trait pt-2">
              <p className={TITRE_GROUPE}>{z.marche}</p>
              <p className="m-0 mt-0.5 text-encre">{nombre(z.habitants)} habitants · {nombre(z.menages)} ménages · niveau de vie {nombre(z.niveau_de_vie_moyen)} €</p>
              <p className="m-0 text-[12.5px] text-ardoise">moins de 18 ans {z.part_moins_18 ?? "—"} % · 65 ans et plus {z.part_65_plus ?? "—"} % · CSP+ {z.csp_plus_part ?? "—"} %</p>
            </div>
          ))}
          <div className="mt-3 border-t border-trait pt-2">
            <p className="m-0 text-encre">{nombre(r.commerces_zone_primaire)} commerces à 5 minutes{r.concurrence ? `, dont ${r.concurrence.nombre} « ${r.activite} »` : ""}</p>
            {r.gares?.[0] && <p className="m-0 text-[12.5px] text-ardoise">Gare : {r.gares[0].nom}, {r.gares[0].distance_m} m{r.gares[0].voyageurs ? `, ${nombre(r.gares[0].voyageurs)} voyageurs en ${r.gares[0].annee}` : ""}</p>}
            <p className="m-0 text-[12.5px] text-ardoise">{(r.arrets || []).filter((a) => a.distance_m <= 300).length} arrêts à moins de 300 m</p>
          </div>
          <p className="m-0 mt-3 text-[12.5px] text-brume">Sources : {(r.sources || []).join(", ")}{r.du_cache ? " · déjà lue" : ""}</p>
        </div>
      )}
    </div>
  );
}

export default function KZoning() {
  const [chalandise, setChalandise] = useState(false);
  const user = useUser();
  const qc = useQueryClient();
  // Le fond : un type de carte Google (plan, satellite, hybride, relief).
  const [typeCarte, setTypeCarte] = useState(TYPES_CARTE[0].cle);

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

  // Ouverte depuis la file de K-Data : « ?zone=… » désigne la zone à lire,
  // une fois la liste chargée. Le paramètre ne se rejoue pas.
  const { search } = useLocation();
  const vuUrl = useRef("");
  useEffect(() => {
    if (vuUrl.current === search || !zones.length) return;
    const id = new URLSearchParams(search).get("zone");
    if (!id) return;
    const z = zones.find((x) => x.id === id);
    if (!z) return;
    vuUrl.current = search;
    setZoneOuverte(z);
    setMode("infos");
  }, [search, zones]);

  if (!user || user.role !== "admin") return null;

  const visibles = zones.filter((z) => !masquees.has(z.id));
  const sansDossier = zones.filter((z) => !z.dossier_id);
  const cherchees = filtreZone.trim()
    ? zones.filter((z) => z.nom.toLowerCase().includes(filtreZone.trim().toLowerCase()))
    : null;
  const centreOuvert = zoneOuverte ? [Number(zoneOuverte.centre_lat), Number(zoneOuverte.centre_lon)] : null;

  const basculerVisible = (z) => setMasquees((s) => { const n = new Set(s); n.has(z.id) ? n.delete(z.id) : n.add(z.id); return n; });
  const ligne = (z) => (
    <LigneZone
      key={z.id} zone={z} actif={zoneOuverte?.id === z.id} visible={!masquees.has(z.id)}
      onOuvrir={() => { setZoneOuverte(z); setMode("infos"); }}
      onBasculerVisible={() => basculerVisible(z)}
      onSupprimer={() => supprimer.mutate(z.id)}
    />
  );

  // 10 nov. 2026, Jules : planche Outils. Plus de barre du haut des Outils : la carte prend toute la hauteur
  // (sur téléphone, moins la barre du haut et la marge du bas de Layout).
  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden max-md:flex-none max-md:h-[calc(100dvh-var(--k-haut-mobile,3.5rem)-var(--k-bas-mobile,0px))]">
      {/* La carte : Google, comme demandé — le cercle d'une zone y porte un
          bord noir et un vert nourri, pour se voir d'un coup d'œil. */}
      <div className="absolute inset-0">
        <CarteGoogleZones
          zones={visibles}
          zoneOuverte={zoneOuverte}
          apercu={point ? { lat: point.lat, lon: point.lon, rayon_m: rayon } : null}
          commerces={commerces}
          type={typeCarte}
          onZone={(z) => { setZoneOuverte(z); setMode("infos"); }}
          onCommerce={(c) => setCommerceOuvert(c)}
          onErreur={(m) => toast.error(m)}
        />
      </div>
      <SelecteurFond type={typeCarte} setType={setTypeCarte} cacheMobile={!!zoneOuverte} />
      {chalandise && point && <PanneauChalandise key={point.libelle} point={point} onFermer={() => setChalandise(false)} />}
      <BoutonMecanique etapes={ETAPES_MECANIQUE} position="bottom-6 right-6" className={zoneOuverte ? "max-md:hidden" : ""} />

      {/* La fiche d'une société : plein écran, par-dessus la carte. */}
      {commerceOuvert && (
        <FicheSociete commerce={commerceOuvert} metier={commerceOuvert.metier || null} onFermer={() => setCommerceOuvert(null)} />
      )}

      {/* Le panneau de gauche (10 nov. 2026, Jules : planche Outils) : le retour aux Outils, le titre et son
          compte, la recherche, le rayon, puis les zones en lignes par dossier. Au téléphone, il prend le haut de
          l'écran et s'efface quand une zone est ouverte. */}
      <section aria-label="Les zones" className={`${PANNEAU} bottom-6 left-6 top-6 z-[500] w-[340px] max-w-[calc(100vw-2rem)] max-md:bottom-auto max-md:left-3 max-md:right-3 max-md:top-3 max-md:max-h-[55%] max-md:w-auto max-md:max-w-none ${zoneOuverte ? "max-md:hidden" : ""}`}>
        <div className="flex-none">
          <Link to={createPageUrl("KData")} className="text-[13px] text-ardoise no-underline hover:text-encre">← Outils</Link>
          <h1 className="m-0 mt-1 truncate text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">
            K-Zoning<span className="ml-2 text-[14px] tabular-nums tracking-normal text-ardoise">{zones.length}</span>
          </h1>
        </div>
        <div className="flex-none">
          <ChercheAdresse key={rechercheNeuve} onChoisi={(s) => { setPoint(s); setRayon(RAYON_DEFAUT); }} />
        </div>
        {point && (
          <ReglageRayon
            point={point} rayon_m={rayon} setRayon={setRayon}
            onCreer={() => creer.mutate()} onAnnuler={() => setPoint(null)} onChalandise={() => setChalandise(true)} enCours={creer.isPending}
          />
        )}

        <div className="flex flex-none items-center justify-between gap-2">
          <h2 className="m-0 text-[15px] font-medium text-encre">Les zones</h2>
          <button
            type="button"
            onClick={() => {
              const nom = window.prompt("Nom du dossier");
              if (nom?.trim()) nouveauDossier.mutate(nom.trim());
            }}
            className="inline-flex h-7 items-center rounded-full px-2.5 text-[13px] text-craie hover:bg-relief hover:text-encre max-md:h-10"
            style={TRANSPARENT}
            title="Créer un dossier"
          >
            + Dossier
          </button>
        </div>
        {zones.length > 0 && (
          <Recherche value={filtreZone} onChange={setFiltreZone} placeholder="Chercher une zone" className="w-full flex-none" />
        )}

        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          {cherchees ? (
            cherchees.length ? cherchees.map(ligne) : <p className="m-0 py-6 text-center text-[12.5px] text-brume">Aucune zone de ce nom.</p>
          ) : (
            <>
              {dossiers.map((d) => (
                <div key={d.id}>
                  <p className={`${TITRE_GROUPE} truncate pb-0.5 pt-2.5 first:pt-1`}>{d.nom} · {d.zones}</p>
                  {zones.filter((z) => z.dossier_id === d.id).map(ligne)}
                </div>
              ))}
              <p className={`${TITRE_GROUPE} pb-0.5 pt-2.5`}>Sans dossier · {sansDossier.length}</p>
              {sansDossier.length ? sansDossier.map(ligne) : (
                <p className="m-0 py-6 text-center text-[12.5px] leading-[1.6] text-brume">
                  Cherchez une adresse, réglez le rayon : votre première zone se pose en deux gestes.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Le panneau de droite (10 nov. 2026, Jules : planche Outils) : la zone ouverte, sous la cloche de Layout.
          Informations et Concurrence en deux filtres ronds, plus de rail d'icônes. Au téléphone, une feuille posée
          en bas, la carte reste visible dessus. */}
      {zoneOuverte && (
        <section aria-label="La zone ouverte" className={`${PANNEAU} bottom-6 right-6 top-6 z-[500] w-[420px] max-w-[calc(100vw-2rem)] max-md:bottom-[calc(env(safe-area-inset-bottom)+12px)] max-md:left-3 max-md:right-3 max-md:top-auto max-md:max-h-[62%] max-md:w-auto max-md:max-w-none`}>
          <div className="flex flex-none items-start justify-between gap-2.5">
            <div className="min-w-0">
              <span className="block text-[12.5px] text-ardoise">Rayon de {km(zoneOuverte.rayon_m)}</span>
              <h2 className="m-0 mt-0.5 truncate text-[18px] font-medium text-encre">{zoneOuverte.nom}</h2>
            </div>
            <button type="button" onClick={() => setZoneOuverte(null)} aria-label="Fermer la zone" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-10 max-md:w-10" style={TRANSPARENT}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <Filtres
            label="Vue de la zone"
            className="flex-none"
            options={[["infos", "Informations"], ["concurrence", "Concurrence"]]}
            valeur={mode}
            onChange={setMode}
          />
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            {mode === "infos"
              ? <PanneauInformations zone={zoneOuverte} />
              : <PanneauConcurrence zone={zoneOuverte} onCommerces={setCommerces} commerceOuvert={commerceOuvert} setCommerceOuvert={setCommerceOuvert} />}
          </div>
        </section>
      )}
    </div>
  );
}
