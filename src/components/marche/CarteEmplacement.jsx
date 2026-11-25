import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import jetons from "@/design/jetons.json";
import { J } from "@/design/jetons";
import { useFondDeCarte } from "@/lib/tuiles";
import { base44 } from "@/api/base44Client";
import { cleCarteTransactions } from "@/components/marche/CarteTransactions";

// La carte de l'Emplacement (24 nov. 2026, Jules : « à la place de Passage, une carte avec les transports autour ; on a
// des onglets et on voit directement ; aussi les enseignes nationales en plus du visuel qu'on a déjà, les locaux vides »),
// puis une seule carte (« mets transactions de fonds de commerce et murs dans la même carte dans Emplacement, enlève le
// titre »), Transactions en premier et ouvert à l'arrivée.
// Le dessin D de la planche (même jour, Jules : « je préfère le D, juste mets la carte plus grande en hauteur ») : des
// numéros sur la carte, du plus proche au plus loin, et la liste à côté ; survoler une ligne allume son repère, et
// l'inverse. Le même dessin pour les quatre onglets, tout en menthe. Le bien : un disque encre cerclé de blanc,
// « Le bien » au-dessus.
// Les données : les transactions de server/carte-transactions.js (les murs pour l'équipe seulement), le reste de la
// lecture de l'Emplacement (server/outils/rue.js, lancements.js). La carte est toujours claire : couleurs du thème clair.

const C = jetons.couleurs_clair;
// Tout en couleur système (24 nov. 2026, Jules : « mets tous les trucs en couleur système », puis « dans la carte c'est en
// vert ») : la couleur d'accent du compte ; les ronds au trait ont un fond noir (« les ronds qui ont les fonds blancs,
// avec du noir, pas la carte »), la même variable CSS que la liste (J.menthe), jamais le vert écrit en dur ; les
// repères sont du HTML (divIcon), la variable s'y résout et suit un changement d'accent. Ce qui distingue
// deux familles d'un même onglet est la forme, pleine ou au trait (fonds plein, murs au trait ; vide plein, peut-être
// vide au trait).
const AU_TRAIT = new Set(["murs", "incertain"]);
const FAMILLES = [
  { cle: "fonds", nom: "Fonds de commerce" },
  { cle: "murs", nom: "Ventes de murs" },
];
const echapper = (t) => String(t ?? "").replace(/[<>&"]/g, "");
const BIEN = L.divIcon({
  className: "",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<span style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:${C.encre};box-shadow:0 0 0 3px #fff,0 2px 8px rgb(0 0 0/.35)"></span><span style="position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 14px));white-space:nowrap;padding:4px 7px;border-radius:6px;background:${C.encre};color:#fff;font:600 11.5px/1 var(--k-police,'Instrument Sans'),Inter,sans-serif">Le bien</span>`,
});
// Un repère numéroté, plein ou au trait ; allumé, il grossit d'un anneau encre.
const numero = (n, trait, allume) => L.divIcon({
  className: "",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: `<span style="position:absolute;left:0;top:0;transform:translate(-50%,-50%) scale(${allume ? 1.25 : 1});display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:${trait ? C.encre : J.menthe};border:${trait ? `3px solid ${J.menthe}` : `2px solid ${C["surface-pleine"]}`};color:${trait ? J.menthe : J["sur-menthe"]};font:700 12.5px/1 var(--k-police,'Instrument Sans'),Inter,sans-serif;font-variant-numeric:tabular-nums;box-shadow:${allume ? `0 0 0 3px ${C.encre},` : "0 0 0 1px rgb(0 0 0/.28),"}0 2px 5px rgb(0 0 0/.3)">${echapper(n)}</span>`,
});
// Une icône par numéro, forme et état, gardée : au survol, seuls les deux repères qui changent se redessinent.
const ICONES = new Map();
const icone = (n, trait, allume) => {
  const k = `${n}|${trait ? 1 : 0}|${allume ? 1 : 0}`;
  if (!ICONES.has(k)) ICONES.set(k, numero(n, trait, allume));
  return ICONES.get(k);
};
const prixCourt = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const euros = (n) => (Number.isFinite(n) ? `${Math.round(n).toLocaleString("fr-FR")} €` : null);
const date = (iso) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : null; };
const distance = (a, b) => {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
};
// « 11 Rue De Vauban 56100 Lorient » : « 11 rue de Vauban » ; « 7 A BD MAL JOFFRE » (DVF, en capitales, abrégé) :
// « 7 A boulevard Maréchal Joffre ». La ville est celle du bien.
const PETITS = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "en", "sur", "aux", "au"]);
const VOIES = /^(rue|avenue|boulevard|place|cours|quai|allée|allee|impasse|chemin|route|square|passage|esplanade|promenade)$/i;
const ABREGES = { bd: "boulevard", bld: "boulevard", av: "avenue", ave: "avenue", pl: "place", crs: "cours", imp: "impasse", che: "chemin", rte: "route", sq: "square", pas: "passage", mal: "Maréchal", gen: "Général", gal: "Général", st: "Saint", ste: "Sainte", pdt: "Président", prof: "Professeur", dr: "Docteur", cdt: "Commandant" };
const adresseCourte = (a) => {
  const t = String(a || "").replace(/\s*,?\s*\b\d{5}\b.*$/, "").trim();
  if (!t) return null;
  return t.split(/\s+/).map((m, i) => {
    const bas = m.toLowerCase();
    if (i > 0 && ABREGES[bas]) return ABREGES[bas];
    if (i > 0 && (PETITS.has(bas) || VOIES.test(m))) return bas;
    // Un mot en capitales (DVF) reprend une casse normale ; un numéro ou une lettre de numéro (« 7 A ») reste tel quel.
    if (m.length > 1 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m)) return bas.replace(/(^|[-'’])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());
    return m;
  }).join(" ");
};
const metres = (m) => (m == null ? null : m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${m} m`);
const situe = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);

/** Centre la carte sur le repère allumé depuis la liste, s'il sort du cadre. */
function Suivre({ point, carte }) {
  useEffect(() => {
    const m = carte.current;
    if (!m || !point) return;
    if (!m.getBounds().pad(-0.08).contains([point.lat, point.lon])) m.panTo([point.lat, point.lon], { animate: true });
  }, [point?.lat, point?.lon]);
  return null;
}

/**
 * La bulle du repère allumé (24 nov. 2026, Jules, sur une capture : « ça coupe ; mets la pop-up comme le design du reste
 * de l'application ») : l'infobulle de l'appli (surface, bord, texte craie, 280 px), posée au-dessus du repère, ou dessous
 * quand il est près du haut, et rentrée dans la carte sur les côtés : elle ne sort jamais du cadre. Elle suit le
 * déplacement et le zoom de la carte ; elle s'ouvre aussi depuis une ligne de la liste.
 */
function Bulle({ x }) {
  const map = useMap();
  const boite = useRef(null);
  const [haut, setHaut] = useState(0);
  const [, redessiner] = useState(0);
  useMapEvents({ move: () => redessiner((n) => n + 1), zoom: () => redessiner((n) => n + 1) });
  // Sa hauteur réelle, pour choisir où elle tient entière (au-dessus, sinon dessous, sinon collée en haut).
  useLayoutEffect(() => { if (boite.current) setHaut(boite.current.offsetHeight); }, [x?.id]);
  if (!x) return null;
  const p = map.latLngToContainerPoint([x.lat, x.lon]);
  const taille = map.getSize();
  const LARGEUR = 280; const ECART = 22; const MARGE = 8;
  const gauche = Math.round(Math.min(Math.max(p.x - LARGEUR / 2, MARGE), Math.max(MARGE, taille.x - LARGEUR - MARGE)));
  const h = haut || 120;
  const top = p.y - ECART - h >= MARGE ? p.y - ECART - h : p.y + ECART + h <= taille.y - MARGE ? p.y + ECART : MARGE;
  return (
    <div ref={boite} className="pointer-events-none absolute z-[1000] rounded-[10px] border border-bord bg-surface-pleine px-3 py-2 text-[12.5px] leading-[1.45] text-craie shadow-lg" style={{ left: gauche, top: Math.round(top), width: LARGEUR, visibility: haut ? "visible" : "hidden" }}>
      <p className="m-0 text-[13.5px] text-encre">{x.titre}</p>
      {x.valeur && <p className="m-0 tabular-nums text-encre">{x.valeur}{x.sous_valeur ? <span className="text-ardoise"> · {x.sous_valeur}</span> : null}</p>}
      {x.detail && <p className="m-0 text-ardoise">{x.detail}</p>}
      {x.bulle.map((t) => <p key={t} className="m-0 mt-1 line-clamp-3">{t}</p>)}
    </div>
  );
}

/**
 * `rue` : la lecture de l'outil Rue (adresse, cellules, transports) ; `vides` : les locaux vides placés (point Signal de
 * vacance, `detail.vides`) ; `transactions` : `{ adresse, avecMurs }` pour l'onglet Transactions, ou null (lien public).
 */
export default function CarteEmplacement({ rue, vides = null, transactions = null, hauteur = 600 }) {
  const { fond, surErreur } = useFondDeCarte({ google: true });
  const adresseTx = String(transactions?.adresse || "").trim();
  const avecMurs = !!transactions?.avecMurs;
  const tx = useQuery({
    queryKey: cleCarteTransactions(adresseTx, avecMurs),
    queryFn: () => base44.request("GET", `/api/carte-transactions?adresse=${encodeURIComponent(adresseTx)}${avecMurs ? "&murs=1" : ""}`),
    enabled: !!adresseTx,
    staleTime: 30 * 60_000,
    retry: 1,
  });
  const [onglet, setOnglet] = useState(adresseTx ? "transactions" : "transports");
  // Les arrêts qu'une lecture ancienne n'a pas placés : demandés au serveur (OpenStreetMap), sauf sur le lien public.
  const sansArrets = !rue?.transports?.arrets && Number.isFinite(rue?.adresse?.lat) && transactions != null;
  const arretsLus = useQuery({
    queryKey: ["emplacement-arrets", rue?.adresse?.lat, rue?.adresse?.lon],
    queryFn: () => base44.request("GET", `/api/emplacement/arrets?lat=${rue.adresse.lat}&lon=${rue.adresse.lon}`),
    enabled: sansArrets,
    staleTime: 60 * 60_000,
    retry: 1,
  });
  const lesArrets = rue?.transports?.arrets || arretsLus.data?.arrets || null;
  const [masquees, setMasquees] = useState(() => new Set());
  const [allume, setAllume] = useState(null);
  const carte = useRef(null);
  const liste = useRef(null);
  const a = rue?.adresse;
  const bien = Number.isFinite(a?.lat) && Number.isFinite(a?.lon) ? { lat: a.lat, lon: a.lon } : null;
  // Une famille de transactions se montre quand le serveur l'a rendue : les murs n'arrivent qu'à l'équipe.
  const familles = FAMILLES.filter((f) => Array.isArray(tx.data?.[f.cle]));

  // Les lignes de chaque onglet, du plus proche au plus loin, numérotées dans cet ordre.
  const lignes = useMemo(() => {
    const ranger = (l) => l.filter(situe).map((x) => ({ ...x, dist: x.dist ?? (bien ? distance(bien, x) : null) })).sort((x, y) => (x.dist ?? 9e9) - (y.dist ?? 9e9)).map((x, i) => ({ ...x, n: i + 1, id: `${x.genre}:${i}` }));
    return {
      transactions: ranger(familles.flatMap((f) => (tx.data[f.cle] || []).map((p) => ({
        genre: f.cle, lat: p.lat, lon: p.lon, dist: p.distance_m ?? null,
        // L'adresse en titre (24 nov. 2026, Jules : « à la place de Vente de murs mets les adresses, idem pour les fonds »).
        titre: adresseCourte(p.adresse) || (f.cle === "murs" ? "Vente de murs" : "Cession de fonds"),
        detail: [f.cle === "murs" ? "Murs" : "Fonds", metres(p.distance_m), date(p.date)].filter(Boolean).join(" · "),
        valeur: p.prix ? prixCourt(p.prix) : null, sous_valeur: f.cle === "murs" && p.prix_m2 ? `${euros(p.prix_m2)}/m²` : null,
        bulle: [f.cle === "murs" && p.surface ? `${p.surface} m²` : null, f.cle === "fonds" ? p.enseigne : null, p.activite].filter(Boolean),
      })))),
      transports: ranger((lesArrets || []).map((p) => ({ genre: "transports", lat: p.lat, lon: p.lon, titre: p.nom || "Arrêt sans nom", type: p.genre, bulle: [] }))).map((x) => ({ ...x, detail: [x.type, metres(x.dist)].filter(Boolean).join(" · ") })),
      enseignes: ranger((rue?.rue?.cellules || []).filter((c) => c.enseigne_nationale).map((c) => ({ genre: "enseignes", lat: c.lat, lon: c.lon, titre: c.enseigne_nationale, detail: c.adresse, bulle: [] }))),
      vides: ranger((vides || []).map((v) => ({ genre: v.etat === "vacant" ? "vacant" : "incertain", lat: v.lat, lon: v.lon, titre: v.etat === "vacant" ? "Local vide" : "Peut-être vide", detail: v.adresse, valeur: null, bulle: [v.dernier ? `Dernier : ${v.dernier}${date(v.ferme_le) ? `, fermé en ${date(v.ferme_le)}` : ""}` : null].filter(Boolean) }))),
    };
  }, [tx.data, rue, vides, lesArrets, bien?.lat, bien?.lon]);

  const ici = (lignes[onglet] || []).filter((x) => !masquees.has(x.genre));
  const point = ici.find((x) => x.id === allume) || null;
  // Le repère allumé depuis la carte : sa ligne vient dans la liste.
  useEffect(() => {
    if (!allume || !liste.current) return;
    liste.current.querySelector(`[data-id="${CSS.escape(allume)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [allume]);

  if (!bien) return <p className="m-0 p-5 text-[13.5px] text-brume">L'adresse n'est pas placée : la carte s'affichera après la lecture de l'Emplacement.</p>;
  const arrets = lesArrets;
  const genres = rue?.transports?.genres || arretsLus.data?.genres || [];
  const onglets = [
    ...(adresseTx ? [{ cle: "transactions", nom: "Transactions", n: tx.data ? lignes.transactions.length : null }] : []),
    { cle: "transports", nom: "Transports", n: arrets ? lignes.transports.length : null },
    { cle: "enseignes", nom: "Enseignes nationales", n: lignes.enseignes.length },
    // Plus d'onglet Locaux vides (24 nov. 2026, Jules : « enlève le truc Locaux vides ») : le Signal de vacance reste sous la carte.
  ];
  // Ce qui manque à l'onglet ouvert, dit à la place de la liste plutôt qu'une carte muette.
  const manque = onglet === "transports" && !arrets && arretsLus.isFetching ? "Je relève les arrêts autour (OpenStreetMap, quelques secondes)."
    : onglet === "transports" && !arrets
    ? (arretsLus.isError ? `${arretsLus.error?.message || "OpenStreetMap ne répond pas."} Réessayez dans quelques minutes.` : genres.length ? `À 300 m : ${genres.join(", ")}.` : "Transports non lus.")
    : onglet === "transports" && !lignes.transports.length ? "Aucun arrêt de transport en commun à 300 m (OpenStreetMap)."
      : onglet === "enseignes" && !lignes.enseignes.length ? "Aucune enseigne nationale dans la rue (registre SIRENE)."
        : onglet === "vides" && vides == null ? "Les locaux vides se lisent encore, ou l'outil Vacance n'a pas répondu."
          : onglet === "vides" && !lignes.vides.length ? "Aucun local vide repéré dans la rue."
            : onglet === "transactions" && tx.isLoading ? "Je relève les transactions autour (la première fois, quelques secondes)."
              : onglet === "transactions" && tx.isError ? (tx.error?.message || "Les transactions ne se sont pas chargées.")
                : onglet === "transactions" && tx.data && !lignes.transactions.length ? "Aucune transaction publiée à 500 m." : null;
  const source = onglet === "transports" ? "OpenStreetMap, 300 m" : onglet === "enseignes" ? "registre SIRENE" : onglet === "vides" ? "outil Vacance"
    : `${[tx.data?.sources?.fonds?.nom, tx.data?.sources?.murs?.nom].filter(Boolean).join(" · ") || "BODACC"}, ${tx.data?.rayon || 500} m`;
  const choisir = (cle) => { setOnglet(cle); setAllume(null); };
  const basculer = (cle) => setMasquees((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });

  // La légende de l'onglet ouvert (24 nov. 2026, Jules : « les trois pills en haut et les deux à droite, on comprend
  // pas ») : les onglets choisissent ce que montre la carte, en pilule segmentée ; ce qui se coche (fonds, murs) quitte
  // le haut pour la légende, au-dessus de la liste, avec le dessin exact de son repère.
  const legende = onglet === "transactions"
    ? familles.map((f) => ({ cle: f.cle, nom: f.nom, n: tx.data[f.cle].length, trait: AU_TRAIT.has(f.cle), cochable: familles.length > 1 }))
    : onglet === "transports" ? [{ cle: "transports", nom: "Arrêts de transport en commun", trait: false }]
      : onglet === "enseignes" ? [{ cle: "enseignes", nom: "Enseignes nationales de la rue", trait: false }] : [];
  const rayon = onglet === "transports" ? "300 m" : onglet === "transactions" ? `${tx.data?.rayon || 500} m` : null;
  const toutCache = onglet === "transactions" && familles.length > 1 && familles.every((f) => masquees.has(f.cle));

  return (
    <div className="flex flex-col gap-3">
      {/* Ce que montre la carte : une pilule segmentée (design-system, Onglets), un seul onglet ouvert, son nombre à côté. */}
      <div role="tablist" aria-label="Ce que montre la carte" className="inline-flex max-w-full flex-wrap gap-0.5 self-start rounded-full bg-rail-actif p-1">
        {onglets.map((o) => {
          const on = onglet === o.cle;
          return (
            <button key={o.cle} type="button" role="tab" aria-selected={on} onClick={() => choisir(o.cle)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-colors ${on ? "bg-surface-pleine text-encre shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-ardoise hover:text-encre"}`} style={on ? undefined : { background: "transparent" }}>
              {o.nom}
              {o.n != null && <span className={`tabular-nums ${on ? "text-ardoise" : "text-brume"}`}>{o.n}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={`k-carte-rues k-carte-claire ${fond.google ? "k-carte-google" : ""} relative min-w-0 overflow-hidden rounded-[12px] border border-trait`} style={{ height: hauteur }}>
          <MapContainer key={`${bien.lat},${bien.lon}`} ref={carte} center={[bien.lat, bien.lon]} zoom={17} minZoom={13} zoomControl className="h-full w-full" attributionControl={false} scrollWheelZoom={false}>
            <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max || 16} eventHandlers={{ tileerror: surErreur }} />
            {(onglet === "transactions" || onglet === "transports") && (
              <Circle center={[bien.lat, bien.lon]} radius={onglet === "transports" ? 300 : tx.data?.rayon || 500} pathOptions={{ color: C.encre, weight: 1, opacity: 0.35, dashArray: "4 4", fill: false }} interactive={false} />
            )}
            {ici.map((x) => (
              <Marker key={x.id} position={[x.lat, x.lon]} icon={icone(x.n, AU_TRAIT.has(x.genre), x.id === allume)} zIndexOffset={x.id === allume ? 900 : -x.n}
                eventHandlers={{ mouseover: () => setAllume(x.id), mouseout: () => setAllume((v) => (v === x.id ? null : v)), click: () => setAllume(x.id) }} />
            ))}
            <Marker position={[bien.lat, bien.lon]} icon={BIEN} zIndexOffset={1000} interactive={false} keyboard={false} />
            <Suivre point={point} carte={carte} />
            <Bulle x={point} />
          </MapContainer>
          <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution} · {source}</span>
        </div>

        {/* La liste, liée à la carte ; au téléphone, sous elle. En tête, la légende : chaque repère de la carte, et ce qui se coche. */}
        <div ref={liste} className="min-w-0 overflow-y-auto rounded-[12px] border border-trait max-lg:max-h-[360px]" style={{ maxHeight: hauteur }}>
          <div className="sticky top-0 z-[1] border-b border-trait bg-surface-pleine px-3 py-2.5">
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Légende de la carte">
              <li className="flex h-7 items-center gap-2.5 px-1 text-[12.5px] text-craie">
                <span className="grid w-[26px] flex-none place-items-center"><span className="h-3 w-3 rounded-full bg-encre shadow-[0_0_0_2px_rgb(var(--k-surface-pleine-rgb)),0_0_0_3px_rgb(var(--k-encre-rgb)/0.25)]" /></span>
                Le bien
              </li>
              {legende.map((l) => {
                const on = !masquees.has(l.cle);
                const repere = <span className={`grid h-[22px] w-[22px] place-items-center rounded-full text-[10.5px] font-semibold ${l.trait ? "border-2 border-menthe text-menthe" : "bg-menthe text-sur-menthe"}`} style={{ opacity: on ? 1 : 0.35 }}>1</span>;
                const contenu = (
                  <>
                    <span className="grid w-[26px] flex-none place-items-center">{repere}</span>
                    <span className={`min-w-0 flex-1 truncate ${on ? "text-craie" : "text-brume line-through"}`}>{l.nom}</span>
                    {l.n != null && <span className="tabular-nums text-ardoise">{l.n}</span>}
                  </>
                );
                return (
                  <li key={l.cle}>
                    {l.cochable ? (
                      <button type="button" role="switch" aria-checked={on} onClick={() => basculer(l.cle)} title={on ? "Cacher de la carte" : "Montrer sur la carte"}
                        className="flex h-7 w-full items-center gap-2.5 rounded-[6px] px-1 text-left text-[12.5px] transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                        {contenu}
                        <span aria-hidden="true" className={`grid h-4 w-4 flex-none place-items-center rounded-[4px] border ${on ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif"}`}>
                          {on && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 6.2 5 8.5l4.5-5" /></svg>}
                        </span>
                      </button>
                    ) : <span className="flex h-7 items-center gap-2.5 px-1 text-[12.5px]">{contenu}</span>}
                  </li>
                );
              })}
              {rayon && (
                <li className="flex h-7 items-center gap-2.5 px-1 text-[12.5px] text-craie">
                  <span className="grid w-[26px] flex-none place-items-center"><span className="h-4 w-4 rounded-full border border-dashed border-encre/50" /></span>
                  À {rayon} du bien
                </li>
              )}
            </ul>
          </div>
          {toutCache ? <p className="m-0 px-4 py-4 text-[13px] leading-[1.5] text-ardoise">Rien sur la carte : cochez les fonds ou les murs dans la légende.</p>
            : manque ? <p className="m-0 px-4 py-4 text-[13px] leading-[1.5] text-ardoise">{manque}</p> : (
            <ul className="m-0 list-none divide-y divide-trait p-0">
              {ici.map((x) => (
                <li key={x.id} data-id={x.id}>
                  <button type="button" onMouseEnter={() => setAllume(x.id)} onMouseLeave={() => setAllume((v) => (v === x.id ? null : v))} onFocus={() => setAllume(x.id)} onClick={() => setAllume(x.id)}
                    className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${x.id === allume ? "bg-relief" : "hover:bg-relief"}`} style={x.id === allume ? undefined : { background: "transparent" }}>
                    <span className={`grid h-[26px] w-[26px] place-items-center rounded-full text-[12px] font-semibold tabular-nums ${AU_TRAIT.has(x.genre) ? "border-2 border-menthe text-menthe" : "bg-menthe text-sur-menthe"}`}>{x.n}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-encre">{x.titre}</span>
                      {x.detail && <span className="block truncate text-[12px] text-ardoise">{x.detail}</span>}
                    </span>
                    {onglet === "transactions" && (
                      <span className="text-right text-[13px] tabular-nums text-encre">
                        {x.valeur || <span className="text-brume">—</span>}
                        {x.sous_valeur && <span className="block text-[11.5px] text-ardoise">{x.sous_valeur}</span>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
