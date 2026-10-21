import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, ExternalLink, FlaskConical, Loader2, MessageSquareText, Mic, PhoneIncoming, PhoneOutgoing, Search, Square, X } from "lucide-react";
import { SCENARIOS_RAPPEL } from "@/components/prospection/scenarios-rappel";
import { CARTE, CHAMP_CARTE, ETIQUETTE, GROS_BOUTON, TraitAppel } from "@/components/prospection/StyleAppel";
import { CalculatriceEnLigne, EnteteEnLigne, NotesEnLigne, TranscriptionEnLigne, presentation } from "@/components/prospection/EcranEnLigne";
import FondHalo from "@/components/projet/FondHalo";
import NoteApresAppel from "@/components/prospection/NoteApresAppel";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee, versWav } from "@/lib/dictee";
import { erreurReseau } from "@/lib/file-hors-ligne";
import SequenceActions from "@/components/prospection/SequenceActions";
import { PanneauTranscription } from "@/components/prospection/ModeAppel";
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
const etiquette = ETIQUETTE;
const champ = "w-full rounded-champ border border-trait bg-fond px-3 py-2.5 text-[15px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
const secondaire = "h-10 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";
const principal = "h-10 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50";
const MODIFIABLES = [["interlocuteur", "Interlocuteur"], ["telephone", "Téléphone"], ["email", "Email"]];

/** Le bouton « Rappel », en haut de chaque page : il démarre l'enregistrement dans le même geste (le micro l'exige). */
/** Ouvre l'écran « Il me rappelle » (le même que l'icône du coin). */
export const enregistrerUnRappel = () => window.dispatchEvent(new CustomEvent(EVT, { detail: { sens: "entrant" } }));
/** L'appel rapide (19 oct. 2026, Jules) : on appelle un agent pour un dossier, un point ; le même écran, le même chemin. */
export const appelRapide = () => window.dispatchEvent(new CustomEvent(EVT, { detail: { sens: "sortant" } }));
/** Raconter un échange sans l'avoir eu au téléphone : les notes tiennent lieu d'appel, puis le même chemin. */
export const raconterUnEchange = (notes = "") => window.dispatchEvent(new CustomEvent(EVT, { detail: { sens: "raconte", notes } }));
/** L'essai (19 oct. 2026, Jules) : un rappel ou un appel rapide joué, sans appel réel, dans la liste fictive. */
export const essayerUnAppel = () => window.dispatchEvent(new CustomEvent(EVT, { detail: { essai: true } }));
// Le halo du fond, comme le Layout : ni en thème clair, ni quand la personne l'a éteint.
const haloVisible = () => typeof document !== "undefined" && document.documentElement.dataset.theme !== "clair" && document.documentElement.dataset.halo !== "0";
// Au téléphone, pendant un appel, le micro est pris par l'appel : on le dit à l'écran.
const tactile = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

// Qui a parlé à qui : le seul écart entre les trois entrées.
const SENS = {
  entrant: { icone: PhoneIncoming, titre: "Rappel entrant" },
  sortant: { icone: PhoneOutgoing, titre: "Appel rapide" },
  raconte: { icone: MessageSquareText, titre: "Échange raconté" },
};

export function BoutonRappel({ compact = false }) {
  // Une icône seule au téléphone, dans la barre du haut : un tap enregistre l'appel entrant.
  if (compact) return (
    <button type="button" onClick={enregistrerUnRappel} aria-label="Il me rappelle : enregistrer l'appel entrant" title="Rappel : un agent vous rappelle, enregistrer l'appel"
      className="grid h-10 w-10 place-items-center rounded-full text-menthe hover:bg-menthe/10" style={{ background: "transparent" }}>
      <PhoneIncoming className="h-5 w-5" strokeWidth={1.8} />
    </button>
  );
  return <PiluleAppel />;
}

// Sur ordinateur, la pilule « Appel » en haut à droite (19 oct. 2026, Jules) : au survol, elle grossit et se
// soulève, et le panneau des deux modes se déplie dessous, depuis son coin droit. Une bande invisible de 12 px
// relie la pilule au panneau, et il attend 120 ms avant de se refermer : un écart de souris ne le ferme pas.
function PiluleAppel() {
  const [ouvert, setOuvert] = useState(false);
  const minuterie = useRef(null);
  const entrer = () => { clearTimeout(minuterie.current); setOuvert(true); };
  const sortir = () => { clearTimeout(minuterie.current); minuterie.current = setTimeout(() => setOuvert(false), 120); };
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const choisir = (faire) => { clearTimeout(minuterie.current); setOuvert(false); faire(); };
  const modes = [
    { cle: "entrant", icone: PhoneIncoming, titre: "Il me rappelle", detail: "Enregistrer l'appel entrant", faire: enregistrerUnRappel },
    { cle: "sortant", icone: PhoneOutgoing, titre: "Appel rapide", detail: "J'appelle un agent : enregistrer l'appel", faire: appelRapide },
    { cle: "essai", icone: FlaskConical, titre: "Essai, sans appel", detail: "Jouer un rappel ou un appel rapide", faire: essayerUnAppel },
  ];
  return (
    <div className="relative" onMouseEnter={entrer} onMouseLeave={sortir}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="menu" aria-label="Appel : un agent me rappelle, ou j'appelle un agent"
        className="k-pilule-appel grid h-11 w-11 place-items-center rounded-full border text-menthe">
        <PhoneIncoming className="h-5 w-5" strokeWidth={1.8} />
      </button>
      <div className={`k-panneau-appel absolute right-0 top-full z-50 pt-3 ${ouvert ? "k-ouvert" : ""}`} role="menu" aria-hidden={!ouvert}>
        <div className="flex w-[270px] flex-col gap-1.5 rounded-[16px] border border-trait bg-rail p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.4)]">
          {modes.map((m) => (
            <button key={m.cle} type="button" role="menuitem" tabIndex={ouvert ? 0 : -1} onClick={() => choisir(m.faire)}
              className="k-mode-appel flex items-center gap-3 rounded-[12px] border px-3.5 py-3 text-left">
              <m.icone className="h-[18px] w-[18px] flex-none text-menthe" strokeWidth={1.8} />
              <span className="min-w-0">
                <span className="block text-[14px] text-encre">{m.titre}</span>
                <span className="block text-[12.5px] text-ardoise">{m.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
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
function Candidat({ c, premier = false, onConfirmer, occupe, libelle = null }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${premier ? "rounded-[14px] border border-menthe/40 px-4 py-3.5" : "border-t border-trait py-3"}`}>
      <span className="min-w-0">
        <span className={`block break-words ${premier ? "text-[17px]" : "text-[15px]"} text-encre`}>{premier ? (c.probable ? "Probablement " : "Peut-être ") : ""}{[c.nom, c.agence].filter(Boolean).join(" · ")}</span>
        <span className="block text-[13px] text-ardoise">{[c.ville, c.raison].filter(Boolean).join(" · ")}</span>
        {c.ne_plus_appeler && <span className="mt-1 inline-block rounded-[7px] bg-alerte/15 px-2 py-0.5 text-[12px] text-alerte">Ne plus appeler</span>}
      </span>
      <button type="button" onClick={() => onConfirmer(c)} disabled={occupe} className={premier ? principal : secondaire} style={premier ? undefined : { background: "transparent" }}>{libelle || (premier ? "C'est lui" : "Confirmer")}</button>
    </div>
  );
}

export default function RappelEntrant() {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [ecran, setEcran] = useState(null); // enregistrement | transcription | identification | actions | rien | recu
  const [sens, setSens] = useState("entrant"); // entrant | sortant | raconte
  // L'essai (19 oct. 2026) : un scénario joué phrase par phrase, dans la liste fictive.
  const [essai, setEssai] = useState(false);
  const [scenario, setScenario] = useState(null);
  const lecture = useRef(null);
  const ecranRef = useRef(null);
  useEffect(() => { ecranRef.current = ecran; }, [ecran]);
  const [rappel, setRappel] = useState(null);
  const [notes, setNotes] = useState("");
  const [secondes, setSecondes] = useState(0);
  const [microKo, setMicroKo] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [recherche, setRecherche] = useState("");
  const [rechercheAppels, setRechercheAppels] = useState("");
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
  // La transcription en direct (13 oct. 2026, Jules) : chaque morceau s'affiche dès qu'il est transcrit.
  const [direct, setDirect] = useState([]);
  // Les morceaux comme au mode appel : en cours, transcrits, ratés ; le panneau les tape au fil de l'eau.
  const montrerDirect = () => setDirect(morceaux.current.map((x) => ({ i: x.i, texte: x.texte, etat: x.etat, qui: x.qui || null })));
  const finDirect = useRef(null);
  useEffect(() => { finDirect.current?.scrollIntoView({ block: "nearest" }); }, [direct.length, direct.filter((x) => x.texte).length]);
  const minuteur = useRef(null);
  const compte = useRef(null);
  const idRef = useRef(null);
  const debut = useRef(0);

  // Dicter les notes (13 oct. 2026, Jules), une fois l'appel fini : pendant l'appel, le micro enregistre.
  const baseDictee = useRef("");
  const dictee = useDictee({ onTexte: (t) => setNotes([baseDictee.current, t].filter(Boolean).join(baseDictee.current ? " " : "")) });
  const dicter = () => { if (dictee.ecoute) { dictee.arreter(); return; } baseDictee.current = notes.trim(); dictee.demarrer(); };
  // La note vocale d'après l'appel (21 oct. 2026, Jules : « il ne faut pas que ça devine ») : qui c'était, et quoi faire.
  const [noteVocale, setNoteVocale] = useState("");
  const dicteeNote = useDictee({ onTexte: (t) => setNoteVocale(t), onFin: (t) => setNoteVocale(t) });
  useEffect(() => {
    if (!dicteeNote.ecoute) return undefined;
    const t = setTimeout(() => dicteeNote.arreter(), 30000);
    return () => clearTimeout(t);
  }, [dicteeNote.ecoute]);
  const enCours = useQuery({ queryKey: ["rappels-en-cours"], queryFn: () => base44.request("GET", `${API}/en-cours`), refetchInterval: 60_000, enabled: !ouvert });

  // --- L'enregistrement : des morceaux de huit secondes, transcrits pendant l'appel ---------------
  const transcrire = async (x) => {
    try {
      const f = new FormData();
      f.append("i", String(x.i));
      f.append("audio", x.wav, `m${x.i}.wav`);
      const r = await base44.request("POST", `${MA}/morceau`, { body: f, isForm: true });
      x.texte = r.texte || ""; x.etat = "ok"; x.wav = null;
      montrerDirect();
    } catch { x.etat = "echec"; montrerDirect(); }
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
        morceaux.current.push(x); montrerDirect();
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; montrerDirect(); return; }
        transcrire(x);
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, 8000);
    };
    tour();
  };
  const couper = () => {
    clearInterval(lecture.current);
    const r0 = rec.current;
    if (!r0) return;
    r0.actif = false;
    clearTimeout(r0.minuterie);
    if (r0.m?.state === "recording") r0.m.stop(); else r0.flux?.getTracks().forEach((t) => t.stop());
    rec.current = null;
  };
  const reinitialiser = () => {
    morceaux.current = []; setDirect([]); setNotes(""); setVoirTranscription(false); setChercherAilleurs(false); setNoteVocale(""); setSecondes(0); setMicroKo(false); setErreur(null); setRecherche(""); setNouveau(null); setConfirmerLever(false);
    setAppel(null); setTitre(""); setIssue(null); setCoches(new Set()); setMail(null); setRelanceLe(null); setRelance2Le(null); setLigneMonday(null); setEdits({}); setCle(null); setRecu(null);
  };

  // Un seul tap : le micro est demandé dans le geste même, le rappel se crée en parallèle.
  const demarrer = (e) => {
    if (ouvert) return;
    const s = SENS[e?.detail?.sens] ? e.detail.sens : "entrant";
    reinitialiser();
    setEssai(!!e?.detail?.essai); setScenario(null);
    // L'essai : d'abord le choix du scénario.
    if (e?.detail?.essai) { setSens("entrant"); setOuvert(true); setEcran("essai"); setRappel(null); idRef.current = null; return; }
    // L'appel rapide : on sait qui on appelle, on le choisit d'abord ; l'enregistrement part au clic sur la personne.
    if (s === "sortant") {
      setSens(s); setOuvert(true); setEcran("choix"); setRappel(null); idRef.current = null;
      base44.request("POST", API, { body: { sens: s } }).then((r) => { idRef.current = r.rappel.id; setRappel(r.rappel); }).catch(() => setErreur("L'appel n'a pas pu être créé : réessayez."));
      return;
    }
    setSens(s);
    setOuvert(true); setEcran("enregistrement"); setRappel(null);
    debut.current = Date.now();
    clearInterval(minuteur.current);
    if (s === "raconte") {
      // Rien à enregistrer : on écrit (ou dicte) ce que l'agent a dit, puis Analyser.
      setMicroKo(true); setNotes(e?.detail?.notes || "");
    } else {
      minuteur.current = setInterval(() => setSecondes(Math.round((Date.now() - debut.current) / 1000)), 1000);
      const micro = navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(new Error("micro"));
      micro.then(enregistrer).catch(() => setMicroKo(true));
    }
    base44.request("POST", API, { body: { sens: s } }).then((r) => { idRef.current = r.rappel.id; setRappel(r.rappel); }).catch(() => setErreur("L'appel n'a pas pu être créé : il le sera à l'analyse."));
  };
  // Lance l'enregistrement (ou, en essai, la lecture du scénario) une fois la personne choisie.
  const jouer = (sc) => {
    morceaux.current = []; montrerDirect();
    let n = 0;
    clearInterval(lecture.current);
    lecture.current = setInterval(() => {
      if (n >= sc.phrases.length) { clearInterval(lecture.current); return; }
      morceaux.current.push({ i: n, texte: sc.phrases[n], etat: "ok", qui: n % 2 === 0 ? "autre" : "vous" }); n += 1; montrerDirect();
    }, 1800);
  };
  const lancer = (micro, sc = scenario) => {
    setEcran("enregistrement");
    debut.current = Date.now();
    clearInterval(minuteur.current);
    minuteur.current = setInterval(() => setSecondes(Math.round((Date.now() - debut.current) / 1000)), 1000);
    if (sc) jouer(sc);
    else if (micro) micro.then(enregistrer).catch(() => setMicroKo(true));
    else setMicroKo(true);
  };
  const demanderMicro = () => (navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices.getUserMedia({ audio: true }) : Promise.reject(new Error("micro")));
  const choisirScenario = (sc) => {
    setScenario(sc); setSens(sc.sens); setErreur(null);
    base44.request("POST", API, { body: { sens: sc.sens, essai: true } }).then((r) => {
      idRef.current = r.rappel.id; setRappel(r.rappel);
      if (sc.sens === "sortant") setEcran("choix"); else lancer(null, sc);
    }).catch((e) => setErreur(e?.message || "L'essai n'a pas pu démarrer."));
  };
  // Appel rapide : la personne choisie (ou créée), puis l'enregistrement. Le micro se demande dans le clic même.
  const choisirPuisLancer = (corps) => {
    const micro = scenario ? null : demanderMicro();
    identifier.mutate(corps, { onSuccess: () => lancer(micro) });
  };

  useEffect(() => {
    window.addEventListener(EVT, demarrer);
    return () => window.removeEventListener(EVT, demarrer);
  });
  // Le raccourci de l'écran d'accueil (?il-me-rappelle=1) et le lien d'un échange raconté à Haka (?rappel=<id>).
  // Lus à chaque navigation (21 oct. 2026) : la barre ne se remonte plus d'une page à l'autre, cet écran non plus.
  const location = useLocation();
  const navigate = useNavigate();
  const traites = useRef(new Set());
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get("rappel");
    const raccourci = params.has("il-me-rappelle");
    if (!id && !raccourci) return;
    const cle = id || `raccourci:${location.key}`;
    if (traites.current.has(cle)) return;
    traites.current.add(cle);
    params.delete("rappel"); params.delete("il-me-rappelle");
    navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "", hash: location.hash }, { replace: true });
    // Un échange raconté à Haka dans le chat (19 oct. 2026) : son lien rouvre l'écran là où il en est.
    if (id) reprendre.mutate(id); else demarrer();
  }, [location.search]);
  useEffect(() => () => { couper(); clearInterval(minuteur.current); clearInterval(compte.current); }, []);

  // --- Stop : la transcription se termine, AK propose qui a appelé ---------------------------------
  const stop = useMutation({
    mutationFn: async (note = null) => {
      couper();
      clearInterval(minuteur.current);
      setEcran("transcription");
      const t0 = Date.now();
      await new Promise((ok) => setTimeout(ok, 400));
      while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 20000) await new Promise((ok) => setTimeout(ok, 250));
      if (!idRef.current) { const r = await base44.request("POST", API, { body: { sens, essai } }); idRef.current = r.rappel.id; }
      const f = new FormData();
      f.append("morceaux", JSON.stringify(morceaux.current.map((x) => (x.etat === "ok" ? x.texte || "" : x.wav ? null : ""))));
      morceaux.current.filter((x) => x.etat !== "ok" && x.wav).forEach((x, k) => f.append("audio", x.wav, `m${k}.wav`));
      f.append("notes", notes);
      if (note) f.append("note_vocale", note);
      f.append("duree_s", String(Math.round((Date.now() - debut.current) / 1000)));
      return base44.request("POST", `${API}/${idRef.current}/fin`, { body: f, isForm: true });
    },
    // Identifié pendant l'appel, ou choisi avant (appel rapide) : l'analyse part tout de suite.
    onSuccess: (r) => {
      setRappel(r.rappel); setNotes(r.rappel.notes || "");
      if (r.rappel.etat === "identifie") { analyser.mutate({}); return; }
      // Personne dans le carnet ne correspond à la note : le nouveau contact est déjà rempli avec ce qu'elle dit.
      if (r.rappel.nouveau_propose && !(r.rappel.candidats || []).length) setNouveau({ ...r.rappel.nouveau_propose });
      setEcran("identification");
    },
    onError: (e) => { setErreur(erreurReseau(e) ? "Pas de réseau : l'appel est gardé à l'écran, réessayez au retour du réseau." : e?.message || "La transcription a échoué."); setEcran("identification"); },
  });

  // Stop : l'appel s'arrête, puis la note vocale (21 oct. 2026). Sauf si l'on sait déjà qui c'est (appel rapide, ou
  // choisi pendant l'appel), pour un échange raconté (les notes sont la note) ou sans micro.
  const arreter = () => {
    if (sens === "raconte" || microKo) { stop.mutate(); return; }
    // Déjà identifié (appel rapide, ou choisi pendant l'appel) : la note de cinq secondes, facultative (21 oct. 2026).
    if (rappel?.etat === "identifie") { couper(); clearInterval(minuteur.current); setEcran("note-courte"); return; }
    couper();
    clearInterval(minuteur.current);
    setNoteVocale("");
    setEcran("note");
    if (dicteeNote.supporte) dicteeNote.demarrer();
  };

  // Les notes : enregistrées en partant du champ ; tant que l'agent n'est pas confirmé, les candidats se recalculent.
  const garderNotes = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${rappel.id}/notes`, { body: { notes } }),
    onSuccess: (r) => setRappel(r.rappel),
  });

  // --- L'agent ---------------------------------------------------------------------------------------
  const trouves = useQuery({ queryKey: ["rappel-chercher", recherche], queryFn: () => base44.request("GET", `${API}/chercher?q=${encodeURIComponent(recherche)}${idRef.current ? `&rappel=${idRef.current}` : ""}`), enabled: ["identification", "enregistrement", "choix"].includes(ecran) && recherche.trim().length >= 2 });
  // Les appels déjà faits par l'équipe (13 oct. 2026, Jules) : les derniers d'abord, à chercher par nom ou numéro.
  const appelsFaits = useQuery({ queryKey: ["rappel-appels", rechercheAppels], queryFn: () => base44.request("GET", `${API}/appels?q=${encodeURIComponent(rechercheAppels)}`), enabled: ecran === "identification" });
  const [tousLesAppels, setTousLesAppels] = useState(false);
  // Comme le mode appel (21 oct. 2026) : les actions seules ; « Transcription » ouvre le reste à gauche.
  const [voirTranscription, setVoirTranscription] = useState(false);
  const [chercherAilleurs, setChercherAilleurs] = useState(false);
  // Appel rapide : vos personnes du jour (à relancer, à rappeler) ; en essai, les agences de la liste fictive.
  const jour = useQuery({ queryKey: ["prospection-aujourdhui", false], queryFn: () => base44.request("GET", "/api/prospection/aujourdhui"), enabled: ecran === "choix" && !essai });
  const fictives = useQuery({ queryKey: ["rappel-essai-agences", rappel?.id], queryFn: () => base44.request("GET", `${API}/chercher?q=&rappel=${idRef.current}`), enabled: ecran === "choix" && essai && !!rappel?.id });
  const suggestions = essai ? fictives.data?.resultats || []
    : [...(jour.data?.relancer || []), ...(jour.data?.rappeler || [])].slice(0, 8).map((l) => ({ cle: l.id, agent_id: l.id, agence_id: null, nom: l.nom, agence: l.agence, ville: l.ville, telephone: l.telephone, raison: l.quoi }));
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
      const id = idRef.current || rappel?.id;
      if (!id) throw new Error("L'appel se crée encore : réessayez dans une seconde.");
      if (ecranRef.current !== "enregistrement" && notes !== (rappel?.notes || "")) await base44.request("POST", `${API}/${id}/notes`, { body: { notes } });
      return base44.request("POST", `${API}/${id}/identifier`, { body: corps });
    },
    // Pendant l'appel ou avant un appel rapide : la personne est notée, l'analyse attendra le Stop.
    onSuccess: (r) => { setRappel(r.rappel); setNouveau(null); setRecherche(""); setRechercheAppels(""); if (!["enregistrement", "choix"].includes(ecranRef.current)) analyser.mutate({}); },
    onError: (e) => toast.error(e?.message || "Identification impossible"),
  });
  const confirmer = (c) => identifier.mutate({ agent_id: c.agent_id, agence_id: c.agence_id, monday_ligne_id: c.monday_ligne_id || null });
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
      return base44.request("POST", `${MA}/appels/${appel.id}/valider`, { body: { choix: [...coches], mail: coches.has("mail") ? mail : null, relance_le: relanceLe, relance2_le: relance2Le, monday_ligne: ligneMonday, monday_cases: edits?.monday && Object.keys(edits.monday).length ? edits.monday : null, note: "", cle, session_id: null, issue, corrections } });
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

  // « Pas la bonne personne » (19 oct. 2026) : on revient au choix, l'appel et ses notes restent ; la nouvelle analyse remplacera l'ancienne.
  const reidentifier = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${idRef.current || rappel.id}/reidentifier`),
    // « Pas la bonne personne » : la note s'est trompée de fiche, on cherche dans le carnet.
    onSuccess: (r) => { setRappel(r.rappel); setAppel(null); setChercherAilleurs(true); setEcran(ecranRef.current === "enregistrement" ? "enregistrement" : "identification"); },
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
      idRef.current = rp.id; setRappel(rp); setNotes(rp.notes || ""); setOuvert(true); setSens(rp.sens || "entrant"); setEssai(!!rp.essai);
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
    // « Manon de l'agence Primo Immobilier », « Paul de chez Foncia » : le prénom et l'agence, tels que dits (19 oct. 2026).
    const pres = t.match(/(\p{Lu}[\p{L}'-]+)\s+(?:de\s+l'agence|de\s+chez|de\s+l'|chez)\s+((?:\p{Lu}[\p{L}'&-]*)(?:\s+\p{Lu}[\p{L}'&-]*){0,3})/u);
    setNouveau({ agence_id: null, agence: pres?.[2] || "", ville: "", nom: nom || pres?.[1] || "", telephone: tel, email });
  };

  // --- Rendu -----------------------------------------------------------------------------------------
  const bandeau = !ouvert && enAttente && createPortal(
    <div className="fixed bottom-[calc(16px+var(--k-bas-mobile,0px)+var(--k-bas-chat,0px))] left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full border border-ambre/50 bg-surface-pleine px-4 py-2 shadow-[0_18px_40px_rgb(0_0_0/0.18)] md:left-[calc(50%+var(--k-barre-largeur,0px)/2)]">
      <PhoneIncoming className="h-4 w-4 flex-none text-ambre" />
      <span className="min-w-0 truncate text-[14px] text-encre">Appel à terminer · {enAttente.agent || "agent à identifier"}</span>
      <button type="button" onClick={() => reprendre.mutate(enAttente.id)} disabled={reprendre.isPending} className="h-8 flex-none rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Reprendre</button>
    </div>,
    document.body,
  );

  if (!ouvert) return bandeau || null;
  const IconeSens = SENS[sens].icone;

  const zoneNotes = (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between gap-2">
        <span className={etiquette}>NOTES</span>
        {dictee.supporte && (sens === "raconte" || (ecran !== "enregistrement" && ecran !== "transcription")) && (
          <button type="button" onClick={(e) => { e.preventDefault(); dicter(); }} aria-label={dictee.ecoute ? "Arrêter la dictée" : "Dicter les notes"} title={dictee.ecoute ? "Arrêter la dictée" : "Dicter les notes"}
            className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${dictee.ecoute ? "bg-menthe text-sur-menthe" : "text-ardoise hover:bg-relief hover:text-encre"}`} style={dictee.ecoute ? undefined : { background: "transparent" }}>
            {dictee.ecoute ? <Square className="h-3 w-3" fill="currentColor" /> : dictee.finalisation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
      </span>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (rappel?.id && ecran !== "enregistrement" && notes !== (rappel.notes || "")) garderNotes.mutate(); }} rows={4}
        placeholder={sens === "raconte" ? "« Martin d'ERA Cannes m'a écrit : le bail est renouvelé, il m'envoie le dossier lundi »" : "Ce que le micro capte mal : email, numéro, orthographe d'un nom, une précision"} className={CHAMP_CARTE} />
      {(rappel?.notes_avertissements || []).map((x) => <span key={x} className="text-[12.5px] text-ambre">{x}</span>)}
    </label>
  );
  // Pendant l'appel : le panneau du mode appel, à l'identique (13 oct. 2026). Après : la transcription finale.
  const transcription = sens === "raconte" ? null : ecran === "enregistrement" || ecran === "transcription" ? (
    <PanneauTranscription direct={direct} notes={!microKo} fin={finDirect} enDirect tape />
  ) : (
    <div className="flex min-h-[120px] flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
      <span className={etiquette}>TRANSCRIPTION</span>
      {rappel?.transcription ? <p className="m-0 max-h-[320px] overflow-y-auto whitespace-pre-line text-[14.5px] leading-[1.55] text-craie">{rappel.transcription}</p>
        : <p className="m-0 text-[14px] text-brume">{microKo ? "Pas d'enregistrement : écrivez l'essentiel dans les notes." : "Rien n'a été entendu."}</p>}
      {rappel?.transcription_echec && <p className="m-0 text-[12.5px] text-ambre">Une partie n'a pas pu être transcrite.</p>}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-fond md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label={SENS[sens].titre}>
      {/* Le fond choisi dans les Paramètres, halo compris (21 oct. 2026, Jules) : le même que derrière les pages. */}
      {/* Cadré dans l'écran (transform) : le halo, fixe, ne déborde pas sur la barre de gauche. */}
      {haloVisible() && <div className="pointer-events-none absolute inset-0 overflow-hidden [transform:translateZ(0)]"><FondHalo /></div>}
      <div className="mx-auto relative z-[1] flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] md:px-6">
        {/* Le bandeau : qui appelle, une fois connu. */}
        {!((ecran === "enregistrement" && sens !== "raconte") || ecran === "note" || ecran === "note-courte") && (
        <div className="flex items-center justify-between gap-3 rounded-full border border-trait px-4 py-2.5">
          <span className="flex min-w-0 items-center gap-2.5 text-[14.5px]">
            <IconeSens className="h-4 w-4 flex-none text-menthe" />
            {essai && <span className="flex-none rounded-full bg-ambre/15 px-2.5 py-0.5 text-[12px] text-ambre">Essai</span>}
            <span className="min-w-0 truncate text-encre">{SENS[sens].titre} · {agent ? [agent.nom, agent.agence].filter(Boolean).join(" · ") : "agent à identifier"}</span>
          </span>
          {(sens === "raconte" || essai || ["essai", "choix"].includes(ecran) || (ecran !== "enregistrement" && ecran !== "transcription")) && (
            <button type="button" onClick={fermer} aria-label="Fermer : le rappel reste à terminer" title="Plus tard : le rappel reste dans le bandeau" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
          )}
        </div>)}
        {erreur && <p className="m-0 rounded-[14px] border border-ambre/40 px-4 py-2.5 text-[14px] text-ambre">{erreur}</p>}
        {(rappel?.avertissements || []).map((x) => (
          <div key={x.genre} className={`flex flex-wrap items-center justify-between gap-3 rounded-[14px] border px-4 py-3 ${x.genre === "ne_plus_appeler" ? "border-alerte/50 text-alerte" : "border-ambre/40 text-ambre"}`}>
            <span className="text-[15px]">{x.texte}</span>
            {x.genre === "ne_plus_appeler" && (confirmerLever
              ? <span className="flex gap-2"><button type="button" onClick={() => lever.mutate()} disabled={lever.isPending} className="h-9 rounded-full bg-alerte px-4 text-[13px] text-white disabled:opacity-50">Oui, il revient de lui-même</button><button type="button" onClick={() => setConfirmerLever(false)} className="h-9 rounded-full border border-trait px-3 text-[13px] text-ardoise" style={{ background: "transparent" }}>Non</button></span>
              : <button type="button" onClick={() => setConfirmerLever(true)} className="h-9 rounded-full border border-alerte/50 px-4 text-[13px] text-alerte" style={{ background: "transparent" }}>Lever le blocage</button>)}
          </div>
        ))}

        {/* Le choix d'un essai (19 oct. 2026) : un scénario joué, rien ne sort de la liste fictive. */}
        {ecran === "essai" && (
          <div className="grid gap-4 md:grid-cols-2">
            {[["entrant", "Il me rappelle"], ["sortant", "Appel rapide"]].map(([k, mot]) => (
              <div key={k} className="flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
                <span className={etiquette}>{mot.toUpperCase()}</span>
                {SCENARIOS_RAPPEL.filter((x) => x.sens === k).map((x) => (
                  <button key={x.cle} type="button" onClick={() => choisirScenario(x)} className="flex flex-col gap-0.5 rounded-[12px] border border-trait px-4 py-3 text-left transition-colors hover:border-bord-vif" style={{ background: "transparent" }}>
                    <span className="text-[15px] text-encre">{x.titre}</span>
                    <span className="text-[13px] leading-[1.45] text-ardoise">{x.aide}</span>
                  </button>
                ))}
              </div>
            ))}
            <p className="m-0 text-[13px] text-brume md:col-span-2">L'appel se joue phrase par phrase, Haka le lit pour de vrai. Tout reste dans la liste fictive : ni Monday, ni mail, ni carnet réel.</p>
          </div>
        )}

        {/* Appel rapide : qui appelez-vous ? On choisit, ou on crée, puis l'enregistrement part. */}
        {ecran === "choix" && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3 rounded-[18px] border border-bord-doux p-5">
              <span className={etiquette}>QUI APPELEZ-VOUS ?</span>
              <span className="flex items-center gap-2 rounded-full border border-trait bg-fond px-3.5 py-2 focus-within:border-menthe">
                <Search className="h-4 w-4 flex-none text-ardoise" />
                <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, agence, ou 4 derniers chiffres" aria-label="Chercher la personne" className="w-full border-0 bg-transparent text-[15px] text-encre outline-none" />
              </span>
              {(recherche.trim().length >= 2 ? trouves.data?.resultats || [] : suggestions).map((c) => (
                <Candidat key={c.cle} c={c} onConfirmer={(x) => choisirPuisLancer({ agent_id: x.agent_id, agence_id: x.agence_id })} occupe={identifier.isPending} libelle="Appeler" />
              ))}
              {recherche.trim().length >= 2 && trouves.data && !trouves.data.resultats.length && <span className="text-[13px] text-brume">Personne à ce nom ou ce numéro : créez le contact à droite.</span>}
            </div>
            <div className="flex min-w-0 flex-col gap-2 rounded-[18px] border border-bord-doux p-5">
              <span className={etiquette}>PAS EN BASE ?</span>
              <input value={nouveau?.nom || ""} onChange={(e) => setNouveau((x) => ({ agence_id: null, agence: "", ville: "", telephone: "", email: "", ...(x || {}), nom: e.target.value }))} placeholder="Nom de la personne" className={champ} />
              <input value={nouveau?.agence || ""} onChange={(e) => setNouveau((x) => ({ ville: "", nom: "", telephone: "", email: "", ...(x || {}), agence: e.target.value, agence_id: null }))} placeholder="Agence" className={champ} />
              {!essai && (nouveau?.agence || "").trim().length >= 2 && !nouveau?.agence_id && <ChoixAgence q={nouveau.agence} onChoisir={(g) => setNouveau((x) => ({ ...x, agence_id: g.agence_id, agence: g.agence, ville: g.ville || "" }))} />}
              <input value={nouveau?.telephone || ""} onChange={(e) => setNouveau((x) => ({ agence_id: null, agence: "", ville: "", nom: "", email: "", ...(x || {}), telephone: e.target.value }))} placeholder="Téléphone" inputMode="tel" className={champ} />
              <button type="button" onClick={() => choisirPuisLancer({ nouveau })} disabled={!nouveau?.nom?.trim() || identifier.isPending} className={`${principal} mt-1 self-start`}>Créer et appeler</button>
              <span className="text-[12.5px] text-brume">S'il existe déjà (même numéro, même nom dans la même agence), sa fiche est reprise.</span>
            </div>
          </div>
        )}

        {/* Pendant l'appel, comme au Mode appel : la transcription à gauche, le micro à droite ; on peut dire qui appelle sans attendre. */}
        {/* L'appel en cours, rappel ou appel rapide (maquette de Jules, 21 oct. 2026) : centré dès l'appel. */}
        {ecran === "enregistrement" && sens !== "raconte" && (() => {
          const dit = presentation(direct.filter((x) => x.texte).map((x) => x.texte).join(" "));
          const nom = agent?.nom || dit?.nom || (sens === "sortant" ? "Appel rapide" : "Appel entrant");
          const sous = agent ? [agent.agence, sens === "entrant" && !rappel?.identifie_par ? null : null].filter(Boolean).join(" · ") || null
            : dit ? `${dit.agence} · agent à confirmer` : "Il dira qui il est : la note d'après l'appel le confirme.";
          return (
            <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-7 duration-500 animate-in fade-in-0">
              <EnteteEnLigne etat={SENS[sens].titre} secondes={secondes} essai={essai} nom={nom} sousTitre={sous}
                ecoute={!microKo} onRaccrocher={arreter} occupe={stop.isPending} raccrocher={microKo ? "Analyser" : "Raccrocher"}
                action={sens === "sortant" && agent ? <button type="button" onClick={() => reidentifier.mutate()} disabled={reidentifier.isPending} className="ml-2 p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Changer</button> : null} />
              {agent?.telephone && sens === "sortant" && !essai && <p className="m-0 -mt-3 text-center text-[14px] text-ardoise">Composez le <span className="font-mono text-[16px] text-encre">{agent.telephone}</span></p>}
              {microKo && <p className="m-0 -mt-3 text-center text-[13.5px] text-ambre">Enregistrement pas lancé : écrivez l'essentiel dans les notes, puis Analyser.</p>}
              {!essai && tactile() && !microKo && <p className="m-0 -mt-3 text-center text-[12.5px] text-ambre">Au téléphone, pendant un appel, le micro est pris par l'appel : enregistrez depuis l'ordinateur en haut-parleur, ou écrivez l'essentiel dans les notes.</p>}
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <TranscriptionEnLigne morceaux={direct} interlocuteur={(agent?.nom || dit?.nom || "Agent").split(/\s+/)[0]} attend={!!scenario && direct.length < (scenario?.phrases?.length || 0)} />
                <div className="flex min-w-0 flex-col gap-5">
                  <CalculatriceEnLigne textes={[...direct.filter((x) => x.texte).map((x) => x.texte), notes]} />
                  <NotesEnLigne valeur={notes} onChange={setNotes} />
                </div>
              </div>
            </div>
          );
        })()}

        {ecran === "enregistrement" && sens === "raconte" && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
            <div className="flex min-w-0 flex-col gap-4">{transcription}{zoneNotes}</div>
            <div className="flex min-w-0 flex-col">
            <div className={`flex flex-col items-center gap-4 px-5 py-8 ${CARTE}`}>
              {agent?.telephone && sens === "sortant" && !essai && <span className="text-center text-[14px] text-ardoise">Composez le <span className="font-mono text-[18px] text-encre">{agent.telephone}</span></span>}
              {microKo ? (
                <>
                  <span className={`text-[15px] ${sens === "raconte" ? "text-encre" : "text-ambre"}`}>{sens === "raconte" ? "Ce que l'agent a dit" : "Enregistrement pas lancé"}</span>
                  <span className="max-w-[300px] text-center text-[13.5px] text-ardoise">{sens === "raconte" ? "Écrivez ou dictez l'échange dans les notes, avec le nom de l'agent, puis Analyser." : "Écrivez l'essentiel dans les notes, puis Analyser."}</span>
                </>
              ) : (
                <>
                  <MicroEcoute taille={220}><Mic className="h-11 w-11" strokeWidth={1.8} /></MicroEcoute>
                  <span className="font-mono text-[28px] tabular-nums text-encre">{chrono(secondes)}</span>
                </>
              )}
              
              {!essai && sens !== "raconte" && tactile() && <span className="max-w-[300px] text-center text-[12.5px] leading-[1.45] text-ambre">Au téléphone, pendant un appel, le micro est pris par l'appel : enregistrez depuis l'ordinateur en haut-parleur, ou écrivez l'essentiel dans les notes.</span>}
            </div>
              {/* Pendant un rappel entrant, plus de « Qui appelle ? » (21 oct. 2026, Jules) : la note d'après l'appel le dit.
                  L'appel rapide garde « Vous appelez » : on sait déjà qui. */}
              {sens === "sortant" && <TraitAppel moment="En ligne" />}
              {sens === "sortant" && (
                <div className="flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
                  <span className={etiquette}>VOUS APPELEZ</span>
                  {agent ? (
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-[15px] text-encre">{[agent.nom, agent.agence].filter(Boolean).join(" · ")}</span>
                      <button type="button" onClick={() => reidentifier.mutate()} disabled={reidentifier.isPending} className="flex-none p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Changer</button>
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center gap-2 rounded-full border border-trait bg-fond px-3.5 py-2 focus-within:border-menthe">
                        <Search className="h-4 w-4 flex-none text-ardoise" />
                        <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Dès qu'il dit son nom ou son agence" aria-label="Qui appelle" className="w-full border-0 bg-transparent text-[15px] text-encre outline-none" />
                      </span>
                      {(trouves.data?.resultats || []).slice(0, 4).map((c) => <Candidat key={c.cle} c={c} onConfirmer={confirmer} occupe={identifier.isPending} libelle="C'est lui" />)}
                      <span className="text-[12.5px] text-brume">Sinon, Haka propose qui c'est au Stop.</span>
                    </>
                  )}
                </div>
              )}
              <TraitAppel moment="Fin de l'appel" />
              <button type="button" onClick={arreter} disabled={stop.isPending} className={`${GROS_BOUTON} ${sens === "raconte" ? "bg-menthe text-sur-menthe" : "bg-alerte text-white"}`}>{microKo ? "Analyser" : "Stop"}</button>
            </div>
          </div>
        )}

        {ecran === "note-courte" && <NoteApresAppel onFin={(note) => stop.mutate(note || null)} />}
        {ecran === "note" && (
          <div className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-5 py-4 text-center">
            <p className="m-0 text-[24px] font-normal tracking-[-0.01em] text-encre">Qui c'était, et que faut-il faire ?</p>
            <p className="m-0 max-w-[480px] text-[14px] leading-[1.55] text-ardoise">En une quinzaine de secondes : le nom, l'agence, et la suite (un mail, une relance, un rendez-vous). C'est votre note qui fait foi, pas la transcription.</p>
            {dicteeNote.supporte && (
              <button type="button" onClick={() => (dicteeNote.ecoute ? dicteeNote.arreter() : dicteeNote.demarrer())} aria-label={dicteeNote.ecoute ? "Arrêter la note" : "Dicter la note"} className="rounded-full" style={{ background: "transparent" }}>
                {dicteeNote.ecoute
                  ? <MicroEcoute taille={150}><Square className="h-8 w-8" fill="currentColor" /></MicroEcoute>
                  : <span className="grid h-[110px] w-[110px] place-items-center rounded-full border-2 border-menthe text-menthe transition-colors hover:bg-menthe/10">{dicteeNote.finalisation ? <Loader2 className="h-8 w-8 animate-spin" /> : <Mic className="h-9 w-9" strokeWidth={1.8} />}</span>}
              </button>
            )}
            <textarea value={noteVocale} onChange={(e) => setNoteVocale(e.target.value)} rows={3}
              placeholder="« C'était Manon, de Primo Immobilier à Lyon. Elle veut le dossier à lyon@agence.com, relance dans quinze jours. »"
              className={`${CHAMP_CARTE} text-left`} />
            <button type="button" disabled={noteVocale.trim().length < 5 || dicteeNote.finalisation || stop.isPending}
              onClick={() => { if (dicteeNote.ecoute) dicteeNote.arreter(); stop.mutate(noteVocale.trim()); }}
              className={`${GROS_BOUTON} max-w-[420px] bg-encre text-fond`}>Valider la note</button>
          </div>
        )}
        {ecran === "transcription" && <ChaineEtapes etapes={[noteVocale.trim() ? "Je lis votre note et je retrouve la fiche" : "Je termine la transcription et je cherche qui a appelé"]} titre="Haka lit l'appel" />}

        {/* Qui a appelé : trois candidats au plus, chercher, ou un nouveau contact. */}
        {/* Une note dite, mais personne d'unique dans le carnet : les fiches qui correspondent à la note, ou un seul bouton
            pour créer le contact qu'elle décrit (21 oct. 2026, Jules : « juste un bouton »). Chercher ailleurs reste possible. */}
        {ecran === "identification" && rappel?.note_vocale && !chercherAilleurs && (
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-3">
            <p className="m-0 text-[14px] leading-[1.55] text-ardoise">Votre note : <span className="text-craie">« {rappel.note_vocale} »</span></p>
            {candidats.length > 0 && (
              <div className="flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
                <span className={etiquette}>{candidats.length > 1 ? "LEQUEL ?" : "C'EST ELLE OU LUI ?"}</span>
                {candidats.map((c, i) => <Candidat key={c.cle} c={c} premier={i === 0 && candidats.length === 1} onConfirmer={confirmer} occupe={identifier.isPending} />)}
              </div>
            )}
            {(() => {
              const n = nouveau || rappel.nouveau_propose;
              if (!n?.nom) return <p className="m-0 text-[14px] text-brume">La note ne dit pas de nom : cherchez la fiche, ou dictez une note plus précise.</p>;
              return (
                <button type="button" onClick={() => identifier.mutate({ nouveau: { agence_id: null, agence: "", ville: "", telephone: "", email: "", ...n } })} disabled={identifier.isPending}
                  className={`${candidats.length ? secondaire : principal} self-start`} style={candidats.length ? { background: "transparent" } : undefined}>
                  {identifier.isPending ? "Création…" : `Créer le contact : ${[n.nom, n.agence].filter(Boolean).join(" · ")}`}
                </button>
              );
            })()}
            <span className="flex flex-wrap gap-x-5 gap-y-2">
              <button type="button" onClick={() => setChercherAilleurs(true)} className="p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Chercher dans le carnet</button>
              <button type="button" onClick={() => abandonner.mutate()} disabled={abandonner.isPending} className="p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Abandonner ce rappel</button>
            </span>
          </div>
        )}
        {ecran === "identification" && rappel && (!rappel.note_vocale || chercherAilleurs) && (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">{transcription}{zoneNotes}</div>
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
                <span className={etiquette}>QUI A APPELÉ</span>
                {candidats.length ? candidats.map((c, i) => <Candidat key={c.cle} c={c} premier={i === 0} onConfirmer={confirmer} occupe={identifier.isPending} />)
                  : <p className="m-0 text-[14px] text-brume">Aucun candidat : cherchez-le, ou créez le contact.</p>}
              </div>
              {/* Un appel déjà fait : celui qu'il rappelle, retrouvé en un clic, même passé par un collègue. */}
              <div className="flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
                <span className={etiquette}>APPELS DÉJÀ FAITS</span>
                <span className="flex items-center gap-2 rounded-full border border-trait bg-fond px-3.5 py-2 focus-within:border-menthe">
                  <Search className="h-4 w-4 flex-none text-ardoise" />
                  <input value={rechercheAppels} onChange={(e) => setRechercheAppels(e.target.value)} placeholder="Agence, agent, ville ou 4 derniers chiffres" aria-label="Chercher dans les appels déjà faits" className="w-full border-0 bg-transparent text-[15px] text-encre outline-none max-md:text-[16px]" />
                </span>
                {(appelsFaits.data?.resultats || []).slice(0, tousLesAppels || rechercheAppels.trim() ? 12 : 4).map((c) => <Candidat key={c.cle} c={c} onConfirmer={confirmer} occupe={identifier.isPending} />)}
                {!rechercheAppels.trim() && !tousLesAppels && (appelsFaits.data?.resultats || []).length > 4 && <button type="button" onClick={() => setTousLesAppels(true)} className="self-start p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Voir plus d'appels</button>}
                {appelsFaits.data && !appelsFaits.data.resultats.length && <span className="text-[13px] text-brume">{rechercheAppels.trim() ? "Aucun appel à ce nom ou ce numéro sur les trente derniers jours." : "Aucun appel sur les trente derniers jours."}</span>}
              </div>
              <div className="flex flex-col gap-2 rounded-[18px] border border-bord-doux px-[18px] py-4">
                <span className={etiquette}>TOUT LE CARNET</span>
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
          // Le même écran que le mode appel (21 oct. 2026, Jules) : les actions seules au centre ; « Transcription » les fait
          // glisser à droite et montre à gauche la transcription et les notes. Plus de « Compris », plus de colonne de gauche.
          <div className={`grid gap-y-4 duration-500 animate-in fade-in-0 slide-in-from-bottom-3 md:transition-[grid-template-columns,column-gap] md:duration-700 md:ease-[cubic-bezier(.22,1,.36,1)] max-md:grid-cols-1 ${voirTranscription ? "md:grid-cols-[1fr_1fr] md:gap-x-4" : "md:grid-cols-[0fr_1fr] md:gap-x-0"}`}>
            <div className={`flex min-w-0 flex-col gap-4 overflow-hidden transition-opacity duration-500 max-md:order-last ${voirTranscription ? "opacity-100 delay-200" : "pointer-events-none opacity-0 max-md:hidden"}`} aria-hidden={!voirTranscription}>
              {voirTranscription && (<>
                {appel && <ChaineRepliee etapes={etapesFinies} />}
                {transcription}
                {zoneNotes}
                {notesChangees && <button type="button" onClick={() => reanalyser.mutate()} disabled={reanalyser.isPending} className={`${secondaire} self-start`} style={{ background: "transparent" }}>Ré-analyser</button>}
              </>)}
            </div>
            <div className="mx-auto flex w-full min-w-0 max-w-[680px] flex-col gap-3">
              <button type="button" onClick={() => setVoirTranscription((x) => !x)} aria-pressed={voirTranscription}
                className={`inline-flex h-8 items-center gap-1.5 self-start rounded-full border px-3 text-[13px] transition-colors ${voirTranscription ? "border-menthe/60 text-menthe" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
                <AudioLines className="h-3.5 w-3.5" />Transcription
              </button>
              {!appel || analyser.isPending || reanalyser.isPending ? (
                <ChaineEtapes etapes={chaine.etapes} />
              ) : (
                <SequenceActions appel={appel} agence={{ nom: agent?.agence || appel.agence }} issue={issue} coches={coches} setCoches={setCoches} mail={mail} setMail={setMail}
                  relanceLe={relanceLe} setRelanceLe={setRelanceLe} relance2Le={relance2Le} setRelance2Le={setRelance2Le} ligneMonday={ligneMonday} setLigneMonday={setLigneMonday}
                  edits={edits} setEdits={setEdits}
                  onChangerIssue={(k) => (["pas_de_reponse", "repondeur"].includes(k) ? toast.error("Il vous a appelé : ce n'est pas un sans-réponse") : analyser.mutate({ issue: k, remplace: appel.id }))} changementEnCours={analyser.isPending}
                  onLancer={() => (agent ? valider.mutate() : toast.error("Confirmez d'abord l'agent"))} envoi={valider.isPending} />
              )}
              <span className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                {sens !== "raconte" && <button type="button" onClick={() => reidentifier.mutate()} disabled={reidentifier.isPending || analyser.isPending} className="p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Pas la bonne personne</button>}
                <button type="button" onClick={() => abandonner.mutate()} disabled={abandonner.isPending} className="p-0 text-[13px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Abandonner ce rappel</button>
              </span>
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
