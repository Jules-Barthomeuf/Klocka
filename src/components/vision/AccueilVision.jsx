import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Copy, Minus, Plus, Trash2 } from "lucide-react";
import { J, alpha } from "@/design/jetons";

// L'accueil de Vision : quatre questions avant la projection sur trente ans.
//
// Même registre que le tableau de bord : le titre centré, une seule carte
// comme le composeur du chat, des segments pour les choix courts et des
// lignes pour les choix qui s'expliquent. Plus de faisceau lumineux qui
// tourne autour du cadre, ni de pastille pleine au texte illisible : ce qui
// est choisi se lit à sa teinte douce et à son point, pas à un aplat.

const ETAPES = ["Vous", "Objectif", "Stratégie", "Projets"];

const PROFILS = [
  { value: "seule", label: "Seul(e)" },
  { value: "couple", label: "En couple" },
  { value: "famille", label: "En famille" },
];

const OBJECTIFS = [
  { value: "retraite", label: "Préparer ma retraite", desc: "Des revenus qui tombent sans travailler" },
  { value: "patrimoine", label: "Construire un patrimoine", desc: "Un capital qui grandit et se transmet" },
  { value: "diversification", label: "Diversifier mes actifs", desc: "Répartir le risque hors des marchés" },
];

const STRATEGIES = [
  { value: "patrimoniale", label: "Patrimoniale", rate: "6 %", desc: "Des emplacements sûrs, un rendement plus doux" },
  { value: "mixte", label: "Mixte", rate: "7 %", desc: "L'équilibre entre sécurité et performance" },
  { value: "agressive", label: "Agressive", rate: "8 %", desc: "Plus de rendement, plus de risque" },
];

const FREQUENCES = [
  { value: 1, label: "Chaque année" },
  { value: 2, label: "Tous les 2 ans" },
  { value: 3, label: "Tous les 3 ans" },
];

const TAILLES = [
  ["200", "200 k€"], ["300", "300 k€"], ["400", "400 k€"], ["500", "500 k€"],
  ["700", "700 k€"], ["1000", "1 M€"], ["1200", "1,2 M€"],
];

/** Un choix court : des segments dans une gouttière, comme le mode de la Prospection. */
function Segments({ options, valeur, onChoisir }) {
  return (
    <div className="grid rounded-full bg-rail-actif p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const actif = valeur === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChoisir(o.value)}
            aria-pressed={actif}
            className={`rounded-full px-3 py-2 text-[14px] transition-colors max-md:text-[13px] ${actif ? "bg-surface-pleine text-encre shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ardoise hover:text-encre"}`}
            style={actif ? undefined : { background: "transparent" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Un choix qui s'explique : une ligne, un point, une phrase. */
function Lignes({ options, valeur, onChoisir }) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((o) => {
        const actif = valeur === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChoisir(o.value)}
            aria-pressed={actif}
            className="flex w-full items-center gap-4 rounded-[14px] px-4 py-3.5 text-left transition-colors hover:bg-encre/[0.04]"
            style={{ background: actif ? alpha("menthe", 0.1) : "transparent" }}
          >
            <span
              className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full border"
              style={{ borderColor: actif ? J["menthe"] : J["bord-vif"] }}
            >
              {actif && <span className="h-2 w-2 rounded-full" style={{ background: J["menthe"] }} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[15px] ${actif ? "text-encre" : "text-craie"}`}>{o.label}</span>
              <span className="mt-0.5 block text-[13px] text-ardoise">{o.desc}</span>
            </span>
            {o.rate && (
              <span className="flex-none text-[18px] tabular-nums" style={{ color: actif ? J["menthe"] : J["brume"] }}>{o.rate}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const Question = ({ children }) => <p className="m-0 mb-3 text-[13.5px] text-craie">{children}</p>;

export default function AccueilVision({
  etape, setEtape,
  age, setAge,
  typeInvestissement, setTypeInvestissement,
  objectif, setObjectif,
  typeStrategie, setTypeStrategie,
  frequence, setFrequence,
  projets, ajouterProjet, supprimerProjet, dupliquerProjet, modifierTailleProjet,
  onCalculer,
}) {
  const derniere = etape === ETAPES.length;
  const suivant = () => (derniere ? onCalculer() : setEtape(etape + 1));
  const budget = projets.reduce((s, p) => s + Number(p.taille || 0), 0) * 1000;

  return (
    <div className="flex flex-col items-center pb-16 pt-[9vh] max-md:pt-4">
      <header className="max-w-[640px] text-center">
        <p className="m-0 text-[11px] uppercase tracking-[.2em] text-ardoise">Vision</p>
        <h1 className="m-0 mt-3 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(24px, 2.4vw, 34px)" }}>
          À quoi ressemblera votre patrimoine dans trente ans ?
        </h1>
        <p className="m-0 mt-3 text-[14.5px] leading-[1.6] text-craie">
          Quatre questions, puis la projection : vos acquisitions, votre patrimoine net et votre cashflow, année par année.
        </p>
      </header>

      <div className="mt-9 w-full max-w-[660px] max-md:mt-6">
        {/* Les étapes : un trait par question, celles déjà faites se rouvrent d'un clic. */}
        <div className="mb-4 grid grid-cols-4 gap-2 px-1">
          {ETAPES.map((mot, i) => {
            const n = i + 1;
            const faite = n < etape;
            const ici = n === etape;
            return (
              <button
                key={mot}
                type="button"
                onClick={() => faite && setEtape(n)}
                disabled={!faite}
                className="text-left disabled:cursor-default"
                style={{ background: "transparent" }}
              >
                <span className="block h-[3px] rounded-full transition-colors" style={{ background: faite || ici ? J["menthe"] : J["trait"] }} />
                <span className={`mt-2 block text-[12px] ${ici ? "text-encre" : faite ? "text-craie" : "text-brume"}`}>{mot}</span>
              </button>
            );
          })}
        </div>

        <div
          className="rounded-[20px] border border-trait bg-barre px-6 pb-5 pt-6 shadow-[0_12px_32px_rgb(0_0_0/0.07)] max-md:px-4"
          onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName !== "BUTTON") suivant(); }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={etape}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {etape === 1 && (
                <div className="space-y-7">
                  <div>
                    <Question>Quel âge avez-vous ?</Question>
                    <div className="flex items-baseline gap-2 border-b border-trait pb-2 focus-within:border-menthe">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={18}
                        max={90}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="35"
                        autoFocus
                        className="w-24 border-0 bg-transparent text-[34px] font-light tabular-nums text-encre outline-none placeholder:text-brume"
                      />
                      <span className="text-[15px] text-ardoise">ans</span>
                    </div>
                  </div>
                  <div>
                    <Question>Vous investissez</Question>
                    <Segments options={PROFILS} valeur={typeInvestissement} onChoisir={setTypeInvestissement} />
                  </div>
                </div>
              )}

              {etape === 2 && (
                <div>
                  <Question>Qu'attendez-vous de ces murs ?</Question>
                  <Lignes options={OBJECTIFS} valeur={objectif} onChoisir={setObjectif} />
                </div>
              )}

              {etape === 3 && (
                <div>
                  <Question>Quel rendement visez-vous ?</Question>
                  <Lignes options={STRATEGIES} valeur={typeStrategie} onChoisir={setTypeStrategie} />
                </div>
              )}

              {etape === 4 && (
                <div className="space-y-7">
                  <div>
                    <Question>Combien d'acquisitions ?</Question>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => projets.length > 1 && supprimerProjet(projets.length - 1)}
                        disabled={projets.length <= 1}
                        aria-label="Une acquisition de moins"
                        className="grid h-10 w-10 place-items-center rounded-full border border-trait text-craie hover:border-bord-vif hover:text-encre disabled:opacity-30"
                        style={{ background: "transparent" }}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center text-[34px] font-light tabular-nums text-encre">{projets.length}</span>
                      <button
                        type="button"
                        onClick={ajouterProjet}
                        aria-label="Une acquisition de plus"
                        className="grid h-10 w-10 place-items-center rounded-full border border-trait text-craie hover:border-bord-vif hover:text-encre"
                        style={{ background: "transparent" }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <span className="ml-auto text-right text-[13px] text-ardoise">
                        {Math.round(budget / 1000).toLocaleString("fr-FR")} k€ de murs
                        <br />sur {Math.max(1, (projets.length - 1) * frequence + 1)} an{(projets.length - 1) * frequence + 1 > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Question>À quel rythme ?</Question>
                    <Segments options={FREQUENCES} valeur={frequence} onChoisir={setFrequence} />
                  </div>

                  <div>
                    <Question>Le prix de chaque acquisition</Question>
                    <div className="flex flex-col">
                      {projets.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 border-t border-trait py-2.5 first:border-t-0">
                          <span className="w-16 flex-none text-[12.5px] text-ardoise">An {i * frequence + 1}</span>
                          <select
                            value={p.taille}
                            onChange={(e) => modifierTailleProjet(i, e.target.value)}
                            className="min-w-0 flex-1 appearance-none rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] tabular-nums text-encre outline-none focus:border-menthe"
                          >
                            {TAILLES.map(([v, m]) => <option key={v} value={v}>{m}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => dupliquerProjet(i)}
                            aria-label="Dupliquer" title="Dupliquer"
                            className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-encre/[0.05] hover:text-encre"
                            style={{ background: "transparent" }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => supprimerProjet(i)}
                            disabled={projets.length <= 1}
                            aria-label="Retirer" title="Retirer"
                            className="grid h-9 w-9 flex-none place-items-center rounded-full text-brume hover:bg-encre/[0.05] hover:text-alerte disabled:opacity-30"
                            style={{ background: "transparent" }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-7 flex items-center justify-between border-t border-trait pt-4">
            {etape > 1 ? (
              <button
                type="button"
                onClick={() => setEtape(etape - 1)}
                className="inline-flex items-center gap-1.5 text-[13.5px] text-craie hover:text-encre"
                style={{ background: "transparent" }}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Précédent
              </button>
            ) : (
              <span className="text-[12.5px] text-brume">{etape} sur {ETAPES.length}</span>
            )}
            <button
              type="button"
              onClick={suivant}
              className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[14px] font-medium text-fond transition-colors hover:bg-menthe-survol"
            >
              {derniere ? "Voir ma projection" : "Continuer"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="m-0 mt-4 text-center text-[12.5px] text-brume">
          Une projection, pas une promesse : des hypothèses de marché moyennes, à affiner avec votre conseiller Klocka.
        </p>
      </div>
    </div>
  );
}
