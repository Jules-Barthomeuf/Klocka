// D'où vient chaque chiffre de la page d'un projet : le mode Sources de
// l'éditeur (14 oct. 2026), sur le modèle de celui des présentations
// (presentation-sources.js). Les clés sont les chemins que la page modifie au
// clic (ValeurEditable / ValeurForcee) : « marche_loyer_autour »,
// « valeurs_forcees.prix_revient »… Chaque source a la forme de la fiche des
// présentations (FicheSource) : nature, origine, détail, lien.
//
// L'ordre fait foi :
//   1. la source posée au moment du changement (AK, ou une saisie qui en donne une) ;
//   2. une valeur saisie ou forcée à la main dans l'éditeur ;
//   3. la source d'où la page tire le chiffre quand rien n'est saisi
//      (Equimmox ou Data-B pour le loyer autour, Le Figaro, l'INSEE, le simulateur).

import { secteurGarde } from './projet-secteur.js';

const rempli = (v) => v != null && v !== '' && !(typeof v === 'number' && v === 0);
const lire = (o, chemin) => String(chemin).split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

/** Les champs que la page affiche, et leur source quand personne ne les a saisis. */
function sourcesParDefaut(p, rue) {
  const loyer = rue?.loyer_m2_an
    ? rue.loyer_source === 'Data-B'
      ? { nature: 'donnee', origine: 'Data-B', detail: `Estimation Data-B ${rue.maille === 'rue' ? 'de la rue' : rue.maille === 'ville' ? 'de la ville' : 'du quartier'}, tous locaux confondus : ${rue.loyer_bas ?? '?'} à ${rue.loyer_haut ?? '?'} €/m²/an.` }
      : { nature: 'donnee', origine: 'Equimmox', detail: `Baux constatés à ${rue.rayon || '500 m'}${rue.surface_min && rue.surface_max ? `, locaux de ${rue.surface_min} à ${rue.surface_max} m²` : ''} : ${rue.loyer_bas ?? '?'} à ${rue.loyer_haut ?? '?'} €/m²/an.` }
    : { nature: 'a_remplir', origine: 'Aucune source pour l\'instant', detail: 'Ni Equimmox ni Data-B n\'ont rendu de loyer pour cette adresse. Demandez à AK de le chercher, ou saisissez-le.' };
  const simu = (quoi) => ({ nature: 'calcul', origine: 'Simulateur du projet', detail: `${quoi}, calculé par le simulateur d'après ses réglages (onglet Simulateur).` });
  return {
    marche_loyer_autour: loyer,
    marche_rue_prix_m2: { nature: 'donnee', origine: 'Le Figaro Immobilier', detail: 'Prix moyen du résidentiel au m² dans la rue ou le quartier.', lien: p.prix_residentiel?.url || null },
    marche_evolution_1an: { nature: 'donnee', origine: 'Le Figaro Immobilier', detail: 'Évolution du prix résidentiel sur un an.' },
    marche_evolution_5ans: { nature: 'donnee', origine: 'Le Figaro Immobilier', detail: 'Évolution du prix résidentiel sur cinq ans.' },
    ville_habitants_agglo: { nature: 'donnee', origine: 'INSEE', detail: 'Population de l\'agglomération (unité urbaine), sinon de la commune.' },
    ville_revenu_median: { nature: 'donnee', origine: 'INSEE, Filosofi', detail: 'Revenu disponible médian par unité de consommation de la commune.' },
    'valeurs_forcees.revenu_france': { nature: 'donnee', origine: 'INSEE', detail: 'Revenu médian de la France métropolitaine.' },
    'valeurs_forcees.revenu_ecart': { nature: 'calcul', origine: 'Calcul', detail: 'Revenu de la commune comparé à celui de la France.' },
    'valeurs_forcees.prix_revient': simu('Prix de revient : prix négocié, droits, frais Klocka et frais divers'),
    'valeurs_forcees.rendement_net': simu('Rendement locatif global net'),
    'valeurs_forcees.commercial_loyer_projet': { nature: 'calcul', origine: 'Calcul', detail: 'Loyer annuel du simulateur divisé par la surface.' },
    'valeurs_forcees.commercial_ecart': { nature: 'calcul', origine: 'Calcul', detail: 'Loyer du projet au m² comparé au loyer autour.' },
    'valeurs_forcees.commercial_difference': { nature: 'calcul', origine: 'Calcul', detail: 'Loyer autour moins loyer du projet, au m² et par an.' },
    'valeurs_forcees.loyer_mensuel': { nature: 'calcul', origine: 'Calcul', detail: 'Loyer annuel divisé par douze.' },
    'valeurs_forcees.depot_mois': { nature: 'calcul', origine: 'Calcul', detail: 'Dépôt de garantie divisé par le loyer mensuel.' },
    sim_loyer_initial_ht: { nature: 'projet', origine: 'Onglet Simulateur', detail: 'Loyer annuel hors taxes et hors charges saisi au simulateur.' },
    sim_surface: { nature: 'projet', origine: 'Onglet Simulateur', detail: 'Surface saisie au simulateur.' },
    surface_m2: { nature: 'projet', origine: 'Fiche du bien', detail: 'Surface saisie dans l\'onglet Bien.' },
  };
}

/**
 * Pure (lit la fiche du secteur gardée) : la source de chaque chiffre de la page.
 * @returns {Object<string, {nature: string, origine: string, detail: string, lien?: string|null}>}
 */
export function sourcesDuProjet(p, { rue = undefined } = {}) {
  const r = rue === undefined ? (p?.id ? secteurGarde(p.id)?.rue || null : null) : rue;
  const defaut = sourcesParDefaut(p || {}, r);
  const sortie = {};
  const champs = new Set([...Object.keys(defaut), ...Object.keys(p?.sources_champs || {}), ...Object.keys(p?.valeurs_forcees || {}).map((k) => `valeurs_forcees.${k}`)]);
  for (const champ of champs) {
    const posee = p?.sources_champs?.[champ];
    if (posee) {
      sortie[champ] = {
        nature: posee.par && /@/.test(posee.par) && posee.par !== 'AK' ? 'projet' : 'donnee',
        origine: posee.source,
        detail: [posee.raison, `${posee.par === 'AK' || !posee.par ? 'Posé par AK' : `Saisi par ${String(posee.par).split('@')[0]}`}${posee.le ? ` le ${new Date(posee.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''}.`].filter(Boolean).join(' '),
        lien: posee.lien || null,
      };
      continue;
    }
    const valeur = lire(p, champ);
    if (rempli(valeur) && (champ.startsWith('valeurs_forcees.') || !defaut[champ] || defaut[champ].nature === 'donnee' || defaut[champ].nature === 'a_remplir')) {
      sortie[champ] = { nature: 'projet', origine: champ.startsWith('valeurs_forcees.') ? 'Valeur forcée dans l\'éditeur' : 'Saisi dans l\'éditeur', detail: 'Saisi à la main : il l\'emporte sur le calcul et sur les sources publiques.' };
      continue;
    }
    if (defaut[champ]) sortie[champ] = defaut[champ];
  }
  return sortie;
}

/** Le projet ouvert dans l'éditeur, tel qu'AK le lit : ses chiffres, d'où ils viennent, ce que les sources ont rendu. */
export function projetPourAK(projetId) {
  return import('./db.js').then(async ({ Records }) => {
    const p = Records.get('Project', projetId);
    if (!p) return null;
    const rue = secteurGarde(p.id)?.rue || null;
    const champs = ['adresse_complete', 'surface_m2', 'sim_surface', 'sim_loyer_initial_ht', 'loyer_annuel_ht', 'sim_prix_bien_fai', 'sim_prix_bien_negocie', 'marche_loyer_autour', 'marche_rue_prix_m2', 'marche_evolution_1an', 'marche_evolution_5ans', 'marche_quartier_nom', 'marche_offre_bas', 'marche_offre_moyenne', 'marche_offre_haut', 'ville_habitants_agglo', 'ville_revenu_median', 'bail_date_debut', 'echeance_bail', 'locataire_depuis', 'quote_part_lot', 'charges_copropriete', 'taxe_fonciere_an'];
    const valeurs = Object.fromEntries(champs.filter((c) => p[c] != null && p[c] !== '' && p[c] !== 0).map((c) => [c, p[c]]));
    const surface = Number(p.sim_surface) || Number(p.surface_m2) || 0;
    const loyer = Number(p.sim_loyer_initial_ht) || Number(p.loyer_annuel_ht) || 0;
    const sources = sourcesDuProjet(p, { rue });
    return `PROJET OUVERT À DROITE (projet_id ${p.id}, « ${p.titre || ''} ») — la version à jour, l'équipe a pu la retoucher :
${JSON.stringify(valeurs)}
${surface && loyer ? `Loyer du projet au m² : ${Math.round(loyer / surface)} €/m²/an (${loyer} € / ${surface} m²).` : ''}
Valeurs forcées : ${JSON.stringify(p.valeurs_forcees || {})}
Loyer autour lu par la page : ${rue?.loyer_m2_an ? `${rue.loyer_m2_an} €/m²/an (${rue.loyer_source}${rue.loyer_bas ? `, ${rue.loyer_bas} à ${rue.loyer_haut}` : ''}${rue.rayon ? `, ${rue.rayon}` : ''})` : 'aucun'}.
SOURCES DES CHIFFRES (champ : origine, détail) :
${Object.entries(sources).map(([c, s]) => `- ${c} : ${s.origine}${s.detail ? `, ${s.detail}` : ''}`).join('\n')}
${await bailPourAK(p)}`;
  });
}

/**
 * Le bail tel que la page le montre (14 oct. 2026 : AK répondait « rien à
 * modifier » alors que la frise affichait des triennales dans une période
 * ferme) : les champs qui le pilotent, la frise calculée, la synthèse, les pièces.
 */
async function bailPourAK(p) {
  const { friseDuProjet, friseBornee, jalonsDuBail, fermeDuProjet } = await import('../src/lib/frise-bail.js');
  const { piecesDeclarees } = await import('./pieces-projet.js');
  const frise = friseBornee(friseDuProjet(p, null));
  const ferme = fermeDuProjet(p);
  const jalons = frise ? jalonsDuBail(frise, { ferme }).jalons.map((j) => `${j.texte} : ${j.label}`).join(' ; ') : 'aucune date';
  const pieces = (() => { try { return piecesDeclarees(p).map((x) => x.nom); } catch { return []; } })();
  const synthese = String(p.analyse_bail || '');
  return `BAIL (ce que la page affiche, et les champs qui le pilotent) :
- bail_date_debut : ${p.bail_date_debut || '—'} ; bail_date_echeance : ${p.bail_date_echeance || p.echeance_bail || '—'} ; bail_duree_ferme_ans : ${p.bail_duree_ferme_ans ?? '—'} (période ferme lue : ${ferme === Infinity ? 'tout le bail' : ferme ? `${ferme} ans` : 'aucune'}).
- Frise affichée : ${jalons}.
- Corrections de l'analyse du bail (bail_analyse.<id>) : ${JSON.stringify(p.bail_analyse || {})}
- Cases du bail corrigées (cases_forcees) : ${JSON.stringify(Object.fromEntries(Object.entries(p.cases_forcees || {}).filter(([k]) => k.startsWith('bail.'))))}
- Pièces de l'onglet Documents : ${pieces.length ? pieces.join(', ') : 'aucune'}.
- Synthèse de l'analyse du bail (analyse_bail)${synthese.length > 6000 ? ', début' : ''} : ${synthese ? synthese.slice(0, 6000) : 'vide'}`;
}
