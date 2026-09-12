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
  const { alerte, ecart, ecart_relatif: relatif, lectures, ecartees = [], incoherences = [], portee_reference: portee } = recoupement;
  const c = ton(alerte ? "rouge" : "menthe");
  return (
    <div
      className="rounded-[12px] border px-4 py-3.5"
      style={{ borderColor: c.bord, background: alerte ? "rgba(224,101,95,.06)" : "#15181c" }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {alerte && <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: c.pastille }} />}
        <span className="font-pill text-[9.5px] font-semibold uppercase tracking-[.08em]" style={{ color: alerte ? c.etiquette : "#6a7180" }}>
          {alerte ? "Écart entre les sources — à vérifier" : "Les deux sources concordent"}
        </span>
        <span className="text-[12.5px]" style={{ color: c.texte }}>
          {fmt(ecart)} €/m²/an d’écart{relatif != null ? ` · ${pct(relatif * 100, 0)}` : ""}
        </span>
        {portee != null && (
          <span className="text-[11px] text-[#4e545e]">à maille comparable — environ {fmt(portee)} m</span>
        )}
      </div>
      <ul className="m-0 mt-2.5 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
        {lectures.map((l, i) => (
          <li key={`${l.service}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
            <span className="flex-shrink-0 text-[12.5px] text-encre w-[80px]">{l.service}</span>
            <span className="flex-shrink-0 text-[13px] font-medium text-[#dfe3e8]">
              {l.bas != null && l.haut != null ? `${fmt(l.bas)} – ${fmt(l.haut)}` : fmt(l.centre)} €/m²/an
            </span>
            <span className="min-w-0 flex-1 text-[11.5px] text-brume">
              {l.median != null ? `moyenne ${fmt(l.median)} · ` : ""}
              {l.echelle}
              {l.precision ? ` · ${l.precision}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {/* Ce qui n'a PAS été comparé, et pourquoi. Sans cette liste, l'écran
          affiche un écart sans dire qu'il a choisi une maille parmi trois —
          et l'on ne peut plus le contredire. */}
      {ecartees.length > 0 && (
        <p className="m-0 mt-2 text-[11px] leading-5 text-brume">
          Non comparé :{" "}
          {ecartees.map((e, i) => (
            <span key={`${e.service}-${e.echelle}-${i}`}>
              {i > 0 ? " · " : ""}
              {e.service} {e.echelle}
              {e.precision ? ` (${e.precision})` : ""} {e.bas != null && e.haut != null ? `${fmt(e.bas)}–${fmt(e.haut)}` : fmt(e.median)} €/m²/an
            </span>
          ))}
          {" — "}
          autre territoire que la source de tête.
        </p>
      )}

      {/* Une source qui se contredit d'une maille à l'autre : même méthode,
          même unité — aucune différence de définition ne peut l'expliquer. */}
      {incoherences.map((i) => (
        <p key={i.service} className="m-0 mt-2 text-[11.5px] leading-5 text-[#d9a441]">
          {i.service} ne dit pas la même chose selon la maille : {i.haute.echelle} à {fmt(i.haute.centre)} contre{" "}
          {i.basse.echelle} à {fmt(i.basse.centre)} €/m²/an, soit {fmt(i.rapport, 1)} fois. À vérifier chez la source
          avant de retenir l’un ou l’autre.
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
