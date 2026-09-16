import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useEdition, ValeurEditable } from "./EditionEnPlace";
import { InfoDot } from "./SecteurChiffres";
import { Visionneuse } from "@/components/preanalyse/AnalyseDocuments";
import { ChiffresStrip } from "./SecteurChiffres";

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

/** La frise du bail : prise d'effet, échéance, et le point d'aujourd'hui. */
export function FriseBail({ frise, onSource }) {
  if (!frise?.debut && !frise?.fin) return null;
  const debut = frise.debut ? new Date(frise.debut).getTime() : null;
  const fin = frise.fin ? new Date(frise.fin).getTime() : null;
  const part = debut && fin && fin > debut ? Math.min(1, Math.max(0, (Date.now() - debut) / (fin - debut))) : null;
  return (
    <div className="rounded-xl border border-bord bg-surface px-6 pt-4 pb-5 mb-5">
      {frise.source && (
        <div className="flex justify-end">
          <button type="button" onClick={() => onSource({ ...frise.source, titre: "Dates du bail" })} className="group">
            <RenvoiPiece source={frise.source} />
          </button>
        </div>
      )}
      <div className="relative h-[3px] rounded-full bg-trait mt-8 mb-2">
        {part != null && <div className="absolute inset-y-0 left-0 rounded-full bg-menthe/60" style={{ width: `${part * 100}%` }} />}
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-menthe" />
        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-menthe bg-fond" />
        {part != null && (
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${part * 100}%` }}>
            <span className="block w-3.5 h-3.5 rounded-full bg-encre ring-4 ring-menthe/30" />
            <span className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] whitespace-nowrap text-[11px] text-encre">Aujourd'hui</span>
          </span>
        )}
      </div>
      <div className="flex justify-between gap-6 mt-3" style={{ fontVariantNumeric: "tabular-nums" }}>
        <div>
          <div className="text-[15px] text-encre">{frise.debut ? dateFr(frise.debut) : "—"}</div>
          <div className="text-[12.5px] text-ardoise">Prise d'effet</div>
        </div>
        <div className="text-right">
          <div className="text-[15px] text-encre">{frise.fin ? dateFr(frise.fin) : "—"}</div>
          <div className="text-[12.5px] text-ardoise">Échéance</div>
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
 * L'analyse du bail, point par point. Le texte vient de la lecture des pièces
 * (projet-cases), corrigé par ce que le dossier porte (bail_analyse). Un point
 * sans texte reste affiché : on voit ce qu'il reste à lire.
 */
function AnalyseBail({ lignes, project, onSource }) {
  const edition = useEdition();
  const lues = new Map((lignes || []).map((l) => [l.id, l]));
  const corrections = project?.bail_analyse || {};
  return (
    <ol className="m-0 list-none p-0">
      {SECTIONS_BAIL.map(([id, titre], i) => {
        const lu = lues.get(id);
        const texte = (corrections[id] || "").trim() || lu?.texte || null;
        if (!texte && !edition?.onChamp) return null;
        const source = lu?.source || null;
        return (
          <li key={id} className={`py-4 ${i > 0 ? "border-t border-trait" : ""}`}>
            <div className="flex items-baseline gap-3">
              <span className="alx-mont w-7 flex-shrink-0 text-[12px] tabular-nums text-menthe">{i + 1}.</span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-ardoise">{titre}</span>
              {source && (
                <button type="button" onClick={() => onSource({ ...source, titre })} className="ml-auto flex-shrink-0" style={{ background: "transparent" }}>
                  <RenvoiPiece source={source} />
                </button>
              )}
            </div>
            <p className={`m-0 mt-1.5 pl-10 text-[13.5px] leading-[1.7] ${texte ? "text-encre" : "text-brume"}`}>{texte || "—"}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** L'onglet Analyse du bail : la frise, puis Résumé ou Analyse du bail. */
export function VueBail({ cases, project, onSource }) {
  const [vue, setVue] = useState("resume");
  return (
    <>
      <FriseBail frise={cases?.frise} onSource={onSource} />
      <div className="inline-flex rounded-full border border-bord-doux p-0.5 mb-5">
        {[["resume", "Résumé"], ["analyse", "Analyse du bail"]].map(([id, mot]) => (
          <button key={id} type="button" onClick={() => setVue(id)}
            className={`px-4 py-1.5 rounded-full text-[12.5px] transition-colors ${vue === id ? "bg-menthe text-sur-menthe font-semibold" : "text-ardoise hover:text-encre"}`}>
            {mot}
          </button>
        ))}
      </div>
      {vue === "resume"
        ? <BandesCases zone="bail" cases={cases?.bail} project={project} titre="Le résumé du bail" />
        : <AnalyseBail lignes={cases?.analyse} project={project} onSource={onSource} />}
    </>
  );
}
