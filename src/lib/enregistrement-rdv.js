import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { versWav } from "@/lib/dictee";
import { ouvrirTranscriptionDirecte } from "@/lib/transcription-directe";

// Le mode Enregistrement de l'assistant (20 nov. 2026, Jules : un rendez-vous, un appel ; les fiches se mettent à jour
// pendant la conversation). La mécanique de Suivi > Réunion : le micro coupe des morceaux de trente secondes, chacun
// part aussitôt être transcrit et gardé côté serveur à son rang ; un morceau raté se renvoie, trois fois ; l'écran
// reste allumé. Rechargée en route, la page retrouve l'enregistrement ouvert et le reprend au morceau suivant.
// En plus, sur le même micro, la transcription en direct du mode appel (20 nov. 2026, Jules : « je veux que la
// transcription arrive directement, que ça fonctionne vraiment comme le mode appel ») : les mots s'écrivent dans le chat
// au fil de la parole ; les morceaux de trente secondes restent ce que le serveur garde et range.

const A = "/api/fiche-dossier/enregistrements";
const DUREE_MORCEAU_MS = 30000;
const ESSAIS = 3;
const CLE = "klocka.enregistrement-rdv";

const memoriser = (v) => { try { if (v) localStorage.setItem(CLE, JSON.stringify(v)); else localStorage.removeItem(CLE); } catch { /* sans stockage, pas de reprise */ } };

/**
 * @returns {{ etat: "repos"|"ecoute"|"fin", id: string|null, secondes: number, caracteres: number, erreur: string|null,
 *   demarrer: (reprise?: object) => Promise<string|null>, terminer: () => Promise<string|null>, abandonner: () => Promise<void>, ouvert: object|null, oublierOuvert: () => void }}
 */
export function useEnregistrementRdv() {
  const [etat, setEtat] = useState("repos");
  const [id, setId] = useState(null);
  const [secondes, setSecondes] = useState(0);
  const [caracteres, setCaracteres] = useState(0);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const rec = useRef(null);
  const envois = useRef(new Set());
  const chrono = useRef(null);
  const verrou = useRef(null);
  const direct = useRef(null);
  const [texteDirect, setTexteDirect] = useState("");
  const [etatDirect, setEtatDirect] = useState("attente"); // attente, pret, coupe
  // Le direct qui se tait en route (20 nov. 2026, Jules : « je ne voyais plus les nouvelles phrases, j'ai cru que ça avait
  // coupé ; à la fin, tout était là ») : la session temps réel peut se fermer ou ne plus rien rendre, pendant que les
  // morceaux de trente secondes continuent. Il se rouvre seul, le texte d'avant gardé ; s'il ne revient pas, le chat
  // montre les passages de trente secondes à la place.
  const baseDirect = useRef("");
  const courantDirect = useRef("");
  const dernierMot = useRef(0);
  const dernierPassage = useRef(0);
  const relances = useRef(0);
  const veille = useRef(null);
  const [passages, setPassages] = useState([]);
  // Le niveau du micro, lu à chaque image par les rubans de la carte (20 nov. 2026, Jules : « les lignes qui bougent,
  // comme dans le mode appel ») : { niveau (RMS), qui }, hors de React.
  const voix = useRef({ niveau: 0, qui: "vous" });

  // Un enregistrement resté ouvert (page fermée, rechargée) : proposé à la reprise.
  useEffect(() => {
    let vivant = true;
    base44.request("GET", `${A}/en-cours`).then((r) => { if (vivant && r?.enregistrement) setOuvert(r.enregistrement); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  const envoyer = useCallback(async (idEnr, i, blob, type) => {
    let wav;
    try { wav = await versWav(new Blob(blob, { type }), 16000); } catch { return; }
    for (let essai = 1; essai <= ESSAIS; essai += 1) {
      try {
        const f = new FormData();
        f.append("i", String(i));
        f.append("audio", wav, `m${i}.wav`);
        const r = await base44.request("POST", `${A}/${idEnr}/morceau`, { body: f, isForm: true });
        if (r?.enregistrement) setCaracteres(r.enregistrement.caracteres || 0);
        if (String(r?.texte || "").trim().length > 15) dernierPassage.current = Date.now();
        setPassages((l) => [...l.filter((x) => x.i !== i), { i, texte: String(r?.texte || "").trim() }].sort((a, b) => a.i - b.i));
        setErreur(null);
        return;
      } catch (e) {
        if (essai === ESSAIS) setErreur(e?.message || "Un passage n'a pas été transcrit.");
        else await new Promise((ok) => setTimeout(ok, 1500 * essai));
      }
    }
  }, []);

  const arreterMicro = (jeter = false) => {
    const r0 = rec.current;
    if (!r0) return;
    r0.actif = false;
    if (jeter) r0.jeter = true;
    clearTimeout(r0.minuterie);
    if (r0.m?.state === "recording") r0.m.stop(); else r0.flux?.getTracks().forEach((t) => t.stop());
    clearInterval(chrono.current);
    clearInterval(veille.current);
    const d = direct.current;
    direct.current = null;
    d?.arreter?.().catch?.(() => {});
    r0.ctx?.close?.().catch?.(() => {});
    voix.current = { niveau: 0, qui: "vous" };
    verrou.current?.release?.().catch?.(() => {});
    verrou.current = null;
  };
  useEffect(() => () => arreterMicro(true), []);

  /** Lance l'écoute ; `reprise` : l'enregistrement ouvert à continuer. Rend son id, ou null si le micro est refusé. */
  const demarrer = useCallback(async (reprise = null) => {
    setErreur(null);
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } }); } catch { setErreur("Micro indisponible : autorise-le dans le navigateur."); return null; }
    let e = reprise;
    if (!e) {
      try { e = (await base44.request("POST", A))?.enregistrement; } catch (x) { flux.getTracks().forEach((t) => t.stop()); setErreur(x?.message || "L'enregistrement n'a pas pu démarrer."); return null; }
    }
    const idEnr = e.id;
    let i = e.prochain || 0;
    const r0 = { flux, actif: true, jeter: false, m: null, minuterie: null };
    rec.current = r0;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(flux).connect(an);
      const buf = new Float32Array(an.fftSize);
      r0.ctx = ctx;
      voix.current = { qui: "vous", get niveau() { an.getFloatTimeDomainData(buf); let t = 0; for (const x of buf) t += x * x; return Math.sqrt(t / buf.length); } };
    } catch { /* les rubans restent calmes */ }
    setTexteDirect(""); setEtatDirect("attente"); setPassages([]);
    baseDirect.current = ""; courantDirect.current = ""; relances.current = 0;
    dernierMot.current = Date.now(); dernierPassage.current = 0;
    const ouvrirDirect = () => {
      const base = baseDirect.current;
      const d = ouvrirTranscriptionDirecte(flux, {
        onTexte: (t) => {
          dernierMot.current = Date.now();
          courantDirect.current = [base, t].filter(Boolean).join(" ");
          setTexteDirect(courantDirect.current);
        },
        onEtat: (x) => {
          if (direct.current !== d) return;
          if (x === "pret") { setEtatDirect("pret"); return; }
          relancerDirect();
        },
      });
      direct.current = d;
      if (!d) relancerDirect();
    };
    // Rouvert après une seconde, vingt fois au plus ; au-delà, les passages de trente secondes prennent le relais.
    const relancerDirect = () => {
      const ancien = direct.current;
      direct.current = null;
      ancien?.arreter?.().catch?.(() => {});
      if (!r0.actif) return;
      baseDirect.current = courantDirect.current;
      relances.current += 1;
      if (relances.current > 20) { setEtatDirect("coupe"); return; }
      setTimeout(() => { if (r0.actif && !direct.current) { dernierMot.current = Date.now(); ouvrirDirect(); } }, 1000);
    };
    ouvrirDirect();
    // Le direct ouvert mais muet alors que les passages, eux, rapportent des phrases : il est rouvert.
    clearInterval(veille.current);
    veille.current = setInterval(() => {
      if (!r0.actif || !direct.current) return;
      if (Date.now() - dernierMot.current > 25000 && Date.now() - dernierPassage.current < 35000) relancerDirect();
    }, 5000);
    const tour = () => {
      if (!r0.actif) { flux.getTracks().forEach((t) => t.stop()); return; }
      const bouts = [];
      const m = new MediaRecorder(flux);
      r0.m = m;
      m.ondataavailable = (ev) => { if (ev.data?.size) bouts.push(ev.data); };
      m.onstop = () => {
        if (r0.actif) tour(); else flux.getTracks().forEach((t) => t.stop());
        if (r0.jeter || !bouts.length) return;
        const p = envoyer(idEnr, i, bouts, m.mimeType || "audio/webm");
        i += 1;
        envois.current.add(p);
        p.finally(() => envois.current.delete(p));
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, DUREE_MORCEAU_MS);
    };
    tour();
    const depuis = reprise?.debut && reprise?.morceaux ? reprise.morceaux * 30 : 0;
    setSecondes(depuis);
    chrono.current = setInterval(() => setSecondes((s) => s + 1), 1000);
    try { verrou.current = await navigator.wakeLock?.request?.("screen"); } catch { /* l'écran peut s'éteindre */ }
    memoriser({ id: idEnr });
    setOuvert(null);
    setId(idEnr);
    setCaracteres(e.caracteres || 0);
    setEtat("ecoute");
    return idEnr;
  }, [envoyer]);

  /** Coupe le micro, attend les derniers morceaux (quarante secondes au plus), ferme l'enregistrement ; rend son id. */
  const terminer = useCallback(async () => {
    if (!id) return null;
    setEtat("fin");
    arreterMicro(false);
    const t0 = Date.now();
    await new Promise((ok) => setTimeout(ok, 500));
    while (envois.current.size && Date.now() - t0 < 40000) await Promise.race([...envois.current, new Promise((ok) => setTimeout(ok, 500))]);
    try { await base44.request("POST", `${A}/${id}/fin`, { body: {} }); } catch { /* le texte reste lisible */ }
    memoriser(null);
    const fini = id;
    setEtat("repos"); setId(null);
    return fini;
  }, [id]);

  const abandonner = useCallback(async (cible = null) => {
    const idEnr = cible || id;
    arreterMicro(true);
    if (idEnr) { try { await base44.request("POST", `${A}/${idEnr}/fin`, { body: { abandon: true } }); } catch { /* rien */ } }
    memoriser(null);
    setOuvert(null);
    setEtat("repos"); setId(null); setSecondes(0); setCaracteres(0); setTexteDirect("");
  }, [id]);

  const oublierOuvert = useCallback(() => { setOuvert(null); memoriser(null); }, []);
  // Ce que le chat montre : le direct, ou les passages de trente secondes quand le direct n'a pas pu revenir.
  const textePassages = passages.map((x) => x.texte).filter(Boolean).join(" ");
  const montre = etatDirect === "coupe" ? textePassages : texteDirect;
  return { etat, id, secondes, caracteres, erreur, demarrer, terminer, abandonner, ouvert, oublierOuvert, direct: montre, etatDirect, voix };
}
