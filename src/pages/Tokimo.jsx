import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ExternalLink, ImagePlus, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import CarteParcelles from "@/components/kdata/CarteParcelles";
import { Bulle, Cadre, Legende, axe, useCouleurs } from "@/components/monitoring/GraphesAppels";
import { bilan, completer, prixM2Comparable, prixM2Dvf } from "@/lib/tokimo-bilan";

// Tokimo (6 nov. 2026, Jules) : le module d'analyse des opérations présentées à Tokimo, à part de tout le reste.
// La grille de leur Excel, bloc par bloc : localisation, description, surfaces, avis, hypothèses de financement,
// bilan achat revente, indicateurs, proposition, emplois et ressources, décaissement, facturation, comparables
// et ventes DVF. Les cases se remplissent, tout le reste se recalcule à chaque frappe (src/lib/tokimo-bilan.js),
// et l'analyse s'enregistre seule.

const nf = (d) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });
const eur = (x) => `${nf(0).format(Math.round(x || 0))} €`;
const eur2 = (x) => `${nf(2).format(x || 0)} €`;
const m2 = (x) => `${nf(0).format(Math.round(x || 0))} €/m²`;
const pc = (x, d = 1) => `${nf(d).format((x || 0) * 100)} %`;
const surf = (x) => `${nf(0).format(Math.round(x || 0))} m²`;
const lisible = (texte) => {
  const t = String(texte ?? "").replace(/[\s\u00a0\u202f€%]/g, "").replace(",", ".");
  if (t === "" || t === "-") return 0;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

const CHAMP = "h-8 w-full rounded-champ border border-trait bg-transparent px-2.5 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";

/** Un nombre à saisir : écrit à la française, relu à chaque frappe. */
function Nombre({ valeur, onChange, suffixe = "", decimales = 2, className = "" }) {
  const [texte, setTexte] = useState("");
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setTexte(valeur ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimales }).format(valeur) : "");
  }, [valeur, focus, decimales]);
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <input
        inputMode="decimal"
        value={texte}
        placeholder="0"
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onChange={(e) => { setTexte(e.target.value); const v = lisible(e.target.value); if (v != null) onChange(v); }}
        className={`${CHAMP} text-right tabular-nums ${suffixe ? "pr-7" : ""}`}
      />
      {suffixe && <span className="pointer-events-none absolute right-2.5 text-[12.5px] text-brume">{suffixe}</span>}
    </span>
  );
}

function Texte({ valeur, onChange, lignes = 0, placeholder = "" }) {
  if (lignes) return <textarea rows={lignes} value={valeur || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${CHAMP} h-auto resize-y py-2 leading-relaxed`} />;
  return <input value={valeur || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={CHAMP} />;
}

function Case({ coche, onChange, libelle }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] text-craie">
      <input type="checkbox" checked={!!coche} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--k-menthe-rgb))]" />
      {libelle}
    </label>
  );
}

/** Une ligne libellé / valeur, à filet. `fort` pour un total, `ton` pour une valeur à surveiller. */
function Ligne({ libelle, children, fort = false, ton = "" }) {
  return (
    <div className={`flex min-h-[34px] items-center justify-between gap-3 border-b border-trait py-1 text-[13.5px] last:border-b-0 ${fort ? "text-encre" : "text-craie"}`}>
      <span className={fort ? "text-encre" : "text-ardoise"}>{libelle}</span>
      <span className={`shrink-0 text-right tabular-nums ${ton}`}>{children}</span>
    </div>
  );
}

const Intertitre = ({ children }) => <p className="m-0 mb-1 mt-4 text-[11px] uppercase tracking-[.16em] text-brume first:mt-0">{children}</p>;

// --- La liste -------------------------------------------------------------------------------------------------

function Liste({ onOuvrir }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["tokimo"], queryFn: () => base44.request("GET", "/api/tokimo") });
  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/tokimo", { body: {} }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["tokimo"] }); onOuvrir(r.analyse.id); },
    onError: (e) => toast.error(e?.message || "L'analyse n'a pas pu être créée."),
  });
  const analyses = data?.analyses || [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="m-0 mb-2 text-[11px] uppercase tracking-[.18em] text-brume">Tokimo</p>
          <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre">Les opérations à analyser</h1>
        </div>
        <button type="button" onClick={() => creer.mutate()} disabled={creer.isPending} className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
          {creer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Nouvelle analyse
        </button>
      </div>
      {isLoading && <p className="text-[13.5px] text-ardoise">Chargement des analyses…</p>}
      {error && <p className="text-[13.5px] text-alerte">Les analyses n'ont pas pu être lues : {error.message}</p>}
      {!isLoading && !error && !analyses.length && (
        <p className="text-[15px] text-ardoise">Aucune analyse pour l'instant. « Nouvelle analyse » ouvre la grille, vide, avec les taux de Tokimo.</p>
      )}
      <div>
        {analyses.map((a) => (
          <button key={a.id} type="button" onClick={() => onOuvrir(a.id)} className="flex w-full items-center justify-between gap-4 border-b border-trait py-3.5 text-left hover:bg-surface" style={{ background: "transparent" }}>
            <span className="min-w-0">
              <span className="block truncate text-[16px] text-encre">{a.nom}</span>
              <span className="block truncate text-[13.5px] text-ardoise">{[a.adresse || "Sans adresse", `modifiée le ${quand(a.updated_date)}`].join(" · ")}</span>
            </span>
            <span className="shrink-0 text-right text-[13.5px] tabular-nums">
              <span className="block text-encre">{eur(a.collecte)}</span>
              <span className={`block ${a.marge < 0 ? "text-ambre" : "text-ardoise"}`}>marge {eur(a.marge)} · LTV {pc(a.ltv, 0)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Le graphique des prix --------------------------------------------------------------------------------------

function GraphiquePrix({ marches }) {
  const c = useCouleurs();
  const serie = (nom, s) => (s ? { nom, bas: s.min, milieu: Math.max(0, (s.mediane ?? s.cible) - s.min), haut: Math.max(0, s.max - (s.mediane ?? s.cible)), s } : null);
  const donnees = [serie("DVF", marches.dvf), serie("Comparables", marches.comparables), serie("Cible", marches.cible)].filter(Boolean);
  if (!donnees.length) return <p className="m-0 text-[13.5px] text-brume">Le graphique se dessine dès qu'il y a une vente DVF, un comparable ou un prix cible.</p>;
  const teintes = [c.series[0], c.series[1], c.series[2]];
  return (
    <>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={donnees} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="nom" {...axe(c)} />
            <YAxis {...axe(c)} width={64} tickFormatter={(v) => nf(0).format(v)} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => {
              const d = active && payload?.[0]?.payload;
              if (!d) return null;
              return <Bulle titre={d.nom} lignes={[{ nom: "Min", valeur: m2(d.s.min) }, { nom: d.s.cible != null ? "Cible" : "Médiane", valeur: m2(d.s.mediane ?? d.s.cible) }, { nom: "Max", valeur: m2(d.s.max) }]} />;
            }} />
            <Bar dataKey="bas" stackId="p" fill={teintes[0]} />
            <Bar dataKey="milieu" stackId="p" fill={teintes[1]} />
            <Bar dataKey="haut" stackId="p" fill={teintes[2]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2"><Legende items={[{ nom: "Jusqu'au min", couleur: teintes[0] }, { nom: "Jusqu'à la médiane (cible)", couleur: teintes[1] }, { nom: "Jusqu'au max", couleur: teintes[2] }]} /></div>
    </>
  );
}

// --- L'analyse ---------------------------------------------------------------------------------------------------

function Analyse({ id, onRetour }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["tokimo", id], queryFn: () => base44.request("GET", `/api/tokimo/${id}`), refetchOnWindowFocus: false });
  const [nom, setNom] = useState("");
  const [s, setS] = useState(null);
  const [lu, setLu] = useState(null);
  const [etat, setEtat] = useState("");
  const charge = useRef(false);

  useEffect(() => {
    if (!data?.analyse || charge.current) return;
    charge.current = true;
    setNom(data.analyse.nom || "");
    setS(completer(data.analyse.saisie));
    setLu(data.analyse.lu || null);
  }, [data]);

  // L'enregistrement automatique, une demi-seconde après la dernière frappe.
  const premier = useRef(true);
  useEffect(() => {
    if (!s) return undefined;
    if (premier.current) { premier.current = false; return undefined; }
    setEtat("Enregistrement…");
    const t = setTimeout(() => {
      base44.request("PUT", `/api/tokimo/${id}`, { body: { nom, saisie: s } })
        .then(() => { setEtat("Enregistré automatiquement"); qc.invalidateQueries({ queryKey: ["tokimo"], exact: true }); })
        .catch((e) => setEtat(`Non enregistré : ${e?.message || "erreur"}`));
    }, 600);
    return () => clearTimeout(t);
  }, [s, nom, id, qc]);

  const lire = useMutation({
    mutationFn: () => base44.request("POST", `/api/tokimo/${id}/adresse`, { body: { adresse: s.adresse, typologie: s.typologie, surface: s.surfaces.utile } }),
    onSuccess: (r) => {
      const l = r.analyse.lu;
      setLu(l);
      // La contenance de la parcelle et les ventes DVF ne remplacent rien de saisi.
      setS((x) => ({
        ...x,
        surfaces: !x.surfaces.terrain && l?.parcelle?.contenance ? { ...x.surfaces, terrain: l.parcelle.contenance } : x.surfaces,
        dvf: !x.dvf.length && l?.dvf?.ok ? ventesLues(l) : x.dvf,
      }));
      if (l?.dvf && !l.dvf.ok) toast.error(l.dvf.error);
    },
    onError: (e) => toast.error(e?.message || "L'adresse n'a pas pu être lue."),
  });

  const supprimer = useMutation({
    mutationFn: () => base44.request("DELETE", `/api/tokimo/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tokimo"] }); onRetour(); },
  });

  const b = useMemo(() => (s ? bilan(s) : null), [s]);
  if (isLoading || (!s && !error)) return <p className="px-8 py-10 text-[13.5px] text-ardoise">Chargement de l'analyse…</p>;
  if (error) return <p className="px-8 py-10 text-[13.5px] text-alerte">L'analyse n'a pas pu être lue : {error.message}</p>;

  const pose = (cle) => (v) => setS((x) => ({ ...x, [cle]: v }));
  const poseSurface = (cle) => (v) => setS((x) => ({ ...x, surfaces: { ...x.surfaces, [cle]: v } }));
  const poseAvis = (cle) => (v) => setS((x) => ({ ...x, avis: { ...x.avis, [cle]: v } }));
  const poseLigne = (liste, i, cle) => (v) => setS((x) => ({ ...x, [liste]: x[liste].map((r, k) => (k === i ? { ...r, [cle]: v } : r)) }));
  const ajoute = (liste, vide) => setS((x) => ({ ...x, [liste]: [...x[liste], vide] }));
  const retire = (liste, i) => setS((x) => ({ ...x, [liste]: x[liste].filter((_, k) => k !== i) }));
  const L = b.lignes;
  const parM2 = (x) => m2(b.par_m2(x));
  const tonMarge = (x) => (x < 0 ? "text-ambre" : "");

  const ajouterPhoto = async (fichier) => {
    if (!fichier) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: fichier });
      setS((x) => ({ ...x, photos: [...(x.photos || []), file_url].slice(0, 4) }));
    } catch (e) { toast.error(e?.message || "La photo n'a pas pu être envoyée."); }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
      {/* En-tête : retour, nom modifiable, état de l'enregistrement */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onRetour} aria-label="Toutes les analyses" title="Toutes les analyses" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] uppercase tracking-[.18em] text-brume">Tokimo</p>
          <input value={nom} onChange={(e) => setNom(e.target.value)} aria-label="Nom de l'analyse" className="w-full bg-transparent text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre outline-none max-md:text-[22px]" />
          <p className="m-0 text-[12.5px] text-brume">{etat || "Enregistré automatiquement"}</p>
        </div>
        <button type="button" onClick={() => { if (window.confirm("Supprimer cette analyse ? Elle ne pourra pas être retrouvée.")) supprimer.mutate(); }} aria-label="Supprimer l'analyse" title="Supprimer l'analyse" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Colonne 1 : le bien, le projet, l'avis */}
        <div className="flex min-w-0 flex-col gap-4">
          <Cadre titre="Localisation">
            <div className="flex gap-2">
              <Texte valeur={s.adresse} onChange={pose("adresse")} placeholder="28 rue de Mont, 54610 Mailly-sur-Seille" />
              <button type="button" onClick={() => lire.mutate()} disabled={!s.adresse?.trim() || lire.isPending} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
                {lire.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}Lire l'adresse
              </button>
            </div>
            {lire.isPending && <p className="m-0 mt-2 text-[12.5px] text-brume">Je cherche la parcelle et les ventes DVF du code postal…</p>}
            {lu?.point && (
              <>
                <div className="mt-3 h-[260px] overflow-hidden rounded-[10px] border border-trait">
                  <CarteParcelles point={lu.point} parcelles={lu.parcelles || []} misesEnAvant={lu.parcelle ? [lu.parcelle.idu] : []} zoom={18} interactif />
                </div>
                <p className="m-0 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ardoise">
                  <span>{lu.point.label}</span>
                  {lu.parcelle ? <span>Parcelle {lu.parcelle.section} {lu.parcelle.numero} · {surf(lu.parcelle.contenance)}</span> : <span>{lu.erreur_parcelles ? `Cadastre indisponible : ${lu.erreur_parcelles}` : "Aucune parcelle ne porte ce point."}</span>}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${lu.point.lat},${lu.point.lon}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-menthe hover:underline">Google Maps <ExternalLink className="h-3 w-3" /></a>
                </p>
              </>
            )}
          </Cadre>

          <Cadre titre="Description de l'actif et du projet">
            <div className="flex flex-col gap-3 text-[13.5px]">
              <label className="flex flex-col gap-1"><span className="text-ardoise">Destination</span><Texte valeur={s.destination} onChange={pose("destination")} /></label>
              <label className="flex flex-col gap-1"><span className="text-ardoise">Description de l'actif</span><Texte lignes={3} valeur={s.description_actif} onChange={pose("description_actif")} /></label>
              <label className="flex flex-col gap-1"><span className="text-ardoise">Description du projet</span><Texte lignes={4} valeur={s.description_projet} onChange={pose("description_projet")} /></label>
              <label className="flex flex-col gap-1"><span className="text-ardoise">Forces</span><Texte lignes={2} valeur={s.forces} onChange={pose("forces")} /></label>
              <label className="flex flex-col gap-1"><span className="text-ardoise">Faiblesses</span><Texte lignes={2} valeur={s.faiblesses} onChange={pose("faiblesses")} /></label>
            </div>
          </Cadre>

          <Cadre titre="Surfaces">
            <Ligne libelle="Utile"><Nombre valeur={s.surfaces.utile} onChange={poseSurface("utile")} suffixe="m²" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Terrasse"><Nombre valeur={s.surfaces.terrasse} onChange={poseSurface("terrasse")} suffixe="m²" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Terrain"><Nombre valeur={s.surfaces.terrain} onChange={poseSurface("terrain")} suffixe="m²" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Surface utile créée"><Nombre valeur={s.surfaces.creee} onChange={poseSurface("creee")} suffixe="m²" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Total surface utile" fort>{surf(b.surface_utile)}</Ligne>
          </Cadre>

          <Cadre titre="Avis analyste">
            <Intertitre>Opération</Intertitre>
            {[["administratif", "Administratif"], ["financier", "Financier"], ["localisation", "Localisation"], ["garanties", "Garanties"], ["commerciales", "Commerciales"]].map(([k, l]) => (
              <label key={k} className="mb-2 flex flex-col gap-1 text-[13.5px]"><span className="text-ardoise">{l}</span><Texte valeur={s.avis[k]} onChange={poseAvis(k)} /></label>
            ))}
            <Intertitre>Opérateur</Intertitre>
            {[["entreprise", "Entreprise"], ["experience", "Expérience"], ["sante", "Santé financière"]].map(([k, l]) => (
              <label key={k} className="mb-2 flex flex-col gap-1 text-[13.5px]"><span className="text-ardoise">{l}</span><Texte valeur={s.avis[k]} onChange={poseAvis(k)} /></label>
            ))}
          </Cadre>

          <Cadre titre="Délai" droite={<button type="button" onClick={() => ajoute("delai", { libelle: "", date: "" })} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Une étape</button>}>
            {!s.delai.length && <p className="m-0 text-[13.5px] text-brume">Aucune étape : compromis, acquisition, revente…</p>}
            {s.delai.map((d, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <Texte valeur={d.libelle} onChange={poseLigne("delai", i, "libelle")} placeholder="Compromis signé" />
                <input type="date" value={d.date || ""} onChange={(e) => poseLigne("delai", i, "date")(e.target.value)} className={`${CHAMP} w-40 shrink-0`} />
                <button type="button" onClick={() => retire("delai", i)} aria-label="Retirer l'étape" title="Retirer l'étape" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
              </div>
            ))}
          </Cadre>

          <Cadre titre="Demande à l'opérateur"><Texte lignes={4} valeur={s.demande_operateur} onChange={pose("demande_operateur")} /></Cadre>
          <Cadre titre="Avis de l'analyste"><Texte lignes={5} valeur={s.avis_analyste} onChange={pose("avis_analyste")} /></Cadre>
        </div>

        {/* Colonne 2 : les hypothèses et la proposition */}
        <div className="flex min-w-0 flex-col gap-4">
          <Cadre titre="Hypothèses du bilan">
            <Intertitre>Condition de financement</Intertitre>
            <Ligne libelle="Durée"><Nombre valeur={s.duree_mois} onChange={pose("duree_mois")} suffixe="mois" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Taux"><Nombre valeur={s.taux_pct} onChange={pose("taux_pct")} suffixe="%" className="w-32" /></Ligne>
            <Ligne libelle="Frais de structuration, grille HT"><Nombre valeur={s.structuration_grille_pct} onChange={pose("structuration_grille_pct")} suffixe="%" className="w-32" /></Ligne>
            <Ligne libelle="Apporteur d'affaires (1 %)"><Case coche={s.apporteur} onChange={pose("apporteur")} libelle={s.apporteur ? "Oui" : "Non"} /></Ligne>
            <Ligne libelle="Frais de structuration HT">{pc(b.structuration_pct, 2)}</Ligne>
            <Ligne libelle="Frais de structuration net HT">{pc(b.structuration_net_pct, 2)}</Ligne>
            <Ligne libelle="Frais de gestion HT"><Nombre valeur={s.frais_gestion_pct} onChange={pose("frais_gestion_pct")} suffixe="%" className="w-32" /></Ligne>
            <Ligne libelle="Séquestre de coupons"><Nombre valeur={s.sequestre_mois} onChange={pose("sequestre_mois")} suffixe="mois" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Coupons mensuels"><Case coche={s.coupons_mensuels} onChange={pose("coupons_mensuels")} libelle={s.coupons_mensuels ? "Oui" : "Non"} /></Ligne>

            <Intertitre>Fonds propres et dette</Intertitre>
            <Ligne libelle="Fonds propres"><Nombre valeur={s.fonds_propres_pct} onChange={pose("fonds_propres_pct")} suffixe="%" className="w-32" /></Ligne>
            <Ligne libelle="Besoin opérationnel (I à IV)">{eur(b.besoin)}</Ligne>
            <Ligne libelle="Dette">{eur(b.dette)}</Ligne>
            <Ligne libelle="Fonds propres">{eur(b.fonds_propres)}</Ligne>

            <Intertitre>Frais financiers</Intertitre>
            <Ligne libelle="Besoin opérationnel conservé"><Case coche={s.besoin_conserve} onChange={pose("besoin_conserve")} libelle={s.besoin_conserve ? "Oui" : "Non"} /></Ligne>
            <Ligne libelle="Dette supplémentaire"><Nombre valeur={s.dette_supplementaire} onChange={pose("dette_supplementaire")} suffixe="€" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Montant à collecter" fort>{eur(b.collecte)}</Ligne>
            <Ligne libelle="Frais Tokimo TTC">{eur(b.frais_tokimo)}</Ligne>
            <Ligne libelle="Frais de gestion TTC (estimation)">{eur(b.frais_gestion)}</Ligne>
            <Ligne libelle="Séquestre des coupons">{eur(b.sequestre)}</Ligne>

            <Intertitre>Arbitrage</Intertitre>
            <Ligne libelle="Prix bas (−10 %)">{eur2(b.prix_m2.bas)}</Ligne>
            <Ligne libelle="Prix cible, au m²"><Nombre valeur={s.prix_cible_m2} onChange={pose("prix_cible_m2")} suffixe="€" className="w-32" /></Ligne>
            <Ligne libelle="Prix haut (+10 %)">{eur2(b.prix_m2.haut)}</Ligne>
            <Ligne libelle="CA supplémentaire"><Nombre valeur={s.ca_sup} onChange={pose("ca_sup")} suffixe="€" decimales={0} className="w-32" /></Ligne>

            <Intertitre>Commercialisation locative</Intertitre>
            <Ligne libelle="Loyer cible par an"><Nombre valeur={s.loyer_annuel} onChange={pose("loyer_annuel")} suffixe="€" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Loyer cible par mois">{eur((s.loyer_annuel || 0) / 12)}</Ligne>
          </Cadre>

          <Cadre titre="Proposition">
            <Ligne libelle="Montant cible de collecte" fort>{eur(b.collecte)}</Ligne>
            <Ligne libelle="Maturité de l'emprunt">{`${nf(0).format(s.duree_mois || 0)} mois`}</Ligne>
            <Ligne libelle="Taux d'intérêt annuel">{pc((s.taux_pct || 0) / 100, 2)}</Ligne>
            <Ligne libelle="Paiement des coupons">{s.coupons_mensuels ? "Mensuel" : "In fine"}</Ligne>
            <Ligne libelle="Remboursement du capital">In fine</Ligne>
            <Ligne libelle="Remboursement anticipé, à partir de"><Nombre valeur={s.remboursement_anticipe_mois} onChange={pose("remboursement_anticipe_mois")} suffixe="mois" decimales={0} className="w-32" /></Ligne>
            <Ligne libelle="Frais de structuration HT">{pc(b.structuration_pct, 2)}</Ligne>
            <Ligne libelle="Frais de gestion mensuels au-delà de 12 mois"><Nombre valeur={s.gestion_depassement_pct} onChange={pose("gestion_depassement_pct")} suffixe="%" className="w-32" /></Ligne>
            <Ligne libelle="Garanties"><span className="block w-40"><Texte valeur={s.garanties} onChange={pose("garanties")} /></span></Ligne>
            <label className="mt-2 flex flex-col gap-1 text-[13.5px]"><span className="text-ardoise">Conditions suspensives</span><Texte lignes={3} valeur={s.conditions_suspensives} onChange={pose("conditions_suspensives")} /></label>
          </Cadre>

          <Cadre titre="Emplois et ressources">
            <Ligne libelle="Acquisition">{eur(b.emplois.acquisition)}</Ligne>
            <Ligne libelle="Travaux et honoraires">{eur(b.emplois.travaux)}</Ligne>
            <Ligne libelle="Sûretés">{eur(b.emplois.suretes)}</Ligne>
            <Ligne libelle="Divers">{eur(b.emplois.divers)}</Ligne>
            <Ligne libelle="Frais de structuration">{eur(b.emplois.structuration)}</Ligne>
            <Ligne libelle="Séquestre des coupons">{eur(b.emplois.sequestre)}</Ligne>
            <Ligne libelle="Total des emplois" fort>{eur(b.total_emplois)}</Ligne>
            <Intertitre>Ressources</Intertitre>
            <Ligne libelle="Dette obligataire">{eur(b.ressources.dette_obligataire)}</Ligne>
            <Ligne libelle="Fonds propres" ton={b.ressources.fonds_propres < 0 ? "text-ambre" : ""}>{eur(b.ressources.fonds_propres)}</Ligne>
            <Ligne libelle="Total des ressources" fort>{eur(b.total_emplois)}</Ligne>
          </Cadre>

          <Cadre titre="Décaissement">
            <Ligne libelle="Montant de la collecte">{eur(b.decaissement.collecte)}</Ligne>
            <Ligne libelle="Frais Tokimo TTC">− {eur(b.decaissement.frais_tokimo)}</Ligne>
            <Ligne libelle="Séquestre des coupons">− {eur(b.decaissement.sequestre)}</Ligne>
            <Ligne libelle="Décaissement notaire" fort>{eur(b.decaissement.notaire)}</Ligne>
            <Ligne libelle="Frais de sûretés">− {eur(b.decaissement.suretes)}</Ligne>
            <Ligne libelle="Décaissement net opérateur" fort>{eur(b.decaissement.net_operateur)}</Ligne>
          </Cadre>

          <Cadre titre="Facturation du dossier">
            <Ligne libelle={`Frais de structuration · ${pc(b.facturation.structuration.taux, 2)} de ${eur(b.facturation.structuration.base)}`}>{eur(b.facturation.structuration.ht)} HT</Ligne>
            <Ligne libelle={`Frais de gestion (potentiel) · ${pc(b.facturation.gestion.taux, 2)} de ${eur(b.facturation.gestion.base)}`}>{eur(b.facturation.gestion.ht)} HT</Ligne>
            <Ligne libelle="Total HT">{eur(b.facturation.total_ht)}</Ligne>
            <Ligne libelle="TVA">20 %</Ligne>
            <Ligne libelle="Total TTC" fort>{eur(b.facturation.total_ttc)}</Ligne>
          </Cadre>
        </div>

        {/* Colonne 3 : le bilan et les indicateurs */}
        <div className="flex min-w-0 flex-col gap-4">
          <Cadre titre="Bilan achat revente" droite={<span className="text-[11px] uppercase tracking-[.14em] text-brume">€ TTC · € TTC/m²</span>}>
            <LigneBilan libelle="Prix d'acquisition" saisie={<Nombre valeur={s.prix_acquisition} onChange={pose("prix_acquisition")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.prix_acquisition)} />
            <LigneBilan libelle="Frais de notaire" pct={<Nombre valeur={s.frais_notaire_pct} onChange={pose("frais_notaire_pct")} suffixe="%" className="w-20" />} valeur={eur(L.frais_notaire)} m2={parM2(L.frais_notaire)} />
            <LigneBilan libelle="Commission d'agence" saisie={<Nombre valeur={s.commission_agence} onChange={pose("commission_agence")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.commission_agence)} />
            <LigneBilan libelle="I. Charges foncières" valeur={eur(L.charges_foncieres)} m2={parM2(L.charges_foncieres)} fort />

            <LigneBilan libelle="Travaux de rénovation" saisie={<Nombre valeur={s.travaux_renovation} onChange={pose("travaux_renovation")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.travaux_renovation)} />
            <LigneBilan libelle="Travaux de création" saisie={<Nombre valeur={s.travaux_creation} onChange={pose("travaux_creation")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.travaux_creation)} />
            <LigneBilan libelle="Aléas" saisie={<Nombre valeur={s.aleas} onChange={pose("aleas")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.aleas)} />
            <LigneBilan libelle="Honoraires" saisie={<Nombre valeur={s.honoraires} onChange={pose("honoraires")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.honoraires)} />
            <LigneBilan libelle="II. Dépenses d'investissement" valeur={eur(L.depenses)} m2={parM2(L.depenses)} fort />

            <LigneBilan libelle="Garantie hypothécaire" pct={<Nombre valeur={s.garantie_hypotheque_pct} onChange={pose("garantie_hypotheque_pct")} suffixe="%" className="w-20" />} valeur={eur(L.garantie_hypotheque)} m2={parM2(L.garantie_hypotheque)} />
            <LigneBilan libelle="Caution personnelle" pct={<Nombre valeur={s.caution_perso_pct} onChange={pose("caution_perso_pct")} suffixe="%" className="w-20" />} valeur={eur(L.caution_perso)} m2={parM2(L.caution_perso)} />
            <LigneBilan libelle="III. Frais de sûretés" valeur={eur(L.suretes)} m2={parM2(L.suretes)} fort />

            <LigneBilan libelle="Assurances" saisie={<Nombre valeur={s.assurances} onChange={pose("assurances")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.assurances)} />
            <LigneBilan libelle="Comptable" saisie={<Nombre valeur={s.comptable} onChange={pose("comptable")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.comptable)} />
            <LigneBilan libelle="Divers" saisie={<Nombre valeur={s.divers} onChange={pose("divers")} suffixe="€" decimales={0} className="w-36" />} m2={parM2(L.divers)} />
            <LigneBilan libelle="IV. Assurances, charges, divers" valeur={eur(L.charges)} m2={parM2(L.charges)} fort />

            <LigneBilan libelle="Intérêts" valeur={eur(L.interets)} m2={parM2(L.interets)} />
            <LigneBilan libelle="Frais Tokimo" valeur={eur(L.frais_tokimo + L.frais_gestion)} m2={parM2(L.frais_tokimo + L.frais_gestion)} />
            <LigneBilan libelle="V. Frais financiers" valeur={eur(L.frais_financiers)} m2={parM2(L.frais_financiers)} fort />
            <LigneBilan libelle="Prix de revient" valeur={eur(L.prix_de_revient)} m2={parM2(L.prix_de_revient)} fort accent />

            <div className="mt-3" />
            <LigneBilan libelle="CA bas" valeur={eur(b.ca.bas)} m2={parM2(b.ca.bas)} />
            <LigneBilan libelle="CA cible" valeur={eur(b.ca.cible)} m2={parM2(b.ca.cible)} fort accent />
            <LigneBilan libelle="CA haut" valeur={eur(b.ca.haut)} m2={parM2(b.ca.haut)} />
          </Cadre>

          <Cadre titre="Indicateurs chiffrés">
            <Intertitre>Exposition du financement</Intertitre>
            <Ligne libelle="Loan to value">{pc(b.exposition.ltv, 0)}</Ligne>
            <Ligne libelle="Loan to cost">{pc(b.exposition.ltc, 0)}</Ligne>
            <Ligne libelle="Risque hypothécaire">{m2(b.exposition.risque_m2)}</Ligne>
            <Ligne libelle="Annuités crowdfunding">{eur(b.exposition.annuites)}</Ligne>
            <Ligne libelle="DSCR">{pc(b.exposition.dscr, 0)}</Ligne>

            <Intertitre>Performance de l'opération · marge, sur prix de revient, sur CA</Intertitre>
            {[["bas", "Hypothèse basse (−10 %)"], ["cible", "Hypothèse cible"], ["haut", "Hypothèse haute (+10 %)"]].map(([k, l]) => (
              <Ligne key={k} libelle={l} fort={k === "cible"} ton={tonMarge(b.performance[k].marge)}>
                {eur(b.performance[k].marge)} · {pc(b.performance[k].sur_pr)} · {pc(b.performance[k].sur_ca)}
              </Ligne>
            ))}

            <Intertitre>Acquisition par un investisseur</Intertitre>
            <Ligne libelle="Rendement bas">{pc(b.rendement.bas, 2)}</Ligne>
            <Ligne libelle="Rendement cible" fort>{pc(b.rendement.cible, 2)}</Ligne>
            <Ligne libelle="Rendement haut">{pc(b.rendement.haut, 2)}</Ligne>
          </Cadre>
        </div>
      </div>

      {/* Le marché : comparables, DVF, graphique, photos */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Cadre titre="Comparables" aide={`Annonces en cours. Le prix au m² est net vendeur : le prix affiché, moins ${nf(1).format(s.frais_agence_comparables_pct || 0)} % de frais d'agence.`} droite={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise">Frais d'agence <Nombre valeur={s.frais_agence_comparables_pct} onChange={pose("frais_agence_comparables_pct")} suffixe="%" className="w-20" /></span>
            <button type="button" onClick={() => ajoute("comparables", { lien: "", localisation: "", description: "", surface: 0, prix_fai: 0 })} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Un comparable</button>
          </span>
        }>
          {!s.comparables.length && <p className="m-0 text-[13.5px] text-brume">Aucun comparable. Ajoutez les annonces du secteur : lien, commune, surface, prix affiché.</p>}
          <div className="flex flex-col gap-2">
            {s.comparables.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 border-b border-trait pb-2 last:border-b-0">
                <div className="grid gap-2 sm:grid-cols-[1.3fr_1fr]">
                  <Texte valeur={c.lien} onChange={poseLigne("comparables", i, "lien")} placeholder="Lien de l'annonce" />
                  <Texte valeur={c.localisation} onChange={poseLigne("comparables", i, "localisation")} placeholder="54610 Nomeny" />
                  <div className="sm:col-span-2"><Texte valeur={c.description} onChange={poseLigne("comparables", i, "description")} placeholder="Maison 5 pièces 110 m²" /></div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Nombre valeur={c.surface} onChange={poseLigne("comparables", i, "surface")} suffixe="m²" decimales={0} className="w-28" />
                    <Nombre valeur={c.prix_fai} onChange={poseLigne("comparables", i, "prix_fai")} suffixe="€" decimales={0} className="w-36" />
                    <span className="ml-auto text-[13.5px] tabular-nums text-encre">{m2(prixM2Comparable(c, s.frais_agence_comparables_pct))}</span>
                    {c.lien && <a href={c.lien} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir l'annonce" title="Ouvrir l'annonce" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre"><ExternalLink className="h-4 w-4" /></a>}
                  </div>
                </div>
                <button type="button" onClick={() => retire("comparables", i)} aria-label="Retirer le comparable" title="Retirer le comparable" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </Cadre>

        <Cadre titre="Demandes de valeurs foncières" aide={lu?.dvf?.ok ? `Ventes de ${s.typologie === "Appartement" ? "appartements" : "maisons"} lues dans ${lu.dvf.communes.join(", ")} (${lu.dvf.annees.join(", ")}), les plus proches en surface.` : "Les ventes réelles du code postal, lues avec l'adresse. Elles se corrigent et se complètent à la main."} droite={
          <span className="inline-flex items-center gap-3">
            <select value={s.typologie} onChange={(e) => pose("typologie")(e.target.value)} aria-label="Type de logement cherché dans DVF" className="h-8 rounded-champ border border-trait bg-transparent px-2 text-[12.5px] text-craie">
              <option value="Maison">Maisons</option>
              <option value="Appartement">Appartements</option>
            </select>
            {lu?.dvf?.ok && lu.dvf.ventes.length > 0 && <button type="button" onClick={() => setS((x) => ({ ...x, dvf: ventesLues(lu) }))} className="text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Reprendre les {lu.dvf.ventes.length} ventes lues</button>}
            <button type="button" onClick={() => ajoute("dvf", { date: "", adresse: "", typologie: s.typologie, surface: 0, prix: 0 })} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Une vente</button>
          </span>
        }>
          {lu?.dvf && !lu.dvf.ok && <p className="m-0 mb-2 text-[13.5px] text-ambre">{lu.dvf.error}</p>}
          {lu?.dvf?.ok && !lu.dvf.ventes.length && <p className="m-0 mb-2 text-[13.5px] text-brume">Aucune vente de ce type et de cette taille dans le code postal sur ces années.</p>}
          {!s.dvf.length && !lu?.dvf && <p className="m-0 text-[13.5px] text-brume">« Lire l'adresse » remplit ce tableau.</p>}
          {s.dvf.map((v, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border-b border-trait py-2 last:border-b-0">
              <input type="date" value={v.date || ""} onChange={(e) => poseLigne("dvf", i, "date")(e.target.value)} className={`${CHAMP} w-36`} />
              <span className="min-w-[160px] flex-1"><Texte valeur={v.adresse} onChange={poseLigne("dvf", i, "adresse")} placeholder="Adresse" /></span>
              <Nombre valeur={v.surface} onChange={poseLigne("dvf", i, "surface")} suffixe="m²" decimales={0} className="w-24" />
              <Nombre valeur={v.prix} onChange={poseLigne("dvf", i, "prix")} suffixe="€" decimales={0} className="w-32" />
              <span className="w-24 text-right text-[13.5px] tabular-nums text-encre">{m2(prixM2Dvf(v))}</span>
              <button type="button" onClick={() => retire("dvf", i)} aria-label="Retirer la vente" title="Retirer la vente" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </Cadre>

        <Cadre titre="Graphique des prix" aide="Du minimum au maximum, la médiane (ou le prix cible) au milieu.">
          <GraphiquePrix marches={b.marches} />
        </Cadre>

        <Cadre titre="Prix au m², en chiffres">
          <div className="grid gap-x-6 sm:grid-cols-3">
            {[["DVF", b.marches.dvf, "mediane"], ["Comparables", b.marches.comparables, "mediane"], ["Cible", b.marches.cible, "cible"]].map(([t, st, milieu]) => (
              <div key={t}>
                <Intertitre>{t}</Intertitre>
                {st ? (
                  <>
                    <Ligne libelle="Max">{m2(st.max)}</Ligne>
                    {milieu === "mediane" && <Ligne libelle="Moyenne">{m2(st.moyenne)}</Ligne>}
                    <Ligne libelle={milieu === "mediane" ? "Médiane" : "Cible"} fort>{m2(st[milieu])}</Ligne>
                    <Ligne libelle="Min">{m2(st.min)}</Ligne>
                  </>
                ) : <p className="m-0 text-[13.5px] text-brume">Pas encore de chiffre.</p>}
              </div>
            ))}
          </div>
        </Cadre>

        <Cadre titre="Photos" className="xl:col-span-2" droite={
          (s.photos || []).length < 4 && (
            <label className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] text-menthe hover:underline">
              <ImagePlus className="h-3.5 w-3.5" />Ajouter une photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { ajouterPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          )
        }>
          {!(s.photos || []).length && <p className="m-0 text-[13.5px] text-brume">Aucune photo. Quatre au plus, la façade d'abord.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(s.photos || []).map((url, i) => (
              <div key={url} className="group relative overflow-hidden rounded-[10px] border border-trait">
                <img src={url} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                <button type="button" onClick={() => retire("photos", i)} aria-label="Retirer la photo" title="Retirer la photo" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-surface-pleine text-ardoise opacity-0 hover:text-encre group-hover:opacity-100 max-md:opacity-100"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </Cadre>
      </div>
    </div>
  );
}

/** Une ligne du bilan : libellé (et son taux s'il en a un), montant saisi ou calculé, montant au m². */
function LigneBilan({ libelle, pct = null, saisie = null, valeur = null, m2: parM2, fort = false, accent = false }) {
  return (
    <div className={`grid min-h-[34px] grid-cols-[1fr_auto_88px] items-center gap-3 border-b border-trait py-1 text-[13.5px] last:border-b-0 ${fort ? "text-encre" : "text-craie"}`}>
      <span className={`flex items-center gap-2 ${fort ? (accent ? "text-menthe" : "text-encre") : "text-ardoise"}`}>{libelle}{pct}</span>
      <span className={`text-right tabular-nums ${accent ? "text-menthe" : ""}`}>{saisie || valeur}</span>
      <span className="text-right tabular-nums text-ardoise">{parM2}</span>
    </div>
  );
}

/** Les ventes DVF lues, au format du tableau. */
function ventesLues(lu) {
  return (lu?.dvf?.ventes || []).map((v) => ({ date: v.date, adresse: v.adresse, typologie: v.typologie, surface: v.surface, prix: v.prix }));
}

export default function Tokimo() {
  const [params, setParams] = useSearchParams();
  const id = params.get("analyse");
  const ouvrir = (x) => setParams(x ? { analyse: x } : {});
  return id ? <Analyse key={id} id={id} onRetour={() => ouvrir(null)} /> : <Liste onOuvrir={ouvrir} />;
}
