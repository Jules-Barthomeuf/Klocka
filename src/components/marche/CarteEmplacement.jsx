import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Circle, Marker, Tooltip } from "react-leaflet";
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
      transports: ranger((rue?.transports?.arrets || []).map((p) => ({ genre: "transports", lat: p.lat, lon: p.lon, titre: p.nom || "Arrêt sans nom", detail: p.genre, bulle: [] }))),
      enseignes: ranger((rue?.rue?.cellules || []).filter((c) => c.enseigne_nationale).map((c) => ({ genre: "enseignes", lat: c.lat, lon: c.lon, titre: c.enseigne_nationale, detail: c.adresse, bulle: [] }))),
      vides: ranger((vides || []).map((v) => ({ genre: v.etat === "vacant" ? "vacant" : "incertain", lat: v.lat, lon: v.lon, titre: v.etat === "vacant" ? "Local vide" : "Peut-être vide", detail: v.adresse, valeur: null, bulle: [v.dernier ? `Dernier : ${v.dernier}${date(v.ferme_le) ? `, fermé en ${date(v.ferme_le)}` : ""}` : null].filter(Boolean) }))),
    };
  }, [tx.data, rue, vides, bien?.lat, bien?.lon]);

  const ici = (lignes[onglet] || []).filter((x) => !masquees.has(x.genre));
  const point = ici.find((x) => x.id === allume) || null;
  // Le repère allumé depuis la carte : sa ligne vient dans la liste.
  useEffect(() => {
    if (!allume || !liste.current) return;
    liste.current.querySelector(`[data-id="${CSS.escape(allume)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [allume]);

  if (!bien) return <p className="m-0 p-5 text-[13.5px] text-brume">L'adresse n'est pas placée : la carte s'affichera après la lecture de l'Emplacement.</p>;
  const arrets = rue?.transports?.arrets || null;
  const genres = rue?.transports?.genres || [];
  const onglets = [
    ...(adresseTx ? [{ cle: "transactions", nom: "Transactions", n: tx.data ? lignes.transactions.length : null }] : []),
    { cle: "transports", nom: "Transports", n: arrets ? lignes.transports.length : null },
    { cle: "enseignes", nom: "Enseignes nationales", n: lignes.enseignes.length },
    { cle: "vides", nom: "Locaux vides", n: lignes.vides.filter((x) => x.genre === "vacant").length },
  ];
  // Ce qui manque à l'onglet ouvert, dit à la place de la liste plutôt qu'une carte muette.
  const manque = onglet === "transports" && !arrets
    ? (genres.length ? `À 300 m : ${genres.join(", ")}. Relancez l'Emplacement pour placer les arrêts.` : "Transports non lus : relancez l'Emplacement.")
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Les onglets au-dessus de la carte, hors d'elle : un seul ouvert à la fois, son nombre à côté. */}
        <div role="tablist" aria-label="Ce que montre la carte" className="flex flex-wrap gap-1.5">
          {onglets.map((o) => {
            const on = onglet === o.cle;
            return (
              <button key={o.cle} type="button" role="tab" aria-selected={on} onClick={() => choisir(o.cle)}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors ${on ? "border-bord-vif bg-relief text-encre" : "border-trait text-craie hover:border-bord-vif hover:text-encre"}`} style={on ? undefined : { background: "transparent" }}>
                <span className="h-2.5 w-2.5 rounded-full bg-menthe" style={{ opacity: on ? 1 : 0.55 }} />
                {o.nom}
                {o.n != null && <span className="tabular-nums text-ardoise">{o.n}</span>}
              </button>
            );
          })}
        </div>
        {/* Fonds et murs se montrent ou se cachent chacun. */}
        {onglet === "transactions" && familles.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {familles.map((f) => {
              const on = !masquees.has(f.cle);
              return (
                <button key={f.cle} type="button" aria-pressed={on} onClick={() => basculer(f.cle)}
                  className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors ${on ? "border-bord-doux text-encre" : "border-trait text-brume"}`} style={{ background: "transparent" }}>
                  <span className={`h-2.5 w-2.5 rounded-full ${AU_TRAIT.has(f.cle) ? "border-2 border-menthe" : "bg-menthe"}`} style={{ opacity: on ? 1 : 0.35 }} />
                  {f.nom}
                  <span className="tabular-nums text-ardoise">{tx.data[f.cle].length}</span>
                </button>
              );
            })}
          </div>
        )}
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
                eventHandlers={{ mouseover: () => setAllume(x.id), mouseout: () => setAllume((v) => (v === x.id ? null : v)), click: () => setAllume(x.id) }}>
                <Tooltip direction="top" offset={[0, -12]} opacity={1}>
                  <span className="block text-[13px] font-medium">{x.titre}</span>
                  {x.valeur && <span className="block text-[12.5px]">{x.valeur}{x.sous_valeur ? ` · ${x.sous_valeur}` : ""}</span>}
                  {x.detail && <span className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{x.detail}</span>}
                  {x.bulle.map((t) => <span key={t} className="block max-w-[280px] whitespace-normal text-[12px] opacity-75">{t}</span>)}
                </Tooltip>
              </Marker>
            ))}
            <Marker position={[bien.lat, bien.lon]} icon={BIEN} zIndexOffset={1000} interactive={false} keyboard={false} />
            <Suivre point={point} carte={carte} />
          </MapContainer>
          <span className="absolute bottom-1.5 right-2 z-[500] text-[10.5px] text-brume">{fond.attribution} · {source}</span>
        </div>

        {/* La liste, liée à la carte ; au téléphone, sous elle. */}
        <div ref={liste} className="min-w-0 overflow-y-auto rounded-[12px] border border-trait max-lg:max-h-[360px]" style={{ maxHeight: hauteur }}>
          {manque ? <p className="m-0 px-4 py-4 text-[13px] leading-[1.5] text-ardoise">{manque}</p> : (
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
