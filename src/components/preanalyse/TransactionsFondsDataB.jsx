import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import InfoBulle from "@/components/preanalyse/InfoBulle";
import CarteCessions from "@/components/projet/CarteCessions";

// Les cessions de fonds de commerce autour du bien, d'après Data-B.
//
// Le loyer dit ce que vaut le mur ; le fonds dit ce que vaut le commerce. Une
// rue où les fonds se vendent cher et souvent est une rue recherchée ; une rue
// sans cession depuis des années l'est moins. Et quand une cession tombe au
// numéro même du bien, on tient le prix du commerce qu'on achète les murs.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const annee = (iso) => (iso ? new Date(iso).getFullYear() : "—");


// Une ligne de chiffres : la fourchette et le rythme d'un périmètre.
function Perimetre({ titre, m, teinte = "#f2f3f5" }) {
  if (!m) return null;
  return (
    <div className="border border-trait rounded-xl px-4 py-3 bg-surface">
      <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-brume">{titre}</p>
      <p className="m-0 mt-1 text-[17px] tabular-nums font-light" style={{ color: teinte }}>
        {euros(m.prix_median)}
      </p>
      <p className="m-0 mt-0.5 text-[11.5px] text-brume tabular-nums">
        {euros(m.prix_bas)} à {euros(m.prix_haut)}
      </p>
      <p className="m-0 mt-1.5 text-[12px] text-ardoise">
        {m.nombre} cession{m.nombre > 1 ? "s" : ""}
        {m.par_an ? <> · {String(m.par_an).replace(".", ",")} par an</> : null}
      </p>
    </div>
  );
}

export default function TransactionsFondsDataB({ lot }) {

  const [resultat, setResultat] = useState(lot?.transactions_fonds || null);
  useEffect(() => { if (lot?.transactions_fonds) setResultat(lot.transactions_fonds); }, [lot?.transactions_fonds]);
  const [tout, setTout] = useState(false);


  // La liste sert à lire quelques cessions, pas à les parcourir toutes : la
  // carte du projet s'en charge. On en montre huit, quarante au plus.
  const lignes = (resultat?.transactions || []).slice(0, 40);
  const visibles = tout ? lignes : lignes.slice(0, 8);
  const activite = lot?.lot?.locataire_activite?.valeur || null;

  return (
    <section className="border border-trait rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[15.5px] font-semibold text-encre">Cessions de fonds autour</h3>
          <InfoBulle texte={"Les fonds de commerce vendus à moins de 500 m, d'après Data-B. Le loyer dit ce que vaut le mur, le fonds dit ce que vaut le commerce."} />
        </div>
        {resultat?.lien && (
          <a href={resultat.lien} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ardoise hover:text-menthe">
            Voir sur Data-B <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>


      {resultat && (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[11.5px] text-brume">
            {resultat.rayon}
            <span className="text-bord-vif"> · </span>{resultat.total} cessions depuis {annee(resultat.marche?.depuis)}
          </p>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
            <Perimetre titre={`Autour · ${resultat.rayon}`} m={resultat.marche} />
            {/* Le nom porte déjà « Rue », « Avenue »… : ne pas le redoubler. */}
            <Perimetre titre={resultat.rue?.nom || "Dans la rue"} m={resultat.rue} teinte="#d9b46a" />
          </div>

          {/* Ce qui touche le bien lui-même. */}
          {resultat.sur_place > 0 && (
            <p className="m-0 mt-3 text-[13px] text-menthe">
              {resultat.sur_place} cession{resultat.sur_place > 1 ? "s" : ""} au numéro même du bien : le prix du commerce est connu.
            </p>
          )}
          {activite && resultat.rue?.activites?.length ? (
            <p className="m-0 mt-2 text-[12.5px] text-brume">
              Activité du locataire : {activite}.
              {" "}Dans la rue, on vend surtout {resultat.rue.activites.slice(0, 3).map((x) => x.nom.toLowerCase()).join(", ")}.
            </p>
          ) : null}

          {/* Les cessions autour du bien : on les voit avant de les lire. */}
          <div className="mt-4">
            <CarteCessions
              resultat={resultat}
              titre={lot?.lot?.locataire_nom?.valeur || "Le bien"}
              adresse={resultat.adresse}
              hauteur={360}
            />
          </div>

          {/* Les cessions, le proche d'abord. */}
          <div className="mt-5">
            {visibles.map((t, i) => (
              <div
                key={`${t.date}-${t.enseigne}-${i}`}
                className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[#15171b]"
              >
                <div className="min-w-0">
                  <p className="m-0 text-[13.5px] text-encre truncate">
                    {t.enseigne}
                    {t.sur_place && <span className="ml-2 text-[11px] text-menthe">au numéro du bien</span>}
                    {!t.sur_place && t.dans_la_rue && <span className="ml-2 text-[11px] text-ambre">dans la rue</span>}
                  </p>
                  <p className="m-0 text-[11.5px] text-brume truncate">
                    {[t.activite, jour(t.date), t.adresse].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <p className="m-0 text-[14px] tabular-nums font-light text-encre whitespace-nowrap">{euros(t.prix)}</p>
              </div>
            ))}
            {lignes.length > 8 && (
              <button
                type="button"
                onClick={() => setTout((v) => !v)}
                className="mt-3 text-[12.5px] text-ardoise hover:text-encre"
              >
                {tout ? "Voir moins" : `Voir les ${lignes.length} cessions retenues`}
              </button>
            )}
          </div>
        </div>
      )}

    </section>
  );
}
