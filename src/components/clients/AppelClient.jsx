import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { versWav } from "@/lib/dictee";

// L'appel d'un client (16 oct. 2026, Jules) : « Enregistrer » écoute l'appel
// et le transcrit en direct, morceau par morceau ; ou on colle le résumé.
// À la fin, AK lit l'appel : la fiche, Monday et le réseau des mandataires se
// remplissent d'un coup, et l'écran dit ce qui a changé, avec « Annuler ».

const CHAMPS = {
  client_nom: "Nom", client_email: "Email", telephone: "Téléphone", fonction: "Métier", localisation: "Habite à", patrimoine: "Patrimoine",
  revenu: "Revenus", objectif: "Objectif", profil_investisseur: "Profil", budget: "Budget", budget_min: null, budget_max: null, apport: "Apport",
  type_commerce: "Type de bien", zones: "Zones", rendement_min: "Rendement minimum", bail: "Bail", fiche: "Ce qu'on sait de lui",
  prochaine_etape: "Prochaine étape", information: "Ce que voient les mandataires",
};
const EUROS = ["budget", "apport", "revenu"];
const lisible = (v, k = null) => (v == null ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? (v.texte ? `${v.texte}${v.date_dite ? ` (${v.date_dite})` : ""}` : "complété")
  : typeof v === "number" ? (EUROS.includes(k) ? `${v.toLocaleString("fr-FR")} €` : k === "rendement_min" ? `${String(v).replace(".", ",")} %` : v.toLocaleString("fr-FR")) : String(v));

/** `client` : la fiche ouverte (ou null : le client se retrouve par son nom dans l'appel). `mode` : « enregistrer » ou « coller ». */
export default function AppelClient({ client = null, mode: mode0 = "enregistrer", onFermer, onFait }) {
  const [mode, setMode] = useState(mode0);
  const [etat, setEtat] = useState(mode0 === "enregistrer" ? "pret" : "saisie"); // pret, ecoute, lecture, fait, saisie
  const [colle, setColle] = useState("");
  const [direct, setDirect] = useState([]);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [annule, setAnnule] = useState(null);
  const [secondes, setSecondes] = useState(0);
  const rec = useRef(null);
  const morceaux = useRef([]);
  const chrono = useRef(null);
  const fin = useRef(null);

  useEffect(() => () => { arreter(true); clearInterval(chrono.current); }, []);
  useEffect(() => { fin.current?.scrollIntoView({ block: "nearest" }); }, [direct.length]);

  const montrer = () => setDirect(morceaux.current.map((x) => ({ i: x.i, texte: x.texte, etat: x.etat })));
  const transcrire = async (x) => {
    try {
      const f = new FormData();
      f.append("i", String(x.i));
      f.append("audio", x.wav, `m${x.i}.wav`);
      const r = await base44.request("POST", "/api/clients-equipe/morceau", { body: f, isForm: true });
      x.texte = r.texte || ""; x.etat = "ok";
    } catch { x.etat = "echec"; }
    montrer();
  };
  // Comme le mode appel : des morceaux de huit secondes, chacun transcrit pendant que l'appel continue.
  const ecouter = async () => {
    setErreur(null);
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setErreur("Micro indisponible : autorisez-le, ou collez le résumé de l'appel."); return; }
    const r0 = { flux, actif: true, jeter: false, m: null, minuterie: null };
    rec.current = r0;
    morceaux.current = []; setDirect([]);
    const tour = () => {
      if (!r0.actif) { flux.getTracks().forEach((t) => t.stop()); return; }
      const bouts = [];
      const m = new MediaRecorder(flux);
      r0.m = m;
      m.ondataavailable = (e) => { if (e.data?.size) bouts.push(e.data); };
      m.onstop = async () => {
        if (r0.actif) tour(); else flux.getTracks().forEach((t) => t.stop());
        if (r0.jeter || !bouts.length) return;
        const x = { i: morceaux.current.length, texte: null, wav: null, etat: "envoi" };
        morceaux.current.push(x); montrer();
        try { x.wav = await versWav(new Blob(bouts, { type: m.mimeType || "audio/webm" }), 16000); } catch { x.etat = "echec"; montrer(); return; }
        transcrire(x);
      };
      m.start();
      r0.minuterie = setTimeout(() => { if (m.state === "recording") m.stop(); }, 8000);
    };
    tour();
    setSecondes(0);
    chrono.current = setInterval(() => setSecondes((s) => s + 1), 1000);
    setEtat("ecoute");
  };
  function arreter(jeter = false) {
    const r0 = rec.current;
    if (!r0) return;
    r0.actif = false;
    if (jeter) r0.jeter = true;
    clearTimeout(r0.minuterie);
    if (r0.m?.state === "recording") r0.m.stop(); else r0.flux?.getTracks().forEach((t) => t.stop());
  }

  const lire = async (contenu, source) => {
    setEtat("lecture"); setErreur(null);
    try {
      const r = await base44.request("POST", "/api/clients-equipe/appels", { body: { client_id: client?.id || null, contenu, source, duree_s: source === "enregistre" ? secondes : null } });
      setResultat(r); setEtat("fait"); onFait?.(r);
    } catch (e) {
      setErreur(e?.message || "La lecture de l'appel a échoué.");
      setEtat(source === "enregistre" ? "relire" : "saisie");
    }
  };
  // Au raccrochage : les derniers morceaux finissent (vingt secondes au plus), puis AK lit le tout.
  const terminer = async () => {
    clearInterval(chrono.current);
    arreter(false);
    setEtat("lecture");
    const t0 = Date.now();
    await new Promise((ok) => setTimeout(ok, 400));
    while (morceaux.current.some((x) => x.etat === "envoi") && Date.now() - t0 < 20000) await new Promise((ok) => setTimeout(ok, 250));
    await Promise.all(morceaux.current.filter((x) => x.etat === "echec" && x.wav).map(transcrire));
    const texte = morceaux.current.map((x) => x.texte).filter(Boolean).join("\n");
    if (texte.trim().length < 20) { setErreur("Rien d'audible n'a été transcrit. Collez le résumé de l'appel."); setMode("coller"); setEtat("saisie"); return; }
    setColle(texte);
    lire(texte, "enregistre");
  };
  const annuler = async () => {
    try {
      const r = await base44.request("POST", `/api/clients-equipe/appels/${resultat.appel.id}/annuler`);
      setAnnule(r); onFait?.(r);
    } catch (e) { setErreur(e?.message || "Annulation impossible."); }
  };
  const fermer = () => { if (etat === "ecoute" && !window.confirm("L'appel est en cours d'écoute. Arrêter sans rien garder ?")) return; arreter(true); onFermer(); };

  const changes = resultat ? Object.keys(resultat.appel?.apres || {}).filter((k) => CHAMPS[k] !== null) : [];
  const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <div className="absolute inset-0 bg-fond/70 backdrop-blur-[2px]" onClick={etat === "ecoute" || etat === "lecture" ? undefined : fermer} />
      <div role="dialog" aria-modal="true" aria-label="Appel client" className="relative flex max-h-[90dvh] w-[640px] max-w-full flex-col overflow-hidden rounded-[18px] border border-trait bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-trait px-6 pb-4 pt-5">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] tracking-[.16em] text-brume">APPEL CLIENT</span>
            <span className="truncate text-[20px] text-encre">{client?.nom || resultat?.client?.client_nom || "Client à retrouver dans l'appel"}</span>
          </div>
          <button type="button" onClick={fermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {["pret", "saisie"].includes(etat) && (
            <div className="flex gap-0.5 self-start rounded-full bg-rail-actif p-1" role="tablist">
              {[["enregistrer", "Enregistrer l'appel"], ["coller", "Coller le résumé"]].map(([k, mot]) => (
                <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setEtat(k === "enregistrer" ? "pret" : "saisie"); }}
                  className={`rounded-full px-4 py-2 text-[13.5px] ${mode === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`} style={mode === k ? undefined : { background: "transparent" }}>{mot}</button>
              ))}
            </div>
          )}

          {etat === "pret" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <p className="m-0 max-w-[440px] text-[14px] leading-[1.55] text-craie">Mettez le téléphone sur haut-parleur, près de l'ordinateur, puis lancez l'écoute. La transcription s'écrit pendant l'appel ; à la fin, AK remplit la fiche, Monday et ce que voient les mandataires.</p>
              <button type="button" onClick={ecouter} className="h-12 rounded-full bg-menthe px-7 text-[15px] text-sur-menthe hover:bg-menthe-survol">Démarrer l'écoute</button>
            </div>
          )}

          {(etat === "ecoute" || (etat === "lecture" && mode === "enregistrer")) && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${etat === "ecoute" ? "animate-pulse bg-alerte" : "bg-brume"}`} />
                <span className="text-[14px] text-encre">{etat === "ecoute" ? `J'écoute · ${mm(secondes)}` : "Appel terminé"}</span>
              </div>
              <div className="flex max-h-[300px] min-h-[120px] flex-col gap-2 overflow-y-auto rounded-[12px] border border-trait p-4">
                {!direct.length && <span className="text-[13.5px] text-brume">La transcription arrive toutes les huit secondes…</span>}
                {direct.map((x) => <p key={x.i} className={`m-0 text-[14px] leading-[1.55] ${x.etat === "echec" ? "text-ambre" : x.texte ? "text-craie" : "text-brume"}`}>{x.etat === "envoi" ? "…" : x.etat === "echec" ? "Passage non transcrit, nouvel essai à la fin." : x.texte}</p>)}
                <span ref={fin} />
              </div>
              {etat === "ecoute" && <button type="button" onClick={terminer} className="h-11 self-start rounded-full bg-alerte px-6 text-[14px] text-white hover:opacity-90">Terminer l'appel</button>}
            </div>
          )}

          {etat === "saisie" && (
            <div className="flex flex-col gap-3">
              <textarea value={colle} onChange={(e) => setColle(e.target.value)} rows={10} autoFocus placeholder="Collez ici le résumé de l'appel (ou sa transcription)…"
                className="w-full resize-y rounded-[12px] border border-trait bg-transparent p-4 text-[14px] leading-[1.55] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
              <button type="button" onClick={() => lire(colle, "colle")} disabled={colle.trim().length < 20}
                className="h-11 self-start rounded-full bg-menthe px-6 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">Remplir la fiche</button>
            </div>
          )}

          {etat === "relire" && <button type="button" onClick={() => lire(colle, "enregistre")} className="h-11 self-start rounded-full bg-menthe px-6 text-[14px] text-sur-menthe hover:bg-menthe-survol">Relancer la lecture</button>}

          {etat === "lecture" && <p className="m-0 flex items-center gap-2.5 text-[14px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />AK lit l'appel et remplit la fiche, Monday et le réseau…</p>}

          {erreur && <p className="m-0 text-[13.5px] text-alerte">{erreur}</p>}

          {etat === "fait" && resultat && (
            <div className="flex flex-col gap-4">
              {resultat.appel?.resume && <p className="m-0 text-[14.5px] leading-[1.6] text-encre">{resultat.appel.resume}</p>}
              <div className="flex flex-col">
                <span className="pb-1.5 text-[11px] tracking-[.16em] text-brume">{resultat.nouveau ? "NOUVEAU CLIENT · CE QUI EST REMPLI" : "CE QUI A CHANGÉ"}</span>
                {!changes.length && <span className="text-[13.5px] text-ardoise">Rien de nouveau sur la fiche : l'appel est gardé dans son historique.</span>}
                {changes.map((k) => (
                  <div key={k} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 border-t border-trait py-2 text-[13.5px] max-md:grid-cols-1 max-md:gap-0.5">
                    <span className="text-ardoise">{CHAMPS[k] || k}</span>
                    <span className="text-encre">{k === "fiche" ? "complété" : lisible(resultat.appel.apres[k], k)}{resultat.appel.avant?.[k] != null && k !== "fiche" ? <span className="text-brume"> · avant : {lisible(resultat.appel.avant[k], k)}</span> : null}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 text-[13px] text-ardoise">
                <span>Monday : {resultat.appel?.monday?.texte}</span>
                <span>Réseau des mandataires : {resultat.client?.visible === false ? "caché (la fiche ne sort pas)" : "la recherche est visible, sans le nom du client"}</span>
              </div>
              {annule ? (
                <p className="m-0 text-[13.5px] text-craie">Appel annulé : la fiche est revenue comme avant.{annule.monday ? ` ${annule.monday}.` : ""}</p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  <button type="button" onClick={onFermer} className="h-11 rounded-full bg-menthe px-6 text-[14px] text-sur-menthe hover:bg-menthe-survol">C'est bon</button>
                  <button type="button" onClick={annuler} className="h-11 rounded-full border border-trait px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Annuler l'appel</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
