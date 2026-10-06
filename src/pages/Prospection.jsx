import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, FileUp, Loader2, Lock, Mail, Mic, PhoneCall, PhoneOff, Plus, Redo2, RefreshCw, Search, Send, Square, Undo2, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { useDictee, versWav } from "@/lib/dictee";
import { OngletAgentIA, OngletListesAgences } from "@/components/prospection/AgencesIA";
import MaJournee from "@/components/prospection/MaJournee";

// La prospection, avec l'alternant. La liste du jour est prête ; on choisit
// un agent (il se verrouille à son nom), on enregistre l'appel, et à la fin
// AK propose la suite : le mail, la relance, ce qu'il faut ajouter à la
// fiche. On coche, on relit, on valide. Rien ne part vers un agent sans un
// clic. Le calcul est côté serveur (server/prospection/).

const champ = "w-full min-w-0 rounded-lg border border-bord-doux bg-fond px-3 py-2 text-[13.5px] text-encre outline-none transition-colors placeholder:text-bord-vif focus:border-menthe/60 max-md:text-[16px]";
const etiquette = "m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise";
const carte = "rounded-[16px] border border-trait bg-surface";
const jourFr = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const duree = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const telLien = (t) => `tel:${String(t).replace(/\s/g, "")}`;

function Pastille({ children, ton = "neutre" }) {
  const t = { neutre: "border-bord-doux text-craie", menthe: "border-menthe/50 text-menthe", ambre: "border-ambre/50 text-ambre", alerte: "border-alerte/40 text-alerte" }[ton];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${t}`}>{children}</span>;
}

function Bulle({ children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-full border border-menthe/40 text-[11px] font-semibold tracking-[.06em] text-menthe">AK</span>
      <div className="min-w-0 flex-1 whitespace-pre-line rounded-[18px] rounded-tl-[6px] border border-trait bg-fond px-4 py-3 text-[14px] leading-[1.6] text-encre">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ce qu'AK propose après l'appel
// ---------------------------------------------------------------------------

function Propositions({ appel, onFini }) {
  const queryClient = useQueryClient();
  const props = appel.propositions || [];
  const [coches, setCoches] = useState(() => new Set(props.map((p) => p.id)));
  const pm = props.find((p) => p.type === "mail");
  const ps = props.find((p) => p.type === "sms");
  const [mail, setMail] = useState(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps } : null);
  const [sms, setSms] = useState(ps ? { corps: ps.corps } : null);
  const valider = useMutation({
    mutationFn: (envoyer) => base44.request("POST", `/api/prospection/appels/${appel.id}/valider`, { body: { choix: [...coches], mail, sms, envoyer } }),
    onSuccess: (r) => {
      toast.success(`${appel.agent} : ${(r.faits || []).join(", ") || "noté"}.`);
      ["prospection-jour", "prospection-envois", "prospection-agents"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      onFini?.();
    },
    onError: (e) => toast.error(e?.message || "Validation ratée"),
  });
  const basculer = (id) => setCoches((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const mailCoche = pm && coches.has("mail");
  const resume = appel.message.split("\n")[0];
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-4">
      <Bulle>{resume}</Bulle>
      {appel.transcription && (
        <details className="text-[12.5px] text-craie">
          <summary className="cursor-pointer text-brume hover:text-encre">La transcription</summary>
          <p className="m-0 mt-2 max-h-[220px] overflow-auto whitespace-pre-line rounded-[12px] border border-trait p-3 leading-[1.55]">{appel.transcription}</p>
        </details>
      )}
      <p className={etiquette}>Ce que je te propose</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {props.map((p) => (
          <li key={p.id} className={`rounded-[14px] border p-3.5 transition-colors ${coches.has(p.id) ? "border-menthe/50 bg-menthe/[0.04]" : "border-trait"}`}>
            <label className="flex cursor-pointer items-start gap-3">
              <input id={`prop-${p.id}`} type="checkbox" checked={coches.has(p.id)} onChange={() => basculer(p.id)} className="mt-0.5 h-4 w-4 accent-menthe" />
              <span className="text-[13.5px] leading-[1.5] text-encre">{p.titre}</span>
            </label>
            {p.type === "mail" && coches.has("mail") && mail && (
              <div className="mt-3 flex flex-col gap-2 pl-7">
                <input id="mail-a" value={mail.a} onChange={(e) => setMail((m) => ({ ...m, a: e.target.value }))} placeholder="adresse de l'agent" className={champ} />
                <input id="mail-objet" value={mail.objet} onChange={(e) => setMail((m) => ({ ...m, objet: e.target.value }))} className={champ} />
                <textarea id="mail-corps" value={mail.corps} onChange={(e) => setMail((m) => ({ ...m, corps: e.target.value }))} rows={Math.min(14, mail.corps.split("\n").length + 1)} className={`${champ} leading-[1.55]`} />
                <p className="m-0 text-[11.5px] text-brume">« {"{signature}"} » devient ton nom à l'envoi.</p>
              </div>
            )}
            {p.type === "sms" && coches.has("sms") && sms && (
              <div className="mt-3 pl-7"><textarea id="sms-corps" value={sms.corps} onChange={(e) => setSms({ corps: e.target.value })} rows={3} className={champ} /></div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => valider.mutate(false)} disabled={valider.isPending} className="inline-flex items-center gap-1.5 rounded-full border border-menthe/60 px-4 py-2 text-[13px] text-encre hover:bg-menthe/10">
          {valider.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Valider{mailCoche ? " (le mail attend dans À envoyer)" : ""}
        </button>
        {mailCoche && (
          <button type="button" onClick={() => { if (window.confirm(`Envoyer le mail à ${mail.a || "l'agent"} depuis ta boîte ?`)) valider.mutate(true); }} disabled={valider.isPending || !mail?.a} className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-4 py-2 text-[13px] font-semibold text-sur-menthe disabled:opacity-40">
            <Send className="h-4 w-4" /> Valider et envoyer le mail
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'appel
// ---------------------------------------------------------------------------

// Le récit de l'appel : trente secondes au plus, puis tout se note seul.
const RECIT_MAX_S = 30;

function PanneauAppel({ agent, onFermer, onCarte = null }) {
  const queryClient = useQueryClient();
  const [etat, setEtat] = useState("pret"); // pret | enregistre | recit | note | analyse | propose
  const [secondes, setSecondes] = useState(0);
  const [recit, setRecit] = useState("");
  const [appel, setAppel] = useState(null);
  const rec = useRef(null);
  const chrono = useRef(0);
  const { supporte: dicteeOk, ecoute, demarrer: dicter, arreter: stopDictee } = useDictee({ onTexte: (t) => setRecit(t) });
  useEffect(() => {
    if (etat !== "enregistre" && etat !== "recit") return undefined;
    const t = setInterval(() => setSecondes((s) => {
      chrono.current = s + 1;
      // Le récit s'arrête de lui-même à trente secondes.
      if (etat === "recit" && s + 1 >= RECIT_MAX_S && rec.current?.m?.state === "recording") rec.current.m.stop();
      return s + 1;
    }), 1000);
    return () => clearInterval(t);
  }, [etat]);

  // Raconter l'appel en trente secondes : transcrit, noté sur la fiche et dans
  // Monday d'un coup, puis la carte de confirmation, et le panneau se ferme.
  const raconter30 = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast.error("Le micro est refusé : autorise-le dans le navigateur."); return; }
    const morceaux = [];
    const m = new MediaRecorder(flux);
    m.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
    m.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      setEtat("note");
      try {
        const form = new FormData();
        form.append("audio", await versWav(new Blob(morceaux, { type: m.mimeType || "audio/webm" }), 16000), "recit.wav");
        form.append("duree_s", String(chrono.current));
        const r = await base44.request("POST", `/api/prospection/agents/${agent.id}/raconter`, { body: form, isForm: true });
        ["prospection-grille", "prospection-jour"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
        queryClient.invalidateQueries({ queryKey: ["agent-ia-listes"] });
        queryClient.invalidateQueries({ queryKey: ["agent-ia-liste"] });
        onCarte?.(r.carte);
        onFermer();
      } catch (e) {
        toast.error(e?.message || "L'appel n'a pas pu être noté");
        setEtat("pret");
      }
    };
    rec.current = { m, flux };
    m.start(1000);
    chrono.current = 0;
    setSecondes(0);
    setEtat("recit");
  };
  useEffect(() => () => rec.current?.flux?.getTracks().forEach((t) => t.stop()), []);

  const envoyer = async (corps) => {
    setEtat("analyse");
    try {
      const r = await base44.request("POST", `/api/prospection/agents/${agent.id}/appel`, { body: corps, isForm: true });
      setAppel(r.appel);
      setEtat("propose");
    } catch (e) {
      toast.error(e?.message || "AK n'a pas pu lire l'appel");
      setEtat("pret");
    }
  };
  const demarrer = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast.error("Le micro est refusé : autorise-le dans le navigateur."); return; }
    const morceaux = [];
    const m = new MediaRecorder(flux);
    m.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
    m.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      const form = new FormData();
      try {
        const wav = await versWav(new Blob(morceaux, { type: m.mimeType || "audio/webm" }), 8000);
        form.append("audio", wav, "appel.wav");
      } catch { toast.error("Enregistrement illisible : raconte l'appel à la place."); setEtat("pret"); return; }
      form.append("duree_s", String(chrono.current));
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
  const lacher = async () => {
    await base44.request("POST", `/api/prospection/agents/${agent.id}/lacher`).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["prospection-jour"] });
    onFermer();
  };

  return (
    <section className={`${carte} p-5 md:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={etiquette}>Ton appel</p>
          <h2 className="m-0 mt-1 text-[20px] font-semibold text-encre">{agent.nom}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-craie">{[agent.agence && agent.agence !== agent.nom ? agent.agence : null, agent.ville].filter(Boolean).join(" · ")}</p>
        </div>
        {etat === "pret" && <button type="button" onClick={lacher} className="text-[12px] text-brume hover:text-encre max-md:h-9 max-md:px-2" style={{ background: "transparent" }}>Lâcher</button>}
      </div>

      {etat !== "propose" && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {(agent.telephones || []).map((t) => <a key={t} href={telLien(t)} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[14px] font-semibold tabular-nums text-sur-menthe"><PhoneCall className="h-4 w-4" />{t}</a>)}
            {(agent.emails || []).slice(0, 2).map((e) => <a key={e} href={`mailto:${e}`} className="inline-flex min-w-0 items-center gap-1.5 self-center break-all text-[12.5px] text-craie hover:text-encre"><Mail className="h-3.5 w-3.5" />{e}</a>)}
          </div>
          <p className="m-0 mt-3 text-[13.5px] text-encre">{agent.raison}</p>
          {(agent.secteurs?.length > 0 || agent.resume_dernier_appel) && (
            <p className="m-0 mt-1 text-[12.5px] text-brume">{[agent.secteurs?.length ? `Secteurs : ${agent.secteurs.join(", ")}` : null, agent.resume_dernier_appel ? `Dernier appel : ${agent.resume_dernier_appel}` : null].filter(Boolean).join(" · ")}</p>
          )}
          {agent.journal?.length > 0 && (
            <ul className="m-0 mt-3 flex list-none flex-col gap-1 border-t border-trait p-0 pt-3">
              {agent.journal.map((j, i) => <li key={i} className="text-[12px] text-craie"><span className="text-brume">{dateCourte(j.le)} · {j.type}</span> {j.texte}</li>)}
            </ul>
          )}

          <div className="mt-5 rounded-[14px] border border-trait p-4">
            {etat === "pret" && (
              <>
                {/* Le geste principal, après avoir raccroché : trente secondes de récit. */}
                <div className="mb-4 border-b border-trait pb-4">
                  <p className="m-0 text-[13.5px] text-encre">Vous avez raccroché ?</p>
                  <p className="m-0 mt-0.5 text-[12.5px] text-craie">Racontez l'appel en 30 secondes : la fiche et Monday se remplissent seuls. Un mail proposé attend dans « À envoyer ».</p>
                  <button type="button" onClick={raconter30} className="mt-3 inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe hover:bg-menthe-survol"><Mic className="h-4 w-4" />Raconter l'appel · 30 s</button>
                </div>
                <p className="m-0 text-[12.5px] text-craie">Ou enregistre tout l'appel : mets ton téléphone sur haut-parleur et dis à l'agent que l'appel est enregistré.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={demarrer} className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-4 py-2 text-[13.5px] text-craie hover:text-encre"><Mic className="h-4 w-4" />Enregistrer tout l'appel</button>
                  <button type="button" onClick={sansReponse} className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-4 py-2 text-[13.5px] text-craie hover:text-encre"><PhoneOff className="h-4 w-4" />Il n'a pas décroché</button>
                </div>
                <div className="mt-4">
                  <label htmlFor="recit" className="text-[12.5px] text-craie">Ou raconte l'appel, AK en tire la suite :</label>
                  <div className="mt-1.5 flex gap-2">
                    <textarea id="recit" value={recit} onChange={(e) => setRecit(e.target.value)} rows={2} placeholder="Pas de murs en ce moment, un mandat à Antibes fin octobre, secteur Cannes et Antibes" className={champ} />
                    {dicteeOk && <button type="button" onClick={() => (ecoute ? stopDictee() : dicter())} aria-label="Dicter" className={`grid h-10 w-10 flex-none place-items-center rounded-full border ${ecoute ? "border-menthe bg-menthe/15 text-menthe" : "border-bord-doux text-craie"}`}><Mic className="h-4 w-4" /></button>}
                  </div>
                  <button type="button" onClick={raconter} disabled={!recit.trim()} className="mt-2 rounded-full border border-menthe/60 px-4 py-1.5 text-[12.5px] text-encre disabled:opacity-40">Lire mon récit</button>
                </div>
              </>
            )}
            {etat === "enregistre" && (
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2 text-[14px] tabular-nums text-encre"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-alerte" />Enregistrement · {duree(secondes)}</span>
                <button type="button" onClick={terminer} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe"><Square className="h-4 w-4" />Terminer l'appel</button>
              </div>
            )}
            {etat === "recit" && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="inline-flex items-center gap-2 text-[14px] tabular-nums text-encre"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-alerte" />Racontez l'appel · {RECIT_MAX_S - secondes} s</span>
                  <button type="button" onClick={terminer} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe"><Square className="h-4 w-4" />J'ai fini</button>
                </div>
                <span className="h-1 overflow-hidden rounded-full bg-encre/[0.12]"><span className="block h-full bg-menthe transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (secondes / RECIT_MAX_S) * 100)}%` }} /></span>
                <p className="m-0 text-[12px] text-brume">Qui vous avez eu, ce qu'il a, ce qu'il veut, quand le rappeler.</p>
              </div>
            )}
            {etat === "note" && <p className="m-0 flex items-center gap-2 text-[13.5px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />Je note l'appel sur la fiche et dans Monday…</p>}
            {etat === "analyse" && <p className="m-0 flex items-center gap-2 text-[13.5px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />AK écoute l'appel et prépare la suite…</p>}
          </div>
        </>
      )}
      {/* Après l'appel, la suite tout de suite ici : ce qu'AK propose, et le mail prêt à relire. */}
      {etat === "propose" && appel && <div className="mt-4 flex flex-col gap-3"><Bulle>{appel.message}</Bulle><Propositions appel={appel} onFini={onFermer} /></div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// À envoyer
// ---------------------------------------------------------------------------

const GENRES = { agent: ["Après un appel", "menthe"], relance: ["Relance", "ambre"], sms: ["SMS", "neutre"], oui: ["Oui : demande de documents", "menthe"], retour: ["Non : réponse à l'agent", "alerte"] };

function Envoi({ m, choisi, onChoisir, onEcarter }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [objet, setObjet] = useState(m.objet);
  const [corps, setCorps] = useState(m.corps);
  const [a, setA] = useState(m.a || "");
  const modifie = objet !== m.objet || corps !== m.corps || a !== (m.a || "");
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", `/api/prospection/envois/${m.id}`, { body: { objet, corps, a } }),
    onSuccess: () => { toast.success("Modifié"); queryClient.invalidateQueries({ queryKey: ["prospection-envois"] }); },
    onError: (e) => toast.error(e?.message || "Modification perdue"),
  });
  const [libelle, ton] = GENRES[m.genre] || ["Mail", "neutre"];
  return (
    <li className={`rounded-[14px] border p-4 transition-colors ${choisi ? "border-menthe/60 bg-menthe/[0.04]" : "border-trait"}`}>
      <div className="flex items-start gap-3">
        <input id={`envoi-${m.id}`} type="checkbox" checked={choisi} onChange={(e) => onChoisir(e.target.checked)} className="mt-1 h-4 w-4 accent-menthe" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pastille ton={ton}>{libelle}</Pastille>
            <label htmlFor={`envoi-${m.id}`} className="text-[14px] font-semibold text-encre">{m.nom || m.a}</label>
            <span className="min-w-0 break-all text-[12.5px] text-brume">{m.a || "sans adresse"}</span>
          </div>
          <p className="m-0 mt-1 text-[13px] text-craie">{m.dossier ? `${m.dossier} · ` : ""}{m.genre === "sms" ? "à envoyer depuis ton téléphone, puis coche et « Envoyer » pour le noter" : objet}</p>
          {ouvert ? (
            <div className="mt-3 flex flex-col gap-2">
              <input id={`a-${m.id}`} value={a} onChange={(e) => setA(e.target.value)} className={champ} placeholder={m.genre === "sms" ? "numéro" : "adresse"} />
              {m.genre !== "sms" && <input id={`objet-${m.id}`} value={objet} onChange={(e) => setObjet(e.target.value)} className={champ} />}
              <textarea id={`corps-${m.id}`} value={corps} onChange={(e) => setCorps(e.target.value)} rows={Math.min(16, corps.split("\n").length + 2)} className={`${champ} leading-[1.55]`} />
              <div className="flex gap-2">
                {modifie && <button type="button" onClick={() => enregistrer.mutate()} className="rounded-full bg-menthe px-3 py-1 text-[12px] font-semibold text-sur-menthe max-md:py-2">Enregistrer</button>}
                <button type="button" onClick={() => setOuvert(false)} className="rounded-full border border-bord-doux px-3 py-1 text-[12px] text-craie max-md:py-2">Replier</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setOuvert(true)} className="mt-2 block w-full text-left text-[13px] leading-[1.55] text-craie hover:text-encre" style={{ background: "transparent" }}>
              <span className="line-clamp-2 whitespace-pre-line">{corps}</span>
              <span className="text-[12px] text-menthe">Lire et modifier</span>
            </button>
          )}
          {m.genre === "sms" && (
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(corps.replace(/\{signature\}/g, "")); toast.success("SMS copié"); } catch { toast.error("Copie impossible"); } }} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-menthe" style={{ background: "transparent" }}><Copy className="h-3.5 w-3.5" />Copier le SMS</button>
          )}
        </div>
        <button type="button" onClick={onEcarter} aria-label="Écarter" title="Écarter" className="grid h-7 w-7 flex-none place-items-center rounded-full text-brume hover:text-alerte max-md:-mr-1 max-md:-mt-1 max-md:h-9 max-md:w-9"><X className="h-4 w-4" /></button>
      </div>
    </li>
  );
}

function OngletEnvois() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["prospection-envois"], queryFn: () => base44.request("GET", "/api/prospection/envois") });
  const [choisis, setChoisis] = useState(new Set());
  const mails = data?.mails || [];
  const maj = () => ["prospection-envois", "prospection-jour"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const envoyer = useMutation({
    mutationFn: (ids) => base44.request("POST", "/api/prospection/envois/envoyer", { body: { ids } }),
    onSuccess: (r) => {
      const t = [r.envoyes ? `${r.envoyes} envoyé${r.envoyes > 1 ? "s" : ""}` : null, r.sms ? `${r.sms} SMS noté${r.sms > 1 ? "s" : ""}` : null, r.simules ? `${r.simules} simulé${r.simules > 1 ? "s" : ""} (aucune boîte connectée)` : null, r.rates ? `${r.rates} raté${r.rates > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
      (r.rates ? toast.error : toast.success)(t || "Rien n'est parti");
      setChoisis(new Set());
      maj();
    },
    onError: (e) => toast.error(e?.message || "Envoi raté"),
  });
  const ecarter = useMutation({ mutationFn: (id) => base44.request("POST", `/api/prospection/envois/${id}/ecarter`), onSuccess: maj });
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  return (
    <div>
      <p className="m-0 mb-4 max-w-[64ch] text-[13.5px] text-craie">Tout ce qui part vers un agent passe ici : les mails d'après appel, leurs relances le jour venu, les SMS, les réponses aux dossiers. Relis, coche, envoie : ils partent de ta boîte. Rien ne part tout seul.</p>
      {mails.length ? (
        <>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {mails.map((m) => <Envoi key={m.id} m={m} choisi={choisis.has(m.id)} onChoisir={(v) => setChoisis((s) => { const n = new Set(s); if (v) n.add(m.id); else n.delete(m.id); return n; })} onEcarter={() => ecarter.mutate(m.id)} />)}
          </ul>
          <div className="sticky bottom-4 mt-4 flex justify-end max-md:bottom-[calc(16px+env(safe-area-inset-bottom))]">
            <button type="button" disabled={!choisis.size || envoyer.isPending} onClick={() => { if (window.confirm(`Envoyer ${choisis.size} élément${choisis.size > 1 ? "s" : ""} ?`)) envoyer.mutate([...choisis]); }} className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[14px] font-semibold text-sur-menthe shadow-lg disabled:opacity-40">
              {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer {choisis.size || ""}
            </button>
          </div>
        </>
      ) : <p className={`${carte} p-8 text-center text-[13.5px] text-craie`}>Rien à envoyer.</p>}
      {data?.programmes?.length > 0 && (
        <section className="mt-6">
          <p className={etiquette}>Relances préparées pour plus tard</p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {data.programmes.map((m) => <li key={m.id} className="text-[12.5px] text-craie"><span className="tabular-nums text-brume">{jourFr(m.pour_le)}</span> · {m.nom} · {m.objet}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les décisions
// ---------------------------------------------------------------------------

function Decision({ d, raisons }) {
  const queryClient = useQueryClient();
  const [non, setNon] = useState(false);
  const [raison, setRaison] = useState(raisons[0] || "");
  const decider = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/prospection/decisions/${d.deal_id}`, { body: corps }),
    onSuccess: (r, corps) => {
      toast.success(corps.decision === "oui" ? "Oui : la demande de documents attend dans À envoyer" : r.range ? "Non : dossier rangé, sans mail" : "Non : la réponse à l'agent attend dans À envoyer");
      ["prospection-decisions", "prospection-envois", "prospection-jour"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(e?.message || "Décision non enregistrée"),
  });
  const retard = d.depuis_h > 48;
  return (
    <li className={`${carte} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/Dossiers?deal_id=${d.deal_id}`} className="text-[15px] font-semibold text-encre hover:text-menthe">{d.titre}</Link>
          <p className="m-0 mt-0.5 text-[12.5px] text-craie">{[d.agent, d.ville].filter(Boolean).join(" · ")} · <span className={retard ? "text-alerte" : ""}>reçu il y a {d.depuis_h < 24 ? `${d.depuis_h} h` : `${Math.round(d.depuis_h / 24)} j`}</span></p>
          {d.verdict && <p className="m-0 mt-1.5 text-[12.5px] text-encre">Préanalyse : {d.verdict}{d.motifs?.length ? ` · ${d.motifs.join(" ; ")}` : ""}</p>}
        </div>
        <div className="flex flex-none gap-2">
          <button type="button" disabled={decider.isPending} onClick={() => decider.mutate({ decision: "oui" })} className="rounded-full bg-menthe px-4 py-1.5 text-[13px] font-semibold text-sur-menthe">Oui</button>
          <button type="button" disabled={decider.isPending} onClick={() => setNon((x) => !x)} className={`rounded-full border px-4 py-1.5 text-[13px] ${non ? "border-alerte/60 text-alerte" : "border-bord-doux text-craie hover:text-encre"}`}>Non</button>
        </div>
      </div>
      {non && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-trait pt-3">
          <label htmlFor={`raison-${d.deal_id}`} className="text-[12.5px] text-craie">Pourquoi</label>
          <select id={`raison-${d.deal_id}`} value={raison} onChange={(e) => setRaison(e.target.value)} className="rounded-lg border border-bord-doux bg-fond px-2 py-1.5 text-[13px] text-encre max-md:min-w-0 max-md:max-w-full max-md:text-[16px]">
            {raisons.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button type="button" onClick={() => decider.mutate({ decision: "non", raison })} className="rounded-full border border-alerte/60 px-3.5 py-1.5 text-[12.5px] text-encre">Préparer la réponse</button>
          <button type="button" onClick={() => decider.mutate({ decision: "non", raison, sans_mail: true })} className="text-[12px] text-brume hover:text-encre" style={{ background: "transparent" }}>Non, sans mail</button>
        </div>
      )}
    </li>
  );
}

function OngletDecisions() {
  const { data, isLoading } = useQuery({ queryKey: ["prospection-decisions"], queryFn: () => base44.request("GET", "/api/prospection/decisions") });
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  const dossiers = data?.dossiers || [];
  return (
    <div>
      <p className="m-0 mb-4 text-[13.5px] text-craie">Les dossiers préanalysés qui attendent un Oui ou un Non, dans les 48 heures. Oui prépare la demande de documents, Non prépare la réponse à l'agent avec ta raison.</p>
      {dossiers.length ? <ul className="m-0 flex list-none flex-col gap-2.5 p-0">{dossiers.map((d) => <Decision key={d.deal_id} d={d} raisons={data.raisons || []} />)}</ul>
        : <p className={`${carte} p-8 text-center text-[13.5px] text-craie`}>Aucun dossier en attente de décision.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les agents
// ---------------------------------------------------------------------------

const STATUTS = { nouveau: "À appeler", a_rappeler: "À rappeler", en_discussion: "En discussion", pas_de_murs: "Pas de murs", envoie_des_fiches: "Envoie des fiches", pause: "En pause", archive: "Archivé" };

function FicheAgent({ id, onFermer }) {
  const { data } = useQuery({ queryKey: ["prospection-agent", id], queryFn: () => base44.request("GET", `/api/prospection/agents/${id}`) });
  const a = data?.agent;
  if (!a) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const lignes = [
    ["Téléphones", (a.telephones || []).join(", ")], ["Mails", (a.emails || []).join(", ")], ["Secteurs", (a.secteurs || []).join(", ")],
    ["Référent", a.referent], ["Dernier contact", dateCourte(a.dernier_contact_le)], ["Prochaine action", a.prochaine ? `${jourFr(a.prochaine.le)} : ${a.prochaine.quoi}` : ""],
    ["Score", `${a.score || 0} (${a.fiches || 0} fiches, ${a.oui || 0} Oui)`], ["Equimmox", Object.entries(a.annonces_par_ville || {}).map(([v, n]) => `${v} ${n}`).join(", ")],
    ["Source", a.source], ["Remarques", a.remarques],
  ].filter(([, v]) => v);
  return (
    <section className={`${carte} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-[18px] font-semibold text-encre">{a.nom}</h3>
          <p className="m-0 mt-0.5 text-[13px] text-craie">{[a.agence, a.ville, STATUTS[a.statut]].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="text-brume hover:text-encre max-md:-mr-2 max-md:-mt-2 max-md:grid max-md:h-10 max-md:w-10 max-md:flex-none max-md:place-items-center" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      <dl className="m-0 mt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px] max-md:grid-cols-[100px_minmax(0,1fr)]">
        {lignes.map(([k, v]) => <React.Fragment key={k}><dt className="text-brume">{k}</dt><dd className="m-0 break-words text-encre">{v}</dd></React.Fragment>)}
      </dl>
      {a.resume_dernier_appel && <p className="m-0 mt-3 text-[13px] text-craie">Dernier appel : {a.resume_dernier_appel}</p>}
      <p className={`${etiquette} mt-5`}>Historique</p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {(a.journal || []).map((j, i) => <li key={i} className="text-[12.5px] text-craie"><span className="text-brume">{dateCourte(j.le)} · {j.type}</span> {j.texte}</li>)}
        {!a.journal?.length && <li className="text-[12.5px] text-brume">Rien encore.</li>}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// La grille : l'ancienne Google Sheet, dans la plateforme
// ---------------------------------------------------------------------------

const STATUTS_GRILLE = { nouveau: ["À appeler", "neutre"], a_rappeler: ["À rappeler", "ambre"], en_discussion: ["En discussion", "menthe"], pas_de_murs: ["Pas de murs", "neutre"], envoie_des_fiches: ["Envoie des fiches", "menthe"], pause: ["En pause", "neutre"], archive: ["Archivé", "alerte"] };

// Les colonnes de la grille. D'abord celles qu'on lit d'un coup d'œil (la
// maquette : poste, contact, attribué à, statut), puis l'appel, puis le reste
// de la Sheet de l'équipe et ce que la plateforme sait, en défilant à droite.
// L'entreprise se lit sous le nom ; l'email et le numéro dans « Contact ».
const COLONNES = [
  { cle: "poste", titre: "Poste", largeur: 190 },
  { cle: "contact", titre: "Contact", largeur: 230, contact: true },
  { cle: "referent", titre: "Attribué à", largeur: 150, referent: true, lire: (a) => (a.referent || "").split("@")[0].split(".")[0] },
  { cle: "statut", titre: "Statut", largeur: 180, statut: true },
  { cle: "appel", titre: "Appel", largeur: 130, appel: true },
  { cle: "immo_commercial", titre: "Immobilier commercial", largeur: 150 },
  { cle: "specialite", titre: "Spécialité", largeur: 150 },
  { cle: "reponse", titre: "Réponse", largeur: 180 },
  { cle: "remarques", titre: "Remarque", largeur: 260 },
  { cle: "bien_similaire", titre: "Bien à vendre similaire", largeur: 200 },
  { cle: "linkedin", titre: "LinkedIn", largeur: 180 },
  { cle: "a_appeler", titre: "Relance", largeur: 260, lire: (a) => a.a_appeler?.raison || "" },
  { cle: "prochaine", titre: "Prochaine action", largeur: 240, lire: (a) => (a.prochaine ? `${dateCourte(a.prochaine.le)} · ${a.prochaine.quoi}` : ""), fixe: true },
  { cle: "dernier_contact_le", titre: "Dernier contact", largeur: 120, lire: (a) => dateCourte(a.dernier_contact_le), fixe: true },
  { cle: "resume_dernier_appel", titre: "Dernier appel", largeur: 260, fixe: true },
  { cle: "secteurs", titre: "Secteurs", largeur: 160, lire: (a) => (a.secteurs || []).join(", "), liste: true },
  { cle: "annonces", titre: "Annonces", largeur: 110, lire: (a) => (a.annonces ? String(a.annonces) : ""), fixe: true },
  { cle: "score", titre: "Score", largeur: 80, lire: (a) => (a.score ? String(a.score) : ""), fixe: true },
  { cle: "source", titre: "Source", largeur: 150, fixe: true },
];
// Les champs du contact et de l'entreprise, modifiables comme une cellule.
const COL_EMAILS = { cle: "emails", titre: "Email", lire: (a) => (a.emails || []).join(", "), liste: true };
const COL_TELEPHONES = { cle: "telephones", titre: "Numéro", lire: (a) => (a.telephones || []).join(", "), liste: true };
const COL_AGENCE = { cle: "agence", titre: "Entreprise" };

// Les teintes d'une pastille de statut : le fond, le texte, le point.
const TEINTES_STATUT = {
  neutre: "bg-relief text-encre [--point:rgb(var(--k-encre-rgb))]",
  menthe: "bg-menthe/[0.14] text-menthe [--point:rgb(var(--k-menthe-rgb))]",
  ambre: "bg-ambre/[0.14] text-ambre [--point:currentColor]",
  alerte: "bg-alerte/[0.14] text-alerte [--point:currentColor]",
};

function Cellule({ agent, col, onEnregistrer, equipe = [], teinte = "text-craie" }) {
  const valeur = col.lire ? col.lire(agent) : agent[col.cle] || "";
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(valeur);
  useEffect(() => { if (!edition) setTexte(valeur); }, [valeur, edition]);
  if (col.statut) {
    const [mot, ton] = STATUTS_GRILLE[agent.statut] || [agent.statut, "neutre"];
    return (
      <span className={`relative inline-flex h-8 items-center gap-2 rounded-full pl-3 pr-2 text-[13px] ${TEINTES_STATUT[ton]}`} title={mot}>
        <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--point)" }} />
        <span className="whitespace-nowrap">{mot}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-none opacity-70" />
        <select aria-label={`Statut de ${agent.nom}`} value={agent.statut || "nouveau"} onChange={(e) => onEnregistrer({ statut: e.target.value })}
          className="absolute inset-0 cursor-pointer opacity-0 max-md:text-[16px]">
          {Object.entries(STATUTS_GRILLE).map(([k, [m]]) => <option key={k} value={k}>{m}</option>)}
        </select>
      </span>
    );
  }
  // Attribué à : un choix dans l'équipe. On affiche le prénom, on enregistre
  // l'adresse (c'est elle que lisent Monday et AK). Un référent hors équipe
  // reste proposé, pour ne pas l'effacer en ouvrant la liste.
  if (col.referent) {
    const horsEquipe = agent.referent && !equipe.some((m) => m.email === agent.referent);
    return (
      <span className="relative block w-[130px]">
        <select aria-label={`Attribué à, pour ${agent.nom}`} value={agent.referent || ""} onChange={(e) => onEnregistrer({ referent: e.target.value })}
          className={`h-8 w-full cursor-pointer appearance-none rounded-lg border-0 bg-relief pl-3 pr-8 text-[13px] outline-none max-md:text-[16px] ${agent.referent ? "text-encre" : "text-brume"}`}>
          <option value="">—</option>
          {equipe.map((m) => <option key={m.email} value={m.email}>{m.prenom}</option>)}
          {horsEquipe && <option value={agent.referent}>{valeur}</option>}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ardoise" />
      </span>
    );
  }
  if (col.fixe || col.cle === "a_appeler") return <span className="line-clamp-3 text-[13.5px] leading-[1.5] text-craie" title={valeur}>{valeur || <span className="text-bord-vif">—</span>}</span>;
  if (edition) {
    const valider = () => {
      setEdition(false);
      if (texte === valeur) return;
      onEnregistrer({ [col.cle]: col.liste ? texte.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : texte });
    };
    return <textarea autoFocus aria-label={col.titre} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={valider} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); valider(); } if (e.key === "Escape") { setTexte(valeur); setEdition(false); } }} rows={2} className="w-full resize-none rounded-md border border-menthe/60 bg-fond px-2 py-1 text-[13.5px] text-encre outline-none max-md:text-[16px]" />;
  }
  return (
    <button type="button" onClick={() => setEdition(true)} className={`block w-full border-0 p-0 text-left text-[13.5px] leading-[1.5] hover:text-encre ${teinte}`} style={{ background: "transparent" }} title={valeur ? `${valeur} (clic pour modifier)` : "Clic pour remplir"}>
      <span className="line-clamp-3">{valeur || <span className="text-bord-vif">—</span>}</span>
    </button>
  );
}

function OngletGrille({ onAppeler }) {
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState(() => { try { return localStorage.getItem("prospection.onglet") || ""; } catch { return ""; } });
  const [jour, setJour] = useState(true);
  const [q, setQ] = useState("");
  const [fiche, setFiche] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [nouvelle, setNouvelle] = useState({ nom: "", agence: "", telephone: "", email: "" });
  useEffect(() => { try { localStorage.setItem("prospection.onglet", onglet); } catch { /* le choix se perd, sans gravité */ } }, [onglet]);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["prospection-grille", onglet, jour],
    queryFn: () => base44.request("GET", `/api/prospection/grille?onglet=${encodeURIComponent(onglet)}&jour=${jour ? 1 : 0}`),
    refetchInterval: 60000,
    // L'onglet précédent reste affiché pendant que le suivant arrive.
    placeholderData: (avant) => avant,
  });
  const maj = () => ["prospection-grille", "prospection-jour"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const enregistrer = useMutation({
    mutationFn: ({ id, champs }) => base44.request("POST", `/api/prospection/agents/${id}`, { body: champs }),
    onSuccess: maj,
    onError: (e) => toast.error(e?.message || "Modification perdue"),
  });
  // Annuler, rétablir : deux piles de modifications de cellules. Chaque entrée
  // garde l'agent, les valeurs d'avant et d'après ; annuler renvoie celles
  // d'avant au serveur, rétablir celles d'après. Dans une référence, pas dans
  // un état : le clavier (⌘Z) doit lire la pile du moment sans se réabonner.
  const historique = useRef({ passe: [], futur: [] });
  const [, rafraichir] = useState(0);
  const modifier = (a, champs) => {
    const avant = Object.fromEntries(Object.keys(champs).map((k) => [k, k === "statut" ? a.statut || "nouveau" : a[k] ?? (Array.isArray(champs[k]) ? [] : "")]));
    historique.current = { passe: [...historique.current.passe, { id: a.id, nom: a.nom, avant, apres: champs }].slice(-50), futur: [] };
    rafraichir((x) => x + 1);
    enregistrer.mutate({ id: a.id, champs });
  };
  const annuler = () => {
    const { passe, futur } = historique.current;
    const e = passe[passe.length - 1];
    if (!e) return;
    historique.current = { passe: passe.slice(0, -1), futur: [...futur, e] };
    rafraichir((x) => x + 1);
    enregistrer.mutate({ id: e.id, champs: e.avant });
    toast.success(`Annulé pour ${e.nom}`);
  };
  const retablir = () => {
    const { passe, futur } = historique.current;
    const e = futur[futur.length - 1];
    if (!e) return;
    historique.current = { passe: [...passe, e], futur: futur.slice(0, -1) };
    rafraichir((x) => x + 1);
    enregistrer.mutate({ id: e.id, champs: e.apres });
    toast.success(`Rétabli pour ${e.nom}`);
  };
  useEffect(() => {
    const clavier = (e) => {
      const k = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey) || (k !== "z" && k !== "y")) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      if (k === "y" || e.shiftKey) retablir(); else annuler();
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, []);
  const ajouter = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/agents", { body: { ...nouvelle, ville: onglet || null, onglet: onglet || null } }),
    onSuccess: (r) => { toast[r.deja_connu ? "error" : "success"](r.deja_connu ? "Déjà dans la grille : complété" : "Agent ajouté"); setAjout(false); setNouvelle({ nom: "", agence: "", telephone: "", email: "" }); maj(); },
    onError: (e) => toast.error(e?.message || "Ajout raté"),
  });
  const equimmox = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/equimmox", { body: { villes: [onglet] } }),
    onSuccess: () => toast.success(`Equimmox relu pour ${onglet} : les agents qui publient arrivent dans la grille d'ici une minute`),
    onError: (e) => toast.error(e?.message || "Equimmox indisponible"),
  });
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.lignes || []).filter((a) => !t || `${a.nom} ${a.agence || ""} ${(a.telephones || []).join(" ")} ${(a.emails || []).join(" ")} ${a.remarques || ""}`.toLowerCase().includes(t));
  }, [data, q]);
  const onglets = data?.onglets || [];

  return (
    <div className="flex flex-col gap-3">
      {/* Pas de filet sous la rangée : seule la ville choisie est soulignée. */}
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[{ nom: "", n: data?.total }, ...onglets].map((o) => (
          <button key={o.nom || "tous"} type="button" onClick={() => setOnglet(o.nom)}
            className={`flex-none rounded-none border-0 border-b-2 bg-transparent px-3 pb-3 pt-1 text-[13.5px] transition-colors ${onglet === o.nom ? "border-encre text-encre" : "border-transparent text-ardoise hover:text-encre"}`}
            style={{ background: "transparent" }}>
            {o.nom || "Toutes les villes"} <span className="ml-1 text-[11.5px] tabular-nums text-brume">{o.n ?? ""}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-trait p-1">
          {[[true, `À appeler aujourd'hui${data?.a_appeler != null ? ` · ${data.a_appeler}` : ""}`], [false, "Tous les agents"]].map(([v, mot]) => (
            <button key={String(v)} type="button" onClick={() => setJour(v)}
              className={`h-8 rounded-full border-0 px-3 text-[13px] ${jour === v ? "bg-encre/90 text-fond" : "bg-transparent text-craie hover:text-encre"}`}
              style={jour === v ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2.5 rounded-full border border-trait bg-rail px-4 focus-within:border-bord-vif max-md:min-w-0 max-md:basis-full">
          <Search className="h-4 w-4 flex-none text-brume" />
          <input id="recherche-grille" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un nom, une agence, un numéro" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </label>
        <div className="inline-flex items-center gap-0.5">
          <button type="button" onClick={annuler} disabled={!historique.current.passe.length} title="Annuler la dernière modification (⌘Z)" aria-label="Annuler" className="grid h-9 w-9 place-items-center rounded-full border-0 p-0 text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={retablir} disabled={!historique.current.futur.length} title="Rétablir (⇧⌘Z)" aria-label="Rétablir" className="grid h-9 w-9 place-items-center rounded-full border-0 p-0 text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Redo2 className="h-4 w-4" /></button>
        </div>
        {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-ardoise" />}
        {onglet && <button type="button" onClick={() => equimmox.mutate()} disabled={equimmox.isPending} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}><RefreshCw className="h-3.5 w-3.5" />Relire Equimmox à {onglet}</button>}
        <button type="button" onClick={() => setAjout((x) => !x)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-menthe px-4 text-[14px] text-sur-menthe hover:bg-menthe-survol"><Plus className="h-4 w-4" />Ajouter une ligne</button>
      </div>

      {ajout && (
        <form onSubmit={(e) => { e.preventDefault(); ajouter.mutate(); }} className={`${carte} grid gap-2 p-4 sm:grid-cols-5`}>
          {[["nom", "Prénom Nom"], ["agence", "Entreprise"], ["telephone", "Numéro"], ["email", "Email"]].map(([k, ex]) => <input key={k} id={`nouvelle-${k}`} value={nouvelle[k]} onChange={(e) => setNouvelle((x) => ({ ...x, [k]: e.target.value }))} placeholder={ex} aria-label={ex} className={champ} />)}
          <button type="submit" disabled={!(nouvelle.nom || nouvelle.agence) || !(nouvelle.telephone || nouvelle.email)} className="rounded-full bg-menthe px-4 py-2 text-[13px] font-semibold text-sur-menthe disabled:opacity-40">Ajouter{onglet ? ` à ${onglet}` : ""}</button>
        </form>
      )}

      {isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div> : (
        <div className="mt-3 max-h-[calc(100vh-300px)] overflow-auto rounded-[16px] border border-trait bg-rail max-md:max-h-[75dvh]">
          <table className="min-w-full border-collapse text-[13.5px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 min-w-[220px] border-b border-trait bg-rail py-3.5 pl-6 pr-4 text-left text-[12.5px] font-normal text-ardoise max-md:min-w-[150px] max-md:pl-4 max-md:pr-3">Agent</th>
                {COLONNES.map((c) => (
                  <th key={c.cle} className="border-b border-trait bg-rail px-4 py-3.5 text-left text-[12.5px] font-normal text-ardoise" style={{ minWidth: c.largeur }}>{c.titre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((a) => {
                const pris = a.verrou && a.verrou.par !== undefined;
                const enregistrerA = (champs) => modifier(a, champs);
                return (
                  <tr key={a.id} className={`group ${a.a_appeler ? "" : "opacity-[0.92]"}`}>
                    <td className="sticky left-0 z-10 border-b border-trait bg-rail py-4 pl-6 pr-4 align-middle group-hover:bg-rail max-md:pl-4 max-md:pr-3">
                      <button type="button" onClick={() => setFiche(a.id)} className="block max-w-[220px] truncate max-md:max-w-[150px] border-0 p-0 text-left text-[15px] font-medium text-encre hover:text-menthe" style={{ background: "transparent" }} title={a.onglet || undefined}>{a.nom}</button>
                      <div className="mt-0.5 max-w-[220px] max-md:max-w-[150px]"><Cellule agent={a} col={COL_AGENCE} onEnregistrer={enregistrerA} teinte="text-ardoise text-[13px]" /></div>
                    </td>
                    {COLONNES.map((c) => (
                      <td key={c.cle} className="border-b border-trait px-4 py-4 align-middle group-hover:bg-encre/[0.02]" style={{ minWidth: c.largeur, maxWidth: c.largeur + 80 }}>
                        {c.appel ? (pris ? <Pastille><Lock className="h-3 w-3" />{a.verrou.nom}</Pastille>
                          : (a.telephones?.length || a.emails?.length) ? <button type="button" onClick={() => onAppeler(a)} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3 text-[12.5px] text-sur-menthe"><PhoneCall className="h-3.5 w-3.5" />Appeler</button> : <span className="text-[12.5px] text-bord-vif">pas de contact</span>)
                          : c.contact ? (
                            <div className="flex flex-col gap-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                              <Cellule agent={a} col={COL_EMAILS} onEnregistrer={enregistrerA} />
                              <Cellule agent={a} col={COL_TELEPHONES} onEnregistrer={enregistrerA} teinte="text-encre" />
                            </div>
                          )
                          : <Cellule agent={a} col={c} equipe={data?.equipe || []} onEnregistrer={enregistrerA} />}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!lignes.length && <tr><td colSpan={COLONNES.length + 1} className="px-6 py-10 text-center text-[13px] text-brume">{jour ? `Personne à appeler aujourd'hui${onglet ? ` à ${onglet}` : ""}. Passe sur « Tous les agents », ou relis Equimmox.` : "Aucun agent dans cet onglet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="m-0 text-[11px] text-brume">{lignes.length} ligne{lignes.length > 1 ? "s" : ""} · clic sur une cellule pour la modifier, sur un nom pour sa fiche et son historique · « Appeler » le prend à ton nom.</p>
      {fiche && (
        <div className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-40 w-full max-w-[460px] overflow-y-auto border-l border-relief bg-fond p-4 shadow-2xl max-md:z-[70] max-md:border-l-0 max-md:pb-[calc(16px+env(safe-area-inset-bottom))] max-md:pt-[calc(16px+env(safe-area-inset-top))]">
          <FicheAgent id={fiche} onFermer={() => setFiche(null)} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

function OngletTableau() {
  const { data, isLoading } = useQuery({ queryKey: ["prospection-tableau"], queryFn: () => base44.request("GET", "/api/prospection/tableau") });
  if (isLoading || !data) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  const tuiles = [["Appels passés", data.appels], ["Agents joints", data.agents_joints], ["Dossiers reçus", data.dossiers_recus], ["Taux de Oui", `${data.taux_oui} %`], ["Délai de décision", data.delai_reponse_h != null ? `${data.delai_reponse_h} h` : "pas encore"], ["Relances en retard", data.relances_en_retard]];
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-craie">Semaine du {new Date(`${data.semaine}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {tuiles.map(([l, v]) => <div key={l} className={`${carte} p-4`}><p className={etiquette}>{l}</p><p className="m-0 mt-2 text-[30px] font-light leading-none tabular-nums text-encre max-md:text-[24px]">{v}</p></div>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${carte} p-5`}>
          <p className={etiquette}>Les agents qui rapportent</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">{data.meilleurs_agents.map((a) => <li key={a.id} className="flex justify-between gap-3 text-[13px]"><span className="text-encre">{a.nom}</span><span className="tabular-nums text-craie">{a.fiches} fiche{a.fiches > 1 ? "s" : ""} · score {a.score}</span></li>)}{!data.meilleurs_agents.length && <li className="text-[13px] text-brume">Pas encore de fiche.</li>}</ul>
        </section>
        <section className={`${carte} p-5`}>
          <p className={etiquette}>Appels par personne</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">{Object.entries(data.appels_par_personne).map(([e, n]) => <li key={e} className="flex justify-between text-[13px]"><span className="text-encre">{e.split("@")[0]}</span><span className="tabular-nums text-craie">{n}</span></li>)}{!Object.keys(data.appels_par_personne).length && <li className="text-[13px] text-brume">Aucun appel cette semaine.</li>}</ul>
        </section>
      </div>
      {data.en_attente_de_decision.length > 0 && (
        <section className={`${carte} p-5`}>
          <p className={etiquette}>En attente de décision</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">{data.en_attente_de_decision.map((d) => <li key={d.deal_id} className="text-[13px]"><Link to={`/Dossiers?deal_id=${d.deal_id}`} className="text-encre hover:text-menthe">{d.titre}</Link> <span className={d.depuis_h > 48 ? "text-alerte" : "text-brume"}>· {d.agent || "agent inconnu"} · {d.depuis_h} h</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

function OngletReglages() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["prospection-reglages"], queryFn: () => base44.request("GET", "/api/prospection/reglages") });
  const [r, setR] = useState(null);
  const [ville, setVille] = useState("");
  const [source, setSource] = useState("Apollo");
  const fichier = useRef(null);
  useEffect(() => { if (data?.reglages) setR(data.reglages); }, [data?.reglages]);
  const maj = () => ["prospection-reglages", "prospection-jour", "prospection-agents"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const enregistrer = useMutation({ mutationFn: () => base44.request("POST", "/api/prospection/reglages", { body: { villes: r.villes, criteres: r.criteres, objet_criteres: r.objet_criteres } }), onSuccess: () => { toast.success("Réglages enregistrés"); maj(); } });
  const importer = useMutation({
    mutationFn: (f) => { const form = new FormData(); form.append("fichier", f); form.append("source", source); return base44.request("POST", "/api/prospection/import", { body: form, isForm: true }); },
    onSuccess: (x) => { toast.success(`${x.lignes} lignes : ${x.crees} agents ajoutés, ${x.completes} déjà connus complétés${x.sans_contact ? `, ${x.sans_contact} sans contact` : ""}`); maj(); },
    onError: (e) => toast.error(e?.message || "Import raté"),
  });
  const [lienSheet, setLienSheet] = useState("https://docs.google.com/spreadsheets/d/1uAUNTI1giePGf-CP-pnfOCSlkS7pf6y9RzI-4bhz2O0");
  const sheet = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/import-sheet", { body: { lien: lienSheet } }),
    onSuccess: (x) => { toast.success(`${x.lus} agents lus (${Object.entries(x.onglets).map(([o, n]) => `${o} ${n}`).join(", ")}) : ${x.crees} ajoutés, ${x.completes} déjà connus complétés`); maj(); },
    onError: (e) => toast.error(e?.message || "Import raté"),
  });
  const monday = useMutation({ mutationFn: () => base44.request("POST", "/api/prospection/import-monday"), onSuccess: (x) => { toast.success(`Monday : ${x.lus} lus, ${x.crees} ajoutés, ${x.completes} complétés`); maj(); }, onError: (e) => toast.error(e?.message || "Monday injoignable") });
  if (!r) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  const ajouterVille = (v) => { const t = String(v || "").trim(); if (t && !r.villes.includes(t)) setR((x) => ({ ...x, villes: [...x.villes, t] })); };
  const suggestions = (data?.villes_des_dossiers || []).filter((v) => !r.villes.includes(v));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${carte} p-5`}>
        <p className={etiquette}>Villes cibles</p>
        <p className="m-0 mt-1 text-[13px] text-craie">Chaque nuit, Equimmox y relève qui publie du commerce en vente. Chaque matin, tu choisis parmi elles les villes du jour.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.villes.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full border border-menthe/50 px-2.5 py-1 text-[12.5px] text-encre">{v}<button type="button" aria-label={`Retirer ${v}`} onClick={() => setR((x) => ({ ...x, villes: x.villes.filter((y) => y !== v) }))} className="text-brume hover:text-alerte max-md:-my-1 max-md:grid max-md:h-7 max-md:w-7 max-md:place-items-center"><X className="h-3 w-3" /></button></span>)}
          <form onSubmit={(e) => { e.preventDefault(); ajouterVille(ville); setVille(""); }}><input id="ville-cible" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ajouter une ville" className="w-[150px] rounded-full border border-bord-doux bg-fond px-3 py-1 text-[12.5px] text-encre outline-none focus:border-menthe/60 max-md:py-1.5 max-md:text-[16px]" /></form>
        </div>
        {suggestions.length > 0 && (
          <p className="m-0 mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-brume">Villes de vos dossiers : {suggestions.map((v) => <button key={v} type="button" onClick={() => ajouterVille(v)} className="rounded-full border border-dashed border-bord-doux px-2 py-0.5 text-craie hover:text-encre">+ {v}</button>)}</p>
        )}
      </section>
      <section className={`${carte} p-5`}>
        <p className={etiquette}>Le carnet</p>
        <p className="m-0 mt-1 text-[13px] text-craie">{data?.carnet || 0} agents dans la plateforme. Elle fait foi ; Monday en reçoit une copie{data?.monday?.agents?.id ? " (tableaux « Agents (plateforme) » et « Dossiers (pipeline) »)" : ", dès le premier passage sur Render"}.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {["Apollo", "Google Sheet", "Autre"].map((s) => <button key={s} type="button" onClick={() => setSource(s)} className={`rounded-full border px-3 py-1 text-[12px] ${source === s ? "border-menthe bg-menthe font-semibold text-sur-menthe" : "border-bord-doux text-craie"}`}>{s}</button>)}
        </div>
        <input ref={fichier} id="fichier-agents" type="file" accept=".csv,.xlsx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importer.mutate(f); e.target.value = ""; }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => fichier.current?.click()} disabled={importer.isPending} className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie hover:text-encre">{importer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}Importer un fichier (CSV, Excel)</button>
          <button type="button" onClick={() => monday.mutate()} disabled={monday.isPending} className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie hover:text-encre">{monday.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Reprendre les agents de Monday</button>
        </div>
        <div className="mt-4 border-t border-trait pt-4">
          <label htmlFor="lien-sheet" className="text-[12.5px] text-craie">Ta Google Sheet d'agents (un onglet par ville) :</label>
          <div className="mt-1.5 flex gap-2">
            <input id="lien-sheet" value={lienSheet} onChange={(e) => setLienSheet(e.target.value)} className={champ} />
            <button type="button" onClick={() => sheet.mutate()} disabled={sheet.isPending || !lienSheet.trim()} className="inline-flex flex-none items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] font-semibold text-sur-menthe">{sheet.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}Importer</button>
          </div>
        </div>
        <p className="m-0 mt-3 text-[12px] text-brume">Alertes des sites : crée une alerte « commerce en vente » sur SeLoger, Leboncoin, BureauxLocaux et Geolocaux vers sourcing@klocka.immo ; les agences qu'elles citent entrent au carnet la nuit.{data?.alertes?.sites?.length ? ` Reçues : ${data.alertes.sites.map((s) => `${s.site} ${s.recues}`).join(", ")}.` : ""}</p>
      </section>
      <section className={`${carte} p-5 lg:col-span-2`}>
        <p className={etiquette}>Nos critères</p>
        <p className="m-0 mt-1 text-[13px] text-craie">AK s'en sert pour écrire les mails de présentation après un appel. {"{prenom}"}, {"{agence}"}, {"{ville}"} et {"{signature}"} se remplissent.</p>
        <input id="objet-criteres" value={r.objet_criteres || ""} onChange={(e) => setR((x) => ({ ...x, objet_criteres: e.target.value }))} className={`${champ} mt-3`} />
        <textarea id="criteres" value={r.criteres || ""} onChange={(e) => setR((x) => ({ ...x, criteres: e.target.value }))} rows={7} placeholder="Ce que Klocka achète : type de murs, fourchette de prix, rendement, emplacement, bail." className={`${champ} mt-2 leading-[1.55]`} />
      </section>
      <div className="flex justify-end lg:col-span-2">
        <button type="button" onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending} className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[14px] font-semibold text-sur-menthe">{enregistrer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Enregistrer</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// La carte de confirmation, après un appel raconté
// ---------------------------------------------------------------------------

const CARTE_DUREE_MS = 9000;

/** Tout ce qui a été rempli, sur une seule carte ; elle s'efface seule (le survol la retient). */
function CarteAppel({ carte: initiale, onFermer }) {
  const queryClient = useQueryClient();
  const [carte, setCarte] = useState(initiale);
  const [retenue, setRetenue] = useState(false);
  const [edition, setEdition] = useState(null); // null | "statut" | "prochaine"
  const [brouillon, setBrouillon] = useState({});
  // Une correction faite sur la carte : elle s'applique à la fiche et à Monday,
  // et compte dans la fiabilité d'AK (la carte n'a pas été validée telle quelle).
  const corriger = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/prospection/appels/${carte.appel_id}/corriger`, { body: corps }),
    onSuccess: (r) => {
      if (r.agent) setCarte((c) => ({ ...c, statut: STATUTS[r.agent.statut] || r.agent.statut, statut_cle: r.agent.statut, prochaine: r.agent.prochaine ? { quoi: r.agent.prochaine.quoi, le: r.agent.prochaine.le } : c.prochaine }));
      if (!r.inchange) toast.success("Corrigé", { description: r.correction ? `${r.correction.champ} : ${r.correction.apres}` : undefined });
      ["prospection-ma-journee", "prospection-jour", "prospection-grille"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(e?.message || "Correction impossible"),
  });
  const ouvrir = (quoi) => { if (!carte.appel_id) return; setEdition(quoi); setBrouillon({ statut: carte.statut_cle || "a_rappeler", quoi: carte.prochaine?.quoi || "", le: String(carte.prochaine?.le || "").slice(0, 10) }); };
  const enregistrer = async () => {
    if (edition === "statut") await corriger.mutateAsync({ champ: "statut", valeur: brouillon.statut });
    if (edition === "prochaine") {
      if (brouillon.quoi && brouillon.quoi !== carte.prochaine?.quoi) await corriger.mutateAsync({ champ: "prochaine_quoi", valeur: brouillon.quoi });
      if (brouillon.le && brouillon.le !== String(carte.prochaine?.le || "").slice(0, 10)) await corriger.mutateAsync({ champ: "prochaine_le", valeur: brouillon.le });
    }
    setEdition(null);
  };
  const [reste, setReste] = useState(CARTE_DUREE_MS);
  useEffect(() => {
    if (retenue || edition) return undefined;
    if (reste <= 0) { onFermer(); return undefined; }
    const t = setTimeout(() => setReste((r) => r - 100), 100);
    return () => clearTimeout(t);
  }, [reste, retenue, edition, onFermer]);
  const ligne = (mot, valeur) => (valeur ? (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 max-md:grid-cols-[96px_minmax(0,1fr)]">
      <span className="text-[12.5px] text-brume">{mot}</span>
      <span className="min-w-0 text-[13.5px] text-encre">{valeur}</span>
    </div>
  ) : null);
  return (
    <div role="status" aria-live="polite" onMouseEnter={() => setRetenue(true)} onMouseLeave={() => setRetenue(false)}
      className="animate-in fade-in slide-in-from-bottom-3 duration-300 fixed bottom-6 left-1/2 z-50 w-[440px] max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-[18px] border border-bord-doux bg-surface-pleine shadow-[0_24px_60px_rgb(0_0_0/0.35)] max-md:bottom-[calc(16px+env(safe-area-inset-bottom))] max-md:max-h-[calc(100dvh-32px)] max-md:overflow-y-auto">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 text-[12px] text-menthe"><Check className="h-3.5 w-3.5" />Appel noté{carte.monday?.ok ? " · Monday à jour" : ""}</p>
          <p className="m-0 mt-1 truncate text-[17px] font-medium text-encre">{carte.nom}</p>
          {(carte.agence || carte.ville) && <p className="m-0 truncate text-[13px] text-ardoise">{[carte.agence, carte.ville].filter(Boolean).join(" · ")}</p>}
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-10 max-md:w-10" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 border-t border-trait px-5 py-2.5">
        {ligne("Téléphone", carte.telephone)}
        {ligne("E-mail", carte.email)}
        {ligne("Issue", carte.issue)}
        {ligne("Statut", edition === "statut" ? (
          <span className="flex flex-wrap items-center gap-2">
            <select value={brouillon.statut} onChange={(e) => setBrouillon((b) => ({ ...b, statut: e.target.value }))} className="h-8 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none">
              {Object.entries(STATUTS).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
            </select>
            <button type="button" onClick={enregistrer} disabled={corriger.isPending} className="text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Enregistrer</button>
            <button type="button" onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
          </span>
        ) : carte.statut && (
          <button type="button" onClick={() => ouvrir("statut")} title="Corriger le statut" className="group inline-flex items-center gap-2" style={{ background: "transparent" }}>
            <Pastille ton="menthe">{carte.statut}</Pastille>{carte.appel_id && <span className="text-[11.5px] text-brume group-hover:text-encre">corriger</span>}
          </button>
        ))}
        {ligne("Prochaine action", edition === "prochaine" ? (
          <span className="flex flex-col gap-2">
            <input value={brouillon.quoi} onChange={(e) => setBrouillon((b) => ({ ...b, quoi: e.target.value }))} placeholder="Quoi" className="h-8 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none" />
            <span className="flex flex-wrap items-center gap-2">
              <input type="date" value={brouillon.le} onChange={(e) => setBrouillon((b) => ({ ...b, le: e.target.value }))} className="h-8 rounded-[8px] border border-trait bg-surface px-2 text-[13px] text-encre outline-none [color-scheme:dark]" />
              <button type="button" onClick={enregistrer} disabled={corriger.isPending} className="text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Enregistrer</button>
              <button type="button" onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
            </span>
          </span>
        ) : carte.prochaine && (
          <button type="button" onClick={() => ouvrir("prochaine")} title="Corriger la prochaine action" className="group text-left" style={{ background: "transparent" }}>
            {`${carte.prochaine.quoi}${carte.prochaine.le ? `, le ${dateCourte(carte.prochaine.le)}` : ""}`}{carte.appel_id && <span className="ml-2 text-[11.5px] text-brume group-hover:text-encre">corriger</span>}
          </button>
        ))}
        {ligne("Résumé", carte.resume)}
        {ligne("Secteurs", carte.secteurs?.length ? carte.secteurs.join(", ") : null)}
        {ligne("À envoyer", carte.a_envoyer?.length ? carte.a_envoyer.join(" · ") : null)}
        {ligne("Monday", carte.monday?.ok ? <a href={carte.monday.lien} target="_blank" rel="noreferrer" className="text-menthe hover:underline">Ouvrir la ligne</a> : <span className="text-alerte">pas mis à jour : {carte.monday?.erreur}</span>)}
      </div>
      <span className="block h-1 bg-encre/[0.08]"><span className="block h-full bg-menthe transition-[width] duration-100 ease-linear" style={{ width: `${(reste / CARTE_DUREE_MS) * 100}%` }} /></span>
    </div>
  );
}

export default function Prospection() {
  const queryClient = useQueryClient();
  const [onglet, setOnglet] = useState(() => new URLSearchParams(window.location.search).get("onglet") || "grille");
  // Les parties de la page : À appeler (qui appeler aujourd'hui, ce qui attend,
  // la fiabilité d'AK), l'agent IA, ses listes par ville. « Prospecter » (le
  // carnet complet) est caché depuis le 5 oct. 2026 et tourne en coulisse.
  const PARTIES = [["journee", "À appeler"], ["agent", "Agent IA"], ["listes", "Listes"]];
  const [partie, setPartie] = useState(() => { try { const p = localStorage.getItem("prospection.partie"); return PARTIES.some(([k]) => k === p) ? p : "journee"; } catch { return "journee"; } });
  const [aAppeler, setAAppeler] = useState(0);
  useEffect(() => { try { localStorage.setItem("prospection.partie", partie); } catch { /* sans gravité */ } }, [partie]);
  const [listeOuverte, setListeOuverte] = useState(null);
  const [appel, setAppel] = useState(null);
  const [carte, setCarte] = useState(null);
  const jour = useQuery({ queryKey: ["prospection-jour"], queryFn: () => base44.request("GET", "/api/prospection/jour"), refetchInterval: 60000 });
  const prendre = useMutation({
    mutationFn: (a) => base44.request("POST", `/api/prospection/agents/${a.id}/prendre`).then((r) => ({ ...(r?.agent || {}), ...a })),
    onSuccess: (a) => { setAppel({ ...a, raison: a.a_appeler?.raison || "" }); ["prospection-grille", "prospection-ma-journee"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast.error(e?.message || "Déjà pris"),
  });
  const onglets = useMemo(() => [
    ["grille", "Les agents"],
    ["envois", "À envoyer", jour.data?.a_envoyer],
    ["decisions", "Décisions", jour.data?.decisions],
    ["tableau", "Tableau de bord"],
    ["reglages", "Réglages"],
  ], [jour.data]);
  if (jour.isError && /403|réservé/i.test(jour.error?.message || "")) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;
  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-6 max-md:py-6">
      {/* Le titre au centre, les onglets centrés dessous (6 oct. 2026). */}
      <header className="mb-8 flex flex-col items-center gap-6 text-center">
        <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Prospection</h1>
        {/* Les onglets en pilule, comme ceux de la page projet. */}
        <nav className="inline-flex max-w-full gap-1 self-center overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 p-[5px] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Parties de la prospection">
          {PARTIES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setPartie(k)} aria-pressed={partie === k}
              className={`inline-flex h-9 flex-none items-center gap-2 rounded-full border-0 px-4 text-[14px] transition-colors ${partie === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}
              style={partie === k ? undefined : { background: "transparent" }}>
              {mot}{k === "journee" && aAppeler > 0 && <span className={`text-[12px] tabular-nums ${partie === k ? "opacity-70" : "text-brume"}`}>{aAppeler}</span>}
            </button>
          ))}
        </nav>
        {partie === "prospecter" && <nav className="inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-full border border-trait p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Onglets de la prospection">
          {onglets.map(([cle, mot, n]) => (
            <button key={cle} type="button" onClick={() => setOnglet(cle)}
              className={`inline-flex h-8 flex-none items-center gap-1.5 rounded-full border-0 px-3.5 text-[13px] transition-colors ${onglet === cle ? "bg-encre/90 text-fond" : "text-craie hover:text-encre"}`}
              style={onglet === cle ? undefined : { background: "transparent" }}>
              {mot}{n ? <span className={`tabular-nums ${onglet === cle ? "" : "text-brume"}`}>{n}</span> : null}
            </button>
          ))}
        </nav>}
      </header>
      {partie === "journee" && <MaJournee onAppeler={(a) => prendre.mutate(a)} enCours={prendre.isPending} onCompte={setAAppeler} />}
      {partie === "agent" && <OngletAgentIA onOuvrirListe={(id) => { setListeOuverte(id); setPartie("listes"); }} />}
      {partie === "listes" && <OngletListesAgences ouverte={listeOuverte} onOuvrir={setListeOuverte} onAppeler={(id) => prendre.mutate({ id })} />}
      {/* Le contenu de l'onglet entre en fondu à chaque changement. */}
      {partie === "prospecter" && <div key={onglet} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
        {onglet === "grille" && <OngletGrille onAppeler={(a) => prendre.mutate(a)} />}
        {onglet === "envois" && <OngletEnvois />}
        {onglet === "decisions" && <OngletDecisions />}
        {onglet === "tableau" && <OngletTableau />}
        {onglet === "reglages" && <OngletReglages />}
      </div>}
      {appel && (
        <div className="animate-in slide-in-from-right duration-300 ease-out fixed inset-y-0 right-0 z-40 w-full max-w-[520px] overflow-y-auto border-l border-relief bg-fond p-4 shadow-2xl max-md:z-[70] max-md:border-l-0 max-md:pb-[calc(16px+env(safe-area-inset-bottom))] max-md:pt-[calc(16px+env(safe-area-inset-top))]">
          <PanneauAppel key={appel.id} agent={appel} onCarte={setCarte} onFermer={() => { setAppel(null); ["prospection-grille", "prospection-jour"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); }} />
        </div>
      )}
      {carte && <CarteAppel key={carte.nom + (carte.resume || "")} carte={carte} onFermer={() => setCarte(null)} />}
    </div>
  );
}
