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
import { Records } from './db.js';

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
${await simulateurPourAK(p)}
${await bailPourAK(p)}`;
  });
}

/**
 * Le bail tel que la page le montre (14 oct. 2026 : AK répondait « rien à
 * modifier » alors que la frise affichait des triennales dans une période
 * ferme) : les champs qui le pilotent, la frise calculée, la synthèse, les pièces.
 */
/** Le simulateur calculé comme sa page (les champs sim_* du résultat restent à 0 en base : la page calcule en direct). */
async function simulateurPourAK(p) {
  try {
    const { simulationDuProjet, simulationEnTexte } = await import('./simulation-projet.js');
    const sim = simulationDuProjet(p);
    return sim ? `SIMULATEUR, CALCULÉ COMME LA PAGE (poste par poste ; les champs sim_* de résultat valent 0 en base, ne les lis pas) :\n${simulationEnTexte(sim)}` : 'SIMULATEUR : ni prix ni loyer, rien à calculer.';
  } catch { return ''; }
}

async function bailPourAK(p) {
  const { friseDuProjet, friseBornee, jalonsDuBail, fermeDuProjet } = await import('../src/lib/frise-bail.js');
  const { piecesDeclarees } = await import('./pieces-projet.js');
  // Les clauses telles que la page les montre : lues dans les pièces du dossier, corrigées à la main, avec leur pièce.
  let cases = null;
  try { cases = (await import('./projet-cases.js')).lireCases(p); } catch { cases = null; }
  const lignes = cases?.analyse || [];
  const frise = friseBornee(friseDuProjet(p, cases?.frise || null));
  const ferme = fermeDuProjet(p, lignes);
  const jalons = frise ? jalonsDuBail(frise, { ferme }).jalons.map((j) => `${j.texte} : ${j.label}`).join(' ; ') : 'aucune date';
  const pieces = (() => { try { return piecesDeclarees(p).map((x) => x.nom); } catch { return []; } })();
  const corrections = p.bail_analyse || {};
  const ids = [...new Set([...lignes.map((l) => l.id), ...Object.keys(corrections)])];
  const clauses = ids.map((id) => {
    const l = lignes.find((x) => x.id === id);
    const corrige = Object.prototype.hasOwnProperty.call(corrections, id);
    const texte = corrige ? corrections[id] : l?.texte;
    const piece = l?.source ? ` [pièce : ${l.source.document_nom}${l.source.page ? `, p. ${l.source.page}` : ''}${l.source.citation ? `, « ${String(l.source.citation).replace(/\s+/g, ' ').slice(0, 160)} »` : ''}]` : corrige ? ' [corrigé à la main]' : ' [sans pièce rattachée]';
    return `  - ${id} : ${String(texte || '—').replace(/\s+/g, ' ').slice(0, 400)}${piece}`;
  });
  const dossier = p.deal_id ? `rattaché au dossier de pré-analyse ${p.deal_id} (ses pièces portent les clauses ci-dessus)` : 'aucun dossier de pré-analyse rattaché';
  const synthese = String(p.analyse_bail || '');
  return `BAIL (ce que la page affiche, et les champs qui le pilotent) :
- bail_date_debut : ${p.bail_date_debut || '—'} ; bail_date_echeance : ${p.bail_date_echeance || p.echeance_bail || '—'} ; bail_duree_ferme_ans : ${p.bail_duree_ferme_ans ?? '—'} (période ferme lue : ${ferme === Infinity ? 'tout le bail' : ferme ? `${ferme} ans` : 'aucune'}).
- Frise affichée : ${jalons}.
- Clauses de l'analyse du bail (bail_analyse.<id> pour les corriger), avec la pièce d'où chacune vient :
${clauses.length ? clauses.join('\n') : '  aucune'}
- Cases du bail corrigées (cases_forcees) : ${JSON.stringify(Object.fromEntries(Object.entries(p.cases_forcees || {}).filter(([k]) => k.startsWith('bail.'))))}
- Pièces : onglet Documents ${pieces.length ? pieces.join(', ') : 'vide'} ; ${dossier}. Avant de dire « pas de bail au dossier », regarde ces deux endroits et la pièce citée par chaque clause.
- Synthèse de l'analyse du bail (analyse_bail)${synthese.length > 6000 ? ', début' : ''} : ${synthese ? synthese.slice(0, 6000) : 'vide'}
${controlesPourAK(p)}`;
}

const CHAMPS_BAIL = /^(bail_|echeance_bail|loyer_|sim_loyer|cases_forcees\.bail|bail_analyse)/;
const quand = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '?');

/**
 * Les contrôles qui ne se voient pas à l'écran (14 oct. 2026) : les textes
 * générés écrits avant qu'un chiffre bouge, et ce que le dossier de
 * pré-analyse dit autrement que le projet.
 */
export function controlesPourAK(p) {
  const lignes = [];
  const journal = p.journal_champs || [];
  const depuis = (iso, filtre = () => true) => [...new Set(journal.filter((j) => j.le > (iso || '') && filtre(j.champ)).map((j) => j.champ))];
  // La synthèse du bail : un champ du bail changé après sa dernière écriture.
  const derniereSynthese = journal.filter((j) => j.champ === 'analyse_bail').map((j) => j.le).sort().at(-1) || '';
  const bailBouge = depuis(derniereSynthese, (c) => CHAMPS_BAIL.test(c));
  if (p.analyse_bail && bailBouge.length) lignes.push(`- La synthèse du bail (analyse_bail) a été écrite avant ces changements : ${bailBouge.join(', ')}. Relis-la : si elle les contredit, dis-le et propose de la réécrire.`);
  const Rec = Records;
  {
    for (const pr of Rec.list('PresentationBancaire').filter((x) => x.projet_id === p.id)) {
      const c = depuis(pr.maj_le);
      if (c.length) lignes.push(`- La présentation bancaire « ${pr.titre || pr.id} » (presentation_id ${pr.id}, retouchée le ${quand(pr.maj_le)}) date d'avant ces changements du projet : ${c.join(', ')}. Ses diapositives disent peut-être encore l'ancien chiffre.`);
    }
    for (const l of Rec.list('LettreIntention').filter((x) => x.projet_id === p.id || (p.deal_id && x.deal_id === p.deal_id))) {
      const c = depuis(l.maj_le || l.cree_le);
      if (c.length) lignes.push(`- La lettre d'intention (loi_id ${l.id}, ${quand(l.maj_le || l.cree_le)}) date d'avant ces changements du projet : ${c.join(', ')}.`);
    }
    const deal = p.deal_id ? Rec.findBy('Deal', 'deal_id', p.deal_id) : null;
    const lot = deal?.lots?.[0]?.lot || null;
    if (lot) {
      const v = (k) => lot[k]?.valeur ?? null;
      const nombre = (x) => Number(x) || 0;
      const ecart = (a, b) => nombre(a) > 0 && nombre(b) > 0 && Math.abs(nombre(a) - nombre(b)) / Math.max(nombre(a), nombre(b)) > 0.02;
      const loyerProjet = nombre(p.sim_loyer_initial_ht) || nombre(p.loyer_annuel_ht);
      const surfaceProjet = nombre(p.sim_surface) || nombre(p.surface_m2);
      const prixProjet = nombre(p.sim_prix_bien_fai) || nombre(p.prix_acquisition);
      const diffs = [
        ecart(v('loyer_annuel_ht_hc'), loyerProjet) && `loyer annuel HT HC : dossier ${v('loyer_annuel_ht_hc')} €, projet ${loyerProjet} €`,
        ecart(v('surface_m2'), surfaceProjet) && `surface : dossier ${v('surface_m2')} m², projet ${surfaceProjet} m²`,
        ecart(v('prix_fai'), prixProjet) && `prix FAI : dossier ${v('prix_fai')} €, projet ${prixProjet} €`,
        v('locataire_nom') && p.nom_locataire && String(v('locataire_nom')).trim().toLowerCase() !== String(p.nom_locataire).trim().toLowerCase() && `locataire : dossier « ${v('locataire_nom')} », projet « ${p.nom_locataire} »`,
      ].filter(Boolean);
      if (diffs.length) lignes.push(`- Le dossier de pré-analyse ${p.deal_id} dit autre chose que le projet : ${diffs.join(' ; ')}. Le projet est ce que le client voit ; ne choisis pas seul : dis l'écart, d'où vient chaque chiffre (la pièce du dossier, la saisie du projet) et demande lequel garder.`);
    }
  }
  return lignes.length ? `CONTRÔLES (ce que l'écran ne montre pas) :\n${lignes.join('\n')}` : '';
}
