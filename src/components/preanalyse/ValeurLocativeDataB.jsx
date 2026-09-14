import React from "react";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";
import { Section, Chiffres, Phrase, Note, Vide, LienSource, euros, fmt, TEINTE } from "@/components/preanalyse/marche-ui";

// La valeur locative d'après Data-B : la fourchette de loyer au m² de la rue,
// du quartier et de la ville, et le loyer du bail posé en face. C'est le
// contrôle que l'équipe faisait à la main, module « Valeurs locatives ».
//
// Cet écran ne cherche rien : il montre ce que la lecture de marché a
// rapporté. La recherche se lance depuis « Mettre à jour ».

// Le loyer du bail au m², contre la fourchette de la rue : en dessous, dedans,
// au-dessus. C'est la seule phrase qui compte.
function verdictLoyer(loyerM2, rue) {
  if (loyerM2 == null || !rue || (rue.basse == null && rue.haute == null)) return null;
  if (rue.basse != null && loyerM2 < rue.basse) return { mot: "sous la fourchette de la rue", teinte: TEINTE.menthe, detail: "marge à la hausse possible" };
  if (rue.haute != null && loyerM2 > rue.haute) return { mot: "au-dessus de la fourchette de la rue", teinte: TEINTE.rouge, detail: "à vérifier avant de retenir le rendement" };
  return { mot: "dans la fourchette de la rue", teinte: TEINTE.ambre, detail: "cohérent avec le marché de la rue" };
}

const fourchette = (n) => (n && (n.basse != null || n.haute != null) ? `${fmt(n.basse)} – ${fmt(n.haute)} €` : "—");

export default function ValeurLocativeDataB({ lot, premiere = false }) {
  const resultat = lot?.valeur_locative || null;
  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surface = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surface > 0 ? loyer / surface : null;
  const verdict = resultat ? verdictLoyer(loyerM2, resultat.rue) : null;

  return (
    <Section premiere={premiere} titre="Valeur locative · Data-B" aside={<LienSource href={resultat?.lien}>Voir sur Data-B</LienSource>}>
      {!resultat ? (
        <Vide>Aucune lecture. Relancez l'analyse de marché avec la source Data-B cochée.</Vide>
      ) : (
        <>
          <Chiffres
            className="mt-4"
            items={[
              { libelle: `Rue${resultat.rue?.nom ? ` · ${resultat.rue.nom}` : ""}`, valeur: fourchette(resultat.rue), note: "€/m²/an, HT hors charges" },
              { libelle: `Quartier${resultat.quartier?.nom ? ` · ${resultat.quartier.nom}` : ""}`, valeur: fourchette(resultat.quartier), teinte: TEINTE.texte },
              { libelle: `Ville${resultat.ville?.nom ? ` · ${resultat.ville.nom}` : ""}`, valeur: fourchette(resultat.ville), teinte: TEINTE.texte },
              { libelle: "Le bail", valeur: loyerM2 != null ? `${euros(loyerM2)} /m²/an` : "—", teinte: verdict?.teinte || TEINTE.clair, note: verdict ? verdict.mot : loyerM2 == null ? "loyer annuel et surface à renseigner sur la fiche" : null },
            ]}
          />
          <EchelleFourchettes
            lignes={[
              { cle: "rue", libelle: "Rue", basse: resultat.rue?.basse ?? null, haute: resultat.rue?.haute ?? null, primaire: true },
              { cle: "quartier", libelle: "Quartier", basse: resultat.quartier?.basse ?? null, haute: resultat.quartier?.haute ?? null },
              { cle: "ville", libelle: "Ville", basse: resultat.ville?.basse ?? null, haute: resultat.ville?.haute ?? null },
            ]}
            repere={loyerM2 != null ? { valeur: loyerM2 } : null}
            legende={[resultat.rue?.nom, resultat.quartier?.nom, resultat.ville?.nom].filter(Boolean).join(" · ")}
          />
          {verdict && (
            <Phrase className="mt-4">
              Le bail, à <span className="tabular-nums text-[#F3F7F5]">{euros(loyerM2)} par m² et par an</span>, est <span style={{ color: verdict.teinte }}>{verdict.mot}</span> : {verdict.detail}.
            </Phrase>
          )}
          <Note className="mt-3">Loyer au m² de la rue, du quartier et de la ville, d'après Data-B. En euros HT hors charges, par m² et par an.</Note>
        </>
      )}
    </Section>
  );
}
