import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Loader2, Plus, Send, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import EditeurEmail from "./EditeurEmail";
import { Fenetre, Interrupteur, Pastille, req, useEnregistrement, useReferentiel, useSansDefilement, useTelephone, bouton, boutonLigne, boutonPlein, champ, pluriel, pourcent } from "./commun";

// Les séquences, dessinées sur la maquette (6 oct. 2026) : à gauche les
// séquences en cartes, à droite celle qu'on regarde. Son nom et son
// interrupteur, le déclencheur (liste, segment, tag ou ajout manuel), puis
// la timeline : pour chaque email, le délai et l'heure d'envoi, et sa carte
// avec ses chiffres ; « Modifier » ouvre l'email dans l'éditeur, en pleine
// page. Tout s'enregistre au fil de la saisie ; rien ne part avant « Active ».

const TYPES = [["liste", "Liste"], ["segment", "Segment"], ["tag", "Tag"], ["manuel", "Ajout manuel"]];
const DELAIS = [0, 1, 2, 3, 5, 7, 10, 14];
const motDelai = (j) => (j === 0 ? "Immédiat" : `${j} jour${j > 1 ? "s" : ""}`);
const nouvelEmail = (delai = 3, theme = "clair") => ({ id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, delai_jours: delai, objet: "Nouvel email", apercu: "", heure: null, design: { theme, blocs: [{ id: `b${Date.now().toString(36)}`, type: "texte", texte: "Bonjour {{prenom | \"à vous\"}},\n\n" }, { id: `s${Date.now().toString(36)}`, type: "signature", texte: "L'équipe Klocka" }] } });
const heureDe = (s, e) => e.heure || `${String(s.heure_envoi ?? 9).padStart(2, "0")}:00`;

function Inscrire({ s, onFermer }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState([]);
  const { data } = useQuery({ queryKey: ["emailing-recherche-inscrire", q], queryFn: () => req("GET", `/contacts/recherche?statut=abonne&par_page=30&q=${encodeURIComponent(q)}`) });
  const inscrire = useMutation({
    mutationFn: () => req("POST", `/sequences/${s.id}/inscrire`, { ids: choisis }),
    onSuccess: (r) => { toast.success(`${pluriel(r.inscrits, "contact inscrit", "contacts inscrits")}`, { description: r.refus?.length ? r.refus.join(" ; ") : undefined }); queryClient.invalidateQueries({ queryKey: ["emailing-sequence", s.id] }); queryClient.invalidateQueries({ queryKey: ["emailing-sequences"] }); onFermer(); },
  });
  return (
    <Fenetre titre={`Inscrire des contacts à « ${s.nom} »`} onFermer={onFermer}
      pied={<><button type="button" className={bouton} onClick={onFermer}>Annuler</button><button type="button" className={boutonPlein} disabled={!choisis.length || inscrire.isPending} onClick={() => inscrire.mutate()}>Inscrire {choisis.length || ""}</button></>}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un contact" className={champ} />
      <p className="m-0 mt-2 text-[12px] text-ardoise">{s.statut === "active" ? "Ils démarrent au premier email." : "Ils démarreront au premier email dès l'activation."}</p>
      <div className="mt-3 flex flex-col">
        {(data?.contacts || []).map((c) => (
          <label key={c.id} className="flex min-w-0 items-center gap-3 border-t border-trait py-2 text-[13.5px] first:border-t-0 max-md:py-3">
            <input type="checkbox" checked={choisis.includes(c.id)} onChange={(e) => setChoisis((l) => (e.target.checked ? [...l, c.id] : l.filter((x) => x !== c.id)))} className="flex-none max-md:h-5 max-md:w-5" />
            <span className="text-encre">{[c.prenom, c.nom].filter(Boolean).join(" ") || c.email}</span><span className="min-w-0 truncate text-ardoise">{c.email}</span>
          </label>
        ))}
      </div>
    </Fenetre>
  );
}

/** Le déclencheur : qui entre dans la séquence. */
function Declencheur({ s, changer, onInscrire }) {
  const { data: ref } = useReferentiel();
  const d = s.declencheur || { type: "manuel" };
  const options = d.type === "liste" ? (ref?.listes || []).map((l) => [l.id, l.nom]) : d.type === "segment" ? (ref?.segments || []).map((x) => [x.id, x.nom]) : d.type === "tag" ? (ref?.tags || []).map((t) => [t.nom, t.nom]) : [];
  return (
    <div className="rounded-[14px] border border-trait bg-surface-pleine px-[18px] py-4">
      <p className="m-0 text-[11.5px] uppercase tracking-[.04em] text-ardoise">Déclencheur</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {TYPES.map(([k, mot]) => (
          <button key={k} type="button" onClick={() => changer({ declencheur: { type: k, ref: k === "manuel" ? null : (k === d.type ? d.ref : null) } })}
            className={`rounded-full border px-[11px] py-[5px] text-[12.5px] transition-colors max-md:py-2 ${d.type === k ? "border-encre bg-encre text-fond" : "border-bord-doux text-craie hover:text-encre"}`}>{mot}</button>
        ))}
      </div>
      {d.type !== "manuel" ? (
        <select value={d.ref || ""} onChange={(e) => changer({ declencheur: { ...d, ref: e.target.value || null } })} className={`${champ} mt-3 h-10 text-[13.5px]`}>
          <option value="">Choisir…</option>
          {options.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
        </select>
      ) : (
        <p className="m-0 mt-3 text-[13px] text-craie">Les contacts sont inscrits depuis leur fiche, par action en masse dans Contacts, ou <button type="button" onClick={onInscrire} className="text-encre underline underline-offset-2" style={{ background: "transparent" }}>ici</button>.</p>
      )}
      <p className="m-0 mt-3 text-[12.5px] text-ardoise">{pluriel(s.inscrits || 0, "contact inscrit", "contacts inscrits")}{s.en_cours ? ` · ${s.en_cours} en cours` : ""}{s.terminees ? ` · ${s.terminees} au bout` : ""}</p>
    </div>
  );
}

/** Le lien entre deux cartes : le délai, puis l'heure d'envoi. */
function Delai({ s, e, changerEtape }) {
  const autres = DELAIS.includes(e.delai_jours) ? DELAIS : [...DELAIS, e.delai_jours].sort((a, b) => a - b);
  return (
    <div className="flex flex-col items-start pl-[22px]">
      <span className="h-4 w-px bg-bord-doux" />
      <div className="-ml-3 flex flex-wrap items-center gap-2 text-[12.5px] text-craie">
        <Clock className="h-3.5 w-3.5 text-ardoise" />
        <select value={e.delai_jours} onChange={(x) => changerEtape({ delai_jours: Number(x.target.value) })}
          className="h-7 rounded-full border border-bord-doux bg-surface px-2.5 text-[12.5px] text-encre outline-none max-md:h-9 max-md:text-[16px]">
          {autres.map((j) => <option key={j} value={j}>{motDelai(j)}</option>)}
        </select>
        <span>puis envoi à</span>
        <input type="time" value={heureDe(s, e)} onChange={(x) => changerEtape({ heure: x.target.value || null })}
          className="h-7 rounded-full border border-bord-doux bg-surface px-2.5 text-[12.5px] text-encre outline-none [color-scheme:dark] max-md:h-9 max-md:text-[16px]" />
        <span className="text-ardoise">heure de Paris</span>
      </div>
      <span className="h-4 w-px bg-bord-doux" />
    </div>
  );
}

/** Un email de la séquence ouvert dans l'éditeur, en pleine page. */
function EmailOuvert({ s, etape, index, onChange, onFermer }) {
  const test = useMutation({ mutationFn: () => req("POST", `/sequences/${s.id}/test`, { etape_id: etape.id }), onSuccess: (r) => toast.success(`Test envoyé à ${r.a}`), onError: (e) => toast.error(e?.message || "Test impossible") });
  return (
    <div className="flex h-[100dvh] min-h-[640px] flex-col max-md:h-auto max-md:min-h-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-trait px-6 py-3.5 max-md:gap-2 max-md:px-4">
        <button type="button" onClick={onFermer} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre max-md:h-9" style={{ background: "transparent" }}><ArrowLeft className="h-3.5 w-3.5" />Retour</button>
        <span className="text-[15px] text-encre">Email {index + 1}</span>
        <span className="ml-auto" />
        <button type="button" onClick={() => test.mutate()} disabled={test.isPending} className={boutonLigne}>{test.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}M'envoyer un test</button>
      </div>
      <div className="min-h-0 flex-1 max-md:flex-none">
        <EditeurEmail email={etape} avecAK onChange={onChange} />
      </div>
    </div>
  );
}

function VueSequence({ id, onEmail, onSupprimee }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["emailing-sequence", id], queryFn: () => req("GET", `/sequences/${id}`) });
  const { data: stats } = useQuery({ queryKey: ["emailing-stats-sequence", id], queryFn: () => req("GET", `/sequences/${id}/stats`) });
  const [s, setS] = useState(null);
  const [sauve, setSauve] = useState("ok");
  const [ak, setAk] = useState(false);
  const [inscrire, setInscrire] = useState(false);
  const telephone = useTelephone();
  useSansDefilement(telephone && ak);
  useEffect(() => { if (data && (!s || s.id !== data.id)) setS(data); }, [data]);
  const enregistrer = useEnregistrement(async (v) => {
    setSauve("en_cours");
    try {
      await req("PATCH", `/sequences/${id}`, { nom: v.nom, declencheur: v.declencheur, heure_envoi: v.heure_envoi, sortie: v.sortie, repondre_a: v.repondre_a, etapes: v.etapes });
      setSauve("ok");
      queryClient.invalidateQueries({ queryKey: ["emailing-sequences"] });
    } catch (e) { setSauve("erreur"); toast.error(e?.message || "Enregistrement impossible"); }
  });
  const changer = (patch) => setS((x) => { const v = { ...x, ...patch }; enregistrer(v); return v; });
  const statut = useMutation({
    mutationFn: (v) => req("POST", `/sequences/${id}/statut`, { statut: v }),
    onSuccess: (r) => { setS((x) => ({ ...x, statut: r.statut })); queryClient.invalidateQueries({ queryKey: ["emailing-sequences"] }); queryClient.invalidateQueries({ queryKey: ["emailing-sequence", id] }); toast.success(r.statut === "active" ? `Séquence active : ${pluriel(r.inscrits, "contact inscrit", "contacts inscrits")}` : "Séquence en pause"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const supprimer = useMutation({ mutationFn: () => req("DELETE", `/sequences/${id}`), onSuccess: () => { toast.success("Séquence supprimée"); onSupprimee(); } });
  // AK a réécrit la séquence : on relit la version du serveur.
  const surReponse = useCallback((r) => {
    if ((r?.actions || []).some((a) => a?.resultat?.sequence_id === id)) {
      queryClient.invalidateQueries({ queryKey: ["emailing-sequence", id] }).then(() => req("GET", `/sequences/${id}`)).then(setS);
    }
  }, [id, queryClient]);
  if (!s) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const statsEtape = Object.fromEntries((stats?.etapes || []).map((e) => [e.id, e]));
  const changerEtape = (eid, patch) => changer({ etapes: s.etapes.map((x) => (x.id === eid ? { ...x, ...patch } : x)) });
  const basculer = (on) => {
    if (on && !window.confirm(s.statut === "pause" ? "Reprendre la séquence ? Les emails en attente repartent au fil des délais." : "Activer la séquence ? Les contacts du déclencheur reçoivent le premier email, puis les suivants au fil des délais.")) return;
    statut.mutate(on ? "active" : "pause");
  };
  return (
    <div className="max-w-[680px] min-w-0">
      <div className="flex items-center justify-between gap-4">
        <input value={s.nom} onChange={(e) => changer({ nom: e.target.value })} aria-label="Nom de la séquence"
          className="min-w-0 flex-1 bg-transparent text-[20px] tracking-[-0.01em] text-encre outline-none" />
        <label className="flex flex-none cursor-pointer items-center gap-2.5 text-[13px] text-craie">
          {s.statut === "active" ? "Active" : s.statut === "pause" ? "En pause" : "Brouillon"}
          <Interrupteur actif={s.statut === "active"} onChange={basculer} libelle="Activer la séquence" />
        </label>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ardoise">
        <span>{sauve === "en_cours" ? "Enregistrement…" : sauve === "erreur" ? "Non enregistré" : "Enregistré"}</span>
        <button type="button" onClick={() => setInscrire(true)} className="inline-flex items-center gap-1 hover:text-encre max-md:h-9" style={{ background: "transparent" }}><UserPlus className="h-3.5 w-3.5" />Inscrire des contacts</button>
        <button type="button" onClick={() => setAk((v) => !v)} className="inline-flex items-center gap-1 hover:text-encre max-md:h-9" style={{ background: "transparent" }}><Sparkles className="h-3.5 w-3.5 text-menthe" />Écrire avec AK</button>
        <button type="button" onClick={() => { if (window.confirm(`Supprimer « ${s.nom} » ? Les emails partis restent partis ; les suivants ne partiront pas.`)) supprimer.mutate(); }} className="inline-flex items-center gap-1 hover:text-alerte max-md:h-9" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
      </div>
      {s.erreur && s.statut === "pause" && <p className="m-0 mt-3 rounded-[10px] bg-alerte/10 px-3 py-2 text-[12.5px] text-alerte">Mise en pause : {s.erreur}</p>}

      <div className="mt-[22px]">
        <Declencheur s={s} changer={changer} onInscrire={() => setInscrire(true)} />
      </div>

      {s.etapes.map((e, i) => {
        const st = statsEtape[e.id];
        return (
          <React.Fragment key={e.id}>
            <Delai s={s} e={e} changerEtape={(p) => changerEtape(e.id, p)} />
            <div className="flex items-center justify-between gap-4 rounded-[14px] border border-trait bg-surface-pleine px-[18px] py-4">
              <div className="min-w-0">
                <p className="m-0 text-[12px] text-ardoise">Email {i + 1}</p>
                <p className={`m-0 mt-1 truncate text-[14.5px] ${e.objet ? "text-encre" : "text-brume"}`}>{e.objet || "Sans objet"}</p>
                <p className="m-0 mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-craie">
                  <span>{(st?.envoyes || 0).toLocaleString("fr-FR")} envoyés</span><span>{pourcent(st?.taux_ouverture)} ouvertures</span><span>{pourcent(st?.taux_clic)} clics</span>
                </p>
              </div>
              <div className="flex flex-none items-center gap-1">
                {s.etapes.length > 1 && (
                  <button type="button" onClick={() => { if (window.confirm(`Retirer l'email ${i + 1} ?`)) changer({ etapes: s.etapes.filter((y) => y.id !== e.id) }); }} aria-label={`Retirer l'email ${i + 1}`} title="Retirer"
                    className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-alerte max-md:h-9 max-md:w-9" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
                )}
                <button type="button" onClick={() => onEmail(s, e.id)} className={`${boutonLigne} text-encre`}>Modifier</button>
              </div>
            </div>
          </React.Fragment>
        );
      })}

      <div className="pl-[22px]"><span className="block h-4 w-px bg-bord-doux" /></div>
      <button type="button" onClick={() => changer({ etapes: [...s.etapes, nouvelEmail(s.etapes.length ? 3 : 0, s.etapes[0]?.design?.theme)] })}
        className="flex w-full items-center gap-[7px] rounded-[12px] border border-dashed border-bord-doux px-4 py-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
        <Plus className="h-3.5 w-3.5" />Ajouter un email
      </button>

      <div className="mt-[22px] flex items-center justify-between gap-4 border-t border-trait pt-[18px]">
        <div>
          <p className="m-0 text-[14px] text-encre">Arrêter la séquence quand le contact répond</p>
          <p className="m-0 mt-1 text-[12.5px] text-ardoise">Réponses lues dans les boîtes Gmail connectées. La désinscription, un bounce ou une plainte l'arrêtent toujours.</p>
        </div>
        <Interrupteur actif={!!s.sortie?.si_reponse} onChange={(v) => changer({ sortie: { si_reponse: v } })} libelle="Arrêter quand le contact répond" />
      </div>
      <label className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-craie">
        Les réponses arrivent sur
        <input value={s.repondre_a || ""} onChange={(e) => changer({ repondre_a: e.target.value })} placeholder="vous@klocka.immo" className={`${champ} h-9 w-[260px] text-[13px] max-md:w-full`} />
      </label>

      {ak && (() => {
        const panneau = (
          <div className="flex h-full w-[400px] max-w-full flex-col border-l border-trait bg-fond max-md:w-full max-md:border-l-0">
            <div className="flex items-center justify-between border-b border-trait px-4 py-2.5 max-md:pt-[calc(10px+env(safe-area-inset-top))]">
              <span className="inline-flex items-center gap-2 text-[13.5px] text-encre"><Sparkles className="h-4 w-4 text-menthe" />AK écrit avec vous</span>
              <button type="button" onClick={() => setAk(false)} aria-label="Replier" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-10 max-md:w-10"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <ChatDashboard espace="sequence" onReponse={surReponse} contexte={{ sequence_id: id }} />
            </div>
          </div>
        );
        // Le chat d'AK s'ouvre sur le côté de l'écran ; au téléphone, en plein écran.
        return createPortal(<div className={`fixed z-[70] flex ${telephone ? "inset-0 bg-fond" : "inset-y-0 right-0 shadow-[-12px_0_30px_rgb(0_0_0/0.35)]"}`}>{panneau}</div>, document.body);
      })()}
      {inscrire && <Inscrire s={s} onFermer={() => setInscrire(false)} />}
    </div>
  );
}

export default function Sequences({ demande = null, onDetail = null }) {
  const queryClient = useQueryClient();
  const [choisie, setChoisie] = useState(null);
  const [email, setEmail] = useState(null); // { sequence, etapeId } ouvert dans l'éditeur
  const { data, isLoading } = useQuery({ queryKey: ["emailing-sequences"], queryFn: () => req("GET", "/sequences") });
  const liste = data?.sequences || [];
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["emailing-sequences"] });
  const creer = useMutation({ mutationFn: () => req("POST", "/sequences", { nom: "Nouvelle séquence", declencheur: { type: "manuel" } }), onSuccess: (s) => { rafraichir(); setChoisie(s.id); } });
  useEffect(() => { if (demande?.quoi === "nouvelle") creer.mutate(); }, [demande?.n]);
  useEffect(() => { if (!choisie && liste.length) setChoisie(liste[0].id); }, [liste.length]);
  useEffect(() => { onDetail?.(!!email); }, [email]);

  // L'email ouvert : son éditeur prend la page ; il s'enregistre dans sa séquence.
  const enregistrerEmail = useEnregistrement(async ({ sid, etapes }) => {
    try {
      await req("PATCH", `/sequences/${sid}`, { etapes });
      queryClient.invalidateQueries({ queryKey: ["emailing-sequence", sid] });
      rafraichir();
    } catch (e) { toast.error(e?.message || "Enregistrement impossible"); }
  });
  if (email) {
    const etape = email.sequence.etapes.find((e) => e.id === email.etapeId);
    const index = email.sequence.etapes.findIndex((e) => e.id === email.etapeId);
    return (
      <EmailOuvert s={email.sequence} etape={etape} index={index}
        // La timeline repart de la version qu'on vient d'écrire, sans attendre l'enregistrement.
        onFermer={() => { queryClient.setQueryData(["emailing-sequence", email.sequence.id], (d) => (d ? { ...d, etapes: email.sequence.etapes } : d)); setEmail(null); }}
        onChange={(v) => setEmail((x) => {
          const etapes = x.sequence.etapes.map((e) => (e.id === x.etapeId ? { ...e, ...v } : e));
          enregistrerEmail({ sid: x.sequence.id, etapes });
          return { ...x, sequence: { ...x.sequence, etapes } };
        })} />
    );
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!liste.length) return <p className="py-14 text-center text-[14px] text-brume">Aucune séquence encore : « Nouvelle séquence », en haut à droite.</p>;
  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] items-start gap-7 px-10 pb-20 pt-7 max-lg:grid-cols-1 max-md:px-4 max-md:pt-5">
      <div className="flex flex-col gap-2 max-lg:flex-row max-lg:overflow-x-auto max-lg:pb-1">
        {liste.map((s) => (
          <button key={s.id} type="button" onClick={() => setChoisie(s.id)}
            className={`flex flex-col gap-2 rounded-[12px] border p-3.5 text-left transition-colors max-lg:min-w-[240px] ${s.id === choisie ? "border-bord-vif bg-relief" : "border-trait bg-surface-pleine hover:border-bord-doux"}`}>
            <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[14px] text-encre">{s.nom}</span><Pastille statut={s.statut === "brouillon" ? "brouillon" : s.statut} /></span>
            <span className="text-[12.5px] text-ardoise">{pluriel(s.etapes?.length || 0, "email")} · {pluriel(s.inscrits || 0, "inscrit")}</span>
          </button>
        ))}
      </div>
      {choisie && <VueSequence key={choisie} id={choisie} onEmail={(sq, etapeId) => setEmail({ sequence: sq, etapeId })} onSupprimee={() => { setChoisie(null); rafraichir(); }} />}
    </div>
  );
}
