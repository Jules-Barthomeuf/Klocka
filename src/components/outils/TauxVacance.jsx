import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Search, X } from "lucide-react";
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import { useFondDeCarte } from "@/lib/tuiles";
import OngletsOutils from "@/components/outils/OngletsOutils";

// Le taux de vacance commerciale (14 oct. 2026, Jules : « savoir qu'il y a à
// peu près ce taux de vacance dans la rue, fait de façon rigoureuse, de la même
// manière à chaque fois »). Autour d'une adresse : tous les locaux à vitrine,
// l'état de chacun et sa raison, le taux, la fourchette, le détail par rue.
// Les règles sont côté serveur (server/outils/vacance-taux.js), versionnées.

const RAYON = { min: 50, max: 1500, defaut: 300, pas: 50 };
const ETATS = [["vacant", "Vacants"], ["incertain", "Incertains"], ["occupe", "Occupés"], ["exclus", "Écartés"]];
const COULEUR = { vacant: JL.alerte, incertain: JL.ambre, occupe: JL.menthe };
const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

const FRANCE = { centre: [46.6, 2.4], zoom: 6 };

function Cadrer({ zone }) {
  const map = useMap();
  useEffect(() => {
    // Rien de choisi (14 oct. 2026, Jules) : la France entière.
    if (!zone) {
      const france = () => { map.invalidateSize(); map.setView(FRANCE.centre, FRANCE.zoom); };
      france();
      const t = setTimeout(france, 250);
      return () => clearTimeout(t);
    }
    const d = zone.rayon_m * 1.1;
    const dLat = d / 111320; const dLon = d / (111320 * Math.cos((zone.lat * Math.PI) / 180));
    // La carte connaît sa taille un instant après son premier dessin : on recadre alors.
    const cadrer = () => { map.invalidateSize(); map.fitBounds([[zone.lat - dLat, zone.lon - dLon], [zone.lat + dLat, zone.lon + dLon]]); };
    cadrer();
    const t = setTimeout(cadrer, 250);
    return () => clearTimeout(t);
  }, [zone?.lat, zone?.lon, zone?.rayon_m]);
  return null;
}

function Carte({ zone, locaux, choisi, onChoisir }) {
  const { fond, surErreur } = useFondDeCarte({ google: true });
  return (
    <div className={`k-carte-rues relative h-full min-h-[320px] ${fond.google ? "k-carte-google" : ""}`}>
      <MapContainer center={zone ? [zone.lat, zone.lon] : FRANCE.centre} zoom={zone ? 16 : FRANCE.zoom} className="h-full w-full" zoomControl={false} attributionControl={false}>
        <TileLayer key={fond.cle} url={fond.url} maxZoom={fond.zoom_max} eventHandlers={{ tileerror: surErreur }} />
        <Cadrer zone={zone} />
        {zone && <Circle center={[zone.lat, zone.lon]} radius={zone.rayon_m} pathOptions={{ color: JL.encre, weight: 1, opacity: 0.5, fillOpacity: 0.03 }} />}
        {(locaux || []).map((l) => (
          <CircleMarker key={l.cle} center={[l.lat, l.lon]} radius={choisi === l.cle ? 9 : 6}
            pathOptions={{ color: JL.encre, weight: 1, fillColor: COULEUR[l.etat], fillOpacity: 0.95 }} eventHandlers={{ click: () => onChoisir(l.cle) }}>
            <Tooltip direction="top" offset={[0, -6]}>{l.adresse}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export default function TauxVacance() {
  const [sp, setSp] = useSearchParams();
  const [texte, setTexte] = useState("");
  const [propositions, setPropositions] = useState([]);
  const [adresse, setAdresse] = useState(() => (sp.get("lat") ? { label: sp.get("q") || "", lat: Number(sp.get("lat")), lon: Number(sp.get("lon")), citycode: sp.get("commune") } : null));
  const [rayon, setRayon] = useState(() => Number(sp.get("rayon")) || RAYON.defaut);
  const [etat, setEtat] = useState("vacant");
  const [choisi, setChoisi] = useState(null);
  const [r, setR] = useState(null);
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState(null);
  const sondage = useRef(null);
  useEffect(() => () => clearTimeout(sondage.current), []);

  useEffect(() => {
    const q = texte.trim();
    if (q.length < 3 || adresse) { setPropositions([]); return undefined; }
    const t = setTimeout(async () => {
      try { setPropositions((await base44.request("GET", `/api/outils/adresses/suggest?q=${encodeURIComponent(q)}`)).suggestions || []); } catch { setPropositions([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [texte, adresse]);

  const interroger = async (a, ray) => {
    try {
      const d = await base44.request("GET", `/api/outils/vacance/taux?${new URLSearchParams({ lat: a.lat, lon: a.lon, rayon_m: ray, commune: a.citycode || "" })}`);
      if (d.etat === "chargement") { sondage.current = setTimeout(() => interroger(a, ray), 4000); return; }
      setR(d); setAttente(false);
    } catch (e) { setErreur(e?.message || "Le calcul a échoué."); setAttente(false); }
  };
  const lancer = () => {
    if (!adresse) return;
    clearTimeout(sondage.current);
    setErreur(null); setAttente(true); setChoisi(null);
    setSp({ outil: "taux", q: adresse.label, lat: String(adresse.lat), lon: String(adresse.lon), commune: adresse.citycode || "", rayon: String(rayon) }, { replace: true });
    interroger(adresse, rayon);
  };
  useEffect(() => { if (adresse?.lat && sp.get("lat")) lancer(); }, []);

  const liste = useMemo(() => (etat === "exclus" ? r?.exclus || [] : (r?.locaux || []).filter((l) => l.etat === etat)), [r, etat]);
  const t = r?.taux;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex-none border-b border-trait px-5 pt-4 md:px-8">
        <OngletsOutils />
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre">Taux de vacance</h1>
          <p className="m-0 text-[13.5px] text-ardoise">Les locaux à vitrine autour d'une adresse, l'état de chacun et pourquoi.</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2.5 pb-3">
          {!adresse ? (
            <div className="relative min-w-[260px] flex-1 md:max-w-[460px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brume" strokeWidth={1.7} />
              <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Adresse de la rue à mesurer" aria-label="Adresse" autoComplete="off"
                className="h-10 w-full rounded-champ border border-trait bg-surface pl-9 pr-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
              {propositions.length > 0 && (
                <div className="absolute left-0 right-0 top-[44px] z-[600] overflow-hidden rounded-[14px] border border-trait bg-rail shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                  {propositions.map((p) => (
                    <button key={p.label + p.lon} type="button" disabled={!p.choisissable} onClick={() => { setAdresse(p); setTexte(""); setPropositions([]); }}
                      className={`block w-full px-3.5 py-2.5 text-left text-[14px] ${p.choisissable ? "text-encre hover:bg-rail-actif" : "cursor-not-allowed text-brume"}`} style={{ background: "transparent" }}>{p.label}</button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex h-10 max-w-full items-center gap-2 rounded-champ border border-menthe/40 bg-menthe/[0.08] pl-3.5 pr-2 text-[14px] text-menthe">
              <span className="truncate">{adresse.label}</span>
              <button type="button" onClick={() => { setAdresse(null); setR(null); setSp({ outil: "taux" }, { replace: true }); }} aria-label="Changer d'adresse" className="grid h-7 w-7 place-items-center rounded-full text-menthe hover:bg-menthe/[0.12]" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
            </span>
          )}
          <label className="inline-flex h-10 items-center gap-2.5 rounded-champ border border-trait px-3 text-[12.5px] text-ardoise">
            <span className="uppercase tracking-[.14em] text-brume">Rayon</span>
            <input type="range" min={RAYON.min} max={RAYON.max} step={RAYON.pas} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} aria-label="Rayon en mètres" className="k-vacance-curseur w-[120px] md:w-[160px]" />
            <span className="w-14 text-right tabular-nums text-encre">{rayon} m</span>
          </label>
          <button type="button" onClick={lancer} disabled={!adresse || attente} className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
            {attente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Mesurer
          </button>
        </div>
      </div>

      {/* La carte est toujours là (14 oct. 2026) : la France à l'arrivée, l'adresse une fois choisie, les locaux une fois mesurés. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {!r ? (
          <div className="min-w-0 px-5 py-5 md:px-8">
            {erreur && <p className="m-0 text-[14px] text-alerte">{erreur}</p>}
            {attente && <p className="m-0 flex items-center gap-2 text-[14px] text-ardoise"><Loader2 className="h-4 w-4 flex-none animate-spin" />Recensement des locaux de la commune (SIRENE), puis vérification sur OpenStreetMap et Google Maps. La première fois dans une commune : une à deux minutes.</p>}
            {!attente && !erreur && <p className="m-0 text-[14px] text-brume">Choisissez une adresse, réglez le rayon, puis « Mesurer ».</p>}
          </div>
        ) : (
          <div className="min-w-0 overflow-y-auto px-5 py-5 md:px-8">
            {/* Le taux, la fourchette, les comptes. */}
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Taux de vacance estimé</p>
                <p className="m-0 mt-1 text-[48px] font-light leading-none tracking-[-0.03em] text-encre tabular-nums">{pct(t.taux)}</p>
                {t.bas !== t.haut && <p className="m-0 mt-1.5 text-[13px] text-ardoise">entre {pct(t.bas)} et {pct(t.haut)} selon les {t.incertains} incertain{t.incertains > 1 ? "s" : ""}</p>}
              </div>
              <div className="grid grid-cols-4 gap-5 text-[13px]">
                {[["Locaux", t.locaux, "text-encre"], ["Vacants", t.vacants, "text-alerte"], ["Incertains", t.incertains, "text-ambre"], ["Occupés", t.occupes, "text-menthe"]].map(([m, n, c]) => (
                  <div key={m}><p className={`m-0 text-[22px] tabular-nums ${c}`}>{n}</p><p className="m-0 text-ardoise">{m}</p></div>
                ))}
              </div>
            </div>
            <p className="m-0 mt-4 max-w-[78ch] text-[12.5px] leading-[1.6] text-brume">
              Méthode {r.parametres.version} : un local par adresse où un commerce ou un service en boutique est ouvert, ou a fermé depuis {r.parametres.annees_historique} ans (SIRENE, recensé le {dateFr(r.recense_le)}) ;
              vacant si plus personne n'y est ouvert, vérifié sur Google Maps ({r.google.verifies} locaux) et OpenStreetMap ({r.osm.commerces} commerces autour). Taux = vacants / (vacants + occupés).
              {r.exclus.length > 0 && ` ${r.exclus.length} adresses écartées (vente hors magasin, domiciliation, sans numéro).`} Une estimation reproductible, pas un relevé de terrain.
            </p>

            {/* Par rue. */}
            {r.rues.length > 0 && (
              <div className="mt-6">
                <p className="m-0 mb-2 text-[11px] uppercase tracking-[.16em] text-brume">Par rue</p>
                <div className="border-y border-trait">
                  {r.rues.map((x) => (
                    <div key={x.voie} className="grid grid-cols-[minmax(0,1fr)_70px_90px] items-center gap-3 border-t border-trait py-2 text-[13.5px] first:border-t-0">
                      <span className="min-w-0 truncate text-encre">{x.voie.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}</span>
                      <span className="text-right tabular-nums text-encre">{pct(x.taux)}</span>
                      <span className="text-right tabular-nums text-ardoise">{x.vacants} / {x.vacants + x.occupes}{x.incertains ? ` · ${x.incertains} ?` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Les locaux, par état, chacun avec sa raison. */}
            <div className="mt-6">
              <div className="flex gap-1 rounded-full bg-rail-actif p-1">
                {ETATS.map(([k, mot]) => {
                  const n = k === "exclus" ? r.exclus.length : r.locaux.filter((l) => l.etat === k).length;
                  return <button key={k} type="button" onClick={() => setEtat(k)} aria-pressed={etat === k} className={`flex-1 rounded-full px-3 py-1 text-[12.5px] ${etat === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={etat === k ? undefined : { background: "transparent" }}>{mot} · {n}</button>;
                })}
              </div>
              <div className="mt-3 border-y border-trait">
                {liste.map((l, k) => (
                  <button key={l.cle || `${l.adresse}-${k}`} type="button" onClick={() => setChoisi(l.cle || null)}
                    className={`block w-full border-t border-trait py-2.5 text-left first:border-t-0 ${choisi && choisi === l.cle ? "bg-relief/50" : "hover:bg-relief/30"}`} style={{ background: choisi && choisi === l.cle ? undefined : "transparent" }}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] text-encre">{l.adresse}</span>
                      {l.distance_m != null && <span className="flex-none text-[12px] tabular-nums text-brume">{l.distance_m} m</span>}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-[1.5] text-ardoise">{l.raison}{l.nom && etat === "exclus" ? ` · ${l.nom}` : ""}</span>
                  </button>
                ))}
                {!liste.length && <p className="m-0 py-6 text-center text-[13.5px] text-brume">Aucun.</p>}
              </div>
            </div>
          </div>
        )}
        <div className="h-[calc(100dvh-170px)] lg:sticky lg:top-0 border-l border-trait max-lg:order-first max-lg:h-[360px] max-lg:border-l-0 max-lg:border-b">
          <Carte zone={r?.zone || (adresse ? { lat: adresse.lat, lon: adresse.lon, rayon_m: rayon } : null)} locaux={r?.locaux || []} choisi={choisi}
            onChoisir={(c) => { setChoisi(c); const l = r?.locaux.find((x) => x.cle === c); if (l) setEtat(l.etat); }} />
        </div>
      </div>
    </div>
  );
}
