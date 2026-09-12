import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import InfoBulle from "@/components/preanalyse/InfoBulle";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";

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
  if (rue.basse != null && loyerM2 < rue.basse) return { mot: "sous la fourchette de la rue", teinte: "var(--k-menthe)", detail: "marge à la hausse possible" };
  if (rue.haute != null && loyerM2 > rue.haute) return { mot: "au-dessus de la fourchette de la rue", teinte: "var(--k-alerte)", detail: "à vérifier avant de retenir le rendement" };
  return { mot: "dans la fourchette de la rue", teinte: "var(--k-ambre)", detail: "cohérent avec le marché de la rue" };
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
    <section className="border border-trait rounded-[16px] bg-[#0a0a0b] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[15.5px] font-semibold text-encre">Valeur locative</h3>
          <InfoBulle texte="Loyer au m² de la rue, du quartier et de la ville, d'après Data-B. En euros HT hors charges, par m² et par an." />
        </div>
        <div className="flex items-baseline gap-3">
          {/* La phrase du verdict, en tête : « le bail est à tant, et voilà ce
              que ça vaut ». Le reste de la carte ne fait que l'étayer. */}
          {resultat && loyerM2 != null && (
            <p className="m-0 text-[13px] text-ardoise">
              Le bail : <span className="text-ambre tabular-nums">{euros(loyerM2)} / m² / an</span>
              {verdict && (
                <>
                  <span className="text-bord-vif"> — </span>
                  <span className="text-craie">{verdict.mot}</span>
                  <span className="text-brume">, {verdict.detail}</span>
                </>
              )}
            </p>
          )}
          {resultat?.lien && (
            <a href={resultat.lien} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-ardoise hover:text-menthe whitespace-nowrap">
              Voir sur Data-B <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>


      {!resultat ? (
        <p className="m-0 mt-4 text-[11.5px] text-brume">
          Aucune lecture — relancez l’analyse de marché avec la source Data-B cochée.
        </p>
      ) : (
        <EchelleFourchettes
          lignes={[
            // La rue porte le verdict : c'est elle la référence, donc elle est
            // en clair. Celle qui contient le loyer du bail passe en ambre.
            { cle: "rue", libelle: "Rue", basse: resultat.rue?.basse ?? null, haute: resultat.rue?.haute ?? null, primaire: true },
            { cle: "quartier", libelle: "Quartier", basse: resultat.quartier?.basse ?? null, haute: resultat.quartier?.haute ?? null },
            { cle: "ville", libelle: "Ville", basse: resultat.ville?.basse ?? null, haute: resultat.ville?.haute ?? null },
          ]}
          repere={loyerM2 != null ? { valeur: loyerM2 } : null}
          legende={[resultat.rue?.nom, resultat.quartier?.nom, resultat.ville?.nom].filter(Boolean).join(" · ")}
        />
      )}

      {resultat && loyerM2 == null && (
        <p className="m-0 mt-3 text-[12.5px] text-brume">
          Le loyer au m² du bail se calculera dès que le loyer annuel et la surface seront
          renseignés dans la fiche.
        </p>
      )}

    </section>
  );
}
