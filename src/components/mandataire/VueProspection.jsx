import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import CarteProspection, { ACTIVITES_TEINTES, TEINTE_RUE, rangActivite, teinteActivite } from "@/components/mandataire/CarteProspection";
import { TYPES_CARTE } from "@/components/kzoning/CarteGoogleZones";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { J } from "@/design/jetons";

// Une prospection, comme ALX la mène, sur trois bandes : à gauche les
// commerces au fur et à mesure qu'il les lit (on coche ce qu'on garde, puis
// on l'exporte vers une liste d'appels), à droite la carte claire (les rues
// dans la teinte de leur emplacement, un point par commerce), et en bas le
// chat du mandataire, le même agent, sans pastilles, collé en bas : il sait
// en plus affiner la prospection ouverte (« ajoute les assurances »), et ce
// qu'il fait s'annonce dans une notification, étape par étape.

const API = "/api/mandataire";
const ROND = { 1: "N°1", 1.5: "N°1 bis", 2: "N°2" };
const RIEN = [];

export default function VueProspection({ id, retour = "Prospection", onRetour }) {
  const queryClient = useQueryClient();
  // L'état léger (commerces, avancement) se relit toutes les trois secondes
  // pendant un parcours ; les rues et leurs tracés, qui pèsent lourd, vivent
  // dans leur propre lecture et ne se relisent que toutes les quinze secondes.
  const { data, isLoading, error } = useQuery({
    queryKey: ["m-prospection", id],
    queryFn: () => base44.request("GET", `${API}/prospections/${id}/etat?rues=0`),
    refetchInterval: (q) => (q.state.data?.parcours?.etat === "en_cours" ? 3000 : false),
  });
  const enParcours = data?.parcours?.etat === "en_cours";
  const { data: ruesData } = useQuery({
    queryKey: ["m-prospection-rues", id],
    queryFn: () => base44.request("GET", `${API}/prospections/${id}/etat`),
    refetchInterval: enParcours ? 15000 : false,
    staleTime: enParcours ? 0 : Infinity,
  });
  const { data: listesData } = useQuery({ queryKey: ["m-listes"], queryFn: () => base44.request("GET", `${API}/listes`) });
  const [coches, setCoches] = useState(() => new Set());
  const [nouvelle, setNouvelle] = useState(null); // le nom de la nouvelle liste, en cours de saisie
  const [cible, setCible] = useState("");
  const [choisi, setChoisi] = useState(null);
  const [typeCarte, setTypeCarte] = useState("roadmap");
  const ligne = useRef({});

  const resultats = data?.resultats || RIEN;
  const libres = useMemo(() => resultats.filter((r) => r.statut.cle === "nouveau"), [resultats]);
  const criteres = data?.prospection?.criteres;
  // Mémoïsé : un tableau neuf à chaque rendu referait tous les marqueurs de la carte.
  const activites = useMemo(() => criteres?.activites || (criteres?.activite ? [criteres.activite] : RIEN), [criteres]);
  const p = data?.parcours || {};
  const enCours = p.etat === "en_cours";
  const ville = ruesData?.ville || data?.ville;
  useEffect(() => {
    setCoches((c) => {
      const n = new Set([...c].filter((x) => libres.some((r) => r.cible_id === x)));
      // La même sélection garde la même référence : pas de rendu pour rien.
      return n.size === c.size ? c : n;
    });
  }, [libres]);

  const exporter = useMutation({
    mutationFn: (corps) => base44.request("POST", `${API}/listes/exporter`, { body: { ...corps, prospection_id: id, cible_ids: [...coches] } }),
    onSuccess: (r) => {
      toast.success("Liste prête", {
        description: `${r.ajoutes} commerce${r.ajoutes > 1 ? "s" : ""} dans « ${r.liste.nom} »${r.refuses?.length ? ` · ${r.refuses.length} déjà suivi${r.refuses.length > 1 ? "s" : ""}` : ""}`,
        action: { mot: "Voir", faire: () => window.dispatchEvent(new CustomEvent("klocka:ouvrir-liste", { detail: { id: r.liste.id } })) },
      });
      setCoches(new Set());
      setNouvelle(null);
      for (const k of [["m-prospection", id], ["m-listes"], ["mandataire-jour"], ["mandataire-proprietaires"]]) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e?.message || "Export impossible"),
  });

  const lire = useMutation({
    mutationFn: () => base44.request("POST", `${API}/prospections/${id}/lire`),
    onSuccess: (r) => { toast.success(`ALX lit ${r.rues} rue${r.rues > 1 ? "s" : ""} de plus`); queryClient.invalidateQueries({ queryKey: ["m-prospection", id] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const surCarte = (c) => {
    setChoisi(c.cible_id);
    ligne.current[c.cible_id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const basculer = (x) => setCoches((c) => { const n = new Set(c); n.has(x) ? n.delete(x) : n.add(x); return n; });
  const tout = coches.size === libres.length && libres.length > 0;

  if (isLoading) return <p className="m-0 py-10 text-center text-[14px] text-brume">Lecture de la prospection…</p>;
  // Une relecture qui échoue en passant ne démonte pas la page : la carte et
  // le chat gardent leur état, la prochaine relecture reprendra.
  if (!data) return <p className="m-0 py-10 text-center text-[14px] text-alerte">{error?.message || "Prospection introuvable."}</p>;

  const retenues = p.rues_a_faire?.length ? p.rues_a_faire : (ville?.rues || []).filter((r) => r.retenue).map((r) => r.nom);
  const fraction = p.balade?.total ? { balade: p.balade.pas / p.balade.total } : p.balade?.commerces ? p.balade.commerce / p.balade.commerces : null;
  const etapeTexte = !enCours
    ? `${resultats.length} commerce${resultats.length > 1 ? "s" : ""} retenu${resultats.length > 1 ? "s" : ""}`
    : p.phase === "rues"
      ? "ALX trace les rues commerçantes…"
      : `ALX lit ${p.rue_en_cours || "les commerces"} · ${p.rues_faites} rue${p.rues_faites > 1 ? "s" : ""} sur ${p.rues_total} · ${resultats.length} retenu${resultats.length > 1 ? "s" : ""}`;

  const emplacement = criteres?.emplacement ?? null;
  const parActivite = activites.map((a, i) => ({ a, i, n: resultats.filter((r) => rangActivite(r, activites) === i).length }));

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait pb-3">
        <button type="button" onClick={onRetour} className="inline-flex items-center gap-1 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
          <ChevronLeft className="h-4 w-4" /> {retour}
        </button>
        <p className="m-0 min-w-0 flex-1 truncate text-center text-[15px] text-encre">{data.prospection.nom}</p>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-ardoise">
          {enCours && <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: J["menthe"] }} />}
          {etapeTexte}
        </span>
      </div>

      {/* Les critères en cours : chaque activité avec sa teinte sur la carte. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {parActivite.length ? parActivite.map(({ a, i, n }) => (
          <span key={a} className="inline-flex items-center gap-1.5 rounded-full border border-trait px-2.5 py-1 text-[12.5px] text-craie">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITES_TEINTES[i % ACTIVITES_TEINTES.length] }} />
            {a} <span className="tabular-nums text-brume">{n}</span>
          </span>
        )) : <span className="rounded-full border border-trait px-2.5 py-1 text-[12.5px] text-craie">Tous les commerces</span>}
        <span className="rounded-full border border-trait px-2.5 py-1 text-[12.5px] text-craie">{emplacement == null ? "Tous les emplacements" : `Emplacement ${ROND[emplacement]}`}</span>
        {data.rues_a_lire > 0 && !enCours && (
          <button type="button" onClick={() => lire.mutate()} disabled={lire.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-menthe/50 px-3 py-1 text-[12.5px] text-menthe hover:bg-menthe/[0.06] disabled:opacity-40" style={{ background: "transparent" }}>
            {lire.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {data.rues_a_lire} rue{data.rues_a_lire > 1 ? "s" : ""} {emplacement != null ? `en ${ROND[emplacement]} ` : ""}pas encore lue{data.rues_a_lire > 1 ? "s" : ""} · Lire
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Les commerces : on coche ce qu'on garde. */}
        <div className="flex min-h-0 flex-col rounded-[16px] border border-trait bg-surface-pleine lg:h-[calc(100dvh-330px)] lg:min-h-[440px]">
          <div className="flex items-center gap-3 border-b border-trait px-4 py-3">
            <button type="button" onClick={() => setCoches(tout ? new Set() : new Set(libres.map((r) => r.cible_id)))} disabled={!libres.length}
              className="inline-flex items-center gap-2 text-[13px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
              <Case oui={tout} /> {tout ? "Tout décocher" : "Tout cocher"}
            </button>
            <span className="ml-auto text-[12.5px] tabular-nums text-ardoise">{coches.size} / {libres.length} à garder</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[50vh]">
            {!resultats.length && (
              <p className="m-0 px-4 py-6 text-[13.5px] text-brume">
                {enCours ? "Les commerces apparaissent ici au fur et à mesure qu'ALX les lit."
                  : data.ecartes > 0 ? `${data.ecartes} commerce${data.ecartes > 1 ? "s" : ""} répond${data.ecartes > 1 ? "ent" : ""} à la recherche, mais les règles Klocka les écartent de la prospection (restauration rapide, fonds cédés…).`
                  : data.rues_a_lire > 0 ? `Rien dans les rues déjà lues. ${data.rues_a_lire} rue${data.rues_a_lire > 1 ? "s" : ""} reste${data.rues_a_lire > 1 ? "nt" : ""} à lire : le bouton « Lire » au-dessus.`
                  : "Aucun commerce ne correspond dans cette ville."}
              </p>
            )}
            {resultats.map((r) => {
              const libre = r.statut.cle === "nouveau";
              const oui = coches.has(r.cible_id);
              return (
                <button key={r.cible_id} ref={(el) => { ligne.current[r.cible_id] = el; }} type="button" aria-pressed={oui}
                  onClick={() => { if (libre) basculer(r.cible_id); setChoisi(r.cible_id); }}
                  className={`flex w-full items-start gap-3 border-b border-trait px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-encre/[0.03] ${libre ? "" : "opacity-60"}`}
                  style={{ background: oui ? "rgb(var(--k-menthe-rgb) / 0.07)" : choisi === r.cible_id ? "rgb(var(--k-encre-rgb, 0 0 0) / 0.04)" : "transparent", boxShadow: choisi === r.cible_id ? `inset 3px 0 0 ${J["menthe"]}` : undefined }}>
                  <span className="pt-0.5"><Case oui={oui} grisee={!libre} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {activites.length > 1 && <span className="h-2 w-2 flex-none rounded-full" style={{ background: teinteActivite(r, activites) }} />}
                      <span className="truncate text-[14px] text-encre">{r.enseigne || r.activite || "Commerce"}</span>
                      {r.emplacement != null && <span className="flex-none rounded border border-bord px-1.5 text-[10.5px] text-ardoise">{ROND[r.emplacement]}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ardoise">{[r.activite, r.adresse].filter(Boolean).join(" · ")}</span>
                    <span className="mt-0.5 block truncate text-[12px]">
                      {r.pour?.length ? <span className="text-menthe">pour {r.pour.join(", ")}</span> : null}
                      {r.proprietaire ? <span className="text-brume">{r.pour?.length ? " · " : ""}murs : {r.proprietaire}</span> : null}
                      {!libre && <span className="text-ambre">{r.pour?.length || r.proprietaire ? " · " : ""}{r.statut.mot}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Exporter : vers une nouvelle liste, ou une liste existante. */}
          <div className="border-t border-trait px-4 py-3">
            {nouvelle != null ? (
              <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); exporter.mutate({ nom: nouvelle }); }}>
                <input autoFocus value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} placeholder="Nom de la liste"
                  className="min-w-0 flex-1 rounded-champ border border-trait bg-surface px-3 py-2 text-[13.5px] text-encre outline-none focus:border-menthe" />
                <button type="submit" disabled={!nouvelle.trim() || exporter.isPending} className="inline-flex h-9 items-center rounded-full bg-menthe-pale px-4 text-[13px] font-medium text-sur-menthe-pale disabled:opacity-40">
                  {exporter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer"}
                </button>
                <button type="button" onClick={() => setNouvelle(null)} className="text-[12.5px] text-brume hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!coches.size} onClick={() => setNouvelle(data.prospection.nom)}
                  className="inline-flex h-9 items-center rounded-full bg-menthe-pale px-4 text-[13px] font-medium text-sur-menthe-pale disabled:opacity-40">
                  Exporter vers une nouvelle liste
                </button>
                {(listesData?.listes || []).length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <select value={cible} onChange={(e) => setCible(e.target.value)} className="h-9 rounded-full border border-trait bg-surface px-3 text-[13px] text-encre outline-none">
                      <option value="">Ajouter à une liste…</option>
                      {listesData.listes.map((l) => <option key={l.id} value={l.id}>{l.nom} ({l.total})</option>)}
                    </select>
                    <button type="button" disabled={!coches.size || !cible || exporter.isPending} onClick={() => exporter.mutate({ liste_id: cible })}
                      className="inline-flex h-9 items-center rounded-full border border-trait px-3.5 text-[13px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
                      Ajouter
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* La carte : plan clair, rues par emplacement, un point par commerce. */}
        <div className="relative overflow-hidden rounded-[16px] border border-trait max-lg:h-[380px] lg:h-[calc(100dvh-330px)] lg:min-h-[440px]">
          {(ville?.rues || []).length ? (
            <>
              <CarteProspection
                rues={ville.rues}
                commerces={resultats}
                activites={activites}
                coches={coches}
                choisi={choisi}
                enCours={enCours ? p.rue_en_cours : null}
                centre={ville.centre}
                type={typeCarte}
                onCommerce={surCarte}
                onErreur={(m) => toast.error(m)}
              />
              <div className="absolute left-3 top-3 z-10 rounded-[12px] border border-black/10 bg-white/90 px-3 py-2 text-[11.5px] text-[#3a3f47] shadow-sm backdrop-blur">
                {[[1, "N°1"], [1.5, "N°1 bis"], [2, "N°2"]].map(([k, m]) => (
                  <span key={k} className="mr-3 inline-flex items-center gap-1.5 last:mr-0">
                    <span className="inline-block h-[3px] w-4 rounded" style={{ background: TEINTE_RUE[k] }} /> {m}
                  </span>
                ))}
              </div>
              <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-black/10 bg-white/90 p-1 shadow-sm backdrop-blur">
                <div className="flex items-center gap-0.5">
                  {TYPES_CARTE.slice(0, 2).map((t) => (
                    <button key={t.cle} type="button" onClick={() => setTypeCarte(t.cle)}
                      className={`rounded-full px-3 py-1.5 text-[11.5px] ${t.cle === typeCarte ? "bg-black/[0.08] text-[#111]" : "text-[#555]"}`}
                      style={t.cle === typeCarte ? undefined : { background: "transparent" }}>
                      {t.nom}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-menthe" />
                <p className="m-0 mt-3 text-[14px] text-craie">ALX cherche les rues commerçantes de {ville?.nom}…</p>
                {p.dernier && <p className="m-0 mt-1 text-[12.5px] text-ardoise">{p.dernier}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Le chat, collé en bas de l'écran : ce qu'il fait s'annonce en notification. */}
      <div className="sticky bottom-0 z-20 -mx-5 mt-4 px-5 pb-4 pt-3 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:-mx-8 md:px-8" style={{ background: `linear-gradient(to top, ${J["fond"]} 70%, transparent)` }}>
        <div className="mx-auto max-w-[760px]">
          <ChatDashboard espace="affinage" prospectionId={id} embarque />
        </div>
      </div>
    </div>
  );
}

const Case = ({ oui, grisee = false }) => (
  <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border"
    style={{ borderColor: oui ? J["menthe"] : J["bord-vif"], background: oui ? J["menthe"] : "transparent", opacity: grisee ? 0.4 : 1 }}>
    {oui && <Check className="h-3 w-3" style={{ color: J["sur-menthe"] }} />}
  </span>
);
