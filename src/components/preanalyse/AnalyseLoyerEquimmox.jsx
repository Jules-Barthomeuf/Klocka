import React from "react";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";
import { Section, Chiffres, Phrase, Note, Vide, euros, TEINTE } from "@/components/ui/kit";

// L'analyse de loyer d'Equimmox : les loyers observés autour d'une adresse,
// dans un rayon de 500 m, pour des locaux de surface comparable (±30 %).
// Bas, moyenne, haut, et le loyer du bail posé en face. Une recherche prend
// une bonne minute : Klocka pilote leur site comme une personne le ferait.

function verdict(loyerM2, r) {
  if (loyerM2 == null || !r || (r.bas == null && r.haut == null)) return null;
  if (r.bas != null && loyerM2 < r.bas) return { mot: "sous les loyers observés", teinte: TEINTE.menthe, detail: "prudent face aux comparables" };
  if (r.haut != null && loyerM2 > r.haut) return { mot: "au-dessus des loyers observés", teinte: TEINTE.rouge, detail: "à vérifier avant de retenir le rendement" };
  return { mot: "dans les loyers observés", teinte: TEINTE.ambre, detail: "cohérent avec les comparables" };
}

export default function AnalyseLoyerEquimmox({ lot, premiere = true }) {
  const resultat = lot?.analyse_loyer || null;
  const loyer = lot?.lot?.loyer_annuel_ht_hc?.valeur;
  const surfaceLot = lot?.lot?.surface_m2?.valeur;
  const loyerM2 = loyer > 0 && surfaceLot > 0 ? loyer / surfaceLot : null;
  const v = resultat ? verdict(loyerM2, resultat) : null;

  return (
    <Section premiere={premiere} titre="Loyers observés autour · Equimmox">
      {!resultat ? (
        <Vide>Aucune lecture. Relancez l'analyse de marché avec la source Equimmox cochée.</Vide>
      ) : (
        <>
          <Chiffres
            className="mt-4"
            items={[
              { libelle: "Bas", valeur: resultat.bas != null ? `${euros(resultat.bas)} /m²/an` : "—", teinte: TEINTE.texte },
              { libelle: "Moyenne", valeur: resultat.moyenne != null ? `${euros(resultat.moyenne)} /m²/an` : "—" },
              { libelle: "Haut", valeur: resultat.haut != null ? `${euros(resultat.haut)} /m²/an` : "—", teinte: TEINTE.texte },
              { libelle: "Le bail", valeur: loyerM2 != null ? `${euros(loyerM2)} /m²/an` : "—", teinte: v?.teinte || TEINTE.clair, note: v ? v.mot : loyerM2 == null ? "loyer annuel et surface à renseigner sur la fiche" : null },
              { libelle: "Commercialisation", valeur: resultat.delai_jours != null ? `${resultat.delai_jours} jours` : "—", teinte: TEINTE.texte, note: resultat.delai_jours != null ? "délai observé sur les comparables" : null },
            ]}
          />
          <EchelleFourchettes
            lignes={[{ cle: "observes", libelle: "Observés", basse: resultat.bas ?? null, haute: resultat.haut ?? null, pointe: resultat.moyenne ?? null, primaire: true }]}
            repere={loyerM2 != null ? { valeur: loyerM2 } : null}
            legende={[resultat.rayon, resultat.surface_min ? `surfaces ${resultat.surface_min}–${resultat.surface_max} m²` : null].filter(Boolean).join(" · ")}
          />
          {v && (
            <Phrase className="mt-4">
              Le bail, à <span className="tabular-nums text-encre">{euros(loyerM2)} par m² et par an</span>, est <span style={{ color: v.teinte }}>{v.mot}</span> : {v.detail}.
            </Phrase>
          )}
          <Note className="mt-3">Locaux commerciaux à moins de 500 m, de surface comparable à ±30 %, d'après Equimmox. En euros par m² et par an.</Note>
        </>
      )}
    </Section>
  );
}
