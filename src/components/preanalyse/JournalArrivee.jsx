import React, { useState } from "react";
import { Play } from "lucide-react";
import { chrono, ton } from "@/components/preanalyse/journal-tons";
import InfoBulle from "@/components/preanalyse/InfoBulle";
import ChoixSources from "@/components/preanalyse/ChoixSources";
import JournalDetail from "@/components/preanalyse/JournalDetail";
import { OngletDataB, OngletEquimmox, OngletFigaro, Recoupement } from "@/components/preanalyse/JournalSources";
import { OngletBodacc, OngletDvf, SecondPointDeVue } from "@/components/preanalyse/JournalPubliques";
import MarcheEmplacement from "@/components/preanalyse/MarcheEmplacement";
import MarcheVendeur from "@/components/preanalyse/MarcheVendeur";
import GraphiqueLoyers from "@/components/preanalyse/GraphiqueLoyers";
import { Onglets } from "@/components/preanalyse/marche-ui";
import { Etiquette } from "@/components/alx/alx-commun";

// L'onglet Marché, à l'arrivée. Deux états, et ils ne se ressemblent pas.
//
// Rien n'a jamais tourné sur ce lot → on montre ce qui va être fait : les
// critères, l'état des accès aux trois sources, et un bouton qui lance.
//
// Une analyse existe → c'est SON résultat qu'on voit, tout de suite : les trois
// verdicts, les sources avec leur heure de relevé, puis dans l'ordre tout ce
// que l'agent a ouvert. Un chiffre trouvé huit jours plus tôt se relit ; il n'a
// pas à être recalculé pour être consulté. « Mettre à jour » relance, et rien
// d'autre ne bouge.

export default function JournalArrivee({
  intention,
  criteres,
  sources,
  analyse,
  dossier,
  lot,
  onRefresh,
  onCarte,
  detailCle,
  onRetourDetail,
  dureeEstimee,
  onLancer,
  apercu,
}) {
  return analyse ? (
    <AvecAnalyse
      analyse={analyse}
      onLancer={onLancer}
      onCarte={onCarte}
      detailCle={detailCle}
      onRetourDetail={onRetourDetail}
      dossier={dossier}
      lot={lot}
      onRefresh={onRefresh}
      apercu={apercu}
    />
  ) : (
    <Vierge intention={intention} criteres={criteres} sources={sources} dureeEstimee={dureeEstimee} onLancer={onLancer} apercu={apercu} />
  );
}

/** Aucune analyse : ce qui va être fait, et avec quoi. */
function Vierge({ intention, criteres, sources, dureeEstimee, onLancer, apercu }) {
  return (
    <div className="px-4 sm:px-5 py-5 flex flex-col gap-5">
      <div>
        <h3 className="m-0 text-[17px] font-semibold text-encre">Aucune analyse de marché sur ce lot</h3>
        <p className="m-0 mt-2 text-[13px] leading-6 text-ardoise max-w-[70ch]">{intention}</p>
      </div>

      {/* Les critères viennent du lot : l'adresse, la surface et l'activité
          extraites de la fiche. Les modifier, c'est corriger la fiche. */}
      <div className="flex flex-wrap items-center gap-2">
        {criteres.map((c) => (
          <span
            key={c.cle}
            title={c.libelle}
            className="inline-flex items-center rounded-full border border-bord-doux bg-[#15181c] px-3 py-1 font-pill text-[11px] font-medium uppercase tracking-[.04em] text-[#c6ccd3]"
          >
            {c.valeur}
          </span>
        ))}
      </div>

      <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
        {sources.map((s) => {
          const c = ton(s.ton);
          return (
            <li key={s.cle} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-3">
              <span className="flex-shrink-0 w-[7px] h-[7px] rounded-full" style={{ background: c.pastille }} aria-hidden />
              <span className="flex-shrink-0 text-[13px] text-encre">{s.nom}</span>
              <span className="min-w-0 flex-1 text-[12px]" style={{ color: s.ton === "ambre" ? c.etiquette : "#6a7180" }}>
                {s.acces}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => onLancer(null)}
          disabled={apercu}
          className="inline-flex items-center gap-2 rounded-full bg-[#b8dcc8] text-[#04140c] text-[13px] font-semibold px-5 py-2.5 hover:bg-[#c8e8d6] disabled:opacity-30 transition-colors"
        >
          <Play className="w-3.5 h-3.5" /> Lancer la recherche
        </button>
        <span className="text-[12px] text-brume">En parallèle · environ {dureeEstimee}</span>
      </div>
    </div>
  );
}

const ONGLETS = [
  { cle: "bilan", titre: "Bilan" },
  { cle: "data-b", titre: "Data-B" },
  { cle: "equimmox", titre: "Equimmox" },
  { cle: "figaro", titre: "Le Figaro" },
  // Les deux sources publiques, à part : elles ne coûtent rien et ne doivent
  // rien au vendeur. Ce sont les seules à dire ce qui s'est payé et ce qui a
  // fermé, quand les autres parlent de demandes.
  { cle: "dvf", titre: "DVF" },
  { cle: "bodacc", titre: "BODACC" },
  // Le vendeur et le détail des sources : hors du bilan, qui reste un bilan.
  { cle: "vendeur", titre: "Vendeur" },
  { cle: "sources", titre: "Sources" },
];

/**
 * Une analyse existe : son résultat, d'abord.
 *
 * Quatre onglets. Le bilan croise les sources et porte les verdicts ; les
 * trois autres montrent la matière brute de chaque plateforme, sans mélange.
 * On y va quand un chiffre du bilan surprend — et le drapeau d'écart, quand
 * il se lève, dit précisément où aller.
 */
function AvecAnalyse({ analyse, onLancer, onCarte, detailCle, onRetourDetail, dossier, lot, onRefresh, apercu }) {
  const [onglet, setOnglet] = useState("bilan");

  if (detailCle && analyse.details?.[detailCle]) {
    return (
      <JournalDetail
        cartes={analyse.cartes}
        details={analyse.details}
        cle={detailCle}
        onChoisir={(cle) => onCarte(analyse.cartes.find((k) => k.cle === cle))}
        onRetour={onRetourDetail}
        titre={`Analyse du ${analyse.le}`}
      />
    );
  }

  const valeurDe = (c) => {
    // « Au-dessus du marché · +10 % » : le chiffre en grand, le mot en dessous.
    const [mot, chiffre] = c.valeur.includes(" · ") ? c.valeur.split(" · ") : [null, c.valeur];
    return { mot, chiffre };
  };
  const teinteDe = (c) => (c.ton === "ambre" ? "#e0a45e" : c.ton === "rouge" ? "#e0655f" : c.ton === "gris" ? "#8B938F" : ["reversion", "prix-fai"].includes(c.cle) ? "#96c0b8" : "#F3F7F5");

  return (
    <div className="pb-9 pt-[6px]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <span className="text-[28px] font-normal tracking-[-.02em] text-[#F3F7F5]">Analyse du {analyse.le}</span>
        <ChoixSources onLancer={onLancer} apercu={apercu} classeBouton="alx-mont inline-flex items-center gap-2 rounded-full bg-[#96c0b8] px-[22px] py-[11px] text-[11px] font-semibold uppercase tracking-[.12em] text-[#08130D] hover:bg-[#c3ddd6] disabled:opacity-30 transition-colors" />
      </div>

      <Onglets items={ONGLETS} valeur={onglet} onChange={setOnglet} className="mt-6" />

      {onglet === "bilan" && (
        <>
          <GraphiqueLoyers lectures={analyse.loyers_lectures || []} enPlace={analyse.en_place_m2} />

          {/* Les cinq chiffres : chacun ouvre sa démonstration en pleine largeur. */}
          <div className="mt-8 grid grid-cols-2 border-t border-white/[0.16] md:grid-cols-5">
            {analyse.cartes.map((c, i) => {
              const { mot, chiffre } = valeurDe(c);
              return (
                <button
                  key={c.cle}
                  type="button"
                  onClick={() => onCarte(c)}
                  title={c.detail}
                  className={`px-[18px] pt-[18px] pb-1 text-left transition-colors hover:bg-white/[0.02] ${i === 0 ? "pl-0" : ""} ${i === analyse.cartes.length - 1 ? "pr-0 md:border-r-0" : "border-r border-white/[0.16]"}`}
                  style={{ background: "transparent" }}
                >
                  <span className="alx-mont flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[.14em] text-[#8B938F]">
                    {c.libelle}
                    <InfoBulle texte={c.detail} />
                  </span>
                  <span className="mt-2 block whitespace-nowrap text-[18px] font-medium tabular-nums" style={{ color: teinteDe(c) }}>{chiffre}</span>
                  {mot && <span className="mt-1 block text-[11.5px] text-[#8B938F]">{mot}</span>}
                </button>
              );
            })}
          </div>

          <MarcheEmplacement adresse={analyse.adresse} />
        </>
      )}

      {onglet === "vendeur" && (
        <div className="mt-6"><MarcheVendeur adresse={analyse.adresse} lot={lot} dossier={dossier} premiere /></div>
      )}

      {onglet === "sources" && (
        <div className="mt-6">
          {(analyse.recoupement || analyse.parComparaison) && (
            <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
              <Recoupement recoupement={analyse.recoupement} />
              <SecondPointDeVue comparaison={analyse.parComparaison} ecart={analyse.ecartComparaison} />
            </div>
          )}
          <div className={`grid grid-cols-1 gap-x-[34px] gap-y-8 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] ${analyse.recoupement || analyse.parComparaison ? "mt-[34px] border-t border-white/[0.07] pt-[26px]" : ""}`}>
            <section>
              <Etiquette>Sources</Etiquette>
              <ul className="m-0 mt-3.5 flex list-none flex-col p-0">
                {analyse.sources.map((s, i) => {
                  const c = ton(s.ton);
                  return (
                    <li key={`${s.nom}-${i}`} className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-3 ${i < analyse.sources.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
                      <span className="h-[5px] w-[5px] flex-shrink-0 rounded-full" style={{ background: c.pastille }} aria-hidden />
                      <span className="flex-shrink-0 text-[14px] text-[#F3F7F5]">{s.nom}</span>
                      <span className="min-w-0 flex-1 text-[12.5px]" style={{ color: s.ton === "ambre" || s.ton === "rouge" ? c.etiquette : "#8B938F" }}>{s.etat}</span>
                      <span className="flex-shrink-0 whitespace-nowrap text-[11.5px] tabular-nums text-[#8B938F]">{s.quand}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <div className="hidden bg-white/[0.06] lg:block" />
            <section>
              <Etiquette>Dans l'ordre, ce que j'ai consulté</Etiquette>
              <ol className="m-0 mt-3.5 flex list-none flex-col p-0">
                {analyse.consultations.map((c, i) => (
                  <li key={`${c.quoi}-${i}`} title={c.url || undefined} className={`flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 py-3 ${i < analyse.consultations.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
                    <span className="flex-shrink-0 text-[11.5px] tabular-nums text-[#8B938F]">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 text-[13.5px] text-[#C3CBC7]">{c.quoi}</span>
                    <span className="flex-shrink-0 whitespace-nowrap text-[11.5px] tabular-nums" style={{ color: ton(c.ton).etiquette }}>{c.issue}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}

      {!["bilan", "vendeur", "sources"].includes(onglet) && (
        <div className="mt-6">
          {onglet === "data-b" && <OngletDataB lot={lot} implantation={analyse.emplacement} />}
          {onglet === "equimmox" && <OngletEquimmox lot={lot} />}
          {onglet === "figaro" && <OngletFigaro lot={lot} />}
          {onglet === "dvf" && <OngletDvf ventes={analyse.dvf} />}
          {onglet === "bodacc" && <OngletBodacc vitalite={analyse.vitalite} />}
        </div>
      )}
    </div>
  );
}
