import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { kEuros } from "@/lib/clients-commerces";
import { VERRE } from "@/lib/verre";

// Les jeux immobiliers (26 nov. 2026, Jules : « une Street View, et on devine le prix au mètre carré de la rue pour une
// boutique ; pas des jeux chronométrés, des jeux immobiliers, des choses vraies »). Les loyers sont les lectures Equimmox
// en base (baux de commerces autour de l'adresse ; Jules, 26 nov. : « pas Data-B, mets Equimmox »), les prix les annonces
// de murs de l'export Equimmox (server/jeux-immo.js).
// Le 27 nov. (Jules : « supprime les autres onglets ; à la fin, on a un leaderboard ») : La rue seule, et son classement
// entre les admins. Le rendement, Deux actifs et les idées sont retirés de l'écran ; les verdicts de duels restent en base.

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const nf = new Intl.NumberFormat("fr-FR");
const eur = (x) => `${nf.format(Math.round(x))}\u00a0€`;
const rayonLu = (r) => (r ? `${String(r).replace("m", "")} m` : "500 m");

// --- Street View ---------------------------------------------------------------------------------------------------

const embed = (q) => `https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&${q}&fov=90`;

/** Le panorama Google d'une adresse, tourné vers le local (même chemin que la fiche projet), ou d'un point connu. */
function VueRue({ adresse, point = null, className = "h-[420px]" }) {
  const { data, isFetched } = useQuery({
    queryKey: ["panorama-adresse", adresse, ""],
    queryFn: () => base44.request("GET", `/api/streetview/panorama?adresse=${encodeURIComponent(adresse)}`),
    enabled: !!adresse && !point,
    staleTime: Infinity,
    retry: 1,
  });
  const pano = data?.panorama;
  const p = point || data?.point;
  const src = !point && pano?.pano ? embed(`pano=${encodeURIComponent(pano.pano)}&heading=${pano.cap ?? 0}&pitch=0`) : p ? embed(`location=${p.lat},${p.lon}`) : null;
  return (
    <div className={`relative overflow-hidden rounded-bloc bg-relief ${className}`}>
      {!point && !isFetched ? <div className="absolute inset-0 grid place-items-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-menthe/30 border-t-menthe" /></div>
        : src ? <iframe key={src} src={src} title={`Street View, ${adresse || "l'emplacement"}`} className="absolute inset-0 h-full w-full border-0" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
          : <p className="absolute inset-0 m-0 grid place-items-center px-6 text-center text-[13.5px] text-ardoise">Pas de Street View pour cette adresse.</p>}
    </div>
  );
}

const Etiquette = ({ children, className = "" }) => <p className={`m-0 text-[11px] uppercase tracking-[.16em] text-brume ${className}`}>{children}</p>;
const Bouton = ({ children, className = "", ...p }) => (
  <button type="button" {...p} className={`h-11 rounded-full bg-encre px-6 text-[15px] text-fond transition-opacity hover:opacity-90 disabled:opacity-40 ${className}`}>{children}</button>
);

// --- Les manches : on règle un chiffre, on compare au vrai --------------------------------------------------------------

// Les points, sur 100 : 100 à 10 % près, 0 au-delà de 60 % d'écart (la même règle que server/jeux-immo.js).
const points = (estime, vrai) => {
  if (!(estime > 0) || !(vrai > 0)) return 0;
  const e = Math.abs(Math.log(estime / vrai));
  const e10 = Math.log(1.1);
  const e60 = Math.log(1.6);
  return e <= e10 ? 100 : e >= e60 ? 0 : Math.round(100 * (1 - (e - e10) / (e60 - e10)));
};
const logEchelle = (bas, haut, pas) => ({
  versValeur: (t) => Math.round((bas * (haut / bas) ** t) / pas) * pas,
  versCurseur: (v) => Math.log(v / bas) / Math.log(haut / bas),
});
const datee = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : null);
const lieu = (m) => (m.adresse ? String(m.adresse).replace(/\s*\d{5}.*$/, "") : "Adresse non donnée");

// Chaque sorte de manche : la question, l'échelle du curseur, le vrai chiffre et ce qu'on révèle.
const SORTES = {
  // Le loyer d'une boutique : la moyenne des baux de commerces autour de l'adresse, selon Equimmox.
  loyer: {
    nom: "Loyer",
    question: "Combien se loue une boutique ici ?",
    unite: "€ / m² / an",
    bornes: [60, 2000], depart: 300, ...logEchelle(60, 2000, 5),
    afficher: (v) => nf.format(v),
    aide: (v) => `Pour une boutique de 80 m², ${eur(v * 80)} de loyer par an.`,
    vrai: (m) => m.loyer.milieu,
    titre: (m) => m.rue || lieu(m),
    reponse: (m) => ({ etiquette: "Les baux autour, selon Equimmox", chiffre: `${eur(m.loyer.milieu)}`, suite: "en moyenne",
      details: [["Fourchette", `${nf.format(m.loyer.basse)} à ${nf.format(m.loyer.haute)} €`], ["Lu sur", `Baux de commerces à ${rayonLu(m.rayon)}${m.surface?.min ? `, ${m.surface.min} à ${m.surface.max} m²` : ""}`]],
      source: `${m.adresse}${m.lu_le ? ` · lecture Equimmox du ${new Date(m.lu_le).toLocaleDateString("fr-FR")}` : ""}` }),
  },
  // Le prix des murs au m² : le prix demandé d'une vraie annonce de murs de commerce (export Equimmox).
  prix: {
    nom: "Prix des murs",
    question: "Combien valent les murs ici, au m² ?",
    unite: "€ / m²",
    bornes: [800, 20000], depart: 3000, ...logEchelle(800, 20000, 50),
    afficher: (v) => nf.format(v),
    aide: (v) => `Pour un local de 80 m², ${kEuros(v * 80)}.`,
    vrai: (m) => m.prix_m2,
    titre: (m) => lieu(m),
    reponse: (m) => ({ etiquette: "Le prix demandé de l'annonce", chiffre: `${eur(m.prix_m2)}`, suite: "le m²",
      details: [["L'annonce", `${nf.format(m.surface)} m² à ${kEuros(m.prix)}`], ["Le local", m.loue ? "Vendu loué" : "Vendu libre"]],
      source: `Annonce Equimmox${m.publie_le ? ` publiée en ${datee(m.publie_le)}` : ""}${m.retire_le ? `, retirée en ${datee(m.retire_le)}` : ""}` }),
  },
};

// --- Le classement -------------------------------------------------------------------------------------------------

const jourCourt = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

function LigneClassement({ l, neuve }) {
  return (
    <div className={`grid grid-cols-[28px_32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-trait px-2 py-2.5 ${neuve ? "rounded-[10px] bg-menthe/10" : ""}`}>
      <span className={`text-[15px] tabular-nums ${l.rang === 1 ? "text-ambre" : "text-brume"}`}>{l.rang}</span>
      <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-relief text-[12.5px] text-craie">
        {l.photo ? <img src={l.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : (l.prenom || "?").charAt(0)}
      </span>
      <span className="min-w-0 truncate text-[15px]">
        {l.prenom}<span className="ml-2 text-[12.5px] text-brume">{neuve ? "cette partie" : jourCourt(l.le)}</span>
      </span>
      <span className="text-[15px] tabular-nums">{l.points}<span className="ml-1 text-[12.5px] text-brume">/ {l.sur}</span></span>
    </div>
  );
}

/** Le classement de La rue entre les admins (27 nov. 2026, Jules) : une ligne par partie, la sienne en vert. */
function Classement({ partie }) {
  const { data, isLoading } = useQuery({
    queryKey: ["jeu-classement", partie?.id || null],
    queryFn: () => base44.request("GET", `/api/jeux/classement${partie?.id ? `?partie=${encodeURIComponent(partie.id)}` : ""}`),
    enabled: !!partie,
  });
  const lignes = data?.lignes || [];
  return (
    <div className="min-w-0">
      <Etiquette>Classement de l'équipe{data?.total ? ` · ${data.total} parties` : ""}</Etiquette>
      <div className="mt-3 border-t border-trait">
        {!partie || isLoading ? <p className="m-0 py-4 text-[13.5px] text-ardoise">Le classement arrive…</p>
          : !lignes.length ? <p className="m-0 py-4 text-[13.5px] text-ardoise">Aucune partie encore.</p>
            : lignes.map((l) => <LigneClassement key={l.id} l={l} neuve={l.id === partie.id} />)}
        {data?.partie && (
          <>
            <p className="m-0 py-1 text-center text-[13.5px] text-brume">···</p>
            <LigneClassement l={data.partie} neuve />
          </>
        )}
      </div>
    </div>
  );
}

function JeuManches({ url, cle, nombre = 6, sorteDe = (m) => m.type, vide }) {
  const [tirage, setTirage] = useState(0);
  const { data, isFetching } = useQuery({ queryKey: [cle, tirage], queryFn: () => base44.request("GET", url), staleTime: Infinity });
  const manches = (data?.manches || data?.annonces || []).slice(0, nombre);
  const [i, setI] = useState(0);
  const [t, setT] = useState(null);
  const [faits, setFaits] = useState([]);
  const m = manches[i];
  const sorte = m ? SORTES[sorteDe(m)] : null;
  const curseur = t ?? (sorte ? sorte.versCurseur(sorte.depart) : 0);
  const estime = sorte ? sorte.versValeur(curseur) : 0;
  const fait = faits[i];
  const total = faits.reduce((s, f) => s + (f?.points || 0), 0);
  const n = manches.length;
  const rejouer = () => { setTirage((x) => x + 1); setI(0); setFaits([]); setT(null); setPartie(null); };
  // La partie finie part au classement, une fois par tirage (27 nov. 2026, Jules).
  const [partie, setPartie] = useState(null);
  const envoyee = useRef(-1);
  const finie = n > 0 && i >= n && faits.filter(Boolean).length === n;
  useEffect(() => {
    if (!finie || envoyee.current === tirage) return;
    envoyee.current = tirage;
    base44.request("POST", "/api/jeux/score", { body: { jeu: "rue", points: total, manches: n } })
      .then((r) => setPartie({ id: r?.id || null }))
      .catch(() => setPartie({ id: null }));
  }, [finie, tirage, total, n]);
  if (isFetching && !n) return <p className="m-0 text-[13.5px] text-ardoise">Les adresses arrivent…</p>;
  if (!m) {
    if (!n) return <p className="m-0 text-[13.5px] text-ardoise">{vide}</p>;
    return (
      <div className="grid gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Etiquette>Partie terminée</Etiquette>
            <p className="m-0 mt-2 text-[40px] font-normal leading-none tracking-[-0.02em] tabular-nums">{total}<span className="ml-1 text-[18px] text-brume">/ {n * 100}</span></p>
          </div>
          <Bouton onClick={rejouer}>Rejouer</Bouton>
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Classement partie={partie} />
          <div className="min-w-0">
            <Etiquette>Vos manches</Etiquette>
            <div className="mt-3 border-t border-trait">
              {faits.filter(Boolean).map((f, k) => (
                <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-trait py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">{f.sorte.titre(f.m)} <span className="text-ardoise">· {f.m.ville}</span></span>
                    <span className="block text-[12.5px] tabular-nums text-brume">{f.sorte.nom} · {f.sorte.afficher(f.estime)} pour {f.sorte.afficher(f.vraiAffiche)} {f.sorte.unite}</span>
                  </span>
                  <span className="text-[15px] tabular-nums">{f.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  const vrai = sorte.vrai(m);
  const comparable = estime;
  const vraiAffiche = vrai;
  const valider = () => setFaits((f) => { const c = f.slice(); c[i] = { m, sorte, estime, vraiAffiche, points: points(comparable, vrai) }; return c; });
  const ecart = fait ? Math.round(((comparable - vrai) / vrai) * 100) : 0;
  const r = fait ? sorte.reponse(m) : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <VueRue key={`${i}-${m.adresse}`} adresse={m.adresse} point={m.point || null} className="h-[460px] max-md:h-[300px]" />
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <Etiquette>{sorte.nom} · manche {i + 1} sur {n} · {total} points</Etiquette>
          <p className="m-0 mt-2 text-[22px] font-normal leading-tight tracking-[-0.01em]">{sorte.titre(m)}</p>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">{m.ville}</p>
        </div>
        {sorte.contexte && (
          <div className="grid grid-cols-3 gap-4 max-md:grid-cols-2">
            {sorte.contexte(m).map(([k, v]) => <div key={k}><Etiquette>{k}</Etiquette><p className="m-0 mt-1 text-[18px] tabular-nums">{v}</p></div>)}
          </div>
        )}
        <div>
          <p className="m-0 text-[15px] text-craie">{sorte.question}</p>
          <p className="m-0 mt-3 text-[40px] font-normal leading-none tracking-[-0.02em] tabular-nums">{sorte.afficher(estime)}<span className="ml-2 text-[13.5px] tracking-normal text-brume">{sorte.unite}</span></p>
          <input id={`${cle}-curseur`} type="range" min={0} max={1} step={0.001} value={curseur} disabled={!!fait} onChange={(e) => setT(Number(e.target.value))}
            aria-label={sorte.question} className="mt-5 w-full accent-menthe" />
          <div className="mt-1 flex justify-between text-[12.5px] tabular-nums text-brume"><span>{nf.format(sorte.bornes[0])} {sorte.unite === "%" ? "%" : "€"}</span><span>{nf.format(sorte.bornes[1])} {sorte.unite === "%" ? "%" : "€"}</span></div>
          <p className="m-0 mt-3 text-[13.5px] text-ardoise">{sorte.aide(estime, m)}</p>
        </div>
        {!fait ? <Bouton className="self-start" onClick={valider}>Valider</Bouton> : (
          <div className="grid gap-4 border-t border-trait pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <Etiquette>{r.etiquette}</Etiquette>
                <p className="m-0 mt-2 text-[24px] tabular-nums">{r.chiffre}<span className="ml-1.5 text-[13.5px] text-brume">{r.suite}</span></p>
                <p className="m-0 mt-1 text-[13.5px] text-ardoise">Vous étiez {ecart === 0 ? "pile dessus" : `${ecart > 0 ? "au-dessus" : "en dessous"} de ${Math.abs(ecart)} %`}</p>
              </div>
              <p className="m-0 text-right"><span className="block text-[40px] leading-none tabular-nums text-menthe">{fait.points}</span><span className="text-[12.5px] text-brume">points</span></p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-[13.5px]">
              {r.details.map(([k, v]) => <div key={k}><Etiquette>{k}</Etiquette><p className="m-0 mt-1 tabular-nums text-craie">{v}</p></div>)}
            </div>
            <p className="m-0 text-[12.5px] text-brume">{r.source}</p>
            <Bouton className="justify-self-start" onClick={() => { setI((x) => x + 1); setT(null); }}>{i + 1 >= n ? "Voir le score" : "Manche suivante"}</Bouton>
          </div>
        )}
      </div>
    </div>
  );
}

// La rue : loyer d'une boutique et prix des murs au m², en alternance (26 nov. 2026, Jules).
const JeuRue = () => <JeuManches url="/api/jeux/rue?n=6" cle="jeu-rue" nombre={6} vide="Aucune adresse lue dans Equimmox." />;
export default function Jeux() {
  const user = useUser();
  if (user && user.role !== "admin") return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe Klocka.</p>;
  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-6 px-6 py-8 max-md:px-4">
      <div className="min-w-0">
        <h1 className="m-0 text-[24px] font-normal text-encre">La rue</h1>
        <p className="m-0 mt-1 text-[13.5px] text-ardoise">Le loyer d'une boutique et le prix des murs, sur des adresses réelles.</p>
      </div>
      <div className={`${VERRE} p-6 max-md:p-4`}><JeuRue /></div>
    </div>
  );
}
