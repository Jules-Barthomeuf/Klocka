import React from "react";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";
import { Section, Chiffres, Phrase, Note, Vide, LienSource, euros, fmt, TEINTE } from "@/components/ui/kit";

// La valeur locative du secteur : la fourchette de loyer au m² de la rue, du
// quartier et de la ville, constatée chez Equimmox à trois rayons, avec le
// loyer déduit des ventes DVF à côté, et le loyer du bail posé en face.
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

export default function ValeurLocativeMarche({ lot, premiere = false }) {
  const resultat = lot?.valeur_locative || null;
  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surface = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surface > 0 ? loyer / surface : null;
  const verdict = resultat ? verdictLoyer(loyerM2, resultat.rue) : null;

  return (
    <Section premiere={premiere} titre={`Valeur locative du secteur · ${resultat?.constate ? "Equimmox" : resultat?.dvf ? "déduite des ventes" : "Equimmox"}`} aside={resultat?.dvf?.lien ? <LienSource href={resultat.dvf.lien}>Les ventes sur DVF</LienSource> : null}>
      {!resultat ? (
        <Vide>{lot?.marche_relance && Date.now() - Date.parse(lot.marche_relance.le) < 15 * 60000
          ? "L'adresse a changé : la valeur locative se relit à la nouvelle adresse, quelques minutes. L'ancienne estimation a été retirée."
          : "Aucune lecture. Relancez l'analyse de marché avec la valeur locative du secteur cochée."}</Vide>
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
              Le bail, à <span className="tabular-nums text-encre">{euros(loyerM2)} par m² et par an</span>, est <span style={{ color: verdict.teinte }}>{verdict.mot}</span> : {verdict.detail}.
            </Phrase>
          )}
          {resultat.dvf && (
            <Phrase className="mt-4">
              Déduit des ventes de murs : <span className="tabular-nums text-encre">{fmt(resultat.dvf.basse)} – {fmt(resultat.dvf.haute)} €</span> par m² et par an, sur {resultat.dvf.n} ventes à {resultat.dvf.rayon}, au taux de rendement de la grille. Une déduction, pas un bail.
            </Phrase>
          )}
          <Note className="mt-3">Loyer au m² de la rue, du quartier et de la ville, constaté chez Equimmox à 200 m, 500 m et 1 km. En euros HT hors charges, par m² et par an.</Note>
        </>
      )}
    </Section>
  );
}
