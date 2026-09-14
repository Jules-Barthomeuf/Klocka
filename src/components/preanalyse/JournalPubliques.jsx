import React from "react";
import { ExternalLink } from "lucide-react";
import { Section, Chiffres, Lignes, Note, Vide, LienSource, Etiquette, fmt, jour, TEINTE } from "@/components/preanalyse/marche-ui";

// Les deux sources publiques du marché : DVF et le BODACC. Elles ne coûtent
// rien et ne doivent rien au vendeur ; ce sont les seules à dire ce qui s'est
// payé et ce qui a fermé, quand les autres parlent de demandes.

/**
 * Le second point de vue sur le prix, montré dans le bilan.
 *
 * Il ne se cache pas dans un onglet : c'est le seul chiffre de la page qui ne
 * dépende ni du vendeur ni d'une estimation, et il vaut d'être lu avant
 * d'accepter une valorisation calculée au taux de l'annonce.
 */
export function SecondPointDeVue({ comparaison, ecart }) {
  if (!comparaison) return null;
  return (
    <div className="rounded-[14px] border border-white/[0.08] px-[22px] py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="alx-mont text-[9.5px] font-medium uppercase tracking-[.14em] text-[#96c0b8]">Ce qui s'est vendu autour · DVF</span>
        <span className="text-[14px] font-medium tabular-nums text-[#F3F7F5]">
          {fmt(comparaison.prix_m2)} €/m² · {comparaison.n} vente{comparaison.n > 1 ? "s" : ""} dans {fmt(comparaison.rayon)} m
          {comparaison.periode ? ` · ${String(comparaison.periode.du).slice(0, 4)}–${String(comparaison.periode.au).slice(0, 4)}` : ""}
        </span>
      </div>
      <p className="m-0 mt-3.5 text-[14px] leading-[1.65] text-[#C3CBC7]" style={{ textWrap: "pretty" }}>
        Par comparaison, le bien vaudrait <span className="text-[#F3F7F5]">{fmt(comparaison.valeur)} €</span> ({fmt(comparaison.surface, 1)} m² bâtis × {fmt(comparaison.prix_m2)} €/m²)
        {ecart != null && (
          <>
            , le prix demandé est donc <span className="text-[#F3F7F5]">{fmt(Math.abs(ecart))} € {ecart > 0 ? "au-dessus" : "en dessous"}</span> de cette valeur
            {comparaison.demande_m2 ? `, et revient à ${fmt(comparaison.demande_m2)} €/m² bâtis` : ""}
          </>
        )}
        .
      </p>
      <p className="m-0 mt-2.5 text-[12.5px] leading-[1.6] text-[#8B938F]">Aucun chiffre du vendeur n'entre dans ce calcul : ce sont des actes notariés, pas des annonces.</p>
    </div>
  );
}

/** DVF : les ventes retenues, une par une. */
export function OngletDvf({ ventes }) {
  if (!ventes) return <Section premiere titre="Ventes autour · DVF"><Vide>DVF n'a pas encore été consulté sur ce lot. Lancez « Mettre à jour ».</Vide></Section>;
  const { prix_m2: prix, n, n_minimum: seuil, rayon, periode, annees = [], ecartees = {}, ventes: liste = [] } = ventes;
  return (
    <Section premiere titre="Ventes autour · DVF" aside={<LienSource href={ventes.lien}>Voir sur la carte DVF</LienSource>}>
      <Chiffres
        className="mt-4"
        items={[
          { libelle: "Prix médian", valeur: prix ? `${fmt(prix.median)} €/m²` : "—", teinte: prix ? TEINTE.menthe : TEINTE.muet, note: prix ? `fourchette ${fmt(prix.bas)} – ${fmt(prix.haut)} €/m²` : `moins de ${seuil} ventes : aucune médiane` },
          { libelle: "Ventes retenues", valeur: fmt(n), teinte: TEINTE.texte, note: `locaux commerciaux, rayon ${fmt(rayon)} m` },
          { libelle: "Période", valeur: periode ? `${jour(periode.du)} → ${jour(periode.au)}` : "—", teinte: TEINTE.texte, note: annees.length ? `millésimes ${annees.join(", ")}` : null },
          { libelle: "Écartées", valeur: fmt((ecartees.mixtes || 0) + (ecartees.symboliques || 0) + (ecartees.sans_surface || 0)), teinte: TEINTE.texte, note: `${fmt(ecartees.mixtes)} acte(s) mixte(s), ${fmt(ecartees.symboliques)} à l'euro symbolique` },
        ]}
      />
      {liste.length > 0 ? (
        <div className="mt-7">
          <Etiquette>Les ventes, de la plus proche à la plus lointaine</Etiquette>
          <Lignes
            className="mt-2"
            items={liste}
            cle={(v) => v.id}
            rendu={(v) => (
              <>
                <span className="w-[56px] flex-shrink-0 text-right text-[12px] tabular-nums text-[#8B938F]">{fmt(v.distance_m)} m</span>
                <span className="w-[66px] flex-shrink-0 text-[12px] tabular-nums text-[#8B938F]">{jour(v.date)}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#C3CBC7]">{v.adresse || "adresse non publiée"}</span>
                <span className="w-[64px] flex-shrink-0 text-right text-[12px] tabular-nums text-[#8B938F]">{fmt(v.surface)} m²</span>
                <span className="w-[96px] flex-shrink-0 text-right text-[13.5px] tabular-nums text-[#E8EFEB]">{fmt(v.prix)} €</span>
                <span className="w-[92px] flex-shrink-0 text-right text-[13.5px] font-medium tabular-nums" style={{ color: TEINTE.menthe }}>{fmt(v.prix_m2)} €/m²</span>
              </>
            )}
          />
        </div>
      ) : (
        <Vide>Aucune vente de local commercial dans {fmt(rayon)} m sur les millésimes disponibles.</Vide>
      )}
      <Note className="mt-5">
        Source : demandes de valeurs foncières (DGFiP), publiées par Etalab. Ne sont retenues que les ventes dont tous les locaux sont commerciaux : un acte qui mélange une boutique et un appartement ne permet d'attribuer son prix à aucun des deux. DVF ne couvre ni l'Alsace-Moselle ni Mayotte.
      </Note>
    </Section>
  );
}

/** BODACC : ce qui ouvre, se vend et ferme dans la rue. */
export function OngletBodacc({ vitalite }) {
  if (!vitalite) return <Section premiere titre="Vie de la rue · BODACC"><Vide>Le BODACC n'a pas encore été consulté sur ce lot. Lancez « Mettre à jour ».</Vide></Section>;
  const { rue, mois, sur_la_rue: sur = {}, commune_entiere: commune, cessions_avec_prix: cessions = [] } = vitalite;
  const solde = (sur.creations || 0) - (sur.fermetures || 0);
  return (
    <Section premiere titre="Vie de la rue · BODACC" aside={<span className="text-[12px] text-[#8B938F]">{rue || "la rue"} · {mois} mois</span>}>
      <Chiffres
        className="mt-4"
        items={[
          { libelle: "Créations", valeur: fmt(sur.creations), teinte: TEINTE.menthe, note: `sur ${rue || "la rue"}, ${mois} mois` },
          { libelle: "Fermetures", valeur: fmt(sur.fermetures), teinte: sur.fermetures > sur.creations ? TEINTE.ambre : TEINTE.texte, note: "radiations et liquidations" },
          { libelle: "Solde", valeur: `${solde > 0 ? "+" : ""}${fmt(solde)}`, teinte: solde >= 0 ? TEINTE.menthe : TEINTE.ambre, note: solde >= 0 ? "la rue gagne des commerces" : "la rue en perd" },
          { libelle: "Procédures collectives", valeur: fmt(sur.procedures), teinte: TEINTE.texte, note: "redressements et liquidations ouverts" },
        ]}
      />
      {commune && (
        <Note className="mt-4">
          Pour comparer, la commune entière sur la même période : {fmt(commune.creations)} créations, {fmt(commune.radiations)} radiations, {fmt(commune.procedures)} procédures collectives, {fmt(commune.cessions)} cessions.
        </Note>
      )}
      {cessions.length > 0 && (
        <div className="mt-7">
          <Etiquette>Cessions de fonds, prix publié</Etiquette>
          <Lignes
            className="mt-2"
            items={cessions}
            cle={(c, i) => `${c.date}-${i}`}
            rendu={(c) => (
              <>
                <span className="w-[66px] flex-shrink-0 text-[12px] tabular-nums text-[#8B938F]">{jour(c.date)}</span>
                <span className="w-[64px] flex-shrink-0 truncate whitespace-nowrap text-[12px] text-[#8B938F]" title={c.numero || ""}>n° {c.numero || "?"}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#C3CBC7]">{c.activite || c.commercant || "—"}</span>
                <span className="flex-shrink-0 text-[13.5px] font-medium tabular-nums" style={{ color: TEINTE.menthe }}>{fmt(c.prix)} €</span>
              </>
            )}
          />
        </div>
      )}
      {sur.evenements?.length > 0 && (
        <div className="mt-7">
          <Etiquette>Le détail, du plus récent au plus ancien</Etiquette>
          <Lignes
            className="mt-2"
            items={sur.evenements}
            cle={(e, i) => `${e.date}-${i}`}
            rendu={(e) => {
              const teinte = e.ferme ? TEINTE.ambre : e.famille === "creation" ? TEINTE.menthe : TEINTE.muet;
              return (
                <>
                  <span className="w-[66px] flex-shrink-0 text-[12px] tabular-nums text-[#8B938F]">{jour(e.date)}</span>
                  <span className="alx-mont w-[80px] flex-shrink-0 text-[9px] font-medium uppercase tracking-[.1em]" style={{ color: teinte }}>{e.famille === "collective" ? "procédure" : e.famille}</span>
                  <span className="w-[64px] flex-shrink-0 truncate whitespace-nowrap text-[12px] text-[#8B938F]" title={e.numero || ""}>n° {e.numero || "?"}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-[#C3CBC7]" title={e.activite || ""}>
                    {e.commercant || "—"}
                    {e.nature ? <span className="text-[#8B938F]"> · {e.nature}</span> : null}
                  </span>
                  {e.lien && <a href={e.lien} target="_blank" rel="noreferrer" className="flex-shrink-0 text-[#8B938F] hover:text-[#96c0b8]"><ExternalLink className="h-3 w-3" /></a>}
                </>
              );
            }}
          />
        </div>
      )}
      <Note className="mt-5">
        Source : Bulletin officiel des annonces civiles et commerciales, publication légale des greffes. Un redressement n'est pas compté comme une fermeture : l'entreprise tente de continuer. Le BODACC dit qu'un commerce a fermé, il ne dit jamais si le local est resté vide.
      </Note>
    </Section>
  );
}
