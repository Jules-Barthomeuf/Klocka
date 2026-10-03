import React, { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, PhoneCall, PhoneOff, Square, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useDictee, versWav } from "@/lib/dictee";

// Le panneau d'appel d'une fiche propriétaire : le même geste que la
// Prospection côté admin. On compose, on met le haut-parleur, on enregistre
// (ou on raconte), et la plateforme transcrit, retient l'issue et met la
// fiche à jour : statut, rappel, rendez-vous. Rien à ressaisir après l'appel.

const duree = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const champ = "w-full rounded-lg border border-bord-doux bg-fond px-3 py-2 text-[13.5px] text-encre outline-none transition-colors placeholder:text-bord-vif focus:border-menthe/60";

export default function PanneauAppelFiche({ p, onFermer, onFait }) {
  const [etat, setEtat] = useState("pret"); // pret | enregistre | analyse | fait
  const [secondes, setSecondes] = useState(0);
  const [recit, setRecit] = useState("");
  const [resultat, setResultat] = useState(null);
  const rec = useRef(null);
  const chrono = useRef(0);
  const { supporte: dicteeOk, ecoute, demarrer: dicter, arreter: stopDictee } = useDictee({ onTexte: (t) => setRecit(t) });

  useEffect(() => {
    if (etat !== "enregistre") return undefined;
    const t = setInterval(() => setSecondes((s) => { chrono.current = s + 1; return s + 1; }), 1000);
    return () => clearInterval(t);
  }, [etat]);
  useEffect(() => () => rec.current?.flux?.getTracks().forEach((t) => t.stop()), []);

  const c = p.cible || {};
  const telProprio = p.telephone || (c.proprietaire_occupant ? c.telephone : null) || null;
  // Sans numéro du propriétaire, on appelle le commerce pour remonter jusqu'à lui.
  const viaCommerce = !telProprio ? (p.telephone_commerce || c.telephone || null) : null;
  const tel = telProprio || viaCommerce;

  const envoyer = async (form) => {
    setEtat("analyse");
    try {
      const r = await base44.request("POST", `/api/mandataire/proprietaires/${p.id}/appel`, { body: form, isForm: true });
      setResultat(r);
      setEtat("fait");
      onFait?.();
    } catch (e) {
      toast.error(e?.message || "L'appel n'a pas pu être lu");
      setEtat("pret");
    }
  };
  const demarrer = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast.error("Le micro est refusé : autorisez-le dans le navigateur."); return; }
    const morceaux = [];
    const m = new MediaRecorder(flux);
    m.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
    m.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      const form = new FormData();
      try {
        const wav = await versWav(new Blob(morceaux, { type: m.mimeType || "audio/webm" }), 8000);
        form.append("audio", wav, "appel.wav");
      } catch { toast.error("Enregistrement illisible : racontez l'appel à la place."); setEtat("pret"); return; }
      if (recit.trim()) form.append("recit", recit.trim());
      envoyer(form);
    };
    rec.current = { m, flux };
    m.start(1000);
    chrono.current = 0;
    setSecondes(0);
    setEtat("enregistre");
  };
  const terminer = () => rec.current?.m?.state === "recording" && rec.current.m.stop();
  const sansReponse = () => { const f = new FormData(); f.append("sans_reponse", "true"); envoyer(f); };
  const raconter = () => { const f = new FormData(); f.append("recit", recit.trim()); envoyer(f); };

  return (
    <div className="animate-in fade-in duration-200 fixed inset-0 z-[80] flex items-center justify-center bg-fond/60 px-4 backdrop-blur-sm" onClick={onFermer}>
      <div className="animate-in slide-in-from-bottom-4 w-full max-w-[560px] rounded-[18px] border border-trait bg-surface-pleine p-5 shadow-[0_24px_60px_rgb(0_0_0/0.2)] duration-300 md:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Votre appel</p>
            <h2 className="m-0 mt-1 truncate text-[19px] font-semibold text-encre">{p.nom || p.commerce || "Propriétaire"}</h2>
            <p className="m-0 mt-0.5 truncate text-[13px] text-craie">{[p.commerce || c.enseigne, p.ville].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {etat !== "fait" && (
          <>
            {tel && (
              <div className="mt-4">
                <a href={`tel:${String(tel).replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[14px] font-semibold tabular-nums text-sur-menthe">
                  <PhoneCall className="h-4 w-4" />{tel}
                </a>
                {viaCommerce
                  ? <span className="ml-2.5 text-[12px] text-ambre">Numéro du commerce : demandez qui possède les murs et comment le joindre.</span>
                  : p.telephone_source && <span className="ml-2.5 text-[12px] text-brume">{p.telephone_source}</span>}
              </div>
            )}

            <div className="mt-4 rounded-[14px] border border-trait p-4">
              {etat === "pret" && (
                <>
                  <p className="m-0 text-[12.5px] text-craie">Haut-parleur, et dites au propriétaire que l'appel est enregistré.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={demarrer} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe"><Mic className="h-4 w-4" />Enregistrer l'appel</button>
                    <button type="button" onClick={sansReponse} className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-4 py-2 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}><PhoneOff className="h-4 w-4" />Il n'a pas décroché</button>
                  </div>
                  <div className="mt-4">
                    <label htmlFor={`recit-${p.id}`} className="text-[12.5px] text-craie">Ou racontez l'appel, la fiche se met à jour :</label>
                    <div className="mt-1.5 flex gap-2">
                      <textarea id={`recit-${p.id}`} value={recit} onChange={(e) => setRecit(e.target.value)} rows={2}
                        placeholder="Intéressé, il veut une estimation, RDV jeudi 14h à la boutique" className={champ} />
                      {dicteeOk && <button type="button" onClick={() => (ecoute ? stopDictee() : dicter())} aria-label="Dicter"
                        className={`grid h-10 w-10 flex-none place-items-center rounded-full border ${ecoute ? "border-menthe bg-menthe/15 text-menthe" : "border-bord-doux text-craie"}`} style={ecoute ? undefined : { background: "transparent" }}><Mic className="h-4 w-4" /></button>}
                    </div>
                    <button type="button" onClick={raconter} disabled={!recit.trim()} className="mt-2 rounded-full border border-menthe/60 px-4 py-1.5 text-[12.5px] text-encre disabled:opacity-40" style={{ background: "transparent" }}>Lire mon récit</button>
                  </div>
                </>
              )}
              {etat === "enregistre" && (
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2 text-[14px] tabular-nums text-encre"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-alerte" />Enregistrement · {duree(secondes)}</span>
                  <button type="button" onClick={terminer} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe"><Square className="h-4 w-4" />Terminer l'appel</button>
                </div>
              )}
              {etat === "analyse" && <p className="m-0 flex items-center gap-2 text-[13.5px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />Je lis l'appel et mets la fiche à jour…</p>}
            </div>
          </>
        )}

        {etat === "fait" && resultat && (
          <div className="mt-4">
            {resultat.sans_reponse ? (
              <p className="m-0 text-[14px] leading-[1.6] text-encre">Noté : pas de réponse. {resultat.titre} · {resultat.pour}.{resultat.passe_a_recontacter ? " Dernière tentative : la fiche passe « À recontacter »." : ""}</p>
            ) : (
              <>
                <p className="m-0 text-[14px] leading-[1.6] text-encre">{resultat.note}</p>
                <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
                  {(resultat.faits || []).map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13px] text-craie"><Check className="h-3.5 w-3.5 flex-none text-menthe" />{f}</li>
                  ))}
                </ul>
                {resultat.transcription && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12.5px] text-brume hover:text-encre">La transcription</summary>
                    <p className="m-0 mt-2 max-h-[180px] overflow-auto whitespace-pre-line rounded-[12px] border border-trait p-3 text-[12.5px] leading-[1.55] text-craie">{resultat.transcription}</p>
                  </details>
                )}
              </>
            )}
            <button type="button" onClick={onFermer} className="mt-4 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}
