import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, Pencil, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { FriseFaits, FenetreSource, TYPES, TEINTES, SOURCES, quand } from "@/components/layer/FriseFaits";
import CeQueKlockaSait from "@/components/layer/CeQueKlockaSait";
import { BarresHorizontales, Chiffre, ChiffreCourbe, Croissance, useCouleurs } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";

// L'Intelligence (le Layer ; spec MVP du 14 oct. 2026, refonte du 15 oct.) : ce
// qui a été dit, décidé ou promis, gardé avec sa source. Voir docs/layer.md.

const API = "/api/layer";
const ENTITES = { dossier: "Dossier", projet: "Projet", agent: "Agent", agence: "Agence", investisseur: "Investisseur", ville: "Ville" };
const bouton = "inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40";
const principal = "inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[12.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50";

// La page (phase 7 du Layer, 15-16 oct. 2026) : reconstruite sur le modèle de
// Suivi > Appels, avec ses briques (components/monitoring/GraphesAppels.jsx).
// En tête, quatre indicateurs avec leur courbe sur 30 jours ; puis la
// croissance de ce qu'on donne à l'Intelligence, depuis le 13 oct. (Jules :
// avant, c'était du test) ; puis les onglets À valider, Faits (filtres type,
// statut, période, fiche), Synthèses, Sources, Évaluation.

const ONGLETS = [["a_valider", "À valider"], ["faits", "Faits"], ["syntheses", "Synthèses"], ["sources", "Sources"], ["evaluation", "Évaluation"]];
const pct = (v) => (v == null ? "—" : `${v} %`);

export default function Intelligence() {
  const [onglet, setOnglet] = useState("a_valider");
  const c = useCouleurs();
  const etat = useQuery({ queryKey: ["layer", "etat"], queryFn: () => base44.request("GET", `${API}/etat`) });
  const tableau = useQuery({ queryKey: ["layer", "tableau"], queryFn: () => base44.request("GET", `${API}/tableau?jours=30`) });
  const tous = useQuery({ queryKey: ["layer", "faits", "tous"], queryFn: () => base44.request("GET", `${API}/faits?tous=1`) });
  const syntheses = useQuery({ queryKey: ["layer", "syntheses"], queryFn: () => base44.request("GET", `${API}/syntheses`) });
  const e = etat.data;
  const t = tableau.data;
  const nombre = { a_valider: e?.a_valider || 0, faits: (tous.data?.faits || []).filter((f) => f.statut !== "rejete").length, syntheses: syntheses.data?.syntheses?.length || 0 };
  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1300px] px-4 py-8 md:px-8 md:py-10">
        <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">Intelligence</h1>
        <p className="m-0 mt-1.5 max-w-[760px] text-[13.5px] text-ardoise">Ce qui a été dit, décidé ou promis, tiré des comptes rendus, des réunions, des appels et des débriefs. Un fait ne répond aux questions d'AK qu'une fois validé.</p>

        {t && (
          <div className="mt-7 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <ChiffreCourbe c={c} libelle="Faits validés · 7 jours" valeur={t.kpis.valides_semaine} note="par jour sur 30 jours" serie={t.serie} cle="valides" />
              <ChiffreCourbe c={c} libelle="Validés sans correction" valeur={pct(t.kpis.part_sans_correction)} note="sur 7 jours" serie={t.serie} cle="part_sans_correction" format={(v) => `${v} %`} />
              <ChiffreCourbe c={c} libelle="Engagements échus" valeur={t.kpis.engagements_echus} note="aujourd'hui, en stock" serie={t.serie} cle="echus" />
              <ChiffreCourbe c={c} libelle="Questions · 7 jours" valeur={t.kpis.questions_semaine} note="posées à l'Intelligence" serie={t.serie} cle="questions" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Croissance c={c} serie={t.croissance} titre="Ce qu'on lui donne" aide="Sources entrées, en cumul, depuis le 13 octobre."
                series={[{ cle: "sources", nom: "Toutes" }, { cle: "comptes_rendus", nom: "Comptes rendus" }, { cle: "reunions", nom: "Réunions" }, { cle: "appels", nom: "Appels" }, { cle: "debriefs", nom: "Débriefs" }]} />
              <Croissance c={c} serie={t.croissance} titre="Ce qu'elle sait" aide="Faits extraits, validés et savoir validé, en cumul, depuis le 13 octobre."
                series={[{ cle: "faits_extraits", nom: "Faits extraits" }, { cle: "faits_valides", nom: "Faits validés" }, { cle: "savoir_valide", nom: "Savoir validé" }]} />
            </div>
          </div>
        )}

        <div className="mb-6 mt-8 flex flex-wrap gap-x-5 gap-y-2 border-b border-trait">
          {ONGLETS.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setOnglet(k)} aria-current={onglet === k ? "page" : undefined}
              className={`-mb-px border-b-[1.5px] pb-2 text-[13.5px] transition-colors ${onglet === k ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>
              {mot}{nombre[k] ? <span className="text-brume"> · {nombre[k]}</span> : null}
            </button>
          ))}
        </div>
        {onglet === "a_valider" && <AValider peutValider={!!e?.peut_valider} />}
        {onglet === "faits" && <Faits q={tous} />}
        {onglet === "syntheses" && <Syntheses q={syntheses} />}
        {onglet === "sources" && <Sources peutValider={!!e?.tout_voir} />}
        {onglet === "evaluation" && <Evaluation e={e} t={t} c={c} />}
      </div>
    </div>
  );
}

/** Les critères du MVP qui se mesurent seuls, sur quatorze jours (onglet Évaluation depuis la phase 7). */
function Mesures({ m }) {
  const pctDe = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");
  const cases = [
    ["Faits validés sans correction", pctDe(m.extraction.sans_correction, m.extraction.tranches - m.extraction.rejetes), "70 % ou plus", `${m.extraction.tranches} tranchés, ${m.extraction.rejetes} rejetés`],
    ["Questions sur le passé posées à AK", String(m.questions.total), "10 par semaine, 2 personnes", `${m.questions.personnes} personne${m.questions.personnes > 1 ? "s" : ""}, ${m.questions.sans_reponse} sans réponse`],
    ["Décisions motivées", pctDe(m.decisions.motivees, m.decisions.total), "100 %", `${m.decisions.total} dossier${m.decisions.total > 1 ? "s" : ""} accepté${m.decisions.total > 1 ? "s" : ""} ou refusé${m.decisions.total > 1 ? "s" : ""}`],
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {cases.map(([titre, valeur, seuil, detail]) => <Chiffre key={titre} libelle={titre} valeur={valeur} note={`${detail} · seuil ${seuil}`} />)}
    </div>
  );
}

const STATUTS = [["valide", "Validés"], ["a_valider", "À valider"], ["remplace", "Remplacés"], ["archive", "Archivés"], ["rejete", "Rejetés"]];
const PERIODES_FAITS = [[30, "30 jours"], [90, "90 jours"], [0, "Tout"]];
const pilule = (actif) => `h-8 rounded-full border px-3 text-[12.5px] transition-colors ${actif ? "border-menthe bg-menthe/[0.1] text-menthe" : "border-trait text-ardoise hover:text-encre"}`;

/** Les faits, filtrés par type, statut, période et fiche (phase 7). Savoir, Informations, Décisions, Engagements, Tout : la demande du 14 oct. */
function Faits({ q }) {
  const [type, setType] = useState(null);
  const [statut, setStatut] = useState("valide");
  const [jours, setJours] = useState(0);
  const [fiche, setFiche] = useState("");
  const [typeFiche, setTypeFiche] = useState("");
  const tous = q.data?.faits || [];
  const depuis = jours ? new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10) : null;
  const cherche = fiche.trim().toLowerCase();
  const avecStatut = (f) => (statut === "a_valider" ? ["a_valider", "a_rattacher"].includes(f.statut) : f.statut === statut);
  const faits = tous.filter((f) => (!type || f.type === type) && avecStatut(f)
    && (!depuis || String(f.date).slice(0, 10) >= depuis)
    && (!typeFiche || (f.fiches || []).some((x) => x.type_entite === typeFiche))
    && (!cherche || (f.fiches || []).some((x) => String(x.libelle || "").toLowerCase().includes(cherche))));
  const compte = (t) => tous.filter((f) => (!t || f.type === t) && avecStatut(f)).length;
  if (q.isLoading) return <Chargement taille="grand" />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {[[null, "Tout"], ["savoir", "Savoir"], ["information", "Informations"], ["decision", "Décisions"], ["engagement", "Engagements"]].map(([k, mot]) => (
          <button key={mot} type="button" onClick={() => setType(k)} className={pilule(type === k)} style={type === k ? undefined : { background: "transparent" }}>{mot} · {compte(k)}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">{STATUTS.map(([k, mot]) => <button key={k} type="button" onClick={() => setStatut(k)} className={pilule(statut === k)} style={statut === k ? undefined : { background: "transparent" }}>{mot}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{PERIODES_FAITS.map(([j, mot]) => <button key={j} type="button" onClick={() => setJours(j)} className={pilule(jours === j)} style={jours === j ? undefined : { background: "transparent" }}>{mot}</button>)}</div>
        <select value={typeFiche} onChange={(ev) => setTypeFiche(ev.target.value)} aria-label="Type de fiche" className="h-8 rounded-full border border-trait bg-transparent px-3 text-[12.5px] text-craie">
          <option value="">Toutes les fiches</option>
          {Object.entries(ENTITES).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
        </select>
        <input value={fiche} onChange={(ev) => setFiche(ev.target.value)} placeholder="Nom d'une fiche" aria-label="Nom d'une fiche" className="h-8 w-[200px] rounded-full border border-trait bg-surface px-3 text-[12.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
      </div>
      <p className="m-0 text-[12.5px] text-brume">{faits.length} fait{faits.length > 1 ? "s" : ""}. Seuls les faits validés répondent aux questions d'AK.</p>
      {faits.length ? <FriseFaits faits={faits} /> : <p className="m-0 py-10 text-center text-[14px] text-brume">Aucun fait avec ces filtres.</p>}
    </div>
  );
}

/** Les synthèses des fiches (phase 5), la plus récente d'abord ; un clic déplie la synthèse et ses engagements. */
function Syntheses({ q }) {
  const [ouverte, setOuverte] = useState(null);
  const liste = q.data?.syntheses || [];
  if (q.isLoading) return <Chargement taille="grand" />;
  if (!liste.length) return <p className="m-0 py-14 text-center text-[14px] text-brume">Aucune synthèse encore : elle se crée dès qu'un fait validé est rattaché à une fiche.</p>;
  return (
    <div className="border-y border-trait">
      {liste.map((s) => {
        const cle = `${s.type_entite}:${s.entite_id}`;
        return (
          <div key={cle} className="border-t border-trait first:border-t-0">
            <button type="button" onClick={() => setOuverte(ouverte === cle ? null : cle)} aria-expanded={ouverte === cle} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 px-2 py-4 text-left" style={{ background: "transparent" }}>
              <span className="min-w-0">
                <span className="block truncate text-[16px] text-encre">{s.libelle}</span>
                <span className="block text-[13.5px] text-ardoise">{ENTITES[s.type_entite] || s.type_entite} · {s.faits.length} fait{s.faits.length > 1 ? "s" : ""} · version {s.version}</span>
              </span>
              <span className={`text-[12.5px] ${s.perime ? "text-ambre" : "text-brume"}`}>{s.perime ? "à jour sous une heure" : `du ${quand(s.genere_le)}`}</span>
            </button>
            {ouverte === cle && <CeQueKlockaSait type={s.type_entite} id={s.entite_id} titre="Synthèse" className="px-2 pb-4" />}
          </div>
        );
      })}
    </div>
  );
}

/** L'évaluation : les critères du MVP, la validation manuelle, les coûts du mois, le seuil Postgres ; le banc de questions en phase 8. */
function Evaluation({ e, t, c }) {
  if (!e || !t) return <Chargement taille="grand" />;
  const m = t.manuel;
  return (
    <div className="flex flex-col gap-4">
      <Banc peutEditer={!!e.tout_voir} />
      {e.mesures && <Mesures m={e.mesures} />}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Chiffre libelle="Validation à la main" valeur={pct(m.part)} note={`${m.manuels} sur ${m.tranches} faits, 14 jours · objectif < ${m.objectif} %`} />
        <Chiffre libelle="Coût du mois" valeur={(() => { const total = t.couts_mois.extraction_usd + (t.couts_mois.syntheses_usd || 0); return total > 0 && total < 0.01 ? "< 0,01 $" : `${String(Math.round(total * 100) / 100).replace(".", ",")} $`; })()} note={`extraction ${String(t.couts_mois.extraction_usd).replace(".", ",")} $ · synthèses ${String(t.couts_mois.syntheses_usd || 0).replace(".", ",")} $ · ${t.couts_mois.embed_jetons.toLocaleString("fr-FR")} jetons d'embeddings`} />
        <Chiffre libelle="Recherche la plus lente" valeur={t.postgres.p95_ms == null ? "—" : `${t.postgres.p95_ms} ms`} note="95 % des recherches, calcul local · seuil 300 ms" />
        <Chiffre libelle="Faits en base" valeur={t.postgres.faits.toLocaleString("fr-FR")} note={t.postgres.declenche ? "seuil Postgres atteint : voir docs/layer.md" : "seuil Postgres : 50 000"} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <BarresHorizontales c={c} titre="Types de faits validés" lignes={t.types.map((x) => ({ nom: TYPES[x.type] || x.type, valeur: x.n }))} />
        <BarresHorizontales c={c} titre="Statuts" lignes={t.statuts.filter((x) => x.n).map((x) => ({ nom: ({ a_valider: "À valider", a_rattacher: "À rattacher", valide: "Validés", remplace: "Remplacés", archive: "Archivés", rejete: "Rejetés" })[x.statut], valeur: x.n }))} />
        <BarresHorizontales c={c} titre="Sources" lignes={t.sources.map((x) => ({ nom: SOURCES[x.type] || x.type, valeur: x.n }))} />
      </div>
    </div>
  );
}

function useRafraichir() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["layer"] });
}

/** La file À valider : une carte par fait, groupées par source ; un lot se valide d'un coup. */
function AValider({ peutValider }) {
  const q = useQuery({ queryKey: ["layer", "a-valider"], queryFn: () => base44.request("GET", `${API}/a-valider`) });
  const rafraichir = useRafraichir();
  const lot = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/sources/${id}/valider`, { body: {} }),
    onSuccess: (r) => { toast.success(`${r.valides} fait${r.valides > 1 ? "s" : ""} validé${r.valides > 1 ? "s" : ""}`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const lots = q.data?.lots || [];
  if (q.isLoading) return <Chargement taille="grand" />;
  if (!lots.length) return <p className="m-0 py-14 text-center text-[14px] text-brume">Rien à valider. Les faits arrivent ici dès qu'un compte rendu, un appel ou un débrief entre dans l'Intelligence.</p>;
  return (
    <div className="flex flex-col gap-6">
      {lots.map(({ source, faits }) => (
        <section key={source.id}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-[.14em] text-brume">{SOURCES[source.type] || source.type} · {quand(source.date)}{source.auteur ? ` · ${String(source.auteur).split("@")[0]}` : ""}</span>
              <h2 className="m-0 mt-0.5 truncate text-[16px] font-medium text-encre">{source.titre || "Sans titre"}</h2>
            </div>
            {peutValider && faits.length > 1 && (
              <button type="button" onClick={() => lot.mutate(source.id)} disabled={lot.isPending} className={bouton}>
                <Check className="h-3.5 w-3.5" />Tout valider ({faits.length})
              </button>
            )}
          </div>
          <div className="border-y border-trait">
            {faits.map((f) => <CarteFait key={f.id} f={f} peutValider={peutValider} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Un fait à trancher : son type, son résumé, ses fiches, la phrase de la source ; valider, corriger, rejeter. */
function CarteFait({ f, peutValider }) {
  const rafraichir = useRafraichir();
  const [edition, setEdition] = useState(false);
  const [resume, setResume] = useState(f.resume);
  const [type, setType] = useState(f.type);
  const [fiches, setFiches] = useState(f.fiches.map(({ type_entite, entite_id, libelle }) => ({ type_entite, entite_id, libelle })));
  const trancher = useMutation({
    mutationFn: (corps) => base44.request("POST", `${API}/faits/${f.id}`, { body: corps }),
    onSuccess: (_, corps) => { toast.success(corps.action === "rejeter" ? "Fait rejeté" : corps.action === "remplacer" ? "L'ancien fait est remplacé" : "Fait validé", { duration: 1500 }); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ajouter = (c) => setFiches((l) => (l.some((x) => x.type_entite === c.type_entite && x.entite_id === c.entite_id) ? l : [...l, c]));
  // Rejeter demande un motif (phase 4) : il sert à mesurer la qualité de l'extraction.
  const [rejet, setRejet] = useState(false);
  return (
    <article className="border-t border-trait py-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          {edition ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(TYPES).map(([k, mot]) => (
                  <button key={k} type="button" onClick={() => setType(k)} className={`h-7 rounded-full border px-2.5 text-[12px] ${type === k ? "border-menthe text-encre" : "border-trait text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
                ))}
              </div>
              <textarea value={resume} onChange={(e) => setResume(e.target.value)} rows={2}
                className="w-full rounded-[10px] border border-bord-doux bg-surface px-3 py-2 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
            </div>
          ) : (
            <p className="m-0 text-[14.5px] leading-[1.5] text-encre">
              <span className={`mr-2 text-[11px] uppercase tracking-[.12em] ${TEINTES[f.type] || "text-craie"}`}>{TYPES[f.type] || f.type}</span>
              {f.resume}
              {f.echeance && <span className="text-ambre"> · pour le {quand(f.echeance)}</span>}
            </p>
          )}
          {f.citation && (
            <p className="m-0 mt-1.5 border-l-2 border-trait pl-3 text-[13px] leading-[1.5] text-ardoise">
              « {f.citation} »{f.personne ? ` · ${f.personne}` : ""}
              {!f.citation_verifiee && <span className="ml-1 text-ambre">(phrase introuvable telle quelle dans la source : à vérifier)</span>}
            </p>
          )}
          <Fiches fiches={edition ? fiches : f.fiches} candidats={f.candidats} edition={edition} onAjouter={ajouter} onRetirer={(c) => setFiches((l) => l.filter((x) => !(x.type_entite === c.type_entite && x.entite_id === c.entite_id)))} />
          {f.contradiction && (
            <div className="mt-2.5 rounded-[10px] border border-ambre/40 px-3 py-2 text-[13px]">
              <p className="m-0 text-ambre">Remplace le fait validé « {f.contradiction.resume} » ?</p>
              {f.contradiction.raison && <p className="m-0 mt-0.5 text-ardoise">{f.contradiction.raison}</p>}
              {peutValider && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => trancher.mutate({ action: "remplacer", remplace: f.contradiction.fait_id })} disabled={trancher.isPending} className={principal}>Remplacer l'ancien</button>
                  <button type="button" onClick={() => trancher.mutate({ action: "garder" })} disabled={trancher.isPending} className={bouton}>Garder les deux</button>
                </div>
              )}
            </div>
          )}
          {!f.contradiction && f.obstacles?.length > 0 && <p className="m-0 mt-1.5 text-[12px] text-brume">Pas validé seul : {f.obstacles.join(" · ")}.</p>}
          {rejet && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-ardoise">Pourquoi ?</span>
              {[["faux", "Faux"], ["doublon", "Doublon"], ["hors_sujet", "Hors sujet"], ["mal_rattache", "Mal rattaché"], ["autre", "Autre"]].map(([k, mot]) => (
                <button key={k} type="button" onClick={() => trancher.mutate({ action: "rejeter", motif_rejet: k })} disabled={trancher.isPending} className={bouton}>{mot}</button>
              ))}
              <button type="button" onClick={() => setRejet(false)} className="p-0 text-brume underline underline-offset-2" style={{ background: "transparent" }}>Annuler</button>
            </div>
          )}
        </div>
        {peutValider && (
          <div className="flex flex-none flex-wrap gap-1.5">
            {edition ? (
              <>
                <button type="button" onClick={() => setEdition(false)} className={bouton}>Annuler</button>
                <button type="button" disabled={trancher.isPending || !resume.trim()} onClick={() => trancher.mutate({ action: "corriger", resume, type, fiches })} className={principal}>Valider la correction</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setRejet(true)} disabled={trancher.isPending} className={bouton} aria-label="Rejeter" title="Rejeter : faux, doublon, hors sujet…"><X className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setEdition(true)} className={bouton}><Pencil className="h-3.5 w-3.5" />Corriger</button>
                <button type="button" onClick={() => trancher.mutate({ action: "valider" })} disabled={trancher.isPending} className={principal}><Check className="h-3.5 w-3.5" />Valider</button>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Les fiches d'un fait ; en correction, les candidats proposés et une recherche. */
function Fiches({ fiches, candidats = [], edition, onAjouter, onRetirer }) {
  const [type, setType] = useState("dossier");
  const [recherche, setRecherche] = useState("");
  const trouves = useQuery({
    queryKey: ["layer", "candidats", type, recherche],
    queryFn: () => base44.request("GET", `${API}/candidats?${new URLSearchParams({ type, q: recherche })}`),
    enabled: edition && recherche.trim().length > 1,
  });
  const puce = "inline-flex h-7 items-center gap-1 rounded-full border border-trait px-2.5 text-[12px] text-craie";
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {fiches.map((x) => (
          <span key={`${x.type_entite}-${x.entite_id}`} className={puce}>
            <span className="text-brume">{ENTITES[x.type_entite]}</span>{x.libelle || x.entite_id}
            {edition && <button type="button" onClick={() => onRetirer(x)} aria-label="Retirer" className="ml-0.5 text-brume hover:text-alerte" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>}
          </span>
        ))}
        {!fiches.length && !candidats.length && <span className="text-[12px] text-brume">Aucune fiche rattachée</span>}
      </div>
      {candidats.length > 0 && (
        <div className="flex flex-col gap-1">
          {candidats.map((c) => (
            <div key={`${c.type_entite}-${c.nom}`} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-ambre">À rattacher : {ENTITES[c.type_entite]} « {c.nom} »</span>
              {edition && c.propositions.map((p) => (
                <button key={p.entite_id} type="button" onClick={() => onAjouter(p)} className={`${puce} hover:border-menthe hover:text-encre`} style={{ background: "transparent" }}>{p.libelle}</button>
              ))}
              {!edition && !c.propositions.length && <span className="text-brume">aucun candidat trouvé</span>}
              {!edition && c.propositions.length > 0 && <span className="text-brume">{c.propositions.length} candidat{c.propositions.length > 1 ? "s" : ""} (Corriger pour choisir)</span>}
            </div>
          ))}
        </div>
      )}
      {edition && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-full border border-trait bg-surface px-2.5 text-[12.5px] text-craie">
            {Object.entries(ENTITES).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
          </select>
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rattacher une fiche : un nom, une ville"
            className="h-8 min-w-[220px] flex-1 rounded-full border border-trait bg-surface px-3 text-[12.5px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
          {(trouves.data?.candidats || []).map((p) => (
            <button key={p.entite_id} type="button" onClick={() => onAjouter(p)} className={`${puce} hover:border-menthe hover:text-encre`} style={{ background: "transparent" }}>{p.libelle}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Le journal brut, et l'ajout d'un compte rendu (collé ou déposé). */
function Sources({ peutValider }) {
  const q = useQuery({ queryKey: ["layer", "sources"], queryFn: () => base44.request("GET", `${API}/sources`) });
  const rafraichir = useRafraichir();
  const [titre, setTitre] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [contenu, setContenu] = useState("");
  const [ouverte, setOuverte] = useState(null);
  const fichier = useRef(null);
  const ajouter = useMutation({
    mutationFn: (f) => {
      const form = new FormData();
      if (f) form.append("fichier", f);
      form.append("titre", titre);
      form.append("date", date);
      form.append("contenu", contenu);
      return base44.request("POST", `${API}/sources`, { body: form, isForm: true });
    },
    onSuccess: (r) => {
      if (r.deja) toast.success("Cette source est déjà dans l'Intelligence");
      else if (r.ok === false) toast.error(r.error || "Extraction impossible");
      else toast.success(`${(r.faits || []).length} fait${(r.faits || []).length > 1 ? "s" : ""} extrait${(r.faits || []).length > 1 ? "s" : ""}, à valider`);
      setTitre(""); setContenu(""); rafraichir();
    },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });
  const importer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/importer-appels`, { body: {} }),
    onSuccess: (r) => { toast.success(r.importes ? `${r.importes} appel${r.importes > 1 ? "s" : ""} importé${r.importes > 1 ? "s" : ""} : l'extraction tourne` : "Aucun appel transcrit à importer"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });
  const sources = q.data?.sources || [];
  const champ = "w-full rounded-[10px] border border-bord-doux bg-surface px-3 py-2 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[14px] bg-rail px-5 py-4">
        <h2 className="m-0 text-[16px] font-medium text-encre">Ajouter un compte rendu</h2>
        <p className="m-0 mt-1 text-[13px] text-ardoise">Collez-le, ou déposez le fichier (texte, PDF, Word). AK en tire les faits ; ils attendent la validation.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px]">
          <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre : « Comité du lundi », « Point Antibes »" className={champ} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${champ} [color-scheme:dark]`} />
        </div>
        <textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={6} placeholder="Le compte rendu, tel quel" className={`${champ} mt-2`} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => ajouter.mutate(null)} disabled={ajouter.isPending || contenu.trim().length < 20} className={principal}>
            {ajouter.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Ajouter et extraire
          </button>
          <button type="button" onClick={() => fichier.current?.click()} disabled={ajouter.isPending} className={bouton}><Upload className="h-3.5 w-3.5" />Déposer un fichier</button>
          <input ref={fichier} type="file" accept=".txt,.md,.vtt,.srt,.pdf,.doc,.docx,text/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) ajouter.mutate(f); }} />
          {peutValider && <button type="button" onClick={() => importer.mutate()} disabled={importer.isPending} className={`${bouton} ml-auto`}>Importer les appels déjà transcrits</button>}
        </div>
        {ajouter.isPending && <p className="m-0 mt-2 text-[12.5px] text-ardoise">Lecture et extraction : une vingtaine de secondes.</p>}
      </section>
      {q.isLoading ? <Chargement /> : !sources.length ? (
        <p className="m-0 py-10 text-center text-[14px] text-brume">Le journal est vide. Chaque compte rendu, appel transcrit et débrief y entre tel quel.</p>
      ) : (
        <div className="border-y border-trait">
          {sources.map((s) => (
            <button key={s.id} type="button" onClick={() => setOuverte(s.id)} className="flex w-full items-start gap-4 border-t border-trait py-3.5 text-left first:border-t-0 hover:bg-encre/[0.02]" style={{ background: "transparent" }}>
              <FileText className="mt-0.5 h-4 w-4 flex-none text-ardoise" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] text-encre">{s.titre || "Sans titre"}</span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ardoise">{SOURCES[s.type] || s.type} · {quand(s.date)}{s.auteur ? ` · ${String(s.auteur).split("@")[0]}` : ""}</span>
              </span>
              <span className="flex-none text-right text-[12.5px] tabular-nums">
                {s.statut_extraction === "fait" ? <span className="text-craie">{s.faits} fait{s.faits > 1 ? "s" : ""}{s.doublons ? <span className="text-brume"> · {s.doublons} déjà connu{s.doublons > 1 ? "s" : ""}</span> : null}</span>
                  : s.statut_extraction === "echec" ? <span className="text-alerte" title={s.erreur || ""}>Extraction ratée</span>
                    : <span className="text-ardoise">Extraction en cours</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {ouverte && <FenetreSource id={ouverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

/**
 * Le banc d'évaluation (phase 8) : les questions, leur réponse et leurs faits
 * attendus ; une exécution par version ; les deux dernières côte à côte. Jules
 * édite, propose et lance ; l'équipe lit.
 */
function Banc({ peutEditer }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["layer", "evaluation"], queryFn: () => base44.request("GET", `${API}/evaluation`) });
  const [nouvelle, setNouvelle] = useState("");
  const [attendue, setAttendue] = useState("");
  const [voirBanc, setVoirBanc] = useState(false);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["layer", "evaluation"] });
  const ajouter = useMutation({ mutationFn: () => base44.request("POST", `${API}/evaluation/questions`, { body: { question: nouvelle, reponse_attendue: attendue } }), onSuccess: () => { setNouvelle(""); setAttendue(""); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const retirer = useMutation({ mutationFn: (id) => base44.request("DELETE", `${API}/evaluation/questions/${id}`), onSuccess: rafraichir });
  const proposer = useMutation({ mutationFn: () => base44.request("POST", `${API}/evaluation/proposer`, { body: {} }), onSuccess: (r) => { toast.success(`${r.questions.length} question${r.questions.length > 1 ? "s" : ""} proposée${r.questions.length > 1 ? "s" : ""} : à relire`); setVoirBanc(true); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const executer = useMutation({ mutationFn: () => base44.request("POST", `${API}/evaluation/executer`, { body: {} }), onSuccess: () => { toast.success("Exécution lancée : le résultat arrive dans une minute environ"); setTimeout(rafraichir, 60000); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const d = q.data;
  if (!d) return <Chargement />;
  const c = d.comparaison;
  const pc = (v) => (v == null ? "—" : `${Math.round(v * 100)} %`);
  return (
    <section className="rounded-[14px] border border-trait bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[11px] font-normal uppercase tracking-[.16em] text-menthe">Banc d'évaluation · {d.banc.length} question{d.banc.length > 1 ? "s" : ""}</h2>
        {peutEditer && (
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => proposer.mutate()} disabled={proposer.isPending} className={bouton}>{proposer.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Proposer des questions</button>
            <button type="button" onClick={() => executer.mutate()} disabled={executer.isPending || !d.banc.length} className={principal}>Lancer une exécution</button>
          </div>
        )}
      </div>
      {c ? (
        <>
          {c.regression && <p className="m-0 mb-3 rounded-[10px] border border-alerte/40 px-3 py-2 text-[13px] text-alerte">Le rappel a baissé depuis l'exécution précédente : pas de mise en production avant d'avoir compris pourquoi.</p>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Chiffre libelle="Rappel" valeur={pc(c.dernier.rappel)} note={c.precedent ? `avant : ${pc(c.precedent.rappel)}` : "première exécution"} />
            <Chiffre libelle="Citation correcte" valeur={pc(c.dernier.citation_ok)} note={c.precedent ? `avant : ${pc(c.precedent.citation_ok)}` : "première exécution"} />
            <Chiffre libelle="Version" valeur={c.dernier.version} note={`le ${quand(c.dernier.le)}${c.dernier.note ? ` · ${c.dernier.note}` : ""}`} />
            <Chiffre libelle="Précédente" valeur={c.precedent?.version || "—"} note={c.precedent ? `le ${quand(c.precedent.le)}` : ""} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead><tr className="border-b border-bord text-left text-[11px] uppercase tracking-[.1em] text-brume"><th className="py-2 pr-3 font-normal">Question</th><th className="px-2 py-2 text-right font-normal">Rappel</th><th className="px-2 py-2 text-right font-normal">Avant</th><th className="px-2 py-2 text-right font-normal">Citation</th></tr></thead>
              <tbody>
                {c.questions.map((x) => (
                  <tr key={x.id} className="border-b border-trait">
                    <td className="py-2 pr-3 text-craie">{x.question}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${x.rappel < 1 ? "text-ambre" : "text-encre"}`}>{pc(x.rappel)}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${x.rappel_avant != null && x.rappel < x.rappel_avant ? "text-alerte" : "text-brume"}`}>{pc(x.rappel_avant)}</td>
                    <td className={`px-2 py-2 text-right ${x.citation_ok ? "text-encre" : "text-ambre"}`}>{x.citation_ok ? "Juste" : "À revoir"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="m-0 text-[13.5px] text-brume">Aucune exécution encore{d.banc.length ? " : lancez la première." : " : ajoutez ou proposez des questions, puis lancez une exécution."}</p>}
      <button type="button" onClick={() => setVoirBanc((v) => !v)} className="mt-3 p-0 text-[12.5px] text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>{voirBanc ? "Replier le banc" : "Voir et modifier le banc"}</button>
      {voirBanc && (
        <div className="mt-3">
          {d.banc.map((b) => (
            <div key={b.id} className="flex items-start justify-between gap-3 border-t border-trait py-2 text-[13px] first:border-t-0">
              <span className="min-w-0"><span className="text-encre">{b.question}</span>{b.reponse_attendue ? <span className="block text-ardoise">Attendu : {b.reponse_attendue}</span> : null}<span className="block text-[12px] text-brume">{b.faits_attendus.length} fait{b.faits_attendus.length > 1 ? "s" : ""} attendu{b.faits_attendus.length > 1 ? "s" : ""}{b.auteur === "brouillon" ? " · brouillon à relire" : ""}</span></span>
              {peutEditer && <button type="button" onClick={() => retirer.mutate(b.id)} className={bouton} aria-label="Retirer du banc" title="Retirer du banc (gardée en base)"><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          {peutEditer && (
            <div className="mt-3 flex flex-col gap-2">
              <input value={nouvelle} onChange={(ev) => setNouvelle(ev.target.value)} placeholder="Une question que l'équipe pose (« pourquoi a-t-on refusé Libourne ? »)" className="h-9 rounded-champ border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
              <input value={attendue} onChange={(ev) => setAttendue(ev.target.value)} placeholder="La réponse attendue, en une phrase" className="h-9 rounded-champ border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
              <p className="m-0 text-[12px] text-brume">Les faits attendus se relient ensuite : une question ajoutée ici sert à mesurer la citation, son rappel compte dès qu'elle a des faits attendus.</p>
              <button type="button" onClick={() => ajouter.mutate()} disabled={!nouvelle.trim() || ajouter.isPending} className={`${principal} self-start`}>Ajouter au banc</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
