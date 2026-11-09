import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, GitBranch, Mail, Plus, Tag, CheckSquare, LogOut, CalendarClock, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { req, useEnregistrement } from "@/components/emailing/commun";
import { boutonCrm, champCrm, etiquetteCrm, outilCrm, Page, Statut, Tableau, zoneCrm } from "./briques";

// Les automatisations et la prospection agents (8 nov. 2026, Jules) : une liste comme les tableaux du CRM, puis une
// colonne d'étapes avec ses branches, et à droite le réglage de l'étape choisie.

const ETATS = { active: ["Active", "menthe"], pause: ["En pause", "ambre"], brouillon: ["Brouillon", "gris"] };
const Etat = ({ s }) => { const [m, c] = ETATS[s] || ETATS.brouillon; return <Statut couleur={c}>{m}</Statut>; };

const TYPES = {
  mail: ["Mail", Mail], attendre: ["Attendre", Clock], avant_date: ["Se caler sur une date", CalendarClock], condition: ["Condition", GitBranch],
  tache: ["Tâche pour l'équipe", CheckSquare], tag: ["Ajouter un tag", Tag], sortir: ["Sortir", LogOut],
};
const neuve = (type) => ({
  id: `n${Math.random().toString(36).slice(2, 10)}`, type,
  ...(type === "mail" ? { objet: "", texte: "" } : {}), ...(type === "attendre" ? { jours: 3 } : {}), ...(type === "avant_date" ? { champ: "webinaire_date", heures: -24 } : {}),
  ...(type === "condition" ? { regle: { genre: "dernier_clique" }, oui: [], non: [] } : {}), ...(type === "tache" ? { titre: "Rappeler {{prenom}} {{nom}}" } : {}), ...(type === "tag" ? { tag: "" } : {}),
});

/** Pure : applique fn à l'étape id, où qu'elle soit. fn rend l'étape, ou null pour la retirer. */
function changer(etapes, id, fn) {
  return etapes.flatMap((e) => {
    if (e.id === id) { const r = fn(e); return r ? [r] : []; }
    return e.type === "condition" ? [{ ...e, oui: changer(e.oui || [], id, fn), non: changer(e.non || [], id, fn) }] : [e];
  });
}
function trouver(etapes, id) {
  for (const e of etapes) {
    if (e.id === id) return e;
    if (e.type === "condition") { const x = trouver(e.oui || [], id) || trouver(e.non || [], id); if (x) return x; }
  }
  return null;
}

const GENRES = [["dernier_clique", "A cliqué dans le dernier mail"], ["dernier_ouvert", "A ouvert le dernier mail"], ["evenement", "A fait quelque chose depuis son entrée"], ["score", "Son score atteint"], ["stade", "Son stade est au moins"], ["tag", "Il a le tag"], ["champ", "Son champ est rempli"]];
const FAITS = [["simulateur", "A utilisé le simulateur"], ["clic_call", "A cliqué pour un call"], ["webinaire_present", "Était présent au webinaire"], ["reponse", "A répondu"], ["lead_magnet_pris", "A pris un lead magnet"]];

function resume(e) {
  if (e.type === "mail") return e.objet || (e.meme_fil ? "Relance dans le même fil" : "Sans objet");
  if (e.type === "attendre") return `${e.jours} jour${e.jours > 1 ? "s" : ""} d'envoi`;
  if (e.type === "avant_date") return `${Math.abs(e.heures)} h ${e.heures < 0 ? "avant" : "après"} la date du webinaire`;
  if (e.type === "condition") return GENRES.find(([g]) => g === e.regle?.genre)?.[1] || "Condition";
  if (e.type === "tache") return e.titre;
  if (e.type === "tag") return e.tag || "Tag à choisir";
  return "Le contact quitte l'automatisation";
}

function Inserer({ onAjout, nature }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="relative flex h-6 items-center pl-[21px]">
      <span className="absolute bottom-0 left-[20px] top-0 w-px bg-bord-doux" />
      <button type="button" onClick={() => setOuvert(!ouvert)} aria-label="Ajouter une étape" className="relative z-[1] -ml-[9px] grid h-[18px] w-[18px] place-items-center rounded-full border border-bord-doux bg-fond text-ardoise hover:text-encre"><Plus className="h-3 w-3" /></button>
      {ouvert && (
        <div className="absolute left-8 top-5 z-20 w-[220px] rounded-[10px] border border-trait bg-surface-pleine p-1 shadow-xl">
          {Object.entries(TYPES).filter(([t]) => nature !== "prospection" || t !== "avant_date").map(([t, [mot, I]]) => (
            <button key={t} type="button" onClick={() => { onAjout(neuve(t)); setOuvert(false); }} className="flex h-8 w-full items-center gap-2 rounded-[7px] px-2 text-left text-[13.5px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><I className="h-3.5 w-3.5" />{mot}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Colonne({ etapes, setEtapes, choisie, onChoisir, parEtape, nature }) {
  const inserer = (i, n) => { const c = [...etapes]; c.splice(i, 0, n); setEtapes(c); onChoisir(n.id); };
  return (
    <div className="min-w-0">
      <Inserer onAjout={(n) => inserer(0, n)} nature={nature} />
      {etapes.map((e, i) => {
        const [mot, I] = TYPES[e.type] || ["Étape", Mail];
        return (
          <React.Fragment key={e.id}>
            <button type="button" onClick={() => onChoisir(e.id)} className={`flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left ${choisie === e.id ? "border-menthe" : "border-trait hover:border-bord-doux"} bg-crm-tableau`}>
              <I className="h-4 w-4 flex-none text-ardoise" />
              <span className="min-w-0 flex-1"><span className="block text-[12.5px] text-ardoise">{mot}</span><span className="block truncate text-[13.5px] text-encre">{resume(e)}</span></span>
              {parEtape?.[e.id] ? <span className="flex-none text-[12px] text-ardoise">{parEtape[e.id]} ici</span> : null}
            </button>
            {e.type === "condition" && (
              <div className="ml-5 mt-1 grid grid-cols-2 gap-2.5 max-md:grid-cols-1">
                {[["oui", "Oui"], ["non", "Non"]].map(([b, t]) => (
                  <div key={b} className="min-w-0 rounded-[10px] border border-dashed border-trait p-2">
                    <p className="m-0 text-[12.5px] text-ardoise">{t}</p>
                    <Colonne etapes={e[b] || []} setEtapes={(x) => setEtapes(etapes.map((y) => (y.id === e.id ? { ...y, [b]: x } : y)))} choisie={choisie} onChoisir={onChoisir} parEtape={parEtape} nature={nature} />
                  </div>
                ))}
              </div>
            )}
            <Inserer onAjout={(n) => inserer(i + 1, n)} nature={nature} />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ReglageEtape({ e, nature, modeles, onChange, onRetirer }) {
  const set = (p) => onChange({ ...e, ...p });
  const regle = e.regle || {};
  const setR = (p) => set({ regle: { ...regle, ...p } });
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between"><p className="m-0 text-[15px] text-encre">{TYPES[e.type]?.[0]}</p><button type="button" onClick={onRetirer} className={outilCrm}><Trash2 className="h-3.5 w-3.5" />Retirer</button></div>
      {e.type === "mail" && <>
        {!e.meme_fil && <label><span className={etiquetteCrm}>Objet</span><input className={champCrm} value={e.objet || ""} onChange={(x) => set({ objet: x.target.value })} /></label>}
        <label><span className={etiquetteCrm}>Texte</span><textarea rows={11} className={zoneCrm} value={e.texte || ""} onChange={(x) => set({ texte: x.target.value })} /></label>
        <p className="m-0 text-[12.5px] text-ardoise">{"Variables : {{salutation}}, {{prenom}}, {{nom}}, {{entreprise}}, {{ville}}, {{lien_simulateur}}."}{nature === "prospection" ? " {{phrase}} : une phrase tirée de l'appel." : " Une ligne [[Texte|lien]] devient un bouton."}</p>
        {nature === "prospection" ? <>
          <label className="flex items-center gap-2 text-[13.5px] text-craie"><input type="checkbox" checked={!!e.meme_fil} onChange={(x) => set({ meme_fil: x.target.checked })} />Répondre dans le même fil</label>
          <label className="flex items-center gap-2 text-[13.5px] text-craie"><input type="checkbox" checked={!!e.personnaliser} onChange={(x) => set({ personnaliser: x.target.checked })} />Une phrase écrite par Haka à partir de l'appel</label>
        </> : <>
          <label><span className={etiquetteCrm}>Ou utiliser un modèle</span><select className={champCrm} value={e.template_id || ""} onChange={(x) => set({ template_id: x.target.value || null })}><option value="">Aucun, le texte ci-dessus</option>{modeles.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></label>
          <label className="flex items-center gap-2 text-[13.5px] text-craie"><input type="checkbox" checked={!!e.immediat} onChange={(x) => set({ immediat: x.target.checked })} />Envoyer tout de suite, même hors des heures d'envoi</label>
        </>}
      </>}
      {e.type === "attendre" && <label><span className={etiquetteCrm}>Jours d'envoi à attendre</span><input type="number" min="1" className={champCrm} value={e.jours ?? 1} onChange={(x) => set({ jours: Number(x.target.value) })} /></label>}
      {e.type === "avant_date" && <label><span className={etiquetteCrm}>Heures par rapport au webinaire (négatif = avant)</span><input type="number" className={champCrm} value={e.heures ?? 0} onChange={(x) => set({ heures: Number(x.target.value) })} /></label>}
      {e.type === "tache" && <label><span className={etiquetteCrm}>La notification</span><input className={champCrm} value={e.titre || ""} onChange={(x) => set({ titre: x.target.value })} /></label>}
      {e.type === "tag" && <label><span className={etiquetteCrm}>Tag</span><input className={champCrm} value={e.tag || ""} onChange={(x) => set({ tag: x.target.value })} /></label>}
      {e.type === "condition" && <>
        <label><span className={etiquetteCrm}>Si</span><select className={champCrm} value={regle.genre} onChange={(x) => setR({ genre: x.target.value })}>{GENRES.map(([g, m]) => <option key={g} value={g}>{m}</option>)}</select></label>
        {regle.genre === "evenement" && <label><span className={etiquetteCrm}>Quoi</span><select className={champCrm} value={regle.evenement || ""} onChange={(x) => setR({ evenement: x.target.value })}><option value="">Choisir</option>{FAITS.map(([v, m]) => <option key={v} value={v}>{m}</option>)}</select></label>}
        {regle.genre === "score" && <div className="grid grid-cols-2 gap-2"><label><span className={etiquetteCrm}>Score</span><select className={champCrm} value={regle.score || "mql"} onChange={(x) => setR({ score: x.target.value })}><option value="mql">MQL</option><option value="sql">SQL</option></select></label><label><span className={etiquetteCrm}>Au moins</span><input type="number" className={champCrm} value={regle.min ?? 40} onChange={(x) => setR({ min: Number(x.target.value) })} /></label></div>}
        {regle.genre === "stade" && <label><span className={etiquetteCrm}>Stade</span><select className={champCrm} value={regle.stade || "mql"} onChange={(x) => setR({ stade: x.target.value })}><option value="mql">MQL</option><option value="sql">SQL</option></select></label>}
        {regle.genre === "tag" && <label><span className={etiquetteCrm}>Tag</span><input className={champCrm} value={regle.tag || ""} onChange={(x) => setR({ tag: x.target.value })} /></label>}
        {regle.genre === "champ" && <label><span className={etiquetteCrm}>Champ</span><input className={champCrm} value={regle.champ || ""} onChange={(x) => setR({ champ: x.target.value })} placeholder="budget" /></label>}
      </>}
    </div>
  );
}

function Declencheur({ d, catalogue, formulaires, webinaires, onChange, onRetirer }) {
  const def = catalogue.find((c) => c.cle === d.evenement);
  const options = def?.options || (def?.filtre === "formulaire" ? formulaires.map((f) => [f.slug, f.nom]) : def?.filtre === "webinaire_id" ? webinaires.map((w) => [w.id, w.nom]) : null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Déclencheur" className={`${champCrm} max-w-[230px]`} value={d.evenement} onChange={(x) => onChange({ evenement: x.target.value, filtre: {} })}>{catalogue.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}</select>
      {options && <select aria-label="Précision" className={`${champCrm} max-w-[230px]`} value={d.filtre?.[def.filtre] || ""} onChange={(x) => onChange({ ...d, filtre: { [def.filtre]: x.target.value } })}><option value="">Tous</option>{options.map(([v, m]) => <option key={v} value={v}>{m}</option>)}</select>}
      <button type="button" onClick={onRetirer} aria-label="Retirer le déclencheur" className="text-ardoise hover:text-encre" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function Editeur({ id, onFermer }) {
  const qc = useQueryClient();
  const { data: a } = useQuery({ queryKey: ["em-auto", id], queryFn: () => req("GET", `/m/automatisations/${id}`) });
  const { data: cat } = useQuery({ queryKey: ["em-autos", null], queryFn: () => req("GET", "/m/automatisations") });
  const { data: f } = useQuery({ queryKey: ["em-formulaires"], queryFn: () => req("GET", "/m/formulaires") });
  const { data: w } = useQuery({ queryKey: ["em-webinaires"], queryFn: () => req("GET", "/m/webinaires") });
  const { data: t } = useQuery({ queryKey: ["em-tpl"], queryFn: () => req("GET", "/templates") });
  const { data: x } = useQuery({ queryKey: ["em-expediteurs"], queryFn: () => req("GET", "/m/expediteurs") });
  const [b, setB] = useState(null);
  const [choisie, setChoisie] = useState(null);
  useEffect(() => { if (a && !b) setB(a); }, [a, b]);
  // Des changements rapprochés (le nom, puis une étape) partent ensemble : aucun n'écrase l'autre.
  const enAttente = useRef({});
  const sauver = useEnregistrement((p) => { enAttente.current = {}; return req("PATCH", `/m/automatisations/${id}`, p).then(() => qc.invalidateQueries({ queryKey: ["em-auto", id] })); });
  const maj = (p) => { setB((v) => ({ ...v, ...p })); enAttente.current = { ...enAttente.current, ...p }; sauver(enAttente.current); };
  const statut = useMutation({ mutationFn: (s) => req("POST", `/m/automatisations/${id}/statut`, { statut: s }), onSuccess: (r) => { setB((v) => ({ ...v, statut: r.automatisation.statut })); qc.invalidateQueries({ queryKey: ["em-autos"] }); }, onError: (e) => toast(e.message) });
  const retirer = useMutation({ mutationFn: () => req("DELETE", `/m/automatisations/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["em-autos"] }); onFermer(); }, onError: (e) => toast(e.message) });
  const dupliquer = useMutation({ mutationFn: () => req("POST", `/m/automatisations/${id}/dupliquer`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["em-autos"] }); toast("Copie créée en brouillon."); } });
  const modeles = useMemo(() => [...(t?.base || []), ...(t?.enregistres || [])].filter((m) => m.id), [t]);
  if (!b) return <Chargement taille="grand" />;
  const etape = choisie ? trouver(b.etapes, choisie) : null;
  const catalogue = cat?.declencheurs || [];
  const sorties = cat?.sorties || [];
  return (
    <div className="flex min-h-full max-md:flex-col">
      <div className="min-w-0 flex-1 px-10 pb-10 pt-6 max-md:px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={onFermer} aria-label="Retour" className="grid h-8 w-8 place-items-center rounded-[8px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><ArrowLeft className="h-4 w-4" /></button>
          <input aria-label="Nom" value={b.nom} onChange={(e) => maj({ nom: e.target.value })} className="min-w-[200px] flex-1 border-none bg-transparent text-[20px] font-medium text-encre outline-none" />
          <Etat s={b.statut} />
          {b.statut === "active" ? <button type="button" className={outilCrm} onClick={() => statut.mutate("pause")}>Mettre en pause</button> : <button type="button" className={boutonCrm} onClick={() => statut.mutate("active")}>Activer</button>}
          <button type="button" className={outilCrm} onClick={() => dupliquer.mutate()}>Dupliquer</button>
          <button type="button" className={outilCrm} onClick={() => retirer.mutate()}>Supprimer</button>
        </div>
        <p className="m-0 mt-1.5 text-[13.5px] text-ardoise">{b.nature === "prospection" ? "Gmail, texte simple, depuis la boîte de chacun. Chaque mail attend d'être validé." : "Resend, mise en forme. Une fois activée, elle part seule."}</p>
        <div className="mt-5 max-w-[620px]">
          <p className="m-0 mb-1.5 text-[12.5px] text-ardoise">Démarre quand</p>
          <div className="grid gap-2">
            {(b.declencheurs || []).map((d, i) => <Declencheur key={i} d={d} catalogue={catalogue} formulaires={f?.formulaires || []} webinaires={w?.webinaires || []} onChange={(n) => maj({ declencheurs: b.declencheurs.map((y, j) => (j === i ? n : y)) })} onRetirer={() => maj({ declencheurs: b.declencheurs.filter((_, j) => j !== i) })} />)}
            <button type="button" className={`${outilCrm} w-fit`} onClick={() => maj({ declencheurs: [...(b.declencheurs || []), { evenement: catalogue[0]?.cle, filtre: {} }] })}><Plus className="h-3.5 w-3.5" />Ajouter un déclencheur</button>
          </div>
          <div className="mt-3">
            <Colonne etapes={b.etapes || []} setEtapes={(v) => maj({ etapes: v })} choisie={choisie} onChoisir={setChoisie} parEtape={a?.par_etape} nature={b.nature} />
          </div>
          <p className="m-0 mb-1.5 mt-3 text-[12.5px] text-ardoise">Sort à tout moment si</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {sorties.map(([v, m]) => <label key={v} className="flex items-center gap-1.5 text-[13.5px] text-craie"><input type="checkbox" checked={(b.sorties || []).includes(v)} onChange={(e) => maj({ sorties: e.target.checked ? [...(b.sorties || []), v] : b.sorties.filter((s) => s !== v) })} />{m}</label>)}
            <span className="text-[13.5px] text-ardoise">et toujours en cas d'opposition.</span>
          </div>
          {b.nature === "prospection" && (
            <label className="mt-4 block max-w-[340px]"><span className={etiquetteCrm}>Boîte d'envoi</span>
              <select className={champCrm} value={b.expediteur || ""} onChange={(e) => maj({ expediteur: e.target.value })}><option value="">Celle de la personne qui a appelé</option>{(x?.boites || []).map((y) => <option key={y.email} value={y.email}>{y.email}</option>)}</select>
            </label>
          )}
          {a?.manques?.length > 0 && b.statut !== "active" && <p className="m-0 mt-4 text-[13px] text-ambre">Avant d'activer : {a.manques.join(" ")}</p>}
        </div>
      </div>
      {etape && (
        <aside className="w-[460px] flex-none overflow-y-auto border-l border-trait bg-surface-pleine p-5 max-md:w-auto max-md:border-l-0 max-md:border-t">
          <ReglageEtape e={etape} nature={b.nature} modeles={modeles} onChange={(n) => maj({ etapes: changer(b.etapes, n.id, () => n) })} onRetirer={() => { maj({ etapes: changer(b.etapes, etape.id, () => null) }); setChoisie(null); }} />
        </aside>
      )}
    </div>
  );
}

export default function Automatisations({ nature, onDetail }) {
  const qc = useQueryClient();
  const [ouverte, setOuverte] = useState(null);
  const ouvrir = (id) => { setOuverte(id); onDetail?.(!!id); };
  const { data, isLoading } = useQuery({ queryKey: ["em-autos", nature], queryFn: () => req("GET", `/m/automatisations?nature=${nature}`) });
  const creer = useMutation({ mutationFn: () => req("POST", "/m/automatisations", { nature, nom: nature === "prospection" ? "Nouvelle séquence" : "Nouvelle automatisation", etapes: [neuve("mail")] }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["em-autos"] }); ouvrir(r.automatisation.id); } });
  if (ouverte) return <Editeur id={ouverte} onFermer={() => ouvrir(null)} />;
  const prospection = nature === "prospection";
  const liste = data?.automatisations || [];
  return (
    <Page titre={prospection ? "Prospection agents" : "Automatisations"} compte={liste.length} role={prospection ? "Des séquences depuis la boîte de chacun. Elles s'arrêtent à la réponse ou à la fiche reçue." : "Un fait, des attentes, des conditions, des mails. Pour les lead magnets et les webinaires."}
      actions={<button type="button" className={boutonCrm} onClick={() => creer.mutate()}><Plus className="h-4 w-4" />{prospection ? "Nouvelle séquence" : "Nouvelle automatisation"}</button>}>
      {isLoading ? <Chargement /> : <Tableau colonnes={["Nom", "En cours", "Envoyés", "Réponses", prospection ? "Fiches, calls" : "Calls", "À valider", "État"]} lignes={liste} onLigne={(a) => ouvrir(a.id)}
        rendu={(a) => [a.nom, a.chiffres.en_cours, a.chiffres.envoyes, a.chiffres.reponses, a.chiffres.resultats, a.chiffres.a_valider || "", <Etat key="e" s={a.statut} />]} />}
    </Page>
  );
}
