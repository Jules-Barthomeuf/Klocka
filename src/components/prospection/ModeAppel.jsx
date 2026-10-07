import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { versWav } from "@/lib/dictee";
import { garder, enAttente, retirer, erreurReseau } from "@/lib/file-hors-ligne";
import SequenceActions from "@/components/prospection/SequenceActions";

// Le mode appel (maquette de Jules, spec du 7 oct. 2026). Un onglet par
// ville, puis une agence à la fois, tenue pour soi tant qu'elle est à
// l'écran : la fiche (badge, ce qu'on sait, le cahier des charges), le
// numéro, le micro. Au raccrochage, cinq issues en deux groupes : les non
// abouties se valident d'un geste ; les abouties ouvrent « Ce qui a été
// compris » et les actions cochées. Une seule validation, puis le reçu relu
// (Monday, le mail retrouvé dans les envoyés) et dix secondes pour annuler.
// Rien ne se perd : un envoi sans réseau attend dans le téléphone, un appel
// resté sans issue est redemandé à la réouverture.

const API = "/api/prospection/mode-appel";
const ESSAI = "essai";
const CLE_EN_COURS = "klocka.mode-appel.en-cours";
const telLien = (t) => `tel:${String(t).replace(/\s/g, "")}`;
const jourLong = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const duree = (debut, maintenant) => {
  const min = Math.max(0, Math.round((maintenant - Date.parse(debut)) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
};
const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;
const etiquette = "m-0 text-[12px] tracking-[.14em] text-ardoise";
const bouton = "rounded-full border border-trait px-4 py-3 text-[15px] text-encre transition-colors hover:bg-relief disabled:opacity-50";
const nouvelleCle = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const lireLocal = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const poserLocal = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } };

// Une conversation d'exemple pour l'appel simulé : AK la lit comme un vrai appel.
const EXEMPLE = "Bonjour, Madame Sophie Essai à l'appareil, je suis la gérante. Pour l'instant je n'ai rien en murs commerciaux, mais j'aurai peut-être un bien dans un mois, une boulangerie louée en centre-ville. Mon adresse c'est sophie@agence-essai.fr. Rappelez-moi jeudi prochain si vous voulez.";
const ISSUES_NON_ABOUTIES = [["pas_de_reponse", "Pas de réponse"], ["repondeur", "Répondeur, message laissé"]];
const CHAMPS_COMPRIS = [["interlocuteur", "Interlocuteur"], ["fonction", "Fonction"], ["telephone", "Téléphone"], ["email", "Email"], ["biens", "Biens évoqués"], ["mandat", "Mandat à venir"], ["prochaine_etape", "Prochaine étape"], ["date", "Date dite"]];
const MODIFIABLES = ["interlocuteur", "telephone", "email"];
const ISSUES_TOUTES = { pas_de_reponse: "Pas de réponse", repondeur: "Répondeur, message laissé", pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien intéressant", pas_interesse: "Pas intéressé" };

/** La transcription : en direct pendant l'appel, puis relue à côté des actions. Jamais gardée sur le serveur. */
function PanneauTranscription({ direct, notes, fin, enDirect = false, replie = false }) {
  const [ouvert, setOuvert] = useState(!replie);
  const textes = direct.filter((x) => x.texte);
  const enCours = direct.some((x) => x.etat === "envoi");
  const rates = direct.filter((x) => x.etat === "echec").length;
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-trait bg-fond p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="m-0 text-[12px] tracking-[.14em] text-ardoise">{enDirect ? "TRANSCRIPTION EN DIRECT" : "TRANSCRIPTION"}</span>
        {replie ? <button type="button" onClick={() => setOuvert((x) => !x)} className="p-0 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{ouvert ? "Replier" : "Afficher"}</button>
          : enCours && <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />}
      </div>
      {ouvert && (
        <div className={`flex flex-col gap-2 overflow-y-auto pr-1 text-[15px] leading-[1.55] text-encre ${replie ? "max-h-[260px]" : "max-h-[420px]"}`}>
          {!textes.length && <p className="m-0 text-[14px] text-brume">{!notes ? "Appel sans notes : rien n'est transcrit." : enDirect ? "La transcription apparaît ici, quelques secondes après chaque phrase." : "Rien n'a été entendu."}</p>}
          {textes.map((x) => <p key={x.i} className="m-0 [text-wrap:pretty]">{x.texte}</p>)}
          {rates > 0 && <p className="m-0 text-[13px] text-ambre">{rates} passage{rates > 1 ? "s" : ""} pas encore transcrit{rates > 1 ? "s" : ""} : nouvel essai au raccrochage.</p>}
          {fin && <span ref={fin} />}
        </div>
      )}
    </div>
  );
}

/** La fiche de l'agence, en pile : deux cartes devinées derrière, comme une file. */
function CarteAgence({ a, recherches, cahier }) {
  return (
    <div className="relative min-w-0 pt-[22px]">
      <div className="absolute left-8 right-8 top-0 h-[60px] rounded-[26px] bg-relief" />
      <div className="absolute left-4 right-4 top-[11px] h-[60px] rounded-[26px] bg-surface" />
      <div className="relative flex flex-col gap-5 rounded-[28px] border border-trait bg-surface-pleine p-7 max-md:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={`rounded-[7px] px-2.5 py-1 text-[13px] ${a.badge === "Jamais contactée" ? "bg-menthe/15 text-menthe" : "bg-ambre/15 text-ambre"}`}>{a.badge || a.statut?.libelle}</span>
          <span className="min-w-0 truncate text-[14px] text-ardoise">{a.lieu}</span>
        </div>
        <p className="m-0 break-words text-[32px] leading-[1.15] tracking-[-0.02em] text-encre [text-wrap:balance] max-md:text-[26px]">{a.nom}</p>
        {a.interlocuteurs?.[0] && <p className="m-0 text-[16px] text-craie">{a.interlocuteurs[0]}</p>}
        {a.reseau && <p className="m-0 rounded-[14px] border border-ambre/40 px-3.5 py-2.5 text-[14px] leading-[1.45] text-ambre">{a.reseau}</p>}
        <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
          {a.raison && <span className="text-[15px] leading-[1.5] text-ambre">{a.raison}</span>}
          {(a.historique?.length ? a.historique : ["Aucun appel"]).map((h) => <span key={h} className="text-[14px] text-ardoise">{h}</span>)}
        </div>
        {cahier?.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
            <span className={etiquette}>CAHIER DES CHARGES</span>
            {cahier.map((q) => <span key={q} className="text-[15px] leading-[1.4] text-encre">{q}</span>)}
          </div>
        )}
        {recherches?.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-trait pt-4">
            <span className={etiquette}>RECHERCHES DE CLIENTS</span>
            {recherches.map((q) => <span key={q} className="text-[15px] leading-[1.4] text-encre">{q}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Le micro : il appelle et prend les notes. */
function IconeMicro({ taille = 34 }) {
  return (
    <svg width={taille * 0.76} height={taille} viewBox="0 0 22 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="6" y="1" width="10" height="16" rx="5" /><path d="M2 13a9 9 0 0 0 18 0" /><line x1="11" y1="22" x2="11" y2="27" />
    </svg>
  );
}

/** Une ligne du reçu : vert vérifié, orange en cours ou à faire, rouge raté. Jamais de coche sans relecture. */
function LigneRecu({ l, lien = null, detail = null, children = null }) {
  const [ouvert, setOuvert] = useState(false);
  if (!l) return null;
  const orange = ["attente", "brouillon", "doute"].includes(l.etat);
  const ton = l.etat === "ok" ? "text-menthe" : orange ? "text-ambre" : l.etat === "echec" ? "text-alerte" : "text-ardoise";
  const contenu = (
    <span className="flex items-start gap-3.5 text-[16px] leading-[1.45]">
      <span className={`flex-none ${ton}`}>{l.etat === "ok" ? "✓" : l.etat === "attente" ? <Loader2 className="mt-1 h-4 w-4 animate-spin" /> : l.etat === "echec" ? <X className="mt-1 h-4 w-4" /> : orange ? "!" : "·"}</span>
      <span className={`min-w-0 break-words ${orange ? "text-ambre" : "text-encre"}`}>{l.texte}{detail && <span className="text-menthe"> · voir le mail</span>}</span>
    </span>
  );
  return (
    <li>
      {lien ? <a href={lien} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 hover:opacity-80">{contenu}<ExternalLink className="h-3.5 w-3.5 flex-none text-brume" /></a>
        : detail ? <button type="button" onClick={() => setOuvert((o) => !o)} className="w-full text-left" style={{ background: "transparent" }}>{contenu}</button> : contenu}
      {ouvert && detail && (
        <div className="mt-2 rounded-[12px] border border-trait bg-fond p-3 text-[13px] leading-[1.55] text-craie">
          <p className="m-0 text-ardoise">À {detail.a || "(sans adresse)"} · {detail.objet}</p>
          <p className="m-0 mt-2 whitespace-pre-line">{detail.corps}</p>
        </div>
      )}
      {children}
    </li>
  );
}

/** « C'est bien cette ligne ? » : les lignes Monday possibles, et la nouvelle. */
function ChoixLigne({ candidates, onChoisir, occupe }) {
  return (
    <div className="ml-7 mt-2 flex flex-col gap-1.5">
      {candidates.map((c) => (
        <button key={c.id} type="button" disabled={occupe} onClick={() => onChoisir(c.id)} className="rounded-[12px] border border-trait px-3 py-2 text-left text-[14px] text-encre hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>
          {c.nom} <span className="text-ardoise">· {[c.entreprise, c.ville, c.telephone].filter(Boolean).join(" · ")}</span>
        </button>
      ))}
      <button type="button" disabled={occupe} onClick={() => onChoisir("nouvelle")} className="rounded-[12px] border border-trait px-3 py-2 text-left text-[14px] text-craie hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>Aucun : nouveau contact</button>
    </div>
  );
}

export default function ModeAppel() {
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState(null);
  const [sessions, setSessions] = useState({}); // onglet → { id, liste_id, ville, essai, debut }
  const [ecran, setEcran] = useState("fiche");
  const [passees, setPassees] = useState(() => new Set());
  const [prise, setPrise] = useState(null); // { agence_id, agent_id }
  const [rappel, setRappel] = useState(null); // l'agence d'un appel entrant, ou d'un appel resté sans issue
  const [secondes, setSecondes] = useState(0);
  const [notes, setNotes] = useState(true);
  const [simule, setSimule] = useState(false);
  const [simulerApres, setSimulerApres] = useState(false);
  const [issue, setIssue] = useState(null);
  const [appel, setAppel] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [mail, setMail] = useState(null);
  const [relanceLe, setRelanceLe] = useState(null);
  const [relance2Le, setRelance2Le] = useState(null);
  const [ligneMonday, setLigneMonday] = useState(null);
  const [note, setNote] = useState("");
  const [edits, setEdits] = useState({});
  const [ouvertFait, setOuvertFait] = useState(null);
  const [cle, setCle] = useState(null);
  const [recu, setRecu] = useState(null);
  const [annulerDans, setAnnulerDans] = useState(0);
  const [passerOuvert, setPasserOuvert] = useState(false);
  const [changerOuvert, setChangerOuvert] = useState(false);
  const [message, setMessage] = useState(null);
  const [voirPourcent, setVoirPourcent] = useState(false);
  const [horloge, setHorloge] = useState(Date.now());
  const [recherche, setRecherche] = useState("");
  const [chercherOuvert, setChercherOuvert] = useState(false);
  const [horsLigne, setHorsLigne] = useState(0);
  const [enCours, setEnCours] = useState(() => lireLocal(CLE_EN_COURS));
  const chrono = useRef(null);
  const rec = useRef(null);
  // La transcription en direct : un morceau toutes les quelques secondes, transcrit à la volée.
  const morceaux = useRef([]); // [{ i, texte: string|null, wav: Blob|null, etat: 'envoi'|'ok'|'echec' }]
  const [direct, setDirect] = useState([]);
  const directFin = useRef(null);
  const compte = useRef(null);
  const messageT = useRef(null);

  const listes = useQuery({ queryKey: ["agent-ia-listes"], queryFn: () => base44.request("GET", "/api/prospection/agent-ia/listes") });
  const villes = (listes.data?.listes || []).filter((l) => l.agences > 0);
  const session = onglet ? sessions[onglet] : null;

  const ouvrir = useMutation({
    mutationFn: (k) => (k === ESSAI ? base44.request("POST", `${API}/essai`) : base44.request("POST", `${API}/sessions`, { body: { liste_id: k } })),
    onSuccess: (r, k) => {
      setSessions((s) => ({ ...s, [k]: { id: r.session.id, liste_id: r.session.liste_id, ville: r.session.ville, essai: !!r.session.essai, debut: r.session.debut } }));
      if (k === ESSAI) queryClient.removeQueries({ queryKey: ["mode-appel-file", r.session.liste_id] });
    },
    onError: (e) => toast.error(e?.message || "Session impossible"),
  });
  const choisir = (k) => {
    arreterTout();
    setOnglet(k); setEcran("fiche"); setPassees(new Set()); setPrise(null); setRappel(null);
    if (!sessions[k] || k === ESSAI) ouvrir.mutate(k);
  };
  useEffect(() => { if (!onglet && villes.length) choisir(villes[0].id); }, [villes.length]);
  useEffect(() => { const t = setInterval(() => setHorloge(Date.now()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => () => { clearInterval(chrono.current); clearInterval(compte.current); clearTimeout(messageT.current); rec.current?.flux?.getTracks().forEach((t) => t.stop()); }, []);

  const file = useQuery({ queryKey: ["mode-appel-file", session?.liste_id], queryFn: () => base44.request("GET", `${API}/file?liste=${session.liste_id}`), enabled: !!session?.liste_id, staleTime: 30_000 });
  const recap = useQuery({ queryKey: ["mode-appel-recap", session?.id], queryFn: () => base44.request("GET", `${API}/sessions/${session.id}`), enabled: !!session?.id, refetchInterval: ecran === "fin" ? 5000 : false });
  const suspens = useQuery({ queryKey: ["mode-appel-suspens"], queryFn: () => base44.request("GET", `${API}/en-suspens`), staleTime: 60_000 });
  const agences = useMemo(() => (file.data?.file || []).filter((x) => !passees.has(x.id)), [file.data, passees]);
  const a = rappel || agences[0] || null;
  const c = file.data?.chiffres;
  const recherches = file.data?.recherches || [];
  const cahier = file.data?.cahier || [];

  const dire = (texte) => { setMessage(texte); clearTimeout(messageT.current); messageT.current = setTimeout(() => setMessage(null), 5000); };
  function arreterTout() {
    clearInterval(chrono.current); clearInterval(compte.current);
    couperMicro(true);
    morceaux.current = []; setDirect([]);
  }
  function couperMicro(jeter = false) {
    const r0 = rec.current;
    if (!r0) return;
    r0.actif = false;
    if (jeter) r0.jeter = true;
    clearTimeout(r0.minuterie);
    if (r0.m?.state === "recording") r0.m.stop(); else r0.flux?.getTracks().forEach((t) => t.stop());
  }
  const suivante = (texte = null) => {
    arreterTout();
    if (a && !rappel) setPassees((s) => new Set(s).add(a.id));
    setRappel(null); setEcran("fiche"); setPrise(null); setIssue(null); setAppel(null); setRecu(null); setEdits({}); setOuvertFait(null);
    setSimule(false); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setCle(null); setPasserOuvert(false);
    if (texte) dire(texte);
    queryClient.invalidateQueries({ queryKey: ["mode-appel-recap", session?.id] });
    queryClient.invalidateQueries({ queryKey: ["agent-ia-liste"] });
  };

  // --- La réservation : l'agence à l'écran est à moi -------------------------
  useEffect(() => {
    if (!a?.id || ecran !== "fiche" || session?.essai || rappel) return undefined;
    let fini = false;
    const tenir = () => base44.request("POST", `${API}/reserver`, { body: { agence_id: a.id } }).catch((e) => {
      if (!fini && /l'a à l'écran/.test(String(e?.message || ""))) { setPassees((s) => new Set(s).add(a.id)); dire(`${a.nom} : ${e.message}`); }
    });
    tenir();
    const t = setInterval(tenir, 120_000);
    return () => { fini = true; clearInterval(t); };
  }, [a?.id, ecran, session?.essai]);

  // --- Les envois gardés hors ligne -------------------------------------------
  const vider = async () => {
    const liste = await enAttente();
    setHorsLigne(liste.length);
    for (const x of liste) {
      try {
        let r;
        if (x.genre === "issue") {
          const f = new FormData();
          for (const [k, v] of Object.entries(x.champs)) if (v != null) f.append(k, v);
          if (x.audio) f.append("audio", x.audio, "appel.wav");
          (x.audios || []).forEach((w, k) => f.append("audio", w, `m${k}.wav`));
          r = await base44.request("POST", `${API}/issue`, { body: f, isForm: true });
        } else r = await base44.request("POST", x.url, { body: x.champs });
        await retirer(x.id);
        if (x.genre === "issue" && !r?.simple) queryClient.invalidateQueries({ queryKey: ["mode-appel-suspens"] });
      } catch (e) {
        if (erreurReseau(e)) break;
        await retirer(x.id);
        toast.error(`Un envoi gardé hors ligne a été refusé : ${e?.message || "erreur"}`);
      }
    }
    setHorsLigne((await enAttente()).length);
    queryClient.invalidateQueries({ queryKey: ["mode-appel-recap", session?.id] });
  };
  useEffect(() => {
    vider();
    const f = () => vider();
    window.addEventListener("online", f);
    const t = setInterval(f, 30_000);
    return () => { window.removeEventListener("online", f); clearInterval(t); };
  }, []);

  // --- L'appel -------------------------------------------------------------
  const prendre = useMutation({
    mutationFn: (agenceId) => base44.request("POST", `${API}/prendre`, { body: { agence_id: agenceId } }),
    onSuccess: (r, agenceId) => setPrise({ agence_id: agenceId, agent_id: r.agent_id }),
    onError: (e) => { if (!erreurReseau(e)) toast.error(e?.message || "Un collègue l'appelle déjà"); },
  });
  const lancerChrono = (depart = 0) => { clearInterval(chrono.current); setSecondes(depart); chrono.current = setInterval(() => setSecondes((s) => s + 1), 1000); };
  const montrer = () => setDirect(morceaux.current.map((x) => ({ i: x.i, texte: x.texte, etat: x.etat })));
  const transcrireMorceau = async (x) => {
    try {
      const f = new FormData();
      f.append("i", String(x.i));
      f.append("audio", x.wav, `m${x.i}.wav`);
      const r = await base44.request("POST", `${API}/morceau`, { body: f, isForm: true });
      x.texte = r.texte || ""; x.etat = "ok"; x.wav = null;
    } catch { x.etat = "echec"; }
    montrer();
  };
  // Enregistre par morceaux de huit secondes, chacun lisible seul, transcrit pendant que l'appel continue.
  const enregistrer = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      setNotes(false); dire("Micro indisponible ou pris par l'appel : appel sans notes, vous taperez l'issue.");
      return;
    }
    const r0 = { flux, actif: true, jeter: false, m: null, minuterie: null };
    rec.current = r0;
    const tour = () => {
      if (!r0.actif) { flux.getTracks().forEach((t) => t.stop()); return; }
      const bouts = [];
      const m = new MediaRecorder(flux);
      r0.m = m;
      m.ondataavailable = (e) => { if (e.data?.size) bouts.push(e.data); };
      m.onstop = async () => {
        const encore = r0.actif;
        if (encore) tour(); else flux.getTracks().forEach((t) => t.stop());
        if (r0.jeter || !bouts.length) return;
        const x = { i: morceaux.current.length, texte: null, wav: null, etat: "envoi" };
        morceaux.current.push(x); montrer();
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; montrer(); return; }
        transcrireMorceau(x);
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, 8000);
    };
    tour();
  };
  // Attend la fin des morceaux en cours (au plus vingt secondes), puis réessaie une fois ceux qui ont raté.
  const morceauxPrets = async () => {
    const t0 = Date.now();
    while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 20000) await new Promise((ok) => setTimeout(ok, 250));
    await Promise.all(morceaux.current.filter((x) => x.etat === "echec" && x.wav).map(transcrireMorceau));
  };
  useEffect(() => { directFin.current?.scrollIntoView({ block: "nearest" }); }, [direct.length, direct.filter((x) => x.texte).length]);
  const retenirEnCours = (x) => { poserLocal(CLE_EN_COURS, x); setEnCours(x); };
  const appeler = (avecNotes) => (e) => {
    if (session?.essai) e.preventDefault();
    if (!prise || prise.agence_id !== a.id) prendre.mutate(a.id);
    setNotes(avecNotes); setSimule(!!session?.essai); setEcran("appel"); lancerChrono();
    if (!session?.essai) retenirEnCours({ agence: { id: a.id, nom: a.nom, telephone: a.telephone, lieu: a.lieu, badge: a.badge, historique: a.historique, interlocuteurs: a.interlocuteurs }, onglet, le: new Date().toISOString() });
    if (avecNotes && !session?.essai) enregistrer();
  };
  // « Sans notes » : l'enregistrement s'arrête, et ce qui avait été transcrit s'efface.
  const sansNotes = () => { couperMicro(true); morceaux.current = []; setDirect([]); setNotes(false); };
  // Au raccrochage : avec la transcription, AK lit l'appel et l'écran d'actions s'ouvre ; sans notes, l'issue se tape.
  const raccrocher = () => {
    clearInterval(chrono.current);
    couperMicro(false);
    if (!notes) { setEcran("issue"); return; }
    setEcran("analyse");
    noter.mutate({ issue: "auto" });
  };
  const rappeler = () => { setEcran("appel"); lancerChrono(secondes); if (notes && !simule) enregistrer(); };
  // L'appel simulé : la conversation d'exemple défile phrase par phrase, comme une vraie transcription.
  const simuler = () => {
    if (!session?.essai) { setSimulerApres(true); choisir(ESSAI); return; }
    if (!a) return;
    prendre.mutate(a.id);
    morceaux.current = []; setDirect([]);
    setNotes(true); setSimule(true); setEcran("appel"); setSecondes(0);
    const phrases = EXEMPLE.split(/(?<=[.?!])\s+/);
    let n = 0;
    clearInterval(chrono.current);
    chrono.current = setInterval(() => {
      setSecondes((s0) => s0 + 4);
      if (n < phrases.length) { morceaux.current.push({ i: n, texte: phrases[n], etat: "ok" }); n += 1; montrer(); }
    }, 900);
  };
  useEffect(() => { if (simulerApres && session?.essai && a && ecran === "fiche") { setSimulerApres(false); simuler(); } });

  // --- Passer, avec sa raison --------------------------------------------------
  const passer = useMutation({
    mutationFn: (raison) => base44.request("POST", `${API}/passer`, { body: { agence_id: a.id, raison } }),
    onSuccess: (_r, raison) => suivante({ fermee: "Marquée fermée · sortie de la ville", pas_pertinente: "Pas pertinente · sortie de la cible", plus_tard: "Passée · elle revient demain" }[raison]),
    onError: (e) => toast.error(e?.message || "Impossible de passer"),
  });

  // --- L'issue -------------------------------------------------------------
  const ouvrirActions = (ap, is) => {
    const props = ap.propositions || [];
    setAppel(ap); setIssue(is); setCle(nouvelleCle());
    setCoches(new Set(props.filter((p) => p.coche !== false).map((p) => p.id)));
    const pm = props.find((p) => p.type === "mail");
    setMail(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele } : null);
    setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setNote(""); setEdits({});
    setEcran("actions");
  };
  const noter = useMutation({
    mutationFn: async ({ issue: is, simple = false, remplace = null }) => {
      const champs = { agence_id: a.id, agent_id: prise?.agence_id === a.id ? prise.agent_id : null, issue: is, session_id: session?.id || null, numero: a.telephone || null, remplace };
      let wavs = [];
      if (is === "auto" || remplace) {
        await morceauxPrets();
        // Le texte de chaque morceau ; ceux restés sans texte partent en audio, à leur place.
        champs.morceaux = JSON.stringify(morceaux.current.map((x) => (x.etat === "ok" ? x.texte || "" : x.wav ? null : "")));
        wavs = morceaux.current.filter((x) => x.etat !== "ok" && x.wav).map((x) => x.wav);
      }
      const f = new FormData();
      for (const [k, v] of Object.entries(champs)) if (v != null) f.append(k, v);
      wavs.forEach((w, k) => f.append("audio", w, `m${k}.wav`));
      try {
        return await base44.request("POST", `${API}/issue`, { body: f, isForm: true });
      } catch (e) {
        // Sans réseau, la transcription et les morceaux restent dans le téléphone.
        if (!erreurReseau(e)) throw e;
        await garder({ id: nouvelleCle(), genre: "issue", champs, audios: wavs });
        setHorsLigne((n) => n + 1);
        return { hors_ligne: true, simple };
      }
    },
    onSuccess: (r, v) => {
      retenirEnCours(null);
      if (r.hors_ligne) return suivante(v.simple ? "Hors ligne : l'issue est gardée et partira au retour du réseau" : "Hors ligne : l'appel et sa transcription sont gardés ; les actions s'ouvriront au retour du réseau");
      if (r.simple) return suivante(`${v.issue === "repondeur" ? "Message laissé" : "Pas de réponse"} · ${r.recu?.relance?.texte?.toLowerCase() || "relance planifiée"}`);
      ouvrirActions(r.appel, r.appel.issue_tapee || v.issue);
    },
    onError: (e) => { toast.error(e?.message || "L'appel n'a pas pu être lu"); setEcran(direct.length ? "appel" : "issue"); },
  });
  // Sans transcription (appel sans notes), l'issue se tape encore.
  const choisirIssue = (is, simple) => {
    setIssue(is);
    if (!simple) setEcran("analyse");
    noter.mutate({ issue: is, simple });
  };
  // AK s'est trompé d'issue : on la change, les actions se refont sur la même transcription.
  const changerIssue = (is) => { setEcran("analyse"); noter.mutate({ issue: is, remplace: appel.id }); };

  // --- Ce qui a été compris ----------------------------------------------------
  const compris = appel?.compris?.champs || {};
  const faits = useMemo(() => CHAMPS_COMPRIS.map(([k, libelle]) => {
    const x = compris[k];
    const valeur = !x ? "" : k === "date" ? `${jourLong(x.valeur)}${x.mots ? ` (« ${x.mots} »)` : ""}` : k === "mandat" && x.date ? `${x.valeur} · ${jourLong(x.date)}` : Array.isArray(x.valeur) ? x.valeur.join(" ; ") : String(x.valeur);
    // Le numéro appelé n'a pas de phrase : il est sûr, on le dit sans lien « d'où ça vient ».
    return { cle: k, libelle: x?.appele ? "Téléphone (numéro appelé)" : libelle, valeur, citation: x?.appele ? null : x?.source || null, incertain: x?.incertain || null };
  }), [appel]);

  // --- Valider, une fois ; le reçu ; annuler dix secondes -----------------------
  const corpsValidation = () => ({
    choix: [...coches], mail: coches.has("mail") ? mail : null, relance_le: relanceLe, relance2_le: relance2Le, monday_ligne: ligneMonday, note: note.trim(), cle,
    session_id: session?.id || null, issue,
    corrections: faits.filter((f) => MODIFIABLES.includes(f.cle) && edits[f.cle] != null && edits[f.cle].trim() !== f.valeur).map((f) => ({ cle: f.cle, libelle: f.libelle, valeur: edits[f.cle].trim() })),
  });
  const valider = useMutation({
    mutationFn: async () => {
      const url = `${API}/appels/${appel.id}/valider`;
      const body = corpsValidation();
      try { return await base44.request("POST", url, { body }); } catch (e) {
        if (!erreurReseau(e)) throw e;
        await garder({ id: body.cle, genre: "valider", url, champs: body });
        setHorsLigne((n) => n + 1);
        return { hors_ligne: true };
      }
    },
    onSuccess: (r) => {
      if (r.hors_ligne) return suivante("Hors ligne : la validation est gardée et partira une seule fois au retour du réseau");
      setRecu(r.recu); setEcran("recu");
      queryClient.invalidateQueries({ queryKey: ["mode-appel-suspens"] });
      const fin = Date.parse(r.recu?.annulable_jusqu || 0);
      clearInterval(compte.current);
      const tic = () => setAnnulerDans(Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
      tic();
      compte.current = setInterval(tic, 250);
    },
    onError: (e) => { toast.error(e?.message || "Validation impossible"); setEcran("actions"); },
  });
  const annuler = useMutation({
    mutationFn: () => base44.request("POST", `${API}/appels/${appel.id}/annuler`),
    onSuccess: (r) => { clearInterval(compte.current); setRecu(null); setCle(nouvelleCle()); setEcran("actions"); dire(`Annulé : ${(r.fait || []).join(", ") || "rien n'était encore fait"}`); },
    onError: (e) => toast.error(e?.message || "Trop tard pour annuler"),
  });
  const recuFrais = useQuery({
    queryKey: ["mode-appel-recu", appel?.id],
    queryFn: () => base44.request("GET", `${API}/appels/${appel.id}/recu`),
    enabled: ecran === "recu" && !!appel?.id,
    refetchInterval: 2500,
  });
  const r = recuFrais.data?.recu || recu;
  const aFaire = r && (r.mail?.etat === "brouillon" || r.monday?.etat === "doute");
  // Le mail part juste après les dix secondes : on attend de savoir s'il est retrouvé dans les envoyés.
  const mailEnRoute = r?.mail?.etat === "attente" && /part dans/.test(r.mail.texte || "");
  // Dix secondes, puis l'agence suivante ; un brouillon à ouvrir ou une ligne à choisir attendent un geste.
  useEffect(() => {
    if (ecran !== "recu" || annulerDans > 0 || !r || aFaire || mailEnRoute || annuler.isPending) return;
    clearInterval(compte.current);
    const ok = [r.monday, r.mail, r.diffusion, r.relance].filter(Boolean);
    suivante(ok.map((x) => x.texte).join(" · "));
  }, [annulerDans, ecran, aFaire, mailEnRoute]);

  const ligne = useMutation({
    mutationFn: ({ id, choix }) => base44.request("POST", `${API}/appels/${id}/ligne-monday`, { body: { ligne_id: choix } }),
    onSuccess: (x) => { if (ecran === "recu") setRecu(x.recu); recap.refetch(); queryClient.invalidateQueries({ queryKey: ["mode-appel-recu"] }); },
    onError: (e) => toast.error(e?.message || "Monday n'a pas répondu"),
  });
  const renvoyer = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/appels/${id}/renvoyer`),
    onSuccess: (x) => { if (x.ok) toast.success("Mail envoyé"); else toast.error(x.error || "Le mail n'est pas parti"); recap.refetch(); },
    onError: (e) => toast.error(e?.message || "Le mail n'est pas parti"),
  });
  const reessayer = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/appels/${id}/reessayer`),
    onSuccess: () => recap.refetch(),
  });
  const ouvrirBrouillon = (id, mailto) => {
    if (mailto) window.location.href = mailto;
    base44.request("POST", `${API}/appels/${id}/brouillon`).then((x) => { if (ecran === "recu") setRecu(x.recu); recap.refetch(); }).catch(() => {});
  };

  // --- L'agent qui rappelle ------------------------------------------------------
  const trouves = useQuery({ queryKey: ["mode-appel-chercher", recherche], queryFn: () => base44.request("GET", `${API}/chercher?q=${encodeURIComponent(recherche)}`), enabled: recherche.trim().length >= 2 });
  const rattacher = (x) => {
    arreterTout();
    setRappel({ id: x.agence_id, nom: x.nom, telephone: x.telephone, lieu: x.ville, badge: "Rappel entrant", historique: [], interlocuteurs: x.qui ? [x.qui] : [] });
    setChercherOuvert(false); setRecherche(""); setNotes(false); setSecondes(0); setEcran("issue");
  };

  // --- Rendu ---------------------------------------------------------------
  const pc = c?.fait_pourcent ?? 0;
  const carteChiffre = "rounded-[18px] border border-trait bg-relief px-[18px] py-4";
  const suspensAppel = suspens.data?.appel && suspens.data.appel.id !== appel?.id ? suspens.data.appel : null;
  const enCoursSansIssue = enCours && ecran === "fiche" && !rappel && Date.now() - Date.parse(enCours.le) < 86400000 ? enCours : null;
  return (
    <div className="mx-auto w-full max-w-[1180px] pb-16">
      {/* Les villes, en onglets de classeur. */}
      <div className="flex items-end gap-1.5 overflow-x-auto pl-3 [scrollbar-width:none]">
        {villes.map((l) => (
          <button key={l.id} type="button" onClick={() => choisir(l.id)}
            className={`flex flex-none items-center gap-2.5 rounded-t-[14px] px-[18px] text-[15px] ${onglet === l.id ? "bg-surface py-3 text-encre" : "bg-relief/60 py-2.5 text-ardoise hover:text-encre"}`}>
            {l.ville} <span className={`text-[13px] ${onglet === l.id ? "text-menthe" : ""}`}>{l.agences_seules ?? l.agences}</span>
          </button>
        ))}
        <button type="button" onClick={() => choisir(ESSAI)}
          className={`flex flex-none items-center gap-2 rounded-t-[14px] border border-b-0 border-dashed border-bord-vif px-[18px] text-[14px] ${onglet === ESSAI ? "bg-surface py-3 text-encre" : "py-2.5 text-ardoise hover:text-encre"}`} style={onglet === ESSAI ? undefined : { background: "transparent" }}>
          Essai
        </button>
      </div>

      <div className="flex flex-col gap-4 rounded-[24px] bg-surface p-5 max-md:p-3">
        {listes.isLoading || ouvrir.isPending || (session && file.isLoading) ? <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div> : null}
        {!listes.isLoading && !villes.length && onglet !== ESSAI && <p className="m-0 py-12 text-center text-[14px] text-brume">Aucune ville encore : lancez l'agent IA sur une ville, ou ouvrez l'onglet Essai.</p>}

        {horsLigne > 0 && <p className="m-0 flex items-center gap-2 rounded-[14px] border border-ambre/40 px-4 py-2.5 text-[14px] text-ambre"><Loader2 className="h-3.5 w-3.5 animate-spin" />{pl(horsLigne, "envoi gardé", "envois gardés")} dans le téléphone : ils partent au retour du réseau.</p>}
        {enCoursSansIssue && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ambre/40 px-4 py-3">
            <span className="text-[15px] text-ambre">Dernier appel sans issue : {enCoursSansIssue.agence.nom}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => { setRappel({ ...enCoursSansIssue.agence }); setNotes(false); setEcran("issue"); }} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Taper l'issue</button>
              <button type="button" onClick={() => retenirEnCours(null)} className="rounded-full border border-trait px-3.5 py-1.5 text-[13px] text-ardoise" style={{ background: "transparent" }}>Ignorer</button>
            </span>
          </div>
        )}
        {suspensAppel && ecran === "fiche" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-ambre/40 px-4 py-3">
            <span className="text-[15px] text-ambre">Actions à valider : {suspensAppel.agence}</span>
            <button type="button" onClick={() => { setRappel({ id: suspensAppel.agence_id, nom: suspensAppel.agence, lieu: "", badge: "À valider", historique: [] }); ouvrirActions(suspensAppel, suspensAppel.issue); }} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Reprendre</button>
          </div>
        )}

        {session && c && (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
              <div className={carteChiffre}>
                <p className="m-0 text-[28px] leading-none text-encre tabular-nums">{recap.data?.appels ?? 0}</p>
                <p className="m-0 mt-1.5 text-[14px] text-ardoise">appels cette session · {duree(session.debut, horloge)}</p>
              </div>
              <button type="button" onClick={() => setVoirPourcent((v) => !v)} className={`${carteChiffre} text-left hover:border-menthe/50`}>
                <p className="m-0 text-[28px] leading-none text-menthe tabular-nums">{voirPourcent ? `${pc} %` : `${c.appelees} / ${c.agences - (c.mortes || 0)}`}</p>
                <p className="m-0 mt-1.5 text-[14px] text-ardoise">agences contactées</p>
                <span className="mt-2.5 block h-[5px] overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full rounded-full bg-menthe" style={{ width: `${pc}%` }} /></span>
              </button>
              <div className={carteChiffre}>
                <p className="m-0 text-[28px] leading-none text-encre tabular-nums">{agences.length}</p>
                <p className="m-0 mt-1.5 text-[14px] text-ardoise">dans ma file</p>
              </div>
              <div className={`${carteChiffre} flex items-start justify-between gap-2`}>
                <button type="button" onClick={() => setChercherOuvert((x) => !x)} className="flex items-center gap-2 p-0 text-left text-[14px] text-craie hover:text-encre" style={{ background: "transparent" }}><Search className="h-4 w-4" />Un agent rappelle ?</button>
                {ecran !== "fin" && <button type="button" onClick={() => { arreterTout(); setEcran("fin"); recap.refetch(); }} className="rounded-full border border-trait px-3.5 py-2 text-[13px] text-encre hover:bg-surface" style={{ background: "transparent" }}>Terminer</button>}
              </div>
            </div>

            {chercherOuvert && (
              <div className="flex flex-col gap-2 rounded-[18px] border border-trait bg-fond p-4">
                <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Son nom, son agence ou son numéro" className="rounded-[12px] border border-trait bg-surface px-3.5 py-3 text-[16px] text-encre outline-none focus:border-menthe" />
                {(trouves.data?.resultats || []).map((x) => (
                  <button key={x.agence_id} type="button" onClick={() => rattacher(x)} className="flex flex-col items-start rounded-[12px] px-3 py-2 text-left hover:bg-relief" style={{ background: "transparent" }}>
                    <span className="text-[15px] text-encre">{x.nom}{x.qui ? ` · ${x.qui}` : ""}</span>
                    <span className="text-[13px] text-ardoise">{[x.ville, x.telephone].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
                {recherche.trim().length >= 2 && trouves.data && !trouves.data.resultats.length && <span className="text-[13px] text-brume">Personne à ce nom ou ce numéro.</span>}
              </div>
            )}

            {session.essai && ecran === "fiche" && <p className="m-0 px-1 text-[13px] text-ardoise"><span className="text-menthe">Essai.</span> Agences fictives : rien n'est écrit dans Monday, aucun mail ne part, rien ne compte dans les statistiques.</p>}
            {message && <p className="m-0 flex items-start gap-2.5 px-1 text-[14px] text-ardoise"><span className="text-menthe">✓</span><span className="min-w-0 break-words">{message}</span></p>}

            {/* La fiche et le panneau d'appel. */}
            {ecran === "fiche" && !a && <p className="m-0 py-12 text-center text-[14px] text-craie">Plus personne à appeler ici pour l'instant. « Terminer » donne le récapitulatif.</p>}
            {ecran === "fiche" && a && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-stretch gap-5">
                <CarteAgence a={a} recherches={recherches} cahier={cahier} />
                <div className="mt-[22px] flex flex-col items-center justify-center gap-4 rounded-[28px] border border-trait bg-fond px-6 py-8">
                  <a href={session.essai ? "#" : telLien(a.telephone)} onClick={appeler(false)} title="Appeler sans enregistrer"
                    className="flex h-16 w-full max-w-[340px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-encre text-[22px] tracking-[0.02em] text-encre tabular-nums hover:bg-encre/[0.06]">
                    {a.telephone}
                  </a>
                  <a href={session.essai ? "#" : telLien(a.telephone)} onClick={appeler(true)} title="Appeler et prendre des notes" aria-label="Appeler et prendre des notes"
                    className="mt-2 grid h-[104px] w-[104px] place-items-center rounded-full bg-menthe text-sur-menthe hover:bg-menthe-survol">
                    <IconeMicro />
                  </a>
                  <span className="text-[13px] text-ardoise">Appeler · le micro prend les notes</span>
                  {!passerOuvert ? (
                    <div className="mt-3 flex items-center gap-2.5">
                      <button type="button" onClick={() => setPasserOuvert(true)} className="rounded-full border border-trait px-[18px] py-2 text-[14px] text-craie hover:bg-surface" style={{ background: "transparent" }}>Passer</button>
                      <button type="button" onClick={simuler} className="rounded-full border border-dashed border-menthe/60 px-4 py-2 text-[13px] text-menthe hover:bg-menthe/10" style={{ background: "transparent" }}>▶ Simuler un appel</button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {Object.entries(file.data?.raisons_passer || { fermee: "Fermée", pas_pertinente: "Pas pertinente", plus_tard: "Plus tard" }).map(([k, l]) => (
                        <button key={k} type="button" disabled={passer.isPending} onClick={() => (rappel ? suivante() : passer.mutate(k))} className="rounded-full border border-trait px-4 py-2 text-[14px] text-encre hover:bg-surface disabled:opacity-50" style={{ background: "transparent" }}>{l}</button>
                      ))}
                      <button type="button" onClick={() => setPasserOuvert(false)} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full text-ardoise hover:bg-surface" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pendant l'appel : le micro qui écoute, la transcription en direct à droite. */}
            {ecran === "appel" && a && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
                <div className="flex flex-col gap-[22px] rounded-[20px] border border-trait bg-fond p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="m-0 break-words text-[22px] text-encre">{a.nom}</p>
                      <p className="m-0 mt-1 text-[14px] text-ardoise">{[a.interlocuteurs?.[0], a.telephone].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  {/* Pas de chronomètre (7 oct. 2026, il stressait) : le micro qui pulse, « Je vous écoute ». */}
                  <div className="flex flex-col items-center gap-3 py-4">
                    {notes ? (
                      <span className="relative grid h-[104px] w-[104px] place-items-center">
                        <span className="absolute inset-0 rounded-full bg-menthe/30 motion-safe:animate-ping" style={{ animationDuration: "1.8s" }} />
                        <span className="relative grid h-[104px] w-[104px] place-items-center rounded-full bg-menthe text-sur-menthe"><IconeMicro /></span>
                      </span>
                    ) : (
                      <span className="grid h-[104px] w-[104px] place-items-center rounded-full border border-trait text-ardoise"><IconeMicro /></span>
                    )}
                    <span className={`text-[16px] ${notes ? "text-encre" : "text-ardoise"}`}>{notes ? "Je vous écoute" : "Je n'écoute pas"}</span>
                  </div>
                  <p className="m-0 border-t border-trait pt-4 text-[14px] leading-[1.5] text-ardoise">
                    {notes ? "À dire en ouverture : « Je prends des notes avec notre assistant, ça vous va ? » Au raccrochage, AK lit l'appel et propose les actions." : "Pas de notes : vous taperez l'issue après l'appel."}
                  </p>
                  <div className="flex gap-2.5">
                    {notes && <button type="button" onClick={sansNotes} className="flex-1 rounded-full border border-trait py-4 text-[15px] text-encre hover:bg-surface" style={{ background: "transparent" }}>Sans notes</button>}
                    <button type="button" onClick={raccrocher} className="flex-[2] rounded-full bg-alerte py-4 text-[16px] text-white hover:opacity-90">Raccrocher</button>
                  </div>
                  {(cahier.length > 0 || a.raison) && (
                    <div className="flex flex-col gap-1.5 border-t border-trait pt-4">
                      {a.raison && <p className="m-0 mb-1 text-[14px] text-ambre">{a.raison}</p>}
                      {cahier.length > 0 && <span className={etiquette}>CAHIER DES CHARGES</span>}
                      {cahier.map((q) => <span key={q} className="text-[14px] text-craie">{q}</span>)}
                    </div>
                  )}
                </div>
                <PanneauTranscription direct={direct} notes={notes} fin={directFin} enDirect />
              </div>
            )}

            {/* Au raccrochage : l'issue, tapée par l'analyste. */}
            {ecran === "issue" && a && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-stretch gap-5">
                <CarteAgence a={a} recherches={[]} cahier={[]} />
                <div className="mt-[22px] flex flex-col gap-3 rounded-[28px] border border-trait bg-fond p-6">
                  <div className="flex items-baseline justify-between"><span className="text-[15px] text-encre">{rappel?.badge === "Rappel entrant" ? "Appel entrant" : "Appel terminé"}</span></div>
                  {notes ? <span className="text-[13px] text-menthe">✓ Notes enregistrées</span> : <span className="text-[13px] text-ardoise">Sans notes : l'issue suffit</span>}
                  {!rappel && <button type="button" onClick={rappeler} className="self-start p-0 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>L'appel a coupé ? Rappeler</button>}
                  <span className={`${etiquette} mt-3`}>PERSONNE AU BOUT DU FIL</span>
                  <div className="grid grid-cols-2 gap-2">
                    {ISSUES_NON_ABOUTIES.map(([k, l]) => <button key={k} type="button" disabled={noter.isPending} onClick={() => choisirIssue(k, true)} className={bouton} style={{ background: "transparent" }}>{l}</button>)}
                  </div>
                  <span className={`${etiquette} mt-3`}>ON S'EST PARLÉ</span>
                  <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("pas_de_murs", false)} className="h-[72px] rounded-full bg-menthe text-[18px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Pas de bien pour l'instant</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("a_des_murs", false)} className="h-14 rounded-full border border-menthe/60 text-[15px] text-menthe hover:bg-menthe/10 disabled:opacity-50" style={{ background: "transparent" }}>A un bien intéressant</button>
                    <button type="button" disabled={noter.isPending} onClick={() => choisirIssue("pas_interesse", false)} className="h-14 rounded-full border border-trait text-[15px] text-encre hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>Pas intéressé</button>
                  </div>
                  {noter.isPending && <p className="m-0 flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Je note…</p>}
                </div>
              </div>
            )}

            {ecran === "analyse" && a && direct.length > 0 && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
                <PanneauTranscription direct={direct} notes fin={directFin} />
                <div className="flex flex-col items-center justify-center gap-3.5 rounded-[20px] border border-trait bg-fond px-5 py-16 text-center">
                  <p className="m-0 text-[20px] text-encre">AK lit l'appel…</p>
                  <p className="m-0 text-[14px] leading-[1.6] text-ardoise">L'issue, l'interlocuteur, l'email, les biens évoqués, la prochaine étape</p>
                  <span className="h-1 w-[200px] overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full w-3/5 animate-pulse rounded-full bg-menthe" /></span>
                </div>
              </div>
            )}
            {ecran === "analyse" && a && !direct.length && (
              <div className="flex flex-col items-center gap-3.5 px-5 py-20 text-center">
                <p className="m-0 text-[22px] text-encre">Lecture de l'appel…</p>
                <p className="m-0 text-[14px] leading-[1.6] text-ardoise">Interlocuteur, téléphone, email, biens évoqués, prochaine étape<br />{a.nom}</p>
                <span className="h-1 w-[200px] overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full w-3/5 animate-pulse rounded-full bg-menthe" /></span>
              </div>
            )}

            {/* Ce qui a été compris, et les actions proposées. */}
            {ecran === "actions" && appel && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
                <div className="flex min-w-0 flex-col gap-4">
                {direct.length > 0 && <PanneauTranscription direct={direct} notes fin={null} replie />}
                <div className="flex min-w-0 flex-col gap-4 rounded-[20px] border border-trait bg-fond p-6">
                  <div className="flex flex-col gap-2">
                    <span className={etiquette}>CE QU'AK A COMPRIS</span>
                    <p className="m-0 text-[15px] text-encre">{appel.issue_deduite ? "Issue : " : "Issue tapée : "}<span className="text-menthe">{ISSUES_TOUTES[issue] || issue}</span>
                      <button type="button" onClick={() => setChangerOuvert((x) => !x)} className="ml-2 p-0 text-[13px] text-ardoise underline hover:text-encre" style={{ background: "transparent" }}>changer</button></p>
                    {changerOuvert && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(ISSUES_TOUTES).filter(([k]) => k !== issue).map(([k, l]) => (
                          <button key={k} type="button" disabled={noter.isPending} onClick={() => { setChangerOuvert(false); changerIssue(k); }} className="h-8 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>{l}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {appel.compris?.avertissement && <p className="m-0 text-[13px] leading-[1.5] text-ambre">{appel.compris.avertissement}</p>}
                  {appel.transcription_echec && <p className="m-0 text-[13px] leading-[1.5] text-ambre">La transcription n'a pas abouti : les actions reposent sur l'issue seule. Ajoutez une note si besoin.</p>}
                  {appel.resume && !appel.sans_details && <p className="m-0 text-[15px] leading-[1.5] text-craie">{appel.resume}</p>}
                  {faits.map((f) => (
                    <div key={f.cle} className="flex flex-col gap-1 border-b border-trait pb-3 last:border-b-0">
                      <div className="flex justify-between gap-2.5 text-[13px]">
                        <span className="text-ardoise">{f.libelle}</span>
                        {f.citation && <button type="button" onClick={() => setOuvertFait((o) => (o === f.cle ? null : f.cle))} className="p-0 text-[13px] text-menthe" style={{ background: "transparent" }}>d'où ça vient</button>}
                      </div>
                      {MODIFIABLES.includes(f.cle) ? (
                        <input value={edits[f.cle] ?? f.valeur} onChange={(e) => setEdits((x) => ({ ...x, [f.cle]: e.target.value }))} placeholder="—"
                          className={`min-w-0 rounded-[6px] border-0 px-1.5 py-0.5 text-[16px] leading-[1.4] outline-none focus:ring-1 focus:ring-menthe ${f.incertain && edits[f.cle] == null ? "bg-ambre/15 text-ambre" : "bg-transparent text-encre"}`} />
                      ) : <span className={`text-[16px] leading-[1.4] ${f.incertain ? "-ml-1.5 self-start rounded-[6px] bg-ambre/15 px-1.5 py-0.5 text-ambre" : f.valeur ? "text-encre" : "text-brume"}`}>{f.valeur || "—"}</span>}
                      {f.incertain && edits[f.cle] == null && <span className="text-[12px] text-ambre">{f.incertain}</span>}
                      {ouvertFait === f.cle && <p className="m-0 mt-1 border-l-2 border-menthe/50 pl-2.5 text-[14px] italic text-craie">« {f.citation} »</p>}
                    </div>
                  ))}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] text-ardoise">Note{appel.sans_details ? " (aucune note prise pendant l'appel)" : ""}</span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Ce qu'il faut retenir, en quelques mots" className="rounded-[12px] border border-trait bg-surface px-3.5 py-3 text-[16px] text-encre outline-none focus:border-menthe" />
                  </label>
                </div>
                </div>
                <div className="min-w-0 max-md:order-first">
                  <SequenceActions appel={appel} agence={a} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
                    relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} ligneMonday={ligneMonday} setLigneMonday={setLigneMonday}
                    onLancer={() => valider.mutate()} envoi={valider.isPending} />
                </div>
              </div>
            )}

            {/* Le reçu : chaque coche est une relecture. Dix secondes pour annuler. */}
            {ecran === "recu" && r && (
              <div className="flex w-full max-w-[620px] flex-col gap-3.5 self-center rounded-[20px] border border-trait bg-fond p-7 max-md:p-5">
                <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
                  <LigneRecu l={r.monday ? { ...r.monday, texte: r.monday.etat === "ok" ? `Monday : ${r.monday.texte}` : r.monday.texte } : null} lien={r.monday?.etat === "ok" ? r.monday.lien : null}>
                    {r.monday?.etat === "doute" && <ChoixLigne candidates={r.monday.candidates || []} occupe={ligne.isPending} onChoisir={(choix) => ligne.mutate({ id: appel.id, choix })} />}
                  </LigneRecu>
                  <LigneRecu l={r.mail} detail={r.mail?.detail || null}>
                    {r.mail?.etat === "brouillon" && <button type="button" onClick={() => ouvrirBrouillon(appel.id, r.mail.mailto)} className="ml-7 mt-2 rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Ouvrir le brouillon</button>}
                  </LigneRecu>
                  <LigneRecu l={r.diffusion} />
                  <LigneRecu l={r.relance} />
                  {(r.extras || []).map((x, i) => <LigneRecu key={i} l={x} />)}
                </ul>
                <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-trait pt-4">
                  {annulerDans > 0 ? <button type="button" onClick={() => annuler.mutate()} disabled={annuler.isPending} className="rounded-full border border-trait px-[18px] py-2.5 text-[14px] text-encre hover:bg-surface disabled:opacity-50" style={{ background: "transparent" }}>{annuler.isPending ? "Annulation…" : `Annuler · ${annulerDans} s`}</button> : <span />}
                  <button type="button" onClick={() => { clearInterval(compte.current); suivante(); }} className="p-0 text-[14px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Agence suivante →</button>
                </div>
              </div>
            )}

            {/* La fin de session. */}
            {ecran === "fin" && recap.data && (
              <div className="flex flex-col gap-[18px] rounded-[20px] border border-trait bg-fond p-7 max-md:p-5">
                <p className="m-0 text-[26px] text-encre">Session {recap.data.ville} · {duree(session.debut, horloge)}</p>
                <p className="m-0 text-[16px] leading-[1.7] text-craie">
                  {pl(recap.data.appels, "appel")} · {recap.data.par_issue?.pas_de_reponse ?? 0} sans réponse · {recap.data.par_issue?.repondeur ?? 0} répondeur · {recap.data.pas_de_bien} pas de bien pour l'instant · {recap.data.a_un_bien} avec un bien · {recap.data.pas_interesses} pas intéressé{recap.data.pas_interesses > 1 ? "s" : ""}<br />
                  {pl(recap.data.mails_envoyes, "mail envoyé", "mails envoyés")} · {pl(recap.data.diffusion, "ajout à la liste", "ajouts à la liste")} · {pl(recap.data.relances, "relance planifiée", "relances planifiées")}
                </p>
                {recap.data.progression && (
                  <div className="flex flex-col gap-2">
                    <p className="m-0 text-[15px] text-encre">{recap.data.progression.texte}</p>
                    <span className="h-[5px] overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full bg-menthe" style={{ width: `${recap.data.progression.agences ? Math.round((recap.data.progression.contactees / recap.data.progression.agences) * 100) : 0}%` }} /></span>
                  </div>
                )}
                {(recap.data.echecs || []).map((x) => (
                  <div key={`${x.appel_id}-${x.quoi}`} className="flex flex-col gap-2 rounded-[14px] border border-ambre/40 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-[15px] text-ambre">{x.texte}</span>
                      {x.quoi === "mail" && <button type="button" onClick={() => renvoyer.mutate(x.appel_id)} disabled={renvoyer.isPending} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre disabled:opacity-50" style={{ background: "transparent" }}>Renvoyer</button>}
                      {x.quoi === "brouillon" && <button type="button" onClick={() => ouvrirBrouillon(x.appel_id, x.mailto)} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Ouvrir le brouillon</button>}
                      {x.quoi === "monday" && <button type="button" onClick={() => reessayer.mutate(x.appel_id)} disabled={reessayer.isPending} className="rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre disabled:opacity-50" style={{ background: "transparent" }}>{reessayer.isPending ? "…" : "Réessayer"}</button>}
                    </div>
                    {x.quoi === "monday_ligne" && <ChoixLigne candidates={x.candidates || []} occupe={ligne.isPending} onChoisir={(choix) => ligne.mutate({ id: x.appel_id, choix })} />}
                  </div>
                ))}
                <p className="m-0 flex gap-2.5 text-[15px] text-craie">
                  <span className={recap.data.monday_a_jour ? "text-menthe" : "text-ambre"}>{recap.data.monday_a_jour ? "✓" : "!"}</span>
                  {session.essai ? "Essai : rien n'a été écrit dans Monday, aucun mail n'est parti." : recap.data.monday_a_jour ? "Tout est à jour dans Monday" : `${pl(recap.data.monday_en_attente, "ligne Monday", "lignes Monday")} en attente : nouvel essai automatique`}
                </p>
                <button type="button" onClick={() => setEcran("fiche")} className="self-start rounded-full border border-trait px-[18px] py-2.5 text-[14px] text-encre hover:bg-surface" style={{ background: "transparent" }}>Reprendre la session</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
