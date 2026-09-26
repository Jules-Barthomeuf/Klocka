import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, FileUp, Loader2, Lock, Mail, Mic, PhoneCall, PhoneOff, RefreshCw, Search, Send, Square, X } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { useDictee, versWav } from "@/lib/dictee";

// La prospection, avec l'alternant. La liste du jour est prête ; on choisit
// un agent (il se verrouille à son nom), on enregistre l'appel, et à la fin
// AK propose la suite : le mail, la relance, ce qu'il faut ajouter à la
// fiche. On coche, on relit, on valide. Rien ne part vers un agent sans un
// clic. Le calcul est côté serveur (server/prospection/).

const champ = "w-full rounded-lg border border-bord-doux bg-fond px-3 py-2 text-[13.5px] text-encre outline-none transition-colors placeholder:text-bord-vif focus:border-menthe/60";
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

function PanneauAppel({ agent, onFermer }) {
  const queryClient = useQueryClient();
  const [etat, setEtat] = useState("pret"); // pret | enregistre | analyse | propose
  const [secondes, setSecondes] = useState(0);
  const [recit, setRecit] = useState("");
  const [appel, setAppel] = useState(null);
  const rec = useRef(null);
  const chrono = useRef(0);
  const { supporte: dicteeOk, ecoute, demarrer: dicter, arreter: stopDictee } = useDictee({ onTexte: (t) => setRecit(t) });
  useEffect(() => {
    if (etat !== "enregistre") return undefined;
    const t = setInterval(() => setSecondes((s) => { chrono.current = s + 1; return s + 1; }), 1000);
    return () => clearInterval(t);
  }, [etat]);
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
        {etat === "pret" && <button type="button" onClick={lacher} className="text-[12px] text-brume hover:text-encre" style={{ background: "transparent" }}>Lâcher</button>}
      </div>

      {etat !== "propose" && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {(agent.telephones || []).map((t) => <a key={t} href={telLien(t)} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[14px] font-semibold tabular-nums text-sur-menthe"><PhoneCall className="h-4 w-4" />{t}</a>)}
            {(agent.emails || []).slice(0, 2).map((e) => <a key={e} href={`mailto:${e}`} className="inline-flex items-center gap-1.5 self-center text-[12.5px] text-craie hover:text-encre"><Mail className="h-3.5 w-3.5" />{e}</a>)}
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
                <p className="m-0 text-[12.5px] text-craie">Mets ton téléphone sur haut-parleur. Dis à l'agent que l'appel est enregistré.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={demarrer} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe"><Mic className="h-4 w-4" />Enregistrer l'appel</button>
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
            {etat === "analyse" && <p className="m-0 flex items-center gap-2 text-[13.5px] text-craie"><Loader2 className="h-4 w-4 animate-spin" />AK écoute l'appel et prépare la suite…</p>}
          </div>
        </>
      )}
      {etat === "propose" && appel && <div className="mt-4"><Propositions appel={appel} onFini={onFermer} /></div>}
    </section>
  );
}

function OngletJour({ data, isLoading, allerA }) {
  const queryClient = useQueryClient();
  const [choisi, setChoisi] = useState(null);
  const [ville, setVille] = useState("");
  const villes = data?.villes || [];
  const poserVilles = useMutation({
    mutationFn: (v) => base44.request("POST", "/api/prospection/villes-du-jour", { body: { villes: v } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prospection-jour"] }),
  });
  const equimmox = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/equimmox", { body: { villes } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prospection-jour"] }),
    onError: (e) => toast.error(e?.message || "Equimmox indisponible"),
  });
  const prendre = useMutation({
    mutationFn: (a) => base44.request("POST", `/api/prospection/agents/${a.id}/prendre`).then(() => a),
    onSuccess: (a) => { setChoisi(a); queryClient.invalidateQueries({ queryKey: ["prospection-jour"] }); },
    onError: (e) => toast.error(e?.message || "Déjà pris"),
  });
  const recherche = data?.recherche;
  const avant = useRef(recherche?.etat);
  useEffect(() => {
    if (avant.current === "en_cours" && recherche?.etat === "fini") toast.success(`Equimmox : ${(recherche.resultat?.parVille || []).map((v) => (v.erreur ? `${v.ville} en erreur` : `${v.ville}, ${v.reguliers} agents réguliers`)).join(" ; ")}`);
    if (avant.current === "en_cours" && recherche?.etat === "erreur") toast.error(recherche.erreur || "Equimmox n'a pas répondu");
    avant.current = recherche?.etat;
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  const cibles = [...new Set([...(data?.villes_cibles || []), ...villes])];
  const liste = data?.liste || [];
  const enCours = choisi || (data?.appel_a_valider ? null : liste.find((a) => a.a_moi));

  return (
    <div className="flex flex-col gap-4">
      <section className={`${carte} p-5`}>
        <p className={etiquette}>Les villes ciblées aujourd'hui</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {cibles.map((v) => {
            const on = villes.includes(v);
            return <button key={v} type="button" onClick={() => poserVilles.mutate(on ? villes.filter((x) => x !== v) : [...villes, v])} className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${on ? "border-menthe bg-menthe font-semibold text-sur-menthe" : "border-bord-doux text-craie hover:text-encre"}`}>{v}</button>;
          })}
          <form onSubmit={(e) => { e.preventDefault(); if (ville.trim()) poserVilles.mutate([...villes, ville.trim()]); setVille(""); }}>
            <input id="ville-du-jour" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Une autre ville" className="w-[140px] rounded-full border border-bord-doux bg-fond px-3 py-1 text-[12.5px] text-encre outline-none focus:border-menthe/60" />
          </form>
          {villes.length > 0 && (
            <button type="button" onClick={() => equimmox.mutate()} disabled={recherche?.etat === "en_cours"} className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3 py-1 text-[12.5px] text-craie hover:text-encre">
              {recherche?.etat === "en_cours" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {recherche?.etat === "en_cours" ? "Equimmox en cours…" : "Relire Equimmox pour ces villes"}
            </button>
          )}
        </div>
        {!villes.length && <p className="m-0 mt-3 text-[12.5px] text-brume">Choisis une ville : la liste prend les agents qui y publient régulièrement sur Equimmox. Sans ville, seulement les relances du jour.</p>}
      </section>

      {data?.appel_a_valider && !choisi && (
        <section className={`${carte} p-5 md:p-6`}>
          <p className={etiquette}>Ton dernier appel attend ta validation</p>
          <div className="mt-3"><Propositions appel={data.appel_a_valider} /></div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <p className={etiquette}>À appeler · {liste.length}</p>
            {!data?.criteres && <button type="button" onClick={() => allerA("reglages")} className="text-[12px] text-ambre" style={{ background: "transparent" }}>Écris tes critères pour les mails</button>}
          </div>
          {liste.length ? (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {liste.map((a) => {
                const pris = a.verrou && !a.a_moi;
                const actif = enCours?.id === a.id;
                return (
                  <li key={a.id}>
                    <button type="button" disabled={pris} onClick={() => prendre.mutate(a)}
                      className={`w-full rounded-[14px] border p-3.5 text-left transition-colors ${actif ? "border-menthe bg-menthe/[0.06]" : pris ? "border-trait opacity-50" : "border-trait hover:border-menthe/50"}`} style={actif ? undefined : { background: "transparent" }}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[14.5px] font-semibold text-encre">{a.nom}</span>
                        {pris ? <Pastille><Lock className="h-3 w-3" />{a.verrou.nom}</Pastille> : a.rang === 0 ? <Pastille ton="ambre">Relance</Pastille> : a.rang === 1 ? <Pastille ton="menthe">Murs vides</Pastille> : null}
                      </div>
                      <p className="m-0 mt-0.5 truncate text-[12.5px] text-craie">{[a.agence && a.agence !== a.nom ? a.agence : null, a.ville, a.telephones?.[0]].filter(Boolean).join(" · ")}</p>
                      <p className="m-0 mt-1.5 text-[12.5px] text-encre">{a.raison}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="rounded-[14px] border border-trait p-6 text-center text-[13px] text-craie">{villes.length ? "Personne à appeler pour ces villes : relis Equimmox, ou ajoute une ville." : "Aucune relance aujourd'hui."}</p>}
        </section>
        <div className="lg:sticky lg:top-4 lg:self-start">
          {enCours ? <PanneauAppel key={enCours.id} agent={liste.find((x) => x.id === enCours.id) || enCours} onFermer={() => { setChoisi(null); queryClient.invalidateQueries({ queryKey: ["prospection-jour"] }); }} />
            : <div className="rounded-[16px] border border-dashed border-bord-doux p-8 text-center text-[13px] text-brume">Choisis un agent dans la liste : il se verrouille à ton nom, personne d'autre ne l'appelle.</div>}
        </div>
      </div>
    </div>
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
            <span className="text-[12.5px] text-brume">{m.a || "sans adresse"}</span>
          </div>
          <p className="m-0 mt-1 text-[13px] text-craie">{m.dossier ? `${m.dossier} · ` : ""}{m.genre === "sms" ? "à envoyer depuis ton téléphone, puis coche et « Envoyer » pour le noter" : objet}</p>
          {ouvert ? (
            <div className="mt-3 flex flex-col gap-2">
              <input id={`a-${m.id}`} value={a} onChange={(e) => setA(e.target.value)} className={champ} placeholder={m.genre === "sms" ? "numéro" : "adresse"} />
              {m.genre !== "sms" && <input id={`objet-${m.id}`} value={objet} onChange={(e) => setObjet(e.target.value)} className={champ} />}
              <textarea id={`corps-${m.id}`} value={corps} onChange={(e) => setCorps(e.target.value)} rows={Math.min(16, corps.split("\n").length + 2)} className={`${champ} leading-[1.55]`} />
              <div className="flex gap-2">
                {modifie && <button type="button" onClick={() => enregistrer.mutate()} className="rounded-full bg-menthe px-3 py-1 text-[12px] font-semibold text-sur-menthe">Enregistrer</button>}
                <button type="button" onClick={() => setOuvert(false)} className="rounded-full border border-bord-doux px-3 py-1 text-[12px] text-craie">Replier</button>
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
        <button type="button" onClick={onEcarter} aria-label="Écarter" title="Écarter" className="grid h-7 w-7 flex-none place-items-center rounded-full text-brume hover:text-alerte"><X className="h-4 w-4" /></button>
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
          <div className="sticky bottom-4 mt-4 flex justify-end">
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
          <Link to={`/Analyse?deal_id=${d.deal_id}`} className="text-[15px] font-semibold text-encre hover:text-menthe">{d.titre}</Link>
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
          <select id={`raison-${d.deal_id}`} value={raison} onChange={(e) => setRaison(e.target.value)} className="rounded-lg border border-bord-doux bg-fond px-2 py-1.5 text-[13px] text-encre">
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
        <button type="button" onClick={onFermer} aria-label="Fermer" className="text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      <dl className="m-0 mt-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
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

function OngletAgents() {
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["prospection-agents", q], queryFn: () => base44.request("GET", `/api/prospection/agents?q=${encodeURIComponent(q)}`) });
  const agents = data?.agents || [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-3 border-b border-encre/[0.18] pb-2 focus-within:border-bord-vif">
          <Search className="h-4 w-4 text-brume" />
          <input id="recherche-agent" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Chercher parmi ${data?.total ?? "les"} agents : nom, agence, ville, numéro`} className="w-full border-none bg-transparent py-1 text-[14px] text-encre outline-none placeholder:text-brume" />
        </div>
        {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div> : (
          <div className="overflow-x-auto rounded-[14px] border border-trait">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-[.12em] text-ardoise">{["Agent", "Ville", "Statut", "Prochaine action", "Score"].map((t) => <th key={t} className="border-b border-trait px-3 py-2.5 font-medium">{t}</th>)}</tr></thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id} onClick={() => setOuvert(a.id)} className={`cursor-pointer align-top hover:bg-encre/[0.03] ${ouvert === a.id ? "bg-menthe/[0.05]" : ""}`}>
                    <td className="border-b border-trait px-3 py-2"><span className="text-encre">{a.nom}</span>{a.agence && a.agence !== a.nom && <span className="block text-[12px] text-brume">{a.agence}</span>}</td>
                    <td className="border-b border-trait px-3 py-2 text-craie">{a.ville}</td>
                    <td className="border-b border-trait px-3 py-2 text-craie">{STATUTS[a.statut] || a.statut}</td>
                    <td className="border-b border-trait px-3 py-2 text-craie">{a.prochaine ? `${dateCourte(a.prochaine.le)} · ${a.prochaine.quoi}` : ""}</td>
                    <td className="border-b border-trait px-3 py-2 tabular-nums text-encre">{a.score || 0}</td>
                  </tr>
                ))}
                {!agents.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-brume">Aucun agent.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="lg:sticky lg:top-4 lg:self-start">{ouvert ? <FicheAgent key={ouvert} id={ouvert} onFermer={() => setOuvert(null)} /> : <p className="rounded-[16px] border border-dashed border-bord-doux p-8 text-center text-[13px] text-brume">Clique sur un agent pour voir sa fiche et son historique.</p>}</div>
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
        {tuiles.map(([l, v]) => <div key={l} className={`${carte} p-4`}><p className={etiquette}>{l}</p><p className="m-0 mt-2 text-[30px] font-light leading-none tabular-nums text-encre">{v}</p></div>)}
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
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">{data.en_attente_de_decision.map((d) => <li key={d.deal_id} className="text-[13px]"><Link to={`/Analyse?deal_id=${d.deal_id}`} className="text-encre hover:text-menthe">{d.titre}</Link> <span className={d.depuis_h > 48 ? "text-alerte" : "text-brume"}>· {d.agent || "agent inconnu"} · {d.depuis_h} h</span></li>)}</ul>
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
          {r.villes.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full border border-menthe/50 px-2.5 py-1 text-[12.5px] text-encre">{v}<button type="button" aria-label={`Retirer ${v}`} onClick={() => setR((x) => ({ ...x, villes: x.villes.filter((y) => y !== v) }))} className="text-brume hover:text-alerte"><X className="h-3 w-3" /></button></span>)}
          <form onSubmit={(e) => { e.preventDefault(); ajouterVille(ville); setVille(""); }}><input id="ville-cible" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ajouter une ville" className="w-[150px] rounded-full border border-bord-doux bg-fond px-3 py-1 text-[12.5px] text-encre outline-none focus:border-menthe/60" /></form>
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

export default function Prospection() {
  const [onglet, setOnglet] = useState(() => new URLSearchParams(window.location.search).get("onglet") || "jour");
  const jour = useQuery({ queryKey: ["prospection-jour"], queryFn: () => base44.request("GET", "/api/prospection/jour"), refetchInterval: (q) => (q.state.data?.recherche?.etat === "en_cours" ? 5000 : 60000) });
  const onglets = useMemo(() => [
    ["jour", "Aujourd'hui", jour.data?.liste?.length],
    ["envois", "À envoyer", jour.data?.a_envoyer],
    ["decisions", "Décisions", jour.data?.decisions],
    ["agents", "Agents"],
    ["tableau", "Tableau de bord"],
    ["reglages", "Réglages"],
  ], [jour.data]);
  if (jour.isError && /403|réservé/i.test(jour.error?.message || "")) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Prospection</h1>
        <p className="m-0 mt-2 max-w-[70ch] text-[14px] text-craie">{jour.data?.jour ? `${jourFr(jour.data.jour).replace(/^./, (c) => c.toUpperCase())}. ` : ""}Tu choisis qui appeler, tu parles, tu valides. AK a préparé avant, note pendant, propose après ; rien ne part sans toi.</p>
      </header>
      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Onglets de la prospection">
        {onglets.map(([cle, mot, n]) => (
          <button key={cle} type="button" onClick={() => setOnglet(cle)} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${onglet === cle ? "border-menthe bg-menthe font-semibold text-sur-menthe" : "border-bord-doux text-craie hover:text-encre"}`}>
            {mot}{n ? <span className={`tabular-nums ${onglet === cle ? "" : "text-brume"}`}>{n}</span> : null}
          </button>
        ))}
      </nav>
      {onglet === "jour" && <OngletJour data={jour.data} isLoading={jour.isLoading} allerA={setOnglet} />}
      {onglet === "envois" && <OngletEnvois />}
      {onglet === "decisions" && <OngletDecisions />}
      {onglet === "agents" && <OngletAgents />}
      {onglet === "tableau" && <OngletTableau />}
      {onglet === "reglages" && <OngletReglages />}
    </div>
  );
}
