import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Loader2, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { chargerGoogleMaps } from "@/components/kzoning/CarteGoogleZones";
import { JL } from "@/design/jetons";

// Prospecter, par Data Prospective. Le dialogue se tient dans le chat de la
// page (même structure que le dashboard) : quelle zone, une rue ou toute la
// ville, puis recherche multicritère ou suggestion intelligente. Ici : la
// grande fenêtre du multicritère (la zone déjà remplie), sa trace dans le fil,
// et la page de résultats — carte et liste à cocher, à exporter vers les
// listes d'appels.

const API = "/api/mandataire";
const TEINTES_RUE = { 5: JL["menthe"], 4: JL["menthe-clair"], 3: JL["ambre"], 2: JL["craie"], 1: JL["brume"] };

const Chip = ({ actif = false, onClick, children }) => (
  <button type="button" onClick={onClick}
    className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/[0.14] text-encre" : "border-trait text-craie hover:border-bord-vif hover:text-encre"}`}
    style={actif ? undefined : { background: "transparent" }}>
    {children}
  </button>
);

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Choisir une ville Data-B : seulement si la zone n'a pas été donnée dans le chat. */
function ChoixVille({ onChoisir }) {
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["m-prospective-villes", q],
    queryFn: () => base44.request("GET", `${API}/prospective/villes?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  return (
    <div className="space-y-2.5">
      <label className="flex h-11 max-w-[420px] items-center gap-2.5 rounded-full border border-trait bg-surface px-4 focus-within:border-menthe">
        <Search className="h-4 w-4 flex-none text-ardoise" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mâcon, Charnay…" autoFocus
          className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
        {isFetching && <Loader2 className="h-4 w-4 animate-spin text-brume" />}
      </label>
      {(data?.villes || []).slice(0, 6).map((v) => (
        <button key={v.valeur} type="button" onClick={() => onChoisir(v)}
          className="flex w-full max-w-[420px] items-center gap-2.5 rounded-[12px] border border-trait px-4 py-2.5 text-left text-[13.5px] text-encre transition-colors hover:border-menthe" style={{ background: "transparent" }}>
          <MapPin className="h-3.5 w-3.5 flex-none text-ardoise" /> {v.nom}
        </button>
      ))}
    </div>
  );
}

// Les familles de critères, dans l'ordre que le métier a donné.
const ORDRE_FILTRES = [
  ["type_entreprise", "Type d'entreprise"], ["nb_etablissements", "Nombre d'établissements"], ["solvabilite", "Solvabilité"],
  ["type_rue", "Typologie de la rue"], ["effectif", "Effectif de l'établissement"], ["date_creation", "Date de création"],
  ["inde_enseigne", "Indépendant ou enseigne"], ["age_gerant", "Âge du dirigeant"], ["immobilier", "Immobilier"], ["contact", "Coordonnées connues"],
];

/**
 * La recherche multicritère, en grande fenêtre par-dessus la page. La zone
 * vient de la conversation (ville, rue) : elle s'affiche en titre, elle ne se
 * redemande pas. À gauche les métiers (liste cherchable à cocher), à droite
 * les familles de critères en pastilles, en bas le récapitulatif et
 * « Lancer la prospective ».
 */
export function FenetreMulticriteres({ ville: villeDonnee = null, rue = null, onFermer, onLance }) {
  const { data: ref } = useQuery({ queryKey: ["m-prospective-ref"], queryFn: () => base44.request("GET", `${API}/prospective/metiers`), staleTime: Infinity });
  const [ville, setVille] = useState(villeDonnee);
  const [metiers, setMetiers] = useState([]);
  const [qMetier, setQMetier] = useState("");
  const [filtres, setFiltres] = useState({});

  // Échap ferme ; la page derrière ne défile plus tant que la fenêtre est
  // ouverte. Posé une fois : le parent repasse un onFermer neuf à chaque rendu.
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  useEffect(() => {
    const touche = (e) => { if (e.key === "Escape") fermer.current?.(); };
    window.addEventListener("keydown", touche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", touche); document.body.style.overflow = avant; };
  }, []);

  const lancer = useMutation({
    mutationFn: (corps) => base44.request("POST", `${API}/prospective/lancer`, { body: corps }),
    onSuccess: (r) => onLance?.(r),
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });

  const tous = ref?.metiers || {};
  const libelleMetier = (id) => Object.keys(tous).find((k) => tous[k] === id) || id;
  const listeMetiers = useMemo(() => {
    const q = norm(qMetier.trim());
    return Object.entries(tous)
      .filter(([lib]) => !q || norm(lib).includes(q))
      .sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [tous, qMetier]);
  const basculerMetier = (id) => setMetiers((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const basculer = (cle, valeur) => setFiltres((f) => {
    const l = new Set(f[cle] || []);
    if (l.has(valeur)) l.delete(valeur); else l.add(valeur);
    return { ...f, [cle]: [...l] };
  });
  const nbCriteres = Object.values(filtres).reduce((n, l) => n + l.length, 0);
  const zone = ville ? `${ville.nom}${rue ? ` · ${rue.nom}` : " · toute la ville"}` : null;
  const envoyer = () => lancer.mutate({
    nom: [ville.nom, rue?.nom, metiers.length ? metiers.map(libelleMetier).slice(0, 2).join(", ") : null, "multicritère"].filter(Boolean).join(" · "),
    ville, rue, metiers, filtres,
  });

  return createPortal(
    <div className="animate-in fade-in fixed inset-0 z-[90] flex items-center justify-center bg-fond/70 p-[3vh] backdrop-blur-sm duration-200 max-md:p-0" onClick={onFermer}>
      <div className="animate-in zoom-in-95 flex h-[94vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-[22px] border border-trait bg-surface-pleine shadow-[0_30px_80px_rgb(0_0_0/0.35)] duration-200 max-md:h-full max-md:rounded-none"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Recherche multicritère">
        <header className="flex flex-none items-start justify-between gap-4 border-b border-trait px-8 py-6 max-md:px-5 max-md:py-4">
          <div className="min-w-0">
            <p className="m-0 font-mono text-[11px] uppercase tracking-[.18em] text-brume">Recherche multicritère</p>
            <h2 className="m-0 mt-1.5 truncate text-[24px] font-normal tracking-[-0.01em] text-encre max-md:text-[20px]">{zone || "La ville de la prospective"}</h2>
            <p className="m-0 mt-1 text-[13px] text-ardoise">Tout est facultatif : cochez ce qui compte, Data-B fait le reste.</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-10 w-10 flex-none place-items-center rounded-full text-ardoise hover:bg-encre/[0.06] hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-5 w-5" />
          </button>
        </header>

        {!ville ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7 max-md:px-5">
            <ChoixVille onChoisir={setVille} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden">
            {/* Les métiers : une liste cherchable à cocher, les choisis en tête. */}
            <section className="flex flex-col border-trait px-8 py-6 max-md:px-5 lg:min-h-0 lg:border-r">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="m-0 text-[15px] font-medium text-encre">Métiers</h3>
                <span className="text-[12.5px] text-ardoise">{metiers.length ? `${metiers.length} choisi${metiers.length > 1 ? "s" : ""}` : "Tous les commerces"}</span>
              </div>
              <label className="mt-3 flex h-10 items-center gap-2.5 rounded-full border border-trait bg-surface px-4 focus-within:border-menthe">
                <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
                <input value={qMetier} onChange={(e) => setQMetier(e.target.value)} placeholder="Boulangerie, pharmacie…"
                  className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume" />
              </label>
              {metiers.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {metiers.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1.5 rounded-full bg-menthe/[0.14] py-1 pl-3 pr-2 text-[12.5px] text-encre">
                      {libelleMetier(id)}
                      <button type="button" onClick={() => basculerMetier(id)} aria-label={`Retirer ${libelleMetier(id)}`} className="text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 max-h-[320px] overflow-y-auto rounded-[14px] border border-trait lg:max-h-none lg:min-h-0 lg:flex-1">
                {listeMetiers.map(([lib, id]) => {
                  const oui = metiers.includes(id);
                  return (
                    <button key={id} type="button" onClick={() => basculerMetier(id)}
                      className="flex w-full items-center gap-3 border-b border-trait px-3.5 py-2.5 text-left text-[13.5px] transition-colors last:border-b-0 hover:bg-encre/[0.03]"
                      style={{ background: oui ? "rgb(var(--k-menthe-rgb) / 0.07)" : "transparent" }}>
                      <Case oui={oui} />
                      <span className={oui ? "text-encre" : "text-craie"}>{lib}</span>
                    </button>
                  );
                })}
                {!listeMetiers.length && <p className="m-0 px-3.5 py-4 text-[13px] text-brume">Aucun métier ne correspond.</p>}
              </div>
            </section>

            {/* Les critères : toutes les familles visibles, en pastilles. */}
            <div className="grid content-start gap-x-10 gap-y-7 px-8 py-6 max-md:px-5 md:grid-cols-2 lg:min-h-0 lg:overflow-y-auto">
              {ORDRE_FILTRES.map(([cle, titre]) => {
                const valeurs = ref?.filtres?.[cle] || {};
                const n = (filtres[cle] || []).length;
                return (
                  <section key={cle}>
                    <h3 className="m-0 text-[14px] font-medium text-encre">
                      {titre}{n > 0 && <span className="ml-2 text-[12px] font-normal text-menthe">{n}</span>}
                    </h3>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {Object.entries(valeurs).map(([v, lib]) => (
                        <Chip key={v} actif={(filtres[cle] || []).includes(v)} onClick={() => basculer(cle, v)}>{lib}</Chip>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        <footer className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-trait px-8 py-4 max-md:px-5">
          <div className="flex flex-wrap items-center gap-4 text-[13px] text-ardoise">
            <span>
              {metiers.length ? `${metiers.length} métier${metiers.length > 1 ? "s" : ""}` : "Tous les commerces"}
              {" · "}
              {nbCriteres ? `${nbCriteres} critère${nbCriteres > 1 ? "s" : ""}` : "aucun critère"}
            </span>
            {(metiers.length > 0 || nbCriteres > 0) && (
              <button type="button" onClick={() => { setMetiers([]); setFiltres({}); }} className="text-[13px] text-brume underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>
                Tout effacer
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onFermer} className="h-11 rounded-full border border-trait px-5 text-[14px] text-craie hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
            <button type="button" onClick={envoyer} disabled={!ville || lancer.isPending}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[14px] font-medium text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50">
              {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Lancer la prospective
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Dans le fil : la trace du formulaire ouvert, pour le rouvrir d'un clic. */
export function CarteCriteres({ donnees, onOuvrir }) {
  const zone = donnees?.ville ? `${donnees.ville.nom}${donnees.rue ? ` · ${donnees.rue.nom}` : " · toute la ville"}` : null;
  return (
    <button type="button" onClick={onOuvrir}
      className="flex w-full max-w-[480px] items-center gap-4 rounded-[18px] border border-trait px-5 py-4 text-left transition-colors hover:border-menthe" style={{ background: "transparent" }}>
      <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-menthe/[0.14] text-menthe"><SlidersHorizontal className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-encre">Recherche multicritère</span>
        <span className="block truncate text-[13px] text-ardoise">{zone || "Ouvrir le formulaire"}</span>
      </span>
      <span className="flex-none text-[13px] text-menthe">Ouvrir</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Les résultats : la liste à cocher à gauche, la carte à droite, l'export en bas.
// ---------------------------------------------------------------------------

export function ResultatsProspective({ jeton, onRetour }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ["m-prospective-res", jeton, page],
    queryFn: () => base44.request("GET", `${API}/prospective/${jeton}/resultats?page=${page}`),
  });
  const { data: listesData } = useQuery({ queryKey: ["m-listes"], queryFn: () => base44.request("GET", `${API}/listes`) });
  const [coches, setCoches] = useState(() => new Map()); // siret → ligne
  const [nouvelle, setNouvelle] = useState(null);
  const [cible, setCible] = useState("");
  const lignes = data?.resultats || [];

  const exporter = useMutation({
    mutationFn: (corps) => base44.request("POST", `${API}/prospective/${jeton}/exporter`, { body: { ...corps, lignes: [...coches.values()] } }),
    onSuccess: (r) => {
      toast.success(`${r.ajoutes} commerce${r.ajoutes > 1 ? "s" : ""} dans « ${r.liste.nom} »`, { description: r.refuses?.length ? `${r.refuses.length} déjà suivi${r.refuses.length > 1 ? "s" : ""}` : undefined });
      setCoches(new Map()); setNouvelle(null);
      for (const k of [["m-listes"], ["mandataire-jour"], ["mandataire-proprietaires"]]) queryClient.invalidateQueries({ queryKey: k });
    },
    onError: (e) => toast.error(e?.message || "Export impossible"),
  });
  const basculer = (l) => setCoches((c) => { const n = new Map(c); n.has(l.siret) ? n.delete(l.siret) : n.set(l.siret, l); return n; });
  const tout = lignes.length > 0 && lignes.every((l) => coches.has(l.siret));

  if (isLoading) return <p className="m-0 py-10 text-center text-[13.5px] text-brume">Data-B prépare la prospective…</p>;
  if (error || !data) return <p className="m-0 py-10 text-center text-[13.5px] text-alerte">{error?.message || "Prospective introuvable."}</p>;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 mx-auto mt-6 max-w-[1400px] duration-300">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait pb-3">
        <button type="button" onClick={onRetour} className="inline-flex items-center gap-1 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
          <ChevronLeft className="h-4 w-4" /> Prospecter
        </button>
        <p className="m-0 min-w-0 flex-1 truncate text-center text-[15px] text-encre">{data.prospective?.nom}</p>
        <span className="text-[13px] tabular-nums text-ardoise">{data.total} établissement{data.total > 1 ? "s" : ""} · Data-B</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[440px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col rounded-[16px] border border-trait bg-surface-pleine lg:h-[640px]">
          <div className="flex items-center gap-3 border-b border-trait px-4 py-3">
            <button type="button" onClick={() => setCoches(tout ? new Map() : new Map(lignes.map((l) => [l.siret, l])))} disabled={!lignes.length}
              className="inline-flex items-center gap-2 text-[13px] text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
              <Case oui={tout} /> {tout ? "Tout décocher" : "Tout cocher"}
            </button>
            <span className="ml-auto text-[12.5px] tabular-nums text-ardoise">{coches.size} coché{coches.size > 1 ? "s" : ""}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-[52vh]">
            {!lignes.length && <p className="m-0 px-4 py-6 text-[13.5px] text-brume">Rien ne répond à ces critères ici.</p>}
            {lignes.map((l) => {
              const oui = coches.has(l.siret);
              return (
                <button key={l.siret} type="button" onClick={() => basculer(l)}
                  className="flex w-full items-start gap-3 border-b border-trait px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-encre/[0.03]"
                  style={{ background: oui ? "rgb(var(--k-menthe-rgb) / 0.07)" : "transparent" }}>
                  <span className="pt-0.5"><Case oui={oui} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-encre">{l.enseigne || l.nom}</span>
                      {l.type_rue_mot && <span className="flex-none rounded border px-1.5 text-[10.5px]" style={{ borderColor: TEINTES_RUE[l.type_rue] || JL["bord-vif"], color: TEINTES_RUE[l.type_rue] || JL["ardoise"] }}>{l.type_rue_mot}</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ardoise">{[l.adresse, l.ville].filter(Boolean).join(" · ")}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-craie">
                      {[l.telephone, l.independant ? "Indépendant" : "Enseigne", l.solvabilite, l.effectif && `${l.effectif} sal.`, l.creation && `depuis ${l.creation}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {data.pages > 1 && (
            <div className="flex items-center justify-between border-t border-trait px-4 py-2.5 text-[12.5px] text-ardoise">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30" style={{ background: "transparent" }}>← Précédents</button>
              <span className="tabular-nums">Page {page} / {data.pages}</span>
              <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30" style={{ background: "transparent" }}>Suivants →</button>
            </div>
          )}
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
                <button type="button" disabled={!coches.size} onClick={() => setNouvelle(data.prospective?.nom || "Prospective")}
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

        <CarteProspective lignes={lignes} coches={coches} onBasculer={basculer} />
      </div>
    </div>
  );
}

function CarteProspective({ lignes, coches, onBasculer }) {
  const ref = useRef(null);
  const carte = useRef(null);
  const marqueurs = useRef([]);
  useEffect(() => {
    let vivant = true;
    chargerGoogleMaps().then((google) => {
      if (!vivant || !ref.current || carte.current) return;
      carte.current = new google.maps.Map(ref.current, {
        center: { lat: 46.5, lng: 4.8 }, zoom: 13, mapTypeControl: false, streetViewControl: true, fullscreenControl: false,
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
    }).catch(() => {});
    return () => { vivant = false; };
  }, []);
  useEffect(() => {
    const g = window.google;
    if (!g?.maps || !carte.current) return;
    for (const m of marqueurs.current) m.setMap(null);
    marqueurs.current = [];
    const bornes = new g.maps.LatLngBounds();
    for (const l of lignes) {
      if (l.lat == null || l.lon == null) continue;
      const position = { lat: Number(l.lat), lng: Number(l.lon) };
      const m = new g.maps.Marker({
        map: carte.current, position, title: `${l.enseigne || l.nom} · ${l.adresse || ""}`,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: coches.has(l.siret) ? 9 : 6.5, fillColor: TEINTES_RUE[l.type_rue] || JL["brume"], fillOpacity: 0.95, strokeColor: JL["fond"], strokeWeight: 1.5 },
      });
      m.addListener("click", () => onBasculer(l));
      marqueurs.current.push(m);
      bornes.extend(position);
    }
    if (!bornes.isEmpty()) carte.current.fitBounds(bornes, 60);
  }, [lignes, coches, onBasculer]);
  return (
    <div className="overflow-hidden rounded-[16px] border border-trait">
      <div ref={ref} className="h-[640px] w-full max-lg:h-[380px]" />
    </div>
  );
}

const Case = ({ oui }) => (
  <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border"
    style={{ borderColor: oui ? JL["menthe"] : JL["bord-vif"], background: oui ? JL["menthe"] : "transparent" }}>
    {oui && <Check className="h-3 w-3" style={{ color: JL["sur-menthe"] }} />}
  </span>
);
