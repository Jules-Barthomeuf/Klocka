import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, Plus, Tag, Trash2, Upload, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { API, Avatar, Etat, Fenetre, req, useReferentiel, bouton, boutonContour, boutonLigne, boutonPlein, champ, etiquette, date, dateHeure, pluriel } from "./commun";

// Les contacts : le tableau (recherche, filtres, sélection multiple, actions
// en masse), l'import en trois temps (le texte ou le fichier, la
// correspondance des colonnes avec un aperçu, l'import), les listes
// statiques, les segments dynamiques, les champs personnalisés, et la fiche
// d'un contact avec son historique.

const STATUTS = [["", "Tous les statuts"], ["abonne", "Abonnés"], ["desinscrit", "Désinscrits"], ["bounce", "Bounces"], ["plainte", "Plaintes"]];
const OPERATEURS = [["egal", "est égal à"], ["different", "est différent de"], ["contient", "contient"], ["non_vide", "est rempli"], ["vide", "est vide"], ["a_tag", "a le tag"], ["sans_tag", "n'a pas le tag"], ["dans_liste", "est dans la liste"], ["hors_liste", "n'est pas dans la liste"]];
const SANS_CHAMP = new Set(["a_tag", "sans_tag", "dans_liste", "hors_liste"]);
const SANS_VALEUR = new Set(["vide", "non_vide"]);

/** Les contacts choisis en CSV (séparateur « ; », lisible par Excel en français). */
function exporterCsv(contacts) {
  const cellule = (v) => {
    const t = String(v ?? "");
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const champs = [...new Set(contacts.flatMap((c) => Object.keys(c.champs || {})))];
  const lignes = [
    ["email", "prenom", "nom", "entreprise", "ville", "tags", "statut", "source", ...champs].join(";"),
    ...contacts.map((c) => [c.email, c.prenom, c.nom, c.entreprise, c.ville, (c.tags || []).join(", "), c.statut, c.source, ...champs.map((k) => c.champs?.[k])].map(cellule).join(";")),
  ];
  // Le BOM fait lire les accents à Excel.
  const blob = new Blob(["\ufeff" + lignes.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `contacts-klocka-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// L'import (6 oct. 2026, demande de Jules) : nos fichiers portent toujours
// prénom, nom, email… en en-tête. Les colonnes se reconnaissent d'elles-mêmes
// et le fichier s'importe dès qu'on le choisit, dans la liste qui porte son
// nom (ou celle qu'on a tapée avant). Plus d'étape de correspondance.
function Import({ onFermer }) {
  const queryClient = useQueryClient();
  const { data: ref } = useReferentiel();
  const [texte, setTexte] = useState("");
  const [liste, setListe] = useState("");
  const [tags, setTags] = useState("");
  const [conversion, setConversion] = useState(false);
  const importer = useMutation({
    mutationFn: ({ csv, nomListe }) => req("POST", "/contacts/importer", { texte: csv, auto: true, liste: nomListe || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    onSuccess: (r) => {
      if (r?.ok === false) { toast.error(r.error || "Import impossible"); return; }
      toast.success(`${pluriel(r.nouveaux, "contact ajouté", "contacts ajoutés")}, ${pluriel(r.mis_a_jour, "mis à jour", "mis à jour")}${r.liste ? ` dans « ${r.liste} »` : ""}`, { description: r.invalides ? `${pluriel(r.invalides, "ligne sans adresse valable", "lignes sans adresse valable")}, écartée${r.invalides > 1 ? "s" : ""}.` : undefined });
      ["emailing-contacts", "emailing-referentiel", "emailing-contacts-apercu"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onFermer();
    },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });
  const occupe = conversion || importer.isPending;
  const lireFichier = async (f) => {
    if (!f) return;
    // La liste : celle qu'on a tapée, sinon le nom du fichier.
    const nomListe = liste.trim() || f.name.replace(/\.(xlsx|xls|csv|txt)$/i, "");
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      const r = new FileReader();
      r.onload = () => importer.mutate({ csv: String(r.result || ""), nomListe });
      r.readAsText(f);
      return;
    }
    setConversion(true);
    try {
      const form = new FormData();
      form.append("fichier", f, f.name);
      const r = await base44.request("POST", `${API}/contacts/convertir`, { body: form, isForm: true });
      importer.mutate({ csv: r.csv || "", nomListe });
    } catch (e) { toast.error(e?.message || "Fichier Excel illisible"); } finally { setConversion(false); }
  };
  return (
    <Fenetre titre="Importer des contacts" onFermer={onFermer} large
      pied={<><button type="button" className={bouton} onClick={onFermer}>Annuler</button><button type="button" className={boutonPlein} disabled={!texte.trim() || occupe} onClick={() => importer.mutate({ csv: texte, nomListe: liste.trim() })}>{importer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Importer le texte collé</button></>}>
      <p className="m-0 text-[13px] text-ardoise">Choisissez le fichier : chaque contact entre aussitôt dans la liste, prénom, nom, email et le reste repris de ses colonnes. Une adresse déjà connue est mise à jour, jamais dupliquée, et garde son statut.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className={etiquette}>Liste (sinon, le nom du fichier)
          <input list="import-listes" value={liste} onChange={(e) => setListe(e.target.value)} placeholder="ex. Webinaire 12 oct." className={`${champ} mt-1.5`} />
          <datalist id="import-listes">{(ref?.listes || []).map((l) => <option key={l.id} value={l.nom} />)}</datalist>
        </label>
        <label className={etiquette}>Tags à poser (séparés par des virgules)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ex. webinaire-oct" className={`${champ} mt-1.5`} />
        </label>
      </div>
      <label className={`${boutonPlein} mt-4 cursor-pointer ${occupe ? "pointer-events-none opacity-60" : ""}`}>
        {occupe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{conversion ? "Lecture du fichier…" : importer.isPending ? "Import en cours…" : "Choisir le fichier Excel ou CSV"}
        <input type="file" accept=".xlsx,.xls,.csv,.txt,text/csv" className="hidden" disabled={occupe} onChange={(e) => { lireFichier(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <p className="m-0 mt-5 text-[12.5px] text-brume">Ou collez un tableau avec son en-tête :</p>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={6} placeholder={"email;prénom;nom;ville\nmarie.durand@exemple.fr;Marie;Durand;Lyon"}
        className="mt-2 w-full rounded-[12px] border border-trait bg-surface px-3 py-2.5 font-mono text-[12.5px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
    </Fenetre>
  );
}

function EditeurSegment({ segment, onFermer }) {
  const queryClient = useQueryClient();
  const { data: ref } = useReferentiel();
  const [nom, setNom] = useState(segment?.nom || "");
  const [comb, setComb] = useState(segment?.regles?.combinaison || "et");
  const [conds, setConds] = useState(segment?.regles?.conditions?.length ? segment.regles.conditions : [{ champ: "ville", operateur: "egal", valeur: "" }]);
  const champs = [["prenom", "Prénom"], ["nom", "Nom"], ["entreprise", "Entreprise"], ["ville", "Ville"], ["source", "Source"], ["email", "Email"], ...(ref?.champs || []).map((c) => [`champs.${c.cle}`, c.libelle])];
  const enregistrer = useMutation({
    mutationFn: () => req(segment ? "PATCH" : "POST", segment ? `/segments/${segment.id}` : "/segments", { nom, regles: { combinaison: comb, conditions: conds } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["emailing-referentiel"] }); toast.success("Segment enregistré"); onFermer(); },
    onError: (e) => toast.error(e?.message || "Enregistrement impossible"),
  });
  const maj = (i, p) => setConds((l) => l.map((c, k) => (k === i ? { ...c, ...p } : c)));
  return (
    <Fenetre titre={segment ? `Segment « ${segment.nom} »` : "Nouveau segment"} onFermer={onFermer} large
      pied={<><button type="button" className={bouton} onClick={onFermer}>Annuler</button><button type="button" className={boutonPlein} onClick={() => enregistrer.mutate()} disabled={!nom.trim() || enregistrer.isPending}>Enregistrer</button></>}>
      <label className={etiquette}>Nom du segment<input value={nom} onChange={(e) => setNom(e.target.value)} className={`${champ} mt-1.5`} placeholder="ex. Webinaire d'octobre à Lyon" /></label>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-craie">Les contacts qui remplissent
        <select value={comb} onChange={(e) => setComb(e.target.value)} className="h-8 rounded-[8px] border border-trait bg-surface px-2 text-encre outline-none max-md:h-10 max-md:text-[16px]"><option value="et">toutes les règles</option><option value="ou">au moins une règle</option></select>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {conds.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            {!SANS_CHAMP.has(c.operateur) && (
              <select value={c.champ || "ville"} onChange={(e) => maj(i, { champ: e.target.value })} className="h-9 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none max-md:h-10 max-md:text-[16px]">
                {champs.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
              </select>
            )}
            <select value={c.operateur} onChange={(e) => maj(i, { operateur: e.target.value, ...(SANS_CHAMP.has(e.target.value) ? { champ: null } : { champ: c.champ || "ville" }) })} className="h-9 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none max-md:h-10 max-md:text-[16px]">
              {OPERATEURS.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
            </select>
            {["dans_liste", "hors_liste"].includes(c.operateur) ? (
              <select value={c.valeur || ""} onChange={(e) => maj(i, { valeur: e.target.value })} className="h-9 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none max-md:h-10 max-md:text-[16px]">
                <option value="">Choisir une liste…</option>{(ref?.listes || []).map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
            ) : !SANS_VALEUR.has(c.operateur) && (
              <input list={["a_tag", "sans_tag"].includes(c.operateur) ? "segment-tags" : undefined} value={c.valeur || ""} onChange={(e) => maj(i, { valeur: e.target.value })} placeholder="valeur" className="h-9 w-48 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none max-md:h-10 max-md:min-w-0 max-md:flex-1 max-md:text-[16px]" />
            )}
            {conds.length > 1 && <button type="button" onClick={() => setConds((l) => l.filter((_, k) => k !== i))} aria-label="Retirer la règle" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte max-md:h-10 max-md:w-10"><X className="h-4 w-4" /></button>}
          </div>
        ))}
        <datalist id="segment-tags">{(ref?.tags || []).map((t) => <option key={t.nom} value={t.nom} />)}</datalist>
      </div>
      <button type="button" onClick={() => setConds((l) => [...l, { champ: "ville", operateur: "egal", valeur: "" }])} className={`${bouton} mt-3`}><Plus className="h-3.5 w-3.5" />Ajouter une règle</button>
      <p className="m-0 mt-3 text-[12px] text-ardoise">Un segment se recalcule à chaque usage : un contact qui remplit les règles plus tard y entre tout seul.</p>
    </Fenetre>
  );
}

// L'historique d'un contact, en mots (9 oct. 2026) : les mails, puis le simulateur et le call.
const MOT_HISTO = { envoye: "Mail reçu", delivre: "Délivré", ouvert: "Ouvert", clique: "Cliqué", bounce: "Bounce", plainte: "Plainte", echec: "Échec d'envoi", retarde: "Retardé", supprime: "Adresse supprimée", simulateur: "Simulateur utilisé", clic_call: "Bouton « Parler au fondateur »", call_pris: "Call pris", reponse: "A répondu", lead_magnet: "Lead magnet ouvert" };
const euros = (v) => `${Math.round(Number(v) / 1000).toLocaleString("fr-FR")} k€`;
const valeursLisibles = (v) => [v.prixBienFAI != null && `prix ${euros(v.prixBienFAI)}`, v.loyerInitialHTHC != null && `loyer ${euros(v.loyerInitialHTHC)}/an`, v.apport != null && `apport ${euros(v.apport)}`, v.sansCredit ? "sans crédit" : v.dureeCredit != null && `crédit ${v.dureeCredit} ans`].filter(Boolean).join(", ");

function Fiche({ id, onFermer }) {
  const queryClient = useQueryClient();
  const { data: ref } = useReferentiel();
  const { data } = useQuery({ queryKey: ["emailing-fiche", id], queryFn: () => req("GET", `/contacts/${id}`) });
  const [tag, setTag] = useState("");
  const maj = useMutation({
    mutationFn: (patch) => req("PATCH", `/contacts/${id}`, patch),
    onSuccess: () => { ["emailing-fiche", "emailing-contacts", "emailing-referentiel"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(e?.message || "Modification impossible"),
  });
  const c = data?.contact;
  const champTexte = (k, mot) => (
    <label key={k} className={etiquette}>{mot}
      <input defaultValue={k.startsWith("champs.") ? c?.champs?.[k.slice(7)] || "" : c?.[k] || ""} key={`${id}-${k}-${c ? "ok" : "..."}`}
        onBlur={(e) => maj.mutate(k.startsWith("champs.") ? { champs: { [k.slice(7)]: e.target.value } } : { [k]: e.target.value })} className={`${champ} mt-1 h-9 text-[13px]`} />
    </label>
  );
  return createPortal(
    <div className="fixed inset-0 z-[75] flex justify-end bg-fond/50" onMouseDown={onFermer}>
      <aside onMouseDown={(e) => e.stopPropagation()} className="flex h-full w-full max-w-[520px] flex-col border-l border-trait bg-surface-pleine shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-trait px-6 py-4 max-md:px-4 max-md:pt-[calc(16px+env(safe-area-inset-top))]">
          <div className="min-w-0"><p className="m-0 truncate text-[16px] text-encre">{c ? [c.prenom, c.nom].filter(Boolean).join(" ") || c.email : "…"}</p><p className="m-0 truncate text-[13px] text-ardoise">{c?.email}</p></div>
          <div className="flex flex-none items-center gap-2">{c && <Etat statut={c.statut} />}<button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief max-md:h-10 max-md:w-10"><X className="h-4 w-4" /></button></div>
        </div>
        {!c ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div> : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-4 max-md:pb-[calc(20px+env(safe-area-inset-bottom))]">
            <label className={`${etiquette} mb-3`}>Type
              <select value={c.type || "lead"} onChange={(e) => maj.mutate({ type: e.target.value })} className={`${champ} mt-1 h-9 text-[13px]`}>
                {TYPES.filter(([k]) => k).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">{[["prenom", "Prénom"], ["nom", "Nom"], ["entreprise", "Entreprise"], ["ville", "Ville"], ...(ref?.champs || []).map((x) => [`champs.${x.cle}`, x.libelle])].map(([k, mot]) => champTexte(k, mot))}</div>
            <p className="m-0 mt-5 text-[13px] text-encre">Tags</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(c.tags || []).map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full border border-trait px-2.5 py-0.5 text-[12.5px] text-craie">{t}<button type="button" onClick={() => maj.mutate({ tags: c.tags.filter((x) => x !== t) })} aria-label={`Retirer ${t}`} className="text-ardoise hover:text-alerte max-md:-my-1 max-md:grid max-md:h-7 max-md:w-7 max-md:place-items-center"><X className="h-3 w-3" /></button></span>)}
              <form onSubmit={(e) => { e.preventDefault(); if (tag.trim()) { maj.mutate({ tags: [...(c.tags || []), tag.trim()] }); setTag(""); } }}><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="+ tag" className="h-7 w-28 rounded-full border border-dashed border-bord-doux bg-transparent px-2.5 text-[12.5px] text-encre outline-none max-md:h-9 max-md:w-32 max-md:text-[16px]" /></form>
            </div>
            <p className="m-0 mt-4 text-[13px] text-encre">Listes</p>
            <p className="m-0 mt-1 text-[13px] text-craie">{c.listes_noms?.join(", ") || "Aucune"}</p>
            <p className="m-0 mt-1 text-[12px] text-brume">Source : {c.source || "?"} · ajouté le {date(c.ajoute_le)}</p>
            {c.statut === "abonne" && <button type="button" onClick={() => { if (window.confirm(`Désinscrire ${c.email} ? Il ne recevra plus aucun email marketing.`)) maj.mutate({ statut: "desinscrit" }); }} className={`${bouton} mt-3`}>Désinscrire</button>}

            {/* L'engagement (9 oct. 2026) : le score, ce qui le fait, et le call. */}
            <p className="m-0 mt-6 text-[13px] text-encre">Engagement</p>
            <p className="m-0 mt-1 text-[13px] text-craie">Score {data.score ?? 0} · {pluriel(data.engagement?.ouverts || 0, "ouverture")}, {pluriel(data.engagement?.cliques || 0, "clic")}, {pluriel(data.engagement?.simulateur || 0, "passage", "passages")} au simulateur</p>
            {c.call_pris_le ? <p className="m-0 mt-1 text-[13px] text-menthe">Call pris le {dateHeure(c.call_pris_le)}{c.call_pris_via === "calendly" ? " (Calendly)" : " (depuis le simulateur)"}</p> : null}
            <p className="m-0 mt-5 text-[13px] text-encre">Newsletters</p>
            {data.newsletters?.length ? data.newsletters.map((n) => <p key={n.id} className="m-0 mt-1 text-[13px] text-craie">{n.nom} · {n.recoit ? (n.statut === "active" ? "reçoit les mails" : "newsletter en pause") : c.call_pris_le ? "sorti : call pris" : `sorti : ${c.statut}`}</p>) : <p className="m-0 mt-1 text-[13px] text-brume">Aucune : ses listes ne sont dans aucune newsletter.</p>}
            <p className="m-0 mt-5 text-[13px] text-encre">Historique</p>
            <ol className="m-0 mt-1 list-none p-0">
              {data.historique.slice(0, 80).map((h, i) => <li key={i} className="border-t border-trait py-1.5 text-[12.5px] first:border-t-0"><span className="text-ardoise">{dateHeure(h.le)}</span> · <span className={h.type === "call_pris" ? "text-menthe" : "text-encre"}>{MOT_HISTO[h.type] || h.type}</span>{h.objet ? <span className="text-craie"> · {h.objet}</span> : null}{h.lien ? <span className="text-ardoise"> · {String(h.lien).replace(/^https?:\/\/(www\.)?/, "").split("?")[0]}</span> : null}{h.valeurs ? <span className="text-craie"> · {valeursLisibles(h.valeurs)}</span> : null}{h.changements ? <span className="text-ardoise"> · {pluriel(h.changements, "réglage changé", "réglages changés")}</span> : null}</li>)}
              {!data.historique.length && <li className="text-[12.5px] text-brume">Rien encore.</li>}
            </ol>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/** Ajouter un contact à la main. */
function AjoutContact({ onFermer, onAjoute }) {
  const [v, setV] = useState({ email: "", prenom: "", nom: "", ville: "", type: "lead" });
  const ajouter = useMutation({
    mutationFn: () => req("POST", "/contacts", v),
    onSuccess: (r) => { if (r.deja) toast.success("Ce contact existait déjà"); onAjoute(r.contact); },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });
  const champTexte = (k, mot, type = "text") => (
    <label className={etiquette}>{mot}<input type={type} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} className={`${champ} mt-1.5`} /></label>
  );
  return (
    <Fenetre titre="Ajouter un contact" onFermer={onFermer}
      pied={<><button type="button" className={bouton} onClick={onFermer}>Annuler</button><button type="button" className={boutonPlein} disabled={!v.email.trim() || ajouter.isPending} onClick={() => ajouter.mutate()}>Ajouter</button></>}>
      <div className="flex flex-col gap-3">
        {champTexte("email", "Adresse email", "email")}
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">{champTexte("prenom", "Prénom")}{champTexte("nom", "Nom")}</div>
        {champTexte("ville", "Ville")}
        <label className={etiquette}>Type
          <select value={v.type} onChange={(e) => setV((x) => ({ ...x, type: e.target.value }))} className={`${champ} mt-1.5`}>
            {TYPES.filter(([k]) => k).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
          </select>
        </label>
      </div>
    </Fenetre>
  );
}

const TYPES = [["", "Tous"], ["lead", "Lead"], ["client", "Client"], ["mandataire", "Mandataire"], ["partenaire", "Partenaire"]];
const MOT_TYPE = Object.fromEntries(TYPES);
const SOUS_ONGLETS = [["tous", "Tous les contacts"], ["listes", "Listes"], ["segments", "Segments"], ["champs", "Champs personnalisés"]];
const STATUT = { abonne: ["Abonné", "bg-menthe"], desinscrit: ["Désinscrit", "bg-brume"], bounce: ["Bounce", "bg-alerte"], plainte: ["Plainte", "bg-alerte"] };
const COLONNES = "grid-cols-[28px_minmax(0,2.4fr)_100px_100px_minmax(0,1.4fr)_100px_64px_minmax(0,1.8fr)]";
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");

/** Le résumé d'une règle de segment, en clair. */
function resumeRegles(s, ref) {
  const mots = { egal: "=", different: "≠", contient: "contient", non_vide: "est rempli", vide: "est vide", a_tag: "a le tag", sans_tag: "n'a pas le tag", dans_liste: "est dans", hors_liste: "n'est pas dans" };
  const conds = s.regles?.conditions || [];
  return conds.map((c) => {
    const valeur = ["dans_liste", "hors_liste"].includes(c.operateur) ? ref?.listes?.find((l) => l.id === c.valeur)?.nom || c.valeur : c.valeur;
    const champ_ = c.champ ? String(c.champ).replace(/^champs\./, "") : "";
    return [["a_tag", "sans_tag", "dans_liste", "hors_liste"].includes(c.operateur) ? "" : champ_, mots[c.operateur] || c.operateur, valeur].filter(Boolean).join(" ");
  }).join(s.regles?.combinaison === "ou" ? " ou " : " · ");
}

export default function Contacts({ demande = null }) {
  const queryClient = useQueryClient();
  const { data: ref } = useReferentiel();
  const [sous, setSous] = useState("tous");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [filtre, setFiltre] = useState(null); // { liste | segment, nom } venu des onglets Listes et Segments
  const [page, setPage] = useState(1);
  const [choisis, setChoisis] = useState([]);
  const [fenetre, setFenetre] = useState(null);
  const [fiche, setFiche] = useState(null);
  const [segment, setSegment] = useState(undefined);
  const [nouvelle, setNouvelle] = useState(null);
  const [libelle, setLibelle] = useState("");
  useEffect(() => { if (demande?.quoi === "importer") setFenetre("import"); else if (demande?.quoi === "ajouter") setFenetre("ajouter"); }, [demande?.n]);
  const params = new URLSearchParams({ q, page: String(page), par_page: "50", ...(type ? { type } : {}), ...(filtre?.liste ? { liste: filtre.liste } : {}), ...(filtre?.segment ? { segment: filtre.segment } : {}) });
  const { data, isLoading } = useQuery({ queryKey: ["emailing-contacts", params.toString()], queryFn: () => req("GET", `/contacts/recherche?${params}`), enabled: sous === "tous" });
  const raf = () => ["emailing-contacts", "emailing-referentiel", "emailing-contacts-apercu"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const masse = useMutation({ mutationFn: (corps) => req("POST", "/contacts/masse", { ids: choisis, ...corps }), onSuccess: (r) => { toast.success(`${pluriel(r.touches, "contact")} mis à jour`); setChoisis([]); raf(); } });
  const appel = useMutation({ mutationFn: ([m, c, b]) => req(m, c, b), onSuccess: raf, onError: (e) => toast.error(e?.message || "Impossible") });
  // Les contacts vus, page après page : l'export sort toute la sélection.
  const vus = useRef(new Map());
  const contacts = data?.contacts || [];
  useEffect(() => { for (const c of contacts) vus.current.set(c.id, c); }, [contacts]);
  const tous = contacts.length > 0 && contacts.every((c) => choisis.includes(c.id));
  const pastille = (actif) => `rounded-[8px] px-3 py-1.5 text-[13px] transition-colors ${actif ? "bg-relief text-encre" : "text-ardoise hover:text-encre"}`;
  const nomDe = (c) => [c.prenom, c.nom].filter(Boolean).join(" ") || c.entreprise || c.email;
  const masseMenu = (actions) => (
    <div className="mt-3.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-bord-doux bg-relief px-2.5 py-2 text-[13px]">
      <span className="px-1.5 text-encre">{pluriel(choisis.length, "sélectionné", "sélectionnés")}</span>
      {actions}
      <button type="button" className="ml-auto text-[12.5px] text-ardoise hover:text-encre max-md:h-9" style={{ background: "transparent" }} onClick={() => setChoisis([])}>Annuler</button>
    </div>
  );
  const selectMasse = "h-8 rounded-[7px] border border-bord-doux bg-surface px-2.5 text-[12.5px] text-encre outline-none max-md:h-9 max-md:text-[16px]";

  return (
    <div className="px-10 pb-20 pt-7 max-md:px-4 max-md:pt-5">
      <div className="mb-5 flex flex-wrap gap-1.5">
        {SOUS_ONGLETS.map(([k, mot]) => <button key={k} type="button" onClick={() => setSous(k)} className={pastille(sous === k)} style={sous === k ? undefined : { background: "transparent" }}>{mot}</button>)}
      </div>

      {sous === "tous" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {TYPES.map(([k, mot]) => (
                <button key={k || "tous"} type="button" onClick={() => { setType(k); setPage(1); }}
                  className={`rounded-full border px-[11px] py-[5px] text-[12.5px] transition-colors max-md:py-2 ${type === k ? "border-encre bg-encre text-fond" : "border-bord-doux text-craie hover:text-encre"}`}
                  style={type === k ? undefined : { background: "transparent" }}>{mot}</button>
              ))}
              {filtre && (
                <span className="inline-flex items-center gap-1 rounded-full bg-relief py-[5px] pl-3 pr-1.5 text-[12.5px] text-encre">
                  {filtre.nom}<button type="button" onClick={() => { setFiltre(null); setPage(1); }} aria-label="Retirer ce filtre" className="grid h-5 w-5 place-items-center rounded-full text-ardoise hover:text-encre max-md:h-7 max-md:w-7" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
                </span>
              )}
            </div>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Rechercher un nom, un email, une ville"
              className="h-9 w-[280px] rounded-[8px] border border-bord-doux bg-surface px-3 text-[13px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:h-10 max-md:w-full max-md:text-[16px]" />
          </div>

          {choisis.length > 0 && masseMenu(
            <>
              <select defaultValue="" onChange={(e) => { if (e.target.value) masse.mutate({ action: "ajouter_liste", valeur: e.target.value }); e.target.value = ""; }} className={selectMasse}>
                <option value="">Ajouter à une liste</option>{(ref?.listes || []).map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
              </select>
              <button type="button" className={boutonLigne} onClick={() => { const t = window.prompt("Tag à ajouter :"); if (t) masse.mutate({ action: "ajouter_tag", valeur: t.trim() }); }}><Tag className="mr-1.5 h-3.5 w-3.5" />Ajouter un tag</button>
              <button type="button" className={boutonLigne} onClick={() => exporterCsv(choisis.map((id) => vus.current.get(id)).filter(Boolean))}><Download className="mr-1.5 h-3.5 w-3.5" />Exporter</button>
              <button type="button" className={boutonLigne} onClick={() => { if (window.confirm(`Désinscrire ${pluriel(choisis.length, "contact")} ? Ils ne recevront plus d'email marketing.`)) masse.mutate({ action: "desinscrire" }); }}>Désinscrire</button>
              <button type="button" className={`${boutonLigne} text-alerte`} onClick={() => { if (window.confirm(`Supprimer ${pluriel(choisis.length, "contact")} ? Leurs séquences s'arrêtent.`)) masse.mutate({ action: "supprimer" }); }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Supprimer</button>
            </>,
          )}

          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
            : !contacts.length ? <p className="py-14 text-center text-[14px] text-brume">Aucun contact{q || type || filtre ? " pour ces filtres" : " : « Importer » ou « Ajouter un contact », en haut à droite"}.</p>
              : (
                <div className="mt-3.5 overflow-x-auto rounded-[14px] border border-trait bg-rail">
                  <div className="min-w-[1000px]">
                    <div className={`grid ${COLONNES} items-center gap-3.5 border-b border-trait bg-surface-pleine px-4 py-[11px] text-[12px] text-ardoise`}>
                      <input type="checkbox" checked={tous} onChange={(e) => setChoisis(e.target.checked ? contacts.map((c) => c.id) : [])} aria-label="Tout choisir" className="h-4 w-4" />
                      <div>Contact</div><div>Type</div><div>Ville</div><div>Tags</div><div>Statut</div><div title="1 par ouverture, 3 par clic, 5 par passage au simulateur, 20 pour un call">Score</div><div>Dernière activité</div>
                    </div>
                    {contacts.map((c) => {
                      const oui = choisis.includes(c.id);
                      const [motStatut, point] = STATUT[c.statut] || [c.statut, "bg-brume"];
                      return (
                        <div key={c.id} onClick={() => setFiche(c.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setFiche(c.id); }}
                          className={`grid ${COLONNES} cursor-pointer items-center gap-3.5 border-b border-trait px-4 py-[11px] text-[13px] last:border-b-0 ${oui ? "bg-relief/60" : "hover:bg-relief/40"}`}>
                          <input type="checkbox" checked={oui} onClick={(e) => e.stopPropagation()} onChange={(e) => setChoisis((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} aria-label={`Choisir ${c.email}`} className="h-4 w-4 max-md:h-5 max-md:w-5" />
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar c={c} />
                            <div className="min-w-0"><div className="truncate text-encre">{nomDe(c)}</div><div className="truncate text-[12px] text-ardoise">{c.email}</div></div>
                          </div>
                          <div className="text-craie">{MOT_TYPE[c.type || "lead"] || c.type}</div>
                          <div className="truncate text-craie">{c.ville || "—"}</div>
                          <div className="flex min-w-0 flex-wrap gap-1 overflow-hidden">{(c.tags || []).slice(0, 3).map((t) => <span key={t} className="rounded-full border border-bord-doux px-[7px] py-px text-[11.5px] text-craie">{t}</span>)}{(c.tags || []).length > 3 && <span className="text-[11.5px] text-ardoise">+{c.tags.length - 3}</span>}</div>
                          <div className="flex items-center gap-1.5 text-craie"><span className={`h-1.5 w-1.5 rounded-full ${point}`} />{motStatut}</div>
                          <div className={`tabular-nums ${c.call_pris_le ? "text-menthe" : c.score ? "text-encre" : "text-brume"}`} title={c.call_pris_le ? "Call pris" : undefined}>{c.score || 0}</div>
                          <div className="text-[12.5px] text-ardoise">{c.derniere_activite ? `${c.derniere_activite.texte} · ${jourCourt(c.derniere_activite.le)}` : "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          {data?.total > 50 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ardoise">
              <span>{pluriel(data.total, "contact")}</span>
              <span className="flex gap-2"><button type="button" className={bouton} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Précédents</button><button type="button" className={bouton} disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>Suivants</button></span>
            </div>
          )}
        </>
      )}

      {sous === "listes" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {(ref?.listes || []).map((l) => (
            <div key={l.id} className="group rounded-[14px] border border-trait bg-rail p-4">
              <button type="button" onClick={() => { setFiltre({ liste: l.id, nom: l.nom }); setType(""); setPage(1); setSous("tous"); }} className="flex w-full justify-between gap-3 text-left text-[14.5px]" style={{ background: "transparent" }}>
                <span className="min-w-0 truncate text-encre">{l.nom}</span><span className="tabular-nums text-craie">{l.total}</span>
              </button>
              <div className="mt-1.5 flex items-center gap-3 text-[12.5px] text-ardoise">
                <span>{pluriel(l.abonnes ?? l.total, "abonné")}</span>
                <span className="ml-auto flex gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                  <button type="button" onClick={() => { const n = window.prompt("Nouveau nom :", l.nom); if (n) appel.mutate(["PATCH", `/listes/${l.id}`, { nom: n }]); }} className="hover:text-encre" style={{ background: "transparent" }}>Renommer</button>
                  <button type="button" onClick={() => { if (window.confirm(`Supprimer la liste « ${l.nom} » ? Ses contacts restent.`)) appel.mutate(["DELETE", `/listes/${l.id}`]); }} className="hover:text-alerte" style={{ background: "transparent" }}>Supprimer</button>
                </span>
              </div>
            </div>
          ))}
          {nouvelle != null ? (
            <form onSubmit={(e) => { e.preventDefault(); if (nouvelle.trim()) appel.mutate(["POST", "/listes", { nom: nouvelle.trim() }]); setNouvelle(null); }} className="rounded-[14px] border border-dashed border-bord-doux p-4">
              <input autoFocus value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} onBlur={() => { if (!nouvelle.trim()) setNouvelle(null); }} placeholder="Nom de la liste" className={`${champ} h-9 text-[13.5px]`} />
            </form>
          ) : (
            <button type="button" onClick={() => setNouvelle("")} className="rounded-[14px] border border-dashed border-bord-doux p-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Nouvelle liste</button>
          )}
        </div>
      )}

      {sous === "segments" && (
        <div className="flex max-w-[760px] flex-col gap-2.5">
          {(ref?.segments || []).map((x) => (
            <div key={x.id} className="group flex items-center justify-between gap-4 rounded-[14px] border border-trait bg-rail p-4">
              <button type="button" onClick={() => setSegment(x)} className="min-w-0 text-left" style={{ background: "transparent" }}>
                <span className="block truncate text-[14.5px] text-encre">{x.nom}</span>
                <span className="mt-1.5 block truncate text-[12.5px] text-ardoise">{resumeRegles(x, ref) || "Aucune règle"}</span>
              </button>
              <span className="flex flex-none items-center gap-3">
                <button type="button" onClick={() => { setFiltre({ segment: x.id, nom: x.nom }); setType(""); setPage(1); setSous("tous"); }} className="whitespace-nowrap text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>{pluriel(x.total, "contact")}</button>
                <button type="button" onClick={() => { if (window.confirm(`Supprimer le segment « ${x.nom} » ?`)) appel.mutate(["DELETE", `/segments/${x.id}`]); }} aria-label="Supprimer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise opacity-0 hover:text-alerte focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          ))}
          <button type="button" onClick={() => setSegment(null)} className="rounded-[14px] border border-dashed border-bord-doux p-4 text-left text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Nouveau segment</button>
          <p className="m-0 text-[12.5px] text-ardoise">Les segments se mettent à jour seuls quand un contact remplit ou ne remplit plus les règles.</p>
        </div>
      )}

      {sous === "champs" && (
        <div className="max-w-[820px]">
          <div className="overflow-hidden rounded-[14px] border border-trait bg-rail">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_90px_40px] gap-3.5 border-b border-trait bg-surface-pleine px-4 py-[11px] text-[12px] text-ardoise"><div>Champ</div><div>Variable</div><div>Type</div><div /></div>
            {[["prenom", "Prénom", "Texte"], ["nom", "Nom", "Texte"], ["email", "Email", "Email"], ["ville", "Ville", "Texte"], ["entreprise", "Société", "Texte"]].map(([k, mot, t]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_90px_40px] items-center gap-3.5 border-b border-trait px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2 text-encre">{mot}<span className="rounded-full border border-bord-doux px-1.5 text-[11px] text-ardoise">Système</span></div>
                <div className="font-mono text-[12px] text-menthe-texte">{`{{${k}}}`}</div><div className="text-craie">{t}</div><div />
              </div>
            ))}
            {(ref?.champs || []).map((c) => (
              <div key={c.id} className="group grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_90px_40px] items-center gap-3.5 border-b border-trait px-4 py-3 text-[13px] last:border-b-0">
                <div className="truncate text-encre">{c.libelle}</div>
                <div className="truncate font-mono text-[12px] text-menthe-texte">{`{{${c.cle}}}`}</div>
                <div className="text-craie">{c.type === "nombre" ? "Nombre" : c.type === "liste" ? "Liste" : "Texte"}</div>
                <button type="button" onClick={() => { if (window.confirm(`Supprimer le champ « ${c.libelle} » ? Les valeurs restent dans les fiches.`)) appel.mutate(["DELETE", `/champs/${c.id}`]); }} aria-label="Supprimer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise opacity-0 hover:text-alerte focus:opacity-100 group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (libelle.trim()) { appel.mutate(["POST", "/champs", { libelle: libelle.trim() }]); setLibelle(""); } }} className="mt-3 flex max-w-[420px] gap-2">
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Nouveau champ : Budget max, Type de bien…" className={`${champ} h-9 text-[13.5px]`} />
            <button type="submit" disabled={!libelle.trim()} className={boutonContour}><Plus className="h-3.5 w-3.5" />Ajouter</button>
          </form>
          <p className="m-0 mt-2 text-[12.5px] text-ardoise">Chaque champ devient une variable des emails. Une valeur de repli se donne à l'insertion : {"{{prenom | \"à vous\"}}"}.</p>
        </div>
      )}

      {fenetre === "import" && <Import onFermer={() => setFenetre(null)} />}
      {fenetre === "ajouter" && <AjoutContact onFermer={() => setFenetre(null)} onAjoute={(c) => { setFenetre(null); raf(); if (c) setFiche(c.id); }} />}
      {segment !== undefined && <EditeurSegment segment={segment} onFermer={() => setSegment(undefined)} />}
      {fiche && <Fiche id={fiche} onFermer={() => setFiche(null)} />}
    </div>
  );
}
