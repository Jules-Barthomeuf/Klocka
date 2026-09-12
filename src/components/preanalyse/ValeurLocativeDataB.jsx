import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import InfoBulle from "@/components/preanalyse/InfoBulle";

// La valeur locative d'après Data-B : la fourchette de loyer au m² de la rue,
// du quartier et de la ville, et le loyer du bail posé en face. C'est le
// contrôle que l'équipe faisait à la main, module « Valeurs locatives », en
// recopiant trois lignes.
//
// Cet écran ne cherche plus rien : il MONTRE ce que la lecture de marché a
// rapporté. La recherche se lance depuis « Mettre à jour », qui interroge
// toutes les sources cochées d'un coup. Avoir une barre de recherche par
// source revenait à en relancer une en oubliant les autres, et à lire côte à
// côte des chiffres relevés des jours différents.

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

// Le loyer du bail au m², contre la fourchette de la rue : en dessous, dedans,
// au-dessus. C'est la seule phrase qui compte.
function verdictLoyer(loyerM2, rue) {
  if (loyerM2 == null || !rue || (rue.basse == null && rue.haute == null)) return null;
  if (rue.basse != null && loyerM2 < rue.basse) return { mot: "sous la fourchette de la rue", teinte: "#96c0b8", detail: "le loyer paraît prudent, il y a peut-être de la marge à la hausse" };
  if (rue.haute != null && loyerM2 > rue.haute) return { mot: "au-dessus de la fourchette de la rue", teinte: "#e8746a", detail: "le loyer paraît surévalué : à vérifier avant de retenir le rendement" };
  return { mot: "dans la fourchette de la rue", teinte: "#d9b46a", detail: "le loyer est cohérent avec le marché de la rue" };
}

function Niveau({ titre, n, loyerM2 }) {
  const dedans = n && loyerM2 != null && n.basse != null && n.haute != null && loyerM2 >= n.basse && loyerM2 <= n.haute;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-[#15171b]">
      <div className="min-w-0">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#6a7180]">{titre}</p>
        <p className={`m-0 text-[14px] truncate ${n ? "text-[#f2f3f5]" : "text-[#3a3f4a]"}`}>{n?.nom || "—"}</p>
      </div>
      <p
        className={`m-0 text-[15px] tabular-nums font-light whitespace-nowrap ${!n ? "text-[#3a3d3c]" : dedans ? "text-[#d9b46a]" : "text-[#f2f3f5]"}`}
        style={{ transition: "opacity .5s ease, transform .5s ease", transform: n ? "none" : "translateY(4px)" }}
      >
        {n ? <>{euros(n.basse)} <span className="text-[#3a3f4a]">–</span> {euros(n.haute)}</> : "— €"}
      </p>
    </div>
  );
}

export default function ValeurLocativeDataB({ lot }) {
  // Ce que la dernière lecture de marché a posé sur le lot.
  const [resultat, setResultat] = useState(lot?.valeur_locative || null);
  useEffect(() => { if (lot?.valeur_locative) setResultat(lot.valeur_locative); }, [lot?.valeur_locative]);

  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surface = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surface > 0 ? loyer / surface : null;
  const verdict = resultat ? verdictLoyer(loyerM2, resultat.rue) : null;

  return (
    <section className="border border-[#1f2228] rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[15.5px] font-semibold text-[#f2f3f5]">Valeur locative</h3>
          <InfoBulle texte="Loyer au m² de la rue, du quartier et de la ville, d'après Data-B. En euros HT hors charges, par m² et par an." />
        </div>
        {resultat?.lien && (
          <a href={resultat.lien} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-[#9298a6] hover:text-[#96c0b8]">
            Voir sur Data-B <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>


      <div className="mt-4">
        {!resultat && (
          <p className="m-0 mb-1 text-[11.5px] text-[#6a7180]">
            Aucune lecture — relancez l’analyse de marché avec la source Data-B cochée.
          </p>
        )}
        <dl className="m-0">
          <Niveau titre="Rue" n={resultat?.rue} loyerM2={loyerM2} />
          <Niveau titre="Quartier" n={resultat?.quartier} loyerM2={loyerM2} />
          <Niveau titre="Ville" n={resultat?.ville} loyerM2={loyerM2} />
        </dl>
      </div>

      {resultat && (
        <div>
          {/* Le loyer du bail, en face : c'est pour ça qu'on est venu. */}
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {loyerM2 != null ? (
              <>
                <span className="text-[13px] text-[#9298a6]">Le bail :</span>
                <span className="text-[15px] tabular-nums font-light text-[#f2f3f5]">{euros(loyerM2)} / m² / an</span>
                {verdict && (
                  <span className="text-[13px]" style={{ color: verdict.teinte }}>
                    {verdict.mot}<span className="text-[#6a7180]"> — {verdict.detail}</span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-[12.5px] text-[#6a7180]">Le loyer au m² du bail se calculera dès que le loyer annuel et la surface seront renseignés dans la fiche.</span>
            )}
          </div>
        </div>
      )}

    </section>
  );
}
