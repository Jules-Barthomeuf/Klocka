import React from "react";
import { Section, Chiffres, Phrase, Note, Vide, LienSource, Etiquette, euros, pct, TEINTE } from "@/components/preanalyse/marche-ui";

// Le marché résidentiel autour du bien, d'après Le Figaro Immobilier.
//
// À quoi ça sert : donner un point de comparaison au commerce. Un investisseur
// qui hésite entre des murs commerciaux et un appartement doit voir les deux
// côte à côte : prix au m², loyer au m², et donc rendement. Deux échelles : le
// quartier de l'adresse, qui compte, et la commune en repère.

const teinteEvo = (n) => (n == null ? TEINTE.muet : n > 0 ? TEINTE.menthe : n < 0 ? TEINTE.rouge : TEINTE.doux);

// Le rendement brut d'un appartement acheté au prix médian et loué au loyer
// médian : douze mois de loyer rapportés au prix.
function rendement(prix, loyer) {
  if (!(prix > 0) || !(loyer > 0)) return null;
  return Math.round((loyer * 12 * 1000) / prix) / 10;
}

function Niveau({ titre, niveau, principal = false }) {
  if (!niveau) return null;
  const r = rendement(niveau.prix?.median, niveau.loyer?.median);
  const evo = (x) => (x == null ? null : <span style={{ color: teinteEvo(x) }}>{pct(x)}</span>);
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Etiquette>{titre}</Etiquette>
        <span className="text-[13.5px] text-encre">{niveau.nom || "—"}</span>
      </div>
      <Chiffres
        className="mt-3"
        items={[
          {
            libelle: "Prix au m² à l'achat",
            valeur: euros(niveau.prix?.median),
            teinte: principal ? TEINTE.ambre : TEINTE.clair,
            note: <>{euros(niveau.prix?.bas)} à {euros(niveau.prix?.haut)} · {evo(niveau.prix?.sur_1_an)} sur 1 an · {evo(niveau.prix?.sur_5_ans)} sur 5 ans</>,
          },
          {
            libelle: "Loyer au m² par mois",
            valeur: euros(niveau.loyer?.median),
            teinte: TEINTE.texte,
            note: <>{niveau.loyer?.bas != null ? <>{euros(niveau.loyer.bas)} à {euros(niveau.loyer.haut)} · </> : null}{evo(niveau.loyer?.sur_1_an)} sur 1 an{niveau.loyer?.sur_5_ans != null ? <> · {evo(niveau.loyer.sur_5_ans)} sur 5 ans</> : null}</>,
          },
          { libelle: "Rendement brut d'un appartement", valeur: r != null ? `${String(r).replace(".", ",")} %` : "—", teinte: principal ? TEINTE.ambre : TEINTE.clair, note: "douze mois de loyer médian rapportés au prix médian" },
        ]}
      />
    </div>
  );
}

export default function MarcheResidentielFigaro({ lot, premiere = true }) {
  const resultat = lot?.prix_residentiel || null;
  const loyerCommerce = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const prixCommerce = lot?.lot?.prix_fai?.valeur;
  const rendementCommerce = prixCommerce > 0 && loyerCommerce > 0 ? Math.round((loyerCommerce * 1000) / prixCommerce) / 10 : null;
  const niveau = resultat?.quartier || resultat?.commune;
  const rendementAppart = niveau ? rendement(niveau.prix?.median, niveau.loyer?.median) : null;

  return (
    <Section premiere={premiere} titre="Marché résidentiel · Le Figaro Immobilier" aside={<LienSource href={resultat?.quartier?.lien || resultat?.lien}>Voir sur Le Figaro</LienSource>}>
      {!resultat ? (
        <Vide>Aucune lecture. Relancez l'analyse de marché avec la source Le Figaro cochée.</Vide>
      ) : (
        <>
          <Niveau titre="Le quartier" niveau={resultat.quartier} principal />
          <Niveau titre="La commune" niveau={resultat.commune} />
          {rendementCommerce != null && rendementAppart != null && (
            <Phrase className="mt-6">
              Le commerce présenté rend <span className="tabular-nums text-encre">{String(rendementCommerce).replace(".", ",")} %</span> brut, contre{" "}
              <span className="tabular-nums" style={{ color: TEINTE.ambre }}>{String(rendementAppart).replace(".", ",")} %</span> pour un appartement
              {resultat.quartier ? ` dans le quartier ${resultat.quartier.nom}` : ` à ${resultat.commune?.nom}`}
              {rendementCommerce > rendementAppart ? `, soit ${String(Math.round((rendementCommerce / rendementAppart) * 10) / 10).replace(".", ",")} fois mieux.` : "."}
            </Phrase>
          )}
          <Note className="mt-3">Ce que coûte et ce que rapporte un appartement au même endroit, d'après Le Figaro Immobilier. Le point de comparaison du commerce.</Note>
        </>
      )}
    </Section>
  );
}
