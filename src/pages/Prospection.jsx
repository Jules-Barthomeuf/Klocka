import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, Loader2, Mail, Phone, RefreshCw, Search, Send, X } from "lucide-react";
import { toast } from "@/components/ui/avis";

// La prospection, du côté de celui qui appelle : sa liste du jour (le carnet
// est dans Monday, tableau « Prospection Agent Immo »), le statut posé d'un
// clic après l'appel, les mails prêts à partir en lot, l'ajout d'agents
// (fichier Apollo ou Google Sheet, Equimmox, à la main) et les réglages.
// Tout le calcul est côté serveur (server/prospection/).

const STATUTS = [
  { cle: "pas_de_reponse", mot: "Pas de réponse" },
  { cle: "a_recontacter", mot: "À recontacter", date: true },
  { cle: "interesse", mot: "Intéressé", fort: true },
  { cle: "regulier", mot: "Contact régulier" },
  { cle: "moyenne", mot: "Moyenne" },
  { cle: "mort", mot: "Mort", alerte: true },
];
const jourFr = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const dansJours = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const champ = "w-full rounded-lg border border-bord-doux bg-fond px-3 py-2 text-[13.5px] text-encre outline-none transition-colors placeholder:text-bord-vif focus:border-menthe/60";
const etiquette = "m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise";

function Pastille({ children, ton = "neutre" }) {
  const t = { neutre: "border-bord-doux text-craie", menthe: "border-menthe/50 text-menthe", ambre: "border-ambre/50 text-ambre", alerte: "border-alerte/40 text-alerte" }[ton];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${t}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Un appel
// ---------------------------------------------------------------------------

function Appel({ a, onNoter, enCours }) {
  const [remarque, setRemarque] = useState("");
  const [dateOuverte, setDateOuverte] = useState(false);
  const [date, setDate] = useState(dansJours(7));
  const horsTableau = a.genre === "dossier" || a.genre === "retour";
  const noter = (statut, relance = null) => onNoter({ item_id: a.id, statut, remarque: remarque.trim() || null, relance });
  const tel = a.telephone_affiche || a.telephone;
  const dernierMot = a.remarques ? String(a.remarques).split(" / ")[0] : null;
  return (
    <li className="rounded-[16px] border border-trait bg-surface p-5 transition-opacity" style={{ opacity: enCours ? 0.5 : 1 }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-[16px] font-semibold text-encre">{a.nom}</h3>
            {a.genre === "dossier" && <Pastille ton="ambre">Dossier en cours</Pastille>}
            {a.genre === "retour" && <Pastille ton="alerte">Retour sur un Non</Pastille>}
            {a.source && <Pastille>{a.source}{a.annonces ? ` · ${a.annonces} annonce${a.annonces > 1 ? "s" : ""}` : ""}</Pastille>}
          </div>
          <p className="m-0 mt-1 text-[13px] text-craie">{[a.agence && a.agence !== a.nom ? a.agence : null, a.ville].filter(Boolean).join(" · ") || " "}</p>
          <p className="m-0 mt-2 text-[13.5px] text-encre">{a.raison}</p>
          {dernierMot && <p className="m-0 mt-1 text-[12.5px] text-brume">Dernier mot : {dernierMot}</p>}
          {a.deal_id && <Link to={`/Analyse?deal_id=${a.deal_id}`} className="mt-1 inline-block text-[12.5px] text-menthe hover:underline">{a.dossier || "Voir le dossier"}</Link>}
        </div>
        <div className="flex flex-none flex-col items-start gap-1 sm:items-end">
          {tel ? <a href={`tel:${String(tel).replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[14px] font-semibold tabular-nums text-sur-menthe"><Phone className="h-4 w-4" />{tel}</a>
            : <span className="text-[12.5px] text-brume">Pas de numéro</span>}
          {a.email && <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1.5 text-[12.5px] text-craie hover:text-encre"><Mail className="h-3.5 w-3.5" />{a.email}</a>}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5 border-t border-trait pt-4">
        <input id={`remarque-${a.id}`} value={remarque} onChange={(e) => setRemarque(e.target.value)} placeholder="Ce qu'il a dit (facultatif) : deux murs à Cannes d'ici fin octobre" className={champ} />
        <div className="flex flex-wrap items-center gap-1.5">
          {horsTableau ? (
            <button type="button" disabled={enCours} onClick={() => noter("fait")} className="inline-flex items-center gap-1.5 rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] font-semibold text-sur-menthe"><Check className="h-3.5 w-3.5" />Appel fait</button>
          ) : STATUTS.map((s) => (
            <button key={s.cle} type="button" disabled={enCours}
              onClick={() => (s.date ? setDateOuverte((x) => !x) : noter(s.cle))}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${s.fort ? "border-menthe/60 text-encre hover:bg-menthe/15" : s.alerte ? "border-bord-doux text-brume hover:border-alerte/50 hover:text-alerte" : "border-bord-doux text-craie hover:border-menthe/50 hover:text-encre"} ${s.date && dateOuverte ? "border-menthe bg-menthe/15 text-encre" : ""}`}>
              {s.mot}
            </button>
          ))}
        </div>
        {dateOuverte && !horsTableau && (
          <div className="flex flex-wrap items-center gap-2 animate-in fade-in duration-200">
            <label htmlFor={`date-${a.id}`} className="text-[12.5px] text-craie">Rappeler le</label>
            <input id={`date-${a.id}`} type="date" value={date} min={dansJours(0)} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-bord-doux bg-fond px-2 py-1 text-[13px] text-encre" />
            {[["demain", 1], ["dans 3 jours", 3], ["dans une semaine", 7], ["dans un mois", 30]].map(([mot, n]) => (
              <button key={n} type="button" onClick={() => setDate(dansJours(n))} className={`rounded-full border px-2.5 py-1 text-[12px] ${date === dansJours(n) ? "border-menthe text-encre" : "border-bord-doux text-brume hover:text-encre"}`}>{mot}</button>
            ))}
            <button type="button" onClick={() => noter("a_recontacter", date)} className="rounded-full bg-menthe px-3.5 py-1.5 text-[12.5px] font-semibold text-sur-menthe">Noter</button>
          </div>
        )}
      </div>
    </li>
  );
}

function OngletAppels({ data, isLoading }) {
  const queryClient = useQueryClient();
  const [enCours, setEnCours] = useState(null);
  const noter = useMutation({
    mutationFn: (corps) => base44.request("POST", "/api/prospection/appel", { body: corps }),
    onMutate: (corps) => setEnCours(corps.item_id),
    onSuccess: (r, corps) => {
      const suite = r?.prochaine_relance ? `, on le rappelle ${jourFr(r.prochaine_relance)}` : corps.statut === "mort" ? ", on ne le rappelle plus" : "";
      toast.success(`${r?.nom || "Appel"} : ${r?.statut || "noté"}${suite}${corps.statut === "interesse" ? ". Le mail de critères attend dans Mails prêts." : ""}`);
      queryClient.setQueryData(["prospection-appels"], (d) => (d ? { ...d, liste: d.liste.filter((x) => x.id !== corps.item_id), faits: { ...d.faits, moi: (d.faits?.moi || 0) + 1, equipe: (d.faits?.equipe || 0) + 1 } } : d));
      queryClient.invalidateQueries({ queryKey: ["prospection-appels"] });
    },
    onError: (e) => toast.error(e?.message || "Appel non noté"),
    onSettled: () => setEnCours(null),
  });
  const synchro = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/synchroniser"),
    onSuccess: (r) => { toast.success(r?.appels ? `${r.appels} appel${r.appels > 1 ? "s" : ""} relu${r.appels > 1 ? "s" : ""} dans Monday` : "Monday relu, rien de neuf"); queryClient.invalidateQueries({ queryKey: ["prospection-appels"] }); },
    onError: (e) => toast.error(e?.message || "Monday injoignable"),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  if (!data?.monday) return <p className="rounded-[16px] border border-trait p-6 text-[14px] text-craie">Monday n'est pas branché sur ce serveur (MONDAY_TOKEN) : la liste d'appels vient du tableau « Prospection Agent Immo ».</p>;
  const liste = data.liste || [];
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-8">
          <div>
            <p className={etiquette}>À appeler aujourd'hui</p>
            <p className="m-0 mt-1 text-[40px] font-light leading-none tabular-nums text-encre">{liste.length}</p>
          </div>
          <div>
            <p className={etiquette}>Faits</p>
            <p className="m-0 mt-1 text-[40px] font-light leading-none tabular-nums text-menthe">{data.faits?.moi || 0}</p>
          </div>
          <div>
            <p className={etiquette}>Toute l'équipe</p>
            <p className="m-0 mt-1 text-[15px] tabular-nums text-craie">{data.faits?.equipe || 0} appel{(data.faits?.equipe || 0) > 1 ? "s faits" : " fait"} · {Object.values(data.equipe || {}).reduce((t, n) => t + n, 0)} à faire</p>
          </div>
        </div>
        <button type="button" onClick={() => synchro.mutate()} disabled={synchro.isPending} className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3 py-1.5 text-[12.5px] text-craie hover:text-encre">
          <RefreshCw className={`h-3.5 w-3.5 ${synchro.isPending ? "animate-spin" : ""}`} /> Relire Monday
        </button>
      </div>
      {data.reportes > 0 && <p className="m-0 mb-4 text-[12.5px] text-brume">{data.reportes} autre{data.reportes > 1 ? "s" : ""} attendent demain : au-delà de {data.reglages?.max} appels par personne, la liste s'arrête.</p>}
      {liste.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {liste.map((a) => <Appel key={a.id} a={a} enCours={enCours === a.id} onNoter={(c) => noter.mutate(c)} />)}
        </ul>
      ) : (
        <div className="rounded-[16px] border border-trait p-8 text-center">
          <p className="m-0 text-[15px] text-encre">Plus personne à appeler aujourd'hui.</p>
          <p className="m-0 mt-1 text-[13px] text-craie">
            {data.total_prospects ? "Les prochains reviennent à leur date de relance." : "Le tableau est vide : ajoutez des agents (onglet Ajouter), ou vos villes cibles pour qu'Equimmox le remplisse cette nuit."}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les mails prêts
// ---------------------------------------------------------------------------

function MailPret({ m, choisi, onChoisir, onEcarter }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [objet, setObjet] = useState(m.objet);
  const [corps, setCorps] = useState(m.corps);
  const modifie = objet !== m.objet || corps !== m.corps;
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", `/api/prospection/mails/${m.id}`, { body: { objet, corps } }),
    onSuccess: () => { toast.success("Mail modifié"); queryClient.invalidateQueries({ queryKey: ["prospection-mails"] }); },
    onError: (e) => toast.error(e?.message || "Modification perdue"),
  });
  return (
    <li className={`rounded-[14px] border p-4 transition-colors ${choisi ? "border-menthe/60 bg-menthe/[0.04]" : "border-trait"}`}>
      <div className="flex items-start gap-3">
        <input id={`choix-${m.id}`} type="checkbox" checked={choisi} onChange={(e) => onChoisir(e.target.checked)} className="mt-1 h-4 w-4 accent-menthe" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pastille ton={m.genre === "retour" ? "alerte" : "menthe"}>{m.genre === "retour" ? "Retour sur un Non" : "Critères"}</Pastille>
            <label htmlFor={`choix-${m.id}`} className="text-[14px] font-semibold text-encre">{m.nom || m.a}</label>
            <span className="text-[12.5px] text-brume">{m.a}</span>
          </div>
          <p className="m-0 mt-1 text-[13px] text-craie">{m.genre === "retour" ? `Dossier ${m.dossier}` : [m.agence, m.ville].filter(Boolean).join(" · ")} · {objet}</p>
          {ouvert ? (
            <div className="mt-3 flex flex-col gap-2">
              <input id={`objet-${m.id}`} value={objet} onChange={(e) => setObjet(e.target.value)} className={champ} />
              <textarea id={`corps-${m.id}`} value={corps} onChange={(e) => setCorps(e.target.value)} rows={Math.min(18, corps.split("\n").length + 2)} className={`${champ} font-[inherit] leading-[1.55]`} />
              <p className="m-0 text-[11.5px] text-brume">« {"{signature}"} » devient ton nom à l'envoi.</p>
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
        </div>
        <button type="button" onClick={onEcarter} aria-label="Écarter ce mail" title="Écarter" className="grid h-7 w-7 flex-none place-items-center rounded-full text-brume hover:text-alerte"><X className="h-4 w-4" /></button>
      </div>
    </li>
  );
}

function OngletMails() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["prospection-mails"], queryFn: () => base44.request("GET", "/api/prospection/mails") });
  const [choisis, setChoisis] = useState(new Set());
  const mails = data?.mails || [];
  const maj = () => { queryClient.invalidateQueries({ queryKey: ["prospection-mails"] }); queryClient.invalidateQueries({ queryKey: ["prospection-appels"] }); };
  const preparer = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/mails/preparer"),
    onSuccess: (r) => { toast.success(r.retours + r.criteres ? `${r.retours + r.criteres} mail${r.retours + r.criteres > 1 ? "s" : ""} préparé${r.retours + r.criteres > 1 ? "s" : ""}` : "Rien de nouveau à préparer"); maj(); },
    onError: (e) => toast.error(e?.message || "Préparation ratée"),
  });
  const envoyer = useMutation({
    mutationFn: (ids) => base44.request("POST", "/api/prospection/mails/envoyer", { body: { ids } }),
    onSuccess: (r) => {
      const t = [r.envoyes ? `${r.envoyes} envoyé${r.envoyes > 1 ? "s" : ""}` : null, r.simules ? `${r.simules} simulé${r.simules > 1 ? "s" : ""} (aucune boîte connectée)` : null, r.rates ? `${r.rates} raté${r.rates > 1 ? "s" : ""}` : null].filter(Boolean).join(", ");
      (r.rates ? toast.error : toast.success)(t || "Rien n'est parti");
      setChoisis(new Set()); maj();
    },
    onError: (e) => toast.error(e?.message || "Envoi raté"),
  });
  const ecarter = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/prospection/mails/${id}/ecarter`),
    onSuccess: () => maj(),
  });
  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  const tous = mails.length > 0 && choisis.size === mails.length;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[62ch] text-[13.5px] text-craie">Les critères pour les agents intéressés, et le retour des dossiers Non dont l'agent n'a rien reçu. Relis, coche, envoie : ils partent de ta boîte, rien ne part tout seul.</p>
        <button type="button" onClick={() => preparer.mutate()} disabled={preparer.isPending} className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3 py-1.5 text-[12.5px] text-craie hover:text-encre">
          {preparer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Préparer les mails
        </button>
      </div>
      {!data?.criteres && <p className="m-0 mb-4 rounded-[12px] border border-ambre/40 px-4 py-3 text-[13px] text-craie">Tes critères ne sont pas écrits : dans Réglages, écris ce que Klocka cherche, et chaque agent intéressé aura son mail prêt.</p>}
      {mails.length ? (
        <>
          <label className="mb-2 flex items-center gap-2 text-[12.5px] text-craie">
            <input id="tous-les-mails" type="checkbox" checked={tous} onChange={(e) => setChoisis(e.target.checked ? new Set(mails.map((m) => m.id)) : new Set())} className="h-4 w-4" /> Tout cocher
          </label>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {mails.map((m) => <MailPret key={m.id} m={m} choisi={choisis.has(m.id)} onChoisir={(v) => setChoisis((s) => { const n = new Set(s); if (v) n.add(m.id); else n.delete(m.id); return n; })} onEcarter={() => ecarter.mutate(m.id)} />)}
          </ul>
          <div className="sticky bottom-4 mt-4 flex justify-end">
            <button type="button" disabled={!choisis.size || envoyer.isPending}
              onClick={() => { if (window.confirm(`Envoyer ${choisis.size} mail${choisis.size > 1 ? "s" : ""} depuis ta boîte ?`)) envoyer.mutate([...choisis]); }}
              className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[14px] font-semibold text-sur-menthe shadow-lg disabled:opacity-40">
              {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer {choisis.size || ""} mail{choisis.size > 1 ? "s" : ""}
            </button>
          </div>
        </>
      ) : <p className="rounded-[16px] border border-trait p-8 text-center text-[13.5px] text-craie">Aucun mail en attente.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajouter des agents
// ---------------------------------------------------------------------------

const bilan = (r) => `${r.crees?.length || 0} ajouté${(r.crees?.length || 0) > 1 ? "s" : ""}, ${r.doublons || 0} déjà connu${(r.doublons || 0) > 1 ? "s" : ""}${r.sans_contact ? `, ${r.sans_contact} sans mail ni téléphone` : ""}${r.en_attente ? `, ${r.en_attente} en attente` : ""}`;

function OngletAjouter({ reglages }) {
  const queryClient = useQueryClient();
  const fichier = useRef(null);
  const [source, setSource] = useState("Apollo");
  const [dernierImport, setDernierImport] = useState(null);
  const [villes, setVilles] = useState(reglages?.reglages?.villes || []);
  const [ville, setVille] = useState("");
  const [agent, setAgent] = useState({ nom: "", agence: "", email: "", telephone: "", ville: "", remarque: "" });
  useEffect(() => { setVilles(reglages?.reglages?.villes || []); }, [reglages?.reglages?.villes]);
  const maj = () => { queryClient.invalidateQueries({ queryKey: ["prospection-appels"] }); queryClient.invalidateQueries({ queryKey: ["prospection-reglages"] }); };

  const importer = useMutation({
    mutationFn: (f) => { const form = new FormData(); form.append("fichier", f); form.append("source", source); return base44.request("POST", "/api/prospection/import", { body: form, isForm: true }); },
    onSuccess: (r) => { setDernierImport(r); toast.success(bilan(r)); maj(); },
    onError: (e) => toast.error(e?.message || "Import raté"),
  });
  const ajouter = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/ajouter", { body: agent }),
    onSuccess: (r) => { if (r.crees?.length) { toast.success(`${agent.nom || agent.agence} ajouté : il est dans ta liste`); setAgent({ nom: "", agence: "", email: "", telephone: "", ville: "", remarque: "" }); } else toast.error("Déjà connu : il est dans un des deux tableaux Monday ou dans nos dossiers."); maj(); },
    onError: (e) => toast.error(e?.message || "Ajout raté"),
  });
  const { data: recherche } = useQuery({
    queryKey: ["prospection-equimmox"],
    queryFn: () => base44.request("GET", "/api/prospection/equimmox"),
    refetchInterval: (q) => (q.state.data?.recherche?.etat === "en_cours" ? 4000 : false),
  });
  const chercher = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/equimmox", { body: { villes } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prospection-equimmox"] }),
    onError: (e) => toast.error(e?.message || "Recherche impossible"),
  });
  const r = recherche?.recherche;
  const precedent = useRef(r?.etat);
  useEffect(() => {
    if (precedent.current === "en_cours" && r?.etat === "fini") { toast.success(`Equimmox : ${bilan(r.resultat || {})}`); maj(); }
    if (precedent.current === "en_cours" && r?.etat === "erreur") toast.error(r.erreur || "Equimmox n'a pas répondu");
    precedent.current = r?.etat;
  });
  const nuit = reglages?.nuit;
  const alertes = reglages?.alertes;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[16px] border border-trait bg-surface p-6">
        <p className={etiquette}>Un fichier</p>
        <h3 className="m-0 mt-1 text-[17px] font-semibold text-encre">Apollo, Google Sheet, Excel</h3>
        <p className="m-0 mt-1 text-[13px] text-craie">Un export CSV ou .xlsx. Les colonnes se reconnaissent par leur nom (First Name, Company, Email, Mobile Phone, City, ou Nom, Agence, Téléphone, Ville). Ceux qu'on connaît déjà ne sont pas ajoutés.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {["Apollo", "Google Sheet", "Autre fichier"].map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} className={`rounded-full border px-3 py-1 text-[12px] ${source === s ? "border-menthe bg-menthe text-sur-menthe font-semibold" : "border-bord-doux text-craie hover:text-encre"}`}>{s}</button>
          ))}
        </div>
        <input ref={fichier} id="fichier-agents" type="file" accept=".csv,.xlsx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importer.mutate(f); e.target.value = ""; }} />
        <button type="button" onClick={() => fichier.current?.click()} disabled={importer.isPending}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) importer.mutate(f); }}
          className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-bord-doux px-4 py-8 text-[13.5px] text-craie transition-colors hover:border-menthe/60 hover:text-encre">
          {importer.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
          {importer.isPending ? "Lecture et dédoublonnage…" : "Dépose le fichier ici, ou clique pour le choisir"}
        </button>
        {dernierImport && <p className="m-0 mt-3 text-[12.5px] text-craie">Dernier import : {dernierImport.lignes} lignes, {bilan(dernierImport)}.</p>}
      </section>

      <section className="rounded-[16px] border border-trait bg-surface p-6">
        <p className={etiquette}>Equimmox</p>
        <h3 className="m-0 mt-1 text-[17px] font-semibold text-encre">Les agents qui publient du commerce</h3>
        <p className="m-0 mt-1 text-[13px] text-craie">Les annonces de commerce en vente dans ces villes, regroupées par agent, les plus gros publieurs d'abord. Toutes les nuits sur vos villes cibles ; ici, tout de suite. Une minute par ville.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {villes.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-bord-doux px-2.5 py-1 text-[12.5px] text-encre">{v}
              <button type="button" aria-label={`Retirer ${v}`} onClick={() => setVilles((l) => l.filter((x) => x !== v))} className="text-brume hover:text-alerte"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); if (ville.trim() && !villes.includes(ville.trim())) setVilles((l) => [...l, ville.trim()]); setVille(""); }}>
            <input id="ville-equimmox" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ajouter une ville" className="w-[150px] rounded-full border border-bord-doux bg-fond px-3 py-1 text-[12.5px] text-encre outline-none focus:border-menthe/60" />
          </form>
        </div>
        <button type="button" onClick={() => chercher.mutate()} disabled={!villes.length || r?.etat === "en_cours"} className="mt-4 inline-flex items-center gap-2 rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe disabled:opacity-40">
          {r?.etat === "en_cours" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {r?.etat === "en_cours" ? `Recherche en cours sur ${r.villes.join(", ")}` : "Chercher sur Equimmox"}
        </button>
        {r?.etat === "fini" && r.resultat && (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-[12.5px] text-craie">
            {(r.resultat.parVille || []).map((v) => <li key={v.ville}>{v.ville} : {v.erreur ? <span className="text-alerte">{v.erreur}</span> : `${v.offres ?? "?"} annonces, ${v.agents} agents de commerce`}</li>)}
            <li className="text-encre">{bilan(r.resultat)}</li>
          </ul>
        )}
        {nuit?.jour && <p className="m-0 mt-3 border-t border-trait pt-3 text-[12px] text-brume">Dernière nuit ({new Date(`${nuit.jour}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}) : {nuit.etat === "en_cours" ? "en cours" : `${nuit.crees || 0} ajoutés, ${nuit.doublons || 0} déjà connus${nuit.alertes ? `, ${nuit.alertes} alertes lues` : ""}`}.</p>}
      </section>

      <section className="rounded-[16px] border border-trait bg-surface p-6">
        <p className={etiquette}>À la main</p>
        <h3 className="m-0 mt-1 text-[17px] font-semibold text-encre">Un agent</h3>
        <form className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); ajouter.mutate(); }}>
          {[["nom", "Sophie Martin"], ["agence", "Barnes Côte d'Azur"], ["telephone", "06 12 34 56 78"], ["email", "sophie@barnes.fr"], ["ville", "Cannes"]].map(([k, ex]) => (
            <input key={k} id={`agent-${k}`} value={agent[k]} onChange={(e) => setAgent((a) => ({ ...a, [k]: e.target.value }))} placeholder={ex} aria-label={k} className={champ} />
          ))}
          <input id="agent-remarque" value={agent.remarque} onChange={(e) => setAgent((a) => ({ ...a, remarque: e.target.value }))} placeholder="Remarque (facultatif)" className={`${champ} sm:col-span-2`} />
          <button type="submit" disabled={ajouter.isPending || !(agent.nom || agent.agence) || !(agent.email || agent.telephone)} className="rounded-full bg-menthe px-4 py-2 text-[13.5px] font-semibold text-sur-menthe disabled:opacity-40 sm:col-span-2">Ajouter à la prospection</button>
        </form>
      </section>

      <section className="rounded-[16px] border border-trait bg-surface p-6">
        <p className={etiquette}>Les alertes des sites</p>
        <h3 className="m-0 mt-1 text-[17px] font-semibold text-encre">SeLoger, Leboncoin, BureauxLocaux, Geolocaux</h3>
        <p className="m-0 mt-1 text-[13px] text-craie">Crée une fois, sur chaque site, une alerte sur vos villes et le commerce en vente, avec l'adresse sourcing@klocka.immo. Klocka les met de côté à leur arrivée et, la nuit, en tire les agences qu'on ne connaît pas.</p>
        {alertes?.sites?.length ? (
          <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0 text-[12.5px] text-craie">
            {alertes.sites.map((s) => <li key={s.site}>{s.site} : {s.recues} alerte{s.recues > 1 ? "s" : ""} reçue{s.recues > 1 ? "s" : ""}, {s.annonces} annonces lues</li>)}
            {alertes.a_lire > 0 && <li className="text-brume">{alertes.a_lire} à lire cette nuit</li>}
          </ul>
        ) : <p className="m-0 mt-3 text-[12.5px] text-brume">Aucune alerte reçue pour l'instant.</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------------

function OngletReglages({ reglages }) {
  const queryClient = useQueryClient();
  const initial = reglages?.reglages;
  const [r, setR] = useState(initial || null);
  const [ville, setVille] = useState("");
  useEffect(() => { if (initial) setR(initial); }, [initial]);
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", "/api/prospection/reglages", { body: r }),
    onSuccess: () => { toast.success("Réglages enregistrés"); queryClient.invalidateQueries({ queryKey: ["prospection-reglages"] }); queryClient.invalidateQueries({ queryKey: ["prospection-appels"] }); },
    onError: (e) => toast.error(e?.message || "Réglages non enregistrés"),
  });
  if (!r) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  const poser = (k, v) => setR((x) => ({ ...x, [k]: v }));
  const ajouterVille = (v) => { const t = String(v || "").trim(); if (t && !r.villes.includes(t)) poser("villes", [...r.villes, t]); };
  const suggestions = (reglages?.villes_des_dossiers || []).filter((v) => !r.villes.includes(v));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-[16px] border border-trait bg-surface p-6">
        <p className={etiquette}>Villes cibles</p>
        <p className="m-0 mt-1 text-[13px] text-craie">Chaque nuit, Equimmox y cherche les agents qui publient du commerce en vente.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.villes.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full border border-menthe/50 px-2.5 py-1 text-[12.5px] text-encre">{v}
              <button type="button" aria-label={`Retirer ${v}`} onClick={() => poser("villes", r.villes.filter((x) => x !== v))} className="text-brume hover:text-alerte"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); ajouterVille(ville); setVille(""); }}>
            <input id="ville-cible" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Ajouter une ville" className="w-[150px] rounded-full border border-bord-doux bg-fond px-3 py-1 text-[12.5px] text-encre outline-none focus:border-menthe/60" />
          </form>
        </div>
        {suggestions.length > 0 && (
          <p className="m-0 mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-brume">Villes de vos dossiers :
            {suggestions.map((v) => <button key={v} type="button" onClick={() => ajouterVille(v)} className="rounded-full border border-dashed border-bord-doux px-2 py-0.5 text-craie hover:text-encre">+ {v}</button>)}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="text-[12.5px] text-craie">Nouveaux agents par nuit
            <input id="par-nuit" type="number" min={0} max={200} value={r.par_nuit} onChange={(e) => poser("par_nuit", e.target.value)} className={`${champ} mt-1`} />
          </label>
          <label className="text-[12.5px] text-craie">Appels par personne et par jour
            <input id="max-par-personne" type="number" min={5} max={80} value={r.max} onChange={(e) => poser("max", e.target.value)} className={`${champ} mt-1`} />
          </label>
        </div>
      </section>

      <section className="rounded-[16px] border border-trait bg-surface p-6">
        <p className={etiquette}>Qui prospecte</p>
        <p className="m-0 mt-1 text-[13px] text-craie">La liste du jour se partage entre ces personnes, sans qu'un agent soit appelé deux fois. Sans personne cochée, chacun voit une part de la liste sur la page, et personne ne reçoit de message.</p>
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
          {(reglages?.equipe || []).map((u) => (
            <li key={u.email}>
              <label className="flex items-center gap-2 text-[13.5px] text-encre">
                <input id={`prospecteur-${u.email}`} type="checkbox" checked={r.prospecteurs.includes(u.email)} onChange={(e) => poser("prospecteurs", e.target.checked ? [...r.prospecteurs, u.email] : r.prospecteurs.filter((x) => x !== u.email))} className="h-4 w-4" />
                {u.nom} <span className="text-[12px] text-brume">{u.email}</span>
              </label>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-center gap-2 border-t border-trait pt-4 text-[13.5px] text-encre">
          <input id="liste-du-matin" type="checkbox" checked={!!r.matin} onChange={(e) => poser("matin", e.target.checked)} className="h-4 w-4" />
          À 8 h, AK envoie à chacun sa liste en privé dans Google Chat
        </label>
      </section>

      <section className="rounded-[16px] border border-trait bg-surface p-6 lg:col-span-2">
        <p className={etiquette}>Nos critères</p>
        <p className="m-0 mt-1 text-[13px] text-craie">Le texte du mail aux agents intéressés. Écris juste les critères et Klocka les pose dans un mail court ; ou écris le mail entier en commençant par « Bonjour {"{prenom}"} ». {"{agence}"}, {"{ville}"} et {"{signature}"} se remplissent.</p>
        <input id="objet-criteres" value={r.objet_criteres || ""} onChange={(e) => poser("objet_criteres", e.target.value)} placeholder="Objet du mail" className={`${champ} mt-3`} />
        <textarea id="criteres" value={r.criteres || ""} onChange={(e) => poser("criteres", e.target.value)} rows={8}
          placeholder={"- Murs commerciaux loués, de 100 000 à 1 500 000 €\n- Rendement net de 6,5 % minimum\n- Emplacement n°1 ou n°1 bis, centre-ville\n- Bail commercial en cours, locataire en place depuis 3 ans au moins"}
          className={`${champ} mt-2 leading-[1.55]`} />
      </section>

      <div className="flex justify-end lg:col-span-2">
        <button type="button" onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending} className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2.5 text-[14px] font-semibold text-sur-menthe">
          {enregistrer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Prospection() {
  const [onglet, setOnglet] = useState("appels");
  const appels = useQuery({ queryKey: ["prospection-appels"], queryFn: () => base44.request("GET", "/api/prospection/appels"), refetchInterval: 120000 });
  const reglages = useQuery({ queryKey: ["prospection-reglages"], queryFn: () => base44.request("GET", "/api/prospection/reglages") });
  const onglets = useMemo(() => [
    ["appels", "Mes appels", appels.data?.liste?.length],
    ["mails", "Mails prêts", appels.data?.mails_prets],
    ["ajouter", "Ajouter des agents"],
    ["reglages", "Réglages"],
  ], [appels.data]);
  if (appels.isError && /403|réservé/i.test(appels.error?.message || "")) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-8 md:px-6">
      <header className="mb-6">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Prospection</h1>
        <p className="m-0 mt-2 max-w-[64ch] text-[14px] text-craie">
          {appels.data?.jour ? `${jourFr(appels.data.jour).replace(/^./, (c) => c.toUpperCase())}. ` : ""}Tes appels du jour, le statut d'un clic après chaque appel : Monday se met à jour et la prochaine relance se cale toute seule.
        </p>
      </header>
      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Onglets de la prospection">
        {onglets.map(([cle, mot, n]) => (
          <button key={cle} type="button" onClick={() => setOnglet(cle)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${onglet === cle ? "border-menthe bg-menthe font-semibold text-sur-menthe" : "border-bord-doux text-craie hover:text-encre"}`}>
            {mot}{n ? <span className={`tabular-nums ${onglet === cle ? "" : "text-brume"}`}>{n}</span> : null}
          </button>
        ))}
      </nav>
      {onglet === "appels" && <OngletAppels data={appels.data} isLoading={appels.isLoading} />}
      {onglet === "mails" && <OngletMails />}
      {onglet === "ajouter" && <OngletAjouter reglages={reglages.data} />}
      {onglet === "reglages" && <OngletReglages reglages={reglages.data} />}
    </div>
  );
}
