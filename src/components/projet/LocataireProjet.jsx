import React from "react";
import { ChiffresStrip, nf } from "./SecteurChiffres";
import { useEdition, estMasque } from "./EditionEnPlace";
import { dureeDepuis, dureeJusque, dateLongue } from "./durees";

// Le locataire, en six cases, dans le registre de Marché.
//
// Les six sont toujours là, remplies ou non : on voit ce qu'il reste à
// trouver. Chacune se retire de la page d'une croix, depuis le panneau ; la
// liste des cases retirées vit dans le projet (champs_masques), comme pour
// les autres champs.

export const CASES_LOCATAIRE = [
  ["loc.loyer", "Loyer annuel HT/HC"],
  ["loc.depuis", "En place depuis"],
  ["loc.restant", "Bail restant à courir"],
  ["loc.echeance", "Échéance du bail"],
  ["loc.nom", "Nom du locataire"],
  ["loc.profil", "Profil"],
];

/** Les six valeurs, calculées une fois pour la page et le panneau. */
export function valeursLocataire(project) {
  const loyer = Number(project.sim_loyer_initial_ht) || Number(project.loyer_annuel_ht) || 0;
  return {
    "loc.loyer": loyer > 0 ? `${nf.format(loyer)} €` : null,
    "loc.depuis": dureeDepuis(project.locataire_depuis),
    "loc.restant": dureeJusque(project.echeance_bail),
    "loc.echeance": dateLongue(project.echeance_bail),
    "loc.nom": project.nom_locataire || null,
    "loc.profil": project.profil_locataire || null,
  };
}

export default function LocataireProjet({ project }) {
  const edition = useEdition();
  const valeurs = valeursLocataire(project);
  const visibles = CASES_LOCATAIRE.filter(([cle]) => !estMasque(edition, cle));
  if (!visibles.length) return null;

  const strip = (cles) => (
    <ChiffresStrip chiffres={cles.map(([cle, label]) => ({
      valeur: valeurs[cle] || "—",
      label,
      accent: valeurs[cle] ? undefined : "text-brume",
      info: cle === "loc.restant" ? "Du jour où vous lisez ceci à l'échéance du bail." : cle === "loc.profil" ? "Qui exploite : ce qu'on sait de la personne ou de l'équipe derrière l'enseigne." : null,
    }))} />
  );

  const gauche = visibles.filter(([cle]) => ["loc.loyer", "loc.depuis", "loc.restant", "loc.echeance"].includes(cle));
  const droite = visibles.filter(([cle]) => ["loc.nom", "loc.profil"].includes(cle));

  return (
    <div>
      {gauche.length > 0 && (
        <>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">Le bail en place</div>
          {strip(gauche)}
        </>
      )}
      {droite.length > 0 && (
        <div className="mt-8 max-md:mt-6">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">Qui exploite</div>
          {strip(droite)}
        </div>
      )}
    </div>
  );
}
