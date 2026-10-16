import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Mic, Plus, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import AppelClient from "@/components/clients/AppelClient";
import Chargement from "@/components/ui/Chargement";

// Les clients, côté équipe (16 oct. 2026, Jules) : la page Clients des
// mandataires, mais avec les vrais noms, et une fiche très personnelle nourrie
// par les appels. On ouvre un client, on clique « Enregistrer l'appel » (ou on
// colle le résumé) : la fiche, Monday et le réseau des mandataires se
// remplissent. Les comptes de la plateforme sont dans Utilisateurs.

const kEuros = (n) => (n == null ? null : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const zonesDe = (d) => (d.zones?.length ? d.zones.join(", ") : "Toute la France");
const typeDe = (d) => (d.type_commerce ? d.type_commerce.charAt(0).toUpperCase() + d.type_commerce.slice(1) : "Tout commerce");
const budgetDe = (d) => kEuros(d.budget) || (d.budget_min && d.budget_max ? `${Math.round(d.budget_min / 1000)} – ${kEuros(d.budget_max)}` : kEuros(d.budget_max || d.budget_min)) || "—";
const rendementDe = (d) => (d.rendement_min ? `${String(d.rendement_min).replace(".", ",")} %` : "—");
const quand = (iso, mois = "short") => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: mois, year: mois === "long" ? "numeric" : undefined }) : null);
const sansAccents = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const NB_AVATARS = 24;
const avatarDe = (d) => {
  let h = 0;
  for (const c of String(d.id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `/avatars/client-${String((h % NB_AVATARS) + 1).padStart(2, "0")}.png`;
};
const Avatar = ({ d, taille = "h-[38px] w-[38px]" }) => <img src={avatarDe(d)} alt="" aria-hidden="true" className={`block flex-none rounded-full ${taille}`} />;

function PastilleReseau({ d }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: !d.active ? J["brume"] : d.visible ? J["menthe"] : J["ambre"] }} />
      {!d.active ? "Plus en recherche" : d.visible ? "Vu du réseau" : "Caché du réseau"}
    </span>
  );
}

const Critere = ({ mot, valeur, large = false }) => (
  <div className={`flex min-w-0 flex-col gap-0.5 ${large ? "col-span-2" : ""}`}>
    <span className="text-[12px] text-brume">{mot}</span>
    <span className={`${large ? "text-[14px] leading-[1.45]" : "text-[15px] tabular-nums"} text-encre`}>{valeur}</span>
  </div>
);

function CarteClient({ d, onOuvrir }) {
  return (
    <article onClick={onOuvrir} className="flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-trait bg-rail transition-colors hover:border-bord-doux">
      <div className="k-grid k-grid-toujours relative h-24 flex-none border-b border-trait">
        <span className="absolute left-4 top-4"><PastilleReseau d={d} /></span>
        {quand(d.entre_le) && <span className="absolute right-4 top-[18px] text-[12px] text-brume">Depuis le {quand(d.entre_le)}</span>}
        <span className="absolute bottom-3.5 left-4 rounded-full border border-trait bg-fond px-2.5 py-1 text-[12px] text-craie">{typeDe(d)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-[18px]">
        <div className="flex items-center gap-3">
          <Avatar d={d} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[17px] font-medium text-encre">{d.nom}</span>
            <span className="truncate text-[13px] text-ardoise">{[d.profil, d.objectif].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-3">
          <Critere mot="Budget" valeur={budgetDe(d)} />
          <Critere mot="Apport" valeur={kEuros(d.apport) || "—"} />
          <Critere mot="Zones" valeur={zonesDe(d)} large />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-trait pt-3.5 text-[13px]">
          <span className="min-w-0 truncate text-ardoise">{d.prochaine_etape?.texte ? <><span className="text-menthe">Ensuite · </span>{d.prochaine_etape.texte}</> : d.appels ? `${d.appels} appel${d.appels > 1 ? "s" : ""} · dernier le ${quand(d.dernier_appel)}` : "Aucun appel enregistré"}</span>
          <span className="flex-none text-ardoise">Ouvrir →</span>
        </div>
      </div>
    </article>
  );
}

const COLONNES = "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_120px_110px_minmax(0,1.6fr)_120px]";

function TableauClients({ lignes, onOuvrir }) {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-trait bg-rail">
      <div className="min-w-[1000px]">
        <div className={`grid ${COLONNES} gap-[18px] border-b border-trait px-6 py-3.5 text-[12px] tracking-[0.12em] text-brume`}>
          <span>CLIENT</span><span>TYPE DE BIEN</span><span>ZONES</span><span>BUDGET</span><span>APPELS</span><span>PROCHAINE ÉTAPE</span><span>RÉSEAU</span>
        </div>
        {lignes.map((d) => (
          <div key={d.id} onClick={() => onOuvrir(d.id)} className={`grid ${COLONNES} cursor-pointer items-center gap-[18px] border-b border-trait px-6 py-4 last:border-b-0 hover:bg-surface`}>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar d={d} taille="h-[34px] w-[34px]" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium text-encre">{d.nom}</span>
                <span className="truncate text-[13px] text-ardoise">{d.email || d.telephone || d.profil}</span>
              </div>
            </div>
            <span className="text-[14px] text-encre">{typeDe(d)}</span>
            <span className="text-[14px] text-craie">{zonesDe(d)}</span>
            <span className="text-[14px] tabular-nums text-encre">{budgetDe(d)}</span>
            <span className="text-[14px] tabular-nums text-craie">{d.appels || "—"}</span>
            <span className="truncate text-[13px] text-ardoise">{d.prochaine_etape?.texte || "—"}</span>
            <span className="text-[13px] text-ardoise">{!d.active ? "Plus en recherche" : d.visible ? "Visible" : "Caché"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Ligne = ({ mot, children }) => (
  <div className="grid grid-cols-[150px_1fr] gap-4 border-b border-trait py-3 max-md:grid-cols-[112px_1fr] max-md:gap-3">
    <span className="text-[13px] text-ardoise">{mot}</span>
    <span className="text-[14px] leading-[1.5] text-encre">{children}</span>
  </div>
);
const Titre = ({ children }) => <p className="m-0 pb-1.5 text-[12px] tracking-[0.14em] text-ardoise">{children}</p>;
const Puces = ({ items }) => <span className="flex flex-col gap-1">{items.map((x) => <span key={x}>{x}</span>)}</span>;

/** La fiche d'un client, à droite : tout ce qu'on sait de lui, ses appels, ce qu'en voient les mandataires. */
function FicheClient({ id, onFermer, onAppel }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["client-equipe", id], queryFn: () => base44.request("GET", `/api/clients-equipe/${id}`) });
  const [ouvert, setOuvert] = useState(null);
  const retoucher = useMutation({
    mutationFn: (champs) => base44.request("PATCH", `/api/clients-equipe/${id}`, { body: champs }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["client-equipe"] }); queryClient.invalidateQueries({ queryKey: ["clients-equipe"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const d = data?.client;
  const f = d?.fiche || {};
  const v = d?.vu_des_mandataires;
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-fond/60 backdrop-blur-[2px]" onClick={onFermer} />
      <aside role="dialog" aria-modal="true" aria-label={d?.nom || "Client"}
        className="absolute inset-y-0 right-0 flex w-[600px] max-w-full flex-col overflow-y-auto border-l border-trait bg-surface-pleine animate-in slide-in-from-right duration-200">
        {isLoading || !d ? <Chargement taille="grand" /> : <>
          <div className="flex flex-col gap-4 border-b border-trait px-7 pb-5 pt-7 max-md:px-5 max-md:pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3.5">
                <Avatar d={d} taille="h-12 w-12" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[22px] font-medium text-encre max-md:text-[20px]">{d.nom}</span>
                  <span className="text-[13px] text-ardoise">{[d.email, d.telephone, quand(d.entre_le, "long") ? `client depuis le ${quand(d.entre_le, "long")}` : null].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[10px] text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={() => onAppel(d, "enregistrer")} className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol"><Mic className="h-4 w-4" />Enregistrer l'appel</button>
              <button type="button" onClick={() => onAppel(d, "coller")} className="h-11 rounded-full border border-trait px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Coller un résumé</button>
            </div>
          </div>

          {d.prochaine_etape?.texte && (
            <div className="mx-7 mt-5 rounded-[12px] border border-menthe/40 px-4 py-3 max-md:mx-5">
              <p className="m-0 text-[12px] tracking-[0.14em] text-menthe">PROCHAINE ÉTAPE</p>
              <p className="m-0 mt-1 text-[14.5px] text-encre">{d.prochaine_etape.texte}{d.prochaine_etape.date_dite ? <span className="text-ardoise"> · {d.prochaine_etape.date_dite}</span> : null}</p>
            </div>
          )}

          <div className="flex flex-col px-7 py-5 max-md:px-5">
            <Titre>CE QU'IL CHERCHE</Titre>
            <Ligne mot="Type de bien">{typeDe(d)}</Ligne>
            <Ligne mot="Zones">{zonesDe(d)}</Ligne>
            <Ligne mot="Budget">{budgetDe(d)}</Ligne>
            <Ligne mot="Apport">{kEuros(d.apport) || "—"}</Ligne>
            <Ligne mot="Rendement minimum">{rendementDe(d)}</Ligne>
            <Ligne mot="Bail">{d.bail || "—"}</Ligne>
            {d.objectif && <Ligne mot="Objectif">{d.objectif}</Ligne>}
          </div>

          <div className="flex flex-col px-7 pb-5 max-md:px-5">
            <Titre>CE QU'ON SAIT DE LUI</Titre>
            {f.motivation && <Ligne mot="Pourquoi il investit">{f.motivation}</Ligne>}
            {f.situation && <Ligne mot="Situation">{f.situation}</Ligne>}
            {(d.fonction || d.localisation) && <Ligne mot="Métier, ville">{[d.fonction, d.localisation].filter(Boolean).join(" · ")}</Ligne>}
            {d.revenu && <Ligne mot="Revenus">{kEuros(d.revenu)} par an</Ligne>}
            {d.patrimoine && <Ligne mot="Patrimoine">{d.patrimoine}</Ligne>}
            {f.horizon && <Ligne mot="Quand">{f.horizon}</Ligne>}
            {f.financement && <Ligne mot="Financement">{f.financement}</Ligne>}
            {f.preferences?.length > 0 && <Ligne mot="Il aime"><Puces items={f.preferences} /></Ligne>}
            {f.exclusions?.length > 0 && <Ligne mot="Il refuse"><Puces items={f.exclusions} /></Ligne>}
            {f.points_attention?.length > 0 && <Ligne mot="Attention à"><Puces items={f.points_attention} /></Ligne>}
            {f.questions_ouvertes?.length > 0 && <Ligne mot="À lui demander"><Puces items={f.questions_ouvertes} /></Ligne>}
            {!f.motivation && !f.situation && !f.preferences?.length && !f.exclusions?.length && <p className="m-0 py-2 text-[13.5px] text-brume">Rien encore : enregistrez le prochain appel, la fiche se remplit.</p>}
          </div>

          <div className="flex flex-col gap-2 px-7 pb-5 max-md:px-5">
            <Titre>CE QUE VOIENT LES MANDATAIRES</Titre>
            <label className="flex cursor-pointer items-center gap-3 text-[14px] text-encre">
              <input type="checkbox" checked={d.visible} onChange={(e) => retoucher.mutate({ visible: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--k-menthe-rgb))]" />
              Montrer sa recherche au réseau, sans son nom
            </label>
            {d.visible && v && <p className="m-0 rounded-[12px] border border-trait px-4 py-3 text-[13.5px] leading-[1.55] text-craie">
              <span className="text-encre">Client {v.reference}</span> · {v.profil} · {typeDe(v)} · {zonesDe(v)} · {budgetDe({ budget_min: v.budget_min, budget_max: v.budget_max })}{v.information ? <><br />{v.information}</> : null}
            </p>}
          </div>

          <div className="flex flex-col px-7 pb-8 max-md:px-5">
            <Titre>APPELS</Titre>
            {!d.historique.length && <p className="m-0 py-2 text-[13.5px] text-brume">Aucun appel enregistré pour l'instant.</p>}
            {d.historique.map((a) => (
              <div key={a.id} className="border-b border-trait py-3">
                <button type="button" onClick={() => setOuvert(ouvert === a.id ? null : a.id)} className="flex w-full items-start justify-between gap-3 p-0 text-left" style={{ background: "transparent" }}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[13px] text-ardoise">{quand(a.le, "long")} · {String(a.par || "").split("@")[0]} · {a.source === "enregistre" ? "enregistré" : "résumé collé"}{a.annule_le ? <span className="text-ambre"> · annulé</span> : null}</span>
                    <span className={`text-[14px] leading-[1.5] ${a.annule_le ? "text-brume line-through" : "text-encre"}`}>{a.resume || "—"}</span>
                  </span>
                  <ChevronDown className={`mt-1 h-4 w-4 flex-none text-brume transition-transform ${ouvert === a.id ? "rotate-180" : ""}`} />
                </button>
                {ouvert === a.id && (
                  <div className="mt-2 flex flex-col gap-2 text-[13px] text-ardoise">
                    {a.monday && <span>Monday : {a.monday}</span>}
                    {a.contenu && <p className="m-0 max-h-[280px] overflow-y-auto whitespace-pre-line rounded-[10px] border border-trait p-3 text-craie">{a.contenu}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>}
      </aside>
    </div>,
    document.body,
  );
}

function NouveauClient({ onFermer, onCree }) {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");
  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/clients-equipe", { body: { nom, email, telephone } }),
    onSuccess: (r) => { if (r.deja) toast(`${r.client.client_nom} existe déjà : sa fiche s'ouvre`); onCree(r.client.id); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const champ = "h-11 w-full rounded-[12px] border border-trait bg-transparent px-4 text-[14.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
  return createPortal(
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <div className="absolute inset-0 bg-fond/70 backdrop-blur-[2px]" onClick={onFermer} />
      <form onSubmit={(e) => { e.preventDefault(); creer.mutate(); }} className="relative flex w-[440px] max-w-full flex-col gap-3 rounded-[18px] border border-trait bg-surface-pleine p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <span className="text-[11px] tracking-[.16em] text-brume">NOUVEAU CLIENT</span>
        <input autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Prénom et nom" className={champ} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (facultatif)" className={champ} />
        <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone (facultatif)" className={champ} />
        <div className="mt-1 flex gap-2.5">
          <button type="submit" disabled={!nom.trim() || creer.isPending} className="h-11 rounded-full bg-menthe px-6 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">Créer la fiche</button>
          <button type="button" onClick={onFermer} className="h-11 rounded-full border border-trait px-5 text-[14px] text-craie hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export default function AdminClients() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["clients-equipe"], queryFn: () => base44.request("GET", "/api/clients-equipe") });
  const clients = useMemo(() => data?.clients || [], [data]);
  const [vue, setVue] = useState(() => { try { return localStorage.getItem("k-clients-equipe-vue") || "cartes"; } catch { return "cartes"; } });
  const changerVue = (v) => { setVue(v); try { localStorage.setItem("k-clients-equipe-vue", v); } catch { /* sans stockage */ } };
  const [recherche, setRecherche] = useState("");
  const [tous, setTous] = useState(false);
  const [ouvert, setOuvert] = useState(null);
  const [appel, setAppel] = useState(null); // { client, mode }
  const [nouveau, setNouveau] = useState(false);

  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const lignes = clients
    .filter((d) => tous || d.active)
    .filter((d) => !mots.length || mots.every((m) => sansAccents([d.nom, d.email, d.telephone, d.type_commerce, zonesDe(d), d.profil, d.objectif].filter(Boolean).join(" ")).includes(m)));
  const actifs = clients.filter((d) => d.active).length;
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["clients-equipe"] }); queryClient.invalidateQueries({ queryKey: ["client-equipe"] }); };

  if (error) return <div className="p-8"><p className="text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p></div>;
  return (
    <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-5 pb-16 pt-9 md:px-11 max-md:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-4 md:pr-14">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="m-0 text-[34px] font-medium leading-[1.05] tracking-[-0.01em] text-encre max-md:text-[26px]">Clients</h1>
          {clients.length > 0 && <span className="text-[15px] text-ardoise">{actifs} en recherche · {clients.length} en tout</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => setAppel({ client: null, mode: "enregistrer" })} className="inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol"><Mic className="h-4 w-4" />Enregistrer un appel</button>
          <button type="button" onClick={() => setNouveau(true)} className="inline-flex h-11 items-center gap-1.5 rounded-full border border-trait px-4 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}><Plus className="h-4 w-4" />Nouveau client</button>
          <div className="flex gap-0.5 rounded-full bg-rail-actif p-1" role="tablist" aria-label="Affichage">
            {[["cartes", "Cartes"], ["tableau", "Tableau"]].map(([cle, mot]) => (
              <button key={cle} type="button" role="tab" aria-selected={vue === cle} onClick={() => changerVue(cle)}
                className={`rounded-full px-4 py-[9px] text-[14px] ${vue === cle ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`} style={vue === cle ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
        </div>
      </header>

      <p className="m-0 -mt-3 text-[14px] text-ardoise">Ouvrez un client et enregistrez l'appel (ou collez son résumé) : sa fiche, Monday et ce que voient les mandataires se remplissent.</p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 min-w-[240px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-5 focus-within:border-bord-doux max-md:basis-full">
          <Search className="h-4 w-4 flex-none text-ardoise" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, ville, type de bien…"
            className="w-full border-none bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {[[false, "En recherche"], [true, "Tous"]].map(([t, mot]) => (
          <button key={mot} type="button" onClick={() => setTous(t)}
            className={`h-12 rounded-full border px-[18px] text-[15px] transition-colors max-md:h-10 max-md:px-4 max-md:text-[14px] ${tous === t ? "border-encre bg-encre text-fond" : "border-trait bg-surface text-craie hover:border-bord-doux"}`}>{mot}</button>
        ))}
      </div>

      {isLoading && <Chargement taille="grand" />}
      {!isLoading && !clients.length && <p className="m-0 text-[14px] text-brume">Aucun client encore. Enregistrez un appel : le client naît de ce qu'il dit.</p>}
      {!isLoading && clients.length > 0 && !lignes.length && <p className="m-0 rounded-[18px] border border-dashed border-trait p-12 text-center text-[15px] text-brume">Aucun client ne correspond.</p>}
      {lignes.length > 0 && vue === "cartes" && <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">{lignes.map((x) => <CarteClient key={x.id} d={x} onOuvrir={() => setOuvert(x.id)} />)}</div>}
      {lignes.length > 0 && vue === "tableau" && <TableauClients lignes={lignes} onOuvrir={setOuvert} />}

      {ouvert && <FicheClient id={ouvert} onFermer={() => setOuvert(null)} onAppel={(client, mode) => setAppel({ client, mode })} />}
      {appel && <AppelClient client={appel.client} mode={appel.mode} onFermer={() => setAppel(null)}
        onFait={(r) => { rafraichir(); if (r?.client?.id && !appel.client) setOuvert(r.client.id); }} />}
      {nouveau && <NouveauClient onFermer={() => setNouveau(false)} onCree={(id) => { setNouveau(false); rafraichir(); setOuvert(id); }} />}
    </div>
  );
}
