import React from "react";
import CarteDuProjet from "@/components/dashboard/CarteDuProjet";
import { ArrowUpRight } from "lucide-react";

// La carte d'un projet, la même en admin et chez le client.
//
// Elle était écrite deux fois, avec deux calculs du prix de revient qui ne
// donnaient pas toujours le même chiffre, deux bordures et deux graisses. Une
// seule maintenant : l'admin lui ajoute ses actions au survol et son pied de
// rapport, le client ouvre le projet. Rien d'autre ne les sépare.

export const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé",
};

const statutColors = {
  prospect: "text-ardoise border-encre/[0.18]",
  analyse: "text-menthe-clair border-menthe-clair/40",
  negociation: "text-menthe border-menthe/40",
  financement: "text-menthe border-menthe/40",
  signe: "text-menthe-clair border-menthe bg-menthe/[0.16]",
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

/** Un chiffre de la barre du bas : la valeur, son libellé. */
function Chiffre({ valeur, label, teinte = "text-encre", premier = false }) {
  return (
    <div className={`min-w-0 flex-1 py-4 ${premier ? "pr-4 max-md:pr-3" : "border-l border-encre/[0.12] px-4 max-md:px-3"}`}>
      <p className={`m-0 text-[18px] font-medium tabular-nums max-md:text-[15px] ${teinte}`}>{valeur}</p>
      <p className="alx-mont m-0 mt-1 whitespace-nowrap text-[11px] font-medium uppercase tracking-[.14em] text-ardoise max-md:tracking-[.08em]">{label}</p>
    </div>
  );
}

/**
 * @param {object} project
 * @param {() => void} onOuvrir      ce que fait un clic sur la carte
 * @param {string|null} avatar       la photo du conseiller, en haut à droite
 * @param {React.ReactNode} sousLigne une ligne de plus sous l'adresse
 * @param {React.ReactNode} actions   les boutons qui apparaissent au survol
 * @param {React.ReactNode} pied      ce qui se pose sous la carte
 * @param {boolean} fleche            la flèche d'ouverture, au bout des chiffres
 */
export default function CarteProjet({ project, onOuvrir, avatar = null, sousLigne = null, actions = null, pied = null, fleche = false }) {
  const { prixRevient, rendement, surface } = chiffresDuProjet(project);
  const photo = project.photos?.[0];

  return (
    <div>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-[16px] border border-trait bg-surface transition-colors duration-300 hover:border-[rgba(150,192,184,0.3)]"
        onClick={onOuvrir}
      >
        <div className="relative h-48 overflow-hidden md:h-56">
          {photo
            ? <img src={photo} alt={project.titre} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
            : <CarteDuProjet project={project} />}
          {/* Le voile qui rend le titre lisible. Il descend plus bas qu'avant :
              un projet sans photo montre sa rue sur une carte claire, où un
              titre blanc se perdait. */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(14,16,15,0.98) 14%, rgba(14,16,15,0.45) 58%, rgba(14,16,15,0.55) 100%)" }} />

          <div className="absolute left-4 top-4">
            <span className={`alx-mont rounded-full border bg-fond/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[.14em] backdrop-blur-sm ${statutColors[project.statut] || statutColors.prospect}`}>
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>

          {avatar && (
            <div className="absolute right-3 top-3">
              <img src={avatar} alt="Conseiller" className="h-9 w-9 rounded-full border border-encre/25 object-cover" />
            </div>
          )}

          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="truncate text-[18px] font-light leading-tight tracking-[-0.02em] text-encre md:text-[24px]">{project.titre}</h2>
            {project.adresse_complete && <p className="mt-1 truncate text-[12.5px] text-craie/70">{project.adresse_complete}</p>}
            {sousLigne}
          </div>

          {actions && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {actions}
            </div>
          )}
        </div>

        <div className="flex items-center border-t border-encre/[0.12] px-5 max-md:px-4" style={{ fontVariantNumeric: "tabular-nums" }}>
          <Chiffre premier valeur={formatPrix(prixRevient)} label="Prix de revient" />
          <Chiffre valeur={`${rendement.toFixed(2).replace(".", ",")} %`} label="Rendement" teinte="text-menthe-clair" />
          {surface > 0 && <Chiffre valeur={`${Math.round(surface)} m²`} label="Surface" />}
          {fleche && (
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-encre/[0.14] transition-colors group-hover:border-menthe">
              <ArrowUpRight className="h-4 w-4 text-ardoise transition-colors group-hover:text-menthe-clair" />
            </div>
          )}
        </div>
      </div>
      {pied}
    </div>
  );
}
