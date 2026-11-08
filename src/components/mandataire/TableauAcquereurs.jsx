import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CalendarPlus, ChevronDown, Copy, Link2, Loader2, Mail, MessageCircle, PenLine, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Panneau } from "@/components/mandataire/Visites";
import { euros } from "@/components/mandataire/kit";

// Le tableau des acquéreurs d'un bien en vente (7 nov. 2026, Jules : « fais comme dans un tableau Monday »). Un groupe
// par étape (contact, qualifié, visite, offre, signé, écarté), sa couleur en filet à gauche et en titre ; une ligne par
// personne, chaque cellule corrigée sur place ; le statut en case pleine colorée, changé d'un clic ; la visite et son bon
// (à signer sur place ou à distance par un lien) ; l'offre ; la prochaine action. En location : des candidats.
// Le serveur : server/acquereurs-du-bien.js. Le chat remplit les mêmes lignes (noter_acquereur).

// La couleur de chaque groupe, écrite en entier pour Tailwind : une couleur, un sens (jetons « statuts »).
const TEINTES = {
  contact: { case: "bg-statut-gris-fond text-statut-gris", filet: "bg-statut-gris", titre: "text-statut-gris" },
  qualifie: { case: "bg-statut-bleu-fond text-statut-bleu", filet: "bg-statut-bleu", titre: "text-statut-bleu" },
  visite: { case: "bg-statut-lavande-fond text-statut-lavande", filet: "bg-statut-lavande", titre: "text-statut-lavande" },
  offre: { case: "bg-statut-ambre-fond text-statut-ambre", filet: "bg-statut-ambre", titre: "text-statut-ambre" },
  signe: { case: "bg-statut-menthe-fond text-statut-menthe", filet: "bg-statut-menthe", titre: "text-statut-menthe" },
  ecarte: { case: "bg-statut-corail-fond text-statut-corail", filet: "bg-statut-corail", titre: "text-statut-corail" },
};
const BON = { signe: ["text-statut-menthe", "Bon signé"], a_signer: ["text-statut-ambre", "Bon à signer"], manquant: ["text-alerte", "Sans bon"] };
// Les largeurs en pixels, les mêmes pour chaque groupe : les colonnes s'alignent d'un groupe à l'autre, comme Monday.
const COLONNES = [
  ["nom", "Nom", 230], ["statut", "Statut", 150], ["telephone", "Téléphone", 140], ["source", "Source", 120],
  ["projet", "Projet", 210], ["budget", "Budget", 110], ["visite", "Visite et bon", 210], ["offre", "Offre", 110],
  ["prochaine", "Prochaine action", 210], ["prochaine_le", "Pour le", 130], ["note", "Notes", 240],
];
const LARGEUR = COLONNES.reduce((n, [, , l]) => n + l, 0);
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : "");
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const cellule = "h-10 border-b border-r border-bord-doux px-3 text-[13.5px]";
const saisie = "h-full w-full min-w-0 border-0 bg-transparent p-0 text-[13.5px] text-encre outline-none placeholder:text-brume focus:ring-0 max-md:text-[16px]";

/** Une cellule de texte, corrigée sur place : Entrée ou la sortie du champ enregistre, Échap annule. */
function Texte({ valeur, onGarder, placeholder = "", type = "text", format = null }) {
  const [v, setV] = useState(valeur ?? "");
  const [edition, setEdition] = useState(false);
  useEffect(() => { if (!edition) setV(valeur ?? ""); }, [valeur, edition]);
  if (!edition && format && valeur) return <button type="button" onClick={() => setEdition(true)} className="h-full w-full truncate text-left tabular-nums text-encre" style={{ background: "transparent" }}>{format(valeur)}</button>;
  return (
    <input value={v} type={type} placeholder={placeholder} onFocus={() => setEdition(true)} autoFocus={edition && !!format}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(valeur ?? ""); setEdition(false); e.currentTarget.blur(); } }}
      onBlur={() => { setEdition(false); if (String(v).trim() !== String(valeur ?? "")) onGarder(String(v).trim() || null); }}
      className={`${saisie} ${type === "date" ? "tabular-nums" : ""}`} />
  );
}

/** Un petit menu sous une cellule. */
function Menu({ ancre, onFermer, children, largeur = 200 }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    const r = ancre?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - largeur - 12) });
    const fermer = (e) => { if (!e.target.closest?.("[data-menu-acquereurs]")) onFermer(); };
    const echap = (e) => e.key === "Escape" && onFermer();
    setTimeout(() => document.addEventListener("pointerdown", fermer), 0);
    window.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", fermer); window.removeEventListener("keydown", echap); };
  }, [ancre, onFermer, largeur]);
  if (!pos) return null;
  return createPortal(
    <div data-menu-acquereurs="" className="fixed z-[96] overflow-hidden rounded-[12px] border border-bord-doux bg-surface-pleine p-1 shadow-[0_14px_36px_rgb(0_0_0/0.3)]" style={{ top: pos.top, left: pos.left, width: largeur }}>{children}</div>,
    document.body,
  );
}

/** Le statut : une case pleine de sa couleur ; un clic ouvre les six choix. */
function CaseStatut({ statut, statuts, onChoisir }) {
  const ref = useRef(null);
  const [ouvert, setOuvert] = useState(false);
  const mot = statuts.find((s) => s.cle === statut)?.mot || statut;
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOuvert((o) => !o)} className={`flex h-full w-full items-center justify-center truncate px-2 text-[13px] ${TEINTES[statut]?.case || ""}`}>{mot}</button>
      {ouvert && (
        <Menu ancre={ref.current} onFermer={() => setOuvert(false)} largeur={180}>
          {statuts.map((s) => (
            <button key={s.cle} type="button" onClick={() => { setOuvert(false); if (s.cle !== statut) onChoisir(s.cle); }}
              className={`mb-1 flex h-8 w-full items-center justify-center rounded-[8px] text-[13px] last:mb-0 ${TEINTES[s.cle].case}`}>{s.mot}</button>
          ))}
        </Menu>
      )}
    </>
  );
}

/** La source : un choix parmi les canaux, ou rien. */
function CaseSource({ source, sources, onChoisir }) {
  const ref = useRef(null);
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOuvert((o) => !o)} className={`h-full w-full truncate text-left ${source ? "text-encre" : "text-brume"}`} style={{ background: "transparent" }}>{source || "Choisir"}</button>
      {ouvert && (
        <Menu ancre={ref.current} onFermer={() => setOuvert(false)} largeur={170}>
          {sources.map((s) => (
            <button key={s} type="button" onClick={() => { setOuvert(false); onChoisir(s === source ? null : s); }}
              className={`flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] hover:bg-rail-actif ${s === source ? "text-encre" : "text-craie"}`} style={{ background: "transparent" }}>{s}</button>
          ))}
        </Menu>
      )}
    </>
  );
}

/** Le lien à envoyer au visiteur pour qu'il signe le bon sur son téléphone. */
export function LienASigner({ visiteId, onFermer }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["m-lien-bon", visiteId], queryFn: () => base44.request("POST", `/api/mandataire/visites/${visiteId}/lien`, { body: {} }), staleTime: Infinity, retry: false });
  const copier = async () => { try { await navigator.clipboard.writeText(data.message); toast.success("Message copié"); } catch { toast.error("Copie impossible"); } };
  const tel = String(data?.telephone || "").replace(/[^\d+]/g, "");
  const bouton = "inline-flex h-9 items-center gap-2 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre";
  return (
    <Panneau titre="Faire signer le bon à distance" sous="Le visiteur ouvre le lien sur son téléphone, lit le bon, écrit son nom et signe au doigt. Vous êtes prévenu dès qu'il a signé." onFermer={onFermer}>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-menthe" /> : isError ? <p className="m-0 text-[13.5px] text-alerte">{error?.message || "Le lien ne se prépare pas."}</p> : (
        <>
          <p className="m-0 whitespace-pre-line rounded-[12px] bg-rail-actif px-4 py-3 text-[13.5px] leading-[1.6] text-craie">{data.message}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={copier} className={bouton} style={{ background: "transparent" }}><Copy className="h-4 w-4" />Copier</button>
            <a href={`sms:${tel}?&body=${encodeURIComponent(data.message)}`} className={bouton}><MessageCircle className="h-4 w-4" />SMS</a>
            <a href={`https://wa.me/${tel.replace(/^0/, "33").replace(/^\+/, "")}?text=${encodeURIComponent(data.message)}`} target="_blank" rel="noreferrer" className={bouton}><MessageCircle className="h-4 w-4" />WhatsApp</a>
            <a href={`mailto:${data.email || ""}?subject=${encodeURIComponent("Bon de visite à signer")}&body=${encodeURIComponent(data.message)}`} className={bouton}><Mail className="h-4 w-4" />Mail</a>
          </div>
        </>
      )}
    </Panneau>
  );
}

/** La visite d'une ligne : la planifier, puis son bon (signé, à signer sur place ou à distance). */
function CaseVisite({ ligne, onPlanifier }) {
  const ref = useRef(null);
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState("");
  const [lien, setLien] = useState(false);
  const [, setParams] = useSearchParams();
  const v = ligne.visite;
  const ouvrirVisite = () => setParams((p) => { const n = new URLSearchParams(p); n.set("visite", v.id); return n; }, { replace: true });
  if (!v) {
    return (
      <>
        <button ref={ref} type="button" onClick={() => setOuvert(true)} className="inline-flex h-full items-center gap-1.5 text-brume hover:text-encre" style={{ background: "transparent" }}><CalendarPlus className="h-3.5 w-3.5" />Planifier</button>
        {ouvert && (
          <Menu ancre={ref.current} onFermer={() => setOuvert(false)} largeur={240}>
            <div className="p-2">
              <label className="block text-[12px] text-ardoise">Date et heure de la visite</label>
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-9 w-full rounded-[8px] border border-trait bg-transparent px-2 text-[13px] text-encre outline-none focus:border-menthe" />
              <button type="button" disabled={!date} onClick={() => { setOuvert(false); onPlanifier(new Date(date).toISOString()); }}
                className="mt-2 h-8 w-full rounded-full bg-menthe text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Créer la visite et son bon</button>
            </div>
          </Menu>
        )}
      </>
    );
  }
  const [couleur, mot] = BON[v.bon] || BON.a_signer;
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOuvert(true)} className="flex h-full w-full items-center gap-2 truncate text-left" style={{ background: "transparent" }}>
        <span className="tabular-nums text-encre">{quand(v.quand)}</span><span className={`truncate text-[12.5px] ${couleur}`}>{mot}</span>
      </button>
      {ouvert && (
        <Menu ancre={ref.current} onFermer={() => setOuvert(false)} largeur={230}>
          {v.bon !== "signe" && (
            <>
              <button type="button" onClick={() => { setOuvert(false); setLien(true); }} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-craie hover:bg-rail-actif" style={{ background: "transparent" }}><Link2 className="h-4 w-4" />Lien à signer à distance</button>
              <button type="button" onClick={() => { setOuvert(false); ouvrirVisite(); }} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-craie hover:bg-rail-actif" style={{ background: "transparent" }}><PenLine className="h-4 w-4" />Signer sur place</button>
            </>
          )}
          <button type="button" onClick={() => { setOuvert(false); ouvrirVisite(); }} className="flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] text-craie hover:bg-rail-actif" style={{ background: "transparent" }}>Ouvrir la visite{v.bon === "signe" ? " et le bon" : ""}</button>
        </Menu>
      )}
      {lien && <LienASigner visiteId={v.id} onFermer={() => setLien(false)} />}
    </>
  );
}

/** Une ligne du tableau. */
function Ligne({ l, statuts, sources, teinte, garder, retirer, planifier }) {
  const g = (champ) => (x) => garder.mutate({ id: l.id, corps: { [champ]: x } });
  return (
    <tr className="group">
      <td className={`${cellule} relative pl-4 text-encre`}>
        <span className={`absolute inset-y-0 left-0 w-1 ${teinte.filet}`} />
        <div className="flex h-full items-center gap-2">
          <Texte valeur={l.nom} onGarder={g("nom")} placeholder="Nom" />
          <button type="button" onClick={() => { if (window.confirm(`Retirer « ${l.nom} » du tableau ? Le contact reste dans votre carnet.`)) retirer.mutate(l.id); }} aria-label={`Retirer ${l.nom}`}
            className="flex-none text-brume opacity-0 hover:text-alerte group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </td>
      <td className={`${cellule} !p-0`}><CaseStatut statut={l.statut} statuts={statuts} onChoisir={g("statut")} /></td>
      <td className={cellule}><Texte valeur={l.telephone} onGarder={g("telephone")} placeholder="" /></td>
      <td className={cellule}><CaseSource source={l.source} sources={sources} onChoisir={g("source")} /></td>
      <td className={cellule}><Texte valeur={l.projet} onGarder={g("projet")} placeholder="" /></td>
      <td className={cellule}><Texte valeur={l.budget} onGarder={g("budget")} placeholder="" format={euros} /></td>
      <td className={cellule}><CaseVisite ligne={l} onPlanifier={(q) => planifier.mutate({ id: l.id, quand: q })} /></td>
      <td className={cellule}><Texte valeur={l.offre} onGarder={g("offre")} placeholder="" format={euros} /></td>
      <td className={cellule}><Texte valeur={l.prochaine} onGarder={g("prochaine")} placeholder="" /></td>
      <td className={cellule}><Texte valeur={l.prochaine_le ? l.prochaine_le.slice(0, 10) : ""} type="date" onGarder={g("prochaine_le")} /></td>
      <td className={cellule}><Texte valeur={l.note} onGarder={g("note")} placeholder="" /></td>
    </tr>
  );
}

/** Un groupe : son titre coloré, ses lignes, et « + Ajouter » au bas. */
function Groupe({ s, lignes, statuts, sources, ajouter, ...actions }) {
  const [ouvert, setOuvert] = useState(s.cle !== "ecarte");
  const [nom, setNom] = useState("");
  const teinte = TEINTES[s.cle];
  const valider = () => { const n = nom.trim(); if (!n) return; setNom(""); ajouter.mutate({ nom: n, statut: s.cle }); };
  return (
    <section className="mb-7">
      <button type="button" onClick={() => setOuvert((o) => !o)} className={`mb-2 inline-flex items-center gap-1.5 text-[15px] ${teinte.titre}`} style={{ background: "transparent" }}>
        <ChevronDown className={`h-4 w-4 transition-transform ${ouvert ? "" : "-rotate-90"}`} />{s.mot}<span className="text-[12.5px] text-brume">{lignes.length ? ` · ${lignes.length}` : ""}</span>
      </button>
      {ouvert && (
        <div className="w-fit max-w-full overflow-x-auto rounded-[10px] border-l border-t border-bord-doux">
          <table className="table-fixed border-separate border-spacing-0" style={{ width: LARGEUR }}>
            <colgroup>{COLONNES.map(([k, , l]) => <col key={k} style={{ width: l }} />)}</colgroup>
            {/* Un groupe vide ne montre que « Ajouter » : les titres de colonnes viennent avec la première ligne. */}
            {lignes.length > 0 && (
              <thead>
                <tr>{COLONNES.map(([k, mot]) => <th key={k} className={`${cellule} h-9 bg-rail text-left text-[12px] font-normal text-ardoise ${k === "statut" ? "text-center" : ""}`}>{mot}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {lignes.map((l) => <Ligne key={l.id} l={l} statuts={statuts} sources={sources} teinte={teinte} {...actions} />)}
              <tr>
                <td className={`${cellule} relative pl-4`} colSpan={COLONNES.length}>
                  <span className={`absolute inset-y-0 left-0 w-1 opacity-40 ${teinte.filet}`} />
                  <div className="flex h-full items-center gap-2">
                    <Plus className="h-3.5 w-3.5 flex-none text-brume" />
                    <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valider()} onBlur={valider}
                      placeholder={`Ajouter ${s.cle === "contact" ? "un contact" : "une ligne"}`} className={saisie} />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function TableauAcquereurs({ marcheId }) {
  const qc = useQueryClient();
  const cle = ["m-acquereurs", marcheId];
  const url = `/api/mandataire/marches/${encodeURIComponent(marcheId)}/acquereurs`;
  const { data, isLoading, isError } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", url) });
  const relire = () => { qc.invalidateQueries({ queryKey: cle }); qc.invalidateQueries({ queryKey: ["m-visites"] }); };
  const poser = (ligne) => qc.setQueryData(cle, (d) => (d ? { ...d, lignes: d.lignes.map((x) => (x.id === ligne.id ? { ...ligne, visite: ligne.visite || x.visite } : x)) } : d));
  const erreur = (e) => toast.error(e?.message || "Non enregistré");
  const garder = useMutation({ mutationFn: ({ id, corps }) => base44.request("PATCH", `/api/mandataire/acquereurs/${id}`, { body: corps }), onSuccess: (r) => poser(r.ligne), onError: erreur });
  const ajouter = useMutation({ mutationFn: (corps) => base44.request("POST", url, { body: corps }), onSuccess: relire, onError: erreur });
  const retirer = useMutation({ mutationFn: (id) => base44.request("DELETE", `/api/mandataire/pistes/${id}`), onSuccess: relire, onError: erreur });
  const planifier = useMutation({ mutationFn: ({ id, quand: q }) => base44.request("POST", `/api/mandataire/acquereurs/${id}/visite`, { body: { quand: q } }), onSuccess: () => { relire(); toast.success("Visite créée, son bon est prêt à signer"); }, onError: erreur });

  if (isLoading) return <p className="m-0 flex items-center gap-2 py-8 text-[14px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Le tableau se charge…</p>;
  if (isError || !data) return <p className="m-0 py-8 text-[14px] text-alerte">Le tableau ne se charge pas.</p>;
  const lignes = data.lignes || [];
  const actifs = lignes.filter((l) => l.statut !== "ecarte").length;
  return (
    <section aria-label="Acquéreurs">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[20px] font-normal text-encre">Acquéreurs<span className="text-ardoise">{actifs ? ` · ${actifs} en cours` : ""}</span></h2>
        <p className="m-0 text-[13px] text-ardoise">Corrigez une case d'un clic, ou racontez-le à l'assistant : « Durand a appelé, budget 600 k, visite jeudi 15 h ».</p>
      </div>
      {data.statuts.map((s) => (
        <Groupe key={s.cle} s={s} lignes={lignes.filter((l) => l.statut === s.cle)} statuts={data.statuts} sources={data.sources} ajouter={ajouter} garder={garder} retirer={retirer} planifier={planifier} />
      ))}
    </section>
  );
}
