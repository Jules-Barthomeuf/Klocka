import React from "react";
import CarteDuProjet from "@/components/dashboard/CarteDuProjet";
import { ArrowUpRight } from "lucide-react";

// La carte d'un projet, la même en admin, chez le client et au tableau de bord.
//
// Elle ne dit plus que trois choses : le titre, le prix de revient, le
// rendement. Ce qui l'encombrait est parti — l'étiquette d'étape en haut à
// gauche, la photo du conseiller en haut à droite, l'adresse sous le titre, la
// surface au pied. Le reste (le calcul du prix de revient, la bordure, le
// verre) vient d'ici, pour que les trois vues ne divergent plus.

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

/** Un des deux chiffres du pied : la valeur, son libellé. */
function Chiffre({ valeur, label, teinte = "text-encre" }) {
  return (
    <div className="min-w-0">
      <p className={`m-0 text-[20px] font-medium tabular-nums max-md:text-[17px] ${teinte}`}>{valeur}</p>
      <p className="alx-mont m-0 mt-1 whitespace-nowrap text-[11px] font-medium uppercase tracking-[.14em] text-ardoise max-md:tracking-[.08em]">{label}</p>
    </div>
  );
}

/**
 * @param {object} project
 * @param {() => void} onOuvrir      ce que fait un clic sur la carte
 * @param {React.ReactNode} sousLigne une ligne de plus sous le titre
 * @param {React.ReactNode} actions   les boutons qui apparaissent au survol
 * @param {React.ReactNode} pied      ce qui se pose sous la carte
 * @param {boolean} fleche            la flèche d'ouverture, au bout des chiffres
 */
export default function CarteProjet({ project, onOuvrir, sousLigne = null, actions = null, pied = null, fleche = false }) {
  const { prixRevient, rendement } = chiffresDuProjet(project);
  // Une photo qui ne charge pas laissait son texte de remplacement en clair sur
  // la carte : on retombe alors sur le plan, comme un projet sans photo.
  const [photoKo, setPhotoKo] = React.useState(false);
  const photo = photoKo ? null : project.photos?.[0];

  return (
    <div>
      <div
        className="group relative cursor-pointer overflow-hidden rounded-[16px] bg-encre/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-colors duration-300 hover:bg-encre/[0.07]"
        onClick={onOuvrir}
      >
        <div className="relative h-44 overflow-hidden md:h-48">
          {photo
            ? <img src={photo} alt="" onError={() => setPhotoKo(true)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
            : <CarteDuProjet project={project} />}
          {/* Un fondu léger au bas de l'image : plus rien n'est écrit dessus,
              il ne sert qu'à poser l'image sur le verre. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(to top, rgba(10,11,12,0.75), transparent)" }} />

          {actions && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {actions}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-4 max-md:px-4">
          <h2 className="m-0 truncate text-[18px] font-light leading-tight tracking-[-0.02em] text-encre md:text-[20px]">{project.titre}</h2>
          {sousLigne}
          <div className="mt-4 flex items-end gap-8 max-md:gap-6" style={{ fontVariantNumeric: "tabular-nums" }}>
            <Chiffre valeur={formatPrix(prixRevient)} label="Prix" />
            <Chiffre valeur={`${rendement.toFixed(2).replace(".", ",")} %`} label="Rendement" teinte="text-menthe-clair" />
            {fleche && (
              <div className="ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-encre/[0.14] transition-colors group-hover:border-menthe">
                <ArrowUpRight className="h-4 w-4 text-ardoise transition-colors group-hover:text-menthe-clair" />
              </div>
            )}
          </div>
        </div>
      </div>
      {pied}
    </div>
  );
}
