import React from "react";

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
      <p className={`m-0 text-[14.5px] font-medium tabular-nums max-md:text-[14px] ${teinte}`}>{valeur}</p>
      <p className="m-0 mt-0.5 text-[11px] text-ardoise">{label}</p>
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
      <span className="font-mono text-[12px] tracking-[.06em] text-ardoise">{mot}</span>
    </div>
  );
}

// Les étapes d'un projet, dans l'ordre : la barre de la carte les montre.
export const ETAPES_PROJET = ["prospect", "analyse", "negociation", "financement", "signe"];

/**
 * @param {object} project
 * @param {() => void} onOuvrir        « Ouvrir le projet », et un clic sur la photo ou le titre
 * @param {() => void} onEtapeSuivante « Étape suivante » (admin) ; absent, le bouton ne s'affiche pas
 * @param {string|null} avatar         la photo du conseiller, en haut à droite
 * @param {React.ReactNode} sousLigne  une ligne de plus sous l'adresse
 * @param {React.ReactNode} actions    les boutons qui apparaissent au survol de la photo
 * @param {React.ReactNode} pied       ce qui se pose sous les chiffres (clients possibles, rapport)
 */
export default function CarteProjet({ project, onOuvrir, onEtapeSuivante = null, avatar = null, sousLigne = null, actions = null, pied = null }) {
  const { prixRevient, rendement, surface } = chiffresDuProjet(project);
  // Une photo dont l'hébergeur a disparu affichait son texte de remplacement
  // en travers de la carte : on retombe alors sur la trame.
  const [photoKo, setPhotoKo] = React.useState(false);
  const photo = photoKo ? null : project.photos?.[0];
  const rang = Math.max(0, ETAPES_PROJET.indexOf(project.statut || "prospect"));
  const derniere = rang >= ETAPES_PROJET.length - 1;

  return (
    <div className="group flex flex-col overflow-hidden rounded-[18px] border border-trait bg-surface-pleine transition-colors duration-300 hover:border-bord-doux">
      <div className="relative h-[175px] cursor-pointer overflow-hidden max-md:h-[150px]" onClick={onOuvrir}>
        {photo
          ? <img src={photo} alt="" onError={() => setPhotoKo(true)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]" />
          : <TramePhoto />}
        {avatar && (
          <div className="absolute right-3 top-3">
            <img src={avatar} alt="Conseiller" className="h-7 w-7 rounded-full border-2 border-surface-pleine object-cover" />
          </div>
        )}
        {actions && (
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {actions}
          </div>
        )}
      </div>

      <div className="flex-1 px-6 pb-5 pt-6">
        <button type="button" onClick={onOuvrir} className="block w-full text-left" style={{ background: "transparent" }}>
          <h2 className="m-0 line-clamp-2 text-[17px] font-normal leading-[1.3] tracking-[-0.01em] text-encre">{project.titre}</h2>
          {project.adresse_complete && <p className="m-0 mt-1 truncate text-[13px] text-ardoise">{project.adresse_complete}</p>}
          {sousLigne}
        </button>

        {/* Où en est le projet : cinq segments, le premier, l'étape en cours et le dernier nommés. */}
        <div className="mt-5">
          <div className="flex gap-1.5" aria-hidden>
            {ETAPES_PROJET.map((e, i) => <span key={e} className={`h-[3px] flex-1 rounded-full ${i <= rang ? "bg-menthe" : "bg-encre/[0.10]"}`} />)}
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 text-[12px]">
            <span className={rang === 0 ? "text-menthe" : "text-ardoise"}>{statutLabels.prospect}</span>
            {rang > 0 && !derniere && <span className="text-menthe">{statutLabels[ETAPES_PROJET[rang]]}</span>}
            <span className={derniere ? "text-menthe" : "text-ardoise"}>{statutLabels.signe}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-trait pt-4" style={{ fontVariantNumeric: "tabular-nums" }}>
          <Chiffre valeur={formatPrix(prixRevient)} label="Prix de revient" />
          <Chiffre valeur={`${rendement.toFixed(2).replace(".", ",")} %`} label="Rendement" teinte="text-menthe" />
          {surface > 0 ? <Chiffre valeur={`${Math.round(surface)} m²`} label="Surface" /> : <div />}
        </div>
        {pied}
      </div>

      {onOuvrir && (
        <div className="flex items-center gap-2.5 border-t border-trait px-6 py-4">
          <button type="button" onClick={onOuvrir} className="flex-1 rounded-full bg-encre px-4 py-2 text-[13.5px] text-fond transition-opacity hover:opacity-90">Ouvrir le projet</button>
          {onEtapeSuivante && !derniere && (
            <button type="button" onClick={onEtapeSuivante} title={`Passer en « ${statutLabels[ETAPES_PROJET[rang + 1]]} »`} className="rounded-full border border-bord px-4 py-2 text-[13.5px] text-encre transition-colors hover:border-bord-vif" style={{ background: "transparent" }}>Étape suivante</button>
          )}
        </div>
      )}
    </div>
  );
}
