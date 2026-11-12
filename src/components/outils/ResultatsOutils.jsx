import React, { useState } from "react";
import { AlertTriangle, Check, Circle, ExternalLink, Loader2, Minus, RotateCw } from "lucide-react";
import { RueDetail } from "@/components/outils/Rue";
import { CADRE_GRILLE, CELLULES, ENTETE_GRILLE, LIGNE_GRILLE } from "@/components/preanalyse/AnalysePieces";

// Le résultat des outils (11 nov. 2026, Jules : « un seul composant de résultat, affiché à deux endroits ») : l'onglet
// Marché d'un dossier et la page Outils. Depuis le 12 nov., un tableau par outil (Nom / Valeur / Source), comme les
// grilles du bail : la conclusion en tête, une ligne par point, les preuves (ventes, comptes, annonces, la rue) au clic. Chaque outil a son propre lancement ; un outil qui
// échoue ou traîne n'empêche pas les autres de s'afficher.

export const STATUTS = {
  ok: { mot: "OK", point: "bg-menthe", Icone: Check, couleur: "text-menthe" },
  a_voir: { mot: "À voir", point: "bg-ambre", Icone: AlertTriangle, couleur: "text-ambre" },
  alerte: { mot: "Alerte", point: "bg-alerte", Icone: AlertTriangle, couleur: "text-alerte" },
  vide: { mot: "Pas de donnée", point: "bg-brume", Icone: Minus, couleur: "text-brume" },
};

export function PastilleStatut({ statut }) {
  const s = STATUTS[statut] || STATUTS.vide;
  return <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-ardoise"><span className={`h-2 w-2 rounded-full ${s.point}`} aria-hidden="true" />{s.mot}</span>;
}

const quand = (d) => (d ? new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null);
const euros = (n) => (Number.isFinite(Number(n)) && n !== null ? `${Math.round(Number(n)).toLocaleString("fr-FR")} €` : "—");
const jour = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");

/** L'état lisible d'un outil : en cours, en échec, jamais lancé, ou son résultat. */
export function etatOutil(o) {
  const l = o.lancement;
  if (!l) return { statut: null, texte: "Pas encore lancé", date: null };
  if (l.statut === "en_cours") return { statut: "en_cours", texte: "En cours…", date: quand(l.lance_le) };
  if (l.statut === "echec") return { statut: "alerte", texte: `Échec : ${l.erreur || "la lecture n'a pas abouti"}`, date: quand(l.fini_le) };
  return { statut: l.resultat?.statut || "vide", texte: l.resultat?.conclusion || "—", date: quand(l.fini_le) };
}

function IconeStatut({ statut }) {
  if (statut === "en_cours") return <Loader2 className="h-4 w-4 flex-none animate-spin text-ardoise" aria-label="En cours" />;
  if (!statut) return <Circle className="h-4 w-4 flex-none text-brume" aria-label="Pas lancé" />;
  const s = STATUTS[statut] || STATUTS.vide;
  return <s.Icone className={`h-4 w-4 flex-none ${s.couleur}`} aria-label={s.mot} />;
}

function Tableau({ entetes, lignes }) {
  if (!lignes?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead><tr>{entetes.map((e) => <th key={e} className="border-b border-trait px-2 py-1.5 text-left text-[12px] font-normal text-ardoise">{e}</th>)}</tr></thead>
        <tbody>{lignes.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j} className="border-b border-trait px-2 py-1.5 text-craie">{c ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** Les preuves d'un point, lisibles : les ventes, les comptes, les annonces, les niveaux de loyer. */
export function Preuves({ p }) {
  const d = p?.detail;
  if (!d) return null;
  if (p.cle === "verdict_prix" && d.comparaison?.ventes) return <Tableau entetes={["Date", "Adresse", "Surface", "Prix", "€/m²", "Distance"]} lignes={d.comparaison.ventes.map((v) => [jour(v.date), v.adresse, `${Math.round(v.surface)} m²`, euros(v.prix), euros(v.prix_m2), `${v.distance_m} m`])} />;
  if (p.cle === "rendement" && d.capitalisation) return <p className="m-0 text-[13px] text-craie">{d.capitalisation.lecture || `Taux retenu ${d.capitalisation.taux} %`}{d.capitalisation.moyenne ? ` · valeur par capitalisation ${euros(d.capitalisation.moyenne)}` : ""}</p>;
  // La page Equimmox lue, en capture (12 nov. 2026, Jules : « pouvoir aller voir dans Equimmox »).
  if (p.cle === "loyer_marche" && d.niveaux) return <Tableau entetes={["Échelle", "Bas", "Moyenne", "Haut", "Rayon", "Equimmox"]} lignes={Object.entries(d.niveaux).filter(([, n]) => n).map(([k, n]) => [k === "rue" ? `Rue${n.nom ? ` (${n.nom})` : ""}` : k === "quartier" ? "Quartier" : `Ville${n.nom ? ` (${n.nom})` : ""}`, n.basse, n.moyenne, n.haute, n.rayon, n.capture ? <a href={n.capture} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-menthe hover:underline">voir la page <ExternalLink className="h-3 w-3" /></a> : null])} />;
  if (p.cle === "comptes" && d.exercices) return <Tableau entetes={["Exercice", "Chiffre d'affaires", "Résultat net", "EBE"]} lignes={d.exercices.map((x) => [x.exercice, euros(x.chiffre_affaires), euros(x.resultat_net), euros(x.excedent_brut)])} />;
  if (p.cle === "procedures" && d.evenements?.length) return <Tableau entetes={["Date", "Type", "Détail"]} lignes={d.evenements.map((e) => [jour(e.date), e.type, e.detail])} />;
  if (p.cle === "vacance" && d.troncons?.length > 1) return <Tableau entetes={["Tronçon", "Locaux", "Vides", "Incertains", "Taux"]} lignes={d.troncons.map((t) => [`du ${t.du} au ${t.au}`, t.locaux, t.vacants, t.incertains, t.taux != null ? `${String(t.taux).replace(".", ",")} %` : "—"])} />;
  if (p.cle === "vacance" && d.taux) return <p className="m-0 text-[13px] text-craie">{d.taux.locaux} locaux recensés : {d.taux.occupes} occupés, {d.taux.vacants} vides ({d.taux.vacants_confirmes} confirmés), {d.taux.incertains} incertains.</p>;
  if (p.cle === "passage" && d.pourquoi?.length) return <ul className="m-0 list-disc pl-4 text-[13px] text-craie">{d.pourquoi.map((x, i) => <li key={i}>{typeof x === "string" ? x : x.texte || x.raison || ""}</li>)}</ul>;
  if (p.cle === "societe") return <p className="m-0 text-[13px] text-craie">SIREN {d.siren}{d.activite ? ` · activité ${d.activite}` : ""}{d.etablissements_ouverts != null ? ` · ${d.etablissements_ouverts} établissement${d.etablissements_ouverts > 1 ? "s" : ""} ouvert${d.etablissements_ouverts > 1 ? "s" : ""}` : ""}{d.categorie ? ` · ${d.categorie}` : ""}</p>;
  return null;
}

const COLONNES_OUTILS = "grid-cols-[190px_minmax(0,1fr)_240px]";

/** Une ligne du tableau : le point, ce qu'il dit avec sa pastille, sa source ; un clic sur la ligne ouvre les preuves. */
function LignePoint({ p }) {
  const [ouvert, setOuvert] = useState(false);
  // Appelé comme une fonction : on sait s'il y a des preuves avant d'offrir le lien.
  const preuves = Preuves({ p });
  return (
    <div className={`grid ${COLONNES_OUTILS} ${CELLULES} ${LIGNE_GRILLE}`}>
      <span className="text-[13.5px] text-encre">{p.libelle}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex items-start gap-2">
          <span className={`mt-[7px] h-2 w-2 flex-none rounded-full ${(STATUTS[p.statut] || STATUTS.vide).point}`} aria-label={(STATUTS[p.statut] || STATUTS.vide).mot} />
          <span className={`min-w-0 text-[13.5px] leading-[1.5] ${p.statut === "vide" ? "text-brume" : "text-encre"}`}>{p.resultat}</span>
        </span>
        {preuves && (ouvert ? <div className="pl-4">{preuves}</div> : <button type="button" onClick={() => setOuvert(true)} className="self-start pl-4 text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>Voir les preuves</button>)}
      </div>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12.5px] leading-[1.6] text-craie">
        {p.source || "—"}
        {p.lien && <a href={p.lien} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-menthe hover:underline">ouvrir <ExternalLink className="h-3 w-3" /></a>}
      </span>
    </div>
  );
}

/**
 * Un outil, un tableau (12 nov. 2026, Jules : « des tableaux comme ça ») : en-tête Nom / Valeur / Source, une ligne par
 * point ; sous le tableau, la date de lecture et les gestes. Emplacement ouvre la rue entière sous son tableau.
 */
function TableauOutil({ o, onRelancer, relance, apercu, onVerifier }) {
  const [rue, setRue] = useState(false);
  const l = o.lancement;
  const e = etatOutil(o);
  const r = l?.resultat;
  const points = r?.points || [];
  return (
    <section className="flex flex-col gap-2">
      <div className={CADRE_GRILLE}>
        <div className={`grid ${COLONNES_OUTILS} ${CELLULES} ${ENTETE_GRILLE}`}>
          <span className="text-[13.5px] text-encre">{o.nom}</span><span>Valeur</span><span>Source</span>
        </div>
        {points.map((p) => <LignePoint key={p.cle} p={p} />)}
        {l?.statut === "en_cours" && !points.length && (
          <div className={`grid ${COLONNES_OUTILS} ${CELLULES} ${LIGNE_GRILLE}`}><span /><span className="flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Lecture en cours ; les autres outils s'affichent déjà.</span><span /></div>
        )}
        {!l && <div className={`grid ${COLONNES_OUTILS} ${CELLULES} ${LIGNE_GRILLE}`}><span /><span className="text-[13.5px] text-brume">Pas encore lancé.</span><span /></div>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {l && <span className="text-[12.5px] text-brume">{`${l.statut === "en_cours" ? "Lancé" : "Lu"} le ${e.date}${l.par ? ` par ${l.par.split("@")[0]}` : ""}${l.partage_de ? ", repris d'un lancement récent de la même commune" : ""}`}{l.verifie && <span className="text-menthe">{` · vérifié par ${(l.verifie.par || "").split("@")[0]}`}</span>}</span>}
        {o.a_relancer && <span className="text-[12.5px] text-ambre">À relancer : {o.a_relancer}.</span>}
        {o.cle === "emplacement" && r?.rue && <button type="button" onClick={() => setRue((v) => !v)} className="text-[13px] text-menthe hover:underline" style={{ background: "transparent" }}>{rue ? "Replier la rue" : "Voir la rue entière"}</button>}
        {!apercu && onRelancer && (
          <button type="button" onClick={() => onRelancer([o.cle])} disabled={relance || l?.statut === "en_cours"} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            <RotateCw className="h-3.5 w-3.5" />{l ? "Relancer" : "Lancer"}
          </button>
        )}
        {!apercu && onVerifier && l?.statut === "fini" && (
          <button type="button" onClick={() => onVerifier(l.id, !l.verifie)} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{l.verifie ? "Revenir à « lu »" : "Marquer vérifié"}</button>
        )}
      </div>
      {rue && r?.rue && <div className="rounded-[12px] border border-trait p-5 max-md:p-4"><RueDetail x={r.rue} id={r.rue_id} /></div>}
    </section>
  );
}

/**
 * Les outils, un tableau chacun, dans l'ordre du travail. `outils` : [{ cle, nom, question, lancement, a_relancer }] ;
 * `onRelancer(cles|null)` lance ceux-là, ou tous ; `vide` : ce qui s'affiche quand rien n'a été lancé.
 */
export default function ResultatsOutils({ outils = [], onRelancer, relance = false, apercu = false, onVerifier = null, vide = null }) {
  const aucun = outils.every((o) => !o.lancement);
  if (aucun && vide) return vide;
  return (
    <div className="flex flex-col gap-6">
      {outils.map((o) => <TableauOutil key={o.cle} o={o} onRelancer={onRelancer} relance={relance} apercu={apercu} onVerifier={onVerifier} />)}
      {!apercu && onRelancer && outils.length > 1 && (
        <button type="button" onClick={() => onRelancer(null)} disabled={relance} className="inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {relance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}Tout relancer
        </button>
      )}
    </div>
  );
}
