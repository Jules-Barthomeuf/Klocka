import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Play, Loader2, ChevronLeft, ChevronDown, Trash2, Check, X, Clock, Phone, Mail, Globe, ExternalLink, SlidersHorizontal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import CarteCommerces, { familleDe } from "@/components/kdata/CarteCommerces";
import FondHalo from "@/components/projet/FondHalo";
import { effectif } from "@/components/kzoning/FicheSociete";
import { BoutonMecanique } from "@/components/kdata/Mecanique";

// K-Prospective : les commerces d'une zone qui répondent à des critères.
//
// Trois écrans. Le départ : un type de commerce, une adresse, un rayon, et
// un volet de critères — chaque groupe dit sa source, et une option sans
// source ouverte se montre grisée plutôt que de promettre. Le chargement,
// étape par étape. Puis les résultats : la liste à gauche, qui défile seule,
// et la carte à droite, qui ne bouge pas. Un commerce cliqué ouvre sa fiche,
// bâtie comme celle d'une parcelle dans K-Foncier.
//
// L'habit est celui des cartes du tableau de bord K-Data : bg-surface, filet
// trait, rayon de 18 — jamais de fond noir posé par-dessus la page.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const CARTE = "rounded-[18px] border border-trait bg-surface";
const RAYONS = [250, 500, 1000, 2000];
const ANNEE = new Date().getFullYear();
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const initiales = (nom) => String(nom || "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";
const RUES = { n1: "Rue N°1", tres_commercante: "Rue très commerçante", commercante: "Rue commerçante", semi: "Rue semi commerçante", residentielle: "Rue résidentielle" };

// La mécanique : dans quel ordre K-Prospective interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "OpenStreetMap", quoi: "Les devantures de la zone pour le type d'activité choisi : nom, rue, et souvent le SIRET." },
  { source: "Annuaire des entreprises", quoi: "La société derrière chaque devanture — par SIRET quand il est là, sinon par nom dans la commune, l'établissement le plus proche du point." },
  { source: "Fichier des personnes morales (DGFiP)", quoi: "Les murs : la parcelle et son propriétaire, quand c'est une personne morale." },
  { source: "Vos critères", quoi: "Appliqués à ce qu'on sait vraiment. La solvabilité chiffrée, le prix d'acquisition et l'échéance d'un bail n'ont pas de source ouverte : ces options sont grisées plutôt que devinées." },
];

function Ligne({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-trait py-2 text-[13px]">
      <span className="flex-shrink-0 text-ardoise">{label}</span>
      <span className="min-w-0 text-right text-encre">{children ?? "—"}</span>
    </div>
  );
}

// ── Le volet des critères ──────────────────────────────────────────────────

function Criteres({ groupes, choix, onChoix }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {groupes.map((g) => {
        const actifs = choix[g.cle] || [];
        return (
          <div key={g.cle} className="rounded-[14px] border border-trait bg-relief p-3">
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-encre">{g.nom}</p>
            <p className="m-0 mb-2 text-[10.5px] text-brume">Source : {g.source}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.options.map((op) => {
                const actif = actifs.includes(op.valeur);
                return (
                  <button
                    key={op.valeur} type="button" disabled={op.indisponible} title={op.indisponible ? op.pourquoi : op.aide || ""}
                    onClick={() => onChoix(g.cle, actif ? actifs.filter((v) => v !== op.valeur) : [...actifs, op.valeur])}
                    className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                      op.indisponible ? "cursor-not-allowed border-trait text-brume/50 line-through" : actif ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:border-bord-doux hover:text-encre"
                    }`}
                  >
                    {op.nom}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Le chargement ──────────────────────────────────────────────────────────

function Chargement({ prospection: p }) {
  return (
    <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Prospection en cours</p>
      <h2 className="mt-2 mb-1 text-[24px] font-light text-encre">{p?.libelle || p?.adresse}</h2>
      <p className="m-0 text-[13px] text-ardoise">{p?.activite} · {p?.rayon_m} m</p>
      <div className="mx-auto mt-8 h-3 w-full overflow-hidden rounded-full bg-relief">
        <div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${Math.max(4, p?.progression || 0)}%` }} />
      </div>
      <p className="m-0 mt-2 text-[12px] tabular-nums text-brume">{p?.progression || 0} %</p>
      <ul className="mx-auto mt-8 m-0 max-w-[520px] list-none space-y-2 p-0 text-left">
        {(p?.etapes || []).map((s) => (
          <li key={s.cle} className="flex items-start gap-3 text-[13px]">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-bord">
              {s.etat === "faite" ? <Check className="h-3 w-3 text-vert" /> : s.etat === "ratee" ? <X className="h-3 w-3 text-alerte" /> : s.etat === "en_cours" ? <Loader2 className="h-3 w-3 animate-spin text-menthe" /> : <Clock className={`h-3 w-3 ${s.etat === "sautee" ? "text-brume/50" : "text-brume"}`} />}
            </span>
            <span className="min-w-0">
              <span className={`block ${s.etat === "a_faire" || s.etat === "sautee" ? "text-brume" : "text-encre"}`}>{s.nom}</span>
              {s.detail && <span className="block text-[11.5px] text-ardoise">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-8 mb-0 text-[11.5px] leading-[1.6] text-brume">Chaque devanture est rapprochée de sa société dans l&apos;annuaire des entreprises : comptez une à deux minutes pour une zone dense. Sources ouvertes, aucun crédit dépensé.</p>
    </div>
  );
}

// ── La fiche d'un commerce, comme celle d'une parcelle ─────────────────────

function FicheCommerce({ commerce: c, point, onFermer }) {
  const s = c.societe;
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);
  const { icone: Icone, couleur } = familleDe(c.categorie);

  return (
    <div className="fixed inset-0 z-[600] flex flex-col">
      <FondHalo />
      <div className="relative z-10 mx-auto flex w-full max-w-[1240px] flex-1 flex-col overflow-hidden px-4 pt-6">
        <div className="mb-4 flex flex-shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <button onClick={onFermer} className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Retour aux résultats</button>
            <p className="alx-mont m-0 flex items-center gap-2 text-[10.5px] uppercase tracking-[.16em] text-menthe-texte">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: couleur }}><Icone className="h-3 w-3 text-fond" /></span>
              {c.metier || c.genre}{c.categorie ? ` · ${c.categorie}` : ""}
            </p>
            <h1 className="m-0 mt-1 truncate text-[24px] font-light text-encre">{c.nom || "Commerce sans nom"}</h1>
            <p className="m-0 mt-1 text-[12px] text-ardoise">{c.adresse ? `${c.adresse}, ` : ""}{point?.label?.split(" ").slice(-2).join(" ")}{c.distance_m != null ? ` · à ${c.distance_m} m de l'adresse` : ""}</p>
          </div>
          <button onClick={onFermer} title="Fermer" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-bord text-ardoise hover:text-encre"><X className="h-4 w-4" /></button>
        </div>

        {/* La colonne de gauche défile seule ; la droite reste en place. */}
        <div className="grid min-h-0 flex-1 gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_460px]">
          <div className={`${CARTE} min-h-0 overflow-y-auto p-4`}>
            <p className="alx-mont m-0 mb-3 text-[10.5px] uppercase tracking-[.14em] text-brume">Le commerce</p>
            <Ligne label="Enseigne">{c.enseigne || c.nom || "—"}</Ligne>
            <Ligne label="Activité relevée">{c.metier || c.genre || "—"}</Ligne>
            <Ligne label="Rue">{c.rue_typologie ? `${RUES[c.rue_typologie]} · ${c.rue_nb_commerces} commerces relevés` : "—"}</Ligne>
            <Ligne label="Horaires">{c.horaires || "—"}</Ligne>
            <Ligne label="Téléphone">{c.telephone ? <a className="text-menthe-texte" href={`tel:${c.telephone}`}>{c.telephone}</a> : "—"}</Ligne>
            <Ligne label="Email">{c.email ? <a className="text-menthe-texte" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</Ligne>
            <Ligne label="Site">{c.site ? <a className="text-menthe-texte" href={c.site} target="_blank" rel="noreferrer">{c.site.replace(/^https?:\/\//, "")}</a> : "—"}</Ligne>

            <p className="alx-mont mt-6 mb-1 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Informations sur l&apos;entreprise</p>
            {s ? (
              <>
                <p className="m-0 mb-2 text-[13px] font-medium text-encre">{s.nom}</p>
                <Ligne label="SIREN"><span className="tabular-nums">{s.siren}</span></Ligne>
                <Ligne label="SIRET de l'établissement"><span className="tabular-nums">{s.siret || "—"}</span></Ligne>
                <Ligne label="Siège">{s.siege ? `${s.siege.adresse || ""} ${s.siege.code_postal || ""} ${s.siege.commune || ""}`.trim() : "—"}</Ligne>
                <Ligne label="Activité">{s.activite_code ? `NAF ${s.activite_code}` : "—"}</Ligne>
                <Ligne label="Création">{s.creation ? quand(s.creation) : "—"}</Ligne>
                <Ligne label="Effectif de l'établissement">{effectif(s.effectif_etablissement || s.effectif)}</Ligne>
                <Ligne label="Établissements ouverts">{s.nombre_etablissements_ouverts ?? s.nombre_etablissements ?? "—"}</Ligne>
                <Ligne label={`Chiffre d'affaires${s.annee_comptes ? ` (${s.annee_comptes})` : ""}`}>{s.ca != null ? euros(s.ca) : "Comptes non déposés"}</Ligne>
                {s.etat === "C" && <p className="m-0 mt-2 text-[12px] text-alerte">Société cessée au registre.</p>}
                {s.dirigeants?.length > 0 && (
                  <>
                    <p className="alx-mont mt-4 mb-2 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">{s.dirigeants.length} dirigeant{s.dirigeants.length > 1 ? "s" : ""}</p>
                    {s.dirigeants.map((d, i) => (
                      <div key={i} className="mb-1.5 flex items-center gap-3 rounded-[10px] border border-trait bg-relief px-3 py-2">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-trait text-[11px] font-semibold text-encre">{initiales(d.nom)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-encre">{d.nom}{d.annee_naissance ? ` - ${ANNEE - Number(d.annee_naissance)} ans` : ""}</span>
                          <span className="block text-[11.5px] text-ardoise">{d.qualite || (d.morale ? "Personne morale" : "Dirigeant")}{d.morale ? " · via la holding" : ""}</span>
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {s.etablissements_gerant != null && <Ligne label="Établissements du gérant">{s.etablissements_gerant}</Ligne>}
                <p className="m-0 mt-2 text-[10.5px] text-brume">Rapprochement : {s.methode}.</p>
                <div className="mt-3">
                  <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${s.siren}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
                    <ExternalLink className="h-3.5 w-3.5" />Annuaire des entreprises
                  </a>
                </div>
              </>
            ) : <p className="m-0 text-[12.5px] text-ardoise">Aucune société n&apos;a pu être rapprochée de cette devanture : ni SIRET sur la fiche OpenStreetMap, ni établissement de ce nom à moins de 300 m dans l&apos;annuaire.</p>}

            {c.foncier && (
              <>
                <p className="alx-mont mt-6 mb-1 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Les murs</p>
                <Ligne label="Parcelle">{c.parcelle ? `${c.parcelle.section} ${c.parcelle.numero} · ${c.parcelle.contenance ?? "—"} m²` : "—"}</Ligne>
                <Ligne label="Propriétaire exploitant">{c.foncier.proprietaire_exploitant ? "Oui" : "Non"}</Ligne>
                <Ligne label="Copropriété">{c.foncier.copropriete ? "Oui" : "Non"}</Ligne>
                {c.foncier.proprietaires?.map((x, i) => <Ligne key={i} label={x.droit || "Propriétaire"}>{x.nom}{x.siren ? ` · ${x.siren}` : ""} · {x.lots} lot{x.lots > 1 ? "s" : ""}</Ligne>)}
              </>
            )}
            <p className="m-0 mt-4 text-[10.5px] italic leading-[1.5] text-brume">Sources : OpenStreetMap pour la devanture, annuaire des entreprises pour la société, fichier des personnes morales (DGFiP) pour les murs.</p>
          </div>

          <div className="flex min-h-0 flex-col gap-4">
            <div className={`${CARTE} overflow-hidden`}>
              <p className="alx-mont m-0 border-b border-trait px-4 py-2.5 text-[10.5px] uppercase tracking-[.14em] text-brume">Vue de la rue</p>
              {CLE_MAPS ? (
                <iframe title="Vue de la rue" className="block h-[260px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
                  src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90`} />
              ) : <p className="m-0 px-4 py-6 text-[12.5px] text-ardoise">Clé Google Maps absente.</p>}
            </div>
            <div className={`${CARTE} relative min-h-[300px] flex-1 overflow-hidden`}>
              <CarteCommerces point={{ lat: c.lat, lon: c.lon, label: c.nom || "" }} rayon_m={80} commerces={[c]} actif={c.id} onErreur={() => {}} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Les résultats ──────────────────────────────────────────────────────────

function Resultats({ prospection: p, onRetour, onSupprimer }) {
  const [ouvert, setOuvert] = useState(null);
  const [actif, setActif] = useState(null);
  const retenus = new Set(p.retenus || []);
  const liste = (p.commerces || []).filter((c) => retenus.has(c.id));
  const ouvrir = useCallback((c) => setOuvert(c), []);
  const survoler = useCallback((c) => setActif(c.id), []);

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1400px] flex-shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-5">
        <div className="min-w-0">
          <button onClick={onRetour} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Toutes les prospections</button>
          <h1 className="m-0 mt-1 truncate text-[22px] font-light text-encre">{p.libelle || p.adresse}</h1>
          <p className="m-0 text-[12px] text-ardoise">{p.activite} · {p.rayon_m} m · {liste.length} commerce{liste.length > 1 ? "s" : ""} retenu{liste.length > 1 ? "s" : ""} sur {p.nb_commerces}</p>
        </div>
        <button onClick={onSupprimer} className="inline-flex items-center gap-1.5 text-[12px] text-brume hover:text-alerte"><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
      </div>

      {/* La liste défile seule ; la carte reste en place. */}
      <div className="mx-auto grid w-full max-w-[1400px] min-h-0 flex-1 gap-4 px-4 pb-4 lg:grid-cols-[440px_minmax(0,1fr)]">
        <div className={`${CARTE} min-h-0 overflow-y-auto p-2`}>
          {!liste.length && <p className="m-0 p-4 text-[13px] text-ardoise">Aucun commerce ne répond à ces critères dans la zone.</p>}
          {liste.map((c) => {
            const { icone: Icone, couleur } = familleDe(c.categorie);
            const s = c.societe;
            return (
              <button key={c.id} onClick={() => ouvrir(c)} onMouseEnter={() => survoler(c)}
                className={`mb-1 flex w-full items-start gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-colors ${actif === c.id ? "border-menthe/40 bg-relief" : "border-transparent hover:bg-relief"}`}>
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full" style={{ background: couleur }}><Icone className="h-4 w-4 text-fond" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-encre">{c.nom || "Commerce sans nom"}</span>
                  <span className="block truncate text-[11.5px] text-ardoise">{c.metier || c.genre}{c.adresse ? ` · ${c.adresse}` : ""}{c.distance_m != null ? ` · ${c.distance_m} m` : ""}</span>
                  <span className="mt-1 flex flex-wrap gap-1 text-[10.5px] text-brume">
                    {s ? <span className="rounded-full border border-trait px-2 py-0.5">{s.nom}</span> : <span className="rounded-full border border-trait px-2 py-0.5">société non rapprochée</span>}
                    {s?.effectif_etablissement && <span className="rounded-full border border-trait px-2 py-0.5">{effectif(s.effectif_etablissement)}</span>}
                    {s?.annee_naissance_gerant && <span className="rounded-full border border-trait px-2 py-0.5">gérant {ANNEE - Number(s.annee_naissance_gerant)} ans</span>}
                    {c.telephone && <Phone className="h-3 w-3" />}{c.email && <Mail className="h-3 w-3" />}{c.site && <Globe className="h-3 w-3" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className={`${CARTE} relative min-h-[360px] overflow-hidden`}>
          <CarteCommerces point={p.point} rayon_m={p.rayon_m} commerces={liste} actif={actif} onCommerce={ouvrir} onErreur={(m) => toast.error(m)} />
        </div>
      </div>

      {ouvert && createPortal(<FicheCommerce commerce={ouvert} point={p.point} onFermer={() => setOuvert(null)} />, document.body)}
      <BoutonMecanique etapes={ETAPES_MECANIQUE} />
    </div>
  );
}

// ── La page ────────────────────────────────────────────────────────────────

export default function KProspective() {
  const user = useUser();
  const qc = useQueryClient();
  const [activite, setActivite] = useState("");
  const [adresse, setAdresse] = useState("");
  const [rayon, setRayon] = useState(500);
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [criteres, setCriteres] = useState({});
  const [voletOuvert, setVoletOuvert] = useState(false);
  const [ouverte, setOuverte] = useState(null);

  const { data } = useQuery({ queryKey: ["kprospective"], queryFn: () => base44.request("GET", "/api/kprospective"), enabled: user?.role === "admin" });
  const prospections = data?.prospections || [];
  const groupes = data?.criteres || [];
  const metiers = data?.metiers || [];

  const { data: detail } = useQuery({
    queryKey: ["kprospective", ouverte],
    queryFn: () => base44.request("GET", `/api/kprospective/${ouverte}`),
    enabled: !!ouverte,
    refetchInterval: (q) => (q.state.data?.prospection?.etat === "en_cours" ? 2000 : false),
  });
  const p = detail?.prospection;
  useEffect(() => { if (p && p.etat !== "en_cours") qc.invalidateQueries({ queryKey: ["kprospective"], exact: true }); }, [p?.etat, qc]);

  useEffect(() => {
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

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/kprospective", { body: { adresse, activite, rayon_m: rayon, criteres } }),
    onSuccess: (r) => { setOuverte(r.id); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kprospective"], exact: true }); },
    onError: (err) => toast.error(err?.message || "Lancement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/kprospective/${id}`),
    onSuccess: () => { setOuverte(null); qc.invalidateQueries({ queryKey: ["kprospective"], exact: true }); },
  });

  if (!user || user.role !== "admin") return null;

  if (ouverte && p) {
    if (p.etat === "en_cours") return <div className="min-h-screen pt-2"><Chargement prospection={p} /></div>;
    if (p.etat === "echec") return (
      <div className="mx-auto max-w-[620px] px-4 pt-16 text-center">
        <p className="m-0 text-[15px] text-alerte">{p.erreur || "La prospection n'a pas abouti."}</p>
        <button onClick={() => setOuverte(null)} className="mt-6 text-[12.5px] text-ardoise hover:text-encre">Revenir</button>
      </div>
    );
    return <Resultats prospection={p} onRetour={() => setOuverte(null)} onSupprimer={() => { if (window.confirm("Supprimer cette prospection ?")) supprimer.mutate(p.id); }} />;
  }

  const nbCriteres = Object.values(criteres).reduce((n, v) => n + (v?.length || 0), 0);
  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Prospective</p>
      <h1 className="mt-2 mb-6 text-[30px] font-light tracking-[-0.01em] text-encre">Prospecter une zone</h1>

      <div className={`${CARTE} p-5`}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px]">
          <div>
            <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Type de commerce</label>
            <input list="metiers-prospective" value={activite} onChange={(ev) => setActivite(ev.target.value)} placeholder="Boulangerie, restaurant… ou vide pour tous"
              className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
            <datalist id="metiers-prospective">{metiers.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div>
            <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Adresse</label>
            <div className="relative">
              <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
                <Search className="h-4 w-4 flex-shrink-0 text-brume" />
                <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="49 rue Dabray, 06000 Nice"
                  className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
              </div>
              {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                  {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
                </ul>
              )}
            </div>
          </div>
          <div>
            <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Rayon</label>
            <div className="flex h-11 items-center gap-1 rounded-[10px] border border-bord bg-surface px-1">
              {RAYONS.map((r) => <button key={r} type="button" onClick={() => setRayon(r)} className={`flex-1 rounded-[8px] py-1.5 text-[12px] tabular-nums ${rayon === r ? "bg-menthe/[0.14] text-menthe-texte" : "text-ardoise hover:text-encre"}`}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</button>)}
            </div>
          </div>
        </div>

        <button type="button" onClick={() => setVoletOuvert((v) => !v)} className="mt-5 flex w-full items-center justify-between rounded-[12px] border border-trait bg-relief px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-[13px] font-medium text-encre"><SlidersHorizontal className="h-4 w-4 text-menthe" />Recherche multi-critères{nbCriteres ? <span className="rounded-full bg-menthe/[0.14] px-2 py-0.5 text-[11px] text-menthe-texte">{nbCriteres}</span> : null}</span>
          <ChevronDown className={`h-4 w-4 text-ardoise transition-transform ${voletOuvert ? "rotate-180" : ""}`} />
        </button>
        {voletOuvert && (
          <div className="mt-3">
            <Criteres groupes={groupes} choix={criteres} onChoix={(cle, v) => setCriteres((c) => ({ ...c, [cle]: v }))} />
            <p className="m-0 mt-3 text-[11px] leading-[1.6] text-brume">Dans un groupe, une option suffit ; entre les groupes, il faut tout. Une option barrée n&apos;a pas de source ouverte : elle n&apos;est pas proposée plutôt que devinée.</p>
          </div>
        )}

        <p className="mt-4 mb-0 text-[11.5px] leading-[1.6] text-brume">Les devantures viennent d&apos;OpenStreetMap, les sociétés de l&apos;annuaire des entreprises, les murs du fichier des personnes morales. Aucun crédit dépensé.</p>
        <button onClick={() => lancer.mutate()} disabled={lancer.isPending || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Lancer la prospection
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Prospections réalisées</h2>
      {!prospections.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {prospections.map((x) => (
            <li key={x.id}>
              <button onClick={() => setOuverte(x.id)} className="flex w-full items-center gap-4 border-b border-trait py-3 text-left hover:bg-surface">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${x.etat === "terminee" ? "bg-vert" : x.etat === "echec" ? "bg-alerte" : "bg-menthe animate-pulse"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-encre">{x.libelle || x.adresse}</span>
                  <span className="block text-[11.5px] text-brume">{x.activite} · {x.rayon_m} m · {x.etat === "en_cours" ? `${x.progression} %` : quand(x.fini_le || x.cree_le)}{x.par ? ` · ${x.par}` : ""}</span>
                </span>
                {x.etat === "terminee" && <span className="flex-shrink-0 text-[13px] tabular-nums text-menthe-texte">{x.nb_retenus} / {x.nb_commerces}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
