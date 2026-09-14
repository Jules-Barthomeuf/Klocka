import React from "react";
import { AlertTriangle } from "lucide-react";
import { ton } from "@/components/preanalyse/journal-tons";
import JournalEmplacement from "@/components/preanalyse/JournalEmplacement";
import ValeurLocativeDataB from "@/components/preanalyse/ValeurLocativeDataB";
import AnalyseLoyerEquimmox from "@/components/preanalyse/AnalyseLoyerEquimmox";
import TransactionsFondsDataB from "@/components/preanalyse/TransactionsFondsDataB";
import MarcheResidentielFigaro from "@/components/preanalyse/MarcheResidentielFigaro";

// Ce que chaque plateforme a rendu, chez elle.
//
// Le bilan croise les sources ; ces onglets montrent la matière brute, sans
// mélange. On y va quand un chiffre du bilan surprend : on veut voir ce que
// Data-B a dit, exactement, à quelle échelle, et à quelle heure.

const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const pct = (n, d = 1) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`);

function Vide({ children }) {
  return <p className="m-0 rounded-[10px] border border-dashed border-bord-doux px-4 py-5 text-center text-[12.5px] text-brume">{children}</p>;
}

/**
 * Le drapeau rouge : deux sources qui ne disent pas la même chose.
 *
 * Un repli silencieux masquait cet écart — on prenait Equimmox, et l'on ne
 * savait jamais que Data-B estimait tout autre chose. Ici il est montré, avec
 * les deux lectures et de combien elles divergent.
 */
export function Recoupement({ recoupement }) {
  if (!recoupement?.lectures?.length) return null;
  const { alerte, ecart, ecart_relatif: relatif, lectures, ecartees = [], incoherences = [] } = recoupement;
  const teinte = alerte ? "#e0a45e" : "#96c0b8";
  return (
    <div className="rounded-[14px] border px-[22px] py-5" style={{ borderColor: alerte ? "rgba(224,164,94,0.35)" : "rgba(255,255,255,0.08)", background: alerte ? "rgba(224,164,94,0.04)" : "transparent" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="alx-mont text-[9.5px] font-medium uppercase tracking-[.14em]" style={{ color: teinte }}>
          {alerte ? "Écart entre les sources" : "Les sources concordent"}
        </span>
        {ecart != null && (
          <span className="alx-mont text-[14px] tabular-nums text-[#F3F7F5]">
            {fmt(ecart)} €/m²/an{relatif != null ? ` · ${pct(relatif * 100, 0)}` : ""}
          </span>
        )}
      </div>
      <div className="mt-3.5 flex flex-col">
        {lectures.map((l, i) => (
          <div key={`${l.service}-${i}`} className="flex items-baseline justify-between gap-3 border-t border-white/[0.06] py-[9px]">
            <span className="text-[13.5px] text-[#C3CBC7]">{l.service}{l.service === "Data-B" && l.echelle ? `, ${l.echelle}${l.precision ? ` ${l.precision}` : ""}` : ""}</span>
            <span className="alx-mont whitespace-nowrap text-[14px] text-[#E8EFEB]">{l.bas != null && l.haut != null ? `${fmt(l.bas)} – ${fmt(l.haut)}` : fmt(l.centre)} €/m²/an</span>
          </div>
        ))}
      </div>
      {/* Ce qui n'a PAS été comparé, et pourquoi : sans cette liste, l'écran
          affiche un écart sans dire qu'il a choisi une maille parmi trois. */}
      {ecartees.length > 0 && (
        <p className="m-0 mt-3 text-[12.5px] leading-[1.6] text-[#8B938F]">
          Non comparé : {ecartees.map((e) => `${e.service} ${e.echelle} ${e.bas != null && e.haut != null ? `${fmt(e.bas)}–${fmt(e.haut)}` : fmt(e.median)} €/m²/an`).join(" · ")}, autre territoire que la source de tête.
        </p>
      )}
      {incoherences.map((i) => (
        <p key={i.service} className="m-0 mt-2 text-[12.5px] leading-[1.6] text-[#e0a45e]">
          {i.service} ne dit pas la même chose selon la maille : {i.haute.echelle} à {fmt(i.haute.centre)} contre {i.basse.echelle} à {fmt(i.basse.centre)} €/m²/an, soit {fmt(i.rapport, 1)} fois. À vérifier chez la source avant de retenir l'un ou l'autre.
        </p>
      ))}
    </div>
  );
}

/**
 * Data-B : valeur locative, cessions de fonds, étude d'implantation.
 *
 * Les deux premières sont rendues par les composants de l'équipe, qui existent
 * depuis longtemps et disent bien plus que ce que je saurais réécrire : la
 * fourchette par secteur confrontée au bail, la carte des cessions, le prix au
 * numéro même du bien. Ils étaient affichés en permanence sous l'analyse ;
 * ils vivent désormais dans l'onglet de leur source.
 */
export function OngletDataB({ lot, implantation }) {
  return (
    <div className="flex flex-col gap-4">
      <ValeurLocativeDataB lot={lot} />
      {/* L'emplacement avant les cessions : on regarde d'abord où est le bien,
          ensuite ce qui s'y est vendu. La carte des cessions est longue, et
          l'emplacement passait sous elle sans être vu. */}
      {implantation ? (
        <section className="border border-bord-doux rounded-[16px] bg-surface px-5 py-4">
          <JournalEmplacement emplacement={implantation} />
        </section>
      ) : (
        <Vide>L’étude d’implantation n’a pas encore été lue sur ce lot. Lancez « Mettre à jour ».</Vide>
      )}
      <TransactionsFondsDataB lot={lot} />
    </div>
  );
}

/** Equimmox : les baux comparables, par le composant de l'équipe. */
export function OngletEquimmox({ lot }) {
  return <AnalyseLoyerEquimmox lot={lot} />;
}

/** Le Figaro : le résidentiel, par le composant de l'équipe. */
export function OngletFigaro({ lot }) {
  return <MarcheResidentielFigaro lot={lot} />;
}
