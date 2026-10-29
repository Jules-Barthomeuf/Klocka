import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Les sources de l'avis (27 oct. 2026, Jules : « remplace Rapport par un onglet Sources ») : tout ce sur quoi repose la
// valeur, recopié au même endroit. Ce que le mandataire a dit (visite, bail), l'estimation d'Equimmox (méthodes,
// coefficients, comparables retenus et leur raison, capitalisation, environnement), les ventes DVF autour, les loyers
// de marché, le taux et la commune ; chaque partie dit d'où elle vient. Lu sur l'estimation, même requête que l'aperçu.

const euros = (v) => (v == null ? "–" : `${Math.round(v).toLocaleString("fr-FR")} €`);
const m2 = (v) => (v == null ? "–" : `${Math.round(v).toLocaleString("fr-FR")} €/m²`);
const pct = (v) => (v == null ? "–" : `${String(Math.round(v * 100) / 100).replace(".", ",")} %`);
const NOMS = { offres_actuelles: "Offres actuelles", offres_anciennes: "Offres anciennes", transactions: "Transactions DVF" };
const DITS = [
  ["adresse", "Adresse"], ["demandeur", "Propriétaire des murs"], ["surface_utile", "Surface utile", (v) => `${v} m²`], ["etat", "État"],
  ["date_visite", "Visite"], ["occupe", "Occupé", (v) => (v ? "oui" : "non")], ["locataire", "Locataire"], ["activite_locataire", "Activité"],
  ["bail_type", "Bail"], ["date_effet", "Prise d'effet"], ["echeance", "Échéance"], ["loyer_annuel_hc", "Loyer annuel HT HC", (v) => euros(Number(v))],
  ["indexation", "Indexation"], ["taxe_fonciere", "Taxe foncière"], ["charges", "Charges"], ["emplacement", "Emplacement"], ["facade", "Façade"],
];

const Bloc = ({ titre, source, children }) => (
  <section className="border-t border-trait py-6">
    <h3 className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">{titre}</h3>
    {source && <p className="m-0 mt-1 text-[12.5px] text-ardoise">Source : {source}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const Tuile = ({ mot, valeur, sous = null, accent = false }) => (
  // Au téléphone, une ligne : le mot à gauche, la valeur à droite.
  <div className="rounded-[14px] border border-bord-doux bg-rail px-4 py-3 max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:py-2.5">
    <p className="m-0 text-[12.5px] text-ardoise">{mot}{sous && <span className="block md:hidden">{sous}</span>}</p>
    <p className={`m-0 mt-1 text-[20px] tabular-nums max-md:mt-0 max-md:text-right max-md:text-[16px] ${accent ? "text-pervenche" : ""}`}>{valeur}</p>
    {sous && <p className="m-0 text-[12.5px] text-ardoise max-md:hidden">{sous}</p>}
  </div>
);

const Lignes = ({ lignes }) => (
  <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
    {lignes.map(([mot, v]) => (
      <React.Fragment key={mot}><dt className="text-ardoise">{mot}</dt><dd className="m-0 text-right tabular-nums">{v}</dd></React.Fragment>
    ))}
  </dl>
);

export default function SourcesAvis({ id }) {
  const { data, isLoading } = useQuery({
    queryKey: ["m-apercu", id],
    queryFn: () => base44.request("GET", `/api/mandataire/estimations/${id}/apercu`),
    enabled: !!id,
  });
  if (isLoading) return <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-menthe" /></div>;
  const e = data?.estimation || {};
  const avis = data?.provisoire ? null : data?.avis;
  const q = e.questionnaire || {};
  const eq = e.equimmox?.rapport ? e.equimmox : null;
  const r = eq?.rapport || null;
  const c = avis?.chiffres || {};
  const marche = avis?.marche || {};
  const meth = avis?.methodes || {};
  const ville = avis?.ville || e.ville_chiffres || null;
  const dits = DITS.filter(([k]) => q[k] != null && q[k] !== "").map(([k, mot, f]) => [mot, f ? f(q[k]) : String(q[k])]);
  if (!avis && !dits.length) {
    return (
      <p className="m-0 grid h-full place-items-center px-10 text-center text-[14px] leading-[1.6] text-ardoise">
        Pas encore de sources. Elles se remplissent quand Haka rédige l'avis : ce que vous avez dit de la visite et du bail, l'estimation d'Equimmox et ses comparables, les ventes DVF, les loyers de marché et la commune.
      </p>
    );
  }
  const poids = (r?.methodes || []).reduce((t, x) => t + (x.coefficient || 0), 0);
  const p = eq?.params || {};
  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-[820px] px-5 pb-16 pt-6 text-encre md:px-8 md:pr-20 md:pt-8">
        <p className="m-0 text-[12px] uppercase tracking-[.16em] text-pervenche">Les sources de l'avis</p>
        <h2 className="m-0 mt-2 text-[22px] font-normal leading-[1.25]">{p.adresse || e.adresse || e.bien}</h2>
        {eq && (
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">
            {[p.classe, p.surface ? `${p.surface} m²` : null, p.etat, p.occupe ? "occupé" : "libre", `estimé le ${new Date(eq.le).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`].filter(Boolean).join(" · ")}
          </p>
        )}

        {avis && (
          <div className="mt-6 grid gap-2 sm:grid-cols-3 sm:gap-3">
            {r ? <Tuile mot="Valeur Equimmox" valeur={euros(r.valeur)} sous={r.valeur_m2 ? m2(r.valeur_m2) : null} /> : <Tuile mot="Méthode" valeur="Data-B" sous="Equimmox n'a pas répondu" />}
            <Tuile mot="Fourchette" valeur={c.bas ? `${euros(c.bas)} – ${euros(c.haut)}` : "–"} />
            <Tuile mot="Retenue dans l'avis" valeur={euros(c.valeur)} sous="arrondie au millier" accent />
          </div>
        )}

        {dits.length > 0 && <Bloc titre="Ce que vous avez dit" source="la visite, le bail et vos réponses à Haka"><Lignes lignes={dits} /></Bloc>}

        {r && (
          <Bloc titre="Méthodes et pondération" source={`${eq.source || "Equimmox"}, estimation multicritères`}>
            <table className="w-full border-collapse text-[13.5px]">
              <thead><tr className="text-left text-ardoise"><th className="pb-2 font-normal">Méthode</th><th className="pb-2 font-normal max-md:hidden">Détail</th><th className="pb-2 text-right font-normal">Valeur</th><th className="pb-2 text-right font-normal">Coef.</th></tr></thead>
              <tbody>
                {(r.methodes || []).map((x) => (
                  <tr key={x.cle} className="border-t border-trait">
                    <td className="py-2.5 pr-3">{x.nom}</td>
                    <td className="py-2.5 pr-3 text-ardoise max-md:hidden">{x.taux ? `taux ${String(x.taux).replace(".", ",")} %` : x.bas_m2 ? `${m2(x.bas_m2)} à ${m2(x.haut_m2)}, moyenne ${m2(x.moyenne_m2)}` : "–"}</td>
                    <td className="py-2.5 text-right tabular-nums">{euros(x.valeur)}</td>
                    <td className="py-2.5 text-right tabular-nums">× {x.coefficient}</td>
                  </tr>
                ))}
                <tr className="border-t border-bord-doux">
                  <td className="py-2.5 pr-3">Moyenne pondérée (÷ {poids})</td>
                  <td className="max-md:hidden" />
                  <td className="py-2.5 text-right tabular-nums text-pervenche">{euros(r.valeur)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Bloc>
        )}

        {Object.entries(eq?.comparables || {}).map(([cle, x]) => (
          <Bloc key={cle} titre={`${NOMS[cle] || cle} · ${x.retenus.length} retenu${x.retenus.length > 1 ? "s" : ""} sur ${x.proposes}`} source="Equimmox ; choisis par Klocka (les plus proches, à moins de 40 % de la médiane au m²)">
            <table className="w-full border-collapse text-[13.5px]">
              <tbody>
                {x.retenus.map((y, i) => (
                  <tr key={i} className="border-t border-trait first:border-t-0">
                    <td className="py-2.5 pr-3">{y.adresse || "–"}<span className="block text-[12.5px] text-ardoise">{y.raison}</span></td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">{y.surface ? `${y.surface} m²` : "–"}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums max-md:hidden">{euros(y.prix)}</td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-ardoise">{m2(y.prix_m2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloc>
        ))}

        {r?.capitalisation && (
          <Bloc titre="Capitalisation des revenus" source={meth.source_taux || "Equimmox, taux moyen du secteur"}>
            <Lignes lignes={[
              ["Loyer annuel", euros(r.capitalisation.loyer)],
              ["Taux de capitalisation moyen du secteur", pct(r.capitalisation.taux)],
              ["Valeur brute", euros(r.capitalisation.brute)],
              ["Investissement à prévoir", euros(r.capitalisation.investissement || 0)],
              ["Valeur nette", euros(r.capitalisation.nette)],
            ]} />
          </Bloc>
        )}

        {!r && meth.taux != null && (
          <Bloc titre="Le taux de capitalisation" source={meth.source_taux}>
            <Lignes lignes={[["Taux retenu", pct(meth.taux)], ...(meth.loyer ? [["Loyer", euros(meth.loyer)]] : [])]} />
            {meth.justification_taux && <p className="m-0 mt-3 text-[13.5px] leading-[1.55] text-craie">{meth.justification_taux}</p>}
          </Bloc>
        )}

        {(marche.references || []).length > 0 && (
          <Bloc titre={`Ventes autour · ${marche.references.length}`} source={marche.source?.replace(/^Sources : /, "") || "DVF"}>
            <table className="w-full border-collapse text-[13.5px]">
              <tbody>
                {marche.references.map((y, i) => (
                  <tr key={i} className="border-t border-trait first:border-t-0">
                    <td className="py-2.5 pr-3">{y.adresse || y.bien || "–"}<span className="block text-[12.5px] text-ardoise">{[y.bien, y.date].filter(Boolean).join(" · ")}</span></td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">{y.surface ? `${y.surface} m²` : "–"}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums max-md:hidden">{euros(y.prix)}</td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-ardoise">{m2(y.prix_m2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloc>
        )}

        {marche.loyers && (marche.loyers.basse || marche.loyers.haute) && (
          <Bloc titre="Loyers de marché" source={marche.loyers.source}>
            <Lignes lignes={[["Fourchette", `${marche.loyers.basse ?? "–"} à ${marche.loyers.haute ?? "–"} €/m²/an`], ...(q.loyer_annuel_hc && q.surface_utile ? [["Le loyer du bail", `${Math.round(Number(q.loyer_annuel_hc) / Number(q.surface_utile))} €/m²/an`]] : [])]} />
          </Bloc>
        )}

        {ville && (
          <Bloc titre={`La commune${ville.commune ? ` · ${ville.commune}` : ""}`}>
            <dl className="m-0 grid gap-y-2.5 text-[13.5px]">
              {[["Habitants", ville.population, (v) => Math.round(v).toLocaleString("fr-FR")], ["Niveau de vie médian", ville.revenu, (v) => `${euros(v)} par an`], ["Chômage (zone d'emploi)", ville.chomage, pct], ["Prix médian du logement", ville.logement, m2]]
                .filter(([, x]) => x?.valeur != null)
                .map(([mot, x, f]) => (
                  <div key={mot} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4">
                    <dt className="text-ardoise">{mot}<span className="block text-[12px] text-brume">{x.source}</span></dt>
                    <dd className="m-0 text-right tabular-nums">{f(x.valeur)}</dd>
                  </div>
                ))}
            </dl>
          </Bloc>
        )}

        {!!r?.environnement?.length && (
          <Bloc titre="Environnement" source="Equimmox">
            <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px] leading-[1.5]">
              {r.environnement.map((l, i) => <li key={i} className={/^\p{Extended_Pictographic}/u.test(l) ? "pt-2 text-encre" : "text-craie"}>{l}</li>)}
            </ul>
          </Bloc>
        )}
      </article>
    </div>
  );
}
