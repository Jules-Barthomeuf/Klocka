import React, { useState } from "react";
import { Play } from "lucide-react";
import { chrono, ton } from "@/components/preanalyse/journal-tons";
import InfoBulle from "@/components/preanalyse/InfoBulle";
import ChoixSources from "@/components/preanalyse/ChoixSources";
import JournalDetail from "@/components/preanalyse/JournalDetail";
import { OngletDataB, OngletEquimmox, OngletFigaro, Recoupement } from "@/components/preanalyse/JournalSources";
import { OngletBodacc, OngletDvf, SecondPointDeVue } from "@/components/preanalyse/JournalPubliques";
import MarcheEmplacement from "@/components/preanalyse/MarcheEmplacement";
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

  return (
    <div className="px-4 sm:px-5 py-5 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h3 className="alx-serif m-0 text-[24px] italic tracking-[-.01em] text-[#F3F7F5]">Analyse du {analyse.le}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ChoixSources onLancer={onLancer} apercu={apercu} />
        </div>
      </div>

      <div className="flex gap-6 border-b border-trait">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            aria-pressed={onglet === o.cle}
            className={`relative pb-2.5 text-[13.5px] transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-encre after:origin-left after:transition-transform after:duration-300 ${
              onglet === o.cle ? "text-encre font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3] after:scale-x-0"
            }`}
          >
            {o.titre}
          </button>
        ))}
      </div>

      {onglet === "bilan" && (
        <>
          {/* Les verdicts : chacun ouvre sa démonstration en pleine largeur. */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {analyse.cartes.map((c) => {
              const couleur = ton(c.ton);
              return (
                <button
                  key={c.cle}
                  type="button"
                  onClick={() => onCarte(c)}
                  className="rounded-[14px] border px-5 py-4 text-left transition-colors hover:bg-white/[0.025]"
                  style={{ borderColor: couleur.bord }}
                >
                  <span className="alx-mont flex items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[.14em] text-[#8B938F]">
                    {c.libelle}
                    <InfoBulle texte={c.detail} />
                  </span>
                  <span className="alx-mont mt-2 block text-[19px] leading-tight tabular-nums" style={{ color: couleur.texte }}>
                    {c.valeur}
                  </span>
                </button>
              );
            })}
          </div>

          <MarcheEmplacement adresse={analyse.adresse} />

          {analyse.recoupement && <Recoupement recoupement={analyse.recoupement} />}

          <SecondPointDeVue comparaison={analyse.parComparaison} ecart={analyse.ecartComparaison} />

          <section>
            <Etiquette className="mb-1.5">Sources</Etiquette>
            <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
              {analyse.sources.map((s, i) => {
                const c = ton(s.ton);
                return (
                  <li key={`${s.nom}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5">
                    <span className="flex-shrink-0 w-[7px] h-[7px] rounded-full" style={{ background: c.pastille }} aria-hidden />
                    <span className="flex-shrink-0 text-[13px] text-encre">{s.nom}</span>
                    <span className="min-w-0 flex-1 text-[12px]" style={{ color: s.ton === "ambre" || s.ton === "rouge" ? c.etiquette : "#6a7180" }}>
                      {s.etat}
                    </span>
                    <span className="flex-shrink-0 text-[11.5px] text-[#4e545e]">{s.quand}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <Etiquette className="mb-1.5">Dans l’ordre, ce que j’ai consulté</Etiquette>
            <ol className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
              {analyse.consultations.map((c, i) => {
                const couleur = ton(c.ton);
                return (
                  <li key={`${c.quoi}-${i}`} title={c.url || undefined} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                    <span className="flex-shrink-0 font-mono text-[10.5px] text-[#3a424d] tabular-nums w-[18px] text-right">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-shrink-0 font-mono text-[10.5px] text-[#4e545e] tabular-nums w-[58px]">{c.quand || ""}</span>
                    <span className="flex-shrink-0 font-mono text-[9.5px] text-brume w-[76px] truncate">{c.src}</span>
                    <span className="min-w-0 flex-1 text-[12.5px] text-[#c6ccd3]">{c.quoi}</span>
                    <span className="flex-shrink-0 text-[11.5px]" style={{ color: couleur.etiquette }}>{c.issue}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}

      {onglet === "data-b" && (
        <OngletDataB lot={lot} implantation={analyse.emplacement} />
      )}
      {onglet === "equimmox" && <OngletEquimmox lot={lot} />}
      {onglet === "figaro" && <OngletFigaro lot={lot} />}

      {onglet === "dvf" && <OngletDvf ventes={analyse.dvf} />}

      {onglet === "bodacc" && <OngletBodacc vitalite={analyse.vitalite} />}
    </div>
  );
}
