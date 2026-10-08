import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Mic, PhoneIncoming, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { versWav } from "@/lib/dictee";
import { erreurReseau } from "@/lib/file-hors-ligne";
import SequenceActions from "@/components/prospection/SequenceActions";
import MicroEcoute from "@/components/prospection/MicroEcoute";
import ToutPrepare, { lignesDuRecu } from "@/components/prospection/ToutPrepare";
import { ChaineEtapes, ChaineRepliee, useEtapesVives } from "@/components/prospection/ChaineEtapes";

// « Il me rappelle » (spec du 8 oct. 2026). Un agent rappelle sur le
// téléphone de l'analyste : un seul tap, depuis n'importe quelle page (ou le
// raccourci de l'écran d'accueil, `?il-me-rappelle=1`), et l'enregistrement
// démarre, sans chercher qui appelle. Au Stop, la transcription se termine et
// AK propose qui a appelé (trois candidats au plus) ; une fois l'agent
// confirmé, c'est l'écran d'un appel sortant : « Compris : … », les actions
// cochées, Valider, le reçu relu. Les notes font foi sur la transcription.
// Un rappel pas terminé reste dans le bandeau « Rappel à terminer ».

const API = "/api/prospection/rappels";
const MA = "/api/prospection/mode-appel";
const EVT = "klocka:il-me-rappelle";
const nouvelleCle = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const chrono = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const etiquette = "m-0 text-[11px] tracking-[.16em] text-brume";
const champ = "w-full rounded-champ border border-trait bg-fond px-3 py-2.5 text-[15px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
const secondaire = "h-10 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";
const principal = "h-10 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50";
const MODIFIABLES = [["interlocuteur", "Interlocuteur"], ["telephone", "Téléphone"], ["email", "Email"]];

/** Le bouton « Rappel », en haut de chaque page : il démarre l'enregistrement dans le même geste (le micro l'exige). */
export function BoutonRappel({ compact = false }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT))} aria-label="Il me rappelle : enregistrer l'appel entrant" title="Un agent vous rappelle : enregistrer"
      className={compact ? "grid h-10 w-10 place-items-center rounded-full text-menthe hover:bg-menthe/10" : "inline-flex h-9 items-center gap-2 rounded-full border border-menthe/50 px-3.5 text-[13px] text-menthe backdrop-blur-xl hover:bg-menthe/10"}
      style={{ background: compact ? "transparent" : undefined }}>
      <PhoneIncoming className={compact ? "h-5 w-5" : "h-4 w-4"} />{!compact && "Rappel"}
    </button>
  );
}

/** Une ligne du reçu : vert relu, orange en cours, rouge raté. */
function LigneRecu({ l }) {
  if (!l) return null;
  const orange = ["attente", "brouillon", "doute"].includes(l.etat);
  const ton = l.etat === "ok" ? "text-menthe" : orange ? "text-ambre" : l.etat === "echec" ? "text-alerte" : "text-ardoise";
  return (
    <li className="flex items-start gap-3 text-[15px] leading-[1.45]">
      <span className={`flex-none ${ton}`}>{l.etat === "ok" ? "✓" : l.etat === "attente" ? <Loader2 className="mt-1 h-4 w-4 animate-spin" /> : l.etat === "echec" ? <X className="mt-1 h-4 w-4" /> : orange ? "!" : "·"}</span>
      <span className={`min-w-0 break-words ${orange ? "text-ambre" : "text-encre"}`}>{l.texte}</span>
      {l.lien && <a href={l.lien} target="_blank" rel="noreferrer" className="ml-auto flex-none text-brume hover:text-encre" aria-label="Ouvrir dans Monday"><ExternalLink className="h-3.5 w-3.5" /></a>}
    </li>
  );
}

/** Un candidat : nom, agence, ville, pourquoi, et le geste pour le confirmer. */
function Candidat({ c, premier = false, onConfirmer, occupe }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${premier ? "rounded-[14px] border border-menthe/40 px-4 py-3.5" : "border-t border-trait py-3"}`}>
      <span className="min-w-0">
        <span className={`block break-words ${premier ? "text-[17px]" : "text-[15px]"} text-encre`}>{premier ? (c.probable ? "Probablement " : "Peut-être ") : ""}{[c.nom, c.agence].filter(Boolean).join(" · ")}</span>
        <span className="block text-[13px] text-ardoise">{[c.ville, c.raison].filter(Boolean).join(" · ")}</span>
        {c.ne_plus_appeler && <span className="mt-1 inline-block rounded-[7px] bg-alerte/15 px-2 py-0.5 text-[12px] text-alerte">Ne plus appeler</span>}
      </span>
      <button type="button" onClick={() => onConfirmer(c)} disabled={occupe} className={premier ? principal : secondaire} style={premier ? undefined : { background: "transparent" }}>Confirmer</button>
    </div>
  );
}

export default function RappelEntrant() {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [ecran, setEcran] = useState(null); // enregistrement | transcription | identification | actions | rien | recu
  const [rappel, setRappel] = useState(null);
  const [notes, setNotes] = useState("");
  const [secondes, setSecondes] = useState(0);
  const [microKo, setMicroKo] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [nouveau, setNouveau] = useState(null); // { agence_id, agence, ville, nom, telephone, email }
  const [confirmerLever, setConfirmerLever] = useState(false);
  const [appel, setAppel] = useState(null);
  const [titre, setTitre] = useState("");
  const [issue, setIssue] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [mail, setMail] = useState(null);
  const [relanceLe, setRelanceLe] = useState(null);
  const [relance2Le, setRelance2Le] = useState(null);
  const [ligneMonday, setLigneMonday] = useState(null);
  const [edits, setEdits] = useState({});
  const [cle, setCle] = useState(null);
  const [recu, setRecu] = useState(null);
  const [annulerDans, setAnnulerDans] = useState(0);
  // La chaîne de raisonnement d'AK, comme au mode appel (8 oct. 2026).
  const chaine = useEtapesVives();
  const [etapesFinies, setEtapesFinies] = useState([]);
  const analyserEnFlux = async (corps) => {
    chaine.reinitialiser();
    const r = await base44.flux(`${API}/${idRef.current}/analyser?flux=1`, { body: corps, surEtape: chaine.pousser });
    await chaine.vider();
    setEtapesFinies(chaine.lire());
    return r;
  };
  const rec = useRef(null);
  const morceaux = useRef([]);
  const minuteur = useRef(null);
  const compte = useRef(null);
  const idRef = useRef(null);
  const debut = useRef(0);

  const enCours = useQuery({ queryKey: ["rappels-en-cours"], queryFn: () => base44.request("GET", `${API}/en-cours`), refetchInterval: 60_000, enabled: !ouvert });

  // --- L'enregistrement : des morceaux de huit secondes, transcrits pendant l'appel ---------------
  const transcrire = async (x) => {
    try {
      const f = new FormData();
      f.append("i", String(x.i));
      f.append("audio", x.wav, `m${x.i}.wav`);
      const r = await base44.request("POST", `${MA}/morceau`, { body: f, isForm: true });
      x.texte = r.texte || ""; x.etat = "ok"; x.wav = null;
    } catch { x.etat = "echec"; }
  };
  const enregistrer = (flux) => {
    const r0 = { flux, actif: true, m: null, minuterie: null };
    rec.current = r0;
    const tour = () => {
      if (!r0.actif) { flux.getTracks().forEach((t) => t.stop()); return; }
      const bouts = [];
      const m = new MediaRecorder(flux);
      r0.m = m;
      m.ondataavailable = (e) => { if (e.data?.size) bouts.push(e.data); };
      m.onstop = async () => {
        if (r0.actif) tour(); else flux.getTracks().forEach((t) => t.stop());
        if (!bouts.length) return;
        const x = { i: morceaux.current.length, texte: null, wav: null, etat: "envoi" };
        morceaux.current.push(x);
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; return; }
        transcrire(x);
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, 8000);
    };
    tour();
  };
  const couper = () => {
    const r0 = rec.current;
    if (!r0) return;
    r0.actif = false;
    clearTimeout(r0.minuterie);
    if (r0.m?.state === "recording") r0.m.stop(); else r0.flux?.getTracks().forEach((t) => t.stop());
    rec.current = null;
  };
  const reinitialiser = () => {
    morceaux.current = []; setNotes(""); setSecondes(0); setMicroKo(false); setErreur(null); setRecherche(""); setNouveau(null); setConfirmerLever(false);
    setAppel(null); setTitre(""); setIssue(null); setCoches(new Set()); setMail(null); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setEdits({}); setCle(null); setRecu(null);
  };

  // Un seul tap : le micro est demandé dans le geste même, le rappel se crée en parallèle.
  const demarrer = () => {
    if (ouvert) return;
    reinitialiser();
    setOuvert(true); setEcran("enregistrement"); setRappel(null);
    debut.current = Date.now();
    clearInterval(minuteur.current);
    minuteur.current = setInterval(() => setSecondes(Math.round((Date.now() - debut.current) / 1000)), 1000);
    const micro = navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(new Error("micro"));
    micro.then(enregistrer).catch(() => setMicroKo(true));
    base44.request("POST", API).then((r) => { idRef.current = r.rappel.id; setRappel(r.rappel); }).catch(() => setErreur("Le rappel n'a pas pu être créé : il le sera au Stop."));
  };
  useEffect(() => {
    window.addEventListener(EVT, demarrer);
    return () => window.removeEventListener(EVT, demarrer);
  });
  // Le raccourci de l'écran d'accueil : la plateforme s'ouvre et l'enregistrement démarre.
  useEffect(() => {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("il-me-rappelle")) return;
    u.searchParams.delete("il-me-rappelle");
    window.history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`);
    demarrer();
  }, []);
  useEffect(() => () => { couper(); clearInterval(minuteur.current); clearInterval(compte.current); }, []);

  // --- Stop : la transcription se termine, AK propose qui a appelé ---------------------------------
  const stop = useMutation({
    mutationFn: async () => {
      couper();
      clearInterval(minuteur.current);
      setEcran("transcription");
      const t0 = Date.now();
      await new Promise((ok) => setTimeout(ok, 400));
      while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 20000) await new Promise((ok) => setTimeout(ok, 250));
      if (!idRef.current) { const r = await base44.request("POST", API); idRef.current = r.rappel.id; }
      const f = new FormData();
      f.append("morceaux", JSON.stringify(morceaux.current.map((x) => (x.etat === "ok" ? x.texte || "" : x.wav ? null : ""))));
      morceaux.current.filter((x) => x.etat !== "ok" && x.wav).forEach((x, k) => f.append("audio", x.wav, `m${k}.wav`));
      f.append("notes", notes);
      f.append("duree_s", String(Math.round((Date.now() - debut.current) / 1000)));
      return base44.request("POST", `${API}/${idRef.current}/fin`, { body: f, isForm: true });
    },
    onSuccess: (r) => { setRappel(r.rappel); setNotes(r.rappel.notes || ""); setEcran("identification"); },
    onError: (e) => { setErreur(erreurReseau(e) ? "Pas de réseau : l'appel est gardé à l'écran, réessayez au retour du réseau." : e?.message || "La transcription a échoué."); setEcran("identification"); },
  });

  // Les notes : enregistrées en partant du champ ; tant que l'agent n'est pas confirmé, les candidats se recalculent.
  const garderNotes = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${rappel.id}/notes`, { body: { notes } }),
    onSuccess: (r) => setRappel(r.rappel),
  });

  // --- L'agent ---------------------------------------------------------------------------------------
  const trouves = useQuery({ queryKey: ["rappel-chercher", recherche], queryFn: () => base44.request("GET", `${API}/chercher?q=${encodeURIComponent(recherche)}`), enabled: ecran === "identification" && recherche.trim().length >= 2 });
  const ouvrirActions = (ap) => {
    const props = ap.propositions || [];
    setAppel(ap); setIssue(ap.issue_tapee || ap.issue); setTitre(ap.resume || ""); setCle(nouvelleCle());
    setCoches(new Set(props.filter((p) => p.coche !== false).map((p) => p.id)));
    const pm = props.find((p) => p.type === "mail");
    setMail(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele } : null);
    setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setEdits({});
    setEcran("actions");
  };
  const analyser = useMutation({
    mutationFn: (opts = {}) => analyserEnFlux(opts),
    onMutate: () => setEcran("actions"),
    onSuccess: (r) => { setRappel(r.rappel); if (r.rien_de_nouveau) setEcran("rien"); else ouvrirActions(r.appel); },
    onError: (e) => toast.error(e?.message || "L'analyse a échoué"),
  });
  const identifier = useMutation({
    mutationFn: async (corps) => {
      if (notes !== (rappel.notes || "")) await base44.request("POST", `${API}/${rappel.id}/notes`, { body: { notes } });
      return base44.request("POST", `${API}/${rappel.id}/identifier`, { body: corps });
    },
    onSuccess: (r) => { setRappel(r.rappel); setNouveau(null); setRecherche(""); analyser.mutate({}); },
    onError: (e) => toast.error(e?.message || "Identification impossible"),
  });
  const confirmer = (c) => identifier.mutate({ agent_id: c.agent_id, agence_id: c.agence_id });
  const lever = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${rappel.id}/lever`),
    onSuccess: (r) => { setRappel((x) => ({ ...x, ...r.rappel, appel: x.appel })); setConfirmerLever(false); toast.success("« Ne plus appeler » levé"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const reanalyser = useMutation({
    mutationFn: async () => {
      await base44.request("POST", `${API}/${rappel.id}/notes`, { body: { notes } });
      return analyserEnFlux({ remplace: appel?.id || null });
    },
    onMutate: () => setEcran("actions"),
    onSuccess: (r) => { setRappel(r.rappel); if (r.rien_de_nouveau) setEcran("rien"); else ouvrirActions(r.appel); },
    onError: (e) => toast.error(e?.message || "L'analyse a échoué"),
  });

  // --- Valider, le reçu ------------------------------------------------------------------------------
  const valider = useMutation({
    mutationFn: async () => {
      if (titre.trim() && titre.trim() !== (appel.resume || "")) await base44.request("POST", `${API}/${rappel.id}/titre`, { body: { titre } });
      const compris = appel.compris?.champs || {};
      const corrections = MODIFIABLES.filter(([k]) => edits[k] != null && String(edits[k]).trim() !== String(compris[k]?.valeur ?? "")).map(([k, libelle]) => ({ cle: k, libelle, valeur: String(edits[k]).trim() }));
      return base44.request("POST", `${MA}/appels/${appel.id}/valider`, { body: { choix: [...coches], mail: coches.has("mail") ? mail : null, relance_le: relanceLe, relance2_le: relance2Le, monday_ligne: ligneMonday, note: "", cle, session_id: null, issue, corrections } });
    },
    onSuccess: (r) => {
      setRecu(r.recu); setEcran("recu");
      base44.request("POST", `${API}/${rappel.id}/terminer`).catch(() => {});
      ["relances", "relances-prises", "rappels-en-cours"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      const fin = Date.parse(r.recu?.annulable_jusqu || 0);
      clearInterval(compte.current);
      const tic = () => setAnnulerDans(Math.max(0, Math.ceil((fin - Date.now()) / 1000)));
      tic();
      compte.current = setInterval(tic, 250);
    },
    onError: (e) => toast.error(e?.message || "Validation impossible"),
  });
  const recuFrais = useQuery({ queryKey: ["mode-appel-recu", appel?.id], queryFn: () => base44.request("GET", `${MA}/appels/${appel.id}/recu`), enabled: ecran === "recu" && !!appel?.id, refetchInterval: 2500 });
  const r = recuFrais.data?.recu || recu;
  // « Tout préparé » (8 oct. 2026) : une fois Annuler écoulé et le mail parti, la fenêtre récapitule, puis Terminer ferme.
  const [prepare, setPrepare] = useState(false);
  const mailEnRoute = r?.mail?.etat === "attente" && /part dans/.test(r.mail.texte || "");
  useEffect(() => {
    if (ecran === "recu" && r && annulerDans === 0 && !mailEnRoute && r.monday?.etat !== "doute" && r.mail?.etat !== "brouillon") setPrepare(true);
  }, [ecran, annulerDans, mailEnRoute, r?.monday?.etat, r?.mail?.etat]);
  const jourLong = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
  const dateProchain = relanceLe || (appel?.propositions || []).find((x) => x.type === "relance")?.prochaine?.le || null;
  const nomProchain = (edits?.interlocuteur || "").trim() || appel?.compris?.champs?.interlocuteur?.valeur || rappel?.agent?.nom || "l'agent";
  const annuler = useMutation({
    mutationFn: () => base44.request("POST", `${MA}/appels/${appel.id}/annuler`),
    onSuccess: () => { clearInterval(compte.current); setRecu(null); setCle(nouvelleCle()); setEcran("actions"); toast.success("Annulé : rien n'est resté"); },
    onError: (e) => toast.error(e?.message || "Trop tard pour annuler"),
  });
  const rien = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${rappel.id}/rien-de-nouveau`),
    onSuccess: (x) => { toast.success(x.texte || "Rien de nouveau"); fermer(); ["relances", "relances-prises"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const abandonner = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${rappel.id}/abandonner`),
    onSuccess: () => { toast.success("Rappel abandonné : rien n'a été fait"); fermer(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  const fermer = () => {
    couper(); clearInterval(minuteur.current); clearInterval(compte.current);
    setOuvert(false); setEcran(null); setRappel(null); idRef.current = null;
    queryClient.invalidateQueries({ queryKey: ["rappels-en-cours"] });
  };
  // Reprendre un rappel pas terminé, là où il en était.
  const reprendre = useMutation({
    mutationFn: (id) => base44.request("GET", `${API}/${id}`),
    onSuccess: (x) => {
      reinitialiser();
      const rp = x.rappel;
      idRef.current = rp.id; setRappel(rp); setNotes(rp.notes || ""); setOuvert(true);
      if (rp.etat === "enregistrement") { setMicroKo(true); setEcran("enregistrement"); }
      else if (rp.etat === "a_identifier") setEcran("identification");
      else if (rp.appel) ouvrirActions(rp.appel);
      else if (rp.rien_de_nouveau) setEcran("rien");
      else { setEcran("actions"); analyser.mutate({}); }
    },
    onError: (e) => toast.error(e?.message || "Rappel introuvable"),
  });

  const enAttente = (enCours.data?.rappels || [])[0] || null;
  const notesChangees = rappel && rappel.notes_analysees != null && notes !== rappel.notes_analysees;
  const agent = rappel?.agent;
  const candidats = rappel?.candidats || [];
  const prefill = () => {
    const t = `${rappel?.transcription || ""} ${notes}`;
    const nom = (t.match(/(?:je suis|c'est|ici)\s+((?:\p{Lu}[\p{L}'-]+)(?:\s+\p{Lu}[\p{L}'-]+)?)/u) || t.match(/((?:\p{Lu}[\p{L}'-]+)(?:\s+\p{Lu}[\p{L}'-]+)?)\s+à l'appareil/u) || [])[1] || "";
    const email = (notes.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0] || "";
    const tel = (notes.match(/(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/) || [])[0] || "";
    setNouveau({ agence_id: null, agence: "", ville: "", nom, telephone: tel, email });
  };

  // --- Rendu -----------------------------------------------------------------------------------------
  const bandeau = !ouvert && enAttente && createPortal(
    <div className="fixed bottom-[calc(16px+var(--k-bas-mobile,0px))] left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-ambre/50 bg-surface-pleine px-4 py-2 shadow-[0_18px_40px_rgb(0_0_0/0.18)] md:left-[calc(50%+var(--k-barre-largeur,0px)/2)]">
      <PhoneIncoming className="h-4 w-4 flex-none text-ambre" />
      <span className="min-w-0 truncate text-[14px] text-encre">Rappel à terminer · {enAttente.agent || "agent à identifier"}</span>
      <button type="button" onClick={() => reprendre.mutate(enAttente.id)} disabled={reprendre.isPending} className="h-8 flex-none rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Reprendre</button>
    </div>,
    document.body,
  );

  if (!ouvert) return bandeau || null;

  const zoneNotes = (
    <label className="flex flex-col gap-1.5">
      <span className={etiquette}>NOTES</span>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (rappel?.id && ecran !== "enregistrement" && notes !== (rappel.notes || "")) garderNotes.mutate(); }} rows={4}
        placeholder="Ce que le micro capte mal : email, numéro, orthographe d'un nom, une précision" className={champ} />
      {(rappel?.notes_avertissements || []).map((x) => <span key={x} className="text-[12.5px] text-ambre">{x}</span>)}
    </label>
  );
  const transcription = (
    <div className="flex min-h-[120px] flex-col gap-2 rounded-[16px] border border-trait p-4">
      <span className={etiquette}>TRANSCRIPTION</span>
      {ecran === "enregistrement" ? <p className="m-0 text-[14px] text-brume">La transcription s'affiche à la fin de l'appel.</p>
        : ecran === "transcription" ? <span className="text-[14px] text-ardoise">Transcription en cours</span>
          : rappel?.transcription ? <p className="m-0 max-h-[320px] overflow-y-auto whitespace-pre-line text-[14.5px] leading-[1.55] text-craie">{rappel.transcription}</p>
            : <p className="m-0 text-[14px] text-brume">{microKo ? "Pas d'enregistrement : écrivez l'essentiel dans les notes." : "Rien n'a été entendu."}</p>}
      {rappel?.transcription_echec && <p className="m-0 text-[12.5px] text-ambre">Une partie n'a pas pu être transcrite.</p>}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-fond md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label="Rappel entrant">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] md:px-6">
        {/* Le bandeau : qui appelle, une fois connu. */}
        <div className="flex items-center justify-between gap-3 rounded-full border border-trait px-4 py-2.5">
          <span className="flex min-w-0 items-center gap-2.5 text-[14.5px]">
            <PhoneIncoming className="h-4 w-4 flex-none text-menthe" />
            <span className="min-w-0 truncate text-encre">Rappel entrant · {agent ? [agent.nom, agent.agence].filter(Boolean).join(" · ") : "agent à identifier"}</span>
          </span>
          {ecran !== "enregistrement" && ecran !== "transcription" && (
            <button type="button" onClick={fermer} aria-label="Fermer : le rappel reste à terminer" title="Plus tard : le rappel reste dans le bandeau" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
          )}
        </div>
        {erreur && <p className="m-0 rounded-[14px] border border-ambre/40 px-4 py-2.5 text-[14px] text-ambre">{erreur}</p>}
        {(rappel?.avertissements || []).map((x) => (
          <div key={x.genre} className={`flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3 ${x.genre === "ne_plus_appeler" ? "border-alerte/50 text-alerte" : "border-ambre/40 text-ambre"}`}>
            <span className="text-[15px]">{x.texte}</span>
            {x.genre === "ne_plus_appeler" && (confirmerLever
              ? <span className="flex gap-2"><button type="button" onClick={() => lever.mutate()} disabled={lever.isPending} className="h-9 rounded-full bg-alerte px-4 text-[13px] text-white disabled:opacity-50">Oui, il revient de lui-même</button><button type="button" onClick={() => setConfirmerLever(false)} className="h-9 rounded-full border border-trait px-3 text-[13px] text-ardoise" style={{ background: "transparent" }}>Non</button></span>
              : <button type="button" onClick={() => setConfirmerLever(true)} className="h-9 rounded-full border border-alerte/50 px-4 text-[13px] text-alerte" style={{ background: "transparent" }}>Lever le blocage</button>)}
          </div>
        ))}

        {/* Pendant l'appel : le micro, Stop, le chronomètre ; la transcription viendra à la fin ; les notes. */}
        {ecran === "enregistrement" && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col items-center gap-4 rounded-[20px] border border-trait px-5 py-8">
              {microKo ? (
                <>
                  <span className="text-[15px] text-ambre">Enregistrement pas lancé</span>
                  <span className="max-w-[300px] text-center text-[13.5px] text-ardoise">Écrivez l'essentiel dans les notes, puis Analyser.</span>
                </>
              ) : (
                <>
                  <MicroEcoute taille={220}><Mic className="h-11 w-11" strokeWidth={1.8} /></MicroEcoute>
                  <span className="font-mono text-[28px] tabular-nums text-encre">{chrono(secondes)}</span>
                </>
              )}
              <button type="button" onClick={() => stop.mutate()} disabled={stop.isPending} className="h-14 w-full max-w-[300px] rounded-full bg-alerte text-[17px] text-white hover:opacity-90 disabled:opacity-50">{microKo ? "Analyser" : "Stop"}</button>
            </div>
            <div className="flex flex-col gap-4">{transcription}{zoneNotes}</div>
          </div>
        )}

        {ecran === "transcription" && <ChaineEtapes etapes={["Je termine la transcription et je cherche qui a appelé"]} titre="AK lit l'appel" />}

        {/* Qui a appelé : trois candidats au plus, chercher, ou un nouveau contact. */}
        {ecran === "identification" && rappel && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">{transcription}{zoneNotes}</div>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-[16px] border border-trait p-4">
                <span className={etiquette}>QUI A APPELÉ</span>
                {candidats.length ? candidats.map((c, i) => <Candidat key={c.cle} c={c} premier={i === 0} onConfirmer={confirmer} occupe={identifier.isPending} />)
                  : <p className="m-0 text-[14px] text-brume">Aucun candidat : cherchez-le, ou créez le contact.</p>}
              </div>
              <div className="flex flex-col gap-2 rounded-[16px] border border-trait p-4">
                <span className="flex items-center gap-2 rounded-full border border-trait bg-fond px-3.5 py-2 focus-within:border-menthe">
                  <Search className="h-4 w-4 flex-none text-ardoise" />
                  <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="4 derniers chiffres, nom de l'agent ou de l'agence" aria-label="Chercher l'agent" className="w-full border-0 bg-transparent text-[15px] text-encre outline-none max-md:text-[16px]" />
                </span>
                {(trouves.data?.resultats || []).map((c) => <Candidat key={c.cle} c={c} onConfirmer={confirmer} occupe={identifier.isPending} />)}
                {recherche.trim().length >= 2 && trouves.data && !trouves.data.resultats.length && <span className="text-[13px] text-brume">Personne à ce nom ou ce numéro.</span>}
                {!nouveau ? <button type="button" onClick={prefill} className={`${secondaire} self-start`} style={{ background: "transparent" }}>Nouveau contact</button> : (
                  <div className="flex flex-col gap-2 border-t border-trait pt-3">
                    <span className={etiquette}>NOUVEAU CONTACT</span>
                    {nouveau.agence_id ? (
                      <span className="flex items-center justify-between gap-2 text-[14px] text-encre">{nouveau.agence}<button type="button" onClick={() => setNouveau((x) => ({ ...x, agence_id: null, agence: "" }))} className="text-[13px] text-ardoise" style={{ background: "transparent" }}>changer</button></span>
                    ) : (
                      <>
                        <input value={nouveau.agence} onChange={(e) => setNouveau((x) => ({ ...x, agence: e.target.value }))} placeholder="Agence (cherchez dans les listes, ou saisissez-la)" className={champ} />
                        {nouveau.agence.trim().length >= 2 && <ChoixAgence q={nouveau.agence} onChoisir={(g) => setNouveau((x) => ({ ...x, agence_id: g.agence_id, agence: g.agence, ville: g.ville || "" }))} />}
                        <input value={nouveau.ville} onChange={(e) => setNouveau((x) => ({ ...x, ville: e.target.value }))} placeholder="Ville" className={champ} />
                      </>
                    )}
                    <input value={nouveau.nom} onChange={(e) => setNouveau((x) => ({ ...x, nom: e.target.value }))} placeholder="Nom de l'agent" className={champ} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={nouveau.telephone} onChange={(e) => setNouveau((x) => ({ ...x, telephone: e.target.value }))} placeholder="Téléphone" inputMode="tel" className={champ} />
                      <input value={nouveau.email} onChange={(e) => setNouveau((x) => ({ ...x, email: e.target.value }))} placeholder="Email" inputMode="email" className={champ} />
                    </div>
                    <span className="flex gap-2">
                      <button type="button" onClick={() => identifier.mutate({ nouveau })} disabled={!nouveau.nom.trim() || identifier.isPending} className={principal}>Créer et confirmer</button>
                      <button type="button" onClick={() => setNouveau(null)} className={secondaire} style={{ background: "transparent" }}>Annuler</button>
                    </span>
                  </div>
                )}
              </div>
              <div className="rounded-[16px] border border-dashed border-trait p-4 text-[14px] text-brume">Actions proposées : elles s'affichent et se valident une fois l'agent confirmé.</div>
              <button type="button" onClick={() => abandonner.mutate()} disabled={abandonner.isPending} className="self-start p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Abandonner ce rappel</button>
            </div>
          </div>
        )}

        {/* L'agent confirmé : le même écran qu'un appel sortant. */}
        {ecran === "actions" && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              {transcription}
              {zoneNotes}
              {notesChangees && <button type="button" onClick={() => reanalyser.mutate()} disabled={reanalyser.isPending} className={`${secondaire} self-start`} style={{ background: "transparent" }}>Ré-analyser</button>}
              <button type="button" onClick={() => abandonner.mutate()} disabled={abandonner.isPending} className="self-start p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Abandonner ce rappel</button>
            </div>
            <div className="flex min-w-0 flex-col gap-4 max-md:order-first">
              {!appel || analyser.isPending || reanalyser.isPending ? (
                <ChaineEtapes etapes={chaine.etapes} />
              ) : (
                <>
                  <ChaineRepliee etapes={etapesFinies} />
                  <label className="flex flex-col gap-1.5">
                    <span className={etiquette}>COMPRIS</span>
                    <input value={titre} onChange={(e) => setTitre(e.target.value)} aria-label="Ce qui a été compris" className={champ} />
                  </label>
                  <SequenceActions appel={appel} agence={{ nom: agent?.agence || appel.agence }} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
                    relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} ligneMonday={ligneMonday} setLigneMonday={setLigneMonday}
                    edits={edits} setEdits={setEdits}
                    onChangerIssue={(k) => (["pas_de_reponse", "repondeur"].includes(k) ? toast.error("Il vous a appelé : ce n'est pas un sans-réponse") : analyser.mutate({ issue: k, remplace: appel.id }))} changementEnCours={analyser.isPending}
                    onLancer={() => (agent ? valider.mutate() : toast.error("Confirmez d'abord l'agent"))} envoi={valider.isPending} />
                </>
              )}
            </div>
          </div>
        )}

        {ecran === "rien" && (
          <div className="flex w-full max-w-[620px] flex-col gap-4 self-center rounded-[20px] border border-trait p-7 max-md:p-5">
            <p className="m-0 text-[20px] text-encre">Rien de nouveau</p>
            <p className="m-0 text-[14.5px] leading-[1.55] text-craie">Appel très court, sans contenu utile. Valider met son dernier contact à aujourd'hui, rien d'autre.</p>
            {zoneNotes}
            <div className="flex flex-wrap justify-end gap-2 border-t border-trait pt-4">
              {notesChangees && <button type="button" onClick={() => reanalyser.mutate()} disabled={reanalyser.isPending} className={secondaire} style={{ background: "transparent" }}>Ré-analyser</button>}
              <button type="button" onClick={() => rien.mutate()} disabled={rien.isPending} className={principal}>Valider</button>
            </div>
          </div>
        )}

        {prepare && ecran === "recu" && (
          <ToutPrepare libelle="Terminer →" onSuivant={() => { setPrepare(false); fermer(); }}
            phrase={issue === "pas_interesse" ? `${agent?.nom || "L'agent"} ne sera plus appelé.` : dateProchain ? `Prochain appel à ${nomProchain} le ${jourLong(dateProchain)}.` : null}
            lignes={lignesDuRecu(r, { issue, dateRelance: dateProchain, jourLong })} />
        )}
        {ecran === "recu" && r && (
          <div className="flex w-full max-w-[620px] flex-col gap-3.5 self-center rounded-[20px] border border-trait p-7 max-md:p-5">
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              <LigneRecu l={r.monday ? { ...r.monday, texte: r.monday.etat === "ok" ? `Monday : ${r.monday.texte}` : r.monday.texte } : null} />
              <LigneRecu l={r.mail} />
              <LigneRecu l={r.diffusion} />
              <LigneRecu l={r.relance} />
              {(r.extras || []).map((x, i) => <LigneRecu key={i} l={x} />)}
            </ul>
            {r.monday?.etat === "doute" && <p className="m-0 text-[13px] text-ambre">Monday hésite entre plusieurs lignes : choisissez-la depuis la Prospection (Mode appel, récapitulatif).</p>}
            <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-trait pt-4">
              {annulerDans > 0 ? <button type="button" onClick={() => annuler.mutate()} disabled={annuler.isPending} className={secondaire} style={{ background: "transparent" }}>{annuler.isPending ? "Annulation" : `Annuler · ${annulerDans} s`}</button> : <span />}
              <button type="button" onClick={fermer} className={principal}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Choisir l'agence d'un nouveau contact dans les listes de villes. */
function ChoixAgence({ q, onChoisir }) {
  const { data } = useQuery({ queryKey: ["rappel-agence", q], queryFn: () => base44.request("GET", `${API}/chercher?q=${encodeURIComponent(q)}`) });
  const agences = (data?.resultats || []).filter((x) => x.agence_id).slice(0, 5);
  if (!agences.length) return null;
  return (
    <div className="flex flex-col">
      {agences.map((g) => (
        <button key={g.agence_id} type="button" onClick={() => onChoisir(g)} className="rounded-[10px] px-3 py-2 text-left text-[14px] text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
          {g.agence}{g.ville ? <span className="text-ardoise"> · {g.ville}</span> : null}
        </button>
      ))}
    </div>
  );
}
