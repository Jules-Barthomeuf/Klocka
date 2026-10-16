import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import FicheContact from "@/components/prospection/FicheContact";

// Les agents (16 oct. 2026, Jules) : tous les agents immobiliers du carnet, en
// cartes comme les Clients, avec leur petite tête. Un clic ouvre tout : la
// fiche (échanges, mails, fiches reçues, parcours, qui de l'équipe leur a
// parlé), puis chaque appel en entier : qui a appelé, l'issue, la
// transcription quand elle a été gardée (depuis le 13 oct.), sinon le résumé.

const STATUTS = { nouveau: "À appeler", a_rappeler: "À rappeler", en_discussion: "En discussion", pas_de_murs: "Pas de murs", envoie_des_fiches: "Envoie des fiches", pause: "En pause", archive: "Archivé" };
const prenom = (email) => { const p = String(email || "").split("@")[0].split(".")[0]; return p ? p.charAt(0).toUpperCase() + p.slice(1) : null; };
const sansAccents = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dateLongue = (iso) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
function depuis(iso) {
  if (!iso) return "Jamais contacté";
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j <= 0) return "Aujourd'hui";
  if (j === 1) return "Hier";
  if (j < 31) return `Il y a ${j} jours`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
const CHAMPS = { interlocuteur: "Interlocuteur", fonction: "Fonction", telephone: "Téléphone", email: "Email", biens: "Biens", mandat: "Mandat à venir", prochaine_etape: "Prochaine étape", date: "Date dite", autre_contact: "Autre contact" };
const champ = (k) => CHAMPS[k] || k;
const duree = (s) => (s ? (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`) : null);

const NB_AVATARS = 24;
const avatarDe = (id) => {
  let h = 0;
  for (const c of String(id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/avatars/client-${String((h % NB_AVATARS) + 1).padStart(2, "0")}.png`;
};
const Avatar = ({ id, taille = "h-[38px] w-[38px]" }) => <img src={avatarDe(id)} alt="" aria-hidden="true" className={`block flex-none rounded-full ${taille}`} />;

function CarteAgent({ a, onOuvrir }) {
  return (
    <article onClick={onOuvrir} className="flex cursor-pointer flex-col gap-4 rounded-[18px] border border-trait bg-rail px-5 pb-5 pt-[18px] transition-colors hover:border-bord-doux">
      <div className="flex items-center gap-3">
        <Avatar id={a.id} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[17px] font-medium text-encre">{a.nom}</span>
          <span className="truncate text-[13px] text-ardoise">{[a.agence !== a.nom ? a.agence : null, a.ville].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5"><span className="text-[12px] text-brume">Dernier contact</span><span className="truncate text-[15px] text-encre">{depuis(a.dernier_contact)}</span></div>
        <div className="flex min-w-0 flex-col gap-0.5"><span className="text-[12px] text-brume">Appels</span><span className="text-[15px] tabular-nums text-encre">{a.appels ? `${a.appels} · ${a.conversations} parlé${a.conversations > 1 ? "s" : ""}` : "—"}</span></div>
      </div>
      {a.resume && <p className="m-0 line-clamp-2 text-[13.5px] leading-[1.5] text-craie">{a.resume}</p>}
      <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-trait pt-3.5 text-[13px]">
        <span className="min-w-0 truncate text-ardoise">{a.appelants.length ? `Appelé par ${a.appelants.map(prenom).join(", ")}` : STATUTS[a.statut] || "Pas encore appelé"}</span>
        <span className="flex-none text-ardoise">Ouvrir →</span>
      </div>
    </article>
  );
}

/** Un appel, déplié : tout ce qui en reste. */
function AppelEntier({ x, ouvert, onBasculer }) {
  return (
    <div className="border-b border-trait py-3">
      <button type="button" onClick={onBasculer} className="flex w-full items-start justify-between gap-3 p-0 text-left" style={{ background: "transparent" }}>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[12.5px] text-ardoise">{dateLongue(x.le)} · {x.entrant ? `${prenom(x.par) || "?"} a reçu son rappel` : `appelé par ${prenom(x.par) || "?"}`}{duree(x.duree_s) ? ` · ${duree(x.duree_s)}` : ""}</span>
          <span className="text-[14.5px] text-encre">{x.issue || "Sans issue"}</span>
          {x.resume && <span className="text-[13.5px] leading-[1.5] text-craie">{x.resume}</span>}
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 flex-none text-brume transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div className="mt-3 flex flex-col gap-2.5 text-[13.5px]">
          {x.passe && <p className="m-0 text-craie"><span className="text-brume">Ce qui s'est passé · </span>{x.passe}</p>}
          {x.pourquoi_relance && <p className="m-0 text-craie"><span className="text-brume">La suite · </span>{x.pourquoi_relance}</p>}
          {Object.keys(x.compris || {}).length > 0 && <p className="m-0 text-craie">{Object.entries(x.compris).map(([k, v]) => <span key={k} className="mr-4 inline-block"><span className="text-brume">{champ(k)} : </span>{String(v)}</span>)}</p>}
          {x.citations.length > 0 && <div className="flex flex-col gap-1">{x.citations.map((c) => <span key={c.cle} className="text-craie"><span className="text-brume">{champ(c.cle)} · </span>« {c.phrase} »</span>)}</div>}
          {x.objection && <p className="m-0 text-ambre">Objection non levée · « {x.objection.phrase} »</p>}
          {x.notes && <p className="m-0 whitespace-pre-line text-craie"><span className="text-brume">Notes · </span>{x.notes}</p>}
          <p className="m-0 text-[11px] tracking-[.16em] text-brume">TRANSCRIPTION</p>
          {x.transcription
            ? <p className="m-0 max-h-[360px] overflow-y-auto whitespace-pre-line rounded-[10px] border border-trait p-3 leading-[1.6] text-craie">{x.transcription}</p>
            : <p className="m-0 text-brume">{x.conversation ? "Pas gardée pour cet appel (elle l'est depuis le 13 octobre) : le résumé ci-dessus fait foi." : "Personne au bout du fil : rien à transcrire."}</p>}
        </div>
      )}
    </div>
  );
}

function TiroirAgent({ id, onFermer }) {
  const { data, isLoading } = useQuery({ queryKey: ["agent-appels", id], queryFn: () => base44.request("GET", `/api/prospection/agents/${id}/appels`) });
  const [ouverts, setOuverts] = useState(() => new Set());
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const appels = data?.appels || [];
  const basculer = (k) => setOuverts((s) => { const t = new Set(s); if (t.has(k)) t.delete(k); else t.add(k); return t; });
  const tout = appels.length > 0 && ouverts.size === appels.length;
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-fond/60 backdrop-blur-[2px]" onClick={onFermer} />
      <aside role="dialog" aria-modal="true" aria-label="Fiche de l'agent" className="absolute inset-y-0 right-0 flex w-[640px] max-w-full flex-col overflow-y-auto border-l border-trait bg-surface-pleine px-7 pb-10 pt-5 animate-in slide-in-from-right duration-200 max-md:px-5">
        <FicheContact depart={{ type: "agent", id }} onFermer={onFermer} />
        <div className="mt-8 flex items-baseline justify-between gap-3">
          <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Tous ses appels{appels.length ? ` · ${appels.length}` : ""}</p>
          {appels.length > 0 && <button type="button" onClick={() => setOuverts(tout ? new Set() : new Set(appels.map((x) => x.id)))} className="p-0 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>{tout ? "Tout replier" : "Tout déplier"}</button>}
        </div>
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
          : !appels.length ? <p className="m-0 mt-2 text-[13.5px] text-brume">Aucun appel encore avec cet agent.</p>
            : <div className="mt-1 border-t border-trait">{appels.map((x) => <AppelEntier key={x.id} x={x} ouvert={ouverts.has(x.id)} onBasculer={() => basculer(x.id)} />)}</div>}
      </aside>
    </div>,
    document.body,
  );
}

const PAR_PAGE = 60;

export default function Agents() {
  const { data, isLoading, error } = useQuery({ queryKey: ["agents-liste"], queryFn: () => base44.request("GET", "/api/prospection/agents-liste") });
  const agents = useMemo(() => data?.agents || [], [data]);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState("contactes");
  const [combien, setCombien] = useState(PAR_PAGE);
  const [ouvert, setOuvert] = useState(() => new URLSearchParams(window.location.search).get("agent"));
  useEffect(() => { setCombien(PAR_PAGE); }, [recherche, filtre]);

  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const lignes = agents
    .filter((a) => filtre === "tous" || (filtre === "contactes" ? a.appels > 0 || a.dernier_contact : a.statut === filtre))
    .filter((a) => !mots.length || mots.every((m) => sansAccents([a.nom, a.agence, a.ville, a.poste, a.telephone, a.email].filter(Boolean).join(" ")).includes(m)));
  const contactes = agents.filter((a) => a.appels > 0 || a.dernier_contact).length;

  if (error) return <div className="p-8"><p className="text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p></div>;
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pb-16 pt-9 md:px-11 max-md:pt-6">
      <header className="flex flex-wrap items-baseline gap-3.5 md:pr-14">
        <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-0.01em] text-encre max-md:text-[26px]">Agents</h1>
        {agents.length > 0 && <span className="text-[15px] text-ardoise">{contactes} contactés · {agents.length} dans le carnet</span>}
      </header>
      <p className="m-0 -mt-3 text-[14px] text-ardoise">Un clic sur un agent : tout ce qui s'est dit avec lui, chaque appel en entier, et qui de l'équipe lui a parlé.</p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:basis-full">
          <Search className="h-4 w-4 flex-none text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, agence, ville, téléphone…"
            className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {[["contactes", "Contactés"], ["envoie_des_fiches", "Envoient des fiches"], ["a_rappeler", "À rappeler"], ["tous", "Tous"]].map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setFiltre(k)}
            className={`h-12 rounded-full border px-[18px] text-[15px] transition-colors max-md:h-10 max-md:px-4 max-md:text-[14px] ${filtre === k ? "border-encre bg-encre text-fond" : "border-trait bg-surface text-craie hover:border-bord-doux"}`}>{mot}</button>
        ))}
      </div>

      {isLoading && <p className="m-0 text-[14px] text-brume">Lecture…</p>}
      {!isLoading && !lignes.length && <p className="m-0 rounded-[18px] border border-dashed border-trait p-12 text-center text-[15px] text-brume">Aucun agent ne correspond.</p>}
      {lignes.length > 0 && (
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {lignes.slice(0, combien).map((a) => <CarteAgent key={a.id} a={a} onOuvrir={() => setOuvert(a.id)} />)}
        </div>
      )}
      {lignes.length > combien && (
        <button type="button" onClick={() => setCombien((n) => n + PAR_PAGE)} className="h-11 self-center rounded-full border border-trait px-6 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
          Afficher {Math.min(PAR_PAGE, lignes.length - combien)} de plus · {lignes.length - combien} restants
        </button>
      )}
      {ouvert && <TiroirAgent id={ouvert} onFermer={() => setOuvert(null)} />}
    </div>
  );
}
