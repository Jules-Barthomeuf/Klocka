import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Loader2, ChevronLeft, FileText, Pencil, Download, RotateCcw, Printer, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import CarteLoyers, { COULEURS_NIVEAU } from "@/components/kdata/CarteLoyers";
import { BoutonMecanique, MecaniqueEnLigne } from "@/components/kdata/Mecanique";
import { createPageUrl } from "@/utils";
import { BoutonOutil, BoutonPrincipal, CLASSE_CARTE, CLASSE_TABLEAU } from "@/components/mandataire/elements";

// Valeur locative : la fourchette de loyer au m² d'une adresse.
//
// Deux écrans. L'accueil : une adresse, et les dernières recherches dessous —
// rouvrir l'une d'elles ne coûte rien, la donnée est en base. Puis la carte,
// avec à gauche le panneau de K-Zoning : la rue, le quartier, la ville,
// chacun en fourchette basse et haute, en euros HT HC par m² et par an.
//
// Une recherche neuve pilote Equimmox à trois rayons, quatre minutes : elle
// part en tâche de fond et la page demande où elle en est toutes les trois
// secondes. Le panneau dit après si la donnée venait de la base.
//
// 10 nov. 2026 (Jules, planche Outils) : la page dans le cadre des Outils, au dessin des autres outils : titre de
// 24 px, formulaire sur une ligne, dernières recherches en tableau, panneau de la carte au rayon 12 sur `bg-rail`.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");

const NIVEAUX = [["rue", "Rue"], ["quartier", "Quartier"], ["ville", "Ville"]];

// La mécanique : dans quel ordre Valeur locative interroge quoi.
const ETAPES_MECANIQUE = [
  // Equimmox seul (10 nov. 2026, Jules) : la recherche, puis ses résultats.
  { source: "Equimmox, analyse de loyer, à trois rayons", quoi: "Des baux réellement signés : la rue à 200 m, le quartier à 500 m, la ville à 1 km, chacun en fourchette basse et haute. Le résultat se garde trente jours par adresse : le rouvrir ne relance rien." },
];

// Les quatre classes de la carte, du plus cher au moins cher.
const CLASSES = [
  ["tres_elevee", "Très élevée", "bg-alerte"],
  ["elevee", "Élevée / intermédiaire", "bg-ambre"],
  ["moyenne", "Moyenne / faible", "bg-jaune"],
  ["tres_faible", "Très faible", "bg-vert"],
];

const SOURCE_REF = { klocka_bail: "Bail Klocka", klocka_saisi: "Klocka, saisi", klocka_fiche: "Fiche d'agent", equimmox: "Equimmox" };

/**
 * La valeur retenue (18 oct. 2026, sortie de Data-B) : la fourchette des comparables, sa source et sa
 * confiance, puis chaque comparable avec sa source et son poids. Sous le seuil de confiance, Equimmox
 * est affiché et les loyers Klocka servent de contrôle.
 */
function ValeurRetenue({ r }) {
  const [ouvert, setOuvert] = useState(false);
  const v = r?.valeur;
  const c = r?.comparables;
  if (!v) return null;
  return (
    <div className="border-b border-trait px-4 py-3">
      <p className="m-0 text-[12.5px] text-ardoise">Valeur retenue</p>
      <p className="m-0 mt-1 text-[22px] font-medium tabular-nums text-encre">{euros(v.bas)} à {euros(v.haut)}</p>
      <p className="m-0 mt-0.5 text-[12px] text-ardoise">
        médiane {euros(v.central)} · {v.source === "klocka" ? `loyers Klocka${c?.libelle ? `, ${c.libelle.toLowerCase()}` : ""}` : "Equimmox"} · confiance {v.confiance}
      </p>
      {c?.controle && <p className="m-0 mt-1 text-[11.5px] text-brume">Contrôle : médiane Klocka {euros(c.controle.klocka)}, Equimmox {euros(c.controle.equimmox)} ({c.controle.ecart_pct > 0 ? "+" : ""}{c.controle.ecart_pct} %).</p>}
      {c?.comparables?.length > 0 && (
        <>
          <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="mt-2 text-[12px] text-menthe-texte hover:text-encre" style={{ background: "transparent" }}>
            {ouvert ? "Masquer" : "Voir"} les {c.comparables.length} comparables
          </button>
          {ouvert && (
            <ul className="m-0 mt-2 list-none p-0">
              {c.comparables.map((x, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-t border-trait py-1.5 text-[12px]">
                  <span className="min-w-0 truncate text-craie" title={x.adresse || x.titre || ""}>{x.titre || x.adresse || SOURCE_REF[x.source]}</span>
                  <span className="flex-none text-brume">{SOURCE_REF[x.source] || x.source} · ×{x.poids}</span>
                  <span className="flex-none tabular-nums text-encre">{euros(x.loyer_m2)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** Un niveau du panneau : son nom, sa fourchette. */
function Niveau({ titre, valeur }) {
  return (
    <div className="border-b border-trait px-4 py-3 last:border-b-0">
      <p className="m-0 text-[12.5px] text-ardoise">{titre}</p>
      <p className="m-0 mt-0.5 truncate text-[14px] font-medium text-encre">{valeur?.nom || "-"}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-[12px] border border-trait bg-fond px-3.5 py-2.5">
          <p className="m-0 text-[18px] font-medium tabular-nums text-encre">{euros(valeur?.basse)}</p>
          <p className="m-0 text-[12.5px] text-ardoise">Estimation basse</p>
        </div>
        <div className="rounded-[12px] border border-trait bg-fond px-3.5 py-2.5">
          <p className="m-0 text-[18px] font-medium tabular-nums text-menthe-texte">{euros(valeur?.haute)}</p>
          <p className="m-0 text-[12.5px] text-ardoise">Estimation haute</p>
        </div>
      </div>
    </div>
  );
}

function Action({ icone: Icone, children, onClick }) {
  return (
    <BoutonOutil onClick={onClick}><Icone className="h-3.5 w-3.5" />{children}</BoutonOutil>
  );
}

/** Le rapport : la même donnée, en document, prêt à imprimer. */
function Rapport({ r, point, onFermer }) {
  return (
    <div className="k-impression mx-auto max-w-[760px] px-4 pb-20 pt-8">
      <div className="k-sans-impression mb-6 flex items-center justify-between max-md:flex-wrap max-md:gap-3">
        <button onClick={onFermer} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre"><ChevronLeft className="h-4 w-4" />Revenir à la carte</button>
        <BoutonPrincipal onClick={() => window.print()}><Printer className="h-3.5 w-3.5" />Imprimer / PDF</BoutonPrincipal>
      </div>
      <div className={`${CARTE} p-7 max-md:p-4`}>
        <section className="border-b border-trait pb-6 text-center">
          <span className="alx-mont inline-block rounded-full border border-menthe/40 px-3 py-1 text-[10.5px] uppercase tracking-[.16em] text-menthe-texte">Valeur locative</span>
          <h1 className="mt-4 mb-2 text-[28px] font-light max-md:text-[22px] tracking-[-0.01em] text-encre">Estimation du loyer annuel</h1>
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
  // 10 nov. 2026, Jules : écran d'arrivée. La surface part avec la recherche ; le serveur ne s'en sert pas encore.
  const [surface, setSurface] = useState("");
  const [mecanique, setMecanique] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const choisie = useRef("");
  const [vue, setVue] = useState(null);
  const [rapport, setRapport] = useState(false);
  const [secteurOuvert, setSecteurOuvert] = useState(null);
  // La recherche partie en tâche de fond : sa clé, et l'étape où elle en est.
  const [attente, setAttente] = useState(null);
  const minuteur = useRef(null);
  useEffect(() => () => clearInterval(minuteur.current), []);

  const { data } = useQuery({ queryKey: ["kvaleurlocative"], queryFn: () => base44.request("GET", "/api/kvaleurlocative"), enabled: user?.role === "admin" });
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

  const poser = (r) => { setVue(r); setRapport(false); setSecteurOuvert(null); setSuggestions([]); qc.invalidateQueries({ queryKey: ["kvaleurlocative"] }); };
  const arreter = () => { clearInterval(minuteur.current); minuteur.current = null; setAttente(null); };
  // Equimmox se pilote pendant plusieurs minutes : on demande l'état toutes
  // les trois secondes, et la page se remplit quand c'est prêt.
  const suivre = (r) => {
    setAttente({ cle: r.cle, jalon: r.jalon, point: r.point });
    clearInterval(minuteur.current);
    minuteur.current = setInterval(async () => {
      try {
        const t = await base44.request("GET", `/api/kvaleurlocative/etat?cle=${encodeURIComponent(r.cle)}`);
        if (t.en_cours) { setAttente((a) => (a ? { ...a, jalon: t.jalon } : a)); return; }
        arreter();
        poser(t);
      } catch (err) {
        arreter();
        toast.error(err?.message || "La recherche a échoué");
      }
    }, 3000);
  };
  const chercher = useMutation({
    mutationFn: (texte) => base44.request("POST", "/api/kvaleurlocative", { body: { adresse: texte, surface: Number.parseFloat(String(surface).replace(",", ".")) > 0 ? Number.parseFloat(String(surface).replace(",", ".")) : null } }),
    onSuccess: (r) => { if (r.en_cours) suivre(r); else poser(r); },
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
      <div className="relative min-h-0 w-full flex-1 overflow-hidden max-md:h-[calc(100dvh-var(--k-haut-mobile,3.5rem)-var(--k-bas-mobile,0px))] max-md:flex-none">
        <CarteLoyers point={vue.point} secteurs={vue.secteurs || []} onSecteur={setSecteurOuvert} onErreur={(m) => toast.error(m)} />

        <div className={`${CLASSE_CARTE} absolute left-6 top-6 z-[500] flex max-h-[calc(100%-3rem)] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden max-md:left-3 max-md:right-3 max-md:top-3 max-md:max-h-[55%] max-md:w-auto max-md:max-w-none`}>
          <div className="border-b border-trait px-4 pb-3 pt-4">
            <Link to={createPageUrl("KData")} className="text-[13px] text-ardoise hover:text-encre">← Outils</Link>
            <h1 className="m-0 mt-1 text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">Valeur locative</h1>
            <p className="m-0 mt-2 truncate text-[14px] text-encre" title={vue.point?.label || r.adresse}>{vue.point?.label || r.adresse}</p>
            <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-ardoise">Loyer annuel HT HC au m², selon la rue, le quartier et la ville</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Action icone={FileText} onClick={() => setRapport(true)}>Créer un rapport</Action>
              <Action icone={Pencil} onClick={() => { choisie.current = ""; setAdresse(vue.point?.label || r.adresse || ""); setVue(null); }}>Modifier</Action>
              <Action icone={Download} onClick={exporter}>Exporter</Action>
              <Action icone={RotateCcw} onClick={() => { choisie.current = ""; setAdresse(""); setVue(null); }}>Nouvelle recherche</Action>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <ValeurRetenue r={r} />
            {NIVEAUX.map(([cle, titre]) => <Niveau key={cle} titre={titre} valeur={r[cle]} />)}
          {secteurs.length === 0 ? (
            <p className="m-0 border-t border-trait px-4 py-3 text-[10.5px] leading-[1.5] text-brume">
              {r.erreurs?.length ? `${r.erreurs.join(" ; ")}. ` : ""}{r.du_cache ? "Donnée reprise de la base." : "Baux constatés chez Equimmox."}
            </p>
          ) : (
          <div className="border-t border-trait px-4 py-3">
            <p className="m-0 mb-2 text-[12.5px] text-ardoise">Découpage par niveau de valeur locative</p>
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
              {nLus} quartier{nLus > 1 ? "s" : ""} classé{nLus > 1 ? "s" : ""} par sa fourchette lue ; les autres par un indice de position (commerces relevés, niveau de vie), qui classe sans chiffrer.
              {r.du_cache ? " Donnée reprise de la base." : r.constate ? " Baux constatés chez Equimmox." : " Loyer déduit des ventes, faute de lecture Equimmox."}
            </p>
          </div>
          )}
          </div>
        </div>

        {secteurOuvert && (
          <div className={`${CLASSE_CARTE} absolute bottom-6 left-1/2 z-[500] w-[320px] max-w-[calc(100vw-2rem)] -translate-x-1/2 px-4 py-3 max-md:bottom-[calc(env(safe-area-inset-bottom)+64px)]`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-medium text-encre">{secteurOuvert.nom_iris}</p>
                <p className="m-0 mt-0.5 text-[12px] tabular-nums text-ardoise">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COULEURS_NIVEAU[secteurOuvert.niveau] || "transparent" }} />
                  {CLASSES.find(([c]) => c === secteurOuvert.niveau)?.[1] || "Non classé"}
                  {secteurOuvert.origine === "quartier" ? ` · ${euros(secteurOuvert.basse)} à ${euros(secteurOuvert.haute)} / m² / an (lu)`
                    : secteurOuvert.origine === "indice" ? ` · indice : ${secteurOuvert.commerces ?? "—"} commerces${secteurOuvert.niveau_de_vie ? `, ${euros(secteurOuvert.niveau_de_vie)} de niveau de vie` : ""}` : ""}
                </p>
              </div>
              <button onClick={() => setSecteurOuvert(null)} aria-label="Fermer" className="text-brume hover:text-encre max-md:-m-2 max-md:p-2"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}
        <BoutonMecanique etapes={ETAPES_MECANIQUE} />
      </div>
    );
  }

  // ── L'accueil : une adresse, et les dernières recherches ─────────────────
  // 10 nov. 2026, Jules : écran d'arrivée. Planche validée : titre et bouton de la mécanique, deux cartes égales
  // (le formulaire, le dessin des trois rayons), puis les dernières recherches en tableau sans traits verticaux ;
  // la recherche en cours y tient la première ligne.
  const occupe = chercher.isPending || rouvrir.isPending || !!attente;
  const peutChercher = !occupe && adresse.trim().length >= 5;
  const lancer = () => { if (peutChercher) chercher.mutate(adresse); };
  const total = recherches.length + (attente ? 1 : 0);
  // La part lue : un tiers par rayon, la moitié du tiers en cours.
  const RAYONS_ORDRE = ["rue", "quartier", "ville"];
  const rang = RAYONS_ORDRE.indexOf(attente?.jalon);
  const part = attente ? Math.round(((rang < 0 ? 0 : rang) + 0.5) / 3 * 100) : 0;
  const nombre = (n) => Math.round(n).toLocaleString("fr-FR");
  const fourchette = (v) => (v && (v.basse != null || v.haute != null) ? `${nombre(v.basse ?? v.haute)} à ${nombre(v.haute ?? v.basse)} €` : "");
  const TH = "h-[38px] whitespace-nowrap border-b border-trait px-4 text-left text-[12.5px] font-normal text-ardoise";
  const TD = "h-[62px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-trait px-4 align-middle text-[13.5px] tabular-nums text-craie";
  const ECHELLES_DESSIN = [["La rue", "Les baux à 200 m"], ["Le quartier", "Les baux à 500 m"], ["La ville", "Les baux à 1 km"]];
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 pb-16 pt-[22px] md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="m-0 text-[20px] font-medium leading-[1.3] text-encre">
            Valeur locative{total > 0 && <span className="ml-2 text-[13.5px] font-normal tabular-nums text-ardoise">{total}</span>}
          </h1>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">La fourchette de loyer au m² d&apos;une adresse : la rue, le quartier, la ville.</p>
        </div>
        <BoutonOutil onClick={() => setMecanique((o) => !o)} aria-expanded={mecanique} className="rounded-[8px]">D&apos;où viennent les chiffres</BoutonOutil>
      </div>
      {mecanique && <MecaniqueEnLigne etapes={ETAPES_MECANIQUE} titre="D'où viennent les chiffres" className="mt-4" ouvertDepart />}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={`${CLASSE_CARTE} p-5`}>
          <div className="relative">
            <label className="mb-1.5 block text-[12.5px] text-ardoise" htmlFor="vl-adresse">Adresse</label>
            <input id="vl-adresse" value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="Allées Charles de Fitte, 31300 Toulouse"
              onKeyDown={(ev) => { if (ev.key === "Enter") lancer(); }}
              className="h-10 w-full rounded-[8px] border border-bord-doux bg-fond px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
            {suggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-[66px] z-20 m-0 list-none overflow-hidden rounded-[12px] border border-trait bg-rail p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                {suggestions.map((s) => <li key={s}><button onClick={() => { choisie.current = s; setAdresse(s); setSuggestions([]); }} className="block w-full px-3 py-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>{s}</button></li>)}
              </ul>
            )}
          </div>
          <label className="mb-1.5 mt-4 block text-[12.5px] text-ardoise" htmlFor="vl-surface">Surface, facultatif</label>
          <div className="flex h-10 w-[180px] items-center gap-1.5 rounded-[8px] border border-bord-doux bg-fond px-3 focus-within:border-menthe">
            <input id="vl-surface" value={surface} onChange={(ev) => setSurface(ev.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="70"
              onKeyDown={(ev) => { if (ev.key === "Enter") lancer(); }}
              className="w-full min-w-0 border-0 bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            <span className="flex-none text-[14px] text-brume">m²</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="border-l-2 border-bord-doux pl-3">
              <p className="m-0 text-[14px] font-medium text-encre">Tout de suite</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">Une adresse déjà lue dans les trente jours.</p>
            </div>
            <div className="border-l-2 border-bord-doux pl-3">
              <p className="m-0 text-[14px] font-medium text-encre">Environ quatre minutes</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">Une recherche neuve. Vous pouvez quitter la page.</p>
            </div>
          </div>
          <BoutonPrincipal onClick={lancer} disabled={!peutChercher} className="mt-4 h-10 rounded-[8px] px-4">
            {chercher.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Rechercher
          </BoutonPrincipal>
        </div>

        <div className={`${CLASSE_CARTE} flex items-center gap-7 p-5 max-sm:flex-col max-sm:items-start`}>
          {/* Les trois rayons, en cercles : 1 km, 500 m, 200 m, et l'adresse au centre. */}
          <div aria-hidden="true" className="relative flex h-[260px] w-[260px] flex-none items-center justify-center rounded-full border border-bord-doux">
            <span className="absolute top-3 text-[11px] text-ardoise">1 km</span>
            <div className="relative flex h-[130px] w-[130px] items-center justify-center rounded-full border border-bord-vif bg-fond">
              <span className="absolute top-3 text-[11px] text-craie">500 m</span>
              <span className="absolute bottom-3 text-[11px] text-craie">200 m</span>
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-menthe/50 bg-relief">
                <span className="h-1.5 w-1.5 rounded-full bg-encre" />
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {ECHELLES_DESSIN.map(([titre, detail]) => (
              <div key={titre} className="mb-3 last:mb-0">
                <p className="m-0 text-[14px] font-medium text-encre">{titre}</p>
                <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{detail}</p>
              </div>
            ))}
            <p className="m-0 mt-4 border-t border-trait pt-4 text-[12.5px] leading-[1.6] text-ardoise">
              Pour chaque échelle, une fourchette basse et haute au m² par an. Source : Equimmox.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="m-0 mb-2.5 text-[15px] font-medium text-encre">
          Dernières recherches{total > 0 && <span className="ml-2 text-[12.5px] font-normal tabular-nums text-ardoise">{total}</span>}
        </h2>
        {!total ? <p className="m-0 text-[13.5px] text-brume">Aucune pour l&apos;instant.</p> : (
          <div className={CLASSE_TABLEAU}>
            <table className="w-full min-w-[860px] table-fixed border-collapse [&_tbody_tr:last-child_td]:border-b-0">
              <colgroup><col /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[170px]" /></colgroup>
              <thead><tr><th className={TH}>Adresse</th><th className={TH}>La rue</th><th className={TH}>Le quartier</th><th className={TH}>La ville</th><th className={`${TH} text-right`}>Lue</th></tr></thead>
              <tbody>
                {attente && (
                  <tr>
                    <td className={TD}>
                      <p className="m-0 truncate text-[14px] text-encre" title={attente.point?.label || ""}>{attente.point?.label || adresse}</p>
                      <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{attente.point?.ville || ""}</p>
                    </td>
                    <td colSpan={3} className={TD}>
                      <div className="flex items-center gap-3">
                        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-relief" role="progressbar" aria-valuenow={part} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full rounded-full bg-bleu transition-[width] duration-700" style={{ width: `${part}%` }} />
                        </div>
                        <span className="flex-none text-[12.5px] text-bleu">Recherche en cours</span>
                      </div>
                    </td>
                    <td className={`${TD} text-right text-[12.5px] text-ardoise`}>{String(user.full_name || user.email || "").trim().split(/[\s@]+/)[0]} · à l&apos;instant</td>
                  </tr>
                )}
                {recherches.map((x) => (
                  <tr key={x.id} onClick={() => !occupe && rouvrir.mutate(x.id)} className={occupe ? "opacity-60" : "cursor-pointer hover:bg-relief"}>
                    <td className={TD}>
                      <p className="m-0 truncate text-[14px] text-encre" title={x.adresse}>{x.adresse}</p>
                      <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{x.quartier?.nom || x.rue?.nom || ""}</p>
                    </td>
                    <td className={TD}>{fourchette(x.rue)}</td>
                    <td className={TD}>{fourchette(x.quartier)}</td>
                    <td className={TD}>{fourchette(x.ville)}</td>
                    <td className={`${TD} text-right text-[12.5px] text-ardoise`} title={x.par || ""}>{[x.par_nom || String(x.par || "").split("@")[0], quand(x.le)].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
