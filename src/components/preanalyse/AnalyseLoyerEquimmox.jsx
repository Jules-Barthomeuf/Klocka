import React, { useEffect, useState } from "react";
import InfoBulle from "@/components/preanalyse/InfoBulle";

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
  if (r.bas != null && loyerM2 < r.bas) return { mot: "sous les loyers observés", teinte: "#96c0b8", detail: "le loyer paraît prudent par rapport aux comparables" };
  if (r.haut != null && loyerM2 > r.haut) return { mot: "au-dessus des loyers observés", teinte: "#e8746a", detail: "le loyer paraît surévalué : à vérifier avant de retenir le rendement" };
  return { mot: "dans les loyers observés", teinte: "#d9b46a", detail: "le loyer est cohérent avec les comparables du secteur" };
}

export default function AnalyseLoyerEquimmox({ lot }) {
  const [resultat, setResultat] = useState(lot?.analyse_loyer || null);
  useEffect(() => { if (lot?.analyse_loyer) setResultat(lot.analyse_loyer); }, [lot?.analyse_loyer]);


  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surfaceLot = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surfaceLot > 0 ? loyer / surfaceLot : null;
  const v = resultat ? verdict(loyerM2, resultat) : null;
  const dedans = (n) => loyerM2 != null && resultat?.bas != null && resultat?.haut != null && n === "moyenne" && loyerM2 >= resultat.bas && loyerM2 <= resultat.haut;

  return (
    <section className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">Loyers observés autour</h3>
        <InfoBulle texte={"D'après Equimmox : locaux commerciaux à moins de 500 m, de surface comparable à ±30 %. En euros par m² et par an. Une recherche prend environ une minute."} />
      </div>


      <div className="mt-4">
        <p className="m-0 mb-2 text-[11.5px] text-[#6a7180]">
          {resultat ? (
            <>
              {resultat.rayon}
              {resultat.surface ? <><span className="text-[#3a3f4a]"> · </span>surfaces {resultat.surface_min}–{resultat.surface_max} m²</> : null}
            </>
          ) : (
            "Aucune lecture — relancez l’analyse de marché avec la source Equimmox cochée."
          )}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[["Bas", resultat?.bas, "bas"], ["Moyenne", resultat?.moyenne, "moyenne"], ["Haut", resultat?.haut, "haut"]].map(([l, n, cle]) => (
            <div key={cle} className="border border-[#1f2228] rounded-xl px-4 py-3 bg-[#0f1114]">
              <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#6a7180]">{l}</p>
              <p
                className={`m-0 mt-1 text-[20px] tabular-nums font-light ${!resultat ? "text-[#3a3d3c]" : dedans(cle) ? "text-[#d9b46a]" : "text-[#f2f3f5]"}`}
                style={{ transition: "opacity .5s ease, transform .5s ease", transform: resultat ? "none" : "translateY(4px)" }}
              >
                {resultat ? euros(n) : "— €"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {resultat && (
        <div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {loyerM2 != null ? (
              <>
                <span className="text-[13px] text-[#9298a6]">Le bail :</span>
                <span className="text-[15px] tabular-nums font-light text-[#f2f3f5]">{euros(loyerM2)} / m² / an</span>
                {v && <span className="text-[13px]" style={{ color: v.teinte }}>{v.mot}<span className="text-[#6a7180]"> — {v.detail}</span></span>}
              </>
            ) : (
              <span className="text-[12.5px] text-[#6a7180]">Le loyer au m² du bail se calculera dès que le loyer annuel et la surface seront renseignés dans la fiche.</span>
            )}
            {resultat.delai_jours != null && (
              <span className="text-[12px] text-[#6a7180]">Délai de commercialisation observé : {resultat.delai_jours} jours.</span>
            )}
          </div>
        </div>
      )}

    </section>
  );
}
