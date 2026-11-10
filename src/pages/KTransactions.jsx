import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Search, Play, Loader2, ExternalLink, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { JL } from "@/design/jetons";
import { createPageUrl } from "@/utils";
import CartePoints from "@/components/kdata/CartePoints";
import { MecaniqueEnLigne } from "@/components/kdata/Mecanique";
import {
  BoutonPrincipal, Filtres, Statut, Cases, Ligne, TitrePage,
  CLASSE_CARTE, CLASSE_TABLEAU, CLASSE_TABLE, CLASSE_TH, CLASSE_TD,
} from "@/components/mandataire/elements";

// K-Transactions : ce que les murs et les fonds se sont vraiment vendus.
//
// Deux marchés, deux sources, deux colonnes, et l'écran ne les confond pas.
// Les MURS viennent de DVF : les ventes enregistrées par l'administration
// fiscale, dans un rayon. Les FONDS viennent du BODACC : le prix de cession
// écrit en clair dans l'annonce légale.
//
// Une différence de maille à dire franchement : DVF est localisé au point, le
// BODACC à l'adresse postale. Les comparables de fonds se rapprochent donc par
// nom de rue, pas par distance, et l'écran l'écrit plutôt que d'afficher des
// mètres inventés.
//
// 10 nov. 2026, Jules : planche Outils. La page est une page de Klocka (barre
// latérale, plus de barre K-Data) : lien « Outils » au-dessus d'un titre de
// 24 px, profondeur d'historique en filtres sur la ligne du titre, carte de
// 300 px au rayon 12, chiffres en cases, tableaux à traits verticaux.

const ANNEES = [2, 5, 10];
const OPTIONS_ANNEES = ANNEES.map((x) => [x, `${x} ans`]);
const euros = (n) => (n == null ? "-" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const fr = (n) => String(n).replace(".", ",");

const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const moisAn = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { month: "2-digit", year: "numeric" }) : "");

// Les ventes de murs se posent sur un plan, colorées par leur prix au mètre
// face à la médiane du secteur. Vert, jaune, rouge disent ici « moins cher »,
// « dans la moyenne », « plus cher », et la légende nomme les seuils en euros
// pour qu'aucune couleur ne se devine.
const BANDES = [
  { cle: "bas", couleur: JL.vert, libelle: "sous le premier quartile" },
  { cle: "median", couleur: JL.jaune, libelle: "dans la fourchette courante" },
  { cle: "haut", couleur: JL.alerte, libelle: "au-dessus du troisième quartile" },
];

// La mécanique : dans quel ordre K-Transactions interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée." },
  { source: "DVF, Etalab", quoi: "Les ventes de murs enregistrées par l'administration fiscale, localisées au point : le prix au m²." },
  { source: "OpenStreetMap", quoi: "Le parc de locaux du secteur, pour juger si le nombre de ventes est beaucoup ou pas : un nombre seul ne veut rien dire sans son parc." },
  { source: "BODACC, DILA", quoi: "Les cessions de fonds de commerce, dont le prix est écrit en clair dans l'annonce légale. Sans coordonnées : les comparables se rapprochent par nom de rue." },
];

/** Le lien DVF d'une vente précise, au point. */
const lienDvf = (v) => `https://app.dvf.etalab.gouv.fr/?lat=${v.lat}&lon=${v.lon}&zoom=19`;

/** L'en-tête commun aux deux écrans : le lien vers les Outils, le titre de 24 px, une ligne grise. */
function EnTete({ titre, sousTitre, actions = null }) {
  return (
    <div className="mb-5 flex flex-col gap-1.5">
      <Link to={createPageUrl("KData")} className="w-fit text-[13px] text-ardoise hover:text-encre">← Outils · K-Transactions</Link>
      <TitrePage titre={titre} actions={actions} />
      {sousTitre && <p className="m-0 text-[13.5px] text-ardoise">{sousTitre}</p>}
    </div>
  );
}

/** La ligne grise « Est-ce beaucoup ? » ; le détail et la réserve au survol. */
function EstCeBeaucoup({ phrase, detail }) {
  return <p className="m-0 text-[13px] leading-[1.5] text-ardoise" title={detail}>Est-ce beaucoup ? {phrase}</p>;
}

function Resultat({ r, onRetour, onAnnees, enCours, recherches, onRelancer }) {
  const murs = r.murs;
  const fonds = r.fonds;
  const [choisie, setChoisie] = useState(null);

  // Le serveur ne rend que les quarante ventes les plus proches : la carte en
  // montre donc au plus quarante, même quand le secteur en compte davantage.
  // C'est écrit sous la carte plutôt que laissé à deviner.
  const ventes = useMemo(
    () => (murs?.ventes || []).filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon)),
    [murs],
  );
  const seuils = murs?.prix_m2 || null;
  const bandeDe = (v) => {
    if (!seuils || v.prix_m2 == null) return "median";
    if (v.prix_m2 < seuils.bas) return "bas";
    if (v.prix_m2 > seuils.haut) return "haut";
    return "median";
  };
  const couches = useMemo(() => BANDES.map((b) => ({
    cle: b.cle,
    couleur: b.couleur,
    taille: 14,
    zIndex: b.cle === "haut" ? 30 : 20,
    points: ventes.filter((v) => bandeDe(v) === b.cle),
  })), [ventes, seuils]);

  const rayonMurs = murs?.cercle ? murs.cercle_libelle : `${r.rayon} m`;
  const sousTitre = `Murs vendus ${murs?.cercle ? `dans ${murs.cercle_libelle}` : `à ${r.rayon} m`}, fonds cédés dans la commune, sur ${r.annees} ans. Murs : DVF. Fonds : BODACC.`;
  const fondsListe = fonds ? (fonds.comparables_rue.length ? fonds.comparables_rue : r.cessions) : [];

  // Une ligne du tableau ouvre la vente sur DVF, et la montre sur le plan.
  const ouvrirVente = (v) => {
    setChoisie(v);
    const lien = Number.isFinite(v.lat) && Number.isFinite(v.lon) ? lienDvf(v) : murs?.lien;
    if (lien) window.open(lien, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative min-h-screen px-5 py-[22px] text-encre md:px-8">
      <div className="relative mx-auto max-w-[1500px]">
        <EnTete titre={r.point.label} sousTitre={sousTitre} actions={<>
          {enCours && <Loader2 className="h-4 w-4 animate-spin text-ardoise" aria-label="Analyse en cours" />}
          <Filtres label="Profondeur d'historique" options={OPTIONS_ANNEES} valeur={r.annees} onChange={(x) => { if (!enCours && x !== r.annees) onAnnees(x); }} />
          <BoutonPrincipal onClick={onRetour}>Nouvelle adresse</BoutonPrincipal>
        </>} />

        {/* Le plan des ventes de murs. Les fonds n'y figurent pas : le BODACC ne
            publie aucune coordonnée, seulement une adresse postale, et poser un
            point à partir d'un nom de rue serait une localisation inventée. */}
        {ventes.length > 0 && (
          <div className="mb-6">
            <div className="relative h-[300px] overflow-hidden rounded-[12px] border border-trait">
              <CartePoints point={r.point} rayon_m={r.rayon} couches={couches}
                onPoint={setChoisie} onErreur={(m) => toast.error(m)} />

              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-col gap-0.5 rounded-[10px] border border-trait bg-rail px-2.5 py-2 text-[12px] text-craie">
                <span className="text-ardoise">Prix au m² des murs</span>
                {BANDES.map((b) => (
                  <span key={b.cle} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: b.couleur }} />
                    {b.cle === "bas" && seuils ? `moins de ${euros(seuils.bas)}` : null}
                    {b.cle === "median" && seuils ? `${euros(seuils.bas)} à ${euros(seuils.haut)}` : null}
                    {b.cle === "haut" && seuils ? `plus de ${euros(seuils.haut)}` : null}
                    {!seuils ? b.libelle : null}
                  </span>
                ))}
              </div>

              {choisie && (
                <div className="absolute right-3 top-3 w-[290px] rounded-[12px] border border-trait bg-rail p-3 max-md:left-3 max-md:w-auto">
                  <div className="flex items-start justify-between gap-2">
                    <p className="m-0 text-[12.5px] text-ardoise">Vente enregistrée</p>
                    <button onClick={() => setChoisie(null)} aria-label="Fermer" title="Fermer" style={{ background: "transparent" }} className="text-ardoise hover:text-encre max-md:-m-2 max-md:grid max-md:h-9 max-md:w-9 max-md:place-items-center"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <p className="m-0 mt-1 text-[14px] leading-[1.4] text-encre">{choisie.adresse || choisie.commune || "Adresse non publiée"}</p>
                  <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">
                    {quand(choisie.date)}{choisie.distance_m != null ? ` · à ${choisie.distance_m} m du point` : ""}
                  </p>
                  <Cases className="mt-2" colonnes={2} items={[
                    [euros(choisie.prix), "Prix"],
                    [choisie.surface ? `${choisie.surface} m²` : "-", "Surface"],
                    [choisie.prix_m2 != null ? `${euros(choisie.prix_m2)} / m²` : "-", "Prix au m²"],
                    [choisie.type_local || "Local commercial", "Type"],
                  ]} />
                  <a href={lienDvf(choisie)} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre">
                    <ExternalLink className="h-3.5 w-3.5" />Cette vente sur DVF
                  </a>
                </div>
              )}
            </div>
            <p className="m-0 mt-2 text-[12.5px] text-brume">
              {ventes.length} vente{ventes.length > 1 ? "s" : ""} de murs localisée{ventes.length > 1 ? "s" : ""} sur le plan
              {murs?.n > ventes.length ? `, les plus proches des ${murs.n} du secteur` : ""}. Cliquez un point pour le détail.
              Les cessions de fonds n&apos;y sont pas : le BODACC ne publie pas de coordonnées.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-6">
          {/* Les murs : DVF */}
          <section aria-labelledby="kt-murs" className="flex min-w-0 flex-[1_1_440px] flex-col gap-2.5">
            <h2 id="kt-murs" className="m-0 text-[15px] font-medium text-encre">Les murs</h2>
            {!murs ? (
              <p className="m-0 text-[13.5px] text-ardoise">{r.murs_erreur || "Aucune vente publiée."}</p>
            ) : (
              <>
                <Cases colonnes={3} items={[
                  [murs.prix_m2 ? `${euros(murs.prix_m2.median)}/m²` : "-", "Prix médian"],
                  [String(murs.n), "Ventes"],
                  // Boîte à outils (18 oct. 2026) : la recherche par cercles, du plus serré au plus large, jusqu'à 5 ventes.
                  [murs.cercle ? murs.cercle_libelle.charAt(0).toUpperCase() + murs.cercle_libelle.slice(1) : `${murs.rayon} m`, murs.cercle ? "Cherché dans" : "Rayon"],
                ]} />
                {r.rotation && (
                  <EstCeBeaucoup
                    phrase={<>Un local du quartier change de main tous les {fr(r.rotation.periode_ans)} ans.</>}
                    detail={`${r.rotation.ventes} ventes sur ${r.rotation.annees} millésimes, pour ${r.rotation.locaux} locaux relevés dans le rayon : ${fr(r.rotation.part_annuelle)} % du parc vendu chaque année. Beaucoup de ventes n'est pas bon en soi : un quartier recherché et un quartier dont on sort produisent le même chiffre. C'est le prix au mètre, à côté, qui départage.`} />
                )}

                {/* La liste et le plan montrent les mêmes ventes : une ligne ouvre la vente sur DVF et la montre sur le plan. */}
                <div className={`${CLASSE_TABLEAU} max-h-[400px] overflow-y-auto`}>
                  <table className={`${CLASSE_TABLE} min-w-[560px]`}>
                    <colgroup><col /><col className="w-[90px]" /><col className="w-[80px]" /><col className="w-[80px]" /><col className="w-[110px]" /><col className="w-[100px]" /></colgroup>
                    <thead><tr>
                      <th className={`${CLASSE_TH} !text-encre`}>Les ventes les plus proches</th>
                      <th className={CLASSE_TH}>Date</th><th className={CLASSE_TH}>Surface</th><th className={CLASSE_TH}>Distance</th>
                      <th className={CLASSE_TH}>Prix</th><th className={CLASSE_TH}>€/m²</th>
                    </tr></thead>
                    <tbody>
                      {(murs.ventes || []).slice(0, 25).map((v, i) => (
                        <tr key={i} onClick={() => ouvrirVente(v)} title="Ouvrir la vente sur DVF"
                          className={`cursor-pointer ${choisie === v ? "bg-relief" : "hover:bg-relief"}`}>
                          <td className={CLASSE_TD}>
                            {v.adresse || v.commune || "Vente"}
                            {v.source === "klocka" && <Statut couleur="menthe" className="ml-1.5">Klocka</Statut>}
                          </td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{moisAn(v.date)}</td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{v.surface ? `${v.surface} m²` : "-"}</td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{v.distance_m != null ? `${v.distance_m} m` : "-"}</td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{euros(v.prix)}</td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{v.prix_m2 != null ? euros(v.prix_m2) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Sous le tableau, en petites lignes : la fourchette, la parcelle, la médiane par année. */}
                <div className="flex flex-col gap-1 text-[12.5px] leading-[1.6] text-ardoise">
                  {murs.prix_m2 ? <p className="m-0">Fourchette courante : de {euros(murs.prix_m2.bas)} à {euros(murs.prix_m2.haut)} / m²{murs.annees?.length ? ` · ${murs.annees.join(", ")}` : ""}.</p>
                    : <p className="m-0">Moins de {murs.n_minimum} ventes : pas de prix médian.</p>}
                  {murs.cercle && (murs.essais || []).length > 0 && (
                    <p className="m-0">Cercles essayés : {(murs.essais || []).map((e) => `${e.cercle === "iris" ? "IRIS" : e.cercle} ${e.n}`).join(" · ")}{murs.klocka ? " · dont ventes Klocka" : ""}.</p>
                  )}
                  {murs.cercle && (murs.derniere_vente_parcelle ? (
                    <p className="m-0">
                      Dernière vente de la parcelle : {quand(murs.derniere_vente_parcelle.date)} · {euros(murs.derniere_vente_parcelle.prix)}
                      {murs.derniere_vente_parcelle.types?.length ? ` · ${murs.derniere_vente_parcelle.types.join(", ")}${murs.derniere_vente_parcelle.lots > 1 ? ` · ${murs.derniere_vente_parcelle.lots} lots` : ""}` : ""}.
                    </p>
                  ) : <p className="m-0">Aucune vente de la parcelle dans les {murs.annees?.length || 5} dernières années.</p>)}
                  {murs.cercle && murs.par_annee?.length > 1 && (
                    <p className="m-0">
                      Médiane par année : {murs.par_annee.map((a) => `${a.annee} ${euros(a.median)} (${a.n})`).join(" · ")}.
                      {!murs.actualise && " Prix non actualisés : il n'existe pas d'indice public des prix des murs commerciaux."}
                    </p>
                  )}
                  {murs.cercle && murs.ecartees?.aberrantes > 0 && murs.bornes_commune && (
                    <p className="m-0 text-brume">{murs.ecartees.aberrantes} vente{murs.ecartees.aberrantes > 1 ? "s" : ""} écartée{murs.ecartees.aberrantes > 1 ? "s" : ""}, hors de {euros(murs.bornes_commune.bas)} à {euros(murs.bornes_commune.haut)} / m² (5e au 95e centile de la commune).</p>
                  )}
                  {murs.ventes_rue?.length > 0 && murs.cercle !== "rue" && (
                    <p className="m-0">{murs.ventes_rue.length} vente{murs.ventes_rue.length > 1 ? "s" : ""} dans la rue même.</p>
                  )}
                  {murs.lien && <a href={murs.lien} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1.5 text-ardoise hover:text-encre"><ExternalLink className="h-3.5 w-3.5" />Voir sur DVF</a>}
                </div>
              </>
            )}
          </section>

          {/* Les fonds : BODACC */}
          <section aria-labelledby="kt-fonds" className="flex min-w-0 flex-[1_1_440px] flex-col gap-2.5">
            <h2 id="kt-fonds" className="m-0 text-[15px] font-medium text-encre">Les fonds de commerce</h2>
            {!fonds ? (
              <p className="m-0 text-[13.5px] text-ardoise">{r.fonds_erreur || "Aucune cession publiée."}</p>
            ) : (
              <>
                <Cases colonnes={3} items={[
                  [fonds.prix ? euros(fonds.prix.median) : "-", "Prix médian"],
                  [`${fonds.n_avec_prix} / ${fonds.n}`, "Cessions avec un prix"],
                  [String(fonds.comparables_rue.length), "Sur la rue"],
                ]} />
                {r.tension_rue && (
                  <EstCeBeaucoup
                    phrase={r.tension_rue.n_rue
                      ? <>La rue compte {r.tension_rue.n_rue} cession{r.tension_rue.n_rue > 1 ? "s" : ""} en {r.annees} ans, la rue médiane de la commune {r.tension_rue.mediane_par_rue}.</>
                      : <>Aucune cession publiée sur la rue en {r.annees} ans, {r.tension_rue.mediane_par_rue} pour la rue médiane de la commune.</>}
                    detail={`${r.tension_rue.rues_comptees} rues de la commune ont eu au moins une cession${r.tension_rue.rang != null ? ` · cette rue dépasse ${r.tension_rue.rang} % d'entre elles` : ""}. Le quart le plus actif en compte ${r.tension_rue.haut_par_rue} ou plus. Le BODACC n'ayant pas de coordonnées, une rue ne peut se comparer qu'aux autres rues, pas à une densité. Une rue longue en aura mécaniquement plus qu'une rue courte.`} />
                )}

                <div className={`${CLASSE_TABLEAU} max-h-[400px] overflow-y-auto`}>
                  <table className={`${CLASSE_TABLE} min-w-[520px]`}>
                    <colgroup><col /><col className="w-[34%]" /><col className="w-[90px]" /><col className="w-[110px]" /></colgroup>
                    <thead><tr>
                      <th className={`${CLASSE_TH} !text-encre`}>{fonds.comparables_rue.length ? "Les comparables de la rue" : "Les cessions de la commune"}</th>
                      <th className={CLASSE_TH}>Activité</th><th className={CLASSE_TH}>Date</th><th className={CLASSE_TH}>Prix</th>
                    </tr></thead>
                    <tbody>
                      {fondsListe.slice(0, 25).map((c) => (
                        <tr key={c.id}>
                          <td className={CLASSE_TD} title={[c.adresse, c.vendeur ? `cédé par ${c.vendeur}` : ""].filter(Boolean).join(" · ")}>{c.acquereur || "Acquéreur non nommé"}</td>
                          <td className={CLASSE_TD} title={c.activite || ""}>{c.activite || "-"}</td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{moisAn(c.date)}</td>
                          <td className={`${CLASSE_TD} tabular-nums`}>{c.prix != null ? euros(c.prix) : <span className="text-brume">Non publié</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(fonds.prix || fonds.prix_rue) && (
                  <p className="m-0 text-[12.5px] leading-[1.6] text-ardoise">
                    {fonds.prix ? `Prix publiés de ${euros(fonds.prix.min)} à ${euros(fonds.prix.max)}.` : "Aucun prix publié dans la commune."}
                    {fonds.prix_rue ? ` Prix médian sur la rue : ${euros(fonds.prix_rue)}.` : ""}
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" className="mt-6" />

        <p className="m-0 mt-5 text-[12.5px] leading-[1.6] text-brume">
          Les murs viennent de DVF, les ventes enregistrées par l&apos;administration fiscale, localisées au point.
          Les fonds viennent du BODACC, où le prix de cession est écrit dans l&apos;annonce légale : il est localisé à l&apos;adresse
          postale, jamais au mètre près, et les comparables se rapprochent donc par nom de rue.
          Une annonce de vente sur deux ne porte pas de prix (fusion, apport, cession entre associés) : elle compte dans le total, pas dans la médiane.
          {r.du_cache ? " Cessions reprises du cache." : ""}
        </p>

        <AnalysesRecentes recherches={recherches} onRelancer={onRelancer} className="mt-8" />
      </div>
    </div>
  );
}

function AnalysesRecentes({ recherches, onRelancer, className = "" }) {
  return (
    <section aria-labelledby="kt-recentes" className={className}>
      <h2 id="kt-recentes" className="m-0 mb-1.5 text-[15px] font-medium text-encre">Analyses récentes</h2>
      {!recherches.length ? <p className="m-0 text-[13.5px] text-brume">Aucune pour l&apos;instant.</p> : (
        <div>
          {recherches.map((x) => (
            <Ligne key={x.id} titre={x.adresse} onClick={() => onRelancer(x.adresse)}
              droite={<span className="text-[13px] tabular-nums text-ardoise">{quand(x.le)}{x.par ? ` · ${x.par}` : ""}</span>} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function KTransactions() {
  const user = useUser();
  const qc = useQueryClient();
  const [adresse, setAdresse] = useState("");
  const [annees, setAnnees] = useState(5);
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);

  const { data } = useQuery({ queryKey: ["ktransactions"], queryFn: () => base44.request("GET", "/api/ktransactions"), enabled: user?.role === "admin" });
  const recherches = data?.recherches || [];

  React.useEffect(() => {
    const q = adresse.trim();
    if (q.length < 3 || q === choisie.current) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://data.geopf.fr/geocodage/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  // Une adresse seule (profondeur choisie), ou { texte, annees } quand on change
  // la profondeur depuis le résultat : l'état ne serait pas encore à jour.
  const analyser = useMutation({
    mutationFn: (arg) => {
      const texte = typeof arg === "string" ? arg : arg.texte;
      const n = typeof arg === "string" ? annees : arg.annees;
      return base44.request("POST", "/api/ktransactions", { body: { adresse: texte, annees: n } });
    },
    onSuccess: (r) => { setVue(r); setSuggestions([]); qc.invalidateQueries({ queryKey: ["ktransactions"] }); },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  // Ouverte depuis la file de K-Data : « ?adresse=… » relance l'analyse, dont
  // les sources sont en cache. Le paramètre ne se rejoue pas.
  const { search } = useLocation();
  const vuUrl = useRef("");
  React.useEffect(() => {
    if (vuUrl.current === search) return;
    const a = new URLSearchParams(search).get("adresse");
    if (!a) return;
    vuUrl.current = search;
    choisie.current = a;
    setAdresse(a);
    analyser.mutate(a);
  }, [search]);

  const relancer = (a) => {
    if (analyser.isPending) return;
    choisie.current = a; setAdresse(a); analyser.mutate(a);
  };

  if (!user || user.role !== "admin") return null;
  if (vue) return (
    <Resultat r={vue} onRetour={() => setVue(null)} enCours={analyser.isPending}
      onAnnees={(x) => { setAnnees(x); analyser.mutate({ texte: adresse.trim() || vue.point.label, annees: x }); }}
      recherches={recherches} onRelancer={relancer} />
  );

  return (
    <div className="relative min-h-screen px-5 py-[22px] text-encre md:px-8">
      <div className="relative mx-auto max-w-[1500px]">
        <EnTete titre="K-Transactions"
          sousTitre="Ce que les murs et les fonds se sont vraiment vendus autour d'une adresse : prix au m² des locaux, prix de cession des fonds de commerce, et les comparables de la rue." />

        <div className={`${CLASSE_CARTE} max-w-[760px] p-5 max-md:p-4`}>
          <label htmlFor="kt-adresse" className="mb-1.5 block text-[12.5px] text-ardoise">Adresse</label>
          <div className="relative">
            <div className="flex h-10 items-center gap-2 rounded-[10px] border border-trait bg-relief px-3 focus-within:border-bord-doux">
              <Search className="h-4 w-4 flex-shrink-0 text-brume" />
              <input id="kt-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="49 rue Dabray, 06000 Nice"
                onKeyDown={(e) => { if (e.key === "Enter" && adresse.trim().length >= 5) analyser.mutate(adresse); }}
                className="h-full w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            </div>
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-[44px] z-20 m-0 list-none overflow-hidden rounded-[14px] border border-trait bg-surface-pleine p-1 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
                {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} style={{ background: "transparent" }} className="block w-full rounded-[10px] px-3 py-2 text-left text-[13.5px] text-craie hover:!bg-relief hover:text-encre">{s}</button></li>)}
              </ul>
            )}
          </div>

          <p className="mb-1.5 mt-4 text-[12.5px] text-ardoise">Profondeur d&apos;historique</p>
          <Filtres label="Profondeur d'historique" options={OPTIONS_ANNEES} valeur={annees} onChange={setAnnees} />

          <p className="mb-0 mt-4 text-[12.5px] leading-[1.6] text-brume">
            Les murs viennent de DVF, les fonds du BODACC. Sources ouvertes, aucun crédit dépensé.
          </p>
          <BoutonPrincipal className="mt-4" onClick={() => analyser.mutate(adresse)} disabled={analyser.isPending || adresse.trim().length < 5}>
            {analyser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Analyser le marché
          </BoutonPrincipal>
        </div>

        <AnalysesRecentes recherches={recherches} onRelancer={relancer} className="mt-8 max-w-[760px]" />
      </div>
    </div>
  );
}
