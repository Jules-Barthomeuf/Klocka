import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, Mail, Phone, Search, Send, Store, X } from "lucide-react";
import { toast } from "@/components/ui/avis";

// ALX, côté résultat. On ne lance rien d'ici : on demande à l'assistant, dans
// Google Chat, « prospecte Cannes », et il fait tout (rues commerçantes,
// commerces, propriétaires, gérants dans Apollo, messages). Cette page montre
// ce qu'il a trouvé, par commerce ou par société, et le message à envoyer à
// chaque société. Rien ne part sans un clic.

const champ = "w-full rounded-lg border border-bord-doux bg-fond px-3 py-2 text-[13.5px] text-encre outline-none transition-colors placeholder:text-bord-vif focus:border-menthe/60";
const etiquette = "m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise";
const carte = "rounded-[16px] border border-trait bg-surface";
const annee = (iso) => (iso ? String(iso).slice(0, 4) : "");
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const nf = new Intl.NumberFormat("fr-FR");

const ETATS = {
  a_preparer: ["À préparer", "border-bord-doux text-craie"],
  non_demarchable: ["Non démarchable", "border-bord-doux text-brume"],
  pret: ["Message prêt", "border-menthe/50 text-menthe"],
  envoye: ["Envoyé", "border-menthe/50 text-menthe"],
  simule: ["Simulé", "border-bord-doux text-brume"],
  relance_prete: ["Relance à valider", "border-ambre/50 text-ambre"],
  relance_envoyee: ["Relancé", "border-menthe/50 text-menthe"],
  repondu: ["A répondu", "border-menthe bg-menthe/15 text-encre"],
  appele: ["Appelé", "border-menthe/50 text-menthe"],
  en_discussion: ["En discussion", "border-menthe bg-menthe/15 text-encre"],
  refus: ["Pas vendeur", "border-alerte/40 text-alerte"],
};
const PILES = { appeler: "À appeler", ecrire: "À écrire", surveiller: "À surveiller", ecartee: "Écartée" };

function Etat({ etat }) {
  const [mot, classe] = ETATS[etat] || [etat || "", "border-bord-doux text-craie"];
  return mot ? <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${classe}`}>{mot}</span> : null;
}

function Depuis({ d }) {
  if (!d?.date) return <span className="text-bord-vif">—</span>;
  return <span title={d.source}>{d.source?.startsWith("création") ? `au plus tard ${annee(d.date)}` : annee(d.date)}</span>;
}

// Le panneau d'une société : ses murs, ses gérants, le contact, le message.
function PanneauSociete({ villeId, s, onFermer }) {
  const queryClient = useQueryClient();
  const [objet, setObjet] = useState(s.message?.objet || "");
  const [corps, setCorps] = useState(s.message?.corps || "");
  const [a, setA] = useState(s.message?.a || s.contacts.find((c) => c.email)?.email || "");
  useEffect(() => { setObjet(s.message?.objet || ""); setCorps(s.message?.corps || ""); setA(s.message?.a || s.contacts.find((c) => c.email)?.email || ""); }, [s.message, s.contacts]);
  const maj = () => queryClient.invalidateQueries({ queryKey: ["alx-demarchage", villeId] });
  const url = (fin) => `/api/alx/demarchage/${villeId}/societes/${encodeURIComponent(s.cle)}/${fin}`;
  const rediger = useMutation({ mutationFn: () => base44.request("POST", url("rediger")), onSuccess: maj, onError: (e) => toast.error(e?.message || "Rédaction ratée") });
  const enregistrer = useMutation({ mutationFn: () => base44.request("POST", url("message"), { body: { objet, corps, a } }), onSuccess: () => { toast.success("Message enregistré"); maj(); } });
  const envoyer = useMutation({
    mutationFn: async () => { await base44.request("POST", url("message"), { body: { objet, corps, a } }); return base44.request("POST", url("envoyer")); },
    onSuccess: (r) => { toast.success(r.simule ? "Simulé : aucune boîte connectée" : `Envoyé à ${r.a}. La relance se prépare pour dans 7 jours, elle attendra ton feu vert.`); maj(); },
    onError: (e) => toast.error(e?.message || "Envoi raté"),
  });
  const relance = useMutation({ mutationFn: () => base44.request("POST", url("relance")), onSuccess: () => { toast.success("Relance envoyée"); maj(); }, onError: (e) => toast.error(e?.message || "Relance ratée") });
  const appel = useMutation({ mutationFn: (issue) => base44.request("POST", url("appel"), { body: { issue } }), onSuccess: () => { toast.success("Appel noté, relance calée"); maj(); } });
  const modifie = s.message && (objet !== s.message.objet || corps !== s.message.corps || a !== (s.message.a || s.contacts.find((c) => c.email)?.email || ""));
  const envoye = ["envoye", "relance_prete", "relance_envoyee", "repondu"].includes(s.etat);
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[560px] overflow-y-auto border-l border-relief bg-fond p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={etiquette}>{s.forme || "Société"} {s.siren ? `· ${s.siren}` : ""}</p>
          <h2 className="m-0 mt-1 text-[20px] font-semibold text-encre">{s.nom}</h2>
          <div className="mt-1.5"><Etat etat={s.etat} /></div>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-5 w-5" /></button>
      </div>

      <p className={`${etiquette} mt-5`}>Ses murs dans la ville · {s.murs.length}</p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {s.murs.map((m) => (
          <li key={m.cible_id} className="text-[13px] text-encre">
            <Link to={`/ALXCible?id=${m.cible_id}`} className="hover:text-menthe">{m.adresse}</Link>
            <span className="text-craie">{m.enseigne ? ` · ${m.enseigne}` : ""}{m.activite ? ` (${m.activite})` : ""}</span>
            <span className="text-brume">{m.depuis?.date ? ` · depuis ${m.depuis.source?.startsWith("création") ? "au plus tard " : ""}${annee(m.depuis.date)}` : ""}{m.pile ? ` · ${PILES[m.pile] || m.pile}` : ""}</span>
          </li>
        ))}
      </ul>

      <p className={`${etiquette} mt-5`}>Gérants</p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px] text-encre">
        {s.gerants.length ? s.gerants.map((g) => <li key={`${g.prenom}${g.nom}`}>{g.prenom} {g.nom}<span className="text-brume">{g.tranche_age ? ` · ${g.tranche_age} ans` : ""}{g.qualite ? ` · ${g.qualite}` : ""}</span></li>) : <li className="text-brume">Aucun gérant personne physique publié.</li>}
      </ul>
      {s.contacts.length > 0 && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-[12.5px] text-craie">
          {s.contacts.map((c) => (
            <li key={c.gerant} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-encre">{c.gerant}</span>
              {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-menthe"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
              {c.telephone && <a href={`tel:${c.telephone}`} className="inline-flex items-center gap-1 text-menthe"><Phone className="h-3.5 w-3.5" />{c.telephone}</a>}
              {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="text-menthe">LinkedIn</a>}
              <span className="text-brume">{c.poste ? `${c.poste}${c.entreprise ? ` chez ${c.entreprise}` : ""} · ` : ""}Apollo</span>
            </li>
          ))}
        </ul>
      )}

      {s.demarchable ? (
        <section className="mt-6 border-t border-trait pt-5">
          <p className={etiquette}>Le message</p>
          {s.message ? (
            <div className="mt-2 flex flex-col gap-2">
              <input id="alx-a" value={a} onChange={(e) => setA(e.target.value)} placeholder="Adresse du gérant" className={champ} />
              <input id="alx-objet" value={objet} onChange={(e) => setObjet(e.target.value)} className={champ} />
              <textarea id="alx-corps" value={corps} onChange={(e) => setCorps(e.target.value)} rows={Math.min(18, corps.split("\n").length + 2)} className={`${champ} leading-[1.55]`} />
              <div className="flex flex-wrap justify-end gap-2">
                {modifie && <button type="button" onClick={() => enregistrer.mutate()} className="rounded-full border border-menthe/60 px-3.5 py-1.5 text-[12.5px] text-encre">Enregistrer</button>}
                {!envoye && <button type="button" disabled={!a || envoyer.isPending} onClick={() => { if (window.confirm(`Envoyer ce message à ${a} depuis ta boîte ?`)) envoyer.mutate(); }} className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-4 py-1.5 text-[12.5px] font-semibold text-sur-menthe disabled:opacity-40">{envoyer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Envoyer</button>}
              </div>
              {envoye && <p className="m-0 text-[12.5px] text-craie">Envoyé le {dateCourte(s.envoye_le)}{s.relance?.le ? `, relance prévue le ${dateCourte(s.relance.le)}` : ""}.{s.reponse ? ` Réponse le ${dateCourte(s.reponse.le)} : « ${s.reponse.objet} ».` : ""}</p>}
            </div>
          ) : (
            <button type="button" onClick={() => rediger.mutate()} disabled={rediger.isPending} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-menthe/60 px-4 py-1.5 text-[12.5px] text-encre">{rediger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Rédiger le message</button>
          )}
          {s.relance?.etat === "prete" && (
            <div className="mt-4 rounded-[12px] border border-ambre/40 p-3">
              <p className="m-0 text-[12.5px] text-encre">La relance est prête :</p>
              <p className="m-0 mt-1 whitespace-pre-line text-[12.5px] text-craie">{s.relance.corps}</p>
              <button type="button" onClick={() => relance.mutate()} disabled={relance.isPending} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] font-semibold text-sur-menthe"><Send className="h-3.5 w-3.5" />Envoyer la relance</button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-craie">Un appel au gérant :</span>
            {[["sans_reponse", "Pas de réponse"], ["interesse", "Intéressé"], ["pas_interesse", "Pas vendeur"]].map(([k, mot]) => <button key={k} type="button" onClick={() => appel.mutate(k)} className="rounded-full border border-bord-doux px-3 py-1 text-[12px] text-craie hover:text-encre">{mot}</button>)}
          </div>
        </section>
      ) : <p className="mt-6 border-t border-trait pt-5 text-[12.5px] text-brume">Propriétaire public ou non démarchable : pas de message.</p>}
    </div>
  );
}

const TH = "border-b border-r border-relief bg-fond px-3 py-3 text-left text-[11px] font-normal uppercase tracking-[.14em] text-brume";
const TD = "border-b border-r border-relief px-3 py-2.5 align-top text-[12.5px]";

export default function ALXDemarchage() {
  const location = useLocation();
  const navigate = useNavigate();
  const villeParam = new URLSearchParams(location.search).get("ville");
  const [vue, setVue] = useState("societes");
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState("demarchables");
  const [ouverte, setOuverte] = useState(null);
  const villes = useQuery({ queryKey: ["alx-demarchage-villes"], queryFn: () => base44.request("GET", "/api/alx/demarchage"), refetchInterval: 30000 });
  const villeId = villeParam || villes.data?.villes?.[0]?.id || null;
  const d = useQuery({
    queryKey: ["alx-demarchage", villeId],
    queryFn: () => base44.request("GET", `/api/alx/demarchage/${villeId}`),
    enabled: !!villeId,
    refetchInterval: (x) => (x.state.data?.parcours?.etat === "en_cours" ? 10000 : 60000),
    placeholderData: (avant) => avant,
  });
  const data = d.data;
  const t = q.trim().toLowerCase();
  const societes = useMemo(() => (data?.societes || [])
    .filter((s) => filtre === "toutes" || (filtre === "demarchables" ? s.demarchable : filtre === "joignables" ? s.contacts.some((c) => c.email) : ["envoye", "relance_prete", "relance_envoyee", "repondu", "appele", "en_discussion", "refus"].includes(s.etat)))
    .filter((s) => !t || `${s.nom} ${s.gerants.map((g) => `${g.prenom} ${g.nom}`).join(" ")} ${s.murs.map((m) => `${m.adresse} ${m.enseigne || ""}`).join(" ")}`.toLowerCase().includes(t)), [data, filtre, t]);
  const commerces = useMemo(() => (data?.commerces || [])
    .filter((c) => filtre === "toutes" || (filtre === "demarchables" ? c.proprietaire?.demarchable : filtre === "joignables" ? !!c.contact?.email : !!c.etat && !["a_preparer", "non_demarchable", "pret"].includes(c.etat)))
    .filter((c) => !t || `${c.enseigne || ""} ${c.activite || ""} ${c.adresse} ${c.proprietaire?.nom || ""}`.toLowerCase().includes(t)), [data, filtre, t]);
  const ouverteS = ouverte ? (data?.societes || []).find((s) => s.cle === ouverte) : null;
  const p = data?.parcours;
  const tous = data?.societes || [];
  const compteurs = data ? [
    ["Commerces", data.commerces.length],
    ["Détenus par une société", data.commerces.filter((c) => c.proprietaire).length],
    ["Sociétés à démarcher", tous.filter((s) => s.demarchable).length],
    ["Joignables par mail", tous.filter((s) => s.contacts.some((c) => c.email)).length],
    ["Messages envoyés", tous.filter((s) => s.envoye_le).length],
    ["Réponses", tous.filter((s) => s.etat === "repondu").length],
  ] : [];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-6">
      <header className="mb-5">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Prospection off-market</h1>
        <p className="m-0 mt-2 max-w-[76ch] text-[14px] text-craie">Dis à l'assistant dans Google Chat « prospecte Cannes » : il lit les rues commerçantes, chaque commerce, qui détient les murs, cherche les gérants dans Apollo et prépare un message par société. Ici, le résultat. Rien ne part sans ton clic.</p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(villes.data?.villes || []).map((v) => (
          <button key={v.id} type="button" onClick={() => navigate(`/ALX?ville=${v.id}`)} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] ${villeId === v.id ? "border-menthe bg-menthe font-semibold text-sur-menthe" : "border-bord-doux text-craie hover:text-encre"}`}>
            {v.nom} <span className={villeId === v.id ? "" : "text-brume"}>{nf.format(v.commerces)}</span>
            {v.parcours?.etat === "en_cours" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </button>
        ))}
        {!villes.isLoading && !(villes.data?.villes || []).length && <p className="m-0 text-[13.5px] text-craie">Aucune ville encore : demande à l'assistant « prospecte Cannes ».</p>}
      </div>

      {p?.etat === "en_cours" && (
        <section className={`${carte} mb-4 p-5`}>
          <p className={etiquette}>L'assistant y travaille</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-encre/[0.08]"><div className="h-full rounded-full bg-menthe transition-[width] duration-700" style={{ width: `${p.rues_total ? Math.round((p.rues_faites / p.rues_total) * 100) : 5}%` }} /></div>
          <p className="m-0 mt-2 text-[13px] text-encre">{p.phase === "rues" ? "Il lit les rues commerçantes." : `${p.rues_faites} rues sur ${p.rues_total}${p.rue_en_cours ? `, il est ${p.rue_en_cours}` : ""}.`}</p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-0.5 p-0">{(p.journal || []).map((j, i) => <li key={i} className="text-[12px] text-brume">{j.texte || j}</li>)}</ul>
        </section>
      )}

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            {compteurs.map(([l, n]) => <div key={l} className={`${carte} p-3.5`}><p className="m-0 text-[11px] uppercase tracking-[.12em] text-ardoise">{l}</p><p className="m-0 mt-1.5 text-[26px] font-light leading-none tabular-nums text-encre">{nf.format(n)}</p></div>)}
          </div>
          {!data.apollo && <p className="m-0 mb-4 rounded-[12px] border border-ambre/40 px-4 py-2.5 text-[13px] text-craie">Apollo n'est pas branché (clé APOLLO_API_KEY) : les gérants sont connus, pas leurs mails.</p>}

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-bord-doux p-0.5">
              {[["societes", "Par société", Building2], ["commerces", "Par commerce", Store]].map(([k, mot, Icone]) => (
                <button key={k} type="button" onClick={() => setVue(k)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ${vue === k ? "bg-menthe font-semibold text-sur-menthe" : "text-craie hover:text-encre"}`}><Icone className="h-3.5 w-3.5" />{mot}</button>
              ))}
            </div>
            <div className="inline-flex flex-wrap gap-1">
              {[["demarchables", "À démarcher"], ["joignables", "Joignables par mail"], ["envoyes", "Contactés"], ["toutes", "Tout"]].map(([k, mot]) => (
                <button key={k} type="button" onClick={() => setFiltre(k)} className={`rounded-full border px-3 py-1 text-[12px] ${filtre === k ? "border-menthe text-encre" : "border-bord-doux text-brume hover:text-encre"}`}>{mot}</button>
              ))}
            </div>
            <div className="flex min-w-[220px] flex-1 items-center gap-2 border-b border-encre/[0.18] pb-1 focus-within:border-bord-vif">
              <Search className="h-4 w-4 text-brume" />
              <input id="recherche-alx" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une société, un gérant, une adresse, une enseigne" className="w-full border-none bg-transparent py-1 text-[13.5px] text-encre outline-none placeholder:text-brume" />
            </div>
            {d.isFetching && <Loader2 className="h-4 w-4 animate-spin text-ardoise" />}
          </div>

          <div className="overflow-auto rounded-xl border border-relief" style={{ maxHeight: "calc(100vh - 340px)" }}>
            {vue === "societes" ? (
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-20"><tr>{["Société", "Ses murs", "Gérants", "Contact", "Depuis", "Message", "Démarchage"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "sticky left-0 z-30 min-w-[240px]" : ""}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {societes.map((s) => {
                    const contact = s.contacts.find((c) => c.email) || s.contacts[0];
                    const plusVieux = s.murs.map((m) => m.depuis).filter((x) => x?.date).sort((x, y) => String(x.date).localeCompare(String(y.date)))[0];
                    return (
                      <tr key={s.cle} onClick={() => setOuverte(s.cle)} className={`cursor-pointer hover:bg-encre/[0.03] ${ouverte === s.cle ? "bg-menthe/[0.05]" : ""}`}>
                        <td className={`${TD} sticky left-0 z-10 bg-fond`}><span className="block font-semibold text-encre">{s.nom}</span><span className="text-[11.5px] text-brume">{[s.forme, s.pile ? PILES[s.pile] : null].filter(Boolean).join(" · ")}</span></td>
                        <td className={`${TD} min-w-[280px] text-craie`}><span className="text-encre">{s.murs.length}</span> · {s.murs.slice(0, 2).map((m) => `${m.adresse}${m.enseigne ? ` (${m.enseigne})` : ""}`).join(" ; ")}{s.murs.length > 2 ? "…" : ""}</td>
                        <td className={`${TD} min-w-[200px] text-craie`}>{s.gerants.slice(0, 2).map((g) => `${g.prenom} ${g.nom}${g.tranche_age ? ` (${g.tranche_age})` : ""}`).join(", ")}{s.gerants.length > 2 ? ` +${s.gerants.length - 2}` : ""}</td>
                        <td className={`${TD} min-w-[200px]`}>{contact?.email ? <span className="text-menthe">{contact.email}</span> : contact?.linkedin ? <span className="text-craie">LinkedIn</span> : <span className="text-bord-vif">—</span>}</td>
                        <td className={`${TD} whitespace-nowrap text-craie`}><Depuis d={plusVieux} /></td>
                        <td className={`${TD} min-w-[240px] text-craie`}>{s.message ? <span className="line-clamp-2">{s.message.objet}</span> : <span className="text-bord-vif">—</span>}</td>
                        <td className={TD}><Etat etat={s.etat} /></td>
                      </tr>
                    );
                  })}
                  {!societes.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-brume">Aucune société pour ce filtre.</td></tr>}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 z-20"><tr>{["Commerce", "Adresse", "Emplacement", "Propriétaire des murs", "Depuis", "Gérants", "Contact", "Démarchage"].map((h, i) => <th key={h} className={`${TH} ${i === 0 ? "sticky left-0 z-30 min-w-[220px]" : ""}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {commerces.slice(0, 2000).map((c) => (
                    <tr key={c.id} onClick={() => c.proprietaire && setOuverte(c.proprietaire.cle)} className={`hover:bg-encre/[0.03] ${c.proprietaire ? "cursor-pointer" : ""}`}>
                      <td className={`${TD} sticky left-0 z-10 bg-fond`}><Link to={`/ALXCible?id=${c.id}`} onClick={(e) => e.stopPropagation()} className="block font-semibold text-encre hover:text-menthe">{c.enseigne || "Commerce"}</Link><span className="text-[11.5px] text-brume">{c.activite}{c.exclue ? " · activité exclue" : ""}</span></td>
                      <td className={`${TD} min-w-[200px] text-craie`}>{c.adresse}</td>
                      <td className={`${TD} whitespace-nowrap text-craie`}>{c.rue ? `${c.rue}` : ""}{c.emplacement ? ` · n°${c.emplacement === 1.5 ? "1 bis" : c.emplacement}` : ""}</td>
                      <td className={`${TD} min-w-[200px]`}>{c.proprietaire ? <span className="text-encre">{c.proprietaire.nom}<span className="text-brume"> · {c.proprietaire.forme || ""}</span></span> : <span className="text-brume">non publié (particulier ?)</span>}</td>
                      <td className={`${TD} whitespace-nowrap text-craie`}><Depuis d={c.depuis} /></td>
                      <td className={`${TD} min-w-[180px] text-craie`}>{c.gerants.slice(0, 2).map((g) => `${g.prenom} ${g.nom}`).join(", ")}</td>
                      <td className={`${TD} min-w-[180px]`}>{c.contact?.email ? <span className="text-menthe">{c.contact.email}</span> : <span className="text-bord-vif">—</span>}</td>
                      <td className={TD}><Etat etat={c.etat} /></td>
                    </tr>
                  ))}
                  {!commerces.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-brume">Aucun commerce pour ce filtre.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
          <p className="m-0 mt-2 text-[11px] text-brume">{vue === "societes" ? `${societes.length} sociétés` : `${commerces.length} commerces`} · clic sur une ligne : la société, ses murs, ses gérants et le message · les murs des particuliers ne sont pas publiés, ils ne se démarchent pas.</p>
        </>
      )}
      {d.isLoading && villeId && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>}
      {ouverteS && <PanneauSociete villeId={villeId} s={ouverteS} onFermer={() => setOuverte(null)} />}
      {data && <p className="m-0 mt-6 text-[11.5px] text-brume"><Check className="mr-1 inline h-3 w-3" />L'atelier ALX (rues, cartes, bilan) reste là : <Link to="/ALXAtelier" className="text-menthe">ouvrir l'atelier</Link>.</p>}
    </div>
  );
}
