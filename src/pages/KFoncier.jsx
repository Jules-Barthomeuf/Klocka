import React, { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Search, Loader2, X, Building2, Mail, Phone, ExternalLink, Clock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { createPageUrl } from "@/utils";
import CarteParcelles from "@/components/kdata/CarteParcelles";
import { effectif } from "@/components/kzoning/FicheSociete";
import { BoutonMecanique } from "@/components/kdata/Mecanique";
import {
  BoutonOutil, BoutonPrincipal, Cases, CLASSE_CARTE, CLASSE_OUTIL, CLASSE_TABLE, CLASSE_TABLEAU, CLASSE_TD, CLASSE_TH, Statut, TRANSPARENT,
} from "@/components/mandataire/elements";

// K-Foncier : les parcelles autour d'une adresse, et qui les possède.
//
// La carte est là dès l'arrivée, comme dans K-Zoning, avec le panneau de
// recherche en haut à gauche et les dernières recherches dessous. Une adresse
// posée, les parcelles se dessinent avec leur contenance : en vert celles
// dont on connaît au moins une personne morale propriétaire, cliquables ; en
// gris les autres.
//
// Les personnes physiques ne sont pas publiques : une parcelle grise a peut-
// être un propriétaire, mais pas une société connue. L'écran le dit.
//
// 10 nov. 2026, Jules : planche Outils. La page est une page de Klocka (barre
// de navigation à gauche, plus de barre du haut) : la carte la remplit, les
// panneaux s'y posent en cartes (rayon 12, filet, fond `rail`, sans flou), avec
// les éléments du CRM. La fiche d'une parcelle s'ouvre en panneau de droite sur
// la carte, plus en plein écran : l'en-tête, la vue de la rue, les propriétaires
// en cartes avec leurs lots en tableau, puis le plan de la parcelle. Le panneau
// commence sous la cloche de Layout, en haut à droite.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const ANNEE = new Date().getFullYear();

// Les panneaux posés sur la carte (10 nov. 2026, Jules : planche Outils).
const PANNEAU = `${CLASSE_CARTE} absolute flex flex-col gap-3 overflow-hidden p-4`;
const TITRE_GROUPE = "m-0 text-[12px] uppercase tracking-[.04em] text-brume";

const niveau = (n) => {
  if (n == null || n === "") return "—";
  const k = Number(n);
  if (!Number.isFinite(k)) return n;
  if (k === 0) return "RDC";
  if (k < 0) return `Sous-sol ${-k}`;
  return k === 1 ? "1er étage" : `${k}e étage`;
};
const initiales = (nom) => String(nom || "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";
const chercherSurLeWeb = (q) => window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener");
const lots = (n) => `${n} lot${n > 1 ? "s" : ""}`;

// La mécanique : dans quel ordre K-Foncier interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse tapée." },
  { source: "Géoplateforme, Parcellaire Express", quoi: "Les parcelles cadastrales autour du point, avec leur contenance." },
  { source: "Fichier MAJIC des personnes morales (DGFiP)", quoi: "Les propriétaires de chaque local, bâtiment par bâtiment. Les personnes physiques ne sont jamais publiques : une parcelle grise a peut-être un propriétaire, pas une société connue." },
  { source: "Annuaire des entreprises", quoi: "La fiche de la société propriétaire, par son SIREN." },
  { source: "Google Maps", quoi: "La vue de la rue, dans la fiche d'une parcelle." },
];

/** Une ligne libellé / valeur, au dessin des lignes du CRM (10 nov. 2026, Jules : planche Outils). */
function Ligne({ label, children }) {
  return (
    <div className="flex min-h-[36px] items-center justify-between gap-4 border-b border-trait py-1 text-[13.5px]">
      <span className="flex-none text-ardoise">{label}</span>
      <span className="min-w-0 text-right text-encre">{children ?? "—"}</span>
    </div>
  );
}

/** Un propriétaire : ses lots, puis sa société. Une carte, les lots en tableau (10 nov. 2026, Jules : planche Outils). */
function Proprietaire({ p }) {
  const s = p.societe;
  const [ouvert, setOuvert] = useState(true);
  return (
    <div className={`${CLASSE_CARTE} flex flex-col gap-2.5 p-3`}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="flex w-full items-center gap-2.5 text-left" style={TRANSPARENT}>
        <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-full bg-relief text-[12.5px] text-encre">{initiales(p.nom)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-encre">{p.nom || "Personne morale"}</span>
          <span className="block truncate text-[12.5px] text-ardoise">{p.droit || "Propriétaire"}{p.forme ? ` · ${p.forme}` : ""}{s?.creation ? ` · création ${s.creation}` : ""}</span>
        </span>
        <Statut couleur="menthe">{lots(p.lots.length)}</Statut>
      </button>

      {ouvert && (
        <>
          <div className={CLASSE_TABLEAU}>
            <table className={CLASSE_TABLE}>
              <thead>
                <tr><th className={CLASSE_TH}>Niveau</th><th className={CLASSE_TH}>Bâtiment</th><th className={CLASSE_TH}>Entrée</th><th className={CLASSE_TH}>Porte</th></tr>
              </thead>
              <tbody>
                {p.lots.map((l, i) => (
                  <tr key={i}>
                    <td className={CLASSE_TD}>{niveau(l.niveau)}</td><td className={CLASSE_TD}>{l.batiment || "—"}</td><td className={CLASSE_TD}>{l.entree || "—"}</td><td className={`${CLASSE_TD} tabular-nums`}>{l.porte || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s ? (
            <>
              <div>
                <p className={`${TITRE_GROUPE} mb-0.5`}>Informations sur l&apos;entreprise</p>
                <Ligne label="SIREN"><span className="tabular-nums">{s.siren}</span></Ligne>
                <Ligne label="Adresse">{s.siege ? `${s.siege.adresse || ""}`.trim() || `${s.siege.code_postal || ""} ${s.siege.commune || ""}` : "—"}</Ligne>
                <Ligne label="Activité">{s.activite_code ? `NAF ${s.activite_code}` : "—"}</Ligne>
                <Ligne label="Création">{s.creation || "—"}</Ligne>
                <Ligne label="Effectif">{effectif(s.effectif_societe)}</Ligne>
                {!s.active && <p className="m-0 mt-2"><Statut couleur="corail">Société fermée au registre</Statut></p>}
              </div>

              {s.dirigeants?.length > 0 && (
                <div>
                  <p className={`${TITRE_GROUPE} mb-0.5`}>{s.dirigeants.length} dirigeant{s.dirigeants.length > 1 ? "s" : ""}</p>
                  {s.dirigeants.map((d, i) => (
                    <div key={i} className="flex min-h-[42px] items-center gap-2.5 border-b border-trait py-1">
                      <span aria-hidden="true" className="grid h-7 w-7 flex-none place-items-center rounded-full bg-relief text-[12px] text-encre">{initiales(d.nom)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-encre">
                          {d.nom}{d.annee_naissance ? `, ${ANNEE - Number(d.annee_naissance)} ans` : ""}
                        </span>
                        <span className="block truncate text-[12.5px] text-ardoise">
                          {d.qualite || (d.morale ? "Personne morale" : "Dirigeant")}{d.morale ? " · via la holding" : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <BoutonPrincipal onClick={() => chercherSurLeWeb(`${s.nom} ${s.siege?.commune || ""} email`)}>
                  <Mail className="h-3.5 w-3.5" />Trouver l&apos;email
                </BoutonPrincipal>
                <BoutonOutil onClick={() => chercherSurLeWeb(`${s.nom} ${s.siege?.commune || ""} téléphone`)}>
                  <Phone className="h-3.5 w-3.5" />Trouver le téléphone
                </BoutonOutil>
                <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${s.siren}`} target="_blank" rel="noreferrer" className={`${CLASSE_OUTIL} no-underline`} style={TRANSPARENT}>
                  <ExternalLink className="h-3.5 w-3.5" />Annuaire
                </a>
              </div>
            </>
          ) : (
            <p className="m-0 text-[13.5px] text-ardoise">
              {p.siren ? "L'annuaire des entreprises n'a pas rendu de fiche pour ce SIREN." : "Pas de SIREN au fichier : une personne morale sans immatriculation (copropriété, collectivité, association)."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** La fiche d'une parcelle : un panneau à droite, sur la carte (10 nov. 2026, Jules : planche Outils). */
function FicheParcelle({ parcelle: p, voisines, point, onFermer }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["kfoncier", "parcelle", p.idu],
    queryFn: () => base44.request("GET", `/api/kfoncier/parcelle?${new URLSearchParams({ insee: p.code_insee, section: p.section, numero: p.numero })}`),
  });
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);

  const centre = (() => {
    const g = p.geometry;
    const anneau = g?.type === "MultiPolygon" ? g.coordinates?.[0]?.[0] : g?.coordinates?.[0];
    if (!anneau?.length) return point;
    const pts = anneau.length > 3 ? anneau.slice(0, -1) : anneau;
    return { lat: pts.reduce((s, x) => s + x[1], 0) / pts.length, lon: pts.reduce((s, x) => s + x[0], 0) / pts.length };
  })();
  const proprietaires = data?.proprietaires || [];

  return (
    <section aria-label="La parcelle" className={`${PANNEAU} bottom-6 right-6 top-6 z-[510] w-[460px] max-w-[calc(100vw-2rem)] max-md:bottom-[calc(env(safe-area-inset-bottom)+12px)] max-md:left-3 max-md:right-3 max-md:top-3 max-md:w-auto max-md:max-w-none`}>
      <div className="flex flex-none items-start justify-between gap-2.5">
        <div className="min-w-0">
          <span className="block text-[12.5px] text-ardoise">Parcelle {p.section} {p.numero}</span>
          <h2 className="m-0 mt-0.5 text-[18px] font-medium text-encre">{p.contenance != null ? `${p.contenance.toLocaleString("fr-FR")} m²` : "Contenance inconnue"} · {point?.label}</h2>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer la parcelle" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-10 max-md:w-10" style={TRANSPARENT}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-1">
        {CLE_MAPS && centre ? (
          <iframe title="Vue de la rue" className="block h-[180px] w-full flex-none rounded-[12px] border border-trait" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
            src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${centre.lat},${centre.lon}&heading=0&pitch=0&fov=90`} />
        ) : <p className="m-0 rounded-[12px] border border-trait px-3.5 py-6 text-center text-[13.5px] text-ardoise">Clé Google Maps absente : pas de vue de la rue.</p>}

        <p className="m-0 text-[12.5px] text-ardoise">
          {isLoading ? "Lecture du fichier des personnes morales…" : `${proprietaires.length} propriétaire${proprietaires.length > 1 ? "s" : ""} personne${proprietaires.length > 1 ? "s" : ""} morale${proprietaires.length > 1 ? "s" : ""}`}
          {data?.annee ? ` · situation au 1er janvier ${data.annee}` : ""}
        </p>
        {error && <p className="m-0 text-[13.5px] text-alerte">{error.message}</p>}
        {isLoading && <p className="m-0 flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Lecture…</p>}
        {!isLoading && !proprietaires.length && !error && <p className="m-0 text-[13.5px] text-ardoise">Aucune personne morale au fichier pour cette parcelle.</p>}
        {proprietaires.map((x) => <Proprietaire key={x.cle} p={x} />)}

        <div className="relative h-[240px] flex-none overflow-hidden rounded-[12px] border border-trait">
          <CarteParcelles point={null} centre={centre} parcelles={voisines} misesEnAvant={[p.idu]} zoom={19} interactif={false} onErreur={() => {}} />
        </div>
        <p className="m-0 text-[12.5px] leading-[1.5] text-brume">
          Source : fichier des locaux des personnes morales (DGFiP, licence ouverte) et annuaire des entreprises. Les personnes physiques ne sont pas publiques.
        </p>
      </div>
    </section>
  );
}

/** Un propriétaire des murs de l'adresse, en ligne : nom, droit · SIREN, son état à droite (10 nov. 2026, Jules : planche Outils). */
function LigneMurs({ p }) {
  const detail = [
    p.droit || "Propriétaire",
    p.siren ? `SIREN ${p.siren}` : "SIREN inconnu",
  ].join(" · ") + (p.rapprochement?.methode === "nom_adresse" ? (p.siren ? ` · rapproché par le nom (score ${Math.round(p.rapprochement.score * 100)} %)` : " · introuvable à l'annuaire") : "");
  return (
    <div className="border-b border-trait py-2">
      <div className="flex min-h-[32px] items-center justify-between gap-2.5">
        <span className="min-w-0">
          <span className="block truncate text-[14px] text-encre">{p.societe?.nom || p.nom}</span>
          <span className="block text-[12.5px] text-ardoise">{detail}</span>
        </span>
        {p.alertes?.length > 0 ? <Statut couleur="ambre">Alerte BODACC</Statut> : p.lots?.length ? <Statut couleur="menthe">{lots(p.lots.length)}</Statut> : null}
      </div>
      {p.dirigeants?.length > 0 && <p className="m-0 mt-1 text-[12.5px] text-craie">{p.dirigeants.slice(0, 3).map((d) => [d.nom, d.qualite].filter(Boolean).join(", ")).join(" · ")}</p>}
      {p.alertes?.length > 0 && <p className="m-0 mt-1 text-[12.5px] text-ambre">BODACC : {p.alertes.map((a) => `${a.type} (${quand(a.date)})`).join(" · ")}</p>}
    </div>
  );
}

export default function KFoncier() {
  const user = useUser();
  const qc = useQueryClient();
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);
  const [ouverte, setOuverte] = useState(null);

  const { data } = useQuery({ queryKey: ["kfoncier"], queryFn: () => base44.request("GET", "/api/kfoncier"), enabled: user?.role === "admin" });
  const recherches = data?.recherches || [];

  useEffect(() => {
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

  const analyser = useMutation({
    mutationFn: (texte) => base44.request("POST", "/api/kfoncier", { body: { adresse: texte } }),
    onSuccess: (r) => { setVue(r); setOuverte(null); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kfoncier"] }); },
    onError: (err) => toast.error(err?.message || "Analyse impossible"),
  });
  const ouvrirParcelle = useCallback((p) => setOuverte(p), []);
  const fermerParcelle = useCallback(() => setOuverte(null), []);

  // Ouverte depuis la file de K-Data : « ?adresse=… » relance l'analyse, dont
  // les sources sont en cache. Le paramètre ne se rejoue pas.
  const { search } = useLocation();
  const vuUrl = useRef("");
  useEffect(() => {
    if (vuUrl.current === search) return;
    const a = new URLSearchParams(search).get("adresse");
    if (!a) return;
    vuUrl.current = search;
    choisie.current = a;
    setAdresse(a);
    analyser.mutate(a);
  }, [search]);

  if (!user || user.role !== "admin") return null;

  const carteCentre = vue?.point || null;
  const voisines = ouverte && vue ? vue.parcelles.filter((x) => x.section === ouverte.section) : [];

  // 10 nov. 2026, Jules : planche Outils. Plus de barre du haut des Outils : la carte prend toute la hauteur
  // (sur téléphone, moins la barre du haut et la marge du bas de Layout).
  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden max-md:flex-none max-md:h-[calc(100dvh-var(--k-haut-mobile,3.5rem)-var(--k-bas-mobile,0px))]">
      <CarteParcelles point={carteCentre} parcelles={vue?.parcelles || []} onParcelle={ouvrirParcelle} onErreur={(m) => toast.error(m)} />

      {/* Le panneau de gauche (10 nov. 2026, Jules : planche Outils) : le retour aux Outils, le titre, la
          recherche ronde, deux chiffres en cases, les murs de l'adresse en lignes, les dernières recherches, la
          note en bas. Au téléphone, le haut de l'écran ; il s'efface quand une parcelle est ouverte. */}
      <section aria-label="L'adresse" className={`${PANNEAU} bottom-6 left-6 top-6 z-[500] w-[360px] max-w-[calc(100vw-2rem)] max-md:bottom-auto max-md:left-3 max-md:right-3 max-md:top-3 max-md:max-h-[45%] max-md:w-auto max-md:max-w-none ${ouverte ? "max-md:hidden" : ""}`}>
        <div className="flex-none">
          <Link to={createPageUrl("KData")} className="text-[13px] text-ardoise no-underline hover:text-encre">← Outils</Link>
          <h1 className="m-0 mt-1 truncate text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">K-Foncier</h1>
        </div>

        <div className="relative flex-none">
          <label className="flex h-8 items-center gap-2 rounded-full bg-relief px-3.5 text-ardoise focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10">
            <Search className="h-3.5 w-3.5 flex-none" />
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="Une adresse à analyser" aria-label="Une adresse à analyser"
              onKeyDown={(ev) => { if (ev.key === "Enter" && adresse.trim().length >= 5) analyser.mutate(adresse); }}
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            {analyser.isPending && <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-menthe" />}
          </label>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[38px] z-20 m-0 list-none overflow-hidden rounded-[14px] border border-trait bg-rail p-0 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:top-[46px]">
              {suggestions.map((s) => <li key={s}><button type="button" onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); analyser.mutate(s); }} className="block w-full px-3.5 py-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre" style={TRANSPARENT}>{s}</button></li>)}
            </ul>
          )}
        </div>

        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
          {vue ? (
            <div className="flex flex-col gap-2.5">
              <p className="m-0 truncate text-[13.5px] text-encre" title={vue.point.label}>{vue.point.label}</p>
              <Cases colonnes={2} items={[[vue.total, "Parcelles à 150 m"], [vue.avec_proprietaires, "Avec propriétaires connus"]]} />
              <div className="flex flex-wrap gap-3 text-[12.5px] text-ardoise">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-vert" />Avec propriétaires : cliquable</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ardoise" />Sans personne morale connue</span>
              </div>
            </div>
          ) : null}

          {/* Boîte à outils (lot 6, 18 oct. 2026) : le propriétaire des murs de l'adresse elle-même, à partir de sa parcelle. */}
          {vue?.local && (
            <div>
              <h2 className="m-0 text-[15px] font-medium text-encre">Les murs de l&apos;adresse</h2>
              {!vue.local.ok ? <p className="m-0 mt-1 text-[13.5px] text-ardoise">{vue.local.error}</p> : (
                <>
                  <p className="m-0 mt-1 text-[13px] text-ardoise">Parcelle {vue.local.parcelle.section} {vue.local.parcelle.numero}{vue.local.parcelle.contenance ? ` · ${vue.local.parcelle.contenance} m²` : ""}</p>
                  {vue.local.constat ? (
                    <p className="m-0 mt-2 text-[14px] text-encre">{vue.local.constat.libelle}<span className="block text-[12.5px] leading-[1.5] text-brume">{vue.local.constat.raison}</span></p>
                  ) : vue.local.proprietaires.map((p) => <LigneMurs key={p.cle || p.nom} p={p} />)}
                  <p className="m-0 mt-2 text-[13px] text-craie">
                    {vue.local.derniere_mutation ? `Dernière vente de la parcelle : ${quand(vue.local.derniere_mutation.date)}, ${Number(vue.local.derniere_mutation.prix || 0).toLocaleString("fr-FR")} €${vue.local.derniere_mutation.types?.length ? ` (${vue.local.derniere_mutation.types.join(", ")})` : ""}.` : "Aucune vente de la parcelle dans DVF sur 5 ans."}
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <p className={`${TITRE_GROUPE} pb-0.5`}>Dernières recherches · {recherches.length}</p>
            {!recherches.length ? <p className="m-0 py-2 text-[12.5px] text-brume">Aucune pour l&apos;instant.</p> : recherches.map((r) => (
              <button key={r.id} type="button" onClick={() => { choisie.current = r.adresse; setAdresse(r.adresse); analyser.mutate(r.adresse); }} disabled={analyser.isPending}
                className="flex min-h-[42px] w-full items-center gap-2.5 border-b border-trait py-1 text-left hover:bg-relief disabled:opacity-60" style={TRANSPARENT}>
                <Clock className="h-3.5 w-3.5 flex-none text-brume" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-encre">{r.adresse}</span>
                  <span className="block text-[12.5px] text-ardoise">{quand(r.le)}{r.par ? ` · ${r.par}` : ""}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {vue && (
          <p className="m-0 flex-none text-[12.5px] leading-[1.5] text-brume">
            {vue.annee ? `Fichier des personnes morales, situation au 1er janvier ${vue.annee}. ` : ""}Les personnes physiques ne sont pas publiques. Une parcelle verte ouvre la fiche des propriétaires.
            {vue.erreurs?.length ? ` Sections non lues : ${vue.erreurs.join(" ; ")}.` : ""}
          </p>
        )}
      </section>

      {!vue && !analyser.isPending && (
        <div className="absolute bottom-6 left-1/2 z-[500] -translate-x-1/2 whitespace-nowrap rounded-full border border-trait bg-rail px-4 py-2 text-[13px] text-ardoise max-md:bottom-[calc(env(safe-area-inset-bottom)+16px)] max-md:w-[calc(100%-24px)] max-md:whitespace-normal max-md:rounded-[12px] max-md:text-center">
          <Building2 className="mr-1.5 inline h-3.5 w-3.5 text-menthe" />Choisissez une adresse : les parcelles autour s&apos;affichent avec leur contenance.
        </div>
      )}

      {ouverte && <FicheParcelle parcelle={ouverte} voisines={voisines} point={vue?.point} onFermer={fermerParcelle} />}
      {vue && <BoutonMecanique etapes={ETAPES_MECANIQUE} position="bottom-6 right-6" className={ouverte ? "max-md:hidden" : ""} />}
    </div>
  );
}
