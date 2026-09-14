import React, { useState } from "react";
import CarteCessions from "@/components/projet/CarteCessions";
import { Section, Chiffres, Lignes, Phrase, Note, Vide, LienSource, euros, TEINTE } from "@/components/ui/kit";

// Les cessions de fonds de commerce autour du bien, d'après Data-B.
//
// Le loyer dit ce que vaut le mur ; le fonds dit ce que vaut le commerce. Une
// rue où les fonds se vendent cher et souvent est une rue recherchée ; une rue
// sans cession depuis des années l'est moins. Et quand une cession tombe au
// numéro même du bien, on tient le prix du commerce dont on achète les murs.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const annee = (iso) => (iso ? new Date(iso).getFullYear() : "—");

export default function TransactionsFondsDataB({ lot, premiere = false }) {
  const resultat = lot?.transactions_fonds || null;
  const [tout, setTout] = useState(false);
  // La liste sert à lire quelques cessions, pas à les parcourir toutes : la
  // carte s'en charge. On en montre huit, quarante au plus.
  const lignes = (resultat?.transactions || []).slice(0, 40);
  const visibles = tout ? lignes : lignes.slice(0, 8);
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
          <Lignes
            className="mt-5"
            items={visibles}
            cle={(t, i) => `${t.date}-${t.enseigne}-${i}`}
            rendu={(t) => (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-encre">
                    {t.enseigne}
                    {t.sur_place && <span className="ml-2 text-[11px]" style={{ color: TEINTE.menthe }}>au numéro du bien</span>}
                    {!t.sur_place && t.dans_la_rue && <span className="ml-2 text-[11px]" style={{ color: TEINTE.ambre }}>dans la rue</span>}
                  </span>
                  <span className="block truncate text-[12.5px] text-ardoise">{[t.activite, jour(t.date), t.adresse].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="whitespace-nowrap text-[13.5px] font-medium tabular-nums text-encre">{euros(t.prix)}</span>
              </>
            )}
          />
          {lignes.length > 8 && (
            <button type="button" onClick={() => setTout((v) => !v)} className="mt-3 text-[12.5px] text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>
              {tout ? "Voir moins" : `Voir les ${lignes.length} cessions retenues`}
            </button>
          )}
          <Note className="mt-4">Les fonds de commerce vendus à moins de 500 m, d'après Data-B. Le loyer dit ce que vaut le mur, le fonds dit ce que vaut le commerce.</Note>
        </>
      )}
    </Section>
  );
}
