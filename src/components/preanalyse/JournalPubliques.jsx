import React from "react";
import { ExternalLink, TrendingDown, TrendingUp } from "lucide-react";
import { ton } from "@/components/preanalyse/journal-tons";

// DVF et BODACC : les deux sources publiques, chacune chez elle.
//
// Elles ont en commun de ne rien coûter et de ne rien devoir au vendeur. L'une
// dit ce qui s'est payé, l'autre ce qui ouvre et ce qui ferme. Ni l'une ni
// l'autre ne remplace une source payante : elles les contredisent, ce qui est
// plus utile.

const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
const jour = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "");

function Vide({ children }) {
  return <p className="m-0 rounded-[10px] border border-dashed border-bord-doux px-4 py-5 text-center text-[12.5px] text-brume">{children}</p>;
}

function Chiffre({ libelle, valeur, note, couleur = "#f2f3f5" }) {
  return (
    <div className="rounded-[12px] bg-[#15181c] border border-[#23272d] px-4 py-3">
      <span className="block font-pill text-[9.5px] font-semibold uppercase tracking-[.08em] text-brume">{libelle}</span>
      <span className="block mt-1.5 text-[19px] leading-tight font-medium" style={{ color: couleur }}>{valeur}</span>
      {note && <span className="block mt-1.5 text-[11.5px] leading-5 text-brume">{note}</span>}
    </div>
  );
}

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
        <span className="alx-mont text-[14px] tabular-nums text-[#F3F7F5]">
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
  if (!ventes) return <Vide>DVF n’a pas encore été consulté sur ce lot. Lancez « Mettre à jour ».</Vide>;
  const { prix_m2: prix, n, n_minimum: seuil, rayon, periode, annees = [], ecartees = {}, ventes: liste = [] } = ventes;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Chiffre libelle="Prix médian" valeur={prix ? `${fmt(prix.median)} €/m²` : "—"} note={prix ? `fourchette ${fmt(prix.bas)} – ${fmt(prix.haut)} €/m²` : `moins de ${seuil} ventes : aucune médiane`} couleur={prix ? "#b8dcc8" : "#6a7180"} />
        <Chiffre libelle="Ventes retenues" valeur={fmt(n)} note={`locaux commerciaux, rayon ${fmt(rayon)} m`} />
        <Chiffre libelle="Période" valeur={periode ? `${jour(periode.du)} → ${jour(periode.au)}` : "—"} note={annees.length ? `millésimes ${annees.join(", ")}` : null} />
        <Chiffre libelle="Écartées" valeur={fmt((ecartees.mixtes || 0) + (ecartees.symboliques || 0) + (ecartees.sans_surface || 0))} note={`${fmt(ecartees.mixtes)} acte(s) mixte(s), ${fmt(ecartees.symboliques)} à l’euro symbolique`} />
      </div>

      {liste.length > 0 ? (
        <section>
          <h4 className="m-0 mb-1 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
            Les ventes, de la plus proche à la plus lointaine
          </h4>
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
            {liste.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="flex-shrink-0 font-mono text-[10.5px] text-[#4e545e] tabular-nums w-[52px] text-right">{fmt(v.distance_m)} m</span>
                <span className="flex-shrink-0 font-mono text-[10.5px] text-brume tabular-nums w-[62px]">{jour(v.date)}</span>
                <span className="min-w-0 flex-1 text-[12.5px] text-[#c6ccd3] truncate">{v.adresse || "adresse non publiée"}</span>
                <span className="flex-shrink-0 text-[11.5px] text-brume w-[64px] text-right">{fmt(v.surface)} m²</span>
                <span className="flex-shrink-0 text-[12.5px] text-[#dfe3e8] w-[92px] text-right">{fmt(v.prix)} €</span>
                <span className="flex-shrink-0 text-[12.5px] font-medium text-menthe w-[88px] text-right">{fmt(v.prix_m2)} €/m²</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Vide>Aucune vente de local commercial dans {fmt(rayon)} m sur les millésimes disponibles.</Vide>
      )}

      <p className="m-0 text-[11px] leading-5 text-brume">
        Source : demandes de valeurs foncières (DGFiP), publiées par Etalab. Ne sont retenues que les ventes dont tous
        les locaux sont commerciaux — un acte qui mélange une boutique et un appartement ne permet d’attribuer son prix
        à aucun des deux. DVF ne couvre ni l’Alsace-Moselle ni Mayotte.
        {ventes.lien && (
          <>
            {" "}
            <a href={ventes.lien} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-menthe hover:underline">
              Voir sur la carte DVF <ExternalLink className="w-3 h-3" />
            </a>
          </>
        )}
      </p>
    </div>
  );
}

/** BODACC : ce qui ouvre, se vend et ferme dans la rue. */
export function OngletBodacc({ vitalite }) {
  if (!vitalite) return <Vide>Le BODACC n’a pas encore été consulté sur ce lot. Lancez « Mettre à jour ».</Vide>;
  const { rue, mois, sur_la_rue: sur = {}, commune_entiere: commune, cessions_avec_prix: cessions = [] } = vitalite;
  const solde = (sur.creations || 0) - (sur.fermetures || 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Chiffre libelle="Créations" valeur={fmt(sur.creations)} note={`sur ${rue || "la rue"}, ${mois} mois`} couleur="#b8dcc8" />
        <Chiffre libelle="Fermetures" valeur={fmt(sur.fermetures)} note="radiations et liquidations" couleur={sur.fermetures > sur.creations ? "#e0a05f" : "#f2f3f5"} />
        <Chiffre libelle="Solde" valeur={`${solde > 0 ? "+" : ""}${fmt(solde)}`} note={solde >= 0 ? "la rue gagne des commerces" : "la rue en perd"} couleur={solde >= 0 ? "#b8dcc8" : "#e0a05f"} />
        <Chiffre libelle="Procédures collectives" valeur={fmt(sur.procedures)} note="redressements et liquidations ouverts" />
      </div>

      {commune && (
        <p className="m-0 text-[11.5px] leading-5 text-ardoise">
          Pour comparer, la commune entière sur la même période : {fmt(commune.creations)} créations,{" "}
          {fmt(commune.radiations)} radiations, {fmt(commune.procedures)} procédures collectives, {fmt(commune.cessions)} cessions.
        </p>
      )}

      {cessions.length > 0 && (
        <section>
          <h4 className="m-0 mb-1 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
            Cessions de fonds, prix publié
          </h4>
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
            {cessions.map((c, i) => (
              <li key={`${c.date}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="flex-shrink-0 font-mono text-[10.5px] text-brume tabular-nums w-[62px]">{jour(c.date)}</span>
                <span className="flex-shrink-0 text-[12px] text-ardoise w-[64px] whitespace-nowrap truncate" title={c.numero || ""}>n° {c.numero || "?"}</span>
                <span className="min-w-0 flex-1 text-[12.5px] text-[#c6ccd3] truncate">{c.activite || c.commercant || "—"}</span>
                <span className="flex-shrink-0 text-[12.5px] font-medium text-menthe">{fmt(c.prix)} €</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sur.evenements?.length > 0 && (
        <section>
          <h4 className="m-0 mb-1 font-pill text-[9.5px] font-semibold uppercase tracking-[.1em] text-[#4e545e]">
            Le détail, du plus récent au plus ancien
          </h4>
          <ul className="m-0 p-0 list-none flex flex-col divide-y divide-[#1a1d22] border-y border-[#1a1d22]">
            {sur.evenements.map((e, i) => {
              const c = ton(e.ferme ? "ambre" : e.famille === "creation" ? "menthe" : "gris");
              return (
                <li key={`${e.date}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span className="flex-shrink-0 font-mono text-[10.5px] text-brume tabular-nums w-[62px]">{jour(e.date)}</span>
                  <span className="flex-shrink-0 font-pill text-[9px] font-semibold uppercase tracking-[.06em] w-[72px]" style={{ color: c.etiquette }}>
                    {e.famille === "collective" ? "procédure" : e.famille}
                  </span>
                  <span className="flex-shrink-0 text-[12px] text-ardoise w-[64px] whitespace-nowrap truncate" title={e.numero || ""}>n° {e.numero || "?"}</span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-[#c6ccd3] truncate" title={e.activite || ""}>
                    {e.commercant || "—"}
                    {e.nature ? <span className="text-brume"> · {e.nature}</span> : null}
                  </span>
                  {e.lien && (
                    <a href={e.lien} target="_blank" rel="noreferrer" className="flex-shrink-0 text-[#4e545e] hover:text-menthe">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="m-0 text-[11px] leading-5 text-brume">
        Source : Bulletin officiel des annonces civiles et commerciales, publication légale des greffes. Un redressement
        n’est pas compté comme une fermeture : l’entreprise tente de continuer. Le BODACC dit qu’un commerce a fermé, il
        ne dit jamais si le local est resté vide — aucune source publique ne donne un taux de vacance à l’échelle d’une rue.
      </p>
    </div>
  );
}
