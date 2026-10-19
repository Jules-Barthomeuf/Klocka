// Le simulateur d'un projet lu côté serveur : les mêmes chiffres que sa page,
// pour la présentation bancaire et pour AK.

import { calculerTableauAnnuel, parametresDuProjet } from '../src/components/simulator/CalculFinancier.js';

const positif = (v) => (Number(v) > 0 ? Number(v) : null);

/**
 * Le simulateur du projet, tel que sa page l'affiche (13 oct. 2026, Jules : « il
 * faut prendre les données du simulateur, il y a tout dont l'apport ») : mêmes
 * champs, mêmes valeurs par défaut. Sans apport enregistré, le simulateur pose
 * 15 % du prix de revient : c'est ce chiffre qu'il montre, et celui qu'on prend.
 * Null si le projet n'a ni prix ni loyer.
 */
export function simulationDuProjet(p) {
  try {
    const params = parametresDuProjet(p);
    if (!(params.prixBienNegocie > 0)) return null;
    const r = calculerTableauAnnuel(params);
    const an1 = r.tableauAnnuel?.[1] || {};
    const i = r.indicateurs || {};
    const nb = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      prix_negocie: params.prixBienNegocie, prix_fai: params.prixBienFAI, prix_revient: r.prixRevient,
      droits: r.droitsEnregistrement, frais_klocka: r.totalFraisKlocka, frais_divers: r.fraisDivers,
      loyer_annuel: params.loyerInitialHTHC, indexation: params.indexation,
      apport: Math.round(params.apport || 0), apport_enregistre: positif(p.sim_apport) != null, pourcentage_apport: r.pourcentageApport,
      emprunt: r.montantEmprunt, pourcentage_emprunt: r.pourcentageEmprunt,
      duree_credit: params.dureeCredit, taux_interet: params.tauxInteret, taux_assurance: params.tauxAssuranceCredit, in_fine: !!params.pretInFine,
      mensualite: r.echeanceMensuelle,
      cash_flow_mensuel_an1: Math.round(nb(an1.cashFlowMensuel) ?? 0), cash_flow_annuel_an1: Math.round(nb(an1.cashFlowAnnuel) ?? 0),
      cash_flow_moyen_mois: nb(i.cashFlowMoyenMois), cash_flow_cumule: nb(i.cashFlowCumule),
      annee_revente: params.anneeRevente, prix_revente_net: r.revente?.prixVenteNet ?? null, plus_value: nb(i.plusValue),
      rendement_global_net: nb(i.rendementLocatifGlobalNet), tri: nb(i.triBrut), multiple_fonds_propres: nb(i.multipleNetFondsPropres),
      creation_richesse: nb(i.creationRichesseBrute), annee_recuperation_apport: i.anneeRecuperationApport ?? null,
      // Le rendement de la première année, à côté de celui du simulateur (19 oct. 2026) : le « rendement net »
      // du simulateur est une MOYENNE sur la détention, loyers indexés ; l'année 1 est plus basse.
      rendement_an1: nb(an1.rendementLocatifNet),
    };
  } catch {
    return null;
  }
}


/**
 * Le prix négocié qui donne un rendement net voulu, cherché avec le simulateur lui-même (19 oct. 2026, Jules :
 * Haka avait divisé le loyer de l'an 1 par un prix de revient refait à la main, et trouvait 415 000 € là où le
 * simulateur donne 7 % à 530 000 €). Le « rendement net » est celui du simulateur : la moyenne, sur la détention,
 * des loyers nets indexés divisés par le prix de revient. Le prix est arrondi au millier inférieur.
 * `loyer` : un autre loyer annuel à essayer (sinon celui du projet).
 * @returns {null | { cible, prix_negocie, prix_fai, baisse, baisse_pct, avant, apres }}
 */
export function prixPourRendement(p, cible, { loyer = null } = {}) {
  const viser = Number(cible);
  if (!(viser > 0)) return null;
  const avec = (prix) => simulationDuProjet({ ...p, sim_prix_bien_negocie: prix, ...(loyer > 0 ? { sim_loyer_initial_ht: loyer } : {}) });
  const avant = simulationDuProjet(p);
  if (!avant) return null;
  const fai = avant.prix_fai || avant.prix_negocie;
  // Le rendement baisse quand le prix monte : on cherche entre 1 € et deux fois le FAI.
  let bas = 1;
  let haut = Math.max(fai, avant.prix_negocie) * 2;
  if ((avec(haut)?.rendement_global_net ?? 0) >= viser) bas = haut;
  else {
    for (let n = 0; n < 50 && haut - bas > 50; n += 1) {
      const milieu = (bas + haut) / 2;
      if ((avec(milieu)?.rendement_global_net ?? 0) >= viser) bas = milieu; else haut = milieu;
    }
  }
  const prix = Math.floor(bas / 1000) * 1000;
  const apres = avec(prix);
  return {
    cible: viser, prix_negocie: prix, prix_fai: fai,
    baisse: fai ? fai - prix : null, baisse_pct: fai ? Math.round(((fai - prix) / fai) * 1000) / 10 : null,
    loyer_essaye: loyer > 0 ? loyer : null,
    avant: avant && { prix_negocie: avant.prix_negocie, prix_revient: avant.prix_revient, rendement_net: avant.rendement_global_net, rendement_an1: avant.rendement_an1, cash_flow_mensuel_an1: avant.cash_flow_mensuel_an1 },
    apres: apres && { prix_negocie: prix, prix_revient: apres.prix_revient, rendement_net: apres.rendement_global_net, rendement_an1: apres.rendement_an1, apport: apres.apport, mensualite: apres.mensualite, cash_flow_mensuel_an1: apres.cash_flow_mensuel_an1, cash_flow_moyen_mois: apres.cash_flow_moyen_mois, tri: apres.tri },
    definition: 'Rendement net du simulateur : moyenne sur la durée de détention des loyers nets indexés ÷ prix de revient. Le rendement de l\'année 1 est donné à côté.',
  };
}

/** Pure : le simulateur en lignes lisibles par AK. */
export function simulationEnTexte(sim) {
  if (!sim) return 'aucun (le projet n\'a pas de prix au simulateur)';
  const e = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`);
  return [
    `prix négocié ${e(sim.prix_negocie)}, FAI ${e(sim.prix_fai)} ; prix de revient (acquisition droits inclus) ${e(sim.prix_revient)} dont droits ${e(sim.droits)}, frais Klocka ${e(sim.frais_klocka)}, frais divers ${e(sim.frais_divers)}`,
    `loyer annuel HT/HC ${e(sim.loyer_annuel)}, indexation ${sim.indexation} %/an`,
    `apport ${e(sim.apport)} (${sim.pourcentage_apport} %)${sim.apport_enregistre ? '' : ' : aucun apport enregistré, c\'est les 15 % du prix de revient que le simulateur affiche par défaut, à confirmer avec le client'}`,
    `emprunt (montant à financer) ${e(sim.emprunt)} (${sim.pourcentage_emprunt} %), ${sim.duree_credit} ans, taux ${sim.taux_interet} %, assurance ${sim.taux_assurance} %${sim.in_fine ? ', in fine' : ''} ; mensualité ${e(sim.mensualite)}`,
    `cash-flow : ${e(sim.cash_flow_mensuel_an1)}/mois l'année 1 (${e(sim.cash_flow_annuel_an1)}/an), ${e(sim.cash_flow_moyen_mois)}/mois en moyenne jusqu'à la revente, ${e(sim.cash_flow_cumule)} cumulés`,
    `rendement net du simulateur ${sim.rendement_global_net} % (moyenne sur ${sim.annee_revente} ans des loyers nets indexés ÷ prix de revient ; c'est CE chiffre que la page montre) ; année 1 seule : ${sim.rendement_an1 == null ? '—' : Number(sim.rendement_an1).toFixed(1)} %. Pour un prix qui vise un rendement, l'outil prix_pour_rendement, jamais un calcul à la main`,
    `revente à ${sim.annee_revente} ans : prix net ${e(sim.prix_revente_net)}, plus-value fiscale (sur la valeur nette comptable) ${e(sim.plus_value)} ; rendement global net ${sim.rendement_global_net} %, TRI ${sim.tri} %, multiple des fonds propres ${sim.multiple_fonds_propres}, création de richesse ${e(sim.creation_richesse)}${sim.annee_recuperation_apport ? `, apport récupéré l'année ${sim.annee_recuperation_apport}` : ''}`,
  ].map((l) => `- ${l}`).join('\n');
}
