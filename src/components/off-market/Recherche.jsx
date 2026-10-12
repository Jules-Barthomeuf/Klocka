import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, Home, ListPlus, Loader2, Plus, Search, SlidersHorizontal, Sparkles, Square, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { FILTRES_VIDES, RAPIDES, compterRapides, nbCriteres } from "@/lib/off-market-filtres";
import PanneauFiltres from "./PanneauFiltres";
import CarteOffMarket from "./CarteOffMarket";
import { Proprietaires } from "./Parties";
import { Case, LIBELLES_PROFILS, LIBELLES_SIGNAUX, Score, Vide, bouton, boutonPlein, champ, dateCourte, euros, nMurs, pl, req, useOffMarket } from "./commun";

// Off-market, l'écran de recherche (organisation de PropStream, 10 oct. 2026) :
// la barre de contexte (territoire, Filtrer, Sauvegarder, Tout effacer), le
// bandeau des listes rapides avec leur effectif, puis la carte et la liste
// côte à côte. Chaque carte de bien porte la même grille, et son numéro est
// celui de son point sur la carte.

const PAR_PAGE = 25;

function Photo({ id }) {
  const [etat, setEtat] = useState("charge");
  if (etat === "rien") return <div className="grid h-full w-full place-items-center rounded-champ bg-relief text-brume"><Home className="h-8 w-8" /></div>;
  return <img src={`/api/off-market/locaux/${id}/photo`} alt="" loading="lazy" onError={() => setEtat("rien")} className="h-full w-full rounded-champ object-cover" />;
}

function CarteBien({ l, n, coche, onCocher, onOuvrir, ouvert }) {
  return (
    <article className={`grid grid-cols-[auto_auto_minmax(0,1fr)] gap-3 border-t border-trait px-3 py-4 transition-colors first:border-t-0 hover:bg-relief/30 ${ouvert ? "bg-menthe/[0.06]" : ""}`}>
      <div className="flex flex-col items-center gap-2 pt-1">
        <Case oui={coche} onBasculer={onCocher} label={`Cocher ${l.adresse}`} />
        <span className="text-[12px] tabular-nums text-ardoise">{n}</span>
      </div>
      <button type="button" onClick={onOuvrir} className="h-[88px] w-[132px] flex-none overflow-hidden rounded-champ p-0 max-md:h-[72px] max-md:w-[100px]" style={{ background: "transparent" }} aria-label="Ouvrir la fiche"><Photo id={l.id} /></button>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={onOuvrir} className="block max-w-full truncate p-0 text-left text-[15px] text-encre underline-offset-4 hover:underline" style={{ background: "transparent" }}>{l.adresse}</button>
            <p className="m-0 text-[12.5px] text-ardoise">{[l.ville, l.code_postal].filter(Boolean).join(" ")}{l.parcelle ? <span className="text-brume"> · parcelle {l.parcelle}</span> : null}</p>
          </div>
          <div className="flex-none text-right">
            <p className="m-0 text-[11.5px] text-brume">Valeur estimée</p>
            <p className="m-0 text-[15px] tabular-nums text-encre">{l.valeur ? euros(l.valeur) : "non mesurée"}</p>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12.5px]">
          <span className="min-w-0 truncate text-craie">{l.enseigne || (l.occupe === false ? "Vitrine vide" : "Occupant inconnu")}{l.activite ? <span className="text-ardoise"> · {l.activite}</span> : null}</span>
          <span className="text-ardoise">{[l.emplacement ? `n° ${l.emplacement === 1.5 ? "1 bis" : l.emplacement}` : null, l.surface ? `${l.surface} m²` : null, l.rendement ? `${String(l.rendement).replace(".", ",")} %` : null].filter(Boolean).join(" · ")}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
          <div className="min-w-0"><p className="m-0 text-brume">Propriétaire</p><p className="m-0 truncate text-craie" title={l.proprietaire?.nom || ""}>{l.proprietaire ? l.proprietaire.nom : "inconnu"}</p><p className="m-0 truncate text-ardoise">{l.proprietaire ? LIBELLES_PROFILS[l.profil?.cle] : "particulier, probablement"}</p></div>
          <div><p className="m-0 text-brume">Depuis</p><p className="m-0 text-craie">{l.detention_annees != null ? pl(l.detention_annees, "an") : "inconnu"}</p></div>
          <div><p className="m-0 text-brume">Dernière mutation</p><p className="m-0 text-craie">{l.mutation ? `${dateCourte(l.mutation.date)}${l.mutation.prix ? ` · ${euros(l.mutation.prix)}` : ""}` : "aucune (DVF)"}</p></div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Score motivation={l.motivation} fit={l.fit} rang={l.rang} petit />
          <span className="truncate text-[11.5px] text-ardoise">{l.signaux.slice(0, 3).map((s) => LIBELLES_SIGNAUX[s]).join(" · ")}</span>
        </div>
      </div>
    </article>
  );
}

/** Le choix d'une liste où mettre la sélection : une existante, ou une nouvelle. */
function AjouterEnListe({ ids, onFait }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const q = useOffMarket(["listes"], "/listes", { enabled: ouvert });
  const ajouter = useMutation({ mutationFn: ({ id }) => req("PATCH", `/listes/${id}`, { ajouter: ids }), onSuccess: (r) => { toast.success(`${nMurs(ids.length, "ajouté")} à « ${r.liste.nom} »`); setOuvert(false); onFait(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const creer = useMutation({ mutationFn: () => req("POST", "/listes", { nom, locaux: ids }), onSuccess: (r) => { toast.success(`Liste « ${r.liste.nom} » créée`); setNom(""); setOuvert(false); onFait(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const figees = (q.data?.listes || []).filter((l) => !l.dynamique);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} disabled={!ids.length} className={bouton} aria-expanded={ouvert}><ListPlus className="h-4 w-4" />Ajouter à une liste{ids.length ? ` (${ids.length})` : ""}</button>
      {ouvert && (
        <div className="absolute right-0 top-11 z-20 w-[320px] rounded-bloc border border-bord-doux bg-surface-pleine p-2 shadow-xl">
          <form className="flex gap-2 p-1" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) creer.mutate(); }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouvelle liste" className={`${champ} w-full`} />
            <button type="submit" disabled={!nom.trim() || creer.isPending} className={boutonPlein}>Créer</button>
          </form>
          {figees.length > 0 && <p className="m-0 px-3 pb-1 pt-2 text-[11px] uppercase tracking-[.14em] text-brume">Ou dans une liste</p>}
          {figees.map((l) => <button key={l.id} type="button" onClick={() => ajouter.mutate({ id: l.id })} className="flex w-full items-center justify-between gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] text-encre hover:bg-relief" style={{ background: "transparent" }}><span className="truncate">{l.nom}</span><span className="text-[12px] text-brume">{l.n}</span></button>)}
        </div>
      )}
    </div>
  );
}

export default function Recherche({ territoires, territoire, onTerritoire, locaux, visibles, f, setF, chargement, panneau, fiche, onOuvrirLocal, onOuvrirProprietaire, onCourriers, statuts, rafraichir, menu = null, bascule = null }) {
  const [panneauFiltres, setPanneauFiltres] = useState(false);
  const [menuTerritoire, setMenuTerritoire] = useState(false);
  const [menuRecherches, setMenuRecherches] = useState(false);
  const [vue, setVue] = useState("locaux");
  const [page, setPage] = useState(0);
  const [coches, setCoches] = useState(() => new Set());
  const [sauver, setSauver] = useState(false);
  const [nom, setNom] = useState("");
  const [cherche, setCherche] = useState("");
  const listes = useOffMarket(["listes"], "/listes");
  const [nouvelle, setNouvelle] = useState(false);
  const [villeNom, setVilleNom] = useState("");
  const lire = useMutation({
    mutationFn: ({ nom, code_postal }) => req("POST", "/territoires", { nom, code_postal }),
    onSuccess: (r) => { toast.success(`Lecture de ${r.territoire.nom} lancée : rues, vitrines, propriétaires. Les murs arrivent au fil de l'eau.`); setNouvelle(false); setMenuTerritoire(false); setVilleNom(""); rafraichir(); onTerritoire(r.territoire.id); },
    onError: (e) => toast.error(e?.message || "Lecture impossible"),
  });
  const arreter = useMutation({ mutationFn: (id) => req("POST", `/territoires/${id}/arreter`, {}), onSuccess: () => { toast.success("Arrêt demandé : la lecture finit l'adresse en cours et s'arrête."); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  // Le « + » : un seul champ, les communes proposées dessous, un clic lance la lecture.
  const communes = useOffMarket(["communes", villeNom.trim()], `/communes?q=${encodeURIComponent(villeNom.trim())}`, { enabled: nouvelle && villeNom.trim().length >= 2, staleTime: 60_000 });
  const formulaireVille = (
    <div className="flex w-full flex-col gap-2 rounded-bloc border border-bord-vif bg-surface-pleine p-3">
      <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Lire une nouvelle ville</p>
      <input autoFocus value={villeNom} onChange={(e) => setVilleNom(e.target.value)} placeholder="Tapez le nom de la ville" className={`${champ} w-full`} onKeyDown={(e) => { if (e.key === "Escape") setNouvelle(false); }} />
      <div className="flex flex-col">
        {communes.isFetching && !communes.data && <p className="m-0 px-3 py-2 text-[12.5px] text-brume">Recherche…</p>}
        {(communes.data?.communes || []).map((c) => {
          const deja = territoires.find((v) => v.nom.toLowerCase() === c.nom.toLowerCase());
          return (
            <button key={`${c.nom}-${c.code_insee}`} type="button" disabled={lire.isPending} onClick={() => { if (deja) { onTerritoire(deja.id); setNouvelle(false); return; } lire.mutate({ nom: c.nom, code_postal: c.code_postal }); }} className="flex w-full flex-col items-start rounded-champ px-3 py-2 text-left hover:bg-relief" style={{ background: "transparent" }}>
              <span className="flex w-full items-baseline justify-between gap-2 text-[13.5px] text-encre"><span>{c.nom}<span className="text-ardoise"> · {c.code_postal}</span></span>{deja && <span className="flex-none text-[12px] text-menthe">{deja.lecture?.etat === "en_cours" ? "en lecture" : `déjà lue · ${deja.locaux}`}</span>}</span>
              <span className="text-[12px] text-brume">{c.contexte?.split(",").slice(1).join(",").trim()}</span>
            </button>
          );
        })}
        {villeNom.trim().length >= 2 && communes.data && !communes.data.communes.length && <p className="m-0 px-3 py-2 text-[12.5px] text-brume">Aucune commune à ce nom.</p>}
      </div>
      {lire.isPending && <p className="m-0 inline-flex items-center gap-2 px-3 text-[12.5px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lancement…</p>}
      <p className="m-0 text-[12px] text-brume">Un clic lance la lecture : rues classées, vitrines, propriétaires au cadastre. Les murs arrivent au fil de l'eau.</p>
    </div>
  );
  const lecture = territoire?.lecture;
  const enLecture = lecture?.etat === "en_cours";
  const recherches = (listes.data?.listes || []).filter((l) => l.dynamique);
  const rapides = useMemo(() => compterRapides(locaux), [locaux]);
  const nCriteres = nbCriteres(f);
  useEffect(() => { setPage(0); setCoches(new Set()); }, [visibles]);
  const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  const pageLocaux = visibles.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const numerotes = useMemo(() => new Map(pageLocaux.map((l, i) => [l.id, page * PAR_PAGE + i + 1])), [pageLocaux, page]);
  const sauvegarder = useMutation({
    mutationFn: ({ nom: n, filtres }) => req("POST", "/listes", { nom: n, dynamique: true, filtres: { ...filtres, villes: territoire ? [territoire.id] : [] } }),
    onSuccess: (r) => { toast.success(`Recherche « ${r.liste.nom} » sauvegardée : elle se rejoue à chaque ouverture`); setNom(""); setSauver(false); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const charger = (r) => { const ff = { ...FILTRES_VIDES, ...(r.filtres || {}) }; delete ff.villes; if (r.filtres?.villes?.[0] && territoires.some((v) => v.id === r.filtres.villes[0])) onTerritoire(r.filtres.villes[0]); setF(ff); setMenuRecherches(false); };
  const basculerRapide = (cle) => setF((x) => ({ ...x, rapides: x.rapides.includes(cle) ? x.rapides.filter((c) => c !== cle) : [...x.rapides, cle] }));
  const toutCocher = () => setCoches((s) => (pageLocaux.every((l) => s.has(l.id)) ? new Set() : new Set(pageLocaux.map((l) => l.id))));
  const clesExactes = (ls) => [...new Set(ls.filter((l) => l.proprietaire?.cle && l.confiance === "exacte" && !l.exclu && !l.suivi?.oppose).map((l) => l.proprietaire.cle))];
  const selection = visibles.filter((l) => coches.has(l.id));

  return (
    <div className="flex flex-col gap-4">
      {/* La barre de contexte ; à droite, la place du bouton « Il me rappelle » du cadre */}
      <div className="flex flex-wrap items-center gap-2 md:pr-16">
        <div className="relative flex h-10 min-w-[260px] items-stretch rounded-full border border-bord-vif bg-fond max-md:min-w-0">
          {(
            <button type="button" onClick={() => { setNouvelle((n) => !n); setMenuTerritoire(false); }} aria-expanded={nouvelle && !menuTerritoire} aria-label="Lire une nouvelle ville" title="Lire une nouvelle ville" className="grid w-10 flex-none place-items-center rounded-l-full border-r border-bord-vif text-encre hover:text-menthe" style={{ background: "transparent" }}><Plus className="h-4.5 w-4.5" strokeWidth={1.8} /></button>
          )}
          <button type="button" onClick={() => { setMenuTerritoire((m) => !m); setNouvelle(false); }} aria-expanded={menuTerritoire} className="inline-flex min-w-0 flex-1 items-center justify-between gap-2 rounded-r-full px-3.5 text-[14px] text-encre hover:text-menthe" style={{ background: "transparent" }}>
            <span className="truncate">{territoire ? `${territoire.nom}${territoire.code_postal ? ` (${territoire.code_postal.slice(0, 2)})` : ""}` : "Choisir un territoire"}</span>
            <span className="flex items-center gap-2 text-[12.5px] text-ardoise">{territoire && nMurs(territoire.locaux)}<ChevronDown className="h-4 w-4" /></span>
          </button>
          {nouvelle && !menuTerritoire && <div className="absolute left-0 top-12 z-30 w-[340px]">{formulaireVille}</div>}
          {menuTerritoire && (
            <div className="absolute left-0 top-12 z-30 w-[340px] rounded-bloc border border-bord-doux bg-surface-pleine p-2 shadow-xl">
              <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher une ville" className={`${champ} mb-1 w-full`} />
              {!nouvelle && <button type="button" onClick={() => { setNouvelle(true); setVilleNom(cherche); }} className="mb-1 flex w-full items-center gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] text-menthe hover:bg-relief" style={{ background: "transparent" }}><Plus className="h-4 w-4" />Lire une nouvelle ville{cherche ? ` : ${cherche}` : ""}</button>}
              {nouvelle && <div className="mb-2">{formulaireVille}</div>}
              <div className="max-h-[320px] overflow-y-auto">
                {territoires.filter((v) => !cherche || v.nom.toLowerCase().includes(cherche.toLowerCase())).map((v) => (
                  <button key={v.id} type="button" onClick={() => { onTerritoire(v.id); setMenuTerritoire(false); setCherche(""); }} className={`flex w-full items-center justify-between gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] hover:bg-relief ${v.id === territoire?.id ? "text-encre" : "text-craie"}`} style={{ background: "transparent" }}>
                    <span className="truncate">{v.nom}{v.code_postal ? <span className="text-ardoise"> · {v.code_postal.slice(0, 2)}</span> : null}{v.lecture?.etat === "en_cours" && <span className="text-menthe"> · en lecture</span>}</span><span className="text-[12px] tabular-nums text-brume">{v.locaux}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative h-10 w-[360px] max-md:w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brume" />
          <input value={f.cherche} onChange={(e) => setF((x) => ({ ...x, cherche: e.target.value }))} placeholder="Adresse, enseigne, société, rue, parcelle…" className={`${champ} h-full w-full pl-9`} />
        </div>
        {lecture && (enLecture || lecture.etat === "erreur") && (
          <span className={`inline-flex h-10 max-w-[420px] items-center gap-2 rounded-full border px-3.5 text-[12.5px] ${enLecture ? "border-menthe text-encre" : "border-alerte/50 text-craie"}`} title={lecture.rue_en_cours ? `Rue en cours : ${lecture.rue_en_cours}` : undefined}>
            {enLecture ? <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-menthe" /> : null}
            <span className="truncate">{enLecture ? `Lecture en cours${lecture.rue_en_cours ? ` · ${lecture.rue_en_cours}` : ""} · ${lecture.rues_faites}/${lecture.rues_total || "?"} rues · ${nMurs(lecture.cibles_creees)}` : "La lecture s'est arrêtée sur une erreur"}</span>
            {enLecture && <button type="button" onClick={() => arreter.mutate(territoire.id)} disabled={arreter.isPending} aria-label="Arrêter la lecture" title="Arrêter la lecture" className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Square className="h-3 w-3" /></button>}
          </span>
        )}
        <span className="flex-1 max-md:hidden" />
        <button type="button" onClick={() => setPanneauFiltres(true)} className={`${boutonPlein} h-10 ${nCriteres ? "" : "bg-encre text-fond hover:bg-encre"}`}><SlidersHorizontal className="h-4 w-4" />Filtrer{nCriteres > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-fond/25 px-1 text-[11.5px]">{nCriteres}</span>}</button>
        {sauver ? (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) sauvegarder.mutate({ nom: nom.trim(), filtres: f }); }}>
            <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la recherche" className={`${champ} h-10 w-[220px]`} />
            <button type="submit" disabled={!nom.trim() || sauvegarder.isPending} className={`${bouton} h-10`}><Check className="h-4 w-4" />Enregistrer</button>
            <button type="button" onClick={() => setSauver(false)} className="grid h-10 w-10 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }} aria-label="Annuler"><X className="h-4 w-4" /></button>
          </form>
        ) : <button type="button" onClick={() => setSauver(true)} className={`${bouton} h-10`} title="La recherche devient une liste dynamique, rejouée à chaque ouverture et surveillée la nuit">Sauvegarder</button>}
        <button type="button" onClick={() => setF({ ...FILTRES_VIDES })} disabled={!nCriteres && !f.cherche} className={`${bouton} h-10`}>Tout effacer</button>
        {bascule}
        {menu}
      </div>

      {/* Les listes rapides : une seule bande, un filet entre chaque compteur */}
      <div className="flex items-stretch overflow-x-auto rounded-bloc border border-trait bg-surface [scrollbar-width:thin]">
        {RAPIDES.map((r, i) => {
          const actif = f.rapides.includes(r.cle);
          return (
            <button key={r.cle} type="button" onClick={() => basculerRapide(r.cle)} aria-pressed={actif} title={r.aide} className={`flex min-w-[120px] flex-1 flex-col items-start px-4 py-3 text-left transition-colors ${i > 0 ? "border-l border-trait" : ""} ${actif ? "bg-menthe/10" : "hover:bg-relief/40"}`} style={actif ? undefined : { background: "transparent" }}>
              <span className={`text-[22px] leading-none tabular-nums ${actif ? "text-menthe" : "text-encre"}`}>{rapides[r.cle] ?? 0}</span>
              <span className={`mt-1.5 text-[12px] leading-[1.2] ${actif ? "text-encre" : "text-ardoise"}`}>{r.nom}</span>
            </button>
          );
        })}
        <div className="relative flex flex-none border-l border-trait">
          <button type="button" onClick={() => setMenuRecherches((m) => !m)} aria-expanded={menuRecherches} className="flex flex-col items-start justify-center px-4 py-3 text-left hover:bg-relief/40" style={{ background: "transparent" }}>
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-[14px] text-encre"><FolderOpen className="h-4 w-4 text-menthe" />Recherches sauvegardées</span>
            <span className="mt-1 text-[12px] text-ardoise">{recherches.length ? pl(recherches.length, "recherche") : "aucune encore"}</span>
          </button>
          {menuRecherches && (
            <div className="absolute right-0 top-[66px] z-30 w-[320px] rounded-bloc border border-bord-doux bg-surface-pleine p-2 shadow-xl">
              {!recherches.length && <p className="m-0 px-3 py-3 text-[13px] text-brume">Filtrez, puis « Sauvegarder » : la recherche se rejoue d'un clic.</p>}
              {recherches.map((r) => <button key={r.id} type="button" onClick={() => charger(r)} className="flex w-full items-center justify-between gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] text-encre hover:bg-relief" style={{ background: "transparent" }}><span className="truncate">{r.nom}</span><span className="flex-none text-[12px] text-brume">{nbCriteres(r.filtres || {})} critères</span></button>)}
            </div>
          )}
        </div>
      </div>

      {/* La carte et la liste */}
      {!territoire ? <Vide>Choisissez un territoire.</Vide> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_560px] lg:grid-cols-[minmax(0,1fr)_480px]">
          <CarteOffMarket locaux={visibles} centre={territoire.centre} ouvertId={panneau?.type === "local" ? panneau.id : null} onOuvrir={onOuvrirLocal} numerotes={numerotes} polygone={f.polygone} onPolygone={(p) => setF((x) => ({ ...x, polygone: p }))} libellesProfils={LIBELLES_PROFILS} className="h-[calc(100vh-220px)] min-h-[520px] max-md:h-[380px] max-md:min-h-0" />
          <div className="flex min-h-0 flex-col rounded-bloc border border-trait bg-surface" style={{ height: "calc(100vh - 220px)", minHeight: 520 }}>
            {panneau ? <div className="min-h-0 flex-1 overflow-hidden">{fiche}</div> : (<>
              <div className="flex flex-wrap items-center gap-2 border-b border-trait px-3 py-2.5">
                {vue === "locaux" && <Case oui={pageLocaux.length > 0 && pageLocaux.every((l) => coches.has(l.id))} onBasculer={toutCocher} label="Tout cocher sur la page" disabled={!pageLocaux.length} />}
                <div className="inline-flex rounded-full border border-bord-vif p-[3px]">
                  {[["locaux", `Murs (${visibles.length})`], ["proprietaires", "Propriétaires"]].map(([k, mot]) => <button key={k} type="button" onClick={() => setVue(k)} className={`h-7 rounded-full px-3 text-[12.5px] ${vue === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={vue === k ? undefined : { background: "transparent" }}>{mot}</button>)}
                </div>
                {chargement && <Loader2 className="h-4 w-4 animate-spin text-ardoise" />}
                <span className="flex-1" />
                {vue === "locaux" && <>
                  <AjouterEnListe ids={selection.map((l) => l.id)} onFait={() => { setCoches(new Set()); rafraichir(); }} />
                  <button type="button" onClick={() => onCourriers(clesExactes(selection.length ? selection : visibles).slice(0, 30))} disabled={!visibles.length} className={boutonPlein} title={selection.length ? "Les propriétaires exacts de la sélection" : "Les 30 premiers propriétaires exacts du classement"}><Sparkles className="h-3.5 w-3.5" />Courriers</button>
                </>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {vue === "proprietaires" ? <div className="p-3"><Proprietaires locaux={visibles} statuts={statuts} onProprietaire={onOuvrirProprietaire} onCourriers={onCourriers} /></div> : (<>
                  {pageLocaux.map((l, i) => <CarteBien key={l.id} l={l} n={page * PAR_PAGE + i + 1} coche={coches.has(l.id)} onCocher={() => setCoches((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} onOuvrir={() => onOuvrirLocal(l)} ouvert={false} />)}
                  {!visibles.length && <Vide>Aucun bien ne passe ces filtres.</Vide>}
                </>)}
              </div>
              {vue === "locaux" && visibles.length > PAR_PAGE && (
                <div className="flex items-center justify-between gap-2 border-t border-trait px-3 py-2 text-[12.5px] text-ardoise">
                  <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className={`${bouton} h-8`}><ChevronLeft className="h-4 w-4" />Précédents</button>
                  <span>{page * PAR_PAGE + 1} à {Math.min(visibles.length, (page + 1) * PAR_PAGE)} sur {visibles.length}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} className={`${bouton} h-8`}>Suivants<ChevronRight className="h-4 w-4" /></button>
                </div>
              )}
            </>)}
          </div>
        </div>
      )}

      <PanneauFiltres ouvert={panneauFiltres} onFermer={() => setPanneauFiltres(false)} f={f} onAppliquer={(d) => setF(d)} locaux={locaux} territoire={territoire} recherches={recherches} onSauvegarder={(n, d) => { setF(d); sauvegarder.mutate({ nom: n, filtres: d }); }} onCharger={charger} statuts={statuts} />
    </div>
  );
}
