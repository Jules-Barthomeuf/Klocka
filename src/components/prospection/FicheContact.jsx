import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Mail, MailOpen, MessageSquare, Phone, RefreshCw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import CeQueKlockaSait from "@/components/layer/CeQueKlockaSait";
import { HistoriqueLayer } from "@/components/layer/FriseFaits";
import Chargement from "@/components/ui/Chargement";

// La fiche d'un agent ou d'une agence, en un coup d'œil (16 oct. 2026, Jules) :
// combien de fois on s'est parlé, ses mails, ses fiches commerciales, ce qu'il
// nous dit souvent, les actions proposées, son parcours avec nous, qui de
// l'équipe a échangé avec lui. Le serveur calcule tout
// (server/prospection/fiche-contact.js) ; la lecture par l'IA arrive à part.

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const STATUTS = { nouveau: "À appeler", a_rappeler: "À rappeler", en_discussion: "En discussion", pas_de_murs: "Pas de murs", envoie_des_fiches: "Envoie des fiches", pause: "En pause", archive: "Archivé" };
const GENRES = {
  appel: { icone: Phone, nom: "Appels" }, mail_envoye: { icone: Mail, nom: "Mails" }, mail_recu: { icone: MailOpen, nom: "Mails" },
  fiche: { icone: FileText, nom: "Fiches" }, monday: { icone: MessageSquare, nom: "Twenty CRM" }, sms: { icone: MessageSquare, nom: "Mails" },
};
const FILTRES = [["tout", "Tout"], ["appel", "Appels"], ["mail", "Mails"], ["fiche", "Fiches"], ["monday", "Twenty CRM"]];
const garde = (e, f) => f === "tout" || (f === "mail" ? ["mail_envoye", "mail_recu", "sms"].includes(e.genre) : e.genre === f);

const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "");
function depuis(iso) {
  if (!iso) return "Jamais";
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j <= 0) return "Aujourd'hui";
  if (j === 1) return "Hier";
  if (j < 31) return `Il y a ${j} jours`;
  return dateCourte(iso);
}
const prenom = (email, equipe) => equipe.find((m) => m.email === email)?.nom || (email ? email.split("@")[0].split(".")[0].replace(/^./, (c) => c.toUpperCase()) : "");
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** Pure : « 14 fiches · Nice, Antibes · loyers 18 à 42 k€ · dernier envoi le 3 oct. 2026 · 2 retenues » (server/memoire/agents.js). */
function ligneMemoire(c) {
  const k = (n) => `${Math.round(n / 1000)} k€`;
  const d = c.dernier_envoi ? new Date(c.dernier_envoi).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : null;
  return [
    `${c.nb_fiches} fiche${c.nb_fiches > 1 ? "s" : ""}`,
    c.villes?.length ? c.villes.slice(0, 4).join(", ") : null,
    c.loyers ? `loyers ${k(c.loyers.min)} à ${k(c.loyers.max)}` : null,
    c.prix ? `prix ${k(c.prix.min)} à ${k(c.prix.max)}` : null,
    d ? `dernier envoi le ${d}` : null,
    `${c.retenus} retenue${c.retenus > 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ");
}

function Chiffre({ valeur, libelle, note }) {
  return (
    <div className="rounded-md border border-trait bg-surface px-3.5 py-3">
      <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{libelle}</p>
      <p className="m-0 mt-1.5 text-[22px] font-light tabular-nums text-encre">{valeur}</p>
      {note && <p className="m-0 mt-0.5 text-[12px] text-brume">{note}</p>}
    </div>
  );
}

function Lecture({ type, id, fiche }) {
  const qc = useQueryClient();
  const deja = fiche.lecture?.a_jour ? fiche.lecture : null;
  const q = useQuery({
    queryKey: ["fiche-lecture", type, id, fiche.echanges.length, fiche.chiffres.dernier],
    queryFn: () => base44.request("POST", `/api/prospection/fiche/${type}/${id}/lire`, { body: {} }),
    enabled: !deja && fiche.echanges.length > 0, staleTime: 10 * 60000, initialData: deja || undefined,
  });
  const relire = useMutation({
    mutationFn: () => base44.request("POST", `/api/prospection/fiche/${type}/${id}/lire`, { body: { forcer: true } }),
    onSuccess: (r) => qc.setQueryData(["fiche-lecture", type, id, fiche.echanges.length, fiche.chiffres.dernier], r),
  });
  const l = relire.data || q.data;
  const qui = type === "agence" ? "l'agence" : "il";
  if (!fiche.echanges.length) return <p className="m-0 mt-5 text-[13px] text-brume">Aucun échange encore : ce qu'{qui === "il" ? "il" : "elle"} nous dit souvent et les actions à proposer viendront avec les premiers appels et mails.</p>;
  return (
    <>
      <div className="mt-6 flex items-baseline justify-between gap-2">
        <p className={etiq}>Ce qu{type === "agence" ? "e l'agence" : "'il"} nous dit souvent</p>
        <button type="button" onClick={() => relire.mutate()} disabled={relire.isPending || q.isFetching} title="Relire les échanges" aria-label="Relire les échanges"
          className="inline-flex items-center gap-1 p-0 text-[11.5px] text-brume hover:text-encre" style={{ background: "transparent" }}>
          <RefreshCw className={`h-3 w-3 ${relire.isPending || q.isFetching ? "animate-spin" : ""}`} />{l?.genere_le ? `lu ${depuis(l.genere_le).toLowerCase()}` : "Relire"}
        </button>
      </div>
      {!l ? <div className="mt-2 flex items-center gap-2 text-[13px] text-brume"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lecture des échanges…</div> : (
        <>
          <ul className="m-0 mt-1.5 list-none p-0">
            {l.themes.map((t, k) => (
              <li key={k} className="border-t border-trait py-2 first:border-t-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-encre">{t.theme}</span>
                  <span className="flex-none rounded-full bg-relief px-2 py-0.5 text-[11.5px] tabular-nums text-craie">{t.fois > 1 ? `${t.fois} fois` : "une fois"}</span>
                </div>
                {t.citation && <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">« {t.citation} »{t.quand ? <span className="text-brume"> · {dateCourte(t.quand)}</span> : null}</p>}
              </li>
            ))}
            {!l.themes.length && <li className="text-[13px] text-brume">Rien qui revienne encore.</li>}
          </ul>
          <p className={`${etiq} mt-6`}>Actions proposées</p>
          <ol className="m-0 mt-1.5 list-none p-0">
            {l.actions.map((x, k) => (
              <li key={k} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 border-t border-trait py-2 first:border-t-0">
                <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-menthe/[0.14] text-[11px] tabular-nums text-menthe">{k + 1}</span>
                <span><span className="block text-[14px] text-encre">{x.action}</span><span className="block text-[12.5px] text-ardoise">{x.pourquoi}</span></span>
              </li>
            ))}
            {!l.actions.length && <li className="text-[13px] text-brume">Rien à proposer pour l'instant.</li>}
          </ol>
        </>
      )}
    </>
  );
}

function Echanges({ echanges, equipe }) {
  const [filtre, setFiltre] = useState("tout");
  const [tout, setTout] = useState(false);
  const liste = echanges.filter((e) => garde(e, filtre));
  const vus = tout ? liste : liste.slice(0, 12);
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <p className={etiq}>Échanges</p>
        <div className="inline-flex rounded-full bg-rail-actif p-0.5">
          {FILTRES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => { setFiltre(k); setTout(false); }}
              className={`rounded-full px-2.5 py-1 text-[12px] ${filtre === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      </div>
      <ul className="m-0 mt-1.5 list-none p-0">
        {vus.map((e, k) => {
          const Icone = GENRES[e.genre]?.icone || MessageSquare;
          const corps = (
            <>
              <Icone className="mt-[3px] h-3.5 w-3.5 flex-none text-ardoise" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-encre">{e.titre}{e.avec ? <span className="text-ardoise"> · {e.avec}</span> : null}</span>
                {e.detail && <span className="line-clamp-2 block text-[12.5px] text-ardoise">{e.detail}</span>}
              </span>
              <span className="flex-none text-right text-[12px] tabular-nums text-brume">{dateCourte(e.le)}{e.par ? <span className="block">{prenom(e.par, equipe)}</span> : null}</span>
            </>
          );
          return (
            <li key={k} className="border-t border-trait first:border-t-0">
              {e.lien ? <a href={e.lien} {...(/^https?:/.test(e.lien) ? { target: "_blank", rel: "noreferrer" } : {})} className="flex gap-2.5 py-2 hover:bg-relief/40">{corps}</a> : <div className="flex gap-2.5 py-2">{corps}</div>}
            </li>
          );
        })}
        {!liste.length && <li className="py-2 text-[13px] text-brume">Rien ici.</li>}
      </ul>
      {liste.length > 12 && !tout && <button type="button" onClick={() => setTout(true)} className="mt-1 p-0 text-[12.5px] text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>Tout afficher ({liste.length})</button>}
    </>
  );
}

function Coordonnees({ id }) {
  const { data } = useQuery({ queryKey: ["prospection-agent", id], queryFn: () => base44.request("GET", `/api/prospection/agents/${id}`) });
  const a = data?.agent;
  if (!a) return null;
  const lignes = [
    ["Téléphones", (a.telephones || []).join(", ")], ["Mails", (a.emails || []).join(", ")], ["Secteurs", (a.secteurs || []).join(", ")],
    ["Référent", a.referent], ["Prochaine action", a.prochaine ? `${dateCourte(a.prochaine.le)} : ${a.prochaine.quoi}` : ""],
    ["Score", a.score ? String(a.score) : ""], ["Equimmox", Object.entries(a.annonces_par_ville || {}).map(([v, n]) => `${v} ${n}`).join(", ")],
    ["Source", a.source], ["Remarques", a.remarques],
  ].filter(([, v]) => v);
  return (
    <details className="mt-6" open>
      <summary className={`${etiq} cursor-pointer`}>Coordonnées</summary>
      <dl className="m-0 mt-2 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px] max-md:grid-cols-[100px_minmax(0,1fr)]">
        {lignes.map(([k, v]) => <React.Fragment key={k}><dt className="text-brume">{k}</dt><dd className="m-0 break-words text-encre">{v}</dd></React.Fragment>)}
      </dl>
    </details>
  );
}

/** La fiche. `depart` : { type: 'agent' | 'agence', id } ; un clic sur l'agence ou un collègue l'ouvre à la suite, la flèche revient. */
export default function FicheContact({ depart, onFermer }) {
  const [pile, setPile] = useState([depart]);
  const { type, id } = pile[pile.length - 1];
  const ouvrir = (t, i) => setPile((p) => [...p, { type: t, id: i }]);
  const q = useQuery({ queryKey: ["fiche-contact", type, id], queryFn: () => base44.request("GET", `/api/prospection/fiche/${type}/${id}`) });
  const eq = useQuery({ queryKey: ["prospection-equipe"], queryFn: () => base44.request("GET", "/api/prospection/agent-ia/equipe").catch(() => ({ equipe: [] })), staleTime: 10 * 60000 });
  const equipe = eq.data?.equipe || [];
  const f = q.data;
  const entete = (
    <div className="flex items-center justify-between gap-2">
      {pile.length > 1 ? (
        <button type="button" onClick={() => setPile((p) => p.slice(0, -1))} className="inline-flex items-center gap-1 p-0 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><ArrowLeft className="h-3.5 w-3.5" />Retour</button>
      ) : <span />}
      <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre max-md:h-10 max-md:w-10" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
    </div>
  );
  if (q.isLoading) return <div>{entete}<Chargement /></div>;
  if (!f) return <div>{entete}<p className="m-0 py-10 text-center text-[13px] text-brume">Fiche introuvable.</p></div>;
  const c = f.chiffres;
  const il = f.type === "agence" ? "elle" : "lui";
  return (
    <section>
      {entete}
      <h3 className="m-0 mt-1 text-[20px] font-normal tracking-[-0.01em] text-encre">{f.nom}</h3>
      <p className="m-0 mt-0.5 text-[13px] text-craie">
        {[f.poste, f.ville, STATUTS[f.statut]].filter(Boolean).join(" · ")}
        {f.type === "agent" && f.agence && (f.agence.id || f.agence.nom.toLowerCase() !== f.nom.toLowerCase()) && (
          <>{(f.poste || f.ville || f.statut) ? " · " : ""}{f.agence.id
            ? <button type="button" onClick={() => ouvrir("agence", f.agence.id)} aria-label={`Fiche de l'agence ${f.agence.nom}`} className="p-0 text-[13px] text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }} title="Ouvrir la fiche de l'agence">{f.agence.nom}</button>
            : f.agence.nom}</>
        )}
        {f.type === "agence" && f.site && <>{(f.ville || f.poste) ? " · " : ""}<a href={/^https?:/.test(f.site) ? f.site : `https://${f.site}`} target="_blank" rel="noreferrer" className="text-craie underline decoration-trait underline-offset-2 hover:text-encre">site</a></>}
        {f.linkedin && <>{(f.poste || f.ville || f.statut || f.agence) ? " · " : ""}<a href={/^https?:/.test(f.linkedin) ? f.linkedin : `https://${f.linkedin}`} target="_blank" rel="noreferrer" className="text-craie underline decoration-trait underline-offset-2 hover:text-encre">LinkedIn</a></>}
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2 max-md:grid-cols-2">
        <Chiffre libelle="On s'est parlé" valeur={c.conversations} note={`${pluriel(c.appels, "appel")}${c.minutes ? ` · ${c.minutes} min` : ""}`} />
        <Chiffre libelle="Mails" valeur={c.mails_envoyes + c.mails_recus} note={`${c.mails_envoyes} envoyés · ${c.mails_recus} reçus`} />
        <Chiffre libelle="Fiches reçues" valeur={c.fiches} note={`${c.oui} Oui · ${c.non} Non`} />
        <Chiffre libelle="Dernier échange" valeur={<span className="text-[16px]">{depuis(c.dernier)}</span>} note={c.dernier ? dateCourte(c.dernier) : null} />
      </div>
      {/* La Mémoire Klocka (30 oct. 2026) : ce que ses fiches disent de lui, en une ligne. */}
      {f.memoire?.nb_fiches > 0 && (
        <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-craie"><span className="text-ardoise">Mémoire · </span>{ligneMemoire(f.memoire)}</p>
      )}

      <Lecture key={`${f.type}:${f.id}`} type={f.type} id={f.id} fiche={f} />

      {f.parcours.length > 0 && (
        <>
          <p className={`${etiq} mt-6`}>Son parcours avec nous</p>
          <ol className="m-0 mt-2 list-none border-l border-trait p-0 pl-4">
            {f.parcours.map((p, k) => (
              <li key={k} className="relative pb-2.5 last:pb-0">
                <span className={`absolute -left-[21px] top-[6px] h-[9px] w-[9px] rounded-full ${k === f.parcours.length - 1 ? "bg-menthe" : "bg-bord-vif"}`} />
                <span className="text-[13.5px] text-encre">{p.quoi}</span><span className="text-[12.5px] text-brume"> · {dateCourte(p.le)}</span>
                {p.detail && <span className="block truncate text-[12.5px] text-ardoise">{p.detail}</span>}
              </li>
            ))}
          </ol>
        </>
      )}

      <Echanges key={`e:${f.type}:${f.id}`} echanges={f.echanges} equipe={equipe} />

      <p className={`${etiq} mt-6`}>Qui a échangé avec {il}</p>
      <ul className="m-0 mt-1.5 list-none p-0">
        {f.equipe.map((m) => (
          <li key={m.email} className="flex items-center gap-2.5 border-t border-trait py-2 first:border-t-0">
            {m.photo ? <img src={m.photo} alt="" className="h-7 w-7 flex-none rounded-full object-cover" /> : <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-relief text-[12px] text-craie">{m.nom.slice(0, 1).toUpperCase()}</span>}
            <span className="min-w-0 flex-1">
              <span className="text-[13.5px] text-encre">{m.nom}</span>
              {m.referent && <span className="ml-2 rounded-full bg-menthe/[0.14] px-2 py-0.5 text-[11px] text-menthe">Référent</span>}
              <span className="block text-[12.5px] text-ardoise">{[m.appels && pluriel(m.appels, "appel"), m.mails && pluriel(m.mails, "mail"), m.fiches && `${m.fiches} fiche${m.fiches > 1 ? "s" : ""} reçue${m.fiches > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "Aucun échange encore"}</span>
            </span>
            {m.dernier && <span className="flex-none text-[12px] text-brume">{depuis(m.dernier)}</span>}
          </li>
        ))}
        {!f.equipe.length && <li className="text-[13px] text-brume">Personne de l'équipe encore.</li>}
      </ul>

      {f.collegues.length > 0 && (
        <>
          <p className={`${etiq} mt-6`}>{f.type === "agence" ? "Ses agents" : `Ses collègues${f.agence?.nom ? ` chez ${f.agence.nom}` : ""}`}</p>
          <ul className="m-0 mt-1.5 list-none p-0">
            {f.collegues.map((x) => (
              <li key={x.id} className="border-t border-trait first:border-t-0">
                <button type="button" onClick={() => ouvrir("agent", x.id)} className="flex w-full items-baseline justify-between gap-3 py-2 text-left hover:bg-relief/40" style={{ background: "transparent" }}>
                  <span className="min-w-0"><span className="text-[13.5px] text-encre">{x.nom}</span><span className="text-[12.5px] text-ardoise">{[x.poste, STATUTS[x.statut]].filter(Boolean).map((v) => ` · ${v}`).join("")}</span></span>
                  <span className="flex-none text-[12px] tabular-nums text-brume">{[x.echanges ? pluriel(x.echanges, "échange") : null, x.fiches ? `${x.fiches} fiche${x.fiches > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || depuis(x.dernier_contact_le)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <CeQueKlockaSait type={f.type} id={f.id} className="mt-6" vide={f.type === "agent" ? "Rien encore : ce que l'agent dira en appel ou par mail, validé, arrivera ici." : null} />
      <details className="mt-3"><summary className="cursor-pointer text-[12.5px] text-brume">Toute la frise</summary><div className="mt-1"><HistoriqueLayer type={f.type} id={f.id} /></div></details>

      {f.type === "agent" && <Coordonnees id={f.id} />}
    </section>
  );
}
