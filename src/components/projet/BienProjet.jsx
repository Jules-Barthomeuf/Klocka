import React from "react";
import { nf } from "./SecteurChiffres";
import { useEdition, ValeurEditable, Bloc } from "./EditionEnPlace";
import { InfoDot } from "./SecteurChiffres";
import { Carte } from "./Cartes";
import ChronologieBien from "./ChronologieBien";

// L'onglet Bien : la chronologie en tête, puis le local en cartes, une par
// information (activité, détenu depuis, surface, dernière vente), au registre
// des cartes de l'onglet Marché : l'intitulé souligné d'un filet, le chiffre
// en grand dessous.
//
// L'activité tient en un mot ou deux ; le détail, s'il y en a un, reste
// derrière l'info au survol. En édition, les quatre cartes sont là même
// vides : on voit ce qu'il reste à trouver.

function CarteInfo({ id, label, valeur, sous, info, champ, type = "text", champSous = null }) {
  return (
    <Bloc id={id} titre={label}>
    <Carte className="flex h-full min-w-0 flex-col px-6 pb-6 pt-[22px] max-md:px-5">
      <div className="mb-5 flex items-center gap-1.5 border-b border-trait pb-3">
        <span className="min-w-0 truncate text-[16px] font-medium text-encre">{label}</span>
        <InfoDot texte={info} />
      </div>
      <span className={`text-[30px] max-md:text-[24px] leading-[1.15] tracking-[-0.02em] ${valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums", textWrap: "balance" }}>
        <ValeurEditable champ={champ} type={type}>{valeur || "—"}</ValeurEditable>
      </span>
      {(sous || champSous) && <span className="mt-2 text-[15px] text-craie" style={{ fontVariantNumeric: "tabular-nums" }}><ValeurEditable champ={champSous}>{sous || "+ prix"}</ValeurEditable></span>}
    </Carte>
    </Bloc>
  );
}

export default function BienProjet({ project, friseLue = null }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const surface = Number(project.sim_surface) || Number(project.surface_m2) || 0;
  const detenu = project.detenu_depuis || project.derniere_vente_annee || null;
  const prixVente = Number(project.derniere_vente_prix) > 0 ? `${nf.format(Number(project.derniere_vente_prix))} €` : null;

  const infos = [
    { id: "bien-activite", champ: "activite_locataire", valeur: project.activite_locataire && !/non renseign/i.test(project.activite_locataire) ? project.activite_locataire : null, label: "Activité", info: project.activite_detail || null },
    { id: "bien-detenu", champ: "detenu_depuis", valeur: detenu ? String(detenu) : null, label: "Détenu depuis", info: "Depuis quand le propriétaire actuel tient les murs, d'après la dernière mutation publiée (DVF) ou l'acte." },
    { id: "bien-surface", champ: "sim_surface", type: "number", valeur: surface > 0 ? `${nf.format(surface)} m²` : null, label: "Surface", info: project.surface_detail || null },
    // L'année en grand, le prix dessous : deux chiffres sur une ligne se
    // lisaient comme un seul.
    { id: "bien-vente", champ: "derniere_vente_annee", champSous: enEdition ? "derniere_vente_prix" : null, valeur: project.derniere_vente_annee ? String(project.derniere_vente_annee) : null, sous: prixVente, label: "Dernière vente", info: "L'année et le prix de la dernière mutation des murs, d'après les ventes publiées (DVF) ou l'acte." },
  ].filter((l) => enEdition || l.valeur);

  return (
    <div className="flex flex-col gap-5">
      <Bloc id="bien-chronologie" titre="Chronologie"><ChronologieBien project={project} friseLue={friseLue} /></Bloc>
      {infos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {infos.map((l) => <CarteInfo key={l.id} {...l} />)}
        </div>
      )}
    </div>
  );
}
