import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { kEuros } from "@/lib/clients-commerces";
import { VERRE } from "@/lib/verre";

// Les jeux immobiliers (26 nov. 2026, Jules : « une Street View, et on devine le prix au mètre carré de la
// rue pour une boutique ; deux actifs qu'on peut vraiment analyser, avec leurs défauts, et on choisit ; pas des jeux
// chronométrés, des jeux immobiliers, des choses vraies »). Pour l'écran d'attente d'abord, peut-être l'espace client
// ensuite. Les loyers sont les lectures Equimmox en base (baux de commerces autour de l'adresse ; Jules, 26 nov. : « pas
// Data-B, mets Equimmox »), les actifs les vrais dossiers (server/jeux-immo.js).
// Dans le menu de l'équipe (même jour, Jules : « un menu Jeux avec le truc de la rue, deux actifs ») ; un duel
// d'actifs ne se joue qu'une fois tranché par l'équipe (« il faut que l'on vérifie avant »).

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const nf = new Intl.NumberFormat("fr-FR");
const eur = (x) => `${nf.format(Math.round(x))}\u00a0€`;
const pc = (x) => `${String(x).replace(".", ",")}\u00a0%`;
const UNITE = "€ / m² / an";
const rayonLu = (r) => (r ? `${String(r).replace("m", "")} m` : "500 m");

const ONGLETS = [
  ["rue", "La rue"],
  ["rendement", "Le rendement"],
  ["duel", "Deux actifs"],
  ["idees", "Idées"],
];

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
const BoutonClair = ({ children, className = "", ...p }) => (
  <button type="button" {...p} className={`h-11 rounded-full border border-bord-doux px-6 text-[15px] text-craie hover:text-encre ${className}`} style={{ background: "transparent" }}>{children}</button>
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
  // Le rendement : à quel taux achète-t-on ce local loué ? Le score se compte sur le prix, comme le loyer.
  rendement: {
    nom: "Rendement",
    question: "À quel rendement l'achetez-vous ?",
    unite: "%",
    bornes: [3, 12], depart: 6.5,
    versValeur: (t) => Math.round((3 + 9 * t) * 20) / 20,
    versCurseur: (v) => (v - 3) / 9,
    afficher: (v) => String(v.toFixed(2)).replace(/0$/, "").replace(".", ","),
    aide: (v, m) => `Avec ${eur(m.loyer)} de loyer par an, vous l'achetez ${kEuros(Math.round(m.loyer / (v / 100) / 1000) * 1000)}.`,
    vrai: (m) => m.prix,
    estimeComparable: (v, m) => m.loyer / (v / 100),
    titre: (m) => lieu(m),
    contexte: (m) => [["Loyer annuel", eur(m.loyer)], m.surface ? ["Surface", `${nf.format(m.surface)} m²`] : null, m.loyer_m2 ? ["Loyer au m²", `${eur(m.loyer_m2)} / an`] : null].filter(Boolean),
    reponse: (m) => ({ etiquette: "Le prix demandé de l'annonce", chiffre: kEuros(m.prix), suite: `soit ${pc(m.rendement)}`,
      details: [["Prix au m²", m.prix_m2 ? eur(m.prix_m2) : "?"], ["Loyer", `${eur(m.loyer)} par an`]],
      source: `Annonce Equimmox de murs loués${m.publie_le ? `, publiée en ${datee(m.publie_le)}` : ""}${m.retire_le ? `, retirée en ${datee(m.retire_le)}` : ""}` }),
  },
};

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
  const rejouer = () => { setTirage((x) => x + 1); setI(0); setFaits([]); setT(null); };
  if (isFetching && !n) return <p className="m-0 text-[13.5px] text-ardoise">Les adresses arrivent…</p>;
  if (!m) {
    if (!n) return <p className="m-0 text-[13.5px] text-ardoise">{vide}</p>;
    return (
      <div className="grid gap-6">
        <div>
          <Etiquette>Partie terminée</Etiquette>
          <p className="m-0 mt-2 text-[40px] font-normal leading-none tracking-[-0.02em] tabular-nums">{total}<span className="ml-1 text-[18px] text-brume">/ {n * 100}</span></p>
        </div>
        <div className="border-t border-trait">
          {faits.filter(Boolean).map((f, k) => (
            <div key={k} className="grid grid-cols-[110px_minmax(0,1fr)_auto_auto] items-baseline gap-4 border-b border-trait py-3 max-md:grid-cols-[minmax(0,1fr)_auto]">
              <span className="text-[12.5px] text-brume max-md:hidden">{f.sorte.nom}</span>
              <span className="min-w-0 truncate text-[15px]">{f.sorte.titre(f.m)} <span className="text-ardoise">· {f.m.ville}</span></span>
              <span className="text-[13.5px] tabular-nums text-ardoise max-md:hidden">{f.sorte.afficher(f.estime)} pour {f.sorte.afficher(f.vraiAffiche)} {f.sorte.unite}</span>
              <span className="text-[15px] tabular-nums">{f.points}</span>
            </div>
          ))}
        </div>
        <Bouton className="justify-self-start" onClick={rejouer}>Rejouer</Bouton>
      </div>
    );
  }
  const vrai = sorte.vrai(m);
  const comparable = sorte.estimeComparable ? sorte.estimeComparable(estime, m) : estime;
  const vraiAffiche = sorte === SORTES.rendement ? m.rendement : vrai;
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
                <p className="m-0 mt-1 text-[13.5px] text-ardoise">{sorte === SORTES.rendement ? "Votre prix était" : "Vous étiez"} {ecart === 0 ? "pile dessus" : `${ecart > 0 ? "au-dessus" : "en dessous"} de ${Math.abs(ecart)} %`}</p>
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
// Quel rendement à cet emplacement (même jour) : de vraies annonces de murs loués, à Lyon pour l'instant.
const JeuRendement = () => <JeuManches url="/api/jeux/rendement?n=5" cle="jeu-rendement" nombre={5} sorteDe={() => "rendement"} vide="Aucune annonce de murs loués dans les exports Equimmox." />;

// --- Deux actifs ----------------------------------------------------------------------------------------------------

function Ligne({ nom, valeur, fort = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-trait py-2.5">
      <span className="text-[13.5px] text-ardoise">{nom}</span>
      <span className={`text-right tabular-nums ${fort ? "text-[18px] text-encre" : "text-[15px] text-craie"}`}>{valeur}</span>
    </div>
  );
}

function Actif({ a, lettre, choisi, vu, meilleur, onChoisir, libelleChoix, note = false }) {
  const fin = a.fin_bail ? `${new Date(a.fin_bail).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}${a.ans_restants != null ? ` · ${a.ans_restants < 0 ? "échu" : `${String(a.ans_restants).replace(".", ",")} ans`}` : ""}` : "Non renseignée";
  return (
    <div className={`flex min-w-0 flex-col gap-4 rounded-bloc border p-4 transition-colors ${vu && meilleur ? "border-menthe" : choisi ? "border-bord-vif" : "border-trait"}`}>
      <VueRue adresse={a.adresse} className="h-[280px]" />
      <div className="px-1">
        <Etiquette>Actif {lettre}{vu && meilleur ? " · le choix de Klocka" : ""}</Etiquette>
        <p className="m-0 mt-2 text-[22px] font-normal leading-tight tracking-[-0.01em]">{a.titre}</p>
        <p className="m-0 mt-1 text-[13.5px] text-ardoise">{[a.activite, a.adresse].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="px-1">
        <Ligne nom="Prix" valeur={kEuros(a.prix)} fort />
        <Ligne nom="Loyer annuel HT" valeur={eur(a.loyer)} />
        <Ligne nom="Rendement brut" valeur={pc(a.rendement)} fort />
        {a.surface ? <Ligne nom="Surface" valeur={`${nf.format(a.surface)} m²`} /> : null}
        {a.prix_m2 ? <Ligne nom="Prix au m²" valeur={eur(a.prix_m2)} /> : null}
        {a.loyer_m2 ? <Ligne nom="Loyer au m² par an" valeur={eur(a.loyer_m2)} /> : null}
        <Ligne nom={`Baux autour (Equimmox${a.loyer_autour ? `, ${rayonLu(a.loyer_autour.rayon)}` : ""})`} valeur={a.loyer_autour ? `${nf.format(a.loyer_autour.basse)} à ${nf.format(a.loyer_autour.haute)} €` : "Pas de lecture"} />
        <Ligne nom="Fin du bail" valeur={fin} />
      </div>
      {vu ? (
        <div className="grid gap-3 px-1">
          {a.atouts.map((t) => <p key={t} className="m-0 flex gap-2.5 text-[13.5px] leading-[1.5] text-craie"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-menthe" />{t}</p>)}
          {a.defauts.map((t) => <p key={t} className="m-0 flex gap-2.5 text-[13.5px] leading-[1.5] text-craie"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-alerte" />{t}</p>)}
          {!a.atouts.length && !a.defauts.length && <p className="m-0 text-[13.5px] text-ardoise">Rien de signalé dans le dossier.</p>}
          {note && <p className="m-0 border-t border-trait pt-3 text-[13.5px] text-ardoise">Rendement corrigé du risque, selon la règle : <span className="tabular-nums text-encre">{pc(a.note)}</span></p>}
        </div>
      ) : null}
      {onChoisir && <BoutonClair className={choisi ? "!border-encre !text-encre" : ""} onClick={onChoisir}>{choisi ? "Choisi" : libelleChoix || `Je prends l'actif ${lettre}`}</BoutonClair>}
    </div>
  );
}

function JeuDuel() {
  const [mode, setMode] = useState("jouer");
  return (
    <div className="grid gap-6">
      <div role="tablist" aria-label="Deux actifs" className="flex items-center gap-5 border-b border-trait">
        {[["jouer", "Jouer"], ["verifier", "À vérifier"], ["verdicts", "Duels vérifiés"]].map(([id, nom]) => (
          <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className={`-mb-px border-b-2 pb-2.5 text-[14px] transition-colors ${mode === id ? "border-encre text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>{nom}</button>
        ))}
      </div>
      {mode === "jouer" ? <DuelJouer onVerifier={() => setMode("verifier")} /> : mode === "verifier" ? <DuelVerifier /> : <DuelsVerifies />}
    </div>
  );
}

/** Jouer : une paire tranchée par l'équipe ; la réponse est son choix, avec son pourquoi. */
function DuelJouer({ onVerifier }) {
  const [tirage, setTirage] = useState(0);
  const { data, isFetching } = useQuery({ queryKey: ["jeu-duel", "jouer", tirage], queryFn: () => base44.request("GET", "/api/jeux/duel"), staleTime: Infinity });
  const actifs = data?.actifs || [];
  const [choix, setChoix] = useState(null);
  const [vu, setVu] = useState(false);
  useEffect(() => { setChoix(null); setVu(false); }, [tirage]);
  if (isFetching && !actifs.length) return <p className="m-0 text-[13.5px] text-ardoise">Les dossiers arrivent…</p>;
  if (actifs.length < 2) {
    return (
      <div className="grid justify-items-start gap-3">
        <p className="m-0 text-[15px] text-craie">Aucun duel vérifié pour l'instant.</p>
        <p className="m-0 text-[13.5px] text-ardoise">Un duel se joue une fois que l'équipe a dit quel actif elle prendrait, et pourquoi.</p>
        <Bouton onClick={onVerifier}>Vérifier des duels</Bouton>
      </div>
    );
  }
  const meilleur = actifs.findIndex((a) => String(a.id) === String(data.verdict?.choix));
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[70ch]">
          <Etiquette>Deux dossiers réels · {data.valides} duel{data.valides > 1 ? "s" : ""} vérifié{data.valides > 1 ? "s" : ""}</Etiquette>
          <p className="m-0 mt-2 text-[22px] font-normal tracking-[-0.01em]">Vous avez de quoi en acheter un. Lequel ?</p>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">Regardez la rue, le loyer face aux baux autour, la fin du bail. Le meilleur rendement n'est pas toujours le meilleur achat.</p>
        </div>
        {vu && <p className="m-0 text-[15px]">{choix === meilleur ? <span className="text-menthe">Le même choix que Klocka.</span> : <span className="text-craie">Klocka aurait pris l'autre.</span>}</p>}
      </div>
      {vu && data.verdict?.pourquoi && (
        <div className="max-w-[80ch] border-l-2 border-menthe pl-4">
          <Etiquette>Pourquoi Klocka prend l'actif {"AB"[meilleur]}</Etiquette>
          <p className="m-0 mt-2 text-[15px] leading-[1.55] text-craie">{data.verdict.pourquoi}</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {actifs.map((a, k) => <Actif key={a.id} a={a} lettre={"AB"[k]} choisi={choix === k} vu={vu} meilleur={k === meilleur} onChoisir={vu ? null : () => setChoix(k)} />)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!vu ? <Bouton disabled={choix == null} onClick={() => setVu(true)}>Voir le choix de Klocka</Bouton> : <Bouton onClick={() => setTirage((x) => x + 1)}>Deux autres actifs</Bouton>}
      </div>
    </div>
  );
}

/** À vérifier : l'équipe dit quel actif elle prendrait, et pourquoi ; c'est la réponse des joueurs. */
function DuelVerifier() {
  const [tirage, setTirage] = useState(0);
  const { data, isFetching } = useQuery({ queryKey: ["jeu-duel", "verifier", tirage], queryFn: () => base44.request("GET", "/api/jeux/duel?mode=verifier"), staleTime: 0 });
  const actifs = data?.actifs || [];
  const [choix, setChoix] = useState(null);
  const [pourquoi, setPourquoi] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  useEffect(() => { setChoix(null); setPourquoi(""); setErreur(""); }, [tirage]);
  if (isFetching && !actifs.length) return <p className="m-0 text-[13.5px] text-ardoise">Les dossiers arrivent…</p>;
  if (actifs.length < 2) return <p className="m-0 text-[13.5px] text-ardoise">Tous les duels possibles sont tranchés ({data?.valides || 0} vérifiés). Un nouveau dossier avec prix, loyer et adresse en ouvrira d'autres.</p>;
  const regle = actifs[0].note >= actifs[1].note ? 0 : 1;
  const envoyer = (ecarter) => {
    setEnvoi(true); setErreur("");
    base44.request("POST", "/api/jeux/duel/verdict", { body: { a_id: actifs[0].id, b_id: actifs[1].id, choix: ecarter ? null : actifs[choix]?.id, pourquoi, ecarter } })
      .then(() => setTirage((x) => x + 1))
      .catch((e) => setErreur(e?.message || "Pas enregistré."))
      .finally(() => setEnvoi(false));
  };
  return (
    <div className="grid gap-6">
      <div className="max-w-[80ch]">
        <Etiquette>{data.reste} duel{data.reste > 1 ? "s" : ""} à vérifier · {data.valides} vérifié{data.valides > 1 ? "s" : ""}</Etiquette>
        <p className="m-0 mt-2 text-[22px] font-normal tracking-[-0.01em]">Lequel l'équipe prendrait-elle ?</p>
        <p className="m-0 mt-1 text-[13.5px] text-ardoise">Votre choix et votre pourquoi deviennent la réponse du jeu. La règle propose l'actif {"AB"[regle]} (meilleur rendement corrigé du risque) : ce n'est qu'une piste.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {actifs.map((a, k) => <Actif key={a.id} a={a} lettre={"AB"[k]} choisi={choix === k} vu meilleur={false} note onChoisir={() => setChoix(k)} libelleChoix={`Klocka prend l'actif ${"AB"[k]}`} />)}
      </div>
      <div className="grid max-w-[80ch] gap-3">
        <label htmlFor="jeu-duel-pourquoi" className="text-[13.5px] text-craie">Pourquoi (ce que le joueur lira après son choix)</label>
        <textarea id="jeu-duel-pourquoi" rows={3} value={pourquoi} onChange={(e) => setPourquoi(e.target.value)}
          placeholder="Par exemple : le bail de LCL est échu et son loyer dépasse les baux autour ; KFC rapporte un peu moins mais pour sept ans."
          className="w-full resize-y rounded-champ border border-bord bg-transparent px-3.5 py-3 text-[15px] leading-[1.5] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
        {erreur && <p className="m-0 text-[13.5px] text-alerte">{erreur}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Bouton disabled={choix == null || !pourquoi.trim() || envoi} onClick={() => envoyer(false)}>Enregistrer et duel suivant</Bouton>
          <BoutonClair disabled={envoi} onClick={() => envoyer(true)}>Ne pas jouer cette paire</BoutonClair>
        </div>
      </div>
    </div>
  );
}

/** Les duels tranchés : qui a choisi quoi, et pourquoi ; un verdict se retire pour être revu. */
function DuelsVerifies() {
  const [n, setN] = useState(0);
  const { data, isFetching } = useQuery({ queryKey: ["jeu-verdicts", n], queryFn: () => base44.request("GET", "/api/jeux/verdicts"), staleTime: 0 });
  const v = data?.verdicts || [];
  if (isFetching && !v.length) return <p className="m-0 text-[13.5px] text-ardoise">Chargement…</p>;
  if (!v.length) return <p className="m-0 text-[13.5px] text-ardoise">Aucun duel tranché pour l'instant.</p>;
  const retirer = (id) => base44.request("DELETE", `/api/jeux/duel/verdict/${id}`).then(() => setN((x) => x + 1)).catch(() => {});
  return (
    <div className="border-t border-trait">
      {v.map((x) => (
        <div key={x.id} className="grid gap-x-6 gap-y-1 border-b border-trait py-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_auto]">
          <p className="m-0 text-[15px]">{x.a_nom} <span className="text-brume">ou</span> {x.b_nom}</p>
          <div className="min-w-0">
            <p className="m-0 text-[13.5px] text-craie">{x.etat === "ecartee" ? "Paire écartée" : <>Klocka prend <span className="text-encre">{x.choix_nom}</span></>}</p>
            {x.pourquoi && <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-ardoise">{x.pourquoi}</p>}
            <p className="m-0 mt-1 text-[12.5px] text-brume">{x.par || "?"} · {new Date(x.le).toLocaleDateString("fr-FR")}</p>
          </div>
          <BoutonClair className="h-9 self-start px-4 text-[13.5px]" onClick={() => retirer(x.id)}>Revoir</BoutonClair>
        </div>
      ))}
    </div>
  );
}

// --- Idées ----------------------------------------------------------------------------------------------------------

// Les jeux à faire ensuite (26 nov. 2026, Jules : « mets le truc de bail aussi dans les idées »).
const IDEES = [
  { nom: "Le bail piégé", quoi: "Un vrai bail découpé en clauses : trouver celle qui coûte au propriétaire (gros travaux de l'article 606, indexation à la hausse seule, destination trop étroite, cession libre).", donnees: "Les baux lus clause par clause des dossiers : 2 seulement en local aujourd'hui. Comme pour Deux actifs, l'équipe dirait d'abord quelle clause est le piège, et pourquoi.", avis: "Le plus utile pour des clients : c'est ce qu'ils ne savent pas lire." },
];

function Idees() {
  return (
    <div className="border-t border-trait">
      {IDEES.map((x) => (
        <div key={x.nom} className="grid gap-x-8 gap-y-2 border-b border-trait py-5 lg:grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)]">
          <p className="m-0 text-[16px]">{x.nom}</p>
          <div className="min-w-0">
            <p className="m-0 text-[13.5px] leading-[1.55] text-craie">{x.quoi}</p>
            <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-brume">{x.donnees}</p>
          </div>
          <p className="m-0 min-w-0 text-[13.5px] leading-[1.55] text-ardoise">{x.avis}</p>
        </div>
      ))}
    </div>
  );
}

export default function Jeux() {
  const user = useUser();
  const [onglet, setOnglet] = useState("rue");
  const contenu = useMemo(() => ({ rue: <JeuRue />, rendement: <JeuRendement />, duel: <JeuDuel />, idees: <Idees /> })[onglet], [onglet]);
  if (user && user.role !== "admin") return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe Klocka.</p>;
  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-6 px-6 py-8 max-md:px-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-[24px] font-normal text-encre">Jeux immobiliers</h1>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">Des adresses et des dossiers réels, sans chrono.</p>
        </div>
        <div role="tablist" aria-label="Jeux" className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-trait p-1">
          {ONGLETS.map(([id, nom]) => (
            <button key={id} type="button" role="tab" aria-selected={onglet === id} onClick={() => setOnglet(id)}
              className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors ${onglet === id ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={onglet === id ? undefined : { background: "transparent" }}>
              {nom}
            </button>
          ))}
        </div>
      </div>
      <div className={`${VERRE} p-6 max-md:p-4`}>{contenu}</div>
    </div>
  );
}
