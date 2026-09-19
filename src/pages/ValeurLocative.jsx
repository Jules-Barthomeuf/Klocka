import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Search, Loader2, ChevronLeft, FileText, Pencil, Download, RotateCcw, Printer, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import CarteLoyers, { COULEURS_NIVEAU } from "@/components/kdata/CarteLoyers";
import { BoutonMecanique } from "@/components/kdata/Mecanique";

// Valeur locative : la fourchette de loyer au m² d'une adresse.
//
// Deux écrans. L'accueil : une adresse, et les dernières recherches dessous —
// rouvrir l'une d'elles ne coûte rien, la donnée est en base. Puis la carte,
// avec à gauche le panneau de K-Zoning : la rue, le quartier, la ville,
// chacun en fourchette basse et haute, en euros HT HC par m² et par an.
//
// UNE RECHERCHE NEUVE CONSOMME PROBABLEMENT UN CRÉDIT DATA-B : l'accueil le
// dit avant de lancer, et le panneau dit après si la donnée venait du cache.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

const NIVEAUX = [["rue", "Rue"], ["quartier", "Quartier"], ["ville", "Ville"]];

// La mécanique : dans quel ordre Valeur locative interroge quoi.
const ETAPES_MECANIQUE = [
  { source: "Data-B, module Valeurs locatives", credit: true, quoi: "La rue, le quartier et la ville, chacun en fourchette basse et haute. Le résultat se garde trente jours par adresse : le rouvrir ne redemande rien." },
  { source: "Géoplateforme, contours IRIS", quoi: "Le découpage en quartiers statistiques pour colorer la carte." },
  { source: "OpenStreetMap", quoi: "La densité de commerces d'un IRIS que Data-B n'a pas lu : un des deux signaux de l'indice de position." },
  { source: "INSEE Filosofi", quoi: "Le niveau de vie des habitants d'un IRIS que Data-B n'a pas lu : le second signal. L'indice classe, il ne chiffre pas — aucun euro n'est inventé." },
];

// Les quatre classes de la carte, du plus cher au moins cher.
const CLASSES = [
  ["tres_elevee", "Très élevée", "bg-alerte"],
  ["elevee", "Élevée / intermédiaire", "bg-ambre"],
  ["moyenne", "Moyenne / faible", "bg-jaune"],
  ["tres_faible", "Très faible", "bg-vert"],
];

/** Un niveau du panneau : son nom, sa fourchette. */
function Niveau({ titre, valeur }) {
  return (
    <div className="border-b border-trait px-4 py-3 last:border-b-0">
      <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">{titre}</p>
      <p className="m-0 mt-0.5 truncate text-[14px] font-medium text-encre">{valeur?.nom || "—"}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-[10px] border border-trait bg-surface px-3 py-2">
          <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">Estimation basse</p>
          <p className="m-0 mt-0.5 text-[17px] font-semibold tabular-nums text-encre">{euros(valeur?.basse)}</p>
        </div>
        <div className="rounded-[10px] border border-trait bg-surface px-3 py-2">
          <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">Estimation haute</p>
          <p className="m-0 mt-0.5 text-[17px] font-semibold tabular-nums text-menthe-texte">{euros(valeur?.haute)}</p>
        </div>
      </div>
    </div>
  );
}

function Action({ icone: Icone, children, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-full border border-bord px-3 py-1.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:border-bord-doux hover:text-encre">
      <Icone className="h-3.5 w-3.5" />{children}
    </button>
  );
}

/** Le rapport : la même donnée, en document, prêt à imprimer. */
function Rapport({ r, point, onFermer }) {
  return (
    <div className="k-impression mx-auto max-w-[760px] px-4 pb-20 pt-8">
      <div className="k-sans-impression mb-6 flex items-center justify-between">
        <button onClick={onFermer} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Revenir à la carte</button>
        <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-full border border-menthe/40 bg-menthe/10 px-4 text-[12px] font-medium uppercase tracking-[.08em] text-menthe-texte hover:bg-menthe/20">
          <Printer className="h-3.5 w-3.5" />Imprimer / PDF
        </button>
      </div>
      <div className={`${CARTE} p-7 max-md:p-4`}>
        <section className="border-b border-trait pb-6 text-center">
          <span className="alx-mont inline-block rounded-full border border-menthe/40 px-3 py-1 text-[10.5px] uppercase tracking-[.16em] text-menthe-texte">Valeur locative</span>
          <h1 className="mt-4 mb-2 text-[28px] font-light tracking-[-0.01em] text-encre">Estimation du loyer annuel</h1>
          <p className="m-0 text-[15px] font-medium text-encre">{point?.label || r.adresse}</p>
          <p className="m-0 mt-2 text-[11.5px] text-brume">Montant HT / HC au m² selon la rue, le quartier et la ville · {r.unite} · lu le {quand(r.le)}</p>
        </section>
        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {NIVEAUX.map(([cle, titre]) => (
            <div key={cle} className="overflow-hidden rounded-[12px] border border-bord">
              <p className="m-0 bg-relief px-3 py-1.5 text-center text-[11px] uppercase tracking-[.08em] text-brume">{titre}</p>
              <p className="m-0 truncate px-3 pt-3 text-center text-[13.5px] font-medium text-encre">{r[cle]?.nom || "—"}</p>
              <p className="m-0 py-2 text-center text-[20px] font-semibold tabular-nums text-encre">{euros(r[cle]?.basse)} <span className="text-brume">à</span> {euros(r[cle]?.haute)}</p>
              <p className="m-0 border-t border-trait px-3 py-1.5 text-center text-[10.5px] text-ardoise">par m² et par an, HT HC</p>
            </div>
          ))}
        </section>
        <p className="mt-6 mb-0 text-right text-[10.5px] italic text-brume">Source : {r.source}. Les fourchettes sont des estimations de marché, pas un avis de valeur.</p>
      </div>
    </div>
  );
}

export default function ValeurLocative() {
  const user = useUser();
  const qc = useQueryClient();
  const [adresse, setAdresse] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);
  const [rapport, setRapport] = useState(false);
  const [secteurOuvert, setSecteurOuvert] = useState(null);

  const { data } = useQuery({ queryKey: ["kvaleurlocative"], queryFn: () => base44.request("GET", "/api/kvaleurlocative"), enabled: user?.role === "admin" });
  const recherches = data?.recherches || [];

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

  const chercher = useMutation({
    mutationFn: (texte) => base44.request("POST", "/api/kvaleurlocative", { body: { adresse: texte } }),
    onSuccess: (r) => { setVue(r); setRapport(false); setSecteurOuvert(null); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kvaleurlocative"] }); },
    onError: (err) => toast.error(err?.message || "Recherche impossible"),
  });
  const rouvrir = useMutation({
    mutationFn: (id) => base44.request("GET", `/api/kvaleurlocative/${id}`),
    onSuccess: (r) => { setVue(r); setRapport(false); setSecteurOuvert(null); },
    onError: (err) => toast.error(err?.message || "Ouverture impossible"),
  });

  // Ouverte depuis la file de K-Data : « ?id=… » rouvre une recherche sans
  // crédit ; « ?adresse=… » en lance une. Le paramètre ne se rejoue pas.
  const { search } = useLocation();
  const vuUrl = useRef("");
  useEffect(() => {
    if (vuUrl.current === search) return;
    const p = new URLSearchParams(search);
    const id = p.get("id");
    const a = p.get("adresse");
    if (!id && !a) return;
    vuUrl.current = search;
    if (id) rouvrir.mutate(id);
    else { choisie.current = a; setAdresse(a); chercher.mutate(a); }
  }, [search]);

  if (!user || user.role !== "admin") return null;

  const exporter = () => {
    const r = vue.resultat;
    const lignes = [["niveau", "nom", "estimation_basse", "estimation_haute", "unite"].join(";")];
    for (const [cle, titre] of NIVEAUX) lignes.push([titre, r[cle]?.nom || "", r[cle]?.basse ?? "", r[cle]?.haute ?? "", r.unite].join(";"));
    const blob = new Blob(["﻿" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `valeur-locative-${(vue.point?.label || r.adresse || "adresse").replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── La carte et son panneau ──────────────────────────────────────────────
  if (vue) {
    const r = vue.resultat;
    if (rapport) return <Rapport r={r} point={vue.point} onFermer={() => setRapport(false)} />;
    const secteurs = vue.secteurs || [];
    const parClasse = Object.fromEntries(CLASSES.map(([cle]) => [cle, secteurs.filter((x) => x.niveau === cle).sort((a, b) => (b.ici ? 1 : 0) - (a.ici ? 1 : 0) || a.nom_iris.localeCompare(b.nom_iris))]));
    const nLus = secteurs.filter((x) => x.origine === "quartier").length;
    return (
      <div className="relative h-[calc(100dvh-56px)] overflow-hidden">
        <CarteLoyers point={vue.point} secteurs={vue.secteurs || []} onSecteur={setSecteurOuvert} onErreur={(m) => toast.error(m)} />

        <div className="absolute left-4 top-4 z-[500] flex max-h-[calc(100%-2rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[16px] border border-bord bg-fond/70 backdrop-blur-xl">
          <div className="border-b border-trait px-4 pb-3 pt-4">
            <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.16em] text-menthe-texte">Estimation du loyer annuel</p>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-ardoise">Montant HT / HC au m² selon la rue, le quartier et la ville</p>
            <p className="m-0 mt-2 truncate text-[13px] font-medium text-encre" title={vue.point?.label || r.adresse}>{vue.point?.label || r.adresse}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Action icone={FileText} onClick={() => setRapport(true)}>Créer un rapport</Action>
              <Action icone={Pencil} onClick={() => { choisie.current = ""; setAdresse(vue.point?.label || r.adresse || ""); setVue(null); }}>Modifier</Action>
              <Action icone={Download} onClick={exporter}>Exporter</Action>
              <Action icone={RotateCcw} onClick={() => { choisie.current = ""; setAdresse(""); setVue(null); }}>Nouvelle recherche</Action>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {NIVEAUX.map(([cle, titre]) => <Niveau key={cle} titre={titre} valeur={r[cle]} />)}
          <div className="border-t border-trait px-4 py-3">
            <p className="alx-mont m-0 mb-2 text-[10.5px] uppercase tracking-[.14em] text-brume">Découpage par niveau de valeur locative</p>
            {secteurs.some((x) => x.niveau) ? CLASSES.map(([cle, libelle, chip]) => (
              <div key={cle} className="mb-2">
                <p className="m-0 flex items-center gap-2 text-[12px] font-medium text-encre">
                  <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${chip}`} />{libelle}
                  <span className="text-brume">· {parClasse[cle].length}</span>
                </p>
                <p className="m-0 mt-0.5 pl-[18px] text-[11px] leading-[1.55] text-ardoise">
                  {parClasse[cle].length ? parClasse[cle].map((x, i) => (
                    <span key={x.code_iris}>{i > 0 ? ", " : ""}<span className={x.ici ? "font-semibold text-encre" : ""}>{x.nom_iris}{x.ici ? " (quartier ciblé)" : ""}</span></span>
                  )) : <span className="text-brume">aucun</span>}
                </p>
              </div>
            )) : <p className="m-0 text-[11px] text-brume">{vue.erreur_secteurs ? `Secteurs indisponibles : ${vue.erreur_secteurs}` : "Aucun secteur à classer."}</p>}
            <p className="m-0 mt-2 text-[10.5px] leading-[1.5] text-brume">
              {nLus} quartier{nLus > 1 ? "s" : ""} classé{nLus > 1 ? "s" : ""} par sa fourchette Data-B ; les autres par un indice de position (commerces relevés, niveau de vie), qui classe sans chiffrer.
              {r.du_cache ? " Donnée reprise de la base, aucun crédit dépensé." : " Un crédit Data-B dépensé."}
            </p>
          </div>
          </div>
        </div>

        {secteurOuvert && (
          <div className="absolute bottom-4 left-1/2 z-[500] w-[320px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[14px] border border-bord bg-fond/80 px-4 py-3 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-medium text-encre">{secteurOuvert.nom_iris}</p>
                <p className="m-0 mt-0.5 text-[12px] tabular-nums text-ardoise">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COULEURS_NIVEAU[secteurOuvert.niveau] || "transparent" }} />
                  {CLASSES.find(([c]) => c === secteurOuvert.niveau)?.[1] || "Non classé"}
                  {secteurOuvert.origine === "quartier" ? ` · ${euros(secteurOuvert.basse)} à ${euros(secteurOuvert.haute)} / m² / an (Data-B)`
                    : secteurOuvert.origine === "indice" ? ` · indice : ${secteurOuvert.commerces ?? "—"} commerces${secteurOuvert.niveau_de_vie ? `, ${euros(secteurOuvert.niveau_de_vie)} de niveau de vie` : ""}` : ""}
                </p>
              </div>
              <button onClick={() => setSecteurOuvert(null)} className="text-brume hover:text-encre"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        <BoutonMecanique etapes={ETAPES_MECANIQUE} />
      </div>
    );
  }

  // ── L'accueil : une adresse, et les dernières recherches ─────────────────
  const occupe = chercher.isPending || rouvrir.isPending;
  return (
    <div className="mx-auto max-w-[900px] px-4 pb-20 pt-10">
      <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">K-Data</p>
      <h1 className="mt-2 mb-6 text-[30px] font-light tracking-[-0.01em] text-encre">Valeur locative</h1>

      <div className={`${CARTE} p-5`}>
        <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">Adresse</label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
            <Search className="h-4 w-4 flex-shrink-0 text-brume" />
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="Allées Charles de Fitte, 31300 Toulouse"
              onKeyDown={(ev) => { if (ev.key === "Enter" && adresse.trim().length >= 5) chercher.mutate(adresse); }}
              className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
          </div>
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-fond p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
              {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>)}
            </ul>
          )}
        </div>
        <p className="mt-3 mb-0 text-[11.5px] leading-[1.6] text-brume">
          Une recherche neuve lit Data-B et consomme probablement un crédit. Une même adresse dans les trente jours, ou une recherche de la liste ci-dessous, n&apos;en dépense aucun.
        </p>
        <button onClick={() => chercher.mutate(adresse)} disabled={occupe || adresse.trim().length < 5}
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
          {chercher.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Rechercher
        </button>
      </div>

      <h2 className="mt-10 mb-3 text-[17px] font-medium text-encre">Dernières recherches</h2>
      {!recherches.length ? <p className="m-0 text-[13px] text-brume">Aucune pour l&apos;instant.</p> : (
        <ul className="m-0 list-none p-0">
          {recherches.map((x) => (
            <li key={x.id}>
              <button onClick={() => rouvrir.mutate(x.id)} disabled={occupe} className="flex w-full items-center gap-4 border-b border-trait py-3 text-left hover:bg-surface disabled:opacity-60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-encre">{x.adresse}</span>
                  <span className="block text-[11.5px] text-brume">{quand(x.le)}{x.par ? ` · ${x.par}` : ""}{x.quartier?.nom ? ` · ${x.quartier.nom}` : ""}</span>
                </span>
                <span className="flex-shrink-0 text-[13px] tabular-nums text-menthe-texte">
                  {x.rue ? `${euros(x.rue.basse)} à ${euros(x.rue.haute)}` : x.quartier ? `${euros(x.quartier.basse)} à ${euros(x.quartier.haute)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
