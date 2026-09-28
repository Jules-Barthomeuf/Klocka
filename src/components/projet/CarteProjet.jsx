import React from "react";
import { ArrowUpRight } from "lucide-react";

// La carte d'un projet, la même en admin et chez le client (maquette du 28
// septembre 2026) : la photo du local en haut, sinon une trame « photo du
// local » ; l'état en pastille ; puis le titre, l'adresse, trois chiffres
// séparés par des filets, et ce qui se pose dessous (clients possibles,
// rapport). L'admin lui ajoute ses gestes au survol de la photo.

export const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé",
};

// Le point de la pastille d'état : la teinte dit où en est le projet.
const statutTeintes = {
  prospect: "bg-brume",
  analyse: "bg-menthe",
  negociation: "bg-menthe",
  financement: "bg-bleu",
  signe: "bg-vert",
};

export const formatPrix = (val) => {
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
  if (val >= 1000) return `${Math.round(val / 1000)}K €`;
  return `${Math.round(val)} €`;
};

/**
 * Le prix de revient et le rendement moyen d'un projet, tels que le simulateur
 * les calcule. Les taux se lisent avec `??` et non `||` : des droits à 0 %
 * sont un choix, pas une valeur manquante à remplacer par 8 %.
 */
export function chiffresDuProjet(project) {
  const prixBienFAI = project.sim_prix_bien_fai || project.sim_prix_bien_negocie || 0;
  const prixBienNegocie = project.sim_prix_bien_negocie || prixBienFAI;
  const tauxDroits = project.sim_droits_enregistrement ?? 8;
  const tauxFees = project.sim_fees_klocka ?? 8;
  const feesType = project.sim_fees_klocka_type || "pourcentage";
  const tauxIncentive = project.sim_incentive_klocka ?? 20;
  const agentActif = project.sim_commission_agent_active ?? false;
  const agentType = project.sim_commission_agent_type || "pourcentage";
  const tauxAgent = project.sim_commission_agent ?? 5;
  const inclusFAI = project.sim_commission_agent_inclus_fai !== false;

  const honorairesAgent = agentActif ? (agentType === "fixe" ? tauxAgent : prixBienNegocie * (tauxAgent / 100)) : 0;
  const prixHorsDroits = inclusFAI ? prixBienNegocie - honorairesAgent : prixBienNegocie;
  const droits = prixHorsDroits * (tauxDroits / 100);
  const fees = feesType === "fixe" ? tauxFees : prixBienNegocie * (tauxFees / 100);
  const incentive = Math.max(0, (prixBienFAI > 0 ? prixBienFAI : prixBienNegocie) - prixBienNegocie) * (tauxIncentive / 100);
  const divers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);

  const prixRevient = prixBienNegocie > 0
    ? prixBienNegocie + droits + fees + incentive + divers + (inclusFAI ? 0 : honorairesAgent)
    : project.sim_prix_revient || project.prix_acquisition || 0;

  // Le rendement moyen sur la durée de détention, loyers indexés.
  const anneeRevente = project.sim_annee_revente || 20;
  const indexation = project.sim_indexation_loyers || 2;
  let total = 0;
  let loyer = project.sim_loyer_initial_ht || 0;
  for (let annee = 1; annee <= anneeRevente; annee++) {
    if (annee > 1) loyer *= 1 + indexation / 100;
    total += loyer;
  }
  const loyerMoyen = anneeRevente > 0 ? total / anneeRevente : 0;
  const rendement = prixRevient > 0 && loyerMoyen > 0 ? (loyerMoyen / prixRevient) * 100 : 0;

  return { prixRevient, rendement, surface: project.sim_surface || project.surface_m2 || 0 };
}

/** Un chiffre de la carte : la valeur, son libellé. */
function Chiffre({ valeur, label, teinte = "text-encre" }) {
  return (
    <div className="min-w-0">
      <p className={`m-0 text-[20px] font-medium tabular-nums max-md:text-[17px] ${teinte}`}>{valeur}</p>
      <p className="m-0 mt-0.5 text-[13px] text-ardoise">{label}</p>
    </div>
  );
}

/** La trame « photo du local », quand le projet n'a pas de photo. */
export function TramePhoto({ mot = "photo du local" }) {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: "repeating-linear-gradient(135deg, rgb(var(--k-encre-rgb) / 0.075) 0 14px, rgb(var(--k-encre-rgb) / 0.035) 14px 28px)" }}
    >
      <span className="font-mono text-[13px] tracking-[.06em] text-ardoise">{mot}</span>
    </div>
  );
}

/**
 * @param {object} project
 * @param {() => void} onOuvrir      ce que fait un clic sur la carte
 * @param {string|null} avatar       la photo du conseiller, en haut à droite
 * @param {React.ReactNode} sousLigne une ligne de plus sous l'adresse
 * @param {React.ReactNode} actions   les boutons qui apparaissent au survol
 * @param {React.ReactNode} pied      ce qui se pose sous les chiffres, dans la carte
 * @param {boolean} fleche            la flèche d'ouverture, au bout des chiffres
 */
export default function CarteProjet({ project, onOuvrir, avatar = null, sousLigne = null, actions = null, pied = null, fleche = false }) {
  const { prixRevient, rendement, surface } = chiffresDuProjet(project);
  // Une photo dont l'hébergeur a disparu affichait son texte de remplacement
  // en travers de la carte : on retombe alors sur la trame.
  const [photoKo, setPhotoKo] = React.useState(false);
  const photo = photoKo ? null : project.photos?.[0];

  return (
    <div className="group overflow-hidden rounded-[20px] border border-trait bg-surface-pleine transition-colors duration-300 hover:border-bord-doux">
      <div className="relative h-[220px] cursor-pointer overflow-hidden max-md:h-[180px]" onClick={onOuvrir}>
        {photo
          ? <img src={photo} alt="" onError={() => setPhotoKo(true)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
          : <TramePhoto />}

        <div className="absolute left-4 top-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-pleine px-3 py-1.5 text-[13px] text-encre shadow-[0_2px_10px_rgb(0_0_0/0.08)]">
            <span className={`h-2 w-2 rounded-full ${statutTeintes[project.statut] || statutTeintes.prospect}`} />
            {statutLabels[project.statut] || project.statut}
          </span>
        </div>

        {avatar && (
          <div className="absolute right-4 top-4">
            <img src={avatar} alt="Conseiller" className="h-9 w-9 rounded-full border-2 border-surface-pleine object-cover" />
          </div>
        )}

        {actions && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {actions}
          </div>
        )}
      </div>

      <div className="px-6 pb-5 pt-5 max-md:px-5">
        <button type="button" onClick={onOuvrir} className="block w-full text-left" style={{ background: "transparent" }}>
          <h2 className="m-0 truncate text-[22px] font-medium leading-[1.25] tracking-[-0.01em] text-encre max-md:text-[19px]">{project.titre}</h2>
          {project.adresse_complete && <p className="m-0 mt-1 truncate text-[15px] text-ardoise">{project.adresse_complete}</p>}
          {sousLigne}
        </button>

        <div className="mt-4 flex items-center border-t border-trait pt-4" style={{ fontVariantNumeric: "tabular-nums" }}>
          <div className="grid flex-1 grid-cols-3 gap-3">
            <Chiffre valeur={formatPrix(prixRevient)} label="Prix de revient" />
            <Chiffre valeur={`${rendement.toFixed(2).replace(".", ",")} %`} label="Rendement" teinte="text-menthe" />
            {surface > 0 ? <Chiffre valeur={`${Math.round(surface)} m²`} label="Surface" /> : <div />}
          </div>
          {fleche && (
            <button type="button" onClick={onOuvrir} aria-label="Ouvrir" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-bord transition-colors hover:border-menthe" style={{ background: "transparent" }}>
              <ArrowUpRight className="h-4 w-4 text-ardoise transition-colors group-hover:text-menthe" />
            </button>
          )}
        </div>
        {pied}
      </div>
    </div>
  );
}
