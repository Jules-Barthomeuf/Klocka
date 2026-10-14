import React, { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, Pencil, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { FriseFaits, FenetreSource, TYPES, TEINTES, SOURCES, quand } from "@/components/cerveau/FriseFaits";

// Le Cerveau (spec MVP du 14 oct. 2026) : ce qui a été dit, décidé ou promis,
// gardé avec sa source. Trois onglets : À valider (Jules valide, corrige ou
// rejette chaque fait extrait), Savoir (les règles de l'équipe validées),
// Sources (le journal brut, et l'ajout d'un compte rendu). En tête, les
// critères du MVP qui se mesurent seuls.

const API = "/api/cerveau";
const ENTITES = { dossier: "Dossier", projet: "Projet", agent: "Agent", agence: "Agence", investisseur: "Investisseur", ville: "Ville" };
const bouton = "inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-doux px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40";
const principal = "inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[12.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50";

export default function Cerveau() {
  const [onglet, setOnglet] = useState("a_valider");
  const etat = useQuery({ queryKey: ["cerveau", "etat"], queryFn: () => base44.request("GET", `${API}/etat`) });
  const e = etat.data;
  // À droite de Savoir, chaque type de fait, puis tous les faits (14 oct. 2026, Jules).
  const tous = useQuery({ queryKey: ["cerveau", "faits"], queryFn: () => base44.request("GET", `${API}/faits`) });
  const compte = (type) => (tous.data?.faits || []).filter((f) => !type || f.type === type).length;
  const avec = (mot, n) => (n ? `${mot} · ${n}` : mot);
  const onglets = [["a_valider", `À valider${e?.a_valider ? ` · ${e.a_valider}` : ""}`], ["savoir", "Savoir"], ["information", avec("Informations", compte("information"))], ["decision", avec("Décisions", compte("decision"))], ["engagement", avec("Engagements", compte("engagement"))], ["tout", avec("Tout", compte(null))], ["sources", "Sources"]];
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 md:px-6">
      <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">Cerveau</h1>
      <p className="m-0 mt-2 max-w-[70ch] text-[14px] text-ardoise">Ce qui a été dit, décidé ou promis, tiré des comptes rendus, des appels et des débriefs. Un fait ne répond aux questions d'AK qu'une fois validé.</p>
      {e?.mesures && <Mesures m={e.mesures} />}
      <div className="mt-6 mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
        {onglets.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setOnglet(k)} aria-current={onglet === k ? "page" : undefined}
            className="relative pb-2 text-[11px] uppercase tracking-[.16em] transition-colors" style={{ background: "transparent", color: onglet === k ? J["menthe"] : J["brume"], borderBottom: `1.5px solid ${onglet === k ? J["menthe"] : "transparent"}` }}>
            {mot}
          </button>
        ))}
      </div>
      {onglet === "a_valider" ? <AValider peutValider={!!e?.peut_valider} /> : onglet === "savoir" ? <Savoir /> : onglet === "sources" ? <Sources peutValider={!!e?.peut_valider} /> : <FaitsDuType q={tous} type={onglet === "tout" ? null : onglet} />}
    </div>
  );
}

/** Les critères du MVP qui se mesurent seuls, sur quatorze jours. */
function Mesures({ m }) {
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");
  const cases = [
    ["Faits validés sans correction", pct(m.extraction.sans_correction, m.extraction.tranches - m.extraction.rejetes), "70 % ou plus", `${m.extraction.tranches} tranchés, ${m.extraction.rejetes} rejetés`],
    ["Questions sur le passé posées à AK", String(m.questions.total), "10 par semaine, 2 personnes", `${m.questions.personnes} personne${m.questions.personnes > 1 ? "s" : ""}, ${m.questions.sans_reponse} sans réponse`],
    ["Décisions motivées", pct(m.decisions.motivees, m.decisions.total), "100 %", `${m.decisions.total} dossier${m.decisions.total > 1 ? "s" : ""} accepté${m.decisions.total > 1 ? "s" : ""} ou refusé${m.decisions.total > 1 ? "s" : ""}`],
  ];
  return (
    <div className="mt-6 grid gap-px overflow-hidden rounded-[14px] border border-trait bg-trait md:grid-cols-3">
      {cases.map(([titre, valeur, seuil, detail]) => (
        <div key={titre} className="bg-fond px-5 py-4">
          <div className="text-[12.5px] text-ardoise">{titre}</div>
          <div className="mt-1 text-[26px] font-light tracking-[-0.02em] text-encre tabular-nums">{valeur}</div>
          <div className="mt-1 text-[12px] text-brume">{detail} · seuil {seuil}</div>
        </div>
      ))}
    </div>
  );
}

function useRafraichir() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["cerveau"] });
}

/** La file À valider : une carte par fait, groupées par source ; un lot se valide d'un coup. */
function AValider({ peutValider }) {
  const q = useQuery({ queryKey: ["cerveau", "a-valider"], queryFn: () => base44.request("GET", `${API}/a-valider`) });
  const rafraichir = useRafraichir();
  const lot = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/sources/${id}/valider`, { body: {} }),
    onSuccess: (r) => { toast.success(`${r.valides} fait${r.valides > 1 ? "s" : ""} validé${r.valides > 1 ? "s" : ""}`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const lots = q.data?.lots || [];
  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!lots.length) return <p className="m-0 py-14 text-center text-[14px] text-brume">Rien à valider. Les faits arrivent ici dès qu'un compte rendu, un appel ou un débrief entre dans le Cerveau.</p>;
  return (
    <div className="flex flex-col gap-6">
      {!peutValider && <p className="m-0 text-[13px] text-ambre">Au MVP, seul Jules valide : vous voyez la file sans pouvoir la trancher.</p>}
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
    onSuccess: (_, corps) => { toast.success(corps.action === "rejeter" ? "Fait rejeté" : "Fait validé", { duration: 1500 }); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ajouter = (c) => setFiches((l) => (l.some((x) => x.type_entite === c.type_entite && x.entite_id === c.entite_id) ? l : [...l, c]));
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
                <button type="button" onClick={() => trancher.mutate({ action: "rejeter" })} disabled={trancher.isPending} className={bouton} aria-label="Rejeter" title="Rejeter : faux ou sans intérêt"><X className="h-3.5 w-3.5" /></button>
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
    queryKey: ["cerveau", "candidats", type, recherche],
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

const VIDES = {
  information: "Aucune information encore. Un fait sur un dossier, un agent, une agence ou une ville, dit en appel, en réunion ou en débrief, arrive ici.",
  decision: "Aucune décision encore. Ce qui est tranché en réunion ou sur un dossier, avec son motif, arrive ici.",
  engagement: "Aucun engagement encore. Une promesse (« Durand rappelle jeudi ») arrive ici, avec qui et pour quand.",
  tout: "Le Cerveau est vide pour l'instant : déposez un compte rendu dans Sources, enregistrez une réunion ou validez un appel transcrit.",
};

/** Les faits d'un type (ou tous) : validés et à valider, les rejetés exceptés, avec leur source. */
function FaitsDuType({ q, type }) {
  const faits = (q.data?.faits || []).filter((f) => !type || f.type === type);
  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!faits.length) return <p className="m-0 py-14 text-center text-[14px] text-brume">{VIDES[type || "tout"]}</p>;
  const valides = faits.filter((f) => f.statut === "valide").length;
  return (
    <>
      <p className="m-0 mb-3 text-[12.5px] text-brume">{faits.length} fait{faits.length > 1 ? "s" : ""} · {valides} validé{valides > 1 ? "s" : ""}{faits.length - valides ? ` · ${faits.length - valides} à valider` : ""}. Seuls les faits validés répondent aux questions d'AK.</p>
      <FriseFaits faits={faits} />
    </>
  );
}

/** Le savoir de l'équipe : les faits « savoir » validés. */
function Savoir() {
  const q = useQuery({ queryKey: ["cerveau", "savoir"], queryFn: () => base44.request("GET", `${API}/savoir`) });
  const faits = q.data?.faits || [];
  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!faits.length) return <p className="m-0 py-14 text-center text-[14px] text-brume">Aucun savoir validé encore. Une règle de l'équipe dite en réunion ou en débrief (« à Antibes, un n°2 se loue sous 300 €/m²/an ») arrive ici une fois validée.</p>;
  return <FriseFaits faits={faits} />;
}

/** Le journal brut, et l'ajout d'un compte rendu (collé ou déposé). */
function Sources({ peutValider }) {
  const q = useQuery({ queryKey: ["cerveau", "sources"], queryFn: () => base44.request("GET", `${API}/sources`) });
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
      if (r.deja) toast.success("Cette source est déjà dans le Cerveau");
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
      {q.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div> : !sources.length ? (
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
