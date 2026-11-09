import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, ListPlus, Search, SlidersHorizontal, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import { toast } from "@/components/ui/avis";
import { FenetreListe } from "@/components/off-market/Simple";
import { Case, Vide } from "@/components/off-market/commun";
import Loader from "@/components/ui/Loader";
import { FILTRES_LIBRES, duree, nbFiltresLibres, passeLibre } from "@/lib/murs-libres";

export { FILTRES_LIBRES, duree, passeLibre };

// Les murs libres de la Prospection (3 nov. 2026, Jules) : les locaux vides du secteur, sans client. Un local vide se
// prospecte pour le mandataire (un locataire ou un acheteur à trouver) : les critères Klocka écartent un local vacant
// sans locataire en vue. Le serveur : server/murs-libres.js.

export const API_LIBRES = "/api/mandataire/prospecter/libres";
const DEPUIS = [["3", "Plus de 3 mois"], ["6", "Plus de 6 mois"], ["12", "Plus d'un an"]];
const PROPRIETAIRE = [["connu", "Connu"], ["inconnu", "À trouver"]];
const EMPLACEMENT = [["centre", "Zones commerçantes"], ["partout", "Toute la ville"]];
/** La couleur d'un local sur la carte : menthe quand on sait à qui sont les murs, brume sinon. */
export const couleurLibre = (p) => (p.fiche?.dans_biens ? JL.fond : p.proprietaire ? JL.menthe : JL.brume);

/** Les locaux d'un coup vers une liste : un envoi par local, la fenêtre de la Prospection. */
const envoyerLibres = (ids) => async (body) => {
  let ajoutes = 0; let liste = null; const refus = [];
  for (const id of ids) {
    try { const r = await base44.request("POST", `${API_LIBRES}/${id}/liste`, { body }); ajoutes += 1; liste = r.liste || liste; }
    catch (e) { refus.push(e?.message); }
  }
  if (refus.length) toast.error(`${refus.length} local${refus.length > 1 ? "aux" : ""} non ajouté${refus.length > 1 ? "s" : ""} : ${refus[0]}`);
  return { ajoutes, liste: liste || { nom: body.nom || "ma liste" }, deja: [] };
};

/** « Filtrer » des murs libres : depuis quand, l'emplacement, la dernière activité, le propriétaire. */
/**
 * Les filtres des locaux vides, sans leur bouton (3 nov. 2026) : la page « Murs libres » de la fenêtre Filtrer de la
 * Prospection, quand le type d'actif est coché ; MenuFiltresLibres les pose aussi dans son menu.
 */
export function SectionsLibres({ filtres, setFiltres, points }) {
  const activites = useMemo(() => { const n = {}; for (const p of points) if (p.activite) n[p.activite] = (n[p.activite] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 14); }, [points]);
  const n = nbFiltresLibres(filtres);
  const poser = (k, v) => setFiltres((f) => ({ ...f, [k]: f[k] === v ? FILTRES_LIBRES[k] : v }));
  const Groupe = ({ titre, cle, options }) => (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-brume">{titre}</span>
      <span className="flex flex-wrap gap-1.5">
        {options.map(([v, mot, compte]) => (
          <button key={v} type="button" onClick={() => poser(cle, v)} aria-pressed={filtres[cle] === v}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13.5px] ${filtres[cle] === v ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`}
            style={filtres[cle] === v ? undefined : { background: "transparent" }}>{mot}{compte != null && <span className="tabular-nums text-ardoise">{compte}</span>}</button>
        ))}
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <Groupe titre="Vide depuis" cle="depuis" options={DEPUIS} />
      <Groupe titre="Emplacement" cle="emplacement" options={EMPLACEMENT} />
      <Groupe titre="Propriétaire des murs" cle="proprietaire" options={PROPRIETAIRE} />
      {activites.length > 0 && <Groupe titre="Dernière activité" cle="activite" options={activites.map(([v, k]) => [v, v, k])} />}
      {n > 0 && <button type="button" onClick={() => setFiltres(FILTRES_LIBRES)} className="self-start text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Effacer ces filtres</button>}
    </div>
  );
}

export function MenuFiltresLibres({ filtres, setFiltres, points, entete = null, ouvertAuDepart = false }) {
  const [ouvert, setOuvert] = useState(ouvertAuDepart);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);
  const activites = useMemo(() => { const n = {}; for (const p of points) if (p.activite) n[p.activite] = (n[p.activite] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 14); }, [points]);
  const n = nbFiltresLibres(filtres);
  const poser = (k, v) => setFiltres((f) => ({ ...f, [k]: f[k] === v ? FILTRES_LIBRES[k] : v }));
  const Groupe = ({ titre, cle, options }) => (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] text-brume">{titre}</span>
      <span className="flex flex-wrap gap-1.5">
        {options.map(([v, mot, compte]) => (
          <button key={v} type="button" onClick={() => poser(cle, v)} aria-pressed={filtres[cle] === v}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13.5px] ${filtres[cle] === v ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`}
            style={filtres[cle] === v ? undefined : { background: "transparent" }}>{mot}{compte != null && <span className="tabular-nums text-ardoise">{compte}</span>}</button>
        ))}
      </span>
    </div>
  );
  return (
    <div ref={racine} className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-encre transition-colors hover:border-bord-vif">
        <SlidersHorizontal className="h-4 w-4" />Filtrer{n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-menthe px-1.5 text-[12px] text-sur-menthe">{n}</span>}
      </button>
      {ouvert && (
        <div className="absolute left-0 top-12 z-40 flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-4 rounded-[14px] border border-bord-doux bg-surface-pleine p-4 shadow-[0_16px_40px_rgb(0_0_0/0.35)]">
          {entete}
          <Groupe titre="Vide depuis" cle="depuis" options={DEPUIS} />
          <Groupe titre="Emplacement" cle="emplacement" options={EMPLACEMENT} />
          <Groupe titre="Propriétaire des murs" cle="proprietaire" options={PROPRIETAIRE} />
          {activites.length > 0 && <Groupe titre="Dernière activité" cle="activite" options={activites.map(([v, k]) => [v, v, k])} />}
          {n > 0 && <button type="button" onClick={() => setFiltres(FILTRES_LIBRES)} className="self-start text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout effacer</button>}
        </div>
      )}
    </div>
  );
}

const TRAIT = "border-trait";
const GESTE = "inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13.5px] text-craie hover:text-encre disabled:opacity-50";
const GESTE_PLEIN = "inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3 text-[13.5px] text-sur-menthe hover:bg-menthe-survol";
const PAR_PAGE = 50;

/** Le tableau des locaux vides, au dessin de celui des murs occupés. */
export function TableauLibres({ points, total, filtres, setFiltres, ouvert, onOuvrir, charge }) {
  const qc = useQueryClient();
  const [tri, setTri] = useState({ cle: "mois_vide", sens: 1 });
  const [page, setPage] = useState(0);
  const [coches, setCoches] = useState(() => new Set());
  const [versListe, setVersListe] = useState(false);
  useEffect(() => { setPage(0); }, [filtres, tri]);
  const tries = useMemo(() => {
    const val = (p) => (tri.cle === "mois_vide" ? p.mois_vide ?? 999 : String(p[tri.cle] || ""));
    return [...points].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" ? x - y : x.localeCompare(y, "fr")) * tri.sens; });
  }, [points, tri]);
  const pages = Math.max(1, Math.ceil(tries.length / PAR_PAGE));
  const vue = tries.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const libres = vue.filter((p) => !p.liste);
  const tousCoches = libres.length > 0 && libres.every((p) => coches.has(p.id));
  const colonnes = [["titre", "Local"], ["dernier", "Dernière activité"], ["mois_vide", "Vide depuis"], ["proprietaire", "Propriétaire des murs"], ["appel", "Liste"]];
  return (
    <section data-zone="libres" className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-[320px] items-center gap-2 rounded-full bg-relief px-3.5 focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10 max-md:w-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={filtres.texte} onChange={(e) => setFiltres((f) => ({ ...f, texte: e.target.value }))} placeholder="Rue, ancienne activité, propriétaire"
            className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {nbFiltresLibres(filtres) > 0 && <button type="button" onClick={() => setFiltres(FILTRES_LIBRES)} className={GESTE} style={{ background: "transparent" }}><X className="h-3.5 w-3.5" />Tout afficher</button>}
        <button type="button" onClick={() => setVersListe(true)} disabled={!coches.size} className={coches.size ? GESTE_PLEIN : GESTE} style={coches.size ? undefined : { background: "transparent" }}><ListPlus className="h-3.5 w-3.5" />Envoyer vers une liste{coches.size ? ` (${coches.size})` : ""}</button>
        <span className="ml-auto text-[13.5px] text-ardoise max-md:ml-0">
          <span className="tabular-nums text-menthe">{tries.length}</span> local{tries.length > 1 ? "aux" : ""} vide{tries.length > 1 ? "s" : ""}{tries.length !== total ? <> sur <span className="tabular-nums text-encre">{total}</span></> : null}
        </span>
        {pages > 1 && (
          <span className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Page précédente" className={`${GESTE} w-8 justify-center px-0`} style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 rotate-90" /></button>
            <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Page suivante" className={`${GESTE} w-8 justify-center px-0`} style={{ background: "transparent" }}><ChevronDown className="h-4 w-4 -rotate-90" /></button>
          </span>
        )}
      </div>
      <div className={`mt-4 overflow-x-auto rounded-[12px] border ${TRAIT} bg-rail`}>
        <table className="min-w-full border-separate border-spacing-0 text-left text-[13.5px] [&_tr>*:last-child]:border-r-0 [&_tbody>tr:last-child>td]:border-b-0">
          <thead>
            <tr>
              <th className={`sticky left-0 z-30 border-b border-r ${TRAIT} bg-rail px-0 h-[35px] py-0`} style={{ width: 44, minWidth: 44 }}>
                <span className="grid place-items-center"><Case bord={TRAIT} oui={tousCoches} disabled={!libres.length} label="Cocher toute la page" onBasculer={() => setCoches((s) => { const n = new Set(s); for (const p of libres) { if (tousCoches) n.delete(p.id); else n.add(p.id); } return n; })} /></span>
              </th>
              {colonnes.map(([cle, mot], i) => (
                <th key={cle} className={`border-b border-r ${TRAIT} bg-rail h-[35px] py-0 text-[12.5px] font-normal text-ardoise ${i === 0 ? "sticky left-[44px] z-30 min-w-[220px] px-2.5 max-md:min-w-[140px]" : "px-2.5 text-center"}`}>
                  <button type="button" onClick={() => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: 1 }))} className="inline-flex items-center gap-1 whitespace-nowrap p-0 text-ardoise hover:text-encre" style={{ background: "transparent" }}>{mot}{tri.cle === cle && <ChevronDown className={`h-3 w-3 ${tri.sens < 0 ? "rotate-180" : ""}`} />}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vue.map((p) => {
              const cellule = `h-[36px] overflow-hidden whitespace-nowrap border-b border-r ${TRAIT} px-2.5 py-0 text-center align-middle text-craie`;
              return (
                <tr key={p.id} onClick={() => onOuvrir(p.id)} className={`group cursor-pointer transition-colors ${ouvert === p.id ? "bg-menthe/[0.05]" : "hover:bg-relief/30"}`}>
                  <td className={`sticky left-0 z-10 border-b border-r ${TRAIT} bg-rail px-0 h-[36px] py-0 align-middle`} style={{ width: 44, minWidth: 44 }} onClick={(e) => e.stopPropagation()}>
                    <span className="grid place-items-center"><Case bord={TRAIT} oui={coches.has(p.id)} onBasculer={() => { if (p.liste) return; setCoches((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }); }} label={p.liste ? `Déjà dans la liste « ${p.liste.nom} »` : "Choisir pour une liste"} className={p.liste ? "opacity-35" : ""} /></span>
                  </td>
                  <td className={`sticky left-[44px] z-10 border-b border-r ${TRAIT} bg-rail h-[36px] overflow-hidden whitespace-nowrap py-0 px-2.5 align-middle`}>
                                          <span className="block max-w-[340px] truncate"><span className="text-encre group-hover:text-menthe">{p.titre}</span><span className="text-ardoise"> · {p.ville}{p.source === "terrain" ? " · terrain" : ""}</span></span>
                  </td>
                  <td className={`${cellule} max-w-[260px]`}><span className="block truncate">{p.dernier || <span className="text-brume">—</span>}<span className="text-ardoise"> · {p.activite}</span></span></td>
                  <td className={`${cellule} tabular-nums`}>{duree(p.mois_vide)}</td>
                  <td className={`${cellule} max-w-[240px]`}><span className="block truncate">{p.proprietaire || <span className="text-brume">{p.lien === "prive" ? "Particulier, non publié" : p.lien === "inconnu" ? "Introuvable" : "En recherche"}</span>}</span></td>
                  <td className={`border-b border-r ${TRAIT} h-[36px] whitespace-nowrap px-2.5 py-0 text-center align-middle`}>{p.liste ? <span className="text-ardoise">« {p.liste.nom} »</span> : <span className="text-brume">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!tries.length && !charge && <Vide>Aucun local vide avec ces filtres.</Vide>}
      </div>
      {versListe && <FenetreListe ids={[...coches]} mot="local" envoyerVers={envoyerLibres([...coches])} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); setCoches(new Set()); qc.invalidateQueries({ queryKey: ["m-prospecter", "libres"] }); }} />}
    </section>
  );
}

const Ligne = ({ mot, children }) => (
  <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 border-t border-trait py-3 text-[13.5px] first:border-t-0 max-md:grid-cols-1 max-md:gap-1">
    <span className="text-ardoise">{mot}</span><span className="min-w-0 text-encre">{children}</span>
  </div>
);
const euros = (v) => `${Math.round(v).toLocaleString("fr-FR")} €`;

/**
 * La fiche d'un local vide : depuis quand et selon quoi, la dernière activité, le propriétaire des murs (sa société,
 * ses gérants, leur âge), la valeur locative du secteur, et l'accroche du premier appel. « Ajouter à ma liste » fait
 * naître la fiche du propriétaire, comme pour un commerce.
 */
export function FicheLibre({ id, point, onFermer }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["m-prospecter", "libres", id], queryFn: () => base44.request("GET", `${API_LIBRES}/${id}`), staleTime: 5 * 60_000 });
  // Repris d'après Google Maps : la carte se relit sans lui.
  useEffect(() => { if (q.data?.local?.repris) qc.invalidateQueries({ queryKey: ["m-prospecter", "libres"], exact: true }); }, [q.data, qc]);
  const [versListe, setVersListe] = useState(false);
  const l = q.data?.local || null;
  const p = l || point || {};
  const pr = l?.proprietaire || null;
  const s = l?.societe || null;
  const vl = l?.valeur_locative || null;
  const copier = () => { try { navigator.clipboard.writeText(l.accroche); toast.success("Accroche copiée"); } catch { toast.error("Copie impossible"); } };
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-start gap-3 border-b border-trait px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[17px] text-encre">{p.titre || p.adresse || "Local vide"}</p>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">{p.ville}{p.mois_vide != null ? <> · <span className="text-ambre">vide depuis {duree(p.mois_vide)}</span></> : null}</p>
        </div>
        {onFermer && <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>}
      </div>
      {!l && q.isLoading && <div className="px-5 py-6"><Loader titre="Le local, son propriétaire, Google Maps…" /></div>}
      {q.isError && <p className="m-0 px-5 py-6 text-[13.5px] text-alerte">{q.error?.message || "La fiche ne se charge pas."}</p>}
      {l?.repris && (
        <p className="m-0 mx-5 mt-4 rounded-[12px] border border-ambre/40 bg-ambre/10 px-4 py-3 text-[13.5px] leading-[1.55] text-encre">Ce local a été repris : {l.pourquoi.split(". ").slice(-1)[0]} Il ne sera plus sur la carte.</p>
      )}
      {l && !l.repris && (
        <div className="flex flex-col px-5 py-2">
          <Ligne mot="Vide depuis">{l.depuis ? l.depuis.replace(/^depuis /, "") : "—"}{l.ferme_le ? ` (fermé le ${new Date(l.ferme_le).toLocaleDateString("fr-FR")})` : ""}<span className="mt-1 block text-[12.5px] text-ardoise">{l.pourquoi}</span><span className="mt-1 block text-[12px] text-brume">Source : {l.source_texte}</span></Ligne>
          <Ligne mot="Dernière activité">{l.dernier ? <>{l.dernier}{l.activite ? <span className="block text-ardoise">{l.activite}</span> : null}</> : <span className="text-brume">Inconnue</span>}</Ligne>
          <Ligne mot="Surface"><span className="text-brume">Non publiée pour un local vide : à relever sur place</span></Ligne>
          <Ligne mot="Propriétaire des murs">
            {pr ? <>{pr.nom}{pr.forme ? <span className="text-ardoise"> · {pr.forme}</span> : null}</> : l.prive ? "Un particulier, probablement : aucune société n'est publiée sur la parcelle" : l.proprietaire_lu ? <span className="text-brume">Introuvable par l'adresse</span> : <span className="text-brume">Recherche en cours</span>}
            {s?.gerants?.length > 0 && <span className="mt-1 block text-[12.5px] text-ardoise">{s.gerants.map((g) => [g.nom, g.qualite, g.tranche_age ? `${g.tranche_age} ans` : null].filter(Boolean).join(", ")).join(" · ")}</span>}
            {s?.creation && <span className="mt-0.5 block text-[12.5px] text-ardoise">Société créée en {String(s.creation).slice(0, 4)}</span>}
          </Ligne>
          <Ligne mot="Valeur locative">{vl ? <>{euros(vl.basse)} à {euros(vl.haute)} HT HC par m² et par an<span className="block text-[12.5px] text-ardoise">Dans la {vl.ou === "rue" ? "rue" : vl.ou === "quartier" ? "le quartier" : "ville"}, selon {vl.source}</span></> : <span className="text-brume">Pas encore lue pour cette adresse</span>}</Ligne>
          <Ligne mot="Emplacement">{p.centre === true ? "Dans une zone commerçante" : p.centre === false ? "Hors des zones commerçantes" : "—"}</Ligne>
          <div className="mt-3 rounded-[12px] border border-bord-doux bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2"><span className="text-[12px] text-brume">L'accroche</span>
              <button type="button" onClick={copier} className="inline-flex items-center gap-1 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Copy className="h-3.5 w-3.5" />Copier</button></div>
            <p className="m-0 mt-1.5 text-[14px] leading-[1.55] text-encre">{l.accroche}</p>
          </div>
        </div>
      )}
      {l && !l.fiche && !l.repris && (
        <div className="sticky bottom-0 mt-auto border-t border-trait bg-fond px-5 py-3">
          <button type="button" onClick={() => setVersListe(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">
            <ListPlus className="h-4 w-4" />Ajouter à une liste
          </button>
        </div>
      )}
      {versListe && <FenetreListe ids={[id]} mot="local" envoyerVers={envoyerLibres([id])} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); qc.invalidateQueries({ queryKey: ["m-prospecter", "libres"] }); }} />}
    </div>
  );
}
