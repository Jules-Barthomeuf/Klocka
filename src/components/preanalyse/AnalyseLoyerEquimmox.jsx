import React, { useEffect, useState } from "react";
import InfoBulle from "@/components/preanalyse/InfoBulle";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";

// L'analyse de loyer d'Equimmox : les loyers observés autour d'une adresse,
// dans un rayon de 500 m, pour des locaux de surface comparable (±30 %).
// Bas, moyenne, haut — et le loyer du bail posé en face. C'est le second
// contrôle que l'équipe faisait à la main, après Data-B. Une recherche prend
// une bonne minute : Klocka pilote leur site comme une personne le ferait.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

// Ce que Klocka fait sur Equimmox, étape par étape. La cinquième — le
// lancement — est celle qui dure : elle attend la réponse.

function verdict(loyerM2, r) {
  if (loyerM2 == null || !r || (r.bas == null && r.haut == null)) return null;
  if (r.bas != null && loyerM2 < r.bas) return { mot: "sous les loyers observés", teinte: "#96c0b8", detail: "prudent face aux comparables" };
  if (r.haut != null && loyerM2 > r.haut) return { mot: "au-dessus des loyers observés", teinte: "#e8746a", detail: "à vérifier avant de retenir le rendement" };
  return { mot: "dans les loyers observés", teinte: "#d9b46a", detail: "cohérent avec les comparables" };
}

export default function AnalyseLoyerEquimmox({ lot }) {
  const [resultat, setResultat] = useState(lot?.analyse_loyer || null);
  useEffect(() => { if (lot?.analyse_loyer) setResultat(lot.analyse_loyer); }, [lot?.analyse_loyer]);


  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surfaceLot = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surfaceLot > 0 ? loyer / surfaceLot : null;
  const v = resultat ? verdict(loyerM2, resultat) : null;

  return (
    <section className="border border-trait rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[15.5px] font-semibold text-encre">Loyers observés autour</h3>
          <InfoBulle texte={"D'après Equimmox : locaux commerciaux à moins de 500 m, de surface comparable à ±30 %. En euros par m² et par an. Une recherche prend environ une minute."} />
        </div>
        {resultat && loyerM2 != null && (
          <p className="m-0 text-[13px] text-ardoise">
            Le bail : <span className="text-ambre tabular-nums">{euros(loyerM2)} / m² / an</span>
            {v && (
              <>
                <span className="text-bord-vif"> — </span>
                <span className="text-craie">{v.mot}</span>
                <span className="text-brume">, {v.detail}</span>
              </>
            )}
          </p>
        )}
      </div>


      {!resultat ? (
        <p className="m-0 mt-4 text-[11.5px] text-brume">
          Aucune lecture — relancez l’analyse de marché avec la source Equimmox cochée.
        </p>
      ) : (
        <>
          {/* Une seule fourchette ici, avec la moyenne en encoche : Equimmox
              observe un secteur, pas trois échelles emboîtées. */}
          <EchelleFourchettes
            lignes={[
              {
                cle: "observes",
                libelle: "Observés",
                basse: resultat.bas ?? null,
                haute: resultat.haut ?? null,
                pointe: resultat.moyenne ?? null,
                primaire: true,
              },
            ]}
            repere={loyerM2 != null ? { valeur: loyerM2 } : null}
            legende={[resultat.rayon, resultat.surface ? `surfaces ${resultat.surface_min}–${resultat.surface_max} m²` : null]
              .filter(Boolean)
              .join(" · ")}
          />

          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-brume">
            {resultat.moyenne != null && <span>Moyenne {euros(resultat.moyenne)}</span>}
            {resultat.delai_jours != null && <span>Commercialisation observée en {resultat.delai_jours} jours</span>}
            {loyerM2 == null && (
              <span>Le loyer au m² du bail se calculera dès que le loyer annuel et la surface seront renseignés.</span>
            )}
          </div>
        </>
      )}

    </section>
  );
}
