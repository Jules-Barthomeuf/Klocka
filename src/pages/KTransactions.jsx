import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Loader2, Clock, Building2, Store, ExternalLink, MapPin, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { JL } from "@/design/jetons";
import CartePoints from "@/components/kdata/CartePoints";
import { MecaniqueEnLigne } from "@/components/kdata/Mecanique";

// K-Transactions : ce que les murs et les fonds se sont vraiment vendus.
//
// Deux marchés, deux sources, deux colonnes, et l'écran ne les confond pas.
// Les MURS viennent de DVF : les ventes enregistrées par l'administration
// fiscale, dans un rayon. Les FONDS viennent du BODACC : le prix de cession
// écrit en clair dans l'annonce légale.
//
// Une différence de maille à dire franchement : DVF est localisé au point, le
// BODACC à l'adresse postale. Les comparables de fonds se rapprochent donc par
// nom de rue, pas par distance — et l'écran l'écrit plutôt que d'afficher des
// mètres inventés.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const ANNEES = [2, 5, 10];
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const fr = (n) => String(n).replace(".", ",");

// « Est-ce beaucoup ? » est la question qu'un chiffre brut ne résout pas. On y
// répond par une comparaison explicite, jamais par un score : le lecteur voit
// à quoi on compare, et juge lui-même.
function Repere({ titre, phrase, detail, reserve }) {
  return (
    <div className={`${CARTE} mb-3 p-4`}>
      <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">{titre}</p>
      <p className="m-0 mt-1 text-[14.5px] leading-[1.45] text-encre">{phrase}</p>
      <p className="m-0 mt-1.5 text-[11.5px] leading-[1.6] text-ardoise">{detail}</p>
      <p className="m-0 mt-1 text-[11px] leading-[1.6] text-brume">{reserve}</p>
    </div>
  );
}
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

// Les ventes de murs se posent sur un plan, colorées par leur prix au mètre
// face à la médiane du secteur. Vert, jaune, rouge disent ici « moins cher »,
// « dans la moyenne », « plus cher » — et la légende nomme les seuils en euros
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
  { source: "OpenStreetMap", quoi: "Le parc de locaux du secteur, pour juger si le nombre de ventes est beaucoup ou pas — un nombre seul ne veut rien dire sans son parc." },
  { source: "BODACC, DILA", quoi: "Les cessions de fonds de commerce, dont le prix est écrit en clair dans l'annonce légale. Sans coordonnées : les comparables se rapprochent par nom de rue." },
];

/** Le lien DVF d'une vente précise, au point. */
const lienDvf = (v) => `https://app.dvf.etalab.gouv.fr/?lat=${v.lat}&lon=${v.lon}&zoom=19`;

function Chiffre({ titre, valeur, detail }) {
  return (
    <div className={`${CARTE} p-4`}>
      <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{titre}</p>
      <p className="m-0 mt-0.5 text-[20px] font-semibold tabular-nums text-encre">{valeur}</p>
      {detail && <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-ardoise">{detail}</p>}
    </div>
  );
}

function Resultat({ r, onRetour }) {
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

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-8">
      <button onClick={onRetour} className="mb-3 text-[12.5px] text-ardoise hover:text-encre">Toutes les analyses</button>
      <h1 className="m-0 text-[24px] font-light tracking-[-0.01em] text-encre">{r.point.label}</h1>
      <p className="m-0 mt-1 mb-6 text-[12.5px] text-ardoise">
        murs vendus dans {r.rayon} m · fonds cédés dans la commune sur {r.annees} ans
      </p>

      {/* Le plan des ventes de murs. Les fonds n'y figurent pas : le BODACC ne
          publie aucune coordonnée, seulement une adresse postale, et poser un
          point à partir d'un nom de rue serait une localisation inventée. */}
      {ventes.length > 0 && (
        <div className="mb-5">
          <div className={`${CARTE} relative min-h-[440px] overflow-hidden`}>
            <CartePoints point={r.point} rayon_m={r.rayon} couches={couches}
              onPoint={setChoisie} onErreur={(m) => toast.error(m)} />

            <div className="pointer-events-none absolute bottom-3 left-3 rounded-[10px] border border-bord bg-fond/80 px-3 py-2 text-[11px] backdrop-blur-xl">
              <p className="alx-mont m-0 mb-1 text-[9.5px] uppercase tracking-[.12em] text-brume">Prix au m² des murs</p>
              {BANDES.map((b) => (
                <p key={b.cle} className="m-0 mt-0.5 flex items-center gap-1.5 text-ardoise">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: b.couleur }} />
                  {b.cle === "bas" && seuils ? `moins de ${euros(seuils.bas)}` : null}
                  {b.cle === "median" && seuils ? `${euros(seuils.bas)} à ${euros(seuils.haut)}` : null}
                  {b.cle === "haut" && seuils ? `plus de ${euros(seuils.haut)}` : null}
                  {!seuils ? b.libelle : null}
                </p>
              ))}
            </div>

            {choisie && (
              <div className="absolute right-3 top-3 w-[290px] rounded-[12px] border border-bord bg-fond/85 p-3 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-2">
                  <p className="alx-mont m-0 text-[10px] uppercase tracking-[.12em] text-menthe-texte">Vente enregistrée</p>
                  <button onClick={() => setChoisie(null)} className="text-brume hover:text-encre"><X className="h-3.5 w-3.5" /></button>
                </div>
                <p className="m-0 mt-1 text-[13px] font-medium leading-[1.4] text-encre">{choisie.adresse || choisie.commune || "Adresse non publiée"}</p>
                <p className="m-0 mt-0.5 text-[11.5px] text-ardoise">
                  {quand(choisie.date)}{choisie.distance_m != null ? ` · à ${choisie.distance_m} m du point` : ""}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    ["Prix", euros(choisie.prix)],
                    ["Surface", choisie.surface ? `${choisie.surface} m²` : "—"],
                    ["Prix au m²", choisie.prix_m2 != null ? `${euros(choisie.prix_m2)} / m²` : "—"],
                    ["Type", choisie.type_local || "Local commercial"],
                  ].map(([t, v]) => (
                    <div key={t} className="rounded-[9px] border border-trait bg-relief px-2.5 py-1.5">
                      <p className="m-0 text-[9.5px] uppercase tracking-[.08em] text-brume">{t}</p>
                      <p className="m-0 mt-0.5 text-[12.5px] font-semibold tabular-nums text-encre">{v}</p>
                    </div>
                  ))}
                </div>
                <a href={lienDvf(choisie)} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                  <ExternalLink className="h-3 w-3" />Cette vente sur DVF
                </a>
              </div>
            )}
          </div>
          <p className="m-0 mt-2 text-[11px] text-brume">
            {ventes.length} vente{ventes.length > 1 ? "s" : ""} de murs localisée{ventes.length > 1 ? "s" : ""} sur le plan
            {murs?.n > ventes.length ? `, les plus proches des ${murs.n} du secteur` : ""}. Cliquez un point pour le détail.
            Les cessions de fonds n&apos;y sont pas : le BODACC ne publie pas de coordonnées.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Les murs : DVF */}
        <div>
          <h2 className="m-0 mb-3 flex items-center gap-2 text-[17px] font-medium text-encre"><Building2 className="h-4 w-4 text-menthe" />Les murs</h2>
          {!murs ? (
            <div className={`${CARTE} p-4`}><p className="m-0 text-[12.5px] text-ardoise">{r.murs_erreur || "Aucune vente publiée."}</p></div>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Chiffre titre="Prix médian" valeur={murs.prix_m2 ? `${euros(murs.prix_m2.median)} / m²` : "—"}
                  detail={murs.prix_m2 ? `de ${euros(murs.prix_m2.bas)} à ${euros(murs.prix_m2.haut)}` : `moins de ${murs.n_minimum} ventes`} />
                <Chiffre titre="Ventes" valeur={String(murs.n)} detail={murs.annees?.join(", ")} />
                <Chiffre titre="Rayon" valeur={`${murs.rayon} m`} detail={murs.commune} />
              </div>
              {r.rotation && (
                <Repere titre="Est-ce beaucoup ?"
                  phrase={<>À ce rythme, un local du quartier change de main <span className="font-semibold">tous les {fr(r.rotation.periode_ans)} ans</span>.</>}
                  detail={`${r.rotation.ventes} ventes sur ${r.rotation.annees} millésimes, pour ${r.rotation.locaux} locaux relevés dans le rayon : ${fr(r.rotation.part_annuelle)} % du parc vendu chaque année.`}
                  reserve="Beaucoup de ventes n'est pas bon en soi : un quartier recherché et un quartier dont on sort produisent le même chiffre. C'est le prix au mètre, à côté, qui départage." />
              )}

              <div className={`${CARTE} p-4`}>
                <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">Les ventes les plus proches</p>
                <div className="max-h-[360px] overflow-y-auto">
                  {/* La liste et le plan montrent les mêmes ventes : cliquer
                      ici ouvre la même fiche que cliquer le point. */}
                  {(murs.ventes || []).slice(0, 25).map((v, i) => (
                    <button key={i} onClick={() => setChoisie(v)}
                      className={`flex w-full items-baseline justify-between gap-3 border-b border-trait py-2 text-left last:border-b-0 text-[12.5px] ${choisie === v ? "bg-relief" : "hover:bg-relief"}`}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-encre">
                          {Number.isFinite(v.lat) && <MapPin className="h-3 w-3 flex-shrink-0 text-brume" />}
                          {v.adresse || v.commune || "Vente"}
                        </span>
                        <span className="block text-[11px] text-brume">{quand(v.date)}{v.surface ? ` · ${v.surface} m²` : ""}{v.distance_m != null ? ` · ${v.distance_m} m` : ""}</span>
                      </span>
                      <span className="flex-shrink-0 text-right">
                        <span className="block tabular-nums text-encre">{euros(v.prix)}</span>
                        {v.prix_m2 != null && <span className="block text-[11px] tabular-nums text-menthe-texte">{euros(v.prix_m2)} / m²</span>}
                      </span>
                    </button>
                  ))}
                </div>
                {murs.lien && <a href={murs.lien} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre"><ExternalLink className="h-3.5 w-3.5" />Voir sur DVF</a>}
              </div>
            </>
          )}
        </div>

        {/* Les fonds : BODACC */}
        <div>
          <h2 className="m-0 mb-3 flex items-center gap-2 text-[17px] font-medium text-encre"><Store className="h-4 w-4 text-menthe" />Les fonds de commerce</h2>
          {!fonds ? (
            <div className={`${CARTE} p-4`}><p className="m-0 text-[12.5px] text-ardoise">{r.fonds_erreur || "Aucune cession publiée."}</p></div>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-3">
                <Chiffre titre="Prix médian" valeur={fonds.prix ? euros(fonds.prix.median) : "—"}
                  detail={fonds.prix ? `de ${euros(fonds.prix.min)} à ${euros(fonds.prix.max)}` : "aucun prix publié"} />
                <Chiffre titre="Cessions" valeur={`${fonds.n_avec_prix} / ${fonds.n}`} detail="avec un prix publié" />
                <Chiffre titre="Sur la rue" valeur={fonds.prix_rue ? euros(fonds.prix_rue) : "—"}
                  detail={fonds.comparables_rue.length ? `${fonds.comparables_rue.length} cession${fonds.comparables_rue.length > 1 ? "s" : ""}` : "aucune sur cette rue"} />
              </div>
              {r.tension_rue && (
                <Repere titre="Est-ce beaucoup ?"
                  phrase={r.tension_rue.n_rue
                    ? <>Cette rue a connu <span className="font-semibold">{r.tension_rue.n_rue} cession{r.tension_rue.n_rue > 1 ? "s" : ""}</span> en {r.annees} ans, contre {r.tension_rue.mediane_par_rue} pour la rue médiane de la commune.</>
                    : <>Aucune cession publiée sur cette rue en {r.annees} ans, contre {r.tension_rue.mediane_par_rue} pour la rue médiane de la commune.</>}
                  detail={`${r.tension_rue.rues_comptees} rues de la commune ont eu au moins une cession${r.tension_rue.rang != null ? ` · cette rue dépasse ${r.tension_rue.rang} % d'entre elles` : ""}. Le quart le plus actif en compte ${r.tension_rue.haut_par_rue} ou plus.`}
                  reserve="Le BODACC n'ayant pas de coordonnées, une rue ne peut se comparer qu'aux autres rues, pas à une densité. Une rue longue en aura mécaniquement plus qu'une rue courte." />
              )}

              <div className={`${CARTE} p-4`}>
                <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">
                  {fonds.comparables_rue.length ? "Les comparables de la rue" : "Les cessions de la commune"}
                </p>
                <div className="max-h-[360px] overflow-y-auto">
                  {(fonds.comparables_rue.length ? fonds.comparables_rue : r.cessions).slice(0, 25).map((c) => (
                    <div key={c.id} className="border-b border-trait py-2 last:border-b-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[12.5px] text-encre">{c.acquereur || "Acquéreur non nommé"}</span>
                        <span className="flex-shrink-0 tabular-nums text-[12.5px] font-medium text-menthe-texte">{euros(c.prix)}</span>
                      </div>
                      <p className="m-0 truncate text-[11px] text-brume">
                        {quand(c.date)}{c.adresse ? ` · ${c.adresse}` : ""}{c.vendeur ? ` · cédé par ${c.vendeur}` : ""}
                      </p>
                      {c.activite && <p className="m-0 mt-0.5 line-clamp-2 text-[11px] text-ardoise">{c.activite}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" className="mt-5" />

      <p className="m-0 mt-5 text-[10.5px] italic leading-[1.6] text-brume">
        Les murs viennent de DVF, les ventes enregistrées par l&apos;administration fiscale, localisées au point.
        Les fonds viennent du BODACC, où le prix de cession est écrit dans l&apos;annonce légale : il est localisé à l&apos;adresse
        postale, jamais au mètre près — les comparables se rapprochent donc par nom de rue.
        Une annonce de vente sur deux ne porte pas de prix (fusion, apport, cession entre associés) : elle compte dans le total, pas dans la médiane.
        {r.du_cache ? " Cessions reprises du cache." : ""}
      </p>
    </div>
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
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const f = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(f.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* BAN injoignable */ }
    }, 250);
    return () => clearTimeout(t);
  }, [adresse]);

  const analyser = useMutation({
    mutationFn: (texte) => base44.request("POST", "/api/ktransactions", { body: { adresse: texte, annees } }),
    onSuccess: (r) => { setVue(r); setSuggestions([]); qc.invalidateQueries({ queryKey: ["ktransactions"] }); },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  if (!user || user.role !== "admin") return null;
  if (vue) return <Resultat r={vue} onRetour={() => setVue(null)} />;

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Data</p>
      <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">K-Transactions</h1>
      <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
        Ce que les murs et les fonds se sont vraiment vendus autour d&apos;une adresse : prix au m² des locaux, prix de cession
        des fonds de commerce, et les comparables de la rue.
      </p>

      <div className={`${CARTE} p-5`}>
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Adresse</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="49 rue Dabray, 06000 Nice"
              onKeyDown={(e) => { if (e.key === "Enter" && adresse.trim().length >= 5) analyser.mutate(adresse); }}
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>

        <label className="alx-mont mb-1.5 mt-4 block text-[10.5px] uppercase tracking-[.14em] text-encre">Profondeur d&apos;historique</label>
        <div className="flex h-11 items-center gap-1 rounded-[10px] border border-bord bg-surface px-1">
          {ANNEES.map((x) => (
            <button key={x} onClick={() => setAnnees(x)} className={`flex-1 rounded-[8px] py-1.5 text-[12px] tabular-nums ${annees === x ? "bg-menthe/[0.14] text-menthe-texte" : "text-ardoise hover:text-encre"}`}>{x} ans</button>
          ))}
        </div>

        <p className="mt-4 mb-0 text-[11.5px] leading-[1.6] text-brume">
          Les murs viennent de DVF, les fonds du BODACC. Sources ouvertes, aucun crédit dépensé.
        </p>
        <button onClick={() => analyser.mutate(adresse)} disabled={analyser.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {analyser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Analyser le marché
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Analyses récentes</h2>
      {!recherches.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {recherches.map((x) => (
            <li key={x.id}>
              <button onClick={() => { choisie.current = x.adresse; setAdresse(x.adresse); analyser.mutate(x.adresse); }} disabled={analyser.isPending}
                className="flex w-full items-center gap-3 border-b border-trait py-3 text-left hover:bg-surface disabled:opacity-60">
                <Clock className="h-3.5 w-3.5 flex-shrink-0 text-brume" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-encre">{x.adresse}</span>
                  <span className="block text-[11px] text-brume">{quand(x.le)}{x.par ? ` · ${x.par}` : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
