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
    };
  } catch {
    return null;
  }
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
    `revente à ${sim.annee_revente} ans : prix net ${e(sim.prix_revente_net)}, plus-value fiscale (sur la valeur nette comptable) ${e(sim.plus_value)} ; rendement global net ${sim.rendement_global_net} %, TRI ${sim.tri} %, multiple des fonds propres ${sim.multiple_fonds_propres}, création de richesse ${e(sim.creation_richesse)}${sim.annee_recuperation_apport ? `, apport récupéré l'année ${sim.annee_recuperation_apport}` : ''}`,
  ].map((l) => `- ${l}`).join('\n');
}
