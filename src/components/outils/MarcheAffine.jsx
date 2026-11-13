import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Loader2, RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Anneau, Barres, Calendrier, Fourchettes, Frise, Jauge, JaugeFine, PointsSurAxe } from "@/components/outils/visuels";
import { cleOutilsDossier, marquerVu, useOutilsDossier } from "@/components/analyse/ControlesHorsDocuments";
import { MOT, montants, sansCode, suiteCourte, teteEtSuite, teteProcedure } from "@/lib/marche-texte";
import { VERRE } from "@/lib/verre";

// L'onglet Marché (12 nov. 2026, Jules, après une planche : « est-ce qu'on a besoin de tableaux ? juste les trucs
// graphiques à la place ; supprime la note de l'IA » ; puis « enlève le truc de pop-up aussi ») : cinq blocs, un par
// outil. Chaque bloc a son nom en 20 px, Relancer et Vérifié, puis une carte au seul bord dont les parties sont séparées
// d'un filet ; chaque partie dit son verdict (le chiffre, puis le jugement) et le montre : fourchettes du loyer, ventes en
// points, jauge du rendement, ce qui fait la note de passage, frise du local, jauge et ruban de la vacance, jauge et
// pastilles des enseignes, avis BODACC en points, note Google en jauge, poids du loyer en jauge, jauges du revenu et du
// chômage. Le Locataire commence par le nom de la société seul (12 nov. 2026, Jules), les procédures en calendrier.
// Plus de tableau, de note de l'IA ni de fenêtre. Chaque partie a sa source en bas à droite : « Voir source » ouvre ce
// que l'outil a lu, le « i » dit d'où vient le chiffre (`Source`).
// Les mots (montants, chiffre avant la phrase, jugement sans les nombres) vivent dans src/lib/marche-texte.js, testés.

const POINT = { ok: "bg-brume", a_voir: "bg-menthe", alerte: "bg-alerte", vide: "border border-brume" };
const Point = ({ statut, className = "" }) => <span className={`h-2 w-2 flex-none rounded-full ${POINT[statut] || POINT.vide} ${className}`} aria-label={MOT[statut] || MOT.vide} />;
const pct = (n, d = 1) => (n == null ? "—" : `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`);
const nombre = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));
const euros = (n) => montants(`${Math.round(Number(n)).toLocaleString("fr-FR")} €`);
const eurosM2 = (n) => (Number.isFinite(Number(n)) && n !== null ? `${Math.round(Number(n)).toLocaleString("fr-FR")} €/m²` : "—");
const PARTS = [["troncon", "Commerces du tronçon", 3.5], ["enseignes", "Enseignes nationales", 2], ["transports", "Transports à 300 m", 1.5], ["voie", "Type de voie", 1], ["vues", "Photos Street View", 2]];

// Les filets entre les parties d'une carte (12 nov. 2026, Jules) : au téléphone, un filet entre deux parties empilées ; à
// partir de 1024 px, un filet vertical entre deux colonnes et un filet horizontal entre deux rangées. Les classes sont
// écrites en entier pour que Tailwind les trouve.
const GRILLE = {
  1: "grid [&>*]:border-trait [&>*+*]:border-t",
  2: "grid lg:grid-cols-2 [&>*]:border-trait [&>*+*]:border-t lg:[&>*:nth-child(-n+2)]:border-t-0 lg:[&>*:nth-child(2n)]:border-l",
  3: "grid lg:grid-cols-3 [&>*]:border-trait [&>*+*]:border-t lg:[&>*:nth-child(-n+3)]:border-t-0 lg:[&>*:not(:nth-child(3n+1))]:border-l",
};
const CELLULE = "flex min-w-0 flex-col gap-3 p-5 max-md:p-4";

const sourceDe = (p) => (p?.source ? `Source : ${p.source}` : null);

/**
 * La source d'une partie, en bas à droite (12 nov. 2026, Jules : « un petit i », « au lieu de voir la page lue, Voir
 * source ») : « Voir source » ouvre ce que l'outil a lu (la page Equimmox photographiée à la lecture, le relevé des
 * ventes DVF comparées, la photo Street View lue par l'IA, la fiche publique de la société) ; le « i » dit d'où vient
 * le chiffre, au survol ou d'un tap (un tap ailleurs le referme).
 */
function Source({ lien = null, texte = null, enBas = true }) {
  const [ouvert, setOuvert] = useState(false);
  if (!lien && !texte) return null;
  return (
    <div className={`${enBas ? "mt-auto" : ""} flex flex-none items-center justify-end gap-1 self-end`}>
      {lien && <a href={lien} target="_blank" rel="noreferrer" className="text-[12.5px] text-menthe hover:underline">Voir source</a>}
      {texte && (
        <Tooltip open={ouvert} onOpenChange={setOuvert}>
          <TooltipTrigger asChild>
            {/* Radix ferme l'infobulle à l'appui sur son bouton : on l'en empêche, pour qu'un tap l'ouvre. */}
            <button type="button" aria-label="D'où vient ce chiffre" onPointerDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); setOuvert(true); }} className="grid h-6 w-6 place-items-center rounded-full text-brume transition-colors hover:text-encre" style={{ background: "transparent" }}>
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="end" className="max-w-[320px] rounded-[10px] border border-bord bg-surface-pleine px-3 py-2 text-[12.5px] leading-[1.45] text-craie">{texte}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Une partie d'une carte : son point, son libellé en 12,5 px, son chiffre en 20 px et son jugement en 13 px, puis son
 * visuel (`children`), puis sa source en bas à droite (`Source`). `chiffre` et `suite` remplacent la lecture de la
 * phrase ; `sansLibelle` quand le bloc n'a qu'une partie et que son nom la dit déjà (Loyer) ; `badge` pour un mot d'état
 * (« simulé ») ; `lien` et `source` remplacent ceux du point ; `visuelEnBas` pose le visuel au pied de la partie, pour
 * que deux jauges voisines s'alignent quelle que soit la longueur de leur phrase (Revenu et Chômage, 13 nov. 2026).
 */
function Mesure({ p, chiffre, suite, sansLibelle = false, badge = null, lien, source, visuelEnBas = false, children }) {
  if (!p) return null;
  const vide = p.statut === "vide";
  const [t0, s0] = vide ? [sansCode(p.resultat), ""] : teteEtSuite(p.resultat);
  const tete = chiffre ?? t0;
  const reste = suite ?? suiteCourte(s0);
  return (
    <>
      <div className="flex items-start gap-2.5">
        <Point statut={p.statut} className="mt-[9px]" />
        <p className="m-0 min-w-0 leading-[1.4]">
          {!sansLibelle && <><span className="text-[12.5px] text-brume">{p.libelle}</span>{badge && <span className="ml-2 rounded-full border border-menthe/50 px-1.5 text-[11px] text-menthe">{badge}</span>}<br /></>}
          <span className={vide ? "text-[14.5px] text-brume" : "text-[20px] tabular-nums text-encre"}>{tete}</span>
          {reste && <span className="text-[13px] text-ardoise"> {reste}</span>}
        </p>
      </div>
      {visuelEnBas ? <div className="mt-auto">{children}</div> : children}
      <Source lien={lien === undefined ? p.lien : lien} texte={source ?? sourceDe(p)} enBas={!visuelEnBas} />
    </>
  );
}

function Entete({ o, onRelancer, onVerifier, relance, apercu }) {
  const l = o.lancement;
  const icone = "grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-relief disabled:opacity-50";
  return (
    <header className="flex min-h-[36px] flex-wrap items-center gap-x-3 gap-y-1">
      {/* Le nom de l'outil, de la taille du nom de la partie (20 px) ; ni la question ni la date (12 nov. 2026, Jules). */}
      <h2 className="m-0 text-[20px] font-normal text-encre">{o.nom}</h2>
      {l?.statut === "en_cours" && <span className="text-[12.5px] text-brume">En cours…</span>}
      {o.a_relancer && <span className="text-[12.5px] text-menthe" title={o.a_relancer}>À relancer</span>}
      {!apercu && (
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => onRelancer([o.cle])} disabled={relance || l?.statut === "en_cours"} aria-label={`Relancer ${o.nom}`} title="Relancer" className={`${icone} text-ardoise hover:text-encre`} style={{ background: "transparent" }}>{l?.statut === "en_cours" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}</button>
          {l?.statut === "fini" && <button type="button" onClick={() => onVerifier(l.id, !l.verifie)} aria-label={l.verifie ? "Revenir à « lu »" : "Marquer vérifié"} title={l.verifie ? `Vérifié par ${(l.verifie.par || "").split("@")[0]}` : "Marquer vérifié"} className={`${icone} ${l.verifie ? "text-menthe" : "text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}><Check className="h-3.5 w-3.5" /></button>}
        </span>
      )}
    </header>
  );
}

// --- Locataire --------------------------------------------------------------------------------------------------------

/**
 * L'identité du locataire : le nom de la société en 22 px, rien d'autre (12 nov. 2026, Jules : « en haut, juste le titre :
 * quel est le locataire » ; la ligne dessous et « C'est la bonne société » à droite retirées). « fermée » reste.
 */
function Identite({ p }) {
  if (!p) return null;
  const d = p.detail || {};
  if (!d.siren) return <Mesure p={p} />;
  // Les lancements d'avant la refonte n'ont que la phrase : le nom s'y relit.
  const nom = d.nom || String(p.resultat || "").split(" · ")[0];
  const fermee = d.active === false || / · fermée/.test(p.resultat || "");
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <Point statut={p.statut} className="mt-[12px]" />
      <p className="m-0 min-w-0 flex-1 text-[22px] leading-[1.3] text-encre">{nom}{fermee && <span className="ml-2 text-[13px] text-alerte">fermée</span>}</p>
      <Source lien={p.lien} texte={sourceDe(p)} />
    </div>
  );
}

function Procedures({ p }) {
  if (!p) return null;
  const [chiffre, suite] = p.statut === "vide" ? [undefined, undefined] : teteProcedure(p.resultat);
  const ev = p.detail?.evenements || [];
  return <Mesure p={p} chiffre={chiffre} suite={suite}>{ev.length > 0 && <Calendrier evenements={ev} />}</Mesure>;
}

/** Avis clients : la note sur 5 en jauge, le nombre d'avis et le nom de la fiche ; plus les derniers avis (12 nov. 2026). */
function AvisClients({ p }) {
  if (!p) return null;
  const d = p.detail || {};
  // Les lancements d'avant la refonte n'ont que la phrase « 4,3 sur 5, 1284 avis (« X ») ».
  const ancien = !p.detail && String(p.resultat || "").match(/^(\d+(?:,\d+)?) sur 5, ([\d\s\u00a0\u202f]+) avis \(« (.+?) »\)/);
  const note = d.note ?? (ancien ? Number(ancien[1].replace(",", ".")) : null);
  const n = d.nombre ?? (ancien ? Number(ancien[2].replace(/\D/g, "")) : null);
  const nom = d.nom ?? (ancien ? ancien[3] : null);
  if (p.statut === "vide" || !note) return <Mesure p={p} badge={d.simule ? "simulé" : null} />;
  if (d.ferme) return <Mesure p={p} chiffre="Fiche marquée fermée" suite={nom ? `« ${nom} »` : ""} />;
  return (
    <Mesure p={p} chiffre={`${String(note).replace(".", ",")} sur 5`} suite={`${nombre(n)} avis${nom ? ` · « ${nom} »` : ""}`} badge={d.simule ? "simulé" : null}>
      <Jauge min={1} max={5} zones={[{ de: 1, a: 3.5, statut: "alerte" }, { de: 3.5, a: 4, statut: "a_voir" }, { de: 4, a: 5, statut: "ok" }]} marques={[{ valeur: note, texte: String(note).replace(".", ","), statut: p.statut }]} graduations={[1, 2, 3, 4, 5]} />
    </Mesure>
  );
}

function PoidsDuLoyer({ p }) {
  if (!p) return <Mesure p={{ cle: "comptes", libelle: "Poids du loyer", statut: "vide", resultat: "Relancez l'outil pour lire les comptes." }} />;
  const d = p.detail || {};
  const resultat = d.resultat_net == null ? "" : d.resultat_net < 0 ? ` · perte de ${euros(-d.resultat_net)}` : ` · résultat ${euros(d.resultat_net)}`;
  if (d.taux != null) {
    const max = Math.max(25, Math.ceil(d.taux / 5) * 5 + 5);
    const mot = d.taux < 0.1 ? "moins de 0,1 %" : pct(d.taux);
    return (
      <Mesure p={p} chiffre={mot} suite={`du chiffre d'affaires · CA ${euros(d.chiffre_affaires)} en ${d.exercice}${resultat}`}>
        <Jauge min={0} max={max} unite={(v) => `${v} %`} zones={[{ de: 0, a: 10, statut: "ok" }, { de: 10, a: 15, statut: "a_voir" }, { de: 15, a: max, statut: "alerte" }]} marques={[{ valeur: d.taux, texte: mot, statut: p.statut }]} graduations={[0, 10, 15, max]} />
      </Mesure>
    );
  }
  if (d.exercice && d.chiffre_affaires) return <Mesure p={p} chiffre={`CA ${euros(d.chiffre_affaires)}`} suite={`en ${d.exercice}${resultat} · loyer manquant dans le dossier`} />;
  if (d.exercice) return <Mesure p={p} chiffre="CA confidentiel" suite={`en ${d.exercice}${resultat}`} />;
  return (
    <Mesure p={p}>
      {/^Comptes non publiés/.test(p.resultat || "") && <p className="m-0 text-[12.5px] text-brume">Un commerce sur dix publie des comptes récents ; les entreprises individuelles jamais.</p>}
    </Mesure>
  );
}

/** Locataire : l'identité de la société, puis trois mesures de même poids (procédures, avis clients, poids du loyer). */
function BlocLocataire({ pts }) {
  return (
    <div className={GRILLE[1]}>
      <div className={CELLULE}><Identite p={pts.societe} /></div>
      <div className={GRILLE[3]}>
        <div className={CELLULE}><Procedures p={pts.procedures} /></div>
        <div className={CELLULE}><AvisClients p={pts.avis} /></div>
        <div className={CELLULE}><PoidsDuLoyer p={pts.comptes} /></div>
      </div>
    </div>
  );
}

// --- Les autres outils ------------------------------------------------------------------------------------------------

const ECHELLE = { rue: "Rue", quartier: "Quartier", ville: "Ville" };

/** Une partie du Loyer ou du Prix, au dessin de `Mesure` (point, libellé, chiffre en 20 px, jugement), le chiffre teinté par l'état. */
const PartieLoyer = ({ statut, libelle, chiffre, suite = null, classe = "text-encre" }) => (
  <div className="flex items-start gap-2.5">
    <Point statut={statut} className="mt-[9px]" />
    <p className="m-0 min-w-0 leading-[1.4]">
      <span className="text-[12.5px] text-brume">{libelle}</span><br />
      <span className={`text-[20px] tabular-nums ${classe}`}>{chiffre}</span>
      {suite && <span className="text-[13px] text-ardoise"> {suite}</span>}
    </p>
  </div>
);

/**
 * Loyer (12 nov. 2026, Jules : « je ne lis pas nettement 74 % au-dessus du marché », « je ne vais pas cliquer sur
 * source ») : deux cases séparées, le loyer du bien puis son écart au marché, puis les fourchettes, la source en bas à
 * droite. L'écart se calcule comme `jugerLoyer` (server/outils/lancements.js) ; la couleur suit le point du serveur.
 */
function BlocLoyer({ pts }) {
  const p = pts.loyer_marche;
  const d = p?.detail || {};
  const niveaux = Object.entries(d.niveaux || {}).filter(([, n]) => n);
  if (!p || p.statut === "vide" || !(d.marche_m2 > 0)) return <div className={CELLULE}><Mesure p={p} sansLibelle /></div>;
  const ecart = d.loyer_m2 > 0 ? Math.round((d.loyer_m2 / d.marche_m2 - 1) * 100) : null;
  const couleur = ecart == null ? "text-brume" : p.statut === "alerte" ? "text-alerte" : p.statut === "a_voir" ? "text-menthe" : "text-encre";
  const ancienne = String(p.resultat || "").match(/lecture Equimmox du .+$/)?.[0];
  return (
    <div className={GRILLE[1]}>
      <div className={GRILLE[2]}>
        <div className={CELLULE}><PartieLoyer statut={d.loyer_m2 > 0 ? "ok" : "vide"} libelle="Le bien" chiffre={d.loyer_m2 > 0 ? `${eurosM2(d.loyer_m2)}/an` : "—"} classe={d.loyer_m2 > 0 ? "text-encre" : "text-brume"} /></div>
        <div className={CELLULE}><PartieLoyer statut={p.statut} libelle="Face au marché" chiffre={ecart == null ? "—" : ecart === 0 ? "au marché" : `${ecart > 0 ? "+" : "−"}${Math.abs(ecart)} %`} suite={ecart == null ? null : Math.abs(ecart) <= 15 ? "dans le marché" : ecart > 0 ? "risque de baisse au renouvellement" : "marge à la hausse au renouvellement"} classe={couleur} /></div>
      </div>
      <div className={CELLULE}>
        {niveaux.length > 0 && <Fourchettes lignes={niveaux.map(([k, n]) => ({ nom: ECHELLE[k] || k, bas: n.basse, moyenne: n.moyenne, haut: n.haute }))} bien={d.loyer_m2 ?? null} unite={(v) => `${v} €/m²`} />}
        {/* Plus de ligne « Chiffres d'Equimmox tels quels » ni de « Source : » en clair (12 nov. 2026, Jules) : la source
            passe dans le « i », la page lue s'ouvre par « Voir source ». */}
        <Source lien={p.lien} texte={`Source : ${p.source || "Equimmox"}, baux de commerce existants${ancienne ? ` · ${ancienne}` : ""}`} />
      </div>
    </div>
  );
}

function BlocPrix({ pts }) {
  const v = pts.verdict_prix;
  const r = pts.rendement;
  const c = v?.detail?.comparaison;
  const cap = r?.detail?.capitalisation;
  const lu = String(r?.resultat || "").match(/^(\d+(?:,\d+)?) %/)?.[1];
  const rendement = cap?.rendement_affiche ?? (lu != null ? Number(lu.replace(",", ".")) : null);
  const taux = cap?.taux ?? null;
  const jauge = Number.isFinite(rendement) && Number.isFinite(taux);
  const bas = jauge ? Math.max(0, Math.floor(Math.min(rendement, taux) - 2)) : 0;
  const haut = jauge ? Math.ceil(Math.max(rendement, taux) + 2) : 10;
  const nuage = c && <PointsSurAxe points={(c.ventes || []).map((s) => s.prix_m2).filter(Number.isFinite)} boite={c.prix_m2 || null} bien={c.bien_m2 ?? null} unite={(n) => eurosM2(n)} />;
  const couleur = v?.statut === "alerte" ? "text-alerte" : v?.statut === "a_voir" ? "text-menthe" : "text-encre";
  // « Voir source » ouvre l'image des ventes comparées (server/outils/releve-dvf.js), le « i » dit lesquelles.
  const sourceVentes = c ? `Source : DVF, actes des notaires (fichiers publiés par Etalab) · ${c.n} vente${c.n > 1 ? "s" : ""} de locaux commerciaux ${c.cercle === "même rue" ? "dans la même rue" : `à ${c.cercle}`}${c.annees ? `, sur ${c.annees} ans` : ""}` : null;
  // Prix (12 nov. 2026, Jules : « pareil que le Loyer, divisé en deux ») : à gauche, plus large, « Le bien » et « Face au
  // marché » côte à côte puis les ventes ; à droite, plus étroit, le rendement en chiffre seul et sa jauge.
  return (
    <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] [&>*]:border-trait [&>*+*]:border-t lg:[&>*:nth-child(-n+2)]:border-t-0 lg:[&>*:nth-child(2n)]:border-l">
      {c && c.bien_m2 > 0 ? (
        <div className={GRILLE[1]}>
          <div className={GRILLE[2]}>
            <div className={CELLULE}><PartieLoyer statut="ok" libelle="Le bien" chiffre={`${eurosM2(c.bien_m2)}`} /></div>
            <div className={CELLULE}><PartieLoyer statut={v.statut} libelle="Face au marché" chiffre={c.ecart == null ? "—" : c.ecart === 0 ? "au marché" : `${c.ecart > 0 ? "+" : "−"}${Math.abs(c.ecart)} %`} suite={v.detail?.verdict?.mot || null} classe={couleur} /></div>
          </div>
          <div className={CELLULE}>{nuage}<Source lien={v.lien} texte={sourceVentes} /></div>
        </div>
      ) : (
        <div className={CELLULE}><Mesure p={v}>{nuage}</Mesure></div>
      )}
      <div className={CELLULE}>
        <Mesure p={r} suite="">{jauge && <Jauge min={bas} max={haut} unite={(x) => pct(x, 2)} zones={[{ de: bas, a: taux - 0.75, statut: "alerte" }, { de: taux - 0.75, a: taux - 0.25, statut: "a_voir" }, { de: taux - 0.25, a: haut, statut: "ok" }]} marques={[{ valeur: rendement, texte: `le bien, ${pct(rendement, 2)}`, statut: r.statut }, { valeur: taux, texte: `marché ${pct(taux, 2)}`, sourd: true }]} graduations={[bas, taux, haut]} />}</Mesure>
      </div>
    </div>
  );
}

/**
 * Une partie de l'Emplacement (12 nov. 2026, Jules, sur une image ; « même taille que les autres ») : le point et le
 * libellé en 12,5 px `brume`, le « i » de la source en haut à droite ; le chiffre en 20 px avec ce qui s'y accroche
 * (`a_cote`), sa phrase dessous en 13 px `ardoise`, puis le visuel.
 */
function PartieEmplacement({ p, chiffre, a_cote = null, sous = null, lien, source, children }) {
  if (!p) return null;
  if (p.statut === "vide") return <Mesure p={p} />;
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 flex items-center gap-2.5 text-[12.5px] text-brume"><Point statut={p.statut} />{p.libelle}</p>
        <Source lien={lien === undefined ? p.lien : lien} texte={source ?? sourceDe(p)} />
      </div>
      {(chiffre != null || sous) && <div className="flex flex-col gap-1">
        {chiffre != null && <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[20px] leading-[1.4] tabular-nums text-encre">{chiffre}</span>
          {a_cote}
        </p>}
        {sous && <p className="m-0 text-[13px] text-ardoise">{sous}</p>}
      </div>}
      {children}
    </>
  );
}

function BlocEmplacement({ pts, rue }) {
  const parts = rue?.passage?.parts || null;
  const t = pts.vacance?.detail?.taux;
  const maxVac = Math.max(30, Math.ceil(((t?.taux || 0) + 5) / 10) * 10);
  const part = rue?.rue?.part_enseignes_pct;
  const historique = [...(rue?.local?.historique || [])].sort((a, b) => String(b.ouvert || "").localeCompare(String(a.ouvert || ""))).slice(0, 6);
  // Le passage : « Voir source » ouvre la photo Street View que l'IA a lue le long de la rue (server/outils/rue.js).
  const photo = rue?.street_view?.photos?.rue || null;
  const sourcePassage = `Indice Klocka, pas un comptage. Sources : commerces et enseignes du registre SIRENE, transports à 300 m par Google Maps, type de voie par OpenStreetMap${photo ? `, photo Street View lue par l'IA${rue.street_view.date ? ` (prise de vue de ${rue.street_view.date})` : ""}` : ""}.`;
  // Les phrases du serveur, redites pour l'image : « 10 / 10 (provisoire : …) », « 6 exploitants en dix ans pour 4
  // cellules : local stable », « 9,3 % sur la rue (4 vides sur 43 locaux) : … ».
  const passage = String(pts.passage?.resultat || "");
  const note = passage.match(/^(\d+(?:,\d+)?)\s*\/\s*10/)?.[1];
  const lus = parts ? PARTS.filter(([k]) => parts[k] != null).length : null;
  const rotation = String(pts.rotation?.resultat || "").match(/^(\d+ exploitants?)\s+(.*)$/);
  const vacance = String(pts.vacance?.resultat || "");
  const vides = vacance.match(/\((\d+) vides? sur (\d+) locaux\)/);
  const reserve = vacance.split(" : ").slice(1).join(" : ");
  const cotes = (rue?.rue?.cellules || []).reduce((acc, c) => { const k = Number(c.numero) % 2 === 0 ? "pair" : "impair"; const n = Number(c.numero); if (Number.isFinite(n)) acc[k] = [Math.min(acc[k]?.[0] ?? n, n), Math.max(acc[k]?.[1] ?? n, n)]; return acc; }, {});
  const noms = rue?.rue?.noms_enseignes || [];
  return (
    <div className={GRILLE[2]}>
      <div className={CELLULE}>
        <PartieEmplacement p={pts.passage} lien={photo} source={sourcePassage} chiffre={note ? `${note}/10` : teteEtSuite(passage)[0]}
          a_cote={<>{/provisoire/.test(passage) && <span className="rounded-full border border-menthe/50 px-1.5 text-[11px] text-menthe">provisoire</span>}{lus != null && <span className="text-[13px] text-ardoise">{lus} critère{lus > 1 ? "s" : ""} lu{lus > 1 ? "s" : ""} sur {PARTS.length}</span>}</>}>
          {parts && <div className="pt-2"><Barres largeurLibelle="minmax(0,190px)" lignes={PARTS.map(([k, nom, max]) => ({ nom, valeur: parts[k] != null ? parts[k] : null, max }))} max={3.5} format={(v, l) => `${String(v).replace(".", ",")} / ${String(l.max).replace(".", ",")}`} /></div>}
        </PartieEmplacement>
      </div>
      <div className={CELLULE}>
        <PartieEmplacement p={pts.rotation} chiffre={rotation ? rotation[1] : teteEtSuite(pts.rotation?.resultat)[0]} sous={rotation ? rotation[2].replace(" : ", " · ") : null}>
          {historique.length > 0 && <Frise lignes={historique.map((h) => ({ nom: h.nom, de: h.ouvert, a: h.ferme || null, actif: !h.ferme }))} />}
        </PartieEmplacement>
      </div>
      <div className={CELLULE}>
        <PartieEmplacement p={pts.vacance} chiffre={t?.taux != null ? `${String(t.taux).replace(".", ",")} %` : teteEtSuite(vacance)[0]}
          sous={vides ? `${vides[1]} ${Number(vides[1]) > 1 ? "locaux vides" : "local vide"} sur ${vides[2]} dans la rue${reserve ? ` · ${reserve}` : ""}` : null}>
          {t?.taux != null && <div className="mt-auto pt-6"><JaugeFine min={0} max={maxVac} valeur={t.taux} unite={(v) => `${v} %`} zones={[{ de: 0, a: 10, statut: "ok" }, { de: 10, a: 20, statut: "a_voir" }, { de: 20, a: maxVac, statut: "alerte" }]} graduations={[0, 10, 20, maxVac]} /></div>}
          {(cotes.impair || cotes.pair) && <p className="m-0 pt-4 text-[12.5px] text-ardoise">{[cotes.impair && `Côté impair n° ${cotes.impair[0]} à ${cotes.impair[1]}`, cotes.pair && `côté pair n° ${cotes.pair[0]} à ${cotes.pair[1]}`].filter(Boolean).join(" · ")}</p>}
        </PartieEmplacement>
      </div>
      <div className={CELLULE}>
        <PartieEmplacement p={pts.enseignes} chiffre={null}>
          {part != null && (
            <div className="flex items-center gap-8 py-2 max-md:gap-5">
              <Anneau part={part} taille={96} epaisseur={10} />
              <p className="m-0 text-[13px] leading-[1.5] text-ardoise">des commerces ouverts de la rue sont des <span className="text-encre">enseignes nationales</span>.</p>
            </div>
          )}
          {noms.length > 0 && <div className="mt-auto flex flex-wrap gap-2 pt-2">{noms.slice(0, 8).map((n) => <span key={n} className="rounded-full border border-trait px-2.5 py-0.5 text-[12.5px] text-craie">{n}</span>)}{noms.length > 8 && <span className="self-center px-1 text-[12.5px] text-brume">+{noms.length - 8}</span>}</div>}
        </PartieEmplacement>
      </div>
    </div>
  );
}

function BlocVille({ pts }) {
  const c = pts.population?.detail;
  const rev = pts.revenu?.detail?.revenu;
  const v = rev ? Number(rev.valeur_euros_an) : null;
  const ch = pts.chomage?.detail?.chomage;
  const tx = ch ? Number(String(ch.taux_pct).replace(",", ".")) : null;
  return (
    <div className={GRILLE[3]}>
      <div className={CELLULE}>
        <Mesure p={pts.population}>{c?.surface_km2 && <p className="m-0 text-[12.5px] text-ardoise">{nombre(c.surface_km2)} km² · {nombre(c.densite_km2)} habitants / km²{c.departement ? ` · ${c.departement}` : ""}</p>}</Mesure>
      </div>
      <div className={CELLULE}>
        <Mesure p={pts.revenu} visuelEnBas>{Number.isFinite(v) && <Jauge min={10000} max={Math.max(40000, Math.ceil(v / 5000) * 5000 + 5000)} unite={(x) => `${nombre(Math.round(x / 1000))} k€`} zones={[{ de: 10000, a: 21000, statut: "a_voir" }, { de: 21000, a: 60000, statut: "ok" }]} marques={[{ valeur: v, texte: `${nombre(Math.round(v))} €`, statut: pts.revenu.statut }]} graduations={[10000, 21000, 30000, 40000]} />}</Mesure>
      </div>
      <div className={CELLULE}>
        <Mesure p={pts.chomage} visuelEnBas>{Number.isFinite(tx) && <Jauge min={0} max={Math.max(15, Math.ceil(tx) + 3)} unite={(x) => `${String(x).replace(".", ",")} %`} zones={[{ de: 0, a: 8, statut: "ok" }, { de: 8, a: 11, statut: "a_voir" }, { de: 11, a: 30, statut: "alerte" }]} marques={[{ valeur: tx, texte: `${String(ch.taux_pct).replace(".", ",")} %`, statut: pts.chomage.statut }]} graduations={[0, 8, 11, Math.max(15, Math.ceil(tx) + 3)]} />}</Mesure>
      </div>
    </div>
  );
}

const BLOCS = { locataire: BlocLocataire, loyer: BlocLoyer, prix: BlocPrix, emplacement: BlocEmplacement, ville: BlocVille };

export default function MarcheAffine({ dealId, index = 0, apercu = false }) {
  const queryClient = useQueryClient();
  const q = useOutilsDossier(dealId, index);
  const lancer = useMutation({
    mutationFn: (outils) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/outils`, { body: outils ? { outils } : {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }),
    onError: (e) => toast.error(e?.data?.error || e?.message || "Les outils n'ont pas pu partir"),
  });
  const siren = useMutation({
    mutationFn: (valeur) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/locataire-siren`, { body: { siren: valeur } }),
    onSuccess: (r) => { toast.success(r.siren ? "Société fixée : l'outil Locataire repart avec elle" : "Société retirée : l'outil cherche à nouveau"); queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }); },
    onError: (e) => toast.error(e?.data?.error || e?.message || "La société n'a pas pu être fixée"),
  });
  const verifier = useMutation({
    mutationFn: ({ id, verifie }) => base44.request("POST", `/api/outils/lancements/${id}/verifier`, { body: { verifie } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }),
  });
  // Un dossier créé avant les outils n'a jamais été lancé : la première ouverture le fait.
  const lanceUneFois = useRef(false);
  useEffect(() => {
    if (apercu || !q.data || lanceUneFois.current) return;
    if (q.data.outils.some((o) => o.lancement)) return;
    if (!q.data.entrees?.adresse && !q.data.entrees?.locataire) return;
    lanceUneFois.current = true;
    lancer.mutate(null);
  }, [q.data, apercu]);
  // L'onglet ouvert : ce qui est arrivé est vu, la pastille « nouveau » s'éteint.
  useEffect(() => { if (!apercu && q.data) marquerVu(dealId, q.data); }, [q.data, dealId, apercu]);

  if (q.isLoading) return <div className="flex items-center gap-2 py-8 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  if (q.isError) return <p className="py-8 text-[13.5px] text-alerte">{q.error?.message || "Les outils ne se lisent pas."}</p>;
  const { outils = [], entrees = {} } = q.data || {};

  return (
    <TooltipProvider delayDuration={100}>
    <div className="flex flex-col">
      {!entrees.adresse && !entrees.locataire && <p className="m-0 mb-6 text-[12.5px] text-brume">Ajoutez l'adresse ou le locataire dans la préanalyse : les outils partiront seuls.</p>}
      {/* Un bloc par outil : son nom en 20 px, puis une carte au seul bord `trait`, sans fond, ses parties séparées d'un filet. */}
      <div className="flex flex-col gap-8">
        {outils.map((o) => {
          const Bloc = BLOCS[o.cle];
          const l = o.lancement;
          const points = l?.resultat?.points || [];
          const pts = Object.fromEntries(points.map((p) => [p.cle, p]));
          return (
            <section key={o.cle} id={`outil-${o.cle}`} className="flex scroll-mt-6 flex-col gap-3">
              <Entete o={o} apercu={apercu} onRelancer={(c) => lancer.mutate(c)} onVerifier={(id, v) => verifier.mutate({ id, verifie: v })} relance={lancer.isPending} />
              {/* Les blocs sur du verre (12 nov. 2026, Jules : essayé sur le Loyer, puis « pareil dans les autres parties »). */}
              <div className={VERRE}>
                {points.length ? <Bloc pts={pts} rue={l.resultat.rue} onSiren={apercu ? null : (v) => siren.mutate(v)} /> : <p className="m-0 p-5 text-[13.5px] text-brume max-md:p-4">{l?.statut === "en_cours" ? "Lecture en cours ; les autres outils s'affichent déjà." : l?.statut === "echec" ? `Échec : ${l.erreur || "la lecture n'a pas abouti"}` : "Pas encore lancé."}</p>}
              </div>
            </section>
          );
        })}
      </div>
      {!apercu && <button type="button" onClick={() => lancer.mutate(null)} disabled={lancer.isPending} className="mt-6 inline-flex h-8 items-center gap-1.5 self-start rounded-full border border-trait px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
        {lancer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}Tout relancer
      </button>}
    </div>
    </TooltipProvider>
  );
}
