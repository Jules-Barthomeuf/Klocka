import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ExternalLink, Loader2, Mic, PhoneCall, Square, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { versWav } from "@/lib/dictee";

// Le mode appel (6 oct. 2026) : pensé pour le téléphone. Une ville, puis une
// agence à la fois : son numéro, ce qu'on sait d'elle, ce que nos clients
// cherchent dans la zone. On appelle, on raccroche, on tape l'issue en un
// geste. Le vocal ne vient que pour les vraies conversations (À rappeler,
// Intéressé). Le reçu dit ce qui est réellement dans Monday, relu après
// écriture : une ligne orange se réessaie seule.

const API = "/api/prospection/mode-appel";
const carte = "rounded-[20px] border border-trait bg-surface";
const etiquette = "m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise";
const telLien = (t) => `tel:${String(t).replace(/\s/g, "")}`;
const VOCAL_MAX_S = 60;

const ISSUES = [
  ["pas_de_reponse", "Pas de réponse", "border-trait text-encre"],
  ["mauvais_numero", "Mauvais numéro / fermée", "border-trait text-encre"],
  ["pas_interesse", "Pas intéressé", "border-trait text-encre"],
  ["a_rappeler", "À rappeler", "border-ambre/60 text-ambre"],
  ["interesse", "Intéressé", "border-menthe text-menthe"],
];

/** Le choix de la ville : les listes de l'agent IA, avec leur avancement. */
function ChoixVille({ onLancer, enCours }) {
  const { data, isLoading } = useQuery({ queryKey: ["agent-ia-listes"], queryFn: () => base44.request("GET", "/api/prospection/agent-ia/listes") });
  const listes = (data?.listes || []).filter((l) => l.agences > 0);
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  if (!listes.length) return <p className="py-12 text-center text-[14px] text-brume">Aucune ville encore : lancez l'agent IA sur une ville, ses agences arrivent ici.</p>;
  return (
    <div className="mx-auto flex max-w-[520px] flex-col gap-3">
      <p className="m-0 text-center text-[14px] text-craie">Quelle ville appelez-vous ?</p>
      {listes.map((l) => (
        <button key={l.id} type="button" onClick={() => onLancer(l)} disabled={enCours}
          className={`${carte} flex items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:border-menthe disabled:opacity-60`} style={{ background: undefined }}>
          <span>
            <span className="block text-[17px] text-encre">{l.ville}</span>
            <span className="mt-0.5 block text-[13px] text-ardoise">{l.agences} agences · {l.avec_telephone} avec un numéro{l.deja_monday ? ` · ${l.deja_monday} déjà en contact` : ""}</span>
          </span>
          <ArrowRight className="h-5 w-5 flex-none text-menthe" />
        </button>
      ))}
    </div>
  );
}

/** Le vocal, seulement pour une vraie conversation : une minute au plus, ou quelques mots tapés, ou rien. */
function EcranVocal({ issue, onEnvoyer, envoi }) {
  const [etat, setEtat] = useState("pret");
  const [secondes, setSecondes] = useState(0);
  const [texte, setTexte] = useState("");
  const rec = useRef(null);
  const chrono = useRef(0);
  useEffect(() => {
    if (etat !== "enregistre") return undefined;
    const t = setInterval(() => { chrono.current += 1; setSecondes(chrono.current); if (chrono.current >= VOCAL_MAX_S) rec.current?.m?.state === "recording" && rec.current.m.stop(); }, 1000);
    return () => clearInterval(t);
  }, [etat]);
  useEffect(() => () => rec.current?.flux?.getTracks().forEach((t) => t.stop()), []);
  const demarrer = async () => {
    let flux;
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast.error("Le micro est refusé : autorisez-le, ou tapez quelques mots."); return; }
    const morceaux = [];
    const m = new MediaRecorder(flux);
    m.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
    m.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      try {
        const wav = await versWav(new Blob(morceaux, { type: m.mimeType || "audio/webm" }), 16000);
        onEnvoyer({ audio: wav, recit: texte.trim() });
      } catch { toast.error("Enregistrement illisible : tapez quelques mots à la place."); setEtat("pret"); }
    };
    rec.current = { m, flux };
    m.start(1000);
    chrono.current = 0;
    setSecondes(0);
    setEtat("enregistre");
  };
  if (envoi) return <div className={`${carte} flex flex-col items-center gap-3 px-6 py-10 text-center`}><Loader2 className="h-6 w-6 animate-spin text-menthe" /><p className="m-0 text-[14px] text-craie">Je lis ce qui s'est dit…</p></div>;
  return (
    <div className={`${carte} flex flex-col gap-4 p-5`}>
      <p className={etiquette}>{issue === "interesse" ? "Intéressé" : "À rappeler"} : racontez en une minute</p>
      <p className="m-0 text-[13.5px] text-craie">Qui vous avez eu, ce qu'il a, ce qu'il a promis, quand le rappeler. Je remplis le reste.</p>
      {etat === "enregistre" ? (
        <button type="button" onClick={() => rec.current?.m?.stop()}
          className="flex h-16 items-center justify-center gap-3 rounded-full bg-alerte/15 text-[16px] text-alerte">
          <Square className="h-5 w-5" />Terminer ({secondes} s / {VOCAL_MAX_S})
        </button>
      ) : (
        <button type="button" onClick={demarrer} className="flex h-16 items-center justify-center gap-3 rounded-full bg-menthe text-[16px] text-sur-menthe hover:bg-menthe-survol">
          <Mic className="h-5 w-5" />Raconter l'appel
        </button>
      )}
      {etat !== "enregistre" && (
        <>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} placeholder="Ou quelques mots : « Sophie gère le commerce, rappeler après le 15 »"
            className="w-full rounded-[14px] border border-trait bg-surface-pleine px-3.5 py-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
          <div className="flex gap-2">
            <button type="button" onClick={() => onEnvoyer({ recit: texte.trim() })} disabled={!texte.trim()}
              className="h-12 flex-1 rounded-full border border-trait text-[14px] text-encre hover:border-menthe disabled:opacity-40" style={{ background: "transparent" }}>Envoyer les mots</button>
            <button type="button" onClick={() => onEnvoyer({})} className="h-12 flex-1 rounded-full border border-trait text-[14px] text-craie hover:text-encre" style={{ background: "transparent" }}>Sans vocal</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Les actions proposées : cochées d'avance quand elles sont évidentes, surlignées quand elles sont incertaines, un seul bouton. */
function EcranActions({ appel, onValider, envoi }) {
  const props = appel.propositions || [];
  const [coches, setCoches] = useState(() => new Set(props.filter((p) => p.coche !== false).map((p) => p.id)));
  const pm = props.find((p) => p.type === "mail");
  const [mail, setMail] = useState(pm ? { a: pm.a || "", objet: pm.objet, corps: pm.corps } : null);
  const [mailOuvert, setMailOuvert] = useState(false);
  const basculer = (id) => setCoches((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const libelleType = { statut: "Mettre à jour Monday", mail: "Envoyer le mail", relance: "Planifier la relance", fiche: "Compléter sa fiche", note: "Noter", relance_mail: "Relancer le mail", sms: "SMS", autre_agent: "Autre contact", signaler_bien: "Signaler un bien", prevenir: "Prévenir un collègue" };
  return (
    <div className={`${carte} flex flex-col gap-3 p-5`}>
      {appel.resume && <p className="m-0 text-[14px] leading-[1.55] text-encre">{appel.resume}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {props.map((p) => (
          <li key={p.id} className={`rounded-[14px] border px-3.5 py-3 ${p.incertain ? "border-ambre/50 bg-ambre/[0.07]" : "border-trait"}`}>
            <button type="button" onClick={() => basculer(p.id)} className="flex w-full items-start gap-3 text-left" style={{ background: "transparent" }}>
              <span className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-[6px] border ${coches.has(p.id) ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif"}`}>{coches.has(p.id) && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
              <span className="min-w-0">
                <span className="block text-[12px] text-ardoise">{libelleType[p.type] || "Action"}</span>
                <span className="block text-[14px] leading-[1.45] text-encre">{p.titre}</span>
                {p.source && <span className="mt-1 block text-[12.5px] italic text-craie">Il a dit : « {p.source} »</span>}
                {p.incertain && <span className="mt-1 block text-[12px] text-ambre">À vérifier : {p.incertain}</span>}
              </span>
            </button>
            {p.type === "mail" && coches.has(p.id) && mail && (
              <div className="mt-2 pl-8">
                <button type="button" onClick={() => setMailOuvert((o) => !o)} className="inline-flex items-center gap-1 text-[12.5px] text-menthe" style={{ background: "transparent" }}>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mailOuvert ? "rotate-180" : ""}`} />{mailOuvert ? "Fermer le mail" : "Voir et modifier le mail"}
                </button>
                {mailOuvert && (
                  <div className="mt-2 flex flex-col gap-2">
                    <input value={mail.a} onChange={(e) => setMail({ ...mail, a: e.target.value })} placeholder="Adresse" className={`h-10 rounded-[10px] border bg-surface-pleine px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px] ${mail.a ? "border-trait" : "border-ambre/60"}`} />
                    <input value={mail.objet} onChange={(e) => setMail({ ...mail, objet: e.target.value })} className="h-10 rounded-[10px] border border-trait bg-surface-pleine px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
                    <textarea value={mail.corps} onChange={(e) => setMail({ ...mail, corps: e.target.value })} rows={8} className="rounded-[10px] border border-trait bg-surface-pleine px-3 py-2.5 text-[13.5px] leading-[1.55] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
                  </div>
                )}
                {!mail.a && <p className="m-0 mt-1.5 text-[12px] text-ambre">Il manque l'adresse : le mail attendra dans « À envoyer ».</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onValider({ choix: [...coches], mail: coches.has("mail") ? mail : null })} disabled={envoi}
        className="mt-1 flex h-14 items-center justify-center gap-2 rounded-full bg-menthe text-[16px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
        {envoi ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Valider
      </button>
    </div>
  );
}

/** Une ligne du reçu : vert quand c'est vérifié, orange quand ça se réessaie, rouge quand c'est raté. */
function LigneRecu({ l, lien = null, detail = null }) {
  const [ouvert, setOuvert] = useState(false);
  if (!l) return null;
  const ton = l.etat === "ok" ? "text-menthe" : l.etat === "attente" ? "text-ambre" : l.etat === "echec" ? "text-alerte" : "text-craie";
  const contenu = (
    <span className="flex items-start gap-2.5">
      <span className={`mt-0.5 flex-none ${ton}`}>{l.etat === "ok" ? <Check className="h-4 w-4" strokeWidth={3} /> : l.etat === "attente" ? <Loader2 className="h-4 w-4 animate-spin" /> : l.etat === "echec" ? <X className="h-4 w-4" /> : <span className="block h-4 w-4 text-center">·</span>}</span>
      <span className={`min-w-0 text-[14.5px] leading-[1.45] ${l.etat === "attente" ? "text-ambre" : "text-encre"}`}>{l.texte}</span>
    </span>
  );
  return (
    <li>
      {lien ? <a href={lien} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 hover:opacity-80">{contenu}<ExternalLink className="h-3.5 w-3.5 flex-none text-brume" /></a>
        : detail ? <button type="button" onClick={() => setOuvert((o) => !o)} className="w-full text-left" style={{ background: "transparent" }}>{contenu}</button>
          : contenu}
      {ouvert && detail && (
        <div className="mt-2 rounded-[12px] border border-trait bg-surface-pleine p-3 text-[13px] leading-[1.55] text-craie">
          <p className="m-0 text-ardoise">À {detail.a || "(sans adresse)"} · {detail.objet}</p>
          <p className="m-0 mt-2 whitespace-pre-line">{detail.corps}</p>
        </div>
      )}
    </li>
  );
}

/** Le reçu de l'appel, lisible en trois secondes, relu tant qu'une ligne est en attente. */
function Recu({ appelId, recu: initial, agence, onSuivante }) {
  const { data } = useQuery({
    queryKey: ["mode-appel-recu", appelId],
    queryFn: () => base44.request("GET", `${API}/appels/${appelId}/recu`),
    initialData: { recu: initial },
    refetchInterval: (q) => (q.state.data?.recu?.monday?.etat === "attente" ? 5000 : false),
  });
  const r = data?.recu || initial;
  return (
    <div className={`${carte} flex flex-col gap-4 p-5`}>
      <p className={etiquette}>{agence}</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        <LigneRecu l={r.monday ? { ...r.monday, texte: r.monday.etat === "ok" ? `Monday : ${r.monday.texte}` : r.monday.texte } : null} lien={r.monday?.etat === "ok" ? r.monday.lien : null} />
        <LigneRecu l={r.mail} detail={r.mail?.detail || null} />
        <LigneRecu l={r.relance} />
        {(r.extras || []).map((x, i) => <LigneRecu key={i} l={x} />)}
      </ul>
      <button type="button" onClick={onSuivante} className="flex h-14 items-center justify-center gap-2 rounded-full bg-encre text-[16px] text-fond">
        Agence suivante<ArrowRight className="h-5 w-5" />
      </button>
    </div>
  );
}

/** Le récapitulatif de fin de session : c'est ce moment-là qui crée l'habitude. */
function Recap({ sessionId, onNouvelle }) {
  const { data, isLoading } = useQuery({ queryKey: ["mode-appel-recap", sessionId], queryFn: () => base44.request("GET", `${API}/sessions/${sessionId}`), refetchInterval: (q) => (q.state.data && !q.state.data.monday_a_jour ? 5000 : false) });
  if (isLoading || !data) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;
  return (
    <div className={`${carte} mx-auto flex max-w-[520px] flex-col items-center gap-4 px-6 py-10 text-center`}>
      <p className={etiquette}>{data.ville} · session terminée</p>
      <p className="m-0 text-[20px] leading-[1.45] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>
        {pl(data.appels, "appel")} · {pl(data.interesses, "intéressé")} · {pl(data.mails_envoyes, "mail envoyé", "mails envoyés")} · {pl(data.relances, "relance planifiée", "relances planifiées")}
      </p>
      <p className={`m-0 text-[15px] ${data.monday_a_jour ? "text-menthe" : "text-ambre"}`}>
        {data.monday_a_jour ? "Tout est à jour dans Monday." : `${pl(data.monday_en_attente, "ligne")} Monday en attente, nouvel essai en cours.`}
      </p>
      <button type="button" onClick={onNouvelle} className="mt-2 h-12 rounded-full border border-trait px-6 text-[14px] text-encre hover:border-menthe" style={{ background: "transparent" }}>Nouvelle session</button>
    </div>
  );
}

export default function ModeAppel() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null); // { id, liste_id, ville }
  const [fini, setFini] = useState(false);
  const [i, setI] = useState(0);
  const [prise, setPrise] = useState(null); // { agence_id, agent_id }
  const [etape, setEtape] = useState("carte"); // carte | vocal | actions | recu
  const [issue, setIssue] = useState(null);
  const [appel, setAppel] = useState(null);
  const [recu, setRecu] = useState(null);
  const [passees, setPassees] = useState(() => new Set());

  const file = useQuery({
    queryKey: ["mode-appel-file", session?.liste_id],
    queryFn: () => base44.request("GET", `${API}/file?liste=${session.liste_id}`),
    enabled: !!session?.liste_id,
    staleTime: 30_000,
  });
  const lancer = useMutation({
    mutationFn: (l) => base44.request("POST", `${API}/sessions`, { body: { liste_id: l.id } }),
    onSuccess: (r) => { setSession({ id: r.session.id, liste_id: r.session.liste_id, ville: r.session.ville }); setFini(false); setI(0); setPassees(new Set()); },
    onError: (e) => toast.error(e?.message || "Session impossible"),
  });
  const agences = (file.data?.file || []).filter((a) => !passees.has(a.id));
  const a = agences[Math.min(i, Math.max(0, agences.length - 1))] || null;

  const suivante = () => {
    if (a) setPassees((s) => new Set(s).add(a.id));
    setI(0); setPrise(null); setEtape("carte"); setIssue(null); setAppel(null); setRecu(null);
    queryClient.invalidateQueries({ queryKey: ["agent-ia-liste"] });
  };
  const prendre = useMutation({
    mutationFn: () => base44.request("POST", `${API}/prendre`, { body: { agence_id: a.id } }),
    onSuccess: (r) => setPrise({ agence_id: a.id, agent_id: r.agent_id }),
    onError: (e) => toast.error(e?.message || "Un collègue l'appelle déjà"),
  });
  const noter = useMutation({
    mutationFn: ({ issue: is, audio = null, recit = "" }) => {
      const f = new FormData();
      f.append("agence_id", a.id);
      if (prise?.agence_id === a.id && prise.agent_id) f.append("agent_id", prise.agent_id);
      f.append("issue", is);
      f.append("session_id", session.id);
      if (recit) f.append("recit", recit);
      if (audio) f.append("audio", audio, "appel.wav");
      return base44.request("POST", `${API}/issue`, { body: f, isForm: true });
    },
    onSuccess: (r, v) => {
      if (r.simple) {
        // Les issues simples : une confirmation discrète, et l'agence suivante tout de suite.
        const relance = r.recu?.relance?.texte;
        toast.success(v.issue === "mauvais_numero" ? `${a.nom} sortie de la file` : `${a.nom} : ${relance || "noté"}`, { description: r.recu?.monday?.etat === "ok" ? "Monday à jour (relu)." : r.recu?.monday?.texte });
        suivante();
        return;
      }
      setAppel(r.appel);
      setEtape("actions");
    },
    onError: (e) => toast.error(e?.message || "L'issue n'a pas pu être notée"),
  });
  const valider = useMutation({
    mutationFn: ({ choix, mail }) => base44.request("POST", `${API}/appels/${appel.id}/valider`, { body: { choix, mail, envoyer: true, session_id: session.id, issue } }),
    onSuccess: (r) => { setRecu(r.recu); setEtape("recu"); },
    onError: (e) => toast.error(e?.message || "Validation impossible"),
  });
  const choisirIssue = (k) => {
    setIssue(k);
    if (k === "a_rappeler" || k === "interesse") setEtape("vocal");
    else noter.mutate({ issue: k });
  };

  if (!session) return <ChoixVille onLancer={(l) => lancer.mutate(l)} enCours={lancer.isPending} />;
  if (fini) return <Recap sessionId={session.id} onNouvelle={() => { setSession(null); setFini(false); }} />;

  const c = file.data?.chiffres;
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 truncate text-[17px] text-encre">{session.ville}</p>
          {c && <p className="m-0 text-[12.5px] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>{c.agences} agences · {c.fait_pourcent ?? 0} % fait · {c.interessees} intéressées · {c.a_rappeler} à rappeler</p>}
        </div>
        <button type="button" onClick={() => setFini(true)} className="h-10 flex-none rounded-full border border-trait px-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Terminer</button>
      </div>

      {file.isLoading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>}
      {!file.isLoading && !a && <p className={`${carte} m-0 px-6 py-10 text-center text-[14px] text-craie`}>Plus personne à appeler dans cette ville pour l'instant. Terminez la session pour voir le récapitulatif.</p>}

      {a && etape === "carte" && (
        <>
          <div className={`${carte} flex flex-col gap-4 p-5`}>
            <div>
              <p className="m-0 text-[22px] leading-[1.2] text-encre">{a.nom}</p>
              {(["contact", "relance"].includes(a.statut?.etat) || a.statut?.appelee) && <p className="m-0 mt-1.5"><span className="rounded-[6px] bg-ambre/15 px-1.5 py-px text-[12px] text-ambre">Déjà en contact</span></p>}
            </div>
            <a href={telLien(a.telephone)} onClick={() => { if (!prise || prise.agence_id !== a.id) prendre.mutate(); }}
              className="flex h-16 items-center justify-center gap-3 rounded-full bg-menthe text-[18px] text-sur-menthe hover:bg-menthe-survol" style={{ fontVariantNumeric: "tabular-nums" }}>
              <PhoneCall className="h-5 w-5" />Appeler · {a.telephone}
            </a>
            {prise?.agence_id === a.id && <p className="m-0 -mt-1 text-center text-[12.5px] text-craie">En ouvrant : « Je prends des notes avec notre assistant, ça vous va ? »</p>}
            {a.autres_numeros?.length > 0 && <p className="m-0 text-[13px] text-craie">Autres numéros : {a.autres_numeros.map((t) => <a key={t} href={telLien(t)} className="mr-2 text-menthe" style={{ fontVariantNumeric: "tabular-nums" }}>{t}</a>)}</p>}
            {a.interlocuteurs?.length > 0 && (
              <div>
                <p className={etiquette}>Interlocuteurs connus</p>
                <ul className="m-0 mt-1.5 list-none p-0 text-[14px] leading-[1.6] text-encre">{a.interlocuteurs.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            {a.historique?.length > 0 && (
              <div>
                <p className={etiquette}>Ce qu'on sait déjà</p>
                <ul className="m-0 mt-1.5 list-none p-0 text-[13.5px] leading-[1.55] text-craie">{a.historique.map((x, k) => <li key={k}>{x}</li>)}</ul>
              </div>
            )}
            {(file.data?.recherches || []).length > 0 && (
              <div>
                <p className={etiquette}>Nos clients cherchent ici</p>
                <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0">{file.data.recherches.map((x) => <li key={x} className="rounded-full border border-menthe/40 px-3 py-1 text-[13px] text-encre">{x}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {ISSUES.map(([k, mot, teinte]) => (
              <button key={k} type="button" onClick={() => choisirIssue(k)} disabled={noter.isPending}
                className={`flex h-14 items-center justify-center rounded-[16px] border px-3 text-center text-[15px] leading-tight transition-colors disabled:opacity-50 ${teinte} ${k === "interesse" ? "col-span-2" : ""}`} style={{ background: "transparent" }}>
                {noter.isPending && issue === k ? <Loader2 className="h-4 w-4 animate-spin" /> : mot}
              </button>
            ))}
          </div>
          <button type="button" onClick={suivante} className="self-center text-[13px] text-brume hover:text-encre" style={{ background: "transparent" }}>Passer cette agence</button>
        </>
      )}

      {a && etape === "vocal" && (
        <>
          <EcranVocal issue={issue} envoi={noter.isPending} onEnvoyer={({ audio, recit }) => noter.mutate({ issue, audio, recit })} />
          {!noter.isPending && <button type="button" onClick={() => setEtape("carte")} className="self-center text-[13px] text-brume hover:text-encre" style={{ background: "transparent" }}>Retour</button>}
        </>
      )}
      {a && etape === "actions" && appel && <EcranActions appel={appel} envoi={valider.isPending} onValider={(x) => valider.mutate(x)} />}
      {a && etape === "recu" && recu && <Recu appelId={appel.id} recu={recu} agence={a.nom} onSuivante={suivante} />}
    </div>
  );
}
