// Data-B à la demande, depuis le chat : « fais-moi la valeur locative sur
// Data-B pour le projet de la rue des Poteaux ». L'assistant choisit la
// lecture, l'adresse vient du projet ou du dossier quand il y en a un, et le
// résultat est rangé là où les analyses et la page client le lisent :
//
//   valeur_locative     projet : marche_offre_bas/haut/moyenne (la rue), marche_quartier_nom
//                       dossier : lot.valeur_locative_data_b
//   cessions_fonds      projet : transactions_fonds · dossier : lot.transactions_fonds
//   etude_implantation  gardée trente jours (DataBImplantation) : le secteur du
//                       projet et K-Expertise la relisent ; dossier : lot.implantation
//   proprietaire        rendu tel quel : ALX et la fiche vendeur le relisent
//
// Ici, pas de repli : on a demandé Data-B, on rend Data-B ou son erreur. Le
// repli sur les sources ouvertes, c'est le travail des lectures automatiques
// (marche/chaine.js, sources-marche.js).
//
// Une valeur demandée explicitement remplace celle qui était là ; l'ancienne
// est rendue (`avant`) pour qu'on puisse la remettre.

import { Records } from './db.js';
import { dataBConfigure } from './data-b.js';

export const LECTURES = ['valeur_locative', 'cessions_fonds', 'etude_implantation', 'proprietaire'];

/** L'adresse postale d'un lot de dossier, telle que la fiche la porte. */
function adresseDuLot(entree) {
  const a = entree?.lot?.adresse?.valeur;
  return a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
}

const trouverDeal = (id) => Records.findBy('Deal', 'deal_id', id) || Records.get('Deal', id);

/** Les champs du projet que la valeur locative de la rue remplit. */
export function champsValeurLocative(r) {
  const rue = r?.rue;
  const sortie = {};
  if (rue?.basse > 0) sortie.marche_offre_bas = rue.basse;
  if (rue?.haute > 0) sortie.marche_offre_haut = rue.haute;
  if (rue?.basse > 0 && rue?.haute > 0) sortie.marche_offre_moyenne = Math.round((rue.basse + rue.haute) / 2);
  if (r?.quartier?.nom) sortie.marche_quartier_nom = String(r.quartier.nom).slice(0, 120);
  return sortie;
}

async function lire(quoi, adresse, { activite, rayon, forcer, user }) {
  if (quoi === 'valeur_locative') return (await import('./data-b.js')).valeurLocative(adresse, { forcer, user });
  if (quoi === 'cessions_fonds') return (await import('./data-b-transactions.js')).transactionsFonds(adresse, { rayon: Number(rayon) || 500, forcer, user });
  if (quoi === 'etude_implantation') return (await import('./data-b-implantation.js')).etudeImplantation(adresse, { activite: activite || null, forcer, user });
  if (quoi === 'proprietaire') {
    try {
      const r = await (await import('./alx/foncier.js')).proprietairesDe(adresse);
      return r ? { ok: true, resultat: r } : { ok: false, error: 'Data-B ne trouve pas cette adresse.' };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  return { ok: false, error: `Lecture inconnue : ${quoi}. Possibles : ${LECTURES.join(', ')}.` };
}

/** Un résumé court pour le modèle : les chiffres, pas la page entière. */
function resume(quoi, r) {
  if (quoi === 'valeur_locative') return { unite: r.unite, rue: r.rue || null, quartier: r.quartier || null, ville: r.ville || null, lien: r.lien || null };
  if (quoi === 'cessions_fonds') return { marche: r.marche || null, rue: r.rue || null, nombre: r.total ?? r.transactions?.length ?? null, exemples: (r.pertinentes || r.transactions || []).slice(0, 5) };
  if (quoi === 'etude_implantation') return { flux_pieton: r.flux_pieton || null, flux_voiture: r.flux_voiture || null, troncon: r.troncon || null, revenu: r.revenu || null, demographie: r.demographie || null };
  return { choix: r.choix || null, motif: r.motif_choix || null, proprietaires: (r.proprietaires || []).slice(0, 5), parcelle: r.parcelle || null };
}

/**
 * Lance une lecture Data-B et range le résultat.
 * @param {{quoi, adresse?, projet_id?, deal_id?, lot?, activite?, rayon?, forcer?}} demande
 */
export async function lectureDataB(demande, user = null) {
  const { quoi, projet_id = null, deal_id = null, activite = null, rayon = null, forcer = false } = demande || {};
  const index = Number(demande?.lot) || 0;
  if (!dataBConfigure()) return { ok: false, message: "Data-B n'est pas configuré : DATAB_EMAIL et DATAB_MOT_DE_PASSE manquent." };
  if (!LECTURES.includes(quoi)) return { ok: false, message: `Lecture inconnue. Possibles : ${LECTURES.join(', ')}.` };

  const projet = projet_id ? Records.get('Project', projet_id) : null;
  if (projet_id && !projet) return { ok: false, message: 'Projet introuvable.' };
  const deal = deal_id ? trouverDeal(deal_id) : null;
  if (deal_id && !deal) return { ok: false, message: 'Dossier introuvable.' };
  const adresse = String(demande?.adresse || projet?.adresse_complete || adresseDuLot(deal?.lots?.[index]) || '').trim();
  if (!adresse) return { ok: false, message: "Aucune adresse : donne-la, ou un projet ou un dossier qui en a une." };

  const r = await lire(quoi, adresse, { activite: activite || projet?.activite_locataire || null, rayon, forcer: !!forcer, user });
  if (!r.ok) return { ok: false, message: `Data-B : ${r.error}` };
  const resultat = r.resultat;

  const range = [];
  if (projet) {
    let champs = {};
    if (quoi === 'valeur_locative') champs = champsValeurLocative(resultat);
    if (quoi === 'cessions_fonds') champs = { transactions_fonds: resultat };
    if (Object.keys(champs).length) {
      const avant = Object.fromEntries(Object.keys(champs).map((k) => [k, projet[k] ?? null]));
      Records.update('Project', projet.id, champs);
      range.push({ ou: `projet « ${projet.titre || projet.id} »`, champs: Object.keys(champs), avant: quoi === 'cessions_fonds' ? undefined : avant });
    }
    if (quoi === 'etude_implantation') {
      // Le secteur du projet relit l'étude la plus récente de son adresse.
      const { lireSecteur } = await import('./projet-secteur.js');
      lireSecteur(Records.get('Project', projet.id), { forcer: true });
      range.push({ ou: `secteur du projet « ${projet.titre || projet.id} »`, champs: ['flux', 'commercialité'] });
    }
  }
  if (deal?.lots?.[index]) {
    const champ = { valeur_locative: 'valeur_locative_data_b', cessions_fonds: 'transactions_fonds', etude_implantation: 'implantation' }[quoi];
    if (champ) {
      const courant = trouverDeal(deal.deal_id || deal.id);
      const lots = [...courant.lots];
      lots[index] = { ...lots[index], [champ]: resultat };
      Records.update('Deal', courant.id, { lots });
      range.push({ ou: `dossier ${courant.deal_id || courant.id}, lot ${index + 1}`, champs: [champ] });
    }
  }

  return {
    ok: true,
    source: 'Data-B',
    adresse: resultat.adresse || adresse,
    du_cache: !!resultat.du_cache,
    ...resume(quoi, resultat),
    range,
    note: resultat.du_cache ? 'Lecture gardée de moins de trente jours : redemande avec forcer pour relire Data-B.' : null,
  };
}
