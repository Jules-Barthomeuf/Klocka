import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mic, Square, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";
import MicroEcoute from "@/components/prospection/MicroEcoute";
import { versWav } from "@/lib/dictee";
import { toast } from "@/components/ui/avis";

// Suivi > Réunion (14 oct. 2026, Jules : « enregistrer une réunion, qui va
// durer longtemps ; ça va nourrir le Cerveau »).
//
// Le micro coupe des morceaux de trente secondes ; chacun part aussitôt être
// transcrit, et son texte est gardé côté serveur à son rang. Un morceau raté
// se renvoie, trois fois. La page fermée ou rechargée, la réunion reprend où
// elle en était. L'écran reste allumé pendant l'enregistrement. À la fin, la
// transcription entre dans le Cerveau comme un compte rendu, et ses faits
// attendent la validation de Jules. L'audio n'est jamais gardé.

const A = "/api/monitoring/reunions";
const DUREE_MORCEAU_MS = 30000;
const ESSAIS = 3;
const ETATS = { enregistrement: "En cours", envoyee: "Dans le Cerveau", abandonnee: "Abandonnée", vide: "Rien de transcrit" };
const chrono = (s) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)} h ` : ""}${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min ${String(s % 60).padStart(2, "0")}`;
const duree = (s) => (s == null ? "—" : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`);
const quand = (iso) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const champ = "w-full rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";

export default function SuiviReunion() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ["reunions"], queryFn: () => base44.request("GET", A) });
  const [reunion, setReunion] = useState(null);
  const [titre, setTitre] = useState("");
  const [participants, setParticipants] = useState("");
  const [notes, setNotes] = useState("");
  const [enregistre, setEnregistre] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [direct, setDirect] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [confirmerAbandon, setConfirmerAbandon] = useState(false);
  const [microKo, setMicroKo] = useState(false);
  const rec = useRef(null);
  const morceaux = useRef([]);
  const prochain = useRef(0);
  const verrou = useRef(null);
  const fil = useRef(null);
  const montrer = () => setDirect(morceaux.current.map((x) => ({ i: x.i, texte: x.texte, etat: x.etat })));

  // Une réunion restée en cours (page fermée, onglet planté) : on la retrouve, avec ce qui était transcrit.
  useEffect(() => {
    const e = data?.en_cours;
    if (!e || reunion) return;
    setReunion(e); setTitre(e.titre || ""); setParticipants(e.participants || ""); setNotes(e.notes || "");
    morceaux.current = e.morceaux.map((m) => ({ i: m.i, texte: m.texte, etat: "ok" }));
    prochain.current = e.prochain;
    setSecondes(Math.max(0, Math.round((Date.now() - Date.parse(e.debut)) / 1000)));
    montrer();
  }, [data, reunion]);

  // Le chronomètre, depuis le début de la réunion.
  useEffect(() => {
    if (!enregistre || !reunion) return undefined;
    const t = setInterval(() => setSecondes(Math.max(0, Math.round((Date.now() - Date.parse(reunion.debut)) / 1000))), 1000);
    return () => clearInterval(t);
  }, [enregistre, reunion]);

  // Le fil défile avec la parole, sauf si on est remonté le lire.
  useEffect(() => { const f = fil.current; if (f && f.scrollHeight - f.scrollTop - f.clientHeight < 120) f.scrollTop = f.scrollHeight; }, [direct]);

  // Titre, participants et notes gardés au fil de l'eau (rien ne part au Cerveau avant la fin).
  useEffect(() => {
    if (!reunion || reunion.etat !== "enregistrement") return undefined;
    const t = setTimeout(() => { base44.request("PUT", `${A}/${reunion.id}`, { body: { titre, participants, notes } }).catch(() => {}); }, 900);
    return () => clearTimeout(t);
  }, [titre, participants, notes, reunion]);

  // Fermer la page pendant l'enregistrement : le navigateur prévient.
  useEffect(() => {
    if (!enregistre) return undefined;
    const avant = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [enregistre]);

  const envoyerMorceau = useCallback(async (x, id) => {
    for (let essai = 1; essai <= ESSAIS; essai += 1) {
      try {
        const f = new FormData();
        f.append("i", String(x.i));
        f.append("audio", x.wav, `m${x.i}.wav`);
        const r = await base44.request("POST", `${A}/${id}/morceau`, { body: f, isForm: true });
        x.texte = r.texte || ""; x.etat = "ok"; x.wav = null; montrer();
        return;
      } catch {
        if (essai < ESSAIS) await new Promise((ok) => setTimeout(ok, 2000 * essai));
      }
    }
    x.etat = "echec"; montrer();
  }, []);

  const tenirEcranAllume = async () => { try { verrou.current = await navigator.wakeLock?.request("screen"); } catch { /* sans verrou, l'écran peut s'éteindre */ } };

  const enregistrer = (flux, id) => {
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
        const x = { i: prochain.current, texte: null, wav: null, etat: "envoi" };
        prochain.current += 1;
        morceaux.current.push(x); montrer();
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; montrer(); return; }
        envoyerMorceau(x, id);
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, DUREE_MORCEAU_MS);
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
    verrou.current?.release?.().catch?.(() => {});
    verrou.current = null;
  };
  useEffect(() => () => couper(), []);

  const demarrer = async () => {
    setMicroKo(false);
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { setMicroKo(true); return; }
    let r = reunion;
    if (!r) {
      try { r = (await base44.request("POST", A, { body: { titre } })).reunion; } catch (e) { flux.getTracks().forEach((t) => t.stop()); toast.error(e?.message || "La réunion n'a pas démarré."); return; }
      setReunion(r); morceaux.current = r.morceaux.map((m) => ({ i: m.i, texte: m.texte, etat: "ok" })); prochain.current = r.prochain; montrer();
    }
    enregistrer(flux, r.id);
    setEnregistre(true);
    tenirEcranAllume();
  };

  const pause = () => { couper(); setEnregistre(false); };

  const terminer = async () => {
    if (!reunion) return;
    couper(); setEnregistre(false); setEnvoi(true);
    // Les derniers morceaux finissent de partir, et les ratés repartent une fois.
    const t0 = Date.now();
    while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 60000) await new Promise((ok) => setTimeout(ok, 400));
    for (const x of morceaux.current.filter((y) => y.etat === "echec" && y.wav)) { x.etat = "envoi"; montrer(); await envoyerMorceau(x, reunion.id); }
    try {
      await base44.request("POST", `${A}/${reunion.id}/terminer`, { body: { titre, participants, notes } });
      toast.success("Réunion envoyée au Cerveau : l'extraction tourne", { action: { mot: "Voir", faire: () => navigate("/Cerveau") } });
      setReunion(null); setTitre(""); setParticipants(""); setNotes(""); morceaux.current = []; prochain.current = 0; setDirect([]); setSecondes(0);
      queryClient.invalidateQueries({ queryKey: ["reunions"] });
    } catch (e) {
      toast.error(e?.message || "La réunion n'est pas partie.");
    } finally { setEnvoi(false); }
  };

  const abandonner = async () => {
    if (!reunion) return;
    couper(); setEnregistre(false);
    try { await base44.request("POST", `${A}/${reunion.id}/abandonner`); } catch { /* elle reste en cours, on pourra la reprendre */ }
    setReunion(null); setTitre(""); setParticipants(""); setNotes(""); morceaux.current = []; prochain.current = 0; setDirect([]); setSecondes(0); setConfirmerAbandon(false);
    queryClient.invalidateQueries({ queryKey: ["reunions"] });
  };

  if (error) return <div className="p-8"><p className="text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p></div>;
  const enAttente = direct.filter((x) => x.etat === "envoi").length;
  const rates = direct.filter((x) => x.etat === "echec").length;
  const signes = direct.reduce((t, x) => t + (x.texte || "").length, 0);
  const passees = (data?.reunions || []).filter((r) => r.etat !== "enregistrement" || r.id !== reunion?.id);

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1300px] px-4 py-8 md:px-8 md:py-10">
        <OngletsSuivi className="mb-3.5" />
        <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">Réunion</h1>
        <p className="m-0 mt-1.5 max-w-[720px] text-[13.5px] text-ardoise">Enregistrez une réunion, aussi longue qu'elle soit : elle se transcrit pendant qu'on parle, puis entre dans le Cerveau, où ses décisions, informations et engagements attendent votre validation. L'audio n'est pas gardé.</p>

        <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          {/* À gauche : le micro, les réglages de la réunion, les gestes. */}
          <section className="flex flex-col gap-4 rounded-[14px] border border-trait bg-surface p-5">
            <div className="flex flex-col items-center py-2">
              {enregistre ? (
                <MicroEcoute taille={170} label="Réunion en cours d'enregistrement"><span className="sr-only">Enregistrement</span></MicroEcoute>
              ) : (
                <span className="grid h-[110px] w-[110px] place-items-center rounded-full border border-trait text-ardoise"><Mic className="h-8 w-8" strokeWidth={1.5} /></span>
              )}
              <p className="m-0 mt-3 text-[24px] font-light tabular-nums">{chrono(secondes)}</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-brume">
                {enregistre ? "Je vous écoute" : reunion ? "En pause : reprenez ou terminez" : "Prêt à enregistrer"}
                {direct.length ? ` · ${direct.length} morceau${direct.length > 1 ? "x" : ""}${enAttente ? ` · ${enAttente} en transcription` : ""}${rates ? ` · ${rates} raté${rates > 1 ? "s" : ""}` : ""}` : ""}
              </p>
              {reunion && !enregistre && data?.en_cours?.id === reunion.id && !direct.some((x) => x.etat === "envoi") && (
                <p className="m-0 mt-2 text-center text-[12.5px] text-ambre">Réunion retrouvée, commencée {quand(reunion.debut)} : reprenez pour continuer à la suite.</p>
              )}
              {microKo && <p className="m-0 mt-2 text-center text-[12.5px] text-alerte">Le micro est refusé : autorisez-le dans le navigateur, puis réessayez.</p>}
            </div>

            <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Titre
              <input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Point hebdo, réunion Libourne…" className={champ} />
            </label>
            <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Participants
              <input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Jules, Paul, Nora" className={champ} />
            </label>
            <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Ce que le micro capte mal : un chiffre, un nom, une décision." className={`${champ} resize-y`} />
            </label>

            <div className="flex flex-col gap-2">
              {!enregistre ? (
                <button type="button" onClick={demarrer} disabled={envoi} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                  {reunion ? <RotateCcw className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{reunion ? "Reprendre l'enregistrement" : "Démarrer l'enregistrement"}
                </button>
              ) : (
                <button type="button" onClick={pause} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-trait px-5 text-[14px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>
                  <Square className="h-3.5 w-3.5" />Pause
                </button>
              )}
              {reunion && (
                <button type="button" onClick={terminer} disabled={envoi} className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[14px] disabled:opacity-50 ${enregistre ? "border border-menthe text-menthe" : "bg-menthe text-sur-menthe hover:bg-menthe-survol"}`} style={enregistre ? { background: "transparent" } : undefined}>
                  {envoi && <Loader2 className="h-4 w-4 animate-spin" />}{envoi ? "Envoi au Cerveau…" : "Terminer et envoyer au Cerveau"}
                </button>
              )}
              {reunion && !envoi && (
                confirmerAbandon ? (
                  <div className="flex items-center justify-center gap-3 text-[12.5px]">
                    <span className="text-ardoise">Abandonner, sans rien envoyer ?</span>
                    <button type="button" onClick={abandonner} className="p-0 text-alerte underline underline-offset-2" style={{ background: "transparent" }}>Abandonner</button>
                    <button type="button" onClick={() => setConfirmerAbandon(false)} className="p-0 text-brume underline underline-offset-2" style={{ background: "transparent" }}>Annuler</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmerAbandon(true)} className="p-0 text-center text-[12.5px] text-brume underline underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>Abandonner la réunion</button>
                )
              )}
            </div>
          </section>

          {/* À droite : la transcription, au fil de la parole. */}
          <section className="flex min-h-[420px] flex-col rounded-[14px] border border-trait bg-surface">
            <div className="flex items-baseline justify-between gap-3 border-b border-trait px-5 py-3">
              <h2 className="m-0 text-[11px] font-normal uppercase tracking-[.16em] text-menthe">Transcription</h2>
              <span className="text-[12px] text-brume">{signes ? `${signes.toLocaleString("fr-FR")} signes` : ""}</span>
            </div>
            <div ref={fil} className="max-h-[62vh] min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-[1.65]">
              {direct.length ? direct.map((x) => (
                <p key={x.i} className="m-0 mb-2">
                  {x.etat === "ok" ? (x.texte ? <span className="text-craie">{x.texte}</span> : <span className="text-[12.5px] text-brume">(silence)</span>)
                    : x.etat === "envoi" ? <span className="inline-flex items-center gap-1.5 text-[12.5px] text-brume"><Loader2 className="h-3 w-3 animate-spin" />transcription…</span>
                      : <span className="text-[12.5px] text-ambre">Ce morceau n'a pas été transcrit : il repartira à la fin.</span>}
                </p>
              )) : <p className="m-0 text-[13.5px] text-brume">La transcription s'affiche ici pendant la réunion, par blocs de trente secondes.</p>}
            </div>
          </section>
        </div>

        {/* Les réunions déjà enregistrées. */}
        <section className="mt-9">
          <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-[.16em] text-menthe">Réunions enregistrées</h2>
          {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
            : passees.length ? (
              <div className="border-y border-trait">
                {passees.map((r) => (
                  <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t border-trait px-2 py-4 first:border-t-0">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[16px] text-encre">{r.titre || "Réunion sans titre"}</p>
                      <p className="m-0 mt-0.5 text-[13.5px] text-ardoise">{quand(r.debut)} · {duree(r.duree_s)} · {r.par.split("@")[0].split(".")[0].replace(/^./, (c) => c.toUpperCase())}{r.participants ? ` · ${r.participants}` : ""}</p>
                    </div>
                    <div className="text-right text-[13px]">
                      <p className={`m-0 ${r.etat === "envoyee" ? "text-menthe" : r.etat === "enregistrement" ? "text-ambre" : "text-brume"}`}>{ETATS[r.etat] || r.etat}</p>
                      {r.etat === "envoyee" && <p className="m-0 mt-0.5 text-brume">{r.faits ? `${r.faits} fait${r.faits > 1 ? "s" : ""} · ${r.faits_valides} validé${r.faits_valides > 1 ? "s" : ""}` : "extraction en cours"} · <Link to="/Cerveau" className="text-craie underline underline-offset-2 hover:text-encre">Cerveau</Link></p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="m-0 text-[13.5px] text-brume">Aucune réunion enregistrée pour l'instant.</p>}
        </section>
      </div>
    </div>
  );
}
