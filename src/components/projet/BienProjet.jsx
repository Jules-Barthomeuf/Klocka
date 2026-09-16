import React from "react";
import { ChiffresStrip, nf } from "./SecteurChiffres";
import { useEdition } from "./EditionEnPlace";
import { dureeDepuis } from "./durees";
import ProjectSimulatorPreview from "@/components/admin/ProjectSimulatorPreview";

// Le bien, dans le registre de Marché : quatre cases, puis le graphique du
// simulateur, et rien d'autre.
//
// L'activité tient en un mot ou deux ; le détail, s'il y en a un, reste
// derrière l'info au survol. La surface porte sa pondération de la même
// façon. En édition, les quatre cases sont là même vides : on voit ce qu'il
// reste à trouver.

/** Les travaux du bailleur, tels que le formulaire les range. */
const travauxDe = (p) => [1, 2, 3]
  .map((i) => ({ annee: p[`sim_travaux_annee${i}`], montant: p[`sim_travaux_montant${i}`] }))
  .filter((t) => t.annee && Number(t.montant) > 0);

export default function BienProjet({ project }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const surface = Number(project.sim_surface) || Number(project.surface_m2) || 0;
  const depuis = dureeDepuis(project.locataire_depuis);
  const vente = project.derniere_vente_annee ? String(project.derniere_vente_annee) : null;

  const cases = [
    { valeur: project.activite_locataire && !/non renseign/i.test(project.activite_locataire) ? project.activite_locataire : null, label: "Activité", info: project.activite_detail || null },
    { valeur: depuis, label: "En place depuis" },
    { valeur: surface > 0 ? `${nf.format(surface)} m²` : null, label: "Surface", info: project.surface_detail || null },
    { valeur: vente, label: "Dernière vente", info: "L'année de la dernière mutation des murs, d'après les ventes publiées (DVF) ou l'acte." },
  ]
    .filter((c) => enEdition || c.valeur)
    .map((c) => ({ ...c, valeur: c.valeur || "—", accent: c.valeur ? undefined : "text-brume" }));

  const aSimulateur = Number(project.sim_prix_bien_negocie) > 0 || Number(project.sim_loyer_initial_ht) > 0;

  if (!cases.length && !aSimulateur) return null;

  return (
    <div>
      {cases.length > 0 && (
        <>
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">Le local</div>
          <ChiffresStrip chiffres={cases} />
        </>
      )}
      {aSimulateur && (
        <div className="mt-8 max-md:mt-6">
          <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-ardoise">Cash-flow et capital remboursé, année par année</div>
          <ProjectSimulatorPreview formData={project} travauxList={travauxDe(project)} vue="graphique" hauteur={440} />
        </div>
      )}
    </div>
  );
}
