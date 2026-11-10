import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { Fenetre, req } from "@/components/emailing/commun";
import { boutonCrm, champCrm, Chiffres, etiquetteCrm, heure, outilCrm, Page, pct, Pilules, Stade, Statut, Tableau, zoneCrm } from "./briques";

// Les pages du module Emailing écrites pour lui (8 nov. 2026, Jules), au modèle des tableaux du CRM.

const copier = (t) => navigator.clipboard?.writeText(t).then(() => toast("Lien copié.")).catch(() => toast(t));
const CANAL = { gmail: ["Gmail", "bleu"], resend: ["Resend", "lavande"] };
const Canal = ({ c }) => { const [m, x] = CANAL[c] || [c, "gris"]; return <Statut couleur={x}>{m}</Statut>; };
const Panne = () => <p className="m-0 text-[14px] text-ardoise">Impossible de charger cette page. Réessayez dans un instant.</p>;

// --- Tableau de bord ----------------------------------------------------------------------

export function TableauDeBord({ aller }) {
  const { data: t, isLoading } = useQuery({ queryKey: ["em-tableau"], queryFn: () => req("GET", "/m/tableau"), refetchInterval: 60000 });
  if (isLoading || !t) return <Page titre="Tableau de bord">{isLoading ? <Chargement /> : <Panne />}</Page>;
  return (
    <Page titre="Tableau de bord" role="Ce qui demande un geste aujourd'hui, et ce que l'emailing a rapporté sur 30 jours."
      actions={t.a_valider > 0 ? <button type="button" className={boutonCrm} onClick={() => aller("valider")}>{t.a_valider} à valider</button> : null}>
      <Chiffres items={[[t.fiches, "fiches reçues après une séquence"], [t.calls, "calls pris"], [t.reponses_a_traiter, "réponses à traiter"], [pct(t.taux_plaintes), "plaintes, limite Resend 0,08 %"]]} />
      <div className="mt-2.5"><Chiffres items={[[t.stades.sql, "contacts SQL"], [t.stades.mql, "contacts MQL"], [t.stades.lead, "leads"], [t.leads_recents, "nouveaux inscrits"]]} /></div>
      <h2 className="m-0 mb-2 mt-6 text-[15px] font-medium text-encre">Prochains départs</h2>
      <Tableau colonnes={["Automatisation", "Canal", "Mails", "Quand"]} cle={(l) => `${l.nom}-${l.etat}`} lignes={t.prochains} vide="Aucun mail en attente." rendu={(l) => [l.nom, <Canal key="c" c={l.canal} />, l.n, l.etat === "a_valider" ? <Statut key="v" couleur="ambre">À valider</Statut> : heure(l.le)]} />
      <h2 className="m-0 mb-2 mt-6 text-[15px] font-medium text-encre">Automatisations actives</h2>
      <Tableau colonnes={["Nom", "En cours", "Envoyés", "Réponses", "Résultats"]} lignes={t.automatisations} vide="Aucune automatisation active. Elles sont posées en brouillon : relisez-les puis activez-les." rendu={(a) => [a.nom, a.en_cours, a.envoyes, a.reponses, a.resultats]} />
    </Page>
  );
}

// --- À valider ----------------------------------------------------------------------------

export function AValider() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["em-valider"], queryFn: () => req("GET", "/m/a-valider") });
  const [ouvert, setOuvert] = useState(null);
  const [exclus, setExclus] = useState([]);
  const lignes = data?.lignes || [];
  const relire = () => { qc.invalidateQueries({ queryKey: ["em-valider"] }); qc.invalidateQueries({ queryKey: ["em-tableau"] }); qc.invalidateQueries({ queryKey: ["em-compteurs"] }); };
  const retenus = lignes.filter((l) => !exclus.includes(l.id));
  const valider = useMutation({ mutationFn: (ids) => req("POST", "/m/a-valider/valider", { ids }), onSuccess: (r) => { toast(`${r.valides} mail${r.valides > 1 ? "s" : ""} validé${r.valides > 1 ? "s" : ""}.`); setOuvert(null); relire(); }, onError: (e) => toast(e.message) });
  const ecarter = useMutation({ mutationFn: (ids) => req("POST", "/m/a-valider/ecarter", { ids }), onSuccess: () => { setOuvert(null); relire(); } });
  const modifier = useMutation({ mutationFn: ({ id, ...p }) => req("PATCH", `/m/a-valider/${id}`, p), onSuccess: () => relire() });
  return (
    <Page titre="À valider" compte={lignes.length} role="Les mails de prospection préparés. Rien ne part sans vous. Une fois validés, ils partent aux heures d'envoi, un par boîte et par minute."
      actions={<button type="button" className={boutonCrm} disabled={!retenus.length || valider.isPending} onClick={() => valider.mutate(retenus.map((l) => l.id))}>Valider le lot ({retenus.length})</button>}>
      {isLoading ? <Chargement /> : <Tableau colonnes={["", "Agent", "Séquence", "Objet", "Boîte", "Préparé"]} lignes={lignes} onLigne={setOuvert} vide="Rien à valider."
        rendu={(l) => [
          <input key="c" type="checkbox" aria-label="Garder dans le lot" checked={!exclus.includes(l.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setExclus(e.target.checked ? exclus.filter((x) => x !== l.id) : [...exclus, l.id])} />,
          l.contact ? ([l.contact.prenom, l.contact.nom].filter(Boolean).join(" ") || l.contact.entreprise || l.email) : l.email, l.automatisation, l.objet, l.boite || <Statut key="b" couleur="corail">Aucune boîte</Statut>, heure(l.cree_le),
        ]} />}
      {ouvert && (
        <Fenetre titre={`À ${ouvert.email}`} onFermer={() => setOuvert(null)} large pied={<>
          <button type="button" className={outilCrm} onClick={() => ecarter.mutate([ouvert.id])}>Écarter, sortir de la séquence</button>
          <button type="button" className={boutonCrm} onClick={() => valider.mutate([ouvert.id])}>Valider ce mail</button>
        </>}>
          <label className="block"><span className={etiquetteCrm}>Objet</span><input className={champCrm} defaultValue={ouvert.objet} onBlur={(e) => modifier.mutate({ id: ouvert.id, objet: e.target.value })} /></label>
          <label className="mt-3 block"><span className={etiquetteCrm}>Texte</span><textarea rows={14} className={zoneCrm} defaultValue={ouvert.texte} onBlur={(e) => modifier.mutate({ id: ouvert.id, texte: e.target.value })} /></label>
        </Fenetre>
      )}
    </Page>
  );
}

// --- Contacts et scores -------------------------------------------------------------------

const ETAT_MAIL = { envoye: ["Envoyé", "menthe"], redirige: ["Local", "gris"], simule: ["Simulé", "gris"], a_valider: ["À valider", "ambre"], a_partir: ["À partir", "bleu"], erreur: ["Erreur", "corail"], annule: ["Annulé", "gris"] };

function FicheContact({ id, onFermer }) {
  const { data: f } = useQuery({ queryKey: ["em-fiche", id], queryFn: () => req("GET", `/m/contacts/${id}`) });
  const c = f?.contact;
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-[460px] max-w-full overflow-y-auto border-l border-trait bg-rail p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="m-0 text-[16px] text-encre">{c ? ([c.prenom, c.nom].filter(Boolean).join(" ") || c.email) : ""}</p><p className="m-0 break-all text-[13px] text-ardoise">{c?.email}</p></div>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      {!f ? <Chargement /> : <>
        {f.opposition && <p className="m-0 mt-3 text-[13px] text-alerte">Ne plus écrire depuis le {heure(f.opposition.le)}.</p>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-[10px] border border-trait px-3 py-2"><div className="text-[18px] text-encre">{c.score_mql || 0}</div><div className="text-[12.5px] text-ardoise">MQL</div></div>
          <div className="rounded-[10px] border border-trait px-3 py-2"><div className="text-[18px] text-encre">{c.score_sql || 0}</div><div className="text-[12.5px] text-ardoise">SQL</div></div>
          <div className="rounded-[10px] border border-trait px-3 py-2"><div className="mt-1"><Stade stade={c.stade} /></div><div className="mt-1 text-[12.5px] text-ardoise">Stade</div></div>
        </div>
        {[["mql", "Ce qui fait son MQL"], ["sql", "Ce qui fait son SQL"]].map(([k, t]) => (c.score_raisons?.[k]?.length ? <div key={k} className="mt-4"><p className="m-0 mb-1 text-[12.5px] text-ardoise">{t}</p>{c.score_raisons[k].map((r) => <div key={r.libelle} className="flex justify-between border-b border-trait py-1 text-[13.5px] text-craie"><span>{r.libelle}{r.fois > 1 ? ` (${r.fois} fois)` : ""}</span><span>{r.points > 0 ? "+" : ""}{r.points}</span></div>)}</div> : null))}
        {c.consentement && <p className="m-0 mt-4 text-[12.5px] text-ardoise">Consentement du {heure(c.consentement.le)} : « {c.consentement.texte} »</p>}
        <p className="m-0 mb-1 mt-4 text-[12.5px] text-ardoise">Parcours</p>
        {f.parcours.length ? f.parcours.map((p) => <div key={p.id} className="flex justify-between gap-2 border-b border-trait py-1 text-[13.5px] text-craie"><span className="min-w-0 truncate">{p.nom}</span><span className="flex-none text-ardoise">{p.statut === "en_cours" || p.statut === "attente_envoi" ? "En cours" : p.raison || "Terminé"}</span></div>) : <p className="m-0 text-[13.5px] text-brume">Aucun.</p>}
        <p className="m-0 mb-1 mt-4 text-[12.5px] text-ardoise">Mails</p>
        {f.mails.length ? f.mails.map((m) => { const [mot, col] = ETAT_MAIL[m.etat] || [m.etat, "gris"]; return <div key={m.id} className="flex items-center justify-between gap-2 border-b border-trait py-1 text-[13.5px] text-craie"><span className="min-w-0 truncate">{m.objet}</span><Statut couleur={col}>{m.repondu_le ? "Répondu" : m.clique_le ? "Cliqué" : m.ouvert_le ? "Ouvert" : mot}</Statut></div>; }) : <p className="m-0 text-[13.5px] text-brume">Aucun par le module.</p>}
        <p className="m-0 mb-1 mt-4 text-[12.5px] text-ardoise">Journal</p>
        {f.faits.slice(0, 40).map((e) => <div key={e.id} className="flex justify-between gap-2 py-0.5 text-[13px] text-craie"><span>{e.type.replaceAll("_", " ")}</span><span className="flex-none text-ardoise">{heure(e.le)}</span></div>)}
      </>}
    </aside>
  );
}

export function ContactsScores() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [stade, setStade] = useState("");
  const [q, setQ] = useState(params.get("q") || "");
  const [choisis, setChoisis] = useState([]);
  const [auto, setAuto] = useState("");
  const fiche = params.get("c");
  const ouvrir = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("c", id); else n.delete("c"); return n; });
  const { data, isLoading } = useQuery({ queryKey: ["em-contacts", stade, q], queryFn: () => req("GET", `/m/contacts?stade=${stade}&q=${encodeURIComponent(q)}`) });
  const { data: autos } = useQuery({ queryKey: ["em-autos", null], queryFn: () => req("GET", "/m/automatisations") });
  const inscrire = useMutation({ mutationFn: () => req("POST", `/m/automatisations/${auto}/inscrire`, { ids: choisis }), onSuccess: (r) => { toast(`${r.inscrits} inscrit${r.inscrits > 1 ? "s" : ""}${r.ignores ? `, ${r.ignores} ignoré${r.ignores > 1 ? "s" : ""}` : ""}.`); setChoisis([]); qc.invalidateQueries({ queryKey: ["em-contacts"] }); }, onError: (e) => toast(e.message) });
  const r = data?.repartition || { lead: 0, mql: 0, sql: 0 };
  const actives = (autos?.automatisations || []).filter((a) => a.statut === "active");
  return (
    <Page titre="Contacts" compte={r.lead + r.mql + r.sql} role="Triés par score. MQL : l'intérêt montré. SQL : prêt à parler affaires.">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Pilules valeur={stade} onChange={setStade} options={[["", "Tout"], ["sql", `SQL ${r.sql}`], ["mql", `MQL ${r.mql}`], ["lead", `Lead ${r.lead}`]]} />
        <input aria-label="Rechercher" placeholder="Rechercher" className={`${champCrm} max-w-[260px]`} value={q} onChange={(e) => setQ(e.target.value)} />
        {choisis.length > 0 && <span className="flex items-center gap-2 text-[13.5px] text-craie">{choisis.length} sélectionné{choisis.length > 1 ? "s" : ""}
          <select aria-label="Automatisation" className={`${champCrm} w-[230px]`} value={auto} onChange={(e) => setAuto(e.target.value)}><option value="">Inscrire à…</option>{actives.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}</select>
          <button type="button" className={boutonCrm} disabled={!auto} onClick={() => inscrire.mutate()}>Inscrire</button></span>}
      </div>
      {isLoading ? <Chargement /> : <Tableau colonnes={["", "Contact", "Type", "Source", "MQL", "SQL", "Stade", "Statut"]} lignes={data?.contacts || []} onLigne={(c) => ouvrir(c.id)} vide="Aucun contact."
        rendu={(c) => [
          <input key="c" type="checkbox" aria-label="Sélectionner" checked={choisis.includes(c.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setChoisis(e.target.checked ? [...choisis, c.id] : choisis.filter((x) => x !== c.id))} />,
          <span key="n"><span className="block">{[c.prenom, c.nom].filter(Boolean).join(" ") || c.entreprise || c.email}</span><span className="block text-[12.5px] text-ardoise">{c.email}</span></span>,
          (c.tags || []).includes("Agent immobilier") ? "Agent" : c.type, String(c.source || "").replace(/^formulaire:/, "Formulaire · ").replace(/^webinaire:.*/, "Webinaire").replace(/^crm:/, "CRM · ").replace("mode_appel", "Mode appel"), c.score_mql, c.score_sql, <Stade key="s" stade={c.stade} />, c.statut === "abonne" ? <Statut key="a" couleur="menthe">Actif</Statut> : <Statut key="a" couleur="corail">Opposé</Statut>,
        ]} />}
      {fiche && <FicheContact id={fiche} onFermer={() => ouvrir(null)} />}
    </Page>
  );
}

// --- Le barème ----------------------------------------------------------------------------

export function Scores() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["em-bareme"], queryFn: () => req("GET", "/m/bareme") });
  const [b, setB] = useState(null);
  useEffect(() => { if (data && !b) setB(data.bareme); }, [data, b]);
  const sauver = useMutation({ mutationFn: () => req("PUT", "/m/bareme", b), onSuccess: (r) => { toast(`Barème enregistré, ${r.recalcules} contacts recalculés.`); qc.invalidateQueries({ queryKey: ["em-contacts"] }); }, onError: (e) => toast(e.message) });
  if (!b) return <Page titre="Scores MQL et SQL"><Chargement /></Page>;
  const nombre = (cle, mot) => <label key={cle}><span className={etiquetteCrm}>{mot}</span><input type="number" className={champCrm} value={b[cle]} onChange={(e) => setB({ ...b, [cle]: Number(e.target.value) })} /></label>;
  const regles = (k, titre) => (
    <div className="mt-6">
      <h2 className="m-0 mb-2 text-[15px] font-medium text-encre">{titre}</h2>
      <Tableau colonnes={["Ce que fait le contact", "Points", "Plafond"]} cle={(r) => r.evenement} lignes={b[k]} rendu={(r) => [
        r.libelle,
        <input key="p" type="number" aria-label="Points" className={`${champCrm} w-20`} value={r.points} onChange={(e) => setB({ ...b, [k]: b[k].map((x) => (x.evenement === r.evenement ? { ...x, points: Number(e.target.value) } : x)) })} />,
        <input key="m" type="number" aria-label="Plafond" className={`${champCrm} w-20`} value={r.plafond} onChange={(e) => setB({ ...b, [k]: b[k].map((x) => (x.evenement === r.evenement ? { ...x, plafond: Number(e.target.value) } : x)) })} />,
      ]} />
    </div>
  );
  return (
    <Page titre="Scores MQL et SQL" role="MQL : la personne s'intéresse. SQL : elle est prête à parler affaires. Les points perdent la moitié de leur valeur à chaque demi-vie. Passer SQL prévient la personne qui suit le contact."
      actions={<><button type="button" className={outilCrm} onClick={() => setB(data.defaut)}>Revenir au barème d'origine</button><button type="button" className={boutonCrm} disabled={sauver.isPending} onClick={() => sauver.mutate()}>Enregistrer et recalculer</button></>}>
      <div className="grid max-w-[720px] grid-cols-4 gap-3 max-md:grid-cols-2">
        {nombre("seuil_mql", "Seuil MQL")}{nombre("seuil_sql", "Seuil SQL")}{nombre("demi_vie_mql", "Demi-vie MQL (jours)")}{nombre("demi_vie_sql", "Demi-vie SQL (jours)")}
      </div>
      {regles("mql", "Points MQL")}{regles("sql", "Points SQL")}
      <div className="mt-6">
        <h2 className="m-0 mb-2 text-[15px] font-medium text-encre">Profil, ajouté au SQL</h2>
        <Tableau colonnes={["Champ renseigné", "Points"]} cle={(r) => r.champ} lignes={b.profil} rendu={(r) => [r.libelle, <input key="p" type="number" aria-label="Points" className={`${champCrm} w-20`} value={r.points} onChange={(e) => setB({ ...b, profil: b.profil.map((x) => (x.champ === r.champ ? { ...x, points: Number(e.target.value) } : x)) })} />]} />
      </div>
    </Page>
  );
}

// --- Formulaires --------------------------------------------------------------------------

export function Formulaires() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["em-formulaires"], queryFn: () => req("GET", "/m/formulaires") });
  const [f, setF] = useState(null);
  const relire = () => qc.invalidateQueries({ queryKey: ["em-formulaires"] });
  const creer = useMutation({ mutationFn: (nom) => req("POST", "/m/formulaires", { nom }), onSuccess: (r) => { relire(); setF(r.formulaire); }, onError: (e) => toast(e.message) });
  const modifier = useMutation({ mutationFn: ({ id, ...p }) => req("PATCH", `/m/formulaires/${id}`, p), onSuccess: () => relire() });
  const retirer = useMutation({ mutationFn: (id) => req("DELETE", `/m/formulaires/${id}`), onSuccess: () => { relire(); setF(null); }, onError: (e) => toast(e.message) });
  const [nom, setNom] = useState("");
  const champ = (k, mot, zone = false) => (zone
    ? <label key={k} className="block"><span className={etiquetteCrm}>{mot}</span><textarea rows={3} className={zoneCrm} defaultValue={f[k] || ""} onBlur={(e) => modifier.mutate({ id: f.id, [k]: e.target.value })} /></label>
    : <label key={k} className="block"><span className={etiquetteCrm}>{mot}</span><input className={champCrm} defaultValue={f[k] || ""} onBlur={(e) => modifier.mutate({ id: f.id, [k]: e.target.value })} /></label>);
  return (
    <Page titre="Formulaires et lead magnets" compte={(data?.formulaires || []).length} role="Ce qui fait entrer un contact. La case de consentement est obligatoire, son texte et sa date sont gardés."
      actions={<span className="flex gap-2"><input aria-label="Nom du formulaire" placeholder="Nom" className={`${champCrm} w-[200px]`} value={nom} onChange={(e) => setNom(e.target.value)} /><button type="button" className={boutonCrm} disabled={!nom.trim()} onClick={() => { creer.mutate(nom); setNom(""); }}><Plus className="h-4 w-4" />Nouveau</button></span>}>
      {isLoading ? <Chargement /> : <Tableau colonnes={["Formulaire", "Mène à", "Pris", "État", ""]} lignes={data.formulaires} onLigne={setF} rendu={(x) => [x.nom, x.page || (x.webinaire_id ? "Webinaire" : "Message de confirmation"), x.pris || 0, x.actif ? <Statut key="a" couleur="menthe">Ouvert</Statut> : <Statut key="a" couleur="gris">Fermé</Statut>, <button key="c" type="button" className={outilCrm} onClick={(e) => { e.stopPropagation(); copier(x.lien); }}>Copier le lien</button>]} />}
      {f && (
        <Fenetre titre={f.nom} onFermer={() => setF(null)} pied={<>
          <button type="button" className={outilCrm} onClick={() => retirer.mutate(f.id)}>Supprimer</button>
          <button type="button" className={outilCrm} onClick={() => { modifier.mutate({ id: f.id, actif: !f.actif }); setF({ ...f, actif: !f.actif }); }}>{f.actif ? "Fermer le formulaire" : "Rouvrir le formulaire"}</button>
        </>}>
          <div className="grid gap-3">{champ("titre", "Titre")}{champ("sous_titre", "Sous-titre")}{champ("bouton", "Bouton")}{!f.webinaire_id && champ("page", "Page ouverte ensuite (exemple : /SimulateurPublic)")}{champ("consentement", "Texte du consentement", true)}</div>
        </Fenetre>
      )}
    </Page>
  );
}

// --- Webinaires ---------------------------------------------------------------------------

export function Webinaires() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["em-webinaires"], queryFn: () => req("GET", "/m/webinaires") });
  const [nouveau, setNouveau] = useState(null);
  const [w, setW] = useState(null);
  const [texte, setTexte] = useState("");
  const relire = () => qc.invalidateQueries({ queryKey: ["em-webinaires"] });
  const creer = useMutation({ mutationFn: () => req("POST", "/m/webinaires", nouveau), onSuccess: () => { relire(); setNouveau(null); }, onError: (e) => toast(e.message) });
  const importer = useMutation({ mutationFn: (quoi) => req("POST", `/m/webinaires/${w.id}/${quoi}`, { texte }), onSuccess: (r) => { toast(r.importes != null ? `${r.importes} inscrits ajoutés.` : `${r.presents} présents, ${r.absents} absents.`); setTexte(""); relire(); }, onError: (e) => toast(e.message) });
  const modifier = useMutation({ mutationFn: (p) => req("PATCH", `/m/webinaires/${w.id}`, p), onSuccess: () => relire() });
  return (
    <Page titre="Webinaires" compte={(data?.webinaires || []).length} role="Chaque webinaire a son formulaire et sa liste. Coller les présents sépare présents et absents dans l'automatisation."
      actions={<button type="button" className={boutonCrm} onClick={() => setNouveau({ nom: "", date: "", lien: "" })}><Plus className="h-4 w-4" />Nouveau webinaire</button>}>
      {isLoading ? <Chargement /> : <Tableau colonnes={["Webinaire", "Date", "Inscrits", "Présents", "Absents", ""]} lignes={data.webinaires} onLigne={setW} rendu={(x) => [x.nom, heure(x.date), x.inscrits, x.presents ?? "", x.absents ?? "", x.lien_formulaire ? <button key="c" type="button" className={outilCrm} onClick={(e) => { e.stopPropagation(); copier(x.lien_formulaire); }}>Copier le lien</button> : ""]} />}
      {nouveau && (
        <Fenetre titre="Nouveau webinaire" onFermer={() => setNouveau(null)} pied={<button type="button" className={boutonCrm} onClick={() => creer.mutate()}>Créer</button>}>
          <div className="grid gap-3">
            <label className="block"><span className={etiquetteCrm}>Nom</span><input className={champCrm} value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} /></label>
            <label className="block"><span className={etiquetteCrm}>Date et heure</span><input type="datetime-local" className={champCrm} value={nouveau.date} onChange={(e) => setNouveau({ ...nouveau, date: e.target.value })} /></label>
            <label className="block"><span className={etiquetteCrm}>Lien de connexion</span><input className={champCrm} value={nouveau.lien} onChange={(e) => setNouveau({ ...nouveau, lien: e.target.value })} /></label>
          </div>
        </Fenetre>
      )}
      {w && (
        <Fenetre titre={w.nom} onFermer={() => setW(null)} pied={<>
          <button type="button" className={outilCrm} disabled={!texte.trim()} onClick={() => importer.mutate("inscrits")}>Ajouter comme inscrits</button>
          <button type="button" className={boutonCrm} disabled={!texte.trim()} onClick={() => importer.mutate("presence")}>Noter les présents</button>
        </>}>
          <div className="grid gap-3">
            <label className="block"><span className={etiquetteCrm}>Lien de connexion</span><input className={champCrm} defaultValue={w.lien} onBlur={(e) => modifier.mutate({ lien: e.target.value })} /></label>
            <label className="block"><span className={etiquetteCrm}>Lien du replay</span><input className={champCrm} defaultValue={w.replay} onBlur={(e) => modifier.mutate({ replay: e.target.value })} /></label>
            <label className="block"><span className={etiquetteCrm}>Adresses collées depuis l'outil de webinaire</span><textarea rows={8} className={zoneCrm} value={texte} onChange={(e) => setTexte(e.target.value)} /></label>
          </div>
        </Fenetre>
      )}
    </Page>
  );
}

// --- Réponses -----------------------------------------------------------------------------

const LECTURES = { veut_call: ["Veut un call", "menthe"], a_un_bien: ["A un bien", "menthe"], ne_plus_ecrire: ["Ne plus écrire", "corail"], pas_interesse: ["Pas intéressé", "ambre"], autre: ["À lire", "gris"] };

export function Reponses() {
  const qc = useQueryClient();
  const [statut, setStatut] = useState("a_traiter");
  const [r, setR] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["em-reponses", statut], queryFn: () => req("GET", `/m/reponses?statut=${statut}`) });
  const relire = () => { qc.invalidateQueries({ queryKey: ["em-reponses"] }); qc.invalidateQueries({ queryKey: ["em-compteurs"] }); setR(null); };
  const traiter = useMutation({ mutationFn: (id) => req("POST", `/m/reponses/${id}/traiter`), onSuccess: relire });
  const stop = useMutation({ mutationFn: (id) => req("POST", `/m/reponses/${id}/ne-plus-ecrire`), onSuccess: relire });
  return (
    <Page titre="Réponses" compte={(data?.reponses || []).length} role="Ce que les contacts ont répondu aux mails du module. La lecture est une suggestion : à vous de décider.">
      <div className="mb-3"><Pilules valeur={statut} onChange={setStatut} options={[["a_traiter", "À traiter"], ["toutes", "Toutes"]]} /></div>
      {isLoading ? <Chargement /> : <Tableau colonnes={["De", "En réponse à", "Lecture", "Pour", "Reçu"]} lignes={data.reponses} onLigne={setR} vide="Aucune réponse à traiter." rendu={(x) => { const [m, c] = LECTURES[x.lecture] || LECTURES.autre; return [x.nom, x.en_reponse_a || x.objet, <Statut key="l" couleur={c}>{m}</Statut>, x.pour || "", heure(x.le)]; }} />}
      {r && (
        <Fenetre titre={r.nom} onFermer={() => setR(null)} large pied={<>
          <button type="button" className={outilCrm} onClick={() => stop.mutate(r.id)}>Ne plus écrire à cette adresse</button>
          <button type="button" className={boutonCrm} onClick={() => traiter.mutate(r.id)}>Marquer comme traitée</button>
        </>}>
          <p className="m-0 text-[13.5px] text-ardoise">{r.objet}</p>
          <p className="m-0 mt-3 whitespace-pre-wrap text-[14px] leading-[1.55] text-encre">{r.extrait}</p>
        </Fenetre>
      )}
    </Page>
  );
}

// --- Résultats ----------------------------------------------------------------------------

export function Resultats() {
  const { data, isLoading } = useQuery({ queryKey: ["em-resultats"], queryFn: () => req("GET", "/m/resultats") });
  return (
    <div className="px-10 pt-6 max-md:px-4">
      <h2 className="m-0 mb-2 text-[15px] font-medium text-encre">Automatisations : du mail au résultat</h2>
      {isLoading ? <Chargement /> : <Tableau colonnes={["Nom", "Entrés", "Envoyés", "Ouverts", "Cliqués", "Réponses", "Fiches, calls"]} lignes={data.automatisations} rendu={(a) => [a.nom, a.entres, a.envoyes, a.ouverts, a.cliques, a.reponses, a.resultats]} />}
    </div>
  );
}

// --- Expéditeurs --------------------------------------------------------------------------

const SANTE = { bonne: ["Bonne", "menthe"], a_surveiller: ["À surveiller", "ambre"], critique: ["Critique", "corail"], inconnue: ["Pas encore mesurée", "gris"] };
const Sante = ({ e }) => { const [m, c] = SANTE[e] || SANTE.inconnue; return <Statut couleur={c}>{m}</Statut>; };

export function Expediteurs() {
  const qc = useQueryClient();
  const { data: d, isLoading } = useQuery({ queryKey: ["em-expediteurs"], queryFn: () => req("GET", "/m/expediteurs") });
  const plafond = useMutation({ mutationFn: ({ email, plafond: p }) => req("PUT", `/m/expediteurs/${encodeURIComponent(email)}`, { plafond: p }), onSuccess: () => qc.invalidateQueries({ queryKey: ["em-expediteurs"] }) });
  if (isLoading || !d) return <Page titre="Expéditeurs et domaines">{isLoading ? <Chargement /> : <Panne />}</Page>;
  return (
    <Page titre="Expéditeurs et domaines" role="Les boîtes Gmail servent à la prospection, Resend à la diffusion. Le plafond porte sur 24 heures glissantes.">
      <Tableau colonnes={["Boîte", "Sur 24 h", "Plafond", "En attente", "Santé"]} cle={(b) => b.email} lignes={d.boites} vide="Aucune boîte connectée." rendu={(b) => [b.email, b.aujourdhui, <input key="p" type="number" aria-label="Plafond" className={`${champCrm} w-20`} defaultValue={b.plafond} onBlur={(e) => plafond.mutate({ email: b.email, plafond: Number(e.target.value) })} />, b.en_attente, <Sante key="s" e={b.etat} />]} />
      <h2 className="m-0 mb-2 mt-6 text-[15px] font-medium text-encre">Resend</h2>
      <Tableau colonnes={["Usage", "Expéditeur", "Délivrés sur 30 j", "Rebonds", "Plaintes", "Santé"]} cle={(x) => x.usage} lignes={[{ usage: "Diffusion", ...d.resend }, { usage: "Mails de la plateforme", expediteur: d.plateforme, sansChiffres: true }]}
        rendu={(x) => [x.usage, x.expediteur, x.sansChiffres ? "" : x.delivres, x.sansChiffres ? "" : pct(x.taux_rebonds), x.sansChiffres ? "" : pct(x.taux_plaintes), x.sansChiffres ? "" : <Sante key="s" e={x.etat} />]} />
    </Page>
  );
}

// --- Oppositions --------------------------------------------------------------------------

const MOTIFS = { desinscription: ["Désinscription", "gris"], rebond: ["Adresse invalide", "ambre"], plainte: ["Plainte", "corail"], ne_plus_ecrire: ["Ne plus écrire", "corail"], equipe: ["Par l'équipe", "gris"] };

export function Oppositions() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [levee, setLevee] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["em-oppositions", q], queryFn: () => req("GET", `/m/oppositions?q=${encodeURIComponent(q)}`) });
  const relire = () => qc.invalidateQueries({ queryKey: ["em-oppositions"] });
  const ajouter = useMutation({ mutationFn: () => req("POST", "/m/oppositions", { email }), onSuccess: () => { setEmail(""); relire(); }, onError: (e) => toast(e.message) });
  const lever = useMutation({ mutationFn: (e) => req("DELETE", `/m/oppositions/${encodeURIComponent(e)}`), onSuccess: () => { setLevee(null); relire(); }, onError: (e) => toast(e.message) });
  const lignes = useMemo(() => data?.oppositions || [], [data]);
  return (
    <Page titre="Oppositions" compte={lignes.length} role="Vérifiées juste avant chaque envoi. Une plainte, un rebond ou « ne plus écrire » bloquent tout, même un mail écrit à la main."
      actions={<span className="flex gap-2"><input aria-label="Adresse" placeholder="adresse@exemple.fr" className={`${champCrm} w-[240px]`} value={email} onChange={(e) => setEmail(e.target.value)} /><button type="button" className={boutonCrm} disabled={!email.trim()} onClick={() => ajouter.mutate()}>Ajouter</button></span>}>
      <input aria-label="Rechercher" placeholder="Rechercher" className={`${champCrm} mb-3 max-w-[260px]`} value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? <Chargement /> : <Tableau colonnes={["Adresse", "Motif", "Source", "Le", ""]} cle={(o) => o.email} lignes={lignes} vide="Aucune opposition." rendu={(o) => { const [m, c] = MOTIFS[o.motif] || [o.motif, "gris"]; return [o.email, <Statut key="m" couleur={c}>{m}</Statut>, o.source || "", heure(o.le), <button key="l" type="button" className={outilCrm} onClick={() => setLevee(o)}>Lever</button>]; }} />}
      {levee && <Fenetre titre="Lever cette opposition ?" onFermer={() => setLevee(null)} pied={<button type="button" className={boutonCrm} onClick={() => lever.mutate(levee.email)}>Lever</button>}><p className="m-0 text-[14px] text-craie">{levee.email} pourra de nouveau recevoir nos mails. À faire seulement si cette personne l'a demandé.</p></Fenetre>}
    </Page>
  );
}

// --- Une vue du CRM -----------------------------------------------------------------------

export function ImporterVue({ onFermer }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["em-crm-barre"], queryFn: () => base44.request("GET", "/api/crm/ecran") });
  const objets = useMemo(() => (data?.dossiers || []).filter((d) => !d.ferme).flatMap((d) => (d.objets || []).filter((o) => !o.ferme && o.vues?.length)), [data]);
  const [singulier, setSingulier] = useState("");
  const [vueId, setVueId] = useState("");
  const [nom, setNom] = useState("");
  const objet = objets.find((o) => o.singulier === singulier);
  const vue = objet?.vues.find((v) => v.id === vueId) || objet?.vues[0];
  const importer = useMutation({ mutationFn: () => req("POST", "/m/vue-crm", { singulier, filtres: vue?.filtres || [], nom: nom || `CRM · ${objet.nom} · ${vue?.nom || "Tout"}` }), onSuccess: (r) => { toast(`${r.contacts} contacts dans « ${r.nom} ».`); qc.invalidateQueries({ queryKey: ["em-contacts"] }); qc.invalidateQueries({ queryKey: ["emailing-referentiel"] }); onFermer(); }, onError: (e) => toast(e.message) });
  return (
    <Fenetre titre="Une vue du CRM devient une liste" onFermer={onFermer} pied={<button type="button" className={boutonCrm} disabled={!objet || importer.isPending} onClick={() => importer.mutate()}>{importer.isPending ? "Lecture du CRM…" : "Créer la liste"}</button>}>
      {isLoading ? <Chargement /> : <div className="grid gap-3">
        <label className="block"><span className={etiquetteCrm}>Tableau</span><select className={champCrm} value={singulier} onChange={(e) => { setSingulier(e.target.value); setVueId(""); }}><option value="">Choisir</option>{objets.map((o) => <option key={o.singulier} value={o.singulier}>{o.nom}</option>)}</select></label>
        {objet && <label className="block"><span className={etiquetteCrm}>Vue</span><select className={champCrm} value={vueId || vue?.id || ""} onChange={(e) => setVueId(e.target.value)}>{objet.vues.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}</select></label>}
        <label className="block"><span className={etiquetteCrm}>Nom de la liste (facultatif)</span><input className={champCrm} value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <p className="m-0 text-[12.5px] text-ardoise">Rien n'est écrit dans Twenty. Seules les fiches avec une adresse mail entrent dans la liste, et un désinscrit le reste.</p>
      </div>}
    </Fenetre>
  );
}
