import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, X, ChevronDown, Loader2, SlidersHorizontal, PanelRightClose, PanelRightOpen, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CarteVacance from "@/components/outils/CarteVacance";
import PanneauTaux from "@/components/outils/PanneauTaux";
import PanneauRue, { nomDeRue } from "@/components/outils/PanneauRue";
import { CATEGORIES, TYPES_SIGNAL, CLES_CATEGORIES, CLES_TYPES, RAYON, motType, motCategorie, adresseLisible } from "@/lib/vacance-signaux";

// Vacance (spec du 13 oct. 2026) : autour d'une adresse, les événements
// publics qui annoncent qu'un local va se libérer ou vient de se libérer.
//
// Quatre états : vide, adresse choisie, filtres ouverts, résultats. Rien ne
// part tout seul : on choisit une adresse dans les propositions, on règle le
// rayon, on clique « Lancer ». Les paramètres se reflètent dans l'adresse de
// la page, pour qu'une recherche se partage ; une adresse complète s'ouvre
// directement sur son résultat.
//
// La première recherche dans une commune la charge (BODACC, SIRENE, une à
// deux minutes) : l'écran attend et dit où il en est.

const DEBOUNCE_MS = 250;
const SONDAGE_MS = 2500;
const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");
const metres = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(m)} m`);
const nombre = (n) => Number(n || 0).toLocaleString("fr-FR");

const BOUTON_SECONDAIRE = "inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13.5px] text-craie transition-colors hover:border-menthe hover:text-encre";

/** Ce que l'adresse de la page dit de la recherche, ou null si elle n'en porte pas. */
function lireUrl(sp) {
  const lon = Number(sp.get("lon")); const lat = Number(sp.get("lat"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !sp.get("lon")) return null;
  const liste = (v, toutes) => (v ? v.split(",").filter((x) => toutes.includes(x)) : toutes);
  return {
    adresse: { label: sp.get("q") || "", lon, lat, citycode: sp.get("commune") || null, postcode: sp.get("cp") || null, city: sp.get("ville") || null, street: sp.get("rue") || null },
    portee: sp.get("portee") === "rue" ? "rue" : "zone",
    rue: sp.get("rue") || null,
    rayon: Math.min(RAYON.max, Math.max(RAYON.min, Number(sp.get("rayon")) || RAYON.defaut)),
    categories: liste(sp.get("cat"), CLES_CATEGORIES),
    types: liste(sp.get("types"), CLES_TYPES),
    dateMin: sp.get("min") || "",
    dateMax: sp.get("max") || "",
  };
}

/** La rue de l'adresse choisie : celle de la proposition, sinon lue dans son libellé (« 12 Rue Gambetta 33500 Libourne »). */
const rueDe = (a) => {
  if (!a) return null;
  if (a.street) return a.street;
  const t = String(a.label || "").replace(/\s+\d{5}.*$/, "").replace(/^\d+\s*(bis|ter|quater|[btq])?\s+/i, "").trim();
  return t || null;
};

/** Une puce de filtre, cochée ou non, avec sa croix quand elle l'est. */
function Puce({ mot, cochee, onBascule }) {
  return (
    <button
      type="button"
      onClick={onBascule}
      aria-pressed={cochee}
      className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] transition-colors ${cochee ? "border-menthe bg-menthe text-sur-menthe" : "border-trait text-ardoise hover:text-encre"}`}
      style={cochee ? undefined : { background: "transparent" }}
    >
      {mot}
      {cochee && <X className="h-3 w-3" strokeWidth={2} />}
    </button>
  );
}

export default function Vacance() {
  const [sp, setSp] = useSearchParams();
  const initial = useMemo(() => lireUrl(sp), []);

  // --- L'adresse ---
  const [texte, setTexte] = useState("");
  const [propositions, setPropositions] = useState([]);
  const [ouvertes, setOuvertes] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [adresse, setAdresse] = useState(initial?.adresse || null);
  const champ = useRef(null);

  // --- Les réglages ---
  const [rayon, setRayon] = useState(initial?.rayon || RAYON.defaut);
  const [categories, setCategories] = useState(new Set(initial?.categories || CLES_CATEGORIES));
  const [types, setTypes] = useState(new Set(initial?.types || CLES_TYPES));
  const [dateMin, setDateMin] = useState(initial?.dateMin || "");
  const [dateMax, setDateMax] = useState(initial?.dateMax || "");
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [listeTypes, setListeTypes] = useState(false);

  // --- Les résultats ---
  const [chargement, setChargement] = useState(false);
  const [progression, setProgression] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [resultats, setResultats] = useState(null);
  const [parametresLances, setParametresLances] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [survol, setSurvol] = useState(null);
  const [cible, setCible] = useState(null);
  const [listeOuverte, setListeOuverte] = useState(true);
  const sondage = useRef(null);
  const arreterSondage = () => { if (sondage.current) { clearTimeout(sondage.current); sondage.current = null; } };
  useEffect(() => () => arreterSondage(), []);

  // --- Le taux de vacance (14 oct. 2026) : mesuré avec les signaux, montré dans le panneau de droite. ---
  const [taux, setTaux] = useState(null);
  const [tauxErreur, setTauxErreur] = useState(null);
  const [tauxAttente, setTauxAttente] = useState(false);
  const sondageTaux = useRef(null);
  useEffect(() => () => clearTimeout(sondageTaux.current), []);
  const mesurerTaux = useCallback(async (p) => {
    clearTimeout(sondageTaux.current);
    if (p.rayon_m > 1500) { setTaux(null); setTauxAttente(false); setTauxErreur("Le taux de vacance se mesure dans un rayon de 1,5 km au plus."); return; }
    try {
      const d = await base44.request("GET", `/api/outils/vacance/taux?${new URLSearchParams({ lat: p.lat, lon: p.lon, rayon_m: p.rayon_m, commune: p.commune || "" })}`);
      if (d.etat === "chargement") { sondageTaux.current = setTimeout(() => mesurerTaux(p), 4000); return; }
      setTaux(d); setTauxAttente(false);
    } catch (e) { setTauxErreur(e?.message || "Le taux n'a pas pu être mesuré."); setTauxAttente(false); }
  }, []);

  // --- La vacance d'une rue entière, par tronçon (16 oct. 2026, Jules : « par tronçon, en gros par rue, pas forcément par zone »). ---
  const [portee, setPortee] = useState(initial?.portee || "zone");
  const [rue, setRue] = useState(null);
  const [rueErreur, setRueErreur] = useState(null);
  const [rueAttente, setRueAttente] = useState(false);
  const [rueVoie, setRueVoie] = useState(initial?.rue || null);
  const [tronconChoisi, setTronconChoisi] = useState(null);
  const [localRue, setLocalRue] = useState(null);
  const sondageRue = useRef(null);
  useEffect(() => () => clearTimeout(sondageRue.current), []);
  const mesurerRue = useCallback(async (commune, voie) => {
    clearTimeout(sondageRue.current);
    try {
      const d = await base44.request("GET", `/api/outils/vacance/taux-rue?${new URLSearchParams({ commune: commune || "", voie })}`);
      if (d.etat === "chargement") { sondageRue.current = setTimeout(() => mesurerRue(commune, voie), 4000); return; }
      setRue(d); setRueAttente(false);
    } catch (e) { setRueErreur(e?.message || "La rue n'a pas pu être mesurée."); setRueAttente(false); }
  }, []);

  // --- Autocomplétion : dès trois caractères, 250 ms après la dernière frappe, cinq propositions. ---
  useEffect(() => {
    const q = texte.trim();
    if (q.length < 3 || adresse) { setPropositions([]); setIntrouvable(false); return; }
    let vivant = true;
    const t = setTimeout(async () => {
      try {
        const d = await base44.request("GET", `/api/outils/adresses/suggest?q=${encodeURIComponent(q)}`);
        if (!vivant) return;
        setPropositions(d.suggestions || []);
        setIntrouvable(!(d.suggestions || []).length);
        setOuvertes(true);
      } catch {
        if (vivant) { setPropositions([]); setIntrouvable(true); }
      }
    }, DEBOUNCE_MS);
    return () => { vivant = false; clearTimeout(t); };
  }, [texte, adresse]);

  const choisirAdresse = (p) => {
    if (!p.choisissable) return;
    setAdresse(p);
    setTexte("");
    setPropositions([]);
    setOuvertes(false);
  };
  const retirerAdresse = () => {
    arreterSondage();
    setAdresse(null); setResultats(null); setParametresLances(null); setChoisi(null); setErreur(null); setChargement(false); setProgression(null);
    clearTimeout(sondageTaux.current); setTaux(null); setTauxErreur(null); setTauxAttente(false);
    clearTimeout(sondageRue.current); setRue(null); setRueErreur(null); setRueAttente(false); setRueVoie(null); setTronconChoisi(null); setLocalRue(null);
    setSp({}, { replace: true });
    setTimeout(() => champ.current?.focus(), 0);
  };

  const bascule = (set, cle) => (prev) => { const n = new Set(prev); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; };
  const datesInversees = !!(dateMin && dateMax && dateMin > dateMax);
  const peutLancer = portee === "rue" ? !!adresse && !!(rueVoie || rueDe(adresse)) && !rueAttente : !!adresse && categories.size > 0 && types.size > 0 && !datesInversees && !chargement;

  const parametres = useCallback(() => ({
    lon: adresse?.lon, lat: adresse?.lat, rayon_m: rayon,
    categories: CLES_CATEGORIES.filter((c) => categories.has(c)).join(","),
    types: CLES_TYPES.filter((t) => types.has(t)).join(","),
    date_min: dateMin || "", date_max: dateMax || "",
    commune: adresse?.citycode || "", cp: adresse?.postcode || "", nom: adresse?.city || "",
  }), [adresse, rayon, categories, types, dateMin, dateMax]);

  const empreinte = (p) => JSON.stringify(p);
  const modifie = !!resultats && !!parametresLances && empreinte(parametres()) !== parametresLances;

  // --- La recherche : une question à notre base, et l'attente si la commune se charge. ---
  const interroger = useCallback(async (p) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "" && v != null)));
    const controleur = new AbortController();
    const garde = setTimeout(() => controleur.abort(), 10000);
    try {
      const d = await base44.request("GET", `/api/outils/vacance/signaux?${qs}`, { signal: controleur.signal });
      if (d.etat === "chargement") {
        setProgression(d.zone?.progression || "En attente");
        sondage.current = setTimeout(() => interroger(p), SONDAGE_MS);
        return;
      }
      setResultats(d);
      setChargement(false);
      setProgression(null);
    } catch (e) {
      setChargement(false);
      setProgression(null);
      setErreur(e?.name === "AbortError" ? "Le serveur n'a pas répondu en dix secondes." : e?.message || "La recherche a échoué.");
    } finally {
      clearTimeout(garde);
    }
  }, []);

  // Mesurer toute une rue : ni rayon ni signaux, la voie entière et ses tronçons.
  const lancerRue = useCallback((voie) => {
    if (!adresse || !voie) return;
    arreterSondage(); clearTimeout(sondageTaux.current);
    setErreur(null); setChoisi(null); setChargement(false); setProgression(null); setResultats(null); setParametresLances(null);
    setTaux(null); setTauxErreur(null); setTauxAttente(false);
    setRue(null); setRueErreur(null); setRueAttente(true); setTronconChoisi(null); setLocalRue(null); setRueVoie(voie); setPortee("rue"); setListeOuverte(true);
    mesurerRue(adresse.citycode, voie);
    setSp({ q: adresse.label, lon: String(adresse.lon), lat: String(adresse.lat), commune: adresse.citycode || "", cp: adresse.postcode || "", ville: adresse.city || "", portee: "rue", rue: voie }, { replace: true });
  }, [adresse, setSp, mesurerRue]);

  // Passer de la zone à la rue (ou l'inverse) repart d'une carte propre : rien de l'autre mesure ne reste affiché.
  const basculerPortee = (p) => {
    if (p === portee) return;
    arreterSondage(); clearTimeout(sondageTaux.current); clearTimeout(sondageRue.current);
    setResultats(null); setParametresLances(null); setChoisi(null); setErreur(null); setChargement(false); setProgression(null);
    setTaux(null); setTauxErreur(null); setTauxAttente(false);
    setRue(null); setRueErreur(null); setRueAttente(false); setTronconChoisi(null); setLocalRue(null);
    setPortee(p);
  };

  const lancer = useCallback(() => {
    if (!adresse) return;
    if (portee === "rue") { lancerRue(rueVoie || rueDe(adresse)); return; }
    const p = parametres();
    arreterSondage();
    setErreur(null); setChoisi(null); setChargement(true); setProgression(null);
    setTaux(null); setTauxErreur(null); setTauxAttente(true); setListeOuverte(true);
    mesurerTaux(p);
    setParametresLances(empreinte(p));
    setSp({
      q: adresse.label, lon: String(adresse.lon), lat: String(adresse.lat), commune: adresse.citycode || "", cp: adresse.postcode || "", ville: adresse.city || "",
      rayon: String(rayon), cat: p.categories, types: p.types, ...(dateMin ? { min: dateMin } : {}), ...(dateMax ? { max: dateMax } : {}),
    }, { replace: true });
    interroger(p);
  }, [adresse, portee, rueVoie, lancerRue, parametres, rayon, dateMin, dateMax, interroger, setSp, mesurerTaux]);

  // Une adresse de page complète : la recherche part d'elle-même, c'est son sens.
  useEffect(() => { if (initial?.adresse?.lon) lancer(); }, []);

  const locaux = useMemo(() => (resultats?.features || []).map((f) => ({ ...f.properties, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] })), [resultats]);
  const nbSignaux = useMemo(() => locaux.reduce((n, l) => n + (l.signaux?.length || 0), 0), [locaux]);
  const repartition = useMemo(() => Object.entries(resultats?.repartition || {}).sort((a, b) => b[1] - a[1]), [resultats]);
  const donneesAnciennes = resultats?.zone?.chargee_le && (Date.now() - Date.parse(resultats.zone.chargee_le) > 48 * 3600 * 1000 || resultats.zone.erreur);

  const ouvrir = (l) => { setChoisi(l); setCible(l); };
  // La carte se cadre sur la rue entière, ou sur le tronçon choisi.
  const cadreRue = useMemo(() => {
    if (!rue?.locaux?.length) return null;
    const t = rue.troncons?.find((x) => x.rang === tronconChoisi);
    const cles = t ? new Set(t.cles) : null;
    const pts = rue.locaux.filter((l) => !cles || cles.has(l.cle));
    if (!pts.length) return null;
    const lats = pts.map((l) => l.lat); const lons = pts.map((l) => l.lon);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [rue, tronconChoisi]);
  const panneauRue = portee === "rue" && !!(rue || rueAttente || rueErreur);
  const panneauZone = portee === "zone" && !!resultats;
  // Le point choisi : sa ligne passe en tête du tableau (14 oct. 2026, Jules), le reste garde son ordre.
  const lignesTableau = useMemo(() => (choisi ? [...locaux.filter((l) => l.cle === choisi.cle), ...locaux.filter((l) => l.cle !== choisi.cle)] : locaux), [locaux, choisi?.cle]);

  const sousTitre = !adresse
    ? "Saisissez une adresse et lancez une recherche pour afficher les signaux."
    : portee === "rue"
      ? (!rue && !rueAttente && !rueErreur ? "Cliquez sur « Lancer » pour mesurer la vacance de toute la rue, tronçon par tronçon." : null)
      : !resultats && !chargement
        ? "Cliquez sur « Lancer » pour afficher les signaux."
        : null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* L'en-tête : les onglets des outils, le titre, la barre de recherche. */}
      <div className="flex-none border-b border-trait px-5 pt-4 md:px-8">
        {/* Le titre seul (14 oct. 2026, Jules) : ni onglet « Vacance », ni compte des signaux. */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre">K-Vacance</h1>
          {sousTitre && <p className="m-0 text-[13.5px] text-ardoise">{sousTitre}</p>}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5 pb-3">
          {/* L'adresse : un champ, puis un libellé menthe avec sa croix une fois choisie. */}
          {!adresse ? (
            <div className="relative min-w-[260px] flex-1 md:max-w-[460px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brume" strokeWidth={1.7} />
              <input
                ref={champ}
                value={texte}
                onChange={(e) => { setTexte(e.target.value); setOuvertes(true); }}
                onFocus={() => setOuvertes(true)}
                onBlur={() => setTimeout(() => setOuvertes(false), 150)}
                placeholder="Veuillez saisir une adresse exacte"
                aria-label="Adresse"
                autoComplete="off"
                className="h-10 w-full rounded-champ border border-trait bg-surface pl-9 pr-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]"
              />
              {ouvertes && texte.trim().length >= 3 && (propositions.length > 0 || introuvable) && (
                <div className="absolute left-0 right-0 top-[44px] z-[600] overflow-hidden rounded-[14px] border border-trait bg-rail shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                  {propositions.map((p) => (
                    <button
                      key={p.label + p.lon}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choisirAdresse(p)}
                      disabled={!p.choisissable}
                      title={p.choisissable ? undefined : "Précisez une rue ou un numéro"}
                      className={`flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left text-[14px] transition-colors ${p.choisissable ? "text-encre hover:bg-rail-actif" : "cursor-not-allowed text-brume"}`}
                      style={{ background: "transparent" }}
                    >
                      <span className="truncate">{p.label}</span>
                      {!p.choisissable && <span className="flex-none text-[11px] uppercase tracking-[.14em] text-brume">Précisez une rue</span>}
                    </button>
                  ))}
                  {introuvable && <p className="m-0 px-3.5 py-2.5 text-[13.5px] text-ardoise">Adresse introuvable, essayez avec le code postal.</p>}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex h-10 max-w-full items-center gap-2 rounded-champ border border-menthe/40 bg-menthe/[0.08] pl-3.5 pr-2 text-[14px] text-menthe">
              <span className="truncate">{adresse.label}</span>
              <button type="button" onClick={retirerAdresse} aria-label="Changer d'adresse" title="Changer d'adresse" className="grid h-7 w-7 flex-none place-items-center rounded-full text-menthe hover:bg-menthe/[0.12]" style={{ background: "transparent" }}>
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </span>
          )}

          {/* La portée (16 oct. 2026) : autour de l'adresse (un rayon) ou sur toute sa rue (par tronçon). */}
          {adresse && (
            <div role="group" aria-label="Portée de la mesure" className="inline-flex h-10 items-center rounded-full bg-rail-actif p-1">
              {[["zone", "Autour de l'adresse"], ["rue", "Sur la rue"]].map(([k, mot]) => (
                <button key={k} type="button" onClick={() => basculerPortee(k)} aria-pressed={portee === k}
                  className={`h-8 rounded-full px-3.5 text-[13px] transition-colors ${portee === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={portee === k ? undefined : { background: "transparent" }}>{mot}</button>
              ))}
            </div>
          )}
          {adresse && portee === "rue" && (
            <span className="inline-flex h-10 max-w-[320px] items-center gap-2 rounded-champ border border-trait px-3 text-[13.5px] text-craie" title="La rue entière, d'un bout à l'autre, sans rayon">
              <span className="text-[11px] uppercase tracking-[.14em] text-brume">Rue</span>
              <span className="truncate text-encre">{nomDeRue(rueVoie || rueDe(adresse)) || "—"}</span>
            </span>
          )}

          {/* Le rayon : curseur et champ, en mètres, synchronisés. */}
          {adresse && portee === "zone" && (
            <label className="inline-flex h-10 items-center gap-2.5 rounded-champ border border-trait px-3 text-[12.5px] text-ardoise">
              <span className="uppercase tracking-[.14em] text-brume">Rayon</span>
              <input type="range" min={RAYON.min} max={RAYON.max} step={RAYON.pas} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} aria-label="Rayon en mètres" className="k-vacance-curseur w-[120px] md:w-[160px]" />
              <input
                type="number" min={RAYON.min} max={RAYON.max} step={RAYON.pas} value={rayon}
                onChange={(e) => setRayon(Number(e.target.value))}
                onBlur={() => setRayon((r) => Math.min(RAYON.max, Math.max(RAYON.min, Math.round((Number(r) || RAYON.defaut) / RAYON.pas) * RAYON.pas)))}
                aria-label="Rayon en mètres"
                className="w-[64px] rounded-[6px] border border-trait bg-transparent px-1.5 py-0.5 text-right text-[13.5px] tabular-nums text-encre outline-none focus:border-menthe max-md:text-[16px]"
              />
              <span>m</span>
            </label>
          )}

          {/* Le type de bien : des puces, toutes cochées au départ, et la flèche pour la liste complète. */}
          <div className={`relative flex flex-wrap items-center gap-1.5 ${portee === "rue" ? "hidden" : ""}`}>
            {CATEGORIES.filter((c) => categories.has(c.cle)).map((c) => (
              <Puce key={c.cle} mot={c.mot} cochee onBascule={() => setCategories(bascule(setCategories, c.cle))} />
            ))}
            <button type="button" onClick={() => setListeTypes((v) => !v)} aria-expanded={listeTypes} aria-label="Tous les types de bien" title="Types de bien" className="grid h-8 w-8 place-items-center rounded-full border border-trait text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              <ChevronDown className={`h-4 w-4 transition-transform ${listeTypes ? "rotate-180" : ""}`} strokeWidth={1.7} />
            </button>
            {listeTypes && (
              <div className="absolute left-0 top-[38px] z-[600] w-[240px] rounded-[14px] border border-trait bg-rail p-2 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                {CATEGORIES.map((c) => (
                  <label key={c.cle} className="flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-[13.5px] text-craie hover:bg-rail-actif">
                    <input type="checkbox" checked={categories.has(c.cle)} onChange={() => setCategories(bascule(setCategories, c.cle))} className="accent-[rgb(var(--k-menthe-rgb))]" />
                    {c.mot}
                  </label>
                ))}
                {categories.size === 0 && <p className="m-0 px-2 pt-1 text-[12.5px] text-alerte">Cochez au moins un type de bien.</p>}
              </div>
            )}
            {categories.size === 0 && !listeTypes && <span className="text-[12.5px] text-alerte">Cochez au moins un type de bien.</span>}
          </div>

          <button type="button" onClick={() => setFiltresOuverts((v) => !v)} aria-expanded={filtresOuverts} className={`${BOUTON_SECONDAIRE} ${filtresOuverts ? "border-menthe text-encre" : ""} ${portee === "rue" ? "hidden" : ""}`} style={{ background: "transparent" }}>
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.7} />
            + de filtres
            {(types.size !== CLES_TYPES.length || dateMin || dateMax) && <span className="ml-0.5 rounded-full bg-menthe px-1.5 text-[11px] font-medium text-sur-menthe">{(types.size !== CLES_TYPES.length ? 1 : 0) + (dateMin || dateMax ? 1 : 0)}</span>}
          </button>

          <button
            type="button"
            onClick={lancer}
            disabled={!peutLancer}
            className={`ml-auto inline-flex h-10 items-center gap-2 rounded-full px-5 text-[14px] transition-colors ${peutLancer ? `bg-menthe text-sur-menthe hover:bg-menthe-survol ${modifie ? "ring-2 ring-menthe/40 ring-offset-2 ring-offset-fond" : ""}` : "cursor-not-allowed bg-relief text-brume"}`}
          >
            {chargement || rueAttente ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} /> : <Search className="h-4 w-4" strokeWidth={1.8} />}
            Lancer
          </button>
        </div>

        {/* Les filtres avancés : les types de signal, les dates. Rien ne part d'ici. */}
        {filtresOuverts && portee === "zone" && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-150 grid gap-4 border-t border-trait py-3 md:grid-cols-[1fr_auto]">
            <div>
              <p className="m-0 mb-2 text-[11px] uppercase tracking-[.14em] text-brume">Type de signal</p>
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                {TYPES_SIGNAL.map((t) => (
                  <label key={t.cle} className="flex cursor-pointer items-start gap-2.5 py-1 text-[13.5px] text-craie" title={t.sens}>
                    <input type="checkbox" checked={types.has(t.cle)} onChange={() => setTypes(bascule(setTypes, t.cle))} className="mt-[3px] accent-[rgb(var(--k-menthe-rgb))]" />
                    <span>{t.mot} <span className="text-[11px] uppercase tracking-[.12em] text-brume">{t.source}</span></span>
                  </label>
                ))}
              </div>
              {types.size === 0 && <p className="m-0 mt-1 text-[12.5px] text-alerte">Cochez au moins un type de signal.</p>}
            </div>
            <div>
              <p className="m-0 mb-2 text-[11px] uppercase tracking-[.14em] text-brume">Date</p>
              <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-ardoise">
                <label className="inline-flex items-center gap-2">après le
                  <input type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} aria-label="Après le" className="h-9 rounded-champ border border-trait bg-surface px-2.5 text-[13.5px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
                </label>
                <label className="inline-flex items-center gap-2">avant le
                  <input type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} aria-label="Avant le" className="h-9 rounded-champ border border-trait bg-surface px-2.5 text-[13.5px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
                </label>
                {(dateMin || dateMax) && (
                  <button type="button" onClick={() => { setDateMin(""); setDateMax(""); }} className="text-[12.5px] text-brume underline underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>Effacer</button>
                )}
              </div>
              {datesInversees && <p className="m-0 mt-1 text-[12.5px] text-alerte">La date « après le » est postérieure à la date « avant le ».</p>}
            </div>
          </div>
        )}
      </div>

      {/* Les bandeaux : filtres modifiés, chargement de la commune, erreur, données anciennes, troncature. */}
      {(modifie || progression || erreur || (resultats && (resultats.tronque || donneesAnciennes || (locaux.length === 0 && !chargement)))) && (
        <div className="flex-none space-y-px">
          {progression && <p className="m-0 flex items-center gap-2 bg-surface px-5 py-2 text-[13.5px] text-ardoise md:px-8"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" strokeWidth={1.8} />Première recherche dans cette commune : les sources se chargent. {progression}.</p>}
          {modifie && <p className="m-0 bg-surface px-5 py-2 text-[13.5px] text-ambre md:px-8">Filtres modifiés : relancez la recherche.</p>}
          {erreur && (
            <p className="m-0 flex flex-wrap items-center gap-3 bg-surface px-5 py-2 text-[13.5px] text-alerte md:px-8">
              {erreur}
              <button type="button" onClick={lancer} className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3 py-1 text-[12.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}><RotateCcw className="h-3.5 w-3.5" strokeWidth={1.7} />Réessayer</button>
            </p>
          )}
          {resultats && !chargement && locaux.length === 0 && <p className="m-0 bg-surface px-5 py-2 text-[13.5px] text-ardoise md:px-8">Aucun signal dans ce rayon. Élargissez le rayon, les types de bien ou la période.</p>}
          {resultats?.tronque && <p className="m-0 bg-surface px-5 py-2 text-[13.5px] text-ambre md:px-8">Résultats tronqués aux {nombre(locaux.length)} locaux les plus récents : réduisez le rayon ou la période.</p>}
          {donneesAnciennes && <p className="m-0 bg-surface px-5 py-2 text-[12.5px] text-brume md:px-8">Données mises à jour le {dateCourte(resultats.zone.chargee_le)}{resultats.zone.erreur ? ` · dernière mise à jour en échec : ${resultats.zone.erreur}` : ""}.</p>}
        </div>
      )}

      {/* La carte et le panneau du taux ; dessous, le tableau des points (14 oct. 2026). */}
      <div className="relative flex h-[62vh] min-h-[420px] flex-none">
        <div className="relative min-w-0 flex-1">
          <CarteVacance
            point={adresse ? { lat: adresse.lat, lon: adresse.lon, label: adresse.label } : null}
            rayonM={rayon}
            locaux={locaux}
            choisi={choisi}
            onChoisir={(l) => { setChoisi(l); }}
            survol={survol}
            onSurvol={setSurvol}
            cible={portee === "rue" ? localRue : cible}
            rue={portee === "rue" && rue?.locaux ? { locaux: rue.locaux, troncons: rue.troncons, tronconChoisi, onTroncon: setTronconChoisi, choisi: localRue, onChoisir: setLocalRue, cadre: cadreRue } : null}
          />
          {(panneauZone || panneauRue) && !listeOuverte && (
            <button type="button" onClick={() => setListeOuverte(true)} aria-label="Ouvrir la liste" title="Ouvrir la liste" className="absolute right-3 top-3 z-[400] grid h-9 w-9 place-items-center rounded-full border border-bord bg-surface-pleine text-ardoise hover:text-encre">
              <PanelRightOpen className="h-4 w-4" strokeWidth={1.7} />
            </button>
          )}
        </div>

        {(panneauZone || panneauRue) && listeOuverte && (
          <aside className="flex w-[360px] flex-none flex-col border-l border-trait bg-rail max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:z-[450] max-md:h-[46%] max-md:w-auto max-md:border-l-0 max-md:border-t">
            {/* Le panneau : le taux de vacance seul (14 oct. 2026 : le compte des signaux retiré). */}
            <div className="flex flex-none justify-end px-2 pt-2">
              <button type="button" onClick={() => setListeOuverte(false)} aria-label="Replier le panneau" title="Replier le panneau" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                <PanelRightClose className="h-4 w-4" strokeWidth={1.7} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panneauRue
                ? <PanneauRue rue={rue} attente={rueAttente} erreur={rueErreur} tronconChoisi={tronconChoisi} onTroncon={setTronconChoisi} onLocal={setLocalRue} localChoisi={localRue} />
                : <PanneauTaux taux={taux} attente={tauxAttente} erreur={tauxErreur} onRue={adresse ? lancerRue : null} />}
            </div>
          </aside>
        )}
      </div>

      {/* Le tableau : une ligne par point de la carte, dans le même ordre ; un clic montre le point. */}
      {resultats && locaux.length > 0 && (
        <div className="flex-none border-t border-trait px-5 py-4 md:px-8">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[.12em] text-brume">
                  {["Établissement", "Adresse", "Signal", "Date", "Type de bien", "Distance", "Signaux"].map((h) => <th key={h} className="border-b border-trait px-2 py-2 font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lignesTableau.map((l) => {
                  const actif = choisi?.cle === l.cle;
                  return (
                    <tr key={l.cle} id={`point-${l.cle}`} onClick={() => ouvrir(l)} onMouseEnter={() => setSurvol(l.cle)} onMouseLeave={() => setSurvol(null)}
                      className={`cursor-pointer border-b border-trait transition-colors ${actif ? "bg-rail-actif" : survol === l.cle ? "bg-relief/40" : "hover:bg-relief/30"}`}>
                      <td className="max-w-[240px] truncate px-2 py-2 text-encre">{l.enseigne || l.denomination || "Établissement"}</td>
                      <td className="max-w-[260px] truncate px-2 py-2 text-craie">{adresseLisible(l.adresse) || "—"}</td>
                      <td className="px-2 py-2 text-craie">{motType(l.signal_principal.type)}</td>
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums text-ardoise">{date(l.signal_principal.date)}</td>
                      <td className="px-2 py-2 text-ardoise">{motCategorie(l.categorie_bien)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-ardoise">{metres(l.distance_m)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-ardoise">{l.signaux.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Un signal n'est pas une certitude (contrôle du 19 oct. 2026, voir docs/validation/k-vacance.md). */}
            <p className="m-0 mt-3 text-[11.5px] leading-[1.55] text-brume">
              Fiabilité mesurée : une radiation est suivie d'une fermeture au registre dans 91 % des cas ; une liquidation ou un redressement de plus de six mois n'a libéré le local que dans 44 % des cas (30 à 59 %, 41 commerces contrôlés sur Google Maps). Un signal dit où regarder, pas ce qui va se libérer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
