import React, { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Search, Play, Loader2, Clock, DoorClosed, TrendingDown, Hourglass, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { JL } from "@/design/jetons";
import CartePoints from "@/components/kdata/CartePoints";
import { MecaniqueEnLigne } from "@/components/kdata/Mecanique";

// K-Vacance : y a-t-il beaucoup de locaux vides ici, oui ou non ?
//
// Deux lectures, deux sources, et l'écran ne les mélange pas. La VACANCE
// VISIBLE vient d'OpenStreetMap : ce qu'on voit depuis le trottoir, rue par
// rue. La VACANCE AU REGISTRE vient de Sirene : les adresses commerçantes dont
// le dernier commerce a fermé sans qu'un autre s'y déclare. Chacune se compare
// à la même lecture pour toute la commune, et le verdict en sort, en tête.
//
// L'habit est celui des cartes du tableau de bord K-Data : bg-surface, filet
// trait, rayon de 18, sans flou.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const RAYONS = [250, 400, 800, 1500];
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const pct = (n) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const fr = (n) => String(n).replace(".", ",");

// La mécanique : dans quel ordre K-Vacance interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée." },
  { source: "OpenStreetMap, dans le rayon", quoi: "Les devantures marquées vides depuis la rue : c'est la vacance visible, rue par rue." },
  { source: "OpenStreetMap, toute la commune", quoi: "Le même comptage à l'échelle de la commune, une fois par mois : c'est le repère du taux visible." },
  { source: "API Sirene (INSEE)", quoi: "Tous les commerces de la commune, actifs et fermés depuis huit ans, avec leurs dates et leur point, une fois par mois. La zone et la commune se lisent dans le même registre, avec la même règle." },
  { source: "Nomenclature NAF (INSEE)", quoi: "Le libellé du métier qui a fermé, à partir du code que le registre publie." },
];

/** La couleur d'une rue selon sa tension : du vert au rouge. */
const couleurTaux = (t) => (t >= 20 ? JL.alerte : t >= 10 ? JL.ambre : t >= 5 ? JL.jaune : JL.vert);
/** La couleur du verdict. */
const couleurNiveau = { forte: JL.alerte, moyenne: JL.ambre, faible: JL.vert };
const NOMS_LECTURE = { visible: "Vu de la rue", registre: "Au registre", rythme: "Rythme des fermetures" };

// Les trois crans de l'indicateur, du plus tendu au plus sain : la zone se
// pose sur l'un d'eux, face à la moyenne de sa ville.
const CRANS_VILLE = [
  { cle: "eleve", mot: "Élevé", couleur: JL.alerte },
  { cle: "moyen", mot: "Moyen", couleur: JL.ambre },
  { cle: "faible", mot: "Faible", couleur: JL.vert },
];

/** L'indicateur de droite : un cran, et les deux chiffres qui le justifient. */
function JaugeVille({ f, ville }) {
  if (!f) return null;
  return (
    <div className="flex-shrink-0 rounded-[14px] border border-trait bg-fond/40 p-3.5 sm:w-[212px]">
      <p className="alx-mont m-0 text-[10px] uppercase tracking-[.12em] text-brume">
        Face à {ville || "la ville"}
      </p>
      <div className="mt-2.5 flex flex-col gap-1.5">
        {CRANS_VILLE.map((c) => {
          const actif = c.cle === f.cran;
          return (
            <div key={c.cle} className="flex items-center gap-2">
              <span className="h-[6px] flex-1 rounded-full" style={{ background: actif ? c.couleur : "rgba(148,154,151,0.16)" }} />
              <span className={`w-[42px] text-right text-[11.5px] ${actif ? "font-semibold text-encre" : "text-brume"}`}>{c.mot}</span>
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-ardoise">
        {pct(f.zone)} ici, {pct(f.ville)} dans la ville{f.ratio ? ` · ${fr(f.ratio)} fois` : ""}
      </p>
      <p className="m-0 mt-0.5 text-[10.5px] text-brume">
        {f.source === "registre" ? "d'après le registre" : "d'après la rue"}
      </p>
    </div>
  );
}

/** Le bloc de tête : la réponse, ses appuis, ses réserves, et l'indicateur. */
function Verdict({ v, registre, ville }) {
  const couleur = couleurNiveau[v.niveau] || JL.ardoise;
  return (
    <div className={`${CARTE} mb-5 p-4`}>
      <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">Y a-t-il beaucoup de vacance ?</p>
      <div className="mt-1.5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <p className="m-0 flex items-start gap-2.5 text-[16px] leading-[1.45] text-encre">
            <span className="mt-[7px] h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: couleur }} />
            <span>{v.phrase}</span>
          </p>
          {v.appuis.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {v.appuis.map((a) => (
                <div key={a.lecture} className="rounded-[12px] border border-trait bg-fond/40 p-3">
                  <p className="alx-mont m-0 text-[10px] uppercase tracking-[.12em] text-menthe-texte">{NOMS_LECTURE[a.lecture] || a.lecture}</p>
                  <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-encre">{a.phrase}.</p>
                  <p className="m-0 mt-1 text-[11px] leading-[1.5] text-brume">{a.repere}.</p>
                </div>
              ))}
            </div>
          )}
          {registre?.etablissements_zone != null && (
            <p className="m-0 mt-2 text-[11px] text-brume">
              {registre.etablissements_zone} commerces au registre dans le rayon, {registre.etablissements_commune} dans la commune
              {registre.garde_le ? ` · registre lu le ${quand(registre.garde_le)}` : ""}
            </p>
          )}
          {v.reserves.length > 0 && <p className="m-0 mt-1 text-[11px] leading-[1.6] text-brume">{v.reserves.join(" ")}</p>}
        </div>
        <JaugeVille f={v.face_ville} ville={ville} />
      </div>
    </div>
  );
}

function Chiffre({ titre, valeur, detail, icone: Icone }) {
  return (
    <div className={`${CARTE} p-4`}>
      <Icone className="h-4 w-4 text-menthe" />
      <p className="m-0 mt-2 text-[10.5px] uppercase tracking-[.08em] text-brume">{titre}</p>
      <p className="m-0 mt-0.5 text-[20px] font-semibold tabular-nums text-encre">{valeur}</p>
      {detail && <p className="m-0 mt-1 text-[11.5px] leading-[1.5] text-ardoise">{detail}</p>}
    </div>
  );
}

function Resultat({ r, onRetour }) {
  const [ouvert, setOuvert] = useState(null);
  const couches = useMemo(() => [
    { cle: "vide", couleur: JL.alerte, taille: 14, zIndex: 20, points: (r.locaux_vides || []).map((x) => ({ ...x, titre: x.adresse || "Local vide", nature: "Local vide" })) },
    // Le métier du local, pas la raison sociale : « Formation continue
    // d'adultes » dit ce qui a fermé, « ISATIS » ne dit rien.
    { cle: "ferme", couleur: JL.ambre, taille: 10, zIndex: 10, points: (r.fermetures || []).map((x) => ({ ...x, titre: x.activite_libelle || x.enseigne || x.nom, nature: "Fermeture" })) },
    // Les adresses vidées au registre : le dernier commerce a fermé, aucun ne
    // s'est déclaré depuis.
    { cle: "registre", couleur: JL.jaune, taille: 12, zIndex: 15, points: (r.registre?.zone?.lignes || []).filter((x) => x.lat != null).map((x) => ({ ...x, titre: x.activite_libelle || x.nom || x.adresse, nature: "Adresse vidée au registre", fermeture: x.fermee_le })) },
  ], [r]);

  const zoneR = r.registre?.zone;
  const communeR = r.registre?.commune;
  const rythme = r.rythme?.zone;

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-8">
      <button onClick={onRetour} className="mb-3 text-[12.5px] text-ardoise hover:text-encre">Toutes les analyses</button>
      <h1 className="m-0 text-[24px] font-light tracking-[-0.01em] text-encre">{r.point.label}</h1>
      <p className="m-0 mt-1 mb-6 text-[12.5px] text-ardoise">
        {r.rayon} m autour du point · fermetures des {r.annees_fermeture} dernières années · face à {r.point.ville || "la commune"}
      </p>

      {r.verdict && <Verdict v={r.verdict} registre={r.registre} ville={r.point.ville} />}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Chiffre titre="Vacance visible" icone={DoorClosed}
          valeur={r.vacance ? pct(r.vacance.taux) : "—"}
          detail={r.vacance
            ? `${r.vacance.vides} vide${r.vacance.vides > 1 ? "s" : ""} sur ${r.vacance.total} devantures relevées${r.visible?.commune?.taux != null ? ` · commune : ${pct(r.visible.commune.taux)}` : ""}`
            : r.vacance_erreur} />
        <Chiffre titre="Vacance au registre" icone={Hourglass}
          valeur={zoneR?.taux != null ? pct(zoneR.taux) : "—"}
          detail={zoneR
            ? `${zoneR.vides} adresse${zoneR.vides > 1 ? "s" : ""} vidée${zoneR.vides > 1 ? "s" : ""} depuis ${zoneR.fenetre_ans} ans sur ${zoneR.adresses} commerçantes${communeR?.taux != null ? ` · commune : ${pct(communeR.taux)}` : ""}`
            : r.sirene_erreur} />
        <Chiffre titre="Fermetures par an" icone={TrendingDown}
          valeur={rythme?.taux_annuel != null ? pct(rythme.taux_annuel) : "—"}
          detail={rythme
            ? `${rythme.fermees_12_mois} sur ${rythme.actifs + rythme.fermees_12_mois} en douze mois${rythme.un_sur ? `, un commerce sur ${rythme.un_sur}` : ""}${r.rythme?.commune?.taux_annuel != null ? ` · commune : ${pct(r.rythme.commune.taux_annuel)}` : ""}`
            : "registre non lu"} />
        <Chiffre titre="Durée d'exploitation" icone={Clock}
          valeur={r.turnover.duree_mediane != null ? `${fr(r.turnover.duree_mediane)} ans` : "—"}
          detail={r.turnover.n ? `médiane sur ${r.turnover.n} fermetures · ${r.turnover.part_moins_3_ans} % ferment avant 3 ans` : "aucune fermeture relevée"} />
        <Chiffre titre="Parmi les rues" icone={DoorClosed}
          valeur={r.registre?.rang ? `${r.registre.rang.rang} %` : "—"}
          detail={r.registre?.rang
            ? `des ${r.registre.rang.rues_comptees} rues de la commune ont moins de vacance au registre · rue médiane : ${pct(r.registre.rang.mediane_des_rues)}`
            : "pas assez de rues comparables"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className={`${CARTE} relative min-h-[460px] overflow-hidden`}>
          <CartePoints point={r.point} rayon_m={r.rayon} couches={couches} onPoint={setOuvert} onErreur={(m) => toast.error(m)} />
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-[10px] border border-bord bg-fond/80 px-3 py-2 text-[11px] backdrop-blur-xl">
            <p className="m-0 flex items-center gap-1.5 text-ardoise"><span className="h-2.5 w-2.5 rounded-full" style={{ background: JL.alerte }} />Local vide vu depuis la rue</p>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-ardoise"><span className="h-2.5 w-2.5 rounded-full" style={{ background: JL.jaune }} />Adresse vidée au registre, sans repreneur</p>
            <p className="m-0 mt-1 flex items-center gap-1.5 text-ardoise"><span className="h-2 w-2 rounded-full" style={{ background: JL.ambre }} />Commerce fermé au registre</p>
          </div>
          {ouvert && (
            <div className="absolute right-3 top-3 w-[260px] rounded-[12px] border border-bord bg-fond/85 p-3 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-2">
                <p className="alx-mont m-0 text-[10px] uppercase tracking-[.12em] text-menthe-texte">{ouvert.nature}</p>
                <button onClick={() => setOuvert(null)} className="text-brume hover:text-encre"><X className="h-3.5 w-3.5" /></button>
              </div>
              <p className="m-0 mt-1 text-[13px] font-medium text-encre">{ouvert.titre || "—"}</p>
              {ouvert.adresse && <p className="m-0 mt-0.5 text-[11.5px] text-ardoise">{ouvert.adresse}</p>}
              {ouvert.ouverture && <p className="m-0 mt-1 text-[11.5px] text-ardoise">{quand(ouvert.ouverture)} → {quand(ouvert.fermeture)}{ouvert.duree_ans != null ? ` · ${fr(ouvert.duree_ans)} ans` : ""}</p>}
              {!ouvert.ouverture && ouvert.fermeture && <p className="m-0 mt-1 text-[11.5px] text-ardoise">dernier commerce fermé le {quand(ouvert.fermeture)}</p>}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className={`${CARTE} mb-4 p-4`}>
            <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">Les rues, de la plus tendue à la plus saine</p>
            {!r.vacance?.rues.length ? <p className="m-0 text-[12.5px] text-ardoise">Aucune rue n&apos;a assez de devantures relevées pour être mesurée.</p> : (
              <div className="max-h-[300px] overflow-y-auto">
                {r.vacance.rues.map((x) => (
                  <div key={x.rue} className="flex items-center gap-3 border-b border-trait py-2 last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-encre">{x.libelle}</span>
                      <span className="block text-[11px] text-brume">{x.vides} vide{x.vides > 1 ? "s" : ""} sur {x.total}</span>
                    </span>
                    <span className="h-1.5 w-20 flex-shrink-0 overflow-hidden rounded-full bg-relief">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, x.taux)}%`, background: couleurTaux(x.taux) }} />
                    </span>
                    <span className="w-12 flex-shrink-0 text-right text-[12.5px] font-medium tabular-nums text-encre">{pct(x.taux)}</span>
                  </div>
                ))}
              </div>
            )}
            {r.vacance?.rues_ecartees > 0 && (
              <p className="m-0 mt-2 text-[10.5px] text-brume">
                {r.vacance.rues_ecartees} rue{r.vacance.rues_ecartees > 1 ? "s" : ""} écartée{r.vacance.rues_ecartees > 1 ? "s" : ""} : moins de {r.vacance.minimum_par_rue} devantures relevées, un taux n&apos;y voudrait rien dire.
              </p>
            )}
            {r.vacance?.rues_deduites > 0 && (
              <p className="m-0 mt-1 text-[10.5px] text-brume">
                {r.vacance.rues_deduites} devanture{r.vacance.rues_deduites > 1 ? "s" : ""} sur {r.vacance.total} n&apos;{r.vacance.rues_deduites > 1 ? "ont" : "a"} pas d&apos;adresse dans OpenStreetMap et {r.vacance.rues_deduites > 1 ? "ont été rattachées" : "a été rattachée"} à la rue de la devanture adressée la plus proche, à moins de {r.vacance.rayon_rue} m. C&apos;est le cas de presque tous les locaux vides.
                {r.vacance.sans_rue > 0 ? ` ${r.vacance.sans_rue} autre${r.vacance.sans_rue > 1 ? "s" : ""} rest${r.vacance.sans_rue > 1 ? "ent" : "e"} hors de toute rue.` : ""}
              </p>
            )}
          </div>

          {zoneR && (
            <div className={`${CARTE} mb-4 p-4`}>
              <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">Les adresses vidées au registre</p>
              {!zoneR.lignes?.length ? <p className="m-0 text-[12.5px] text-ardoise">Aucune adresse commerçante du rayon n&apos;a perdu son dernier commerce depuis {zoneR.fenetre_ans} ans.</p> : (
                <div className="max-h-[260px] overflow-y-auto">
                  {zoneR.lignes.map((x) => (
                    <div key={x.cle} className="border-b border-trait py-2 last:border-b-0">
                      <p className="m-0 truncate text-[13px] text-encre">{x.activite_libelle || x.nom || "Commerce"}</p>
                      <p className="m-0 text-[11px] text-brume">fermé le {quand(x.fermee_le)}{x.nom && x.activite_libelle ? ` · ${x.nom}` : ""}{x.adresse ? ` · ${x.adresse}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
              {zoneR.anciennes > 0 && (
                <p className="m-0 mt-2 text-[10.5px] text-brume">
                  {zoneR.anciennes} adresse{zoneR.anciennes > 1 ? "s" : ""} vidée{zoneR.anciennes > 1 ? "s" : ""} depuis plus de {zoneR.fenetre_ans} ans ne compte{zoneR.anciennes > 1 ? "nt" : ""} plus : sans doute plus un commerce.
                </p>
              )}
            </div>
          )}

          <div className={`${CARTE} p-4`}>
            <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">Les dernières fermetures</p>
            {!r.fermetures.length ? <p className="m-0 text-[12.5px] text-ardoise">Aucune fermeture relevée dans la zone.</p> : (
              <div className="max-h-[320px] overflow-y-auto">
                {r.fermetures.slice(0, 40).map((f) => (
                  <div key={f.siret} className="border-b border-trait py-2 last:border-b-0">
                    {/* Ce qui a fermé, pas qui l'exploitait. La raison sociale
                        reste juste en dessous, avec l'adresse. */}
                    <p className="m-0 truncate text-[13px] text-encre">{f.activite_libelle || f.enseigne || f.nom}</p>
                    <p className="m-0 text-[11px] text-brume">
                      fermé en {f.annee_fermeture}{f.duree_ans != null ? ` après ${String(f.duree_ans).replace(".", ",")} ans` : ""}
                      {f.enseigne || f.nom ? ` · ${f.enseigne || f.nom}` : ""}
                      {f.adresse ? ` ${f.adresse}` : ""}{f.distance_m != null ? ` · ${f.distance_m} m` : ""}
                    </p>
                    {f.vacance_ans != null && (
                      <p className={`m-0 mt-0.5 text-[11px] ${f.en_cours ? "text-ambre" : "text-menthe-texte"}`}>
                        {f.en_cours
                          ? `aucune nouvelle déclaration à cette adresse depuis ${String(f.vacance_ans).replace(".", ",")} ans`
                          : `déclaration suivante après ${String(f.vacance_ans).replace(".", ",")} ans${f.reprise_activite ? ` · ${f.reprise_activite}` : ""}${f.reprise_par ? ` (${f.reprise_par})` : ""}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="La mécanique : d'où viennent ces chiffres" className="mt-5" />

      <p className="m-0 mt-5 text-[10.5px] italic leading-[1.6] text-brume">
        La vacance visible compte les devantures marquées vides dans OpenStreetMap : elle mesure ce qui est relevé, une devanture
        vide que personne n&apos;a notée paraît occupée, c&apos;est un plancher. La vacance au registre vient de l&apos;API Sirene de
        l&apos;INSEE : parmi les adresses postales où un commerce (détail, restauration, coiffure et soins, réparation) a existé, celles
        dont le dernier a fermé depuis moins de trois ans sans qu&apos;un autre s&apos;y déclare. Un numéro de rue abrite plusieurs locaux,
        et un repreneur déclaré à l&apos;adresse voisine paraît absent : c&apos;est un plafond. La commune est lue avec la même source et
        la même règle, c&apos;est ce qui permet de comparer.
        {r.erreurs?.length ? ` Lectures incomplètes : ${r.erreurs.join(" ; ")}.` : ""}
      </p>
    </div>
  );
}

export default function KVacance() {
  const user = useUser();
  const qc = useQueryClient();
  const [adresse, setAdresse] = useState("");
  const [rayon, setRayon] = useState(400);
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);

  const { data } = useQuery({ queryKey: ["kvacance"], queryFn: () => base44.request("GET", "/api/kvacance"), enabled: user?.role === "admin" });
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
    mutationFn: (texte) => base44.request("POST", "/api/kvacance", { body: { adresse: texte, rayon } }),
    onSuccess: (r) => { setVue(r); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kvacance"] }); },
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

  if (!user || user.role !== "admin") return null;
  if (vue) return <Resultat r={vue} onRetour={() => setVue(null)} />;

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Data</p>
      <h1 className="mt-2 mb-2 text-[30px] font-light tracking-[-0.01em] text-encre">K-Vacance</h1>
      <p className="m-0 mb-7 max-w-[620px] text-[13.5px] leading-[1.7] text-ardoise">
        Y a-t-il beaucoup de locaux vides ici ? Ce qu&apos;on voit depuis la rue et ce que dit le registre, comparés à la commune.
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

        <label className="alx-mont mb-1.5 mt-4 block text-[10.5px] uppercase tracking-[.14em] text-encre">Rayon</label>
        <div className="flex h-11 items-center gap-1 rounded-[10px] border border-bord bg-surface px-1">
          {RAYONS.map((x) => (
            <button key={x} onClick={() => setRayon(x)} className={`flex-1 rounded-[8px] py-1.5 text-[12px] tabular-nums ${rayon === x ? "bg-menthe/[0.14] text-menthe-texte" : "text-ardoise hover:text-encre"}`}>
              {x >= 1000 ? `${x / 1000} km` : `${x} m`}
            </button>
          ))}
        </div>

        <p className="mt-4 mb-0 text-[11.5px] leading-[1.6] text-brume">
          Les devantures viennent d&apos;OpenStreetMap, les commerces actifs et fermés de l&apos;API Sirene de l&apos;INSEE. Sources ouvertes, aucun crédit dépensé. La première lecture d&apos;une commune prend une à deux minutes, les suivantes sont immédiates.
        </p>
        <button onClick={() => analyser.mutate(adresse)} disabled={analyser.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {analyser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Analyser le quartier
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
