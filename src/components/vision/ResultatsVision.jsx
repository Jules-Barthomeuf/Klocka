import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import InteractiveFranceMap from "@/components/vision/InteractiveFranceMap";
import { J, alpha } from "@/design/jetons";

// La projection de Vision : six vues d'un même calcul, au registre de
// l'accueil et du tableau de bord. Des chiffres posés sur un filet, des
// courbes fines, une teinte par sens (menthe pour ce qu'on possède, alerte
// pour ce qu'on doit), et rien qui brille.
//
// Les courbes sont dessinées ici en SVG et prennent leurs couleurs par
// `style` : une variable CSS ne se résout pas dans un attribut de
// présentation (fill, stroke), elle s'y lit transparente.

const VUES = ["Vue d'ensemble", "Frise", "Évolution", "Projets", "Comparatif", "Année par année"];
const STRATEGIES = { patrimoniale: "Patrimoniale · 6 %", mixte: "Mixte · 7 %", agressive: "Agressive · 8 %" };
const OBJECTIFS_MENSUELS = ["2000", "3000", "5000", "10000"];

/** « 1,2 M€ », « 350 k€ », « −12 k€ ». */
export function euros(v, { signe = false } = {}) {
  if (v == null || !isFinite(v)) return "—";
  const moins = v < 0 ? "−" : signe && v > 0 ? "+" : "";
  const a = Math.abs(v);
  if (a >= 1e6) return `${moins}${(a / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M€`;
  if (a >= 1e3) return `${moins}${Math.round(a / 1e3).toLocaleString("fr-FR")} k€`;
  return `${moins}${Math.round(a).toLocaleString("fr-FR")} €`;
}
const tailleLisible = (t) => (Number(t) >= 1000 ? `${(Number(t) / 1000).toLocaleString("fr-FR")} M€` : `${t} k€`);

// ---------------------------------------------------------------------------
// Les courbes
// ---------------------------------------------------------------------------

const L_BUREAU = 600;
const H = 220;
const MARGE = { haut: 12, bas: 26, gauche: 4, droite: 4 };

// Au téléphone, le dessin est plus étroit : à 600 de large sur 300 px
// d'écran, les années tombaient à 5 px et la courbe à 110 px de haut.
const L_TELEPHONE = 340;
function useLargeurDessin() {
  const requete = "(max-width: 767px)";
  const [telephone, setTelephone] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(requete).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const m = window.matchMedia(requete);
    const suivre = () => setTelephone(m.matches);
    m.addEventListener?.("change", suivre);
    return () => m.removeEventListener?.("change", suivre);
  }, []);
  return telephone ? L_TELEPHONE : L_BUREAU;
}

/**
 * Des courbes sur trente ans, avec un curseur. `series` : [{ cle, couleur,
 * pointille }]. `choisi` : l'index de l'année marquée ; `onChoisir` la change
 * au survol ou au toucher.
 */
function Courbes({ data, series, choisi, onChoisir, hauteur = H, zero = false }) {
  const ref = useRef(null);
  const L = useLargeurDessin();
  const valeurs = data.flatMap((d) => series.map((s) => d[s.cle]));
  const max = Math.max(...valeurs, 0);
  const min = zero ? Math.min(...valeurs, 0) : Math.min(...valeurs, 0);
  const x = (i) => MARGE.gauche + (i / (data.length - 1)) * (L - MARGE.gauche - MARGE.droite);
  const y = (v) => MARGE.haut + (1 - (v - min) / (max - min || 1)) * (hauteur - MARGE.haut - MARGE.bas);
  const chemin = (cle) => data.map((d, i) => `${i ? "L" : "M"} ${x(i).toFixed(1)} ${y(d[cle]).toFixed(1)}`).join(" ");
  const suivre = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const rel = ((e.touches?.[0]?.clientX ?? e.clientX) - r.left) / r.width;
    onChoisir?.(Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1)))));
  };
  return (
    <svg ref={ref} viewBox={`0 0 ${L} ${hauteur}`} className="w-full touch-pan-y select-none" onMouseMove={suivre} onTouchMove={suivre} onClick={suivre}>
      {/* La ligne du zéro, quand la courbe passe dessous. */}
      {min < 0 && <line x1={0} x2={L} y1={y(0)} y2={y(0)} style={{ stroke: J["trait"] }} strokeWidth="1" />}
      {[0, 9, 19, 29].filter((i) => i < data.length).map((i) => (
        <text key={i} x={x(i)} y={hauteur - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} style={{ fill: J["brume"], fontSize: 11 }}>
          An {data[i].annee}
        </text>
      ))}
      {series[0]?.aire && (
        <path d={`${chemin(series[0].cle)} L ${x(data.length - 1)} ${y(Math.max(min, 0))} L ${x(0)} ${y(Math.max(min, 0))} Z`} style={{ fill: series[0].couleur, opacity: 0.08 }} />
      )}
      {series.map((s) => (
        <path key={s.cle} d={chemin(s.cle)} fill="none" style={{ stroke: s.couleur }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.pointille ? "5 4" : undefined} />
      ))}
      {choisi != null && (
        <g>
          <line x1={x(choisi)} x2={x(choisi)} y1={MARGE.haut} y2={hauteur - MARGE.bas} style={{ stroke: J["bord-vif"] }} strokeWidth="1" strokeDasharray="2 3" />
          {series.map((s) => (
            <circle key={s.cle} cx={x(choisi)} cy={y(data[choisi][s.cle])} r="4.5" style={{ fill: J["surface-pleine"], stroke: s.couleur }} strokeWidth="2" />
          ))}
        </g>
      )}
    </svg>
  );
}

/** Le cashflow en barres : ce qui entre au-dessus du zéro, ce qui sort dessous. */
function Barres({ data, choisi, onChoisir, hauteur = H }) {
  const L = useLargeurDessin();
  const valeurs = data.map((d) => d.cashflow);
  const max = Math.max(...valeurs, 0);
  const min = Math.min(...valeurs, 0);
  const pas = (L - MARGE.gauche - MARGE.droite) / data.length;
  const y = (v) => MARGE.haut + (1 - (v - min) / (max - min || 1)) * (hauteur - MARGE.haut - MARGE.bas);
  return (
    <svg viewBox={`0 0 ${L} ${hauteur}`} className="w-full select-none">
      <line x1={0} x2={L} y1={y(0)} y2={y(0)} style={{ stroke: J["trait"] }} strokeWidth="1" />
      {data.map((d, i) => {
        const haut = y(Math.max(d.cashflow, 0));
        const bas = y(Math.min(d.cashflow, 0));
        const positif = d.cashflow >= 0;
        return (
          <rect
            key={i}
            x={MARGE.gauche + i * pas + pas * 0.18}
            y={haut}
            width={pas * 0.64}
            height={Math.max(1, bas - haut)}
            rx="2"
            onMouseEnter={() => onChoisir?.(i)}
            onClick={() => onChoisir?.(i)}
            style={{ fill: positif ? J["menthe"] : J["alerte"], opacity: choisi == null || choisi === i ? 0.9 : 0.35, cursor: "pointer" }}
          />
        );
      })}
      {[0, 9, 19, 29].filter((i) => i < data.length).map((i) => (
        <text key={i} x={MARGE.gauche + i * pas + pas / 2} y={hauteur - 6} textAnchor="middle" style={{ fill: J["brume"], fontSize: 11 }}>
          An {data[i].annee}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Les briques de mise en page
// ---------------------------------------------------------------------------

/** Un chiffre posé sur un filet, comme les chiffres du tableau de bord. */
function Chiffre({ mot, valeur, detail = null, teinte = null, grand = false }) {
  return (
    <div className="border-t border-trait pt-4">
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-ardoise">{mot}</p>
      <p className={`m-0 mt-2 font-light leading-none tabular-nums ${grand ? "text-[40px] max-md:text-[30px]" : "text-[28px] max-md:text-[20px]"}`} style={{ color: teinte || J["encre"] }}>
        {valeur}
      </p>
      {detail && <p className="m-0 mt-2 text-[13px] leading-[1.5] text-ardoise">{detail}</p>}
    </div>
  );
}

const Carte = ({ children, className = "" }) => (
  <div className={`rounded-[20px] border border-trait bg-barre px-6 py-5 shadow-[0_12px_32px_rgb(0_0_0/0.05)] max-md:px-4 ${className}`}>{children}</div>
);

const Legende = ({ items }) => (
  <div className="flex flex-wrap gap-x-5 gap-y-1">
    {items.map(([mot, couleur, pointille]) => (
      <span key={mot} className="inline-flex items-center gap-2 text-[12.5px] text-craie">
        <span className="h-0 w-4 border-t-2" style={{ borderColor: couleur, borderTopStyle: pointille ? "dashed" : "solid" }} />
        {mot}
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Les vues
// ---------------------------------------------------------------------------

function VueEnsemble({ resultat, projets, frequence }) {
  const [choisi, setChoisi] = useState(29);
  const d = resultat.chartData;
  const multiple = resultat.patrimoine30 / resultat.apportTotal;
  const duree = (projets.length - 1) * frequence + 1;
  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-3">
        <Chiffre mot="Apport total" valeur={euros(resultat.apportTotal)} detail={`${projets.length} acquisition${projets.length > 1 ? "s" : ""} sur ${duree} an${duree > 1 ? "s" : ""}`} />
        <Chiffre mot="Patrimoine net à 20 ans" valeur={euros(resultat.patrimoine20)} detail={`${euros(resultat.cashflow20 / 12)} par mois cette année-là`} />
        <Chiffre mot="Patrimoine net à 30 ans" valeur={euros(resultat.patrimoine30)} teinte={J["menthe"]} grand detail={`${multiple.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} fois votre apport`} />
      </div>
      <Carte>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <Legende items={[["Patrimoine net", J["menthe"]], ["Dette restante", J["alerte"], true]]} />
          <span className="text-[13px] tabular-nums text-craie">
            An {d[choisi].annee} · <span style={{ color: J["menthe"] }}>{euros(d[choisi].patrimoine)}</span> · <span style={{ color: J["alerte"] }}>{euros(d[choisi].capitalRestant)}</span>
          </span>
        </div>
        <Courbes data={d} series={[{ cle: "patrimoine", couleur: J["menthe"], aire: true }, { cle: "capitalRestant", couleur: J["alerte"], pointille: true }]} choisi={choisi} onChoisir={setChoisi} />
      </Carte>
      <p className="m-0 mx-auto max-w-[62ch] text-center text-[14.5px] leading-[1.7] text-craie">
        Un apport de {euros(resultat.apportTotal)} devient un patrimoine net de {euros(resultat.patrimoine30)} en trente ans.
        La dette remboursée, vos murs vous versent alors {euros(resultat.cashflow30 / 12)} par mois.
      </p>
    </div>
  );
}

function Frise({ resultat, projets, frequence, apportTotal, revenusMensuels, setRevenusMensuels }) {
  const d = resultat.chartData;
  const [choisi, setChoisi] = useState(19);

  // Les jalons, tous en « année » (1 à 30), la même échelle que les données.
  const jalons = useMemo(() => {
    const liste = [];
    projets.forEach((p, i) => {
      const annee = i * frequence + 1;
      if (annee <= 30) liste.push({ annee, mot: `Acquisition n°${i + 1}`, detail: tailleLisible(p.taille), genre: "achat" });
    });
    const trouver = (test) => d.find(test)?.annee ?? null;
    const recup = trouver((x) => x.patrimoine >= apportTotal);
    if (recup) liste.push({ annee: recup, mot: "Apport récupéré", detail: `patrimoine au-dessus de ${euros(apportTotal)}` });
    const positif = trouver((x) => x.cashflow > 0);
    if (positif) liste.push({ annee: positif, mot: "Cashflow positif", detail: "les loyers couvrent le crédit" });
    const objectif = revenusMensuels ? trouver((x) => x.cashflow / 12 >= Number(revenusMensuels)) : null;
    if (revenusMensuels) {
      liste.push(objectif
        ? { annee: objectif, mot: "Objectif atteint", detail: `${Number(revenusMensuels).toLocaleString("fr-FR")} € par mois`, genre: "objectif" }
        : { annee: null, mot: "Objectif hors d'atteinte en trente ans", detail: `${Number(revenusMensuels).toLocaleString("fr-FR")} € par mois`, genre: "objectif" });
    }
    const libre = trouver((x) => x.capitalRestant === 0);
    if (libre) liste.push({ annee: libre, mot: "Dette remboursée", detail: "plus aucun crédit en cours" });
    return liste.sort((a, b) => (a.annee ?? 99) - (b.annee ?? 99));
  }, [d, projets, frequence, apportTotal, revenusMensuels]);

  const ligne = d[choisi];
  return (
    <div className="space-y-6">
      <Carte>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="m-0 text-[14.5px] text-encre">Votre objectif de revenus</p>
            <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">Net par mois, après crédit et charges : la frise dit quand vous l'atteignez.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {OBJECTIFS_MENSUELS.map((v) => {
              const actif = revenusMensuels === v;
              return (
                <button key={v} type="button" onClick={() => setRevenusMensuels(actif ? "" : v)} aria-pressed={actif}
                  className="rounded-full border px-3 py-1.5 text-[13px] tabular-nums transition-colors"
                  style={{ borderColor: actif ? J["menthe"] : J["trait"], background: actif ? alpha("menthe", 0.1) : "transparent", color: actif ? J["encre"] : J["craie"] }}>
                  {Number(v).toLocaleString("fr-FR")} €
                </button>
              );
            })}
            <label className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3 py-1.5 focus-within:border-menthe">
              <input type="number" inputMode="numeric" value={OBJECTIFS_MENSUELS.includes(revenusMensuels) ? "" : revenusMensuels}
                onChange={(e) => setRevenusMensuels(e.target.value)} placeholder="Autre"
                className="w-16 border-0 bg-transparent text-[13px] max-md:text-[16px] tabular-nums text-encre outline-none placeholder:text-brume" />
              <span className="text-[12px] text-brume">€ / mois</span>
            </label>
          </div>
        </div>
      </Carte>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* La frise : trente années, les jalons posés dessus. */}
        <Carte>
          <div className="relative pl-7">
            <span className="absolute bottom-2 left-[9px] top-2 w-px" style={{ background: J["trait"] }} />
            <motion.span className="absolute left-[9px] top-2 w-px" style={{ background: J["menthe"] }}
              animate={{ height: `calc(${(choisi / 29) * 100}% - 16px)` }} transition={{ duration: 0.4 }} />
            {jalons.map((j, i) => {
              const actif = j.annee != null && j.annee - 1 === choisi;
              const passe = j.annee != null && j.annee - 1 <= choisi;
              return (
                <button key={i} type="button" disabled={j.annee == null} onClick={() => setChoisi(j.annee - 1)}
                  className="relative flex w-full items-baseline gap-4 rounded-[12px] py-2.5 pr-2 text-left transition-colors hover:bg-encre/[0.03] disabled:cursor-default"
                  style={{ background: actif ? alpha("menthe", 0.08) : "transparent" }}>
                  <span className="absolute -left-[23px] top-[15px] h-[9px] w-[9px] rounded-full border-2"
                    style={{ borderColor: j.genre === "objectif" ? J["ambre"] : J["menthe"], background: passe ? (j.genre === "objectif" ? J["ambre"] : J["menthe"]) : J["surface-pleine"] }} />
                  <span className="w-12 flex-none text-[12.5px] tabular-nums text-ardoise">{j.annee ? `An ${j.annee}` : "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[14.5px] ${actif ? "text-encre" : "text-craie"}`}>{j.mot}</span>
                    <span className="block text-[12.5px] text-ardoise">{j.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Carte>

        {/* L'année choisie. */}
        <div>
          <div className="mb-4">
            <p className="m-0 text-[11px] uppercase tracking-[.16em] text-ardoise">Année choisie</p>
            <p className="m-0 mt-1 text-[34px] font-light tabular-nums text-encre">An {ligne.annee}</p>
            <input type="range" min={0} max={29} value={choisi} onChange={(e) => setChoisi(Number(e.target.value))}
              aria-label="Choisir l'année" className="mt-2 w-full" style={{ accentColor: J["menthe"] }} />
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={choisi} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-5">
              <Chiffre mot="Patrimoine net" valeur={euros(ligne.patrimoine)} teinte={J["menthe"]} />
              <Chiffre mot="Revenu mensuel net" valeur={euros(ligne.cashflow / 12)} teinte={ligne.cashflow >= 0 ? J["encre"] : J["alerte"]} detail={`${euros(ligne.cashflow)} sur l'année`} />
              <Chiffre mot="Dette restante" valeur={euros(ligne.capitalRestant)} teinte={ligne.capitalRestant > 0 ? J["alerte"] : J["ardoise"]} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Evolution({ resultat }) {
  const d = resultat.chartData;
  const [choisi, setChoisi] = useState(19);
  const ligne = d[choisi];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Carte>
        <p className="m-0 text-[14.5px] text-encre">Patrimoine et dette</p>
        <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">Ce que vous possédez, net des crédits, face à ce qu'il reste à rembourser.</p>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <Legende items={[["Patrimoine net", J["menthe"]], ["Dette", J["alerte"], true]]} />
          <span className="text-[12.5px] tabular-nums text-ardoise">An {ligne.annee}</span>
        </div>
        <Courbes data={d} series={[{ cle: "patrimoine", couleur: J["menthe"], aire: true }, { cle: "capitalRestant", couleur: J["alerte"], pointille: true }]} choisi={choisi} onChoisir={setChoisi} />
        <div className="grid grid-cols-2 gap-4">
          <Chiffre mot="Patrimoine net" valeur={euros(ligne.patrimoine)} teinte={J["menthe"]} />
          <Chiffre mot="Dette" valeur={euros(ligne.capitalRestant)} teinte={J["alerte"]} />
        </div>
      </Carte>
      <Carte>
        <p className="m-0 text-[14.5px] text-encre">Revenus locatifs nets</p>
        <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">L'effort d'épargne des premières années, puis les loyers libres de crédit.</p>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <Legende items={[["Encaissé", J["menthe"]], ["Effort d'épargne", J["alerte"]]]} />
          <span className="text-[12.5px] tabular-nums text-ardoise">An {ligne.annee}</span>
        </div>
        <Barres data={d} choisi={choisi} onChoisir={setChoisi} />
        <div className="grid grid-cols-2 gap-4">
          <Chiffre mot="Sur l'année" valeur={euros(ligne.cashflow)} teinte={ligne.cashflow >= 0 ? J["encre"] : J["alerte"]} />
          <Chiffre mot="Par mois" valeur={euros(ligne.cashflow / 12)} teinte={ligne.cashflow >= 0 ? J["encre"] : J["alerte"]} />
        </div>
      </Carte>
    </div>
  );
}

function Projets({ resultat, projets, frequence, apportData, typeStrategie }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div>
        <p className="m-0 mb-3 text-[13.5px] text-craie">{projets.length} acquisition{projets.length > 1 ? "s" : ""} · stratégie {STRATEGIES[typeStrategie] || typeStrategie}</p>
        <div className="flex flex-col">
          {projets.map((p, i) => {
            const annee = i * frequence + 1;
            const apport = apportData[p.taille];
            const detail = resultat.chartData[29]?.detailsProjets?.find((x) => x.projetIndex === i + 1);
            return (
              <div key={i} className="flex items-center gap-4 border-t border-trait py-4 first:border-t-0">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full text-[13px] tabular-nums" style={{ background: alpha("menthe", 0.12), color: J["menthe"] }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] text-encre">Murs de {tailleLisible(p.taille)}</p>
                  <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">Acquis l'an {annee} · apport {euros(apport)}</p>
                </div>
                {detail && (
                  <div className="text-right">
                    <p className="m-0 text-[15px] tabular-nums" style={{ color: J["menthe"] }}>{euros(detail.patrimoine)}</p>
                    <p className="m-0 text-[11.5px] text-brume">net à l'an 30</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-3 text-[12.5px] text-brume">Villes et commerces sur la carte : des exemples typiques de ces budgets, pas des biens réels.</p>
      </div>
      <div className="h-[380px] max-md:h-[300px]">
        <InteractiveFranceMap projets={projets} />
      </div>
    </div>
  );
}

function Comparatif({ resultat, projets, frequence, apportData }) {
  // L'apport engagé à chaque année, face au patrimoine net qu'il a construit.
  const data = useMemo(() => resultat.chartData.map((d) => ({
    ...d,
    apportCumule: projets.reduce((s, p, i) => (i * frequence + 1 <= d.annee ? s + apportData[p.taille] : s), 0),
  })), [resultat, projets, frequence, apportData]);
  const [choisi, setChoisi] = useState(29);
  const multiples = [10, 20, 30].map((a) => ({ annee: a, x: data[a - 1].patrimoine / (data[a - 1].apportCumule || 1) }));
  return (
    <div className="space-y-6">
      <Carte>
        <p className="m-0 text-[14.5px] text-encre">Ce que vous avez mis, ce que vous avez</p>
        <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">L'apport engagé au fil des acquisitions, face au patrimoine net qu'il construit.</p>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <Legende items={[["Patrimoine net", J["menthe"]], ["Apport engagé", J["craie"], true]]} />
          <span className="text-[13px] tabular-nums text-craie">
            An {data[choisi].annee} · {euros(data[choisi].apportCumule)} → <span style={{ color: J["menthe"] }}>{euros(data[choisi].patrimoine)}</span>
          </span>
        </div>
        <Courbes data={data} series={[{ cle: "patrimoine", couleur: J["menthe"], aire: true }, { cle: "apportCumule", couleur: J["craie"], pointille: true }]} choisi={choisi} onChoisir={setChoisi} />
      </Carte>
      <div className="grid gap-6 md:grid-cols-3">
        {multiples.map((m) => (
          <Chiffre key={m.annee} mot={`À l'an ${m.annee}`} valeur={`× ${m.x.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`} teinte={m.annee === 30 ? J["menthe"] : J["encre"]}
            detail={`le patrimoine net vaut ${m.x.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} fois l'apport engagé`} />
        ))}
      </div>
    </div>
  );
}

function AnneeParAnnee({ resultat }) {
  const [ouvertes, setOuvertes] = useState([]);
  const basculer = (a) => setOuvertes((o) => (o.includes(a) ? o.filter((x) => x !== a) : [...o, a]));
  return (
    <Carte className="px-0 py-0 max-md:px-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px] tabular-nums">
          <thead>
            <tr className="border-b border-trait text-[11px] uppercase tracking-[.14em] text-ardoise">
              <th className="px-6 py-3.5 text-left font-normal max-md:px-4">Année</th>
              <th className="px-6 py-3.5 text-right font-normal max-md:px-4">Patrimoine net</th>
              <th className="px-6 py-3.5 text-right font-normal max-md:px-4">Cashflow</th>
              <th className="px-6 py-3.5 text-right font-normal max-md:px-4">Dette</th>
            </tr>
          </thead>
          <tbody>
            {resultat.chartData.map((r) => {
              const ouverte = ouvertes.includes(r.annee);
              const details = r.detailsProjets || [];
              return (
                <React.Fragment key={r.annee}>
                  <tr className={`border-b border-trait transition-colors hover:bg-encre/[0.03] ${details.length > 1 ? "cursor-pointer" : ""}`} onClick={() => details.length > 1 && basculer(r.annee)}>
                    <td className="px-6 py-3 text-encre max-md:px-4">
                      <span className="inline-flex items-center gap-2">
                        {details.length > 1 && <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform ${ouverte ? "" : "-rotate-90"}`} />}
                        An {r.annee}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-encre max-md:px-4">{euros(r.patrimoine)}</td>
                    <td className="px-6 py-3 text-right max-md:px-4" style={{ color: r.cashflow >= 0 ? J["menthe"] : J["alerte"] }}>{euros(r.cashflow, { signe: true })}</td>
                    <td className="px-6 py-3 text-right text-craie max-md:px-4">{euros(r.capitalRestant)}</td>
                  </tr>
                  {ouverte && details.map((x) => (
                    <tr key={x.projetIndex} className="border-b border-trait text-[12.5px] text-ardoise" style={{ background: alpha("encre", 0.02) }}>
                      <td className="py-2 pl-12 pr-6 max-md:pl-9">Acquisition n°{x.projetIndex}</td>
                      <td className="px-6 py-2 text-right max-md:px-4">{euros(x.patrimoine)}</td>
                      <td className="px-6 py-2 text-right max-md:px-4">{euros(x.cashflow, { signe: true })}</td>
                      <td className="px-6 py-2 text-right max-md:px-4">{euros(x.capitalRestant)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Carte>
  );
}

// ---------------------------------------------------------------------------

export default function ResultatsVision({
  resultat, projets, frequence, typeStrategie, apportData,
  vue, setVue, revenusMensuels, setRevenusMensuels,
  onModifier, onRecommencer,
}) {
  const duree = (projets.length - 1) * frequence + 1;
  return (
    <div className="pb-16 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-[.2em] text-ardoise">
            Vision · {STRATEGIES[typeStrategie] || typeStrategie} · {projets.length} acquisition{projets.length > 1 ? "s" : ""} sur {duree} an{duree > 1 ? "s" : ""}
          </p>
          <h1 className="m-0 mt-2 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(24px, 2.4vw, 34px)" }}>
            Votre patrimoine dans trente ans
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={onModifier} className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Modifier
          </button>
          <button type="button" onClick={onRecommencer} className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            <RotateCcw className="h-3.5 w-3.5" /> Recommencer
          </button>
        </div>
      </header>

      {/* Les six vues, en segments : défilent au doigt sur téléphone. */}
      <div className="mt-6 overflow-x-auto pb-1 [scrollbar-width:none]">
        <div className="flex w-max gap-1 rounded-full bg-rail-actif p-1">
          {VUES.map((mot, i) => (
            <button key={mot} type="button" onClick={() => setVue(i)} aria-pressed={vue === i}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors ${vue === i ? "bg-surface-pleine text-encre shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ardoise hover:text-encre"}`}
              style={vue === i ? undefined : { background: "transparent" }}>
              {mot}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div key={vue} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }}>
            {vue === 0 && <VueEnsemble resultat={resultat} projets={projets} frequence={frequence} />}
            {vue === 1 && <Frise resultat={resultat} projets={projets} frequence={frequence} apportTotal={resultat.apportTotal} revenusMensuels={revenusMensuels} setRevenusMensuels={setRevenusMensuels} />}
            {vue === 2 && <Evolution resultat={resultat} />}
            {vue === 3 && <Projets resultat={resultat} projets={projets} frequence={frequence} apportData={apportData} typeStrategie={typeStrategie} />}
            {vue === 4 && <Comparatif resultat={resultat} projets={projets} frequence={frequence} apportData={apportData} />}
            {vue === 5 && <AnneeParAnnee resultat={resultat} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-trait pt-4">
        <button type="button" onClick={() => setVue(Math.max(0, vue - 1))} disabled={vue === 0}
          className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> {vue > 0 ? VUES[vue - 1] : "Précédent"}
        </button>
        <span className="text-[12.5px] tabular-nums text-brume">{vue + 1} / {VUES.length}</span>
        <button type="button" onClick={() => setVue(Math.min(VUES.length - 1, vue + 1))} disabled={vue === VUES.length - 1}
          className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>
          {vue < VUES.length - 1 ? VUES[vue + 1] : "Suivant"} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="m-0 mt-6 text-center text-[12.5px] text-brume">
        Une projection, pas une promesse : des hypothèses de marché moyennes, à affiner avec votre conseiller Klocka.
      </p>
    </div>
  );
}
