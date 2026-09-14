import React from "react";
import CarteCessions from "@/components/projet/CarteCessions";
import { Section, Chiffres, Phrase, Vide, LienSource, euros, TEINTE } from "@/components/ui/kit";

// Les cessions de fonds de commerce autour du bien, d'après Data-B.
//
// Le loyer dit ce que vaut le mur ; le fonds dit ce que vaut le commerce. Une
// rue où les fonds se vendent cher et souvent est une rue recherchée ; une rue
// sans cession depuis des années l'est moins. Et quand une cession tombe au
// numéro même du bien, on tient le prix du commerce dont on achète les murs.

const annee = (iso) => (iso ? new Date(iso).getFullYear() : "—");

export default function TransactionsFondsDataB({ lot, premiere = false }) {
  const resultat = lot?.transactions_fonds || null;
  // La liste des cessions a disparu : la carte les montre toutes, et les
  // chiffres au-dessus disent ce qu'il faut en retenir. Une énumération de
  // quarante lignes n'apprenait rien de plus.
  const activite = lot?.lot?.locataire_activite?.valeur || null;
  const m = resultat?.marche;
  const r = resultat?.rue;
  const rythme = (x) => (x ? `${x.nombre} cession${x.nombre > 1 ? "s" : ""}${x.par_an ? ` · ${String(x.par_an).replace(".", ",")} par an` : ""}` : null);

  return (
    <Section premiere={premiere} titre="Cessions de fonds autour · Data-B" aside={<LienSource href={resultat?.lien}>Voir sur Data-B</LienSource>}>
      {!resultat ? (
        <Vide>Aucune lecture. Relancez l'analyse de marché avec la source Data-B cochée.</Vide>
      ) : (
        <>
          <Chiffres
            className="mt-4"
            items={[
              { libelle: `Autour · ${resultat.rayon || ""}`, valeur: euros(m?.prix_median), note: m ? `${euros(m.prix_bas)} à ${euros(m.prix_haut)} · ${rythme(m)}` : null },
              { libelle: r?.nom || "Dans la rue", valeur: euros(r?.prix_median), teinte: TEINTE.ambre, note: r ? `${euros(r.prix_bas)} à ${euros(r.prix_haut)} · ${rythme(r)}` : "aucune cession dans la rue" },
              { libelle: "Cessions lues", valeur: resultat.total ?? "—", teinte: TEINTE.texte, note: `depuis ${annee(m?.depuis)}` },
              { libelle: "Au numéro du bien", valeur: resultat.sur_place || 0, teinte: resultat.sur_place ? TEINTE.menthe : TEINTE.texte, note: resultat.sur_place ? "le prix du commerce est connu" : "aucune cession publiée à ce numéro" },
            ]}
          />
          {activite && r?.activites?.length ? (
            <Phrase className="mt-5">Activité du locataire : {activite}. Dans la rue, on vend surtout {r.activites.slice(0, 3).map((x) => x.nom.toLowerCase()).join(", ")}.</Phrase>
          ) : null}
          <div className="mt-6 overflow-hidden rounded-[16px] border border-trait">
            <CarteCessions resultat={resultat} titre={lot?.lot?.locataire_nom?.valeur || "Le bien"} adresse={resultat.adresse} hauteur={360} />
          </div>
        </>
      )}
    </Section>
  );
}
