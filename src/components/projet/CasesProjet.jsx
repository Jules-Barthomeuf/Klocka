import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J } from "@/design/jetons";
import { useEdition, ValeurEditable } from "./EditionEnPlace";
import { InfoDot, nf } from "./SecteurChiffres";
import { Visionneuse } from "@/components/preanalyse/AnalyseDocuments";
import { ChiffresStrip } from "./SecteurChiffres";
import { dureeJusque } from "./durees";

// Les cases de la page projet : un titre, une valeur courte, un détail, un
// « i » pour le texte du bail, et au clic la pièce ouverte à la bonne page.
// Les valeurs viennent du dossier (server/projet-cases.js) ; l'équipe les
// corrige (cases_forcees) et en ajoute (champs_personnalises, style « case »).

export function useCasesProjet(project, isPublic) {
  const { data } = useQuery({
    queryKey: ["cases-projet", project?.id],
    queryFn: () => base44.request("GET", `/api/projets/${project.id}/cases`),
    enabled: !isPublic && !!project?.id && project.id !== "apercu",
    staleTime: 60_000,
    retry: false,
  });
  return isPublic ? project?.cases || null : data || null;
}

/** Le document cité, dans un volet à droite, ouvert à la page. */
export function PanneauPiece({ piece, onFermer }) {
  if (!piece) return null;
  return (
    <div className="panneau-source fixed inset-y-0 right-0 z-[60] w-full sm:w-[720px] bg-fond border-l border-bord shadow-[-24px_0_60px_rgba(0,0,0,.6)] p-4">
      <Visionneuse
        extraction={{ document_id: piece.document_id, document_nom: piece.document_nom, document_url: piece.document_url }}
        ligne={{ page: piece.page, citation: piece.citation, element: piece.titre }}
        onFermer={onFermer}
      />
    </div>
  );
}

/** « 4 000 € », comme le serveur les écrit. */
const euros = (n) => `${nf.format(Math.round(Number(n) || 0))} €`;

const nomPiece = (source) => source.categorie || source.document_nom.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[_]+/g, " ").trim();

function RenvoiPiece({ source }) {
  return (
    <span className="flex items-center gap-1 min-w-0 max-w-full text-[11px] text-brume group-hover:text-menthe-clair transition-colors">
      <FileText className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{nomPiece(source)}{source.page ? ` · p. ${source.page}` : ""}</span>
    </span>
  );
}

const fusionner = (base, forcee) => ({
  ...base,
  valeur: forcee?.valeur || base.valeur,
  detail: forcee?.detail ?? base.detail,
  info: forcee?.info || base.info,
});

function Case({ titre, valeur, detail, info, source, onSource, champ, edition }) {
  const cliquable = !!source && !edition?.onChamp;
  const Corps = cliquable ? "button" : "div";
  return (
    <Corps
      type={cliquable ? "button" : undefined}
      onClick={cliquable ? () => onSource({ ...source, titre }) : undefined}
      className={`group relative text-left rounded-xl border border-bord bg-surface px-5 py-4 min-h-[112px] flex flex-col transition-colors
        ${cliquable ? "hover:border-menthe/60 cursor-pointer" : ""}`}
    >
      <span className="flex items-center gap-1.5 text-[11px] tracking-[0.16em] uppercase text-ardoise">
        {champ ? <ValeurEditable champ={`${champ}.titre`} type="text">{titre}</ValeurEditable> : titre}
        {info && !edition?.onChamp && (
          <span onClick={(e) => e.stopPropagation()} className="normal-case tracking-normal"><InfoDot texte={info} /></span>
        )}
      </span>
      <span className="mt-2 text-[22px] max-md:text-[18px] font-light leading-tight text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>
        {champ ? <ValeurEditable champ={`${champ}.valeur`} type="text">{valeur || "—"}</ValeurEditable> : (valeur || "—")}
      </span>
      {(detail || edition?.onChamp) && (
        <span className="mt-1 text-[12.5px] leading-[1.5] text-ardoise">
          {champ ? <ValeurEditable champ={`${champ}.detail`} type="text">{detail || (edition?.onChamp ? "+ détail" : "")}</ValeurEditable> : detail}
        </span>
      )}
      {edition?.onChamp && champ && (
        <span className="mt-2 text-[11px] text-brume">
          <ValeurEditable champ={`${champ}.info`} type="text">{info ? "Info : modifier" : "+ info au survol"}</ValeurEditable>
        </span>
      )}
      {cliquable && <span className="mt-auto pt-2"><RenvoiPiece source={source} /></span>}
    </Corps>
  );
}

/**
 * La grille d'une zone. Côté client, une case sans valeur disparaît ; dans
 * l'éditeur, toutes les cases restent réservées et une case « + » en ajoute.
 */
export default function GrilleCases({ zone, cases, project, onSource }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const forcees = project?.cases_forcees || {};
  const standard = (cases || []).map((c) => ({ ...fusionner(c, forcees[`${zone}.${c.id}`]), cle: `${zone}.${c.id}` }))
    .filter((c) => enEdition || c.valeur);
  const tous = project?.champs_personnalises || [];
  const ajoutees = tous.map((c, i) => ({ ...c, i })).filter((c) => c.zone === zone && c.style === "case");

  const ajouter = () => edition.onChamp("champs_personnalises", [...tous, { id: `case-${Date.now()}`, zone, style: "case", label: "Titre", valeur: "", detail: "", info: "" }], true);
  const retirer = (i) => edition.onChamp("champs_personnalises", tous.filter((_, k) => k !== i), true);

  if (!standard.length && !ajoutees.length && !enEdition) return null;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3 max-md:gap-2.5">
      {standard.map((c) => (
        <Case key={c.cle} {...c} champ={enEdition ? `cases_forcees.${c.cle}` : null} onSource={onSource} edition={edition} />
      ))}
      {ajoutees.map((c) => (
        <div key={c.id || c.i} className="relative">
          <Case titre={c.label} valeur={c.valeur} detail={c.detail} info={c.info} edition={edition}
            champ={enEdition ? `champs_personnalises.${c.i}` : null} />
          {enEdition && (
            <button type="button" onClick={() => retirer(c.i)} aria-label="Retirer cette case" title="Retirer cette case"
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-brume hover:text-red-400">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {enEdition && (
        <button type="button" onClick={ajouter}
          className="rounded-xl border border-dashed border-bord-doux min-h-[112px] flex flex-col items-center justify-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre hover:border-bord-vif transition-colors">
          <Plus className="w-4 h-4" /> Ajouter une case
        </button>
      )}
    </div>
  );
}

// Une date en français. Une échéance saisie en toutes lettres (« 15 mars
// 2035 ») ne se relit pas en Date : on la rend telle quelle plutôt que de la
// perdre.
const dateFr = (valeur, options = { day: "numeric", month: "long", year: "numeric" }) => {
  if (!valeur) return null;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? String(valeur) : d.toLocaleDateString("fr-FR", options);
};
export { dateFr };

/**
 * Pure : les jalons de la frise. La prise d'effet, les échéances triennales
 * tant qu'elles tombent avant la fin, puis l'échéance. Un bail ferme n'a pas
 * de sortie triennale : ses jalons se réduisent aux deux bouts.
 *
 * @param {{debut?: string|null, fin?: string|null}} frise
 * @param {{maintenant?: Date, ferme?: boolean, maxi?: number}} [o]
 */
export function jalonsDuBail(frise, { maintenant = new Date(), ferme = false, maxi = 3 } = {}) {
  const debut = frise?.debut ? new Date(frise.debut) : null;
  const fin = frise?.fin ? new Date(frise.fin) : null;
  const valide = (d) => d && !Number.isNaN(d.getTime());
  if (!valide(debut) && !valide(fin)) return { jalons: [], part: null };

  const jalons = [];
  if (valide(debut)) jalons.push({ cle: "debut", date: debut, label: "Prise d'effet" });
  if (valide(debut) && valide(fin) && !ferme) {
    for (let n = 1; n <= maxi; n += 1) {
      const t = new Date(debut);
      t.setFullYear(t.getFullYear() + 3 * n);
      // Une triennale collée à l'échéance n'apprend rien : on s'arrête avant.
      if (t.getTime() >= fin.getTime() - 180 * 86400000) break;
      jalons.push({ cle: `triennale-${n}`, date: t, label: `${n === 1 ? "1re" : `${n}e`} échéance triennale` });
    }
  }
  if (valide(fin)) jalons.push({ cle: "fin", date: fin, label: "Échéance" });

  const d = valide(debut) ? debut.getTime() : null;
  const f = valide(fin) ? fin.getTime() : null;
  const part = d && f && f > d ? Math.min(1, Math.max(0, (maintenant.getTime() - d) / (f - d))) : null;
  return {
    part,
    jalons: jalons.map((j) => ({
      ...j,
      texte: dateFr(j.date.toISOString()),
      // La position sur la ligne, en part de la durée du bail.
      position: d && f && f > d ? Math.min(1, Math.max(0, (j.date.getTime() - d) / (f - d))) : null,
      passe: j.date.getTime() <= maintenant.getTime(),
    })),
  };
}

/** Pure : le bail renonce-t-il aux sorties triennales ? */
export function bailFerme(lignes) {
  const t = (lignes || []).filter((l) => ["type_bail", "duree", "resiliation"].includes(l.id)).map((l) => l.texte || "").join(" ");
  if (/triennal/i.test(t) && !/renonc|sans facult[ée]|ferme/i.test(t)) return false;
  return /\bferme\b|renonc\w*[^.]{0,40}(triennal|r[ée]siliation)|sans facult[ée] de r[ée]siliation/i.test(t);
}

function Jalon({ jalon, dernier, premier }) {
  const ancrage = premier ? "translateX(0)" : dernier ? "translateX(-100%)" : "translateX(-50%)";
  const aligne = premier ? "text-left" : dernier ? "text-right" : "text-center";
  return (
    <div className="absolute top-[26px] w-max max-w-[190px]" style={{ left: `${(jalon.position ?? 0) * 100}%`, transform: ancrage }}>
      <div className={`text-[16px] max-md:text-[14px] font-light text-encre ${aligne}`} style={{ fontVariantNumeric: "tabular-nums" }}>{jalon.texte}</div>
      <div className={`text-[12.5px] text-ardoise mt-1 ${aligne}`}>{jalon.label}</div>
    </div>
  );
}

/**
 * La carte du bail : ce qu'il reste à courir, la pièce qui le dit, et la
 * frise des échéances. Elle coiffe les deux vues de l'onglet.
 */
export function CarteBail({ frise, lignes, onSource }) {
  if (!frise?.debut && !frise?.fin) return null;
  const { jalons, part } = jalonsDuBail(frise, { ferme: bailFerme(lignes) });
  const restant = frise.fin ? dureeJusque(frise.fin, { court: true }) : null;

  return (
    <div className="rounded-2xl border border-bord bg-surface px-8 max-md:px-5 pt-6 pb-7 max-md:pb-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[11px] tracking-[0.2em] uppercase text-ardoise">Restant à courir</div>
          <div className="text-[34px] max-md:text-[26px] font-light leading-tight text-menthe-clair mt-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
            {restant || "—"}
          </div>
        </div>
        {frise.source && (
          <button type="button" onClick={() => onSource({ ...frise.source, titre: "Dates du bail" })} className="group flex-shrink-0 pt-1">
            <RenvoiPiece source={frise.source} />
          </button>
        )}
      </div>

      {/* Sur un téléphone la frise se lit de haut en bas : quatre dates côte à
          côte sur 340 px se chevauchent. */}
      <ol className="md:hidden list-none m-0 p-0 mt-6 border-l border-trait pl-5 space-y-4">
        {jalons.map((j) => (
          <li key={j.cle} className="relative">
            <span className={`absolute -left-[23px] top-1.5 w-2.5 h-2.5 rounded-full border ${j.passe ? "bg-menthe border-menthe" : "border-menthe bg-fond"}`} />
            <div className="text-[15px] font-light text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{j.texte}</div>
            <div className="text-[12.5px] text-ardoise">{j.label}</div>
          </li>
        ))}
      </ol>

      <div className="max-md:hidden relative mt-12 mb-[76px] mx-1">
        <div className="relative h-[3px] rounded-full bg-trait">
          {part != null && <div className="absolute inset-y-0 left-0 rounded-full bg-menthe" style={{ width: `${part * 100}%` }} />}
          {jalons.map((j, i) => (
            <span key={j.cle}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-[1.5px] border-menthe ${i === 0 || j.passe ? "bg-menthe" : "bg-fond"}`}
              style={{ left: `${(j.position ?? 0) * 100}%` }} />
          ))}
          {part != null && (
            <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${part * 100}%` }}>
              <span className="block w-4 h-4 rounded-full bg-encre ring-4 ring-menthe/25" />
              <span className="absolute left-0 bottom-[calc(100%+12px)] whitespace-nowrap text-[11px] tracking-[0.2em] uppercase text-ardoise">Aujourd&apos;hui</span>
            </span>
          )}
          {jalons.map((j, i) => (
            <Jalon key={j.cle} jalon={j} premier={i === 0} dernier={i === jalons.length - 1} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Le bail clause par clause : une phrase simple, et la pièce au clic. */
/**
 * Les quatorze points de l'analyse du bail, dans l'ordre d'une lecture, et
 * l'identifiant sous lequel le serveur lit chacun dans les pièces.
 */
export const SECTIONS_BAIL = [
  ["type_bail", "Type de bail"],
  ["dates_bail", "Échéance du bail (date de début, date de fin)"],
  ["parties", "Les parties"],
  ["loyer", "Conditions financières : loyer de signature"],
  ["conditions_exceptionnelles", "Conditions financières exceptionnelles"],
  ["mode_reglement", "Mode de règlement des loyers"],
  ["tva_loyer", "Loyer assujetti à TVA"],
  ["destination", "Destination du bail"],
  ["cession", "Conditions de cession"],
  ["indexation", "Indexation"],
  ["depot", "Dépôt de garantie"],
  ["pas_de_porte", "Pas de porte"],
  ["charges", "Charges refacturées"],
  ["taxe_fonciere", "Taxes refacturées"],
];

/**
 * Les cases d'une zone en bandes, comme Marché : la valeur en grand, le
 * libellé dessous, le détail derrière l'info au survol. En édition, les cases
 * vides restent là.
 */
export function BandesCases({ zone, cases, project, titre = null }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const forcees = project?.cases_forcees || {};
  const liste = (cases || [])
    .map((c) => fusionner(c, forcees[`${zone}.${c.id}`]))
    .filter((c) => enEdition || c.valeur)
    .map((c) => ({
      valeur: c.valeur || "—",
      label: c.titre,
      accent: c.valeur ? undefined : "text-brume",
      info: [c.detail, c.info].filter(Boolean).join(" · ") || null,
    }));
  if (!liste.length) return null;
  return (
    <div>
      {titre && <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">{titre}</div>}
      <ChiffresStrip chiffres={liste} />
    </div>
  );
}

/**
 * Les trois colonnes de l'assemblée générale : ce qui est voté, ce qui se
 * discute, ce qui ne l'est pas encore. Trois cases côte à côte se lisaient
 * comme trois chiffres sans lien ; un tableau les met en regard, et la couleur
 * dit l'état — le vert pour ce qui est acté, l'ambre pour ce qui se discute,
 * le gris pour ce qui attend.
 */
const COLONNES_AG = [
  ["travaux_votes", "Travaux votés", J["menthe"]],
  ["travaux_discussion", "Travaux en discussion", J["ambre"]],
  ["resolutions_non_votees", "Résolutions non votées", J["ardoise"]],
];

export function TableauAG({ cases, project }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const forcees = project?.cases_forcees || {};
  const lu = (id) => {
    const brut = (cases || []).find((c) => c.id === id);
    return brut ? fusionner(brut, forcees[`copropriete.${id}`]) : null;
  };
  const colonnes = COLONNES_AG.map(([id, titre, teinte]) => ({ id, titre, teinte, c: lu(id) }));
  if (!enEdition && !colonnes.some((x) => x.c?.valeur)) return null;

  return (
    <div className="overflow-x-auto rounded-[16px] border border-trait">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr>
            {colonnes.map(({ id, titre, teinte }) => (
              <th key={id} className="border-b border-trait px-5 py-3.5 align-bottom font-normal" style={{ width: "33.33%" }}>
                <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: teinte }}>
                  <span className="h-[3px] w-5 rounded-full" style={{ background: teinte }} />
                  {titre}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {colonnes.map(({ id, c }) => (
              <td key={id} className="px-5 py-4 align-top text-[13.5px] leading-[1.6]" style={{ color: c?.valeur ? undefined : undefined }}>
                <span className={c?.valeur ? "text-craie" : "text-brume"}>{c?.valeur || "—"}</span>
                {(c?.detail || c?.info) && (
                  <span className="mt-1.5 block text-[12px] text-brume">{[c.detail, c.info].filter(Boolean).join(" · ")}</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pure : le nombre de mois de loyer que représente le dépôt de garantie, quand
 * il tombe juste. « 8 000 € » sur un loyer de 48 000 € l'an, c'est deux mois.
 */
export function moisDeDepot(depot, loyerAnnuel) {
  const d = Number(depot) || 0;
  const l = Number(loyerAnnuel) || 0;
  if (d <= 0 || l <= 0) return null;
  const mois = d / (l / 12);
  const entier = Math.round(mois);
  if (entier < 1 || entier > 24 || Math.abs(mois - entier) > 0.06) return null;
  return entier;
}

/** Le premier nombre d'une valeur affichée : « 8 000 € » rend 8000. */
const nombreDe = (valeur) => {
  const m = String(valeur || "").replace(/[\u00a0\u202f\s]/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : 0;
};

function LigneFiscalite({ c, onSource }) {
  const cliquable = !!c.source;
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-t border-trait first:border-t-0">
      <span className="flex items-center gap-2 text-[14.5px] max-md:text-[13.5px] text-craie">
        {c.titre}
        <InfoDot texte={c.info || c.detail} />
      </span>
      {cliquable ? (
        <button type="button" onClick={() => onSource({ ...c.source, titre: c.titre })}
          className="flex-shrink-0 text-[13px] px-4 py-1.5 rounded-full bg-encre/[0.06] text-craie hover:text-encre hover:bg-encre/[0.1] transition-colors">
          {c.valeur || "—"}
        </button>
      ) : (
        <span className={`flex-shrink-0 text-[13px] px-4 py-1.5 rounded-full bg-encre/[0.06] ${c.valeur ? "text-craie" : "text-brume"}`}>{c.valeur || "—"}</span>
      )}
    </div>
  );
}

/**
 * Le résumé du bail : le loyer en grand à gauche, ce qui s'y ajoute (charges,
 * TVA, taxes) à droite. Les huit cases du serveur se répartissent entre les
 * deux ; l'échéance, elle, vit dans la frise.
 */
export function ResumeBail({ cases, project, onSource }) {
  const forcees = project?.cases_forcees || {};
  const lu = (id) => {
    const brut = (cases?.bail || []).find((c) => c.id === id);
    return brut ? fusionner(brut, forcees[`bail.${id}`]) : null;
  };
  const loyer = lu("loyer_actuel");
  const signature = lu("loyer_signature");
  const depot = lu("depot");
  const fiscalite = ["provision_charges", "tva", "charges_refacturees", "taxe_refacturee"].map(lu).filter((c) => c && c.valeur);

  const annuel = nombreDe(loyer?.valeur);
  const mois = annuel > 0 ? Math.round(annuel / 12) : 0;
  const nbMois = moisDeDepot(nombreDe(depot?.valeur), annuel);
  if (!loyer?.valeur && !signature?.valeur && !depot?.valeur && !fiscalite.length) return null;

  const Titre = ({ children }) => (
    <div className="text-[11px] tracking-[0.2em] uppercase text-ardoise pb-3 border-b border-trait">{children}</div>
  );
  const Sous = ({ c, complement }) => (
    <div>
      <div className={`text-[22px] max-md:text-[18px] font-light leading-none ${c?.valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {c?.valeur || "—"}
      </div>
      <div className="text-[12.5px] text-ardoise mt-2">{c?.titre}{complement ? ` · ${complement}` : ""}</div>
    </div>
  );

  return (
    <div className="grid lg:grid-cols-2 gap-10 max-md:gap-7 items-start">
      <div>
        <Titre>Le loyer</Titre>
        <div className="py-7 max-md:py-5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`text-[44px] max-md:text-[30px] font-light leading-none ${loyer?.valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              {loyer?.valeur ? loyer.valeur.replace(/\s*HT\/an$/, "") : "—"}
            </span>
            {loyer?.valeur && <span className="text-[20px] max-md:text-[16px] text-ardoise">HT/an</span>}
          </div>
          <div className="text-[12.5px] text-ardoise mt-3 flex items-center gap-1.5">
            {loyer?.titre || "Prix du loyer"}{mois > 0 ? ` · soit ${euros(mois)} HT/mois` : ""}
            <InfoDot texte={loyer?.info || loyer?.detail} />
          </div>
        </div>
        {(signature?.valeur || depot?.valeur) && (
          <div className="grid grid-cols-2 border-t border-trait pt-6">
            <div className="pr-5"><Sous c={signature} /></div>
            <div className="pl-5 border-l border-trait"><Sous c={depot} complement={nbMois ? `${nbMois} mois` : null} /></div>
          </div>
        )}
      </div>

      {fiscalite.length > 0 && (
        <div>
          <Titre>Charges &amp; fiscalité</Titre>
          <div className="mt-2">
            {fiscalite.map((c) => <LigneFiscalite key={c.id} c={c} onSource={onSource} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Pure : les clauses à afficher, dans l'ordre où le bail les présente, avec le
 * numéro et le titre de la liste de référence. Un point corrigé à la main
 * entre dans la liste même si la lecture ne l'a pas trouvé.
 *
 * @param {Array<{id:string, texte?:string, source?:object}>} lignes
 * @param {Record<string,string>} corrections
 * @param {{toutes?: boolean}} [o] toutes : garder les points encore vides
 */
export function clausesDuBail(lignes, corrections = {}, { toutes = false } = {}) {
  const rang = new Map(SECTIONS_BAIL.map(([id], i) => [id, i]));
  const lues = new Map((lignes || []).map((l) => [l.id, l]));
  const ordre = [];
  for (const l of lignes || []) if (rang.has(l.id) && !ordre.includes(l.id)) ordre.push(l.id);
  for (const [id] of SECTIONS_BAIL) {
    if (ordre.includes(id)) continue;
    if (toutes || (corrections[id] || "").trim()) ordre.push(id);
  }
  return ordre.map((id) => {
    const i = rang.get(id);
    const lu = lues.get(id);
    return {
      id,
      numero: i + 1,
      titre: SECTIONS_BAIL[i][1],
      texte: (corrections[id] || "").trim() || lu?.texte || null,
      source: lu?.source || null,
    };
  });
}

// Le résumé d'un point, quand une case du bail dit déjà la même chose en trois
// mots. Rien n'est inventé : sans case, la clause n'a pas de chapeau.
const CASE_DE_CLAUSE = {
  dates_bail: "echeance",
  loyer: "loyer_signature",
  tva_loyer: "tva",
  depot: "depot",
  charges: "charges_refacturees",
  taxe_fonciere: "taxe_refacturee",
};
const TYPES_BAIL = /bail commercial|bail d[ée]rogatoire|bail professionnel|bail pr[ée]caire|convention d'occupation pr[ée]caire|bail emphyt[ée]otique|bail [àa] construction/i;

/** Pure : le chapeau d'une clause, ou null. */
export function chapeauDeClause(id, texte, casesBail) {
  if (id === "type_bail") {
    const m = TYPES_BAIL.exec(String(texte || ""));
    return m ? m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase() : null;
  }
  const cle = CASE_DE_CLAUSE[id];
  if (!cle) return null;
  return (casesBail || []).find((c) => c.id === cle)?.valeur || null;
}

/**
 * L'analyse du bail, clause par clause : la liste à gauche, la clause ouverte
 * à droite avec la pièce qui la porte. Le texte vient de la lecture des pièces
 * (projet-cases), corrigé par ce que le dossier porte (bail_analyse).
 */
function AnalyseBail({ lignes, cases, project, onSource }) {
  const edition = useEdition();
  const clauses = clausesDuBail(lignes, project?.bail_analyse || {}, { toutes: !!edition?.onChamp });
  const [ouverte, setOuverte] = useState(0);
  if (!clauses.length) return null;
  const i = Math.min(ouverte, clauses.length - 1);
  const c = clauses[i];
  const chapeau = chapeauDeClause(c.id, c.texte, cases?.bail);

  return (
    <div className="grid lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 max-md:gap-4 items-start">
      <ol className="list-none m-0 p-0 lg:max-h-[620px] lg:overflow-y-auto">
        {clauses.map((x, k) => (
          <li key={x.id}>
            <button type="button" onClick={() => setOuverte(k)}
              className={`w-full text-left flex gap-4 px-5 py-3.5 border-l-2 transition-colors
                ${k === i ? "border-menthe bg-encre/[0.05] text-encre" : "border-transparent text-craie hover:text-encre hover:bg-encre/[0.02]"}`}>
              <span className={`text-[12px] pt-0.5 flex-shrink-0 w-4 ${k === i ? "text-menthe-clair" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{x.numero}</span>
              <span className="text-[14.5px] leading-[1.45]">{x.titre}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-bord bg-surface px-8 max-md:px-5 py-7 max-md:py-6 lg:sticky lg:top-4 min-h-[380px] flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="text-[11px] tracking-[0.2em] uppercase text-ardoise pt-1.5">Cadre juridique · Clause {c.numero}</div>
          {c.source && (
            <button type="button" onClick={() => onSource({ ...c.source, titre: c.titre })}
              className="group flex-shrink-0 px-4 py-1.5 rounded-full border border-bord-doux hover:border-menthe/60 transition-colors">
              <RenvoiPiece source={c.source} />
            </button>
          )}
        </div>

        <h3 className="text-[30px] max-md:text-[22px] font-light leading-tight text-encre mt-5 mb-0">{c.titre}</h3>
        {chapeau && <div className="text-[24px] max-md:text-[18px] font-light text-menthe-clair mt-2.5">{chapeau}</div>}

        <div className="border-t border-trait mt-6 pt-6">
          <p className={`m-0 text-[15px] max-md:text-[14px] leading-[1.8] ${c.texte ? "text-craie" : "text-brume"}`}>{c.texte || "Ce point n'a pas encore été lu dans les pièces."}</p>
        </div>

        <div className="flex items-center justify-between gap-4 mt-auto pt-8">
          <button type="button" onClick={() => setOuverte(i - 1)} disabled={i === 0}
            className="px-5 py-2 rounded-full border border-bord-doux text-[13px] text-craie hover:text-encre hover:border-bord-vif transition-colors disabled:opacity-40 disabled:hover:text-craie disabled:hover:border-bord-doux disabled:cursor-default">
            ‹ Précédente
          </button>
          <button type="button" onClick={() => setOuverte(i + 1)} disabled={i === clauses.length - 1}
            className="px-5 py-2 rounded-full border border-bord-doux text-[13px] text-craie hover:text-encre hover:border-bord-vif transition-colors disabled:opacity-40 disabled:hover:text-craie disabled:hover:border-bord-doux disabled:cursor-default">
            Suivante ›
          </button>
        </div>
      </div>
    </div>
  );
}

/** L'onglet Analyse du bail : le titre et sa bascule, la carte, puis la vue. */
export function VueBail({ cases, project, onSource, titre = "Analyse du bail" }) {
  const [vue, setVue] = useState("resume");
  return (
    <>
      <div className="flex items-start justify-between gap-6 flex-wrap mb-6 max-md:mb-4">
        <h2 className="text-[34px] max-md:text-[24px] font-light tracking-[-0.02em] leading-[1.05] text-encre mb-0">{titre}</h2>
        <div className="inline-flex rounded-full border border-bord-doux p-0.5">
          {[["resume", "Résumé"], ["analyse", "Analyse du bail"]].map(([id, mot]) => (
            <button key={id} type="button" onClick={() => setVue(id)}
              className={`px-5 py-1.5 rounded-full text-[13px] transition-colors ${vue === id ? "bg-menthe text-sur-menthe font-semibold" : "text-ardoise hover:text-encre"}`}>
              {mot}
            </button>
          ))}
        </div>
      </div>

      <CarteBail frise={cases?.frise} lignes={cases?.analyse} onSource={onSource} />

      <div className="mt-10 max-md:mt-7">
        {vue === "resume"
          ? <ResumeBail cases={cases} project={project} onSource={onSource} />
          : <AnalyseBail lignes={cases?.analyse} cases={cases} project={project} onSource={onSource} />}
      </div>
    </>
  );
}
