import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { ChevronLeft, FileText, Loader2, Plus, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { PastilleSource } from "@/components/haka/ReglagesDemande";
import { sourceDe } from "@/lib/sources";
import { statutDe, quand, NOMS_DECLENCHEURS } from "@/components/haka/competences-outils";
import { OngletTests, OngletExecutions, OngletHistorique } from "@/components/haka/FicheOnglets";

// La fiche d'une compétence (17 oct. 2026, spec de Jules) : quatre onglets. « Définition » est l'éditeur :
// à gauche l'en-tête en formulaire, à droite la recette en Markdown avec son aperçu, les annexes et la carte
// telle qu'elle apparaîtra sur la page Haka. Publier reste grisé tant que le format n'est pas valide et
// que les dossiers de test n'ont pas tourné sur CE brouillon.

const champ = "w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
const etiquette = "mb-1.5 block text-[11px] uppercase tracking-[.14em] text-brume";
const VALIDE = [["responsable", "Le responsable du dossier"], ["jules", "Jules"], ["personne", "Personne : rien ne sort"]];
const MODES = [["temps_reel", "Temps réel"], ["batch", "Batch (moitié prix, jamais pour le chat)"]];
const DESTINATIONS = [["dossier", "Le dossier"], ["file", "La file À valider"], ["chat", "Le chat"]];
const LIVRABLES = [["grille_dossier", "Grille du dossier"], ["mail", "Mail"], ["page_plateforme", "Page plateforme"], ["loi", "LOI"], ["dossier_bancaire", "Dossier bancaire"], ["reponse_chat", "Réponse dans le chat"], ["dossier", "Dossier"], ["presentation", "Présentation"], ["note", "Note"], ["emails", "Emails"], ["off_market", "Off-market"], ["grille", "Grille"]];

const PILULE_CHOIX = (on) => `h-8 rounded-full border px-3 text-[12.5px] transition-colors ${on ? "border-menthe/60 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`;

/** Les règles de l'en-tête en lignes éditables, et retour. */
const reglesVersLignes = (r) => Object.entries(r || {}).map(([nom, valeur]) => ({ nom, type: Array.isArray(valeur) ? "liste" : typeof valeur === "boolean" ? "booleen" : typeof valeur === "number" ? "nombre" : "texte", valeur: Array.isArray(valeur) ? valeur.join(", ") : String(valeur) }));
export const lignesVersRegles = (lignes) => Object.fromEntries((lignes || []).filter((l) => l.nom.trim()).map((l) => [l.nom.trim(), l.type === "liste" ? l.valeur.split(",").map((x) => x.trim()).filter(Boolean) : l.type === "booleen" ? l.valeur === "true" : l.type === "nombre" ? Number(String(l.valeur).replace(",", ".")) : l.valeur]));

function depart(c) {
  const b = { nom: c.nom, resume: c.resume || "", declencheurs: c.declencheurs || [], entrees: c.entrees || [], outils: c.outils || [], regles: c.regles || {}, livrable: c.livrable || "", format: c.format || "", destination: c.destination || "dossier", valide_par: c.valide_par || "responsable", mode_execution: c.mode_execution || "temps_reel", dossiers_test: c.dossiers_test || [], annexes: c.annexes || [], corps: c.corps || "", ...(c.brouillon || {}) };
  return { ...b, entrees: b.entrees.join("\n"), lignes: reglesVersLignes(b.regles), dossiers_test: [...b.dossiers_test] };
}

function ApercuCarte({ v }) {
  const t = String(v.resume || v.nom || "").trim();
  const phrase = /[.!?…]$/.test(t) ? t : `${t}.`;
  const outils = [...v.outils].sort((a, b) => Number(!!b.obligatoire) - Number(!!a.obligatoire));
  return (
    <div className="rounded-[18px] border border-trait bg-surface-pleine p-5 shadow-[0_8px_24px_rgb(0_0_0/0.05)]">
      <p className="m-0 text-[17px] leading-[1.4] tracking-[-0.01em] text-encre">{phrase}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {outils.slice(0, 3).map((o) => <PastilleSource key={o.cle} cle={o.cle} fixe />)}
        {outils.length > 3 && <span className="inline-flex h-9 items-center rounded-full border border-trait px-3 text-[13px] text-ardoise">+{outils.length - 3}</span>}
      </div>
    </div>
  );
}

function Definition({ c, v, setV, donnees }) {
  const [apercu, setApercu] = useState(false);
  const pipeline = useQuery({ queryKey: ["preanalyse-pipeline"], queryFn: () => base44.request("GET", "/api/preanalyse/pipeline"), staleTime: 60_000, retry: false });
  const dossiers = pipeline.data?.dossiers || [];
  const titreDe = (ref) => dossiers.find((d) => d.deal_id === ref)?.titre || ref;
  const sel = (cle) => v.outils.find((o) => o.cle === cle);
  // Un clic : ajoute (facultative) ; un second : obligatoire ; un troisième : retire.
  const cycle = (cle) => setV((x) => { const o = x.outils.find((y) => y.cle === cle); return { ...x, outils: !o ? [...x.outils, { cle, obligatoire: false }] : !o.obligatoire ? x.outils.map((y) => (y.cle === cle ? { ...y, obligatoire: true } : y)) : x.outils.filter((y) => y.cle !== cle) }; });
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));
  const ajouterAnnexe = (nom, texte = "") => setV((x) => ({ ...x, annexes: [...x.annexes, { nom, texte }] }));
  const deposer = (e) => {
    e.preventDefault();
    for (const f of [...(e.dataTransfer?.files || [])].slice(0, 5)) {
      const r = new FileReader();
      r.onload = () => ajouterAnnexe(f.name.slice(0, 60), String(r.result || "").slice(0, 20000));
      r.readAsText(f);
    }
  };
  const declencheurs = donnees?.declencheurs || [];
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <label><span className={etiquette}>Nom</span><input value={v.nom} onChange={(e) => set("nom", e.target.value)} className={`${champ} h-10`} /></label>
        <label><span className={etiquette}>Description · quand l'utiliser (Assistant KPartners la lit pour choisir)</span><textarea value={v.resume} onChange={(e) => set("resume", e.target.value)} rows={3} className={`${champ} resize-y py-2.5`} /></label>
        <div>
          <span className={etiquette}>Déclencheurs</span>
          <div className="flex flex-wrap gap-1.5">{declencheurs.map((k) => { const on = v.declencheurs.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => set("declencheurs", on ? v.declencheurs.filter((x) => x !== k) : [...v.declencheurs, k])} className={PILULE_CHOIX(on)} style={on ? undefined : { background: "transparent" }}>{NOMS_DECLENCHEURS[k] || k}{["chat", "dossier", "mail", "automatique"].includes(k) ? "" : ` (${k})`}</button>; })}</div>
        </div>
        <label><span className={etiquette}>Entrées · une par ligne (ce qu'il faut pour lancer ; le manque est demandé dans le chat)</span><textarea value={v.entrees} onChange={(e) => set("entrees", e.target.value)} rows={3} className={`${champ} resize-y py-2`} /></label>
        <div>
          <span className={etiquette}>Outils et sources · un clic ajoute, un second rend obligatoire, un troisième retire</span>
          <div className="flex flex-wrap gap-2">
            {(donnees?.outils || []).map((cle) => { const o = sel(cle); return <PastilleSource key={cle} cle={cle} choisie={!!o} libelle={`${sourceDe(cle).nom}${o?.obligatoire ? " · obligatoire" : ""}`} onClick={() => cycle(cle)} title={o ? (o.obligatoire ? "Obligatoire : ne peut pas être éteinte" : "Facultative : on peut l'éteindre au lancement") : "Ajouter"} />; })}
          </div>
        </div>
        <div>
          <span className={etiquette}>Règles · des seuils appliqués par le code, jamais par le texte libre</span>
          <div className="flex flex-col gap-2">
            {v.lignes.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1.8fr)_96px_minmax(0,1.4fr)_32px] items-center gap-2">
                <input value={l.nom} onChange={(e) => setV((x) => ({ ...x, lignes: x.lignes.map((y, j) => (j === i ? { ...y, nom: e.target.value.replace(/[^a-z0-9_]/g, "") } : y)) }))} placeholder="nom_de_la_regle" className={`${champ} h-9 px-2 font-mono text-[12px]`} />
                <select value={l.type} onChange={(e) => setV((x) => ({ ...x, lignes: x.lignes.map((y, j) => (j === i ? { ...y, type: e.target.value, valeur: e.target.value === "booleen" ? "true" : y.valeur } : y)) }))} className={`${champ} h-9`}><option value="nombre">Nombre</option><option value="liste">Liste</option><option value="booleen">Oui / non</option><option value="texte">Texte</option></select>
                {l.type === "booleen"
                  ? <select value={l.valeur} onChange={(e) => setV((x) => ({ ...x, lignes: x.lignes.map((y, j) => (j === i ? { ...y, valeur: e.target.value } : y)) }))} className={`${champ} h-9`}><option value="true">Oui</option><option value="false">Non</option></select>
                  : <input value={l.valeur} onChange={(e) => setV((x) => ({ ...x, lignes: x.lignes.map((y, j) => (j === i ? { ...y, valeur: e.target.value } : y)) }))} placeholder={l.type === "liste" ? "a, b, c" : "valeur"} className={`${champ} h-9`} />}
                <button type="button" onClick={() => setV((x) => ({ ...x, lignes: x.lignes.filter((_, j) => j !== i) }))} aria-label="Retirer la règle" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <button type="button" onClick={() => setV((x) => ({ ...x, lignes: [...x.lignes, { nom: "", type: "nombre", valeur: "" }] }))} className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3 w-3" />Ajouter une règle</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className={etiquette}>Livrable (type)</span><select value={v.format} onChange={(e) => set("format", e.target.value)} className={`${champ} h-10`}><option value="">À choisir</option>{LIVRABLES.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}</select></label>
          <label><span className={etiquette}>Destination</span><select value={v.destination} onChange={(e) => set("destination", e.target.value)} className={`${champ} h-10`}>{DESTINATIONS.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}</select></label>
        </div>
        <label><span className={etiquette}>Le livrable, en une phrase</span><input value={v.livrable} onChange={(e) => set("livrable", e.target.value)} className={`${champ} h-10`} /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <div><span className={etiquette}>Qui valide</span><div className="flex flex-wrap gap-1.5">{VALIDE.map(([k, mot]) => <button key={k} type="button" aria-pressed={v.valide_par === k} onClick={() => set("valide_par", k)} className={PILULE_CHOIX(v.valide_par === k)} style={v.valide_par === k ? undefined : { background: "transparent" }}>{mot}</button>)}</div></div>
          <div><span className={etiquette}>Mode d'exécution</span><div className="flex flex-wrap gap-1.5">{MODES.map(([k, mot]) => <button key={k} type="button" aria-pressed={v.mode_execution === k} onClick={() => set("mode_execution", k)} className={PILULE_CHOIX(v.mode_execution === k)} style={v.mode_execution === k ? undefined : { background: "transparent" }}>{mot}</button>)}</div></div>
        </div>
        <div>
          <span className={etiquette}>Dossiers de test · au moins deux (le banc d'essai avant chaque publication)</span>
          <div className="flex flex-wrap gap-1.5">
            {v.dossiers_test.map((ref) => (
              <span key={ref} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait pl-3 pr-1 text-[13px] text-encre">{titreDe(ref)}<button type="button" onClick={() => set("dossiers_test", v.dossiers_test.filter((x) => x !== ref))} aria-label="Retirer ce dossier de test" className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button></span>
            ))}
          </div>
          <select value="" onChange={(e) => { if (e.target.value && !v.dossiers_test.includes(e.target.value)) set("dossiers_test", [...v.dossiers_test, e.target.value]); }} className={`${champ} mt-2 h-10`}>
            <option value="">Ajouter un dossier de test…</option>
            {dossiers.filter((d) => !d.archived).slice(0, 80).map((d) => <option key={d.deal_id} value={d.deal_id}>{d.titre || d.deal_id}</option>)}
          </select>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[.14em] text-brume">La méthode · Markdown, étapes numérotées, une section « Ne jamais »</span>
            <span className="flex gap-1">{[[false, "Écrire"], [true, "Aperçu"]].map(([k, mot]) => <button key={mot} type="button" aria-pressed={apercu === k} onClick={() => setApercu(k)} className={PILULE_CHOIX(apercu === k)} style={apercu === k ? undefined : { background: "transparent" }}>{mot}</button>)}</span>
          </div>
          {apercu
            ? <div className="min-h-[360px] rounded-[10px] border border-trait bg-surface px-4 py-3 text-[14px] leading-[1.6] text-encre [&_li]:mt-1 [&_ol]:pl-5 [&_p]:my-2 [&_strong]:text-encre [&_ul]:pl-5"><ReactMarkdown>{v.corps || "_Rien d'écrit._"}</ReactMarkdown></div>
            : <textarea value={v.corps} onChange={(e) => set("corps", e.target.value)} rows={18} className={`${champ} resize-y py-2.5 font-mono text-[13px] leading-[1.55]`} />}
          <p className="m-0 mt-1 text-[12px] text-brume">{v.corps.length > 4500 ? "Plus d'une page : pensez à scinder en deux compétences." : `${v.corps.length} signes · une page au plus.`}</p>
        </div>
        <div onDragOver={(e) => e.preventDefault()} onDrop={deposer}>
          <span className={etiquette}>Annexes · lues par l'Assistant KPartners seulement si une étape les demande</span>
          <div className="flex flex-col gap-2">
            {v.annexes.map((a, i) => (
              <details key={i} className="rounded-[10px] border border-trait px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-2 text-[13.5px] text-encre"><FileText className="h-3.5 w-3.5 text-ardoise" />{a.nom}
                  <button type="button" onClick={(e) => { e.preventDefault(); set("annexes", v.annexes.filter((_, j) => j !== i)); }} aria-label="Retirer l'annexe" className="ml-auto grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3 w-3" /></button>
                </summary>
                <input value={a.nom} onChange={(e) => set("annexes", v.annexes.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))} className={`${champ} mt-2 h-9`} />
                <textarea value={a.texte} onChange={(e) => set("annexes", v.annexes.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))} rows={6} className={`${champ} mt-2 resize-y py-2 font-mono text-[12.5px]`} />
              </details>
            ))}
            <button type="button" onClick={() => ajouterAnnexe(`annexe-${v.annexes.length + 1}.md`)} className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3 w-3" />Ajouter une annexe ou déposer un fichier texte ici</button>
          </div>
        </div>
        <div>
          <span className={etiquette}>La carte sur la page Assistant KPartners</span>
          <ApercuCarte v={v} />
        </div>
      </div>
    </div>
  );
}

const ONGLETS = [["definition", "Définition"], ["tests", "Tests"], ["executions", "Exécutions"], ["historique", "Historique"]];

export default function FicheCompetence({ c, donnees, onRetour }) {
  const qc = useQueryClient();
  const [onglet, setOnglet] = useState("definition");
  const [v, setV] = useState(() => depart(c));
  const [sale, setSale] = useState(false);
  const [note, setNote] = useState(null);
  const signature = `${c.cle}:${c.version}:${c.brouillon?.modifie_le || ""}`;
  useEffect(() => { setV(depart(c)); setSale(false); }, [signature]);
  const setVLocal = (f) => { setV(f); setSale(true); };
  const st = statutDe(c);
  const raf = () => { qc.invalidateQueries({ queryKey: ["haka-competences"] }); qc.invalidateQueries({ queryKey: ["haka-competence-tests", c.cle] }); };
  const corps = useMemo(() => ({ ...v, entrees: v.entrees, regles: lignesVersRegles(v.lignes) }), [v]);
  const enregistrer = useMutation({ mutationFn: () => base44.request("PUT", `/api/haka/competences/${c.cle}`, { body: corps }), onSuccess: (r) => { setSale(false); toast.success(r.erreurs_format?.length ? `Brouillon enregistré · ${r.erreurs_format.length} point${r.erreurs_format.length > 1 ? "s" : ""} de format à reprendre` : "Brouillon enregistré"); raf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const tester = useMutation({
    mutationFn: async () => { await base44.request("PUT", `/api/haka/competences/${c.cle}`, { body: corps }); return base44.request("POST", `/api/haka/competences/${c.cle}/tester`, { body: {} }); },
    onSuccess: (r) => { setSale(false); setOnglet("tests"); toast[r.tous_ont_tourne ? "success" : "error"](r.tous_ont_tourne ? "Tous les dossiers de test ont tourné" : "Un dossier de test n'a pas pu tourner"); raf(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const publier = useMutation({ mutationFn: () => base44.request("POST", `/api/haka/competences/${c.cle}/publier`, { body: { note } }), onSuccess: (r) => { toast.success(`Version ${r.competence.version} publiée${r.exporte?.ok ? ", exportée dans le dépôt" : ""}`); setNote(null); raf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const abandonner = useMutation({ mutationFn: () => base44.request("POST", `/api/haka/competences/${c.cle}/abandonner`, { body: {} }), onSuccess: () => { toast.success("Brouillon abandonné"); raf(); } });
  const activer = useMutation({ mutationFn: (active) => base44.request("POST", `/api/haka/competences/${c.cle}/activer`, { body: { active } }), onSuccess: (_, a) => { toast.success(a ? "Compétence activée" : "Compétence désactivée : elle quitte les cartes et les automatismes"); raf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const testsQ = useQuery({ queryKey: ["haka-competence-tests", c.cle], queryFn: () => base44.request("GET", `/api/haka/competences/${c.cle}/tests`), retry: false });
  const obstacles = sale ? ["Enregistrez d'abord vos modifications."] : (testsQ.data?.obstacles || []);
  const peutPublier = !!c.brouillon && !obstacles.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button type="button" onClick={onRetour} className="inline-flex items-center gap-1 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}><ChevronLeft className="h-4 w-4" />Toutes les compétences</button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-[22px] tracking-[-0.01em] text-encre">{c.nom}</p>
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ardoise">
              <span className="inline-flex items-center gap-1.5"><span className={`inline-block h-[7px] w-[7px] rounded-full ${st.cle === "active" ? "bg-menthe" : st.cle === "brouillon" ? "bg-ambre" : "bg-bord-vif"}`} />{Number(c.version) ? `Publiée v${c.version}` : "Brouillon"}{st.cle === "desactivee" ? " · désactivée" : ""}</span>
              {Number(c.version) > 0 && <span>{quand(c.publiee_le)}{c.par ? ` par ${c.par.split("@")[0]}` : ""}</span>}
              {c.brouillon && <span>Brouillon du {quand(c.brouillon.modifie_le)}</span>}
              <span className="font-mono text-[12px] text-brume">{c.cle}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Number(c.version) > 0 && <button type="button" onClick={() => activer.mutate(!!c.desactivee)} disabled={activer.isPending} className="h-9 rounded-full px-3.5 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{c.desactivee ? "Activer" : "Désactiver"}</button>}
            {c.brouillon && <button type="button" onClick={() => abandonner.mutate()} className="h-9 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Abandonner le brouillon</button>}
            <button type="button" onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending || !sale && !!c.brouillon} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Enregistrer</button>
            <button type="button" onClick={() => tester.mutate()} disabled={tester.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-menthe/60 px-4 text-[13px] text-encre hover:bg-menthe/10 disabled:opacity-40" style={{ background: "transparent" }}>{tester.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Tester</button>
            <button type="button" onClick={() => setNote(note === null ? "" : null)} disabled={!peutPublier} title={peutPublier ? "Publier cette version" : obstacles[0] || "Rien à publier"} className="h-9 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">Publier</button>
          </div>
        </div>
        {note !== null && peutPublier && (
          <form onSubmit={(e) => { e.preventDefault(); publier.mutate(); }} className="mt-4 flex flex-wrap items-center gap-2 rounded-[12px] border border-menthe/40 p-3">
            <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={160} placeholder="Note de version, une ligne : ce qui change et pourquoi" className={`${champ} h-9 min-w-[260px] flex-1`} />
            <button type="submit" disabled={!note.trim() || publier.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">{publier.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Publier la version {(Number(c.version) || 0) + 1}</button>
          </form>
        )}
        {c.brouillon && obstacles.length > 0 && (
          <ul className="m-0 mt-3 list-none p-0 text-[12.5px] text-ardoise">{obstacles.slice(0, 4).map((o) => <li key={o} className="flex items-start gap-2 py-0.5"><span className="mt-[7px] h-[5px] w-[5px] flex-none rounded-full bg-ambre" />{o}</li>)}</ul>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-trait pb-2" role="tablist">
        {ONGLETS.map(([k, mot]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} onClick={() => setOnglet(k)} className={`inline-flex h-9 flex-none items-center rounded-full border-0 px-4 text-[14px] transition-colors ${onglet === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={onglet === k ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
      </div>

      <div key={onglet} className="duration-300 animate-in fade-in-0">
        {onglet === "definition" && <Definition c={c} v={v} setV={setVLocal} donnees={donnees} />}
        {onglet === "tests" && <OngletTests c={c} onTester={() => tester.mutate()} enCours={tester.isPending} />}
        {onglet === "executions" && <OngletExecutions c={c} />}
        {onglet === "historique" && <OngletHistorique c={c} onRaf={raf} />}
      </div>
    </div>
  );
}
